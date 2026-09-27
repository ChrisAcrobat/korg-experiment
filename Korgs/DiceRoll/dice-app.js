/**
 * Dice Roll hoop — UI, formula builder, roll orchestration, extras.
 */
import {
  createBracket,
  createDie,
  createDefaultFormula,
  sanitizeFormula,
  formatFormula,
  formatDie,
  templates,
  loadFormula,
  saveFormula,
  loadSettings,
  saveSettings,
  loadHistory,
  pushHistory,
  clearHistory,
  writeHash,
  readHash,
} from "./formula.js";
import { rollFormula, countVisualDice, VISUAL_DICE_CAP } from "./roll.js";
import { createDiceStage } from "./dice-3d.js";

function t(key, fallback) {
  return window.KorgI18n ? window.KorgI18n.t(key, fallback) : fallback;
}

function $(id) {
  return document.getElementById(id);
}

/* --- lightweight Web Audio beeps (default off) --- */
let audioCtx = null;
function beep(kind) {
  try {
    if (!settings.sound) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (kind === "crit") {
      o.frequency.setValueAtTime(660, now);
      o.frequency.exponentialRampToValueAtTime(1320, now + 0.18);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      o.start(now);
      o.stop(now + 0.36);
    } else if (kind === "roll") {
      o.type = "triangle";
      o.frequency.setValueAtTime(180, now);
      o.frequency.exponentialRampToValueAtTime(90, now + 0.12);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      o.start(now);
      o.stop(now + 0.16);
    } else {
      o.frequency.value = 320;
      g.gain.setValueAtTime(0.06, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      o.start(now);
      o.stop(now + 0.09);
    }
  } catch (_) {}
}

function burstConfetti() {
  const root = $("confetti");
  if (!root) return;
  root.innerHTML = "";
  const colors = ["#a78bfa", "#34d399", "#fbbf24", "#f87171", "#60a5fa", "#f472b6"];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const el = document.createElement("span");
    el.className = "confetti-piece";
    el.style.left = Math.random() * 100 + "%";
    el.style.background = colors[i % colors.length];
    el.style.animationDelay = Math.random() * 0.35 + "s";
    el.style.transform = "rotate(" + Math.random() * 360 + "deg)";
    root.appendChild(el);
  }
  setTimeout(function () {
    root.innerHTML = "";
  }, 2200);
}

let formula = createDefaultFormula();
let settings = loadSettings();
let stage = null;
let rolling = false;

function persist() {
  formula = sanitizeFormula(formula);
  saveFormula(formula);
  writeHash(formula);
}

function applyDiceColor() {
  document.documentElement.style.setProperty("--dice-color", settings.diceColor);
  if (stage) stage.setColor(settings.diceColor);
}

function renderFormulaPreview() {
  const el = $("formula-preview");
  if (el) el.textContent = formatFormula(formula);
}

