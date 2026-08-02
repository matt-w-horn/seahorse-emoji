// Tests for the color helpers and the derived palette.
// Run: node --experimental-strip-types --test tests/*.test.ts
import test from 'node:test';
import assert from 'node:assert';
import {
  hexToRgb, rgbToHex, mixRgb, rotateHue, luma, derivePalette,
} from '../assets/js/game/palette.ts';

test('color helpers: hex round-trip, mix midpoint, hue rotation, luma ordering', () => {
  assert.deepEqual(hexToRgb('#8ec07c'), [142, 192, 124]);
  assert.deepEqual(hexToRgb('#8ec07g'), [128, 128, 128], 'trailing non-hex char falls back to gray');
  assert.equal(rgbToHex([142, 192, 124]), '#8ec07c');
  assert.deepEqual(mixRgb([0, 0, 0], [255, 255, 255], 0.5), [128, 128, 128]);
  const cyan = rotateHue([255, 0, 0], 180);
  assert.ok(cyan[0] < 10 && cyan[1] > 245 && cyan[2] > 245, 'red rotated 180deg is cyan');
  const back = rotateHue(rotateHue([142, 192, 124], 90), -90);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - [142, 192, 124][i]) <= 2, 'rotation round-trips');
  assert.ok(luma([0, 0, 0]) < luma([128, 128, 128]));
  assert.ok(luma([128, 128, 128]) < luma([255, 255, 255]));
});

const gruvbox = {
  fg: '#ebdbb2', bg: '#1d2021', accent: '#8ec07c', dim: '#928374', font: 'monospace',
  bgC: [29, 32, 33] as [number, number, number],
  acC: [142, 192, 124] as [number, number, number],
  dimC: [146, 131, 116] as [number, number, number],
  fgC: [235, 219, 178] as [number, number, number],
};

test('derivePalette: full color family, every entry a valid hex', () => {
  const p = derivePalette(gruvbox);
  assert.equal(p.sizeCols.length, 3);
  assert.equal(p.sizeBright.length, 3);
  assert.equal(p.kindCols.length, 3);
  assert.equal(p.tierCols.length, 5);
  assert.equal(p.waveCols.length, 8);
  assert.equal(p.ramps.length, 3);
  for (const ramp of p.ramps) assert.equal(ramp.length, 8, 'eight depth steps per size class');
  const every = [
    ...p.sizeCols, ...p.sizeBright, ...p.kindCols, ...p.tierCols, ...p.waveCols,
    ...p.ramps.flat(), p.acBright, p.hostile, p.hostileHot,
  ];
  for (const c of every) assert.match(c, /^#[0-9a-f]{6}$/, c + ' is a hex color');
});

test('derivePalette: dark theme is not light, and the ramp runs dim -> hue', () => {
  const p = derivePalette(gruvbox);
  assert.equal(p.light, false, 'gruvbox dark background');
  for (let s = 0; s < 3; s++) {
    assert.equal(p.ramps[s][0], rgbToHex(gruvbox.dimC), 'ramp starts at the dim color');
    assert.equal(p.ramps[s][7], p.sizeCols[s], 'ramp ends at that size class hue');
  }
});

test('derivePalette: a light background flips the light flag', () => {
  const p = derivePalette({ ...gruvbox, bg: '#fbf1c7', bgC: [251, 241, 199] });
  assert.equal(p.light, true);
});

test('derivePalette: the hostile hue is a rotation away from the accent', () => {
  const p = derivePalette(gruvbox);
  assert.notEqual(p.hostile, p.sizeCols[0], 'hunters do not share the rock color');
  assert.deepEqual(hexToRgb(p.hostile), rotateHue(gruvbox.acC, 150));
});
