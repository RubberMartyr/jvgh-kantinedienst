"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mergeAvailabilityIntervals, parseTimeToMinutes, formatMinutesAsTime,
  buildQuarterHourOptions, normalizeAvailabilityRange } = require("../availability-intervals.js");
const { reconstructAvailabilitySelections, normalizeCoveredSlotKeys } = require("../availability-intervals.js");
const { getMatchAvailabilityWindow } = require("../availability-intervals.js");

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

const sourceShift = (start, end, key = `2026-09-05|${start}`) => ({
  start: `2026-09-05T${start}:00`, end: `2026-09-05T${end}:00`, key,
});
const saved = (start, end, keys) => ({
  start: `2026-09-05T${start}:00`, end: `2026-09-05T${end}:00`, coveredSlotKeys: keys,
});
const reconstruct = (shifts, assignments) => reconstructAvailabilitySelections(shifts, assignments, {
  getSlotKey: (shift) => shift.key,
});

test("saved merged assignments reconstruct complete and partial source blocks", () => {
  const shifts = [sourceShift("08:30", "10:00"), sourceShift("10:00", "11:30"), sourceShift("11:30", "13:00")];
  const keys = shifts.map((shift) => shift.key);
  let mapped = reconstruct(shifts.slice(0, 2), [saved("08:30", "11:30", keys.slice(0, 2))]);
  assert.deepEqual(shifts.slice(0, 2).map((shift) => mapped.get(shift).intervals.map((i) => [local(i.start), local(i.end)])),
    [[['08:30', '10:00']], [['10:00', '11:30']]]);

  mapped = reconstruct(shifts, [saved("09:15", "12:15", keys)]);
  assert.deepEqual(shifts.map((shift) => mapped.get(shift).intervals.map((i) => [local(i.start), local(i.end)])),
    [[['09:15', '10:00']], [['10:00', '11:30']], [['11:30', '12:15']]]);
});

test("loaded assignment carries a remainder without duplicating overlapping source time", () => {
  const shifts = [sourceShift("08:30", "12:00"), sourceShift("10:00", "13:30")];
  const persisted = saved("08:30", "13:00", shifts.map((shift) => shift.key));
  const mapped = reconstruct(shifts, [persisted]);
  const ranges = shifts.map((shift) => mapped.get(shift).intervals[0])
    .map((interval) => [local(interval.start), local(interval.end)]);

  assert.deepEqual(ranges, [["08:30", "12:00"], ["12:00", "13:00"]]);
  assert.equal(ranges[0][1], ranges[1][0], "the first end is the next reconstructed start");
  assert.deepEqual(ranges.map(([start]) => start), ["08:30", "12:00"],
    "reconstructing ends does not alter starts");
  assert.ok(shifts.every((shift) => {
    const interval = mapped.get(shift).intervals[0];
    return interval.end.getTime() > interval.start.getTime();
  }), "every reconstructed selection has positive duration");

  const [roundTrip] = mergeAvailabilityIntervals(
    shifts.map((task) => ({ task, selected: mapped.get(task).intervals[0] })),
    (state) => state.selected,
  );
  assert.deepEqual([roundTrip.startTime, roundTrip.endTime], ["08:30", "13:00"]);
});

test("loaded end boundaries carry the cursor only into a source that contains it", () => {
  const shifts = [
    sourceShift("08:30", "13:00"),
    sourceShift("10:00", "14:30"),
    sourceShift("11:30", "14:00"),
  ];
  let mapped = reconstruct(shifts, [saved("09:00", "15:00", shifts.map((shift) => shift.key))]);
  assert.deepEqual(shifts.map((shift) => mapped.get(shift).intervals.map((interval) =>
    [local(interval.start), local(interval.end)])), [
    [["09:00", "13:00"]], [["14:00", "14:30"]], [["13:00", "14:00"]],
  ]);

  mapped = reconstruct(shifts.slice(0, 2), [saved("09:15", "12:00", shifts.slice(0, 2).map((shift) => shift.key))]);
  assert.deepEqual(shifts.slice(0, 2).map((shift) => mapped.get(shift).intervals.map((interval) =>
    [local(interval.start), local(interval.end)])), [
    [["09:15", "12:00"]], [],
  ]);
});

test("a single loaded block keeps its complete applicable range", () => {
  const shift = sourceShift("08:30", "13:00");
  const interval = reconstruct([shift], [saved("08:30", "13:00", [shift.key])])
    .get(shift).intervals[0];
  assert.deepEqual([local(interval.start), local(interval.end)], ["08:30", "13:00"]);
});

