# matthorn.io

[![ci](https://github.com/matt-w-horn/seahorse-emoji/actions/workflows/ci.yml/badge.svg)](https://github.com/matt-w-horn/seahorse-emoji/actions/workflows/ci.yml)
[![deploy](https://github.com/matt-w-horn/seahorse-emoji/actions/workflows/hugo.yml/badge.svg)](https://github.com/matt-w-horn/seahorse-emoji/actions/workflows/hugo.yml)
![license: CC BY-ND 4.0](https://img.shields.io/badge/license-CC%20BY--ND%204.0-blue)

Source for [matthorn.io](https://matthorn.io): a [Hugo](https://gohugo.io/) static site
deployed to GitHub Pages. The repo is named after
["The Seahorse Emoji"](./content/posts/2026-03-27-seahorse-emoji.md), the post it
started as.

The homepage is a hand-written terminal: about 3,100 lines of TypeScript in
`assets/js/` give the site `ls`/`cd`/`cat` navigation, a theme switcher, and a
wireframe-3D asteroids game. The only runtime dependency is
[ogl](https://github.com/oframe/ogl), which draws the game. Every page is also an ordinary Hugo page. The terminal is
progressive enhancement over the server-rendered fallback, inside a strict
`script-src 'self'` CSP with no inline scripts.

## Build and run

Install Hugo **extended** (CI pins 0.163.3) and Node 22.6 or newer: `npm test`
runs TypeScript through `--experimental-strip-types`. Run `npm ci` first: the game
imports `ogl`, and Hugo's esbuild resolves it from `node_modules`, so both
`npm run typecheck` and every `hugo` command need it. The unit tests do not.

```bash
hugo server        # local dev server with live reload
npm test           # unit tests for the terminal's DOM-free cores
npm run typecheck  # tsc --noEmit
npm run e2e        # browser e2e; needs Chrome installed and hugo server running
hugo --minify      # production build, as CI runs it
```

A push to `main` deploys the site.
[`.github/workflows/hugo.yml`](.github/workflows/hugo.yml) runs the tests, builds with
`hugo --minify`, and publishes to GitHub Pages. To regenerate `static/resume.pdf`, run
`sh scripts/build-resume-pdf.sh` (macOS only).

## Layout

- `content/` holds the posts and pages: Markdown with TOML front matter
- `layouts/index.html` is the standalone terminal homepage
- `assets/js/` is the terminal: `tui.ts` (the UI), `tui-parse.ts` (path and
  command resolution, pure), `types.ts` (shared types), and `game/` (the
  asteroids game, with the rules in `sim.ts` and the WebGL renderer in
  `render.ts`); `tui-game.ts` is the entry point Hugo builds into the game chunk
- `tests/` holds unit tests for the pure cores, plus a console e2e check
- `themes/terminal` is the vendored MIT theme behind the ordinary pages

## About

I'm Matt Horn. I've worked in software and security engineering, most of it on identity, access management, resilience and cloud infrastructure; the resume
below has the list. More recently I've been focused on AI/ML infrastructure and its
security problems.

I write here occasionally: essays on security and AI, and once in a while some very
short fiction.

## Posts (newest first)

Also published at [matthorn.io](https://matthorn.io).

- [When a Correct Proof is a Lie: Auditing Intent in Lean](./content/posts/2026-08-01-honesty-gates.md) - August 1, 2026
- [A lesson engine in plain files](./content/posts/2026-07-24-lesson-engine.md) - July 24, 2026
- [This homepage is a terminal](./content/posts/2026-07-05-terminal-homepage.md) - July 5, 2026
- [My receipt printer prints an original artwork every morning](./content/posts/2026-07-04-morningprint.md) - July 4, 2026
- [Security Is Becoming an Epidemiology Problem](./content/posts/2026-04-11-mythos.md) - April 11, 2026
- [The Seahorse Emoji](./content/posts/2026-03-27-seahorse-emoji.md) - March 27, 2026

## Resume

**Software Engineer** | Google | July 2025 - Present

**Member of Technical Staff (L5)** | OpenAI | August 2024 - April 2025

**Senior Software Engineer (L6 / SDE III)** | Amazon Web Services | November 2022 - August 2024

**Staff Software Engineer (IC4)** | Twilio | July 2021 - October 2022

**Software Development Engineer (L5 / SDE II)** | Amazon | July 2019 - July 2021

**Software Engineer (L3, promoted to L4)** | Google | December 2015 - June 2019

**Software Developer** | Trifecta Technologies | December 2014 - December 2015

**Software Developer** | Right Reason Technologies | 2011 - December 2014

**Research Assistant** | The University of Texas at Dallas | June 2012 - August 2012

## Publications

W. E. Wong, T. Gidvani, A. Lopez, R. Gao, and M. Horn, "Evaluating Software Safety Standards: A Systematic Review and Comparison," in *2014 IEEE Eighth International Conference on Software Security and Reliability-Companion*, San Jose, CA, 2014, pp. 78-87. [doi.org/10.1109/SERE-C.2014.25](https://doi.org/10.1109/SERE-C.2014.25)

## Education

**Bachelor of Science, Computer Science** | Muhlenberg College | 2010 - 2014

Minors in Mathematics and Music Theory. Recipient of the Dr. Anthony J. Marino Jr. Award in Computing Science (2013).

## Contact

matt [at] matthorn [dot] io

## Provenance

Everything here (the posts, the resume, all of it) is my personal work,
written on personal time using personal equipment and personal accounts. It is
not affiliated with, sponsored by, or endorsed by Google, Anthropic, or any
past or present employer. Views are my own. Copyright (c) 2026 Matt Horn. See
[NOTICE](NOTICE).
