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
npm run e2e                          # browser console e2e (tests/e2e/console.e2e.mjs)
hugo server                          # local dev server with live reload
hugo --minify                        # production build (as CI does it; set HUGO_ENVIRONMENT=production)
sh scripts/build-resume-pdf.sh       # regenerate static/resume.pdf from scripts/resume-pdf/resume.html
```

There is no bundler or linter — `package.json` exists only for tsc and the test scripts,
and Hugo's asset pipeline does the JS concat/minify/fingerprint. Hugo **extended** is
required; CI pins `0.163.3`.

## CI/CD

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
  - `tui-parse.js` — pure path/command resolution (`segments`/`normalize`/`resolve`/
    `matchPost`/`completions`), no DOM. Paths resolved by a **segment stack** (split on `/`,
    drop `.`/empty, `~` re-anchors, `..` pops), not regex.
  - `tui-game.js` — wireframe-3D asteroids; the math core `TUIGameCore` (geometry,
    projection, collision) is DOM-free and tested, while `TUIGame.start` wires it to a canvas.
  - `tui.js` — the main terminal UI (DOM rendering, command dispatch, nav stack, views).
  - Pure modules use guarded `module.exports` so tests `require()` them under Node while the
    browser gets the global.
- `tests/` — `tui-parse.test.js`, `tui-game.test.js`; test the pure cores only (no DOM/jsdom).
- `static/` — `resume.pdf`, `og-image.png`, `favicon.svg`, CSS palette/heading files.
- `scripts/` — the resume-PDF build helper.

## Conventions & gotchas

- **Strict CSP** lives in `layouts/partials/extended_head.html`:
  `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' https://raw.githubusercontent.com/matt-w-horn/; connect-src 'self';
  base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'`. Keep JS external
  and same-origin; cross-host images must use the allowed GitHub-raw path.
  `frame-ancestors`/HSTS/COOP are intentionally omitted — they need real response headers,
  which GitHub Pages can't set.
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
