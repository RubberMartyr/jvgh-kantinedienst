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

  function isAvailabilityCreatedTask(task) {
    return clean(task?.jvghSource ?? task?._jvgh_source ?? task?.meta?._jvgh_source) === "availability";
  }

  function getTaskRange(task) {
    const date = clean(task?.date).slice(0, 10);
    const time = clean(task?.time ?? task?.startTime).slice(0, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
    const start = new Date(`${date}T${time}:00`);
    if (Number.isNaN(start.getTime())) return null;
    let end = null;
    const endTime = clean(task?.endTime).slice(0, 5);
    if (/^\d{2}:\d{2}$/.test(endTime)) end = new Date(`${date}T${endTime}:00`);
    if (!end || Number.isNaN(end.getTime()) || end <= start) {
      const qty = Number(task?.qty);
      if (!Number.isFinite(qty) || qty <= 0) return null;
      end = new Date(start.getTime() + qty * 60000);
    }
    return end > start ? { start, end } : null;
  }

  function intersectRanges(first, second) {
    if (!first || !second) return null;
    const start = new Date(Math.max(first.start.getTime(), second.start.getTime()));
    const end = new Date(Math.min(first.end.getTime(), second.end.getTime()));
    return start < end ? { start, end } : null;
  }

  function isLegacyPlannerAssignment(task) {
    return Boolean(positiveInteger(task?.id) && !isAvailabilityCreatedTask(task) &&
      !task?.isMonthUnavailableDummy && !task?.isAvailabilityAssignmentFallback);
  }

  function buildVisibleSourceShiftIndexes(sourceShifts) {
    const exactBySlotKey = new Map();
    const byDate = new Map();
    sourceShifts.forEach((shift) => {
      const key = sourceSlotKey(shift);
      const range = getTaskRange(shift);
      if (!key || !range) return;
      // sourceShifts are visual (already grouped), so a stable key identifies that visual card.
      if (!exactBySlotKey.has(key)) exactBySlotKey.set(key, shift);
      const date = key.slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, []);
      if (!byDate.get(date).includes(shift)) byDate.get(date).push(shift);
    });
    return { exactBySlotKey, byDate };
  }

  function mapLegacyPlannerTasks(sourceShifts, persistedTasks) {
    const indexes = buildVisibleSourceShiftIndexes(sourceShifts);
    const bySourceSlotKey = new Map();
    const mappedTaskIds = new Set();
    const mappingReasonByTaskId = new Map();
    const unmappedTasks = [];
    const add = (source, task, reason) => {
      const key = sourceSlotKey(source);
      if (!bySourceSlotKey.has(key)) bySourceSlotKey.set(key, []);
      bySourceSlotKey.get(key).push(task);
      mappedTaskIds.add(positiveInteger(task.id));
      mappingReasonByTaskId.set(positiveInteger(task.id), reason);
    };
    persistedTasks.forEach((task) => {
      if (!isLegacyPlannerAssignment(task) || normalizeCoveredSlotKeys(task?.jvghCoveredSlots).length) {
        unmappedTasks.push(task); return;
      }
      const taskRange = getTaskRange(task);
      const key = sourceSlotKey(task);
      const exact = indexes.exactBySlotKey.get(key);
      if (taskRange && exact && intersectRanges(taskRange, getTaskRange(exact))) {
        add(exact, task, "exact-start"); return;
      }
      const signups = Array.isArray(task?.signups) ? task.signups : [];
      if (!taskRange || !signups.length) { unmappedTasks.push(task); return; }
      const date = key.slice(0, 10);
      const candidates = (indexes.byDate.get(date) || []).map((source) => {
        const range = getTaskRange(source);
        const intersection = intersectRanges(taskRange, range);
        return { source, range, overlap: intersection ? intersection.end - intersection.start : 0,
          containsStart: range && range.start <= taskRange.start && taskRange.start < range.end };
      }).filter((candidate) => candidate.overlap > 0 && candidate.range)
        .sort((a, b) => Number(b.containsStart) - Number(a.containsStart) ||
          (a.containsStart && b.containsStart ? b.range.start - a.range.start : 0) ||
          b.overlap - a.overlap || sourceSlotKey(a.source).localeCompare(sourceSlotKey(b.source)));
      if (!candidates.length || !candidates[0].containsStart) { unmappedTasks.push(task); return; }
      add(candidates[0].source, task, "contains-task-start");
    });
    return { bySourceSlotKey, mappedTaskIds, unmappedTasks, mappingReasonByTaskId };
  }

  function reconstructDirectSelection(sourceShift, persistedTask, signup, reason = "exact-start") {
    const interval = intersectRanges(getTaskRange(sourceShift), getTaskRange(persistedTask));
    if (!interval || !signup) return null;
    return { interval, signup, userSignupTaskId: positiveInteger(persistedTask?.id),
      originTaskId: positiveInteger(persistedTask?.id), originSignupId: positiveInteger(signup?.id),
      originTaskRange: getTaskRange(persistedTask), persistenceOrigin: reason === "exact-start" ? "direct" : "legacy-mapped" };
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
    const legacyAssignments = context?.legacyTasksBySourceSlotKey?.get(sourceSlotKey(sourceTask)) || [];
    const candidates = [...direct];
    assignments.forEach((task) => {
      const taskId = positiveInteger(task?.id);
      const signups = context?.signupsByTask?.get(String(task?.id)) || task?.signups || [];
      signups.forEach((signup) => candidates.push({ ...signup, __taskId: taskId }));
    });
    legacyAssignments.forEach((task) => {
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

  return { buildAvailabilityTasksByCoveredSlotKey, buildVisibleSourceShiftIndexes,
    getOtherScheduledVolunteers, getTaskRange, intersectRanges, isAvailabilityCreatedTask,
    isLegacyPlannerAssignment, mapLegacyPlannerTasks, reconstructDirectSelection,
    normalizeCoveredSlotKeys, signupIdentity, sourceSlotKey, taskBoundaryKey };
});
