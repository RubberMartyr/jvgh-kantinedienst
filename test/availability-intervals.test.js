"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mergeAvailabilityIntervals } = require("../availability-intervals.js");

const range = (task) => ({ start: new Date(task.start), end: new Date(task.end) });
const slot = (date, start, end) => ({ task: { start: `${date}T${start}:00`, end: `${date}T${end}:00` } });

test("overlapping availability intervals become one real assignment", () => {
  const [merged] = mergeAvailabilityIntervals([
    slot("2026-09-05", "08:30", "13:00"), slot("2026-09-05", "10:00", "14:30"),
  ], range);
  assert.deepEqual(
    { date: merged.date, start: merged.startTime, end: merged.endTime, qty: merged.qty, slots: merged.coveredSlotKeys },
    { date: "2026-09-05", start: "08:30", end: "14:30", qty: 360,
      slots: ["2026-09-05|08:30", "2026-09-05|10:00"] },
  );
});

test("exactly adjacent intervals merge, but a one-minute gap does not", () => {
  assert.equal(mergeAvailabilityIntervals([
    slot("2026-09-05", "08:30", "13:00"), slot("2026-09-05", "13:00", "17:30"),
  ], range).length, 1);
  assert.equal(mergeAvailabilityIntervals([
    slot("2026-09-05", "08:30", "13:00"), slot("2026-09-05", "13:01", "17:30"),
  ], range).length, 2);
});

test("contained intervals merge and dates remain independent", () => {
  const contained = mergeAvailabilityIntervals([
    slot("2026-09-05", "08:30", "16:00"), slot("2026-09-05", "10:00", "12:00"),
  ], range);
  assert.equal(contained.length, 1);
  assert.equal(contained[0].endTime, "16:00");
  assert.equal(mergeAvailabilityIntervals([
    slot("2026-09-05", "08:30", "13:00"), slot("2026-09-06", "10:00", "14:30"),
  ], range).length, 2);
});

test("invalid and overnight selections reject the whole desired state", () => {
  assert.throws(() => mergeAvailabilityIntervals([
    slot("2026-09-05", "08:30", "13:00"), { task: { start: "bad", end: "also bad" } },
  ], range), /ongeldige start- of eindtijd/);
  assert.throws(() => mergeAvailabilityIntervals([
    slot("2026-09-05", "23:30", "2026-09-06T01:00"),
  ], range));
});

test("save uses one reconciliation request and reload restores explicit covered slots", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "availability.js"), "utf8");
  assert.match(source, /reconcileAvailabilityAssignments\(\{/);
  assert.match(source, /getAvailabilityMetadata\(assignment\)/);
  assert.match(source, /metadata\.coveredSlotKeys\.includes\(slotKey\)/);
  assert.doesNotMatch(source, /for \(const state of toCreate\)[\s\S]*?if \(!isUnavailable\)[\s\S]*?createSignup/);
});

test("backend reconciliation is owner/team scoped and removes only empty generated tasks", () => {
  const php = fs.readFileSync(path.join(__dirname, "..", "wordpress", "jvgh-availability-assignments.php"), "utf8");
  assert.match(php, /JVGH_AVAILABILITY_SOURCE_META/);
  assert.match(php, /JVGH_AVAILABILITY_OWNER_META/);
  assert.match(php, /JVGH_AVAILABILITY_TEAM_META/);
  assert.match(php, /array_diff_key\(\$desired, \$existing\)/);
  assert.match(php, /if \(!\$other_signups\)/);
  assert.match(php, /START TRANSACTION/);
  assert.match(php, /ROLLBACK/);
});
