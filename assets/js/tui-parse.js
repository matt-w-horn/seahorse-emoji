// Pure path/command resolution for the terminal home. No DOM in here:
// the browser loads it before tui.js, and tests/tui-parse.test.js
// require()s it directly under node.
//
// Paths are parsed as SEGMENTS (the owner's stack suggestion), not with
// prefix regexes: split on '/', drop empty and '.' segments, anchor on '~',
// pop on '..'. That makes every decoration people type (~/, ./, //, /./,
// posts/../) collapse to the same canonical form by construction.
(function (root) {
  'use strict';

  // segments('~/posts//./x.md') -> { segs: ['posts', 'x.md'], underflow: false }
  // '..' pops the previous segment; popping past the root sets underflow
  // (the resolver is stateless, so a leading '..' must become the caller's
  // notion of "back" rather than a path).
  function segments(raw) {
    var t = String(raw == null ? '' : raw).trim();
    var segs = [];
    var underflow = false;
    t.split('/').forEach(function (s) {
      if (s === '' || s === '.') return;
      if (s === '~') { segs = []; underflow = false; return; }  // anchor at root
      if (s === '..') {
        if (segs.length) segs.pop();
        else underflow = true;
        return;
      }
      segs.push(s);
    });
    return { segs: segs, underflow: underflow };
  }

  // canonical display form of a path argument
  function normalize(raw) {
    var p = segments(raw);
    if (p.underflow) return '..';
    return p.segs.length ? p.segs.join('/') : '~';
  }

  function matchPost(fragment, posts) {
    var q = String(fragment == null ? '' : fragment).toLowerCase();
    if (!q) return null;
    var i;
    for (i = 0; i < posts.length; i++) {           // exact slug first
      if (posts[i].slug.toLowerCase() === q) return posts[i];
    }
    for (i = 0; i < posts.length; i++) {           // then slug/title substring
      var p = posts[i];
      if (p.slug.toLowerCase().indexOf(q) !== -1 ||
          p.title.toLowerCase().indexOf(q) !== -1) return p;
    }
    return null;
  }

  // resolve(cmd, rawArg, posts) -> one of:
  //   {kind:'home'} {kind:'posts'} {kind:'about'} {kind:'resume'}
  //   {kind:'post', slug} {kind:'back'} {kind:'usage'}
  //   {kind:'missing', what:'file'|'directory'|'command', name}
  // Error names carry the RAW argument (trimmed), so messages echo what the
  // user actually typed, never a rewritten form.
  function resolve(cmd, rawArg, posts) {
    posts = posts || [];
    var raw = String(rawArg == null ? '' : rawArg).trim();
    var p = segments(raw);
    var segs = p.segs;

    if (p.underflow) {
      // a leading '..': "up from here" — back for cd, home for ls,
      // nothing cat can read
      if (cmd === 'cd') return { kind: 'back' };
      if (cmd === 'ls') return { kind: 'home' };
      return { kind: 'missing', what: 'file', name: raw };
    }

    if (cmd === 'ls' || cmd === 'cd') {
      if (segs.length === 0) return { kind: 'home' };
      if (segs.length === 1 && (segs[0].toLowerCase() === 'posts' || segs[0].toLowerCase() === 'home')) {
        return segs[0].toLowerCase() === 'home' ? { kind: 'home' } : { kind: 'posts' };
      }
      return { kind: 'missing', what: 'directory', name: raw };
    }

    if (cmd === 'cat') {
      if (raw === '') return { kind: 'usage' };
      if (segs.length === 0) return { kind: 'home' };            // cat . / cat ~
      var low0 = segs[0].toLowerCase();
      if (segs.length === 1 && low0 === 'posts') return { kind: 'posts' };
      // a file name, optionally under posts/
      var name = null;
      if (segs.length === 1) name = segs[0];
      else if (segs.length === 2 && low0 === 'posts') name = segs[1];
      if (name !== null) {
        var file = name.toLowerCase().replace(/\.md$/, '').replace(/\.txt$/, '');
        if (file === 'about') return { kind: 'about' };
        if (file === 'resume') return { kind: 'resume' };
        var hit = matchPost(name.toLowerCase().replace(/\.md$/, ''), posts);
        if (hit) return { kind: 'post', slug: hit.slug };
      }
      return { kind: 'missing', what: 'file', name: raw };
    }

    return { kind: 'missing', what: 'command', name: cmd };
  }

  // completion candidates per command: the single source both the commands
  // and the tab completer draw from
  function completions(cmd, posts) {
    if (cmd === 'cat') {
      return ['about.txt', 'resume.md', 'posts/']
        .concat((posts || []).map(function (p) { return p.slug; }));
    }
    if (cmd === 'ls' || cmd === 'cd') return ['posts/'];
    return [];
  }

  var api = {
    segments: segments,
    normalize: normalize,
    resolve: resolve,
    matchPost: matchPost,
    completions: completions
  };
  root.TUIParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
