// Pure path/command resolution for the terminal home. No DOM in here:
// the browser loads it before tui.js, and tests/tui-parse.test.js
// require()s it directly under node.
(function (root) {
  'use strict';

  // strip the decorations a person plausibly types: ~/ prefix, leading and
  // trailing slashes, surrounding whitespace
  function normalize(raw) {
    var t = String(raw == null ? '' : raw).trim();
    if (t === '~') return '~';
    t = t.replace(/^~\/+/, '');
    t = t.replace(/^\/+/, '');
    t = t.replace(/\/+$/, '');
    return t;
  }

  function matchPost(fragment, posts) {
    var q = fragment.toLowerCase();
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
  //   {kind:'missing', what:'file'|'directory', name}
  function resolve(cmd, rawArg, posts) {
    posts = posts || [];
    var t = normalize(rawArg);
    var low = t.toLowerCase();

    if (cmd === 'ls' || cmd === 'cd') {
      if (t === '' || t === '~' || low === 'home') return { kind: 'home' };
      if (t === '..') return cmd === 'cd' ? { kind: 'back' } : { kind: 'home' };
      if (low === 'posts') return { kind: 'posts' };
      return { kind: 'missing', what: 'directory', name: t };
    }

    if (cmd === 'cat') {
      if (t === '') return { kind: 'usage' };
      if (low === 'about' || low === 'about.txt') return { kind: 'about' };
      if (low === 'posts') return { kind: 'posts' };
      // file paths may carry a posts/ prefix and a .md suffix
      var file = low.replace(/^posts\//, '').replace(/\.md$/, '');
      if (file === 'resume') return { kind: 'resume' };
      var p = matchPost(file, posts);
      if (p) return { kind: 'post', slug: p.slug };
      return { kind: 'missing', what: 'file', name: t };
    }

    return { kind: 'missing', what: 'command', name: cmd };
  }

  var api = { normalize: normalize, resolve: resolve, matchPost: matchPost };
  root.TUIParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
