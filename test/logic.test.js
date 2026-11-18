'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../src/logic.js');
const { LEVELS, ping } = require('../src/levels.js');

// Small open room for unit tests: P at (1,1), E at (9,3).
function testLevel(extra) {
  return Object.assign({
    name: 'test',
    grid: [
      '###########',
      '#P........#',
      '#.........#',
      '#........E#',
      '#.........#',
      '#.........#',
      '###########'
    ],
    guards: []
  }, extra);
}

test('cone: east-facing guard sees a wedge ahead, nothing behind', () => {
  const lvl = testLevel({
    guards: [{ route: [[4, 2]] }] // stationary guard
  });
  const st = G.createGame(lvl);
  const g = st.guards[0];
  assert.deepStrictEqual(g.facing, { x: 1, y: 0 });
  const cone = G.coneOf(st, g);
  const has = (x, y) => cone.some(t => t.x === x && t.y === y);
  assert.ok(has(4, 2), 'sees own tile');
  assert.ok(has(5, 2), 'sees straight ahead');
  assert.ok(has(6, 3), 'sees diagonal ahead');
  assert.ok(has(8, 2), 'sees to range 4 ahead');
  assert.ok(!has(9, 2), 'not beyond range');
  assert.ok(!has(3, 2), 'does not see behind');
  assert.ok(!has(4, 1), 'does not see beside');
});

test('cone: walls block line of sight', () => {
  const lvl = testLevel({
    grid: [
      '#########',
      '#P......#',
      '#..#....#',
      '#......E#',
      '#########'
    ],
    guards: [{ route: [[1, 2]] }]
  });
  const st = G.createGame(lvl);
  const cone = G.coneOf(st, st.guards[0]);
  const has = (x, y) => cone.some(t => t.x === x && t.y === y);
  assert.ok(has(2, 2), 'sees tile before wall');
  assert.ok(!has(4, 2), 'wall at (3,2) blocks the tile behind it');
});

// Exact integer wedge: the 45° diagonal edge tiles are lit at every distance
// that fits in range (d2 <= 16), so the wedge has no float-noise notches.
test('cone: exact tile set for an east-facing guard (edges included)', () => {
  const lvl = testLevel({ guards: [{ route: [[4, 2]] }] });
  const st = G.createGame(lvl);
  const cone = G.coneOf(st, st.guards[0]);
  const got = cone.map(t => t.x + ',' + t.y).sort();
  // Room floor is x=1..9, y=1..5; walls clip the wedge at the borders.
  const want = [
    '4,2', // own tile
    '5,1', '5,2', '5,3', // dx=1: diagonal edges included
    '6,1', '6,2', '6,3', '6,4', // dx=2: (6,0) is wall
    '7,1', '7,2', '7,3', '7,4', // dx=3: (7,5) out of range (d2=18)
    '8,2' // dx=4: only straight ahead fits
  ].sort();
  assert.deepStrictEqual(got, want);
});

test('cone: wedge is rotation-symmetric across the four facings', () => {
  const open = {
    name: 'open',
    grid: [
      '#############',
      '#P..........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#..........E#',
      '#############'
    ],
    guards: [{ route: [[6, 6]] }]
  };
  const st = G.createGame(open);
  const rel = (set) => set.map(t => (t.x - 6) + ',' + (t.y - 6)).sort();
  const east = rel(G.coneOf(st, { x: 6, y: 6, facing: { x: 1, y: 0 } }));
  assert.ok(east.length > 10, 'sanity: east cone is non-trivial');
  for (const [f, map] of [
    [{ x: 0, y: -1 }, (x, y) => [-y, x]],   // north -> east
    [{ x: -1, y: 0 }, (x, y) => [-x, -y]],  // west -> east
    [{ x: 0, y: 1 }, (x, y) => [y, -x]]     // south -> east
  ]) {
    const r = rel(G.coneOf(st, { x: 6, y: 6, facing: f })).map(s => {
      const [x, y] = s.split(',').map(Number);
      const [nx, ny] = map(x, y);
      return nx + ',' + ny;
    }).sort();
    assert.deepStrictEqual(r, east, 'facing ' + JSON.stringify(f) + ' matches east rotated');
  }
});

// ---------- beam fan (rendering geometry) ----------

// Ray-cast point-in-polygon, for checking the fan covers the real cone.
function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The fairness contract: every lethal tile with a wall-free line from the
// guard must be covered by the drawn glow — or have the glow's edge cross
// it, for tiles sitting on the 45° diagonal where the straight beam edge
// cuts through the tile instead of swallowing it (the exact per-tile floor
// lighting always marks the lethal set; see NOTES). Tiles the logic lights
// only through lineClear's rounding quirks are skipped: no radial fan can
// reach them. Checked at every guard phase of every shipped level. Probe
// points are pulled 10% toward the guard to dodge flaky exact-edge tests.
test('coneFan: covers every cone tile with a clear line of sight', () => {
  // fine-sample the guard->tile-centre line; true if no sample lands in a wall
  function pathClear(st, cx, cy, tx, ty) {
    const d = Math.hypot(tx - cx, ty - cy);
    for (let t = 0; t <= d; t += 0.05) {
      const x = cx + (tx - cx) * (t / d), y = cy + (ty - cy) * (t / d);
      if (G.isWall(st, Math.floor(x), Math.floor(y))) return false;
    }
    return true;
  }
  // distance from point to segment, for the edge-crossing tolerance
  function distSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function covered(px, py, poly) {
    if (inPoly(px, py, poly)) return true;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (distSeg(px, py, poly[j][0], poly[j][1], poly[i][0], poly[i][1]) < 0.3) return true;
    }
    return false;
  }
  for (const lvl of LEVELS) {
    const st = G.createGame(lvl);
    const cycle = G.cycleLength(lvl);
    for (let gi = 0; gi < lvl.guards.length; gi++) {
      for (let t = 0; t < cycle; t++) {
        const pos = G.guardAt(lvl, gi, t);
        const fan = G.coneFan(st, pos);
        // The renderer's polygon is the fan apex plus the ring.
        const poly = [[fan.cx, fan.cy], ...fan.points];
        for (const tile of G.coneOf(st, pos)) {
          let px, py;
          if (tile.x === pos.x && tile.y === pos.y) {
            // own tile: its centre IS the apex, so probe just ahead of it
            px = fan.cx + pos.facing.x * 0.2;
            py = fan.cy + pos.facing.y * 0.2;
          } else {
            px = fan.cx + 0.9 * (tile.x + 0.5 - fan.cx);
            py = fan.cy + 0.9 * (tile.y + 0.5 - fan.cy);
            if (!pathClear(st, fan.cx, fan.cy, tile.x + 0.5, tile.y + 0.5)) continue;
          }
          assert.ok(covered(px, py, poly),
            lvl.name + ' guard ' + gi + ' turn ' + t +
            ': tile ' + tile.x + ',' + tile.y + ' not covered by fan');
        }
      }
    }
  }
});

