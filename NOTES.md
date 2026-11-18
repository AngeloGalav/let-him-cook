# NOTES (for the agent, not for humans)

## Status
ACTIVE

## Project
THEIR EYES — turn-based stealth puzzle where the player can only see what the
guards' vision cones illuminate (plus a 1-tile "touch" radius and permanent
memory of everything ever lit). Vanilla JS, no deps. `src/logic.js` is pure
deterministic rules (UMD: `window.TheirEyes` / `module.exports`); `src/main.js`
is canvas rendering + input; `src/levels.js` holds 9 hand-made levels. A BFS
solver in logic.js proves levels solvable and the test suite replays solutions
through the real rules. Two guard types: watcher (cone only) and listener
(hears moves within N tiles through walls, snaps to face the sound for one
beat; solver models it with one alert bit per listener in the BFS state).

## How to run / test
```
node --test                 # 25 tests incl. level solvability + replay
open index.html             # play (no build step)
python3 -m http.server -d . 8000   # fallback if file:// is blocked
```
Headless screenshot verification (works, used every session):
```
firefox --profile /tmp/ffprofile -no-remote --screenshot /tmp/x.png \
  --window-size 900,820 'file:///.../index.html?level=5&moves=dd'
```
URL hooks in main.js: `?level=N` (1-based), `?moves=rlduw...` auto-played,
`?touch=1` forces the touch UI (d-pad + touch help) on a desktop browser.
Use a dedicated profile — the user's Firefox is usually running.
Solver-path → moves-string one-liner lives in the S4 commit workflow:
`node -e` over LEVELS + solve(), map wait/r/l/d/u.

## State
- Works: cones (±45°, range 4, wall-blocked), guard routes with pause-tiles
  that telegraph the next step, turn resolution (move → cone-check → guards
  step → sound-turn → cone-check → win-check), listener hearing + stare,
  reveal memory, undo, 9 solvable levels, canvas renderer with smooth
  raycast beam shafts (S5), violet listeners with sound-ring when alerted,
  caught/won/done overlays.
- Mobile (S6): canvas scales to viewport width (backing store = display px ×
  dpr, re-fit on resize); touch on canvas = swipe-to-move / tap-to-wait, and
  tap on caught/won/done overlays restarts or advances (fully keyboard-free);
  on-screen d-pad + undo/restart shown for `(pointer: coarse)` or `?touch=1`;
  help text and overlay hints swap to touch wording. `classifySwipe(dx,dy,th?)`
  in logic.js (pure): dominant axis wins, tie→horizontal, <th (default 24px)
  is a tap. NOT yet exercised by a real finger — classifier unit-tested,
  layout screenshot-tested only.
- Beam rendering (S5): `G.coneFan(state, guard)` (pure, in logic.js)
  raycasts 97 rays across a ±(45°+0.06) wedge from the guard centre,
  stopping at the first wall face; renderer fills the polygon with an
  additive radial gradient (amber, pulsing) under a 5px canvas blur.
  IMPORTANT: the fan is a GLOW, not the kill zone — the exact lethal set
  is the per-tile floor lighting (light floor brightened to #20242f,
  walls #454d66). The glow may edge-cross 45° diagonal tiles and misses
  rounding-quirk tiles; the floor lighting always tells the truth.
- Cone geometry is exact integer math (S3): wedge test `2*dot*dot >= d2*f2`,
  `d2 <= 16`, diagonal edges included, any integer facing.
- S4 added the pillar-shadow design space (levels 7-9):
  - 7 · The Colonnade: one listener, HEARING 3 (new), full-width patrol,
    pillar rows between patrol row and lanes. h3 kills trailing-the-beam
    (see geometry below); the only safe moves are pillar-shadowed.
  - 8 · The Split: two listeners, one street, split patrols with a gap
    column, staggered pillar rows. First 2-listener level; the alert mask
    already supported it.
  - 9 · The Relay: watcher + listener share one street (split patrols).
    Walking directly above a watcher's head is safe (dot=0 → outside the
    ±45° wedge); the listener half forces shadow play.
  - New regression test: identical room with vs without pillars — bare room
    UNSOLVABLE, pillared room solvable + replay. Pillars are load-bearing.
- 25 tests: cone geometry (exact set + rotation symmetry), beam fan
  (coverage-of-clear-line + wall-stop + bounds), turn order, pause
  tells, memory, serialize, listener rules (6), moving-wall theorem control,
  every level solvable + replayed, classifySwipe (2).
