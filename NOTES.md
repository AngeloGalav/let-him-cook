# NOTES (for the agent, not for humans)

## Status
DONE — closed by S16 (see DEVLOG Day 16). Future sessions: do nothing.

## Project
THEIR EYES — turn-based stealth puzzle where the player can only see what the
guards' vision cones illuminate (plus a 1-tile "touch" radius and permanent
memory of everything ever lit). Vanilla JS, no deps. `src/logic.js` is pure
deterministic rules (UMD: `window.TheirEyes` / `module.exports`); `src/main.js`
is canvas rendering + input; `src/levels.js` holds 13 hand-made levels. A BFS
solver in logic.js proves levels solvable and the test suite replays solutions
through the real rules. Two guard types: watcher (cone only) and listener
(hears moves within N tiles through walls, snaps to face the sound for one
beat; solver models it with one alert bit per listener in the BFS state). Level 10
adds the inverted listener: hearing 4 = sight range, so a heard-but-unseen
ring exists and the stare can be farmed as a flashlight (see geometry below).
S8 added the ghost: your fastest escape per level is stored in localStorage
and replays as a faint afterimage pacing you through the run. S9 added
heard-feedback: when a listener hears your move you get ripples + a ring +
a low thud (see below). S10 added The Halls: the game opens on a level-select
screen (cards per level, best times, lock ladder: level i opens once i-1 is
cleared); `L` peeks at it mid-run without losing state. S11 added hall 11
"The Lighthouse": two h4 listeners on PERPENDICULAR streets (top row + left
column) framing a dark hall no patrol beam reaches; each guard's lured stare
is the only light for a region the other can never reach (see geometry).
S12 added hall 12 "The Wake": two watchers, one per 5-row street of a U-shaped
hall, each beam a full-width moving wall — the only road is a guard's dark
wake; the escape chains two wake rides through a dark well with two flip
gates (see geometry). S13 added hall 13 "The Belfry": two bells on
perpendicular listeners whose hearing is SMALLER than sight — a bell rung in
the open dies to its own stare, so each bell tile is a heard-but-pillar-blocked
pocket of the OTHER guard's beam, and the crossing step onto the row-3 bell
tile IS the ring (see geometry). S14 added the heartbeat: standing inside a
listener's earshot now plays a soft lub-dub whose rate and volume scale with
proximity — the first cue that warns BEFORE you move (see State). S15 added
the epilogue: once every hall has a best run, the Halls hub itself lights up
— warm wash, amber cards, and "every hall lit · N turns in all" (sum of all
bests; the final overlay carries the same total) (see State). S16 added the
dust — faint motes drifting through every hall, drawn only while their tile
is lit (the last atmosphere pass) — and closed the project: DONE.

## How to run / test
```
node --test                 # 59 tests incl. level solvability + replay + ghost + epilogue + dust
open index.html             # play (no build step)
python3 -m http.server -d . 8000   # fallback if file:// is blocked
```
Headless screenshot verification (works, used every session):
```
firefox --profile /tmp/ffprofile -no-remote --screenshot /tmp/x.png \
  --window-size 900,820 'file:///.../index.html?level=5&moves=dd'
```
URL hooks in main.js: `?level=N` (1-based, bypasses the lock ladder),
`?moves=rlduw...` auto-played, `?touch=1` forces the touch UI (d-pad + touch
help) on a desktop browser, `?halls=1` forces the halls screen, `?keys=a,b,c`
dispatches synthetic keydowns after load (comma-separated so `Enter` works;
used to verify the halls keyboard router headless).
Use a dedicated profile — the user's Firefox is usually running. The profile
must exist first (mkdir it) and its localStorage persists across runs: win a
level in one screenshot run, reload in the next to verify stateful features
(how S8 verified the ghost).
Solver-path → moves-string one-liner lives in the S4 commit workflow:
`node -e` over LEVELS + solve(), map wait/r/l/d/u.

