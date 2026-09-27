/**
 * Load UI strings from language-strings/<lang>.json.
 * English is always the fallback. Language order:
 * ?lang= → localStorage → navigator.language → en
 */
(function (global) {
  const STORAGE_KEY = "korg-lang";
  const SUPPORTED = ["en", "sv"];
  const scriptEl = document.currentScript;
  const stringsBase = new URL("language-strings/", scriptEl.src);

  const cache = Object.create(null);
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
    } catch (_) { /* ignore */ }

    try {
      const saved = normalize(localStorage.getItem(STORAGE_KEY));
      if (saved) return saved;
    } catch (_) { /* ignore */ }

    const fromNav = normalize(navigator.language || (navigator.languages && navigator.languages[0]));
    return fromNav || "en";
  }

  async function fetchJson(lang) {
    if (cache[lang]) return cache[lang];
    const url = new URL(lang + ".json", stringsBase).href;
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("i18n " + res.status + " " + url);
    const data = await res.json();
    cache[lang] = data;
    return data;
  }

  async function loadStrings(lang) {
    const en = await fetchJson("en");
    if (lang === "en") return Object.assign({}, en);
    try {
      const local = await fetchJson(lang);
      return Object.assign({}, en, local);
    } catch (_) {
      return Object.assign({}, en);
    }
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

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const value = dict[key];
      if (value == null) return;
      const attr = el.getAttribute("data-i18n-attr");
      if (attr) el.setAttribute(attr, value);
      else el.textContent = value;
    });

    document.querySelectorAll("[data-i18n-title-attr]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title-attr");
      if (dict[key] != null) el.setAttribute("title", dict[key]);
    });

    const langGroup = document.querySelector(".lang-switch");
    if (langGroup && dict.lang_group) {
      langGroup.setAttribute("aria-label", dict.lang_group);
    }

    document.querySelectorAll(".lang-switch button[data-lang]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lang") === current));
    });

    document.dispatchEvent(new CustomEvent("i18n:ready", { detail: { lang: current, strings: dict } }));
  }

  async function setLanguage(lang) {
    const next = normalize(lang) || "en";
    current = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_) { /* ignore */ }
    const dict = await loadStrings(next);
    apply(dict);
    return dict;
  }

  function t(key, fallback) {
    if (strings[key] != null) return strings[key];
    return fallback != null ? fallback : key;
  }

  function getLanguage() {
    return current;
  }

  function getStrings() {
    return strings;
  }

  const ready = setLanguage(detectLanguage()).catch(() => setLanguage("en"));

  document.querySelectorAll(".lang-switch button[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLanguage(btn.getAttribute("data-lang"));
    });
  });

  global.KorgI18n = {
    setLanguage,
    getLanguage,
    getStrings,
    t,
    ready,
    supported: SUPPORTED.slice(),
  };
})(window);
