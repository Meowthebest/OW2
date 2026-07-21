import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = process.cwd();
const indexHtml = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const assetMatch = indexHtml.match(/src="\/OW2\/(assets\/index-[^"]+\.js)"/);
if (!assetMatch) throw new Error('Could not find the production JavaScript asset. Run npm run build first.');
const bundle = fs.readFileSync(path.join(root, 'dist', assetMatch[1]), 'utf8');
const shell = indexHtml
  .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
  .replace(/<script[^>]*><\/script>/g, '')
  .replace(/<link[^>]*>/g, '');

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

async function boot(saved = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(String(error)));
  virtualConsole.on('error', (error) => errors.push(String(error)));
  const dom = new JSDOM(shell, {
    url: 'http://localhost/OW2/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  });
  dom.window.scrollTo = () => {};
  dom.window.URL.createObjectURL = () => 'blob:test';
  dom.window.URL.revokeObjectURL = () => {};
  Object.entries(saved).forEach(([key, value]) => dom.window.localStorage.setItem(key, value));
  dom.window.eval(bundle);
  await wait(80);
  return { dom, window: dom.window, document: dom.window.document, errors };
}

function clickButton(document, name, mode = 'exact') {
  const matches = [...document.querySelectorAll('button')].filter((button) => {
    const text = button.textContent.replace(/\s+/g, ' ').trim();
    return mode === 'exact' ? text === name : text.includes(name);
  });
  assert.equal(matches.length, 1, 'Expected one button matching "' + name + '", found ' + matches.length);
  assert.equal(matches[0].disabled, false, 'Button "' + name + '" should be enabled');
  matches[0].click();
  return matches[0];
}

function clickSelector(document, selector, label) {
  const matches = [...document.querySelectorAll(selector)];
  assert.equal(matches.length, 1, 'Expected one ' + label + ', found ' + matches.length);
  assert.equal(matches[0].disabled, false, label + ' should be enabled');
  matches[0].click();
  return matches[0];
}

function setInput(window, input, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function snapshotStorage(window) {
  const output = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key) output[key] = window.localStorage.getItem(key);
  }
  return output;
}

let app = await boot();
assert.match(app.document.body.textContent, /Build a lineup without the clutter/);
assert.equal(app.document.querySelectorAll('.player-slot').length, 3);

clickButton(app.document, 'Roll lineup');
await wait(430);
const slotNames = [...app.document.querySelectorAll('.player-slot strong')].map((element) => element.textContent);
assert.equal(slotNames.length, 3);
assert.ok(slotNames.every((name) => name !== 'No hero selected'), 'Normal roll should fill all active player slots');

clickButton(app.document, 'Configure challenge');
await wait();
assert.equal(app.document.querySelector('.modal h2')?.textContent, 'Configure Rank Challenge');
assert.equal(app.document.querySelector('.modal-layer')?.parentElement, app.document.body, 'Dialogs should portal to the viewport root');
assert.ok(app.document.querySelector('.rank-challenge-modal .modal-actions button.button--primary'), 'Rank Challenge start action should remain inside the dialog');
setInput(app.window, app.document.querySelector('select[aria-label="Starting rank"]'), 'Placements');
await wait();
assert.equal(app.document.querySelector('select[aria-label="Starting division"]'), null, 'Placements should not require a fake division');
clickButton(app.document, 'Start Rank Challenge');
await wait();
assert.match(app.document.body.textContent, /Rank Challenge live/);
assert.match(app.document.querySelector('.rank-challenge-panel')?.textContent ?? '', /Placements/);
const normalChallengeHero = app.document.querySelector('.current-hero-panel h2')?.textContent;
assert.ok(normalChallengeHero);
const rankedSlotNames = [...app.document.querySelectorAll('.player-slot strong')].map((element) => element.textContent);

clickSelector(app.document, '.result-action--win', 'normal win button');
await wait();
assert.match(app.document.querySelector('.metric-card:nth-child(2) strong')?.textContent ?? '', /1–0/);
assert.match(app.document.querySelector('.rank-live-stats .metric-card strong')?.textContent ?? '', /1–0/);
assert.notEqual(app.document.querySelector('.current-hero-panel h2')?.textContent, normalChallengeHero, 'Normal Rank Challenge should randomize after a result');
clickButton(app.document, 'Undo last result');
await wait();
assert.match(app.document.querySelector('.metric-card:nth-child(2) strong')?.textContent ?? '', /0–0/);
assert.match(app.document.querySelector('.rank-live-stats .metric-card strong')?.textContent ?? '', /0–0/);
assert.equal(app.document.querySelector('.current-hero-panel h2')?.textContent, normalChallengeHero, 'Undo should restore the pre-result hero');

