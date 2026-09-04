"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

test("availability reconciliation sends method-appropriate internal REST data", () => {
  const fixture = path.join(__dirname, "availability-internal-request-fixture.php");
  const result = spawnSync("php", [fixture], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const requests = JSON.parse(result.stdout);
  const [schedule, task, signup, planner, deletion] = [0, 1, 2, 3, 4].map((index) => requests[index]);

  assert.equal(schedule.method, "POST");
  assert.equal(schedule.contentType, "application/json");
  assert.notEqual(schedule.rawBody, "");
  assert.equal(schedule.json.title, "Kantinedienst 2026-09-05");
  assert.deepEqual(schedule.bodyParams, schedule.json);

  assert.equal(task.method, "POST");
  assert.equal(task.contentType, "application/json");
  assert.equal(task.json.title, "Kantinedienst 08:30–14:30");
  assert.deepEqual(task.json, {
    title: "Kantinedienst 08:30–14:30", qty: 360, date: "2026-09-05", time: "08:30",
  });
  assert.equal(signup.contentType, "application/json");
  assert.deepEqual(signup.json, {
    firstName: "Test User", lastName: "", email: "", phone: "", userId: 42,
  });
  assert.equal(signup.method, "POST");

  assert.equal(planner.method, "GET");
  assert.deepEqual(planner.query, { month: "2026-09" });
  assert.equal(planner.json, null);

  assert.equal(deletion.method, "DELETE");
  assert.equal(deletion.contentType, null);
  assert.equal(deletion.rawBody, "");
  assert.equal(deletion.json, null);
  assert.deepEqual(deletion.bodyParams, []);
  assert.equal(requests.preservedError, true);
});

test("reconciliation keeps the generated merged-task fields unchanged", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "wordpress", "jvgh-availability-assignments.php"), "utf8",
  );
  assert.match(source, /'title' => "Kantinedienst \{\$assignment\['startTime'\]\}–\{\$assignment\['endTime'\]\}"/);
  assert.match(source, /'qty' => \$assignment\['qty'\], 'date' => \$date, 'time' => \$assignment\['startTime'\]/);
});