function renderBrackets() {
  const root = $("brackets");
  if (!root) return;
  root.innerHTML = "";
  formula.brackets.forEach(function (br, bi) {
    const card = document.createElement("div");
    card.className = "bracket";
    card.dataset.id = br.id;

    const head = document.createElement("div");
    head.className = "bracket-head";

    if (bi > 0) {
      const opLab = document.createElement("label");
      const opSpan = document.createElement("span");
      opSpan.setAttribute("data-i18n", "dice_op");
      opSpan.textContent = t("dice_op", "Op");
      const opSel = document.createElement("select");
      ["+", "-", "*", "/"].forEach(function (op) {
        const o = document.createElement("option");
        o.value = op;
        o.textContent = op;
        if (br.op === op) o.selected = true;
        opSel.appendChild(o);
      });
      opSel.addEventListener("change", function () {
        br.op = opSel.value;
        persist();
        renderFormulaPreview();
      });
      opLab.appendChild(opSpan);
      opLab.appendChild(opSel);
      head.appendChild(opLab);
    }

    const nameLab = document.createElement("label");
    const nameSpan = document.createElement("span");
    nameSpan.setAttribute("data-i18n", "dice_bracket_label");
    nameSpan.textContent = t("dice_bracket_label", "Label");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = br.label || "";
    nameInput.placeholder = t("dice_bracket_label_ph", "Optional name");
    nameInput.addEventListener("input", function () {
      br.label = nameInput.value;
      persist();
      renderFormulaPreview();
    });
    nameLab.appendChild(nameSpan);
    nameLab.appendChild(nameInput);
    head.appendChild(nameLab);

    const addDieBtn = document.createElement("button");
    addDieBtn.type = "button";
    addDieBtn.className = "btn";
    addDieBtn.setAttribute("data-i18n", "dice_add_die");
    addDieBtn.textContent = t("dice_add_die", "Add die");
    addDieBtn.addEventListener("click", function () {
      br.dice.push(createDie({ count: 1, sides: 6, enabled: true }));
      persist();
      renderBrackets();
      renderFormulaPreview();
    });
    head.appendChild(addDieBtn);

    const removeBr = document.createElement("button");
    removeBr.type = "button";
    removeBr.className = "btn btn-danger";
    removeBr.setAttribute("data-i18n", "dice_remove_bracket");
    removeBr.textContent = t("dice_remove_bracket", "Remove");
    removeBr.disabled = formula.brackets.length <= 1;
    removeBr.addEventListener("click", function () {
      if (formula.brackets.length <= 1) return;
      formula.brackets = formula.brackets.filter(function (b) {
        return b.id !== br.id;
      });
      persist();
      renderBrackets();
      renderFormulaPreview();
    });
    head.appendChild(removeBr);

    card.appendChild(head);

    const diceList = document.createElement("div");
    diceList.className = "dice-list";
    br.dice.forEach(function (die) {
      const row = document.createElement("div");
      row.className = "die-row" + (die.enabled ? "" : " disabled");

      const en = document.createElement("input");
      en.type = "checkbox";
      en.checked = !!die.enabled;
      en.title = t("dice_enable", "Enabled");
      en.addEventListener("change", function () {
        die.enabled = en.checked;
        persist();
        renderBrackets();
        renderFormulaPreview();
      });
      row.appendChild(en);

      const label = document.createElement("span");
      label.className = "die-label";
      label.textContent = formatDie(die);
      row.appendChild(label);

      const count = document.createElement("input");
      count.type = "number";
      count.min = "0";
      count.max = "99";
      count.value = String(die.count);
      count.setAttribute("aria-label", t("dice_count", "Count"));
      count.addEventListener("change", function () {
        die.count = Math.max(0, Math.min(99, parseInt(count.value, 10) || 0));
        persist();
        renderBrackets();
        renderFormulaPreview();
      });
      row.appendChild(count);

      const dLabel = document.createElement("span");
      dLabel.textContent = "D";
      dLabel.style.fontWeight = "700";
      row.appendChild(dLabel);

      const sides = document.createElement("input");
      sides.type = "number";
      sides.min = "2";
      sides.max = "1000";
      sides.value = String(die.sides);
      sides.setAttribute("aria-label", t("dice_sides", "Sides"));
      sides.addEventListener("change", function () {
        die.sides = Math.max(2, Math.min(1000, parseInt(sides.value, 10) || 2));
        persist();
        renderBrackets();
        renderFormulaPreview();
      });
      row.appendChild(sides);

      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn btn-danger";
      rm.textContent = "×";
      rm.title = t("dice_remove_die", "Remove die");
      rm.disabled = br.dice.length <= 1;
      rm.addEventListener("click", function () {
        if (br.dice.length <= 1) return;
        br.dice = br.dice.filter(function (d) {
          return d.id !== die.id;
        });
        persist();
        renderBrackets();
        renderFormulaPreview();
      });
      row.appendChild(rm);

      diceList.appendChild(row);
    });
    card.appendChild(diceList);
    root.appendChild(card);
  });

  /* Re-apply i18n on dynamic nodes when ready */
  if (window.KorgI18n) {
    document.querySelectorAll("#brackets [data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      const val = window.KorgI18n.t(key, el.textContent);
      el.textContent = val;
    });
  }
}

