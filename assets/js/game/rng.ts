// A seeded generator, so a run replays exactly. The old code called
// Math.random directly, which meant nothing above the level of a single spawn
// function could be tested: same inputs, different rocks. mulberry32 is chosen
// for being four lines and having no state beyond one uint32.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
