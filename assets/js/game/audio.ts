// A small synthesized set on a lazily created AudioContext. Nothing is
// fetched, so the strict CSP never sees a request. The context is built on
// first use, which happens inside a user gesture, so the autoplay policy is
// satisfied without asking.
//
// soundOn is module state on purpose: muting persists across games within the
// page session, the same way the best score does.

let soundOn = true;
let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (!soundOn) return null;
  try {
    if (!ac) {
      ac = new AudioContext();
      master = ac.createGain();
      master.gain.value = 0.07;
      master.connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const nd = noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume().catch(function () { /* stay silent */ });
    return ac;
  } catch {
    soundOn = false;
    return null;
  }
}

function blip(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, at?: number): void {
  const au = audio();
  if (!au || !master) return;
  const t = au.currentTime + (at || 0);
  const o = au.createOscillator(), g = au.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.onended = function () { o.disconnect(); g.disconnect(); };   // don't let dead nodes pile up in the graph
  o.start(t); o.stop(t + dur);
}

function whump(dur: number, f0: number, vol: number): void {
  const au = audio();
  if (!au || !master || !noise) return;
  const t = au.currentTime;
  const s = au.createBufferSource();
  s.buffer = noise;
  const f = au.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(60, t + dur);
  const g = au.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.onended = function () { s.disconnect(); f.disconnect(); g.disconnect(); };
  s.start(t); s.stop(t + dur);
}

export const sfx = {
  fire: function () { blip(840, 240, 0.07, 'square', 0.35); },
  boom: function (size: number) { whump(0.5 - size * 0.11, 1500 - size * 350, 1.1); },
  hunterDown: function () { whump(0.45, 2200, 1.0); blip(1200, 200, 0.3, 'sawtooth', 0.3); },
  graze: function () { blip(320, 950, 0.09, 'sine', 0.25); },
  pickup: function () { blip(660, 660, 0.06, 'square', 0.35); blip(990, 990, 0.09, 'square', 0.35, 0.07); },
  shieldDown: function () { blip(240, 80, 0.3, 'sawtooth', 0.5); whump(0.25, 700, 0.7); },
  death: function () { whump(0.9, 1000, 1.3); blip(220, 50, 0.7, 'sawtooth', 0.35); },
  wave: function () { blip(440, 440, 0.08, 'square', 0.3); blip(660, 660, 0.12, 'square', 0.3, 0.09); },
};

export function isSoundOn(): boolean { return soundOn; }

export function toggleSound(): boolean {
  soundOn = !soundOn;
  if (!soundOn && ac) ac.suspend().catch(function () { /* already gone */ });
  if (soundOn) blip(660, 660, 0.05, 'square', 0.3);
  return soundOn;
}

/* Unconditional on teardown: a resume() issued by a last-frame effect can
   still be in flight, and suspending an already-suspended context is a no-op. */
export function suspendAudio(): void {
  if (ac) ac.suspend().catch(function () { /* already gone */ });
}