function renderHistory() {
  const list = $("history-list");
  if (!list) return;
  const items = loadHistory();
  list.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.innerHTML =
      '<span class="h-formula">' +
      escapeHtml(t("dice_history_empty", "No rolls yet.")) +
      "</span>";
    list.appendChild(li);
    return;
  }
  items.forEach(function (item) {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.className = "h-formula";
    left.textContent = item.formulaText || "";
    const right = document.createElement("span");
    right.className = "h-total";
    let text = String(item.total);
    if (item.compare) {
      if (item.compare.tie) text += " · " + t("dice_compare_tie", "Tie");
      else if (item.compare.winner)
        text += " · " + item.compare.winner + " " + t("dice_wins", "wins");
    }
    right.textContent = text;
    li.appendChild(left);
    li.appendChild(right);
    list.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function showResults(result) {
  const totalEl = $("total");
  const compareEl = $("compare");
  const chips = $("die-results");
  const bracketEl = $("bracket-results");

  if (totalEl) {
    const display =
      typeof result.total === "number" && !Number.isInteger(result.total)
        ? Math.round(result.total * 1000) / 1000
        : result.total;
    totalEl.textContent = String(display);
  }

  if (compareEl) {
    if (result.compare) {
      compareEl.hidden = false;
      if (result.compare.tie) {
        compareEl.textContent =
          result.compare.a.label +
          " " +
          result.compare.a.sum +
          " = " +
          result.compare.b.label +
          " " +
          result.compare.b.sum +
          " — " +
          t("dice_compare_tie", "Tie");
      } else {
        compareEl.textContent =
          result.compare.a.label +
          " " +
          result.compare.a.sum +
          " vs " +
          result.compare.b.label +
          " " +
          result.compare.b.sum +
          " — " +
          result.compare.winner +
          " " +
          t("dice_wins", "wins");
      }
    } else {
      compareEl.hidden = true;
      compareEl.textContent = "";
    }
  }

  if (chips) {
    chips.innerHTML = "";
    result.allDice.forEach(function (d) {
      const chip = document.createElement("span");
      chip.className = "die-chip";
      if (d.value === 1) chip.classList.add("nat1");
      if (d.value === d.sides) chip.classList.add("natmax");
      chip.textContent = d.value;
      chip.title = "D" + d.sides + (d.bracketLabel ? " · " + d.bracketLabel : "");
      chips.appendChild(chip);
    });
    if (!result.allDice.length) {
      const empty = document.createElement("span");
      empty.className = "bracket-result";
      empty.textContent = t("dice_no_dice", "No enabled dice to roll.");
      chips.appendChild(empty);
    }
  }

  if (bracketEl) {
    bracketEl.innerHTML = "";
    result.brackets.forEach(function (br, i) {
      const line = document.createElement("div");
      line.className = "bracket-result";
      const name = (br.label || "").trim() || t("dice_bracket_n", "Bracket") + " " + (i + 1);
      line.textContent = name + ": " + br.sum;
      bracketEl.appendChild(line);
    });
  }

  if (result.allMax && result.allDice.length) {
    burstConfetti();
    beep("crit");
  }
}

async function doRoll() {
  if (rolling) return;
  rolling = true;
  const rollBtn = $("roll-btn");
  if (rollBtn) rollBtn.disabled = true;

  if (window.KorgInteraction && window.KorgInteraction.setBusy) {
    window.KorgInteraction.setBusy(true);
  }

  beep("roll");
  const result = rollFormula(formula);

  const stageEl = $("stage");
  const use3d = settings.use3d && stage;

  try {
    if (use3d && result.allDice.length) {
      if (stageEl) stageEl.classList.remove("is-hidden");
      const specs = result.allDice.slice(0, VISUAL_DICE_CAP).map(function (d) {
        return { sides: d.sides, value: d.value };
      });
      await stage.roll(specs, settings.diceColor);
    } else if (stageEl && !settings.use3d) {
      stageEl.classList.add("is-hidden");
    }

    showResults(result);
    pushHistory({
      total: result.total,
      formulaText: result.formulaText,
      compare: result.compare
        ? {
            winner: result.compare.winner,
            tie: result.compare.tie,
          }
        : null,
    });
    renderHistory();
  } finally {
    rolling = false;
    if (rollBtn) rollBtn.disabled = false;
    if (window.KorgInteraction && window.KorgInteraction.setBusy) {
      window.KorgInteraction.setBusy(false);
    }
  }
}

function bindControls(signal) {
  const opts = signal ? { signal: signal } : undefined;
  $("add-bracket")?.addEventListener("click", function () {
    formula.brackets.push(
      createBracket({
        label: "",
        op: "+",
        dice: [{ count: 1, sides: 6, enabled: true }],
      })
    );
    persist();
    renderBrackets();
    renderFormulaPreview();
  }, opts);

  $("roll-btn")?.addEventListener("click", function () {
    doRoll();
  }, opts);

  $("tpl-dnd")?.addEventListener("click", function () {
    formula = templates().dnd_attack;
    persist();
    renderBrackets();
    renderFormulaPreview();
  }, opts);

  $("tpl-dnd-dmg")?.addEventListener("click", function () {
    formula = templates().dnd_damage;
    persist();
    renderBrackets();
    renderFormulaPreview();
  }, opts);

  $("tpl-dh")?.addEventListener("click", function () {
    formula = templates().daggerheart;
    persist();
    renderBrackets();
    renderFormulaPreview();
  }, opts);

  $("tpl-2d6")?.addEventListener("click", function () {
    formula = templates().simple_2d6;
    persist();
    renderBrackets();
    renderFormulaPreview();
  }, opts);

  $("toggle-3d")?.addEventListener("change", function (e) {
    settings.use3d = !!e.target.checked;
    saveSettings(settings);
    const stageEl = $("stage");
    if (stageEl) {
      if (settings.use3d) stageEl.classList.remove("is-hidden");
      else stageEl.classList.add("is-hidden");
    }
    if (settings.use3d && stage) stage.resize();
  }, opts);

  $("toggle-sound")?.addEventListener("change", function (e) {
    settings.sound = !!e.target.checked;
    saveSettings(settings);
    if (settings.sound) beep("ui");
  }, opts);

  $("dice-color")?.addEventListener("input", function (e) {
    settings.diceColor = e.target.value;
    saveSettings(settings);
    applyDiceColor();
  }, opts);

  $("share-btn")?.addEventListener("click", async function () {
    writeHash(formula);
    const url = location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        flashShare(t("dice_share_copied", "Link copied"));
      } else {
        flashShare(url);
      }
    } catch (_) {
      flashShare(url);
    }
  }, opts);

  $("clear-history")?.addEventListener("click", function () {
    clearHistory();
    renderHistory();
  }, opts);

  window.addEventListener("keydown", function (e) {
    if (e.code !== "Space" && e.key !== " ") return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable)
      return;
    e.preventDefault();
    doRoll();
  }, opts);

  const back = $("back");
  if (back) {
    back.addEventListener(
      "click",
      function (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (window.KorgInteraction) window.KorgInteraction.setBusy(false);
        if (window.KorgNav) window.KorgNav.navigate(back.href);
        else window.location.href = back.href;
      },
      opts
    );
  }
}

