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
