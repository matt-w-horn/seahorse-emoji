// Tests for the game's pure math core.
// Run: node --experimental-strip-types --test tests/*.test.ts
import test from 'node:test';
import assert from 'node:assert';
import { core } from '../assets/js/tui-game.ts';

// deterministic rng for spawn/split tests
const rngOf = (v: number) => () => v;

test('icosahedron topology: 12 vertices, 30 edges, unit-ish radius, valid indices', () => {
  assert.equal(core.ICO.verts.length, 12);
  assert.equal(core.ICO.edges.length, 30);
  for (const v of core.ICO.verts) {
    const n = Math.hypot(v[0], v[1], v[2]);
    assert.ok(Math.abs(n - 1) < 1e-9, 'vertex normalized');
  }
  for (const [a, b] of core.ICO.edges) {
    assert.ok(a >= 0 && a < 12 && b >= 0 && b < 12 && a !== b);
  }
});

test('project: perspective shrinks with depth, center is invariant, eye plane is null', () => {
  const near = core.project(100, 50, 200, core.FOCAL);
  const far = core.project(100, 50, 1000, core.FOCAL);
  assert.ok(near!.s > far!.s, 'closer is larger');
  assert.ok(Math.abs(near!.x) > Math.abs(far!.x), 'closer displaces more');
  const center = core.project(0, 0, 500, core.FOCAL);
  assert.equal(center!.x, 0);
  assert.equal(center!.y, 0);
  assert.equal(core.project(1, 1, 0, core.FOCAL), null);
  assert.equal(core.project(1, 1, -5, core.FOCAL), null);
});

test('rotate: pure rotation preserves vector length', () => {
  const v = core.rotate([0.3, -0.7, 0.648], 1.1, 2.3);
  assert.ok(Math.abs(Math.hypot(v[0], v[1], v[2]) - Math.hypot(0.3, 0.7, 0.648)) < 1e-9);
});

test('spawnRock: deterministic under a fixed rng, inside bounds, approaching', () => {
  const r = core.spawnRock(1, 0, rngOf(0.5));
  assert.equal(r.size, 0);
  assert.ok(r.z > 0 && r.z <= core.Z_FAR);
  assert.ok(Math.abs(r.x) <= core.X_BOUND && Math.abs(r.y) <= core.Y_BOUND);
  assert.ok(r.vz < 0, 'rocks move toward the camera');
  const r2 = core.spawnRock(5, 0, rngOf(0.5));
  assert.ok(Math.abs(r2.vz) > Math.abs(r.vz), 'higher level is faster');
});

test('splitRock: two children one size smaller; smallest size yields none', () => {
  const big = core.spawnRock(1, 0, rngOf(0.5));
  const kids = core.splitRock(big, rngOf(0.25));
  assert.equal(kids.length, 2);
  for (const k of kids) {
    assert.equal(k.size, 1);
    assert.ok(Math.abs(k.z - big.z) <= 40 + 1e-9, 'children spawn near the parent depth');
  }
  const small = core.spawnRock(1, 2, rngOf(0.5));
  assert.deepEqual(core.splitRock(small, rngOf(0.5)), []);
});

test('scores and sizes are aligned and monotonic (small rocks score more)', () => {
  assert.equal(core.SIZES.length, core.SCORES.length);
  assert.ok(core.SIZES[0] > core.SIZES[1] && core.SIZES[1] > core.SIZES[2]);
  assert.ok(core.SCORES[0] < core.SCORES[1] && core.SCORES[1] < core.SCORES[2]);
});

test('hitBullet: inside radius and depth band hits; outside either misses', () => {
  const rock = { x: 0, y: 0, z: 500, size: 0 };
  const S = core.SIZES[0];
  assert.ok(core.hitBullet(rock, { x: 0, y: 0, z: 500 }));
  assert.ok(core.hitBullet(rock, { x: S * 0.8, y: 0, z: 500 }), 'edge of radius');
  assert.ok(!core.hitBullet(rock, { x: S, y: 0, z: 500 }), 'outside radius');
  assert.ok(!core.hitBullet(rock, { x: 0, y: 0, z: 500 + S }), 'outside depth band');
});

