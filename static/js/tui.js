// The matthorn.io terminal home. Vanilla JS, no dependencies.
// Every document here is also an ordinary page; this is the front door, not a
// gate. The server renders a plain content block inside #screen (for crawlers,
// no-JS visitors, and failed loads); boot replaces it with the terminal.
// Output is DOM-methods only; post/resume content arrives via <template>
// elements Hugo fills at build time.
(function () {
  'use strict';

  var DATA = window.__TUI;
  var screen = document.getElementById('screen');
  var input = document.getElementById('in');
  var ps1 = document.getElementById('ps1');
  var keysChip = document.getElementById('keys-chip');
  var pageChip = document.getElementById('page-chip');
  var echoEl = document.getElementById('echoline');
  if (!DATA || !screen || !input) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var POSTS = DATA.posts;
  var SUBTITLE = (DATA.subtitle || 'software and security engineering').toLowerCase();
  var RESUME = DATA.resumeUrl
    ? { slug: 'resume', title: 'resume.md', date: '', url: DATA.resumeUrl, tpl: 'tpl-resume' }
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
    'starting shell'
  ];

  var MOTD_INTRO = 'motd from morningprint, my receipt printer art project:';
  var MOTD = [
    '          ░░░▒▒▒▓▓▓▒▒▒░░░',
    '       ░▒▓▓███████████▓▓▒░',
    '      ▒▓█████████████████▓▒',
    '  ─────────────────────────────',
    '   ≈≈≈  ≈≈≈≈  ≈≈≈≈≈  ≈≈≈≈  ≈≈≈',
    '     ≈≈≈≈  ≈≈≈≈≈≈  ≈≈≈≈≈≈',
    '',
    '  every morning, one original print',
    '  -> github.com/matt-w-horn/morningprint'
  ];

  /* ---------- element builders ---------- */

  function rowEl(parts, cls) {
    var div = document.createElement('div');
    div.className = 'row' + (cls ? ' ' + cls : '');
    if (typeof parts === 'string') parts = [parts];
    parts.forEach(function (part) {
      if (typeof part === 'string') { div.appendChild(document.createTextNode(part)); return; }
      var el;
      if (part.href) {
        el = document.createElement('a');
        el.href = part.href;
      } else if (part.click) {
        el = document.createElement('a');
        el.setAttribute('href', '#');
        el.addEventListener('click', function (e) { e.preventDefault(); part.click(); });
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
  function artEl(lines, label) {
    var div = document.createElement('div');
    div.className = 'art';
    div.textContent = lines.join('\n');
    if (label) { div.setAttribute('role', 'img'); div.setAttribute('aria-label', label); }
    else { div.setAttribute('aria-hidden', 'true'); }
    return div;
  }
  function headingEl(text) {
    var h = document.createElement('h1');
    h.className = 't-title';
    h.textContent = text;
    return h;
  }
  function tplContent(id) {
    var t = document.getElementById(id);
    return t ? t.content.cloneNode(true) : null;
  }

  /* ---------- chrome ---------- */

  function clearScreen() {
    while (screen.firstChild) screen.removeChild(screen.firstChild);
    screen.classList.remove('lock');
    screen.scrollTop = 0;
    setWheel(false);
  }

  function setPath(segs) {
    while (ps1.firstChild) ps1.removeChild(ps1.firstChild);
    ps1.appendChild(document.createTextNode('guest@matthorn.io:'));
    segs.forEach(function (s, i) {
      if (i) ps1.appendChild(document.createTextNode('/'));
      if (s.go) {
        var a = document.createElement('a');
        a.setAttribute('href', '#');
        a.textContent = s.text;
        a.addEventListener('click', function (e) { e.preventDefault(); s.go(); });
        ps1.appendChild(a);
      } else ps1.appendChild(document.createTextNode(s.text));
    });
    var tail = document.createElement('span');
    tail.className = 'tail';
    tail.textContent = '$';
    ps1.appendChild(tail);
  }

  function setKeys(text) { keysChip.textContent = text; }
  function setPage(text, cls) { pageChip.textContent = text || ''; pageChip.className = 'chip' + (cls ? ' ' + cls : ''); }
  function flash(text, cls) { setPage(text, cls || 'acc'); }
  function echo(text, cls) { echoEl.textContent = text || ''; echoEl.className = cls === 'err' ? 'err' : ''; }

  /* ---------- navigation stack: esc always goes back ---------- */

  var navStack = [];
  var current = null;

  function goTo(paintFn) {
    if (paintFn === current) { paintFn(); return; }   // self-navigation: repaint, no stack push
    if (current) navStack.push(current);
    current = paintFn;
    paintFn();
  }
  function goBack() {
    if (navStack.length === 0) { flash('already at ~'); return; }
    current = navStack.pop();
    current();
  }
  function goHome() { navStack = []; current = paintHome; menu = null; paintHome(); }

  /* ---------- views ---------- */

  var view = { name: 'boot' };
  var menu = null;
  var menus = {};   // persisted per view so selection survives back-navigation

  function menuItemRow(it, selected) {
    // real links for real pages (middle/cmd-click works); buttons for TUI-only actions
    var el = it.href ? document.createElement('a') : document.createElement('button');
    if (it.href) el.href = it.href;
    else el.type = 'button';
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
    el.addEventListener('click', function (e) {
      if (it.href && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) return; // new tab etc.
      e.preventDefault();
      menu.sel = it.idx;
      it.run();
    });
    return el;
  }

  function paintMenuItems() {
    menu.rowEls = [];
    menu.items.forEach(function (it, i) {
      it.idx = i;
      var el = menuItemRow(it, i === menu.sel);
      menu.rowEls.push(el);
      screen.appendChild(el);
    });
    if (menu.rowEls[menu.sel]) menu.rowEls[menu.sel].scrollIntoView({ block: 'nearest' });
  }

  function moveMenuSel(delta) {
    var next = (menu.sel + delta + menu.items.length) % menu.items.length;
    var oldEl = menu.rowEls[menu.sel], newEl = menu.rowEls[next];
    menu.sel = next;
    if (oldEl) { oldEl.classList.remove('sel'); oldEl.querySelector('.sel-mark').textContent = '  '; }
    if (newEl) {
      newEl.classList.add('sel');
      newEl.querySelector('.sel-mark').textContent = '❯ ';
      newEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function paintHome() {
    view = { name: 'home' };
    menu = menus.home || (menus.home = {
      sel: 0,
      items: [
        { label: 'posts/', note: POSTS.length + ' pieces of writing', href: DATA.postsUrl, run: function () { goTo(paintPosts); } },
        { label: 'resume.md', note: 'fifteen years of jobs', href: DATA.resumeUrl || undefined, run: function () { openDoc(RESUME); } },
        { label: 'about.txt', note: 'who lives here', run: function () { goTo(paintAbout); } },
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
    screen.appendChild(rowEl(DATA.copyright, 'dim'));
  }

  function paintPosts() {
    view = { name: 'posts' };
    menu = menus.posts || (menus.posts = {
      sel: 0,
      items: POSTS.map(function (p) {
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
    var c = tplContent('tpl-about');
    if (c) screen.appendChild(c);
    screen.appendChild(rowEl(DATA.copyright, 'dim'));
  }

  function paintMotd() {
    view = { name: 'motd' }; menu = null;
    clearScreen();
    setPath([{ text: '~', go: goHome }]);
    setKeys('esc: back');
    setPage('');
    screen.appendChild(rowEl(MOTD_INTRO, 'dim'));
    screen.appendChild(artEl(MOTD, 'a sunrise over waves, drawn in block characters'));
  }

  /* doc captured in a closure so back-navigation can never dangle */
  function openDoc(doc) {
    if (!doc) return;
    menu = null;
    goTo(function () { paintDoc(doc); });
  }

  function paintDoc(doc) {
    view = { name: 'doc' }; menu = null;
    clearScreen();
    var crumbs = [{ text: '~', go: goHome }];
    if (doc.slug !== 'resume') {
      crumbs.push({ text: 'posts', go: function () {
        // behave like "back" when posts is where we came from; else navigate
        if (navStack[navStack.length - 1] === paintPosts) goBack();
        else goTo(paintPosts);
      } });
    }
    crumbs.push({ text: doc.slug });
    setPath(crumbs);

    screen.appendChild(headingEl(doc.title));
    screen.appendChild(rowEl([
      { text: doc.date ? doc.date + ' · ' : '', cls: 'dim' },
      { text: 'permalink', href: doc.url, cls: 'dim' }
    ], 'permalink'));
    var c = tplContent(doc.tpl || ('tpl-' + doc.slug));
    if (c) screen.appendChild(c);
    else screen.appendChild(rowEl('(missing content; the permalink above has it)', 'err'));
    screen.appendChild(rowEl('(end) · esc goes back', 'dim'));

    setKeys('scroll to read · space: a screenful · esc: back');
    updateScrollChip();
  }

  function scrollDoc(dir, big) {
    screen.scrollBy({ top: dir * (big ? screen.clientHeight * 0.85 : 64), behavior: reduced ? 'auto' : 'smooth' });
  }

  var chipRaf = 0, chipLast = '';
  function updateScrollChip() {
    if (view.name !== 'doc' || chipRaf) return;
    chipRaf = requestAnimationFrame(function () {
      chipRaf = 0;
      var max = screen.scrollHeight - screen.clientHeight;
      var label = max <= 0 ? 'all of it fits'
        : (function () { var p = Math.round(screen.scrollTop / max * 100); return p >= 99 ? 'end' : p + '% ▼'; })();
      if (label !== chipLast) { chipLast = label; setPage(label); }
    });
  }
  screen.addEventListener('scroll', updateScrollChip);
  window.addEventListener('resize', updateScrollChip);

  /* ---------- commands ---------- */

  function findPost(arg) {
    var q = (arg || '').toLowerCase();
    if (!q) return null;
    for (var i = 0; i < POSTS.length; i++) {
      var p = POSTS[i];
      if (p.slug.toLowerCase().indexOf(q) !== -1 || p.title.toLowerCase().indexOf(q) !== -1) return p;
    }
    return null;
  }

  var ACCENTS = [
    { cls: '', name: 'pistachio' },
    { cls: 'p-cobalt', name: 'cobalt orange' },
    { cls: 'p-cobalt-y', name: 'cobalt yellow' },
    { cls: 'p-cobalt-b', name: 'cobalt blue' }
  ];
  var accIdx = 0;
  var accChip = document.getElementById('acc-chip');
  accChip.textContent = 'theme: ' + ACCENTS[0].name;   // single source for the initial label
  function cycleTheme() {
    accIdx = (accIdx + 1) % ACCENTS.length;
    document.documentElement.className = ACCENTS[accIdx].cls;
    accChip.textContent = 'theme: ' + ACCENTS[accIdx].name;
    echo('theme -> ' + ACCENTS[accIdx].name);
  }

  var commands = {
    help: { desc: 'this list', fn: function () { goTo(paintHelp); } },
    ls: { desc: 'list a directory (ls posts/)', fn: function (args) {
      var t = (args[0] || '').replace(/\/$/, '');
      if (!t || t === '~') { goHome(); return; }
      if (t === 'posts') { goTo(paintPosts); return; }
      echo('ls: ' + t + ': no such directory', 'err');
    } },
    cd: { desc: 'move around (cd posts, cd ..)', fn: function (args) {
      var t = (args[0] || '~').replace(/\/$/, '');
      if (t === '~' || t === '') { goHome(); return; }
      if (t === '..') { goBack(); return; }
      if (t === 'posts') { goTo(paintPosts); return; }
      echo('cd: ' + t + ': no such directory', 'err');
    } },
    cat: { desc: 'read a file (cat about.txt)', fn: function (args) {
      var t = (args[0] || '').replace(/\.md$/, '').replace(/\/$/, '');
      if (!t) { echo('usage: cat <file>', 'err'); return; }
      if (t === 'about.txt' || t === 'about') { goTo(paintAbout); return; }
      if (t === 'resume') { openDoc(RESUME); return; }
      if (t === 'posts') { goTo(paintPosts); return; }
      var p = findPost(t);
      if (p) { openDoc(p); return; }
      echo('cat: ' + t + ': no such file', 'err');
    } },
    resume: { desc: 'read the resume', fn: function () { openDoc(RESUME); } },
    posts: { desc: 'the posts directory', fn: function () { goTo(paintPosts); } },
    home: { desc: 'back to ~', fn: goHome },
    back: { desc: 'go back one screen', fn: goBack },
    motd: { desc: 'message of the day', fn: function () { goTo(paintMotd); } },
    theme: { desc: 'cycle color theme', fn: cycleTheme },
    plain: { desc: 'the ordinary website (same pages, no terminal)', fn: function () { window.location.href = DATA.postsUrl; } },
    whoami: { desc: 'who runs this place', fn: function () { echo('matt (guest is you)'); } },
    clear: { desc: 'redraw the screen', fn: function () { echo(''); setPage(''); current(); } }
  };

  function makeRun(name) { return function () { run(name); }; }

  var history = [];
  var histPos = 0;

  function run(raw) {
    var text = raw.trim();
    if (!text) { if (view.name === 'doc') scrollDoc(1, true); return; }
    history.push(raw);
    histPos = history.length;
    var parts = text.split(/\s+/);
    var name = parts[0].toLowerCase();
    var cmd = commands[name];
    var suffix = '', cls = '';
    if (cmd) { echo('$ ' + text); cmd.fn(parts.slice(1)); return; }
    if (name === 'q') { echo('$ ' + text); goBack(); return; }
    if (name === 'sudo') { suffix = 'nice try.'; cls = 'err'; }
    else if (name === 'exit') { suffix = 'there is no escape; try plain for the ordinary site.'; }
    else { suffix = name + ': command not found (try: help)'; cls = 'err'; }
    echo('$ ' + text + '   ' + suffix, cls);
  }

  /* ---------- shared navigation keys ----------
     focused=true (typing in the prompt): only non-typeable chords act.
     focused=false: single-letter chords like q and b work too. */

  function navKey(e, focused) {
    if (view.name === 'boot') { bootSkip(); return e.key !== 'Tab'; }   // any key skips; Tab still moves focus
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
    if (input.value === '' && navKey(e, true)) { e.preventDefault(); return; }
    if (e.key === 'Escape') { input.value = ''; e.preventDefault(); return; }
    if (e.key === 'Enter') {
      var v = input.value; input.value = ''; run(v);
    } else if (e.key === 'ArrowUp') {
      if (histPos > 0) { histPos--; input.value = history[histPos]; }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (histPos < history.length - 1) { histPos++; input.value = history[histPos]; }
      else if (histPos === history.length - 1) { histPos = history.length; input.value = ''; }
      // not navigating history: leave whatever is typed alone
      e.preventDefault();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      var v = input.value;
      var m = v.match(/^(\S+)\s+(\S*)$/);
      if (m && (m[1] === 'cat' || m[1] === 'ls' || m[1] === 'cd')) {
        // completion offers only what the command will accept
        var targets = m[1] === 'cat'
          ? POSTS.map(function (p) { return p.slug; }).concat(['about.txt', 'resume.md', 'posts/'])
          : ['posts/'];
        var hit = targets.filter(function (t) { return t.indexOf(m[2]) === 0; })[0];
        if (hit) input.value = m[1] + ' ' + hit;
      } else if (!/\s/.test(v)) {
        var names = Object.keys(commands).filter(function (n) { return n.indexOf(v.toLowerCase()) === 0; });
        if (names.length === 1) input.value = names[0] + ' ';
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.target === input) return;
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') {
      if (e.key === 'Enter' || e.key === ' ') return;   // let focused controls activate
    }
    if (navKey(e, false)) { e.preventDefault(); return; }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      input.focus();
      input.value += e.key;
      e.preventDefault();
    }
  });

  /* wheel: selection in menu views only; registered only while a menu is up,
     so reader scrolling stays fully passive and composited */
  var wheelLock = 0, wheelAcc = 0, wheelOn = false;
  function onWheel(e) {
    if (!menu) return;
    e.preventDefault();
    var now = Date.now();
    if (now < wheelLock) return;
    if (Math.abs(e.deltaY) < 4) return;
    wheelAcc += e.deltaY;
    if (wheelAcc > 90) { wheelAcc = 0; wheelLock = now + 320; moveMenuSel(1); }
    else if (wheelAcc < -90) { wheelAcc = 0; wheelLock = now + 320; moveMenuSel(-1); }
  }
  function setWheel(on) {
    if (on === wheelOn) return;
    wheelOn = on;
    if (on) screen.addEventListener('wheel', onWheel, { passive: false });
    else screen.removeEventListener('wheel', onWheel, { passive: false });
  }

  var touchY = null;
  screen.addEventListener('touchstart', function (e) { touchY = e.touches[0].clientY; }, { passive: true });
  screen.addEventListener('touchend', function (e) {
    if (!menu) { touchY = null; return; }
    if (touchY === null) return;
    var dy = e.changedTouches[0].clientY - touchY;
    touchY = null;
    if (dy < -45) moveMenuSel(1);
    else if (dy > 45) moveMenuSel(-1);
  }, { passive: true });

  document.getElementById('promptline').addEventListener('click', function () { input.focus(); });
  accChip.addEventListener('click', cycleTheme);

  /* ---------- boot: POST screen, skippable ---------- */

  var bootTimers = [];
  var booted = false;
  function bootSkip() {
    if (booted) return;
    booted = true;
    bootTimers.forEach(clearTimeout);
    current = paintHome;
    paintHome();
    input.focus();
  }

  current = paintHome;
  if (reduced) { bootSkip(); }
  else {
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
  }
})();