test('coneFan: stops at the wall face, never leaks behind it', () => {
  const lvl = testLevel({
    grid: [
      '#########',
      '#P..#..E#',
      '#########'
    ],
    guards: [{ route: [[2, 1]] }] // stationary, faces east into the wall at x=4
  });
  const st = G.createGame(lvl);
  const fan = G.coneFan(st, st.guards[0]);
  for (const [x, y] of fan.points) {
    assert.ok(x < 4.05, 'fan vertex ' + x + ',' + y + ' past the wall face');
  }
  assert.ok(inPoly(3.5, 1.5, [[fan.cx, fan.cy], ...fan.points]),
    'tile before the wall is covered');
});

test('coneFan: stays inside the widened wedge (no runaway spikes)', () => {
  const lvl = testLevel({ guards: [{ route: [[4, 2]] }] });
  const st = G.createGame(lvl);
  const fan = G.coneFan(st, st.guards[0]);
  const base = 0; // east
  for (const [x, y] of fan.points) {
    const r = Math.hypot(x - fan.cx, y - fan.cy);
    let da = Math.atan2(y - fan.cy, x - fan.cx) - base;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    assert.ok(r <= G.CONE_RADIUS + 0.65, 'vertex too far: r=' + r);
    assert.ok(Math.abs(da) <= Math.PI / 4 + 0.11, 'vertex outside wedge: ' + da);
  }
});

test('guards: pause tiles make the guard look where it will walk next', () => {
  const lvl = testLevel({
    guards: [{ route: [[7, 2], [8, 2], [8, 2], [8, 2], [7, 2]] }]
  });
  const st = G.createGame(lvl);
  const g = st.guards[0];
  assert.deepStrictEqual(g.facing, { x: 1, y: 0 }); // at (7,2), about to walk east
  G.takeTurn(st, { wait: true }); // -> (8,2), telegraphs the return: faces west
  assert.strictEqual(g.x, 8);
  assert.deepStrictEqual(g.facing, { x: -1, y: 0 });
  G.takeTurn(st, { wait: true }); // pause at (8,2), still west
  assert.strictEqual(g.x, 8);
  assert.deepStrictEqual(g.facing, { x: -1, y: 0 });
  G.takeTurn(st, { wait: true }); // pause again
  assert.strictEqual(g.x, 8);
  G.takeTurn(st, { wait: true }); // -> (7,2), telegraphs east
  assert.strictEqual(g.x, 7);
  assert.deepStrictEqual(g.facing, { x: 1, y: 0 });
});

test('turns: bumping a wall is free, stepping into a beam is fatal', () => {
  const lvl = testLevel({
    grid: [
      '#########',
      '#P.....E#',
      '#########'
    ],
    guards: [{ route: [[6, 1], [6, 1]] }] // stationary guard, faces east
  });
  const st = G.createGame(lvl);
  // walk west into the outer wall: free, turn not consumed
  const moved = G.takeTurn(st, { dx: -1, dy: 0 });
  assert.strictEqual(moved, false);
  assert.strictEqual(st.turn, 0);
  // walk east toward the beam: (2..5,1) are safe
  for (let i = 0; i < 4; i++) G.takeTurn(st, { dx: 1, dy: 0 });
  assert.strictEqual(st.player.x, 5);
  assert.strictEqual(st.status, 'playing');
  // (6,1) is inside the beam
  G.takeTurn(st, { dx: 1, dy: 0 });
  assert.strictEqual(st.status, 'caught');
});

test('turns: a beam sweeping over a waiting player catches them', () => {
  const lvl = testLevel({
    grid: [
      '#########',
      '#P.....E#',
      '#########'
    ],
    guards: [{ route: ping(7, 1, 2, 1) }] // walks west, beam sweeps the hall
  });
  const st = G.createGame(lvl);
  assert.strictEqual(st.status, 'playing');
  G.takeTurn(st, { wait: true }); // guard -> (6,1), sees 2..6, player safe
  assert.strictEqual(st.status, 'playing');
  G.takeTurn(st, { wait: true }); // guard -> (5,1), sees 1..5 -> sweep!
  assert.strictEqual(st.status, 'caught');
});

test('turns: reaching the exit wins', () => {
  const lvl = testLevel({
    grid: [
      '#####',
      '#P.E#',
      '#####'
    ],
    guards: []
  });
  const st = G.createGame(lvl);
  G.takeTurn(st, { dx: 1, dy: 0 });
  G.takeTurn(st, { dx: 1, dy: 0 });
  assert.strictEqual(st.status, 'won');
});

test('memory: revealed tiles persist after the beam moves on', () => {
  const lvl = testLevel({
    grid: [
      '#########',
      '#P.....E#',
      '#########'
    ],
    guards: [{ route: ping(4, 1, 6, 1) }]
  });
  const st = G.createGame(lvl);
  assert.ok(st.revealed['4,1'], 'tile (4,1) lit at start');
  // Let the guard walk east until its beam no longer touches (4,1).
  for (let t = 0; t < 5 && G.visibleNow(st)['4,1']; t++) {
    G.takeTurn(st, { wait: true });
  }
  assert.ok(!G.visibleNow(st)['4,1'], 'beam has moved on');
  assert.ok(st.revealed['4,1'], 'but the memory of the tile persists');
});

test('guardAt matches live simulation', () => {
  const lvl = testLevel({
    guards: [{ route: ping(7, 2, 9, 2, 1) }]
  });
  const st = G.createGame(lvl);
  for (let t = 0; t < 12; t++) {
    const sim = st.guards[0];
    const ref = G.guardAt(lvl, 0, t);
    assert.deepStrictEqual(
      { x: sim.x, y: sim.y, facing: sim.facing }, ref, 'turn ' + t);
    G.takeTurn(st, { wait: true });
  }
});

test('serialize/restore round-trips state', () => {
  const lvl = testLevel({
    grid: [
      '#########',
      '#P.....E#',
      '#########'
    ],
    guards: [{ route: ping(5, 1, 7, 1) }]
  });
  const st = G.createGame(lvl);
  G.takeTurn(st, { dx: 1, dy: 0 });
  G.takeTurn(st, { dx: 1, dy: 0 });
  const snap = G.serialize(st);
  const before = { x: st.player.x, y: st.player.y, turn: st.turn };
  G.takeTurn(st, { dx: 1, dy: 0 });
  G.restore(st, snap);
  assert.strictEqual(st.player.x, before.x);
  assert.strictEqual(st.player.y, before.y);
  assert.strictEqual(st.turn, before.turn);
});

