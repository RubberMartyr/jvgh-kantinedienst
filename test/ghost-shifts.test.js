"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ghosts = require("../shared/ghost-shifts.js");
const AvailabilityFilter = require("../availability-filter.js");

const ghost = { id: 33, sheetId: 7, title: "Shift", date: "2026-09-03", time: "00:00", qty: 240 };
const loaded = { signupCollectionLoaded: true, signups: [] };

test("expliciete nachtelijke planningsghost zonder actuele ICS-shift", () => {
  const ghost = {
    id: 33,
    date: "2026-09-03",
    time: "00:00",
    title: "Kantinedienst 00:00",
    sourceReason: "Handmatige/plannings-taak",
    signups: [],
    assignments: [],
    icsSummary: ""
  };
  const context = { signupCollectionLoaded: true, signups: [], hasCalendarMatch: false };

  assert.equal(Ghosts.isGhostShift(ghost, context), true);
});

test("alle ondersteunde generieke shifttitels worden herkend", () => {
  for (const title of ["Shift", "Kantinedienst", "Kantinedienst 00:00", "Kantinedienst 8:30", "Kantinedienst 08:30"]) {
    assert.equal(Ghosts.isGenericShiftTitle(title), true, title);
  }
  assert.equal(Ghosts.isGenericShiftTitle("Wedstrijd U6"), false);
});

test("generieke taak zonder personen of bron is een ghost", () => {
  assert.equal(Ghosts.isGhostShift(ghost, loaded), true);
  assert.equal(Ghosts.isGhostShift({ ...ghost, title: "" }, loaded), false);
});

test("filter wacht tot signup- en assignmentinformatie geladen is", () => {
  assert.equal(Ghosts.isGhostShift(ghost), false);
  assert.equal(Ghosts.isGhostShift(ghost, { signupCollectionLoaded: false }), false);
  assert.equal(Ghosts.isGhostShift({ ...ghost, id: null }, loaded), false);
});

test("canonieke signupcollectie houdt een taak zichtbaar", () => {
  assert.equal(Ghosts.isGhostShift(ghost, { ...loaded, signups: [{ id: 1 }] }), false);
  assert.equal(Ghosts.isGhostShift({ ...ghost, signups: [{ id: 1 }] }, loaded), true,
    "embedded taskvelden zijn niet de canonieke renderbron");
});

test("lokale selectie van huidige gebruiker blijft zichtbaar", () => {
  assert.equal(Ghosts.isGhostShift(ghost, { ...loaded, currentUserSelected: true }), false);
});

test("kalenderinhoud en actuele kalenderovereenkomsten blijven zichtbaar", () => {
  assert.equal(Ghosts.isGhostShift({ ...ghost, icsSummary: "JVGH - KSK" }, loaded), false);
  assert.equal(Ghosts.isGhostShift(ghost, { ...loaded, hasCalendarMatch: true }), false);
});

test("incidentele source-, type- en metadatavelden beschermen een ghost niet", () => {
  assert.equal(Ghosts.isGhostShift({ ...ghost, source: "manual" }, loaded), true);
  assert.equal(Ghosts.isGhostShift({ ...ghost, type: "shift" }, loaded), true);
  assert.equal(Ghosts.isGhostShift({ ...ghost, metadata: { imported: true } }, loaded), true);
});

test("taskId-aliassen en signupCount worden ondersteund", () => {
  const { id, ...withoutId } = ghost;
  assert.equal(Ghosts.isGhostShift({ ...withoutId, task_id: id }, loaded), true);
  assert.equal(Ghosts.isGhostShift(ghost, { signupCollectionLoaded: true, signupCount: 1 }), false);
});

test("maand-onbeschikbaarheid wordt niet als ghost behandeld", () => {
  assert.equal(Ghosts.isGhostShift({ ...ghost, title: "Ik ben niet beschikbaar deze maand" }, loaded), false);
  assert.equal(Ghosts.isGhostShift({ ...ghost, title: "Niet beschikbaar deze maand" }, loaded), false);
});

test("filter verwijdert alleen uit de rendercollectie", () => {
    const tasks = [ghost, { ...ghost, id: 34, signups: [{ id: 1 }] }];
    const visible = Ghosts.filterGhostShifts(tasks, (task) => ({ ...loaded, signups: task.signups }));
    assert.deepEqual(visible.map((task) => task.id), [34]);
    assert.equal(tasks.length, 2, "broncollectie blijft intact");
});

test("gedeelde ghostfilter bevat geen backend-deletepad", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "shared/ghost-shifts.js"), "utf8");
  assert.doesNotMatch(source, /delete(?:Task|Signup|Schedule)\s*\(/);
  assert.doesNotMatch(source, /JVGHApi/);
});

test("teamfilter blijft ongewijzigd werken", () => {
  const events = [{ summary: "U11 — Herk-De-Stad / Bezoekers" }, { summary: "U17 — Herk-De-Stad / Bezoekers" }];
  assert.deepEqual(AvailabilityFilter.filterHomeEventsByTeam(events, "U11"), [events[0]]);
});
