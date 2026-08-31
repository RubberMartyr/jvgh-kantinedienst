(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.JVGHGhostShifts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const UNAVAILABLE_TITLES = new Set(["ik ben niet beschikbaar deze maand", "niet beschikbaar deze maand"]);
  const PEOPLE_FIELDS = ["signups", "assignments", "volunteers", "users"];
  const CONTENT_FIELDS = ["description", "beschrijving", "notes", "note", "opmerking", "comment", "remarks", "remark"];
  const SOURCE_FIELDS = ["source", "sourceType", "source_type", "sourceReason", "sourceLabel", "icsSummary", "ics_summary", "calendarSource", "calendar_source", "eventId", "event_id", "icalUid", "ical_uid", "uid"];
  const MEANING_FIELDS = ["metadata", "meta", "requirements", "requiredRole", "required_role", "openPlanning", "open_planning", "category", "categories", "type", "eventType", "event_type", "kind", "location", "venue", "team", "teamId", "team_id", "matchId", "match_id", "rentalId", "rental_id", "boardActivity", "board_activity"];
  const clean = (value) => String(value ?? "").trim();
  const hasValue = (value) => {
    if (value === null || value === undefined || value === "" || value === false) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  };

  // Purely visual predicate: an incomplete people request must never hide a task.
  function isGhostShift(task, context = {}) {
    if (!task || context.peopleLoaded !== true) return false;
    const title = clean(task.title).toLowerCase();
    if (UNAVAILABLE_TITLES.has(title) || (title && title !== "shift")) return false;
    if (context.currentUserSelected === true || context.currentUserAvailability === true) return false;
    if (PEOPLE_FIELDS.some((field) => hasValue(task[field]) || hasValue(context[field]))) return false;
    if (CONTENT_FIELDS.some((field) => hasValue(task[field]))) return false;
    if (SOURCE_FIELDS.some((field) => hasValue(task[field]))) return false;
    if (MEANING_FIELDS.some((field) => hasValue(task[field]))) return false;
    return true;
  }

  function filterGhostShifts(tasks, contextForTask = () => ({})) {
    const hiddenTaskIds = [];
    const visible = (tasks || []).filter((task) => {
      const hidden = isGhostShift(task, contextForTask(task) || {});
      if (hidden) hiddenTaskIds.push(task?.id);
      return !hidden;
    });
    console.info("[ghost-shift-filter]", { hiddenCount: hiddenTaskIds.length, hiddenTaskIds });
    return visible;
  }

  return { isGhostShift, filterGhostShifts };
});
