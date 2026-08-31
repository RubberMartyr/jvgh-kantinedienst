"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Ghosts = require("../shared/ghost-shifts.js");
const AvailabilityFilter = require("../availability-filter.js");

const ghost = { id: 33, sheetId: 7, title: "Shift", date: "2026-09-03", time: "00:00", qty: 240 };

test("laatste persoon verwijderd van generieke shift verwijdert ook de task", async () => {
  const calls = [];
  const result = await Ghosts.cleanupAfterSignupDeletion({
    api: { getSignups: async () => ({ signups: [] }), deleteTask: async (...args) => calls.push(args) },
    task: ghost,
  });
  assert.equal(result.deleted, true);
  assert.deepEqual(calls, [[7, 33]]);
});

test("een van meerdere personen verwijderd laat de shift bestaan", async () => {
  let deleted = false;
  const result = await Ghosts.cleanupAfterSignupDeletion({
    api: { getSignups: async () => [{ id: 2 }], deleteTask: async () => { deleted = true; } }, task: ghost,
  });
  assert.equal(result.deleted, false);
  assert.equal(deleted, false);
});

test("lege actuele ICS-shift blijft beschikbaar", () => {
  const source = { start: "2026-09-03T01:00:00Z", end: "2026-09-03T02:00:00Z" };
  assert.equal(Ghosts.inspectGhostShift(ghost, [], [source]).isGhost, false);
});

test("leeg evenement blijft bestaan", () => {
  assert.equal(Ghosts.inspectGhostShift({ ...ghost, sourceType: "event" }, []).isGhost, false);
});

test("generieke ghost zonder bron of signups wordt in dry-run gevonden", async () => {
  const report = await Ghosts.dryRun({ tasks: [ghost], getSignups: async () => [] });
  assert.equal(report.length, 1);
  assert.equal(report[0].taskId, 33);
  assert.equal(report[0].date, "2026-09-03");
  assert.equal(report[0].time, "00:00");
  assert.equal(report[0].signupCount, 0);
});

test("aangepaste inhoud en bewuste open-shiftmetadata worden nooit verwijderd", () => {
  assert.equal(Ghosts.inspectGhostShift({ ...ghost, title: "Kassa" }, []).isGhost, false);
  assert.equal(Ghosts.inspectGhostShift({ ...ghost, description: "Open dienst" }, []).isGhost, false);
  assert.equal(Ghosts.inspectGhostShift({ ...ghost, metadata: { deliberatelyOpen: true } }, []).isGhost, false);
});

test("teamfilter blijft ongewijzigd werken", () => {
  const events = [{ summary: "Herk-De-Stad U11 / Bezoekers" }, { summary: "Herk-De-Stad U17 / Bezoekers" }];
  assert.deepEqual(AvailabilityFilter.filterHomeEventsByTeam(events, "U11"), [events[0]]);
});

test("apply verwijdert uitsluitend ids uit het dry-runrapport en controleert opnieuw", async () => {
  const tasks = [ghost, { ...ghost, id: 34 }];
  const deleted = [];
  const result = await Ghosts.deleteReportedGhostShifts({
    report: [{ taskId: 33 }], tasks,
    getSignups: async () => [],
    deleteTask: async (_scheduleId, taskId) => deleted.push(taskId),
  });
  assert.deepEqual(deleted, [33]);
  assert.equal(result.length, 1);
});
