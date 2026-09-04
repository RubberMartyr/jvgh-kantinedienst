const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const AvailabilityFilter = require('../availability-filter.js');
const AvailabilityIntervals = require('../availability-intervals.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'availability.js'), 'utf8');

function functionSource(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf(') {', start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not read ${name}`);
}

test('loadShiftSlotsForMonth uses the imported helper for a normal match event', async () => {
  const match = {
    summary: 'U11 — Herk-De-Stad FC / Tegenstander',
    start: new Date('2026-09-05T09:30:00Z'),
    end: new Date('2026-09-05T11:00:00Z'),
    sourceType: 'match',
    sourceLabel: 'Wedstrijd',
  };
  const responses = [
    'BEGIN:VEVENT\nEND:VEVENT', '', '', '',
  ];
  let helperCalls = 0;
  const context = {
    fetch: async () => ({ ok: true, text: async () => responses.shift() }),
    ICAL_URL: 'matches', EVENTS_ICAL_URL: 'events', VERHUUR_ICAL_URL: 'rentals',
    DAGELIJKS_BESTUUR_ICAL_URL: 'board',
    parseICS: (text, options) => options.sourceType === 'match' ? [match] : [],
    filterHomeEventsByTeam: (events) => events,
    expandEventIntoDailyOccurrences: (event) => [event],
    extractIcsTeamCode: (event) => {
      helperCalls += 1;
      return AvailabilityFilter.extractIcsTeamCode(event);
    },
    recognizedTeamName: AvailabilityFilter.recognizedTeamName,
    splitMatchSummary: AvailabilityFilter.splitMatchSummary,
    JVGHAvailabilityIntervals: AvailabilityIntervals,
    pad2: (value) => String(value).padStart(2, '0'),
  };
  vm.runInNewContext(`${functionSource('loadShiftSlotsForMonth')}\nthis.load = loadShiftSlotsForMonth;`, context);

  const shifts = await context.load('2026-09');

  assert.equal(helperCalls, 1);
  assert.deepEqual(Array.from(shifts[0].teamNames), ['U11']);
  assert.equal(shifts[0].time, '08:30');
  assert.equal(shifts[0].qty, 210);
  assert.equal(shifts[0].end, '2026-09-05T12:00:00.000Z');
  assert.equal(
    AvailabilityFilter.getAvailabilityDisplayTitle({ ...shifts[0], teamNames: ['U11', 'U6A', 'U6B'] }),
    'Wedstrijd U6, U11 (09:30–11:00)'
  );
});
