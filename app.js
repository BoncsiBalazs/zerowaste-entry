
"use strict";

const DATA = window.ZW_DATA;
const APP_VERSION = "1.1.0";
const DB_NAME = "zerowaste-entry-web";
const DB_VERSION = 1;
const STORE_SUBMISSIONS = "submissions";
const STORE_INSTITUTIONS = "institutions";
const STORE_DISHES = "userDishes";

const ATTRS = [
  ["appearance", "Külső megjelenés"],
  ["smell", "Illat"],
  ["taste", "Íz"],
  ["texture", "Állomány"],
  ["overall", "Összkedveltség"]
];

const stepTitles = [
  "1. Alapadatok",
  "2. Leves – mérés",
  "3. Leves – érzékszervi",
  "4. Második fogás – mérés",
  "5. Második fogás – érzékszervi",
  "6. Ellenőrzés"
];

let db;
let currentStep = 0;
let deferredInstallPrompt = null;

const sensoryState = {
  soup: {},
  main: {}
};

const photoState = {
  soup: null,
  main: null
};

const $ = (id) => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function localIsoWithOffset(date = new Date()) {
  const pad = (n) => String(Math.abs(Math.trunc(n))).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const offMin = -date.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const oh = pad(Math.floor(Math.abs(offMin) / 60));
  const om = pad(Math.abs(offMin) % 60);
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${sign}${oh}:${om}`;
}

function fmtNumber(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "–";
  return Number(x).toLocaleString("hu-HU", { maximumFractionDigits: digits });
}

function safeText(x) {
  return String(x ?? "").trim();
}

function numberValue(id) {
  const raw = $(id).value;
  if (raw === "") return NaN;
  return Number(raw);
}

function selectedAge() {
  return DATA.ageGroups.find(x => x.label === $("ageGroup").value) || null;
}

function getMasterDishes(course) {
  return DATA.dishes.filter(x => x.course === course).map(x => x.dish_name);
}

async function getUserDishes(course) {
  const rows = await idbGetAll(STORE_DISHES);
  return rows.filter(x => x.course === course).map(x => x.dishName);
}

function descriptorOptions(attribute) {
  return DATA.sensoryDescriptors
    .filter(x => x.attribute === attribute)
    .map(x => x.descriptor);
}

function findDishPortion(course, dish, regAge) {
  return DATA.dishPortions.find(
    x => x.course === course && x.dish_name === dish && x.reg_age_group === regAge
  ) || null;
}

function findPortionGuide(portionKey, regAge) {
  return DATA.portionGuide.find(
    x => x.portion_key === portionKey && x.reg_age_group === regAge
  ) || null;
}

function dishComponentsFor(dish) {
  return DATA.dishComponents.filter(
    x => x.course === "Második fogás" && x.dish === dish
  );
}

function showToast(message, ms = 2800) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add("hidden"), ms);
}

/* IndexedDB */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_SUBMISSIONS)) {
        const store = database.createObjectStore(STORE_SUBMISSIONS, { keyPath: "submissionId" });
        store.createIndex("mealDate", "mealDate", { unique: false });
        store.createIndex("institutionName", "institutionName", { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_INSTITUTIONS)) {
        database.createObjectStore(STORE_INSTITUTIONS, { keyPath: "institutionName" });
      }
      if (!database.objectStoreNames.contains(STORE_DISHES)) {
        database.createObjectStore(STORE_DISHES, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function seedReferenceInstitutions() {
  const current = await idbGetAll(STORE_INSTITUTIONS);
  const referenceNames = new Set(DATA.institutions.map(x => x.institution_name));

  // A korábbi verzióban tévesen bekerült referencia-intézményeket
  // eltávolítjuk, de a felhasználó által kézzel felvett intézményeket megtartjuk.
  for (const row of current) {
    if ((row.source === "reference" || row.source === "jelenlegi kutatási adatállomány") &&
        !referenceNames.has(row.institutionName)) {
      await idbDelete(STORE_INSTITUTIONS, row.institutionName);
    }
  }

  const refreshed = await idbGetAll(STORE_INSTITUTIONS);
  const names = new Set(refreshed.map(x => x.institutionName));

  for (const row of DATA.institutions) {
    if (!names.has(row.institution_name)) {
      await idbPut(STORE_INSTITUTIONS, {
        institutionName: row.institution_name,
        sheetName: row.sheet_name || makeSheetName(row.institution_name),
        source: "reference",
        active: true,
        createdAt: localIsoWithOffset()
      });
    } else {
      const existing = refreshed.find(x => x.institutionName === row.institution_name);
      if (existing && existing.source === "reference" && existing.sheetName !== row.sheet_name) {
        await idbPut(STORE_INSTITUTIONS, {
          ...existing,
          sheetName: row.sheet_name || makeSheetName(row.institution_name)
        });
      }
    }
  }
}

/* UI setup */
async function populateAgeGroups() {
  const sel = $("ageGroup");
  DATA.ageGroups.forEach(x => {
    const o = document.createElement("option");
    o.value = x.label;
    o.textContent = x.label;
    sel.appendChild(o);
  });
}

function populateRecorders() {
  const sel = $("recorderName");
  sel.innerHTML = `<option value="">Válasszon adatrögzítőt…</option>`;
  (DATA.recorders || []).forEach(name => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });
}

async function refreshInstitutionSelectors() {
  const rows = (await idbGetAll(STORE_INSTITUTIONS))
    .filter(x => x.active !== false)
    .sort((a, b) => a.institutionName.localeCompare(b.institutionName, "hu"));

  for (const id of ["institution", "exportInstitution"]) {
    const sel = $(id);
    const first = id === "institution"
      ? `<option value="">Válasszon intézményt…</option>`
      : `<option value="">Minden intézmény</option>`;
    sel.innerHTML = first;
    rows.forEach(x => {
      const o = document.createElement("option");
      o.value = x.institutionName;
      o.textContent = x.institutionName;
      sel.appendChild(o);
    });
  }
  renderInstitutionList(rows);
}

async function refreshDishLists() {
  const soup = [...new Set([
    ...getMasterDishes("Leves"),
    ...(await getUserDishes("Leves"))
  ])].sort((a, b) => a.localeCompare(b, "hu"));

  const main = [...new Set([
    ...getMasterDishes("Második fogás"),
    ...(await getUserDishes("Második fogás"))
  ])].sort((a, b) => a.localeCompare(b, "hu"));

  $("soupDishList").innerHTML = soup.map(x => `<option value="${escapeHtml(x)}"></option>`).join("");
  $("mainDishList").innerHTML = main.map(x => `<option value="${escapeHtml(x)}"></option>`).join("");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderSensory(prefix, containerId) {
  const container = $(containerId);
  container.innerHTML = "";

  for (const [key, label] of ATTRS) {
    sensoryState[prefix][key] = { score: null, descriptors: [], other: "" };
    const listId = `${prefix}-${key}-descriptor-list`;

    const card = document.createElement("div");
    card.className = "sensory-card";
    card.dataset.prefix = prefix;
    card.dataset.attr = key;
    card.innerHTML = `
      <h3>${label} <b class="required-star">*</b></h3>
      <div class="score-row" aria-label="${label} pontszám">
        ${[1,2,3,4,5].map(n => `<button class="score-btn" data-score="${n}" type="button">${n}</button>`).join("")}
      </div>
      <div class="descriptor-row">
        <input class="descriptor-input" list="${listId}" placeholder="Tulajdonság keresése…">
        <button class="secondary-btn add-desc-btn" type="button">Hozzáad</button>
      </div>
      <datalist id="${listId}">
        ${descriptorOptions(label).filter(x => x !== "Egyéb").map(x => `<option value="${escapeHtml(x)}"></option>`).join("")}
      </datalist>
      <div class="chips"></div>
      <button class="secondary-btn small add-other-btn" type="button">Egyéb tulajdonság</button>
      <input class="other-descriptor hidden" type="text" placeholder="Egyéb tulajdonság szabadon">
    `;
    container.appendChild(card);

    qsa(".score-btn", card).forEach(btn => {
      btn.addEventListener("click", () => {
        qsa(".score-btn", card).forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        sensoryState[prefix][key].score = Number(btn.dataset.score);
        updateFinalState();
      });
    });

    const descriptorInput = qs(".descriptor-input", card);
    const chips = qs(".chips", card);
    const otherInput = qs(".other-descriptor", card);

    function renderChips() {
      const st = sensoryState[prefix][key];
      chips.innerHTML = st.descriptors.map((d, i) =>
        `<span class="chip">${escapeHtml(d)}<button type="button" data-i="${i}">×</button></span>`
      ).join("");
      qsa(".chip button", chips).forEach(btn => {
        btn.addEventListener("click", () => {
          st.descriptors.splice(Number(btn.dataset.i), 1);
          renderChips();
          updateFinalState();
        });
      });
    }

    qs(".add-desc-btn", card).addEventListener("click", () => {
      const value = safeText(descriptorInput.value);
      if (!value) return;
      const allowed = new Set(descriptorOptions(label).filter(x => x !== "Egyéb"));
      if (!allowed.has(value)) {
        showToast("Válasszon a felajánlott tulajdonságok közül, vagy használja az „Egyéb tulajdonság” gombot.", 4200);
        return;
      }
      const st = sensoryState[prefix][key];
      if (!st.descriptors.includes(value)) st.descriptors.push(value);
      descriptorInput.value = "";
      renderChips();
      updateFinalState();
    });

    descriptorInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        qs(".add-desc-btn", card).click();
      }
    });

    qs(".add-other-btn", card).addEventListener("click", () => {
      otherInput.classList.toggle("hidden");
      if (!otherInput.classList.contains("hidden")) otherInput.focus();
      updateFinalState();
    });

    otherInput.addEventListener("input", () => {
      sensoryState[prefix][key].other = safeText(otherInput.value);
      updateFinalState();
    });
  }
}

function sensoryComplete(prefix) {
  return ATTRS.every(([key]) => {
    const s = sensoryState[prefix][key];
    return s.score !== null;
  });
}

function sensoryFlat(prefix) {
  const out = {};
  for (const [key] of ATTRS) {
    const s = sensoryState[prefix][key];
    out[key] = s.score;
    out[`${key}Desc`] = [...s.descriptors, ...(safeText(s.other) ? [safeText(s.other)] : [])].join(" | ");
  }
  return out;
}

/* Photo handling – compressed locally before IndexedDB storage */
function compressPhoto(file, maxSide = 1280, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!file.type.startsWith("image/")) return reject(new Error("Csak képfájl tölthető fel."));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("A fotó nem olvasható."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("A fotó nem dolgozható fel."));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhoto(prefix, file) {
  const preview = $(`${prefix}PhotoPreview`);
  if (!file) {
    photoState[prefix] = null;
    preview.textContent = "Nincs fotó kiválasztva.";
    return;
  }

  try {
    preview.textContent = "Fotó feldolgozása…";
    const dataUrl = await compressPhoto(file);
    photoState[prefix] = dataUrl;
    preview.innerHTML = `<img src="${dataUrl}" alt="Kitálalt étel fotója">`;
  } catch (err) {
    photoState[prefix] = null;
    preview.textContent = "A fotó nem tölthető be.";
    showToast(err.message || "Fotófeldolgozási hiba.", 4200);
  }
}

/* Dish status */
async function updateDishStatus(kind) {
  const course = kind === "soup" ? "Leves" : "Második fogás";
  const inputId = kind === "soup" ? "soupDish" : "mainDish";
  const statusId = kind === "soup" ? "soupDishStatus" : "mainDishStatus";
  const value = safeText($(inputId).value);
  if (!value) {
    $(statusId).textContent = "";
    return;
  }
  const master = new Set(getMasterDishes(course));
  const user = new Set(await getUserDishes(course));
  $(statusId).textContent = master.has(value) || user.has(value) ? "Törzsben szereplő étel" : "Új étel – beküldéskor a helyi törzsbe kerül";
}

/* Unit conversion */
function renderExtraField(containerId, type, id, label, defaultValue = "") {
  const box = $(containerId);
  if (!type) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `
    <label class="field">
      <span>${label} <b>*</b></span>
      <input id="${id}" type="number" min="0.0001" step="0.01" inputmode="decimal" value="${defaultValue}">
    </label>
  `;
  $(id).addEventListener("input", updateConversions);
}

function updateConversionExtras() {
  const age = selectedAge();
  const mainDish = safeText($("mainDish").value);

  // soup served
  const su = $("soupServedUnit").value;
  if (su === "kg") renderExtraField("soupServedExtra", "density", "soupServedDensity", "Leves sűrűsége (kg/L)", "1");
  else if (su === "darab") renderExtraField("soupServedExtra", "piece", "soupServedMlPiece", "Egy darab átlagos térfogata (ml/darab)");
  else $("soupServedExtra").innerHTML = "";

  // main served
  const mu = $("mainServedUnit").value;
  if (mu === "liter") renderExtraField("mainServedExtra", "density", "mainServedDensity", "Sűrűség (kg/L)", "1");
  else if (mu === "darab") renderExtraField("mainServedExtra", "piece", "mainServedGPiece", "Egy darab átlagos tömege (g/darab)");
  else if (mu === "adag") {
    const guide = age ? findDishPortion("Második fogás", mainDish, age.reg_age_group) : null;
    if (guide) {
      $("mainServedExtra").innerHTML = `<div class="info-box">Automatikus adagméret: <strong>${fmtNumber(guide.mid_g,1)} g/adag</strong> (útmutató-tartomány: ${fmtNumber(guide.min_g,1)}–${fmtNumber(guide.max_g,1)} g).</div>`;
    } else {
      renderExtraField("mainServedExtra", "portion", "mainServedManualGPortion", "Egy adag tényleges tömege (g/adag)");
    }
  } else $("mainServedExtra").innerHTML = "";

  // soup waste
  const swu = $("soupWasteUnit").value;
  if (swu === "liter") renderExtraField("soupWasteExtra", "density", "soupWasteDensity", "Hulladék sűrűsége (kg/L)", "1");
  else if (swu === "darab") renderExtraField("soupWasteExtra", "piece", "soupWasteGPiece", "Egy darab átlagos tömege (g/darab)");
  else if (swu === "adag") {
    const g = age ? findPortionGuide("SOUP", age.reg_age_group) : null;
    if (g) {
      $("soupWasteExtra").innerHTML = `<div class="info-box">Automatikus adagméret: <strong>${fmtNumber(g.mid_g,1)} g/adag</strong>.</div>`;
    } else renderExtraField("soupWasteExtra", "portion", "soupWasteGPortion", "Egy adag becsült tömege (g/adag)");
  } else $("soupWasteExtra").innerHTML = "";

  // main waste
  const mwu = $("mainWasteUnit").value;
  if (mwu === "liter") renderExtraField("mainWasteExtra", "density", "mainWasteDensity", "Hulladék sűrűsége (kg/L)", "1");
  else if (mwu === "darab") renderExtraField("mainWasteExtra", "piece", "mainWasteGPiece", "Egy darab átlagos tömege (g/darab)");
  else if (mwu === "adag") {
    const g = age ? findDishPortion("Második fogás", mainDish, age.reg_age_group) : null;
    if (g) {
      $("mainWasteExtra").innerHTML = `<div class="info-box">Automatikus adagméret: <strong>${fmtNumber(g.mid_g,1)} g/adag</strong>.</div>`;
    } else renderExtraField("mainWasteExtra", "portion", "mainWasteGPortion", "Egy adag becsült tömege (g/adag)");
  } else $("mainWasteExtra").innerHTML = "";
}

function inputNumIfExists(id) {
  const el = $(id);
  if (!el || el.value === "") return NaN;
  return Number(el.value);
}

function convertSoupServed() {
  const value = numberValue("soupServed");
  const unit = $("soupServedUnit").value;
  const age = selectedAge();
  if (!(value > 0)) return { ok: false, value: NaN, basis: "Adjon meg 0-nál nagyobb mennyiséget." };
  if (unit === "liter") return { ok: true, value, basis: "Közvetlen liter" };
  if (unit === "kg") {
    const density = inputNumIfExists("soupServedDensity");
    if (!(density > 0)) return { ok: false, value: NaN, basis: "kg → L konverzióhoz sűrűség szükséges." };
    return { ok: true, value: value / density, basis: `kg → L; sűrűség = ${density} kg/L` };
  }
  if (unit === "darab") {
    const ml = inputNumIfExists("soupServedMlPiece");
    if (!(ml > 0)) return { ok: false, value: NaN, basis: "darab → L konverzióhoz ml/darab szükséges." };
    return { ok: true, value: value * ml / 1000, basis: `${ml} ml/darab` };
  }
  if (unit === "adag") {
    if (!age) return { ok: false, value: NaN, basis: "Válasszon korosztályt." };
    const g = findPortionGuide("SOUP", age.reg_age_group);
    if (!g) return { ok: false, value: NaN, basis: "Nincs leves adagolási adat ehhez a korcsoporthoz." };
    // guide mid_value is in dl
    const literPerPortion = Number(g.mid_value) / 10;
    return { ok: true, value: value * literPerPortion, basis: `${fmtNumber(literPerPortion,3)} L/adag; ${age.reg_age_group}` };
  }
  return { ok: false, value: NaN, basis: "Ismeretlen egység." };
}

function convertMainServed() {
  const value = numberValue("mainServed");
  const unit = $("mainServedUnit").value;
  const age = selectedAge();
  const dish = safeText($("mainDish").value);
  if (!(value > 0)) return { ok: false, value: NaN, basis: "Adjon meg 0-nál nagyobb mennyiséget." };
  if (unit === "kg") return { ok: true, value, basis: "Közvetlen kg" };
  if (unit === "liter") {
    const density = inputNumIfExists("mainServedDensity");
    if (!(density > 0)) return { ok: false, value: NaN, basis: "L → kg konverzióhoz sűrűség szükséges." };
    return { ok: true, value: value * density, basis: `L → kg; sűrűség = ${density} kg/L` };
  }
  if (unit === "darab") {
    const g = inputNumIfExists("mainServedGPiece");
    if (!(g > 0)) return { ok: false, value: NaN, basis: "darab → kg konverzióhoz g/darab szükséges." };
    return { ok: true, value: value * g / 1000, basis: `${g} g/darab` };
  }
  if (unit === "adag") {
    if (!age) return { ok: false, value: NaN, basis: "Válasszon korosztályt." };
    const guide = findDishPortion("Második fogás", dish, age.reg_age_group);
    const g = guide ? Number(guide.mid_g) : inputNumIfExists("mainServedManualGPortion");
    if (!(g > 0)) return { ok: false, value: NaN, basis: "adag → kg konverzióhoz g/adag szükséges." };
    return { ok: true, value: value * g / 1000, basis: `${fmtNumber(g,1)} g/adag; ${age.reg_age_group}` };
  }
  return { ok: false, value: NaN, basis: "Ismeretlen egység." };
}

function wasteFactor(unit, prefix, course) {
  const age = selectedAge();
  const dish = course === "main" ? safeText($("mainDish").value) : safeText($("soupDish").value);

  if (unit === "kg") return { ok: true, factor: 1, basis: "Közvetlen kg" };
  if (unit === "liter") {
    const density = inputNumIfExists(`${prefix}Density`);
    if (!(density > 0)) return { ok: false, factor: NaN, basis: "L → kg konverzióhoz sűrűség szükséges." };
    return { ok: true, factor: density, basis: `${density} kg/L` };
  }
  if (unit === "darab") {
    const g = inputNumIfExists(`${prefix}GPiece`);
    if (!(g > 0)) return { ok: false, factor: NaN, basis: "darab → kg konverzióhoz g/darab szükséges." };
    return { ok: true, factor: g / 1000, basis: `${g} g/darab` };
  }
  if (unit === "adag") {
    if (!age) return { ok: false, factor: NaN, basis: "Válasszon korosztályt." };
    let g;
    if (course === "soup") {
      const guide = findPortionGuide("SOUP", age.reg_age_group);
      g = guide ? Number(guide.mid_g) : inputNumIfExists(`${prefix}GPortion`);
    } else {
      const guide = findDishPortion("Második fogás", dish, age.reg_age_group);
      g = guide ? Number(guide.mid_g) : inputNumIfExists(`${prefix}GPortion`);
    }
    if (!(g > 0)) return { ok: false, factor: NaN, basis: "adag → kg konverzióhoz g/adag szükséges." };
    return { ok: true, factor: g / 1000, basis: `${fmtNumber(g,1)} g/adag` };
  }
  return { ok: false, factor: NaN, basis: "Ismeretlen egység." };
}

function convertSoupWaste() {
  const value = numberValue("soupWaste");
  const f = wasteFactor($("soupWasteUnit").value, "soupWaste", "soup");
  if (!(value >= 0) || !f.ok) return { ok: false, value: NaN, basis: f.basis };
  return { ok: true, value: value * f.factor, basis: f.basis };
}

function convertMainWaste() {
  const values = {
    total: numberValue("mainWaste"),
    primary: numberValue("mainWastePrimary"),
    side: numberValue("mainWasteSide"),
    other: numberValue("mainWasteOther")
  };
  const f = wasteFactor($("mainWasteUnit").value, "mainWaste", "main");
  if (!Object.values(values).every(v => v >= 0) || !f.ok) {
    return { ok: false, values: {}, basis: f.basis, componentValid: false };
  }
  const kg = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v * f.factor]));
  const componentSum = kg.primary + kg.side + kg.other;
  return {
    ok: true,
    values: kg,
    basis: f.basis,
    componentValid: componentSum <= kg.total + 1e-9,
    componentSum
  };
}

function updateConversions() {
  const sc = convertSoupServed();
  $("soupServedPreview").innerHTML = `<strong>ZeroWaste standard:</strong> ${sc.ok ? `${fmtNumber(sc.value,3)} L` : "nem számítható"}<br><small>${escapeHtml(sc.basis)}</small>`;

  const mc = convertMainServed();
  $("mainServedPreview").innerHTML = `<strong>ZeroWaste standard:</strong> ${mc.ok ? `${fmtNumber(mc.value,3)} kg` : "nem számítható"}<br><small>${escapeHtml(mc.basis)}</small>`;

  const sw = convertSoupWaste();
  $("soupWastePreview").innerHTML = `<strong>ZeroWaste standard:</strong> ${sw.ok ? `${fmtNumber(sw.value,3)} kg` : "nem számítható"}<br><small>${escapeHtml(sw.basis)}</small>`;

  const mw = convertMainWaste();
  $("mainWastePreview").innerHTML = `<strong>ZeroWaste standard összes hulladék:</strong> ${mw.ok ? `${fmtNumber(mw.values.total,3)} kg` : "nem számítható"}<br><small>${escapeHtml(mw.basis || "")}</small>${mw.ok && !mw.componentValid ? `<div class="validation-box bad">A komponenshulladékok összege (${fmtNumber(mw.componentSum,3)} kg) meghaladja az összes hulladékot (${fmtNumber(mw.values.total,3)} kg).</div>` : ""}`;

  updateFinalState();
}

function updateTemp(prefix) {
  const val = Number($(`${prefix}Temp`).value);
  $(`${prefix}TempValue`).textContent = `${val} °C`;
  const status = $(`${prefix}TempStatus`);

  if (val < 63) {
    status.className = "temp-status bad";
    status.textContent = "Újramelegíteni!";
  } else if (val <= 68) {
    status.className = "temp-status warn";
    status.textContent = "Hamarosan újramelegítendő";
  } else if (val <= 80) {
    status.className = "temp-status good";
    status.textContent = "Megfelelő!";
  } else {
    status.className = "temp-status hot";
    status.textContent = "Túlságosan forró – érzékszervi kockázat?";
  }
}

/* Validation */
function stepErrors(stepIndex) {
  const errors = [];
  const requireText = (id, label) => { if (!safeText($(id).value)) errors.push(label); };
  const requireNonNeg = (id, label, positive = false) => {
    const v = numberValue(id);
    if (Number.isNaN(v) || (positive ? v <= 0 : v < 0)) errors.push(label);
  };

  if (stepIndex === 0) {
    requireText("recorderName", "Adatrögzítő neve");
    requireText("mealDate", "Nap");
    requireText("ageGroup", "Korosztály");
    requireText("institution", "Intézmény");
  }

  if (stepIndex === 1) {
    requireText("soupDish", "Leves neve");
    requireNonNeg("soupServed", "Leves kitálalt mennyiség", true);
    if (!convertSoupServed().ok) errors.push("Leves kitálalt mennyiség konverziója");
    requireNonNeg("soupWaste", "Leves összes hulladék");
    if (!convertSoupWaste().ok) errors.push("Leves hulladék konverziója");
  }

  if (stepIndex === 2) {
    if (!sensoryComplete("soup")) errors.push("Leves érzékszervi tábla");
    requireText("soupImprovement", "Leves javítási javaslat");
    requireText("soupNote", "Leves megjegyzés");
  }

  if (stepIndex === 3) {
    requireText("mainDish", "Második fogás neve");
    requireNonNeg("mainServed", "Második kitálalt mennyiség", true);
    if (!convertMainServed().ok) errors.push("Második kitálalt mennyiség konverziója");
    ["mainWaste","mainWastePrimary","mainWasteSide","mainWasteOther"].forEach((id, i) =>
      requireNonNeg(id, ["Összes hulladék","Főkomponens-hulladék","Körethulladék","Egyéb hulladék"][i])
    );
    const mw = convertMainWaste();
    if (!mw.ok) errors.push("Második hulladék konverziója");
    if (mw.ok && !mw.componentValid) errors.push("A komponenshulladékok összege nem lehet nagyobb az összes hulladéknál");
  }

  if (stepIndex === 4) {
    if (!sensoryComplete("main")) errors.push("Második fogás érzékszervi tábla");
    requireText("mainImprovement", "Második javítási javaslat");
    requireText("mainNote", "Második megjegyzés");
  }

  return [...new Set(errors)];
}

function allErrors() {
  return [0,1,2,3,4].flatMap(stepErrors);
}

function updateFinalState() {
  if (currentStep === 5) renderReview();
  const errors = allErrors();
  $("submitBtn").disabled = errors.length > 0;
  const box = $("finalValidation");
  if (errors.length === 0) {
    box.className = "validation-box ok";
    box.textContent = "Minden kötelező mező megfelelően ki van töltve.";
  } else {
    box.className = "validation-box bad";
    box.innerHTML = `<strong>A beküldéshez még szükséges:</strong><ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`;
  }
}

function goToStep(next) {
  next = Math.max(0, Math.min(5, next));
  if (next > currentStep) {
    const errors = stepErrors(currentStep);
    if (errors.length) {
      showToast(`Hiányos: ${errors.join(", ")}`, 4200);
      return;
    }
  }
  currentStep = next;
  qsa(".step").forEach((el, i) => el.classList.toggle("active", i === currentStep));
  $("stepTitle").textContent = stepTitles[currentStep];
  $("stepCounter").textContent = `${currentStep + 1} / 6`;
  $("progressBar").style.width = `${((currentStep + 1) / 6) * 100}%`;
  $("prevBtn").style.visibility = currentStep === 0 ? "hidden" : "visible";
  $("nextBtn").classList.toggle("hidden", currentStep === 5);
  if (currentStep === 5) renderReview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* Review and submission */
function currentInstitutionRow() {
  return idbGetAll(STORE_INSTITUTIONS).then(rows =>
    rows.find(x => x.institutionName === $("institution").value) || null
  );
}

function reviewLine(label, value) {
  return `<div class="review-line"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function renderReview() {
  const sc = convertSoupServed();
  const sw = convertSoupWaste();
  const mc = convertMainServed();
  const mw = convertMainWaste();

  $("reviewContent").innerHTML = `
    <div class="review-block">
      <h3>Alapadatok</h3>
      ${reviewLine("Adatrögzítő", $("recorderName").value)}
      ${reviewLine("Nap", $("mealDate").value)}
      ${reviewLine("Korosztály", $("ageGroup").value)}
      ${reviewLine("Intézmény", $("institution").value)}
    </div>
    <div class="review-block">
      <h3>Leves</h3>
      ${reviewLine("Étel", $("soupDish").value)}
      ${reviewLine("Kitálalt", `${$("soupServed").value || "–"} ${$("soupServedUnit").value}`)}
      ${reviewLine("Standard", sc.ok ? `${fmtNumber(sc.value,3)} L` : "nem számítható")}
      ${reviewLine("Hőmérséklet", `${$("soupTemp").value} °C`)}
      ${reviewLine("Hulladék", sw.ok ? `${fmtNumber(sw.value,3)} kg` : "nem számítható")}
      ${reviewLine("Fotó", photoState.soup ? "rögzítve" : "nincs")}
      ${reviewLine("Érzékszervi", sensoryComplete("soup") ? "teljes" : "hiányos")}
    </div>
    <div class="review-block">
      <h3>Második fogás</h3>
      ${reviewLine("Étel", $("mainDish").value)}
      ${reviewLine("Kitálalt", `${$("mainServed").value || "–"} ${$("mainServedUnit").value}`)}
      ${reviewLine("Standard", mc.ok ? `${fmtNumber(mc.value,3)} kg` : "nem számítható")}
      ${reviewLine("Hőmérséklet", `${$("mainTemp").value} °C`)}
      ${reviewLine("Hulladék", mw.ok ? `${fmtNumber(mw.values.total,3)} kg` : "nem számítható")}
      ${reviewLine("Fotó", photoState.main ? "rögzítve" : "nincs")}
      ${reviewLine("Érzékszervi", sensoryComplete("main") ? "teljes" : "hiányos")}
    </div>
  `;
  updateFinalState._busy = true;
  const errors = allErrors();
  $("submitBtn").disabled = errors.length > 0;
  const box = $("finalValidation");
  if (!errors.length) {
    box.className = "validation-box ok";
    box.textContent = "Minden kötelező mező megfelelően ki van töltve.";
  } else {
    box.className = "validation-box bad";
    box.innerHTML = `<strong>A beküldéshez még szükséges:</strong><ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`;
  }
  updateFinalState._busy = false;
}

async function addUserDishIfNew(course, dish) {
  if (!dish) return;
  const master = new Set(getMasterDishes(course));
  if (master.has(dish)) return;
  await idbPut(STORE_DISHES, {
    key: `${course}::${dish.toLocaleLowerCase("hu")}`,
    course,
    dishName: dish,
    createdAt: localIsoWithOffset()
  });
}

function makeSubmissionId() {
  const d = new Date();
  const stamp = localIsoWithOffset(d).replaceAll(/[-:T+]/g, "").slice(0, 14);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `ZWE-${stamp}-${rand}`;
}

async function submitCurrent() {
  const errors = allErrors();
  if (errors.length) {
    showToast("A beküldés nem indítható: hiányzó vagy hibás mezők.", 4200);
    return;
  }

  const age = selectedAge();
  const inst = await currentInstitutionRow();
  const sc = convertSoupServed();
  const sw = convertSoupWaste();
  const mc = convertMainServed();
  const mw = convertMainWaste();
  const soupSens = sensoryFlat("soup");
  const mainSens = sensoryFlat("main");

  const row = {
    submissionId: makeSubmissionId(),
    recorderName: $("recorderName").value,
    mealDate: $("mealDate").value,
    submittedAt: localIsoWithOffset(),
    appVersion: APP_VERSION,
    ageGroupLabel: age.label,
    ageGroupCode: Number(age.raw_code),
    regAgeGroup: age.reg_age_group,
    institutionName: inst.institutionName,
    institutionSheet: inst.sheetName,

    soupDish: safeText($("soupDish").value),
    soupServedOriginal: numberValue("soupServed"),
    soupServedUnit: $("soupServedUnit").value,
    soupServedStandardL: sc.value,
    soupServedConversionBasis: sc.basis,
    soupTempC: Number($("soupTemp").value),
    soupWasteOriginal: numberValue("soupWaste"),
    soupWasteUnit: $("soupWasteUnit").value,
    soupWasteKg: sw.value,
    soupWasteConversionBasis: sw.basis,
    soupAppearance: soupSens.appearance,
    soupAppearanceDesc: soupSens.appearanceDesc,
    soupSmell: soupSens.smell,
    soupSmellDesc: soupSens.smellDesc,
    soupTaste: soupSens.taste,
    soupTasteDesc: soupSens.tasteDesc,
    soupTexture: soupSens.texture,
    soupTextureDesc: soupSens.textureDesc,
    soupOverall: soupSens.overall,
    soupOverallDesc: soupSens.overallDesc,
    soupImprovement: safeText($("soupImprovement").value),
    soupNote: safeText($("soupNote").value),
    soupPhotoDataUrl: photoState.soup,

    mainDish: safeText($("mainDish").value),
    mainServedOriginal: numberValue("mainServed"),
    mainServedUnit: $("mainServedUnit").value,
    mainServedStandardKg: mc.value,
    mainServedConversionBasis: mc.basis,
    mainTempC: Number($("mainTemp").value),
    mainWasteOriginal: numberValue("mainWaste"),
    mainWastePrimaryOriginal: numberValue("mainWastePrimary"),
    mainWasteSideOriginal: numberValue("mainWasteSide"),
    mainWasteOtherOriginal: numberValue("mainWasteOther"),
    mainWasteUnit: $("mainWasteUnit").value,
    mainWasteKg: mw.values.total,
    mainWastePrimaryKg: mw.values.primary,
    mainWasteSideKg: mw.values.side,
    mainWasteOtherKg: mw.values.other,
    mainWasteConversionBasis: mw.basis,
    mainAppearance: mainSens.appearance,
    mainAppearanceDesc: mainSens.appearanceDesc,
    mainSmell: mainSens.smell,
    mainSmellDesc: mainSens.smellDesc,
    mainTaste: mainSens.taste,
    mainTasteDesc: mainSens.tasteDesc,
    mainTexture: mainSens.texture,
    mainTextureDesc: mainSens.textureDesc,
    mainOverall: mainSens.overall,
    mainOverallDesc: mainSens.overallDesc,
    mainImprovement: safeText($("mainImprovement").value),
    mainNote: safeText($("mainNote").value),
    mainPhotoDataUrl: photoState.main
  };

  await idbPut(STORE_SUBMISSIONS, row);
  await addUserDishIfNew("Leves", row.soupDish);
  await addUserDishIfNew("Második fogás", row.mainDish);
  await refreshDishLists();
  showToast(`Sikeres beküldés: ${row.submissionId}`, 4200);
  await renderSaved();
  await updateExportCount();
  resetEntry();
}

function resetSensory(prefix, containerId) {
  renderSensory(prefix, containerId);
}

function resetEntry() {
  $("entryForm").reset();
  $("mealDate").value = todayISO();
  $("soupServedUnit").value = "liter";
  $("mainServedUnit").value = "kg";
  $("soupWasteUnit").value = "kg";
  $("mainWasteUnit").value = "kg";
  $("soupTemp").value = 65;
  $("mainTemp").value = 65;
  resetSensory("soup", "soupSensory");
  resetSensory("main", "mainSensory");
  photoState.soup = null;
  photoState.main = null;
  $("soupPhotoPreview").textContent = "Nincs fotó kiválasztva.";
  $("mainPhotoPreview").textContent = "Nincs fotó kiválasztva.";
  updateTemp("soup");
  updateTemp("main");
  updateAgeGuide();
  updateConversionExtras();
  updateConversions();
  currentStep = 0;
  goToStep(0);
}

/* Saved records */
async function renderSaved() {
  const rows = (await idbGetAll(STORE_SUBMISSIONS))
    .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
  $("savedCount").textContent = rows.length;
  const list = $("savedList");
  if (!rows.length) {
    list.innerHTML = `<div class="info-box muted">Még nincs mentett adat.</div>`;
    return;
  }
  list.innerHTML = rows.map(r => `
    <div class="record-item">
      <div class="record-title">${escapeHtml(r.mealDate)} – ${escapeHtml(r.institutionName)}</div>
      <div class="record-meta">${escapeHtml(r.ageGroupLabel)} • ${escapeHtml(r.soupDish)} / ${escapeHtml(r.mainDish)}</div>
      <div class="record-meta">Adatrögzítő: ${escapeHtml(r.recorderName || "–")} • Fotó: ${(r.soupPhotoDataUrl || r.mainPhotoDataUrl) ? "igen" : "nem"}</div>
      <div class="record-meta">Beküldve: ${escapeHtml(r.submittedAt)}</div>
      <div class="record-actions">
        <button class="secondary-btn small delete-record" data-id="${escapeHtml(r.submissionId)}" type="button">Törlés</button>
      </div>
    </div>
  `).join("");

  qsa(".delete-record", list).forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Biztosan törli ezt a mérési eseményt?")) return;
      await idbDelete(STORE_SUBMISSIONS, btn.dataset.id);
      await renderSaved();
      await updateExportCount();
      showToast("Rekord törölve.");
    });
  });
}

