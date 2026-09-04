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

  /** Pure desired-state builder. Invalid input rejects the complete save. */
  function mergeAvailabilityIntervals(states, getRange) {
    if (!Array.isArray(states) || typeof getRange !== "function") {
      throw new TypeError("Geldige availabilitystates en een intervalfunctie zijn verplicht.");
    }
    const groups = new Map();
    states.forEach((state) => {
      const task = state?.task || state;
      const range = getRange(task);
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
      groups.get(date).push({
        date, start, end, coveredSlotKeys: [`${date}|${localTime(start)}`],
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
  return { mergeAvailabilityIntervals, localDateKey };
});