test('hitShip: near passes hit, wide passes miss; smaller rocks are more forgiving', () => {
  const big = { x: 30, y: 0, z: core.Z_NEAR, size: 0 };
  const far = { x: core.SIZES[0] * 0.8 + 27, y: 0, z: core.Z_NEAR, size: 0 };
  assert.ok(core.hitShip(big, 0, 0));
  assert.ok(!core.hitShip(far, 0, 0));
  const smallAtSameOffset = { x: core.SIZES[0] * 0.8 + 27, y: 0, z: core.Z_NEAR, size: 2 };
  assert.ok(!core.hitShip(smallAtSameOffset, 0, 0));
});

test('advanceRock: integrates position and tumble', () => {
  const r = { x: 0, y: 0, z: 1000, vx: 10, vy: -10, vz: -100, ax: 0, ay: 0, sx: 1, sy: 2, size: 0 };
  core.advanceRock(r, 0.5);
  assert.equal(r.x, 5);
  assert.equal(r.y, -5);
  assert.equal(r.z, 950);
  assert.equal(r.ax, 0.5);
  assert.equal(r.ay, 1);
});

test('octahedron topology: 6 vertices, 12 edges, unit radius, valid indices', () => {
  assert.equal(core.OCT.verts.length, 6);
  assert.equal(core.OCT.edges.length, 12);
  for (const v of core.OCT.verts) {
    assert.ok(Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) < 1e-9, 'vertex normalized');
  }
  for (const [a, b] of core.OCT.edges) {
    assert.ok(a >= 0 && a < 6 && b >= 0 && b < 6 && a !== b);
  }
});

test('spawnWave: 3+level rocks capped at 10, staggered so later rocks start deeper', () => {
  const w1 = core.spawnWave(1, rngOf(0.5));
  assert.equal(w1.length, 4);
  for (let i = 1; i < w1.length; i++) {
    assert.ok(w1[i].z > w1[i - 1].z, 'each rock spawns behind the previous one');
  }
  assert.equal(core.spawnWave(99, rngOf(0.5)).length, 10, 'wave size is capped');
});

test('spawnPickup: sits where the rock died, drifts toward the camera, keeps its kind', () => {
  const p = core.spawnPickup(120, -80, 900, 2, rngOf(0.5));
  assert.equal(p.x, 120);
  assert.equal(p.y, -80);
  assert.equal(p.z, 900);
  assert.equal(p.kind, 2);
  assert.ok(p.vz < 0, 'pickups drift toward the camera');
});

test('collectPickup: generous radius, misses far offsets', () => {
  assert.ok(core.collectPickup({ x: 0, y: 0 }, 0, 0));
  assert.ok(core.collectPickup({ x: core.PICKUP_R - 1, y: 0 }, 0, 0), 'edge of radius');
  assert.ok(!core.collectPickup({ x: core.PICKUP_R + 1, y: 0 }, 0, 0), 'outside radius');
});

test('spawnHunter: enters deep, off-axis, approaching slower than rocks', () => {
  const h = core.spawnHunter(2, rngOf(0.25));
  assert.equal(h.z, core.Z_FAR);
  assert.ok(Math.abs(h.x) > 0 || Math.abs(h.y) > 0, 'starts off-center');
  assert.ok(h.vz < 0, 'approaches the camera');
  const r = core.spawnRock(2, 0, rngOf(0.25));
  assert.ok(Math.abs(h.vz) < Math.abs(r.vz), 'slower than a rock: it lingers and stalks');
});

test('steerHunter: homes toward the camera, clamps lateral speed, advances depth', () => {
  const h = core.spawnHunter(1, rngOf(0.5));
  h.x = 300; h.y = -200; h.vx = 0; h.vy = 0;
  const z0 = h.z;
  core.steerHunter(h, 0, 0, 0.1);
  assert.ok(h.vx < 0, 'accelerates left toward the camera');
  assert.ok(h.vy > 0, 'accelerates down toward the camera');
  assert.ok(h.z < z0, 'still closes depth');
  for (let i = 0; i < 200; i++) core.steerHunter(h, 0, 0, 0.05);
  assert.ok(Math.hypot(h.vx, h.vy) <= core.HUNTER_SPEED + 1e-6, 'lateral speed is clamped');
});

