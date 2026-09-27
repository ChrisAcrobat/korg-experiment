/* Korg experiments service worker — stale-while-revalidate caching. */
const CACHE_NAME = "korg-cache-v2";

const PRECACHE = [
  "./",
  "./index.html",
  "./reload.js",
  "./sw.js",
  "./css/site.css",
  "./js/animations.js",
  "./js/i18n.js",
  "./js/hoops.js",
  "./js/home.js",
  "./language-strings/en.json",
  "./language-strings/sv.json",
  "./Korgs/hoops.json",
  "./Korgs/Pong/",
  "./Korgs/Pong/index.html",
  "./Korgs/Pong/meta.json",
  "./Korgs/DiceRoll/",
  "./Korgs/DiceRoll/index.html",
  "./Korgs/DiceRoll/meta.json",
  "./Korgs/DiceRoll/dice-roll.css",
  "./404.html",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(
        PRECACHE.map(function (path) {
          return new URL(path, self.registration.scope).href;
        })
      ).catch(function () {
        /* Precache best-effort; individual fetches will fill the cache. */
      });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Let GitHub / third-party APIs bypass SW cache logic (network only).
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isCritical =
    /\/(index\.html)?$/.test(path) ||
    path.endsWith("/reload.js") ||
    path.endsWith("/sw.js");
  // Hoop discovery files must be network-first so silent polls see new folders.
  const isHoopMeta =
    path.endsWith("/hoops.json") ||
    path.endsWith("/meta.json");

  event.respondWith(
    (async function () {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);

      const networkPromise = fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(function () {
          return cached;
        });

      // Critical shell + hoop listing: network-first so updates are visible without reload.
      if (isCritical || isHoopMeta) {
        const net = await networkPromise;
        return net || cached;
      }

      // Everything else: stale-while-revalidate.
      if (cached) {
        networkPromise.catch(function () {});
        return cached;
      }
      return networkPromise;
    })()
  );
});