/* Export */
async function filteredExportRows() {
  const rows = await idbGetAll(STORE_SUBMISSIONS);
  const from = $("exportFrom").value;
  const to = $("exportTo").value;
  const inst = $("exportInstitution").value;
  return rows.filter(r =>
    (!from || r.mealDate >= from) &&
    (!to || r.mealDate <= to) &&
    (!inst || r.institutionName === inst)
  ).sort((a, b) => a.mealDate.localeCompare(b.mealDate));
}

function rawRow(r) {
  return {
    source_sheet: r.institutionSheet,
    sorszam: r.submissionId,
    adatrögzítő_neve: r.recorderName || "",
    intezmeny_neve: r.institutionName,
    kitoltes_datuma: r.mealDate,
    bekuldes_idopontja: r.submittedAt,
    korosztaly: r.ageGroupCode,
    korosztaly_megj: r.ageGroupCode === 0 ? r.ageGroupLabel : "",
    leves_nev: r.soupDish,
    leves_adag: r.soupServedStandardL,
    leves_adag_eredeti: r.soupServedOriginal,
    leves_adag_egyseg_eredeti: r.soupServedUnit,
    leves_adag_konverzio: r.soupServedConversionBasis,
    leves_hom: r.soupTempC,
    leves_moslek: r.soupWasteKg,
    leves_moslek_eredeti: r.soupWasteOriginal,
    leves_moslek_egyseg_eredeti: r.soupWasteUnit,
    leves_kulso: r.soupAppearance,
    leves_kulso_megj: r.soupAppearanceDesc,
    leves_illat: r.soupSmell,
    leves_illat_megj: r.soupSmellDesc,
    leves_iz: r.soupTaste,
    leves_iz_megj: r.soupTasteDesc,
    leves_allomany: r.soupTexture,
    leves_allomany_megj: r.soupTextureDesc,
    leves_osszkedv: r.soupOverall,
    leves_osszkedv_megj: r.soupOverallDesc,
    leves_javitas: r.soupImprovement,
    leves_megjegyzes: r.soupNote,
    leves_foto_rogzitve: r.soupPhotoDataUrl ? "igen" : "nem",
    leves_fogy_megj: "",
    leves_repeta: "",
    masodik_nev: r.mainDish,
    masodik_adag: r.mainServedStandardKg,
    masodik_adag_eredeti: r.mainServedOriginal,
    masodik_adag_egyseg_eredeti: r.mainServedUnit,
    masodik_adag_konverzio: r.mainServedConversionBasis,
    masodik_homerseklet1: r.mainTempC,
    masodik_homerseklet2: "",
    masodik_moslek: r.mainWasteKg,
    masodik_moslek_foetel: r.mainWastePrimaryKg,
    masodik_moslek_koret: r.mainWasteSideKg,
    masodik_moslek_egyeb: r.mainWasteOtherKg,
    masodik_moslek_eredeti: r.mainWasteOriginal,
    masodik_moslek_egyseg_eredeti: r.mainWasteUnit,
    masodik_kulso: r.mainAppearance,
    masodik_kulso_megj: r.mainAppearanceDesc,
    masodik_illat: r.mainSmell,
    masodik_illat_megj: r.mainSmellDesc,
    masodik_iz: r.mainTaste,
    masodik_iz_megj: r.mainTasteDesc,
    masodik_allomany: r.mainTexture,
    masodik_allomany_megj: r.mainTextureDesc,
    masodik_osszkedv: r.mainOverall,
    masodik_osszkedv_megj: r.mainOverallDesc,
    masodik_javitas: r.mainImprovement,
    masodik_megjegyzes: r.mainNote,
    masodik_foto_rogzitve: r.mainPhotoDataUrl ? "igen" : "nem",
    masodik_fogy_megj: "",
    masodik_repeta: ""
  };
}

