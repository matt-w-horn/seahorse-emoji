// Wireframe asteroids for the terminal home (issue #5). No dependencies,
// canvas only, every stroke in the live theme variables so the `theme`
// command restyles the game mid-flight. Attract screen is a perspective-
// projected wireframe icosahedron. TUIGame.start(canvas, {reduced, isActive});
// the loop tears itself down when isActive() goes false (esc navigates away).
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;
  var SIZES = [46, 26, 14];
  var SCORES = [20, 50, 100];

  // icosahedron: 12 vertices from the golden ratio, 30 edges (length 2)
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

  function rockShape(r) {
    var pts = [];
    var n = 9 + Math.floor(Math.random() * 4);
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * TAU;
      var rad = r * (0.72 + Math.random() * 0.45);
      pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
    }
    return pts;
  }

  function newRock(w, h, size, x, y, level) {
    var speed = (40 + level * 8) * (1 + (2 - size) * 0.4) * (0.7 + Math.random() * 0.6);
    var dir = Math.random() * TAU;
    return {
      x: x != null ? x : Math.random() * w,
      y: y != null ? y : Math.random() * h,
      vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed,
      size: size, r: SIZES[size] * (2 - size === 0 ? 1 : 1),
      ang: Math.random() * TAU, spin: (Math.random() - 0.5) * 1.6,
      shape: rockShape(SIZES[size])
    };
  }

  function start(canvas, opts) {
    var ctx = canvas.getContext('2d');
    var reduced = !!opts.reduced;
    var isActive = opts.isActive || function () { return true; };
    var touch = 'ontouchstart' in root;

    var mode = 'attract';           // attract | playing | over
    var score = 0, best = 0, lives = 0, level = 0;
    var ship, bullets, rocks;
    var keys = {};
    var fireCool = 0, invuln = 0, spin = 0;
    var ignoreUntil = performance.now() + 250;   // the Enter that launched us
    var lastT = performance.now();
    var raf = 0, staticDrawn = false;

    function resetShip(w, h) {
      ship = { x: w / 2, y: h / 2, vx: 0, vy: 0, a: -TAU / 4 };
      invuln = 2.4;
    }
    function startRun(w, h) {
      mode = 'playing'; score = 0; lives = 3; level = 1;
      bullets = []; rocks = [];
      for (var i = 0; i < 4; i++) rocks.push(newRock(w, h, 0, null, null, level));
      resetShip(w, h);
      staticDrawn = false;
    }
    function nextLevel(w, h) {
      level++; bullets = [];
      for (var i = 0; i < 3 + level; i++) rocks.push(newRock(w, h, 0, null, null, level));
      resetShip(w, h);
    }

    function onKeyDown(e) {
      if (performance.now() < ignoreUntil) return;
      keys[e.key] = true;
      if (e.key === 'Enter' && mode !== 'playing') {
        startRun(canvas.clientWidth, canvas.clientHeight);
      }
    }
    function onKeyUp(e) { keys[e.key] = false; }
    function onPointer() {
      if (performance.now() < ignoreUntil) return;
      if (mode !== 'playing') startRun(canvas.clientWidth, canvas.clientHeight);
      else fire(true);
    }
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointer);

    function cleanup() {
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointer);
      if (raf) cancelAnimationFrame(raf);
    }

    function fit() {
      var dpr = root.devicePixelRatio || 1;
      var w = canvas.parentNode ? canvas.parentNode.clientWidth - 4 : 300;
      var h = canvas.parentNode ? canvas.parentNode.clientHeight - 8 : 200;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        staticDrawn = false;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: w, h: h };
    }

    function colors() {
      var cs = getComputedStyle(document.documentElement);
      return {
        bg: (cs.getPropertyValue('--background') || '#1d2021').trim(),
        fg: (cs.getPropertyValue('--foreground') || '#ebdbb2').trim(),
        accent: (cs.getPropertyValue('--accent') || '#8ec07c').trim(),
        dim: (cs.getPropertyValue('--dim') || '#8a8577').trim(),
        font: getComputedStyle(document.body).fontFamily
      };
    }

    function wrap(o, w, h, m) {
      m = m || 0;
      if (o.x < -m) o.x += w + 2 * m; if (o.x > w + m) o.x -= w + 2 * m;
      if (o.y < -m) o.y += h + 2 * m; if (o.y > h + m) o.y -= h + 2 * m;
    }

    function fire(fromTap) {
      if (fireCool > 0 || bullets.length >= 4) return;
      fireCool = 0.22;
      bullets.push({
        x: ship.x + Math.cos(ship.a) * 12, y: ship.y + Math.sin(ship.a) * 12,
        vx: ship.vx + Math.cos(ship.a) * 420, vy: ship.vy + Math.sin(ship.a) * 420,
        life: 1.15
      });
      if (fromTap) { /* tap also nudges forward a touch, so touch play is possible */ ship.vx += Math.cos(ship.a) * 6; ship.vy += Math.sin(ship.a) * 6; }
    }

    function step(dt, w, h) {
      if (mode !== 'playing') { spin += dt; return; }
      if (keys.ArrowLeft) ship.a -= 3.6 * dt;
      if (keys.ArrowRight) ship.a += 3.6 * dt;
      if (keys.ArrowUp) { ship.vx += Math.cos(ship.a) * 240 * dt; ship.vy += Math.sin(ship.a) * 240 * dt; }
      if (keys[' ']) fire();
      fireCool -= dt; invuln -= dt;
      var damp = Math.exp(-0.6 * dt);
      ship.vx *= damp; ship.vy *= damp;
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      wrap(ship, w, h, 12);

      bullets = bullets.filter(function (bl) {
        bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;
        wrap(bl, w, h);
        return bl.life > 0;
      });

      var spawned = [];
      rocks = rocks.filter(function (rk) {
        rk.x += rk.vx * dt; rk.y += rk.vy * dt; rk.ang += rk.spin * dt;
        wrap(rk, w, h, SIZES[rk.size]);
        for (var i = 0; i < bullets.length; i++) {
          var dx = bullets[i].x - rk.x, dy = bullets[i].y - rk.y;
          if (dx * dx + dy * dy < SIZES[rk.size] * SIZES[rk.size] * 0.72) {
            bullets.splice(i, 1);
            score += SCORES[rk.size];
            if (rk.size < 2) {
              spawned.push(newRock(w, h, rk.size + 1, rk.x, rk.y, level));
              spawned.push(newRock(w, h, rk.size + 1, rk.x, rk.y, level));
            }
            return false;
          }
        }
        if (invuln <= 0) {
          var sx = ship.x - rk.x, sy = ship.y - rk.y;
          var rr = SIZES[rk.size] * 0.8 + 10;
          if (sx * sx + sy * sy < rr * rr) {
            lives--;
            if (lives <= 0) { mode = 'over'; best = Math.max(best, score); }
            else resetShip(w, h);
          }
        }
        return true;
      });
      rocks = rocks.concat(spawned);
      if (rocks.length === 0) nextLevel(w, h);
    }

    function drawIco(c, cx, cy, scale, t) {
      var ca = Math.cos(t * 0.7), sa = Math.sin(t * 0.7);
      var cb = Math.cos(t * 0.4), sb = Math.sin(t * 0.4);
      var pts = IVERTS.map(function (v) {
        var x = v[0] * ca - v[2] * sa, z = v[0] * sa + v[2] * ca;   // rotate Y
        var y = v[1] * cb - z * sb; z = v[1] * sb + z * cb;         // rotate X
        var p = 3 / (3 + z);                                        // perspective
        return [cx + x * scale * p, cy + y * scale * p];
      });
      ctx.beginPath();
      IEDGES.forEach(function (e2) {
        ctx.moveTo(pts[e2[0]][0], pts[e2[0]][1]);
        ctx.lineTo(pts[e2[1]][0], pts[e2[1]][1]);
      });
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    function draw(w, h) {
      var c = colors();
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, w, h);
      ctx.font = '13px ' + c.font;

      if (mode !== 'playing') {
        drawIco(c.accent, w / 2, h / 2 - 14, Math.min(w, h) * 0.2, reduced && mode === 'attract' ? 0.6 : spin);
        ctx.fillStyle = c.accent;
        ctx.textAlign = 'center';
        ctx.font = 'bold 16px ' + c.font;
        ctx.fillText(mode === 'over' ? 'GAME OVER · SCORE ' + score : 'A S T E R O I D S', w / 2, h / 2 + Math.min(w, h) * 0.2 + 26);
        ctx.fillStyle = c.dim;
        ctx.font = '13px ' + c.font;
        ctx.fillText(touch ? 'tap to start (best with a keyboard) · esc leaves' : 'enter to start · esc leaves', w / 2, h / 2 + Math.min(w, h) * 0.2 + 48);
        if (best > 0 && mode === 'attract') ctx.fillText('best ' + best, w / 2, h / 2 + Math.min(w, h) * 0.2 + 68);
        ctx.textAlign = 'left';
        return;
      }

      // rocks
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 1.4;
      rocks.forEach(function (rk) {
        ctx.save();
        ctx.translate(rk.x, rk.y);
        ctx.rotate(rk.ang);
        ctx.beginPath();
        rk.shape.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      });

      // ship (blinks while invulnerable)
      if (invuln <= 0 || Math.floor(invuln * 8) % 2 === 0) {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.a);
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(-10, 8); ctx.lineTo(-6, 0); ctx.lineTo(-10, -8);
        ctx.closePath();
        ctx.stroke();
        if (keys.ArrowUp && Math.random() > 0.4) {
          ctx.beginPath(); ctx.moveTo(-7, 3); ctx.lineTo(-15, 0); ctx.lineTo(-7, -3);
          ctx.strokeStyle = c.fg; ctx.stroke();
        }
        ctx.restore();
      }

      // bullets
      ctx.fillStyle = c.accent;
      bullets.forEach(function (bl) { ctx.fillRect(bl.x - 1.5, bl.y - 1.5, 3, 3); });

      // HUD
      ctx.fillStyle = c.dim;
      ctx.fillText('score ' + score + '   level ' + level, 10, 18);
      for (var i = 0; i < lives; i++) {
        ctx.save(); ctx.translate(w - 18 - i * 18, 14); ctx.rotate(-TAU / 4);
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 4); ctx.lineTo(-5, -4); ctx.closePath();
        ctx.strokeStyle = c.dim; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
      }
    }

    function frame(now) {
      if (!isActive()) { cleanup(); return; }
      var dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      var d = fit();
      // reduced motion: the attract screen holds one still frame; motion only
      // after the visitor explicitly starts a run
      if (reduced && mode === 'attract') {
        if (!staticDrawn) { draw(d.w, d.h); staticDrawn = true; }
      } else {
        step(dt, d.w, d.h);
        draw(d.w, d.h);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  root.TUIGame = { start: start };
}(typeof window !== 'undefined' ? window : globalThis));
