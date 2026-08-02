// Entry point for the game chunk. Hugo builds this path into a standalone ESM
// bundle (layouts/partials/tui-shell.html) which tui.ts import()s on demand, so
// the filename is load-bearing: the built URL is what
// tests/e2e/console.e2e.mjs matches on.
//
// The game itself lives in ./game/. See game/index.ts for how the pieces are
// wired, and game/sim.ts for the rules.

export { start } from './game/index.ts';
export type { GameOpts, GameHandle } from './game/types.ts';
