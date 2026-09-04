(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.JVGHAvailabilityVolunteers = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clean = (value) => String(value ?? "").trim();
  const positiveInteger = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  };

  function sourceSlotKey(task) {
    const date = clean(task?.date).slice(0, 10);
    const time = clean(task?.time ?? task?.startTime).slice(0, 5);
    return date && time ? `${date}|${time}` : "";
  }

  function taskBoundaryKey(task) {
    const startKey = sourceSlotKey(task);
    if (!startKey) return "";
    let end = clean(task?.endTime).slice(0, 5);
    if (!end) {
      const [hours, minutes] = startKey.slice(-5).split(":").map(Number);
      const qty = Number(task?.qty);
      if (Number.isFinite(qty) && qty > 0) {
        const total = hours * 60 + minutes + qty;
        end = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      }
    }
    return end ? `${startKey}|${end}` : "";
  }

  function normalizeCoveredSlotKeys(value) {
    if (Array.isArray(value)) return Array.from(new Set(value
      .filter((key) => typeof key === "string")
      .map((key) => key.trim()).filter(Boolean)));
    if (typeof value !== "string" || !value.trim()) return [];
    try {
      const decoded = JSON.parse(value);
      if (Array.isArray(decoded)) return normalizeCoveredSlotKeys(decoded);
    } catch (_) { /* Legacy comma-delimited metadata. */ }
    return Array.from(new Set(value.split(",").map((key) => key.trim()).filter(Boolean)));
  }

  /** Build the authoritative covered-slot lookup and a conservative legacy fallback. */
  function buildAvailabilityTasksByCoveredSlotKey(sourceShifts, availabilityTasks) {
    const bySlotKey = new Map();
    const mappedTaskIds = new Set();
    const sourceByBoundary = new Map();
    const visibleSlotKeys = new Set();
    sourceShifts.forEach((source) => {
      const slotKey = sourceSlotKey(source);
      if (slotKey) visibleSlotKeys.add(slotKey);
      const boundary = taskBoundaryKey(source);
      if (!boundary) return;
      if (!sourceByBoundary.has(boundary)) sourceByBoundary.set(boundary, []);
      sourceByBoundary.get(boundary).push(source);
    });
    const add = (key, task) => {
      if (!bySlotKey.has(key)) bySlotKey.set(key, []);
      const tasks = bySlotKey.get(key);
      const id = positiveInteger(task?.id);
      if (!tasks.some((candidate) => id !== null && positiveInteger(candidate?.id) === id || candidate === task)) {
        tasks.push(task);
      }
      if (id !== null) mappedTaskIds.add(id);
    };
    availabilityTasks.forEach((task) => {
      const covered = normalizeCoveredSlotKeys(task?.jvghCoveredSlots ?? task?.coveredSlotKeys);
      if (covered.length) {
        covered.filter((key) => visibleSlotKeys.has(key)).forEach((key) => add(key, task));
        return;
      }
      // Legacy data is mapped only when exact boundaries identify one source unambiguously.
      const exactSources = sourceByBoundary.get(taskBoundaryKey(task)) || [];
      if (exactSources.length === 1) add(sourceSlotKey(exactSources[0]), task);
    });
    return { bySlotKey, mappedTaskIds };
  }

  function signupIdentity(signup) {
    const userId = positiveInteger(signup?.userId ?? signup?.user_id);
    if (userId) return `user:${userId}`;
    const signupId = positiveInteger(signup?.id);
    const taskId = positiveInteger(signup?.__taskId ?? signup?.taskId ?? signup?.task_id);
    if (signupId && taskId) return `signup:${taskId}:${signupId}`;
    const phone = clean(signup?.phone).replace(/\D/g, "");
    if (phone) return `phone:${phone}`;
    const email = clean(signup?.email).toLocaleLowerCase();
    if (email) return `email:${email}`;
    const name = clean(signup?.displayName ?? signup?.name ??
      `${clean(signup?.firstName ?? signup?.first_name)} ${clean(signup?.lastName ?? signup?.last_name)}`)
      .replace(/\s+/g, " ").toLocaleLowerCase();
    return name ? `name:${name}` : null;
  }

  function getOtherScheduledVolunteers(sourceTask, context) {
    const direct = Array.isArray(context?.directSignups) ? context.directSignups : [];
    const assignments = context?.availabilityTasksByCoveredSlotKey?.get(sourceSlotKey(sourceTask)) || [];
    const candidates = [...direct];
    assignments.forEach((task) => {
      const taskId = positiveInteger(task?.id);
      const signups = context?.signupsByTask?.get(String(task?.id)) || task?.signups || [];
      signups.forEach((signup) => candidates.push({ ...signup, __taskId: taskId }));
    });
    const seen = new Set();
    return candidates.filter((signup) => {
      if (context?.isCurrentUser?.(signup)) return false;
      const identity = signupIdentity(signup);
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }

  return { buildAvailabilityTasksByCoveredSlotKey, getOtherScheduledVolunteers,
    normalizeCoveredSlotKeys, signupIdentity, sourceSlotKey, taskBoundaryKey };
});
