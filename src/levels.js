/*
 * THEIR EYES — levels.
 *
 * Legend: '#' wall, 'P' player start, 'E' exit, '.' floor.
 * A guard route is a cyclic list of [x, y] floor tiles; consecutive tiles
 * must be equal (a pause) or adjacent (a step). Repeated tiles make a guard
 * stop and look toward where it will walk next — a readable tell.
 */
(function (root) {
  'use strict';

  // Straight line of tiles from (x1,y1) to (x2,y2), both endpoints included.
  function line(x1, y1, x2, y2) {
    var out = [], dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
    var x = x1, y = y1;
    out.push([x, y]);
    while (x !== x2 || y !== y2) {
      if (x !== x2) x += dx; else y += dy;
      out.push([x, y]);
    }
    return out;
  }

  // Cyclic ping-pong patrol between two points: a→b, optional pauses at b,
  // then back b-1→a+1 so the route wraps seamlessly. Optional pause at a.
  function ping(x1, y1, x2, y2, pauseB, pauseA) {
    var out = line(x1, y1, x2, y2);
    for (var i = 0; i < (pauseB || 0); i++) out.push([x2, y2]);
    out = out.concat(line(x2, y2, x1, y1).slice(1, -1));
    for (var j = 0; j < (pauseA || 0); j++) out.push([x1, y1]);
    return out;
  }

  var LEVELS = [
    {
      name: '1 · The Long Hall',
      hint: 'Wait in the dark. When the beam reaches the far end and turns, run down its trail.',
      grid: [
        '##############',
        '#P...........#',
        '#............#',
        '#............#',
        '#............#',
        '#.....E......#',
        '##############'
      ],
      guards: [
        { route: ping(2, 5, 12, 5, 1) }
      ]
    },
    {
      name: '2 · The Lobby',
      hint: 'Two beams, opposite ends. Cross one row, wait, then the other.',
      grid: [
        '##############',
        '#P...........#',
        '#............#',
        '#............#',
        '#............#',
        '#............#',
        '#............#',
        '#...........E#',
        '##############'
      ],
      guards: [
        { route: ping(2, 3, 11, 3, 1) },
        { route: ping(11, 6, 2, 6, 1) }
      ]
    },
    {
      name: '3 · The Checkpoint',
      hint: 'Slip through the gap at the bottom while the sweeper looks up.',
      grid: [
        '################',
        '#P.....#.......#',
        '#......#.......#',
        '#......#.......#',
        '#......#.......#',
        '#......#.......#',
        '#......#.......#',
        '#..............#',
        '#......#......E#',
        '################'
      ],
      guards: [
        { route: ping(8, 1, 8, 6, 2) },
        { route: ping(9, 4, 14, 4, 1, 1) }
      ]
    },
    {
      name: '4 · The Gauntlet',
      hint: 'Three beams. Memorize the pattern, then move.',
      grid: [
        '##################',
        '#P....#......#...#',
        '#.....#......#...#',
        '#............#...#',
        '#.....#......#...#',
        '#.....#..........#',
        '#.....#......#...#',
        '#.....#......#...#',
        '#.....#......#..E#',
        '##################'
      ],
      guards: [
        { route: ping(4, 1, 4, 8, 1) },
        { route: ping(9, 1, 9, 8, 1, 1) },
        { route: ping(15, 1, 15, 8, 1) }
      ]
    },
    {
      name: '5 · The Listening Post',
      hint: 'The violet guard hears you move. The edge rows are out of earshot — let it walk west, then descend.',
      grid: [
        '##############',
        '#P...........#',
        '#............#',
        '#............#',
        '#............#',
        '#............#',
        '#............#',
        '#...........E#',
        '##############'
      ],
      guards: [
        { route: ping(2, 4, 11, 4, 1), type: 'listener', hearing: 2 }
      ]
    },
    {
      name: '6 · The Divide',
      hint: 'A beam sweeps each end. The row between them is dark and silent — but you must cross both.',
      grid: [
        '###############',
        '#P............#',
        '#.............#',
        '#.............#',
        '#.............#',
        '#.............#',
        '#.............#',
        '#.............#',
        '#.............#',
        '#.............#',
        '#............E#',
        '###############'
      ],
      guards: [
        { route: ping(2, 2, 12, 2, 1) },
        { route: ping(2, 8, 12, 8, 1), type: 'listener', hearing: 2 }
      ]
    },
    {
      name: '7 · The Colonnade',
      hint: 'This one hears three tiles in every direction — you cannot outrun the stare. But a pillar blocks it: move in the shadows.',
      grid: [
        '###############',
        '#P............#',
        '#.#..#..#..#..#',
        '#.............#',
        '#.#..#..#..#..#',
        '#............E#',
        '###############'
      ],
      guards: [
        { route: ping(2, 3, 12, 3, 1), type: 'listener', hearing: 3 }
      ]
    },
    {
      name: '8 · The Split',
      hint: 'Two listeners share the street with a gap between their patrols. A pillar shadow is the only safe place to wait.',
      grid: [
        '###############',
        '#P............#',
        '#.#..#..#..#..#',
        '#.............#',
        '#..#..#..#..#.#',
        '#............E#',
        '###############'
      ],
      guards: [
        { route: ping(2, 3, 6, 3, 1), type: 'listener', hearing: 2 },
        { route: ping(12, 3, 8, 3, 1), type: 'listener', hearing: 2 }
      ]
    },
    {
      name: '9 · The Relay',
      hint: 'The watcher cannot hear you — walk right above its head. The listener sharing its street is a different matter.',
      grid: [
        '##################',
        '#P...............#',
        '#..#..#..#..#....#',
        '#................#',
        '#..#..#..#..#....#',
        '#...............E#',
        '##################'
      ],
      guards: [
        { route: ping(2, 3, 8, 3, 1) },
        { route: ping(15, 3, 10, 3, 1), type: 'listener', hearing: 2 }
      ]
    },
    {
      name: '10 · The Black Hall',
      hint: 'It hears four tiles but only sees four. Stand in the black hall below, never directly beneath, and move: the stare flashes down its column and lights what you cannot see.',
      grid: [
        '###############',
        '#.............#',
        '#.............#',
        '#.............#',
        '#......#.....E#',
        '#P.....#......#',
        '###############'
      ],
      guards: [
        { route: ping(2, 1, 13, 1, 1), type: 'listener', hearing: 4 }
      ]
    },
    {
      name: '11 · The Lighthouse',
      hint: 'Two listeners ring the dark hall: one walks the top street, one the left wall. They hear four tiles but see only their own street. Move to summon a stare — it falls down the guard column, or along its row — and light the hall one flash at a time.',
      grid: [
        '###############',
        '#P............#',
        '#.............#',
        '#.#..#..#..#..#',
        '#.............#',
        '#............E#',
        '#.............#',
        '###############'
      ],
      guards: [
        { route: ping(3, 1, 13, 1, 1), type: 'listener', hearing: 4 },
        { route: ping(1, 2, 1, 6, 1), type: 'listener', hearing: 4 }
      ]
    }
  ];

  var TheirEyesLevels = { LEVELS: LEVELS, line: line, ping: ping };

  if (typeof module !== 'undefined' && module.exports) module.exports = TheirEyesLevels;
  if (typeof window !== 'undefined') window.TheirEyesLevels = TheirEyesLevels;
})(typeof globalThis !== 'undefined' ? globalThis : this);