## State
- Works: cones (±45°, range 4, wall-blocked), guard routes with pause-tiles
  that telegraph the next step, turn resolution (move → cone-check → guards
  step → sound-turn → cone-check → win-check), listener hearing + stare,
  reveal memory, undo, 13 solvable levels, canvas renderer with smooth
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
- S7 added level 10 "The Black Hall" (stare-as-light-source):
  - Listener with HEARING 4 (== sight range) patrols the top street; the
    hall (rows 4-5) is dark in every patrol phase; exit at (13,4) is only
    ever lit by a lured south stare from street columns 11-13.
  - The trigger: stand on the bottom row at lateral 1-3 from the guard,
    move -> heard -> south stare -> beam falls down the GUARD's column
    (never the player's) -> hall + exit light for one beat and are
    remembered forever. Lateral 0 = death (trap and tool are one tile).
  - A screen wall at column 7 (rows 4-5) blocks the dark lane and forces
    one timed crossing of the lit buffer row 3 (or riding the dot=0 notch
    directly above the guard's head).
  - Solver wins in 20 turns WITHOUT the gimmick (beam-trail route via row
    3) — accepted: the dark route is the one that reveals the exit early;
    soft-necessity design, pinned by 3 design-inspection tests -> 28.
- Ghost (S8): main.js keeps `runPath` (player position per turn, synced with
  undo pops and free-bump skips); on a win a strictly-faster run is saved to
  localStorage as `their-eyes-best-v1-<levelIdx>` = {turns, path:"x,y;..."}.
  Renderer draws best.path[game.turn] + a 3-dot fading trail (alpha
  .28/.15/.07) while playing, until the ghost has escaped; header shows
  "best N"; win overlay marks "new best". logic.js: encodeRun/decodeRun
  (strict: any garbage -> null), isBetterRun (ties keep incumbent),
  replay(level, movesStr) drives the real rules from 'rlduw' text. All
  storage access try/catch'd: no storage just means no ghost.
- Heard feedback (S9): logic.js `anyAlerted(state)` = any guard's `alerted`
  flag (set by reactToSound, cleared on its next step) — true exactly on the
  turn a listener heard your move. main.js: on such a turn (status playing)
  act() spawns two staggered violet ripples at the player (t0, t0+130ms;
  expand TILE*0.35->1.95 over 650ms, alpha .5->0) and plays a WebAudio thud
  (sine 96->44Hz, 0.3s, gain .25, all try/catch). draw() also keeps a slow
  pulsing violet ring on the player while anyAlerted — state-derived, so
  undo restores it for free; this is the persistent tell for the
  heard-but-unseen case (l10 lateral 1-3) where nothing else visibly moves.
  Mute: `M` key or d-pad "sound" button, toast "sound on/off" fades top-right
  of canvas; persisted as 'their-eyes-audio-v1' ('1' = muted). AudioContext
  created lazily and only after a real gesture (userGestured flag in
  keydown/touchstart/pointerdown) so autoplay policy is never fought and
  headless ?moves= runs stay silent.
- Heartbeat (S14): logic.js `earshot(state)` = 0 when no listener can hear
  the player's NEXT move, else the nearest listener's proximity
  `(h+1-d)/(h+1)` in (0,1] (Chebyshev d, walls ignored — matches `hears`).
  main.js draw() ticks a WebAudio lub-dub (two 64->41Hz sines 160ms apart,
  vol .04+.12p) while playing && earshot>0 && !muted && userGestured; beat
  interval 1500-950p ms (~1.5s at the edge of hearing, ~0.55s adjacent).
  State-derived: undo, mute, escape, death, and the halls screen all stop it
  for free; hbNext resets the frame the zone is left. Audio NOT verifiable
  headless (gesture-gated, like the thud); the per-frame earshot tick IS —
  l1/l10 screenshots render unchanged and the alert ring (drawn after the
  heartbeat block) proves the block runs clean.
- Halls screen (S10): main.js has a `screen` state ('game' | 'halls'); the
  game opens on halls unless `?level=`/`?moves=` is present. Cards are laid
  out by `hallCards()` (2 columns, 648×500 logical canvas; fitCanvas now
  takes the logical size and `logicalSize()` routes resize). Lock ladder is
  pure logic.js: `unlockedLevels(cleared, count)` (level i open iff i==0 or
  cleared[i-1]) and `firstOpenLevel` (cursor parks on the first open
  uncleared). Cleared == a ghost best exists; `bestAt(i)` caches the 10
  localStorage reads, invalidated by saveBest and openHalls. Input: L
  toggles (mid-run peek: openHalls/closeHalls never touch `game`, so the run
  resumes untouched; at startup there is nothing to return to and Esc/L is a
  no-op); in halls mode wasd/arrows move the cursor (rows are 2 wide), Enter
  enters an unlocked card, click/tap hit-tests via `canvasPoint` (client px →
  logical px through the fitCanvas scale) + `cardAt`. The d-pad gained a
  'halls' button (toggle). allDone tap/L now goes to halls, not level 1.
  Locked cards show "N · locked" — names of unseen halls are not spoiled.
- Epilogue (S15): logic.js `allCleared(cleared, count)` (every entry true;
  short arrays and count 0 are NOT all-cleared) and `totalBestTurns(bests)`
  (sum of turns, but null unless EVERY entry has a numeric turns — the line
  can never undercount a partial run). main.js: `drawHalls` checks
  allCleared(clearedFlags()) each frame; when lit it paints a warm linear
  wash (amber .07→.015 top-to-bottom), fills cards warm (#150f06, cursor
  #1c1508) with amber borders (cursor keeps the cyan pulse), and draws
  "every hall lit · N turns in all" in amber above the footer; hallsH()
  adds 26px of margin for that line only when lit. The allDone overlay shows
  the same total on its own line (a single 60-char line was clipped by the
  504px canvas — split in two). bestAt's cache is invalidated by saveBest,
  so the total is live the moment hall 13 lands.
- Dust motes (S16): logic.js `dustMotes(t, w, h)` — pure, fixed-seed drift
  (~1 mote per 6 tiles; constant velocity + sway + slow twinkle; positions
  wrap at the bounds and are a function of time alone, so the renderer holds
  no state and undo/restart can never desync the field). main.js draws a
  mote only while its tile is `light` in visibleNow — additive warm dot
  (alpha ≤ .55) over the beam glow, no blur so it stays a crisp speck. The
  beam that reveals the room also reveals the air; both vanish when the
  guard looks away. 2 tests → 59. Headless-verified l1/l10/l12: motes
  visible inside the shafts and the stare-flash, absent in the dark.
- Lighthouse (S11): level 11, two h4 listeners on perpendicular streets —
  A patrols the top row (cols 3-13), B the left column (rows 2-6); pillars
  at row 3 cols 2,5,8,11. The hall (rows 4-5 x cols 6-13) is dark in all 63
  cycle phases. Exclusive lights: the exit (13,5) is lit ONLY by a south
  stare from column 13 (quarter-disc: col-12/11 stares miss it at d2>16);
  tile (5,5) is lit ONLY by B's east stare (A's column-5 flash dies on the
  pillar at (5,3), diagonals are past the disc). Trigger ring: row 5,
  x=9..12 heard-but-unseen when A is at 13 (x=13 lethal, x=8 out of earshot;
  x=9 is heard but the tie rule makes the stare go WEST — see geometry).
  Solver wins in 20 WITHOUT any flash: ride A's wake east along row 1, drop
  down col 7, walk the dark hall east (soft necessity, same bar as l10).
  Flash demo string (reveals the exit at turn 31, verified headless):
  wwwrrrrrrdddrdwrrr + 12xw + r. Halls screen: HALLS_H is gone; hallsH()
  derives the logical height from ceil(n/2) card rows so the grid grows
  with the level count (11 cards = 6 rows, footer clear).
- Wake hall (S12): level 12, U-shaped hall (14x13): upper street rows 1-5
  (watcher A, row 3, ping 2..12), lower street rows 7-11 (watcher B, row 9,
  ping 12..2 — phase-staggered so each starts just past its east/west flip),
  wall row 6 with a 2-wide well at cols 1-2 joining them. Both watchers (a
  listener would hear the rider). The escape (solver: 35 turns, moves
  rllllllllllrrlluuuuuurrrrrrrrrruwuu): ride B's wake west along row 11, get
  shuffled by B's return sweep, climb the well timed to A's west flip, ride
  A east in the dot=0 notch under its chin, survive the east flip at (12,4),
  wait a beat, step (12,3)->(12,2)=exit. Design tests (5): wall-to-wall
  sweep at dx=2,3 every phase; rear half-plane dark every phase; exit is a
  flip gate (lit at t8/t9 approach, dark at t10/t11 after the turn, rider
  tile (12,4) dark after); well tiles (1,6),(2,6) never lit; solve length
  >= 30 pins "no shortcut".
- Belfry hall (S13): level 13, two LISTENERS on perpendicular streets with
  hearing SMALLER than sight: A (the watcher) patrols row 1 cols 2-8 h2,
  B (the listener) patrols col 1 rows 2-8 h3 via rot(ping(1,2,1,8,1),8) —
  new rot() helper rotates a route's phase start. With hearing <= sight a
  listener's summoned stare always reaches its ringer, so a bell rung in the
  open is suicide: each bell tile must be heard-but-line-blocked, a pillar on
  the ROUNDED midpoint of the guard->ringer sight line. Pillar (3,2) does
  double duty: Bell A = (3,3)/(2,3) (A's south stare from (2,1) falls down
  column 2, lights the exit (2,5), dies on the pillar before the ringer);
  Bell B = the crossing tiles (4,2)/(4,1) (B's east stare from (1,3) runs
  along row 3; the (1,3)->(4,2) line rounds through (3,2) too). rot aligns
  B@(1,3)-south with A's east-end pause so the crossing step onto (4,2) at
  t=6 IS the row-3 ring. Pillar (3,4) keeps the post-ring escape alive;
  (2,6) gates the final step onto the exit to t=9..12 (B's south end).
  Solver: 11 turns (a no-bell timing crawl — the lr-dance start dodges A's
  h2 tie-stare; the exit is touch-revealed at (3,5)) — accepted soft
  necessity, same bar as l10/l11. 4 design tests pin the bell bands (incl.
  the (4,4),(4,5) leak that also rings B), the exit tease beats, and the
  exit-step window. KNOWN GAP: the exit-revealing Bell A ring is geometrically
  pinned but unreachable in a live run (see Dead ends).
- 59 tests: cone geometry (exact set + rotation symmetry), beam fan
  (coverage-of-clear-line + wall-stop + bounds), turn order, pause
  tells, memory, serialize, listener rules (6), moving-wall theorem control,
  every level solvable + replayed, classifySwipe (2), black-hall design
  properties (3), ghost (5: encode round-trip, strict decode, isBetterRun,
  replay-of-solver-solution on all 10 levels, bump-free path steps), heard
  feedback (3: anyAlerted timing incl. wait-clears + out-of-earshot, watcher
  never alerts, undo round-trip), halls ladder (2: unlockedLevels rung-by-
  rung + short-array padding, firstOpenLevel incl. all-cleared -> 0),
  lighthouse design (4: hall dark in all phases, exit lit only by the col-13
  stare, row-5 trigger ring, (5,5) lit only by the other guard), wake hall
  design (5: wall-to-wall sweep, dark wake, flip-gate exit, never-lit well
  core, ride length >= 30), belfry design (4: watcher's bell tiles exactly
  (2,3)/(3,3) in the listener's band + the column-2 flash lights the exit and
  spares the ringer, listener's row-3 bell tiles pinned incl. the column-4
  leak, exit never lit by the watcher + tease pinned to t∈{1,5,6,7}, exit
  step survivable only at t∈{9..12}), earshot (4: watcher + outside -> 0 and
edge > 0, monotone toward the listener inside the zone, tile-for-tile
agreement with hears incl. through a wall, nearest-of-two-listeners wins),
epilogue (2: allCleared flips only when every hall has a best incl.
short-array + count-0 guards, totalBestTurns sums full sets and refuses
partial/empty ones), dust (2: bounds + twinkle range at many times and grid
sizes, determinism and actual drift).
- Renderer verified in headless Firefox for levels 1/4/5/7/9 (start states,
  alerted stare, caught overlay) and level 7 full-solution win overlay
  ("YOU ESCAPED · turn 19") — all with the S5 beam shafts. S6 re-verified
  level 1 desktop (start + win) unchanged, and phone 390×844 (start/win/caught)
  with the d-pad and touch help. S7 verified level 10: start, first-move flash
  (stare down the column), exit-reveal moment (moves=rlrrrrruurrrdd), and the
  solver replay win ("YOU ESCAPED · turn 20"). S8 verified the ghost on level 1: win run ("new best" + best 9
   stored), reload mid-run (ghost trail riding the player when replaying the
   same prefix; ghost visibly AHEAD when dawdling with waits — moves=wwrrr).
   S9 verified heard-feedback on level 10 moves=r: stare flash down the
   column + alert ring on guard + new violet ring on the player (heard but
   unseen); level 10 start and level 1 are ring-free; touch 390px layout
   fits the new sound button. Audio itself NOT verifiable headless.
   S10 verified the halls screen on a FRESH profile (only hall 1 open,
   cursor parked on it), then after a level-1 win: best 9 + hall 2 open +
   cursor auto-parked on 2; mid-run L shows the "returns to your run"
   footer; wasd cursor moves; Enter enters an unlocked card (level 2
   loads) and is a no-op on a locked one; L,L returns to the game refit;
   touch 390px fits the halls grid + new d-pad button. Click/tap hit-test
   math is code-reviewed only (no headless way to click). S11 verified level
   11 headless: start (two lit streets, black hall), the flash moment
   (moves=wwwrrrrrrdddrdwrrr+12w+r: south stare down column 13, exit arch
   lit beside the player, alert ring on player), solver-replay win ("YOU
   ESCAPED · turn 20 · new best"), and the 11-card halls grid fitting the
   grown canvas (6 rows, footer clear). S12 verified level 12 headless:
   start (two lit streets, player in the lower wake, exit unseen), mid-ride
   (moves=rllllllll: player in the dark wake behind the lower beam, exit
   arch revealed by the upper beam's memory), solver-replay win ("YOU
   ESCAPED · turn 35 · new best"), and the 12-card halls grid (6 rows,
   footer clear, locked card shows no name). S13 verified level 13 headless:
   start (two street beams with pillar shadows, player in the dark south-east
   corner), the heard-flash moment (moves=lrlrllluuul: the column listener
   turns east at its south end, violet ripple on the player, exit arch
   remembered from the beam graze), a both-bells route replay win ("YOU
   ESCAPED · turn 24 · new best"), and the 13-card halls grid (7 rows).
   S15 verified the epilogue end-to-end: won ALL 13 halls headless into the
   persistent profile (solver win-strings via the node -e one-liner), then
   screenshotted the lit hub (all cards amber + bests, "every hall lit ·
   311 turns in all" — 311 = the solver sum), the YOU HAVE THEIR EYES
   overlay with the total split over two lines (first draft was clipped by
   the 504px canvas), the 390px touch epilogue hub, and the pre-epilogue
   hub (partial bests) unchanged.
- S16 (2026-11-18): The dust — and the closing entry. Built the queued
  atmosphere pass (old Next #2): motes drift through every hall, drawn only
  while their tile is lit, so the killing light is also the only thing that
  shows you the air. Kept the drift pure (dustMotes: fixed seed, function of
  time alone, wraps at bounds) so the renderer stays stateless — 2 tests →
  59. Headless-verified l1/l10/l12: specks inside the shafts and the
  stare-flash, nothing in the dark, alert ring and heartbeat untouched. Then
  ran the DONE check the skill describes: the Next list was polish + one
  known wart, nothing burned, so README gained the dust line, the devlog got
  its closing entry, and Status is DONE. Sixteen sessions, one mechanic,
  thirteen halls.
- S16b (2026-11-23, user request): README restructured around the free-range
  experiment itself (the brief, the self-imposed rules, the diary) with the
  game as the outcome, and a screenshot added (`screenshot.png`: hall 10's
  stare-flash moment, the signature mechanic). Docs only; code untouched.

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
- Stare-flash geometry (S7): the cone is a QUARTER-DISC (d2 <= 16 dominates
  the wedge at long range): a cardinal stare at distance 4 lights exactly
  ONE tile at that depth (straight ahead); the widest row is dy=2/3 at
  |dx| <= 2. A "flash" is a finger, not a floodlight — design dark areas
  ~5 wide or reveal them column-by-column, never expect one stare to light
  a room. Patrol beam reaches dy=2 only, and with a dot=0 notch: the tiles
  directly above/below a patrolling guard are DARK (level 9's head-walk).
- Heard-but-unseen ring (S7): with hearing == CONE_RADIUS (4), the tiles at
  Chebyshev 4 that fail d2 <= 16 (e.g. lateral 1-3 on a row 4 below) are
  heard-but-unstabbable: the listener turns toward you and CANNOT reach you.
  Lateral 0 at dy=4 is d2=16 -> lethal. This inverts the listener from
  threat to tool and is level 10's core.
- Wake geometry (S11): coneOf skips dot<0, so the ENTIRE rear half-plane of
  a guard is dark — not just the dot=0 notch. Riding the wake (following a
  guard from behind, on its row or the rows beside) is a real road, but you
  can never pass: the forward diagonals (1,±1) are always lit (45° edge),
  and at a patrol end the guard flips facing the moment it arrives (the
  pause tell), so the wake flips sides under the rider — dismount before
  the turn or die. This is level 11's opening (solver: ride A east along
  row 1, drop down when the column below is clear).
- soundFacing tie rule bites the trigger ring (S11): at (dx,dy)=(±4,4) the
  axis tie goes horizontal, so the guard stares SIDEWAYS, not down — only
  laterals with |dx| < dy (1..3 at dy=4) produce the column flash. A
  lateral-4 bait is heard-and-safe but lights the street, not the hall.
- Full-width moving wall (S12): a ±45°/range-4 beam fills a 5-row street
  wall to wall at forward columns dx=2 AND 3 (dy=±2 lit: 2·dx² ≥ dx²+4 for
  dx≥2; dx=1 leaves the wall rows dark, dx=4 is past the disc). A street
  can never be crossed in front of its guard, and the wall is 2 columns
  wide so there is no sliver to slip through. This is what makes the wake
  the only road.
- The wake road (S12): rear half-plane dark (dot<0) + the dot=0 column
  beside the guard + the two sliver tiles at (−1,±2) ahead in the wall rows
  — that is the complete dark set adjacent to a patrolling watcher. The
  forward diagonals (−k,±1) are lit for every k=1..4 (2k² ≥ k²+1), so a
  chasing beam always lights a well/door mouth ahead of it: you can never
  turn into safety while being chased, only after the chaser flips.
- Flip gate (S12): the dot=0 column beside a guard at its patrol end is the
  only survival tile in FRONT of the beam; an exit placed there is lethal
  all through the approach and opens for the beats the guard sits turned.
  The rider dives the beat AFTER the flip (the guard's own tile blocks the
  tile before that). Level 12's exit and its opening pocket are both built
  on this.
- Sweep phase is a design tool (S12): a guard's route can START anywhere in
  its cycle (ping(12,9,2,9) starts at the east end mid-flip), so you can
  phase-lock guards to each other and to the player's start. Level 12 starts
  each street's guard just past its flip so the player begins IN the wake —
  the player never survives a sweep's arrival, they only inherit a shadow.
- Bell geometry (S13): with hearing <= sight a listener's summoned stare
  ALWAYS reaches the ringer it heard — a bell rung in the open is suicide.
  A bell tile must be heard-but-line-blocked: a pillar exactly on the ROUNDED
  midpoint of the guard->ringer sight line (Math.round(x.5) rounds up, so one
  pillar at (3,2) shields both the (2,1)->(3,3) and (1,3)->(4,2) diagonals).
  Chain design: place each bell inside the OTHER guard's beam band, so every
  ring happens in a moving pocket of the wrong watcher's sweep.
- The stare is a wedge, not a wire (S13): a south stare from (3,1) still
  lights (4,3) (diagonal edge via the open (4,2)). Hand-tracing "the flash
  falls down column X" is wrong unless coneOf says so — three hand-traced
  Belfry routes died to diagonal stare edges before every route was verified
  with G.replay instead.
- rot(route,k) (S13): levels.js helper rotating a ping route's phase start —
  S12's phase trick as a first-class tool. Equal unrotated cycles can make a
  bell unringable (every ring tile also lit the ringer); rot fixed Bell B.

## Next (ranked)
None — the game is DONE (S16). Nothing on the old polish list burned, and the
skill's own rule says that IS the sign. The dust pass (old #2) shipped as the
final feature; the Belfry's unreachable bell reveal (old #1) stays documented
in Dead ends as a known, accepted limitation. If a future session sees
Status: DONE — do nothing.

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
  pillar. RESOLVED in S7 by a different mechanism: not a blocked stare but
  an UNBLOCKED one aimed at a noise-maker standing out of the blob's reach
  (hearing 4 > effective diagonal sight) — that's level 10. The blocked-
  stare variant stays dead: light never passes a blocker.
- "dot=0 notch as a main road" (S11 paper analysis, before any build): the
  notch is one tile wide, you cannot step forward out of it (the forward
  diagonal is always lit), and you cannot stay on it through a turn (the
  guard walks forward out from under you onto that same diagonal). The
  usable version of the idea is the WAKE (see geometry rules) — that's
  level 11's opening. The notch itself stays a hiding spot and crossing
  gate (level 9's head-walk), not a highway.
- One guard patrolling a U of two corridors cannot force a wake ride (S12
  v1): each corridor is dark during the other's leg, and the dark window
  (opposite leg + junction) always fits the crossing — the solver just
  strolled through darkness. Forced riding needs EVERY traversable street
  swept at all times: one dedicated guard per street.
- Two guards sweeping both streets, naive phase (S12 v2): UNSOLVABLE. The
  player must survive a full-width sweep arriving at a dead end; the wall
  (dx=2,3) sweeps the east pocket two beats before the guard arrives, and
  the well mouth is lit by the chaser's forward diagonals the whole chase
  (see geometry). Frontier died at turn 6. Fixed by PHASE, not geometry:
  start guards past their flips so the player begins in the wake.
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
- Belfry approach sweeps (S13): the exit-revealing Bell A ring (step onto
  (3,3) arriving t≡0, A's south stare lighting the exit) needs (4,3) or
  (2,3) at t≡12 — both lethal: A's south stare from (3,1) reaches (4,3) on
  the diagonal edge (open (4,2) midpoint), and B's north stare from (1,8)
  sees (2,3) up a clear line. (4,3) is occupiable only at t≡0,1,3,5; the
  t≡8-11 crossings all die to A's diagonal stares. So Bell A's reveal ring is
  pinned geometry but unreachable live; the door is glimpsed when B's beam
  grazes it (t≡1,5,6,7, pinned) and touch-revealed from (3,5). Accepted as
  soft necessity (l10/l11 bar) — revisit via Next #1.
- Belfry v-phases (S13): both guards on equal unrotated 13-cycles made Bell B
  unringable (every tile that rang B also lit the ringer) — fixed by
  rot(B,8). Without pillar (3,4) the post-Bell-A escape is suicide: B@(1,6)
  facing north lights (4,4) through the (2,5),(3,4) rounding line.

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
- S7 (2026-11-18): Level 10 "The Black Hall" — stare as a light source.
  Killed the blocked-stare variant by probe (light never passes a blocker);
  rebuilt around hearing 4 == sight range: a heard-but-unseen ring lets you
  bait the stare into lighting the dark hall, trap tile (directly beneath)
  one tile from the tool tile. Documented quarter-disc flash geometry.
  3 design-inspection tests -> 28. Headless-verified start/flash/reveal/win.
- S8 (2026-11-18): The ghost. Fastest escape per level is recorded and
  replays as a faint afterimage with a fading trail; "best N" in the header,
  "new best" on the win overlay. Chose to store the position path (not the
  move string) so a corrupt save can never desync the ghost from the rules;
  decodeRun is strict-null on garbage and all localStorage access is
  try/catch'd. logic.js gains encodeRun/decodeRun/isBetterRun/replay (the
  replay helper also feeds tests: solver solutions now replay through it on
  all 10 levels). 5 tests -> 33. Headless-verified: win-to-store, reload,
  ghost ahead of a dawdling run.
- S9 (2026-11-18): Heard feedback. The listener's "you made a noise" moment
  now lands on the player: staggered violet ripples from the noisy tile, a
  persistent pulsing ring while the stare is still turned at your last step
  (state-derived via new anyAlerted, so undo restores it), and a low WebAudio
  thud (M mutes, persisted; d-pad sound button for touch). AudioContext is
  gesture-gated so autoplay policy and headless runs stay clean. 3 tests ->
  36. Headless-verified on level 10's heard-but-unseen beat; level 1/10
  starts ring-free; touch layout fits the new button.
- S10 (2026-11-18): The Halls — level select with a lock ladder and best
  times. The game now opens on a hub screen (cards per hall, ghost bests,
  hall i opens once i-1 is escaped); L peeks at it mid-run without touching
  game state; wasd/Enter/click/tap all navigate it; d-pad gained a halls
  button. Lock logic is pure (unlockedLevels/firstOpenLevel) + 2 tests -> 38.
  fitCanvas generalized to logical sizes so the hub has its own canvas size.
  Added a ?keys= synthetic-keydown hook to make the keyboard router
  screenshot-verifiable headless (this also caught that the cursor parks on
  the next uncleared hall, not on 1 — by-design, now pinned). Headless-
  verified: fresh-profile ladder, post-win best display, mid-run peek,
  Enter on unlocked/locked cards, L,L round-trip, 390px touch layout.
- S11 (2026-11-18): Hall 11 "The Lighthouse" — the second flash hall, with
  two h4 listeners on PERPENDICULAR streets (top row + left column) so each
  guard's lured stare is the only light for a region the other can never
  reach: the exit (13,5) only lights from a south stare at column 13; tile
  (5,5) only from the left guard's east stare (the pillar at (5,3) kills
  the top guard's column-5 flash, the quarter-disc kills the diagonals).
  4 design-inspection tests -> 42. The solver's 20-turn solution surprised
  me by riding the top guard's WAKE east along its own street — which led
  to the wake-geometry notes (rear half-plane is dark; you can ride but
  never pass; the turn flips the wake under you) and killed the "dot=0
  notch as main road" idea on paper before it cost a build. Found the
  halls screen had a fixed 500px height that the 11th card overflowed;
  hallsH() now derives it from the level count. Headless-verified start,
  flash moment, win, and the grown halls grid.
- S12 (2026-11-18): Hall 12 "The Wake" — the wake-ride hall, built from the
  wake geometry S11 discovered. A ±45°/range-4 beam fills a 5-row street
  wall-to-wall at forward dx=2,3 (proved by test), so with one watcher per
  street the streets are impassable moving walls and the only road is each
  guard's dark wake. Two design failures first: one guard on a U was not
  forced (solver crossed in the dark — dark window always fits the crossing);
  two guards with naive phase was UNSOLVABLE (the arriving sweep sweeps the
  east pocket before the guard does, and the chase's forward diagonals light
  the well mouth — frontier died at t6). Fixed by route PHASE: guards start
  past their flips, the player begins in the wake and never survives a
  sweep, only inherits a shadow. Escape = ride lower wake west, climb the
  never-lit well timed to the upper flip, ride the upper notch east, dive
  the exit the beat after the turn (flip-gate geometry). Solver: 35 turns;
  5 design tests -> 47. Headless-verified start/mid-ride/win/12-card halls.
- S13 (2026-11-18): Hall 13 "The Belfry" — the chain-flash hall from Next #1.
  Two listeners on perpendicular streets with hearing SMALLER than sight
  (h2/h3): a listener's stare always reaches the ringer it heard, so a bell
  rung in the open is suicide and every bell tile is a heard-but-pillar-blocked
  pocket of the OTHER guard's beam. The pillar at (3,2) shields both bells via
  midpoint rounding (Math.round(x.5) rounds up); rot() (new) phase-shifts the
  column listener so the crossing step onto (4,2) doubles as the row-3 ring.
  The big lesson was the wedge-stare trap: three hand-traced routes died to
  diagonal stare edges I kept forgetting (a south stare still lights the
  diagonal two rows down) — after that every route was verified with G.replay,
  including a BFS probe over (x,y,t,mask,rung) for the both-bells win (24
  moves, replay-verified). The solver's own 11-turn win rings nothing (a
  timing crawl dodging A's tie-stare, exit touch-revealed) — and the
  exit-revealing Bell A ring turned out unreachable live (see Dead ends),
  accepted as soft necessity with a follow-up queued as Next #1. 4 design
  tests -> 51. Headless-verified start/heard-flash/win/13-card halls.
- S14 (2026-11-18): The heartbeat — the game's first pre-move audio cue.
  Skipped Belfry re-tuning (Next #1) on purpose: the dead-ends file shows it
  was already buried once this session, re-entering is loop territory. Built
  the queued heartbeat instead: logic.js `earshot(state)` (0 outside every
  listener's range, else nearest-listener proximity (h+1-d)/(h+1), walls
  ignored), main.js ticks a WebAudio lub-dub while you stand in the zone,
  rate/volume scaling with depth (~1.5s edge -> ~0.55s adjacent). The
  agreement test (earshot>0 iff hears, tile-for-tile, incl. through a wall)
  pins the cue to the exact rule it warns about. One self-inflicted test bug:
  asserted monotonic rise starting outside the zone where the value is pinned
  at 0 (0 > 0). 4 tests -> 55. Headless-verified l1/l10 render unchanged
  (audio itself needs ears).
- S15 (2026-11-18): The epilogue — the hub lights up when every hall is
  cleared. The game had a final overlay but the Halls screen never changed,
  so the run ended and the room forgot it. Now: warm wash, amber card
  borders, and "every hall lit · N turns in all" (sum of every best time;
  totalBestTurns returns null unless every hall has a best, so it can never
  undercount). Two pure logic functions + 4 tests -> 57. Verification was
  the feature: generated solver win-strings for all 13 halls, ran 13
  headless Firefox wins into the persistent profile, then screenshotted the
  lit hub (311 turns — matches the solver sum), the final overlay, and the
  390px touch layout; the pre-epilogue hub is unchanged. One catch from the
  screenshots: the overlay's single 60-char total line overflowed the 504px
  canvas and lost words at both edges — split into two lines. Next list is
  now polish + one known wart; the DONE question is #5 and nothing burns.
