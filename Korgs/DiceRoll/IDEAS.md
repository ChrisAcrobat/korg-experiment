# Dice Roll — ideas

## Shipped in this version

- Formula builder with brackets joined by `+ − * /` (left-to-right evaluation)
- Optional bracket labels; Hope vs Fear style comparison when exactly two brackets are named
- Per-die count / sides (≥2) / enable toggle (disabled dice show as `0 Dn`, excluded from math)
- Templates: D&D attack, D&D damage, Daggerheart (Hope/Fear), simple 2D6
- Persist formula to `localStorage` (`korg-diceroll-formula-v1`)
- Shareable formula URL via hash (`#f=…`)
- 3D mode: Three.js + cannon-es (CDN ES modules); visual dice capped at 12; math still rolls all
- `prefers-reduced-motion` defaults 3D off
- 2D/text results with nat-1 / max-face highlighting and large total
- `KorgInteraction.setBusy(true)` while 3D settles
- Roll history (`korg-diceroll-history-v1`)
- Sound toggle (Web Audio beeps; default off)
- Dice color picker (persisted)
- Confetti celebration when every rolled die shows its maximum face
- Spacebar to roll
- EN + SV i18n strings (`dice_*`)

## Math note

Bracket results are combined **left-to-right** with the operators between brackets. There is no `*`/`/` precedence over `+`/`-`. Example: `[2] * [3] + [4]` → `(2×3)+4 = 10`.

## Future ideas

- Flat numeric modifiers (non-dice) inside brackets
- Advantage / disadvantage (2d20 keep high/low) and Daggerheart duality die as first-class ops
- Exploding dice, keep-highest / drop-lowest
- True polyhedral meshes (d4/d8/d10/d12/d20) with face reading from physics
- Custom dice sets / saved formula library beyond a single slot
- Multiplayer / shared table session
- Richer sound pack (felt tray thuds, critical sting)
- Export roll log as CSV
- Critical hit ruleset hooks (D&D 5e double-dice on nat 20)
