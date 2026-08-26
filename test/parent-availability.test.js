'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../shared/jvgh-core');

test('parent availability keeps empty teams, multiple delegates and removes duplicate staff', () => {
  const teams = Core.normalizeParentAvailabilityTeams({ teams: [
    { teamId: 1, teamName: 'U15 A', delegates: [
      { staffId: 12, name: 'Zara' },
      { staffId: 11, name: 'Anna' },
      { staffId: 11, name: 'Anna duplicate' },
    ] },
    { teamId: 2, teamName: 'U16', delegates: [] },
  ] });
  assert.deepEqual(teams[0].delegates.map((item) => item.name), ['Anna', 'Zara']);
  assert.deepEqual(teams[1].delegates, []);
});

test('delegate phone and availability variables reuse shared core behavior', () => {
  assert.equal(Core.getUserPhoneInfo({ phone: '0476 12 34 56' }).normalized, '+32476123456');
  assert.equal(Core.getUserPhoneInfo({ phone: '' }).normalized, '');
  assert.deepEqual(Core.buildAvailabilityContentVariables({ name: 'Jan Peeters' }, 22), { '1': 'Jan', '2': '22' });
});
