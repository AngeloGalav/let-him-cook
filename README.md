# THEIR EYES

A turn-based stealth puzzle game where **you can only see what your enemies are
looking at**. The screen is black except for what the guards' vision cones
illuminate — and what you have memorized from earlier glances. The same light
that lets you see the room kills you if it touches you.

## Why this game

I wanted a mechanic I had never seen used: vision cones are a stealth-game
staple, but always as the *enemy's* sense. Here they are *your* eyes instead.
Information and danger become the same resource, and the core loop falls out of
that: watch a beam sweep a corridor, memorize the geometry it reveals, then
walk through the dark behind it. Every level is a puzzle about timing and
memory, not aim.

## How to run

No build, no dependencies. Open `index.html` in any browser — that's it.

If your browser blocks local files for some reason, serve the folder:

```
python3 -m http.server -d . 8000   # then visit http://localhost:8000
```

Run the tests (the game logic is pure JS, tested with node):

```
node --test
```

The test suite includes a BFS solver that proves every shipped level is
solvable and replays the found solution through the real game rules.

For quick browser checks you can jump straight to a level and auto-play a
move script (`r` `l` `u` `d` `w`): `index.html?level=5&moves=rdw`.

## How to play

- `↑ ← ↓ →` or `WASD` — move one tile. Guards move one tile per your move.
- `space` — wait a turn. Waiting makes no sound.
- `Z` — undo. `R` — restart the level.
- Amber light is a guard's gaze. Stepping into it, or letting it sweep over
  you, means caught. Tiles it has lit stay in your memory, dimly, forever.
- You can always feel the eight tiles around you (dim blue-grey).
- <span style="color:#c084fc">Violet</span> guards **hear you move** within a
  few tiles — through walls. They snap to face the sound and stare for one
  beat: if their gaze reaches you, you're caught; if a wall blocks it, you
  just get lit. Stand still and they walk past.
- Pillars block sight but **not** sound. A listener can hear you clearly and
  still be unable to see you — hiding behind a pillar while it stares at you
  is a legitimate move, and later halls demand it.
- A listener that hears *further than the edge of its beam* can be used as a
  tool: stand where it hears you but its stare can't reach, move, and the
  stare flashes toward you — lighting the dark around it for one beat. The
  enemy's attention becomes your flashlight.
- Reach the green door. Ten halls, escalating.
- Clear a hall and your **fastest escape** comes back as a ghost: a faint
  afterimage replaying your best run one turn at a time, trail and all. It
  paces you through the dark; beat its turn count and the ghost becomes your
  new run. Records live in your browser's localStorage, per hall.

On a phone or tablet the controls adapt: **swipe** to move, **tap** to wait,
and an on-screen d-pad with undo/restart appears below the board. On the
caught/escaped screens a single tap restarts or advances, so a run is fully
playable without a keyboard. (To preview the touch layout on a desktop
browser, add `?touch=1` to the URL.)

## The rules of the world

- Guards walk fixed cyclic routes; a paused guard looks where it will walk
  next, so you can read their next move.
- A guard sees a ±45° wedge, 4 tiles, blocked by walls.
- You die if your tile is inside any wedge, checked when you move and when the
  guards move.
- Violet guards also *hear* moves within a few tiles (waiting is silent, and
  sound ignores walls). When heard, a listener turns to face the sound after
  its step and holds that stare until its next step.
- Everything a wedge has ever lit, you remember. Everything it never lit, you
  navigate by feel.

## Layout

```
index.html      open this to play
src/logic.js    pure game rules (shared by browser and tests)
src/levels.js   the ten halls
src/main.js     canvas rendering + input
test/           node test suite (rules + level solvability)
NOTES.md        working notes for future sessions
DEVLOG.md       the build diary
```
