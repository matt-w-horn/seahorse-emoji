// Interactive prompt for the home page. Vanilla JS, no dependencies.
// Everything reachable here is also reachable as a normal page; this is a toy.
// All output is built with DOM methods (createElement/textContent), never innerHTML.
(function () {
  'use strict';

  var DATA = window.__TERM_DATA;
  var term = document.getElementById('term');
  var out = document.getElementById('term-out');
  var input = document.getElementById('term-in');
  if (!DATA || !term || !out || !input) return;

  term.style.display = 'block'; // stays hidden without JS

  var history = [];
  var histPos = -1;

  // parts: array of strings or {text, cls, href}
  function line(parts, cls) {
    var div = document.createElement('div');
    if (cls) div.className = cls;
    if (typeof parts === 'string') parts = [parts];
    parts.forEach(function (part) {
      if (typeof part === 'string') {
        div.appendChild(document.createTextNode(part));
        return;
      }
      var el;
      if (part.href) {
        el = document.createElement('a');
        el.href = part.href; // site-own relative URLs only
      } else {
        el = document.createElement('span');
      }
      if (part.cls) el.className = part.cls;
      el.textContent = part.text;
      div.appendChild(el);
    });
    out.appendChild(div);
  }

  function scroll() { out.scrollTop = out.scrollHeight; }

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

  function findPost(arg) {
    var q = arg.toLowerCase();
    for (var i = 0; i < DATA.posts.length; i++) {
      var p = DATA.posts[i];
      if (p.slug.toLowerCase().indexOf(q) !== -1 ||
          p.title.toLowerCase().indexOf(q) !== -1) return p;
    }
    return null;
  }

  function listPosts() {
    DATA.posts.forEach(function (p) {
      line([{ text: p.date, cls: 'dim' }, '  ', { text: p.slug, href: p.url }]);
    });
  }

  var commands = {
    help: {
      desc: 'this list',
      fn: function () {
        line('commands:');
        Object.keys(commands).forEach(function (name) {
          line('  ' + name + Array(12 - name.length).join(' ') + commands[name].desc);
        });
        line('everything here is also just a page; scroll down for the posts.', 'dim');
      }
    },
    ls: {
      desc: 'list files (try: ls posts/)',
      fn: function (args) {
        if (args[0] && args[0].replace(/\/$/, '') === 'posts') { listPosts(); return; }
        line('posts/  resume.md  about.txt');
      }
    },
    cat: {
      desc: 'read a file (try: cat about.txt)',
      fn: function (args) {
        var t = (args[0] || '').replace(/\/$/, '');
        if (!t) { line('usage: cat <file>'); return; }
        if (t === 'about.txt' || t === 'about') { DATA.about.forEach(function (l) { line(l); }); return; }
        if (t === 'resume.md' || t === 'resume') { line('rendered version is nicer: open resume', 'dim'); return; }
        var p = findPost(t);
        if (p) {
          line([p.title + ' ', { text: '(' + p.date + ')', cls: 'dim' }]);
          line(['full text: ', { text: p.url, href: p.url }]);
          return;
        }
        line('cat: ' + t + ': no such file', 'err');
      }
    },
    open: {
      desc: 'open a page (open resume, open <post>)',
      fn: function (args) {
        var t = (args[0] || '').toLowerCase();
        if (!t) { line('usage: open <resume|home|post-name>'); return; }
        if (t === 'resume' || t === 'resume.md') { window.location.href = DATA.resumeUrl; return; }
        if (t === 'home' || t === '~' || t === '/') { window.location.href = DATA.homeUrl; return; }
        var p = findPost(t);
        if (p) { window.location.href = p.url; return; }
        line('open: ' + t + ': not found (ls posts/ to see what exists)', 'err');
      }
    },
    resume: { desc: 'open the resume', fn: function () { window.location.href = DATA.resumeUrl; } },
    whoami: { desc: 'who runs this place', fn: function () { line('matt (guest is you)'); } },
    motd: {
      desc: 'message of the day, morningprint style',
      fn: function () { MOTD.forEach(function (l) { line(l); }); }
    },
    date: { desc: 'current time, your side', fn: function () { line(new Date().toString()); } },
    echo: { desc: 'echo', fn: function (args) { line(args.join(' ')); } },
    clear: {
      desc: 'clear the screen',
      fn: function () { while (out.firstChild) out.removeChild(out.firstChild); }
    }
  };

  function run(raw) {
    var text = raw.trim();
    line([{ text: 'guest@matthorn.io:~$', cls: 'dim' }, ' ' + raw]);
    if (!text) return;
    history.push(raw);
    histPos = history.length;
    var parts = text.split(/\s+/);
    var name = parts[0].toLowerCase();
    var cmd = commands[name];
    if (cmd) { cmd.fn(parts.slice(1)); }
    else if (name === 'sudo') { line('nice try.', 'err'); }
    else if (name === 'exit') { line('there is no escape; this is a web page.', 'dim'); }
    else { line(name + ': command not found (try: help)', 'err'); }
    scroll();
  }

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var v = input.value;
      input.value = '';
      run(v);
    } else if (e.key === 'ArrowUp') {
      if (histPos > 0) { histPos--; input.value = history[histPos]; }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (histPos < history.length - 1) { histPos++; input.value = history[histPos]; }
      else { histPos = history.length; input.value = ''; }
      e.preventDefault();
    }
  });

  term.addEventListener('click', function () { input.focus(); });

  line('matthorn.io');
  line("type 'help' to look around, or just scroll.", 'dim');
})();