async function updateExportCount() {
  const rows = await filteredExportRows();
  $("exportCount").textContent = `${rows.length} exportálható rekord`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[;"\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

async function exportCsv() {
  const rows = (await filteredExportRows()).map(rawRow);
  if (!rows.length) return showToast("Nincs exportálható adat.");
  const headers = Object.keys(rows[0]);
  const csv = "\ufeff" + [
    headers.map(csvEscape).join(";"),
    ...rows.map(r => headers.map(h => csvEscape(r[h])).join(";"))
  ].join("\r\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }),
    `raw_élelmiszerhulladék_${$("exportFrom").value}_${$("exportTo").value}.csv`);
}

function makeSheetName(name) {
  return safeText(name).replace(/[:\\/?*\[\]]/g, " ").replace(/\s+/g, " ").slice(0, 31) || "Adatok";
}

async function exportXlsx() {
  const sourceRows = await filteredExportRows();
  if (!sourceRows.length) return showToast("Nincs exportálható adat.");
  if (!window.XLSX) {
    showToast("Az XLSX könyvtár még nem töltődött be. Ellenőrizze az internetkapcsolatot, vagy használja a CSV exportot.", 5000);
    return;
  }
  const rows = sourceRows.map(rawRow);
  const wb = XLSX.utils.book_new();
  const groups = new Map();
  for (const r of rows) {
    const key = r.source_sheet || "Adatok";
    if (!groups.has(key)) groups.set(key, []);
    const copy = { ...r };
    delete copy.source_sheet;
    groups.get(key).push(copy);
  }

  const used = new Set();
  for (const [name, group] of groups.entries()) {
    let sheet = makeSheetName(name);
    let base = sheet;
    let n = 2;
    while (used.has(sheet)) {
      const suffix = `_${n++}`;
      sheet = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    used.add(sheet);
    const ws = XLSX.utils.json_to_sheet(group);
    XLSX.utils.book_append_sheet(wb, ws, sheet);
  }
  XLSX.writeFile(wb, `raw_élelmiszerhulladék_${$("exportFrom").value}_${$("exportTo").value}.xlsx`);
}

async function backupJson() {
  const submissions = await idbGetAll(STORE_SUBMISSIONS);
  const institutions = await idbGetAll(STORE_INSTITUTIONS);
  const userDishes = await idbGetAll(STORE_DISHES);
  const obj = {
    app: "ZeroWaste Entry Web",
    version: APP_VERSION,
    exportedAt: localIsoWithOffset(),
    submissions,
    institutions,
    userDishes
  };
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }),
    `ZeroWaste_Entry_backup_${todayISO()}.json`);
}

