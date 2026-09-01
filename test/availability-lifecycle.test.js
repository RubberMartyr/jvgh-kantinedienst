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
  assert.match(worker, /jvgh-planning-static-v25-mobile-calendar-views/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /url\.pathname\.endsWith\('\.js'\)/);
  assert.match(worker, /await self\.skipWaiting\(\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
});

test('availability context is initialized from the current URL at DOM initialization', () => {
  const source = fs.readFileSync(path.join(root, 'availability.js'), 'utf8');
  assert.match(source, /function initializeAvailabilityFromCurrentUrl\(now = new Date\(\)\)/);
  assert.match(source, /const explicitMonth = parseMonthInput\(explicitMonthRaw\)/);
  assert.match(source, /const monthKey = explicitMonth \|\| getDefaultAvailabilityMonthKey\(now\)/);
  assert.match(source, /initializeAvailabilityFromCurrentUrl\(\);/);
});
