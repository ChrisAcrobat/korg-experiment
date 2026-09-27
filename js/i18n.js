/**
 * Load UI strings from language-strings/<lang>.json (site root).
 * English fallback. Order: ?lang= → localStorage → navigator → en
 * Caches strings in localStorage and refreshes in the background.
 */
(function (global) {
  const STORAGE_KEY = "korg-lang";
  const CACHE_PREFIX = "korg-i18n-v1:";
  const SUPPORTED = ["en", "sv"];
  const scriptEl = document.currentScript;
  const siteRoot = new URL("../", scriptEl.src).href;
  const stringsBase = new URL("language-strings/", siteRoot);

  const memory = Object.create(null);
  let current = "en";
  let strings = Object.create(null);

  function normalize(raw) {
    if (!raw) return null;
    const code = String(raw).toLowerCase().split("-")[0];
    return SUPPORTED.includes(code) ? code : null;
  }

  function detectLanguage() {
    try {
      const params = new URLSearchParams(location.search);
      const fromQuery = normalize(params.get("lang"));
      if (fromQuery) return fromQuery;
    } catch (_) {}
    try {
      const saved = normalize(localStorage.getItem(STORAGE_KEY));
      if (saved) return saved;
    } catch (_) {}
    const fromNav = normalize(
      navigator.language || (navigator.languages && navigator.languages[0])
    );
    return fromNav || "en";
  }

  function readCache(lang) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + lang);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function writeCache(lang, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(data));
    } catch (_) {}
  }

  async function fetchJson(lang) {
    if (memory[lang]) return memory[lang];
    const url = new URL(lang + ".json", stringsBase).href;
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("i18n " + res.status + " " + url);
    const data = await res.json();
    memory[lang] = data;
    writeCache(lang, data);
    return data;
  }

  async function loadStrings(lang) {
    const cachedEn = readCache("en");
    const cachedLang = lang === "en" ? cachedEn : readCache(lang);

    let en = cachedEn;
    try {
      en = await fetchJson("en");
    } catch (_) {
      if (!en) throw new Error("missing english strings");
    }

    if (lang === "en") return Object.assign({}, en);

    let local = cachedLang;
    try {
      local = await fetchJson(lang);
    } catch (_) {
      /* keep cache or fall back */
    }
    return Object.assign({}, en, local || {});
  }

  function apply(dict) {
    strings = dict;
    document.documentElement.lang = current;

    const titleKey = document.body && document.body.getAttribute("data-i18n-title");
    if (titleKey && dict[titleKey]) document.title = dict[titleKey];

    const metaKey = document.body && document.body.getAttribute("data-i18n-meta");
    if (metaKey && dict[metaKey]) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "description");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", dict[metaKey]);
    }

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      const value = dict[key];
      if (value == null) return;
      const attr = el.getAttribute("data-i18n-attr");
      if (attr) el.setAttribute(attr, value);
      else el.textContent = value;
    });

    document.querySelectorAll("[data-i18n-title-attr]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-title-attr");
      if (dict[key] != null) el.setAttribute("title", dict[key]);
    });

    const langGroup = document.querySelector(".lang-switch");
    if (langGroup && dict.lang_group) {
      langGroup.setAttribute("aria-label", dict.lang_group);
    }

    document.querySelectorAll(".lang-switch button[data-lang]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lang") === current));
    });

    document.dispatchEvent(
      new CustomEvent("i18n:ready", { detail: { lang: current, strings: dict } })
    );
  }

  async function setLanguage(lang) {
    const next = normalize(lang) || "en";
    current = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_) {}

    const cached = readCache(next) || (next !== "en" ? readCache("en") : null);
    if (cached) {
      const enCached = readCache("en") || {};
      apply(Object.assign({}, enCached, cached));
    }

    const dict = await loadStrings(next);
    apply(dict);
    return dict;
  }

  function t(key, fallback) {
    if (strings[key] != null) return strings[key];
    return fallback != null ? fallback : key;
  }

  const ready = setLanguage(detectLanguage()).catch(function () {
    return setLanguage("en");
  });

  document.querySelectorAll(".lang-switch button[data-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setLanguage(btn.getAttribute("data-lang"));
    });
  });

  global.KorgI18n = {
    setLanguage: setLanguage,
    getLanguage: function () {
      return current;
    },
    getStrings: function () {
      return strings;
    },
    t: t,
    ready: ready,
    supported: SUPPORTED.slice(),
    siteRoot: siteRoot,
  };
})(window);
