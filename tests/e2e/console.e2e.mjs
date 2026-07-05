// End-to-end test for the terminal console, driven over the Chrome DevTools
// Protocol (no test framework, no browser-automation dependency — just Node's
// global WebSocket/fetch and a headless Chrome).
//
//   BASE_URL   site to test        (default http://127.0.0.1:1313)
//   CHROME_BIN path to Chrome      (default: first of the known locations)
//
// Exercises deep-link render, URL sync, Back/Forward, lazy fragment fetch +
// cache, lazy game import, the block cursor, plain mode, the index.html alias,
// and asserts zero CSP violations / console errors.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:1313').replace(/\/$/, '');
const MOBILE = !!process.env.MOBILE;   // MOBILE=1 emulates a phone viewport
const PORT = 9333;
const CHROME = process.env.CHROME_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser', '/usr/bin/chromium',
].find((p) => existsSync(p)) || 'google-chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/cdp-console-e2e', 'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
const netUrls = [];
const consoleErrors = [];
const cspViolations = [];
const exceptions = [];

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval threw: ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}
async function nav(url) { await send('Page.navigate', { url }); await sleep(1200); }
const typeCmd = (c) => evalJs('(function(){var i=document.getElementById("in");i.focus();i.value=' + JSON.stringify(c) + ';i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));})()');
const escKey = () => evalJs('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');

let passN = 0, failN = 0;
function check(name, cond, extra = '') {
  if (cond) { passN++; console.log(`  PASS ${name}`); }
  else { failN++; console.log(`  FAIL ${name} ${extra}`); }
}

