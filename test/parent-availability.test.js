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

test('parent availability preserves independent primary selections per team', () => {
  const teams = Core.normalizeParentAvailabilityTeams({ teams: [
    { teamId: 1, primaryDelegateStaffId: 12, delegates: [
      { staffId: 11, name: 'Jan', isPrimary: false },
      { staffId: 12, name: 'Peter', isPrimary: true },
    ] },
    { teamId: 2, primaryDelegateStaffId: 21, delegates: [
      { staffId: 21, name: 'Els', isPrimary: true, userId: 0, phone: '' },
    ] },
  ] });

  assert.deepEqual(teams[0].delegates.map(({ name, isPrimary }) => ({ name, isPrimary })), [
    { name: 'Jan', isPrimary: false },
    { name: 'Peter', isPrimary: true },
  ]);
  assert.equal(teams[1].delegates[0].isPrimary, true);
  assert.equal(teams[1].delegates[0].userId, 0);
});

test('parent availability deduplicates a coordinator and staff record by WordPress user', () => {
  const [team] = Core.normalizeParentAvailabilityTeams({ teams: [{ teamId: 1, delegates: [
    { staffId: 12, userId: 37, name: 'Marc', isDelegate: true },
    { staffId: null, userId: 37, name: 'Marc duplicate', isCoordinator: true },
    { staffId: null, userId: 38, name: 'Els', isCoordinator: true },
  ] }] });
  assert.deepEqual(team.delegates.map((delegate) => delegate.name), ['Els', 'Marc']);
});