// ---------- listeners: guards that turn toward nearby movement ----------

// Room with a wall at (3,1): a listener at (5,1) can hear the player at
// (2,1) but its turned beam is blocked by the wall.
function listenerLevel(extra) {
  return testLevel(Object.assign({
    grid: [
      '#########',
      '#P.#....#',
      '#.......#',
      '#......E#',
      '#########'
    ],
    guards: [{ route: [[5, 1]], type: 'listener', hearing: 3 }]
  }, extra));
}

test('listener: a move in earshot makes it snap to face the sound', () => {
  const st = G.createGame(listenerLevel());
  const g = st.guards[0];
  assert.strictEqual(g.alerted, false);
  assert.deepStrictEqual(g.facing, { x: 1, y: 0 }); // stationary guard: east
  // step east into (2,1): 3 tiles away -> heard, wall blocks the stare
  const consumed = G.takeTurn(st, { dx: 1, dy: 0 });
  assert.strictEqual(consumed, true);
  assert.strictEqual(st.status, 'playing', 'wall blocks the turned beam');
  assert.strictEqual(g.alerted, true);
  assert.deepStrictEqual(g.facing, { x: -1, y: 0 }); // faced west toward (2,1)
  assert.ok(st.revealed['4,1'], 'the stare lit the floor between the walls');
});

test('listener: the stare clears on its next step; waiting is silent', () => {
  const st = G.createGame(listenerLevel());
  const g = st.guards[0];
  G.takeTurn(st, { dx: 1, dy: 0 }); // heard, stared west
  assert.strictEqual(g.alerted, true);
  G.takeTurn(st, { wait: true }); // wait makes no sound; step resets facing
  assert.strictEqual(g.alerted, false);
  assert.deepStrictEqual(g.facing, { x: 1, y: 0 });
});

test('listener: a move out of earshot makes no sound', () => {
  const st = G.createGame(testLevel({
    grid: [
      '##########',
      '#P......E#',
      '##########'
    ],
    guards: [{ route: [[7, 1]], type: 'listener', hearing: 2 }]
  }));
  const g = st.guards[0];
  G.takeTurn(st, { dx: 1, dy: 0 }); // (2,1): 5 away > hearing 2
  assert.strictEqual(g.alerted, false);
  assert.deepStrictEqual(g.facing, { x: 1, y: 0 });
});

test('listener: turning toward a move with line of sight is fatal', () => {
  const st = G.createGame(testLevel({
    grid: [
      '#########',
      '#P.....E#',
      '#########'
    ],
    guards: [{ route: [[5, 1]], type: 'listener', hearing: 3 }]
  }));
  // (2,1) is 3 away: heard. The east-facing beam never touched (2,1), but
  // the listener turns west and the stare sweeps the player up.
  G.takeTurn(st, { dx: 1, dy: 0 });
  assert.strictEqual(st.status, 'caught');
});

test('soundFacing: larger axis wins, horizontal breaks ties', () => {
  const g = { x: 5, y: 3, facing: { x: 1, y: 0 } };
  assert.deepStrictEqual(G.soundFacing(g, 8, 4), { x: 1, y: 0 }); // east
  assert.deepStrictEqual(G.soundFacing(g, 2, 4), { x: -1, y: 0 }); // west
  assert.deepStrictEqual(G.soundFacing(g, 6, 6), { x: 0, y: 1 }); // south
  assert.deepStrictEqual(G.soundFacing(g, 4, 0), { x: 0, y: -1 }); // north
  assert.deepStrictEqual(G.soundFacing(g, 3, 1), { x: -1, y: 0 }); // diagonal tie -> horizontal
  assert.deepStrictEqual(G.soundFacing(g, 5, 3), { x: 1, y: 0 }); // same tile: keep facing
});

test('listener: solver model matches the live game (replay wins)', () => {
  // Player starts one row below the patrol row with hearing 2, so early
  // moves are heard and the stare sweeps the beam across the adjacent row
  // (now including the diagonal edge tiles). The solution ducks to the far
  // lane, dashes east, and climbs back at the exit. The BFS must model
  // hearing to survive the start and the replay must match it.
  const lvl = testLevel({
    grid: [
      '#########',
      '#.......#',
      '#.......#',
      '#P.....E#',
      '#.......#',
      '#.......#',
      '#########'
    ],
    guards: [{ route: ping(3, 2, 6, 2, 1), type: 'listener', hearing: 2 }]
  });
  const path = G.solve(lvl);
  assert.ok(path, 'should be solvable');
  const st = G.createGame(lvl);
  for (const a of path) G.takeTurn(st, a);
  assert.strictEqual(st.status, 'won');
});

test('moving-wall theorem: a swept lane needs pillar shadows to be crossable', () => {
  // Two listeners sweeping a shared street make the lanes one and two rows
  // off it a continuous wall of beam + hearing + stare (see NOTES dead ends).
  // The identical room WITHOUT pillars must be unsolvable; with the pillar
  // rows of level 8 it becomes solvable — the shadows are load-bearing, not
  // decoration.
  const guards = [
    { route: ping(2, 3, 6, 3, 1), type: 'listener', hearing: 2 },
    { route: ping(12, 3, 8, 3, 1), type: 'listener', hearing: 2 }
  ];
  const bare = testLevel({
    grid: [
      '###############',
      '#P............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#............E#',
      '###############'
    ],
    guards: guards
  });
  assert.strictEqual(G.solve(bare), null, 'no pillars: the lane is an impassable wall');
  const pillared = testLevel({
    grid: [
      '###############',
      '#P............#',
      '#.#..#..#..#..#',
      '#.............#',
      '#..#..#..#..#.#',
      '#............E#',
      '###############'
    ],
    guards: guards
  });
  const path = G.solve(pillared);
  assert.ok(path, 'pillars: solvable through the shadows');
  const st = G.createGame(pillared);
  for (const a of path) G.takeTurn(st, a);
  assert.strictEqual(st.status, 'won');
});

test('every level: routes are valid floor walks', () => {
  for (const lvl of LEVELS) {
    const st = G.createGame(lvl);
    for (const g of lvl.guards) {
      for (let i = 0; i < g.route.length; i++) {
        const [x, y] = g.route[i];
        assert.ok(!G.isWall(st, x, y),
          lvl.name + ': route tile ' + x + ',' + y + ' is a wall');
        const [nx, ny] = g.route[(i + 1) % g.route.length];
        const dist = Math.abs(nx - x) + Math.abs(ny - y);
        assert.ok(dist <= 1,
          lvl.name + ': route jumps at ' + x + ',' + y);
      }
    }
  }
});

