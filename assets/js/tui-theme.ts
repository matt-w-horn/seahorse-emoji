// Perceptual OKLCH color theory, 24-hour non-green palette clock, WCAG 2.1
// contrast analysis, and 8-bit Bayer-dithered ocean field math. Pure functions
// reside at the top so tests/tui-theme.test.ts can exercise them directly
// under Node without a DOM.

import { hexToRgb, rgbToHex, mixRgb, derivePalette, type PaletteSource } from './game/palette.ts';
import type { RGB, Palette } from './game/types.ts';

export interface Oklch {
  l: number;   // 0..100 (%)
  c: number;   // 0..0.4
  h: number;   // 0..360 (deg)
}

export interface ThemeSpec {
  id: string;
  cls: string;
  name: string;
  slot: string;
  hours: [number, number];
  bg: string;
  fg: string;
  accent: string;
  err: string;
  note: string;
}

export interface ThemeReadout {
  spec: ThemeSpec;
  seedLabel: string;
  bgRgb: RGB;
  fgRgb: RGB;
  accRgb: RGB;
  dimHex: string;
  lineHex: string;
  bgOklch: Oklch;
  fgOklch: Oklch;
  accOklch: Oklch;
  contrast: number;
  gamePalette: Palette;
}

// 12 cohesive non-green palettes spanning the 24-hour clock (2 hours per
// station), plus classic Cobalt Amber and Pistachio available in the lab.
export const HOURLY_THEMES: readonly ThemeSpec[] = [
  {
    id: 'abyssal',
    cls: 'p-abyssal',
    name: 'abyssal blue',
    slot: '00:00–01:59',
    hours: [0, 1],
    bg: '#101b2d',
    fg: '#dce8f8',
    accent: '#689dff',
    err: '#ff6b8b',
    note: 'Deep midnight slate-blue with soft periwinkle phosphor',
  },
  {
    id: 'ultraviolet',
    cls: 'p-ultraviolet',
    name: 'ultraviolet',
    slot: '02:00–03:59',
    hours: [2, 3],
    bg: '#18152a',
    fg: '#e6e1f7',
    accent: '#b392f0',
    err: '#ff7a90',
    note: 'Late-night indigo-violet balanced against cool lavender white',
  },
  {
    id: 'orchid',
    cls: 'p-orchid',
    name: 'orchid dusk',
    slot: '04:00–05:59',
    hours: [4, 5],
    bg: '#201424',
    fg: '#f3e4ec',
    accent: '#f472b6',
    err: '#fb923c',
    note: 'Pre-dawn dark plum horizon with warm rose-pink highlights',
  },
  {
    id: 'coral',
    cls: 'p-coral',
    name: 'coral slate',
    slot: '06:00–07:59',
    hours: [6, 7],
    bg: '#1e1b26',
    fg: '#f2e9e4',
    accent: '#fb7185',
    err: '#facc15',
    note: 'Daybreak warm coral over charcoal-violet slate',
  },
  {
    id: 'harbor',
    cls: 'p-harbor',
    name: 'harbor cyan',
    slot: '08:00–09:59',
    hours: [8, 9],
    bg: '#122532',
    fg: '#dcf1f9',
    accent: '#38bdf8',
    err: '#ff628c',
    note: 'Morning marine teal paired with crisp sky-cyan phosphor',
  },
  {
    id: 'cerulean',
    cls: 'p-cerulean',
    name: 'cerulean',
    slot: '10:00–11:59',
    hours: [10, 11],
    bg: '#142c3e',
    fg: '#d8eaf7',
    accent: '#4fc4ff',
    err: '#ff628c',
    note: 'Mid-morning pelagic cobalt with electric cerulean highlights',
  },
  {
    id: 'cobalt-sky',
    cls: 'p-cobalt-sky',
    name: 'cobalt sky',
    slot: '12:00–13:59',
    hours: [12, 13],
    bg: '#163044',
    fg: '#e0eef9',
    accent: '#67d4ff',
    err: '#ff6b8b',
    note: 'High-noon ocean cobalt balanced with luminous ice-cyan phosphor',
  },
  {
    id: 'glacier',
    cls: 'p-glacier',
    name: 'glacier slate',
    slot: '14:00–15:59',
    hours: [14, 15],
    bg: '#172638',
    fg: '#e3edf8',
    accent: '#7dd3fc',
    err: '#fb7185',
    note: 'Cool afternoon steel-blue with pale arctic sky highlights',
  },
  {
    id: 'amber',
    cls: 'p-amber',
    name: 'amber espresso',
    slot: '16:00–17:59',
    hours: [16, 17],
    bg: '#231915',
    fg: '#f5e6d8',
    accent: '#f59e0b',
    err: '#fb7185',
    note: 'Late-afternoon warm amber phosphor over roasted espresso',
  },
  {
    id: 'vermilion',
    cls: 'p-vermilion',
    name: 'sunset vermilion',
    slot: '18:00–19:59',
    hours: [18, 19],
    bg: '#221622',
    fg: '#f4e3ea',
    accent: '#ff7a6b',
    err: '#facc15',
    note: 'Dusk vermilion coral over deep twilight aubergine',
  },
  {
    id: 'violet',
    cls: 'p-violet',
    name: 'neon violet',
    slot: '20:00–21:59',
    hours: [20, 21],
    bg: '#181528',
    fg: '#ede7f6',
    accent: '#ff7eb6',
    err: '#ffb86c',
    note: 'Evening violet slate paired with bright magenta-rose neon',
  },
  {
    id: 'biolum',
    cls: 'p-biolum',
    name: 'bioluminescent',
    slot: '22:00–23:59',
    hours: [22, 23],
    bg: '#11212f',
    fg: '#d9ecf7',
    accent: '#22d3ee',
    err: '#f472b6',
    note: 'Deep trench indigo with bioluminescent reef cyan',
  },
];