async function main() {
  let target;
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch { /* chrome still starting */ }
    await sleep(200);
  }
  if (!target) throw new Error('no chrome page target');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
      return;
    }
    if (m.method === 'Network.requestWillBeSent') netUrls.push(m.params.request.url);
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.exception?.description || 'exception');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      if (/content security policy|refused to/i.test(e.text)) cspViolations.push(e.text);
      else if (e.level === 'error') consoleErrors.push(e.text);
    }
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable');
  if (MOBILE) {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    console.log('(mobile viewport: 390x844)');
  }
  const noHOverflow = async () => (await evalJs('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1')) === true;

  console.log('\n[1] deep link /resume/');
  netUrls.length = 0;
  await nav(`${BASE}/resume/`);
  check('URL stays /resume/', await evalJs('location.pathname') === '/resume/');
  check('history.state is resume', (await evalJs('history.state && history.state.name')) === 'resume');
  check('history.state.depth 0', (await evalJs('history.state && history.state.depth')) === 0);
  check('resume BODY rendered (not just heading)', /software engineer/i.test(await evalJs('document.getElementById("screen").innerText')));
  check('prejs cleared', !(await evalJs('!!document.querySelector("#screen .prejs")')));
  check('no fragment fetch on deep link (inline template)', !netUrls.some((u) => u.includes('index.fragment.html')));
  check('native caret hidden (transparent)', (await evalJs('getComputedStyle(document.getElementById("in")).caretColor')) === 'rgba(0, 0, 0, 0)');
  check('no horizontal overflow (resume)', await noHOverflow());

  console.log('\n[2] type "posts" -> URL, then Back');
  await typeCmd('posts'); await sleep(400);
  check('URL became /posts/', await evalJs('location.pathname') === '/posts/');
  check('state name posts', (await evalJs('history.state.name')) === 'posts');
  await evalJs('history.back()'); await sleep(500);
  check('Back returned to /resume/', await evalJs('location.pathname') === '/resume/');
  check('Back repainted resume body', /software engineer/i.test(await evalJs('document.getElementById("screen").innerText')));

  console.log('\n[3] open a post (lazy fragment fetch + cache)');
  netUrls.length = 0;
  await typeCmd('cat mythos'); await sleep(700);
  const mythosFrag = '/posts/2026-04-11-mythos/index.fragment.html';
  check('fetched mythos fragment', netUrls.filter((u) => u.includes(mythosFrag)).length === 1);
  check('post BODY rendered (fragment injected)', /glasswing/i.test(await evalJs('document.getElementById("screen").innerText')));
  check('no horizontal overflow (post)', await noHOverflow());
  check('URL is the post permalink', await evalJs('location.pathname') === '/posts/2026-04-11-mythos/');
  netUrls.length = 0;
  await evalJs('history.back()'); await sleep(400);
  await typeCmd('cat mythos'); await sleep(500);
  check('revisit served from cache (no 2nd fetch)', netUrls.filter((u) => u.includes(mythosFrag)).length === 0);

  console.log('\n[4] play -> lazy game import (ESM module, no global)');
  netUrls.length = 0;
  await typeCmd('play'); await sleep(900);
  check('game script fetched on demand', netUrls.some((u) => /tui-game\..*\.js/.test(u)));
  check('canvas mounted', (await evalJs('!!document.getElementById("gamecanvas")')) === true);
  check('game engine started (canvas sized by fit())', (await evalJs('(function(){var c=document.getElementById("gamecanvas");return !!c && c.width>0;})()')) === true);
  // the prompt must still be editable while the game owns the keyboard: a
  // focused input should NOT have its backspace/typing swallowed.
  await evalJs('var i=document.getElementById("in"); i.value="ab"; i.focus();');
  const bsPrevented = await evalJs('(function(){var e=new KeyboardEvent("keydown",{key:"Backspace",bubbles:true,cancelable:true});document.getElementById("in").dispatchEvent(e);return e.defaultPrevented;})()');
  check('backspace works in the prompt while game active', bsPrevented === false);

  console.log('\n[5] block cursor');
  await evalJs('history.back()'); await sleep(400);
  await nav(`${BASE}/`); await sleep(1800);
  await evalJs('(function(){var i=document.getElementById("in");i.focus();i.value="hello";i.setSelectionRange(5,5);i.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await sleep(200);
  check('caret visible when focused', !(await evalJs('document.getElementById("caret").classList.contains("hidden")')));
  const leftEnd = await evalJs('parseFloat(document.getElementById("caret").style.left)');
  await evalJs('(function(){var i=document.getElementById("in");i.setSelectionRange(2,2);i.dispatchEvent(new Event("select",{bubbles:true}));i.dispatchEvent(new KeyboardEvent("keyup",{key:"ArrowLeft",bubbles:true}));})()');
  await sleep(120);
  const leftMid = await evalJs('parseFloat(document.getElementById("caret").style.left)');
  check('caret tracks mid-line (moves left)', leftMid < leftEnd, `end=${leftEnd} mid=${leftMid}`);
  await evalJs('(function(){var i=document.getElementById("in");i.blur();i.dispatchEvent(new FocusEvent("blur"));})()'); await sleep(120);
  check('caret hidden on blur', await evalJs('document.getElementById("caret").classList.contains("hidden")'));

  console.log('\n[6] document.title tracks navigation');
  await typeCmd('cat mythos'); await sleep(500);
  check('title updates to post on nav', /epidemiology/i.test(await evalJs('document.title')));
  await escKey(); await sleep(500);
  check('title returns to site title at home', !/epidemiology/i.test(await evalJs('document.title')));

  console.log('\n[7] /posts/<slug>/index.html shows the post');
  await nav(`${BASE}/posts/2026-04-11-mythos/index.html`); await sleep(1200);
  check('alias shows the post, not home', /glasswing/i.test(await evalJs('document.getElementById("screen").innerText')));

  console.log('\n[8] ?plain: plain content, terminal chrome hidden, no boot');
  await nav(`${BASE}/resume/?plain`); await sleep(600);
  check('html.plain set', await evalJs('document.documentElement.classList.contains("plain")'));
  check('prejs NOT cleared (console did not boot)', await evalJs('!!document.querySelector("#screen .prejs")'));
  check('promptline hidden in plain mode', (await evalJs('getComputedStyle(document.getElementById("promptline")).display')) === 'none');
  check('plain resume content present', /software engineer/i.test(await evalJs('document.body.innerText')));

  console.log('\n[9] esc: deep-link -> home -> stop, rapid double-esc safe');
  await nav(`${BASE}/resume/`); await sleep(1200);
  await escKey(); await sleep(500);
  check('esc from deep link goes home', await evalJs('location.pathname') === '/');
  await escKey(); await sleep(400);
  check('esc at home stays home (no doc<->home ping-pong)', await evalJs('location.pathname') === '/');
  await typeCmd('posts'); await sleep(400);
  await evalJs('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));');
  await sleep(700);
  check('rapid double-esc did not leave the site', (await evalJs('location.origin')) === BASE);
  check('rapid double-esc landed on home', await evalJs('location.pathname') === '/');

  console.log('\n[10] no CSP violations / exceptions');
  check('no CSP violations', cspViolations.length === 0, cspViolations.slice(0, 2).join(' | '));
  check('no uncaught exceptions', exceptions.length === 0, exceptions.slice(0, 2).join(' | '));
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log(`\n=== ${passN} passed, ${failN} failed ===`);
  ws.close(); chrome.kill();
  process.exit(failN ? 1 : 0);
}
main().catch((e) => { console.error('DRIVER ERROR', e); chrome.kill(); process.exit(2); });
