"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ghosts = require("../shared/ghost-shifts.js");
const AvailabilityFilter = require("../availability-filter.js");

const ghost = { id: 33, sheetId: 7, title: "Shift", date: "2026-09-03", time: "00:00", qty: 240 };
const loaded = { peopleLoaded: true };

test("expliciete nachtelijke planningsghost zonder actuele ICS-shift", () => {
  const ghost = {
    date: "2026-09-03",
    time: "00:00",
    title: "Kantinedienst 00:00",
    sourceReason: "Handmatige/plannings-taak",
    signups: [],
    assignments: [],
    icsSummary: ""
  };
  const context = { peopleLoaded: true, hasCalendarMatch: false };

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
  assert.equal(Ghosts.isGhostShift({ ...ghost, title: "" }, loaded), true);
});

test("filter wacht tot signup- en assignmentinformatie geladen is", () => {
  assert.equal(Ghosts.isGhostShift(ghost), false);
  assert.equal(Ghosts.isGhostShift(ghost, { peopleLoaded: false }), false);
});

test("alle ondersteunde persoonsvelden houden een taak zichtbaar", () => {
  for (const field of ["signups", "assignments", "volunteers", "users"]) {
    assert.equal(Ghosts.isGhostShift(ghost, { ...loaded, [field]: [{ id: 1 }] }), false, field);
  }
});

test("lokale selectie van huidige gebruiker blijft zichtbaar", () => {
  assert.equal(Ghosts.isGhostShift(ghost, { ...loaded, currentUserSelected: true }), false);
  assert.equal(Ghosts.isGhostShift(ghost, { ...loaded, currentUserAvailability: true }), false);
});

test("kalenderdiensten en betekenisvolle activiteiten blijven zichtbaar", () => {
  assert.equal(Ghosts.isGhostShift({ ...ghost, icsSummary: "JVGH - KSK" }, loaded), false);
  assert.equal(Ghosts.isGhostShift({ ...ghost, sourceType: "match" }, loaded), false);
  assert.equal(Ghosts.isGhostShift({ ...ghost, sourceType: "event" }, loaded), false);
  assert.equal(Ghosts.isGhostShift({ ...ghost, category: "verhuur" }, loaded), false);
  assert.equal(Ghosts.isGhostShift({ ...ghost, boardActivity: true }, loaded), false);
  assert.equal(Ghosts.isGhostShift(ghost, { ...loaded, hasCalendarMatch: true }), false);
});

test("maand-onbeschikbaarheid wordt niet als ghost behandeld", () => {
  assert.equal(Ghosts.isGhostShift({ ...ghost, title: "Ik ben niet beschikbaar deze maand" }, loaded), false);
  assert.equal(Ghosts.isGhostShift({ ...ghost, title: "Niet beschikbaar deze maand" }, loaded), false);
});

test("filter verwijdert alleen uit de rendercollectie en logt ids", () => {
  const originalInfo = console.info;
  let diagnostic;
  console.info = (_label, details) => { diagnostic = details; };
  try {
    const tasks = [ghost, { ...ghost, id: 34, signups: [{ id: 1 }] }];
    const visible = Ghosts.filterGhostShifts(tasks, (task) => ({ ...loaded, signups: task.signups }));
    assert.deepEqual(visible.map((task) => task.id), [34]);
    assert.deepEqual(diagnostic, { hiddenCount: 1, hiddenTaskIds: [33] });
    assert.equal(tasks.length, 2, "broncollectie blijft intact");
  } finally {
    console.info = originalInfo;
  }
});

test("gedeelde ghostfilter bevat geen backend-deletepad", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "shared/ghost-shifts.js"), "utf8");
  assert.doesNotMatch(source, /delete(?:Task|Signup|Schedule)\s*\(/);
  assert.doesNotMatch(source, /JVGHApi/);
});

test("teamfilter blijft ongewijzigd werken", () => {
  const events = [{ summary: "Herk-De-Stad U11 / Bezoekers" }, { summary: "Herk-De-Stad U17 / Bezoekers" }];
  assert.deepEqual(AvailabilityFilter.filterHomeEventsByTeam(events, "U11"), [events[0]]);
});