export const COBALT_AMBER_THEME: ThemeSpec = {
  id: 'cobalt',
  cls: 'p-cobalt',
  name: 'cobalt orange',
  slot: 'classic · amber',
  hours: [-1, -1],
  bg: '#193549',
  fg: '#d8e9f5',
  accent: '#ff9d00',
  err: '#ff628c',
  note: 'Complementary warm amber-orange against cool 230° cobalt',
};

export const PISTACHIO_THEME: ThemeSpec = {
  id: 'pistachio',
  cls: 'p-pistachio',
  name: 'pistachio',
  slot: 'classic · green',
  hours: [-1, -1],
  bg: '#1d2021',
  fg: '#ebdbb2',
  accent: '#8ec07c',
  err: '#fb4934',
  note: 'Original Gruvbox-inspired warm dark terminal green',
};

export const ALL_THEMES: readonly ThemeSpec[] = [
  ...HOURLY_THEMES,
  COBALT_AMBER_THEME,
  PISTACHIO_THEME,
];

export function themeIndexForHour(hour: number): number {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return Math.floor(h / 2) % HOURLY_THEMES.length;
}

export function themeForHour(hour: number): ThemeSpec {
  return HOURLY_THEMES[themeIndexForHour(hour)];
}

// sRGB (0..255) -> linear sRGB -> OKLab -> OKLCH (Bjorn Ottosson's transform)
function srgbToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function rgbToOklch(c: RGB): Oklch {
  const r = srgbToLinear(c[0]);
  const g = srgbToLinear(c[1]);
  const b = srgbToLinear(c[2]);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;

  return {
    l: Math.round(L * 1000) / 10,
    c: Math.round(C * 1000) / 1000,
    h: C < 0.0005 ? 0 : Math.round(H),
  };
}

export function formatOklch(o: Oklch): string {
  return 'oklch(' + o.l.toFixed(0) + '% ' + o.c.toFixed(2) + ' ' + o.h + '°)';
}

