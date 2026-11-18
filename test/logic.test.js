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
