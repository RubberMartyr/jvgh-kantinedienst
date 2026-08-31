const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decodeAndTrimIcsText,
  extractIcsTeamCode,
  filterHomeEventsByTeam,
  getAvailabilityDisplayTitle,
  homeSideMatchesTeam,
  matchBelongsToResolvedTeam,
  naturalSortTeamNames,
  normalizeTeamCode,
  normalizeTeamText,
  recognizedTeamName,
  parseTeamQueryParams,
  splitMatchSummary,
} = require('../availability-filter.js');

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
  }), 'Wedstrijd U9 B');
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'match',
    icsSummary: 'Herk-De-Stad / Onbekende ploeg',
  }), 'Wedstrijd');
});

test('grouped match titles list every unique team in natural order', () => {
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'match',
    teamNames: ['U8', 'U7'],
  }), 'Wedstrijden U7 & U8');
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'match',
    teamNames: ['U10', 'U6 B', 'U7', 'U6', 'U7'],
  }), 'Wedstrijden U6, U6 B, U7 & U10');
  assert.equal(getAvailabilityDisplayTitle({
    sourceType: 'match',
    teamNames: ['U8'],
  }), 'Wedstrijd U8');
  assert.deepEqual(
    naturalSortTeamNames(['U17 B', 'U9 A', 'U6', 'U10', 'U17 A']),
    ['U6', 'U9 A', 'U10', 'U17 A', 'U17 B']
  );
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
