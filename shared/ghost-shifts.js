(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.JVGHGhostShifts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const UNAVAILABLE_TITLES = new Set(["ik ben niet beschikbaar deze maand", "niet beschikbaar deze maand"]);
  const PEOPLE_FIELDS = ["signups", "assignments", "volunteers", "users"];
  const CONTENT_FIELDS = ["description", "beschrijving", "notes", "note", "opmerking", "comment", "remarks", "remark"];
  const SOURCE_FIELDS = ["source", "sourceType", "source_type", "sourceLabel", "calendarSource", "calendar_source", "eventId", "event_id", "icalUid", "ical_uid", "uid"];
  const MEANING_FIELDS = ["requirements", "requiredRole", "required_role", "openPlanning", "open_planning", "category", "categories", "type", "eventType", "event_type", "kind", "location", "venue", "team", "teamId", "team_id", "matchId", "match_id", "rentalId", "rental_id", "boardActivity", "board_activity"];
  const GENERATED_METADATA_KEYS = new Set(["date", "datum", "time", "tijd", "start", "end", "einde", "qty", "duration", "id", "taskid", "scheduleid", "schedule_id", "color", "colour", "kleur", "title", "sourcereason"]);
  const clean = (value) => String(value ?? "").trim();
  const hasValue = (value) => {
    if (value === null || value === undefined || value === "" || value === false) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  };

  function isGenericShiftTitle(value) {
    const title = String(value || "")
      .trim()
      .replace(/\s+/g, " ");

    return (
      title === "" ||
      /^shift$/i.test(title) ||
      /^kantinedienst$/i.test(title) ||
      /^kantinedienst\s+\d{1,2}:\d{2}$/i.test(title)
    );
  }

  function hasMeaningfulMetadata(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return hasValue(value);
    return Object.entries(value).some(([key, item]) =>
      !GENERATED_METADATA_KEYS.has(String(key).replace(/[\s-]/g, "").toLowerCase()) && hasValue(item)
    );
  }

  // Purely visual predicate: an incomplete people request must never hide a task.
  function isGhostShift(task, context = {}) {
    const signupCount = PEOPLE_FIELDS.reduce((count, field) => {
      const people = hasValue(context[field]) ? context[field] : task?.[field];
      return count + (Array.isArray(people) ? people.length : (hasValue(people) ? 1 : 0));
    }, 0);
    const currentUserSelected = context.currentUserSelected === true || context.currentUserAvailability === true;
    const hasCalendarMatch = context.hasCalendarMatch === true;
    const rawTitle = clean(task?.title).toLowerCase();
    const genericTitle = isGenericShiftTitle(task?.title);
    const sourceReason = clean(task?.sourceReason);
    const genericSourceReason = sourceReason === "" || sourceReason.toLowerCase() === "handmatige/plannings-taak";
    const isGhost = Boolean(task) && context.peopleLoaded === true &&
      !UNAVAILABLE_TITLES.has(rawTitle) && genericTitle && !currentUserSelected && signupCount === 0 &&
      !hasCalendarMatch && genericSourceReason && !hasValue(task.icsSummary) && !hasValue(task.ics_summary) &&
      !CONTENT_FIELDS.some((field) => hasValue(task[field])) &&
      !SOURCE_FIELDS.some((field) => hasValue(task[field])) &&
      !MEANING_FIELDS.some((field) => hasValue(task[field])) &&
      !hasMeaningfulMetadata(task.metadata) && !hasMeaningfulMetadata(task.meta);

    console.info("[ghost-shift-filter]", {
      taskId: task?.id,
      rawTitle: task?.title,
      genericTitle,
      signupCount,
      currentUserSelected,
      hasCalendarMatch,
      isGhost,
    });
    return isGhost;
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

  return { isGenericShiftTitle, isGhostShift, filterGhostShifts };
});
