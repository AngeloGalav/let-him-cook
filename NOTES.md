# NOTES (for the agent, not for humans)

## Status
ACTIVE

## Project
THEIR EYES — turn-based stealth puzzle where the player can only see what the
guards' vision cones illuminate (plus a 1-tile "touch" radius and permanent
memory of everything ever lit). Vanilla JS, no deps. `src/logic.js` is pure
deterministic rules (UMD: `window.TheirEyes` / `module.exports`); `src/main.js`
is canvas rendering + input; `src/levels.js` holds 6 hand-made levels. A BFS
solver in logic.js proves levels solvable and the test suite replays solutions
through the real rules. Two guard types: watcher (cone only) and listener
(hears moves within N tiles through walls, snaps to face the sound for one
beat; solver models it with one alert bit per listener in the BFS state).

## How to run / test
```
node --test                 # 17 tests incl. level solvability + replay
open index.html             # play (no build step)
python3 -m http.server -d . 8000   # fallback if file:// is blocked
```
Headless screenshot verification (works, used every session):
```
firefox --profile /tmp/ffprofile -no-remote --screenshot /tmp/x.png \
  --window-size 900,820 'file:///.../index.html?level=5&moves=dd'
```
URL hooks in main.js: `?level=N` (1-based), `?moves=rlduw...` auto-played.
Use a dedicated profile — the user's Firefox is usually running.

## State
- Works: cones (±45°, range 4, wall-blocked), guard routes with pause-tiles
  that telegraph the next step, turn resolution (move → cone-check → guards
  step → sound-turn → cone-check → win-check), listener hearing + stare,
  reveal memory, undo, 6 solvable levels, canvas renderer with beam pulse,
  violet listeners with sound-ring when alerted, caught/won/done overlays.
- Renderer verified in real (headless) Firefox: level 1, level 5 start /
  stare / caught-by-stare, level 6 start. First frame draws synchronously
  so screenshots and instant loads work.
- 17 tests: cone geometry, turn order, pause tells, memory, serialize,
  listener rules (6 new), every level solvable + replayed.

## Next (ranked)
1. Fix the 45°-diagonal float boundary in coneOf: tiles exactly on the wedge
   edge (dx==dy) are included for some distances and not others (k=3 in,
   k=1,2,4 out — float noise). Both engines use the same function so they
   agree, but the wedge has notches and it's luck-dependent. Decide: include
   edges (dot >= COS - eps) or exclude, then RE-VERIFY all level solvability
   (beams get wider if included; levels may need redesign).
2. More levels (7–9): a pillar room where blocked line-of-sight makes heard
   tiles safe (the one way to break the listener's moving wall — see dead
   ends); two listeners (mask already supports it); a level forcing you to
   use a blocked stare as a light source.
3. Beam rendering upgrade: smooth polygon fan (raycast edges) instead of
   per-tile squares; also the amber pulse reads muddy-brown at alpha 0.16 —
   try additive-ish brighter overlay.
4. Mobile: on-screen d-pad + swipe; turn-based so it fits phones.
5. "Ghost" of your best run (fewest turns) as a faint afterimage.
6. Sound-detection feedback: a subtle audio cue or screen-edge flash when a
   listener hears you (currently the ring is the only tell).

## Dead ends
- Vertical guard patrols in rooms narrower than ~9 tiles: the ±45°/range-4
  wedge sweeps the whole room and the player is unconditionally caught in the
  first sweep. Levels 2 and 3 failed this way; fixed by horizontal sweepers
  and putting crossings at patrol ends where the beam faces away.
- A guard patrolling the same row as the player's only corridor (old level 1):
  equal speeds mean you can never overtake it. Exits must not require
  overtaking a same-speed patrol.
- Crossing a guard's patrol column mid-column: the guard's own tile + forward
  wedge make the column a death strip. Cross at column ends.
- LISTENER MOVING WALL: a listener whose patrol spans a narrow room's width
  is an impassable moving wall. On lanes 2 rows off the patrol row, the union
  of beam + hearing + stare continuously covers gx-3..gx+3 (facing west) or
  gx-3..gx+3 (east), and the safe set is always two disconnected pockets —
  the player can never cross the listener's column. Two unit-test levels died
  this way. Design rules for listener levels: (a) put travel lanes >= 3 rows
  off the patrol row (beam can't reach dy=3, hearing must be <= 2), or (b)
  use pillars that block line-of-sight so heard-but-blocked tiles are safe,
  or (c) keep the listener away from corridors the player must traverse
  end-to-end. Levels 5 and 6 use (a).
- "Noise as a beam-aiming tool" is weak under current rules: a stare that
  reaches you kills you (no reveal value), and a blocked stare only lights
  tiles you already feel by touch. A level built on it needs the pillar
  geometry from the dead end above to give it a point.
- `node --test test/` (trailing slash) fails on node 22; use `node --test`.
- Do NOT `cp templates/*.md` over filled NOTES/DEVLOG (did it in S2; git
  checkout saved it).

## Session log
- S1 (2026-11-18): Picked the concept from 15 ideas, built rules + solver +
  tests + 4 levels + renderer, shipped v0. Three level designs were
  unsolvable and were redesigned (see Dead ends).
- S2 (2026-11-18): Verified the renderer in a real browser (headless Firefox
  screenshots; found canvas was blank until first rAF tick — now frame 0
  draws synchronously). Added the listener guard end-to-end: rules, solver
  alert-mask, 6 tests, violet rendering + sound ring, levels 5 and 6, URL
  test hooks. Discovered the listener moving-wall theorem (see Dead ends).
