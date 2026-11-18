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
  var TOUCH_RADIUS = 1; // you can feel walls one tile around you

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
        facing: nextFacing(route, route[0], 0, { x: 1, y: 0 }),
        type: g.type || 'watcher',
        hearing: g.hearing == null ? 3 : g.hearing,
        alerted: false
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
    var f2 = f.x * f.x + f.y * f.y;
    for (var dy = -CONE_RADIUS; dy <= CONE_RADIUS; dy++) {
      for (var dx = -CONE_RADIUS; dx <= CONE_RADIUS; dx++) {
        if (dx === 0 && dy === 0) continue;
        var d2 = dx * dx + dy * dy;
        if (d2 > CONE_RADIUS * CONE_RADIUS) continue;
        var dot = dx * f.x + dy * f.y;
        if (dot < 0) continue;
        // Exact ±45° wedge with the diagonal edge INCLUDED: the float test
        // dot/d >= 1/sqrt(2) squared into integers, so edge tiles (|dx|==|dy|)
        // are lit at every distance instead of flickering with float noise.
        if (2 * dot * dot < d2 * f2) continue;
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

  // Smooth beam outline for rendering: a polygon fan raycast from the
  // guard's centre across a slightly-widened ±45° wedge. Rays march outward
  // and stop at the first wall face, so the beam reads as a straight-edged
  // light shaft with clean shadows behind pillars and walls. It is a glow,
  // not the kill zone: the exact lethal tiles are the per-tile floor
  // lighting (visibleNow 'light'). The widening and the extra range past
  // the boundary-tile edges keep the glow covering the lethal tiles it
  // reaches; tiles the logic lights only through rounding quirks (grazing a
  // wall corner, or lighting past an unlit tile) are carried by the floor
  // lighting too. Returns { cx, cy, points: [[x, y], ...] } in tile units.
  function coneFan(state, guard) {
    var cx = guard.x + 0.5, cy = guard.y + 0.5;
    var base = Math.atan2(guard.facing.y, guard.facing.x);
    var HALF = Math.PI / 4 + 0.06;        // a hair past the 45° edge tiles
    var R = CONE_RADIUS + 0.6;            // reach the far edge of boundary tiles
    var RAYS = 96, STEP = 0.04;
    var points = [];
    for (var ri = 0; ri <= RAYS; ri++) {
      var a = base - HALF + (2 * HALF) * ri / RAYS;
      var dx = Math.cos(a), dy = Math.sin(a);
      var t = 0, lastIn = 0;
      while (t <= R) {
        if (isWall(state, Math.floor(cx + dx * t), Math.floor(cy + dy * t))) break;
        lastIn = t;
        t += STEP;
      }
      points.push([cx + dx * lastIn, cy + dy * lastIn]);
    }
    return { cx: cx, cy: cy, points: points };
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
  // is about to walk — a readable tell for the player. Stepping also clears
  // any turn-toward-sound from the previous turn.
  function stepGuard(state, g) {
    g.idx = (g.idx + 1) % g.route.length;
    var next = g.route[g.idx];
    if (next.x !== g.x || next.y !== g.y) {
      g.x = next.x;
      g.y = next.y;
    }
    g.facing = nextFacing(g.route, g, g.idx, { x: 1, y: 0 });
    g.alerted = false;
  }

  // ---------- sound ----------

  // A listener hears any *move* (never a wait) within `hearing` tiles
  // (Chebyshev). Sound passes through walls: you can be heard next door.
  function hears(g, px, py) {
    return g.type === 'listener' &&
      Math.max(Math.abs(px - g.x), Math.abs(py - g.y)) <= g.hearing;
  }

  // Cardinal direction a guard turns to when it hears a sound at (px,py):
  // the axis with the larger delta, horizontal wins ties. Same tile: keep
  // facing (unreachable in play — the guard's own tile is inside its cone).
  function soundFacing(g, px, py) {
    var dx = px - g.x, dy = py - g.y;
    if (dx !== 0 && Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx), y: 0 };
    if (dy !== 0) return { x: 0, y: Math.sign(dy) };
    return { x: g.facing.x, y: g.facing.y };
  }

  // After the guards step, every listener that heard this turn's move snaps
  // to face the sound. The stare lasts until the listener's next step, so
  // its beam both threatens and illuminates toward the noise for one beat.
  function reactToSound(state) {
    for (var i = 0; i < state.guards.length; i++) {
      var g = state.guards[i];
      if (hears(g, state.player.x, state.player.y)) {
        g.facing = soundFacing(g, state.player.x, state.player.y);
        g.alerted = true;
      }
    }
  }

  // Renderer cue helper: true right after a turn in which at least one
  // listener heard the player's move. The alert flag is set by reactToSound
  // and cleared on the listener's next step, so this means "you were heard
  // THIS turn" — exactly when the renderer should show the heard-feedback
  // ripple and keep the ring on the player until their next action.
  function anyAlerted(state) {
    for (var i = 0; i < state.guards.length; i++) {
      if (state.guards[i].alerted) return true;
    }
    return false;
  }

  // Renderer cue helper: how deep the player currently sits inside a
  // listener's earshot — i.e. whether their NEXT move would be heard. 0 when
  // no listener can hear them; otherwise a 0..1 proximity for the nearest
  // listener: 1/(h+1) at the very edge of hearing, h/(h+1) when adjacent.
  // Walls are ignored (sound passes through), matching `hears`. This is the
  // "silence required" signal that drives the heartbeat sound.
  function earshot(state) {
    var best = 0;
    for (var i = 0; i < state.guards.length; i++) {
      var g = state.guards[i];
      if (g.type !== 'listener') continue;
      var d = Math.max(Math.abs(state.player.x - g.x), Math.abs(state.player.y - g.y));
      if (d <= g.hearing) {
        var p = (g.hearing + 1 - d) / (g.hearing + 1);
        if (p > best) best = p;
      }
    }
    return best;
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
    if (!action.wait) reactToSound(state);
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

  // BFS over (player x, y, turn mod cycle, listener alert mask). Proves a
  // level is solvable and returns the shortest action list, or null.
  //
  // The alert mask is one bit per listener: "this listener is currently
  // staring at the node's player tile because the player moved near it last
  // turn". The stare direction is fully derived from the node's position,
  // so the state space stays finite.
  function solve(level, maxStates) {
    maxStates = maxStates || 400000;
    var st = createGame(level);
    var cycle = cycleLength(level);
    var nG = level.guards.length;
    var startKey = st.player.x + ',' + st.player.y + ',0,0';
    var seen = {};
    seen[startKey] = null; // key -> { from, action }
    var queue = [{ x: st.player.x, y: st.player.y, t: 0, mask: 0 }];
    var actions = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
      { wait: true }
    ];
    var walls = st.walls, w = st.w, h = st.h;
    function wall(x, y) {
      return x < 0 || y < 0 || x >= w || y >= h || walls[y][x];
    }
    // Listener bookkeeping: bit index in the alert mask (-1 = not a listener)
    // and hearing radius.
    var listenerBit = [], hearing = [];
    var nListeners = 0;
    for (var gi0 = 0; gi0 < nG; gi0++) {
      hearing[gi0] = level.guards[gi0].hearing == null ? 3 : level.guards[gi0].hearing;
      listenerBit[gi0] = level.guards[gi0].type === 'listener' ? nListeners++ : -1;
    }
    // Precompute, for each phase and guard: route position/cone plus the four
    // cones an alert turn could produce.
    var DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    var phasePos = [], phaseCones = [], phaseDirCones = [];
    for (var t = 0; t < cycle; t++) {
      var ps = [], cs = [], ds = [];
      for (var gi = 0; gi < nG; gi++) {
        var pg = guardAt(level, gi, t);
        ps.push(pg);
        cs.push(coneOf(st, pg));
        ds.push(DIRS.map(function (d) {
          return coneOf(st, { x: pg.x, y: pg.y, facing: d });
        }));
      }
      phasePos.push(ps); phaseCones.push(cs); phaseDirCones.push(ds);
    }
    function dirIndex(dx, dy) {
      if (dx !== 0 && Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 0 : 1;
      if (dy !== 0) return dy > 0 ? 2 : 3;
      return -1;
    }
    // Is (x,y) lit at phase t given the alert mask? (sx,sy) is the tile the
    // alerted listeners are staring at — the player's position last turn.
    function lit(x, y, t, mask, sx, sy) {
      for (var i = 0; i < nG; i++) {
        var cone;
        if (listenerBit[i] >= 0 && (mask & (1 << listenerBit[i]))) {
          var pg = phasePos[t][i];
          var di = dirIndex(sx - pg.x, sy - pg.y);
          cone = di < 0 ? phaseCones[t][i] : phaseDirCones[t][i][di];
        } else {
          cone = phaseCones[t][i];
        }
        for (var j = 0; j < cone.length; j++) {
          if (cone[j].x === x && cone[j].y === y) return true;
        }
      }
      return false;
    }
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      if (cur.x === st.exit.x && cur.y === st.exit.y) {
        var path = [];
        var k = cur.x + ',' + cur.y + ',' + cur.t + ',' + cur.mask;
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
        var nt = (cur.t + 1) % cycle;
        // Same order as takeTurn: player moves while guards are at phase
        // cur.t (with last turn's stare), steps them to cur.t + 1, then
        // listeners that heard this move snap toward it before the second
        // beam check.
        if (lit(nx, ny, cur.t, cur.mask, cur.x, cur.y)) continue;
        var mask2 = 0;
        if (!a.wait) {
          for (var li = 0; li < nG; li++) {
            if (listenerBit[li] < 0) continue;
            var pp = phasePos[nt][li];
            if (Math.max(Math.abs(nx - pp.x), Math.abs(ny - pp.y)) <= hearing[li]) {
              mask2 |= 1 << listenerBit[li];
            }
          }
        }
        if (lit(nx, ny, nt, mask2, nx, ny)) continue;
        var key = nx + ',' + ny + ',' + nt + ',' + mask2;
        if (seen[key] !== undefined) continue;
        if (Object.keys(seen).length > maxStates) return null;
        seen[key] = { from: cur.x + ',' + cur.y + ',' + cur.t + ',' + cur.mask, action: a };
        queue.push({ x: nx, y: ny, t: nt, mask: mask2 });
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
        return { idx: g.idx, x: g.x, y: g.y, facing: g.facing, alerted: g.alerted };
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
      g.alerted = s.guards[i].alerted || false;
    });
    return state;
  }

  // Touch input helper (pure): map a swipe vector in pixels to a player
  // action. Movement below the threshold is a tap (wait). The dominant axis
  // wins; on a perfect tie horizontal wins (documented in tests).
  function classifySwipe(dx, dy, threshold) {
    var th = (typeof threshold === 'number') ? threshold : 24;
    var adx = Math.abs(dx), ady = Math.abs(dy);
    if (Math.max(adx, ady) < th) return { wait: true };
    if (adx >= ady) return { dx: dx > 0 ? 1 : -1, dy: 0 };
    return { dx: 0, dy: dy > 0 ? 1 : -1 };
  }

  // ---------- best-run recording (the ghost) ----------

  // A finished run is recorded as the player's position for every turn,
  // starting with the turn-0 position: path[t] is where the player stood at
  // turn t. The ghost of your best run replays exactly that: at your turn t
  // it is at its path[t].

  // Compact storage encoding: "x,y;x,y;..."
  function encodeRun(path) {
    return path.map(function (p) { return p.x + ',' + p.y; }).join(';');
  }

  // Strict decoder: anything malformed returns null so a corrupt or hostile
  // localStorage value can never crash the renderer.
  function decodeRun(s) {
    if (typeof s !== 'string' || s === '') return null;
    var parts = s.split(';');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var m = /^(-?\d+),(-?\d+)$/.exec(parts[i]);
      if (!m) return null;
      out.push({ x: parseInt(m[1], 10), y: parseInt(m[2], 10) });
    }
    return out.length ? out : null;
  }

  // A run beats the incumbent only if it is strictly faster. Ties keep the
  // incumbent, so the ghost you watch is the first run that set the record.
  function isBetterRun(candidate, incumbent) {
    if (!candidate) return false;
    if (!incumbent) return true;
    return candidate.turns < incumbent.turns;
  }

  // Replay a move string ('r' 'l' 'u' 'd' 'w') through the real rules and
  // return { path, turns, status }. Free wall-bumps are skipped exactly like
  // in play, so path.length always equals turns + 1.
  function replay(level, moves) {
    var st = createGame(level);
    var path = [{ x: st.player.x, y: st.player.y }];
    var ACTS = {
      r: { dx: 1, dy: 0 }, l: { dx: -1, dy: 0 },
      u: { dx: 0, dy: -1 }, d: { dx: 0, dy: 1 }, w: { wait: true }
    };
    for (var i = 0; i < moves.length; i++) {
      var a = ACTS[moves[i]];
      if (!a || !takeTurn(st, a)) continue;
      path.push({ x: st.player.x, y: st.player.y });
    }
    return { path: path, turns: st.turn, status: st.status };
  }

  // ---------- level select (the halls screen) ----------

  // Progression ladder, pure: level 0 is always open; level i opens once
  // level i-1 is cleared (a best run is stored for it). `cleared` is an
  // array of booleans indexed by level; it may be shorter than `count`.
  function unlockedLevels(cleared, count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push(i === 0 || !!cleared[i - 1]);
    }
    return out;
  }

  // Where the halls screen parks its cursor on open: the first level that
  // is unlocked and not yet cleared. If everything is cleared, back to 0 —
  // by then every door is open anyway.
  function firstOpenLevel(cleared, count) {
    var un = unlockedLevels(cleared, count);
    for (var i = 0; i < count; i++) {
      if (un[i] && !cleared[i]) return i;
    }
    return 0;
  }

  // The epilogue switch: true once every hall has a best run. The hub lights
  // up when this flips — the game's last reward is the dark itself leaving.
  // A short `cleared` array reads as "not cleared" for the missing entries,
  // and count 0 is deliberately NOT "all cleared": nothing was ever lit.
  function allCleared(cleared, count) {
    if (count <= 0) return false;
    for (var i = 0; i < count; i++) {
      if (!cleared[i]) return false;
    }
    return true;
  }

  // Sum of the best times, but only when EVERY hall has one: the epilogue's
  // "N turns in all" line must never quietly undercount a partial run.
  // `bests` is one entry per level: { turns, ... } or null.
  function totalBestTurns(bests) {
    if (!bests || !bests.length) return null;
    var sum = 0;
    for (var i = 0; i < bests.length; i++) {
      if (!bests[i] || typeof bests[i].turns !== 'number') return null;
      sum += bests[i].turns;
    }
    return sum;
  }

  var TheirEyes = {
    CONE_RADIUS: CONE_RADIUS,
    createGame: createGame,
    isWall: isWall,
    coneOf: coneOf,
    cones: cones,
    coneFan: coneFan,
    inCone: inCone,
    hears: hears,
    soundFacing: soundFacing,
    anyAlerted: anyAlerted,
    earshot: earshot,
    visibleNow: visibleNow,
    takeTurn: takeTurn,
    guardAt: guardAt,
    cycleLength: cycleLength,
    solve: solve,
    serialize: serialize,
    restore: restore,
    classifySwipe: classifySwipe,
    encodeRun: encodeRun,
    decodeRun: decodeRun,
    isBetterRun: isBetterRun,
    replay: replay,
    unlockedLevels: unlockedLevels,
    firstOpenLevel: firstOpenLevel,
    allCleared: allCleared,
    totalBestTurns: totalBestTurns
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TheirEyes;
  if (typeof window !== 'undefined') window.TheirEyes = TheirEyes;
})(typeof globalThis !== 'undefined' ? globalThis : this);
