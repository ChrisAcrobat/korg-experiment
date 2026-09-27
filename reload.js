/**
 * Thin bootstrap: register the Service Worker and watch for critical updates
 * to index.html / reload.js only. sw.js updates take over silently.
 *
 * ROOT CAUSE HISTORY
 * ------------------
 * 1) Preferring GitHub Pages ETags caused false "update available" popups on
 *    every Pages deploy (ETags rotate even when file bodies are unchanged).
 *    Fix: fingerprint CONTENT only (see criticalFingerprint).
 * 2) Service Worker install/activate (skipWaiting + clients.claim) fires
 *    controllerchange. The first transition is often null → controller (first
 *    control), which is NOT a content update. This file must NEVER show the
 *    update banner from any SW lifecycle event — only from content-hash drift
 *    on index.html / reload.js.
 */
(function () {
  const scriptEl = document.currentScript;
  const siteRoot = new URL(".", scriptEl.src).href;
  const INTERVAL_MS = 45_000;
  const FP_KEY = "korg-critical-fp-v3";
  const CONFIRM_MS = 2000;

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
          // Waiting worker ready — activate silently. Never open the banner here.
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

  // Track whether we already had a controlling SW before any controllerchange.
  // null → first controller is first claim, not an "update".
  var hadController =
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    !!navigator.serviceWorker.controller;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register(new URL("sw.js", siteRoot).href)
      .then(wireSilentServiceWorker)
      .catch(function () {});

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      // Defensive: SW lifecycle must never surface the critical-update UI.
      // Even when hadController was true (SW → SW replacement), takeover stays
      // silent — critical UX is solely content-hash of index.html / reload.js.
      var wasFirstClaim = !hadController;
      hadController = true;
      // wasFirstClaim is intentionally unused beyond documenting the guard:
      // first claim (null→controller) is ignored; replacements are also silent.
      void wasFirstClaim;
    });
  }

  function normalizeBody(text) {
    // Strip BOM and normalize newlines so CDN/OS variance does not false-positive.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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
   * Content-only fingerprint. Never use ETag / Last-Modified / SW events.
   * Called by checkCritical only — no short-circuit that skips the hash.
   */
  async function fingerprint(path) {
    const url = new URL(path, siteRoot).href;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "text/html,application/javascript,text/plain,*/*" },
    });
    if (!res.ok) throw new Error(path + " " + res.status);
    const text = normalizeBody(await res.text());
    return path + "|h:" + hashText(text) + "|n:" + text.length;
  }

  async function criticalFingerprint() {
    // Always hashes BOTH files; no early return before hashing.
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
  var confirmTimer = null;

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

  /**
   * Only path that may show the popup. Requires a stable content-hash mismatch
   * confirmed twice (CDN blips / mid-deploy reads must not one-shot the UI).
   * SW controllerchange never reaches here.
   */
  async function checkCritical() {
    try {
      const next = await criticalFingerprint();
      var prev = null;
      try {
        prev = localStorage.getItem(FP_KEY);
      } catch (_) {}

      // First baseline: store and exit — never popup on first observation.
      if (!prev) {
        try {
          localStorage.setItem(FP_KEY, next);
        } catch (_) {}
        return;
      }

      if (next === prev) {
        if (confirmTimer) {
          clearTimeout(confirmTimer);
          confirmTimer = null;
        }
        return;
      }

      // Mismatch: confirm with a second hash after a short delay before UI.
      if (confirmTimer) return;
      confirmTimer = setTimeout(function () {
        confirmTimer = null;
        criticalFingerprint()
          .then(function (again) {
            var latest = null;
            try {
              latest = localStorage.getItem(FP_KEY);
            } catch (_) {}
            if (!latest || again === latest) return;
            if (again !== next) return; // unstable read — ignore
            showUpdateBanner();
          })
          .catch(function () {});
      }, CONFIRM_MS);
    } catch (_) {
      /* ignore transient errors — do not show popup */
    }
  }

  // Establish baseline after load. Does not show the banner.
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

  setTimeout(checkCritical, 5000);
  setInterval(checkCritical, INTERVAL_MS);
})();
