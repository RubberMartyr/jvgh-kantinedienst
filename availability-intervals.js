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

  /** Map canonical saved assignments back onto their original, visible source slots. */
  function reconstructAvailabilitySelections(sourceShifts, assignments, options = {}) {
    const getRange = options.getRange || ((item) => ({ start: new Date(item.start), end: new Date(item.end) }));
    const getCoveredSlotKeys = options.getCoveredSlotKeys || ((item) => item.coveredSlotKeys);
    const getSlotKey = options.getSlotKey || ((item) => `${localDateKey(getRange(item).start)}|${localTime(getRange(item).start)}`);
    const isPseudoTask = options.isPseudoTask || (() => false);
    const result = new Map();

    const validShifts = sourceShifts.filter((shift) => !isPseudoTask(shift)).map((shift) => ({
      shift, range: getRange(shift), key: getSlotKey(shift),
    })).filter(({ range }) => range && Number.isFinite(range.start?.getTime()) &&
      Number.isFinite(range.end?.getTime()) && range.end > range.start)
      .sort((a, b) => a.range.start - b.range.start || a.range.end - b.range.end || a.key.localeCompare(b.key));

    sourceShifts.forEach((shift) => {
      if (isPseudoTask(shift)) return;
      result.set(shift, { intervals: [], separated: false });
    });

    assignments.forEach((assignment) => {
      if (isPseudoTask(assignment)) return;
      const assignmentRange = getRange(assignment);
      if (!assignmentRange || !Number.isFinite(assignmentRange.start?.getTime()) ||
          !Number.isFinite(assignmentRange.end?.getTime()) || assignmentRange.end <= assignmentRange.start) return;
      const covered = normalizeCoveredSlotKeys(getCoveredSlotKeys(assignment));
      const sameDay = validShifts.filter(({ range }) =>
        localDateKey(range.start) === localDateKey(assignmentRange.start));
      const candidates = covered.length ? sameDay.filter(({ key }) => covered.includes(key)) : sameDay;
      const overlapping = candidates.filter(({ range }) =>
        range.start < assignmentRange.end && range.end > assignmentRange.start);
      if (!overlapping.length) return;
      let current = overlapping.find(({ key }) => key ===
        `${localDateKey(assignmentRange.start)}|${localTime(assignmentRange.start)}`);
      if (!current) current = overlapping.filter(({ range }) =>
        range.start <= assignmentRange.start && assignmentRange.start < range.end)
        .sort((a, b) => b.range.start - a.range.start ||
          (b.range.end - assignmentRange.start) - (a.range.end - assignmentRange.start) ||
          a.key.localeCompare(b.key))[0];
      if (!current) current = overlapping.sort((a, b) =>
        Math.max(assignmentRange.start, a.range.start) - Math.max(assignmentRange.start, b.range.start) ||
        b.range.end - a.range.end || a.key.localeCompare(b.key))[0];

      let cursor = new Date(Math.max(assignmentRange.start, current.range.start));
      const used = new Set();
      while (current && cursor < assignmentRange.end) {
        const end = new Date(Math.min(assignmentRange.end, current.range.end));
        if (cursor < end) {
          result.get(current.shift).intervals.push({ start: new Date(cursor), end, assignment,
            assignments: [assignment] });
          cursor = end;
        }
        used.add(current.shift);
        if (cursor >= assignmentRange.end) break;
        const continuing = candidates.filter(({ shift, range }) => !used.has(shift) &&
          range.start <= cursor && range.end > cursor);
        current = continuing.sort((a, b) =>
          Number(covered.includes(b.key)) - Number(covered.includes(a.key)) ||
          Number(b.range.start.getTime() === cursor.getTime()) - Number(a.range.start.getTime() === cursor.getTime()) ||
          b.range.start - a.range.start || b.range.end - a.range.end || a.key.localeCompare(b.key))[0];
      }
    });
    result.forEach((selection) => {
      selection.intervals.sort((a, b) => a.start - b.start);
      selection.separated = selection.intervals.some((interval, index) =>
        index > 0 && interval.start > selection.intervals[index - 1].end);
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
    normalizeCoveredSlotKeys, reconstructAvailabilitySelections };
});
