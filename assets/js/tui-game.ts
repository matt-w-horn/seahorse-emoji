// 3D asteroids for the terminal home (issue #5, third cut: the phosphor
// pipeline). A perspective tunnel: crystalline polyhedra tumble toward the
// camera, arrows steer, space fires down +z, collisions are depth-gated.
//
// The look is a holographic tactical display on a vector monitor. The world
// draws crisp at native resolution straight onto the visible canvas; each
// frame is then downsampled into a quarter-res persistence buffer that fades
// by half per frame and composites back additively, so bloom and motion
// trails are soft and dim while the beam itself never ghosts. A baked
// vignette/scanline overlay sits on top. Solids are back-face-culled
// camera-lit glass; vertices get bright "beam dwell" points; hunters take
// the palette's one hue-rotated hostile color. Every color derives from the
// live theme variables, light themes composite non-additively, and nothing
// is fetched (the strict CSP never sees a request). Sound is a small
// synthesized set on a lazy AudioContext.
//
// The pure math core (no DOM) is exported as `core` for node tests; `start`
// wires it to a canvas and returns a stop() for event-driven teardown. Loaded
// in the browser via dynamic import() from tui.ts (lazy).

'use strict';

type Vec3 = [number, number, number];
type Edge = [number, number];
type Face = [number, number, number];
type RGB = [number, number, number];
interface Projected { x: number; y: number; s: number; }
interface Rock {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ax: number; ay: number; sx: number; sy: number;
  size: number;
}
interface Bullet { x: number; y: number; z: number; vx: number; vy: number; vz: number; }
interface Pickup {
  x: number; y: number; z: number; vz: number;
  ax: number; ay: number; sx: number; sy: number;
  kind: number;                    // 0 shield, 1 rapid, 2 triple
}
interface Hunter {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ax: number; ay: number;
}
interface Star { x: number; y: number; z: number; m: number; }
interface Deb {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  t: number; life: number; col: string;
}
interface Ring { x: number; y: number; z: number; r: number; vr: number; t: number; life: number; col: string; }
interface Pop { x: number; y: number; z: number; t: number; life: number; txt: string; col: string; }
interface Cam { x: number; y: number; vx: number; vy: number; }
interface Palette {
  bg: string; fg: string; accent: string; dim: string; font: string;
  light: boolean; acBright: string; hostile: string; hostileHot: string;
  sizeCols: string[];    // rock hue per size class (color says score)
  sizeBright: string[];  // the same hues overdriven, for debris/pops/rings
  ramps: string[][];     // per-size depth ramp, dim -> that size's hue
  kindCols: string[];    // pickup hue per kind (shield/rapid/triple)
  tierCols: string[];    // combo tiers: bullets and reticle heat up
  waveCols: string[];    // the wave banner cycles hue
}

export interface GameOpts { reduced?: boolean; isActive?: () => boolean; }
export interface GameHandle { stop: () => void; }

const TAU = Math.PI * 2;

/* ================= pure core (node-testable) ================= */

