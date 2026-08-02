// Tests for the input layer: live DOM events collapsed into one Intent.
// Run: node --experimental-strip-types --test tests/*.test.ts
//
// input.ts is the one game module that needs a DOM, so it gets the smallest one
// that satisfies it: three objects with addEventListener/removeEventListener and
// a clock. That is cheap enough to be worth it, because the latch behaviour here
// is exactly the kind that looks right and silently drops a keypress.
import test from 'node:test';
import assert from 'node:assert';

interface Listener { (e: unknown): void }

class FakeTarget {
  handlers: Record<string, Listener[]> = {};
  addEventListener(type: string, fn: Listener) {
    (this.handlers[type] ||= []).push(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    this.handlers[type] = (this.handlers[type] || []).filter((h) => h !== fn);
  }
  emit(type: string, e: Record<string, unknown> = {}) {
    for (const h of [...(this.handlers[type] || [])]) h(e);
  }
  count() { return Object.values(this.handlers).reduce((n, a) => n + a.length, 0); }
}

const win = new FakeTarget();
const doc = new FakeTarget();
const canvas = new FakeTarget();
let now = 0;

// installed before the module under test is imported, since it reads them at call time
(globalThis as Record<string, unknown>).window = win;
(globalThis as Record<string, unknown>).document = doc;
(globalThis as Record<string, unknown>).performance = { now: () => now };

const { createInput } = await import('../assets/js/game/input.ts');

function fresh(playing = true) {
  win.handlers = {}; doc.handlers = {}; canvas.handlers = {};
  now = 0;
  const input = createInput(canvas as unknown as HTMLCanvasElement, {
    isPlaying: () => playing,
    onToggleSound: () => { muted = !muted; },
    camPos: () => ({ x: 100, y: -50 }),
  });
  now = 1000;                       // past the 250ms launch-keypress swallow
  return input;
}
let muted = false;

test('a press and release inside one frame still fires', () => {
  const input = fresh();
  // the whole point: polling held state alone loses this, because by the time
  // the frame samples input the key is already back up
  win.emit('keydown', { key: ' ' });
  win.emit('keyup', { key: ' ' });
  assert.equal(input.read().fire, true, 'the tap survives to the next read');
  assert.equal(input.read().fire, false, 'and is consumed exactly once');
});

test('a held key keeps firing across frames', () => {
  const input = fresh();
  win.emit('keydown', { key: ' ' });
  assert.equal(input.read().fire, true);
  assert.equal(input.read().fire, true, 'still down, still firing');
  win.emit('keyup', { key: ' ' });
  assert.equal(input.read().fire, false);
});

test('arrows report as held state, not as latches', () => {
  const input = fresh();
  win.emit('keydown', { key: 'ArrowLeft' });
  assert.deepEqual(
    (({ left, right, up, down }) => ({ left, right, up, down }))(input.read()),
    { left: true, right: false, up: false, down: false },
  );
  win.emit('keyup', { key: 'ArrowLeft' });
  assert.equal(input.read().left, false);
});

test('keys typed into the prompt belong to the prompt', () => {
  const input = fresh();
  // the shell keeps its input editable while the game is mounted, so a space
  // typed there must not fire and an m must not mute
  const before = muted;
  win.emit('keydown', { key: ' ', target: { tagName: 'INPUT' } });
  win.emit('keydown', { key: 'm', target: { tagName: 'INPUT' } });
  assert.equal(input.read().fire, false);
  assert.equal(muted, before, 'm in the prompt does not toggle sound');
});

test('the keypress that launched the game is swallowed', () => {
  win.handlers = {}; doc.handlers = {}; canvas.handlers = {};
  now = 0;
  const input = createInput(canvas as unknown as HTMLCanvasElement, {
    isPlaying: () => false, onToggleSound: () => {}, camPos: () => ({ x: 0, y: 0 }),
  });
  now = 100;                        // inside the 250ms window
  win.emit('keydown', { key: 'Enter' });
  assert.equal(input.read().start, false, 'the enter that ran "play" does not also start a run');
  now = 400;                        // past it
  win.emit('keydown', { key: 'Enter' });
  assert.equal(input.read().start, true);
});

test('a drag anchors to the ship, and a tap is also a shot', () => {
  const input = fresh();
  canvas.emit('pointerdown', { clientX: 200, clientY: 200 });
  const first = input.read();
  assert.deepEqual(first.drag, { x: 100, y: -50 }, 'anchored where the ship is, not at the origin');
  assert.equal(first.fire, true, 'a tap fires even if released before the next frame');

  canvas.emit('pointermove', { clientX: 210, clientY: 190 });
  // 2.4 world units per pointer pixel
  assert.deepEqual(input.read().drag, { x: 100 + 24, y: -50 - 24 });

  win.emit('pointerup', {});
  assert.equal(input.read().drag, null);
});

test('a tap that starts a run does not also drag', () => {
  const input = fresh(false);
  canvas.emit('pointerdown', { clientX: 10, clientY: 10 });
  const i = input.read();
  assert.equal(i.start, true);
  assert.equal(i.drag, null, 'otherwise the ship jumps on the first frame of a new run');
});

test('losing focus drops every held key and latch', () => {
  const input = fresh();
  win.emit('keydown', { key: ' ' });
  win.emit('keydown', { key: 'ArrowLeft' });
  win.emit('blur', {});
  const i = input.read();
  assert.equal(i.fire, false, 'a latched shot does not survive a tab-away');
  assert.equal(i.left, false);
});

test('clearDrag ends a held drag', () => {
  const input = fresh();
  canvas.emit('pointerdown', { clientX: 200, clientY: 200 });
  input.read();
  input.clearDrag();
  assert.equal(input.read().drag, null);
  // and a later move does not resurrect it without a fresh press
  canvas.emit('pointermove', { clientX: 260, clientY: 200 });
  assert.equal(input.read().drag, null);
});

test('dispose removes every listener it added', () => {
  const input = fresh();
  assert.ok(win.count() + doc.count() + canvas.count() > 0);
  input.dispose();
  assert.equal(win.count() + doc.count() + canvas.count(), 0);
});
