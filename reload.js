/**
 * Thin bootstrap: register the Service Worker and watch for critical updates
 * to index.html / reload.js only. sw.js updates take over silently.
 */
(function () {
  const scriptEl = document.currentScript;
  const siteRoot = new URL(".", scriptEl.src).href;
  const INTERVAL_MS = 45_000;
  const FP_KEY = "korg-critical-fp-v1";

  window.KORG_ROOT = siteRoot;

  // Interaction gate used by games (e.g. Pong) to defer the update popup.
  window.KorgInteraction = window.KorgInteraction || {
    _busy: false,
    setBusy: function (busy) {
      this._busy = !!busy;
      if (!this._busy) document.dispatchEvent(new Event("korg:interaction-idle"));
    },
    isBusy: function () {
      return !!this._busy;
    },
  };

  function t(key, fallback) {
    return window.KorgI18n ? window.KorgI18n.t(key, fallback) : fallback;
  }

  /** Ask a waiting worker to activate immediately — never show the update popup. */
  function activateWaitingWorker(worker) {
    if (!worker) return;
    try {
      worker.postMessage({ type: "SKIP_WAITING" });
    } catch (_) {}
  }

  function wireSilentServiceWorker(reg) {
    if (!reg) return;

    // A new SW may already be waiting (e.g. after a prior sw.js-only deploy).
    if (reg.waiting) activateWaitingWorker(reg.waiting);

    reg.addEventListener("updatefound", function () {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", function () {
        // "installed" + no controller yet = first install; with a controller = update waiting.
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          activateWaitingWorker(reg.waiting || installing);
        }
      });
    });

    // Periodic update checks so sw.js changes are noticed without a full navigation.
    setInterval(function () {
      reg.update().catch(function () {});
    }, INTERVAL_MS);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        reg.update().catch(function () {});
      }
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register(new URL("sw.js", siteRoot).href)
      .then(wireSilentServiceWorker)
      .catch(function () {});

    // New SW claimed the page — stay put; do NOT reload and do NOT show the banner.
    // (Critical index.html / reload.js changes still use the fingerprint popup below.)
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      /* silent takeover */
    });
  }

  async function fingerprint(path) {
    const url = new URL(path, siteRoot).href + "?_=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(path + " " + res.status);
    const etag = res.headers.get("etag");
    if (etag) return path + "|etag:" + etag;
    const text = await res.text();
    var hash = 0;
    for (var i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return path + "|h:" + hash;
  }

  /** Critical = index.html + reload.js only. sw.js is intentionally excluded. */
  async function criticalFingerprint() {
    const parts = await Promise.all([
      fingerprint("index.html"),
      fingerprint("reload.js"),
    ]);
    return parts.join("||");
  }

  function ensureBanner() {
    var banner = document.getElementById("update-banner");
    if (banner) return banner;
    banner = document.createElement("div");
    banner.id = "update-banner";
    banner.className = "update-banner";
    banner.hidden = true;
    banner.setAttribute("role", "status");

    var msg = document.createElement("span");
    msg.setAttribute("data-i18n", "update_available");
    msg.textContent = t("update_available", "Update available");

    var apply = document.createElement("button");
    apply.type = "button";
    apply.className = "update-apply";
    apply.setAttribute("data-i18n", "update_reload");
    apply.textContent = t("update_reload", "Reload");
    apply.addEventListener("click", function () {
      criticalFingerprint()
        .then(function (fp) {
          try { localStorage.setItem(FP_KEY, fp); } catch (_) {}
          location.reload();
        })
        .catch(function () { location.reload(); });
    });

    var dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "update-dismiss";
    dismiss.setAttribute("data-i18n", "update_later");
    dismiss.textContent = t("update_later", "Later");
    dismiss.addEventListener("click", function () {
      banner.hidden = true;
    });

    banner.appendChild(msg);
    banner.appendChild(apply);
    banner.appendChild(dismiss);
    document.body.appendChild(banner);
    return banner;
  }

  var pendingCritical = false;

  function showUpdateBanner() {
    if (window.KorgInteraction && window.KorgInteraction.isBusy()) {
      pendingCritical = true;
      return;
    }
    var banner = ensureBanner();
    var msg = banner.querySelector("[data-i18n='update_available']");
    var apply = banner.querySelector(".update-apply");
    var dismiss = banner.querySelector(".update-dismiss");
    if (msg) msg.textContent = t("update_available", "Update available");
    if (apply) apply.textContent = t("update_reload", "Reload");
    if (dismiss) dismiss.textContent = t("update_later", "Later");
    banner.hidden = false;
    pendingCritical = false;
  }

  document.addEventListener("korg:interaction-idle", function () {
    if (pendingCritical) showUpdateBanner();
  });

  async function checkCritical() {
    try {
      const next = await criticalFingerprint();
      var prev = null;
      try {
        prev = localStorage.getItem(FP_KEY);
      } catch (_) {}
      if (!prev) {
        try {
          localStorage.setItem(FP_KEY, next);
        } catch (_) {}
        return;
      }
      if (next !== prev) {
        // Keep storing the new fingerprint only after the user reloads,
        // so the banner remains until they choose Reload.
        showUpdateBanner();
      }
    } catch (_) {
      /* ignore transient errors */
    }
  }

  // After a successful reload onto new critical assets, refresh stored fp.
  criticalFingerprint()
    .then(function (fp) {
      var banner = document.getElementById("update-banner");
      if (!banner || banner.hidden) {
        try {
          localStorage.setItem(FP_KEY, fp);
        } catch (_) {}
      }
    })
    .catch(function () {});

  setTimeout(checkCritical, 4000);
  setInterval(checkCritical, INTERVAL_MS);
})();
