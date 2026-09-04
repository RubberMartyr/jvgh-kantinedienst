const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('availability PWA launches links in a new browsing context', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'availability.webmanifest'), 'utf8'));
  assert.deepEqual(manifest.launch_handler, { client_mode: 'navigate-new' });
});

test('service worker refreshes critical launch assets and advances its cache', () => {
  const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert.match(worker, /jvgh-planning-static-v34-match-windows/);
  assert.match(worker, /\.\/availability-volunteers\.js/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /url\.pathname\.endsWith\('\.js'\)/);
  assert.match(worker, /await self\.skipWaiting\(\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
});

test('selecting availability does not change the details expansion state', () => {
  const source = fs.readFileSync(path.join(root, 'availability.js'), 'utf8');
  const handler = source.match(/checkbox\.addEventListener\("change", \(\) => \{([\s\S]*?)\n    \}\);/);
  assert.ok(handler);
  assert.match(handler[1], /state\.currentChecked = Boolean\(checkbox\.checked\)/);
  assert.match(handler[1], /timeRange\.hidden = !state\.currentChecked/);
  assert.match(handler[1], /syncAvailabilityDom\(stateByTask\)/);
  assert.match(handler[1], /updateDirtyUi\(stateByTask\)/);
  assert.doesNotMatch(handler[1], /details\.classList|expandButton\.click|classList\.toggle/);

  assert.match(source, /expandButton\.addEventListener\("click", \(\) => \{[\s\S]*?details\.classList\.toggle\("is-open"\)/);
});

test('availability context is initialized from the current URL at DOM initialization', () => {
  const source = fs.readFileSync(path.join(root, 'availability.js'), 'utf8');
  assert.match(source, /function initializeAvailabilityFromCurrentUrl\(now = new Date\(\)\)/);
  assert.match(source, /const explicitMonth = parseMonthInput\(explicitMonthRaw\)/);
  assert.match(source, /const monthKey = explicitMonth \|\| getDefaultAvailabilityMonthKey\(now\)/);
  assert.match(source, /initializeAvailabilityFromCurrentUrl\(\);/);
});

test('loaded state stays clean and stale loads cannot replace user edits', () => {
  const source = fs.readFileSync(path.join(root, 'availability.js'), 'utf8');
  assert.match(source, /originalChecked: checked,[\s\S]*currentChecked: checked/);
  assert.match(source, /state\.originalStartTime = state\.selectedStartTime/);
  assert.match(source, /state\.originalEndTime = state\.selectedEndTime/);
  assert.match(source, /availabilityUserEditGeneration !== editGenerationAtRequestStart/);
  assert.match(source, /availabilityUserEditGeneration \+= 1/);
});