- Renderer verified in headless Firefox for levels 1/4/5/7/9 (start states,
  alerted stare, caught overlay) and level 7 full-solution win overlay
  ("YOU ESCAPED · turn 19") — all with the S5 beam shafts. S6 re-verified
  level 1 desktop (start + win) unchanged, and phone 390×844 (start/win/caught)
  with the d-pad and touch help.

## Geometry rules for listener levels (hard-won, S2+S4)
- Beam from a guard reaches rows ±2 (dy=2: dx=±3 in wedge; dy=3 unreachable).
  Lanes 3+ rows off a patrol row are beam-safe; lanes 1-2 off are swept.
- Moving-wall theorem (S2): a listener patrolling a narrow room's width makes
  lanes 1-2 off its row impassable — beam+hearing+stare cover them
  continuously in two disconnected pockets.
- Pillar shadows (S4): pillars on the row BETWEEN a lane and the patrol row
  cast clean shadows on the lane (the sight line crosses the pillar row).
  This is what makes lanes 2 off crossable. Verified by the control test.
- Pillars ON the lane itself are leaky: a (2,1)-distance sight line's
  midpoint rounds to the PATROL row (Math.round(x.5) rounds up), so the
  beam clips around a same-row pillar when the guard is 1 column away.
  Shadow holds only at guard distance >= 2 columns.
- A lane 1 row off a listener's patrol row is a death strip: the (1,1)
  diagonal stare is adjacent (no midpoint to block) and hearing covers it.
  Don't put exits on such a lane; keep exit lanes 2 off with a pillar row
  between.
- HEARING 3 kills the "trail the beam at distance 3" exploit (the free
  solution to every h2 corridor level): at dx=3 you're heard, the stare
  reaches 4. Trailing needs dx>=4, which full-width patrols don't allow.
- dot=0 tiles (directly beside/above/below the facing) are OUTSIDE the ±45°
  wedge: you can stand one row above a watcher's head and be invisible.
  Level 9's opening is built on this.
- Free-highway trap: any travel lane 3+ rows from the nearest guard is
  beam-unreachable and boring (l9a/l9b first drafts: top row was a free
  sprint). Keep every lane within dy=2 of some guard.
- lineClear rounding quirks (S5, found by the fan coverage test): the
  centre-to-centre LOS test rounds midpoints, so it can light a tile whose
  exact sight line passes through a wall corner (l3: (7,7) lit through wall
  (7,6)) or even a tile BEHIND an unlit tile (l7: (7,4) lit while (6,4) on
  the path is dark — the (4,3)->(6,4) line rounds into pillar (5,4) but the
  (4,3)->(7,4) line doesn't). Visibility is not monotone along a ray. No
  radial fan can render this; the per-tile floor lighting carries these
  tiles. Don't try to "fix" lineClear — levels are balanced around it.

## Next (ranked)
1. "Stare as a light source" level: make noise behind cover so the
   listener's blocked stare lights a dark corridor you need to see into.
   NOTE: the solver can't verify the player NEEDS the light (it has full
   info) — verify by design inspection: target region must be dark unless
   the listener is staring at the noise-maker.
2. "Ghost" of your best run (fewest turns) as a faint afterimage.
3. Sound-detection feedback: subtle audio cue or screen-edge flash when a
   listener hears you (currently the ring is the only tell).
4. Maybe: a level whose whole gimmick is the dot=0 head-walk trick (level 9
   uses it in passing; a dedicated hall could be a watcher-only chase).
5. Maybe: atmosphere pass — faint dust motes drifting through the beam
   shafts, or a slight per-tile warm tint on lit floor near the guard.
6. Maybe: real-device touch pass — if a phone is ever available, check the
   24px swipe threshold and d-pad reach with a thumb; also consider
   long-press repeat on the d-pad.

## Dead ends
- Vertical guard patrols in rooms narrower than ~9 tiles: the ±45°/range-4
  wedge sweeps the whole room; player unconditionally caught. Fixed by
  horizontal sweepers; crossings at patrol ends where the beam faces away.
- A guard patrolling the same row as the player's only corridor: equal
  speeds mean you can never overtake it. Exits must not require overtaking.
- Crossing a guard's patrol column mid-column: guard tile + forward wedge
  make it a death strip. Cross at column ends or behind the beam.