// icosahedron: 12 vertices from the golden ratio, 30 edges (the rocks)
const PHI = (1 + Math.sqrt(5)) / 2;
const IVERTS: Vec3[] = [];
([[0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
  [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]] as Vec3[]).forEach(function (v) {
  const n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  IVERTS.push([v[0] / n, v[1] / n, v[2] / n]);
});

// octahedron: 6 vertices (hunters and pickups — visibly not a rock)
const OVERTS: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// edges join vertices closer than a cutoff; faces are mutually-adjacent
// triples, which for these two solids is exactly the face set (20 and 8)
function vdist(verts: Vec3[], p: number, q: number): number {
  var dx = verts[p][0] - verts[q][0], dy = verts[p][1] - verts[q][1], dz = verts[p][2] - verts[q][2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function deriveEdges(verts: Vec3[], cutoff: number): Edge[] {
  var out: Edge[] = [];
  for (var i = 0; i < verts.length; i++) {
    for (var j = i + 1; j < verts.length; j++) {
      if (vdist(verts, i, j) < cutoff) out.push([i, j]);
    }
  }
  return out;
}
function deriveFaces(verts: Vec3[], cutoff: number): Face[] {
  var out: Face[] = [];
  for (var i = 0; i < verts.length; i++) {
    for (var j = i + 1; j < verts.length; j++) {
      for (var k = j + 1; k < verts.length; k++) {
        if (vdist(verts, i, j) < cutoff && vdist(verts, j, k) < cutoff && vdist(verts, i, k) < cutoff) {
          out.push([i, j, k]);
        }
      }
    }
  }
  return out;
}
const IEDGES = deriveEdges(IVERTS, 1.1);
const IFACES = deriveFaces(IVERTS, 1.1);
const OEDGES = deriveEdges(OVERTS, 1.5);
const OFACES = deriveFaces(OVERTS, 1.5);

const SIZES = [70, 42, 24];        // world-unit radius per rock class
const SCORES = [20, 50, 100];
const Z_FAR = 1500, Z_NEAR = 60, FOCAL = 420;
const X_BOUND = 460, Y_BOUND = 300;
const HUNTER_R = 34, HUNTER_SPEED = 260, HUNTER_ACCEL = 480;
const PICKUP_R = 95;

function rotate(v: Vec3, ax: number, ay: number): Vec3 {
  var ca = Math.cos(ax), sa = Math.sin(ax);
  var cb = Math.cos(ay), sb = Math.sin(ay);
  var y = v[1] * ca - v[2] * sa, z = v[1] * sa + v[2] * ca;   // rotate X
  var x = v[0] * cb + z * sb; z = -v[0] * sb + z * cb;        // rotate Y
  return [x, y, z];
}

// perspective; returns null when at/behind the eye
function project(x: number, y: number, z: number, f: number): Projected | null {
  if (z <= 1) return null;
  var s = f / z;
  return { x: x * s, y: y * s, s: s };
}

function spawnRock(level: number, size: number, rng: () => number): Rock {
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

// a wave arrives as a stream, not a wall: each rock starts deeper than the
// last, and the count is capped so late waves press by speed, not by crowd
function spawnWave(level: number, rng: () => number): Rock[] {
  var out: Rock[] = [];
  var n = 3 + Math.min(level, 7);
  for (var i = 0; i < n; i++) {
    var rk = spawnRock(level, 0, rng);
    rk.z += i * 140;
    out.push(rk);
  }
  return out;
}

function splitRock(rock: Rock, rng: () => number): Rock[] {
  if (rock.size >= 2) return [];
  var kids: Rock[] = [];
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

function advanceRock(r: Rock, dt: number): void {
  r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
  r.ax += r.sx * dt; r.ay += r.sy * dt;
}

function spawnPickup(x: number, y: number, z: number, kind: number, rng: () => number): Pickup {
  return {
    x: x, y: y, z: z, vz: -(120 + rng() * 40),
    ax: rng() * TAU, ay: rng() * TAU, sx: 1.6, sy: 2.3,
    kind: kind
  };
}

function collectPickup(p: Pick<Pickup, 'x' | 'y'>, camX: number, camY: number): boolean {
  var dx = p.x - camX, dy = p.y - camY;
  return dx * dx + dy * dy < PICKUP_R * PICKUP_R;
}

// hunters enter deep and off-axis, closing slowly: threat by pursuit, not speed
function spawnHunter(level: number, rng: () => number): Hunter {
  return {
    x: (rng() < 0.5 ? -1 : 1) * X_BOUND * (0.5 + rng() * 0.4),
    y: (rng() * 2 - 1) * Y_BOUND * 0.6,
    z: Z_FAR,
    vx: 0, vy: 0,
    vz: -(70 + Math.min(level, 10) * 8 + rng() * 30),
    ax: rng() * TAU, ay: rng() * TAU
  };
}

function steerHunter(h: Hunter, camX: number, camY: number, dt: number): void {
  var dx = camX - h.x, dy = camY - h.y;
  var d = Math.sqrt(dx * dx + dy * dy) || 1;
  h.vx += dx / d * HUNTER_ACCEL * dt;
  h.vy += dy / d * HUNTER_ACCEL * dt;
  var sp = Math.sqrt(h.vx * h.vx + h.vy * h.vy);
  if (sp > HUNTER_SPEED) { h.vx *= HUNTER_SPEED / sp; h.vy *= HUNTER_SPEED / sp; }
  h.x += h.vx * dt; h.y += h.vy * dt; h.z += h.vz * dt;
  h.ax += 2.6 * dt; h.ay += 1.9 * dt;
}

// hitBullet/hitShip/hitHunter read only a few fields, so they accept the
// minimal shape (the game passes full objects; tests pass bare literals).
function hitBullet(rock: Pick<Rock, 'x' | 'y' | 'z' | 'size'>, bullet: Pick<Bullet, 'x' | 'y' | 'z'>): boolean {
  var S = SIZES[rock.size];
  if (Math.abs(bullet.z - rock.z) > S * 0.9) return false;
  var dx = bullet.x - rock.x, dy = bullet.y - rock.y;
  return dx * dx + dy * dy < S * S * 0.81;
}

function hitHunter(h: Pick<Hunter, 'x' | 'y' | 'z'>, bullet: Pick<Bullet, 'x' | 'y' | 'z'>): boolean {
  if (Math.abs(bullet.z - h.z) > HUNTER_R * 1.6) return false;
  var dx = bullet.x - h.x, dy = bullet.y - h.y;
  return dx * dx + dy * dy < HUNTER_R * HUNTER_R;
}

// the ship's collision radius against a rock of this size class; hitShip
// tests it directly and grazed widens the same radius by 1.8x
function shipHitR(size: number): number {
  return SIZES[size] * 0.8 + 26;
}

function hitShip(rock: Pick<Rock, 'x' | 'y' | 'size'>, camX: number, camY: number): boolean {
  var r = shipHitR(rock.size);
  var dx = rock.x - camX, dy = rock.y - camY;
  return dx * dx + dy * dy < r * r;
}

// a rock that passes the camera close but clean is a graze (caller checks
// hitShip first; this only widens the same radius)
function grazed(rock: Pick<Rock, 'x' | 'y' | 'size'>, camX: number, camY: number): boolean {
  var r = shipHitR(rock.size) * 1.8;
  var dx = rock.x - camX, dy = rock.y - camY;
  return dx * dx + dy * dy < r * r;
}

// hunters join from wave 2, one more every third wave, never more than 3
function huntersForWave(level: number): number {
  return level >= 2 ? Math.min(1 + Math.floor((level - 2) / 3), 3) : 0;
}

// kill chains step the multiplier every 4 kills, capped at x5
function comboMult(chain: number): number {
  return Math.min(5, 1 + Math.floor(chain / 4));
}

/* color helpers: the game derives its whole palette from four theme
   variables, so these run once per theme change, not per frame */

function hexToRgb(hex: string): RGB {
  var h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  if (h.length === 3) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [128, 128, 128];
  var n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(c: RGB): string {
  return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

function luma(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function rotateHue(c: RGB, deg: number): RGB {
  var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  var l = (mx + mn) / 2, d = mx - mn;
  var h = 0, s = 0;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  h = ((h + deg / 360) % 1 + 1) % 1;
  if (s === 0) {
    var gray = Math.round(l * 255);
    return [gray, gray, gray];
  }
  function chan(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  var q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  var p2 = 2 * l - q2;
  return [
    Math.round(chan(p2, q2, h + 1 / 3) * 255),
    Math.round(chan(p2, q2, h) * 255),
    Math.round(chan(p2, q2, h - 1 / 3) * 255)
  ];
}

export const core = {
  ICO: { verts: IVERTS, edges: IEDGES, faces: IFACES },
  OCT: { verts: OVERTS, edges: OEDGES, faces: OFACES },
  SIZES: SIZES, SCORES: SCORES,
  Z_FAR: Z_FAR, Z_NEAR: Z_NEAR, FOCAL: FOCAL,
  X_BOUND: X_BOUND, Y_BOUND: Y_BOUND,
  HUNTER_R: HUNTER_R, HUNTER_SPEED: HUNTER_SPEED, PICKUP_R: PICKUP_R,
  rotate: rotate, project: project,
  spawnRock: spawnRock, spawnWave: spawnWave, splitRock: splitRock, advanceRock: advanceRock,
  spawnPickup: spawnPickup, collectPickup: collectPickup,
  spawnHunter: spawnHunter, steerHunter: steerHunter, huntersForWave: huntersForWave,
  hitBullet: hitBullet, hitHunter: hitHunter, hitShip: hitShip, shipHitR: shipHitR,
  grazed: grazed, comboMult: comboMult,
  hexToRgb: hexToRgb, rgbToHex: rgbToHex, mixRgb: mixRgb,
  rotateHue: rotateHue, luma: luma
};

/* ================= sound: a small synthesized set =================
   Everything is generated on a lazily created AudioContext (first needed
   inside a user gesture, so autoplay policy is satisfied); nothing is
   fetched. One master gain keeps the mix quiet; `soundOn` persists across
   games within the page session and is toggled by the m key or the speaker
   glyph in the canvas corner. */

var soundOn = true;
var ac: AudioContext | null = null;
var acMaster: GainNode | null = null;
var acNoise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (!soundOn) return null;
  try {
    if (!ac) {
      ac = new AudioContext();
      acMaster = ac.createGain();
      acMaster.gain.value = 0.07;
      acMaster.connect(ac.destination);
      acNoise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      var nd = acNoise.getChannelData(0);
      for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume().catch(function () { /* stay silent */ });
    return ac;
  } catch {
    soundOn = false;
    return null;
  }
}

function blip(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, at?: number): void {
  var au = audio();
  if (!au || !acMaster) return;
  var t = au.currentTime + (at || 0);
  var o = au.createOscillator(), g = au.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(acMaster);
  o.onended = function () { o.disconnect(); g.disconnect(); };   // don't let dead nodes pile up in the graph
  o.start(t); o.stop(t + dur);
}

function whump(dur: number, f0: number, vol: number): void {
  var au = audio();
  if (!au || !acMaster || !acNoise) return;
  var t = au.currentTime;
  var s = au.createBufferSource();
  s.buffer = acNoise;
  var f = au.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(60, t + dur);
  var g = au.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(acMaster);
  s.onended = function () { s.disconnect(); f.disconnect(); g.disconnect(); };
  s.start(t); s.stop(t + dur);
}

var sfx = {
  fire: function () { blip(840, 240, 0.07, 'square', 0.35); },
  boom: function (size: number) { whump(0.5 - size * 0.11, 1500 - size * 350, 1.1); },
  hunterDown: function () { whump(0.45, 2200, 1.0); blip(1200, 200, 0.3, 'sawtooth', 0.3); },
  graze: function () { blip(320, 950, 0.09, 'sine', 0.25); },
  pickup: function () { blip(660, 660, 0.06, 'square', 0.35); blip(990, 990, 0.09, 'square', 0.35, 0.07); },
  shieldDown: function () { blip(240, 80, 0.3, 'sawtooth', 0.5); whump(0.25, 700, 0.7); },
  death: function () { whump(0.9, 1000, 1.3); blip(220, 50, 0.7, 'sawtooth', 0.35); },
  wave: function () { blip(440, 440, 0.08, 'square', 0.3); blip(660, 660, 0.12, 'square', 0.3, 0.09); }
};

/* ================= DOM wiring ================= */

var best = 0;   // survives esc/re-enter within the page session

const XDIRS: Edge[] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const PLUSDIRS: Edge[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DASH = [4, 7];
const NODASH: number[] = [];
const SPREAD1 = [0];
const SPREAD3 = [-170, 0, 170];

export function start(canvas: HTMLCanvasElement, opts: GameOpts): GameHandle {
  var out = canvas.getContext('2d')!;
  var ctx = out;                                   // the world draws straight to the visible canvas
  var persistCv = document.createElement('canvas'); // quarter-res accumulated bloom + phosphor trails
  var pctx = persistCv.getContext('2d')!;
  var reduced = !!opts.reduced;
  var isActive = opts.isActive || function () { return true; };
  var touch = 'ontouchstart' in window;
  var rng = Math.random;

  var mode = 'attract';           // attract | playing | over
  var score = 0, lives = 0, level = 0;
  var cam: Cam = { x: 0, y: 0, vx: 0, vy: 0 };
  var rocks: Rock[] = [], bullets: Bullet[] = [], stars: Star[] = [];
  var hunters: Hunter[] = [], pickups: Pickup[] = [];
  var spawned: Rock[] = [];       // split children, merged after the rock pass
  var rings: Ring[] = [];
  var pops: Pop[] = [];
  var keys: { [k: string]: boolean } = {};
  var fireCool = 0, muzzleT = 0, invuln = 0, attractT = 0, runT = 0, flash = 0;
  var chain = 0, chainT = 0;
  var shieldUp = false, rapidT = 0, tripleT = 0;
  var shake = 0, interT = 0, bannerT = 0, bannerTxt = '', gridPhase = 0;
  var ignoreUntil = performance.now() + 250;
  var lastT = performance.now();
  var raf = 0, stopped = false;
  var dragFrom: { px: number; py: number; cx: number; cy: number } | null = null;

  // per-shape render caches; initialized here because fit() below triggers
  // the first render before the rendering section's declarations would run
  var v3cache: Vec3[] = [];
  var vpcache: (Projected | null)[] = [];

  /* debris: a fixed pool compacted by swap-with-last — zero allocation while
     playing, and a hard cap on what a busy frame can be asked to draw */
  var DEB_MAX = 150;
  var debris: Deb[] = [];
  for (var di = 0; di < DEB_MAX; di++) {
    debris.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, col: '' });
  }
  var debN = 0;
  function burst(x: number, y: number, z: number, n: number, speed: number, col: string) {
    if (reduced) n = Math.ceil(n / 2);
    for (var i = 0; i < n && debN < DEB_MAX; i++) {
      var d = debris[debN++];
      var th = rng() * TAU, up = (rng() - 0.5) * 2;
      var pl = Math.sqrt(Math.max(0, 1 - up * up));
      var sp = speed * (0.35 + rng() * 0.85);
      d.x = x; d.y = y; d.z = z;
      d.vx = Math.cos(th) * pl * sp;
      d.vy = Math.sin(th) * pl * sp;
      d.vz = up * sp - 40;
      d.life = d.t = 0.45 + rng() * 0.4;
      d.col = col;
    }
  }

  function ring(x: number, y: number, z: number, r0: number, r1: number, life: number, col: string) {
    if (rings.length >= 8) rings.shift();
    rings.push({ x: x, y: y, z: z, r: r0, vr: (r1 - r0) / life, t: life, life: life, col: col });
  }

  function pop(x: number, y: number, z: number, txt: string, col: string) {
    if (pops.length >= 10) pops.shift();
    pops.push({ x: x, y: y, z: z, t: 0.9, life: 0.9, txt: txt, col: col });
  }
  function popCenter(txt: string, col: string) { pop(cam.x, cam.y - 60, Z_NEAR + 140, txt, col); }

  /* palette: cached and derived, invalidated when the theme class changes.
     acBright is the overdriven beam, hostile the hue-rotated enemy color,
     ramp the dim->accent depth fade for rocks */
  function cssToRgb(c: string): RGB {
    out.fillStyle = '#808080';
    out.fillStyle = c;
    var s = String(out.fillStyle);
    if (s.charAt(0) === '#') return hexToRgb(s);
    var m = /rgba?\(([^)]+)\)/.exec(s);
    if (m) {
      var parts = m[1].split(',');
      return [Math.round(parseFloat(parts[0])), Math.round(parseFloat(parts[1])), Math.round(parseFloat(parts[2]))];
    }
    return [128, 128, 128];
  }
  function readPalette(): Palette {
    var cs = getComputedStyle(document.documentElement);
    var fg = (cs.getPropertyValue('--foreground') || '#ebdbb2').trim();
    var bg = (cs.getPropertyValue('--background') || '#1d2021').trim();
    var accent = (cs.getPropertyValue('--accent') || '#8ec07c').trim();
    var dim = (cs.getPropertyValue('--dim') || fg).trim();
    var bgC = cssToRgb(bg), acC = cssToRgb(accent), dimC = cssToRgb(dim);
    var light = luma(bgC) > 140;
    var toward: RGB = light ? [0, 0, 0] : [255, 255, 255];
    var hostileC = rotateHue(acC, 150);
    // every hue is a rotation of the theme accent, so the whole family
    // restyles together when the theme changes
    var SIZE_HUES = [0, -45, -95];      // big -> small: accent -> hotter
    var KIND_HUES = [90, -60, -120];    // shield / rapid / triple
    var sizeCols: string[] = [], sizeBright: string[] = [], ramps: string[][] = [];
    for (var s = 0; s < 3; s++) {
      var hueC = rotateHue(acC, SIZE_HUES[s]);
      sizeCols.push(rgbToHex(hueC));
      sizeBright.push(rgbToHex(mixRgb(hueC, toward, 0.45)));
      var rr: string[] = [];
      for (var i = 0; i < 8; i++) rr.push(rgbToHex(mixRgb(dimC, hueC, i / 7)));
      ramps.push(rr);
    }
    var kindCols: string[] = [];
    for (s = 0; s < 3; s++) kindCols.push(rgbToHex(mixRgb(rotateHue(acC, KIND_HUES[s]), toward, 0.45)));
    var acB = mixRgb(acC, toward, 0.45);
    var tierCols: string[] = [], waveCols: string[] = [];
    for (s = 0; s < 5; s++) tierCols.push(rgbToHex(rotateHue(acB, -30 * s)));
    for (s = 0; s < 8; s++) waveCols.push(rgbToHex(rotateHue(acB, 45 * s)));
    return {
      bg: bg, fg: fg, accent: accent, dim: dim,
      font: getComputedStyle(document.body).fontFamily,
      light: light,
      acBright: rgbToHex(acB),
      hostile: rgbToHex(hostileC),
      hostileHot: rgbToHex(mixRgb(hostileC, toward, 0.45)),
      sizeCols: sizeCols, sizeBright: sizeBright, ramps: ramps,
      kindCols: kindCols, tierCols: tierCols, waveCols: waveCols
    };
  }
  var pal = readPalette();
  var themeObserver = new MutationObserver(function () {
    pal = readPalette();
    buildOverlay();
    if (!raf) render();          // restyle still frames too
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  /* vignette + scanlines, baked once per resize/theme so the composed frame
     pays one drawImage instead of a gradient fill and a pattern fill */
  var overlayCv = document.createElement('canvas');
  function buildOverlay() {
    overlayCv.width = Math.max(1, canvas.width);
    overlayCv.height = Math.max(1, canvas.height);
    var octx = overlayCv.getContext('2d')!;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = octx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W / 2, H / 2));
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.light ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.24)');
    octx.fillStyle = g;
    octx.fillRect(0, 0, W, H);
    // half-pixel rows at low alpha: enough texture to read as a CRT, not
    // enough to strobe against thin horizontal lines as they move
    octx.fillStyle = pal.light ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)';
    for (var y = 0; y < H; y += 3) octx.fillRect(0, y, W, 0.5);
  }

  /* sizing: resize-driven, not per-frame. The canvas is absolutely
     positioned over the whole screen box (padding included), so it measures
     the parent's client box directly and draws at native pixel ratio */
  var W = 300, H = 200, dpr = window.devicePixelRatio || 1;
  function fit() {
    var parent = canvas.parentNode as HTMLElement | null;
    if (!parent) return;
    dpr = window.devicePixelRatio || 1;
    W = Math.max(60, parent.clientWidth); H = Math.max(60, parent.clientHeight);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    out.setTransform(dpr, 0, 0, dpr, 0, 0);
    persistCv.width = Math.max(1, Math.round(canvas.width / 4));
    persistCv.height = Math.max(1, Math.round(canvas.height / 4));
    buildOverlay();
    if (!raf) render();
  }
  var ro = new ResizeObserver(fit);
  if (canvas.parentNode) ro.observe(canvas.parentNode as Element);
  fit();

  function makeStars() {
    stars = [];
    for (var i = 0; i < 90; i++) {
      stars.push({
        x: (rng() * 2 - 1) * X_BOUND * 1.6, y: (rng() * 2 - 1) * Y_BOUND * 1.6,
        z: rng() * Z_FAR, m: rng() < 0.25 ? 1 : 0
      });
    }
  }
  makeStars();

  // a held drag would snap the camera right back to where it died, so the
  // recenter also ends the drag; touching again re-anchors from center
  function resetCam() { cam = { x: 0, y: 0, vx: 0, vy: 0 }; invuln = 2.2; dragFrom = null; }
  // the banner text is baked here, not per frame in the render loop
  function announceWave() {
    bannerT = 1.2;
    bannerTxt = ('WAVE ' + level).split('').join(' ');
    sfx.wave();
  }
  function startRun() {
    mode = 'playing'; score = 0; lives = 3; level = 1;
    rocks = spawnWave(1, rng); bullets = []; hunters = []; pickups = [];
    keys = {}; spawned.length = 0; rings.length = 0; pops.length = 0; debN = 0;
    chain = 0; chainT = 0; shieldUp = false; rapidT = 0; tripleT = 0;
    shake = 0; interT = 0; runT = 0;
    announceWave();
    resetCam();
    ensureLoop();
  }

  function fire() {
    if (mode !== 'playing' || fireCool > 0) return;
    if (bullets.length >= (rapidT > 0 ? 7 : 4)) return;
    fireCool = rapidT > 0 ? 0.11 : 0.2;
    muzzleT = 0.06;
    var spread = tripleT > 0 ? SPREAD3 : SPREAD1;
    for (var i = 0; i < spread.length; i++) {
      bullets.push({ x: cam.x, y: cam.y, z: Z_NEAR + 10, vx: spread[i], vy: 0, vz: 950 });
    }
    sfx.fire();
  }

  function toggleSound() {
    soundOn = !soundOn;
    if (!soundOn && ac) ac.suspend().catch(function () { /* already gone */ });
    if (soundOn) blip(660, 660, 0.05, 'square', 0.3);
    if (!raf) render();
  }

  /* input */
  // the shell keeps its prompt editable while the game is mounted, so keys
  // typed into an editable element are the prompt's, not the game's ("home"
  // must not mute on the m, fire on a space, or restart on enter)
  function typingTarget(e: KeyboardEvent): boolean {
    var el = e.target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }
  function onKeyDown(e: KeyboardEvent) {
    if (performance.now() < ignoreUntil || typingTarget(e)) return;
    keys[e.key] = true;
    if (e.key === 'Enter' && mode !== 'playing') startRun();
    if (e.key === ' ') fire();
    if (e.key === 'm' || e.key === 'M') toggleSound();
  }
  function onKeyUp(e: KeyboardEvent) { keys[e.key] = false; }
  function onBlurLike() { keys = {}; dragFrom = null; }
  // the speaker glyph's box, in canvas CSS pixels: drawSpeaker renders it,
  // inSpeaker pads it out to a finger-sized corner target, and the lives
  // row anchors beside it; one home for all three
  function speakerBox() { return { x: W - 34, y: 14, w: 20, h: 12 }; }
  function inSpeaker(e: PointerEvent): boolean {
    var b = speakerBox();
    var r = canvas.getBoundingClientRect();
    return e.clientX > r.left + b.x - 16 && e.clientY < r.top + b.y + b.h + 14;
  }
  function onPointerDown(e: PointerEvent) {
    if (performance.now() < ignoreUntil) return;
    if (inSpeaker(e)) { toggleSound(); return; }
    if (mode !== 'playing') { startRun(); return; }
    dragFrom = { px: e.clientX, py: e.clientY, cx: cam.x, cy: cam.y };
    fire();
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragFrom || mode !== 'playing') return;
    cam.x = Math.max(-X_BOUND, Math.min(X_BOUND, dragFrom.cx + (e.clientX - dragFrom.px) * 2.4));
    cam.y = Math.max(-Y_BOUND, Math.min(Y_BOUND, dragFrom.cy + (e.clientY - dragFrom.py) * 2.4));
  }
  function onPointerUp() { dragFrom = null; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlurLike);
  document.addEventListener('visibilitychange', onBlurLike);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  var stop = function () {
    if (stopped) return;
    stopped = true;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlurLike);
    document.removeEventListener('visibilitychange', onBlurLike);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    themeObserver.disconnect();
    ro.disconnect();
    // unconditional: a resume() issued by a last-frame sfx can still be in
    // flight, and suspending an already-suspended context is a no-op
    if (ac) ac.suspend().catch(function () { /* already gone */ });
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  /* simulation */
  // shared kill bookkeeping (the chain window, the multiplied score, the
  // score pop, and the pickup roll) so rock and hunter kills cannot drift
  function awardKill(x: number, y: number, z: number, basePts: number, col: string, dropP: number) {
    chain++; chainT = 2;
    var pts = basePts * comboMult(chain);
    score += pts;
    pop(x, y, z, '+' + pts, col);
    if (rng() < dropP) pickups.push(spawnPickup(x, y, z, Math.floor(rng() * 3), rng));
  }

  function killRock(rk: Rock) {
    var S = SIZES[rk.size];
    var col = pal.sizeBright[rk.size];   // the explosion inherits the victim's hue
    awardKill(rk.x, rk.y, rk.z, SCORES[rk.size], col, 0.08);
    burst(rk.x, rk.y, rk.z, 14 - rk.size * 3, 150 + (2 - rk.size) * 40, col);
    ring(rk.x, rk.y, rk.z, S * 0.35, S * 2.4, 0.35, col);
    shake = Math.min(1, shake + 0.18 + (2 - rk.size) * 0.08);
    sfx.boom(rk.size);
    spawned.push.apply(spawned, splitRock(rk, rng));
  }

  function applyPickup(kind: number) {
    score += 25;
    var col = pal.kindCols[kind];
    if (kind === 0) { shieldUp = true; popCenter('shield up', col); }
    else if (kind === 1) { rapidT = 9; popCenter('rapid fire', col); }
    else { tripleT = 9; popCenter('triple shot', col); }
    sfx.pickup();
  }

  function damage() {
    if (shieldUp) {
      shieldUp = false;
      invuln = 2; flash = 0.3; shake = 1;
      burst(cam.x, cam.y, Z_NEAR + 60, 12, 260, pal.kindCols[0]);
      ring(cam.x, cam.y, Z_NEAR + 70, 30, 260, 0.5, pal.kindCols[0]);
      sfx.shieldDown();
      popCenter('shield down', pal.kindCols[0]);
      return;
    }
    lives--; flash = 0.5; shake = 1;
    burst(cam.x, cam.y, Z_NEAR + 60, 20, 320, pal.fg);
    ring(cam.x, cam.y, Z_NEAR + 70, 30, 300, 0.5, pal.fg);
    sfx.death();
    if (lives <= 0) { mode = 'over'; best = Math.max(best, score); }
    else resetCam();
  }

  // one advance/recycle rule for both modes; recycled stars rescatter so
  // the field's pattern never freezes
  function advanceStars(speed: number, dt: number) {
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      st.z -= speed * dt;
      if (st.z < 8) {
        st.z = Z_FAR;
        st.x = (rng() * 2 - 1) * X_BOUND * 1.6;
        st.y = (rng() * 2 - 1) * Y_BOUND * 1.6;
      }
    }
  }

  function step(dt: number) {
    if (mode !== 'playing') {
      attractT += dt;
      gridPhase -= 30 * dt;
      advanceStars(30, dt);
      return;
    }
    runT += dt;
    // steering: high acceleration with strong damping reaches ~750 world
    // units/s in about 0.2s — the keyboard has to feel as direct as a drag
    if (keys.ArrowLeft) cam.vx -= 3600 * dt;
    if (keys.ArrowRight) cam.vx += 3600 * dt;
    if (keys.ArrowUp) cam.vy -= 3600 * dt;
    if (keys.ArrowDown) cam.vy += 3600 * dt;
    var damp = Math.exp(-4.8 * dt);
    cam.vx *= damp; cam.vy *= damp;
    cam.x = Math.max(-X_BOUND, Math.min(X_BOUND, cam.x + cam.vx * dt));
    cam.y = Math.max(-Y_BOUND, Math.min(Y_BOUND, cam.y + cam.vy * dt));
    fireCool -= dt; invuln -= dt;
    flash = Math.max(0, flash - dt);
    muzzleT = Math.max(0, muzzleT - dt);
    shake = Math.max(0, shake - 2.6 * dt);
    bannerT = Math.max(0, bannerT - dt);
    rapidT = Math.max(0, rapidT - dt);
    tripleT = Math.max(0, tripleT - dt);
    chainT -= dt;
    if (chainT <= 0) chain = 0;
    // held space streams (rate-limited by fireCool); a held touch drag does too
    if (keys[' '] || dragFrom) fire();

    // stars and grid; 6x during the inter-wave jump
    var warp = interT > 0 ? 6 : 1;
    gridPhase -= 220 * warp * dt;
    advanceStars(220 * warp, dt);

    // the per-entity passes below compact in place: no per-frame arrays
    var w = 0;
    for (var i = 0; i < bullets.length; i++) {
      var bl = bullets[i];
      bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.z += bl.vz * dt;
      if (bl.z < Z_FAR) bullets[w++] = bl;
    }
    bullets.length = w;

    w = 0;
    for (i = 0; i < rocks.length; i++) {
      var rk = rocks[i];
      advanceRock(rk, dt);
      var gone = false;
      for (var j = 0; j < bullets.length; j++) {
        if (hitBullet(rk, bullets[j])) {
          bullets.splice(j, 1);
          killRock(rk);
          gone = true;
          break;
        }
      }
      if (!gone && rk.z <= Z_NEAR) {
        // a direct hit never pays the graze bonus: during invulnerability a
        // dead-center pass is a swallowed collision, not a near miss
        var direct = hitShip(rk, cam.x, cam.y);
        if (invuln <= 0 && direct) damage();
        else if (!direct && grazed(rk, cam.x, cam.y)) {
          score += 5;
          pop(rk.x, rk.y, Z_NEAR + 60, '+5', pal.fg);
          sfx.graze();
        }
        gone = true;   // passed the camera either way
      }
      if (!gone) rocks[w++] = rk;
    }
    rocks.length = w;
    if (spawned.length) { rocks.push.apply(rocks, spawned); spawned.length = 0; }

    w = 0;
    for (i = 0; i < hunters.length; i++) {
      var h = hunters[i];
      steerHunter(h, cam.x, cam.y, dt);
      var down = false;
      for (j = 0; j < bullets.length; j++) {
        if (hitHunter(h, bullets[j])) {
          bullets.splice(j, 1);
          awardKill(h.x, h.y, h.z, 150, pal.hostileHot, 0.3);
          burst(h.x, h.y, h.z, 16, 260, pal.hostileHot);
          ring(h.x, h.y, h.z, HUNTER_R * 0.5, HUNTER_R * 4, 0.4, pal.hostileHot);
          shake = Math.min(1, shake + 0.45);
          sfx.hunterDown();
          down = true;
          break;
        }
      }
      if (!down && h.z <= Z_NEAR) {
        var hdx = h.x - cam.x, hdy = h.y - cam.y;
        if (invuln <= 0 && hdx * hdx + hdy * hdy < 55 * 55) damage();
        down = true;
      }
      if (!down) hunters[w++] = h;
    }
    hunters.length = w;

    w = 0;
    for (i = 0; i < pickups.length; i++) {
      var pk = pickups[i];
      pk.z += pk.vz * dt; pk.ax += pk.sx * dt; pk.ay += pk.sy * dt;
      // the collection window spans the last stretch before the camera, so a
      // late steer still catches the crate; uncollected ones fly past like
      // rocks do instead of vanishing mid-air
      if (pk.z <= Z_NEAR + 40 && collectPickup(pk, cam.x, cam.y)) {
        applyPickup(pk.kind);
      } else if (pk.z > Z_NEAR) {
        pickups[w++] = pk;
      }
    }
    pickups.length = w;

    for (i = 0; i < debN;) {
      var d = debris[i];
      d.t -= dt;
      if (d.t <= 0) { debN--; debris[i] = debris[debN]; debris[debN] = d; continue; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      i++;
    }

    w = 0;
    for (i = 0; i < rings.length; i++) {
      var rg = rings[i];
      rg.t -= dt; rg.r += rg.vr * dt;
      if (rg.t > 0) rings[w++] = rg;
    }
    rings.length = w;

    w = 0;
    for (i = 0; i < pops.length; i++) {
      var po = pops[i];
      po.t -= dt;
      if (po.t > 0) pops[w++] = po;
    }
    pops.length = w;

    // wave flow: clear -> star-jump pause -> the next wave arrives announced
    if (interT > 0) {
      interT -= dt;
      if (interT <= 0) {
        level++;
        rocks = spawnWave(level, rng);
        var nh = huntersForWave(level);
        for (i = 0; i < nh; i++) hunters.push(spawnHunter(level, rng));
        announceWave();
      }
    } else if (rocks.length === 0 && hunters.length === 0) {
      interT = 1.3;
    }
  }

  /* ================= rendering: the phosphor pipeline =================
     renderScene draws the world crisp onto the visible canvas; glowPersist
     downsamples that frame into the fading persistence buffer and blends it
     back over the crisp lines; render() then lays the vignette overlay and
     the opaque background under everything, and renderHud draws crisp
     chrome on top. */

  // rotate each vertex once, keeping both the rotated local position (for
  // face normals) and its projection (for paths), in the caches declared up
  // top with the rest of the state
  function shapeTransform(x: number, y: number, z: number, ax: number, ay: number, S: number, verts: Vec3[]) {
    for (var i = 0; i < verts.length; i++) {
      var v = rotate(verts[i], ax, ay);
      var lx = v[0] * S, ly = v[1] * S, lz = v[2] * S;
      v3cache[i] = [lx, ly, lz];
      vpcache[i] = project(x - cam.x + lx, y - cam.y + ly, z + lz, FOCAL);
    }
  }

  function shapeEdgesPath(cx: number, cy: number, edges: Edge[]) {
    ctx.beginPath();
    for (var i = 0; i < edges.length; i++) {
      var p1 = vpcache[edges[i][0]], p2 = vpcache[edges[i][1]];
      if (!p1 || !p2) continue;
      ctx.moveTo(cx + p1.x, cy + p1.y);
      ctx.lineTo(cx + p2.x, cy + p2.y);
    }
  }

  // back-face-culled glass: each visible face is lit by how squarely it
  // faces the camera, at an alpha low enough that edges stay the subject
  function shapeFaces(cx: number, cy: number, x: number, y: number, z: number,
    faces: Face[], color: string, baseAlpha: number) {
    ctx.fillStyle = color;
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i];
      var A = v3cache[f[0]], B = v3cache[f[1]], C = v3cache[f[2]];
      var pA = vpcache[f[0]], pB = vpcache[f[1]], pC = vpcache[f[2]];
      if (!pA || !pB || !pC) continue;
      var ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
      var wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      var lcx = (A[0] + B[0] + C[0]) / 3, lcy = (A[1] + B[1] + C[1]) / 3, lcz = (A[2] + B[2] + C[2]) / 3;
      if (nx * lcx + ny * lcy + nz * lcz < 0) { nx = -nx; ny = -ny; nz = -nz; }   // outward
      var vx = x - cam.x + lcx, vy = y - cam.y + lcy, vz = z + lcz;
      var dot = nx * vx + ny * vy + nz * vz;
      if (dot >= 0) continue;                                                    // back face
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      var vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      var facing = -dot / (nl * vl);
      ctx.globalAlpha = baseAlpha * (0.35 + 0.65 * facing);
      ctx.beginPath();
      ctx.moveTo(cx + pA.x, cy + pA.y);
      ctx.lineTo(cx + pB.x, cy + pB.y);
      ctx.lineTo(cx + pC.x, cy + pC.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // beam dwell: a vector monitor overdrives the phosphor where the beam
  // lingers, so vertices get bright points
  function shapeDwell(cx: number, cy: number, count: number, color: string, alpha: number) {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    for (var i = 0; i < count; i++) {
      var p = vpcache[i];
      if (!p) continue;
      var r = Math.min(3, 0.8 + p.s * 0.8);
      ctx.fillRect(cx + p.x - r / 2, cy + p.y - r / 2, r, r);
    }
    ctx.globalAlpha = 1;
  }

  // two strokes over the current path: a wide faint pass under the crisp one
  function glowStroke(color: string, alpha: number) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.22;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* the phosphor layer: downsample the freshly drawn frame, accumulate it
     into the persistence buffer at half strength over a half fade, and blend
     the result back over the crisp lines. Trails and bloom stay soft and
     dim; the current frame's beam never ghosts. */
  function glowPersist() {
    var qw = persistCv.width, qh = persistCv.height;
    if (reduced) {
      // bloom without trails; drawImage downsamples in the one call
      pctx.clearRect(0, 0, qw, qh);
      pctx.drawImage(canvas, 0, 0, qw, qh);
    } else {
      pctx.globalCompositeOperation = 'destination-out';
      pctx.fillStyle = 'rgba(0,0,0,0.5)';
      pctx.fillRect(0, 0, qw, qh);
      pctx.globalCompositeOperation = 'lighter';
      pctx.globalAlpha = 0.5;
      pctx.drawImage(canvas, 0, 0, qw, qh);
      pctx.globalAlpha = 1;
      pctx.globalCompositeOperation = 'source-over';
    }
    if (pal.light) {
      // additive glow washes out on a light background; low-alpha ink bleed
      out.globalAlpha = 0.16;
      out.drawImage(persistCv, 0, 0, W, H);
      out.globalAlpha = 1;
    } else {
      out.globalCompositeOperation = 'lighter';
      out.globalAlpha = 0.7;
      out.drawImage(persistCv, 0, 0, W, H);
      out.globalAlpha = 1;
      out.globalCompositeOperation = 'source-over';
    }
  }

  function drawGrid(cx: number, cy: number) {
    var gy = Y_BOUND + 90;
    var range = Z_FAR - 90;
    ctx.strokeStyle = pal.dim;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    for (var gx = -900; gx <= 900; gx += 180) {
      for (var s = -1; s <= 1; s += 2) {
        var pA = project(gx - cam.x, s * gy - cam.y, 90, FOCAL);
        var pB = project(gx - cam.x, s * gy - cam.y, Z_FAR, FOCAL);
        if (pA && pB) { ctx.moveTo(cx + pA.x, cy + pA.y); ctx.lineTo(cx + pB.x, cy + pB.y); }
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    for (var k = 0; k < 10; k++) {
      var gz = 90 + (((k * 141 + gridPhase) % range) + range) % range;
      for (s = -1; s <= 1; s += 2) {
        var pL = project(-900 - cam.x, s * gy - cam.y, gz, FOCAL);
        var pR = project(900 - cam.x, s * gy - cam.y, gz, FOCAL);
        if (pL && pR) { ctx.moveTo(cx + pL.x, cy + pL.y); ctx.lineTo(cx + pR.x, cy + pR.y); }
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawStars(cx: number, cy: number, streak: boolean) {
    for (var m = 0; m < 2; m++) {
      // the bright quarter of the field carries the accent
      ctx.fillStyle = m === 0 ? pal.dim : pal.accent;
      ctx.globalAlpha = m === 0 ? 0.5 : 0.95;
      if (streak && m === 1) { ctx.strokeStyle = pal.accent; ctx.beginPath(); }
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i];
        if (st.m !== m) continue;
        var p = project(st.x - cam.x, st.y - cam.y, st.z, FOCAL);
        if (!p) continue;
        var px = cx + p.x, py = cy + p.y;
        if (px < 0 || px > W || py < 0 || py > H) continue;
        if (streak) {
          var p2 = project(st.x - cam.x, st.y - cam.y, st.z + 320, FOCAL);
          if (m === 1 && p2) { ctx.moveTo(px, py); ctx.lineTo(cx + p2.x, cy + p2.y); continue; }
          if (p2) { ctx.fillRect(px, py, 1, 1); continue; }
        }
        var r = Math.max(0.5, (m === 0 ? 1.2 : 1.8) * p.s);
        ctx.fillRect(px, py, r, r);
      }
      if (streak && m === 1) ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function byDepth(r1: Rock, r2: Rock) { return r2.z - r1.z; }

  function renderScene() {
    var cx = W / 2, cy = H / 2;
    ctx.lineWidth = 1.4;
    ctx.font = '13px ' + pal.font;

    if (mode !== 'playing') {
      renderMenuScene(cx, cy);
      return;
    }

    ctx.save();
    if (!reduced && shake > 0.02) {
      ctx.translate((rng() * 2 - 1) * shake * 7, (rng() * 2 - 1) * shake * 7);
    }
    drawGrid(cx, cy);
    drawStars(cx, cy, interT > 0 && !reduced);

    // rocks far to near: glass faces, depth-ramped edges, dwell when close
    rocks.sort(byDepth);
    for (var i = 0; i < rocks.length; i++) {
      var rk = rocks[i];
      var fog = (Z_FAR + 120 - rk.z) / 450;
      if (fog <= 0) continue;
      if (fog > 1) fog = 1;
      var S = SIZES[rk.size];
      shapeTransform(rk.x, rk.y, rk.z, rk.ax, rk.ay, S, IVERTS);
      shapeFaces(cx, cy, rk.x, rk.y, rk.z, IFACES, pal.sizeCols[rk.size], 0.11 * fog);
      shapeEdgesPath(cx, cy, IEDGES);
      var col = pal.ramps[rk.size][(fog * 7) | 0];
      if (rk.z < 650) {
        glowStroke(col, fog);
        shapeDwell(cx, cy, 12, pal.sizeBright[rk.size], fog * 0.9);
      } else {
        ctx.strokeStyle = col;
        ctx.globalAlpha = fog;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // hunters: hostile-hued glass with a dashed telegraph toward the reticle
    for (i = 0; i < hunters.length; i++) {
      var h = hunters[i];
      shapeTransform(h.x, h.y, h.z, h.ax, h.ay, HUNTER_R * 1.35, OVERTS);
      shapeFaces(cx, cy, h.x, h.y, h.z, OFACES, pal.hostile, 0.16);
      shapeEdgesPath(cx, cy, OEDGES);
      glowStroke(pal.hostile, 1);
      shapeDwell(cx, cy, 6, pal.hostileHot, 0.9);
      if (h.z < 1000) {
        var hp = project(h.x - cam.x, h.y - cam.y, h.z, FOCAL);
        if (hp) {
          ctx.setLineDash(DASH);
          ctx.strokeStyle = pal.hostile;
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.moveTo(cx + hp.x, cy + hp.y);
          ctx.lineTo(cx + hp.x * 0.65, cy + hp.y * 0.65);
          ctx.stroke();
          ctx.setLineDash(NODASH);
          ctx.globalAlpha = 1;
        }
      }
    }

    // pickups: pulsing glass crates, each kind in its own hue
    var pulse = 0.55 + 0.45 * Math.sin(runT * 7);
    for (i = 0; i < pickups.length; i++) {
      var pk = pickups[i];
      var kcol = pal.kindCols[pk.kind];
      shapeTransform(pk.x, pk.y, pk.z, pk.ax, pk.ay, 26, OVERTS);
      shapeFaces(cx, cy, pk.x, pk.y, pk.z, OFACES, kcol, 0.14 * pulse);
      shapeEdgesPath(cx, cy, OEDGES);
      glowStroke(kcol, pulse);
      var pp = project(pk.x - cam.x, pk.y - cam.y, pk.z, FOCAL);
      if (pp) {
        ctx.fillStyle = kcol;
        ctx.globalAlpha = pulse;
        ctx.textAlign = 'center';
        ctx.fillText('SRT'.charAt(pk.kind), cx + pp.x, cy + pp.y - 34);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }

    // shockwave rings
    for (i = 0; i < rings.length; i++) {
      var rg = rings[i];
      var rp = project(rg.x - cam.x, rg.y - cam.y, rg.z, FOCAL);
      if (!rp) continue;
      ctx.strokeStyle = rg.col;
      ctx.globalAlpha = rg.t / rg.life;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + rp.x, cy + rp.y, Math.max(0.5, rg.r * rp.s), 0, TAU);
      ctx.stroke();
    }
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 1;

    // debris: velocity-aligned shards in the color of whatever died
    var lastCol = '';
    for (i = 0; i < debN; i++) {
      var d = debris[i];
      var d1 = project(d.x - cam.x, d.y - cam.y, d.z, FOCAL);
      var d2 = project(d.x + d.vx * 0.05 - cam.x, d.y + d.vy * 0.05 - cam.y, d.z + d.vz * 0.05, FOCAL);
      if (!d1 || !d2) continue;
      if (d.col !== lastCol) { ctx.strokeStyle = d.col; lastCol = d.col; }
      ctx.globalAlpha = d.t / d.life;
      ctx.beginPath();
      ctx.moveTo(cx + d1.x, cy + d1.y);
      ctx.lineTo(cx + d2.x, cy + d2.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // bullets: converging tracers with a hot head — plasma bolts under
    // bloom, heating up through the tier colors as the kill chain grows
    var mult = comboMult(chain);
    var heat = pal.tierCols[mult - 1];
    ctx.beginPath();
    for (i = 0; i < bullets.length; i++) {
      var bl = bullets[i];
      var bbase = project(bl.x - cam.x, bl.y - cam.y, bl.z, FOCAL);
      var btip = project(bl.x - cam.x, bl.y - cam.y, bl.z + 40, FOCAL);
      if (!bbase || !btip) continue;
      // spread decays with depth and is anchored to the bullet's own
      // projected position, so steering after firing moves the whole
      // tracer instead of stretching it from the reticle
      var prog = Math.min(1, (bl.z - Z_NEAR) / 500);
      var sprd = 26 * (1 - prog), drop = 16 * (1 - prog);
      ctx.moveTo(cx + bbase.x - sprd, cy + bbase.y + drop);
      ctx.lineTo(cx + btip.x, cy + btip.y);
      ctx.moveTo(cx + bbase.x + sprd, cy + bbase.y + drop);
      ctx.lineTo(cx + btip.x, cy + btip.y);
    }
    glowStroke(heat, 1);
    ctx.fillStyle = heat;
    for (i = 0; i < bullets.length; i++) {
      var bh = bullets[i];
      var hp2 = project(bh.x - cam.x, bh.y - cam.y, bh.z + 40, FOCAL);
      if (!hp2) continue;
      var hr = Math.min(3.5, 1.2 + hp2.s * 1.2);
      ctx.fillRect(cx + hp2.x - hr / 2, cy + hp2.y - hr / 2, hr, hr);
    }

    // muzzle flash right after firing
    if (muzzleT > 0) {
      ctx.strokeStyle = heat;
      ctx.beginPath();
      for (i = 0; i < XDIRS.length; i++) {
        ctx.moveTo(cx + XDIRS[i][0] * 8, cy + XDIRS[i][1] * 8);
        ctx.lineTo(cx + XDIRS[i][0] * 15, cy + XDIRS[i][1] * 15);
      }
      ctx.stroke();
    }

    // reticle: banks with lateral velocity, kicks on fire, blinks while
    // invulnerable, brightens on a kill chain, carries the shield ring
    if (invuln <= 0 || Math.floor(invuln * 8) % 2 === 0) {
      var rcol = mult > 1 ? heat : pal.accent;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.max(-0.4, Math.min(0.4, cam.vx * 0.0006)));
      var kick = 1 + muzzleT * 1.2;
      ctx.scale(kick, kick);
      ctx.beginPath();
      for (i = 0; i < PLUSDIRS.length; i++) {
        ctx.moveTo(PLUSDIRS[i][0] * 10, PLUSDIRS[i][1] * 10);
        ctx.lineTo(PLUSDIRS[i][0] * 22, PLUSDIRS[i][1] * 22);
      }
      glowStroke(rcol, 1);
      ctx.strokeRect(-4, -4, 8, 8);
      if (shieldUp) {
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, TAU);
        glowStroke(pal.kindCols[0], 0.55 + 0.2 * Math.sin(runT * 4));
      }
      ctx.restore();
    }

    // score pops rise and fade where the kill happened, in its color
    ctx.textAlign = 'center';
    for (i = 0; i < pops.length; i++) {
      var po = pops[i];
      var pq = project(po.x - cam.x, po.y - cam.y, po.z, FOCAL);
      if (!pq) continue;
      var pf = po.t / po.life;
      ctx.fillStyle = po.col;
      ctx.globalAlpha = Math.min(1, pf * 2);
      ctx.fillText(po.txt, cx + pq.x, cy + pq.y - (1 - pf) * 30);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    if (bannerT > 0) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 22px ' + pal.font;
      ctx.fillStyle = pal.waveCols[level % 8];
      ctx.globalAlpha = Math.min(1, bannerT / 0.35);
      ctx.fillText(bannerTxt, cx, cy - Math.min(W, H) * 0.22);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      ctx.font = '13px ' + pal.font;
    }
    ctx.restore();   // undo shake
  }

  function renderMenuScene(cx: number, cy: number) {
    drawGrid(cx, cy);
    drawStars(cx, cy, false);
    var R = Math.min(W, H) * 0.19;
    var t = reduced ? 0.6 : attractT;

    // the emblem: a glass icosahedron with an orbit ring and one satellite
    ctx.strokeStyle = pal.dim;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 14, R * 1.75, R * 0.55, 0.35 + t * 0.1, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    shapeTransform(cam.x, cam.y - 14, FOCAL, t * 0.4, t * 0.7, R, IVERTS);
    shapeFaces(cx, cy, cam.x, cam.y - 14, FOCAL, IFACES, pal.accent, 0.13);
    shapeEdgesPath(cx, cy, IEDGES);
    glowStroke(pal.accent, 1);
    shapeDwell(cx, cy, 12, pal.acBright, 0.9);
    var sa = t * 1.4, srot = 0.35 + t * 0.1;
    var sx = R * 1.75 * Math.cos(sa), sy = R * 0.55 * Math.sin(sa);
    var rx = sx * Math.cos(srot) - sy * Math.sin(srot);
    var ry = sx * Math.sin(srot) + sy * Math.cos(srot);
    ctx.fillStyle = pal.acBright;
    ctx.fillRect(cx + rx - 1.5, cy - 14 + ry - 1.5, 3, 3);

    ctx.fillStyle = pal.accent;
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px ' + pal.font;
    ctx.fillText(mode === 'over' ? 'GAME OVER · SCORE ' + score : 'A S T E R O I D S / 3 D',
      cx, cy + R + 28);
    ctx.fillStyle = pal.dim;
    ctx.font = '13px ' + pal.font;
    ctx.fillText(touch ? 'tap to start · hold to steer and fire'
      : 'enter to start · arrows steer · space fires', cx, cy + R + 50);
    ctx.fillText(touch ? 'fly through S/R/T crates: shield, rapid, triple'
      : 'S/R/T crates power up · m mutes · esc leaves', cx, cy + R + 70);
    if (best > 0) ctx.fillText('best ' + best, cx, cy + R + 90);
    ctx.textAlign = 'left';
  }

  function clearFrame() {
    // explicit transforms instead of save/restore: no per-frame traffic on
    // the full context state stack when only the transform changes
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.clearRect(0, 0, canvas.width, canvas.height);
    out.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawSpeaker() {
    var b = speakerBox(), x = b.x, y = b.y;
    out.strokeStyle = pal.dim;
    out.lineWidth = 1.4;
    out.beginPath();
    out.moveTo(x, y + 4); out.lineTo(x + 4, y + 4); out.lineTo(x + 9, y);
    out.lineTo(x + 9, y + 12); out.lineTo(x + 4, y + 8); out.lineTo(x, y + 8);
    out.closePath();
    out.stroke();
    out.beginPath();
    if (soundOn) {
      out.arc(x + 12, y + 6, 4, -0.9, 0.9);
    } else {
      out.moveTo(x + 12, y + 2); out.lineTo(x + 19, y + 10);
      out.moveTo(x + 19, y + 2); out.lineTo(x + 12, y + 10);
    }
    out.stroke();
  }

  function renderHud() {
    out.font = '13px ' + pal.font;
    if (mode === 'playing') {
      if (flash > 0) {
        out.strokeStyle = pal.fg;
        out.lineWidth = 4;
        out.strokeRect(2, 2, W - 4, H - 4);
      }
      out.fillStyle = pal.dim;
      var sTxt = 'score ' + score + '   wave ' + level;
      out.fillText(sTxt, 16, 24);
      var mult = comboMult(chain);
      if (mult > 1) {
        out.fillStyle = pal.tierCols[mult - 1];
        out.fillText('×' + mult, 20 + out.measureText(sTxt).width, 24);
      }
      var stat = '';
      if (shieldUp) stat = 'shield';
      if (rapidT > 0) stat += (stat ? ' · ' : '') + 'rapid ' + Math.ceil(rapidT);
      if (tripleT > 0) stat += (stat ? ' · ' : '') + 'triple ' + Math.ceil(tripleT);
      if (stat) {
        out.fillStyle = pal.dim;
        out.fillText(stat, 16, H - 12);
      }
      // lives: little ship triangles
      out.strokeStyle = pal.dim;
      out.lineWidth = 1.4;
      var lifeX = speakerBox().x - 24;   // clear of the speaker glyph
      for (var i = 0; i < lives; i++) {
        var lx = lifeX - i * 16;
        out.beginPath();
        out.moveTo(lx, 14); out.lineTo(lx + 4, 24); out.lineTo(lx - 4, 24);
        out.closePath();
        out.stroke();
      }
    }
    drawSpeaker();
  }

  function render() {
    clearFrame();
    renderScene();
    glowPersist();
    out.drawImage(overlayCv, 0, 0, W, H);
    // the opaque background goes in underneath everything at the end, so
    // the persistence layer samples pure line light, not the fill
    out.globalCompositeOperation = 'destination-over';
    out.fillStyle = pal.bg;
    out.fillRect(0, 0, W, H);
    out.globalCompositeOperation = 'source-over';
    renderHud();
  }

  /* loop: runs while active and (animating or playing); reduced-motion
     still screens render once, event-driven */
  function needsLoop() { return mode === 'playing' || !reduced; }
  function frame(now: number) {
    raf = 0;
    if (stopped) return;
    if (!isActive()) { stop(); return; }
    // simulate in substeps of <=25ms so a slow machine drops frames instead
    // of dilating game time, and fast bullets can't tunnel through rocks
    var dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    var n = dt > 0.025 ? Math.min(4, Math.ceil(dt / 0.025)) : 1;
    var h = dt / n;
    for (var k = 0; k < n; k++) step(h);
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
    window.addEventListener('keyup', rerender);
    canvas.addEventListener('pointerup', rerender);
    var innerStop = stop;
    stop = function () {
      window.removeEventListener('keyup', rerender);
      canvas.removeEventListener('pointerup', rerender);
      innerStop();
    };
  }

  return { stop: function () { stop(); } };
}
