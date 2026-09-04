"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildAvailabilityTasksByCoveredSlotKey,
  getOtherScheduledVolunteers,
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
