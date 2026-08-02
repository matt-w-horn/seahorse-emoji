// The HUD, as DOM over the canvas.
//
// Text in WebGL means a glyph atlas and worse output; browser games normally
// put chrome in the DOM and keep only world-space things in the scene, so that
// is what this does. Everything here inherits the terminal's font and theme
// custom properties for nothing, stays crisp at any device pixel ratio, and is
// real selectable text. It replaces about 85 lines of canvas chrome drawing in
// the 2D renderer, including a speaker glyph built from paths and a hit-tested
// box to catch taps on it.
//
// Score pops are the exception and stay world-anchored: they mark where a kill
// happened, so they are projected each frame rather than pinned to a corner.
//
// Nothing here touches innerHTML. The page's CSP carries
// require-trusted-types-for 'script' with a single tui-fragment policy, which
// makes innerHTML a throwing sink; createElement and textContent are not.

import { FOCAL, Z_NEAR } from './sim.ts';
import { project } from './geometry.ts';
import type { SimState } from './sim.ts';
import { comboMult } from './sim.ts';
import type { Palette, SimEvent } from './types.ts';

interface Pop { el: HTMLElement; x: number; y: number; z: number; t: number; life: number; }

export interface Hud {
  handle: (events: SimEvent[], state: SimState, pal: Palette) => void;
  update: (state: SimState, pal: Palette, dt: number, w: number, h: number, flash: number) => void;
  dispose: () => void;
}

export interface HudOpts {
  touch: boolean;
  isSoundOn: () => boolean;
  onToggleSound: () => void;
}

// returns whether it wrote, so callers can skip dependent work too
const setText = (node: HTMLElement, text: string): boolean => {
  if (node.textContent === text) return false;
  node.textContent = text;
  return true;
};

const el = (tag: string, cls: string, parent: HTMLElement): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
};

