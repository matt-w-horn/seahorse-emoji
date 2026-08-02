// Tests for the game rules and the state machine.
// Run: node --experimental-strip-types --test tests/*.test.ts
import test from 'node:test';
import assert from 'node:assert';
import {
  SIZES, SCORES, Z_FAR, Z_NEAR, X_BOUND, Y_BOUND, HUNTER_R, HUNTER_SPEED, PICKUP_R,
  spawnRock, spawnWave, splitRock, advanceRock, spawnPickup, collectPickup,
  spawnHunter, steerHunter, huntersForWave,
  hitBullet, hitHunter, hitShip, shipHitR, grazed, comboMult,
  createSim,
} from '../assets/js/game/sim.ts';
import { mulberry32 } from '../assets/js/game/rng.ts';
import type { Intent } from '../assets/js/game/types.ts';

// deterministic rng for spawn/split tests
const rngOf = (v: number) => () => v;

const IDLE: Intent = { left: false, right: false, up: false, down: false, fire: false, start: false, drag: null };
const intent = (over: Partial<Intent> = {}): Intent => ({ ...IDLE, ...over });

/* ================= spawning and motion ================= */

test('spawnRock: deterministic under a fixed rng, inside bounds, approaching', () => {
  const r = spawnRock(1, 0, rngOf(0.5));
  assert.equal(r.size, 0);
  assert.ok(r.z > 0 && r.z <= Z_FAR);
  assert.ok(Math.abs(r.x) <= X_BOUND && Math.abs(r.y) <= Y_BOUND);
  assert.ok(r.vz < 0, 'rocks move toward the camera');
  const r2 = spawnRock(5, 0, rngOf(0.5));
  assert.ok(Math.abs(r2.vz) > Math.abs(r.vz), 'higher level is faster');
});

test('splitRock: two children one size smaller; smallest size yields none', () => {
  const big = spawnRock(1, 0, rngOf(0.5));
  const kids = splitRock(big, rngOf(0.25));
  assert.equal(kids.length, 2);
  for (const k of kids) {
    assert.equal(k.size, 1);
    assert.ok(Math.abs(k.z - big.z) <= 40 + 1e-9, 'children spawn near the parent depth');
  }
  const small = spawnRock(1, 2, rngOf(0.5));
  assert.deepEqual(splitRock(small, rngOf(0.5)), []);
});

test('scores and sizes are aligned and monotonic (small rocks score more)', () => {
  assert.equal(SIZES.length, SCORES.length);
  assert.ok(SIZES[0] > SIZES[1] && SIZES[1] > SIZES[2]);
  assert.ok(SCORES[0] < SCORES[1] && SCORES[1] < SCORES[2]);
});

test('advanceRock: integrates position and tumble', () => {
  const r = { x: 0, y: 0, z: 1000, vx: 10, vy: -10, vz: -100, ax: 0, ay: 0, sx: 1, sy: 2, size: 0 };
  advanceRock(r, 0.5);
  assert.equal(r.x, 5);
  assert.equal(r.y, -5);
  assert.equal(r.z, 950);
  assert.equal(r.ax, 0.5);
  assert.equal(r.ay, 1);
});

test('spawnWave: 3+level rocks capped at 10, staggered so later rocks start deeper', () => {
  const w1 = spawnWave(1, rngOf(0.5));
  assert.equal(w1.length, 4);
  for (let i = 1; i < w1.length; i++) {
    assert.ok(w1[i].z > w1[i - 1].z, 'each rock spawns behind the previous one');
  }
  assert.equal(spawnWave(99, rngOf(0.5)).length, 10, 'wave size is capped');
});

test('spawnPickup: sits where the rock died, drifts toward the camera, keeps its kind', () => {
  const p = spawnPickup(120, -80, 900, 2, rngOf(0.5));
  assert.equal(p.x, 120);
  assert.equal(p.y, -80);
  assert.equal(p.z, 900);
  assert.equal(p.kind, 2);
  assert.ok(p.vz < 0, 'pickups drift toward the camera');
});

