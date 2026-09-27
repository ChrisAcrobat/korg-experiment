/**
 * Formula model, templates, localStorage, and shareable URL hash.
 * Formula shape:
 * {
 *   brackets: [{
 *     id, label, op ('+'|'-'|'*'|'/' — operator before this bracket; ignored for index 0),
 *     dice: [{ count, sides (>=2), enabled }]
 *   }]
 * }
 */

const STORAGE_KEY = "korg-diceroll-formula-v1";
const SETTINGS_KEY = "korg-diceroll-settings-v1";
const HISTORY_KEY = "korg-diceroll-history-v1";
const HISTORY_MAX = 30;

let _uid = 0;
function uid(prefix) {
  _uid += 1;
  return (prefix || "id") + "-" + Date.now().toString(36) + "-" + _uid;
}

export function createDie(partial) {
  const d = partial || {};
  return {
    id: d.id || uid("die"),
    count: clampInt(d.count, 0, 99, 1),
    sides: clampInt(d.sides, 2, 1000, 6),
    enabled: d.enabled !== false,
  };
}

export function createBracket(partial) {
  const b = partial || {};
  return {
    id: b.id || uid("br"),
    label: typeof b.label === "string" ? b.label : "",
    op: normalizeOp(b.op),
    dice: Array.isArray(b.dice) && b.dice.length
      ? b.dice.map(createDie)
      : [createDie({ count: 1, sides: 6, enabled: true })],
  };
}

export function createDefaultFormula() {
  return {
    brackets: [
      createBracket({ label: "", op: "+", dice: [{ count: 1, sides: 20, enabled: true }] }),
    ],
  };
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeOp(op) {
  return op === "-" || op === "*" || op === "/" ? op : "+";
}

export function sanitizeFormula(raw) {
  if (!raw || typeof raw !== "object") return createDefaultFormula();
  const brackets = Array.isArray(raw.brackets) ? raw.brackets.map(createBracket) : [];
  if (!brackets.length) return createDefaultFormula();
  brackets[0].op = "+";
  return { brackets };
}

/** Disabled dice show as "0 Dn" but are excluded from math. */
export function formatDie(die) {
  const sides = Math.max(2, die.sides | 0);
  if (!die.enabled) return "0 D" + sides;
  return (die.count | 0) + "D" + sides;
}

export function formatBracket(bracket) {
  const parts = (bracket.dice || []).map(formatDie);
  const body = parts.length ? parts.join(" + ") : "0";
  const label = (bracket.label || "").trim();
  if (label) return label + " [" + body + "]";
  return "[" + body + "]";
}

export function formatFormula(formula) {
  const f = sanitizeFormula(formula);
  return f.brackets
    .map(function (b, i) {
      const body = formatBracket(b);
      if (i === 0) return body;
      return " " + b.op + " " + body;
    })
    .join("");
}

export function templates() {
  return {
    dnd_attack: sanitizeFormula({
      brackets: [
        {
          label: "Attack",
          op: "+",
          dice: [{ count: 1, sides: 20, enabled: true }],
        },
        {
          label: "Ability",
          op: "+",
          dice: [{ count: 0, sides: 6, enabled: false }],
        },
        {
          label: "Proficiency",
          op: "+",
          dice: [{ count: 0, sides: 6, enabled: false }],
        },
      ],
    }),
    dnd_damage: sanitizeFormula({
      brackets: [
        {
          label: "Weapon",
          op: "+",
          dice: [{ count: 1, sides: 8, enabled: true }],
        },
        {
          label: "Modifier",
          op: "+",
          dice: [{ count: 0, sides: 6, enabled: false }],
        },
      ],
    }),
    daggerheart: sanitizeFormula({
      brackets: [
        {
          label: "Hope",
          op: "+",
          dice: [{ count: 2, sides: 12, enabled: true }],
        },
        {
          label: "Fear",
          op: "+",
          dice: [{ count: 2, sides: 12, enabled: true }],
        },
      ],
    }),
    simple_2d6: sanitizeFormula({
      brackets: [
        {
          label: "",
          op: "+",
          dice: [{ count: 2, sides: 6, enabled: true }],
        },
      ],
    }),
  };
}

export function loadFormula() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultFormula();
    return sanitizeFormula(JSON.parse(raw));
  } catch (_) {
    return createDefaultFormula();
  }
}

export function saveFormula(formula) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeFormula(formula)));
  } catch (_) {}
}

export function loadSettings() {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const defaults = {
    use3d: !reduce,
    sound: false,
    diceColor: "#a78bfa",
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      use3d: typeof parsed.use3d === "boolean" ? parsed.use3d : defaults.use3d,
      sound: !!parsed.sound,
      diceColor: typeof parsed.diceColor === "string" ? parsed.diceColor : defaults.diceColor,
    };
  } catch (_) {
    return defaults;
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (_) {}
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, HISTORY_MAX) : [];
  } catch (_) {
    return [];
  }
}

export function pushHistory(entry) {
  const list = loadHistory();
  list.unshift({
    at: entry.at || Date.now(),
    total: entry.total,
    formulaText: entry.formulaText || "",
    compare: entry.compare || null,
  });
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch (_) {}
  return list.slice(0, HISTORY_MAX);
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (_) {}
}

/** Encode formula into location.hash (#f=base64url). */
export function writeHash(formula) {
  try {
    const json = JSON.stringify(sanitizeFormula(formula));
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const next = "#f=" + b64;
    if (location.hash !== next) {
      history.replaceState(null, "", next);
    }
  } catch (_) {}
}

export function readHash() {
  try {
    const h = location.hash || "";
    const m = h.match(/[#&]f=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(escape(atob(b64)));
    return sanitizeFormula(JSON.parse(json));
  } catch (_) {
    return null;
  }
}

export { STORAGE_KEY, SETTINGS_KEY, HISTORY_KEY };
