// The scene, on OGL.
//
// Everything the game draws is light on black: the scene target is cleared to
// black, every batch blends additively, and the composite pass adds the result
// to the theme background. Two things fall out of that. Draw order stops
// mattering, because addition is commutative, which fixes the old renderer's
// bug where only rocks were depth-sorted and debris, bullets, rings and pops
// composited in fixed layer order. And the bloom pass gets a clean luminance
// signal instead of a frame with a background baked into it.
//
// Three dynamic batches cover the whole game: triangles for the glass faces,
// lines for every wireframe and tracer, points for stars and beam dwell. They
// are rebuilt into preallocated arrays each frame, so a busy frame allocates
// nothing and costs three draw calls.
//
// Presentation state lives here and nowhere else: debris, shockwave rings,
// screen shake, the damage flash, the muzzle flash and the warp. The simulation
// does not know any of it exists; it arrives as events.

import { Renderer, Program, Mesh, Geometry } from 'ogl';
import { ICO, OCT, rotate } from './geometry.ts';
import { SIZES, Z_FAR, Z_NEAR, FOCAL, X_BOUND, Y_BOUND, HUNTER_R, comboMult } from './sim.ts';
import type { SimState } from './sim.ts';
import { hexToRgb } from './palette.ts';
import type { Palette, SimEvent, Vec3, Deb, Ring, Star, RGB } from './types.ts';
import { createPost } from './post.ts';
import type { Rng } from './rng.ts';

const TAU = Math.PI * 2;

const MAX_TRIS = 2048;
const MAX_LINES = 4096;
const MAX_POINTS = 1024;
const DEB_MAX = 400;        // the 2D renderer capped at 150; each one was a ctx call

type Col = [number, number, number];

const toCol = (hex: string): Col => {
  const c: RGB = hexToRgb(hex);
  return [c[0] / 255, c[1] / 255, c[2] / 255];
};

interface Cols {
  fg: Col; dim: Col; accent: Col; acBright: Col;
  hostile: Col; hostileHot: Col;
  sizeCols: Col[]; sizeBright: Col[]; ramps: Col[][];
  kindCols: Col[]; tierCols: Col[];
  bg: [number, number, number]; light: boolean;
}

function toCols(p: Palette): Cols {
  return {
    fg: toCol(p.fg.charAt(0) === '#' ? p.fg : '#ebdbb2'),
    dim: toCol(p.dim.charAt(0) === '#' ? p.dim : '#928374'),
    accent: toCol(p.accent.charAt(0) === '#' ? p.accent : '#8ec07c'),
    acBright: toCol(p.acBright),
    hostile: toCol(p.hostile), hostileHot: toCol(p.hostileHot),
    sizeCols: p.sizeCols.map(toCol), sizeBright: p.sizeBright.map(toCol),
    ramps: p.ramps.map((r) => r.map(toCol)),
    kindCols: p.kindCols.map(toCol), tierCols: p.tierCols.map(toCol),
    bg: toCol(p.bg.charAt(0) === '#' ? p.bg : '#1d2021'),
    light: p.light,
  };
}

const VERT = /* glsl */ `
  attribute vec3 position;
  attribute vec4 color;
  uniform mat4 uVP;
  uniform float uPointScale;
  varying vec4 vColor;
  void main() {
    vColor = color;
    gl_Position = uVP * vec4(position, 1.0);
    // points shrink with distance the way the old renderer's p.s factor did
    gl_PointSize = clamp(uPointScale / max(gl_Position.w, 1.0), 1.0, 6.0) * color.a;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec4 vColor;
  void main() { gl_FragColor = vec4(vColor.rgb * vColor.a, 1.0); }
`;

export interface RendererOpts { reduced: boolean; rng: Rng; }

export interface GameRenderer {
  fit: (w: number, h: number, dpr: number) => void;
  handle: (events: SimEvent[], state: SimState) => void;
  setPalette: (p: Palette) => void;
  step: (dt: number, state: SimState) => void;
  draw: (state: SimState, dt: number) => void;
  flash: () => number;
  dispose: () => void;
}

