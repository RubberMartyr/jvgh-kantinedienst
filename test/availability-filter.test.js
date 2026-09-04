const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildGroupedMatchTitle,
  decodeAndTrimIcsText,
  extractIcsTeamCode,
  filterHomeEventsByTeam,
  getDefaultAvailabilityMonth,
  getAvailabilityCardTitle,
  getAvailabilityDisplayTitle,
  homeSideMatchesTeam,
  matchBelongsToResolvedTeam,
  naturalSortTeamNames,
  normalizeTeamForGroupedTitle,
  normalizeTeamCode,
  normalizeTeamText,
  normalizeAvailabilityTitleTime,
  recognizedTeamName,
  parseTeamQueryParams,
  splitMatchSummary,
} = require('../availability-filter.js');

test('default availability month switches when ten calendar days remain', () => {
  const cases = [
    [new Date(2026, 8, 19), new Date(2026, 8, 1)],
    [new Date(2026, 8, 20), new Date(2026, 9, 1)],
    [new Date(2026, 8, 30), new Date(2026, 9, 1)],
    [new Date(2026, 9, 20), new Date(2026, 9, 1)],
    [new Date(2026, 9, 21), new Date(2026, 10, 1)],
    [new Date(2027, 1, 17), new Date(2027, 1, 1)],
    [new Date(2027, 1, 18), new Date(2027, 2, 1)],
    [new Date(2028, 1, 18), new Date(2028, 1, 1)],
    [new Date(2028, 1, 19), new Date(2028, 2, 1)],
    [new Date(2026, 11, 21), new Date(2027, 0, 1)],
  ];

  for (const [referenceDate, expectedMonth] of cases) {
    assert.deepEqual(getDefaultAvailabilityMonth(referenceDate), expectedMonth);
  }
});

test('team query aliases resolve to one canonical positive numeric ID', () => {
  assert.deepEqual(parseTeamQueryParams('?teamId=13413'), { teamId: 13413, isTeamMode: true });
  assert.deepEqual(parseTeamQueryParams('?team=13413'), { teamId: 13413, isTeamMode: true });
  assert.deepEqual(parseTeamQueryParams('?teamId=13413&team=13414'), { teamId: 13413, isTeamMode: true });
  assert.deepEqual(parseTeamQueryParams('?team=U8%20A'), { teamId: null, isTeamMode: false });
  assert.deepEqual(parseTeamQueryParams('?userId=1'), { teamId: null, isTeamMode: false });
});

test('ICS team codes normalize whitespace but preserve squad suffixes', () => {
  assert.equal(normalizeTeamCode('U8 A'), 'U8A');
  assert.equal(extractIcsTeamCode({ summary: 'U8A — Herk-De-Stad FC A / Tegenstander' }), 'U8A');
  assert.equal(extractIcsTeamCode({ title: 'U12 B - Herk-De-Stad / Tegenstander' }), 'U12B');
  assert.equal(extractIcsTeamCode({ summary: '' }), '');
  assert.equal(extractIcsTeamCode({ summary: 'onverwacht' }), '');
});

test('availability titles identify the home team without a team query', () => {
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'match',
    icsSummary: 'U8 — Herk-De-Stad FC B 2-1 / Juve Hasselt C 1',
  }), 'Wedstrijd U8');
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'match',
    icsSummary: 'Herk-De-Stad U9 B / Tegenstander U9 B',
  }), 'Wedstrijd U9');
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'match',
    icsSummary: 'Herk-De-Stad / Onbekende ploeg',
  }), 'Wedstrijd');
});

test('grouped match titles list every unique team in natural order', () => {
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'match',
    teamNames: ['U8', 'U7'],
  }), 'Wedstrijd U7, U8');
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'match',
    teamNames: ['U10', 'U6 B', 'U7', 'U6', 'U7'],
  }), 'Wedstrijd U6, U7, U10');
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'match',
    teamNames: ['U8'],
  }), 'Wedstrijd U8');
  assert.deepEqual(
    naturalSortTeamNames(['U17 B', 'U9 A', 'U6', 'U10', 'U17 A']),
    ['U6', 'U9 A', 'U10', 'U17 A', 'U17 B']
  );
});

test('match titles include the canonical actual time only when explicitly requested', () => {
  assert.equal(getAvailabilityDisplayTitle({ sourceType: 'match', teamNames: ['U11'],
    matchStart: '2026-09-05T09:30:00', matchEnd: '2026-09-05T11:00:00' },
  { includeActualMatchTime: true }),
  'Wedstrijd U11 (09:30–11:00)');
  assert.equal(getAvailabilityDisplayTitle({ sourceType: 'match', teamNames: ['U11', 'U6 A', 'U6 B'],
    matchStart: '2026-09-05T09:30:00', matchEnd: '2026-09-05T11:00:00' },
  { includeActualMatchTime: true }),
  'Wedstrijd U6, U11 (09:30–11:00)');
  assert.equal(getAvailabilityDisplayTitle({ sourceType: 'event', icsSummary: 'Feest',
    icsStart: '2026-09-05T09:30:00', icsEnd: '2026-09-05T11:00:00' }), 'Feest');
});