test('collectPickup: generous radius, misses far offsets', () => {
  // the offsets below are relative to PICKUP_R, so they track it and cannot
  // catch it moving; the literal is what pins the collection radius
  assert.equal(PICKUP_R, 95);
  assert.ok(collectPickup({ x: 0, y: 0 }, 0, 0));
  assert.ok(collectPickup({ x: PICKUP_R - 1, y: 0 }, 0, 0), 'edge of radius');
  assert.ok(!collectPickup({ x: PICKUP_R + 1, y: 0 }, 0, 0), 'outside radius');
});

test('spawnHunter: enters deep, off-axis, approaching slower than rocks', () => {
  const h = spawnHunter(2, rngOf(0.25));
  assert.equal(h.z, Z_FAR);
  assert.ok(Math.abs(h.x) > 0 || Math.abs(h.y) > 0, 'starts off-center');
  assert.ok(h.vz < 0, 'approaches the camera');
  const r = spawnRock(2, 0, rngOf(0.25));
  assert.ok(Math.abs(h.vz) < Math.abs(r.vz), 'slower than a rock: it lingers and stalks');
});

test('steerHunter: homes toward the camera, clamps lateral speed, advances depth', () => {
  const h = spawnHunter(1, rngOf(0.5));
  h.x = 300; h.y = -200; h.vx = 0; h.vy = 0;
  const z0 = h.z;
  steerHunter(h, 0, 0, 0.1);
  assert.ok(h.vx < 0, 'accelerates left toward the camera');
  assert.ok(h.vy > 0, 'accelerates down toward the camera');
  assert.ok(h.z < z0, 'still closes depth');
  for (let i = 0; i < 200; i++) steerHunter(h, 0, 0, 0.05);
  assert.ok(Math.hypot(h.vx, h.vy) <= HUNTER_SPEED + 1e-6, 'lateral speed is clamped');
});

test('huntersForWave: none on wave 1, one from wave 2, one more every third wave, capped at 3', () => {
  assert.equal(huntersForWave(1), 0);
  assert.equal(huntersForWave(2), 1);
  assert.equal(huntersForWave(4), 1);
  assert.equal(huntersForWave(5), 2);
  assert.equal(huntersForWave(8), 3);
  assert.equal(huntersForWave(50), 3, 'capped');
});

/* ================= collision and scoring ================= */

test('hitBullet: inside radius and depth band hits; outside either misses', () => {
  const rock = { x: 0, y: 0, z: 500, size: 0 };
  const S = SIZES[0];
  assert.ok(hitBullet(rock, { x: 0, y: 0, z: 500 }));
  assert.ok(hitBullet(rock, { x: S * 0.8, y: 0, z: 500 }), 'edge of radius');
  assert.ok(!hitBullet(rock, { x: S, y: 0, z: 500 }), 'outside radius');
  assert.ok(!hitBullet(rock, { x: 0, y: 0, z: 500 + S }), 'outside depth band');
});

test('hitHunter: inside radius and depth band hits; outside either misses', () => {
  const h = { x: 0, y: 0, z: 400 };
  assert.ok(hitHunter(h, { x: 0, y: 0, z: 400 }));
  assert.ok(hitHunter(h, { x: HUNTER_R - 1, y: 0, z: 400 }), 'edge of radius');
  assert.ok(!hitHunter(h, { x: HUNTER_R + 40, y: 0, z: 400 }), 'outside radius');
  assert.ok(!hitHunter(h, { x: 0, y: 0, z: 400 + HUNTER_R * 2 }), 'outside depth band');
});

test('hitShip: near passes hit, wide passes miss; smaller rocks are more forgiving', () => {
  const big = { x: 30, y: 0, z: Z_NEAR, size: 0 };
  const far = { x: SIZES[0] * 0.8 + 27, y: 0, z: Z_NEAR, size: 0 };
  assert.ok(hitShip(big, 0, 0));
  assert.ok(!hitShip(far, 0, 0));
  const smallAtSameOffset = { x: SIZES[0] * 0.8 + 27, y: 0, z: Z_NEAR, size: 2 };
  assert.ok(!hitShip(smallAtSameOffset, 0, 0));
});

