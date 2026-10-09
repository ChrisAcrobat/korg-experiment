/* Korg experiments service worker — shell precache + dynamic basket discovery. */
const CACHE_NAME = "korg-cache-v11";
const BASKET_POLL_MS = 25000;

/* Core shell only — never list individual baskets here (that forced critical updates). */
const CORE_PRECACHE = [
  "./",
  "./index.html",
  "./reload.js",
  "./sw.js",
  "./css/site.css",
  "./js/animations.js",
  "./js/i18n.js",
  "./js/baskets.js",
  "./js/home.js",
  "./js/navigation.js",
  "./language-strings/en.json",
  "./language-strings/sv.json",
  "./Korgs/baskets.json",
  "./404.html",
];

let basketPollTimer = null;
let lastFolderKey = "";
let discoverInFlight = false;

function scopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAME);
  const unique = Array.from(new Set(urls.filter(Boolean)));
  await Promise.all(
    unique.map(function (url) {
      return cache.add(url).catch(function () {
        /* Best-effort: missing optional assets must not fail the SW. */
      });
    })
  );
}

async function listFoldersFromBasketsJson() {
  const res = await fetch(scopeUrl("./Korgs/baskets.json"), { cache: "no-store" });
  if (!res.ok) throw new Error("baskets.json " + res.status);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("bad baskets.json");
  return data.map(String).sort();
}

/** Precache common basket entry points from Pages using baskets.json. */
async function precacheBasketsFallback(folders) {
  const paths = ["./Korgs/baskets.json"];
  folders.forEach(function (name) {
    const base = "./Korgs/" + encodeURIComponent(name) + "/";
    paths.push(base, base + "index.html", base + "meta.json");
  });
  await cacheUrls(paths.map(scopeUrl));
}

async function discoverAndCacheBaskets(force) {
  if (discoverInFlight) return;
  discoverInFlight = true;
  try {
    const folders = await listFoldersFromBasketsJson();

    const folderKey = folders.join("|");
    if (!force && folderKey === lastFolderKey) {
      // Same set of baskets — still refresh baskets.json / meta network-first via normal fetch.
      await cacheUrls([scopeUrl("./Korgs/baskets.json")]);
      return;
    }
    lastFolderKey = folderKey;

    await precacheBasketsFallback(folders);
  } catch (_) {
    /* Discovery is best-effort; runtime SWR still fills the cache on visit. */
  } finally {
    discoverInFlight = false;
  }
}

function startBasketPolling() {
  if (basketPollTimer) return;
  basketPollTimer = setInterval(function () {
    discoverAndCacheBaskets(false);
  }, BASKET_POLL_MS);
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    (async function () {
      await cacheUrls(CORE_PRECACHE.map(scopeUrl));
      // Discover current baskets during install (non-fatal if Pages is down).
      await discoverAndCacheBaskets(true);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      const keys = await caches.keys();
      await Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
      await self.clients.claim();
      // Refresh basket set after claiming clients; then keep polling.
      await discoverAndCacheBaskets(true);
      startBasketPolling();
    })()
  );
});

// Also start polling if the worker was already active (e.g. script update mid-session).
self.addEventListener("message", function (event) {
  const data = event && event.data;
  if (!data || !data.type) return;
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "korg-discover-baskets") {
    discoverAndCacheBaskets(true);
  }
});
startBasketPolling();

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Let GitHub / third-party APIs bypass SW cache logic (network only).
  if (url.origin !== self.location.origin) return;

  // Critical-update probes from reload.js must hit the network directly.
  // If the SW intercepted them, a failed/mid-deploy fetch could fall back to an
  // older precached index.html/reload.js and falsely trip the update banner
  // when only Korgs/ files changed.
  if (url.searchParams.has("korg_fp")) return;

  const path = url.pathname;
  const scopePath = new URL(self.registration.scope).pathname.replace(/\/?$/, "/");
  // Only the site shell stays network-first. Basket HTML uses stale-while-revalidate
  // below so soft navigation can paint instantly from Cache API.
  const isRootShell =
    path === scopePath ||
    path === scopePath + "index.html" ||
    path === scopePath.replace(/\/$/, "");
  const isShellNetworkFirst =
    isRootShell ||
    path.endsWith("/reload.js") ||
    path.endsWith("/sw.js");
  // Basket discovery files must be network-first so silent polls see new folders.
  const isBasketMeta = path.endsWith("/baskets.json") || path.endsWith("/meta.json");

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

      if (isShellNetworkFirst || isBasketMeta) {
        const net = await networkPromise;
        // Prefer network; only use cache if network produced nothing.
        return net || cached;
      }

      if (cached) {
        networkPromise.catch(function () {});
        return cached;
      }
      return networkPromise;
    })()
  );
});
