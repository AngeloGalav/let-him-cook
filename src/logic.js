/*
 * THEIR EYES — core game logic.
 *
 * Pure, deterministic, DOM-free. Shared by the browser (window.TheirEyes)
 * and the node tests (module.exports).
 *
 * The whole game in one sentence: you can only see what the guards are
 * looking at. Their vision cones are both your eyes and your death.
 */
(function (root) {
  'use strict';

  var CONE_RADIUS = 4;
  var CONE_COS = Math.SQRT1_2; // ±45° wedge
  var TOUCH_RADIUS = 1;        // you can feel walls one tile around you

  // ---------- level parsing ----------

  // Level shape: { name, grid: [strings], guards: [{ route: [[x,y], ...] }] }
  // Grid legend: '#' wall, anything else floor. 'P' marks the player start,
  // 'E' marks the exit.
  function createGame(level) {
    var grid = level.grid;
    var h = grid.length;
    var w = Math.max.apply(null, grid.map(function (r) { return r.length; }));
    var walls = [];
    var player = null;
    var exit = null;
    for (var y = 0; y < h; y++) {
      walls.push([]);
      for (var x = 0; x < w; x++) {
        var c = x < grid[y].length ? grid[y][x] : '#';
        if (c === 'P') player = { x: x, y: y };
        if (c === 'E') exit = { x: x, y: y };
        walls[y].push(c === '#');
      }
    }
    if (!player) throw new Error('level ' + level.name + ': no P');
    if (!exit) throw new Error('level ' + level.name + ': no E');

    var guards = (level.guards || []).map(function (g) {
      var route = g.route.map(function (p) { return { x: p[0], y: p[1] }; });
      if (route.length === 0) throw new Error('level ' + level.name + ': guard with empty route');
      return {
        route: route,
        idx: 0,
        x: route[0].x,
        y: route[0].y,
        facing: nextFacing(route, route[0], 0, { x: 1, y: 0 })
      };
    });

    var state = {
      name: level.name,
      w: w,
      h: h,
      walls: walls,
      player: player,
      exit: exit,
      guards: guards,
      turn: 0,
      status: 'playing', // 'playing' | 'caught' | 'won'
      revealed: {} // "x,y" -> true, persists for the whole level
    };
    reveal(state);
    return state;
  }

  // ---------- geometry ----------

  function isWall(state, x, y) {
    if (x < 0 || y < 0 || x >= state.w || y >= state.h) return true;
    return state.walls[y][x];
  }

  // Direction (axis-aligned) from `from` toward the first route tile after
  // index `idx` that differs from `from`. Falls back to `fallback`.
  function nextFacing(route, from, idx, fallback) {
    for (var k = 1; k <= route.length; k++) {
      var t = route[(idx + k) % route.length];
      if (t.x !== from.x || t.y !== from.y) {
        return { x: Math.sign(t.x - from.x), y: Math.sign(t.y - from.y) };
      }
    }
    return fallback;
  }

  // True if a straight line from (x0,y0) to (x1,y1) (tile centres) passes
  // through no wall other than possibly the endpoints themselves.
  function lineClear(state, x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps <= 1) return true;
    for (var i = 1; i < steps; i++) {
      var x = x0 + (dx * i) / steps;
      var y = y0 + (dy * i) / steps;
      if (isWall(state, Math.round(x), Math.round(y))) return false;
    }
    return true;
  }

  // Tiles a single guard currently sees: a ±45° wedge of range CONE_RADIUS
  // around its facing, walls blocking. Always includes the guard's own tile.
  function coneOf(state, guard) {
    var out = [{ x: guard.x, y: guard.y }];
    var f = guard.facing;
    for (var dy = -CONE_RADIUS; dy <= CONE_RADIUS; dy++) {
      for (var dx = -CONE_RADIUS; dx <= CONE_RADIUS; dx++) {
        if (dx === 0 && dy === 0) continue;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > CONE_RADIUS) continue;
        var dot = (dx * f.x + dy * f.y) / d;
        if (dot < CONE_COS) continue;
        var x = guard.x + dx, y = guard.y + dy;
        if (isWall(state, x, y)) continue;
        if (!lineClear(state, guard.x, guard.y, x, y)) continue;
        out.push({ x: x, y: y });
      }
    }
    return out;
  }

  function cones(state) {
    return state.guards.map(function (g) { return coneOf(state, g); });
  }

  function inCone(state, x, y) {
    var cs = cones(state);
    for (var i = 0; i < cs.length; i++) {
      for (var j = 0; j < cs[i].length; j++) {
        if (cs[i][j].x === x && cs[i][j].y === y) return true;
      }
    }
    return false;
  }

  // ---------- reveal / memory ----------

  function reveal(state) {
    var cs = cones(state);
    for (var i = 0; i < cs.length; i++) {
      for (var j = 0; j < cs[i].length; j++) {
        state.revealed[cs[i][j].x + ',' + cs[i][j].y] = true;
      }
    }
    for (var dy = -TOUCH_RADIUS; dy <= TOUCH_RADIUS; dy++) {
      for (var dx = -TOUCH_RADIUS; dx <= TOUCH_RADIUS; dx++) {
        var x = state.player.x + dx, y = state.player.y + dy;
        if (!isWall(state, x, y)) state.revealed[x + ',' + y] = true;
      }
    }
  }

  // What the renderer should draw at full brightness right now.
  function visibleNow(state) {
    var set = {};
    var cs = cones(state);
    for (var i = 0; i < cs.length; i++) {
      for (var j = 0; j < cs[i].length; j++) {
        set[cs[i][j].x + ',' + cs[i][j].y] = 'light';
      }
    }
    for (var dy = -TOUCH_RADIUS; dy <= TOUCH_RADIUS; dy++) {
      for (var dx = -TOUCH_RADIUS; dx <= TOUCH_RADIUS; dx++) {
        var x = state.player.x + dx, y = state.player.y + dy;
        if (!isWall(state, x, y)) set[x + ',' + y] = set[x + ',' + y] || 'touch';
      }
    }
    return set;
  }

  // ---------- guard movement ----------

  // Guards advance one route step per turn. Facing always points at the next
  // distinct route tile, so a guard pauses (repeated tile) and looks where it
  // is about to walk — a readable tell for the player.
  function stepGuard(state, g) {
    g.idx = (g.idx + 1) % g.route.length;
    var next = g.route[g.idx];
    if (next.x !== g.x || next.y !== g.y) {
      g.x = next.x;
      g.y = next.y;
    }
    g.facing = nextFacing(g.route, g, g.idx, g.facing);
  }

  // ---------- turn resolution ----------

  // action: {dx, dy}, or {wait: true} to pass.
  // Returns true if the turn was consumed (invalid bumps are free).
  function takeTurn(state, action) {
    if (state.status !== 'playing') return false;
    var dx = action.dx || 0, dy = action.dy || 0;
    if (!action.wait) {
      var nx = state.player.x + dx, ny = state.player.y + dy;
      if (isWall(state, nx, ny)) return false;
      state.player = { x: nx, y: ny };
    }
    state.turn++;
    if (inCone(state, state.player.x, state.player.y)) {
      state.status = 'caught';
      reveal(state);
      return true;
    }
    for (var i = 0; i < state.guards.length; i++) stepGuard(state, state.guards[i]);
    if (inCone(state, state.player.x, state.player.y)) {
      state.status = 'caught';
      reveal(state);
      return true;
    }
    if (state.player.x === state.exit.x && state.player.y === state.exit.y) {
      state.status = 'won';
    }
    reveal(state);
    return true;
  }

  // ---------- deterministic guard schedule (used by the solver) ----------

  // Guards are pure functions of the turn count, independent of the player.
  function guardAt(level, guardIdx, turn) {
    var route = level.guards[guardIdx].route.map(function (p) {
      return { x: p[0], y: p[1] };
    });
    var n = route.length;
    var cur = { x: route[0].x, y: route[0].y };
    var idx = 0;
    var facing = nextFacing(route, cur, 0, { x: 1, y: 0 });
    for (var t = 0; t < turn; t++) {
      idx = (idx + 1) % n;
      var next = route[idx];
      if (next.x !== cur.x || next.y !== cur.y) {
        cur = { x: next.x, y: next.y };
      }
      facing = nextFacing(route, cur, idx, facing);
    }
    return { x: cur.x, y: cur.y, facing: facing };
  }

  function cycleLength(level) {
    var n = 1;
    level.guards.forEach(function (g) {
      var m = g.route.length;
      n = (n * m) / gcd(n, m);
    });
    return n;
  }

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  // BFS over (player x, y, turn mod cycle). Proves a level is solvable and
  // returns the shortest action list, or null.
  function solve(level, maxStates) {
    maxStates = maxStates || 400000;
    var st = createGame(level);
    var cycle = cycleLength(level);
    var startKey = st.player.x + ',' + st.player.y + ',0';
    var seen = {};
    seen[startKey] = null; // key -> { from, action }
    var queue = [{ x: st.player.x, y: st.player.y, t: 0 }];
    var actions = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
      { wait: true }
    ];
    var walls = st.walls, w = st.w, h = st.h;
    function wall(x, y) {
      return x < 0 || y < 0 || x >= w || y >= h || walls[y][x];
    }
    // Precompute cones for each guard phase in the cycle.
    var phaseCones = [];
    for (var t = 0; t < cycle; t++) {
      var cs = [];
      for (var gi = 0; gi < level.guards.length; gi++) {
        cs.push(coneOf(st, guardAt(level, gi, t)));
      }
      phaseCones.push(cs);
    }
    function lit(x, y, t) {
      var cs = phaseCones[t % cycle];
      for (var i = 0; i < cs.length; i++) {
        for (var j = 0; j < cs[i].length; j++) {
          if (cs[i][j].x === x && cs[i][j].y === y) return true;
        }
      }
      return false;
    }
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      if (cur.x === st.exit.x && cur.y === st.exit.y) {
        var path = [];
        var k = cur.x + ',' + cur.y + ',' + cur.t;
        while (seen[k]) {
          path.unshift(seen[k].action);
          k = seen[k].from;
        }
        return path;
      }
      for (var ai = 0; ai < actions.length; ai++) {
        var a = actions[ai];
        var nx = a.wait ? cur.x : cur.x + a.dx;
        var ny = a.wait ? cur.y : cur.y + a.dy;
        if (wall(nx, ny)) continue;
        // Same order as takeTurn: player moves while guards are at phase
        // cur.t (stepping into the beam = caught), then guards step to
        // cur.t + 1 and the beam may sweep over the player.
        if (lit(nx, ny, cur.t)) continue;
        if (lit(nx, ny, (cur.t + 1) % cycle)) continue;
        var nt = (cur.t + 1) % cycle;
        var key = nx + ',' + ny + ',' + nt;
        if (seen[key] !== undefined) continue;
        if (Object.keys(seen).length > maxStates) return null;
        seen[key] = { from: cur.x + ',' + cur.y + ',' + cur.t, action: a };
        queue.push({ x: nx, y: ny, t: nt });
      }
    }
    return null;
  }

  // ---------- serialization (undo) ----------

  function serialize(state) {
    return JSON.stringify({
      player: state.player,
      turn: state.turn,
      status: state.status,
      revealed: state.revealed,
      guards: state.guards.map(function (g) {
        return { idx: g.idx, x: g.x, y: g.y, facing: g.facing };
      })
    });
  }

  function restore(state, snapshot) {
    var s = JSON.parse(snapshot);
    state.player = s.player;
    state.turn = s.turn;
    state.status = s.status;
    state.revealed = s.revealed;
    state.guards.forEach(function (g, i) {
      g.idx = s.guards[i].idx;
      g.x = s.guards[i].x;
      g.y = s.guards[i].y;
      g.facing = s.guards[i].facing;
    });
    return state;
  }

  var TheirEyes = {
    CONE_RADIUS: CONE_RADIUS,
    createGame: createGame,
    isWall: isWall,
    coneOf: coneOf,
    cones: cones,
    inCone: inCone,
    visibleNow: visibleNow,
    takeTurn: takeTurn,
    guardAt: guardAt,
    cycleLength: cycleLength,
    solve: solve,
    serialize: serialize,
    restore: restore
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TheirEyes;
  if (typeof window !== 'undefined') window.TheirEyes = TheirEyes;
})(typeof globalThis !== 'undefined' ? globalThis : this);
