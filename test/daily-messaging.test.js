'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../shared/jvgh-core');
const { runDailyMessagingAutomation } = require('../src/automation/daily-messaging');

const users = [{ id: 1, name: 'Ive Tester', phone: '0470 12 34 56' }, { id: 2, name: 'Jan Tester', phone: '0471 12 34 56' }];
function harness(now, submitted = []) {
  const calls = [];
  const api = {
    getVolunteers: async () => users,
    getPlannerMonthData: async () => ({ schedules: [{ tasks: [{ title: 'Kantinedienst 18:00', signups: submitted.map((id) => ({ userId: id })) }] }] }),
    getScheduledVolunteers: async () => [],
  };
  const messaging = { sendWhatsAppTemplate: async (payload) => { calls.push(payload); return { sid: 'SM_TEST' }; } };
  return runDailyMessagingAutomation({ now: new Date(`${now}T12:00:00Z`), api, messaging, enabled: true,
    settings: { contentSid: 'initial', reminderContentSid: 'reminder', scheduledContentSid: 'scheduled' }, logger: { log() {}, warn() {}, error() {} } }).then((result) => ({ calls, result }));
}

test('calendar helpers cover month, year, February and Brussels timezone', () => {
  assert.equal(Core.getDaysUntilMonthEnd('2026-08-26'), 5);
  assert.equal(Core.getDaysUntilMonthEnd('2026-02-23'), 5);
  assert.equal(Core.getNextMonthKey('2026-12-26'), '2027-01');
  assert.equal(Core.addDaysToDateKey('2026-12-31', 1), '2027-01-01');
  assert.equal(Core.getBrusselsDateKey(new Date('2026-08-25T22:30:00Z')), '2026-08-26');
});

test('26 August sends initial availability to all bestuur', async () => {
  const { calls } = await harness('2026-08-26'); assert.equal(calls.filter((x) => x.contentSid === 'initial').length, 2);
});
test('27 and 31 August remind only missing users', async () => {
  for (const day of ['2026-08-27', '2026-08-31']) { const { calls } = await harness(day, [1]); assert.deepEqual(calls.map((x) => x.contentVariables['2']), ['2']); }
});
test('25 August does not send availability', async () => { const { calls } = await harness('2026-08-25'); assert.equal(calls.length, 0); });
test('availability parser recognizes Kantinedienst and unavailable tasks', () => {
  const data = { schedules: [{ tasks: [
    { title: 'Kantinedienst 18:00', signups: [{ user_id: 1 }] },
    { title: 'Ik ben niet beschikbaar deze maand', signups: [{ userId: 2 }] },
    { title: 'Andere taak', signups: [{ userId: 3 }] },
  ] }] };
  assert.deepEqual([...Core.getUsersWithSubmittedAvailability(data)], [1, 2]);
});
test('scheduled shifts group into one message with exact variables', async () => {
  const calls = [];
  const api = { getVolunteers: async () => [], getPlannerMonthData: async () => ({}), getScheduledVolunteers: async () => [
    { user: users[0], time: '18:00' }, { user: users[0], time: '19:00' },
  ] };
  await runDailyMessagingAutomation({ now: new Date('2026-08-27T12:00:00Z'), api,
    messaging: { sendWhatsAppTemplate: async (x) => { calls.push(x); return { sid: 'SM' }; } }, enabled: true,
    settings: { reminderContentSid: 'r', scheduledContentSid: 's' }, logger: { log() {}, warn() {}, error() {} } });
  assert.equal(calls.filter((x) => x.contentSid === 's').length, 1);
  assert.deepEqual(calls.at(-1).contentVariables, { '1': 'Ive', '2': 'vrijdag 28 augustus om 18:00 en om 19:00', '3': '1' });
});
test('disabled automation calculates recipients but sends nothing', async () => {
  let sent = 0;
  await runDailyMessagingAutomation({ now: new Date('2026-08-26T12:00:00Z'), api: { getVolunteers: async () => users, getScheduledVolunteers: async () => [] },
    messaging: { sendWhatsAppTemplate: async () => { sent++; } }, enabled: false, settings: {}, logger: { log() {}, warn() {}, error() {} } });
  assert.equal(sent, 0);
});
