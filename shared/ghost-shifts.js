(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.JVGHGhostShifts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GENERIC_TITLE = "shift";
  const UNAVAILABLE_TITLES = new Set([
    "ik ben niet beschikbaar deze maand",
    "niet beschikbaar deze maand",
  ]);
  const CONTENT_FIELDS = ["description", "beschrijving", "notes", "note", "opmerking", "comment"];
  const SOURCE_FIELDS = ["source", "sourceType", "source_type", "eventId", "event_id", "icalUid", "ical_uid", "uid"];
  const OPEN_SHIFT_FIELDS = ["metadata", "meta", "requirements", "requiredRole", "required_role", "capacity", "openPlanning", "open_planning"];

  const clean = (value) => String(value ?? "").trim();
  const hasValue = (value) => {
    if (value === null || value === undefined || value === "" || value === false) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  };

  function taskInterval(task) {
    const date = clean(task?.date).slice(0, 10);
    const time = clean(task?.time).slice(0, 5) || "00:00";
    const start = new Date(task?.start || (date ? `${date}T${time}:00` : ""));
    const duration = Number(task?.duration ?? task?.qty);
    const end = new Date(task?.end || (Number.isFinite(duration) && duration >= 60 ? start.getTime() + duration * 60000 : start.getTime() + 4 * 3600000));
    return Number.isNaN(start.getTime()) ? null : { start, end, date, time };
  }

  function hasCurrentSource(task, currentSources = []) {
    if (SOURCE_FIELDS.some((field) => hasValue(task?.[field]))) return true;
    const interval = taskInterval(task);
    if (!interval) return false;
    return currentSources.some((source) => {
      const sourceStart = new Date(source?.start);
      const sourceEnd = new Date(source?.end || source?.start);
      return !Number.isNaN(sourceStart.getTime()) && sourceStart < interval.end && sourceEnd > interval.start;
    });
  }

  function inspectGhostShift(task, signups = [], currentSources = []) {
    const reasons = [];
    const title = clean(task?.title);
    if (Array.isArray(signups) && signups.length) return { isGhost: false, reasons: ["heeft nog signups"] };
    if (UNAVAILABLE_TITLES.has(title.toLowerCase())) return { isGhost: false, reasons: ["maand-onbeschikbaarheid"] };
    if (title.toLowerCase() !== GENERIC_TITLE) return { isGhost: false, reasons: ["aangepaste of betekenisvolle titel"] };
    if (CONTENT_FIELDS.some((field) => clean(task?.[field]))) return { isGhost: false, reasons: ["handmatige beschrijving of opmerking"] };
    if (OPEN_SHIFT_FIELDS.some((field) => hasValue(task?.[field]))) return { isGhost: false, reasons: ["open planningstaak met metadata"] };
    if (hasCurrentSource(task, currentSources)) return { isGhost: false, reasons: ["actuele ICS- of evenementbron"] };
    reasons.push("geen signups", "generieke titel Shift", "geen bron", "geen handmatige inhoud of open-shiftmetadata");
    return { isGhost: true, reasons };
  }

  function reportEntry(task, signups, currentSources) {
    const inspection = inspectGhostShift(task, signups, currentSources);
    const interval = taskInterval(task) || {};
    return {
      taskId: task?.id,
      scheduleId: task?.sheetId ?? task?.scheduleId ?? task?.schedule_id,
      date: interval.date || clean(task?.date).slice(0, 10),
      time: interval.time || clean(task?.time).slice(0, 5),
      title: clean(task?.title),
      signupCount: Array.isArray(signups) ? signups.length : 0,
      reason: inspection.reasons.join("; "),
      isGhost: inspection.isGhost,
    };
  }

  async function cleanupAfterSignupDeletion({ api, task, currentSources = [] }) {
    if (!api || !task?.id) throw new Error("API en task.id zijn verplicht voor ghost-cleanup.");
    const response = await api.getSignups(task.id);
    const signups = Array.isArray(response?.signups) ? response.signups : (Array.isArray(response) ? response : []);
    const entry = reportEntry(task, signups, currentSources);
    if (!entry.isGhost) return { deleted: false, entry, signups };
    const scheduleId = task.sheetId ?? task.scheduleId ?? task.schedule_id;
    if (!scheduleId) throw new Error(`Ghost shift ${task.id} mist scheduleId; veilig verwijderen is niet mogelijk.`);
    await api.deleteTask(scheduleId, task.id);
    return { deleted: true, entry, signups: [] };
  }

  async function dryRun({ tasks, getSignups, currentSources = [] }) {
    const report = [];
    for (const task of tasks || []) {
      const response = await getSignups(task.id);
      const signups = Array.isArray(response?.signups) ? response.signups : (Array.isArray(response) ? response : []);
      const entry = reportEntry(task, signups, currentSources);
      if (entry.isGhost) report.push(entry);
    }
    return report;
  }

  async function deleteReportedGhostShifts({ report, tasks, getSignups, deleteTask, currentSources = [] }) {
    const byId = new Map((tasks || []).map((task) => [String(task.id), task]));
    const deleted = [];
    for (const candidate of report || []) {
      const task = byId.get(String(candidate.taskId));
      if (!task) continue;
      const response = await getSignups(task.id);
      const signups = Array.isArray(response?.signups) ? response.signups : (Array.isArray(response) ? response : []);
      const fresh = reportEntry(task, signups, currentSources);
      if (!fresh.isGhost) continue;
      await deleteTask(fresh.scheduleId, fresh.taskId);
      deleted.push(fresh);
    }
    return deleted;
  }

  return { inspectGhostShift, reportEntry, cleanupAfterSignupDeletion, dryRun, deleteReportedGhostShifts };
});