test('every level: solvable, and the solution replays in the real game', () => {
  for (const lvl of LEVELS) {
    const path = G.solve(lvl);
    assert.ok(path, lvl.name + ': unsolvable');
    const st = G.createGame(lvl);
    for (const a of path) G.takeTurn(st, a);
    assert.strictEqual(st.status, 'won',
      lvl.name + ': replay of solution did not win');
  }
});

test('classifySwipe: swipes map to the dominant axis, small moves are taps', () => {
  assert.deepStrictEqual(G.classifySwipe(60, 8), { dx: 1, dy: 0 });
  assert.deepStrictEqual(G.classifySwipe(-60, -8), { dx: -1, dy: 0 });
  assert.deepStrictEqual(G.classifySwipe(8, 60), { dx: 0, dy: 1 });
  assert.deepStrictEqual(G.classifySwipe(-8, -60), { dx: 0, dy: -1 });
  assert.deepStrictEqual(G.classifySwipe(3, -2), { wait: true }, 'below threshold is a tap');
  assert.deepStrictEqual(G.classifySwipe(0, 0), { wait: true });
  assert.deepStrictEqual(G.classifySwipe(40, -40), { dx: 1, dy: 0 }, 'tie goes horizontal');
  assert.deepStrictEqual(G.classifySwipe(30, 0, 40), { wait: true }, 'custom threshold');
  assert.deepStrictEqual(G.classifySwipe(50, 0, 40), { dx: 1, dy: 0 });
});

test('classifySwipe: results are valid actions for takeTurn', () => {
  const st = G.createGame(testLevel({}));
  assert.ok(G.takeTurn(st, G.classifySwipe(50, 4)), 'right swipe consumed the turn');
  assert.strictEqual(st.player.x, 2);
  assert.ok(G.takeTurn(st, G.classifySwipe(0, 0)), 'tap (wait) consumed the turn');
  assert.strictEqual(st.player.x, 2, 'tap did not move the player');
});

// ---------- level 10: The Black Hall (stare as a light source) ----------
//
// The gimmick: a listener whose hearing (4) reaches as far as its sight.
// From the dark hall (rows 4-5, unreachable by the patrol beam) you can
// move in earshot but outside the stare's reach: it snaps to face you and
// its beam falls down its column, lighting the hall for one beat. The
// solver cannot verify the player NEEDS the light (it has full info), so
// these tests pin the design-inspection properties: the hall is dark in
// every patrol phase, the trigger ring is heard-but-unlit, and a lured
// stare is the only thing that lights the exit.

const hall = LEVELS.find(l => l.name.indexOf('Black Hall') >= 0);

test('black hall: the dark zone and the exit are dark in every patrol phase', () => {
  assert.ok(hall, 'level 10 exists');
  const g0 = hall.guards[0];
  assert.strictEqual(g0.type, 'listener');
  assert.strictEqual(g0.hearing, 4, 'hearing must match sight range for the trick');
  const st = G.createGame(hall);
  const cycle = G.cycleLength(hall);
  for (let t = 0; t < cycle; t++) {
    const gp = G.guardAt(hall, 0, t);
    const cone = G.coneOf(st, gp);
    for (const c of cone) {
      assert.ok(c.y <= 3,
        'phase ' + t + ': patrol beam leaked into the dark hall at ' + c.x + ',' + c.y);
    }
  }
});

test('black hall: heard-but-unseen trigger ring (move = flash, not death)', () => {
  const st = G.createGame(hall);
  const g = st.guards[0];
  g.x = 8; g.y = 1; // any street column; geometry is translation-invariant here
  const south = { x: 0, y: 1 };
  const staredAt = (x, y) =>
    G.coneOf(st, { x: 8, y: 1, facing: south }).some(t => t.x === x && t.y === y);
  // Row 5 (dy=4): lateral 1..3 is heard AND outside the stare (the safe
  // trigger zone); lateral 0 is directly beneath and lethal; lateral 5 is
  // out of earshot (no flash at all).
  for (const dx of [1, 2, 3]) {
    assert.ok(G.hears(g, 8 + dx, 5), 'dx=' + dx + ' is heard');
    assert.ok(!staredAt(8 + dx, 5), 'dx=' + dx + ' survives the stare');
  }
  assert.ok(G.hears(g, 8, 5), 'directly beneath is heard');
  assert.ok(staredAt(8, 5), 'directly beneath dies to the stare');
  assert.ok(!G.hears(g, 13, 5), 'dx=5 is out of earshot');
});

test('black hall: the exit is invisible until a lured stare lights it', () => {
  const st = G.createGame(hall);
  const cycle = G.cycleLength(hall);
  for (let t = 0; t < cycle; t++) {
    const gp = G.guardAt(hall, 0, t);
    const lit = G.coneOf(st, gp).some(c => c.x === 13 && c.y === 4);
    assert.ok(!lit, 'phase ' + t + ': exit visible without a stare');
  }
  // A south stare from columns 11-13 reaches (13,4): stand at row 5 within
  // lateral 3 of the guard, move, and the flash reveals the exit.
  for (const gx of [11, 12, 13]) {
    const lit = G.coneOf(st, { x: gx, y: 1, facing: { x: 0, y: 1 } })
      .some(c => c.x === 13 && c.y === 4);
    assert.ok(lit, 'stare from x=' + gx + ' lights the exit');
  }
});

// ---------- level 11: The Lighthouse (two bells, two blind spots) ----------
//
// Two h4 listeners on PERPENDICULAR streets: one patrols the top row, one
// the left column. Their patrol beams never reach the hall (rows 4-5 from
// col 6 east, cols 2-5 below the wedges), so the only light there is a
// lured stare — and each guard's stare is the ONLY light for a region the
// other can never reach: the top guard's column flashes light the exit at
// (13,5) but the left guard's reach ends at column 5; the left guard's row
// flashes light (5,5), which no top-guard stare can (its column-5 flash
// dies on the pillar at (5,3), and the quarter-disc reach forbids the
// diagonal ones). Same soft-necessity bar as level 10: the solver proves
// the level winnable in the dark; these tests pin that the light only
// exists if you ring a bell.

const lighthouse = LEVELS.find(l => l.name.indexOf('Lighthouse') >= 0);

