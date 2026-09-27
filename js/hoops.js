(function (global) {
  const REPO = "ChrisAcrobat/korg-experiment";
  const BRANCH = "main";
  const HOOPS_CACHE_KEY = "korg-hoops-v1";
  const scriptEl = document.currentScript;
  const siteRoot = new URL("../", scriptEl.src).href;
  const CONTENTS =
    "https://api.github.com/repos/" +
    REPO +
    "/contents/Korgs?ref=" +
    encodeURIComponent(BRANCH);

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

  async function fetchJson(url) {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function loadMetaApi(folder) {
    const url =
      "https://api.github.com/repos/" +
      REPO +
      "/contents/Korgs/" +
      encodeURIComponent(folder) +
      "/meta.json?ref=" +
      encodeURIComponent(BRANCH);
    try {
      const data = await fetchJson(url);
      if (data && data.content && data.encoding === "base64") {
        return JSON.parse(atob(data.content.replace(/\n/g, "")));
      }
      if (data && data.download_url) {
        const res = await fetch(data.download_url, { cache: "no-store" });
        if (!res.ok) throw new Error("meta " + res.status);
        return res.json();
      }
    } catch (_) {}
    return null;
  }

  async function loadMetaRelative(folder) {
    try {
      const url = new URL("Korgs/" + encodeURIComponent(folder) + "/meta.json", siteRoot).href;
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) return null;
      return res.json();
    } catch (_) {
      return null;
    }
  }

  async function listFolders() {
    try {
      const entries = await fetchJson(CONTENTS);
      if (!Array.isArray(entries)) throw new Error("bad listing");
      return entries
        .filter(function (e) {
          return e && e.type === "dir" && e.name && e.name.indexOf(".") !== 0;
        })
        .map(function (e) {
          return e.name;
        });
    } catch (_) {
      const res = await fetch(new URL("Korgs/hoops.json", siteRoot).href, { cache: "no-cache" });
      if (!res.ok) throw new Error("hoops fallback " + res.status);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("bad hoops.json");
      return data.map(String);
    }
  }

  async function fetchHoops() {
    const folders = await listFolders();
    const hoops = await Promise.all(
      folders.map(async function (name) {
        let meta = await loadMetaApi(name);
        if (!meta) meta = await loadMetaRelative(name);
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
        if (global.KorgAnimations) {
          global.KorgAnimations.scaleUpNavigate({
            href: a.href,
            icon: hoop.icon || defaultIcon,
            fromEl: icon,
          });
        } else {
          window.location.href = a.href;
        }
      });

      li.appendChild(a);
      listEl.appendChild(li);
    });

    if (global.KorgAnimations) {
      global.KorgAnimations.applyStagger(listEl.querySelectorAll(".hoop"));
    }
  }

  async function mount(listEl, statusEl) {
    if (!listEl || !statusEl) return;

    function setStatus(key, fallback) {
      statusEl.hidden = false;
      statusEl.setAttribute("data-i18n", key);
      statusEl.textContent = t(key, fallback);
      listEl.hidden = true;
      listEl.innerHTML = "";
    }

    const cached = readCache();
    if (cached && Array.isArray(cached)) {
      renderHoops(listEl, statusEl, cached);
    } else {
      setStatus("hoops_loading", "Loading hoops…");
    }

    try {
      const hoops = await fetchHoops();
      renderHoops(listEl, statusEl, hoops);
    } catch (_) {
      if (!(cached && cached.length)) {
        setStatus("hoops_error", "Could not load hoops right now. Try again later.");
      }
    }

    document.addEventListener("i18n:ready", function () {
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
    });
  }

  global.KorgHoops = {
    mount: mount,
    fetchHoops: fetchHoops,
    siteRoot: siteRoot,
  };
})(window);