test('availability card titles conditionally show the checked selected interval', () => {
  const task = { sourceType: 'match', teamNames: ['U11', 'U6A', 'U6B'],
    matchStart: '2026-09-05T09:30:00', matchEnd: '2026-09-05T11:00:00' };
  const complete = { currentChecked: true, selectedStartTime: '8:30', selectedEndTime: '12:00:00',
    shiftStartTime: '08:30:00', shiftEndTime: '12:00' };
  assert.equal(getAvailabilityCardTitle(task, complete), 'Wedstrijd U6, U11');
  assert.equal(getAvailabilityCardTitle(task, { ...complete, selectedStartTime: '09:00', selectedEndTime: '11:30' }),
    'Wedstrijd U6, U11 (09:00–11:30)');
  assert.equal(getAvailabilityCardTitle(task, { ...complete, selectedStartTime: '09:00' }),
    'Wedstrijd U6, U11 (09:00–12:00)');
  assert.equal(getAvailabilityCardTitle(task, { ...complete, selectedEndTime: '11:15' }),
    'Wedstrijd U6, U11 (08:30–11:15)');
  assert.equal(getAvailabilityCardTitle(task, { ...complete, currentChecked: false,
    selectedStartTime: '09:00' }), 'Wedstrijd U6, U11');
});

test('availability card titles support events and reject malformed intervals', () => {
  const task = { sourceType: 'event', icsSummary: 'Ploegenvoorstelling' };
  const state = { currentChecked: true, selectedStartTime: '18:30', selectedEndTime: '21:00',
    shiftStartTime: '18:00', shiftEndTime: '22:00' };
  assert.equal(getAvailabilityCardTitle(task, state), 'Ploegenvoorstelling (18:30–21:00)');
  assert.equal(getAvailabilityCardTitle(task, { ...state, selectedStartTime: undefined }), 'Ploegenvoorstelling');
  assert.equal(getAvailabilityCardTitle(task, { ...state, selectedStartTime: '25:00' }), 'Ploegenvoorstelling');
  assert.equal(getAvailabilityCardTitle({ ...task, isMonthUnavailableDummy: true }, state), 'Ploegenvoorstelling');
  assert.equal(normalizeAvailabilityTitleTime('8:30'), '08:30');
  assert.equal(normalizeAvailabilityTitleTime('08:30:00'), '08:30');
});

test('availability compact base title can omit actual match time without losing it from task data', () => {
  const task = { sourceType: 'match', teamNames: ['U8A', 'U8B'],
    matchStart: '2026-09-05T09:30:00', matchEnd: '2026-09-05T11:00:00' };
  assert.equal(getAvailabilityDisplayTitle(task, { includeActualMatchTime: false }), 'Wedstrijd U8');
  assert.equal(getAvailabilityDisplayTitle(task), 'Wedstrijd U8');
  assert.equal(getAvailabilityDisplayTitle(task, { includeActualMatchTime: true }),
    'Wedstrijd U8 (09:30–11:00)');
  assert.equal(task.matchStart, '2026-09-05T09:30:00');
});

test('grouped-title normalization collapses only trailing squad variants', () => {
  for (const value of ['U6A', 'U6B', 'U6 A', 'U6 B', 'u6a']) {
    assert.equal(normalizeTeamForGroupedTitle(value), 'U6');
  }
  assert.equal(normalizeTeamForGroupedTitle(' U11  A '), 'U11');
  assert.equal(normalizeTeamForGroupedTitle('U17B'), 'U17');
  assert.equal(normalizeTeamForGroupedTitle('First Team A'), 'First Team A');
});

test('grouped match titles use every source match, deduplicate, and naturally sort ages', () => {
  const matches = [
    { summary: 'U11 — Herk-De-Stad FC 2-1 / Godsheide VV 1',
      start: '2026-09-05T09:30:00', end: '2026-09-05T11:00:00' },
    { summary: 'U6A — Herk-De-Stad FC A / FC Averbode Testelt Okselaar',
      start: '2026-09-05T09:30:00', end: '2026-09-05T11:00:00' },
    { summary: 'U6B — Herk-De-Stad FC B / Juve Hasselt B',
      start: '2026-09-05T09:30:00', end: '2026-09-05T11:00:00' },
  ];
  assert.equal(buildGroupedMatchTitle(matches), 'Wedstrijd U6, U11 (09:30–11:00)');
  assert.equal(buildGroupedMatchTitle(['U8A', 'U8B']), 'Wedstrijd U8');
  assert.equal(buildGroupedMatchTitle(['U11', 'U11'],
    '2026-09-05T09:30:00', '2026-09-05T11:00:00'),
  'Wedstrijd U11 (09:30–11:00)');
  assert.equal(buildGroupedMatchTitle(['U21', 'U12', 'U9']), 'Wedstrijd U9, U12, U21');
});

