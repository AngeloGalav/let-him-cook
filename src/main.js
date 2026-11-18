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
  var ripples = [];   // decorative sound rings: { x, y, t0 } (performance.now)
  var userGestured = false; // browsers only allow audio after a real gesture
  var screen = 'game';      // 'game' | 'halls' — the halls screen is the hub
  var selCursor = 0;        // keyboard cursor on the halls screen
  var hallBests = null;     // cache of per-level best runs; null = stale
  var HALLS_W = 648; // logical width of the halls screen
  // Card grid: two columns; the logical height GROWS with the level count
  // (one row per pair of levels) so adding a level never overflows the hub.
  var HALL_TOP = 64, HALL_MX = 20, HALL_GAP = 14, HALL_VGAP = 12, HALL_CH = 72;
  function hallsH() {
    var rows = Math.ceil(LEVELS.length / 2);
    return HALL_TOP + rows * (HALL_CH + HALL_VGAP) - HALL_VGAP + 28;
  }

  // ---------- sound: the "you were heard" thud ----------
  // A short low sine thump, synthesized on the fly (no assets). The context is
  // created lazily and only after a real user gesture, so autoplay policy is
  // never violated and headless runs stay silent. Mute state persists; every
  // storage/audio access is wrapped so a locked-down browser just gets the
  // visual cues instead.

  function loadMuted() {
    try { return window.localStorage.getItem('their-eyes-audio-v1') === '1'; }
    catch (e) { return false; }
  }
  var muted = loadMuted();
  var audioCtx = null;
  var toastText = '', toastUntil = 0;

  function thud() {
    if (muted || !userGestured) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t = audioCtx.currentTime;
      var o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(96, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.16);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(0.25, t + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(gn);
      gn.connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.32);
    } catch (e) { /* no audio: the visual cue still plays */ }
  }

  function toggleMute() {
    muted = !muted;
    try { window.localStorage.setItem('their-eyes-audio-v1', muted ? '1' : '0'); }
    catch (e) { /* mute state just won't persist */ }
    toastText = muted ? 'sound off' : 'sound on';
    toastUntil = performance.now() + 1400;
  }

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
    hallBests = null; // halls screen must re-read
  }

  // Cached per-level best runs for the halls screen (localStorage reads are
  // cheap but not at 60 fps). Invalidated by saveBest and by openHalls.
  function bestAt(i) {
    if (!hallBests) {
      hallBests = [];
      for (var j = 0; j < LEVELS.length; j++) hallBests.push(loadBest(j));
    }
    return hallBests[i];
  }

  function clearedFlags() {
    var out = [];
    for (var i = 0; i < LEVELS.length; i++) out.push(!!bestAt(i));
    return out;
  }

  function loadLevel(i) {
    levelIdx = i;
    allDone = false;
    game = G.createGame(LEVELS[i]);
    undoStack = [];
    runPath = [{ x: game.player.x, y: game.player.y }];
    ripples = [];
    best = loadBest(i);
    newBest = false;
    fitCanvas(game.w * TILE, game.h * TILE);
    nameEl.textContent = LEVELS[i].name;
    hintEl.textContent = LEVELS[i].hint;
  }

  // Scale the canvas down to fit narrow screens (phones); never upscale past
  // the native tile size. The backing store follows the display size times
  // devicePixelRatio so everything stays sharp on high-DPI phones. Takes the
  // logical size so the halls screen can use its own (the game canvas size
  // changes per level).
  function fitCanvas(w, h) {
    var avail = Math.max(240, Math.min(window.innerWidth, document.documentElement.clientWidth) - 40);
    var scale = Math.min(1, avail / w);
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = Math.round(w * scale) + 'px';
    canvas.style.height = Math.round(h * scale) + 'px';
    canvas.width = Math.round(w * scale * dpr);
    canvas.height = Math.round(h * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }

  function logicalSize() {
    return screen === 'halls'
      ? { w: HALLS_W, h: hallsH() }
      : { w: game.w * TILE, h: game.h * TILE };
  }

  // ---------- the halls screen (level select) ----------
  // A hub drawn on the same canvas: one card per level, best time from the
  // ghost storage, and a lock ladder (level i opens once i-1 is cleared).
  // Opening it mid-run does not touch the game state, so L is also "peek".

  function openHalls() {
    if (screen === 'halls') return;
    screen = 'halls';
    hallBests = null; // always show fresh times after a win
    selCursor = G.firstOpenLevel(clearedFlags(), LEVELS.length);
    fitCanvas(HALLS_W, hallsH());
    nameEl.textContent = 'The Halls';
    hintEl.textContent = '';
    turnsEl.textContent = '';
  }

  function closeHalls() {
    if (screen !== 'halls' || !game) return; // startup halls has nothing to return to
    screen = 'game';
    fitCanvas(game.w * TILE, game.h * TILE);
    nameEl.textContent = LEVELS[levelIdx].name;
    hintEl.textContent = LEVELS[levelIdx].hint;
  }

  function enterHall(i) {
    var un = G.unlockedLevels(clearedFlags(), LEVELS.length);
    if (!un[i]) return;
    loadLevel(i);
    screen = 'game';
  }

  // Card layout, computed fresh each use (cheap, and always matches the
  // renderer and the hit-test). Two columns, one row per pair of levels.
  function hallCards() {
    var n = LEVELS.length;
    var mx = HALL_MX, top = HALL_TOP, gap = HALL_GAP, vgap = HALL_VGAP, ch = HALL_CH;
    var cw = (HALLS_W - mx * 2 - gap) / 2;
    var un = G.unlockedLevels(clearedFlags(), n);
    var cards = [];
    for (var i = 0; i < n; i++) {
      cards.push({
        i: i,
        x: mx + (i % 2) * (cw + gap),
        y: top + Math.floor(i / 2) * (ch + vgap),
        w: cw, h: ch,
        unlocked: un[i],
        best: bestAt(i)
      });
    }
    return cards;
  }

  // Map a client (mouse/touch) point to logical canvas pixels.
  function canvasPoint(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var s = logicalSize();
    return {
      x: (clientX - r.left) * s.w / r.width,
      y: (clientY - r.top) * s.h / r.height
    };
  }

  // Index of the unlocked card under a logical point, or -1.
  function cardAt(x, y) {
    var cards = hallCards();
    for (var k = 0; k < cards.length; k++) {
      var c = cards[k];
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
        return c.unlocked ? c.i : -1;
      }
    }
    return -1;
  }

  // ---------- input ----------

  function act(action) {
    if (game.status !== 'playing') return;
    undoStack.push(G.serialize(game));
    var consumed = G.takeTurn(game, action);
    if (!consumed) { undoStack.pop(); return; } // wall bumps are free, not undoable
    runPath.push({ x: game.player.x, y: game.player.y });
    if (undoStack.length > 500) undoStack.shift();
    // heard feedback: two staggered violet ripples leave the tile that made
    // the noise, plus a low thud. The persistent tell (a ring that stays until
    // your next action) is drawn from game state in draw().
    if (game.status === 'playing' && G.anyAlerted(game)) {
      var t0 = performance.now();
      ripples.push({ x: game.player.x, y: game.player.y, t0: t0 });
      ripples.push({ x: game.player.x, y: game.player.y, t0: t0 + 130 });
      thud();
    }
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
    userGestured = true;
    var k = e.key;
    var dirs = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
      W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
    };
    if (k === 'l' || k === 'L') {
      e.preventDefault();
      if (screen === 'halls') closeHalls(); else openHalls();
      return;
    }
    if (screen === 'halls') {
      // arrows/wasd move the card cursor, Enter enters, Esc goes back
      if (dirs[k]) {
        e.preventDefault();
        var n = LEVELS.length;
        var next = selCursor + dirs[k][1] * 2 + dirs[k][0]; // rows are 2 wide
        if (next >= 0 && next < n) selCursor = next;
      } else if (k === 'Enter') {
        e.preventDefault();
        enterHall(selCursor);
      } else if (k === 'Escape') {
        closeHalls();
      }
      return;
    }
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
    } else if (k === 'm' || k === 'M') {
      toggleMute();
    } else if (k === 'Escape') {
      openHalls();
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
    userGestured = true;
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
    if (screen === 'halls') {
      var pt = canvasPoint(t.clientX, t.clientY);
      var i = cardAt(pt.x, pt.y);
      if (i >= 0) enterHall(i);
      return;
    }
    if (allDone) { openHalls(); return; }
    if (game.status === 'caught') { loadLevel(levelIdx); return; }
    if (game.status === 'won') { nextLevel(); return; }
    act(G.classifySwipe(dx, dy));
  });

  // Mouse support for the halls screen (desktop players without a keyboard,
  // or just preferring a click). The game screen itself stays keyboard-driven.
  canvas.addEventListener('click', function (e) {
    if (screen !== 'halls') return;
    var pt = canvasPoint(e.clientX, e.clientY);
    var i = cardAt(pt.x, pt.y);
    if (i >= 0) enterHall(i);
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
        userGestured = true;
        if (name === 'undo') undo();
        else if (name === 'restart') loadLevel(levelIdx);
        else if (name === 'sound') toggleMute();
        else if (name === 'halls') {
          if (screen === 'halls') closeHalls(); else openHalls();
        }
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

  // The halls screen: a grid of cards, one per level. Cleared halls show
  // their best time (the ghost's record); locked ones show only a number.
  function drawHalls(now) {
    ctx.clearRect(0, 0, HALLS_W, hallsH());
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c9d2e4';
    ctx.font = '22px ui-monospace, monospace';
    ctx.fillText('T H E   H A L L S', HALLS_W / 2, 38);
    var cards = hallCards();
    for (var k = 0; k < cards.length; k++) {
      var c = cards[k];
      var cur = (k === selCursor);
      roundRect(c.x, c.y, c.w, c.h, 10);
      ctx.fillStyle = c.unlocked ? (cur ? '#151a28' : '#0e1119') : '#0a0c12';
      ctx.fill();
      if (cur) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(143,216,255,' + (0.6 + 0.3 * Math.sin(now / 300)).toFixed(3) + ')';
      } else {
        ctx.lineWidth = 1;
        ctx.strokeStyle = c.unlocked ? '#262c40' : '#161a26';
      }
      ctx.stroke();
      ctx.textAlign = 'left';
      var lx = c.x + 16;
      ctx.font = '15px ui-monospace, monospace';
      if (c.unlocked) {
        ctx.fillStyle = '#e6edf6';
        ctx.fillText(LEVELS[c.i].name, lx, c.y + 30);
        ctx.font = '12px ui-monospace, monospace';
        if (c.best) {
          ctx.fillStyle = '#34d399';
          ctx.fillText('best ' + c.best.turns + ' turns', lx, c.y + 52);
        } else {
          ctx.fillStyle = '#3e465e';
          ctx.fillText('unexplored', lx, c.y + 52);
        }
      } else {
        ctx.fillStyle = '#3e465e';
        ctx.fillText((c.i + 1) + ' · locked', lx, c.y + 30);
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillText('escape the hall before it', lx, c.y + 52);
      }
    }
    ctx.textAlign = 'center';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#566080';
    var line;
    if (!game) line = touchMode ? 'tap a hall to begin' : 'arrows + enter to begin';
    else line = touchMode ? 'tap a hall · “halls” returns to your run'
                          : 'arrows + enter · L returns to your run';
    ctx.fillText(line, HALLS_W / 2, hallsH() - 16);
    requestAnimationFrame(draw);
  }

  function draw(now) {
    if (screen === 'halls') { drawHalls(now); return; }
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

    // heard feedback, persistent half: while a listener is still staring at
    // your last footstep, a slow violet ring stays on you. It reads as "that
    // step made noise" even when the stare itself lands somewhere you cannot
    // see (level 10's heard-but-unseen ring). Derived from game state, so
    // undo restores it for free.
    if (game.status === 'playing' && G.anyAlerted(game)) {
      var pr = 11 + 1.6 * Math.sin(now / 240);
      ctx.strokeStyle = 'rgba(192,132,252,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pcx, pcy, pr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // heard feedback, decorative half: two staggered rings expand from the
    // tile that made the noise and fade out (spawned in act()).
    var nowMs = performance.now();
    for (var ri = ripples.length - 1; ri >= 0; ri--) {
      var rp = ripples[ri];
      var age = (nowMs - rp.t0) / 650;
      if (age < 0) continue; // staggered second ring, not born yet
      if (age >= 1) { ripples.splice(ri, 1); continue; }
      ctx.strokeStyle = 'rgba(192,132,252,' + (0.5 * (1 - age)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rp.x * TILE + TILE / 2, rp.y * TILE + TILE / 2,
              TILE * (0.35 + 1.6 * age), 0, Math.PI * 2);
      ctx.stroke();
    }

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
        ctx.fillText('every hall cleared · ' + (touchMode ? 'tap' : 'L') + ' back to the halls', w / 2, h / 2 + 16);
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

    // mute toast: small fading label, drawn last so it sits above overlays
    if (nowMs < toastUntil) {
      ctx.globalAlpha = Math.min(1, (toastUntil - nowMs) / 400);
      ctx.fillStyle = '#5a627a';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(toastText, w - 8, 16);
      ctx.globalAlpha = 1;
    }

    turnsEl.textContent = 'turn ' + game.turn + (best ? ' · best ' + best.turns : '');
    requestAnimationFrame(draw);
  }

  // URL test hooks for headless verification: ?level=N (1-based) selects a
  // level and jumps straight into it (bypassing the lock ladder), ?moves=rlduw...
  // auto-plays a move script on load, ?touch=1 forces the touch UI on (for
  // screenshots on a desktop browser), ?halls=1 forces the halls screen.
  // With no level/moves params the game opens on the halls screen — that is
  // the hub a real player lands on.
  var params = new URLSearchParams(window.location.search);
  touchMode = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
              params.get('touch') === '1';
  if (touchMode) document.body.classList.add('touch');
  var moves = params.get('moves') || '';
  if (params.get('halls') !== '1' && (params.get('level') !== null || moves)) {
    var start = parseInt(params.get('level'), 10);
    start = isNaN(start) ? 1 : Math.min(Math.max(start, 1), LEVELS.length);
    loadLevel(start - 1);
    screen = 'game';
  } else {
    screen = 'halls';
    selCursor = G.firstOpenLevel(clearedFlags(), LEVELS.length);
    fitCanvas(HALLS_W, hallsH());
    nameEl.textContent = 'The Halls';
  }
  window.addEventListener('resize', function () {
    if (screen === 'halls' || game) {
      var s = logicalSize();
      fitCanvas(s.w, s.h);
    }
  });
  if (screen === 'game') {
    for (var mi = 0; mi < moves.length; mi++) {
      var m = moves[mi];
      if (m === 'r') act({ dx: 1, dy: 0 });
      else if (m === 'l') act({ dx: -1, dy: 0 });
      else if (m === 'u') act({ dx: 0, dy: -1 });
      else if (m === 'd') act({ dx: 0, dy: 1 });
      else if (m === 'w') act({ wait: true });
    }
  }
  // ?keys=... dispatches one synthetic keydown per token (comma-separated,
  // so multi-char keys work: ?keys=l,Enter) after load, letting headless
  // screenshots exercise the keyboard router (e.g. ?keys=l,s opens the halls
  // screen and moves the cursor down; wasd/arrows both work there).
  var keys = (params.get('keys') || '').split(',').filter(Boolean);
  for (var ki = 0; ki < keys.length; ki++) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: keys[ki] }));
  }
  draw(0); // paint the first frame synchronously; draw() re-arms rAF itself
})();