test('lighthouse: two h4 listeners; the hall is dark in every patrol phase', () => {
  assert.ok(lighthouse, 'level 11 exists');
  for (const g of lighthouse.guards) {
    assert.strictEqual(g.type, 'listener');
    assert.strictEqual(g.hearing, 4, 'hearing must match sight range to be ringable');
  }
  const st = G.createGame(lighthouse);
  const cycle = G.cycleLength(lighthouse);
  for (let t = 0; t < cycle; t++) {
    for (let gi = 0; gi < 2; gi++) {
      for (const c of G.coneOf(st, G.guardAt(lighthouse, gi, t))) {
        assert.ok(!(c.y >= 4 && c.x >= 6),
          'phase ' + t + ' guard ' + gi + ': patrol beam leaked into the hall at ' + c.x + ',' + c.y);
      }
    }
  }
});

test('lighthouse: the exit is invisible until the top guard is rung from column 13', () => {
  const st = G.createGame(lighthouse);
  const cycle = G.cycleLength(lighthouse);
  for (let t = 0; t < cycle; t++) {
    for (let gi = 0; gi < 2; gi++) {
      const lit = G.coneOf(st, G.guardAt(lighthouse, gi, t)).some(c => c.x === 13 && c.y === 5);
      assert.ok(!lit, 'phase ' + t + ' guard ' + gi + ': exit visible without a stare');
    }
  }
  // Only a south stare from column 13 reaches (13,5): the quarter-disc dies
  // at d2 > 16, so column-12 and column-11 stares miss it, and the left
  // guard's east stare tops out at column 5.
  const south = { x: 0, y: 1 };
  const lights = [];
  for (let a = 2; a <= 13; a++) {
    if (G.coneOf(st, { x: a, y: 1, facing: south }).some(c => c.x === 13 && c.y === 5)) lights.push(a);
  }
  assert.deepStrictEqual(lights, [13]);
});

test('lighthouse: heard-but-unseen trigger ring along row 5', () => {
  const st = G.createGame(lighthouse);
  const g = { type: 'listener', hearing: 4, x: 13, y: 1 };
  const south = { x: 0, y: 1 };
  const staredAt = (x, y) =>
    G.coneOf(st, { x: 13, y: 1, facing: south }).some(t => t.x === x && t.y === y);
  // Row 5 (dy=4): lateral 1..4 west of the column is heard and outside the
  // stare (d2 > 16); lateral 0 is directly beneath and lethal; lateral 5 is
  // out of earshot, so no flash at all.
  for (const dx of [1, 2, 3, 4]) {
    assert.ok(G.hears(g, 13 - dx, 5), 'dx=' + dx + ' is heard');
    assert.ok(!staredAt(13 - dx, 5), 'dx=' + dx + ' survives the stare');
  }
  assert.ok(G.hears(g, 13, 5), 'directly beneath is heard');
  assert.ok(staredAt(13, 5), 'directly beneath dies to the stare');
  assert.ok(!G.hears(g, 8, 5), 'dx=5 is out of earshot');
});

test('lighthouse: (5,5) is a blind spot only the OTHER guard can light', () => {
  const st = G.createGame(lighthouse);
  const cycle = G.cycleLength(lighthouse);
  // Never lit by any patrol phase...
  for (let t = 0; t < cycle; t++) {
    for (let gi = 0; gi < 2; gi++) {
      const lit = G.coneOf(st, G.guardAt(lighthouse, gi, t)).some(c => c.x === 5 && c.y === 5);
      assert.ok(!lit, 'phase ' + t + ' guard ' + gi + ': (5,5) lit without a stare');
    }
  }
  // ...no top-guard south stare can reach it (column 5 is blocked by the
  // pillar at (5,3); the diagonals are past the quarter-disc)...
  const south = { x: 0, y: 1 };
  for (let a = 2; a <= 13; a++) {
    const lit = G.coneOf(st, { x: a, y: 1, facing: south }).some(c => c.x === 5 && c.y === 5);
    assert.ok(!lit, 'top-guard stare from column ' + a + ' must not light (5,5)');
  }
  // ...but the left guard, rung from (5,5) itself, stares east and lights it.
  assert.ok(G.hears({ type: 'listener', hearing: 4, x: 1, y: 5 }, 5, 5), 'the left guard hears it');
  assert.ok(
    G.coneOf(st, { x: 1, y: 5, facing: { x: 1, y: 0 } }).some(c => c.x === 5 && c.y === 5),
    'the east stare lights (5,5)'
  );
});

// ---------- level 12: The Wake (the beam is a moving wall; the wake is the road) ----------
//
// Two watchers patrol two 5-row streets. A ±45°/range-4 beam fills a 5-row
// street wall to wall two columns ahead of its guard, so a street can never
// be crossed in front of the beam — the only dark road on a swept street is
// the guard's own wake (coneOf skips dot<0, so the whole rear half-plane is
// dark). The U-shaped hall chains two rides: ride the lower guard west,
// hide in the left well while the return sweep passes, ride the upper guard
// east, and dive the exit the beat after its turn. The solver proves the
// ride exists; these tests pin that there is nothing but the ride.

const wake = LEVELS.find(l => l.name.indexOf('Wake') >= 0);

test('wake: two watchers; every street is swept wall to wall', () => {
  assert.ok(wake, 'level 12 exists');
  for (const g of wake.guards) {
    assert.notStrictEqual(g.type, 'listener', 'wake riding needs watchers (a listener hears the rider)');
  }
  const st = G.createGame(wake);
  const cycle = G.cycleLength(wake);
  for (let t = 0; t < cycle; t++) {
    for (let gi = 0; gi < 2; gi++) {
      const gp = G.guardAt(wake, gi, t);
      const cone = G.coneOf(st, gp);
      const has = (x, y) => cone.some(c => c.x === x && c.y === y);
      // the two columns directly ahead are lit across the full street width:
      // the beam is a full-width wall, there is no gap to slip through
      for (const dx of [2, 3]) {
        for (let dy = -2; dy <= 2; dy++) {
          const x = gp.x + gp.facing.x * dx, y = gp.y + dy;
          if (G.isWall(st, x, y)) continue;
          assert.ok(has(x, y),
            'phase ' + t + ' guard ' + gi + ': gap in the wall at ' + x + ',' + y);
        }
      }
    }
  }
});

test('wake: the wake is a road — the rear half-plane of each guard is dark', () => {
  const st = G.createGame(wake);
  const cycle = G.cycleLength(wake);
  for (let t = 0; t < cycle; t++) {
    for (let gi = 0; gi < 2; gi++) {
      const gp = G.guardAt(wake, gi, t);
      const cone = G.coneOf(st, gp);
      const has = (x, y) => cone.some(c => c.x === x && c.y === y);
      for (let k = 1; k <= 4; k++) {
        for (let dy = -2; dy <= 2; dy++) {
          const x = gp.x - gp.facing.x * k, y = gp.y + dy;
          if (G.isWall(st, x, y)) continue;
          assert.ok(!has(x, y),
            'phase ' + t + ' guard ' + gi + ': wake lit at ' + x + ',' + y);
        }
      }
    }
  }
});

