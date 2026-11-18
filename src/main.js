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

  function loadLevel(i) {
    levelIdx = i;
    allDone = false;
    game = G.createGame(LEVELS[i]);
    undoStack = [];
    var w = game.w * TILE, h = game.h * TILE;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nameEl.textContent = LEVELS[i].name;
    hintEl.textContent = LEVELS[i].hint;
  }

  // ---------- input ----------

  function act(action) {
    if (game.status !== 'playing') return;
    undoStack.push(G.serialize(game));
    var consumed = G.takeTurn(game, action);
    if (!consumed) undoStack.pop(); // wall bumps are free, not undoable
    if (undoStack.length > 500) undoStack.shift();
  }

  function undo() {
    if (undoStack.length === 0) return;
    G.restore(game, undoStack.pop());
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
      if (game.status === 'won') {
        if (levelIdx + 1 < LEVELS.length) {
          loadLevel(levelIdx + 1);
        } else {
          allDone = true;
        }
      }
    }
  });

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
    var pulse = 0.16 + 0.05 * Math.sin(now / 320);

    for (var y = 0; y < game.h; y++) {
      for (var x = 0; x < game.w; x++) {
        var key = x + ',' + y;
        var v = vis[key];
        var mem = game.revealed[key];
        if (!v && !mem) continue;
        var px = x * TILE, py = y * TILE;
        var wall = G.isWall(game, x, y);
        if (v === 'light') {
          ctx.fillStyle = wall ? '#3a4258' : '#161a27';
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

    // beams: the light that is also the blade
    for (var y2 = 0; y2 < game.h; y2++) {
      for (var x2 = 0; x2 < game.w; x2++) {
        if (vis[x2 + ',' + y2] === 'light' && !G.isWall(game, x2, y2)) {
          ctx.fillStyle = 'rgba(255,190,90,' + pulse.toFixed(3) + ')';
          ctx.fillRect(x2 * TILE, y2 * TILE, TILE, TILE);
        }
      }
    }

    // guards: always visible — their own tile is inside their own gaze
    for (var gi = 0; gi < game.guards.length; gi++) {
      var g = game.guards[gi];
      var cx = g.x * TILE + TILE / 2, cy = g.y * TILE + TILE / 2;
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a0d0d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + g.facing.x * 9, cy + g.facing.y * 9);
      ctx.stroke();
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
        ctx.fillText('every hall cleared · R to walk them again', w / 2, h / 2 + 16);
      } else if (game.status === 'caught') {
        ctx.fillStyle = '#ff6b6b';
        ctx.font = '28px ui-monospace, monospace';
        ctx.fillText('CAUGHT', w / 2, h / 2 - 14);
        ctx.font = '13px ui-monospace, monospace';
        ctx.fillStyle = '#5a627a';
        ctx.fillText('R restart · Z undo', w / 2, h / 2 + 16);
      } else if (game.status === 'won') {
        ctx.fillStyle = '#34d399';
        ctx.font = '28px ui-monospace, monospace';
        ctx.fillText('YOU ESCAPED', w / 2, h / 2 - 14);
        ctx.font = '13px ui-monospace, monospace';
        ctx.fillStyle = '#5a627a';
        var next = levelIdx + 1 < LEVELS.length ? 'Enter: next hall' : 'Enter: finish';
        ctx.fillText('turn ' + game.turn + ' · ' + next, w / 2, h / 2 + 16);
      }
    }

    turnsEl.textContent = 'turn ' + game.turn;
    requestAnimationFrame(draw);
  }

  loadLevel(0);
  requestAnimationFrame(draw);
})();
