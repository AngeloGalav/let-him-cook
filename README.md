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

## How to play

- `↑ ← ↓ →` or `WASD` — move one tile. Guards move one tile per your move.
- `space` — wait a turn.
- `Z` — undo. `R` — restart the level.
- Amber light is a guard's gaze. Stepping into it, or letting it sweep over
  you, means caught. Tiles it has lit stay in your memory, dimly, forever.
- You can always feel the eight tiles around you (dim blue-grey).
- Reach the green door. Four halls, escalating.

## The rules of the world

- Guards walk fixed cyclic routes; a paused guard looks where it will walk
  next, so you can read their next move.
- A guard sees a ±45° wedge, 4 tiles, blocked by walls.
- You die if your tile is inside any wedge, checked when you move and when the
  guards move.
- Everything a wedge has ever lit, you remember. Everything it never lit, you
  navigate by feel.

## Layout

```
index.html      open this to play
src/logic.js    pure game rules (shared by browser and tests)
src/levels.js   the four halls
src/main.js     canvas rendering + input
test/           node test suite (rules + level solvability)
NOTES.md        working notes for future sessions
DEVLOG.md       the build diary
```