export function createHud(mount: HTMLElement, opts: HudOpts): Hud {
  const root = el('div', 'ghud', mount);

  const tl = el('div', 'ghud-tl', root);
  const score = el('span', 'ghud-score', tl);
  const mult = el('span', 'ghud-mult', tl);

  const tr = el('div', 'ghud-tr', root);
  const lives = el('span', 'ghud-lives', tr);
  const sound = el('button', 'ghud-sound', tr) as HTMLButtonElement;
  sound.type = 'button';
  sound.setAttribute('aria-label', 'toggle sound');

  const status = el('div', 'ghud-bl', root);
  const mid = el('div', 'ghud-mid', root);
  const midTitle = el('div', 'ghud-title', mid);
  const midHint1 = el('div', 'ghud-hint', mid);
  const midHint2 = el('div', 'ghud-hint', mid);
  const midBest = el('div', 'ghud-hint', mid);
  const banner = el('div', 'ghud-banner', root);
  const flashEl = el('div', 'ghud-flash', root);
  const popLayer = el('div', 'ghud-pops', root);

  const onSound = () => opts.onToggleSound();
  sound.addEventListener('click', onSound);

  const pops: Pop[] = [];
  let bannerT = 0;
  let lastPal: Palette | null = null;

  function pop(x: number, y: number, z: number, text: string, color: string) {
    if (pops.length >= 12) {
      const old = pops.shift();
      if (old) old.el.remove();
    }
    const e = el('span', 'ghud-pop', popLayer);
    e.textContent = text;
    e.style.color = color;
    pops.push({ el: e, x, y, z, t: 0.9, life: 0.9 });
  }

  function handle(events: SimEvent[], state: SimState, pal: Palette) {
    for (const e of events) {
      switch (e.kind) {
        case 'rockKilled':
          pop(e.x, e.y, e.z, '+' + e.points, pal.sizeBright[e.size]);
          break;
        case 'hunterKilled':
          pop(e.x, e.y, e.z, '+' + e.points, pal.hostileHot);
          break;
        case 'grazed':
          pop(e.x, e.y, e.z, '+5', pal.fg);
          break;
        case 'pickupTaken':
          pop(state.cam.x, state.cam.y - 60, Z_NEAR + 140,
            ['shield up', 'rapid fire', 'triple shot'][e.which], pal.kindCols[e.which]);
          break;
        case 'shieldLost':
          pop(state.cam.x, state.cam.y - 60, Z_NEAR + 140, 'shield down', pal.kindCols[0]);
          break;
        case 'waveStart':
          banner.textContent = ('WAVE ' + e.level).split('').join(' ');
          banner.style.color = pal.waveCols[e.level % 8];
          bannerT = 1.2;
          break;
      }
    }
  }

  function update(state: SimState, pal: Palette, dt: number, w: number, h: number, flash: number) {
    const playing = state.mode === 'playing';
    root.classList.toggle('playing', playing);

    // Colours are re-applied when the text changes OR when the theme does.
    // Dirty-checking on text alone would leave stale colours behind after a
    // theme switch, which is a thing this site does mid-game: readPalette
    // returns a fresh object each time, so identity is the signal.
    const themed = pal !== lastPal;
    lastPal = pal;

    if (playing) {
      // Every line here is written only when its text actually changes. All of
      // them are steady for most frames (the score between kills, the status
      // between whole seconds of a countdown), so writing unconditionally
      // means a fresh string and a DOM write 60 times a second for output that
      // did not move.
      const m = comboMult(state.chain);
      const stat = [
        state.shieldUp ? 'shield' : '',
        state.rapidT > 0 ? 'rapid ' + Math.ceil(state.rapidT) : '',
        state.tripleT > 0 ? 'triple ' + Math.ceil(state.tripleT) : '',
      ].filter(Boolean).join(' · ');

      setText(score, 'score ' + state.score + '   wave ' + state.level);
      if (setText(mult, m > 1 ? '×' + m : '') || themed) mult.style.color = pal.tierCols[m - 1];
      setText(status, stat);
      setText(lives, '▲ '.repeat(state.lives).trim());
    } else {
      setText(score, '');
      setText(mult, '');
      setText(status, '');
      setText(lives, '');
      if (setText(midTitle, state.mode === 'over'
        ? 'GAME OVER · SCORE ' + state.score
        : 'A S T E R O I D S / 3 D') || themed) midTitle.style.color = pal.accent;
      setText(midHint1, opts.touch
        ? 'tap to start · hold to steer and fire'
        : 'enter to start · arrows steer · space fires');
      setText(midHint2, opts.touch
        ? 'fly through S/R/T crates: shield, rapid, triple'
        : 'S/R/T crates power up · m mutes · esc leaves');
      setText(midBest, state.best > 0 ? 'best ' + state.best : '');
    }

    /* The glyph stays ♪ either way and CSS strikes it through when muted.
       U+266A followed by a combining long solidus renders inconsistently in
       monospace faces: some drop the stroke, some widen the cell. A class is
       one thing that always draws. */
    const muted = !opts.isSoundOn();
    setText(sound, '♪');
    sound.classList.toggle('muted', muted);
    sound.setAttribute('aria-pressed', String(muted));
    if (themed) sound.style.color = pal.dim;

    bannerT = Math.max(0, bannerT - dt);
    banner.style.opacity = bannerT > 0 ? String(Math.min(1, bannerT / 0.35)) : '0';

    flashEl.style.opacity = flash > 0 ? String(Math.min(0.6, flash)) : '0';
    if (themed) flashEl.style.borderColor = pal.fg;

    /* Pops are world-anchored, so they go through the same project() the scene
       geometry does rather than a second copy of the perspective divide. It
       returns null at or behind the eye, which is the pop's own cull. */
    const cx = w / 2, cy = h / 2;
    let keep = 0;
    for (const p of pops) {
      p.t -= dt;
      if (p.t <= 0) { p.el.remove(); continue; }
      pops[keep++] = p;
      const at = project(p.x - state.cam.x, p.y - state.cam.y, p.z, FOCAL);
      if (!at) { p.el.style.opacity = '0'; continue; }
      const f = p.t / p.life;
      p.el.style.transform = 'translate(-50%,-50%) translate(' +
        (cx + at.x) + 'px,' + (cy + at.y - (1 - f) * 30) + 'px)';
      p.el.style.opacity = String(Math.min(1, f * 2));
    }
    pops.length = keep;
  }

  function dispose() {
    sound.removeEventListener('click', onSound);
    root.remove();
  }

  return { handle, update, dispose };
}