function flashShare(msg) {
  const el = $("share-status");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  setTimeout(function () {
    el.hidden = true;
  }, 2200);
}

function syncSettingsUI() {
  const t3d = $("toggle-3d");
  const ts = $("toggle-sound");
  const color = $("dice-color");
  if (t3d) t3d.checked = !!settings.use3d;
  if (ts) ts.checked = !!settings.sound;
  if (color) color.value = settings.diceColor || "#a78bfa";
  const stageEl = $("stage");
  if (stageEl) {
    if (settings.use3d) stageEl.classList.remove("is-hidden");
    else stageEl.classList.add("is-hidden");
  }
  applyDiceColor();
}

let activeCleanup = null;

export function mount() {
  if (activeCleanup) {
    try { activeCleanup(); } catch (_) {}
    activeCleanup = null;
  }

  const ac = new AbortController();
  const signal = ac.signal;

  const fromHash = readHash();
  formula = fromHash || loadFormula() || createDefaultFormula();
  settings = loadSettings();
  persist();

  const canvas = $("dice-canvas");
  if (canvas) {
    try {
      stage = createDiceStage(canvas);
      stage.setColor(settings.diceColor);
    } catch (err) {
      console.warn("3D stage unavailable", err);
      stage = null;
      settings.use3d = false;
    }
  }

  syncSettingsUI();
  renderBrackets();
  renderFormulaPreview();
  renderHistory();
  bindControls(signal);

  function onI18n() {
    renderBrackets();
    renderHistory();
  }
  document.addEventListener("i18n:ready", onI18n, { signal: signal });

  window.DiceRollApp = {
    getFormula: function () {
      return formula;
    },
    roll: doRoll,
    countVisualDice: function () {
      return countVisualDice(formula);
    },
  };

  function cleanup() {
    ac.abort();
    if (stage && typeof stage.destroy === "function") {
      try { stage.destroy(); } catch (_) {}
    }
    stage = null;
    rolling = false;
    if (window.KorgInteraction && window.KorgInteraction.setBusy) {
      window.KorgInteraction.setBusy(false);
    }
  }
  activeCleanup = cleanup;
  return cleanup;
}
