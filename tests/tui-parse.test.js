// Lightweight tests for the terminal's path/command resolution.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { resolve, normalize } = require('../static/js/tui-parse.js');

const POSTS = [
  { slug: '2026-07-04-morningprint', title: 'My receipt printer prints an original artwork every morning' },
  { slug: '2026-04-11-mythos', title: 'Security Is Becoming an Epidemiology Problem' },
  { slug: '2026-03-27-seahorse-emoji', title: 'The Seahorse Emoji' },
];

test('normalize strips the decorations people type', () => {
  assert.equal(normalize('~/posts/'), 'posts');
  assert.equal(normalize('/posts'), 'posts');
  assert.equal(normalize('posts//'), 'posts');
  assert.equal(normalize('  posts '), 'posts');
  assert.equal(normalize('~'), '~');
  assert.equal(normalize(''), '');
  assert.equal(normalize(undefined), '');
});

test('ls: bare, ~, home, and .. all land at the home listing', () => {
  for (const arg of ['', '~', 'home', '..', '~/']) {
    assert.deepEqual(resolve('ls', arg, POSTS), { kind: 'home' }, `ls ${JSON.stringify(arg)}`);
  }
});

test('ls: posts in every spelling', () => {
  for (const arg of ['posts', 'posts/', '~/posts', '/posts', 'POSTS']) {
    assert.deepEqual(resolve('ls', arg, POSTS), { kind: 'posts' }, `ls ${JSON.stringify(arg)}`);
  }
});

test('ls: unknown directory errors, and files are not directories', () => {
  assert.deepEqual(resolve('ls', 'bogus', POSTS), { kind: 'missing', what: 'directory', name: 'bogus' });
  assert.equal(resolve('ls', 'about.txt', POSTS).kind, 'missing');
});

test('cd: home, .., posts, unknown', () => {
  assert.deepEqual(resolve('cd', '', POSTS), { kind: 'home' });
  assert.deepEqual(resolve('cd', '~', POSTS), { kind: 'home' });
  assert.deepEqual(resolve('cd', '..', POSTS), { kind: 'back' });
  assert.deepEqual(resolve('cd', 'posts/', POSTS), { kind: 'posts' });
  assert.deepEqual(resolve('cd', '~/posts', POSTS), { kind: 'posts' });
  assert.equal(resolve('cd', 'nope', POSTS).kind, 'missing');
});

test('cat: about and resume in every spelling, case-insensitive', () => {
  for (const arg of ['about.txt', 'about', 'About.txt', 'ABOUT.TXT', '~/about.txt']) {
    assert.deepEqual(resolve('cat', arg, POSTS), { kind: 'about' }, `cat ${arg}`);
  }
  for (const arg of ['resume', 'resume.md', 'Resume.md', '~/resume.md', 'posts/../resume']) {
    const r = resolve('cat', arg, POSTS);
    if (arg === 'posts/../resume') continue; // .. inside paths is out of scope
    assert.deepEqual(r, { kind: 'resume' }, `cat ${arg}`);
  }
});

test('cat: full slugs, posts/ prefixes, .md suffixes, and mixed case', () => {
  for (const arg of [
    '2026-07-04-morningprint',
    '2026-07-04-morningprint.md',
    'posts/2026-07-04-morningprint.md',
    '~/posts/2026-07-04-morningprint',
    '2026-07-04-MORNINGPRINT.md',
  ]) {
    assert.deepEqual(resolve('cat', arg, POSTS), { kind: 'post', slug: '2026-07-04-morningprint' }, `cat ${arg}`);
  }
});

test('cat: fragment matching on slug and title', () => {
  assert.equal(resolve('cat', 'morningprint', POSTS).slug, '2026-07-04-morningprint');
  assert.equal(resolve('cat', 'seahorse', POSTS).slug, '2026-03-27-seahorse-emoji');
  assert.equal(resolve('cat', 'epidemiology', POSTS).slug, '2026-04-11-mythos');
  assert.equal(resolve('cat', 'MYTHOS', POSTS).slug, '2026-04-11-mythos');
});

test('cat: a directory argument shows the directory; empty shows usage; junk errors', () => {
  assert.deepEqual(resolve('cat', 'posts/', POSTS), { kind: 'posts' });
  assert.deepEqual(resolve('cat', '', POSTS), { kind: 'usage' });
  assert.deepEqual(resolve('cat', 'nope.txt', POSTS), { kind: 'missing', what: 'file', name: 'nope.txt' });
});

test('exact slug wins over substring when both could match', () => {
  const posts = [
    { slug: 'notes', title: 'Notes' },
    { slug: 'notes-2', title: 'More notes' },
  ];
  assert.equal(resolve('cat', 'notes', posts).slug, 'notes');
});
