// The game rules, with no DOM, no renderer and no audio. step() takes a time
// slice and an Intent and returns nothing; what happened comes back through
// drain(). The old version called sfx.boom() and pushed debris from inside the
// collision loop, which is why none of this could be tested.
//
// The split between here and render.ts is by authority, not by subject: state
// that changes what the game does lives here (invulnerability, cooldowns, the
// combo chain), and state that only changes what it looks like lives in the
// renderer (screen shake, debris, muzzle flash, the wave banner). A renderer
// bug can therefore never cost you a life.

import type { Rock, Bullet, Pickup, Hunter, Cam, Mode, Intent, SimEvent } from './types.ts';
import type { Rng } from './rng.ts';

export const SIZES = [70, 42, 24];        // world-unit radius per rock class
export const SCORES = [20, 50, 100];
export const Z_FAR = 1500, Z_NEAR = 60, FOCAL = 420;
export const X_BOUND = 460, Y_BOUND = 300;
export const HUNTER_R = 34, HUNTER_SPEED = 260, HUNTER_ACCEL = 480;
export const PICKUP_R = 95;

const TAU = Math.PI * 2;
const SPREAD1 = [0];
const SPREAD3 = [-170, 0, 170];

/* ================= spawning and motion ================= */

export function spawnRock(level: number, size: number, rng: Rng): Rock {
  const speed = 130 + level * 25 + rng() * 60;
  return {
    x: (rng() * 2 - 1) * X_BOUND, y: (rng() * 2 - 1) * Y_BOUND,
    z: Z_FAR - rng() * 350,
    vx: (rng() * 2 - 1) * 24, vy: (rng() * 2 - 1) * 24,
    vz: -speed * (1 + (2 - size) * 0.1),
    ax: rng() * TAU, ay: rng() * TAU,
    sx: (rng() * 2 - 1) * 1.4, sy: (rng() * 2 - 1) * 1.4,
    size: size,
  };
}

// a wave arrives as a stream, not a wall: each rock starts deeper than the
// last, and the count is capped so late waves press by speed, not by crowd
export function spawnWave(level: number, rng: Rng): Rock[] {
  const out: Rock[] = [];
  const n = 3 + Math.min(level, 7);
  for (let i = 0; i < n; i++) {
    const rk = spawnRock(level, 0, rng);
    rk.z += i * 140;
    out.push(rk);
  }
  return out;
}

export function splitRock(rock: Rock, rng: Rng): Rock[] {
  if (rock.size >= 2) return [];
  const kids: Rock[] = [];
  for (let i = 0; i < 2; i++) {
    const k = spawnRock(1, rock.size + 1, rng);
    k.x = rock.x + (rng() * 2 - 1) * 30;
    k.y = rock.y + (rng() * 2 - 1) * 30;
    k.z = rock.z + (rng() * 2 - 1) * 40;
    k.vz = rock.vz * (1.15 + rng() * 0.3);
    kids.push(k);
  }
  return kids;
}

export function advanceRock(r: Rock, dt: number): void {
  r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
  r.ax += r.sx * dt; r.ay += r.sy * dt;
}

export function spawnPickup(x: number, y: number, z: number, kind: number, rng: Rng): Pickup {
  return {
    x: x, y: y, z: z, vz: -(120 + rng() * 40),
    ax: rng() * TAU, ay: rng() * TAU, sx: 1.6, sy: 2.3,
    kind: kind,
  };
}

export function collectPickup(p: Pick<Pickup, 'x' | 'y'>, camX: number, camY: number): boolean {
  const dx = p.x - camX, dy = p.y - camY;
  return dx * dx + dy * dy < PICKUP_R * PICKUP_R;
}

// hunters enter deep and off-axis, closing slowly: threat by pursuit, not speed
export function spawnHunter(level: number, rng: Rng): Hunter {
  return {
    x: (rng() < 0.5 ? -1 : 1) * X_BOUND * (0.5 + rng() * 0.4),
    y: (rng() * 2 - 1) * Y_BOUND * 0.6,
    z: Z_FAR,
    vx: 0, vy: 0,
    vz: -(70 + Math.min(level, 10) * 8 + rng() * 30),
    ax: rng() * TAU, ay: rng() * TAU,
  };
}