- LISTENER MOVING WALL: see geometry rules. Design rules for listener
  levels: (a) lanes >= 3 rows off (beam-unreachable), (b) pillars between
  lane and patrol row (shadows), or (c) keep listeners off corridors the
  player must traverse end-to-end. Levels 5/6 use (a); 7/8/9 use (b).
- Two listeners on rows 4 apart sweeping a shared middle lane (lane 2 off
  BOTH): unsolvable even with pillar rows — the two moving walls' pockets
  never connect. (l8a/l8c/l8d all UNSOLVABLE.) Two listeners work when
  they SHARE one street (level 8) or guard separate areas (level 6).
- h3 listeners with split patrols + gap column: also unsolvable (l8e) —
  h3's hearing covers the gap whenever either guard is near an end.
  h2 leaves the gap silent when both are at far ends; that's level 8.
- "Noise as a beam-aiming tool" is weak under current rules: a stare that
  reaches you kills you, and a blocked stare only lights tiles near the
  pillar. A level built on it needs the Next-5 design.
- S2's note "diagonal k=3 is in the cone" was WRONG (see S3 note in git
  history): range check excluded (3,3)/(4,4); the S3 fix only added the
  45° tiles at distance 1-2.
- Rotation tests in screen coords (y DOWN): the map that rotates facing
  north to east is (x,y)->(-y,x), NOT (x,y)->(y,-x). Tripped on twice.
- `node --test test/` (trailing slash) fails on node 22; use `node --test`.
- Do NOT `cp templates/*.md` over filled NOTES/DEVLOG (did it in S2; git
  checkout saved it).
- Beam fan marching over the CONE TILE SET (S5 dead end): rays stopping at
  unlit-but-transparent floor produce arrowhead bulges (rays ride the 45°
  diagonal staircase out to range) and comb notches, and still can't reach
  the rounding-quirk tiles (l7 (7,4) behind dark (6,4)) without a grace
  wide enough to cross 1-tile walls. March against WALLS only; let the floor
  lighting be the exact cue.

## Session log
- S1 (2026-11-18): Picked the concept from 15 ideas, built rules + solver +
  tests + 4 levels + renderer, shipped v0. Three level designs were
  unsolvable and were redesigned (see Dead ends).
- S2 (2026-11-18): Verified the renderer in a real browser (headless Firefox
  screenshots; found canvas was blank until first rAF tick — now frame 0
  draws synchronously). Added the listener guard end-to-end: rules, solver
  alert-mask, 6 tests, violet rendering + sound ring, levels 5 and 6, URL
  test hooks. Discovered the listener moving-wall theorem (see Dead ends).
- S3 (2026-11-18): Killed the cone float-noise item: coneOf now uses exact
  integer arithmetic (2·dot² ≥ d²·|f|², d² ≤ 16), diagonal edges included.
  Actual change: +4 tiles per guard (45° at distance 1–2). All 6 levels
  re-proved by the solver; one test-only listener level redesigned (old dash
  lane now swept). Added exact-wedge-set and rotation-symmetry tests → 19.
  Re-verified renderer in headless Firefox.
- S4 (2026-11-18): Built the pillar-shadow design space: levels 7 (Colonnade,
  first h3 listener), 8 (Split, two listeners one street), 9 (Relay, watcher
  + listener). Control test proves pillars load-bearing (bare room
  unsolvable). Documented the shadow geometry rules (see above). 20 tests.
  Renderer + win overlay verified in headless Firefox.
- S5 (2026-11-18): Beam rendering upgrade: per-tile amber squares -> smooth
  raycast polygon fans (coneFan in logic.js, additive radial gradient,
  5px blur). Found lineClear's non-monotone rounding (lit tile behind an
  unlit one); settled the render contract: glow = atmosphere, floor
  lighting = exact kill zone. 3 new fan tests incl. all-levels/all-phases
  coverage. Screenshots re-verified: 1/4/5/7/9 + win + alerted stare.
- S6 (2026-11-18): Mobile support: responsive canvas (fitCanvas, re-fit on
  resize), swipe/tap on canvas (classifySwipe in logic.js, 2 tests -> 25),
  on-screen d-pad + undo/restart for coarse pointers or ?touch=1, touch-mode
  help and overlay wording (tap to restart / next). Tap-on-canvas resolves
  end-of-run overlays so runs are keyboard-free. Verified headless: desktop
  start/win unchanged, phone 390x844 start/win/caught with d-pad.