setInput(app.window, app.document.querySelector('select[aria-label="Updated current rank"]'), 'Gold');
await wait();
clickButton(app.document, 'Save rank');
await wait();
assert.match(app.document.body.textContent, /Challenge goal achieved/);
clickButton(app.document, 'Undo last update');
await wait();
assert.match(app.document.body.textContent, /Rank Challenge live/);

const search = app.document.querySelector('input[placeholder="Search heroes…"]');
assert.ok(search);
setInput(app.window, search, 'hero-that-does-not-exist');
await wait();
assert.equal(app.document.querySelector('.hero-pool-panel .empty-state h3')?.textContent, 'No heroes match');
setInput(app.window, search, '');
await wait();

clickSelector(app.document, '.mode-switcher button[aria-pressed="false"]', 'Nuzlocke mode tab');
await wait();
assert.match(app.document.body.textContent, /Every result changes the run/);
clickButton(app.document, 'Configure challenge');
await wait();
clickButton(app.document, 'Start Rank Challenge');
await wait(60);
assert.match(app.document.body.textContent, /How did the match go/);
const startingHero = app.document.querySelector('.nuzlocke-hero-stage h1')?.textContent;
assert.ok(startingHero);
assert.match(app.document.body.textContent, /Rank Challenge live/);

clickSelector(app.document, '.run-result--win', 'Nuzlocke win button');
await wait();
assert.match(app.document.querySelector('.nuzlocke-metrics .metric-card strong')?.textContent ?? '', /1–0/);
assert.match(app.document.querySelector('.rank-live-stats .metric-card strong')?.textContent ?? '', /1–0/);
clickSelector(app.document, '.run-secondary-actions button:last-child', 'Nuzlocke undo button');
await wait();
assert.equal(app.document.querySelector('.nuzlocke-hero-stage h1')?.textContent, startingHero);
assert.match(app.document.querySelector('.nuzlocke-metrics .metric-card strong')?.textContent ?? '', /0–0/);
assert.match(app.document.querySelector('.rank-live-stats .metric-card strong')?.textContent ?? '', /0–0/);

const persisted = snapshotStorage(app.window);
app.dom.window.close();
app = await boot(persisted);
assert.equal(app.document.querySelector('.nuzlocke-hero-stage h1')?.textContent, startingHero);
assert.match(app.document.body.textContent, /Nuzlocke run in progress/);

clickSelector(app.document, '.run-result--loss', 'Nuzlocke loss button');
await wait();
assert.equal(app.document.querySelector('.confirm-dialog h2')?.textContent, 'Confirm this loss');
clickButton(app.document, 'Record loss');
await wait();
assert.match(app.document.querySelector('.nuzlocke-metrics .metric-card strong')?.textContent ?? '', /0–1/);

const settings = app.document.querySelector('button[aria-label="Open mode settings"]');
assert.ok(settings);
settings.click();
await wait();
assert.equal(app.document.querySelector('.modal h2')?.textContent, 'Active run settings');
clickButton(app.document, 'End Nuzlocke run');
await wait();
assert.equal(app.document.querySelector('.confirm-dialog h2')?.textContent, 'End this Nuzlocke run?');
clickButton(app.document, 'End run');
await wait();
assert.match(app.document.body.textContent, /The run is over/);
assert.match(app.document.body.textContent, /Run history/);
assert.match(app.document.body.textContent, /Rank climb concluded/);
clickButton(app.document, 'Retry same rules');
await wait();
assert.match(app.document.body.textContent, /Nuzlocke run in progress/);

clickSelector(app.document, '.mode-switcher button[aria-pressed="false"]', 'Normal mode tab');
await wait();
const restoredSlots = [...app.document.querySelectorAll('.player-slot strong')].map((element) => element.textContent);
assert.deepEqual(restoredSlots, rankedSlotNames, 'Switching modes must preserve the normal Rank Challenge lineup');
assert.match(app.document.body.textContent, /Rank Challenge live/, 'Normal Rank Challenge should remain separate and active');

assert.deepEqual(app.errors, [], 'Runtime emitted browser errors: ' + app.errors.join('\n'));
app.dom.window.close();

const invalid = await boot({
  ow2_preferences_v1: JSON.stringify({ version: 1, mode: 'nuzlocke', theme: 'dark', compactCards: false, reducedEffects: false }),
  ow2_nuzlocke_v1: '{broken-json',
  ow2_rank_challenges_v1: '{broken-json',
});
assert.match(invalid.document.body.textContent, /Every result changes the run/);
assert.deepEqual(invalid.errors, [], 'Invalid-state recovery emitted browser errors: ' + invalid.errors.join('\n'));
invalid.dom.window.close();

console.log('UI_INTEGRATION_TESTS_PASS', {
  normalLineup: slotNames,
  nuzlockeHero: startingHero,
  persistence: true,
  rankChallenges: true,
  invalidStateRecovery: true,
});
