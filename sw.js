/* Korg experiments service worker — shell precache + dynamic hoop discovery. */
const CACHE_NAME = "korg-cache-v3";
const REPO = "ChrisAcrobat/korg-experiment";
const BRANCH = "main";
const HOOP_POLL_MS = 25000;
const GH_CONTENTS =
  "https://api.github.com/repos/" + REPO + "/contents/Korgs?ref=" + encodeURIComponent(BRANCH);

/* Core shell only — never list individual hoops here (that forced critical updates). */
const CORE_PRECACHE = [
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
  "./404.html",
];

let hoopPollTimer = null;
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

async function fetchGhJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("gh " + res.status);
  return res.json();
}

/** Recursively collect site-relative paths under a GitHub Contents API folder. */
async function collectFromGhDir(apiUrl, sitePrefix) {
  const entries = await fetchGhJson(apiUrl);
  if (!Array.isArray(entries)) return [];
  const paths = [];
  // Directory index for GitHub Pages.
  paths.push(sitePrefix.endsWith("/") ? sitePrefix : sitePrefix + "/");

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e || !e.name || e.name.indexOf(".") === 0) continue;
    if (e.type === "dir") {
      const childApi =
        "https://api.github.com/repos/" +
        REPO +
        "/contents/" +
        e.path +
        "?ref=" +
        encodeURIComponent(BRANCH);
      const childPrefix = sitePrefix.replace(/\/?$/, "/") + e.name + "/";
      const nested = await collectFromGhDir(childApi, childPrefix);
      paths.push.apply(paths, nested);
    } else if (e.type === "file") {
      paths.push(sitePrefix.replace(/\/?$/, "/") + e.name);
    }
  }
  return paths;
}

async function listFoldersFromApi() {
  const entries = await fetchGhJson(GH_CONTENTS);
  if (!Array.isArray(entries)) throw new Error("bad listing");
  return entries
    .filter(function (e) {
      return e && e.type === "dir" && e.name && e.name.indexOf(".") !== 0;
    })
    .map(function (e) {
      return e.name;
    })
    .sort();
}

async function listFoldersFromHoopsJson() {
  const res = await fetch(scopeUrl("./Korgs/hoops.json"), { cache: "no-store" });
  if (!res.ok) throw new Error("hoops.json " + res.status);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("bad hoops.json");
  return data.map(String).sort();
}

/**
 * When the API is rate-limited, still try to cache the common hoop entry
 * points from Pages using hoops.json (index + meta + folder URL).
 */
async function precacheHoopsFallback(folders) {
  const paths = ["./Korgs/hoops.json"];
  folders.forEach(function (name) {
    const base = "./Korgs/" + encodeURIComponent(name) + "/";
    paths.push(base, base + "index.html", base + "meta.json");
  });
  await cacheUrls(paths.map(scopeUrl));
}

async function discoverAndCacheHoops(force) {
  if (discoverInFlight) return;
  discoverInFlight = true;
  try {
    let folders;
    let usedApi = true;
    try {
      folders = await listFoldersFromApi();
    } catch (_) {
      usedApi = false;
      folders = await listFoldersFromHoopsJson();
    }

    const folderKey = folders.join("|");
    if (!force && folderKey === lastFolderKey) {
      // Same set of hoops — still refresh hoops.json / meta network-first via normal fetch.
      await cacheUrls([scopeUrl("./Korgs/hoops.json")]);
      return;
    }
    lastFolderKey = folderKey;

    if (usedApi) {
      const allPaths = ["./Korgs/hoops.json"];
      for (let i = 0; i < folders.length; i++) {
        const name = folders[i];
        const apiUrl =
          "https://api.github.com/repos/" +
          REPO +
          "/contents/Korgs/" +
          encodeURIComponent(name) +
          "?ref=" +
          encodeURIComponent(BRANCH);
        const collected = await collectFromGhDir(apiUrl, "./Korgs/" + name + "/");
        allPaths.push.apply(allPaths, collected);
      }
      await cacheUrls(allPaths.map(scopeUrl));
    } else {
      await precacheHoopsFallback(folders);
    }
  } catch (_) {
    /* Discovery is best-effort; runtime SWR still fills the cache on visit. */
  } finally {
    discoverInFlight = false;
  }
}

function startHoopPolling() {
  if (hoopPollTimer) return;
  hoopPollTimer = setInterval(function () {
    discoverAndCacheHoops(false);
  }, HOOP_POLL_MS);
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    (async function () {
      await cacheUrls(CORE_PRECACHE.map(scopeUrl));
      // Discover current hoops during install (non-fatal if API is down).
      await discoverAndCacheHoops(true);
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
      // Refresh hoop set after claiming clients; then keep polling.
      await discoverAndCacheHoops(true);
      startHoopPolling();
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
  if (data.type === "korg-discover-hoops") {
    discoverAndCacheHoops(true);
  }
});
startHoopPolling();

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Let GitHub / third-party APIs bypass SW cache logic (network only).
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  // Network-first shell assets (sw.js updates activate via skipWaiting — not a UI "critical" popup).
  const isShellNetworkFirst =
    /\/(index\.html)?$/.test(path) ||
    path.endsWith("/reload.js") ||
    path.endsWith("/sw.js");
  // Hoop discovery files must be network-first so silent polls see new folders.
  const isHoopMeta = path.endsWith("/hoops.json") || path.endsWith("/meta.json");

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

      if (isShellNetworkFirst || isHoopMeta) {
        const net = await networkPromise;
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
