// The matthorn.io terminal home. Vanilla JS, no dependencies.
// Every document here is also an ordinary page; this is the front door, not a
// gate. The server renders a plain content block inside #screen (for crawlers,
// no-JS visitors, and failed loads); boot replaces it with the terminal.
// Output is DOM-methods only; post/resume content arrives via <template>
// elements Hugo fills at build time.
import { resolve, matchPost, completions, type Resolved } from './tui-parse.ts';
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
  name: 'boot' | 'home' | 'posts' | 'help' | 'about' | 'motd' | 'game' | 'doc';
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
  // fragment lazily. On failure the caller's permalink row is the fallback.
  function loadContent(id: string, url: string, mount: HTMLElement) {
    var tpl = document.getElementById(id) as HTMLTemplateElement | null;
    if (tpl) { mount.appendChild(tpl.content.cloneNode(true)); return; }
    if (contentCache[id]) { mount.appendChild(contentCache[id].cloneNode(true)); return; }
    if (!url) { mount.appendChild(rowEl('(missing content; the permalink above has it)', 'err')); return; }
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
      .catch(function () {
        if (token !== loadSeq) return;
        clearNode(mount); mount.appendChild(rowEl('(content unavailable; the permalink above has it)', 'err'));
      });
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
    if (caret) { caretBase = input.offsetLeft; syncCaret(); }   // prompt width changed
  }

  function setKeys(text: string) { keysChip.textContent = text; }
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
      case 'resume': paintDoc(RESUME!); break;
      case 'doc':    paintDoc(bySlug(route.slug!)!); break;
      default:       paintHome();
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

  function moveMenuSel(delta: number) {
    var next = (menu!.sel + delta + menu!.items.length) % menu!.items.length;
    var oldEl = menu!.rowEls![menu!.sel], newEl = menu!.rowEls![next];
    menu!.sel = next;
    if (oldEl) { oldEl.classList.remove('sel'); oldEl.querySelector('.sel-mark')!.textContent = '  '; }
    if (newEl) {
      newEl.classList.add('sel');
      newEl.querySelector('.sel-mark')!.textContent = '❯ ';
      newEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function paintHome() {
    view = { name: 'home' };
    menu = menus.home || (menus.home = {
      sel: 0,
      items: [
        { label: 'posts/', note: POSTS.length + ' pieces of writing', href: DATA!.postsUrl, run: function () { goTo(paintPosts); } },
        { label: 'resume.md', note: 'fifteen years of jobs', href: DATA!.resumeUrl || undefined, run: function () { openDoc(RESUME); } },
        { label: 'about.txt', note: 'who lives here', run: function () { goTo(paintAbout); } },
        { label: 'play', note: 'wireframe asteroids', run: function () { goTo(paintPlay); } },
        { label: 'help', note: 'all the commands', run: function () { goTo(paintHelp); } }
      ].filter(function (it) { return it.label !== 'resume.md' || RESUME; })
    });
    clearScreen();
    screen.classList.add('lock');
    setWheel(true);
    setPath([{ text: '~' }]);
    setKeys('arrows or scroll: select · enter: open');
    setPage('');
    screen.appendChild(artEl(FIG, 'matthorn.io'));
    screen.appendChild(rowEl([{ text: SUBTITLE + '  ', cls: 'dim' }, { text: STRIPE, cls: 'acc' }]));
    screen.appendChild(gapEl());
    paintMenuItems();
    screen.appendChild(gapEl());
    screen.appendChild(rowEl('Arrows and enter, tap anything underlined, or type a command.', 'dim'));
    screen.appendChild(gapEl());
    screen.appendChild(rowEl(DATA!.copyright, 'dim'));
  }

  function paintPosts() {
    view = { name: 'posts' };
    menu = menus.posts || (menus.posts = {
      sel: 0,
      items: POSTS.map(function (p): MenuItem {
        return { label: p.slug + '.md', note: p.date, href: p.url, run: function () { openDoc(p); } };
      }).concat([{ label: '..', note: 'back', run: goBack }])
    });
    clearScreen();
    screen.classList.add('lock');
    setWheel(true);
    setPath([{ text: '~', go: goHome }, { text: 'posts' }]);
    setKeys('arrows or scroll: select · enter: open · esc: back');
    setPage('');
    screen.appendChild(rowEl('~/posts', 't-title'));
    screen.appendChild(gapEl());
    paintMenuItems();
    screen.appendChild(gapEl());
    screen.appendChild(rowEl('Posts open in a scrollable reader; esc brings you back.', 'dim'));
  }

  function paintHelp() {
    view = { name: 'help' }; menu = null;
    clearScreen();
    setPath([{ text: '~', go: goHome }]);
    setKeys('esc: back');
    setPage('');
    screen.appendChild(rowEl('commands', 't-title'));
    screen.appendChild(gapEl());
    Object.keys(commands).forEach(function (name) {
      screen.appendChild(rowEl(['  ', { text: name, click: makeRun(name) }, Array(Math.max(1, 12 - name.length)).join(' ') + ' ' + commands[name].desc]));
    });
    screen.appendChild(gapEl());
    screen.appendChild(rowEl('anywhere: esc goes back, the path above the prompt is tappable.', 'dim'));
    screen.appendChild(rowEl('while reading: scroll naturally, or space for a screenful.', 'dim'));
    screen.appendChild(rowEl('prefer an ordinary website? every page here is one: try plain.', 'dim'));
  }

  function paintAbout() {
    view = { name: 'about' }; menu = null;
    clearScreen();
    setPath([{ text: '~', go: goHome }, { text: 'about.txt' }]);
    setKeys('esc: back');
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
    setKeys('esc: back');
    setPage('');
    screen.appendChild(rowEl(MOTD_INTRO, 'dim'));
    screen.appendChild(artEl(MOTD, 'a sunrise over waves, drawn in block characters'));
    screen.appendChild(gapEl());
    screen.appendChild(rowEl('My receipt printer wakes up before I do and prints one original', 'wrapcol'));
    screen.appendChild(rowEl('artwork, themed to the day. This sunrise is its house style.', 'wrapcol'));
    screen.appendChild(gapEl());
    var post = findPost('morningprint');
    if (post) screen.appendChild(rowEl(['the full story:  ', { text: post.slug + '.md', click: function () { openDoc(post); } }]));
    screen.appendChild(rowEl(['the code:        ', { text: 'github.com/matt-w-horn/morningprint', href: 'https://github.com/matt-w-horn/morningprint' }]));
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
    setKeys('esc: back');
    setPage('');
    screen.appendChild(rowEl('the game failed to load; esc goes back', 'err'));
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
      setKeys('arrows steer · space fires · esc: back');
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
    screen.appendChild(rowEl([
      { text: doc.date ? doc.date + ' · ' : '', cls: 'dim' },
      { text: 'permalink', href: doc.url, cls: 'dim' }
    ], 'permalink'));
    var mount = document.createElement('div');
    screen.appendChild(mount);
    loadContent(doc.tpl || ('tpl-' + doc.slug), doc.contentUrl, mount);
    screen.appendChild(rowEl('(end) · esc goes back', 'dim'));

    setKeys('scroll to read · space: a screenful · esc: back');
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

  /* ---------- commands ---------- */

  function findPost(arg: string): Post | null { return matchPost(String(arg || '').toLowerCase(), POSTS); }

  var ACCENTS = [
    { cls: '', name: 'pistachio' },
    { cls: 'p-cobalt', name: 'cobalt orange' },
    { cls: 'p-cobalt-y', name: 'cobalt yellow' },
    { cls: 'p-cobalt-b', name: 'cobalt blue' }
  ];
  var accIdx = 0;
  var accChip = document.getElementById('acc-chip') as HTMLElement;
  accChip.textContent = 'theme: ' + ACCENTS[0].name;   // single source for the initial label
  function cycleTheme() {
    accIdx = (accIdx + 1) % ACCENTS.length;
    document.documentElement.className = ACCENTS[accIdx].cls;
    accChip.textContent = 'theme: ' + ACCENTS[accIdx].name;
    echo('theme -> ' + ACCENTS[accIdx].name);
  }

  var commands: { [k: string]: Command } = {
    help: { desc: 'this list', fn: function () { goTo(paintHelp); } },
    ls: { desc: 'list a directory (ls posts/)', fn: function (args) {
      var r = resolve('ls', args[0], POSTS);
      if (r.kind === 'home') { goHome(); echo('~: posts/  resume.md  about.txt  help'); return; }
      if (r.kind === 'posts') { goTo(paintPosts); echo('~/posts: ' + POSTS.length + ' files, listed on screen'); return; }
      echo('ls: ' + (r as MissingResolved).name + ': no such directory', 'err');
    } },
    cd: { desc: 'move around (cd posts, cd ..)', fn: function (args) {
      var r = resolve('cd', args[0], POSTS);
      if (r.kind === 'home') { goHome(); echo('-> ~'); return; }
      if (r.kind === 'back') { goBack(); echo('-> back'); return; }
      if (r.kind === 'posts') { goTo(paintPosts); echo('-> ~/posts'); return; }
      echo('cd: ' + (r as MissingResolved).name + ': no such directory', 'err');
    } },
    cat: { desc: 'read a file (cat about.txt)', fn: function (args) {
      var r = resolve('cat', args[0], POSTS);
      if (r.kind === 'usage') { echo('usage: cat <file>', 'err'); return; }
      if (r.kind === 'home') { goHome(); return; }
      if (r.kind === 'about') { goTo(paintAbout); return; }
      if (r.kind === 'resume') { openDoc(RESUME); return; }
      if (r.kind === 'posts') { goTo(paintPosts); return; }
      if (r.kind === 'post') {
        var p = bySlug(r.slug);
        if (p) { openDoc(p); return; }
      }
      echo('cat: ' + (r as MissingResolved).name + ': no such file', 'err');
    } },
    resume: { desc: 'read the resume', fn: function () { openDoc(RESUME); } },
    posts: { desc: 'the posts directory', fn: function () { goTo(paintPosts); echo('-> ~/posts'); } },
    home: { desc: 'back to ~', fn: function () { goHome(); echo('-> ~'); } },
    back: { desc: 'go back one screen', fn: goBack },
    play: { desc: 'wireframe asteroids', fn: function () { goTo(paintPlay); } },
    motd: { desc: 'a note from my receipt printer', fn: function () { goTo(paintMotd); } },
    theme: { desc: 'cycle color theme', fn: cycleTheme },
    plain: { desc: 'a plain, no-terminal view of this page', fn: function () { window.location.href = location.pathname + '?plain'; } },
    whoami: { desc: 'who runs this place', fn: function () { echo('matt (guest is you)'); } },
    clear: { desc: 'redraw the screen', fn: function () { echo(''); setPage(''); render(currentRoute!); } }
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
    if (wheelAcc > 90) { wheelAcc = 0; wheelLock = now + 320; moveMenuSel(1); }
    else if (wheelAcc < -90) { wheelAcc = 0; wheelLock = now + 320; moveMenuSel(-1); }
  }
  function setWheel(on: boolean) {
    if (on === wheelOn) return;
    wheelOn = on;
    if (on) screen.addEventListener('wheel', onWheel, { passive: false });
    else screen.removeEventListener('wheel', onWheel, { passive: false } as EventListenerOptions);
  }

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

  function syncCaret() {
    if (!caret || caretRaf) return;
    caretRaf = requestAnimationFrame(function () {
      caretRaf = 0;
      if (document.activeElement !== input) { caret!.classList.add('hidden'); return; }
      caret!.classList.remove('hidden');
      var i = input.selectionStart;
      if (i == null) i = input.value.length;
      caret!.style.left = (caretBase + i * chWidth - input.scrollLeft) + 'px';
    });
  }

  if (caret) {
    ['input', 'keyup', 'click', 'select'].forEach(function (ev) {
      input.addEventListener(ev, syncCaret);
    });
    input.addEventListener('focus', function () { caretBase = input.offsetLeft; syncCaret(); });
    input.addEventListener('blur', function () { caret!.classList.add('hidden'); });
    window.addEventListener('resize', function () { measureCaret(); caretBase = input.offsetLeft; syncCaret(); });
    measureCaret();
    caretBase = input.offsetLeft;
  }

  /* ---------- boot: POST screen, skippable ---------- */

  var bootTimers: ReturnType<typeof setTimeout>[] = [];
  var booted = false;
  function bootSkip() {
    if (booted) return;
    booted = true;
    bootTimers.forEach(clearTimeout);
    render(currentRoute!);   // currentRoute is home (boot only runs for a fresh '/')
    input.focus();
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
    setKeys('any key skips');
    POST_LINES.forEach(function (l, i) {
      bootTimers.push(setTimeout(function () {
        screen.appendChild(rowEl(l, 'dim'));
      }, 120 * i));
    });
    bootTimers.push(setTimeout(function () {
      clearScreen();
      screen.appendChild(artEl(FIG, 'matthorn.io'));
      bootTimers.push(setTimeout(bootSkip, 450));
    }, 120 * POST_LINES.length + 260));
    screen.addEventListener('click', bootSkip, { once: true });
  } else {
    render(initRoute);   // deep link or reduced-motion: paint straight in, no BIOS
    input.focus();
  }
})();
