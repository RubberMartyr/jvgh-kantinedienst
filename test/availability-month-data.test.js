"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createMonthDataLoader } = require("../availability-month-data.js");
const Ghosts = require("../shared/ghost-shifts.js");

test("availability loads 20 tasks and their authoritative signups in one bulk request", async () => {
  const calls = { planner: 0, month: 0, signups: 0 };
  const tasks = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    title: index === 19 ? "Kantinedienst 00:00" : `Wedstrijd U${index + 6}`,
    date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    time: index === 19 ? "00:00" : "10:00",
    signups: index === 19 ? [] : [{ id: 100 + index, userId: index === 0 ? 42 : 99 }],
  }));
  const api = {
    async getPlannerMonthData(monthKey) {
      calls.planner += 1;
      assert.equal(monthKey, "2026-09");
      return { schedules: [{ id: 7, start: "2026-09-01", tasks }] };
    },
    async getMonthData() { calls.month += 1; },
    async getSignups() { calls.signups += 1; },
  };

  const loader = createMonthDataLoader(api);
  const month = await loader.load("2026-09");

  assert.deepEqual(calls, { planner: 1, month: 0, signups: 0 });
  assert.equal(month.tasks.length, 20);
  assert.equal(month.scheduleByDay.get("2026-09-01"), 7);
  tasks.forEach((task) => assert.deepEqual(month.signupsByTask.get(String(task.id)), task.signups));

  const checked = month.signupsByTask.get("1").some((signup) => signup.userId === 42);
  assert.equal(checked, true, "the bundled signup keeps the user's checkbox selected");
  const visible = month.tasks.filter((task) => !Ghosts.isGhostShift(task, {
    signupCollectionLoaded: true,
    signups: month.signupsByTask.get(String(task.id)),
    currentUserSelected: month.signupsByTask.get(String(task.id)).some((signup) => signup.userId === 42),
    hasCalendarMatch: false,
  }));
  assert.equal(visible.length, 19, "the empty generic ghost shift remains filtered");

  await loader.load("2026-09");
  assert.equal(calls.planner, 1, "the in-memory month cache prevents duplicate normal loads");
  loader.invalidate("2026-09");
  await loader.load("2026-09");
  assert.deepEqual(calls, { planner: 2, month: 0, signups: 0 },
    "after save invalidation, one fresh bulk request is enough");
});
