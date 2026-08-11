const CACHE_NAME = "zerowaste-entry-v2-2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=2.2.0",
  "./app.js?v=2.2.0",
  "./data.js?v=2.2.0",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isAppAsset = event.request.mode === "navigate" ||
    /\/(index\.html|app\.js|data\.js|styles\.css|manifest\.webmanifest)$/.test(url.pathname);

  if (isAppAsset) {
    // Frissítéskor előbb a hálózatot próbáljuk, így nem keveredik
    // az új HTML a régi JavaScript-tel. Offline esetben cache fallback.
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response && (response.ok || response.type === "opaque")) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
