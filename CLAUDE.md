# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**matthorn.io** — Matt Horn's personal blog and portfolio: a [Hugo](https://gohugo.io/)
static site deployed to GitHub Pages (repo `matt-w-horn/seahorse-emoji`). Content is a few
essays (security/AI, short fiction) plus a resume, built on the vendored `terminal` theme
(`themes/terminal`, MIT).

The one non-obvious thing: the homepage is a hand-written interactive terminal (TUI) — a
vanilla-JS shell with `ls`/`cd`/`cat` navigation, a theme switcher, and a wireframe-3D
asteroids mini-game. Every page is also reachable as an ordinary Hugo page; the TUI is
progressive enhancement over the server-rendered fallback.

## Commands

```bash
npm test                             # unit tests (node --experimental-strip-types --test tests/*.test.ts)
npm run typecheck                    # tsc --noEmit
npm run e2e                          # browser console e2e (tests/e2e/console.e2e.mjs; MOBILE=1 / TOUCH=1 variants)
                                     # needs a served site; BASE_URL defaults to hugo server's 1313 and fails
                                     # slowly if nothing listens. Against a production build, as CI runs it:
                                     #   hugo --minify && python3 -m http.server 8080 --directory public &
                                     #   BASE_URL=http://127.0.0.1:8080 node tests/e2e/console.e2e.mjs
hugo server                          # local dev server with live reload
hugo --minify                        # production build (as CI does it; set HUGO_ENVIRONMENT=production)
sh scripts/build-resume-pdf.sh       # regenerate static/resume.pdf from scripts/resume-pdf/resume.html
```

There is no bundler or linter — `package.json` exists only for tsc and the test scripts,
and Hugo's asset pipeline does the JS concat/minify/fingerprint. Hugo **extended** is
required; CI pins `0.163.3`.

## CI/CD

`.github/workflows/ci.yml` gates PRs (and re-checks pushes to `main`): `npm ci` →
typecheck → unit tests → `hugo --minify` → a gzip size budget on the game chunk → the
browser e2e three ways against the built site (desktop, `MOBILE=1` phone viewport,
`TOUCH=1` coarse-pointer touch mode). The size budget exists because the game bundles
`ogl`; failing there is meant to make a dependency bump a decision rather than a surprise.

**`npm ci` must run before `hugo --minify`**: Hugo's esbuild resolves the bare `ogl`
import from `node_modules`, so a build without it fails rather than silently omitting
the game.
`.github/workflows/hugo.yml` runs on push to `main`: install Hugo extended 0.163.3 →
`npm ci` → `npm run typecheck` → `npm test` → `hugo --minify` → deploy to GitHub Pages. There is no lint
step. `baseURL` comes from `hugo.toml` (`https://matthorn.io/`), **not** Pages metadata —
the metadata once reported `http` during a cert gap and baked mixed-content asset URLs into
a deploy.

## Architecture

- `content/` — Markdown with **TOML** front matter (`+++ … +++`). Posts are
  `posts/YYYY-MM-DD-slug.md` with `title` / `date` / `author`.
