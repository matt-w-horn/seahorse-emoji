// The game's whole color family is derived from four CSS custom properties, so
// switching the site theme restyles the game with no work. The derivation is
// pure and tested; readPalette and watchTheme are the only parts that touch
// the DOM.

import type { RGB, Palette } from './types.ts';

export function hexToRgb(hex: string): RGB {
  let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  if (h.length === 3) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [128, 128, 128];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(c: RGB): string {
  return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function luma(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function rotateHue(c: RGB, deg: number): RGB {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  h = ((h + deg / 360) % 1 + 1) % 1;
  if (s === 0) {
    const gray = Math.round(l * 255);
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
  const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p2 = 2 * l - q2;
  return [
    Math.round(chan(p2, q2, h + 1 / 3) * 255),
    Math.round(chan(p2, q2, h) * 255),
    Math.round(chan(p2, q2, h - 1 / 3) * 255),
  ];
}

const SIZE_HUES = [0, -45, -95];      // big -> small: accent -> hotter
const KIND_HUES = [90, -60, -120];    // shield / rapid / triple

export interface PaletteSource {
  fg: string; bg: string; accent: string; dim: string; font: string;
  bgC: RGB; fgC: RGB; acC: RGB; dimC: RGB;
}

/* Every hue is a rotation of the theme accent, so the whole family restyles
   together. Runs once per theme change, never per frame. */
export function derivePalette(src: PaletteSource): Palette {
  const light = luma(src.bgC) > 140;
  const toward: RGB = light ? [0, 0, 0] : [255, 255, 255];
  const hostileC = rotateHue(src.acC, 150);

  const sizeCols: string[] = [], sizeBright: string[] = [], ramps: string[][] = [];
  for (let s = 0; s < 3; s++) {
    const hueC = rotateHue(src.acC, SIZE_HUES[s]);
    sizeCols.push(rgbToHex(hueC));
    sizeBright.push(rgbToHex(mixRgb(hueC, toward, 0.45)));
    const rr: string[] = [];
    for (let i = 0; i < 8; i++) rr.push(rgbToHex(mixRgb(src.dimC, hueC, i / 7)));
    ramps.push(rr);
  }

  const kindCols: string[] = [];
  for (let s = 0; s < 3; s++) kindCols.push(rgbToHex(mixRgb(rotateHue(src.acC, KIND_HUES[s]), toward, 0.45)));

  const acB = mixRgb(src.acC, toward, 0.45);
  const tierCols: string[] = [], waveCols: string[] = [];
  for (let s = 0; s < 5; s++) tierCols.push(rgbToHex(rotateHue(acB, -30 * s)));
  for (let s = 0; s < 8; s++) waveCols.push(rgbToHex(rotateHue(acB, 45 * s)));

  return {
    bg: src.bg, fg: src.fg, accent: src.accent, dim: src.dim, font: src.font,
    bgC: src.bgC, fgC: src.fgC, accentC: src.acC, dimC: src.dimC,
    light: light,
    acBright: rgbToHex(acB),
    hostile: rgbToHex(hostileC),
    hostileHot: rgbToHex(mixRgb(hostileC, toward, 0.45)),
    sizeCols: sizeCols, sizeBright: sizeBright, ramps: ramps,
    kindCols: kindCols, tierCols: tierCols, waveCols: waveCols,
  };
}

/* The canvas context is the CSS color parser: assigning to fillStyle and
   reading it back normalizes any color notation the theme might use.
   `--dim` is a color-mix(), and Chrome normalizes those to color(srgb r g b)
   with 0..1 components rather than to rgb() or a hex, so that form has to be
   handled or every dim-coloured thing silently falls back to mid grey. */
function cssToRgb(ctx: CanvasRenderingContext2D, c: string): RGB {
  ctx.fillStyle = '#808080';
  ctx.fillStyle = c;
  const s = String(ctx.fillStyle);
  if (s.charAt(0) === '#') return hexToRgb(s);
  const srgb = /color\(srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/.exec(s);
  if (srgb) {
    return [
      Math.max(0, Math.min(255, Math.round(parseFloat(srgb[1]) * 255))),
      Math.max(0, Math.min(255, Math.round(parseFloat(srgb[2]) * 255))),
      Math.max(0, Math.min(255, Math.round(parseFloat(srgb[3]) * 255))),
    ];
  }
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    return [Math.round(parseFloat(parts[0])), Math.round(parseFloat(parts[1])), Math.round(parseFloat(parts[2]))];
  }
  return [128, 128, 128];
}

export function readPalette(ctx: CanvasRenderingContext2D): Palette {
  const cs = getComputedStyle(document.documentElement);
  const fg = (cs.getPropertyValue('--foreground') || '#ebdbb2').trim();
  const bg = (cs.getPropertyValue('--background') || '#1d2021').trim();
  const accent = (cs.getPropertyValue('--accent') || '#8ec07c').trim();
  const dim = (cs.getPropertyValue('--dim') || fg).trim();
  return derivePalette({
    fg: fg, bg: bg, accent: accent, dim: dim,
    font: getComputedStyle(document.body).fontFamily,
    bgC: cssToRgb(ctx, bg), fgC: cssToRgb(ctx, fg), acC: cssToRgb(ctx, accent), dimC: cssToRgb(ctx, dim),
  });
}

/* The theme is a class on <html>, so a class change is the only signal. */
export function watchTheme(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return function () { mo.disconnect(); };
}
