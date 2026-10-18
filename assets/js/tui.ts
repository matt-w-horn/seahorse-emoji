// The matthorn.io terminal home. Vanilla JS, no dependencies.
// Every document here is also an ordinary page; this is the front door, not a
// gate. The server renders a plain content block inside #screen (for crawlers,
// no-JS visitors, and failed loads); boot replaces it with the terminal.
// Output is DOM-methods only; post/resume content arrives via <template>
// elements Hugo fills at build time.
import { resolve, matchPost, completions, type Resolved } from './tui-parse.ts';
import {
  ALL_THEMES,
  themeIndexForHour,
  inspectTheme,
  formatOklch,
  paintOceanCanvas,
} from './tui-theme.ts';
import type { TuiData, Post, Route } from './types.ts';
import type * as GameModule from './tui-game.ts';
import type { GameHandle } from './tui-game.ts';

declare global {
  interface Window {
    trustedTypes?: {
      createPolicy(name: string, rules: { createHTML: (s: string) => string }): { createHTML: (s: string) => string };
    };
  }
}

// A "doc" view target: a post (Post) or the synthesized resume. Only tpl is
// extra over Post, and it's optional, so any Post is a Doc.
interface Doc { slug: string; title: string; date: string; url: string; contentUrl: string; tpl?: string; }

// One piece of a rendered row: plain text, or a link/button descriptor.
type RowPart = string | { text: string; href?: string; click?: () => void; cls?: string };

// A ps1 path segment: static text, or a clickable crumb.
interface PathSeg { text: string; go?: () => void; }

// A selectable menu (home/posts). paintMenuItems stamps idx and fills rowEls
// so moveMenuSel can restyle rows without a repaint.
interface MenuItem { label: string; note?: string; href?: string; run: () => void; idx?: number; }
interface Menu { sel: number; items: MenuItem[]; rowEls?: (HTMLAnchorElement | HTMLButtonElement)[]; }

// What the screen is showing; ownsKeys hands the keyboard to the view (the game).
interface ViewState {
  name: 'boot' | 'home' | 'posts' | 'help' | 'about' | 'motd' | 'game' | 'doc' | 'lab';
  ownsKeys?: boolean;
}

// A typed command: desc feeds the help list, fn takes the argv tail.
interface Command { desc: string; fn: (args: string[]) => void; }

// The resolve() miss arm; the commands read .name off it after narrowing.
type MissingResolved = Extract<Resolved, { kind: 'missing' }>;

