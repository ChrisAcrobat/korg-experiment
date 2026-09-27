/**
 * Thin bootstrap: register the Service Worker and watch for critical updates
 * to index.html / reload.js. Everything else updates silently via SW / modules.
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

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("sw.js", siteRoot).href).catch(function () {});
  }

  function t(key, fallback) {
    return window.KorgI18n ? window.KorgI18n.t(key, fallback) : fallback;
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
