const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const path = require('node:path');

test('primary delegate WhatsApp uses the fixed template and team variables', () => {
  const fixture = path.join(__dirname, 'primary-delegate-whatsapp-fixture.php');
  const result = spawnSync('php', [fixture], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const request = JSON.parse(result.stdout);
  assert.equal(request.body.ContentSid, 'HX99004e68f1b165d54e7824088636bf6f');
  assert.equal(request.body.ContentVariables, '{"1":"U8 A","2":"13413"}');
  assert.equal(request.body.To, 'whatsapp:+32470123456');
  assert.equal(Object.hasOwn(request.body, 'Body'), false);
});