// WCAG 2.x relative luminance & contrast ratio (1..21)
export function relativeLuminance(c: RGB): number {
  return 0.2126 * srgbToLinear(c[0]) + 0.7152 * srgbToLinear(c[1]) + 0.0722 * srgbToLinear(c[2]);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
}

export function inspectTheme(spec: ThemeSpec, now: Date = new Date()): ThemeReadout {
  const bgRgb = hexToRgb(spec.bg);
  const fgRgb = hexToRgb(spec.fg);
  const accRgb = hexToRgb(spec.accent);
  const dimRgb = mixRgb(bgRgb, fgRgb, 0.62);
  const lineRgb = mixRgb(bgRgb, fgRgb, 0.22);

  const src: PaletteSource = {
    fg: spec.fg,
    bg: spec.bg,
    accent: spec.accent,
    dim: rgbToHex(dimRgb),
    font: 'monospace',
    bgC: bgRgb,
    fgC: fgRgb,
    acC: accRgb,
    dimC: dimRgb,
  };

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(spec.hours[0] >= 0 ? spec.hours[0] : now.getHours()).padStart(2, '0');

  return {
    spec,
    seedLabel: `${yyyy}-${mm}-${dd}T${hh}:00`,
    bgRgb,
    fgRgb,
    accRgb,
    dimHex: rgbToHex(dimRgb),
    lineHex: rgbToHex(lineRgb),
    bgOklch: rgbToOklch(bgRgb),
    fgOklch: rgbToOklch(fgRgb),
    accOklch: rgbToOklch(accRgb),
    contrast: contrastRatio(fgRgb, bgRgb),
    gamePalette: derivePalette(src),
  };
}

/* ---------- V3 Non-Repeating 8-Bit Bayer-Dithered Ocean Field ---------- */

export const BAYER_4X4: readonly (readonly number[])[] = [
  [0 / 16, 8 / 16, 2 / 16, 10 / 16],
  [12 / 16, 4 / 16, 14 / 16, 6 / 16],
  [3 / 16, 11 / 16, 1 / 16, 9 / 16],
  [15 / 16, 7 / 16, 13 / 16, 5 / 16],
];

function hash2d(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2d(ix, iy), b = hash2d(ix + 1, iy);
  const c = hash2d(ix, iy + 1), d = hash2d(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number): number {
  return 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.02, y * 2.05) + 0.15 * vnoise(x * 4.03, y * 4.01);
}

interface OceanFieldCache {
  w: number;
  h: number;
  vCache: Float32Array;
  warp: Float32Array;
  w3: Float32Array;
  foamCell: Float32Array;
  foamPatch: Float32Array;
  field: Float32Array;
  imgData: ImageData;
  buf32: Uint32Array;
}

let oceanCache: OceanFieldCache | null = null;

function ensureOceanCache(ctx: CanvasRenderingContext2D, W: number, H: number): OceanFieldCache {
  if (oceanCache && oceanCache.w === W && oceanCache.h === H) return oceanCache;
  const N = W * H;
  const vCache = new Float32Array(H);
  const warp = new Float32Array(N);
  const w3 = new Float32Array(N);
  const foamCell = new Float32Array(N);
  const foamPatch = new Float32Array(N);
  const field = new Float32Array(N);
  const uScale = 16.0 / W;

  for (let y = 0; y < H; y++) {
    const v = Math.pow(y / H + 0.15, 0.82) * 26.0;
    vCache[y] = v;
    const rowOff = y * W;
    for (let x = 0; x < W; x++) {
      const i = rowOff + x;
      const u = x * uScale;
      warp[i] = fbm(u * 0.45, v * 0.45) * 2.3;
      w3[i] = fbm(u * 1.35, v * 1.75) * 2 - 1;
      foamCell[i] = vnoise(x * 0.32, y * 0.38);
      foamPatch[i] = fbm(u * 0.55 + 5.2, v * 0.48 + 1.7);
    }
  }

  const imgData = ctx.createImageData(W, H);
  const buf32 = new Uint32Array(imgData.data.buffer);
  oceanCache = { w: W, h: H, vCache, warp, w3, foamCell, foamPatch, field, imgData, buf32 };
  return oceanCache;
}

