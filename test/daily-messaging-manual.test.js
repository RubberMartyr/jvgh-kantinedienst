'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const manualPath = require.resolve('../src/functions/dailyMessagingManual');

function loadManualTrigger(dailyMessaging) {
  let registration;
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === '@azure/functions') {
      return { app: { http: (name, options) => { registration = { name, options }; } } };
    }
    if (request === './dailyMessaging' && parent?.filename === manualPath) {
      return { dailyMessaging };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[manualPath];

  try {
    require(manualPath);
    return registration;
  } finally {
    delete require.cache[manualPath];
    Module._load = originalLoad;
  }
}

function createContext() {
  return { log() {}, error() {} };
}

test('manual trigger is a function-key protected POST endpoint', () => {
  const registration = loadManualTrigger(async () => {});

  assert.equal(registration.name, 'dailyMessagingManual');
  assert.deepEqual(registration.options.methods, ['POST']);
  assert.equal(registration.options.authLevel, 'function');
});

test('manual trigger calls dailyMessaging exactly once and returns its result', async () => {
  const calls = [];
  const expectedResult = { todayKey: '2026-08-25', results: [] };
  const registration = loadManualTrigger(async (...args) => {
    calls.push(args);
    return expectedResult;
  });
  const context = createContext();

  const response = await registration.options.handler({}, context);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], null);
  assert.equal(calls[0][1], context);
  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.ok, true);
  assert.equal(response.jsonBody.result, expectedResult);
});

test('manual trigger returns HTTP 500 when dailyMessaging throws', async () => {
  const registration = loadManualTrigger(async () => { throw new Error('test failure'); });

  const response = await registration.options.handler({}, createContext());

  assert.equal(response.status, 500);
  assert.equal(response.jsonBody.ok, false);
  assert.equal(response.jsonBody.error, 'test failure');
});

test('manual trigger does not bypass the automation enabled setting', async () => {
  const previousValue = process.env.JVGH_AUTOMATION_ENABLED;
  process.env.JVGH_AUTOMATION_ENABLED = 'false';
  let calls = 0;
  const registration = loadManualTrigger(async () => {
    calls += 1;
    assert.equal(process.env.JVGH_AUTOMATION_ENABLED, 'false');
  });

  try {
    const response = await registration.options.handler({}, createContext());
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.equal(process.env.JVGH_AUTOMATION_ENABLED, 'false');
  } finally {
    if (previousValue === undefined) delete process.env.JVGH_AUTOMATION_ENABLED;
    else process.env.JVGH_AUTOMATION_ENABLED = previousValue;
  }
});
