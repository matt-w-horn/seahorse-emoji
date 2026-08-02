// start() wires the pieces together and owns the frame loop and teardown.
// Everything it touches is replaceable behind an interface; this file is the
// only place that knows all of them exist.
//
// One canvas, one call: teardown loses the WebGL context, and a canvas whose
// context was lost that way will not hand out another. tui.ts creates a fresh
// <canvas> on every entry to the game, so this holds; calling start() twice on
// the same element would not.

import { createSim } from './sim.ts';
import { mulberry32 } from './rng.ts';
import { createRenderer } from './render.ts';
import { createInput } from './input.ts';
import { createHud } from './hud.ts';
import { readPalette, watchTheme } from './palette.ts';
import { sfx, isSoundOn, toggleSound, suspendAudio } from './audio.ts';
import type { GameOpts, GameHandle, Palette } from './types.ts';

export function start(canvas: HTMLCanvasElement, opts: GameOpts): GameHandle {
  const reduced = !!opts.reduced;
  const isActive = opts.isActive || (() => true);
  const parent = canvas.parentElement;
  if (!parent) throw new Error('game canvas needs a parent to size against');

  /* Two generators, not one. They were briefly the same object, which quietly
     made the renderer an input to the rules: the starfield alone pulls ~880
     values at startup and screen shake pulls two per frame, so changing the
     shake or the debris count shifted the stream the simulation then used for
     rock positions and pickup drops. The isolation the module split is for only
     holds if the randomness is separate too. */
  const seed = (Date.now() ^ 0x9e3779b9) >>> 0;

  const renderer = createRenderer(canvas, { reduced, rng: mulberry32(seed ^ 0x5bf03635) });
  if (!renderer) throw new Error('WebGL unavailable');   // tui.ts turns this into gameFailed()

  const sim = createSim(mulberry32(seed));

  // a scratch 2D context is the CSS color parser: assigning any notation to
  // fillStyle and reading it back normalizes it. The game canvas is WebGL now,
  // so it cannot supply one.
  const parser = document.createElement('canvas').getContext('2d');
  if (!parser) throw new Error('no 2d context for color parsing');

  let pal: Palette = readPalette(parser);
  renderer.setPalette(pal);

  const touch = 'ontouchstart' in window;
  const hud = createHud(parent, {
    touch,
    isSoundOn,
    onToggleSound: () => { toggleSound(); if (!raf) frameOnce(); },
  });

  const input = createInput(canvas, {
    isPlaying: () => sim.state.mode === 'playing',
    onToggleSound: () => { toggleSound(); if (!raf) frameOnce(); },
    camPos: () => ({ x: sim.state.cam.x, y: sim.state.cam.y }),
  });

  // Declared before fit(), which runs during setup and paints a first frame
  // through frameOnce(); reading these from further down the file is a
  // temporal dead zone error, and tui.ts's catch turns it into a bare "the
  // game failed to load" with the cause swallowed.
  let raf = 0, stopped = false;
  let lastT = performance.now();

  let W = 300, H = 200;
  function fit() {
    W = Math.max(60, parent!.clientWidth);
    H = Math.max(60, parent!.clientHeight);
    renderer!.fit(W, H, window.devicePixelRatio || 1);
    if (!raf) frameOnce();
  }
  const ro = new ResizeObserver(fit);
  ro.observe(parent);
  fit();

  const unwatchTheme = watchTheme(() => {
    pal = readPalette(parser!);
    renderer!.setPalette(pal);
    if (!raf) frameOnce();      // restyle still frames too
  });

  /* sound is the one thing the simulation cannot say for itself: events carry
     what happened, and this decides what it sounds like */
  function speak(events: ReturnType<typeof sim.drain>) {
    for (const e of events) {
      switch (e.kind) {
        case 'fired': sfx.fire(); break;
        case 'rockKilled': sfx.boom(e.size); break;
        case 'hunterKilled': sfx.hunterDown(); break;
        case 'grazed': sfx.graze(); break;
        case 'pickupTaken': sfx.pickup(); break;
        case 'shieldLost': sfx.shieldDown(); break;
        case 'lifeLost': sfx.death(); break;
        case 'waveStart': sfx.wave(); break;
      }
    }
  }

  function advance(dt: number) {
    const intent = input.read();
    // substeps of <=25ms so a slow machine drops frames instead of dilating
    // game time, and fast bullets cannot tunnel through rocks
    const n = dt > 0.025 ? Math.min(4, Math.ceil(dt / 0.025)) : 1;
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      sim.step(h, intent);
      const events = sim.drain();
      if (events.length) {
        renderer!.handle(events, sim.state);
        hud.handle(events, sim.state, pal);
        speak(events);
        /* A held drag would snap the camera straight back to where it died.
           Clearing it on the input alone is not enough: `intent` was captured
           before the substep loop, so a frame slower than 25ms (n > 1, exactly
           the loaded-phone case where drags happen) would re-apply the stale
           target on the next substep and silently undo the recentre. A shield
           loss is deliberately not in this list; it does not recentre. */
        for (const e of events) {
          if (e.kind === 'lifeLost' || e.kind === 'gameOver') {
            input.clearDrag();
            intent.drag = null;
          }
        }
      }
    }
    renderer!.step(dt, sim.state);
  }

  function paint(dt: number) {
    renderer!.draw(sim.state, dt);
    hud.update(sim.state, pal, dt, W, H, renderer!.flash());
  }

  // a still frame for reduced motion and for resize/theme changes while paused
  function frameOnce() {
    if (stopped) return;
    paint(0);
  }

  function needsLoop() { return sim.state.mode === 'playing' || !reduced; }

  function frame(now: number) {
    raf = 0;
    if (stopped) return;
    if (!isActive()) { stop(); return; }
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    advance(dt);
    paint(dt);
    if (needsLoop()) raf = requestAnimationFrame(frame);
  }

  function ensureLoop() {
    lastT = performance.now();
    if (!raf && !stopped) raf = requestAnimationFrame(frame);
  }

  /* reduced motion: no rAF while idle, but a keypress or tap that starts a run
     has to be seen, so input is polled on the events that can carry one */
  const nudge = () => {
    if (stopped) return;
    if (!raf) {
      advance(0);
      paint(0);
      if (needsLoop()) ensureLoop();
    }
  };
  if (reduced) {
    window.addEventListener('keyup', nudge);
    canvas.addEventListener('pointerup', nudge);
  }

  paint(0);
  if (needsLoop()) ensureLoop();

  function stop() {
    if (stopped) return;
    stopped = true;
    if (reduced) {
      window.removeEventListener('keyup', nudge);
      canvas.removeEventListener('pointerup', nudge);
    }
    input.dispose();
    unwatchTheme();
    ro.disconnect();
    hud.dispose();
    renderer!.dispose();
    suspendAudio();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  return { stop };
}
