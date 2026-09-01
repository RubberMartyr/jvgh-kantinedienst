(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.JVGHAvailabilityMonthData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizePlannerMonthData(response) {
    const tasks = [];
    const signupsByTask = new Map();
    const scheduleByDay = new Map();
    const schedules = Array.isArray(response?.schedules) ? response.schedules : [];
    schedules.forEach((schedule) => {
      const day = String(schedule?.start || "").slice(0, 10);
      if (day) scheduleByDay.set(day, schedule.id);
      const scheduleTasks = Array.isArray(schedule?.tasks) ? schedule.tasks : [];
      scheduleTasks.forEach((task) => {
        tasks.push({ ...task, sheetId: schedule.id });
        signupsByTask.set(String(task.id), Array.isArray(task.signups) ? task.signups : []);
      });
    });
    tasks.sort((a, b) =>
      `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`)
    );
    return { tasks, signupsByTask, scheduleByDay };
  }

  function createMonthDataLoader(api) {
    const cache = new Map();
    return {
      async load(monthKey) {
        if (!cache.has(monthKey)) {
          cache.set(monthKey, Promise.resolve(api.getPlannerMonthData(monthKey))
            .then(normalizePlannerMonthData)
            .catch((error) => { cache.delete(monthKey); throw error; }));
        }
        return cache.get(monthKey);
      },
      invalidate(monthKey) {
        if (monthKey) cache.delete(monthKey);
        else cache.clear();
      },
    };
  }

  return { createMonthDataLoader, normalizePlannerMonthData };
});