/* Master data */
function renderInstitutionList(rows) {
  $("institutionList").innerHTML = rows.length
    ? rows.map(x => `<div class="simple-item"><strong>${escapeHtml(x.institutionName)}</strong><div class="record-meta">Excel-lap: ${escapeHtml(x.sheetName)}</div></div>`).join("")
    : `<div class="info-box muted">Nincs intézmény.</div>`;
}

async function addInstitution() {
  const name = safeText($("newInstitution").value);
  if (!name) return showToast("Adja meg az intézmény nevét.");
  const sheet = makeSheetName(safeText($("newInstitutionSheet").value) || name);
  await idbPut(STORE_INSTITUTIONS, {
    institutionName: name,
    sheetName: sheet,
    source: "user",
    active: true,
    createdAt: localIsoWithOffset()
  });
  $("newInstitution").value = "";
  $("newInstitutionSheet").value = "";
  await refreshInstitutionSelectors();
  showToast("Intézmény hozzáadva.");
}

function renderGuide() {
  const q = safeText($("guideSearch").value).toLocaleLowerCase("hu");
  const rows = DATA.portionGuide.filter(x =>
    !q ||
    `${x.food_element} ${x.reg_age_group} ${x.portion_key}`.toLocaleLowerCase("hu").includes(q)
  ).slice(0, 100);
  $("guideList").innerHTML = rows.map(x =>
    `<div class="simple-item"><strong>${escapeHtml(x.food_element)}</strong><div class="record-meta">${escapeHtml(x.reg_age_group)} • ${escapeHtml(x.min_value)}–${escapeHtml(x.max_value)} ${escapeHtml(x.guide_unit)} • középérték: ${escapeHtml(x.mid_value)}</div></div>`
  ).join("") || `<div class="info-box muted">Nincs találat.</div>`;
}