- `layouts/` — site-level overrides of the vendored theme:
  - `index.html` — the standalone TUI homepage. It **deliberately bypasses the theme's
    `baseof`** so the terminal owns the viewport, and hand-rolls its own `<head>` (a copied
    subset of the theme's `head.html` — change both when altering head behavior site-wide).
    It inlines critical CSS, emits post/resume bodies as `<template>` elements, and passes
    structured data to JS via a non-executable
    `<script type="application/json" id="tui-data">` block — which is what keeps the CSP at
    `script-src 'self'` with no inline hashes.
  - `_default/baseof.html` — overrides theme baseof only to add a `<main>` landmark.
  - `partials/extended_head.html` — favicon + the meta-tag CSP.
- `assets/js/` — the TUI, split so the pure cores are node-testable:
  - `tui-parse.ts` — pure path/command resolution (`segments`/`normalize`/`resolve`/
    `matchPost`/`completions`), no DOM. Paths resolved by a **segment stack** (split on `/`,
    drop `.`/empty, `~` re-anchors, `..` pops), not regex.
  - `tui-game.ts` — a two-line barrel. Hugo builds **this path** into the game chunk and
    `tests/e2e/console.e2e.mjs` matches the built URL, so the filename is load-bearing.
  - `game/` — 3D asteroids in a vector-monitor style, on [ogl](https://github.com/oframe/ogl)
    (Unlicense; the imported subset is 14.6 KB gzip built on its own, inside a 26.8 KB
    chunk). Split by **authority**: state that changes
    what the game *does* is in `sim.ts`, state that changes what it *looks like* belongs to
    the renderer, so a rendering bug cannot cost a life.
    - `sim.ts` — the rules and the state machine. No DOM, no ogl, seeded rng. `step()` takes
      an `Intent`; what happened comes back from `drain()` as events. Fully testable.
    - `geometry.ts` / `palette.ts` / `rng.ts` — pure and tested. The palette derives the whole
      colour family from four CSS custom properties, so the theme switcher restyles the game.
    - `render.ts` — the scene. Everything is light on black: three dynamic batches (triangles,
      lines, points) blending **additively**, which is why draw order does not matter.
    - `post.ts` — bright-pass, separable blur, then the CRT composite (barrel, vignette,
      scanlines, edge chromatic aberration). Trails decay per second, not per frame.
    - `hud.ts` — score, wave, lives and attract copy as **DOM** styled by `tui.css`. Never
      `innerHTML`: the CSP's trusted-types policy makes it a throwing sink.
    - `audio.ts` / `input.ts` / `index.ts` — synthesized sfx, DOM events collapsed to one
      `Intent` per frame, and the wiring plus the frame loop.
  - `tui.ts` — the main terminal UI (DOM rendering, command dispatch, nav stack, views).
  - Modules are TypeScript ES modules: Hugo's asset pipeline builds them for the browser,
    and the tests import the pure cores directly under Node (`--experimental-strip-types`).
- `tests/` — `tui-parse.test.ts`, `game-sim.test.ts`, `game-geometry.test.ts`,
  `game-palette.test.ts`; pure cores only, no DOM/jsdom. `game-sim.test.ts` carries a
  **recorded seed-42 replay**: an autopilot flies at the nearest rock for 30 seconds and the
  final score, event tally and a position checksum are asserted against recorded values. It
  is a tripwire, not a spec — a deliberate rules change moves it, and re-recording belongs in
  the same commit. Two earlier versions of it caught nothing (a seed compared against itself
  survives any change applied to both runs; a scripted sweep killed one rock in 30 seconds).
- `static/` — `resume.pdf`, `og-image.png`, `favicon.svg`, CSS palette/heading files.
- `scripts/` — the resume-PDF build helper.

## Conventions & gotchas

- **The game needs WebGL, and headless Chrome does not give it away.** `--disable-gpu`
  leaves no WebGL at all unless `--enable-unsafe-swiftshader` is also passed, which
  `tests/e2e/console.e2e.mjs` now does. Without it the game fails to start, the shell shows
  its error state, and every assertion that only checks for the *absence* of errors still
  passes. The e2e therefore asserts positively that a context exists and that pressing enter
  advances the simulation. When WebGL is genuinely unavailable in a real browser, `start()`
  throws and `tui.ts`'s existing `gameFailed()` path shows "the game failed to load".
- **Strict CSP** lives in `layouts/partials/extended_head.html`:
  `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' https://raw.githubusercontent.com/matt-w-horn/; connect-src 'self';
  base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'`. Keep JS external
  and same-origin; cross-host images must use the allowed GitHub-raw path.
  `frame-ancestors`/HSTS/COOP are intentionally omitted — they need real response headers,
  which GitHub Pages can't set.
- **Touch-first mode**: on no-hover coarse-pointer devices tui.ts adds `html.touch`
  (same pattern as `html.plain`), which hides the CLI prompt line; menus scroll natively
  instead of locking, and the keys chip becomes the back button (`setKeys` takes a touch
  label; `‹`-prefixed labels are tappable back states).
- `hugo.toml` sets `markup.goldmark.renderer.unsafe = true` because posts embed raw HTML
  (centered `<img>` blocks).
- The homepage `<head>` in `layouts/index.html` is **duplicated** from the theme partial —
  two places to update when changing head behavior.
- **The resume has two sources that must be kept in sync by hand**: `content/resume.md` (the
  page) and `scripts/resume-pdf/resume.html` (the PDF source). The PDF build is macOS-only
  (Chrome path hardcoded to `/Applications/Google Chrome.app`).
- Licensing is mixed: repo *content* is CC BY-ND 4.0 (`LICENSE`/`NOTICE`), the `terminal`
  theme is MIT, and the vendored terminal-css is Unlicense — keep the `NOTICE`
  attributions intact.
- Security reports go through GitHub private vulnerability reporting (`SECURITY.md`), not
  public issues.
- `seahorse-emoji.md` at the repo root is a stale stub pointing at the real post under
  `content/posts/`. `README.md` documents the build first, then carries the site's
  About/resume content below it.
