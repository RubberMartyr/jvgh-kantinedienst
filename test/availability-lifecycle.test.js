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
  assert.match(worker, /jvgh-planning-static-v38-signup-owned-overlaps/);
  assert.match(worker, /\.\/availability-volunteers\.js/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /url\.pathname\.endsWith\('\.js'\)/);
  assert.match(worker, /await self\.skipWaiting\(\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
});

test('availability helper is loaded before the page logic and both files are cached', () => {
  const html = fs.readFileSync(path.join(root, 'availability.html'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert.ok(html.indexOf('<script src="availability-filter.js"></script>')
    < html.indexOf('<script src="availability.js"></script>'));
  assert.match(worker, /['"]\.\/availability-filter\.js['"]/);
  assert.match(worker, /['"]\.\/availability\.js['"]/);
});

test('availability imports the ICS team helper and fails clearly when its module is absent', () => {
  const source = fs.readFileSync(path.join(root, 'availability.js'), 'utf8');
  assert.match(source, /const availabilityFilter = window\.JVGHAvailabilityFilter;/);
  assert.match(source, /if \(!availabilityFilter\) \{[\s\S]*?Load availability-filter\.js before availability\.js/);
  assert.match(source, /const \{\s*extractIcsTeamCode,/);
  assert.match(source, /teamNames: ev\.sourceType === "match"[\s\S]*?extractIcsTeamCode\(ev\)/);
  assert.doesNotMatch(source, /function extractIcsTeamCode\s*\(/);
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
  assert.match(source, /window\.loadMonth = async function loadMonth\(\)[\s\S]*?renderList\(\{/);
  assert.match(source, /document\.addEventListener\("DOMContentLoaded", async \(\) => \{[\s\S]*?await loadMonth\(\);\s*\}\);/);
});

test('loaded state stays clean and stale loads cannot replace user edits', () => {
  const source = fs.readFileSync(path.join(root, 'availability.js'), 'utf8');
  assert.match(source, /originalChecked: checked,[\s\S]*currentChecked: checked/);
  assert.match(source, /state\.originalStartTime = state\.selectedStartTime/);
  assert.match(source, /state\.originalEndTime = state\.selectedEndTime/);
  assert.match(source, /availabilityUserEditGeneration !== editGenerationAtRequestStart/);
  assert.match(source, /availabilityUserEditGeneration \+= 1/);
});

test('persisted signups remain authoritative when availability owner metadata is absent', () => {
  const source = fs.readFileSync(path.join(root, 'availability.js'), 'utf8');
  assert.match(source, /const ownedAvailabilityAssignments = availabilityAssignments\.filter/);
  assert.match(source, /getAvailabilityMetadata\(assignment\)\.ownerUserId === Number\(userId\) \|\|/);
  assert.match(source, /signupsByTask\.get\(String\(assignment\.id\)\)[\s\S]*?isSignupForCurrentUser/);
});
