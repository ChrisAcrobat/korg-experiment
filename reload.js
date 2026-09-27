/**
 * Thin bootstrap: register the Service Worker and watch for critical updates
 * to index.html / reload.js only. sw.js updates take over silently.
 *
 * Fingerprints use CONTENT HASH only — GitHub Pages ETags change on every
 * deploy even when file bodies are identical, which falsely triggered the
 * "update available" popup for hoop-only commits.
 */
(function () {
  const scriptEl = document.currentScript;
  const siteRoot = new URL(".", scriptEl.src).href;
  const INTERVAL_MS = 45_000;
  const FP_KEY = "korg-critical-fp-v2";

  window.KORG_ROOT = siteRoot;

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

  function activateWaitingWorker(worker) {
    if (!worker) return;
    try {
      worker.postMessage({ type: "SKIP_WAITING" });
    } catch (_) {}
  }

  function wireSilentServiceWorker(reg) {
    if (!reg) return;

    if (reg.waiting) activateWaitingWorker(reg.waiting);

    reg.addEventListener("updatefound", function () {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", function () {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          activateWaitingWorker(reg.waiting || installing);
        }
      });
    });

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

    // SW takeover is NEVER a critical update — no reload, no banner.
    var ignoringControllerChange = true;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      ignoringControllerChange = true;
      /* intentionally empty: silent claim only */
    });
  }

  function hashText(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  /**
   * Content-only fingerprint. Do not use ETag/Last-Modified — Pages rotates
   * those on every site publish regardless of whether this file changed.
   */
  async function fingerprint(path) {
    const url = new URL(path, siteRoot).href;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "text/html,application/javascript,text/plain,*/*" },
    });
    if (!res.ok) throw new Error(path + " " + res.status);
    const text = await res.text();
    return path + "|h:" + hashText(text) + "|n:" + text.length;
  }

  /** Critical = index.html + reload.js body only. Never sw.js. */
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
        showUpdateBanner();
      }
    } catch (_) {
      /* ignore transient errors */
    }
  }

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
