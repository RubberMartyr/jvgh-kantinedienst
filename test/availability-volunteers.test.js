"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildAvailabilityTasksByCoveredSlotKey,
  getOtherScheduledVolunteers,
  getTaskRange,
  isLegacyPlannerAssignment,
  mapLegacyPlannerTasks,
  reconstructDirectSelection,
} = require("../availability-volunteers.js");

const source = (time, title = "Wedstrijd", teamId = 1, endTime = "16:00") => ({
  date: "2026-09-05", time, endTime, title, teamId,
});
const assignment = (id, keys, signups = [], extra = {}) => ({
  id, date: "2026-09-05", time: "10:30", qty: 330,
  jvghSource: "availability", jvghCoveredSlots: keys, signups, ...extra,
});

test("direct and covered assignment signups are displayed without mutating either task", () => {
  const wedstrijd = source("11:30");
  const direct = [{ id: 2, userId: 2, firstName: "Direct", lastName: "Persoon" }];
  const carine = { id: 8, userId: 42, firstName: "Carine", lastName: "Sinatra" };
  const generated = assignment(90, ["2026-09-05|11:30"], [carine]);
  const before = structuredClone(generated);
  const lookup = buildAvailabilityTasksByCoveredSlotKey([wedstrijd], [generated]);
  const volunteers = getOtherScheduledVolunteers(wedstrijd, {
    directSignups: direct,
    availabilityTasksByCoveredSlotKey: lookup.bySlotKey,
    signupsByTask: new Map([["90", generated.signups]]),
  });
  assert.deepEqual(volunteers.map((item) => `${item.firstName} ${item.lastName}`),
    ["Direct Persoon", "Carine Sinatra"]);
  assert.deepEqual(generated, before, "the persisted signup remains on the generated task");
});

test("covered keys are exact: overlaps and distinct teams remain independent", () => {
  const u8a = source("08:30", "U8 A", 8, "13:00");
  const u8b = source("10:00", "U8 B", 9, "14:30");
  const carine = assignment(90, ["2026-09-05|10:00"], [{ userId: 42, firstName: "Carine", lastName: "Sinatra" }]);
  const { bySlotKey } = buildAvailabilityTasksByCoveredSlotKey([u8a, u8b], [carine]);
  const context = { availabilityTasksByCoveredSlotKey: bySlotKey, directSignups: [] };
  assert.equal(getOtherScheduledVolunteers(u8a, context).length, 0);
  assert.equal(getOtherScheduledVolunteers(u8b, context)[0].firstName, "Carine");
});

test("volunteers use strongest identities, exclude current user, and do not merge first-name peers", () => {
  const wedstrijd = source("11:30");
  const generated = assignment(90, ["2026-09-05|11:30"], [
    { id: 8, userId: 42, firstName: "Carine", lastName: "Sinatra" },
    { id: 9, userId: 77, firstName: "Sam", lastName: "Een" },
    { id: 10, userId: 78, firstName: "Sam", lastName: "Twee" },
  ]);
  const { bySlotKey } = buildAvailabilityTasksByCoveredSlotKey([wedstrijd], [generated]);
  const volunteers = getOtherScheduledVolunteers(wedstrijd, {
    directSignups: [{ id: 3, userId: 42, firstName: "Carine", lastName: "Sinatra" }],
    availabilityTasksByCoveredSlotKey: bySlotKey,
    isCurrentUser: (signup) => signup.userId === 77,
  });
  assert.deepEqual(volunteers.map((item) => item.userId), [42, 78]);
});

test("mapped tasks are identified once; malformed and ambiguous legacy tasks stay unmapped", () => {
  const wedstrijd = source("11:30");
  const duplicateBoundary = { ...wedstrijd, teamId: 99 };
  const mapped = assignment(90, ["", null, "2026-09-05|11:30", "2026-09-05|11:30"]);
  const legacy = assignment(91, [], [], { time: "11:30", qty: 270 });
  const malformed = assignment(92, { invalid: true });
  let lookup = buildAvailabilityTasksByCoveredSlotKey([wedstrijd], [mapped, malformed]);
  assert.deepEqual(lookup.bySlotKey.get("2026-09-05|11:30").map((task) => task.id), [90]);
  assert.deepEqual([...lookup.mappedTaskIds], [90]);
  lookup = buildAvailabilityTasksByCoveredSlotKey([wedstrijd, duplicateBoundary], [legacy]);
  assert.equal(lookup.mappedTaskIds.has(91), false, "ambiguous exact legacy boundaries are not guessed");
});

test("availability loading remains bulk-only and generated tasks are non-selectable fallbacks", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "availability.js"), "utf8");
  assert.match(js, /buildAvailabilityTasksByCoveredSlotKey\(sourceShifts, availabilityAssignments\)/);
  assert.match(js, /checkbox\.disabled = isAvailabilityAssignmentFallback\(task\)/);
  assert.match(js, /getOtherScheduledVolunteers\(task/);
  assert.doesNotMatch(js, /loadMonth[\s\S]*?JVGHApi\.createSignup/);
});

