/**
 * Dice roll evaluation.
 *
 * Math choice (documented): evaluate bracket results LEFT-TO-RIGHT with the
 * operators between brackets (+ - * /). No operator precedence beyond that —
 * clear and predictable for tabletop formulas which are usually sums.
 * Example: [2] * [3] + [4] => (2*3)+4 = 10.
 *
 * Disabled dice contribute nothing (excluded from math). Display uses "0 Dn".
 */

import { sanitizeFormula, formatFormula } from "./formula.js";

function rollDie(sides) {
  const s = Math.max(2, sides | 0);
  return 1 + Math.floor(Math.random() * s);
}

/**
 * @returns {{
 *   formulaText: string,
 *   total: number,
 *   brackets: Array<{
 *     id, label, op, sum: number,
 *     dice: Array<{ id, count, sides, enabled, values: number[], sum: number }>
 *   }>,
 *   allDice: Array<{ sides: number, value: number, bracketLabel: string }>,
 *   compare: null | { a: {label,sum}, b: {label,sum}, winner: string|null, tie: boolean },
 *   allMax: boolean,
 *   hasNat1: boolean,
 *   hasNatMax: boolean
 * }}
 */
export function rollFormula(formula) {
  const f = sanitizeFormula(formula);
  const bracketResults = [];
  const allDice = [];
  let allMax = true;
  let anyDie = false;
  let hasNat1 = false;
  let hasNatMax = false;

  for (let i = 0; i < f.brackets.length; i++) {
    const br = f.brackets[i];
    const diceResults = [];
    let sum = 0;

    for (let j = 0; j < br.dice.length; j++) {
      const die = br.dice[j];
      const sides = Math.max(2, die.sides | 0);
      const values = [];
      let dieSum = 0;

      if (die.enabled) {
        const count = Math.max(0, die.count | 0);
        for (let k = 0; k < count; k++) {
          const v = rollDie(sides);
          values.push(v);
          dieSum += v;
          allDice.push({
            sides: sides,
            value: v,
            bracketLabel: (br.label || "").trim(),
            bracketId: br.id,
            dieId: die.id,
          });
          anyDie = true;
          if (v === 1) hasNat1 = true;
          if (v === sides) hasNatMax = true;
          else allMax = false;
        }
        if (count === 0) {
          /* enabled but zero dice — no contribution */
        }
      }
      /* disabled: excluded from math; values stay empty */

      sum += dieSum;
      diceResults.push({
        id: die.id,
        count: die.count | 0,
        sides: sides,
        enabled: !!die.enabled,
        values: values,
        sum: dieSum,
      });
    }

    if (!anyDie) allMax = false;

    bracketResults.push({
      id: br.id,
      label: br.label || "",
      op: i === 0 ? "+" : br.op,
      sum: sum,
      dice: diceResults,
    });
  }

  if (!anyDie) allMax = false;

  /* Left-to-right evaluation of bracket sums with ops. */
  let total = 0;
  if (bracketResults.length) {
    total = bracketResults[0].sum;
    for (let i = 1; i < bracketResults.length; i++) {
      const op = bracketResults[i].op;
      const rhs = bracketResults[i].sum;
      if (op === "-") total -= rhs;
      else if (op === "*") total *= rhs;
      else if (op === "/") total = rhs === 0 ? total : total / rhs;
      else total += rhs;
    }
  }

  /* Named comparison when exactly two brackets have non-empty labels. */
  const labeled = bracketResults.filter(function (b) {
    return (b.label || "").trim().length > 0;
  });
  let compare = null;
  if (labeled.length === 2) {
    const a = { label: labeled[0].label.trim(), sum: labeled[0].sum };
    const b = { label: labeled[1].label.trim(), sum: labeled[1].sum };
    let winner = null;
    let tie = false;
    if (a.sum === b.sum) {
      tie = true;
    } else {
      winner = a.sum > b.sum ? a.label : b.label;
    }
    compare = { a: a, b: b, winner: winner, tie: tie };
  }

  return {
    formulaText: formatFormula(f),
    total: total,
    brackets: bracketResults,
    allDice: allDice,
    compare: compare,
    allMax: allMax && anyDie,
    hasNat1: hasNat1,
    hasNatMax: hasNatMax,
  };
}

/** Count how many physical dice would be spawned for 3D. */
export function countVisualDice(formula) {
  const f = sanitizeFormula(formula);
  let n = 0;
  f.brackets.forEach(function (br) {
    br.dice.forEach(function (die) {
      if (die.enabled) n += Math.max(0, die.count | 0);
    });
  });
  return n;
}

export const VISUAL_DICE_CAP = 12;
