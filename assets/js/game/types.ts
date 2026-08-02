// Shared shapes for the game modules. Entities are plain mutable records on
// purpose: the simulation compacts arrays in place and reuses pooled objects,
// so nothing here is a class and nothing allocates on a hot path.

export type Vec3 = [number, number, number];
export type Edge = [number, number];
export type Face = [number, number, number];
export type RGB = [number, number, number];

export interface Projected { x: number; y: number; s: number; }

export interface Rock {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ax: number; ay: number; sx: number; sy: number;
  size: number;
}

export interface Bullet { x: number; y: number; z: number; vx: number; vy: number; vz: number; }

export interface Pickup {
  x: number; y: number; z: number; vz: number;
  ax: number; ay: number; sx: number; sy: number;
  kind: number;                    // 0 shield, 1 rapid, 2 triple
}

export interface Hunter {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ax: number; ay: number;
}

export interface Star { x: number; y: number; z: number; m: number; }

export interface Deb {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  t: number; life: number; col: string;
}

export interface Ring { x: number; y: number; z: number; r: number; vr: number; t: number; life: number; col: string; }
export interface Pop { x: number; y: number; z: number; t: number; life: number; txt: string; col: string; }
export interface Cam { x: number; y: number; vx: number; vy: number; }

export interface Palette {
  bg: string; fg: string; accent: string; dim: string; font: string;
  light: boolean; acBright: string; hostile: string; hostileHot: string;
  sizeCols: string[];    // rock hue per size class (color says score)
  sizeBright: string[];  // the same hues overdriven, for debris/pops/rings
  ramps: string[][];     // per-size depth ramp, dim -> that size's hue
  kindCols: string[];    // pickup hue per kind (shield/rapid/triple)
  tierCols: string[];    // combo tiers: bullets and reticle heat up
  waveCols: string[];    // the wave banner cycles hue
}

export type Mode = 'attract' | 'playing' | 'over';

/* What the simulation reads each step. input.ts produces it from live
   listeners; a test produces it from a literal, which is the whole point of
   the split. */
export interface Intent {
  left: boolean; right: boolean; up: boolean; down: boolean;
  fire: boolean;                          // held: fire() rate-limits internally
  start: boolean;                         // enter or tap on a non-playing screen
  drag: { x: number; y: number } | null;  // absolute camera target from a pointer drag
}

/* What the simulation reports back. Rendering, audio and the HUD subscribe to
   these instead of being called from inside step(), which is what makes the
   simulation testable on its own. */
export type SimEvent =
  | { kind: 'rockKilled'; x: number; y: number; z: number; size: number; points: number }
  | { kind: 'hunterKilled'; x: number; y: number; z: number; points: number }
  | { kind: 'pickupTaken'; x: number; y: number; z: number; which: number }
  | { kind: 'grazed'; x: number; y: number; z: number }
  | { kind: 'shieldLost' }
  | { kind: 'lifeLost' }
  | { kind: 'gameOver'; score: number }
  | { kind: 'waveStart'; level: number }
  | { kind: 'fired' };

export interface GameOpts { reduced?: boolean; isActive?: () => boolean; }
export interface GameHandle { stop: () => void; }
