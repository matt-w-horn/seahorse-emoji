// Wireframe 3D asteroids for the terminal home (issue #5, second cut: the
// gameplay itself is 3D now, not just the attract screen). A perspective
// tunnel: wireframe polyhedra tumble toward the camera, arrows steer the
// camera, space fires down +z, collisions are depth-gated. No dependencies;
// every stroke reads the live theme variables.
//
// TUIGameCore (pure math, no DOM) is exported for node tests; TUIGame.start
// wires it to a canvas and returns a stop() for event-driven teardown.
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  /* ================= pure core (node-testable) ================= */

  // icosahedron: 12 vertices from the golden ratio, 30 edges
  var PHI = (1 + Math.sqrt(5)) / 2;
  var IVERTS = [];
  [[0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
   [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
   [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]].forEach(function (v) {
    var n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    IVERTS.push([v[0] / n, v[1] / n, v[2] / n]);
  });
  var IEDGES = [];
  for (var a = 0; a < 12; a++) for (var b = a + 1; b < 12; b++) {
    var dx = IVERTS[a][0] - IVERTS[b][0], dy = IVERTS[a][1] - IVERTS[b][1], dz = IVERTS[a][2] - IVERTS[b][2];
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 1.1) IEDGES.push([a, b]);
  }

  var SIZES = [70, 42, 24];        // world-unit radius per rock class
  var SCORES = [20, 50, 100];
  var Z_FAR = 1500, Z_NEAR = 60, FOCAL = 420;
  var X_BOUND = 460, Y_BOUND = 300;

  function rotate(v, ax, ay) {
    var ca = Math.cos(ax), sa = Math.sin(ax);
    var cb = Math.cos(ay), sb = Math.sin(ay);
    var y = v[1] * ca - v[2] * sa, z = v[1] * sa + v[2] * ca;   // rotate X
    var x = v[0] * cb + z * sb; z = -v[0] * sb + z * cb;        // rotate Y
    return [x, y, z];
  }

  // perspective; returns null when at/behind the eye
  function project(x, y, z, f) {
    if (z <= 1) return null;
    var s = f / z;
    return { x: x * s, y: y * s, s: s };
  }

  function spawnRock(level, size, rng) {
    var speed = 130 + level * 25 + rng() * 60;
    return {
      x: (rng() * 2 - 1) * X_BOUND, y: (rng() * 2 - 1) * Y_BOUND,
      z: Z_FAR - rng() * 350,
      vx: (rng() * 2 - 1) * 24, vy: (rng() * 2 - 1) * 24,
      vz: -speed * (1 + (2 - size) * 0.1),
      ax: rng() * TAU, ay: rng() * TAU,
      sx: (rng() * 2 - 1) * 1.4, sy: (rng() * 2 - 1) * 1.4,
      size: size
    };
  }

  function splitRock(rock, rng) {
    if (rock.size >= 2) return [];
    var kids = [];
    for (var i = 0; i < 2; i++) {
      var k = spawnRock(1, rock.size + 1, rng);
      k.x = rock.x + (rng() * 2 - 1) * 30;
      k.y = rock.y + (rng() * 2 - 1) * 30;
      k.z = rock.z + (rng() * 2 - 1) * 40;
      k.vz = rock.vz * (1.15 + rng() * 0.3);
      kids.push(k);
    }
    return kids;
  }

  function advanceRock(r, dt) {
    r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
    r.ax += r.sx * dt; r.ay += r.sy * dt;
  }

  function hitBullet(rock, bullet) {
    var S = SIZES[rock.size];
    if (Math.abs(bullet.z - rock.z) > S * 0.9) return false;
    var dx = bullet.x - rock.x, dy = bullet.y - rock.y;
    return dx * dx + dy * dy < S * S * 0.81;
  }

  function hitShip(rock, camX, camY) {
    var r = SIZES[rock.size] * 0.8 + 26;
    var dx = rock.x - camX, dy = rock.y - camY;
    return dx * dx + dy * dy < r * r;
  }

  var CORE = {
    ICO: { verts: IVERTS, edges: IEDGES },
    SIZES: SIZES, SCORES: SCORES,
    Z_FAR: Z_FAR, Z_NEAR: Z_NEAR, FOCAL: FOCAL,
    X_BOUND: X_BOUND, Y_BOUND: Y_BOUND,
    rotate: rotate, project: project,
    spawnRock: spawnRock, splitRock: splitRock, advanceRock: advanceRock,
    hitBullet: hitBullet, hitShip: hitShip
  };

  /* ================= DOM wiring ================= */

  var best = 0;   // survives esc/re-enter within the page session

  function start(canvas, opts) {
    var ctx = canvas.getContext('2d');
    var reduced = !!opts.reduced;
    var isActive = opts.isActive || function () { return true; };
    var touch = 'ontouchstart' in root;
    var rng = Math.random;

    var mode = 'attract';           // attract | playing | over
    var score = 0, lives = 0, level = 0;
    var cam, rocks, bullets, stars;
    var keys = {};
    var fireCool = 0, invuln = 0, attractT = 0, flash = 0;
    var sparks = [];
    var ignoreUntil = performance.now() + 250;
    var lastT = performance.now();
    var raf = 0, stopped = false;
    var dragFrom = null;

    /* palette: cached, invalidated when the theme class changes */
    var pal = null;
    function readPalette() {
      var cs = getComputedStyle(document.documentElement);
      var fg = (cs.getPropertyValue('--foreground') || '#ebdbb2').trim();
      pal = {
        bg: (cs.getPropertyValue('--background') || '#1d2021').trim(),
        fg: fg,
        accent: (cs.getPropertyValue('--accent') || '#8ec07c').trim(),
        dim: (cs.getPropertyValue('--dim') || fg).trim(),
        font: getComputedStyle(document.body).fontFamily
      };
    }
    readPalette();
    var themeObserver = new MutationObserver(function () {
      readPalette();
      if (!raf) render();          // restyle still frames too
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    /* sizing: padding-aware, resize-driven, not per-frame */
    var W = 300, H = 200;
    function fit() {
      var parent = canvas.parentNode;
      if (!parent) return;
      var pc = getComputedStyle(parent);
      var w = parent.clientWidth - parseFloat(pc.paddingLeft) - parseFloat(pc.paddingRight);
      var h = parent.clientHeight - parseFloat(pc.paddingTop) - parseFloat(pc.paddingBottom);
      var dpr = root.devicePixelRatio || 1;
      W = Math.max(60, Math.floor(w)); H = Math.max(60, Math.floor(h));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!raf) render();
    }
    var ro = new ResizeObserver(fit);
    if (canvas.parentNode) ro.observe(canvas.parentNode);
    fit();

    function makeStars() {
      stars = [];
      for (var i = 0; i < 70; i++) {
        stars.push({ x: (rng() * 2 - 1) * X_BOUND * 1.6, y: (rng() * 2 - 1) * Y_BOUND * 1.6, z: rng() * Z_FAR });
      }
    }
    makeStars();

    function resetCam() { cam = { x: 0, y: 0, vx: 0, vy: 0 }; invuln = 2.2; }
    function startRun() {
      mode = 'playing'; score = 0; lives = 3; level = 1;
      rocks = []; bullets = []; keys = {}; sparks = [];
      for (var i = 0; i < 3 + level; i++) rocks.push(spawnRock(level, 0, rng));
      resetCam();
      ensureLoop();
    }
    function nextLevel() {
      level++;
      for (var i = 0; i < 3 + level; i++) rocks.push(spawnRock(level, 0, rng));
    }

    function fire() {
      if (fireCool > 0 || bullets.length >= 4 || mode !== 'playing') return;
      fireCool = 0.2;
      bullets.push({ x: cam.x, y: cam.y, z: Z_NEAR + 10, vz: 950 });
    }

    /* input */
    function onKeyDown(e) {
      if (performance.now() < ignoreUntil) return;
      keys[e.key] = true;
      if (e.key === 'Enter' && mode !== 'playing') startRun();
      if (e.key === ' ') fire();
    }
    function onKeyUp(e) { keys[e.key] = false; }
    function onBlurLike() { keys = {}; dragFrom = null; }
    function onPointerDown(e) {
      if (performance.now() < ignoreUntil) return;
      if (mode !== 'playing') { startRun(); return; }
      dragFrom = { px: e.clientX, py: e.clientY, cx: cam.x, cy: cam.y };
      fire();
    }
    function onPointerMove(e) {
      if (!dragFrom || mode !== 'playing') return;
      cam.x = Math.max(-X_BOUND, Math.min(X_BOUND, dragFrom.cx + (e.clientX - dragFrom.px) * 2.4));
      cam.y = Math.max(-Y_BOUND, Math.min(Y_BOUND, dragFrom.cy + (e.clientY - dragFrom.py) * 2.4));
    }
    function onPointerUp() { dragFrom = null; }

    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', onBlurLike);
    document.addEventListener('visibilitychange', onBlurLike);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);

    function stop() {
      if (stopped) return;
      stopped = true;
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('keyup', onKeyUp);
      root.removeEventListener('blur', onBlurLike);
      document.removeEventListener('visibilitychange', onBlurLike);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      themeObserver.disconnect();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    /* simulation */
    function step(dt) {
      if (mode !== 'playing') { attractT += dt; return; }
      if (keys.ArrowLeft) cam.vx -= 900 * dt;
      if (keys.ArrowRight) cam.vx += 900 * dt;
      if (keys.ArrowUp) cam.vy -= 900 * dt;
      if (keys.ArrowDown) cam.vy += 900 * dt;
      var damp = Math.exp(-3.2 * dt);
      cam.vx *= damp; cam.vy *= damp;
      cam.x = Math.max(-X_BOUND, Math.min(X_BOUND, cam.x + cam.vx * dt));
      cam.y = Math.max(-Y_BOUND, Math.min(Y_BOUND, cam.y + cam.vy * dt));
      fireCool -= dt; invuln -= dt; flash = Math.max(0, flash - dt);
      if (keys[' ']) fire();

      stars.forEach(function (st) {
        st.z -= 220 * dt;
        if (st.z < 8) { st.z = Z_FAR; st.x = (rng() * 2 - 1) * X_BOUND * 1.6; st.y = (rng() * 2 - 1) * Y_BOUND * 1.6; }
      });

      bullets = bullets.filter(function (bl) { bl.z += bl.vz * dt; return bl.z < Z_FAR; });

      var spawned = [];
      rocks = rocks.filter(function (rk) {
        advanceRock(rk, dt);
        for (var i = 0; i < bullets.length; i++) {
          if (hitBullet(rk, bullets[i])) {
            bullets.splice(i, 1);
            score += SCORES[rk.size];
            sparks.push({ x: rk.x, y: rk.y, z: rk.z, t: 0.3 });
            spawned.push.apply(spawned, splitRock(rk, rng));
            return false;
          }
        }
        if (rk.z <= Z_NEAR) {
          if (invuln <= 0 && hitShip(rk, cam.x, cam.y)) {
            lives--; flash = 0.5;
            if (lives <= 0) { mode = 'over'; best = Math.max(best, score); }
            else resetCam();
          }
          return false;   // passed the camera either way
        }
        return true;
      });
      rocks = rocks.concat(spawned);
      sparks = sparks.filter(function (sp) { sp.t -= dt; return sp.t > 0; });
      if (rocks.length === 0) nextLevel();
    }

    /* rendering */
    function drawPoly(cx, cy, rock) {
      var S = SIZES[rock.size];
      ctx.beginPath();
      for (var i = 0; i < IEDGES.length; i++) {
        var e = IEDGES[i];
        var v1 = rotate(IVERTS[e[0]], rock.ax, rock.ay);
        var v2 = rotate(IVERTS[e[1]], rock.ax, rock.ay);
        var p1 = project(rock.x - cam.x + v1[0] * S, rock.y - cam.y + v1[1] * S, rock.z + v1[2] * S, FOCAL);
        var p2 = project(rock.x - cam.x + v2[0] * S, rock.y - cam.y + v2[1] * S, rock.z + v2[2] * S, FOCAL);
        if (!p1 || !p2) continue;
        ctx.moveTo(cx + p1.x, cy + p1.y);
        ctx.lineTo(cx + p2.x, cy + p2.y);
      }
      ctx.stroke();
    }

    function drawIcoCentered(cx, cy, scale, t) {
      ctx.beginPath();
      for (var i = 0; i < IEDGES.length; i++) {
        var e = IEDGES[i];
        var v1 = rotate(IVERTS[e[0]], t * 0.4, t * 0.7);
        var v2 = rotate(IVERTS[e[1]], t * 0.4, t * 0.7);
        var p1 = project(v1[0] * scale, v1[1] * scale, 3 * scale + v1[2] * scale, 3 * scale);
        var p2 = project(v2[0] * scale, v2[1] * scale, 3 * scale + v2[2] * scale, 3 * scale);
        if (!p1 || !p2) continue;
        ctx.moveTo(cx + p1.x, cy + p1.y);
        ctx.lineTo(cx + p2.x, cy + p2.y);
      }
      ctx.stroke();
    }

    function render() {
      var cx = W / 2, cy = H / 2;
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.font = '13px ' + pal.font;
      ctx.lineWidth = 1.4;

      if (mode !== 'playing') {
        ctx.strokeStyle = pal.accent;
        drawIcoCentered(cx, cy - 14, Math.min(W, H) * 0.19, reduced ? 0.6 : attractT);
        ctx.fillStyle = pal.accent;
        ctx.textAlign = 'center';
        ctx.font = 'bold 16px ' + pal.font;
        ctx.fillText(mode === 'over' ? 'GAME OVER · SCORE ' + score : 'A S T E R O I D S / 3 D',
          cx, cy + Math.min(W, H) * 0.19 + 28);
        ctx.fillStyle = pal.dim;
        ctx.font = '13px ' + pal.font;
        ctx.fillText(touch ? 'tap to start · drag to steer · esc leaves'
          : 'enter to start · arrows steer · space fires · esc leaves',
          cx, cy + Math.min(W, H) * 0.19 + 50);
        if (best > 0) ctx.fillText('best ' + best, cx, cy + Math.min(W, H) * 0.19 + 70);
        ctx.textAlign = 'left';
        return;
      }

      // starfield (dim, size by depth)
      ctx.fillStyle = pal.dim;
      stars.forEach(function (st) {
        var p = project(st.x - cam.x, st.y - cam.y, st.z, FOCAL);
        if (!p) return;
        var px = cx + p.x, py = cy + p.y;
        if (px < 0 || px > W || py < 0 || py > H) return;
        var r = Math.max(0.5, 1.6 * p.s);
        ctx.fillRect(px, py, r, r);
      });

      // rocks, far to near so close ones draw over
      ctx.strokeStyle = pal.accent;
      rocks.slice().sort(function (r1, r2) { return r2.z - r1.z; }).forEach(function (rk) {
        drawPoly(cx, cy, rk);
      });

      // bullets: dual tracers that start beside the reticle and converge
      // with depth, so a stationary shot is clearly visible
      ctx.strokeStyle = pal.fg;
      ctx.beginPath();
      bullets.forEach(function (bl) {
        var tip = project(bl.x - cam.x, bl.y - cam.y, bl.z + 40, FOCAL);
        if (!tip) return;
        var prog = Math.min(1, (bl.z - Z_NEAR) / 500);
        var spread = 26 * (1 - prog), drop = 16 * (1 - prog);
        [-1, 1].forEach(function (sgn) {
          ctx.moveTo(cx + sgn * spread, cy + drop);
          ctx.lineTo(cx + tip.x, cy + tip.y);
        });
      });
      ctx.stroke();

      // muzzle flash right after firing
      if (fireCool > 0.14) {
        ctx.strokeStyle = pal.fg;
        ctx.beginPath();
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (d) {
          ctx.moveTo(cx + d[0] * 8, cy + d[1] * 8);
          ctx.lineTo(cx + d[0] * 15, cy + d[1] * 15);
        });
        ctx.stroke();
      }

      // hit sparks: four expanding rays where a rock died
      sparks.forEach(function (sp) {
        var p = project(sp.x - cam.x, sp.y - cam.y, sp.z, FOCAL);
        if (!p) return;
        var grow = (0.3 - sp.t) / 0.3;
        var len = (6 + 26 * grow) * p.s * 3;
        ctx.strokeStyle = pal.accent;
        ctx.beginPath();
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (d) {
          ctx.moveTo(cx + p.x + d[0] * len * 0.3, cy + p.y + d[1] * len * 0.3);
          ctx.lineTo(cx + p.x + d[0] * len, cy + p.y + d[1] * len);
        });
        ctx.stroke();
      });

      // reticle (blinks while invulnerable)
      if (invuln <= 0 || Math.floor(invuln * 8) % 2 === 0) {
        ctx.strokeStyle = pal.accent;
        ctx.beginPath();
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
          ctx.moveTo(cx + d[0] * 10, cy + d[1] * 10);
          ctx.lineTo(cx + d[0] * 22, cy + d[1] * 22);
        });
        ctx.stroke();
        ctx.strokeRect(cx - 4, cy - 4, 8, 8);
      }

      // hit flash: brief frame border
      if (flash > 0) {
        ctx.strokeStyle = pal.fg;
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, W - 4, H - 4);
        ctx.lineWidth = 1.4;
      }

      // HUD
      ctx.fillStyle = pal.dim;
      ctx.fillText('score ' + score + '   level ' + level, 10, 18);
      for (var i = 0; i < lives; i++) {
        var lx = W - 16 - i * 16;
        ctx.strokeStyle = pal.dim;
        ctx.strokeRect(lx - 4, 10, 8, 8);
      }
    }

    /* loop: runs while active and (animating or playing); reduced-motion
       still screens render once, event-driven */
    function needsLoop() { return mode === 'playing' || !reduced; }
    function frame(now) {
      raf = 0;
      if (stopped) return;
      if (!isActive()) { stop(); return; }
      var dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      step(dt);
      render();
      if (needsLoop()) raf = requestAnimationFrame(frame);
    }
    function ensureLoop() {
      lastT = performance.now();
      if (!raf && !stopped) raf = requestAnimationFrame(frame);
    }

    render();                       // first frame (also the reduced still)
    if (needsLoop()) ensureLoop();

    // reduced-motion: over/attract transitions re-render once via events
    if (reduced) {
      var rerender = function () { if (!raf && !stopped) render(); };
      root.addEventListener('keyup', rerender);
      canvas.addEventListener('pointerup', rerender);
      var innerStop = stop;
      stop = function () {
        root.removeEventListener('keyup', rerender);
        canvas.removeEventListener('pointerup', rerender);
        innerStop();
      };
    }

    return { stop: function () { stop(); } };
  }

  root.TUIGame = { start: start, core: CORE };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
}(typeof window !== 'undefined' ? window : globalThis));