test('grouped match time spans all differing actual intervals and has a safe fallback', () => {
  assert.equal(buildGroupedMatchTitle([
    { teamName: 'U6A', start: '2026-09-05T09:30:00', end: '2026-09-05T11:00:00' },
    { teamName: 'U11', start: '2026-09-05T10:00:00', end: '2026-09-05T11:30:00' },
  ]), 'Wedstrijd U6, U11 (09:30–11:30)');
  assert.equal(buildGroupedMatchTitle([], '2026-09-05T09:30:00',
    '2026-09-05T11:00:00'), 'Wedstrijd (09:30–11:00)');
});

test('event titles use their decoded full summary and retain safe fallbacks', () => {
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'event',
    icsSummary: 'Ploegenvoorstelling en wedstrijd reserven tegen Donk',
  }), 'Ploegenvoorstelling en wedstrijd reserven tegen Donk');
  assert.equal(getAvailabilityDisplayTitle({ sourceType: 'event' }), 'Evenement');
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'event',
    icsSummary: '<img src=x onerror=alert(1)>',
  }), '<img src=x onerror=alert(1)>');
});

test('ICS display text decodes escaped punctuation, newlines and backslashes', () => {
  assert.equal(
    decodeAndTrimIcsText('Club\\, jeugd\\; welkom\\nC:\\\\kantine'),
    'Club, jeugd; welkom C:\\kantine'
  );
});

test('splitMatchSummary safely exposes both match sides', () => {
  assert.deepEqual(splitMatchSummary(' Herk-De-Stad U9 B / Tegenstander U9 B '), {
    leftSide: 'Herk-De-Stad U9 B',
    rightSide: 'Tegenstander U9 B',
    hasTwoSides: true,
  });
  assert.equal(splitMatchSummary('los evenement').hasTwoSides, false);
});

test('team text normalization handles accents, dashes, whitespace and case', () => {
  assert.equal(normalizeTeamText('  UÉ9‑B  '), 'ue9-b');
});

test('team recognition selects the longest known label', () => {
  assert.equal(recognizedTeamName('Herk-De-Stad U9 B'), 'U9 B');
  assert.equal(recognizedTeamName('Herk-De-Stad U12 A'), 'U12 A');
});

test('team matching uses only the exact code at the start of SUMMARY', () => {
  const summary = 'U11 — Herk-De-Stad FC / Tegenstander U9 B';
  assert.equal(homeSideMatchesTeam(summary, 'U9 B'), false);
  assert.equal(homeSideMatchesTeam(summary, 'U11'), true);
});

test('base and lettered teams remain distinct', () => {
  assert.equal(homeSideMatchesTeam('U9 — Herk-De-Stad / Tegenstander', 'U9'), true);
  assert.equal(homeSideMatchesTeam('U9A — Herk-De-Stad / Tegenstander', 'U9'), false);
  assert.equal(homeSideMatchesTeam('U9B — Herk-De-Stad / Tegenstander', 'U9 A'), false);
  assert.equal(homeSideMatchesTeam('U12B — Herk-De-Stad / Tegenstander', 'U12 A'), false);
});

test('WordPress squad names exactly match the ICS SUMMARY team code', () => {
  const fcA = 'U8A — Herk-De-Stad FC A 2-1 / ASV Geel A 1';
  const fcB = 'U8B — Herk-De-Stad FC B 2-1 / Tegenstander U18 FC A';
  assert.equal(matchBelongsToResolvedTeam(fcA, 'U8 A'), true);
  assert.equal(matchBelongsToResolvedTeam(fcA, 'U8 B'), false);
  assert.equal(matchBelongsToResolvedTeam(fcB, 'U8 B'), true);
  assert.equal(matchBelongsToResolvedTeam(fcA, 'U18 A'), false);
});

test('September 2026 U8 A acceptance fixture excludes the simultaneous U8 B match', () => {
  const homeEvents = [
    { summary: 'U8A — Herk-De-Stad FC A 2-1 / Sparta Schaffen B 1', start: '2026-09-05T11:00:00' },
    { summary: 'U8B — Herk-De-Stad FC B 2-1 / Juve Hasselt C 1', start: '2026-09-05T11:00:00' },
    { summary: 'U8A — Herk-De-Stad FC A 2-1 / ASV Geel A 1', start: '2026-09-19T11:00:00' },
  ];

  assert.deepEqual(filterHomeEventsByTeam(homeEvents, 'U8 A'), [homeEvents[0], homeEvents[2]]);
  assert.deepEqual(filterHomeEventsByTeam(homeEvents, 'U8 B'), [homeEvents[1]]);
});

test('an unknown non-empty team never matches', () => {
  assert.equal(homeSideMatchesTeam('Herk-De-Stad U9 B / Tegenstander', 'U42'), false);
});

test('an absent parameter preserves the exact home event collection', () => {
  const homeEvents = [
    { summary: 'U9B — Herk-De-Stad / Tegenstander' },
    { summary: 'U12A — Herk-De-Stad / Andere tegenstander' },
  ];

  assert.equal(filterHomeEventsByTeam(homeEvents, ''), homeEvents);
  assert.deepEqual(filterHomeEventsByTeam(homeEvents, 'U9 B'), [homeEvents[0]]);
  assert.deepEqual(filterHomeEventsByTeam(homeEvents, 'U42'), []);
});
