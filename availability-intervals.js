(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.JVGHAvailabilityIntervals = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const pad2 = (value) => String(value).padStart(2, "0");
  const localDateKey = (date) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const localTime = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

  function getMatchAvailabilityWindow(matchStart, matchEnd) {
    if (!(matchStart instanceof Date) || !(matchEnd instanceof Date) ||
        !Number.isFinite(matchStart.getTime()) || !Number.isFinite(matchEnd.getTime())) {
      throw new TypeError("Wedstrijdstart en -einde moeten geldige datums zijn.");
    }
    if (matchEnd.getTime() <= matchStart.getTime()) {
      throw new RangeError("Het wedstrijdeinde moet na de wedstrijdstart liggen.");
    }
    const buffer = 60 * 60 * 1000;
    return {
      start: new Date(matchStart.getTime() - buffer),
      end: new Date(matchEnd.getTime() + buffer),
    };
  }

  function parseTimeToMinutes(time) {
    const match = String(time || "").match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
  }

  function formatMinutesAsTime(minutes) {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) return null;
    return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
  }

  function buildQuarterHourOptions(startTime, endTime, additionalTimes = []) {
    const start = parseTimeToMinutes(startTime);
    const end = parseTimeToMinutes(endTime);
    if (start === null || end === null || end <= start) return [];
    const values = [start];
    for (let value = Math.ceil((start + 1) / 15) * 15; value < end; value += 15) values.push(value);
    values.push(end);
    for (const time of additionalTimes) {
      const value = parseTimeToMinutes(time);
      if (value !== null && value >= start && value <= end) values.push(value);
    }
    return Array.from(new Set(values)).sort((a, b) => a - b).map(formatMinutesAsTime);
  }

  function normalizeAvailabilityRange(startTime, endTime, shiftStart, shiftEnd, changed = "start",
    additionalTimes = []) {
    const options = buildQuarterHourOptions(shiftStart, shiftEnd, additionalTimes);
    if (options.length < 2) return null;
    const minutes = options.map(parseTimeToMinutes);
    let start = parseTimeToMinutes(startTime);
    let end = parseTimeToMinutes(endTime);
    if (!minutes.includes(start)) start = minutes[0];
    if (!minutes.includes(end)) end = minutes.at(-1);
    if (start >= end) {
      if (changed === "end") start = minutes.filter((value) => value < end).at(-1);
      else end = minutes.find((value) => value > start);
    }
    if (start === undefined || end === undefined || start >= end) return null;
    return { startTime: formatMinutesAsTime(start), endTime: formatMinutesAsTime(end) };
  }

  function normalizeCoveredSlotKeys(value) {
    if (Array.isArray(value)) return Array.from(new Set(value.map(String).map((key) => key.trim()).filter(Boolean)));
    if (typeof value !== "string" || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeCoveredSlotKeys(parsed);
    } catch (_) { /* Older APIs can return a comma-delimited meta value. */ }
    return Array.from(new Set(value.split(",").map((key) => key.trim()).filter(Boolean)));
  }

  /** Return the positive overlap of two date ranges without mutating either range. */
  function intersectDateRanges(assignmentRange, sourceShiftRange) {
    if (!assignmentRange || !sourceShiftRange) return null;
    const assignmentStart = assignmentRange.start;
    const assignmentEnd = assignmentRange.end;
    const shiftStart = sourceShiftRange.start;
    const shiftEnd = sourceShiftRange.end;
    if (![assignmentStart, assignmentEnd, shiftStart, shiftEnd].every((date) =>
      date instanceof Date && Number.isFinite(date.getTime()))) return null;
    const start = new Date(Math.max(assignmentStart.getTime(), shiftStart.getTime()));
    const end = new Date(Math.min(assignmentEnd.getTime(), shiftEnd.getTime()));
    return start < end ? { start, end } : null;
  }

  /** Map canonical saved assignments back onto their original, visible source slots. */
  function reconstructAvailabilitySelections(sourceShifts, assignments, options = {}) {
    const getRange = options.getRange || ((item) => ({ start: new Date(item.start), end: new Date(item.end) }));
    const isPseudoTask = options.isPseudoTask || (() => false);
    const result = new Map();

    const validShifts = sourceShifts.filter((shift) => !isPseudoTask(shift)).map((shift) => ({
      shift, range: getRange(shift),
    })).filter(({ range }) => range && Number.isFinite(range.start?.getTime()) &&
      Number.isFinite(range.end?.getTime()) && range.end > range.start)
      .sort((a, b) => a.range.start - b.range.start || a.range.end - b.range.end);

    sourceShifts.forEach((shift) => {
      if (isPseudoTask(shift)) return;
      result.set(shift, { intervals: [], separated: false });
    });

    const assignmentsByDate = new Map();
    assignments.forEach((assignment) => {
      if (isPseudoTask(assignment)) return;
      const assignmentRange = getRange(assignment);
      if (!assignmentRange || !Number.isFinite(assignmentRange.start?.getTime()) ||
          !Number.isFinite(assignmentRange.end?.getTime()) || assignmentRange.end <= assignmentRange.start) return;
      const date = localDateKey(assignmentRange.start);
      if (!assignmentsByDate.has(date)) assignmentsByDate.set(date, []);
      assignmentsByDate.get(date).push({ assignment, range: assignmentRange });
    });

    validShifts.forEach(({ shift, range }) => {
      const intersections = (assignmentsByDate.get(localDateKey(range.start)) || [])
        .map(({ assignment, range: assignmentRange }) => {
          const intersection = intersectDateRanges(assignmentRange, range);
          return intersection && { ...intersection, assignment, assignments: [assignment] };
        }).filter(Boolean).sort((a, b) => a.start - b.start || a.end - b.end);
      const merged = [];
      intersections.forEach((intersection) => {
        const previous = merged.at(-1);
        if (previous && intersection.start <= previous.end) {
          if (intersection.end > previous.end) previous.end = new Date(intersection.end);
          previous.assignments.push(...intersection.assignments);
        } else {
          merged.push({ ...intersection, start: new Date(intersection.start), end: new Date(intersection.end),
            assignments: [...intersection.assignments] });
        }
      });
      const selection = result.get(shift);
      selection.intervals = merged;
      selection.separated = merged.length > 1;
    });
    return result;
  }

  /** Pure desired-state builder. Invalid input rejects the complete save. */
  function mergeAvailabilityIntervals(states, getRange) {
    if (!Array.isArray(states) || typeof getRange !== "function") {
      throw new TypeError("Geldige availabilitystates en een intervalfunctie zijn verplicht.");
    }
    const groups = new Map();
    states.forEach((state) => {
      const task = state?.task || state;
      const range = getRange(state);
      const start = range?.start;
      const end = range?.end;
      if (!(start instanceof Date) || !(end instanceof Date) ||
          !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
          end.getTime() <= start.getTime()) {
        throw new RangeError("Een geselecteerd beschikbaarheidsmoment heeft een ongeldige start- of eindtijd.");
      }
      const date = localDateKey(start);
      if (localDateKey(end) !== date) {
        throw new RangeError("Beschikbaarheidsmomenten mogen niet over middernacht lopen.");
      }
      if (!groups.has(date)) groups.set(date, []);
      const sourceRange = task === state ? range : (task?.start || task?.date ? {
        start: task.start ? new Date(task.start) : new Date(`${String(task.date).slice(0, 10)}T${String(task.time).slice(0, 5)}:00`)
      } : null);
      const slotStart = sourceRange?.start instanceof Date && Number.isFinite(sourceRange.start.getTime())
        ? sourceRange.start : start;
      groups.get(date).push({
        date, start, end, coveredSlotKeys: [`${localDateKey(slotStart)}|${localTime(slotStart)}`],
      });
    });

    const result = [];
    Array.from(groups.keys()).sort().forEach((date) => {
      const intervals = groups.get(date).sort((a, b) => a.start.getTime() - b.start.getTime());
      intervals.forEach((next) => {
        const current = result[result.length - 1];
        if (current && current.date === date && next.start.getTime() <= current.end.getTime()) {
          if (next.end.getTime() > current.end.getTime()) current.end = next.end;
          current.coveredSlotKeys.push(...next.coveredSlotKeys);
        } else {
          result.push({ ...next, coveredSlotKeys: [...next.coveredSlotKeys] });
        }
      });
    });
    return result.map((interval) => ({
      ...interval,
      startTime: localTime(interval.start),
      endTime: localTime(interval.end),
      qty: (interval.end.getTime() - interval.start.getTime()) / 60000,
      coveredSlotKeys: Array.from(new Set(interval.coveredSlotKeys)).sort(),
    }));
  }
  return { getMatchAvailabilityWindow, mergeAvailabilityIntervals, localDateKey, parseTimeToMinutes,
    formatMinutesAsTime, buildQuarterHourOptions, normalizeAvailabilityRange,
    normalizeCoveredSlotKeys, intersectDateRanges, reconstructAvailabilitySelections };
});
