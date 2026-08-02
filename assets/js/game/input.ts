// Live DOM events collapsed into one Intent the simulation can read. Keeping
// this separate is what lets a test drive a whole run from a literal.

import type { Intent } from './types.ts';

export interface InputOpts {
  isPlaying: () => boolean;
  onToggleSound: () => void;
  inSpeaker: (e: PointerEvent) => boolean;
  // where the ship is right now; a drag is relative to it, so grabbing the
  // screen must not teleport the ship to the middle
  camPos: () => { x: number; y: number };
}

export interface Input {
  read: () => Intent;
  clearDrag: () => void;
  dispose: () => void;
}

// the shell keeps its prompt editable while the game is mounted, so keys typed
// into an editable element are the prompt's, not the game's ("home" must not
// mute on the m, fire on a space, or restart on enter)
function typingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export function createInput(canvas: HTMLCanvasElement, opts: InputOpts): Input {
  const keys: { [k: string]: boolean } = {};
  let startLatch = false;               // consumed by the next read()
  let drag: { x: number; y: number } | null = null;
  let dragFrom: { px: number; py: number; cx: number; cy: number } | null = null;
  const ignoreUntil = performance.now() + 250;   // swallow the key or tap that launched the game

  function onKeyDown(e: KeyboardEvent) {
    if (performance.now() < ignoreUntil || typingTarget(e)) return;
    keys[e.key] = true;
    if (e.key === 'Enter' && !opts.isPlaying()) startLatch = true;
    if (e.key === 'm' || e.key === 'M') opts.onToggleSound();
  }
  function onKeyUp(e: KeyboardEvent) { keys[e.key] = false; }
  function onBlurLike() {
    for (const k in keys) keys[k] = false;
    drag = null; dragFrom = null;
  }

  function onPointerDown(e: PointerEvent) {
    if (performance.now() < ignoreUntil) return;
    if (opts.inSpeaker(e)) { opts.onToggleSound(); return; }
    if (!opts.isPlaying()) { startLatch = true; return; }   // a tap that starts a run must not also drag
    const at = opts.camPos();
    dragFrom = { px: e.clientX, py: e.clientY, cx: at.x, cy: at.y };
    drag = { x: at.x, y: at.y };
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragFrom || !opts.isPlaying()) return;
    // the 2.4 is the pointer-to-world gain: a short thumb swipe has to cross
    // the whole field on a phone
    drag = {
      x: dragFrom.cx + (e.clientX - dragFrom.px) * 2.4,
      y: dragFrom.cy + (e.clientY - dragFrom.py) * 2.4,
    };
  }
  function onPointerUp() { drag = null; dragFrom = null; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlurLike);
  document.addEventListener('visibilitychange', onBlurLike);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  // a drag released off-canvas still has to clear, so this one is on the window
  window.addEventListener('pointerup', onPointerUp);

  function read(): Intent {
    const out: Intent = {
      left: !!keys.ArrowLeft, right: !!keys.ArrowRight,
      up: !!keys.ArrowUp, down: !!keys.ArrowDown,
      fire: !!keys[' '],
      start: startLatch,
      drag: drag,
    };
    startLatch = false;
    return out;
  }

  /* A held drag would snap the camera straight back to where it died, so a
     respawn ends the drag; touching again re-anchors from the new center. */
  function clearDrag() {
    drag = null;
    dragFrom = null;
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlurLike);
    document.removeEventListener('visibilitychange', onBlurLike);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  return { read, clearDrag, dispose };
}
