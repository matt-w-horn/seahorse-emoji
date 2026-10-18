// Unit tests for hourly theme clock, OKLCH conversion, WCAG 2.1 contrast, and
// inspectTheme readout.
// Run: node --experimental-strip-types --test tests/*.test.ts
import test from 'node:test';
import assert from 'node:assert';
import {
  HOURLY_THEMES,
  ALL_THEMES,
  PISTACHIO_THEME,
  themeIndexForHour,
  themeForHour,
  rgbToOklch,
  formatOklch,
  contrastRatio,
  inspectTheme,
  BAYER_4X4,
} from '../assets/js/tui-theme.ts';

test('HOURLY_THEMES covers all 24 hours across 12 non-green stations', () => {
  assert.equal(HOURLY_THEMES.length, 12);
  for (let h = 0; h < 24; h++) {
    const idx = themeIndexForHour(h);
    assert.equal(idx, Math.floor(h / 2));
    const spec = themeForHour(h);
    assert.equal(spec.hours[0], Math.floor(h / 2) * 2);
    assert.equal(spec.hours[1], Math.floor(h / 2) * 2 + 1);
    assert.notEqual(spec.id, 'pistachio');
  }
  // Negative or >23 hour inputs wrap cleanly
  assert.equal(themeIndexForHour(-1), 11);
  assert.equal(themeIndexForHour(24), 0);
});

// Only --foreground on --background is checked here: --dim text measures
// 5.0-6.3:1 and five accents 6.1-6.8:1, so this is not a claim about
// every token.
test('every theme puts foreground text at WCAG AAA contrast (>= 7.0:1)', () => {
  for (const spec of ALL_THEMES) {
    // local-time constructor: seedLabel formats local time, so a UTC instant
    // would change the date in zones at UTC+10 and beyond
    const info = inspectTheme(spec, new Date(2026, 9, 18, 14));
    assert.ok(
      info.contrast >= 7.0,
      `${spec.id} contrast ${info.contrast} should be >= 7.0 (AAA)`,
    );
    assert.match(info.seedLabel, /^2026-10-18T\d{2}:00$/);
    assert.match(formatOklch(info.bgOklch), /^oklch\(\d+% \d+\.\d{2} \d+°\)$/);
    assert.match(formatOklch(info.accOklch), /^oklch\(\d+% \d+\.\d{2} \d+°\)$/);
  }
});

test('rgbToOklch and contrastRatio produce expected perceptual coordinates', () => {
  const black = rgbToOklch([0, 0, 0]);
  const white = rgbToOklch([255, 255, 255]);
  assert.equal(black.l, 0);
  assert.equal(black.c, 0);
  assert.equal(white.l, 100);
  assert.equal(white.c, 0);
  assert.equal(contrastRatio([255, 255, 255], [0, 0, 0]), 21);
  assert.equal(contrastRatio([128, 128, 128], [128, 128, 128]), 1);
});

test('BAYER_4X4 contains all 16 ordered threshold steps in [0, 1)', () => {
  assert.equal(BAYER_4X4.length, 4);
  const seen = new Set<number>();
  for (const row of BAYER_4X4) {
    assert.equal(row.length, 4);
    for (const v of row) {
      assert.ok(v >= 0 && v < 1);
      seen.add(v * 16);
    }
  }
  assert.equal(seen.size, 16);
  assert.equal(PISTACHIO_THEME.cls, 'p-pistachio');
});