(function () {
  'use strict';

  var dataEl = document.getElementById('tui-data');
  var DATA: TuiData | null = null;
  try { DATA = dataEl ? JSON.parse(dataEl.textContent || 'null') as TuiData : null; } catch (e) { /* boot aborts below */ }
  // These live in the shell markup (tui-shell.html); the DATA guard is the real
  // bail-out. Cast non-null so narrowing survives into the many callbacks.
  var screen = document.getElementById('screen') as HTMLElement;
  var input = document.getElementById('in') as HTMLInputElement;
  var ps1 = document.getElementById('ps1') as HTMLElement;
  var keysChip = document.getElementById('keys-chip') as HTMLElement;
  var pageChip = document.getElementById('page-chip') as HTMLElement;
  var echoEl = document.getElementById('echoline') as HTMLElement;
  var caret = document.getElementById('caret');   // optional; guarded with `if (caret)`
  if (!DATA || !screen || !input) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Touch-first mode: no hover and a coarse pointer means no usable keyboard,
  // so the CLI is dropped. CSS (html.touch) hides the prompt line; here the
  // menus stay natively scrollable and the keys chip becomes the back button.
  var touchUI = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (touchUI) document.documentElement.classList.add('touch');

  // `plain` view (the `plain` command reloads with ?plain): skip booting the
  // terminal entirely, leaving the server-rendered .prejs content on screen and
  // hiding the prompt/chips via CSS. Keeps a no-terminal reading mode reachable
  // now that every URL boots the console by default.
  if (/[?&]plain(?:=|&|$)/.test(location.search)) {
    document.documentElement.classList.add('plain');
    return;
  }

  var POSTS = DATA.posts;
  var SUBTITLE = (DATA.subtitle || 'software and security engineering').toLowerCase();
  var RESUME: Doc | null = DATA.resumeUrl
    ? { slug: 'resume', title: 'resume.md', date: '', url: DATA.resumeUrl, tpl: 'tpl-resume', contentUrl: DATA.resumeContentUrl }
    : null;

  /* ---------- fixed art ---------- */

  var FIG = [
    "            _   _   _                   _",
    " _ __  __ _| |_| |_| |_  ___ _ _ _ _   (_)___",
    "| '  \\/ _` |  _|  _| ' \\/ _ \\ '_| ' \\ _| / _ \\",
    "|_|_|_\\__,_|\\__|\\__|_||_\\___/_| |_||_(_)_\\___/"
  ];

  var STRIPE = '▍ '.repeat(6);

  var POST_LINES = [
    'matthorn.io BIOS 2.6.2026',
    'mem check ............ 640K OK',
    'mount /posts ......... ' + POSTS.length + ' files',
    'mount /resume.md ..... ' + (RESUME ? 'ok' : 'missing'),
    'mount /about.txt ..... ok',
    'attach /dev/arcade ... ok',
    'starting shell'
  ];

  var MOTD_INTRO = 'message of the day, from morningprint:';
  var MOTD = [
    '          ░░░▒▒▒▓▓▓▒▒▒░░░',
    '       ░▒▓▓███████████▓▓▒░',
    '      ▒▓█████████████████▓▒',
    '  ─────────────────────────────',
    '   ≈≈≈  ≈≈≈≈  ≈≈≈≈≈  ≈≈≈≈  ≈≈≈',
    '     ≈≈≈≈  ≈≈≈≈≈≈  ≈≈≈≈≈≈',
    '',
    '  every morning, one original print'
  ];

  /* ---------- element builders ---------- */

  function rowEl(parts: string | RowPart[], cls?: string) {
    var div = document.createElement('div');
    div.className = 'row' + (cls ? ' ' + cls : '');
    if (typeof parts === 'string') parts = [parts];
    parts.forEach(function (part) {
      if (typeof part === 'string') { div.appendChild(document.createTextNode(part)); return; }
      var el: HTMLElement;
      if (part.href) {
        el = document.createElement('a');
        (el as HTMLAnchorElement).href = part.href;
      } else if (part.click) {
        el = document.createElement('a');
        el.setAttribute('href', '#');
        el.addEventListener('click', function (e) { e.preventDefault(); part.click!(); });
      } else {
        el = document.createElement('span');
      }
      if (part.cls) el.className = part.cls;
      el.textContent = part.text;
      div.appendChild(el);
    });
    return div;
  }
  function gapEl() { var d = document.createElement('div'); d.className = 'gap'; return d; }
  function artEl(lines: string[], label?: string) {
    var div = document.createElement('div');
    div.className = 'art';
    div.textContent = lines.join('\n');
    if (label) { div.setAttribute('role', 'img'); div.setAttribute('aria-label', label); }
    else { div.setAttribute('aria-hidden', 'true'); }
    return div;
  }
  function headingEl(text: string) {
    var h = document.createElement('h1');
    h.className = 't-title';
    h.textContent = text;
    return h;
  }
  function clearNode(el: HTMLElement) { while (el.firstChild) el.removeChild(el.firstChild); }

  var contentCache: { [id: string]: DocumentFragment } = {};   // id -> pristine DocumentFragment (cloned per mount)
  var loadSeq = 0;         // stale-async guard: only the newest fetch may inject

  // Our CSP enforces require-trusted-types-for 'script', which blocks the HTML
  // parsers (DOMParser, template.innerHTML) for plain strings. The fetched
  // fragments are our own same-origin Hugo output, so a pass-through policy is
  // safe; the CSP's `trusted-types tui-fragment` restricts creation to this
  // one name. <template> parses inert (scripts don't run, resources don't load
  // until the nodes are adopted into the live tree).
  var htmlPolicy = (window.trustedTypes && window.trustedTypes.createPolicy)
    ? window.trustedTypes.createPolicy('tui-fragment', { createHTML: function (s) { return s; } })
    : null;
  function parseFragment(html: string): DocumentFragment {
    var tpl = document.createElement('template');
    tpl.innerHTML = htmlPolicy ? htmlPolicy.createHTML(html) : html;
    return tpl.content.cloneNode(true) as DocumentFragment;
  }

  // Mount a doc's content into `mount` (already on screen). Inline <template>
  // (the current page's own doc) -> sync; cached -> sync; else fetch the bare
  // fragment lazily. On failure the error row links pageUrl, the doc's own
  // page, which carries the same content inline.
  function loadContent(id: string, url: string, mount: HTMLElement, pageUrl?: string) {
    function fail(what: string) {
      clearNode(mount);
      mount.appendChild(rowEl(pageUrl
        ? ['(' + what + '; ', { text: 'open the page', href: pageUrl }, ')']
        : '(' + what + ')', 'err'));
    }
    var tpl = document.getElementById(id) as HTMLTemplateElement | null;
    if (tpl) { mount.appendChild(tpl.content.cloneNode(true)); return; }
    if (contentCache[id]) { mount.appendChild(contentCache[id].cloneNode(true)); return; }
    if (!url) { fail('missing content'); return; }
    var token = ++loadSeq;
    mount.appendChild(rowEl('loading…', 'dim'));
    fetch(url, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (html) {
        if (token !== loadSeq) return;   // user navigated away mid-flight
        var frag = parseFragment(html);
        contentCache[id] = frag.cloneNode(true) as DocumentFragment;
        clearNode(mount); mount.appendChild(frag);
        updateScrollChip();
      })
      .catch(function () { if (token === loadSeq) fail('content unavailable'); });
  }

  /* ---------- chrome ---------- */

  var activeGame: GameHandle | null = null;   // running engine handle; stopped on any repaint

  function clearScreen() {
    if (activeGame) { activeGame.stop(); activeGame = null; }
    while (screen.firstChild) screen.removeChild(screen.firstChild);
    screen.classList.remove('lock');
    screen.scrollTop = 0;
    setWheel(false);
  }

  function setPath(segs: PathSeg[]) {
    while (ps1.firstChild) ps1.removeChild(ps1.firstChild);
    ps1.appendChild(document.createTextNode('guest@matthorn.io:'));
    segs.forEach(function (s, i) {
      if (i) ps1.appendChild(document.createTextNode('/'));
      if (s.go) {
        var a = document.createElement('a');
        a.setAttribute('href', '#');
        a.textContent = s.text;
        a.addEventListener('click', function (e) { e.preventDefault(); s.go!(); });
        ps1.appendChild(a);
      } else ps1.appendChild(document.createTextNode(s.text));
    });
    var tail = document.createElement('span');
    tail.className = 'tail';
    tail.textContent = '$';
    ps1.appendChild(tail);
    if (caret) { caretBase = input.offsetLeft; placeCaret(); }   // prompt width changed
  }

  // Each view passes its keyboard hint plus a touch variant; a touch label
  // starting with '‹' styles and behaves as the back button (see the keysChip
  // click handler).
  function setKeys(text: string, touchText?: string) {
    var t = touchUI && touchText !== undefined ? touchText : text;
    keysChip.textContent = t;
    keysChip.classList.toggle('tap', touchUI && t.charAt(0) === '‹');
  }
  function setPage(text: string, cls?: string) { pageChip.textContent = text || ''; pageChip.className = 'chip' + (cls ? ' ' + cls : ''); }
  function flash(text: string, cls?: string) { setPage(text, cls || 'acc'); }
  function echo(text: string, cls?: string) { echoEl.textContent = text || ''; echoEl.className = cls === 'err' ? 'err' : ''; }

  /* ---------- routing: the browser history is the source of truth ----------
     Real-page views (home, posts, each post, resume) push an entry with a real
     URL, so the address bar and Back/Forward work. TUI-only views (help/about/
     motd/game) have no server URL: they push with url=null (same pathname) so
     esc/Back still reverse through them without inventing a 404. Every entry's
     state carries {name, slug?, depth}; popstate re-paints from it. */

  var currentRoute: Route | null = null;

  function bySlug(s: string): Post | undefined { return POSTS.filter(function (x) { return x.slug === s; })[0]; }
  function norm(u: string) { return String(u || '').replace(/[?#].*$/, '').replace(/index\.html$/, '').replace(/\/+$/, '') || '/'; }
  function withDepth(r: Route, d: number): Route { return { name: r.name, slug: r.slug, depth: d }; }
  function sameRoute(a: Route | null, b: Route | null) { return !!a && !!b && a.name === b.name && a.slug === b.slug; }

  function urlFor(route: Route) {
    switch (route.name) {
      case 'home':   return DATA!.homeUrl || '/';
      case 'posts':  return DATA!.postsUrl;
      case 'resume': return DATA!.resumeUrl;
      case 'lab':    return DATA!.themeUrl;
      case 'doc':    var p = bySlug(route.slug!); return p ? p.url : null;
      default:       return null;   // help/about/motd/game: keep current URL
    }
  }

  function titleFor(route: Route) {
    var base = DATA!.siteTitle || 'Matt Horn';
    if (route.name === 'doc') { var p = bySlug(route.slug!); return p ? p.title + ' :: ' + base : base; }
    if (route.name === 'resume') return 'Resume :: ' + base;
    if (route.name === 'posts') return 'Posts :: ' + base;
    if (route.name === 'about') return 'About :: ' + base;
    if (route.name === 'lab') return 'Theme Lab :: ' + base;
    return base;   // home, help, motd, game
  }

  // The ONLY paint dispatcher. Never pushes history.
  function render(route: Route) {
    // A route that can't paint (stale history state after a deploy removed the
    // doc/resume) resolves to home; currentRoute reflects what actually paints
    // so the same-route guard and stepBack stay in sync.
    if (route.name === 'doc' && !bySlug(route.slug!)) route = { name: 'home' };
    if (route.name === 'resume' && !RESUME) route = { name: 'home' };
    currentRoute = route;
    document.title = titleFor(route);
    switch (route.name) {
      case 'posts':  paintPosts(); break;
      case 'about':  paintAbout(); break;
      case 'help':   paintHelp();  break;
      case 'motd':   paintMotd();  break;
      case 'game':   paintPlay();  break;
      case 'lab':    paintThemeLab(); break;
      case 'resume': paintDoc(RESUME!); break;
      case 'doc':    paintDoc(bySlug(route.slug!)!); break;
      default:       paintHome();
    }
    if (booted && !touchUI && route.name !== 'game' && (!document.activeElement || document.activeElement === document.body)) {
      input.focus();
      caretBase = input.offsetLeft;
      placeCaret();
    }
  }

  function go(route: Route) {
    if (sameRoute(route, currentRoute)) { render(route); return; }   // repaint, no dup entry
    var depth = ((window.history.state && window.history.state.depth) || 0) + 1;
    window.history.pushState(withDepth(route, depth), '', urlFor(route));
    render(route);
  }

  var traversing = false;   // true between our history.back() and its popstate
  function stepBack() {
    if (traversing) return;   // history.back() is async; don't queue a second before popstate
    var st: Route = window.history.state;
    if (st && st.depth! > 0) { traversing = true; window.history.back(); return; }   // popstate re-paints
    if (currentRoute && currentRoute.name === 'home') { flash('already at ~'); return; }
    // depth 0 and not home: a directly-loaded deep link. Replace this entry with
    // home (don't push) so esc can't ping-pong doc<->home; Back from a deep link
    // leaves the site anyway.
    window.history.replaceState(withDepth({ name: 'home' }, 0), '', DATA!.homeUrl || '/');
    render({ name: 'home' });
  }

  // fresh load / reload only (history.state is null); popstate uses the state.
  function routeFor(path: string): Route {
    var p = norm(path);
    if (p === norm(DATA!.homeUrl || '/')) return { name: 'home' };
    if (p === norm(DATA!.postsUrl)) return { name: 'posts' };
    if (p === norm(DATA!.themeUrl)) return { name: 'lab' };
    if (DATA!.resumeUrl && p === norm(DATA!.resumeUrl)) return { name: 'resume' };
    var hit = POSTS.filter(function (x) { return norm(x.url) === p; })[0];
    return hit ? { name: 'doc', slug: hit.slug } : { name: 'home' };
  }

  // Adapters so the existing paint-function call sites need no changes.
  function routeOfPaint(fn: () => void): Route {
    if (fn === paintPosts) return { name: 'posts' };
    if (fn === paintAbout) return { name: 'about' };
    if (fn === paintHelp)  return { name: 'help' };
    if (fn === paintMotd)  return { name: 'motd' };
    if (fn === paintPlay)  return { name: 'game' };
    if (fn === paintThemeLab) return { name: 'lab' };
    return { name: 'home' };
  }
  function goTo(paintFn: () => void) { go(routeOfPaint(paintFn)); }
  function goBack() { stepBack(); }
  function goHome() { go({ name: 'home' }); }

  /* ---------- views ---------- */

  var view: ViewState = { name: 'boot' };
  var menu: Menu | null = null;
  var menus: { [k: string]: Menu } = {};   // persisted per view so selection survives back-navigation

  function menuItemRow(it: MenuItem, selected: boolean) {
    // real links for real pages (middle/cmd-click works); buttons for TUI-only actions
    var el = it.href ? document.createElement('a') : document.createElement('button');
    if (it.href) (el as HTMLAnchorElement).href = it.href;
    else (el as HTMLButtonElement).type = 'button';
    el.className = 'menurow' + (selected ? ' sel' : '');
    var prefix = document.createElement('span');
    prefix.className = 'sel-mark';
    prefix.textContent = selected ? '❯ ' : '  ';
    el.appendChild(prefix);
    el.appendChild(document.createTextNode(it.label));
    if (it.note) {
      var n = document.createElement('span');
      n.className = 'note';
      n.textContent = '   ' + it.note;
      el.appendChild(n);
    }
    // A hovered or focused row is already on screen, so selecting it must not
    // scroll: scrolling under a resting pointer hovers the next row, which
    // would select and scroll again, down the list.
    function selectThis() {
      if (menu && it.idx !== undefined && menu.sel !== it.idx) moveMenuSel(it.idx - menu.sel, true);
    }
    (el as HTMLElement).addEventListener('mouseenter', function () { if (!touchUI) selectThis(); });
    (el as HTMLElement).addEventListener('focus', selectThis);
    (el as HTMLElement).addEventListener('click', function (e: MouseEvent) {
      if (it.href && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) return; // new tab etc.
      e.preventDefault();
      menu!.sel = it.idx!;
      it.run();
    });
    return el;
  }

  function paintMenuItems() {
    menu!.rowEls = [];
    menu!.items.forEach(function (it, i) {
      it.idx = i;
      var el = menuItemRow(it, i === menu!.sel);
      menu!.rowEls!.push(el);
      screen.appendChild(el);
    });
    if (menu!.rowEls[menu!.sel]) menu!.rowEls[menu!.sel].scrollIntoView({ block: 'nearest' });
  }

  function moveMenuSel(delta: number, noScroll?: boolean) {
    var next = (menu!.sel + delta + menu!.items.length) % menu!.items.length;
    var oldEl = menu!.rowEls![menu!.sel], newEl = menu!.rowEls![next];
    menu!.sel = next;
    if (oldEl) { oldEl.classList.remove('sel'); oldEl.querySelector('.sel-mark')!.textContent = '  '; }
    if (newEl) {
      newEl.classList.add('sel');
      newEl.querySelector('.sel-mark')!.textContent = '❯ ';
      if (!noScroll) newEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function paintHome() {
    view = { name: 'home' };
    menu = menus.home || (menus.home = {
      sel: 0,
      items: [
        { label: 'posts/', note: POSTS.length + ' essays & technical notes', href: DATA!.postsUrl, run: function () { goTo(paintPosts); } },
        { label: 'resume.md', note: 'Google · OpenAI · AWS · Twilio', href: DATA!.resumeUrl || undefined, run: function () { openDoc(RESUME); } },
        { label: 'about.txt', note: 'background & contact', run: function () { goTo(paintAbout); } },
        { label: 'play', note: 'wireframe asteroids', run: function () { goTo(paintPlay); } },
        { label: 'theme', note: 'hourly oklch & color theory lab', href: DATA!.themeUrl, run: function () { goTo(paintThemeLab); } },
        { label: 'help', note: 'commands & shortcuts', run: function () { goTo(paintHelp); } }
      ].filter(function (it) { return it.label !== 'resume.md' || RESUME; })
    });
    clearScreen();
    if (!touchUI) { screen.classList.add('lock'); setWheel(true); }
    setPath([{ text: '~' }]);
    setKeys('arrows or scroll: select · enter: open', 'tap an item to open');
    setPage('');
    screen.appendChild(artEl(FIG, 'matthorn.io'));
    screen.appendChild(rowEl([{ text: SUBTITLE + '  ', cls: 'dim' }, { text: STRIPE, cls: 'acc' }]));
    screen.appendChild(gapEl());
    paintMenuItems();
    screen.appendChild(gapEl());
    screen.appendChild(rowEl(touchUI
      ? 'Tap anything underlined to open it.'
      : 'Use arrows and Enter, click an item, or type a command below.', 'dim'));
    screen.appendChild(gapEl());
    screen.appendChild(rowEl(DATA!.copyright, 'dim'));
  }

  function paintPosts() {
    view = { name: 'posts' };
    menu = menus.posts || (menus.posts = {
      sel: 0,
      items: POSTS.map(function (p): MenuItem {
        return { label: p.slug + '.md', note: p.title, href: p.url, run: function () { openDoc(p); } };
      }).concat([{ label: '..', note: 'back', run: goBack }])
    });
    clearScreen();
    if (!touchUI) { screen.classList.add('lock'); setWheel(true); }
    setPath([{ text: '~', go: goHome }, { text: 'posts' }]);
    setKeys('arrows or scroll: select · enter: open · esc: back', '‹ back');
    setPage('');
    screen.appendChild(rowEl('~/posts', 't-title'));
    screen.appendChild(gapEl());
    paintMenuItems();
    if (touchUI) {
      screen.appendChild(gapEl());
      screen.appendChild(rowEl('Posts open in a scrollable reader; ‹ back (bottom left) returns.', 'dim'));
    }
  }

  function paintHelp() {
    view = { name: 'help' }; menu = null;
    clearScreen();
    setPath([{ text: '~', go: goHome }]);
    setKeys('esc: back', '‹ back');
    setPage('');
    screen.appendChild(rowEl('commands', 't-title'));
    screen.appendChild(gapEl());
    Object.keys(commands).forEach(function (name) {
      screen.appendChild(rowEl(['  ', { text: name, click: makeRun(name) }, Array(Math.max(1, 12 - name.length)).join(' ') + ' ' + commands[name].desc], 'cmd'));
    });
    screen.appendChild(gapEl());
    if (touchUI) {
      screen.appendChild(rowEl('Tap a command above to run it; ‹ back (bottom left) returns.', 'dim'));
    } else {
      screen.appendChild(rowEl('Shortcuts: Esc goes back, Space scrolls a page, Tab autocompletes.', 'dim'));
    }
    screen.appendChild(rowEl('Prefer a standard webpage? Run plain (or add ?plain to any URL).', 'dim'));
  }

  function paintAbout() {
    view = { name: 'about' }; menu = null;
    clearScreen();
    setPath([{ text: '~', go: goHome }, { text: 'about.txt' }]);
    setKeys('esc: back', '‹ back');
    setPage('');
    screen.appendChild(rowEl('about.txt', 't-title'));
    var mount = document.createElement('div');
    screen.appendChild(mount);
    loadContent('tpl-about', DATA!.aboutContentUrl, mount);
    screen.appendChild(rowEl(DATA!.copyright, 'dim'));
  }

  function paintMotd() {
    view = { name: 'motd' }; menu = null;
    clearScreen();
    setPath([{ text: '~', go: goHome }]);
    setKeys('esc: back', '‹ back');
    setPage('');
    screen.appendChild(rowEl(MOTD_INTRO, 'dim'));
    screen.appendChild(artEl(MOTD, 'a sunrise over waves, drawn in block characters'));
    screen.appendChild(gapEl());
    screen.appendChild(rowEl('My receipt printer wakes up before I do and prints one original artwork, themed to the day. This sunrise is its house style.', 'wrapcol'));
    screen.appendChild(gapEl());
    var post = findPost('morningprint');
    if (post) screen.appendChild(rowEl(['the full story:  ', { text: post.slug + '.md', click: function () { openDoc(post); } }], 'motd-kv'));
    screen.appendChild(rowEl(['the code:        ', { text: 'github.com/matt-w-horn/morningprint', href: 'https://github.com/matt-w-horn/morningprint' }], 'motd-kv'));
  }

  var gameMod: typeof GameModule | null = null;
  var gameLoad: Promise<typeof GameModule> | null = null;   // load-once (lazy)
  function loadGame(): Promise<typeof GameModule> {
    if (gameMod) return Promise.resolve(gameMod);
    if (!gameLoad) {
      // import() with a same-origin string is governed by script-src 'self'
      // and is NOT a Trusted-Types sink (unlike script.src). The URL is a
      // runtime value, so esbuild leaves it as a real dynamic import.
      gameLoad = (import(DATA!.gameScriptUrl) as Promise<typeof GameModule>)
        .then(function (m) { gameMod = m; return m; })
        .catch(function (e) { gameLoad = null; throw e; });
    }
    return gameLoad;
  }
  function gameFailed() {
    view = { name: 'game' };   // drop ownsKeys: keyboard returns to the shell
    clearScreen();             // also drops the lock class + wheel handler
    setKeys('esc: back', '‹ back');
    setPage('');
    screen.appendChild(rowEl(touchUI
      ? 'the game failed to load; ‹ back (bottom left) returns'
      : 'the game failed to load; esc goes back', 'err'));
  }

  var playSeq = 0;   // per-invocation token: a slow load must not start a superseded engine
  function paintPlay() {
    var token = ++playSeq;
    view = { name: 'game', ownsKeys: true }; menu = null;
    clearScreen();
    screen.classList.add('lock');
    setPath([{ text: '~', go: goHome }, { text: 'play' }]);
    input.value = '';
    input.blur();
    setKeys('loading game…');
    setPage('');
    var canvas = document.createElement('canvas');
    canvas.id = 'gamecanvas';
    loadGame().then(function (mod) {
      if (token !== playSeq || view.name !== 'game') return;   // superseded or navigated away
      screen.appendChild(canvas);
      setKeys('arrows steer · space fires · esc: back', '‹ back · drag: steer · hold: fire');
      setPage('no coins needed');
      activeGame = mod.start(canvas, {
        reduced: reduced,
        isActive: function () { return view.name === 'game' && canvas.isConnected; }
      });
    }).catch(function () { if (token === playSeq && view.name === 'game') gameFailed(); });
  }

  function openDoc(doc: Doc | null) {
    if (!doc) return;
    menu = null;
    go(doc.slug === 'resume' ? { name: 'resume' } : { name: 'doc', slug: doc.slug });
  }

  function paintDoc(doc: Doc) {
    view = { name: 'doc' }; menu = null;
    clearScreen();
    var crumbs: PathSeg[] = [{ text: '~', go: goHome }];
    if (doc.slug !== 'resume') {
      crumbs.push({ text: 'posts', go: function () { go({ name: 'posts' }); } });
    }
    crumbs.push({ text: doc.slug });
    setPath(crumbs);

    screen.appendChild(headingEl(doc.title));
    if (doc.date) {
      screen.appendChild(rowEl([
        { text: doc.date + ' · ', cls: 'dim' },
        { text: 'permalink', href: doc.url, cls: 'dim' }
      ], 'permalink'));
    }
    var mount = document.createElement('div');
    screen.appendChild(mount);
    loadContent(doc.tpl || ('tpl-' + doc.slug), doc.contentUrl, mount, doc.url);
    screen.appendChild(gapEl());
    screen.appendChild(rowEl(touchUI ? '(end) · ‹ back (bottom left) returns' : '(end) · esc goes back', 'dim'));

    setKeys('scroll to read · space: a screenful · esc: back', '‹ back');
    chipLast = '';
    setPage('');
    updateScrollChip();
  }

  function scrollDoc(dir: number, big: boolean) {
    screen.scrollBy({ top: dir * (big ? screen.clientHeight * 0.85 : 64), behavior: reduced ? 'auto' : 'smooth' });
  }

  var chipRaf = 0, chipLast = '';
  function updateScrollChip() {
    if (view.name !== 'doc' || chipRaf) return;
    chipRaf = requestAnimationFrame(function () {
      chipRaf = 0;
      if (view.name !== 'doc') return;   // view changed between schedule and frame
      var max = screen.scrollHeight - screen.clientHeight;
      var label = max <= 0 ? 'all of it fits'
        : (function () { var p = Math.round(screen.scrollTop / max * 100); return p >= 99 ? 'end' : p + '% ▼'; })();
      if (label !== chipLast) { chipLast = label; setPage(label); }
    });
  }
  screen.addEventListener('scroll', updateScrollChip);
  window.addEventListener('resize', updateScrollChip);

  /* ---------- hourly theme, 8-bit ocean canvas & theme lab ---------- */

  function findPost(arg: string): Post | null { return matchPost(String(arg || '').toLowerCase(), POSTS); }

  var oceanCanvas = document.getElementById('ocean-canvas') as HTMLCanvasElement | null;
  var accChip = document.getElementById('acc-chip') as HTMLElement;
  var bgMotif: 'ocean' | 'crt' | 'off' = 'ocean';
  var accIdx = themeIndexForHour(new Date().getHours());
  var hasCycled = false;
  var oceanPhase = 0;
  // The first ocean paint builds a per-pixel noise cache (about 100ms for a
  // 1920x1080 window on a fast laptop), so it waits until after first paint
  // rather than running inside this render-blocking boot script; later
  // repaints reuse the cache.
  var oceanReady = false;

  function renderOcean() {
    if (!oceanReady || !oceanCanvas || bgMotif !== 'ocean') return;
    paintOceanCanvas(oceanCanvas, ALL_THEMES[accIdx], oceanPhase);
  }

  function applyTheme(idx: number, announce?: boolean) {
    var root = document.documentElement;
    ALL_THEMES.forEach(function (t) { root.classList.remove(t.cls); });
    accIdx = ((idx % ALL_THEMES.length) + ALL_THEMES.length) % ALL_THEMES.length;
    var spec = ALL_THEMES[accIdx];
    // The spec is the palette's only home: write its tokens here. The class
    // stays because the game's watchTheme observes class changes on <html>.
    root.style.setProperty('--background', spec.bg);
    root.style.setProperty('--foreground', spec.fg);
    root.style.setProperty('--accent', spec.accent);
    root.style.setProperty('--err', spec.err);
    root.classList.add(spec.cls);
    accChip.textContent = 'theme: ' + spec.name;
    renderOcean();
    if (announce) echo('theme -> ' + spec.name);
    if (view.name === 'lab') paintThemeLab();
  }

  function setMotif(m: 'ocean' | 'crt' | 'off', announce?: boolean) {
    bgMotif = m;
    var root = document.documentElement;
    if (oceanCanvas) oceanCanvas.classList.toggle('hidden', m !== 'ocean');
    root.classList.toggle('crt-off', m === 'off');
    if (m === 'ocean') renderOcean();
    if (announce) echo('motif -> ' + m);
    if (view.name === 'lab') paintThemeLab();
  }

  function cycleTheme() {
    // Swap only the palette class on <html> so `touch` and `crt-off` survive.
    var cobaltIdx = -1;
    for (var i = 0; i < ALL_THEMES.length; i++) {
      if (ALL_THEMES[i].cls === 'p-cobalt') { cobaltIdx = i; break; }
    }
    var nextIdx = (!hasCycled && cobaltIdx >= 0 && accIdx !== cobaltIdx)
      ? cobaltIdx
      : (accIdx + 1) % ALL_THEMES.length;
    hasCycled = true;
    applyTheme(nextIdx, true);
  }

  // Initialize the hourly palette now (before first paint) and the ocean once
  // the first frame is out.
  applyTheme(accIdx, false);
  requestAnimationFrame(function () {
    setTimeout(function () { oceanReady = true; renderOcean(); }, 0);
  });

  // Very slow 8-bit wave drift (~4 FPS tick, ~45s full swell period), paused
  // under prefers-reduced-motion, hidden tab, or active WebGL game.
  if (!reduced && oceanCanvas) {
    setInterval(function () {
      if (document.hidden || bgMotif !== 'ocean' || view.name === 'game') return;
      oceanPhase += 0.035;
      renderOcean();
    }, 240);
  }

  var oceanResizeTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('resize', function () {
    if (oceanResizeTimer) clearTimeout(oceanResizeTimer);
    oceanResizeTimer = setTimeout(renderOcean, 120);
  });

  function kvRow(parent: HTMLElement, k: string, v: string, vColor?: string) {
    var kEl = document.createElement('span');
    kEl.className = 'tlab-k';
    kEl.textContent = k;
    var vEl = document.createElement('span');
    vEl.className = 'tlab-v';
    vEl.textContent = v;
    if (vColor) vEl.style.color = vColor;
    parent.appendChild(kEl);
    parent.appendChild(vEl);
  }

  function cardEl(title: string) {
    var card = document.createElement('div');
    card.className = 'tlab-card';
    var t = document.createElement('div');
    t.className = 'tlab-card-title';
    t.textContent = title;
    card.appendChild(t);
    return card;
  }

  function labelEl(text: string) {
    var d = document.createElement('div');
    d.className = 'dim tlab-label';
    d.textContent = text;
    return d;
  }

  function paintThemeLab() {
    // A repaint replaces the focused button, so focus returns to the group's
    // ACTIVE button: the old one would re-apply the previous choice on Enter
    // after ←/→ or 1/2/0 changed it.
    var prevFocus = document.activeElement as HTMLElement | null;
    var focusGroup = prevFocus && prevFocus.classList.contains('tlab-hour') ? '.tlab-hour.active'
      : prevFocus && prevFocus.classList.contains('tlab-motif-btn') ? '.tlab-motif-btn.active'
      : null;
    var focusWasInput = prevFocus === input;

    view = { name: 'lab' }; menu = null;
    clearScreen();
    setPath([{ text: '~', go: goHome }, { text: 'theme' }]);
    setKeys('←/→: step hour · 1/2/0: motif · esc: back', '‹ back');

    var info = inspectTheme(ALL_THEMES[accIdx]);
    setPage('WCAG ' + info.contrast.toFixed(1) + ':1');

    screen.appendChild(rowEl('~/theme · hourly palette & perceptual color theory', 't-title'));
    var sub = document.createElement('div');
    sub.className = 'tlab-sub';
    screen.appendChild(sub);
    loadContent('tpl-theme', DATA!.themeContentUrl, sub, DATA!.themeUrl);

    var wrap = document.createElement('div');
    wrap.className = 'tlab-wrap';

    var grid = document.createElement('div');
    grid.className = 'tlab-grid';

    var card1 = cardEl('01. Hourly Seed & Harmony');
    var kv1 = document.createElement('div');
    kv1.className = 'tlab-kv';
    kvRow(kv1, 'active seed', info.seedLabel + ' (' + info.spec.slot + ')');
    kvRow(kv1, 'palette', info.spec.name, 'var(--accent)');
    kvRow(kv1, 'harmony', 'oklch(' + info.bgOklch.h + '° bg / ' + info.accOklch.h + '° accent)');
    kvRow(kv1, 'wcag 2.1', info.contrast.toFixed(1) + ':1 (' + (info.contrast >= 7 ? 'AAA' : info.contrast >= 4.5 ? 'AA' : 'below AA') + ', foreground on background)');
    kvRow(kv1, 'character', info.spec.note);
    card1.appendChild(kv1);
    card1.appendChild(labelEl('24-hour chromatic clock (click any station or press ←/→):'));

    var clock = document.createElement('div');
    clock.className = 'tlab-clock';
    ALL_THEMES.forEach(function (t, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tlab-hour' + (idx === accIdx ? ' active' : '');
      btn.setAttribute('aria-pressed', String(idx === accIdx));
      btn.setAttribute('aria-label', t.name + ' (' + t.slot + ')');
      btn.style.background = t.bg;
      btn.title = t.name + ' (' + t.slot + ')';
      var lbl = document.createElement('span');
      lbl.textContent = t.hours[0] >= 0
        ? String(t.hours[0]).padStart(2, '0')
        : (t.id === 'cobalt' ? 'amb' : 'grn');
      var dot = document.createElement('span');
      dot.className = 'tlab-hour-dot';
      dot.style.background = t.accent;
      btn.appendChild(lbl);
      btn.appendChild(dot);
      btn.addEventListener('click', function () {
        hasCycled = true;
        applyTheme(idx, true);
      });
      clock.appendChild(btn);
    });
    card1.appendChild(clock);
    grid.appendChild(card1);

    var card2 = cardEl('02. Root CSS & Game Derivation');
    var swatches = document.createElement('div');
    swatches.className = 'tlab-swatches';
    var tokenRows = [
      { token: '--background', color: info.spec.bg, oklch: formatOklch(info.bgOklch), hex: info.spec.bg },
      { token: '--foreground', color: info.spec.fg, oklch: formatOklch(info.fgOklch), hex: info.spec.fg },
      { token: '--accent', color: info.spec.accent, oklch: formatOklch(info.accOklch), hex: info.spec.accent },
      { token: '--dim', color: info.dimHex, oklch: 'mix(fg 62%, bg)', hex: info.dimHex },
      { token: '--line', color: info.lineHex, oklch: 'mix(fg 22%, bg)', hex: info.lineHex },
    ];
    tokenRows.forEach(function (r) {
      var sRow = document.createElement('div');
      sRow.className = 'tlab-swatch-row';
      var chip = document.createElement('span');
      chip.className = 'tlab-chip';
      chip.style.background = r.color;
      var tok = document.createElement('span');
      tok.className = 'dim';
      tok.textContent = r.token;
      var ok = document.createElement('span');
      ok.textContent = r.oklch;
      var hx = document.createElement('span');
      hx.className = 'dim tlab-hex';
      hx.textContent = r.hex;
      sRow.appendChild(chip);
      sRow.appendChild(tok);
      sRow.appendChild(ok);
      sRow.appendChild(hx);
      swatches.appendChild(sRow);
    });
    card2.appendChild(swatches);
    card2.appendChild(labelEl('derivePalette() wireframe game hue rotations:'));

    var rotBar = document.createElement('div');
    rotBar.className = 'tlab-rot-bar';
    var gp = info.gamePalette;
    var rotPills = [
      { label: '0° ship/acc', color: gp.accent },
      { label: '-45° rock M', color: gp.sizeCols[1] },
      { label: '-95° rock S', color: gp.sizeCols[2] },
      { label: '+150° saucer', color: gp.hostile },
      { label: '+90° powerup', color: gp.kindCols[0] },
    ];
    rotPills.forEach(function (p) {
      var pill = document.createElement('span');
      pill.className = 'tlab-rot-pill';
      pill.style.color = p.color;
      pill.textContent = p.label;
      rotBar.appendChild(pill);
    });
    card2.appendChild(rotBar);
    grid.appendChild(card2);
    wrap.appendChild(grid);

    var card3 = cardEl('03. Background Motif & CRT Raster');
    var motifSub = document.createElement('div');
    motifSub.className = 'dim';
    motifSub.style.fontSize = '12px';
    motifSub.textContent = 'Select background layer (CRT raster sits behind terminal text so typography stays crisp):';
    card3.appendChild(motifSub);

    var motifs = document.createElement('div');
    motifs.className = 'tlab-motifs';
    var motifOpts: { id: 'ocean' | 'crt' | 'off'; label: string }[] = [
      { id: 'ocean', label: '[1] 8-Bit Dithered Ocean + CRT' },
      { id: 'crt', label: '[2] CRT Raster Only' },
      { id: 'off', label: '[0] Minimal / Off' },
    ];
    motifOpts.forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tlab-motif-btn' + (bgMotif === opt.id ? ' active' : '');
      b.setAttribute('aria-pressed', String(bgMotif === opt.id));
      b.textContent = opt.label;
      b.addEventListener('click', function () { setMotif(opt.id, true); });
      motifs.appendChild(b);
    });
    card3.appendChild(motifs);
    wrap.appendChild(card3);

    screen.appendChild(wrap);

    if (focusGroup) {
      var active = screen.querySelector(focusGroup) as HTMLElement | null;
      if (active) active.focus();
    } else if (focusWasInput && !touchUI) {
      input.focus();
    }
  }

  /* ---------- commands ---------- */

  var commands: { [k: string]: Command } = {
    help: { desc: 'show available commands', fn: function () { goTo(paintHelp); } },
    ls: { desc: 'list directory contents (ls posts/)', fn: function (args) {
      var r = resolve('ls', args[0], POSTS);
      if (r.kind === 'home') { goHome(); echo('~: posts/  resume.md  about.txt  theme  help'); return; }
      if (r.kind === 'posts') { goTo(paintPosts); echo('~/posts: ' + POSTS.length + ' files, listed on screen'); return; }
      if (r.kind === 'lab') { goTo(paintThemeLab); echo('-> ~/theme'); return; }
      echo('ls: ' + (r as MissingResolved).name + ': no such directory', 'err');
    } },
    cd: { desc: 'change directory (cd posts, cd ..)', fn: function (args) {
      var r = resolve('cd', args[0], POSTS);
      if (r.kind === 'home') { goHome(); echo('-> ~'); return; }
      if (r.kind === 'back') { goBack(); echo('-> back'); return; }
      if (r.kind === 'posts') { goTo(paintPosts); echo('-> ~/posts'); return; }
      if (r.kind === 'lab') { goTo(paintThemeLab); echo('-> ~/theme'); return; }
      echo('cd: ' + (r as MissingResolved).name + ': no such directory', 'err');
    } },
    cat: { desc: 'open a file or post (cat resume.md)', fn: function (args) {
      var r = resolve('cat', args[0], POSTS);
      if (r.kind === 'usage') { echo('usage: cat <file>', 'err'); return; }
      if (r.kind === 'home') { goHome(); return; }
      if (r.kind === 'about') { goTo(paintAbout); return; }
      if (r.kind === 'resume') { openDoc(RESUME); return; }
      if (r.kind === 'posts') { goTo(paintPosts); return; }
      if (r.kind === 'lab') { goTo(paintThemeLab); return; }
      if (r.kind === 'post') {
        var p = bySlug(r.slug);
        if (p) { openDoc(p); return; }
      }
      echo('cat: ' + (r as MissingResolved).name + ': no such file', 'err');
    } },
    resume: { desc: 'open resume.md', fn: function () { openDoc(RESUME); } },
    posts: { desc: 'list all posts', fn: function () { goTo(paintPosts); echo('-> ~/posts'); } },
    home: { desc: 'return to ~', fn: function () { goHome(); echo('-> ~'); } },
    back: { desc: 'go back one screen', fn: goBack },
    play: { desc: 'launch wireframe asteroids', fn: function () { goTo(paintPlay); } },
    motd: { desc: 'daily print from morningprint', fn: function () { goTo(paintMotd); } },
    lab: { desc: 'open hourly color theory lab', fn: function () { goTo(paintThemeLab); echo('-> ~/theme'); } },
    theme: { desc: 'open color theory lab or set palette', fn: function (args) {
      if (!args.length) {
        if (view.name === 'lab') { cycleTheme(); return; }
        goTo(paintThemeLab);
        echo('-> ~/theme');
        return;
      }
      var q = args.join(' ').toLowerCase();
      if (q === 'lab' || q === 'info') { goTo(paintThemeLab); echo('-> ~/theme'); return; }
      if (q === 'next' || q === 'cycle') { cycleTheme(); return; }
      for (var i = 0; i < ALL_THEMES.length; i++) {
        if (ALL_THEMES[i].id === q || ALL_THEMES[i].name.indexOf(q) !== -1) {
          hasCycled = true;
          applyTheme(i, true);
          return;
        }
      }
      echo('theme: ' + q + ': no such palette (try: theme next)', 'err');
    } },
    plain: { desc: 'reload without terminal chrome (?plain)', fn: function () { window.location.href = location.pathname + '?plain'; } },
    whoami: { desc: 'print current session user', fn: function () { echo('matt (guest is you)'); } },
    clear: { desc: 'redraw current screen', fn: function () { echo(''); setPage(''); render(currentRoute!); } }
  };

  function makeRun(name: string) { return function () { run(name); }; }

  var cmdHistory: string[] = [];   // typed-command recall (up/down). Not window.history.
  var histPos = 0;

  function run(raw: string) {
    var text = raw.trim();
    if (!text) { if (view.name === 'doc') scrollDoc(1, true); return; }
    cmdHistory.push(raw);
    histPos = cmdHistory.length;
    var parts = text.split(/\s+/);
    var name = parts[0].toLowerCase();
    var cmd = commands[name];
    var suffix = '', cls = '';
    if (cmd) {
      echo('$ ' + text);
      cmd.fn(parts.slice(1));
      // prefix the command's own feedback so cause and effect read together
      if (echoEl.textContent && echoEl.textContent.indexOf('$ ') !== 0) {
        echoEl.textContent = '$ ' + text + '   ' + echoEl.textContent;
      }
      return;
    }
    if (name === 'q') { echo('$ ' + text); goBack(); return; }
    if (name === 'sudo') { suffix = 'nice try.'; cls = 'err'; }
    else if (name === 'exit') { suffix = 'there is no escape; try plain for the ordinary site.'; }
    else { suffix = name + ': command not found (try: help)'; cls = 'err'; }
    echo('$ ' + text + '   ' + suffix, cls);
  }

  /* ---------- shared navigation keys ----------
     focused=true (typing in the prompt): only non-typeable chords act.
     focused=false: single-letter chords like q and b work too. */

  function navKey(e: KeyboardEvent, focused: boolean) {
    if (view.name === 'boot') { bootSkip(); return e.key !== 'Tab'; }   // any key skips; Tab still moves focus
    if (view.ownsKeys) {
      // the view (the game) owns the keyboard: its own window listeners act.
      // Escape leaves it. When the prompt is focused, let normal editing/commands
      // through (backspace, typing, enter); only swallow when it's blurred so
      // gameplay keys don't scroll the page or type into the prompt.
      if (e.key === 'Escape') { goBack(); return true; }
      if (focused) return false;
      return e.key !== 'Tab';
    }
    if (menu) {
      if (e.key === 'ArrowDown') { moveMenuSel(1); return true; }
      if (e.key === 'ArrowUp') { moveMenuSel(-1); return true; }
      if (e.key === 'Enter') { menu.items[menu.sel].run(); return true; }
    }
    if (view.name === 'lab') {
      if (e.key === 'ArrowRight') { hasCycled = true; applyTheme(accIdx + 1, true); return true; }
      if (e.key === 'ArrowLeft') { hasCycled = true; applyTheme(accIdx - 1, true); return true; }
      if (!focused) {
        if (e.key === '1') { setMotif('ocean', true); return true; }
        if (e.key === '2') { setMotif('crt', true); return true; }
        if (e.key === '0') { setMotif('off', true); return true; }
      }
    }
    if (view.name === 'doc') {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'PageDown') { scrollDoc(1, true); return true; }
      if (e.key === 'PageUp') { scrollDoc(-1, true); return true; }
      if (e.key === 'ArrowDown') { scrollDoc(1, false); return true; }
      if (e.key === 'ArrowUp') { scrollDoc(-1, false); return true; }
      if (!focused && e.key === 'b') { scrollDoc(-1, true); return true; }
    }
    if (e.key === 'Escape') { goBack(); return true; }
    if (!focused && e.key === 'q') { goBack(); return true; }
    return false;
  }

  input.addEventListener('keydown', function (e) {
    if ((view.ownsKeys || input.value === '') && navKey(e, true)) { e.preventDefault(); return; }
    if (e.key === 'Escape') { input.value = ''; e.preventDefault(); return; }
    if (e.key === 'Enter') {
      var v = input.value; input.value = ''; run(v);
    } else if (e.key === 'ArrowUp') {
      if (histPos > 0) { histPos--; input.value = cmdHistory[histPos]; }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (histPos < cmdHistory.length - 1) { histPos++; input.value = cmdHistory[histPos]; }
      else if (histPos === cmdHistory.length - 1) { histPos = cmdHistory.length; input.value = ''; }
      // not navigating history: leave whatever is typed alone
      e.preventDefault();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      var v = input.value;
      var m = v.match(/^(\S+)\s+(\S*)$/);
      if (m && (m[1] === 'cat' || m[1] === 'ls' || m[1] === 'cd')) {
        // match on the last path segment so './po', '~/po', 'posts/20' all complete
        var slash = m[2].lastIndexOf('/');
        var head = slash >= 0 ? m[2].slice(0, slash + 1) : '';
        var frag = slash >= 0 ? m[2].slice(slash + 1) : m[2];
        var hit = completions(m[1], POSTS)
          .filter(function (t) { return frag && t.indexOf(frag) === 0; })[0];
        if (hit) input.value = m[1] + ' ' + head + hit;
      } else if (!/\s/.test(v)) {
        var names = Object.keys(commands).filter(function (n) { return n.indexOf(v.toLowerCase()) === 0; });
        if (names.length === 1) input.value = names[0] + ' ';
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.target === input) return;
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'A') {
      if (e.key === 'Enter' || e.key === ' ') return;   // let focused controls activate
    }
    if (navKey(e, false)) { e.preventDefault(); return; }
    if (view.ownsKeys) return;
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      input.focus();
      input.value += e.key;
      syncCaret();   // this key's keyup targets document, not the input
      e.preventDefault();
    }
  });

  /* wheel: selection in menu views only; registered only while a menu is up,
     so reader scrolling stays fully passive and composited */
  var wheelLock = 0, wheelAcc = 0, wheelOn = false;
  function onWheel(e: WheelEvent) {
    if (!menu) return;
    e.preventDefault();
    var now = Date.now();
    if (now < wheelLock) return;
    if (Math.abs(e.deltaY) < 4) return;
    wheelAcc += e.deltaY;
    if (wheelAcc > 45) { wheelAcc = 0; wheelLock = now + 110; moveMenuSel(1); }
    else if (wheelAcc < -45) { wheelAcc = 0; wheelLock = now + 110; moveMenuSel(-1); }
  }
  function setWheel(on: boolean) {
    if (on === wheelOn) return;
    wheelOn = on;
    if (on) screen.addEventListener('wheel', onWheel, { passive: false });
    else screen.removeEventListener('wheel', onWheel, { passive: false } as EventListenerOptions);
  }

  // swipe-to-select serves locked menus on hybrid (touch + hover) devices; in
  // touch-first mode menus scroll natively, so a swipe must stay a scroll.
  if (!touchUI) {
    var touchY: number | null = null;
    screen.addEventListener('touchstart', function (e) { touchY = e.touches[0].clientY; }, { passive: true });
    screen.addEventListener('touchend', function (e) {
      if (!menu) { touchY = null; return; }
      if (touchY === null) return;
      var dy = e.changedTouches[0].clientY - touchY;
      touchY = null;
      if (dy < -45) moveMenuSel(1);
      else if (dy > 45) moveMenuSel(-1);
    }, { passive: true });
  }

  // mobile: the virtual keyboard overlays the layout viewport, hiding the
  // prompt; size the frame to the VISUAL viewport so the CLI stays on screen
  if (window.visualViewport) {
    var wrapEl = document.getElementById('wrap') as HTMLElement;
    var vvFit = function () {
      var vh = Math.round(window.visualViewport!.height);
      wrapEl.style.height = (vh < window.innerHeight - 40 ? vh + 'px' : '');
      window.scrollTo(0, 0);
      if (caret) { measureCaret(); caretBase = input.offsetLeft; syncCaret(); }
    };
    window.visualViewport.addEventListener('resize', vvFit);
  }

  (document.getElementById('promptline') as HTMLElement).addEventListener('click', function () { input.focus(); });
  accChip.addEventListener('click', cycleTheme);

  // touch-first back button: the keys chip, when its label is a '‹ back'
  // variant (setKeys toggles the .tap class on the same condition).
  if (touchUI) {
    keysChip.addEventListener('click', function () {
      if (view.name === 'boot') { bootSkip(); return; }
      if ((keysChip.textContent || '').charAt(0) === '‹') goBack();
    });
  }

  /* ---------- block cursor: a full-width block that tracks the caret ----------
     The native caret is hidden (caret-color:transparent); this overlay block is
     positioned from selectionStart against the monospace column width, so it
     tracks mid-line edits too. Blink is CSS (auto-disabled under reduced motion,
     leaving a solid block); color follows the theme via var(--accent). */

  var chWidth = 8, caretBase = 0, caretRaf = 0;

  function measureCaret() {
    if (!caret) return;
    var cs = getComputedStyle(input);
    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontSize = cs.fontSize;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.fontStyle = cs.fontStyle;
    probe.style.letterSpacing = cs.letterSpacing;
    probe.textContent = '0000000000';
    document.body.appendChild(probe);
    chWidth = probe.getBoundingClientRect().width / 10 || 8;
    document.body.removeChild(probe);
    caret.style.width = chWidth + 'px';
    caret.style.top = input.offsetTop + 'px';
    caret.style.height = input.offsetHeight + 'px';
  }

  function placeCaret() {
    if (!caret) return;
    if (document.activeElement !== input) { caret.classList.add('hidden'); return; }
    caret.classList.remove('hidden');
    var i = input.selectionStart;
    if (i == null) i = input.value.length;
    caret.style.left = (caretBase + i * chWidth - input.scrollLeft) + 'px';
  }

  function syncCaret() {
    if (!caret || caretRaf) return;
    caretRaf = requestAnimationFrame(function () {
      caretRaf = 0;
      placeCaret();
    });
  }

  if (caret) {
    ['input', 'keyup', 'click', 'select'].forEach(function (ev) {
      input.addEventListener(ev, syncCaret);
    });
    input.addEventListener('focus', function () { caretBase = input.offsetLeft; placeCaret(); });
    input.addEventListener('blur', function () { caret!.classList.add('hidden'); });
    window.addEventListener('resize', function () { measureCaret(); caretBase = input.offsetLeft; syncCaret(); });
    measureCaret();
    caretBase = input.offsetLeft;
    placeCaret();
  }

  /* ---------- boot: POST screen, skippable ---------- */

  var bootTimers: ReturnType<typeof setTimeout>[] = [];
  var booted = false;
  function bootSkip() {
    if (booted) return;
    booted = true;
    bootTimers.forEach(clearTimeout);
    render(currentRoute!);   // currentRoute is home (boot only runs for a fresh '/'); render focuses the prompt
  }

  window.addEventListener('popstate', function (e) {
    traversing = false;                               // our history.back() (if any) has landed
    bootTimers.forEach(clearTimeout); booted = true;  // cancel any in-flight BIOS so it can't stomp the paint
    render(e.state || withDepth(routeFor(location.pathname), 0));
  });

  // Stamp state so Back/popstate always have a route + depth (a fresh load has
  // none). Reload restores the prior state, keeping the session back-stack.
  var initRoute = window.history.state || withDepth(routeFor(location.pathname), 0);
  window.history.replaceState(initRoute, '', location.href);
  currentRoute = initRoute;

  if (initRoute.name === 'home' && !reduced) {
    clearScreen();   // remove the server-rendered fallback block
    setPath([{ text: '~' }]);
    setKeys('any key skips', 'tap to skip');
    POST_LINES.forEach(function (l, i) {
      if (i === 0) screen.appendChild(rowEl(l, 'dim'));
      else bootTimers.push(setTimeout(function () {
        screen.appendChild(rowEl(l, 'dim'));
      }, 65 * i));
    });
    bootTimers.push(setTimeout(function () {
      clearScreen();
      screen.appendChild(artEl(FIG, 'matthorn.io'));
      bootTimers.push(setTimeout(bootSkip, 260));
    }, 65 * POST_LINES.length + 150));
    screen.addEventListener('click', bootSkip, { once: true });
  } else {
    booted = true;
    render(initRoute);   // deep link or reduced-motion: paint straight in, no BIOS
  }
})();