test('grazed: near pass past the ship scores, wide pass does not', () => {
  const size = 0;
  const hitR = shipHitR(size);   // the exported radius, not a copy of the formula
  const near = { x: hitR + 10, y: 0, size: size };
  const wide = { x: hitR * 2 + 60, y: 0, size: size };
  assert.ok(!hitShip({ x: near.x, y: near.y, size: size }, 0, 0), 'near pass is not a hit');
  assert.ok(grazed(near, 0, 0), 'near pass grazes');
  assert.ok(!grazed(wide, 0, 0), 'wide pass does not graze');
});

test('comboMult: starts at x1, steps up every 4 chained kills, caps at x5', () => {
  assert.equal(comboMult(0), 1);
  assert.equal(comboMult(3), 1);
  assert.equal(comboMult(4), 2);
  assert.equal(comboMult(8), 3);
  assert.equal(comboMult(100), 5, 'capped');
});

/* ================= the state machine ================= */

test('createSim: starts in attract mode and ignores everything but start', () => {
  const sim = createSim(mulberry32(1));
  assert.equal(sim.state.mode, 'attract');
  for (let i = 0; i < 60; i++) sim.step(1 / 60, intent({ fire: true, left: true }));
  assert.equal(sim.state.mode, 'attract', 'firing does not begin a run');
  assert.equal(sim.state.rocks.length, 0);
});

test('start: three lives, wave one, a wave of rocks, and a waveStart event', () => {
  const sim = createSim(mulberry32(1));
  sim.step(1 / 60, intent({ start: true }));
  assert.equal(sim.state.mode, 'playing');
  assert.equal(sim.state.lives, 3);
  assert.equal(sim.state.level, 1);
  assert.equal(sim.state.score, 0);
  assert.equal(sim.state.rocks.length, 4, 'wave one is 3 + 1 rocks');
  assert.deepEqual(sim.drain(), [{ kind: 'waveStart', level: 1 }]);
});

test('drain: returns each event once', () => {
  const sim = createSim(mulberry32(7));
  sim.step(1 / 60, intent({ start: true }));
  assert.equal(sim.drain().length, 1);
  assert.deepEqual(sim.drain(), [], 'a second drain is empty');
});

test('fire: rate-limited and capped, and every shot reports itself', () => {
  const sim = createSim(mulberry32(3));
  sim.step(1 / 60, intent({ start: true }));
  sim.drain();
  let fired = 0;
  for (let i = 0; i < 120; i++) {           // two seconds of held fire
    sim.step(1 / 60, intent({ fire: true }));
    fired += sim.drain().filter((e) => e.kind === 'fired').length;
    assert.ok(sim.state.bullets.length <= 4, 'never more than four bullets without rapid fire');
  }
  assert.ok(fired >= 4 && fired <= 12, 'roughly one shot per 0.2s cooldown, got ' + fired);
});

test('steering: arrows accelerate and the camera clamps to the play field', () => {
  const sim = createSim(mulberry32(3));
  sim.step(1 / 60, intent({ start: true }));
  for (let i = 0; i < 300; i++) sim.step(1 / 60, intent({ left: true }));
  assert.equal(sim.state.cam.x, -X_BOUND, 'held left pins to the left bound');
  for (let i = 0; i < 600; i++) sim.step(1 / 60, intent({ down: true }));
  assert.equal(sim.state.cam.y, Y_BOUND, 'held down pins to the bottom bound');
});

test('drag: the camera goes where the pointer says, still clamped', () => {
  const sim = createSim(mulberry32(3));
  sim.step(1 / 60, intent({ start: true }));
  sim.step(1 / 60, intent({ drag: { x: 9999, y: -9999 } }));
  assert.equal(sim.state.cam.x, X_BOUND);
  assert.equal(sim.state.cam.y, -Y_BOUND);
});

