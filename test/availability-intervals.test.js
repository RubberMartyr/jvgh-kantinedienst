"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mergeAvailabilityIntervals, parseTimeToMinutes, formatMinutesAsTime,
  buildQuarterHourOptions, normalizeAvailabilityRange } = require("../availability-intervals.js");

const range = (state) => ({ start: new Date((state.task || state).start), end: new Date((state.task || state).end) });
const slot = (date, start, end) => ({ task: { start: `${date}T${start}:00`, end: `${date}T${end}:00` } });

test("time helpers parse, format and retain shift boundaries", () => {
  assert.equal(parseTimeToMinutes("09:15"), 555);
  assert.equal(parseTimeToMinutes("24:00"), null);
  assert.equal(formatMinutesAsTime(555), "09:15");
  assert.deepEqual(buildQuarterHourOptions("08:32", "09:07"), ["08:32", "08:45", "09:00", "09:07"]);
  assert.deepEqual(normalizeAvailabilityRange("09:00", "09:00", "08:30", "13:00", "start"),
    { startTime: "09:00", endTime: "09:15" });
  assert.deepEqual(normalizeAvailabilityRange("11:30", "11:30", "08:30", "13:00", "end"),
    { startTime: "11:15", endTime: "11:30" });
});

test("selected adjacent ranges merge without expanding to source shifts", () => {
  const states = [
    { task: { start: "2026-09-05T08:30:00", end: "2026-09-05T10:00:00" }, selected: ["09:00", "10:00"] },
    { task: { start: "2026-09-05T10:00:00", end: "2026-09-05T11:30:00" }, selected: ["10:00", "11:00"] },
  ];
  const selectedRange = (state) => ({
    start: new Date(`2026-09-05T${state.selected[0]}:00`), end: new Date(`2026-09-05T${state.selected[1]}:00`),
  });
  const [merged] = mergeAvailabilityIntervals(states, selectedRange);
  assert.deepEqual([merged.startTime, merged.endTime, merged.coveredSlotKeys],
    ["09:00", "11:00", ["2026-09-05|08:30", "2026-09-05|10:00"]]);
  states[0].selected = ["09:00", "09:45"];
  assert.equal(mergeAvailabilityIntervals(states, selectedRange).length, 2);
});

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