test("reconstructed source selections round-trip to the same merged assignment", () => {
  const shifts = [sourceShift("08:30", "10:00"), sourceShift("10:00", "11:30"), sourceShift("11:30", "13:00")];
  const persisted = saved("09:15", "12:15", shifts.map((shift) => shift.key));
  const mapped = reconstruct(shifts, [persisted]);
  const states = shifts.map((task) => {
    const [interval] = mapped.get(task).intervals;
    return { task, selected: interval };
  });
  const [roundTrip] = mergeAvailabilityIntervals(states, (state) => state.selected);
  assert.deepEqual([roundTrip.startTime, roundTrip.endTime, roundTrip.coveredSlotKeys],
    ["09:15", "12:15", shifts.map((shift) => shift.key)]);
});

function local(date) { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }

test("partial ranges, cross-boundary ranges and no-overlap ranges use true intersections", () => {
  const a = sourceShift("08:30", "10:00");
  const b = sourceShift("10:00", "11:30");
  let mapped = reconstruct([a], [saved("09:15", "11:45", [a.key])]);
  assert.deepEqual(mapped.get(a).intervals.map((i) => [local(i.start), local(i.end)]), [["09:15", "10:00"]]);
  mapped = reconstruct([a, b], [saved("09:30", "10:30", [a.key, b.key])]);
  assert.deepEqual([a, b].map((shift) => mapped.get(shift).intervals.map((i) => [local(i.start), local(i.end)])),
    [[['09:30', '10:00']], [['10:00', '10:30']]]);
  assert.equal(reconstruct([b], [saved("08:30", "09:45", [b.key])]).get(b).intervals.length, 0);
});

test("stable keys exclude unrelated overlaps while legacy data chooses one safe initial shift", () => {
  const intended = sourceShift("10:00", "11:30", "event-a");
  const unrelated = sourceShift("10:15", "11:00", "event-b");
  const keyed = reconstruct([intended, unrelated], [saved("10:00", "11:30", ["event-a"])]);
  assert.equal(keyed.get(intended).intervals.length, 1);
  assert.equal(keyed.get(unrelated).intervals.length, 0);
  const legacy = reconstruct([intended, unrelated], [saved("10:30", "10:45", [])]);
  assert.equal(legacy.get(intended).intervals.length, 0);
  assert.equal(legacy.get(unrelated).intervals.length, 1);
});

test("match availability windows use actual duration plus two buffers without mutation", () => {
  for (const [start, end, expectedStart, expectedEnd] of [
    ["09:30", "11:00", "08:30", "12:00"],
    ["11:00", "12:30", "10:00", "13:30"],
    ["10:00", "11:00", "09:00", "12:00"],
  ]) {
    const actualStart = new Date(`2026-09-05T${start}:00+02:00`);
    const actualEnd = new Date(`2026-09-05T${end}:00+02:00`);
    const before = [actualStart.getTime(), actualEnd.getTime()];
    const window = getMatchAvailabilityWindow(actualStart, actualEnd);
    const brussels = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels",
      hour: "2-digit", minute: "2-digit", hour12: false });
    assert.deepEqual([brussels.format(window.start), brussels.format(window.end)], [expectedStart, expectedEnd]);
    assert.deepEqual([actualStart.getTime(), actualEnd.getTime()], before);
  }
  assert.throws(() => getMatchAvailabilityWindow(new Date("bad"), new Date()), TypeError);
  assert.throws(() => getMatchAvailabilityWindow(new Date("2026-09-05T11:00:00Z"),
    new Date("2026-09-05T10:00:00Z")), RangeError);
});

test("non-quarter persisted boundaries remain options and covered keys normalize", () => {
  assert.deepEqual(buildQuarterHourOptions("08:30", "10:00", ["09:17", "09:43"]),
    ["08:30", "08:45", "09:00", "09:15", "09:17", "09:30", "09:43", "09:45", "10:00"]);
  assert.deepEqual(normalizeCoveredSlotKeys('["slot-a","slot-b"]'), ["slot-a", "slot-b"]);
});

test("separated persisted intervals are reported without expanding the gap", () => {
  const shift = sourceShift("08:30", "13:00");
  const result = reconstruct([shift], [
    saved("09:00", "10:00", [shift.key]), saved("11:00", "12:00", [shift.key]),
  ]).get(shift);
  assert.equal(result.separated, true);
  assert.deepEqual(result.intervals.map((i) => [local(i.start), local(i.end)]),
    [["09:00", "10:00"], ["11:00", "12:00"]]);
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