test('wave flow: a cleared field pauses, then the next wave arrives announced', () => {
  const sim = createSim(mulberry32(5));
  sim.step(1 / 60, intent({ start: true }));
  sim.drain();
  sim.state.rocks.length = 0;              // clear the field the cheap way
  sim.step(1 / 60, IDLE);
  assert.ok(sim.state.interT > 0, 'clearing the field opens the pause');
  assert.equal(sim.state.level, 1, 'the wave has not turned over yet');
  for (let i = 0; i < 90; i++) sim.step(1 / 60, IDLE);   // 1.5s, past the 1.3s pause
  assert.equal(sim.state.level, 2);
  assert.ok(sim.state.rocks.length > 0, 'wave two arrived');
  assert.equal(sim.state.hunters.length, huntersForWave(2), 'and its hunters with it');
  assert.ok(sim.drain().some((e) => e.kind === 'waveStart' && e.level === 2));
});

test('damage: the shield eats one hit, then lives go, then the run ends', () => {
  const sim = createSim(mulberry32(11));
  sim.step(1 / 60, intent({ start: true }));
  sim.drain();

  // park a rock on the camera and clear invulnerability, three times over
  const slam = () => {
    sim.state.invuln = 0;
    sim.state.rocks = [{ x: 0, y: 0, z: Z_NEAR, vx: 0, vy: 0, vz: -1, ax: 0, ay: 0, sx: 0, sy: 0, size: 0 }];
    sim.step(1 / 60, IDLE);
    return sim.drain();
  };

  sim.state.shieldUp = true;
  assert.ok(slam().some((e) => e.kind === 'shieldLost'), 'the shield absorbs the first hit');
  assert.equal(sim.state.lives, 3, 'and costs no life');
  assert.equal(sim.state.shieldUp, false);
  assert.equal(sim.state.invuln, 2, 'a broken shield grants two seconds, not the 2.2 of a respawn');

  assert.ok(slam().some((e) => e.kind === 'lifeLost'));
  assert.equal(sim.state.lives, 2);
  slam();
  assert.equal(sim.state.lives, 1);
  const last = slam();
  assert.equal(sim.state.lives, 0);
  assert.equal(sim.state.mode, 'over');
  assert.ok(last.some((e) => e.kind === 'gameOver'), 'the last life ends the run');
});

test('invulnerability swallows a direct hit and pays no graze bonus', () => {
  const sim = createSim(mulberry32(13));
  sim.step(1 / 60, intent({ start: true }));
  sim.drain();
  sim.state.invuln = 2;
  sim.state.score = 0;
  sim.state.rocks = [{ x: 0, y: 0, z: Z_NEAR, vx: 0, vy: 0, vz: -1, ax: 0, ay: 0, sx: 0, sy: 0, size: 0 }];
  sim.step(1 / 60, IDLE);
  assert.equal(sim.state.lives, 3, 'no life lost while invulnerable');
  assert.equal(sim.state.score, 0, 'and a dead-center pass is not a graze');
  assert.deepEqual(sim.drain(), []);
});

test('graze: a near miss pays five points and reports itself', () => {
  const sim = createSim(mulberry32(17));
  sim.step(1 / 60, intent({ start: true }));
  sim.drain();
  sim.state.invuln = 0;
  sim.state.score = 0;
  const nearMiss = shipHitR(0) + 10;
  sim.state.rocks = [{ x: nearMiss, y: 0, z: Z_NEAR, vx: 0, vy: 0, vz: -1, ax: 0, ay: 0, sx: 0, sy: 0, size: 0 }];
  sim.step(1 / 60, IDLE);
  assert.equal(sim.state.score, 5);
  assert.equal(sim.state.lives, 3);
  assert.ok(sim.drain().some((e) => e.kind === 'grazed'));
});

test('a killed rock scores its class, splits, and reports the points awarded', () => {
  const sim = createSim(mulberry32(19));
  sim.step(1 / 60, intent({ start: true }));
  sim.drain();
  sim.state.score = 0;
  sim.state.chain = 0;
  sim.state.rocks = [{ x: 0, y: 0, z: 600, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, sx: 0, sy: 0, size: 0 }];
  sim.state.bullets = [{ x: 0, y: 0, z: 600, vx: 0, vy: 0, vz: 0 }];
  sim.step(1 / 60, IDLE);
  const killed = sim.drain().find((e) => e.kind === 'rockKilled');
  assert.ok(killed, 'the kill is reported');
  assert.equal(killed.points, SCORES[0], 'first kill of a chain is x1');
  assert.equal(sim.state.score, SCORES[0]);
  assert.equal(sim.state.rocks.length, 2, 'a big rock splits in two');
  assert.equal(sim.state.rocks[0].size, 1);
});

