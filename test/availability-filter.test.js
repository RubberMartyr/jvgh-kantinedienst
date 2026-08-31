const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decodeAndTrimIcsText,
  filterHomeEventsByTeam,
  getAvailabilityDisplayTitle,
  homeSideMatchesTeam,
  matchBelongsToResolvedTeam,
  naturalSortTeamNames,
  normalizeTeamText,
  recognizedTeamName,
  splitMatchSummary,
} = require('../availability-filter.js');

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

test('team matching only inspects the home side accepted by availability', () => {
  const summary = 'Herk-De-Stad U11 / Tegenstander U9 B';
  assert.equal(homeSideMatchesTeam(summary, 'U9 B'), false);
  assert.equal(homeSideMatchesTeam(summary, 'U11'), true);
});

test('base and lettered teams remain distinct', () => {
  assert.equal(homeSideMatchesTeam('Herk-De-Stad U9 / Tegenstander', 'U9'), true);
  assert.equal(homeSideMatchesTeam('Herk-De-Stad U9 A / Tegenstander', 'U9'), false);
  assert.equal(homeSideMatchesTeam('Herk-De-Stad U9 B / Tegenstander', 'U9 A'), false);
  assert.equal(homeSideMatchesTeam('Herk-De-Stad U12 B / Tegenstander', 'U12 A'), false);
});

test('WordPress squad names match the age prefix and Herk FC squad only', () => {
  const fcA = 'U8 — Herk-De-Stad FC A 2-1 / ASV Geel A 1';
  const fcB = 'U8 — Herk-De-Stad FC B 2-1 / Tegenstander U18 FC A';
  assert.equal(matchBelongsToResolvedTeam(fcA, 'U8 A'), true);
  assert.equal(matchBelongsToResolvedTeam(fcA, 'U8 B'), false);
  assert.equal(matchBelongsToResolvedTeam(fcB, 'U8 B'), true);
  assert.equal(matchBelongsToResolvedTeam(fcA, 'U18 A'), false);
});

test('an unknown non-empty team never matches', () => {
  assert.equal(homeSideMatchesTeam('Herk-De-Stad U9 B / Tegenstander', 'U42'), false);
});

test('an absent parameter preserves the exact home event collection', () => {
  const homeEvents = [
    { summary: 'Herk-De-Stad U9 B / Tegenstander' },
    { summary: 'Herk-De-Stad U12 A / Andere tegenstander' },
  ];

  assert.equal(filterHomeEventsByTeam(homeEvents, ''), homeEvents);
  assert.deepEqual(filterHomeEventsByTeam(homeEvents, 'U9 B'), [homeEvents[0]]);
  assert.deepEqual(filterHomeEventsByTeam(homeEvents, 'U42'), []);
});