test('wake: the exit is a flip gate — lit on approach, dark only after the turn', () => {
  const st = G.createGame(wake);
  // Upper guard A = ping(2,3,12,3,1): t8 (10,3) east, t9 (11,3) east,
  // t10-11 (12,3) west. The exit (12,2) and the rider's survival tile
  // (12,4) sit in the dot=0 column: lethal all the way up, safe only once
  // the guard has arrived and turned.
  for (const t of [8, 9]) {
    const gp = G.guardAt(wake, 0, t);
    assert.strictEqual(gp.facing.x, 1, 'guard approaches facing east at t' + t);
    assert.ok(G.coneOf(st, gp).some(c => c.x === 12 && c.y === 2),
      'exit lit on approach at t' + t);
  }
  for (const t of [10, 11]) {
    const gp = G.guardAt(wake, 0, t);
    assert.strictEqual(gp.facing.x, -1, 'guard has turned at t' + t);
    assert.ok(!G.coneOf(st, gp).some(c => c.x === 12 && c.y === 2),
      'exit dark after the turn at t' + t);
    assert.ok(!G.coneOf(st, gp).some(c => c.x === 12 && c.y === 4),
      'rider tile below the guard dark after the turn at t' + t);
  }
});

test('wake: the well core is never lit — a pure waiting room between streets', () => {
  const st = G.createGame(wake);
  const cycle = G.cycleLength(wake);
  for (let t = 0; t < cycle; t++) {
    for (let gi = 0; gi < 2; gi++) {
      for (const [x, y] of [[1, 6], [2, 6]]) {
        assert.ok(!G.coneOf(st, G.guardAt(wake, gi, t)).some(c => c.x === x && c.y === y),
          'phase ' + t + ' guard ' + gi + ': well tile ' + x + ',' + y + ' lit');
      }
    }
  }
});

test('wake: the escape is a long ride — no shortcut exists', () => {
  const sol = G.solve(wake);
  assert.ok(sol, 'level 12 solvable');
  assert.ok(sol.length >= 30,
    'the shortest escape must be a multi-leg ride (solver found ' + sol.length + ')');
});

// ---------- level 13: The Belfry (two bells, one pillar) ----------
//
// Two listeners on PERPENDICULAR streets, hearing SMALLER than sight (2 and
// 3): a bell rung in the open dies to its own summoned stare (the stare
// points at the ringer and, with hearing <= sight, always reaches). So each
// bell tile must be heard-but-blocked: a pillar on the rounded midpoint of
// the guard->ringer sight line. The pillar at (3,2) does double duty — it
// blocks the watcher's south stare from (3,3)/(2,3) and the listener's east
// stare from (4,2)/(4,1) (the (1,3)->(4,2) line rounds through it). The
// chain: every tile that rings the watcher south sits in columns 1-3, the
// listener's own beam band; every tile that rings the listener along row 3
// sits in rows 1-3, the watcher's sweep. Each bell is a moving pocket of the
// OTHER guard's beam — two bells timed against each other. The pillar at
// (2,6) gates the final step: it blocks the listener's north stare from its
// south end, so the exit tile is steppable only while the listener sits
// turned at the bottom of its street.

const belfry = LEVELS.find(l => l.name.indexOf('Belfry') >= 0);

// Tiles from which a MOVE would ring guard gi into `dir` and survive it:
// floor, within hearing, soundFacing == dir, and NOT lit by that stare cone.
function ringTiles(level, gi, dir) {
  const st = G.createGame(level);
  const g = level.guards[gi];
  const hearing = g.hearing == null ? 3 : g.hearing;
  const out = [];
  const seenPos = new Set();
  for (const pos of g.route) {
    const pk = pos.join(',');
    if (seenPos.has(pk)) continue;
    seenPos.add(pk);
    const stare = new Set(
      G.coneOf(st, { x: pos[0], y: pos[1], facing: dir }).map(c => c.x + ',' + c.y));
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      if (G.isWall(st, x, y)) continue;
      if (Math.max(Math.abs(x - pos[0]), Math.abs(y - pos[1])) > hearing) continue;
      const f = G.soundFacing({ x: pos[0], y: pos[1], facing: { x: 1, y: 0 } }, x, y);
      if (f.x !== dir.x || f.y !== dir.y) continue;
      if (stare.has(x + ',' + y)) continue;
      out.push({ gx: pos[0], gy: pos[1], x: x, y: y });
    }
  }
  return out;
}

test('belfry: the watcher\'s bell tiles all stand in the listener\'s beam band', () => {
  assert.ok(belfry, 'level 13 exists');
  const rings = ringTiles(belfry, 0, { x: 0, y: 1 });
  const tiles = [...new Set(rings.map(r => r.x + ',' + r.y))].sort();
  assert.deepStrictEqual(tiles, ['2,3', '3,3'],
    'exactly two bell tiles, both shielded by the pillar at (3,2)');
  for (const r of rings) {
    assert.ok(r.x <= 3, 'bell tile ' + r.x + ',' + r.y + ' must sit in the listener\'s band (cols 1-3)');
  }
  // The rung stare is the only light on the exit: a south stare from (2,1)
  // lights (2,5) — and the pillar keeps it from killing the ringer at (3,3).
  const st = G.createGame(belfry);
  assert.ok(G.coneOf(st, { x: 2, y: 1, facing: { x: 0, y: 1 } })
    .some(c => c.x === 2 && c.y === 5), 'the column-2 flash lights the exit');
  assert.ok(!G.coneOf(st, { x: 2, y: 1, facing: { x: 0, y: 1 } })
    .some(c => c.x === 3 && c.y === 3), 'the pillar shields the ringer at (3,3)');
});