/* The point of the seeded rng: identical inputs give an identical run, which
   is what lets a renderer or audio change be proved not to have touched the
   rules. */
test('replay: the same seed and the same inputs give the same run', () => {
  const script = (i: number): Intent => intent({
    fire: true,
    left: i % 120 < 40,
    right: i % 120 >= 80,
    up: i % 90 < 30,
  });
  const run = (seed: number) => {
    const sim = createSim(mulberry32(seed));
    sim.step(1 / 60, intent({ start: true }));
    const events: string[] = [];
    for (let i = 0; i < 1800; i++) {          // 30 seconds
      sim.step(1 / 60, script(i));
      for (const e of sim.drain()) events.push(e.kind);
    }
    return { state: sim.state, events };
  };

  const a = run(42);
  const b = run(42);
  assert.deepEqual(a.state, b.state, 'same seed, same final state');
  assert.deepEqual(a.events, b.events, 'same seed, same event stream');

  const c = run(43);
  assert.notDeepEqual(a.state, c.state, 'a different seed gives a different run');
});

test('pickups: each kind pays 25 and applies its own effect for its own duration', () => {
  const take = (kind: number) => {
    const sim = createSim(mulberry32(31));
    sim.step(1 / 60, intent({ start: true }));
    sim.drain();
    sim.state.score = 0;
    sim.state.pickups = [{ x: 0, y: 0, z: Z_NEAR + 20, vz: 0, ax: 0, ay: 0, sx: 0, sy: 0, kind: kind }];
    sim.step(1 / 60, IDLE);
    return sim;
  };

  const shield = take(0);
  assert.equal(shield.state.shieldUp, true);
  assert.equal(shield.state.score, 25);
  assert.ok(shield.drain().some((e) => e.kind === 'pickupTaken' && e.which === 0));

  const rapid = take(1);
  assert.equal(rapid.state.rapidT, 9, 'rapid fire lasts nine seconds');
  assert.equal(rapid.state.shieldUp, false, 'and does not also raise the shield');

  const triple = take(2);
  assert.equal(triple.state.tripleT, 9, 'triple shot lasts nine seconds');
  assert.equal(triple.state.rapidT, 0, 'and is not rapid fire');
});

/* Timing constants the replay cannot see. A thirty-second run never happens to
   straddle these thresholds, so moving the chain window by 0.5% or the respawn
   invulnerability by 0.01s changed nothing it records. Pinning the constant
   where it is set is both cheaper and exact. */
test('chain: a kill opens a two-second multiplier window', () => {
  const sim = createSim(mulberry32(23));
  sim.step(1 / 60, intent({ start: true }));
  sim.drain();
  sim.state.rocks = [{ x: 0, y: 0, z: 600, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, sx: 0, sy: 0, size: 0 }];
  sim.state.bullets = [{ x: 0, y: 0, z: 600, vx: 0, vy: 0, vz: 0 }];
  sim.step(1 / 60, IDLE);
  assert.equal(sim.state.chain, 1, 'the kill opened a chain');
  assert.equal(sim.state.chainT, 2, 'the window is two seconds, not 2.01');
});

test('respawn: losing a life grants 2.2 seconds of invulnerability', () => {
  const sim = createSim(mulberry32(29));
  sim.step(1 / 60, intent({ start: true }));
  sim.drain();
  sim.state.invuln = 0;
  sim.state.rocks = [{ x: 0, y: 0, z: Z_NEAR, vx: 0, vy: 0, vz: -1, ax: 0, ay: 0, sx: 0, sy: 0, size: 0 }];
  sim.step(1 / 60, IDLE);
  assert.equal(sim.state.lives, 2, 'a life went');
  assert.equal(sim.state.invuln, 2.2, 'and the respawn window is 2.2 seconds');
});

