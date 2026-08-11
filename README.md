Version: 2.3

# ZeroWaste Entry Web / PWA – V2

Ez a ZeroWaste Entry mobil-first, teljesen kliensoldali webalkalmazás. A használó telefonján vagy tabletjén fut a böngészőben; R, RStudio vagy folyamatosan bekapcsolt PC nem szükséges.

## V2 javítások

- teljes, aktuális hulladékmérési intézménytörzs került be;
- az elején kötelező `Adatrögzítő neve` mező:
  - Gipsz Jakab
  - Kovács Istvánné
  - Tóth István
- az ételtörzs egységesítve lett:
  - egyszerű írásmód- és szóközvariánsok összevonva;
  - pl. `Alma leves` → `Almaleves`;
  - `Bab leves` → `Bableves`;
  - `Brokkolikrém leves` → `Brokkolikrémleves`;
  - téves fogástípusba került elemek és technikai/placeholderek kiszűrve;
- hőmérsékleti jelzés:
  - < 63 °C: piros – `Újramelegíteni!`
  - 63–68 °C: sárga – `Hamarosan újramelegítendő`
  - 69–80 °C: zöld – `Megfelelő!`
  - > 80 °C: narancs – `Túlságosan forró – érzékszervi kockázat?`
- minden érzékszervi attribútumnál választható `Megfelelő`;
- az érzékszervi descriptor / egyéb tulajdonság már opcionális; az 1–5 pontszám kötelező;
- leveshez és második fogáshoz külön fotó tölthető fel;
- a fotó a készüléken tömörítve kerül a helyi IndexedDB-adatbázisba;
- a megjegyzés alapértéke: `nincs megjegyzés`;
- a második fogás külön `Hús / főkomponens`, `Köret`, `Egyéb komponens` névmezői eltávolítva;
- a komponensenkénti hulladékmérés megmaradt;
- a raw export tartalmazza az adatrögzítő nevét és azt, hogy készült-e fotó.

## Adattárolás

A beküldött mérési adatok a telefon / tablet böngészőjének IndexedDB adatbázisában maradnak. A GitHub Pages csak az alkalmazás fájljait szolgálja ki.

Rendszeres ZeroWaste XLSX/CSV export vagy JSON biztonsági mentés javasolt.

## GitHub frissítés

Ha már létrehoztad a GitHub Pages repositoryt:

1. cseréld le a repository fájljait ennek a ZIP-nek a tartalmára;
2. commitold a változtatásokat;
3. várd meg a Pages új deployját;
4. telefonon frissítsd az oldalt.

A service worker cache-neve V2-re változott, ezért az új verzió külön cache-t használ.


## V2.2 módosítások
- érzékszervi útmutató mindkét fogás előtt;
- listás sensory tulajdonság kötelező, Egyéb opcionális;
- másodikfogás-törzs újraépítve a véglegesített ételnevekből;
- külön főétel/főkomponens- és körethőmérséklet;
- kért megjegyzés-placeholder;
- v2.2 cache-frissítés.
