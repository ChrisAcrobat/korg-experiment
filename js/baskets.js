(function (global) {
  const BASKETS_CACHE_KEY = "korg-baskets-v2";
  const scriptEl = document.currentScript;
  const siteRoot = new URL("../", scriptEl.src).href;

  function t(key, fallback) {
    return global.KorgI18n ? global.KorgI18n.t(key, fallback) : fallback;
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(BASKETS_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeCache(baskets) {
    try {
      localStorage.setItem(BASKETS_CACHE_KEY, JSON.stringify(baskets));
    } catch (_) {}
  }

  async function loadMetaRelative(folder) {
    try {
      const url = new URL("Korgs/" + encodeURIComponent(folder) + "/meta.json", siteRoot).href;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      return res.json();
    } catch (_) {
      return null;
    }
  }

  async function listFolders() {
    const res = await fetch(new URL("Korgs/baskets.json", siteRoot).href, { cache: "no-store" });
    if (!res.ok) throw new Error("baskets " + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("bad baskets.json");
    return data.map(String);
  }

  async function fetchBaskets() {
    const folders = await listFolders();
    const baskets = await Promise.all(
      folders.map(async function (name) {
        const meta = await loadMetaRelative(name);
        const order =
          meta && typeof meta.order === "number" ? meta.order : Number.POSITIVE_INFINITY;
        return {
          folder: name,
          title: (meta && meta.title) || name,
          description: (meta && meta.description) || "",
          icon: (meta && meta.icon) || "",
          order: order,
        };
      })
    );
    baskets.sort(function (a, b) {
      if (a.order !== b.order) return a.order - b.order;
      return a.title.localeCompare(b.title);
    });
    writeCache(baskets);
    return baskets;
  }

  function renderBaskets(listEl, statusEl, baskets) {
    listEl.innerHTML = "";
    if (!baskets.length) {
      statusEl.hidden = false;
      statusEl.setAttribute("data-i18n", "baskets_empty");
      statusEl.textContent = t("baskets_empty", "No baskets yet. Add a folder under Korgs/.");
      listEl.hidden = true;
      return;
    }
    statusEl.hidden = true;
    listEl.hidden = false;
    const defaultIcon = t("default_basket_icon", "🧺");
    const openLabel = t("basket_open", "Open basket");

    baskets.forEach(function (basket) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "basket";
      a.href = new URL("Korgs/" + encodeURIComponent(basket.folder) + "/", siteRoot).href;
      a.setAttribute("aria-label", openLabel + ": " + basket.title);

      const icon = document.createElement("span");
      icon.className = "basket-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = basket.icon || defaultIcon;

      const text = document.createElement("div");
      text.className = "basket-text";
      const title = document.createElement("p");
      title.className = "basket-title";
      title.textContent = basket.title;
      text.appendChild(title);
      if (basket.description) {
        const desc = document.createElement("p");
        desc.className = "basket-desc";
        desc.textContent = basket.description;
        text.appendChild(desc);
      }

      a.appendChild(icon);
      a.appendChild(text);
      a.addEventListener("click", function (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const go = function () {
          if (global.KorgNav) return global.KorgNav.navigate(a.href, { animate: false });
          window.location.href = a.href;
        };
        if (global.KorgAnimations) {
          global.KorgAnimations.scaleUpNavigate({
            href: a.href,
            icon: basket.icon || defaultIcon,
            fromEl: icon,
            onComplete: go,
          });
        } else {
          go();
        }
      });

      li.appendChild(a);
      listEl.appendChild(li);
    });

    if (global.KorgAnimations) {
      global.KorgAnimations.applyStagger(listEl.querySelectorAll(".basket"));
    }
  }

  function fingerprint(baskets) {
    if (!Array.isArray(baskets)) return "";
    return JSON.stringify(
      baskets.map(function (h) {
        return [h.folder, h.title, h.description, h.icon, h.order];
      })
    );
  }

  async function mount(listEl, statusEl) {
    if (!listEl || !statusEl) return;

    let currentFp = "";
    let refreshInFlight = false;
    const POLL_MS = 25000;

    function setStatus(key, fallback) {
      statusEl.hidden = false;
      statusEl.setAttribute("data-i18n", key);
      statusEl.textContent = t(key, fallback);
      listEl.hidden = true;
      listEl.innerHTML = "";
    }

    function applyBaskets(baskets, isBackground) {
      const fp = fingerprint(baskets);
      if (fp === currentFp) return false;
      currentFp = fp;
      renderBaskets(listEl, statusEl, baskets);
      return true;
    }

    async function refresh(isBackground) {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const baskets = await fetchBaskets();
        applyBaskets(baskets, isBackground);
      } catch (_) {
        if (!isBackground && !currentFp) {
          setStatus("baskets_error", "Could not load baskets right now. Try again later.");
        }
      } finally {
        refreshInFlight = false;
      }
    }

    const cached = readCache();
    if (cached && Array.isArray(cached) && cached.length) {
      applyBaskets(cached, false);
    } else {
      setStatus("baskets_loading", "Loading baskets…");
    }

    await refresh(false);

    function onI18nReady() {
      if (!listEl.hidden && listEl.children.length) {
        const openLabel = t("basket_open", "Open basket");
        listEl.querySelectorAll(".basket").forEach(function (a) {
          const title = a.querySelector(".basket-title");
          if (title) a.setAttribute("aria-label", openLabel + ": " + title.textContent);
        });
      } else if (!statusEl.hidden) {
        const key = statusEl.getAttribute("data-i18n");
        if (key) statusEl.textContent = t(key, statusEl.textContent);
      }
    }
    document.addEventListener("i18n:ready", onI18nReady);

    const pollId = setInterval(function () {
      refresh(true);
    }, POLL_MS);

    function onVisibility() {
      if (document.visibilityState === "visible") refresh(true);
    }
    function onPageShow() {
      refresh(true);
    }
    function onFocus() {
      refresh(true);
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);

    return function cleanup() {
      clearInterval(pollId);
      document.removeEventListener("i18n:ready", onI18nReady);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
    };
  }

  global.KorgBaskets = {
    mount: mount,
    fetchBaskets: fetchBaskets,
    siteRoot: siteRoot,
  };
})(window);