test('hitHunter: inside radius and depth band hits; outside either misses', () => {
  const h = { x: 0, y: 0, z: 400 };
  assert.ok(core.hitHunter(h, { x: 0, y: 0, z: 400 }));
  assert.ok(core.hitHunter(h, { x: core.HUNTER_R - 1, y: 0, z: 400 }), 'edge of radius');
  assert.ok(!core.hitHunter(h, { x: core.HUNTER_R + 40, y: 0, z: 400 }), 'outside radius');
  assert.ok(!core.hitHunter(h, { x: 0, y: 0, z: 400 + core.HUNTER_R * 2 }), 'outside depth band');
});

test('comboMult: starts at x1, steps up every 4 chained kills, caps at x5', () => {
  assert.equal(core.comboMult(0), 1);
  assert.equal(core.comboMult(3), 1);
  assert.equal(core.comboMult(4), 2);
  assert.equal(core.comboMult(8), 3);
  assert.equal(core.comboMult(100), 5, 'capped');
});

test('polyhedron faces: icosahedron 20 triangles, octahedron 8, all face edges are real edges', () => {
  assert.equal(core.ICO.faces.length, 20);
  assert.equal(core.OCT.faces.length, 8);
  const checkFaces = (edges: [number, number][], faces: [number, number, number][]) => {
    const has = new Set(edges.map(([a, b]) => (a < b ? a + '-' + b : b + '-' + a)));
    for (const [i, j, k] of faces) {
      assert.equal(new Set([i, j, k]).size, 3, 'three distinct vertices');
      for (const [p, q] of [[i, j], [j, k], [i, k]]) {
        assert.ok(has.has(p < q ? p + '-' + q : q + '-' + p), 'face edge exists in the edge list');
      }
    }
  };
  checkFaces(core.ICO.edges, core.ICO.faces);
  checkFaces(core.OCT.edges, core.OCT.faces);
});

test('color helpers: hex round-trip, mix midpoint, hue rotation, luma ordering', () => {
  assert.deepEqual(core.hexToRgb('#8ec07c'), [142, 192, 124]);
  assert.deepEqual(core.hexToRgb('#8ec07g'), [128, 128, 128], 'trailing non-hex char falls back to gray');
  assert.equal(core.rgbToHex([142, 192, 124]), '#8ec07c');
  assert.deepEqual(core.mixRgb([0, 0, 0], [255, 255, 255], 0.5), [128, 128, 128]);
  const cyan = core.rotateHue([255, 0, 0], 180);
  assert.ok(cyan[0] < 10 && cyan[1] > 245 && cyan[2] > 245, 'red rotated 180deg is cyan');
  const back = core.rotateHue(core.rotateHue([142, 192, 124], 90), -90);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - [142, 192, 124][i]) <= 2, 'rotation round-trips');
  assert.ok(core.luma([0, 0, 0]) < core.luma([128, 128, 128]));
  assert.ok(core.luma([128, 128, 128]) < core.luma([255, 255, 255]));
});

test('huntersForWave: none on wave 1, one from wave 2, one more every third wave, capped at 3', () => {
  assert.equal(core.huntersForWave(1), 0);
  assert.equal(core.huntersForWave(2), 1);
  assert.equal(core.huntersForWave(4), 1);
  assert.equal(core.huntersForWave(5), 2);
  assert.equal(core.huntersForWave(8), 3);
  assert.equal(core.huntersForWave(50), 3, 'capped');
});

test('grazed: near pass past the ship scores, wide pass does not', () => {
  const size = 0;
  const hitR = core.shipHitR(size);   // the exported radius, not a copy of the formula
  const near = { x: hitR + 10, y: 0, size: size };
  const wide = { x: hitR * 2 + 60, y: 0, size: size };
  assert.ok(!core.hitShip({ x: near.x, y: near.y, size: size }, 0, 0), 'near pass is not a hit');
  assert.ok(core.grazed(near, 0, 0), 'near pass grazes');
  assert.ok(!core.grazed(wide, 0, 0), 'wide pass does not graze');
});