/* The determinism test above compares a seed against itself, so it survives any
   change applied to both runs: it caught nothing when bullet speed moved from
   950 to 951. This is the part that notices.

   The autopilot matters as much as the recorded numbers. A scripted sweep flew
   around killing one rock in thirty seconds, which exercised almost nothing;
   flying at the nearest rock kills about a hundred and runs the splits, the
   pickups, the shield and the death path. A probe that does not touch the code
   cannot regress on it.

   These numbers are a tripwire, not a specification. A deliberate rules change
   will move them, and re-recording them belongs in the same commit. */
test('replay: seed 42 under the autopilot still produces the recorded run', () => {
  const sim = createSim(mulberry32(42));
  sim.step(1 / 60, intent({ start: true }));
  const tally: Record<string, number> = {};
  for (let i = 0; i < 1800; i++) {
    // Four seconds of autopilot, then one of arrow keys. Pointer drag and
    // keyboard are separate branches in step(), and a pure-drag script leaves
    // cam.vx at zero forever, so the steering damping is never run at all.
    const target = sim.state.rocks.slice().sort((a, b) => a.z - b.z)[0];
    const onSticks = i % 300 < 240;
    sim.step(1 / 60, intent({
      fire: true,
      drag: onSticks && target ? { x: target.x, y: target.y } : null,
      left: !onSticks && i % 60 < 30,
      right: !onSticks && i % 60 >= 30,
      up: !onSticks && i % 40 < 20,
    }));
    for (const e of sim.drain()) tally[e.kind] = (tally[e.kind] || 0) + 1;
  }
  const s = sim.state;
  // Counts and totals alone missed a 0.1% change to bullet speed: it altered no
  // collision outcome, only where everything ended up. The checksum is the
  // sensitive half, and folds in every surviving entity's position.
  const coords: number[] = [s.cam.x, s.cam.y, s.cam.vx, s.cam.vy];
  for (const r of s.rocks) coords.push(r.x, r.y, r.z, r.ax, r.ay);
  for (const b of s.bullets) coords.push(b.x, b.y, b.z);
  for (const h of s.hunters) coords.push(h.x, h.y, h.z);
  for (const p of s.pickups) coords.push(p.x, p.y, p.z);
  const checksum = coords.reduce((h, n) => (h * 31 + Math.round(n * 1000)) % 2147483647, 7);

  assert.deepEqual(
    {
      score: s.score, lives: s.lives, level: s.level, mode: s.mode,
      rocks: s.rocks.length, hunters: s.hunters.length,
      checksum,
      tally,
    },
    {
      score: 16245, lives: 0, level: 3, mode: 'over',
      rocks: 0, hunters: 1,
      checksum: -1684310805,
      tally: {
        waveStart: 3, fired: 95, rockKilled: 62, hunterKilled: 1,
        pickupTaken: 1, shieldLost: 1, lifeLost: 3, gameOver: 1,
      },
    },
  );
});

test('replay: a thirty-second run stays inside its own invariants', () => {
  const sim = createSim(mulberry32(42));
  sim.step(1 / 60, intent({ start: true }));
  for (let i = 0; i < 1800; i++) {
    sim.step(1 / 60, intent({ fire: true, left: i % 120 < 40, right: i % 120 >= 80 }));
    sim.drain();
    const s = sim.state;
    assert.ok(s.score >= 0, 'score never goes negative');
    assert.ok(s.lives >= 0 && s.lives <= 3, 'lives stay in range, got ' + s.lives);
    assert.ok(Math.abs(s.cam.x) <= X_BOUND && Math.abs(s.cam.y) <= Y_BOUND, 'camera stays in the field');
    assert.ok(s.bullets.length <= 7, 'bullet cap holds even with rapid fire');
    for (const r of s.rocks) assert.ok(r.size >= 0 && r.size <= 2, 'rock size class is valid');
    if (s.mode === 'over') break;
  }
});