test("backend canonicalizes only reused availability task titles", () => {
  const php = fs.readFileSync(path.join(__dirname, "..", "wordpress", "jvgh-availability-assignments.php"), "utf8");
  assert.match(php, /array_intersect_key\(\$existing, \$desired\)/);
  assert.match(php, /\$canonical_title = "Kantinedienst \{\$assignment\['startTime'\]\}–\{\$assignment\['endTime'\]\}"/);
  assert.match(php, /'PUT',[\s\S]*?'title' => \$canonical_title/);
});

test("direct Ive signup maps by structured start and reconstructs the source intersection", () => {
  const shift = source("08:30", "Wedstrijd", 1, "13:00");
  const ive = { id: 14054, userId: 1, firstName: "Ive Vanlee", lastName: "" };
  const direct = { id: 14053, date: "2026-09-05", time: "08:30", qty: 300,
    title: "Kantinedienst 08:30", signups: [ive] };
  assert.equal(isLegacyPlannerAssignment(direct), true);
  const mapped = mapLegacyPlannerTasks([shift], [direct]);
  assert.deepEqual(mapped.bySourceSlotKey.get("2026-09-05|08:30").map((task) => task.id), [14053]);
  assert.equal(mapped.mappingReasonByTaskId.get(14053), "exact-start");
  const selection = reconstructDirectSelection(shift, direct, ive, "exact-start");
  assert.equal(selection.interval.start.getHours(), 8);
  assert.equal(selection.interval.start.getMinutes(), 30);
  assert.equal(selection.interval.end.getHours(), 13, "persisted 13:30 is capped at source end");
  assert.equal(selection.userSignupTaskId, 14053);
  assert.equal(selection.originSignupId, 14054);
  assert.equal(selection.persistenceOrigin, "direct");
});

test("Carine fallback chooses latest containing shift and ignores the stale title", () => {
  const shifts = [source("08:30", "A", 1, "13:00"), source("10:00", "B", 1, "14:30"),
    source("11:30", "C", 1, "16:00")];
  const carine = { id: 14172, userId: 990002, firstName: "Carine", lastName: "Sinatra" };
  const legacy = { id: 14171, date: "2026-09-05", time: "10:30", qty: 330,
    title: "Kantinedienst 08:30", signups: [carine] };
  const range = getTaskRange(legacy);
  assert.equal(`${range.start.getHours()}:${String(range.start.getMinutes()).padStart(2, "0")}`, "10:30");
  assert.equal(`${range.end.getHours()}:${String(range.end.getMinutes()).padStart(2, "0")}`, "16:00");
  const mapped = mapLegacyPlannerTasks(shifts, [legacy]);
  assert.equal(mapped.bySourceSlotKey.get("2026-09-05|10:00")[0].id, 14171);
  assert.equal(mapped.mappedTaskIds.has(14171), true);
  assert.equal(mapped.unmappedTasks.length, 0);
  const volunteers = getOtherScheduledVolunteers(shifts[1], {
    directSignups: [], legacyTasksBySourceSlotKey: mapped.bySourceSlotKey,
    signupsByTask: new Map([["14171", [carine]]]),
  });
  assert.deepEqual(volunteers.map((signup) => `${signup.firstName} ${signup.lastName}`), ["Carine Sinatra"]);
  assert.deepEqual(legacy.signups, [carine], "mapping does not copy or move the persisted signup");
});

test("legacy fallback is same-day, positive-overlap, signup-backed, and leaves unsafe tasks standalone", () => {
  const shift = source("10:00", "Wedstrijd", 1, "14:30");
  const noOverlap = { id: 1, date: "2026-09-05", time: "15:00", qty: 60, signups: [{ id: 2 }] };
  const nextDay = { ...noOverlap, id: 3, date: "2026-09-06", time: "10:30" };
  const empty = { id: 4, date: "2026-09-05", time: "10:30", qty: 60, signups: [] };
  const generated = { ...empty, id: 5, jvghSource: "availability", signups: [{ id: 6 }] };
  const mapped = mapLegacyPlannerTasks([shift], [noOverlap, nextDay, empty, generated]);
  assert.equal(mapped.mappedTaskIds.size, 0);
  assert.deepEqual(mapped.unmappedTasks.map((task) => task.id), [1, 3, 4, 5]);
});

test("load/save separates unchanged direct origins and requests validated atomic migrations", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "availability.js"), "utf8");
  const php = fs.readFileSync(path.join(__dirname, "..", "wordpress", "jvgh-availability-assignments.php"), "utf8");
  assert.match(js, /mapLegacyPlannerTasks\(sourceShifts, ordinaryPersistedTasks\)/);
  assert.match(js, /!\(isLegacyOrigin\(state\) && !isStateDirty\(state\)\)/);
  assert.match(js, /legacySignupMigrations,/);
  assert.match(php, /Legacy-inschrijving behoort niet tot deze gebruiker/);
  assert.match(php, /\/signups\/\{\$migration\['signupId'\]\}/);
  assert.doesNotMatch(php, /tasks\/\{\$migration\['taskId'\]\}"/,
    "migration never deletes the ordinary task itself");
});
