const test = require('node:test');
const assert = require('node:assert/strict');

const {
  filterHomeEventsByTeam,
  homeSideMatchesTeam,
  normalizeTeamText,
  recognizedTeamName,
  splitMatchSummary,
} = require('../availability-filter.js');

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