export function createRenderer(canvas: HTMLCanvasElement, opts: RendererOpts): GameRenderer | null {
  let renderer: Renderer;
  try {
    renderer = new Renderer({ canvas, alpha: false, antialias: false, depth: true, dpr: 1 });
    if (!renderer.gl) return null;
  } catch {
    return null;   // no WebGL: index.ts turns this into the shell's error path
  }
  const gl = renderer.gl;
  const rng = opts.rng;

  const post = createPost(renderer, { reduced: opts.reduced });

  /* ---------- batches ---------- */

  const mkBatch = (max: number, mode: number) => {
    const position = new Float32Array(max * 3);
    const color = new Float32Array(max * 4);
    const geometry = new Geometry(gl, {
      position: { size: 3, data: position, usage: gl.DYNAMIC_DRAW },
      color: { size: 4, data: color, usage: gl.DYNAMIC_DRAW },
    });
    const program = new Program(gl, {
      vertex: VERT, fragment: FRAG,
      uniforms: { uVP: { value: new Float32Array(16) }, uPointScale: { value: 900 } },
      depthTest: false, depthWrite: false, cullFace: null as unknown as number,
    });
    program.setBlendFunc(gl.ONE, gl.ONE);          // additive: order stops mattering
    const mesh = new Mesh(gl, { geometry, program, mode, frustumCulled: false });
    return { position, color, geometry, program, mesh, n: 0, max };
  };

  const tris = mkBatch(MAX_TRIS * 3, gl.TRIANGLES);
  const lines = mkBatch(MAX_LINES * 2, gl.LINES);
  const points = mkBatch(MAX_POINTS, gl.POINTS);

  function vtx(b: typeof tris, x: number, y: number, z: number, c: Col, a: number) {
    if (b.n >= b.max) return;
    const p = b.n * 3, q = b.n * 4;
    b.position[p] = x; b.position[p + 1] = y; b.position[p + 2] = z;
    b.color[q] = c[0]; b.color[q + 1] = c[1]; b.color[q + 2] = c[2]; b.color[q + 3] = a;
    b.n++;
  }
  const line = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, c: Col, a: number) => {
    if (lines.n + 2 > lines.max) return;
    vtx(lines, x1, y1, z1, c, a); vtx(lines, x2, y2, z2, c, a);
  };
  const tri = (a: Vec3, b: Vec3, c: Vec3, col: Col, alpha: number) => {
    if (tris.n + 3 > tris.max) return;
    vtx(tris, a[0], a[1], a[2], col, alpha);
    vtx(tris, b[0], b[1], b[2], col, alpha);
    vtx(tris, c[0], c[1], c[2], col, alpha);
  };
  const point = (x: number, y: number, z: number, c: Col, a: number) => vtx(points, x, y, z, c, a);

  /* ---------- camera ---------- */

  // The old projection was screen_px = world * FOCAL / z, with y pointing down.
  // Reproducing it exactly (rather than picking a plausible fov) keeps every
  // tuned constant in sim.ts meaning what it meant: the play-field bounds, the
  // rock sizes and the collision radii are all in these units.
  const vp = new Float32Array(16);
  let W = 300, H = 200;
  function buildVP(camX: number, camY: number, shakeX: number, shakeY: number) {
    const near = 1, far = Z_FAR + 400;
    const sx = 2 * FOCAL / W, sy = 2 * FOCAL / H;
    const A = (far + near) / (far - near), B = -2 * far * near / (far - near);
    vp.fill(0);
    vp[0] = sx;
    vp[5] = -sy;
    vp[10] = A; vp[11] = 1;
    vp[12] = -sx * (camX + shakeX);
    vp[13] = sy * (camY + shakeY);
    vp[14] = B;
    return vp;
  }

  /* ---------- presentation state ---------- */

  let cols: Cols = toCols({
    bg: '#1d2021', fg: '#ebdbb2', accent: '#8ec07c', dim: '#928374', font: '', light: false,
    acBright: '#c5e6b5', hostile: '#7ca8c0', hostileHot: '#b5d4e6',
    sizeCols: ['#8ec07c', '#c0b57c', '#c08e7c'], sizeBright: ['#c5e6b5', '#e6ddb5', '#e6c5b5'],
    ramps: [[], [], []].map(() => new Array(8).fill('#8ec07c')),
    kindCols: ['#7cc0a8', '#c08e7c', '#c07ca8'], tierCols: new Array(5).fill('#c5e6b5'),
    waveCols: new Array(8).fill('#c5e6b5'),
  });

  const debris: Deb[] = [];
  for (let i = 0; i < DEB_MAX; i++) debris.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, col: '' });
  let debN = 0;
  const debCol: Col[] = new Array(DEB_MAX).fill(0).map(() => [1, 1, 1] as Col);

  let rings: (Ring & { c: Col })[] = [];
  let stars: Star[] = [];
  let shake = 0, flashT = 0, muzzleT = 0, warp = 0, gridPhase = 0, attractT = 0, clock = 0;

  function makeStars() {
    stars = [];
    for (let i = 0; i < 220; i++) {      // the 2D renderer managed 90
      stars.push({
        x: (rng() * 2 - 1) * X_BOUND * 1.6, y: (rng() * 2 - 1) * Y_BOUND * 1.6,
        z: rng() * Z_FAR, m: rng() < 0.25 ? 1 : 0,
      });
    }
  }
  makeStars();

  function burst(x: number, y: number, z: number, n: number, speed: number, c: Col) {
    if (opts.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n && debN < DEB_MAX; i++) {
      const d = debris[debN];
      debCol[debN] = c;
      debN++;
      const th = rng() * TAU, up = (rng() - 0.5) * 2;
      const pl = Math.sqrt(Math.max(0, 1 - up * up));
      const sp = speed * (0.35 + rng() * 0.85);
      d.x = x; d.y = y; d.z = z;
      d.vx = Math.cos(th) * pl * sp;
      d.vy = Math.sin(th) * pl * sp;
      d.vz = up * sp - 40;
      d.life = d.t = 0.45 + rng() * 0.4;
    }
  }

  function ring(x: number, y: number, z: number, r0: number, r1: number, life: number, c: Col) {
    if (rings.length >= 10) rings.shift();
    rings.push({ x, y, z, r: r0, vr: (r1 - r0) / life, t: life, life, col: '', c });
  }

  /* ---------- events in, effects out ---------- */

  function handle(events: SimEvent[], state: SimState) {
    for (const e of events) {
      switch (e.kind) {
        case 'rockKilled': {
          const c = cols.sizeBright[e.size];
          const S = SIZES[e.size];
          burst(e.x, e.y, e.z, 22 - e.size * 4, 150 + (2 - e.size) * 40, c);
          ring(e.x, e.y, e.z, S * 0.35, S * 2.4, 0.35, c);
          shake = Math.min(1, shake + 0.18 + (2 - e.size) * 0.08);
          break;
        }
        case 'hunterKilled':
          burst(e.x, e.y, e.z, 26, 260, cols.hostileHot);
          ring(e.x, e.y, e.z, HUNTER_R * 0.5, HUNTER_R * 4, 0.4, cols.hostileHot);
          shake = Math.min(1, shake + 0.45);
          break;
        case 'pickupTaken':
          ring(e.x, e.y, e.z, 20, 140, 0.35, cols.kindCols[e.which]);
          break;
        case 'shieldLost':
          burst(state.cam.x, state.cam.y, Z_NEAR + 60, 18, 260, cols.kindCols[0]);
          ring(state.cam.x, state.cam.y, Z_NEAR + 70, 30, 260, 0.5, cols.kindCols[0]);
          flashT = 0.3; shake = 1;
          break;
        case 'lifeLost':
          burst(state.cam.x, state.cam.y, Z_NEAR + 60, 30, 320, cols.fg);
          ring(state.cam.x, state.cam.y, Z_NEAR + 70, 30, 300, 0.5, cols.fg);
          flashT = 0.5; shake = 1;
          break;
        case 'waveStart':
          warp = Math.max(warp, 0.6);
          break;
        case 'fired':
          muzzleT = 0.06;
          break;
      }
    }
  }

  function setPalette(p: Palette) { cols = toCols(p); }

  /* ---------- effect integration ---------- */

  function step(dt: number, state: SimState) {
    clock += dt;
    shake = Math.max(0, shake - 2.6 * dt);
    flashT = Math.max(0, flashT - dt);
    muzzleT = Math.max(0, muzzleT - dt);
    warp = Math.max(0, warp - dt * 1.4);
    if (state.interT > 0) warp = Math.max(warp, 0.35);

    const speed = state.mode === 'playing' ? (state.interT > 0 ? 220 * 6 : 220) : 30;
    gridPhase -= speed * dt;
    for (const st of stars) {
      st.z -= speed * dt;
      if (st.z < 8) {
        st.z = Z_FAR;
        st.x = (rng() * 2 - 1) * X_BOUND * 1.6;
        st.y = (rng() * 2 - 1) * Y_BOUND * 1.6;
      }
    }

    if (state.mode !== 'playing') attractT += dt;

    for (let i = 0; i < debN;) {
      const d = debris[i];
      d.t -= dt;
      if (d.t <= 0) {
        debN--;
        const td = debris[i]; debris[i] = debris[debN]; debris[debN] = td;
        const tc = debCol[i]; debCol[i] = debCol[debN]; debCol[debN] = tc;
        continue;
      }
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      i++;
    }

    let w = 0;
    for (const rg of rings) {
      rg.t -= dt; rg.r += rg.vr * dt;
      if (rg.t > 0) rings[w++] = rg;
    }
    rings.length = w;
  }

  /* ---------- shapes ---------- */

  const vcache: Vec3[] = [];

  function shape(x: number, y: number, z: number, ax: number, ay: number, S: number,
                 verts: Vec3[], edges: [number, number][], faces: [number, number, number][],
                 camX: number, camY: number,
                 edgeCol: Col, edgeA: number, faceCol: Col, faceA: number,
                 dwellCol: Col | null, dwellA: number) {
    for (let i = 0; i < verts.length; i++) {
      const v = rotate(verts[i], ax, ay);
      vcache[i] = [x + v[0] * S, y + v[1] * S, z + v[2] * S];
    }
    for (const [a, b] of edges) {
      const p = vcache[a], q = vcache[b];
      line(p[0], p[1], p[2], q[0], q[1], q[2], edgeCol, edgeA);
    }
    if (faceA > 0) {
      for (const [i, j, k] of faces) {
        const A = vcache[i], B = vcache[j], C = vcache[k];
        // back-face cull against the eye, and light by how squarely the face
        // meets it, exactly as the 2D renderer did
        const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
        const wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const cx = (A[0] + B[0] + C[0]) / 3 - x, cy = (A[1] + B[1] + C[1]) / 3 - y, cz = (A[2] + B[2] + C[2]) / 3 - z;
        if (nx * cx + ny * cy + nz * cz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const vx = (A[0] + B[0] + C[0]) / 3 - camX, vy = (A[1] + B[1] + C[1]) / 3 - camY, vz = (A[2] + B[2] + C[2]) / 3;
        const dot = nx * vx + ny * vy + nz * vz;
        if (dot >= 0) continue;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        const vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
        tri(A, B, C, faceCol, faceA * (0.35 + 0.65 * (-dot / (nl * vl))));
      }
    }
    if (dwellCol) {
      for (let i = 0; i < verts.length; i++) {
        const p = vcache[i];
        point(p[0], p[1], p[2], dwellCol, dwellA);
      }
    }
  }

  function drawGrid() {
    const gy = Y_BOUND + 90;
    const range = Z_FAR - 90;
    for (let gx = -900; gx <= 900; gx += 180) {
      for (let s = -1; s <= 1; s += 2) {
        line(gx, s * gy, 90, gx, s * gy, Z_FAR, cols.dim, 0.16);
      }
    }
    for (let k = 0; k < 10; k++) {
      const gz = 90 + (((k * 141 + gridPhase) % range) + range) % range;
      for (let s = -1; s <= 1; s += 2) {
        line(-900, s * gy, gz, 900, s * gy, gz, cols.dim, 0.22);
      }
    }
  }

  function drawStars(streak: boolean) {
    for (const st of stars) {
      const c = st.m === 0 ? cols.dim : cols.accent;
      const a = st.m === 0 ? 0.5 : 0.95;
      if (streak && st.m === 1) line(st.x, st.y, st.z, st.x, st.y, st.z + 320, c, a);
      else point(st.x, st.y, st.z, c, a);
    }
  }

  function drawScene(state: SimState) {
    const cam = state.cam;
    const playing = state.mode === 'playing';

    drawGrid();
    drawStars(state.interT > 0 && !opts.reduced);

    if (!playing) {
      // the attract emblem: a slow glass icosahedron with an orbiting mote
      const t = opts.reduced ? 0.6 : attractT;
      const R = 120;
      shape(cam.x, cam.y - 20, FOCAL * 1.6, t * 0.4, t * 0.7, R,
        ICO.verts, ICO.edges, ICO.faces, cam.x, cam.y,
        cols.accent, 1, cols.accent, 0.13, cols.acBright, 0.9);
      const sa = t * 1.4;
      line(cam.x + Math.cos(sa) * R * 1.8, cam.y - 20 + Math.sin(sa) * R * 0.6, FOCAL * 1.6,
        cam.x + Math.cos(sa + 0.05) * R * 1.8, cam.y - 20 + Math.sin(sa + 0.05) * R * 0.6, FOCAL * 1.6,
        cols.acBright, 1);
      return;
    }

    for (const rk of state.rocks) {
      let fog = (Z_FAR + 120 - rk.z) / 450;
      if (fog <= 0) continue;
      if (fog > 1) fog = 1;
      const S = SIZES[rk.size];
      const ramp = cols.ramps[rk.size];
      const edgeC = ramp[Math.min(7, (fog * 7) | 0)];
      shape(rk.x, rk.y, rk.z, rk.ax, rk.ay, S,
        ICO.verts, ICO.edges, ICO.faces, cam.x, cam.y,
        edgeC, fog, cols.sizeCols[rk.size], 0.11 * fog,
        rk.z < 650 ? cols.sizeBright[rk.size] : null, fog * 0.9);
    }

    for (const h of state.hunters) {
      shape(h.x, h.y, h.z, h.ax, h.ay, HUNTER_R * 1.35,
        OCT.verts, OCT.edges, OCT.faces, cam.x, cam.y,
        cols.hostile, 1, cols.hostile, 0.16, cols.hostileHot, 0.9);
      if (h.z < 1000) {
        // a dashed telegraph toward the reticle, so a hunter reads as aimed
        for (let d = 0; d < 6; d++) {
          const t0 = d / 6, t1 = t0 + 0.06;
          line(h.x + (cam.x - h.x) * t0, h.y + (cam.y - h.y) * t0, h.z + (Z_NEAR - h.z) * t0,
            h.x + (cam.x - h.x) * t1, h.y + (cam.y - h.y) * t1, h.z + (Z_NEAR - h.z) * t1,
            cols.hostile, 0.4);
        }
      }
    }

    const pulse = 0.55 + 0.45 * Math.sin(clock * 7);
    for (const pk of state.pickups) {
      const c = cols.kindCols[pk.kind];
      shape(pk.x, pk.y, pk.z, pk.ax, pk.ay, 26,
        OCT.verts, OCT.edges, OCT.faces, cam.x, cam.y,
        c, pulse, c, 0.14 * pulse, c, pulse);
    }

    for (const rg of rings) {
      const a = rg.t / rg.life;
      const N = 28;
      for (let i = 0; i < N; i++) {
        const t0 = i / N * TAU, t1 = (i + 1) / N * TAU;
        line(rg.x + Math.cos(t0) * rg.r, rg.y + Math.sin(t0) * rg.r, rg.z,
          rg.x + Math.cos(t1) * rg.r, rg.y + Math.sin(t1) * rg.r, rg.z, rg.c, a);
      }
    }

    for (let i = 0; i < debN; i++) {
      const d = debris[i];
      line(d.x, d.y, d.z, d.x + d.vx * 0.05, d.y + d.vy * 0.05, d.z + d.vz * 0.05, debCol[i], d.t / d.life);
    }

    const mult = comboMult(state.chain);
    const heat = cols.tierCols[mult - 1];
    for (const bl of state.bullets) {
      // converging tracers: the spread closes with depth, anchored on the
      // bullet, so steering after firing moves the whole tracer
      const prog = Math.min(1, (bl.z - Z_NEAR) / 500);
      const sprd = 26 * (1 - prog), drop = 16 * (1 - prog);
      line(bl.x - sprd, bl.y + drop, bl.z, bl.x, bl.y, bl.z + 40, heat, 1);
      line(bl.x + sprd, bl.y + drop, bl.z, bl.x, bl.y, bl.z + 40, heat, 1);
      point(bl.x, bl.y, bl.z + 40, heat, 1);
    }

    // the reticle sits at the camera, so it lands dead centre whatever the
    // steering is doing; the roll is the banking the 2D version faked
    if (state.invuln <= 0 || Math.floor(state.invuln * 8) % 2 === 0) {
      const rc = mult > 1 ? heat : cols.accent;
      const zr = Z_NEAR + 40;
      const kick = 1 + muzzleT * 1.2;
      const roll = Math.max(-0.4, Math.min(0.4, cam.vx * 0.0006));
      const cr = Math.cos(roll), sr = Math.sin(roll);
      const arm = (ux: number, uy: number, r0: number, r1: number) => {
        const ax = ux * cr - uy * sr, ay = ux * sr + uy * cr;
        line(cam.x + ax * r0 * kick, cam.y + ay * r0 * kick, zr,
          cam.x + ax * r1 * kick, cam.y + ay * r1 * kick, zr, rc, 1);
      };
      arm(-1, 0, 10, 22); arm(1, 0, 10, 22); arm(0, -1, 10, 22); arm(0, 1, 10, 22);
      if (state.shieldUp) {
        const N = 24, R = 30;
        const sa = 0.55 + 0.2 * Math.sin(clock * 4);
        for (let i = 0; i < N; i++) {
          const t0 = i / N * TAU, t1 = (i + 1) / N * TAU;
          line(cam.x + Math.cos(t0) * R, cam.y + Math.sin(t0) * R, zr,
            cam.x + Math.cos(t1) * R, cam.y + Math.sin(t1) * R, zr, cols.kindCols[0], sa);
        }
      }
      if (muzzleT > 0) {
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          line(cam.x + dx * 8, cam.y + dy * 8, zr, cam.x + dx * 15, cam.y + dy * 15, zr, heat, 1);
        }
      }
    }
  }

  /* ---------- frame ---------- */

  function upload(b: typeof tris) {
    b.geometry.attributes.position.needsUpdate = true;
    b.geometry.attributes.color.needsUpdate = true;
    b.geometry.setDrawRange(0, b.n);
  }

  function draw(state: SimState, dt: number) {
    tris.n = lines.n = points.n = 0;
    drawScene(state);

    const sx = shake > 0.02 && !opts.reduced ? (rng() * 2 - 1) * shake * 7 : 0;
    const sy = shake > 0.02 && !opts.reduced ? (rng() * 2 - 1) * shake * 7 : 0;
    const m = buildVP(state.cam.x, state.cam.y, sx, sy);

    for (const b of [tris, lines, points]) {
      (b.program.uniforms.uVP.value as Float32Array).set(m);
      upload(b);
    }

    renderer.render({ scene: tris.mesh, target: post.sceneTarget, clear: true });
    renderer.render({ scene: lines.mesh, target: post.sceneTarget, clear: false });
    renderer.render({ scene: points.mesh, target: post.sceneTarget, clear: false });

    post.run(cols.bg, cols.light, clock, warp, dt);
  }

  /* The canvas pixel size is computed here rather than left to OGL. setSize()
     does canvas.width = width * dpr with no rounding, and canvas.width is an
     unsigned long, so a fractional dpr truncates: at dpr 1.5 and an odd width
     that lands a pixel below Math.round, which is the value
     tests/e2e/console.e2e.mjs asserts. Driving it directly keeps the two in
     agreement and keeps the framebuffer an exact integer. */
  function fit(w: number, h: number, dpr: number) {
    W = w; H = h;                                   // CSS pixels: FOCAL is in these units
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    renderer.dpr = 1;
    renderer.setSize(pw, ph);                       // gives canvas.width === pw exactly
    canvas.style.width = w + 'px';                  // undo the device-pixel style setSize wrote
    canvas.style.height = h + 'px';
    post.resize(pw, ph, 1);
  }

  function dispose() {
    post.dispose();
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();     // a re-entered game gets a fresh context
  }

  return { fit, handle, setPalette, step, draw, flash: () => flashT, dispose };
}