export function steerHunter(h: Hunter, camX: number, camY: number, dt: number): void {
  const dx = camX - h.x, dy = camY - h.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  h.vx += dx / d * HUNTER_ACCEL * dt;
  h.vy += dy / d * HUNTER_ACCEL * dt;
  const sp = Math.sqrt(h.vx * h.vx + h.vy * h.vy);
  if (sp > HUNTER_SPEED) { h.vx *= HUNTER_SPEED / sp; h.vy *= HUNTER_SPEED / sp; }
  h.x += h.vx * dt; h.y += h.vy * dt; h.z += h.vz * dt;
  h.ax += 2.6 * dt; h.ay += 1.9 * dt;
}

// hunters join from wave 2, one more every third wave, never more than 3
export function huntersForWave(level: number): number {
  return level >= 2 ? Math.min(1 + Math.floor((level - 2) / 3), 3) : 0;
}

/* ================= collision and scoring ================= */

// these read only a few fields, so they accept the minimal shape (the game
// passes full objects; tests pass bare literals)
export function hitBullet(rock: Pick<Rock, 'x' | 'y' | 'z' | 'size'>, bullet: Pick<Bullet, 'x' | 'y' | 'z'>): boolean {
  const S = SIZES[rock.size];
  if (Math.abs(bullet.z - rock.z) > S * 0.9) return false;
  const dx = bullet.x - rock.x, dy = bullet.y - rock.y;
  return dx * dx + dy * dy < S * S * 0.81;
}

export function hitHunter(h: Pick<Hunter, 'x' | 'y' | 'z'>, bullet: Pick<Bullet, 'x' | 'y' | 'z'>): boolean {
  if (Math.abs(bullet.z - h.z) > HUNTER_R * 1.6) return false;
  const dx = bullet.x - h.x, dy = bullet.y - h.y;
  return dx * dx + dy * dy < HUNTER_R * HUNTER_R;
}

// the ship's collision radius against a rock of this size class; hitShip tests
// it directly and grazed widens the same radius by 1.8x
export function shipHitR(size: number): number {
  return SIZES[size] * 0.8 + 26;
}

export function hitShip(rock: Pick<Rock, 'x' | 'y' | 'size'>, camX: number, camY: number): boolean {
  const r = shipHitR(rock.size);
  const dx = rock.x - camX, dy = rock.y - camY;
  return dx * dx + dy * dy < r * r;
}

// a rock that passes the camera close but clean is a graze (caller checks
// hitShip first; this only widens the same radius)
export function grazed(rock: Pick<Rock, 'x' | 'y' | 'size'>, camX: number, camY: number): boolean {
  const r = shipHitR(rock.size) * 1.8;
  const dx = rock.x - camX, dy = rock.y - camY;
  return dx * dx + dy * dy < r * r;
}

// kill chains step the multiplier every 4 kills, capped at x5
export function comboMult(chain: number): number {
  return Math.min(5, 1 + Math.floor(chain / 4));
}

/* ================= the state machine ================= */

export interface SimState {
  mode: Mode;
  score: number; lives: number; level: number;
  cam: Cam;
  rocks: Rock[]; bullets: Bullet[]; hunters: Hunter[]; pickups: Pickup[];
  invuln: number; fireCool: number;
  chain: number; chainT: number;
  shieldUp: boolean; rapidT: number; tripleT: number;
  interT: number;
  best: number;
}

export interface Sim {
  state: SimState;
  step: (dt: number, intent: Intent) => void;
  drain: () => SimEvent[];
}

// survives esc and re-entry within the page session, which is why it is here
// and not in state: a new Sim starts a new run, not a new session
let sessionBest = 0;

