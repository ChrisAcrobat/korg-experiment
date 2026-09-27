(function (global) {
  const HOOPS_CACHE_KEY = "korg-hoops-v2";
  const scriptEl = document.currentScript;
  const siteRoot = new URL("../", scriptEl.src).href;

  function t(key, fallback) {
    return global.KorgI18n ? global.KorgI18n.t(key, fallback) : fallback;
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(HOOPS_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeCache(hoops) {
    try {
      localStorage.setItem(HOOPS_CACHE_KEY, JSON.stringify(hoops));
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
    const res = await fetch(new URL("Korgs/hoops.json", siteRoot).href, { cache: "no-store" });
    if (!res.ok) throw new Error("hoops " + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("bad hoops.json");
    return data.map(String);
  }

  async function fetchHoops() {
    const folders = await listFolders();
    const hoops = await Promise.all(
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
    hoops.sort(function (a, b) {
      if (a.order !== b.order) return a.order - b.order;
      return a.title.localeCompare(b.title);
    });
    writeCache(hoops);
    return hoops;
  }

  function renderHoops(listEl, statusEl, hoops) {
    listEl.innerHTML = "";
    if (!hoops.length) {
      statusEl.hidden = false;
      statusEl.setAttribute("data-i18n", "hoops_empty");
      statusEl.textContent = t("hoops_empty", "No hoops yet. Add a folder under Korgs/.");
      listEl.hidden = true;
      return;
    }
    statusEl.hidden = true;
    listEl.hidden = false;
    const defaultIcon = t("default_hoop_icon", "🧺");
    const openLabel = t("hoop_open", "Open hoop");

    hoops.forEach(function (hoop) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "hoop";
      a.href = new URL("Korgs/" + encodeURIComponent(hoop.folder) + "/", siteRoot).href;
      a.setAttribute("aria-label", openLabel + ": " + hoop.title);

      const icon = document.createElement("span");
      icon.className = "hoop-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = hoop.icon || defaultIcon;

      const text = document.createElement("div");
      text.className = "hoop-text";
      const title = document.createElement("p");
      title.className = "hoop-title";
      title.textContent = hoop.title;
      text.appendChild(title);
      if (hoop.description) {
        const desc = document.createElement("p");
        desc.className = "hoop-desc";
        desc.textContent = hoop.description;
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
            icon: hoop.icon || defaultIcon,
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
      global.KorgAnimations.applyStagger(listEl.querySelectorAll(".hoop"));
    }
  }

  function fingerprint(hoops) {
    if (!Array.isArray(hoops)) return "";
    return JSON.stringify(
      hoops.map(function (h) {
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

    function applyHoops(hoops, isBackground) {
      const fp = fingerprint(hoops);
      if (fp === currentFp) return false;
      currentFp = fp;
      renderHoops(listEl, statusEl, hoops);
      return true;
    }

    async function refresh(isBackground) {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const hoops = await fetchHoops();
        applyHoops(hoops, isBackground);
      } catch (_) {
        if (!isBackground && !currentFp) {
          setStatus("hoops_error", "Could not load hoops right now. Try again later.");
        }
      } finally {
        refreshInFlight = false;
      }
    }

    const cached = readCache();
    if (cached && Array.isArray(cached) && cached.length) {
      applyHoops(cached, false);
    } else {
      setStatus("hoops_loading", "Loading hoops…");
    }

    await refresh(false);

    function onI18nReady() {
      if (!listEl.hidden && listEl.children.length) {
        const openLabel = t("hoop_open", "Open hoop");
        listEl.querySelectorAll(".hoop").forEach(function (a) {
          const title = a.querySelector(".hoop-title");
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

  global.KorgHoops = {
    mount: mount,
    fetchHoops: fetchHoops,
    siteRoot: siteRoot,
  };
})(window);