function packRgba(rgb: RGB, alpha: number): number {
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  return ((a << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
}

// Renders the V3 hybrid non-repeating 8-bit ocean (Bayer-dithered swells +
// crisp 8-bit stepped ridge crests + lacy cellular seafoam) onto `canvas`.
// `phase` advances very slowly over time to animate the ocean swells.
export function paintOceanCanvas(
  canvas: HTMLCanvasElement,
  spec: ThemeSpec,
  phase: number = 0,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const vw = Math.max(320, window.innerWidth || 1280);
  const vh = Math.max(240, window.innerHeight || 820);
  const PW = 4, PH = 3;
  const W = Math.ceil(vw / PW);
  const H = Math.ceil(vh / PH);
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;

  const cache = ensureOceanCache(ctx, W, H);
  const { vCache, warp, w3, foamCell, foamPatch, field, imgData, buf32 } = cache;
  buf32.fill(0);

  const fg = hexToRgb(spec.fg);
  const acc = hexToRgb(spec.accent);

  const colRidgeHi = packRgba(fg, 0.165);
  const colRidgeAcc = packRgba(acc, 0.135);
  const colRidgeSh = packRgba(fg, 0.115);
  const colFoamHi = packRgba(fg, 0.125);
  const colFoamAcc = packRgba(acc, 0.095);
  const colFoamMid = packRgba(fg, 0.085);
  const colSwellHi = packRgba(acc, 0.072);
  const colSwellLo = packRgba(acc, 0.034);

  const uScale = 16.0 / W;
  const p1 = phase;
  const p2 = phase * 0.62;

  for (let y = 0; y < H; y++) {
    const v = vCache[y];
    const rowOff = y * W;
    for (let x = 0; x < W; x++) {
      const i = rowOff + x;
      const u = x * uScale;
      const wp = warp[i];
      const w1 = Math.sin(v * 2.15 + u * 0.32 + wp - p1);
      const w2 = Math.sin(v * 1.40 - u * 0.52 + wp * 0.8 + p2);
      const raw = 0.54 * w1 + 0.32 * w2 + 0.14 * w3[i];
      const norm = Math.max(0, (raw + 1) * 0.5);
      field[i] = norm * norm;
    }
  }

  for (let y = 1; y < H - 1; y++) {
    const rowOff = y * W;
    const bRow = BAYER_4X4[y & 3];
    for (let x = 0; x < W; x++) {
      const i = rowOff + x;
      const bayer = bRow[x & 3];
      const crest = field[i];
      const isRidgePeak = crest > 0.54 && crest >= field[i - W] && crest >= field[i + W];
      const fCell = foamCell[i];
      const fPatch = foamPatch[i];

      if (isRidgePeak && fPatch > 0.38) {
        buf32[i] = fPatch > 0.48 ? colRidgeHi : colRidgeAcc;
        if (fPatch > 0.52 && bayer < 0.65) {
          buf32[i + W] = colRidgeSh;
        }
      } else if (crest > 0.68 && fPatch > 0.44) {
        if (fCell * 1.05 > bayer * 0.75 + 0.18) {
          buf32[i] = colFoamHi;
        } else if (bayer < 0.5) {
          buf32[i] = colFoamAcc;
        }
      } else if (crest > 0.52 && fPatch > 0.46 && fCell * 0.92 > bayer + 0.16) {
        buf32[i] = colFoamMid;
      } else if (crest > bayer * 0.55 + 0.33) {
        buf32[i] = colSwellHi;
      } else if (crest > bayer * 0.65 + 0.19) {
        buf32[i] = colSwellLo;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
