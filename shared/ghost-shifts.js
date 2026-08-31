(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.JVGHGhostShifts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isGenericShiftTitle(value) {
    const title = String(value || "")
      .trim()
      .replace(/\s+/g, " ");

    return (
      /^shift$/i.test(title) ||
      /^kantinedienst$/i.test(title) ||
      /^kantinedienst\s+\d{1,2}:\d{2}$/i.test(title)
    );
  }

  // Purely visual predicate: an incomplete people request must never hide a task.
  function isGhostShift(task, context = {}) {
    if (!task) return false;
    if (context.signupCollectionLoaded !== true) return false;

    const taskId = task.id ?? task.taskId ?? task.task_id;
    if (taskId === null || taskId === undefined || taskId === "") return false;

    const title = String(task.title || "").trim();
    const sourceReason = String(task.sourceReason || task.source_reason || "")
      .trim()
      .toLowerCase();
    const genericTitle =
      /^shift$/i.test(title) ||
      /^kantinedienst$/i.test(title) ||
      /^kantinedienst\s+\d{1,2}:\d{2}$/i.test(title);
    const genericReason = sourceReason === "" || sourceReason === "handmatige/plannings-taak";
    const signupCount = Array.isArray(context.signups)
      ? context.signups.length
      : Number(context.signupCount || 0);

    return genericTitle && genericReason && signupCount === 0 &&
      context.currentUserSelected !== true && context.hasCalendarMatch !== true &&
      !task.icsSummary && !task.ics_summary && !task.description && !task.notes &&
      !task.opmerking;
  }

  function filterGhostShifts(tasks, contextForTask = () => ({})) {
    const hiddenTaskIds = [];
    const visible = (tasks || []).filter((task) => {
      const hidden = isGhostShift(task, contextForTask(task) || {});
      if (hidden) hiddenTaskIds.push(task?.id);
      return !hidden;
    });
    return visible;
  }

  return { isGenericShiftTitle, isGhostShift, filterGhostShifts };
});
