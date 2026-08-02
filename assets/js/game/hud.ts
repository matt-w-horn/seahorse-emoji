// The HUD, as DOM over the canvas.
//
// Text in WebGL means a glyph atlas and worse output; browser games normally
// put chrome in the DOM and keep only world-space things in the scene, so that
// is what this does. Everything here inherits the terminal's font and theme
// custom properties for nothing, stays crisp at any device pixel ratio, and is
// real selectable text. The 2D renderer spent about 120 lines on fillText and
// re-measured the score string every frame to place the multiplier.
//
// Score pops are the exception and stay world-anchored: they mark where a kill
// happened, so they are projected each frame rather than pinned to a corner.
//
// Nothing here touches innerHTML. The page's CSP carries
// require-trusted-types-for 'script' with a single tui-fragment policy, which
// makes innerHTML a throwing sink; createElement and textContent are not.

import { FOCAL, Z_NEAR } from './sim.ts';
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

    if (playing) {
      score.textContent = 'score ' + state.score + '   wave ' + state.level;
      const m = comboMult(state.chain);
      mult.textContent = m > 1 ? '×' + m : '';
      mult.style.color = pal.tierCols[m - 1];

      let stat = '';
      if (state.shieldUp) stat = 'shield';
      if (state.rapidT > 0) stat += (stat ? ' · ' : '') + 'rapid ' + Math.ceil(state.rapidT);
      if (state.tripleT > 0) stat += (stat ? ' · ' : '') + 'triple ' + Math.ceil(state.tripleT);
      status.textContent = stat;

      // one glyph per life, rebuilt only when the count changes
      const want = String(state.lives);
      if (lives.dataset.n !== want) {
        lives.dataset.n = want;
        lives.textContent = '▲ '.repeat(state.lives).trim();
      }
    } else {
      score.textContent = '';
      mult.textContent = '';
      status.textContent = '';
      lives.textContent = '';
      lives.dataset.n = '';
      midTitle.textContent = state.mode === 'over'
        ? 'GAME OVER · SCORE ' + state.score
        : 'A S T E R O I D S / 3 D';
      midHint1.textContent = opts.touch
        ? 'tap to start · hold to steer and fire'
        : 'enter to start · arrows steer · space fires';
      midHint2.textContent = opts.touch
        ? 'fly through S/R/T crates: shield, rapid, triple'
        : 'S/R/T crates power up · m mutes · esc leaves';
      midBest.textContent = state.best > 0 ? 'best ' + state.best : '';
      midTitle.style.color = pal.accent;
    }

    sound.textContent = opts.isSoundOn() ? '♪' : '♪̸';
    sound.style.color = pal.dim;

    bannerT = Math.max(0, bannerT - dt);
    banner.style.opacity = bannerT > 0 ? String(Math.min(1, bannerT / 0.35)) : '0';

    flashEl.style.opacity = flash > 0 ? String(Math.min(0.6, flash)) : '0';
    flashEl.style.borderColor = pal.fg;

    // project the pops the same way the scene projects everything else
    const cx = w / 2, cy = h / 2;
    let keep = 0;
    for (const p of pops) {
      p.t -= dt;
      if (p.t <= 0) { p.el.remove(); continue; }
      pops[keep++] = p;
      const rel = p.z;
      if (rel <= 1) { p.el.style.opacity = '0'; continue; }
      const s = FOCAL / rel;
      const f = p.t / p.life;
      p.el.style.transform = 'translate(-50%,-50%) translate(' +
        (cx + (p.x - state.cam.x) * s) + 'px,' +
        (cy + (p.y - state.cam.y) * s - (1 - f) * 30) + 'px)';
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