test('belfry: the listener\'s row-3 bell tiles stand in the watcher\'s sweep rows', () => {
  const rings = ringTiles(belfry, 1, { x: 1, y: 0 });
  // The flash that matters lights row 3 (the crossing row, the watcher's
  // bell tile at (3,3), out to (5,3)); it needs the listener at (1,3).
  const row3 = rings.filter(r => r.gy === 3).map(r => r.x + ',' + r.y).sort();
  // In the watcher's sweep rows (1-3) the ring tiles are exactly the two
  // crossing tiles, shielded via the (3,2) midpoint rounding: the crossing
  // step IS the bell ring. The column-4 tiles (4,4),(4,5) also ring it from
  // the listener's own gate column — every ring sits in a guard's beam zone.
  assert.deepStrictEqual(row3.filter(s => Number(s[0]) <= 4 && Number(s.split(',')[1]) <= 3).sort(),
    ['4,1', '4,2']);
  assert.deepStrictEqual(row3, ['4,1', '4,2', '4,4', '4,5']);
  for (const r of rings.filter(r => r.gy === 3 && r.y <= 3)) {
    assert.ok(r.x === 4, 'sweep-row ring tile must be on the crossing column');
  }
  const st = G.createGame(belfry);
  const east = G.coneOf(st, { x: 1, y: 3, facing: { x: 1, y: 0 } });
  for (const x of [2, 3, 4, 5]) {
    assert.ok(east.some(c => c.x === x && c.y === 3), 'row-3 flash reaches column ' + x);
  }
  // Only the (1,3) stare reaches (5,3): rows 2 and 4 are past the disc.
  for (const gy of [2, 4]) {
    assert.ok(!G.coneOf(st, { x: 1, y: gy, facing: { x: 1, y: 0 } })
      .some(c => c.x === 5 && c.y === 3), 'row ' + gy + ' stare must not reach (5,3)');
  }
});

test('belfry: the exit is never lit by the watcher; the listener grazes it at four pinned beats', () => {
  const st = G.createGame(belfry);
  const cycle = G.cycleLength(belfry);
  const tease = [];
  for (let t = 0; t < cycle; t++) {
    assert.ok(!G.coneOf(st, G.guardAt(belfry, 0, t)).some(c => c.x === 2 && c.y === 5),
      'phase ' + t + ': the watcher lit the exit without being rung');
    if (G.coneOf(st, G.guardAt(belfry, 1, t)).some(c => c.x === 2 && c.y === 5)) tease.push(t);
  }
  // B's beam grazes the door on its way past (row 6 north, rows 2-4 south);
  // the pillar at (2,6) kills the rows 7-8 grazes. A one-tile glimpse,
  // never the way there.
  assert.deepStrictEqual(tease, [1, 5, 6, 7]);
});

test('belfry: the final step is survivable only at the listener\'s south end', () => {
  const cycle = G.cycleLength(belfry);
  const safe = [];
  for (let t = 0; t < cycle; t++) {
    const st = G.createGame(belfry);
    for (let i = 0; i < t; i++) G.takeTurn(st, { wait: true }); // waits are silent
    st.player = { x: 3, y: 5 };
    G.takeTurn(st, { dx: -1, dy: 0 }); // step onto the exit
    if (st.status !== 'caught') safe.push(t);
  }
  // t9-12: the listener is at rows 6-8 (its south end). Facing south the
  // door is behind its beam; facing north its stare at the door is blocked
  // by the pillar at (2,6). Everywhere else the hear-and-stare reaches the
  // door (adjacent diagonals cannot be blocked).
  assert.deepStrictEqual(safe, [9, 10, 11, 12]);
});

// ---------- ghost: best-run recording ----------

test('ghost: encodeRun/decodeRun round-trip', () => {
  const path = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 7 }];
  assert.deepStrictEqual(G.decodeRun(G.encodeRun(path)), path);
});

test('ghost: decodeRun rejects malformed storage instead of crashing', () => {
  const bad = ['', 'x,y', '1,,2', '1.5,2', '1', ';', '1,2;', 'a,b', ' , ', null, 42, undefined, {}];
  for (const s of bad) {
    assert.strictEqual(G.decodeRun(s), null, 'must reject ' + JSON.stringify(s));
  }
});

test('ghost: isBetterRun keeps the incumbent on ties', () => {
  assert.strictEqual(G.isBetterRun({ turns: 5 }, null), true);
  assert.strictEqual(G.isBetterRun(null, { turns: 5 }), false);
  assert.strictEqual(G.isBetterRun({ turns: 5 }, { turns: 5 }), false);
  assert.strictEqual(G.isBetterRun({ turns: 4 }, { turns: 5 }), true);
  assert.strictEqual(G.isBetterRun({ turns: 6 }, { turns: 5 }), false);
});

test('ghost: replay of a solver solution wins on every level', () => {
  for (const lvl of LEVELS) {
    const sol = G.solve(lvl);
    assert.ok(sol, lvl.name + ': solvable');
    const moves = sol.map(a =>
      a.wait ? 'w' : a.dx === 1 ? 'r' : a.dx === -1 ? 'l' : a.dy === 1 ? 'd' : 'u').join('');
    const r = G.replay(lvl, moves);
    assert.strictEqual(r.status, 'won', lvl.name + ': replay wins');
    assert.strictEqual(r.turns, sol.length, lvl.name + ': turn count');
    assert.strictEqual(r.path.length, sol.length + 1, lvl.name + ': path has turn 0');
    assert.deepStrictEqual(r.path[r.path.length - 1], G.createGame(lvl).exit,
      lvl.name + ': ends on the exit');
  }
});

