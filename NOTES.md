# NOTES (for the agent, not for humans)

## Status
ACTIVE

## Project
THEIR EYES — turn-based stealth puzzle where the player can only see what the
guards' vision cones illuminate (plus a 1-tile "touch" radius and permanent
memory of everything ever lit). Vanilla JS, no deps. `src/logic.js` is pure
deterministic rules (UMD: `window.TheirEyes` / `module.exports`); `src/main.js`
is canvas rendering + input; `src/levels.js` holds 4 hand-made levels. A BFS
solver in logic.js proves levels solvable and the test suite replays solutions
through the real rules.

## How to run / test
```
node --test                 # 11 tests incl. level solvability + replay
open index.html             # play (no build step)
python3 -m http.server -d . 8000   # fallback if file:// is blocked
```

## State
- Works: cones (±45°, range 4, wall-blocked), guard routes with pause-tiles
  that telegraph the next step, turn resolution (move → cone-check → guards
  step → cone-check → win-check), reveal memory, undo, 4 solvable levels,
  canvas renderer with beam pulse, caught/won/done overlays.
- Half-done: nothing.
- Untested in a real browser (renderer smoke-tested with a stubbed DOM in
  node; logic fully tested).

## Next (ranked)
1. Playtest feel: is level 1 learnable without instructions? Add a 3-step
   in-game tutorial overlay on level 1 if not.
2. Sound-detection guard type: hears moves within N tiles, turns to face the
   noise (adds "noise as anti-stealth" without new vision code).
3. More levels (5–8): rooms with two-gap walls, guards with crossing routes,
   a level where the exit only becomes visible once lit.
4. Beam rendering upgrade: draw the wedge as a smooth polygon fan (raycast
   edges) instead of per-tile squares, if it still reads at 36px.
5. Mobile: on-screen d-pad + swipe, since the game is turn-based it fits
   phones well.
6. A "ghost" of your best run (fewest turns) shown as a faint afterimage.

## Dead ends
- Vertical guard patrols in rooms narrower than ~9 tiles: the ±45°/range-4
  wedge sweeps the whole room and the player is unconditionally caught in the
  first sweep. Levels 2 and 3 failed this way; fixed by horizontal sweepers
  and putting crossings at patrol ends where the beam faces away.
- A guard patrolling the same row as the player's only corridor (old level 1):
  player and guard have equal speed, so the player can never overtake the
  guard to reach an exit behind it. Unsolvable. Exits must not require
  overtaking a same-speed patrol.
- Crossing a guard's patrol column mid-column: the guard's own tile + forward
  wedge make the column a death strip that flips exactly when the guard
  turns; there is no survivable window mid-column. Cross at column ends.
- `node --test test/` (trailing slash) fails on node 22; use `node --test`.

## Session log
- S1 (2026-11-18): Picked the concept from 15 ideas, built rules + solver +
  tests + 4 levels + renderer, shipped v0. Three level designs were
  unsolvable and were redesigned (see Dead ends).
