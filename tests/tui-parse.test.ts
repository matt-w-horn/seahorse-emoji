// Tests for the terminal's segment-based path resolution.
// Run: node --experimental-strip-types --test tests/*.test.ts
import test from 'node:test';
import assert from 'node:assert';
import { segments, normalize, resolve, completions } from '../assets/js/tui-parse.ts';

const POSTS = [
  { slug: '2026-07-04-morningprint', title: 'My receipt printer prints an original artwork every morning' },
  { slug: '2026-04-11-mythos', title: 'Security Is Becoming an Epidemiology Problem' },
  { slug: '2026-03-27-seahorse-emoji', title: 'The Seahorse Emoji' },
];

test('segments: decorations collapse; .. pops; leading .. underflows', () => {
  assert.deepEqual(segments('~/posts//./x.md'), { segs: ['posts', 'x.md'], underflow: false });
  assert.deepEqual(segments('posts/..'), { segs: [], underflow: false });
  assert.deepEqual(segments('posts/../resume'), { segs: ['resume'], underflow: false });
  assert.deepEqual(segments('..'), { segs: [], underflow: true });
  assert.deepEqual(segments('../posts'), { segs: ['posts'], underflow: true });
  assert.deepEqual(segments('a/~/b'), { segs: ['b'], underflow: false }); // ~ re-anchors
  assert.deepEqual(segments(''), { segs: [], underflow: false });
  assert.deepEqual(segments(undefined), { segs: [], underflow: false });
});

test('normalize: canonical display form', () => {
  assert.equal(normalize('~/posts/'), 'posts');
  assert.equal(normalize('.'), '~');
  assert.equal(normalize('~'), '~');
  assert.equal(normalize('posts//x'), 'posts/x');
});

// ---- parameterized spelling tables: one home per destination ----

const HOME_ARGS = ['', '~', '~/', '.', './', './.', '~/.', '/.', 'home', '..' /* ls only */];
const POSTS_ARGS = ['posts', 'posts/', '~/posts', '/posts', './posts', '././posts',
  '~/./posts', 'POSTS', 'posts//', 'posts/.', '~/posts/../posts'];

test('ls: every home spelling lands home', () => {
  for (const a of HOME_ARGS) {
    assert.deepEqual(resolve('ls', a, POSTS), { kind: 'home' }, `ls ${JSON.stringify(a)}`);
  }
});

test('ls/cd: every posts spelling lands posts', () => {
  for (const a of POSTS_ARGS) {
    assert.deepEqual(resolve('ls', a, POSTS), { kind: 'posts' }, `ls ${JSON.stringify(a)}`);
    assert.deepEqual(resolve('cd', a, POSTS), { kind: 'posts' }, `cd ${JSON.stringify(a)}`);
  }
});

test('cd: .. means back (stateless resolver defers to the nav stack); posts/.. means home', () => {
  assert.deepEqual(resolve('cd', '..', POSTS), { kind: 'back' });
  assert.deepEqual(resolve('cd', '../', POSTS), { kind: 'back' });
  assert.deepEqual(resolve('cd', 'posts/..', POSTS), { kind: 'home' });
  assert.deepEqual(resolve('ls', 'posts/..', POSTS), { kind: 'home' });
});

test('unknown directories error with the RAW typed name', () => {
  assert.deepEqual(resolve('ls', './bogus/', POSTS), { kind: 'missing', what: 'directory', name: './bogus/' });
  assert.deepEqual(resolve('cd', 'nope', POSTS), { kind: 'missing', what: 'directory', name: 'nope' });
  assert.deepEqual(resolve('ls', 'about.txt', POSTS), { kind: 'missing', what: 'directory', name: 'about.txt' });
});

test('cat: about and resume in every spelling, case-insensitive, under posts/../ too', () => {
  for (const a of ['about.txt', 'about', 'About.txt', 'ABOUT.TXT', '~/about.txt', './about.txt']) {
    assert.deepEqual(resolve('cat', a, POSTS), { kind: 'about' }, `cat ${a}`);
  }
  for (const a of ['resume', 'resume.md', 'Resume.md', '~/resume.md', './resume.md',
                   'posts/../resume', 'posts/../resume.md' /* formerly skipped as out of scope */]) {
    assert.deepEqual(resolve('cat', a, POSTS), { kind: 'resume' }, `cat ${a}`);
  }
});

test('cat: slugs with every decoration, including interior // and /./', () => {
  for (const a of [
    '2026-07-04-morningprint',
    '2026-07-04-morningprint.md',
    'posts/2026-07-04-morningprint.md',
    '~/posts/2026-07-04-morningprint',
    'posts//2026-07-04-morningprint.md',
    'posts/./2026-07-04-morningprint.md',
    './posts/./2026-07-04-morningprint.md',
    '2026-07-04-MORNINGPRINT.md',
  ]) {
    assert.deepEqual(resolve('cat', a, POSTS), { kind: 'post', slug: '2026-07-04-morningprint' }, `cat ${a}`);
  }
});

test('cat: fragments match slug and title; exact slug beats substring', () => {
  const seahorse = resolve('cat', 'seahorse', POSTS);
  assert.equal(seahorse.kind === 'post' && seahorse.slug, '2026-03-27-seahorse-emoji');
  const epi = resolve('cat', 'epidemiology', POSTS);
  assert.equal(epi.kind === 'post' && epi.slug, '2026-04-11-mythos');
  const dup = [{ slug: 'notes', title: 'Notes' }, { slug: 'notes-2', title: 'More notes' }];
  const notes = resolve('cat', 'notes', dup);
  assert.equal(notes.kind === 'post' && notes.slug, 'notes');
});

test('cat: directories render as listings; empty is usage; junk errors with raw name', () => {
  assert.deepEqual(resolve('cat', 'posts/', POSTS), { kind: 'posts' });
  assert.deepEqual(resolve('cat', '.', POSTS), { kind: 'home' });
  assert.deepEqual(resolve('cat', '~', POSTS), { kind: 'home' });
  assert.deepEqual(resolve('cat', '', POSTS), { kind: 'usage' });
  assert.deepEqual(resolve('cat', './nope.txt', POSTS), { kind: 'missing', what: 'file', name: './nope.txt' });
  assert.deepEqual(resolve('cat', '../x', POSTS), { kind: 'missing', what: 'file', name: '../x' });
});

test('completions: one source of truth per command', () => {
  const c = completions('cat', POSTS);
  assert.ok(c.includes('about.txt') && c.includes('resume.md') && c.includes('posts/'));
  assert.ok(c.includes('2026-07-04-morningprint'));
  assert.deepEqual(completions('ls', POSTS), ['posts/']);
  assert.deepEqual(completions('cd', POSTS), ['posts/']);
  assert.deepEqual(completions('play', POSTS), []);
});