test('ghost: replay path steps are waits or single steps; free bumps add none', () => {
  const lvl = testLevel({ guards: [] });
  // 'l' bumps the wall at (0,1): free, no turn, no path entry.
  const r = G.replay(lvl, 'lrr');
  assert.strictEqual(r.turns, 2);
  assert.deepStrictEqual(r.path, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
  for (let i = 1; i < r.path.length; i++) {
    const d = Math.abs(r.path[i].x - r.path[i - 1].x) + Math.abs(r.path[i].y - r.path[i - 1].y);
    assert.ok(d <= 1, 'step ' + i + ' must not jump');
  }
});

// ---------- heard feedback (anyAlerted) ----------

// Room split by a wall column at x=3 (rows 1..5). A listener at (5,3) with
// hearing 3 hears the player at (2,3) through the wall, but its west stare
// is blocked by it — the exact "heard but not seen" case the ripple is for.
function heardLevel(type) {
  return testLevel({
    grid: [
      '###########',
      '#P.#......#',
      '#..#......#',
      '#..#..E...#',
      '#..#......#',
      '#..#......#',
      '###########'
    ],
    guards: [{ route: [[5, 3]], type: type, hearing: 3 }]
  });
}

test('heard: anyAlerted is true exactly on the turn a listener hears the move', () => {
  const st = G.createGame(heardLevel('listener'));
  assert.strictEqual(G.anyAlerted(st), false, 'start: nobody heard anything');
  G.takeTurn(st, { dx: 0, dy: 1 }); // (1,2): Chebyshev 4 from (5,3) -> silent
  assert.strictEqual(G.anyAlerted(st), false, 'out of earshot');
  G.takeTurn(st, { dx: 0, dy: 1 }); // (1,3): still 4 -> silent
  assert.strictEqual(G.anyAlerted(st), false, 'still out of earshot');
  G.takeTurn(st, { dx: 1, dy: 0 }); // (2,3): distance 3 -> heard, stare blocked
  assert.strictEqual(st.status, 'playing', 'the wall blocks the stare');
  assert.strictEqual(G.anyAlerted(st), true, 'heard this turn');
  G.takeTurn(st, { wait: true }); // waiting is silent and clears the stare
  assert.strictEqual(G.anyAlerted(st), false, 'cleared on the next turn');
  G.takeTurn(st, { dx: -1, dy: 0 }); // (1,3): back out of earshot
  assert.strictEqual(G.anyAlerted(st), false, 'unheard again');
});

test('heard: a watcher never alerts', () => {
  const st = G.createGame(heardLevel('watcher'));
  G.takeTurn(st, { dx: 0, dy: 1 });
  G.takeTurn(st, { dx: 0, dy: 1 });
  G.takeTurn(st, { dx: 1, dy: 0 }); // right next to the wall, 3 from the watcher
  assert.strictEqual(G.anyAlerted(st), false);
});

test('heard: anyAlerted survives the undo round-trip', () => {
  const st = G.createGame(heardLevel('listener'));
  G.takeTurn(st, { dx: 0, dy: 1 });
  G.takeTurn(st, { dx: 0, dy: 1 });
  G.takeTurn(st, { dx: 1, dy: 0 });
  const snap = G.serialize(st);
  assert.strictEqual(G.anyAlerted(st), true);
  G.takeTurn(st, { wait: true });
  assert.strictEqual(G.anyAlerted(st), false, 'wait clears it');
  G.restore(st, snap);
  assert.strictEqual(G.anyAlerted(st), true, 'undo restores the heard state');
});

// ---------- earshot (heartbeat cue) ----------

test('earshot: 0 for watchers and outside every listener range', () => {
  const w = G.createGame(heardLevel('watcher'));
  assert.strictEqual(G.earshot(w), 0, 'watchers have no ears');
  const st = G.createGame(heardLevel('listener')); // listener (5,3), h3
  st.player = { x: 1, y: 1 }; // Chebyshev 4 from (5,3) -> silent
  assert.strictEqual(G.earshot(st), 0);
  st.player = { x: 2, y: 3 }; // distance 3 -> the very edge of hearing
  assert.ok(G.earshot(st) > 0, 'edge of earshot still counts');
});

test('earshot: rises monotonically toward the listener, stays 0..1', () => {
  const st = G.createGame(heardLevel('listener')); // listener (5,3), h3
  let prev = 0;
  for (let x = 2; x <= 4; x++) { // x=2 is the edge of hearing (d=3)
    st.player = { x: x, y: 3 };
    const e = G.earshot(st);
    assert.ok(e > prev, 'closer means louder at x=' + x);
    prev = e;
  }
  assert.ok(prev <= 1, 'proximity stays within 0..1');
});

test('earshot: walls do not muffle — it matches hears tile for tile', () => {
  const st = G.createGame(heardLevel('listener')); // wall column at x=3
  const g = st.guards[0];
  for (let x = 1; x <= 9; x++) {
    for (let y = 1; y <= 5; y++) {
      st.player = { x: x, y: y };
      assert.strictEqual(G.earshot(st) > 0, G.hears(g, x, y),
        'earshot agrees with hears at ' + x + ',' + y);
    }
  }
});

test('earshot: the nearest listener wins when two overlap', () => {
  const st = G.createGame(testLevel({
    guards: [
      { route: [[3, 1]], type: 'listener', hearing: 2 },
      { route: [[8, 1]], type: 'listener', hearing: 4 }
    ]
  }));
  st.player = { x: 4, y: 1 }; // 1 from the h2 (2/3), 4 from the h4 (1/5)
  assert.ok(Math.abs(G.earshot(st) - 2 / 3) < 1e-9);
  st.player = { x: 6, y: 1 }; // 3 from the h2 (out), 2 from the h4 (3/5)
  assert.ok(Math.abs(G.earshot(st) - 3 / 5) < 1e-9);
});

// ---------- halls screen (level-select ladder) ----------

test('halls: level 0 always open, level i opens once i-1 is cleared', () => {
  assert.deepStrictEqual(G.unlockedLevels([false, false, false], 3), [true, false, false]);
  assert.deepStrictEqual(G.unlockedLevels([true, false, false], 3), [true, true, false]);
  assert.deepStrictEqual(G.unlockedLevels([true, true, true], 3), [true, true, true]);
  // a cleared level does not skip a rung: the ladder is one step at a time
  assert.deepStrictEqual(G.unlockedLevels([true, false, true], 3), [true, true, false]);
  // a short cleared array reads as "not cleared" for the missing entries
  assert.deepStrictEqual(G.unlockedLevels([true], 3), [true, true, false]);
});

test('halls: firstOpenLevel points at the next uncleared unlocked level', () => {
  assert.strictEqual(G.firstOpenLevel([false, false, false], 3), 0);
  assert.strictEqual(G.firstOpenLevel([true, false, false], 3), 1);
  assert.strictEqual(G.firstOpenLevel([true, true, false], 3), 2);
  // all cleared: back to 0, every door is open by then anyway
  assert.strictEqual(G.firstOpenLevel([true, true, true], 3), 0);
});

test('halls: allCleared flips only when every hall has a best', () => {
  assert.strictEqual(G.allCleared([true, true, true], 3), true);
  assert.strictEqual(G.allCleared([true, true, false], 3), false);
  assert.strictEqual(G.allCleared([true, false, true], 3), false);
  // a short cleared array reads as "not cleared" for the missing entries
  assert.strictEqual(G.allCleared([true, true], 3), false);
  // nothing to clear is not an epilogue
  assert.strictEqual(G.allCleared([], 0), false);
});

test('halls: totalBestTurns sums bests but refuses partial sets', () => {
  assert.strictEqual(G.totalBestTurns([{ turns: 9 }, { turns: 12 }, { turns: 20 }]), 41);
  // a missing best would silently undercount, so the line refuses to render
  assert.strictEqual(G.totalBestTurns([{ turns: 9 }, null, { turns: 20 }]), null);
  assert.strictEqual(G.totalBestTurns([{ turns: 9 }, {}, { turns: 20 }]), null);
  assert.strictEqual(G.totalBestTurns([]), null);
  assert.strictEqual(G.totalBestTurns([{ turns: 0 }]), 0);
});
