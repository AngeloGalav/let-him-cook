/*
 * THEIR EYES — browser glue: input, canvas rendering, level flow.
 * All game rules live in logic.js; this file only draws and reads keys.
 */
(function () {
  'use strict';

  var G = window.TheirEyes;
  var LEVELS = window.TheirEyesLevels.LEVELS;
  var TILE = 36;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var nameEl = document.getElementById('level-name');
  var turnsEl = document.getElementById('turns');
  var hintEl = document.getElementById('hint');

  var levelIdx = 0;
  var game = null;
  var undoStack = [];
  var allDone = false;
  var touchMode = false;
  var runPath = [];   // player positions this run, one per turn, path[0] = start
  var best = null;    // { turns, path } best run for this level, or null
  var newBest = false;

  // ---------- best-run storage (the ghost) ----------
  // localStorage can be missing or throw (private mode, blocked file://), so
  // every access is wrapped: no storage simply means no ghost.

  function bestKey(i) { return 'their-eyes-best-v1-' + i; }

  function loadBest(i) {
    try {
      var raw = window.localStorage.getItem(bestKey(i));
      if (!raw) return null;
      var o = JSON.parse(raw);
      var path = G.decodeRun(o && o.path);
      if (!path || typeof o.turns !== 'number' || o.turns !== path.length - 1) return null;
      return { turns: o.turns, path: path };
    } catch (e) { return null; }
  }

  function saveBest(i, run) {
    try {
      window.localStorage.setItem(bestKey(i),
        JSON.stringify({ turns: run.turns, path: G.encodeRun(run.path) }));
    } catch (e) { /* no storage: no ghost */ }
  }

  function loadLevel(i) {
    levelIdx = i;
    allDone = false;
    game = G.createGame(LEVELS[i]);
    undoStack = [];
    runPath = [{ x: game.player.x, y: game.player.y }];
    best = loadBest(i);
    newBest = false;
    fitCanvas();
    nameEl.textContent = LEVELS[i].name;
    hintEl.textContent = LEVELS[i].hint;
  }

  // Scale the canvas down to fit narrow screens (phones); never upscale past
  // the native tile size. The backing store follows the display size times
  // devicePixelRatio so everything stays sharp on high-DPI phones.
  function fitCanvas() {
    var w = game.w * TILE, h = game.h * TILE;
    var avail = Math.max(240, Math.min(window.innerWidth, document.documentElement.clientWidth) - 40);
    var scale = Math.min(1, avail / w);
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = Math.round(w * scale) + 'px';
    canvas.style.height = Math.round(h * scale) + 'px';
    canvas.width = Math.round(w * scale * dpr);
    canvas.height = Math.round(h * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }

  // ---------- input ----------

  function act(action) {
    if (game.status !== 'playing') return;
    undoStack.push(G.serialize(game));
    var consumed = G.takeTurn(game, action);
    if (!consumed) { undoStack.pop(); return; } // wall bumps are free, not undoable
    runPath.push({ x: game.player.x, y: game.player.y });
    if (undoStack.length > 500) undoStack.shift();
    if (game.status === 'won') {
      var run = { turns: game.turn, path: runPath.slice() };
      if (G.isBetterRun(run, best)) {
        best = run;
        saveBest(levelIdx, run);
        newBest = true;
      }
    }
  }

  function undo() {
    if (undoStack.length === 0) return;
    G.restore(game, undoStack.pop());
    runPath.pop();
  }

  function nextLevel() {
    if (game.status !== 'won') return;
    if (levelIdx + 1 < LEVELS.length) {
      loadLevel(levelIdx + 1);
    } else {
      allDone = true;
    }
  }

  document.addEventListener('keydown', function (e) {
    var k = e.key;
    var dirs = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
      W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
    };
    if (dirs[k]) {
      e.preventDefault();
      act({ dx: dirs[k][0], dy: dirs[k][1] });
    } else if (k === ' ') {
      e.preventDefault();
      act({ wait: true });
    } else if (k === 'z' || k === 'Z' || k === 'Backspace') {
      e.preventDefault();
      undo();
    } else if (k === 'r' || k === 'R') {
      loadLevel(levelIdx);
    } else if (k === 'Enter') {
      nextLevel();
    }
  });

  // ---------- touch ----------
  // Swipe = move, tap = wait (classifySwipe in logic.js decides). On the
  // end-of-run overlays a tap restarts (caught) or advances (escaped), so the
  // game is fully playable without a keyboard.
  var touchStart = null;
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, { passive: true });
  canvas.addEventListener('touchend', function (e) {
    if (!touchStart) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    touchStart = null;
    e.preventDefault();
    if (allDone) { loadLevel(0); return; }
    if (game.status === 'caught') { loadLevel(levelIdx); return; }
    if (game.status === 'won') { nextLevel(); return; }
    act(G.classifySwipe(dx, dy));
  });

  // On-screen d-pad (shown only in touch mode, see body.touch in the CSS).
  var TOUCH_ACTIONS = {
    up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
    wait: { wait: true }
  };
  var pads = document.querySelectorAll('#touch-controls [data-act]');
  for (var p = 0; p < pads.length; p++) {
    (function (btn) {
      var name = btn.getAttribute('data-act');
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (name === 'undo') undo();
        else if (name === 'restart') loadLevel(levelIdx);
        else act(TOUCH_ACTIONS[name]);
      });
    })(pads[p]);
  }

  // ---------- rendering ----------

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(now) {
    var w = game.w * TILE, h = game.h * TILE;
    ctx.clearRect(0, 0, w, h);
    var vis = G.visibleNow(game);
    var glow = 0.30 + 0.07 * Math.sin(now / 320);

    for (var y = 0; y < game.h; y++) {
      for (var x = 0; x < game.w; x++) {
        var key = x + ',' + y;
        var v = vis[key];
        var mem = game.revealed[key];
        if (!v && !mem) continue;
        var px = x * TILE, py = y * TILE;
        var wall = G.isWall(game, x, y);
        if (v === 'light') {
          ctx.fillStyle = wall ? '#454d66' : '#20242f';
          ctx.fillRect(px, py, TILE, TILE);
        } else if (v === 'touch') {
          ctx.fillStyle = wall ? '#2c3348' : '#10131d';
          ctx.fillRect(px, py, TILE, TILE);
        } else {
          ctx.fillStyle = wall ? 'rgba(120,132,168,0.20)' : 'rgba(120,132,168,0.07)';
          ctx.fillRect(px, py, TILE, TILE);
        }
        // the exit only exists once you have seen it
        if (game.exit.x === x && game.exit.y === y) {
          ctx.fillStyle = v ? '#34d399' : 'rgba(52,211,153,0.35)';
          roundRect(px + 8, py + 6, TILE - 16, TILE - 12, 5);
          ctx.fill();
          ctx.fillStyle = '#07080d';
          roundRect(px + 12, py + 12, TILE - 24, TILE - 18, 3);
          ctx.fill();
        }
      }
    }

    // beams: smooth light shafts — the light that is also the blade.
    // Additive fill so overlapping beams brighten like real light, and the
    // amber reads as glow instead of muddy brown over the dark floor.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = 'blur(5px)'; // melt the tile-staircase edges into a soft glow
    for (var bi = 0; bi < game.guards.length; bi++) {
      var bg = game.guards[bi];
      var fan = G.coneFan(game, bg);
      var gcx = fan.cx * TILE, gcy = fan.cy * TILE;
      ctx.beginPath();
      ctx.moveTo(gcx, gcy);
      for (var pi = 0; pi < fan.points.length; pi++) {
        ctx.lineTo(fan.points[pi][0] * TILE, fan.points[pi][1] * TILE);
      }
      ctx.closePath();
      var grad = ctx.createRadialGradient(gcx, gcy, TILE * 0.3, gcx, gcy, TILE * (G.CONE_RADIUS + 0.6));
      grad.addColorStop(0, 'rgba(255,206,110,' + Math.min(1, glow * 1.7).toFixed(3) + ')');
      grad.addColorStop(0.5, 'rgba(255,176,64,' + glow.toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();

    // guards: always visible — their own tile is inside their own gaze
    for (var gi = 0; gi < game.guards.length; gi++) {
      var g = game.guards[gi];
      var cx = g.x * TILE + TILE / 2, cy = g.y * TILE + TILE / 2;
      // a listener that just heard you: sound rings, then the stare
      if (g.alerted) {
        var ring = 11 + 3 * Math.sin(now / 150);
        ctx.strokeStyle = 'rgba(192,132,252,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ring, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = g.type === 'listener' ? '#c084fc' : '#ff6b6b';
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = g.type === 'listener' ? '#231038' : '#2a0d0d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + g.facing.x * 9, cy + g.facing.y * 9);
      ctx.stroke();
    }

    // ghost of your best run: a faint afterimage replaying your escape one
    // turn at a time, with a short fading trail. It walks the recorded path
    // regardless of what you are doing; it vanishes once it has escaped.
    if (best && game.status === 'playing' && game.turn < best.path.length) {
      var TRAIL = [0.28, 0.15, 0.07];
      for (var ki = 0; ki < TRAIL.length; ki++) {
        var ti = game.turn - ki;
        if (ti < 0) break;
        var gp = best.path[ti];
        ctx.globalAlpha = TRAIL[ki];
        ctx.fillStyle = '#9fd8ff';
        ctx.beginPath();
        ctx.arc(gp.x * TILE + TILE / 2, gp.y * TILE + TILE / 2, 6 - ki, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // you
    var pcx = game.player.x * TILE + TILE / 2, pcy = game.player.y * TILE + TILE / 2;
    ctx.save();
    ctx.shadowColor = '#8fd8ff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#cdeeff';
    ctx.beginPath();
    ctx.arc(pcx, pcy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // status overlays
    if (game.status === 'caught' || game.status === 'won' || allDone) {
      ctx.fillStyle = 'rgba(7,8,13,0.72)';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      if (allDone) {
        ctx.fillStyle = '#c9d2e4';
        ctx.font = '28px ui-monospace, monospace';
        ctx.fillText('YOU HAVE THEIR EYES', w / 2, h / 2 - 14);
        ctx.font = '13px ui-monospace, monospace';
        ctx.fillStyle = '#5a627a';
        ctx.fillText('every hall cleared · ' + (touchMode ? 'tap' : 'R') + ' to walk them again', w / 2, h / 2 + 16);
      } else if (game.status === 'caught') {
        ctx.fillStyle = '#ff6b6b';
        ctx.font = '28px ui-monospace, monospace';
        ctx.fillText('CAUGHT', w / 2, h / 2 - 14);
        ctx.font = '13px ui-monospace, monospace';
        ctx.fillStyle = '#5a627a';
        ctx.fillText(touchMode ? 'tap to restart' : 'R restart · Z undo', w / 2, h / 2 + 16);
      } else if (game.status === 'won') {
        ctx.fillStyle = '#34d399';
        ctx.font = '28px ui-monospace, monospace';
        ctx.fillText('YOU ESCAPED', w / 2, h / 2 - 14);
        ctx.font = '13px ui-monospace, monospace';
        ctx.fillStyle = '#5a627a';
        var key = touchMode ? 'tap' : 'Enter';
        var next = levelIdx + 1 < LEVELS.length ? key + ': next hall' : key + ': finish';
        ctx.fillText('turn ' + game.turn + (newBest ? ' · new best' : '') + ' · ' + next, w / 2, h / 2 + 16);
      }
    }

    turnsEl.textContent = 'turn ' + game.turn + (best ? ' · best ' + best.turns : '');
    requestAnimationFrame(draw);
  }

  // URL test hooks for headless verification: ?level=N (1-based) selects a
  // level, ?moves=rlduw... auto-plays a move script on load, ?touch=1 forces
  // the touch UI on (for screenshots on a desktop browser).
  var params = new URLSearchParams(window.location.search);
  touchMode = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
              params.get('touch') === '1';
  if (touchMode) document.body.classList.add('touch');
  var start = parseInt(params.get('level'), 10);
  start = isNaN(start) ? 1 : Math.min(Math.max(start, 1), LEVELS.length);
  loadLevel(start - 1);
  window.addEventListener('resize', function () { if (game) fitCanvas(); });
  var moves = params.get('moves') || '';
  for (var mi = 0; mi < moves.length; mi++) {
    var m = moves[mi];
    if (m === 'r') act({ dx: 1, dy: 0 });
    else if (m === 'l') act({ dx: -1, dy: 0 });
    else if (m === 'u') act({ dx: 0, dy: -1 });
    else if (m === 'd') act({ dx: 0, dy: 1 });
    else if (m === 'w') act({ wait: true });
  }
  draw(0); // paint the first frame synchronously; draw() re-arms rAF itself
})();