export function createSim(rng: Rng): Sim {
  const state: SimState = {
    mode: 'attract',
    score: 0, lives: 0, level: 0,
    cam: { x: 0, y: 0, vx: 0, vy: 0 },
    rocks: [], bullets: [], hunters: [], pickups: [],
    invuln: 0, fireCool: 0,
    chain: 0, chainT: 0,
    shieldUp: false, rapidT: 0, tripleT: 0,
    interT: 0,
    best: sessionBest,
  };

  let events: SimEvent[] = [];
  const spawned: Rock[] = [];       // split children, merged after the rock pass
  const emit = (e: SimEvent) => { events.push(e); };

  function resetCam() {
    state.cam = { x: 0, y: 0, vx: 0, vy: 0 };
    state.invuln = 2.2;
  }

  function startRun() {
    state.mode = 'playing';
    state.score = 0; state.lives = 3; state.level = 1;
    state.rocks = spawnWave(1, rng);
    state.bullets = []; state.hunters = []; state.pickups = [];
    spawned.length = 0;
    state.chain = 0; state.chainT = 0;
    state.shieldUp = false; state.rapidT = 0; state.tripleT = 0;
    state.interT = 0; state.fireCool = 0;
    emit({ kind: 'waveStart', level: 1 });
    resetCam();
  }

  function fire() {
    if (state.mode !== 'playing' || state.fireCool > 0) return;
    if (state.bullets.length >= (state.rapidT > 0 ? 7 : 4)) return;
    state.fireCool = state.rapidT > 0 ? 0.11 : 0.2;
    const spread = state.tripleT > 0 ? SPREAD3 : SPREAD1;
    for (let i = 0; i < spread.length; i++) {
      state.bullets.push({ x: state.cam.x, y: state.cam.y, z: Z_NEAR + 10, vx: spread[i], vy: 0, vz: 950 });
    }
    emit({ kind: 'fired' });
  }

  // shared kill bookkeeping (the chain window, the multiplied score, the
  // pickup roll) so rock and hunter kills cannot drift apart
  function awardKill(basePts: number, dropP: number, x: number, y: number, z: number): number {
    state.chain++; state.chainT = 2;
    const pts = basePts * comboMult(state.chain);
    state.score += pts;
    if (rng() < dropP) state.pickups.push(spawnPickup(x, y, z, Math.floor(rng() * 3), rng));
    return pts;
  }

  function applyPickup(kind: number) {
    state.score += 25;
    if (kind === 0) state.shieldUp = true;
    else if (kind === 1) state.rapidT = 9;
    else state.tripleT = 9;
  }

  function damage() {
    if (state.shieldUp) {
      state.shieldUp = false;
      state.invuln = 2;
      emit({ kind: 'shieldLost' });
      return;
    }
    state.lives--;
    emit({ kind: 'lifeLost' });
    if (state.lives <= 0) {
      state.mode = 'over';
      sessionBest = Math.max(sessionBest, state.score);
      state.best = sessionBest;
      emit({ kind: 'gameOver', score: state.score });
    } else {
      resetCam();
    }
  }

  function step(dt: number, intent: Intent) {
    if (state.mode !== 'playing') {
      if (intent.start) startRun();
      return;
    }

    // steering: high acceleration with strong damping reaches ~750 world
    // units/s in about 0.2s — the keyboard has to feel as direct as a drag
    const cam = state.cam;
    if (intent.left) cam.vx -= 3600 * dt;
    if (intent.right) cam.vx += 3600 * dt;
    if (intent.up) cam.vy -= 3600 * dt;
    if (intent.down) cam.vy += 3600 * dt;
    const damp = Math.exp(-4.8 * dt);
    cam.vx *= damp; cam.vy *= damp;
    if (intent.drag) {
      cam.x = Math.max(-X_BOUND, Math.min(X_BOUND, intent.drag.x));
      cam.y = Math.max(-Y_BOUND, Math.min(Y_BOUND, intent.drag.y));
    } else {
      cam.x = Math.max(-X_BOUND, Math.min(X_BOUND, cam.x + cam.vx * dt));
      cam.y = Math.max(-Y_BOUND, Math.min(Y_BOUND, cam.y + cam.vy * dt));
    }

    state.fireCool -= dt;
    state.invuln -= dt;
    state.rapidT = Math.max(0, state.rapidT - dt);
    state.tripleT = Math.max(0, state.tripleT - dt);
    state.chainT -= dt;
    if (state.chainT <= 0) state.chain = 0;

    // held fire streams, rate-limited by fireCool; a held drag fires too
    if (intent.fire || intent.drag) fire();

    let w = 0;
    for (let i = 0; i < state.bullets.length; i++) {
      const bl = state.bullets[i];
      bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.z += bl.vz * dt;
      if (bl.z < Z_FAR) state.bullets[w++] = bl;
    }
    state.bullets.length = w;

    w = 0;
    for (let i = 0; i < state.rocks.length; i++) {
      const rk = state.rocks[i];
      advanceRock(rk, dt);
      let gone = false;
      for (let j = 0; j < state.bullets.length; j++) {
        if (hitBullet(rk, state.bullets[j])) {
          state.bullets.splice(j, 1);
          const pts = awardKill(SCORES[rk.size], 0.08, rk.x, rk.y, rk.z);
          emit({ kind: 'rockKilled', x: rk.x, y: rk.y, z: rk.z, size: rk.size, points: pts });
          for (const kid of splitRock(rk, rng)) spawned.push(kid);
          gone = true;
          break;
        }
      }
      if (!gone && rk.z <= Z_NEAR) {
        // a direct hit never pays the graze bonus: during invulnerability a
        // dead-center pass is a swallowed collision, not a near miss
        const direct = hitShip(rk, cam.x, cam.y);
        if (state.invuln <= 0 && direct) damage();
        else if (!direct && grazed(rk, cam.x, cam.y)) {
          state.score += 5;
          emit({ kind: 'grazed', x: rk.x, y: rk.y, z: Z_NEAR + 60 });
        }
        gone = true;   // passed the camera either way
      }
      if (!gone) state.rocks[w++] = rk;
    }
    state.rocks.length = w;
    if (spawned.length) {
      for (const kid of spawned) state.rocks.push(kid);
      spawned.length = 0;
    }

    w = 0;
    for (let i = 0; i < state.hunters.length; i++) {
      const h = state.hunters[i];
      steerHunter(h, cam.x, cam.y, dt);
      let down = false;
      for (let j = 0; j < state.bullets.length; j++) {
        if (hitHunter(h, state.bullets[j])) {
          state.bullets.splice(j, 1);
          const pts = awardKill(150, 0.3, h.x, h.y, h.z);
          emit({ kind: 'hunterKilled', x: h.x, y: h.y, z: h.z, points: pts });
          down = true;
          break;
        }
      }
      if (!down && h.z <= Z_NEAR) {
        const hdx = h.x - cam.x, hdy = h.y - cam.y;
        if (state.invuln <= 0 && hdx * hdx + hdy * hdy < 55 * 55) damage();
        down = true;
      }
      if (!down) state.hunters[w++] = h;
    }
    state.hunters.length = w;

    w = 0;
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i];
      pk.z += pk.vz * dt; pk.ax += pk.sx * dt; pk.ay += pk.sy * dt;
      // the collection window spans the last stretch before the camera, so a
      // late steer still catches the crate; uncollected ones fly past like
      // rocks do instead of vanishing mid-air
      if (pk.z <= Z_NEAR + 40 && collectPickup(pk, cam.x, cam.y)) {
        applyPickup(pk.kind);
        emit({ kind: 'pickupTaken', x: pk.x, y: pk.y, z: pk.z, which: pk.kind });
      } else if (pk.z > Z_NEAR) {
        state.pickups[w++] = pk;
      }
    }
    state.pickups.length = w;

    // wave flow: clear -> star-jump pause -> the next wave arrives announced
    if (state.interT > 0) {
      state.interT -= dt;
      if (state.interT <= 0) {
        state.level++;
        state.rocks = spawnWave(state.level, rng);
        const nh = huntersForWave(state.level);
        for (let i = 0; i < nh; i++) state.hunters.push(spawnHunter(state.level, rng));
        emit({ kind: 'waveStart', level: state.level });
      }
    } else if (state.rocks.length === 0 && state.hunters.length === 0) {
      state.interT = 1.3;
    }
  }

  function drain(): SimEvent[] {
    const out = events;
    events = [];
    return out;
  }

  return { state, step, drain };
}
