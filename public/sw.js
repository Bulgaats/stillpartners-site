const CACHE_NAME = "still-partners-v3-cache-reset";
const APP_SHELL = [
  "/offline",
  "/manifest.webmanifest",
  "/assets/logo/app-icon-master.png?v=20260427-cache-reset",
  "/assets/logo/logo-icon-dark.svg?v=20260427-cache-reset",
  "/assets/logo/logo-full-light.svg?v=20260427-cache-reset"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || caches.match("/offline");
      })
  );
});