/* Navigation and misc */
function switchView(name) {
  qsa(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  qsa(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  if (name === "saved") renderSaved();
  if (name === "export") updateExportCount();
}

function updateAgeGuide() {
  const age = selectedAge();
  $("ageGuideBox").innerHTML = age
    ? `<strong>${escapeHtml(age.label)}</strong><br>Adagolási útmutató korcsoport: <strong>${escapeHtml(age.reg_age_group)}</strong>.`
    : "A korosztály kiválasztása után megjelenik az adagolási korcsoport.";
  updateConversionExtras();
  updateConversions();
}

function updateNetworkBadge() {
  const online = navigator.onLine;
  const b = $("networkBadge");
  b.className = `badge ${online ? "online" : "offline"}`;
  b.textContent = online ? "Online" : "Offline";
}

function bindEvents() {
  $("prevBtn").addEventListener("click", () => goToStep(currentStep - 1));
  $("nextBtn").addEventListener("click", () => goToStep(currentStep + 1));
  $("submitBtn").addEventListener("click", submitCurrent);

  qsa(".nav-btn").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));

  $("ageGroup").addEventListener("change", updateAgeGuide);
  $("soupDish").addEventListener("input", async () => {
    await updateDishStatus("soup");
    updateConversionExtras();
    updateConversions();
  });
  $("mainDish").addEventListener("input", async () => {
    await updateDishStatus("main");
    updateConversionExtras();
    updateConversions();
  });

  $("soupNewDishBtn").addEventListener("click", () => {
    $("soupDish").value = "";
    $("soupDish").focus();
    $("soupDishStatus").textContent = "Írja be az új leves nevét.";
  });
  $("mainNewDishBtn").addEventListener("click", () => {
    $("mainDish").value = "";
    $("mainDish").focus();
    $("mainDishStatus").textContent = "Írja be az új étel nevét.";
  });

  ["soupServedUnit","mainServedUnit","soupWasteUnit","mainWasteUnit"].forEach(id =>
    $(id).addEventListener("change", () => {
      updateConversionExtras();
      updateConversions();
    })
  );

  [
    "soupServed","soupWaste","mainServed","mainWaste",
    "mainWastePrimary","mainWasteSide","mainWasteOther",
    "soupImprovement","soupNote","mainImprovement","mainNote",
    "recorderName","mealDate","institution"
  ].forEach(id => $(id).addEventListener("input", updateFinalState));

  $("soupPhoto").addEventListener("change", async (e) => {
    await handlePhoto("soup", e.target.files?.[0] || null);
  });
  $("mainPhoto").addEventListener("change", async (e) => {
    await handlePhoto("main", e.target.files?.[0] || null);
  });

  $("soupTemp").addEventListener("input", () => { updateTemp("soup"); updateFinalState(); });
  $("mainTemp").addEventListener("input", () => { updateTemp("main"); updateFinalState(); });

  ["exportFrom","exportTo","exportInstitution"].forEach(id => $(id).addEventListener("change", updateExportCount));
  $("exportCsvBtn").addEventListener("click", exportCsv);
  $("exportXlsxBtn").addEventListener("click", exportXlsx);
  $("backupJsonBtn").addEventListener("click", backupJson);
  $("addInstitutionBtn").addEventListener("click", addInstitution);
  $("guideSearch").addEventListener("input", renderGuide);

  window.addEventListener("online", updateNetworkBadge);
  window.addEventListener("offline", updateNetworkBadge);

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $("installBtn").classList.remove("hidden");
  });

  $("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("installBtn").classList.add("hidden");
  });
}

async function init() {
  db = await openDatabase();
  await seedReferenceInstitutions();
  await populateAgeGroups();
  populateRecorders();
  await refreshInstitutionSelectors();
  await refreshDishLists();

  $("mealDate").value = todayISO();
  const d = new Date();
  const to = todayISO();
  const fromD = new Date(d.getTime() - 30 * 86400000);
  const fromOffset = fromD.getTimezoneOffset();
  $("exportFrom").value = new Date(fromD.getTime() - fromOffset * 60000).toISOString().slice(0,10);
  $("exportTo").value = to;

  renderSensory("soup", "soupSensory");
  renderSensory("main", "mainSensory");
  renderGuide();
  bindEvents();
  updateTemp("soup");
  updateTemp("main");
  updateAgeGuide();
  updateConversionExtras();
  updateConversions();
  updateNetworkBadge();
  await renderSaved();
  await updateExportCount();
  goToStep(0);

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (err) {
      console.warn("Service worker registration failed:", err);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch(err => {
    console.error(err);
    alert(`ZeroWaste Entry indítási hiba: ${err.message}`);
  });
});
