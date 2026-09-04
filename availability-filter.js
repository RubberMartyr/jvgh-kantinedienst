(function (root, factory) {
  const availabilityFilter = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = availabilityFilter;
  } else {
    root.JVGHAvailabilityFilter = availabilityFilter;
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const KNOWN_TEAM_NAMES = Array.from(
    { length: 16 },
    (_, index) => index + 6
  ).flatMap((age) => [`U${age} A`, `U${age} B`, `U${age}`]);

  const SORTED_TEAM_NAMES = [...KNOWN_TEAM_NAMES].sort(
    (left, right) => right.length - left.length
  );

  function getDefaultAvailabilityMonth(referenceDate = new Date()) {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const day = referenceDate.getDate();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const remainingDays = lastDayOfMonth - day;

    return remainingDays <= 10
      ? new Date(year, month + 1, 1)
      : new Date(year, month, 1);
  }

  function splitMatchSummary(summary) {
    const parts = String(summary || "").split("/");

    return {
      leftSide: String(parts[0] || "").trim(),
      rightSide: String(parts[1] || "").trim(),
      hasTwoSides: parts.length >= 2,
    };
  }

  function parseTeamQueryParams(search = "") {
    const queryParams = new URLSearchParams(search);
    const rawTeamId = queryParams.get("teamId") || queryParams.get("team") || "";
    const normalizedRawTeamId = String(rawTeamId).trim();
    const teamId = /^\d+$/.test(normalizedRawTeamId) && Number(normalizedRawTeamId) > 0
      ? Number(normalizedRawTeamId)
      : null;

    return { teamId, isTeamMode: teamId !== null };
  }

  function normalizeTeamCode(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function extractIcsTeamCode(event) {
    const summary = String(event?.summary ?? event?.title ?? "").trim();
    if (!summary) return "";
    const longDashIndex = summary.indexOf("—");
    if (longDashIndex >= 0) {
      return normalizeTeamCode(summary.slice(0, longDashIndex));
    }
    const fallbackMatch = summary.match(/^\s*(U\d{1,2}(?:\s*[A-Z])?)\s+-\s+/i);
    return fallbackMatch ? normalizeTeamCode(fallbackMatch[1]) : "";
  }

  function normalizeTeamText(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[‐‑‒–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("nl-BE");
  }

  function recognizedTeamName(label) {
    const normalizedLabel = normalizeTeamText(label);

    return SORTED_TEAM_NAMES.find((teamName) => {
      const normalizedTeam = normalizeTeamText(teamName);
      const escapedTeam = normalizedTeam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:^|[^a-z0-9])${escapedTeam}(?:$|[^a-z0-9])`, "u")
        .test(normalizedLabel);
    }) || "";
  }

  function decodeAndTrimIcsText(value) {
    return String(value || "")
      .replace(/\\([\\,;nN])/g, (_, escapedCharacter) => {
        if (escapedCharacter.toLowerCase() === "n") return " ";
        return escapedCharacter;
      })
      .replace(/\s+/g, " ")
      .trim();
  }

  function getAvailabilityDisplayTitle(task, { includeActualMatchTime = false } = {}) {
    const sourceType = String(task?.sourceType || "").toLowerCase();
    const summary = decodeAndTrimIcsText(task?.icsSummary || "");

    if (sourceType === "match") {
      const groupedMatches = [
        ...(Array.isArray(task?.sourceEvents) ? task.sourceEvents : []),
        { teamNames: task?.teamNames, summary },
      ];
      return buildGroupedMatchTitle(groupedMatches,
        task?.matchStart ?? task?.icsStart, task?.matchEnd ?? task?.icsEnd,
        { includeActualMatchTime });
    }

    if (sourceType === "event") {
      return summary || "Evenement";
    }

    return task?.sourceLabel || task?.title || "Shift";
  }

  function normalizeAvailabilityTitleTime(value) {
    const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return "";
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return "";
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function getAvailabilityCardTitle(task, state) {
    const baseTitle = getAvailabilityDisplayTitle(task, { includeActualMatchTime: false });
    if (task?.isMonthUnavailableDummy || !state?.currentChecked) return baseTitle;

    const selectedStart = normalizeAvailabilityTitleTime(state.selectedStartTime);
    const selectedEnd = normalizeAvailabilityTitleTime(state.selectedEndTime);
    const shiftStart = normalizeAvailabilityTitleTime(state.shiftStartTime);
    const shiftEnd = normalizeAvailabilityTitleTime(state.shiftEndTime);
    if (!selectedStart || !selectedEnd || !shiftStart || !shiftEnd || selectedStart >= selectedEnd) {
      return baseTitle;
    }

    return selectedStart !== shiftStart || selectedEnd !== shiftEnd
      ? `${baseTitle} (${selectedStart}–${selectedEnd})`
      : baseTitle;
  }

  function formatActualMatchTime(startValue, endValue) {
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return "";
    const time = (date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return `${time(start)}–${time(end)}`;
  }

  function naturalSortTeamNames(teamNames) {
    const uniqueNames = Array.from(new Set(
      (Array.isArray(teamNames) ? teamNames : [])
        .map((teamName) => recognizedTeamName(teamName))
        .filter(Boolean)
    ));

    return uniqueNames.sort((left, right) =>
      left.localeCompare(right, "nl-BE", { numeric: true, sensitivity: "base" })
    );
  }

  function normalizeTeamForGroupedTitle(teamName) {
    const cleaned = String(teamName || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    const youthTeam = cleaned.match(/^u(\d+)(?:\s*[a-d])?$/i);
    return youthTeam ? `U${Number(youthTeam[1])}` : cleaned;
  }

  function groupedTitleTeamNames(matches) {
    const names = [];
    (Array.isArray(matches) ? matches : []).forEach((match) => {
      if (typeof match === "string") {
        names.push(match);
        return;
      }
      if (Array.isArray(match?.teamNames)) names.push(...match.teamNames);
      if (match?.teamName) names.push(match.teamName);
      const summary = String(match?.summary ?? match?.icsSummary ?? "").trim();
      if (summary) {
        const parsedCode = extractIcsTeamCode({ summary });
        const fallback = recognizedTeamName(splitMatchSummary(summary).leftSide);
        if (parsedCode || fallback) names.push(parsedCode || fallback);
      }
    });

    const unique = new Map();
    names.map(normalizeTeamForGroupedTitle).filter(Boolean).forEach((name) => {
      const key = name.toLocaleLowerCase("nl-BE");
      if (!unique.has(key)) unique.set(key, name);
    });
    return Array.from(unique.values()).sort((left, right) => {
      const leftAge = left.match(/^U(\d+)$/);
      const rightAge = right.match(/^U(\d+)$/);
      if (leftAge && rightAge) return Number(leftAge[1]) - Number(rightAge[1]);
      if (leftAge) return -1;
      if (rightAge) return 1;
      return left.localeCompare(right, "nl-BE", { numeric: true, sensitivity: "base" });
    });
  }

  function buildGroupedMatchTitle(matches, actualStart, actualEnd,
    { includeActualMatchTime = true } = {}) {
    const matchList = Array.isArray(matches) ? matches : [];
    const starts = [];
    const ends = [];
    matchList.forEach((match) => {
      if (!match || typeof match === "string") return;
      const start = new Date(match.matchStart ?? match.icsStart ?? match.start);
      const end = new Date(match.matchEnd ?? match.icsEnd ?? match.end);
      if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end > start) {
        starts.push(start.getTime());
        ends.push(end.getTime());
      }
    });
    const start = starts.length ? new Date(Math.min(...starts)) : actualStart;
    const end = ends.length ? new Date(Math.max(...ends)) : actualEnd;
    const teams = groupedTitleTeamNames(matchList);
    const title = teams.length ? `Wedstrijd ${teams.join(", ")}` : "Wedstrijd";
    const actualTime = includeActualMatchTime ? formatActualMatchTime(start, end) : "";
    return actualTime ? `${title} (${actualTime})` : title;
  }

  function teamLabelMatches(label, requestedTeamName) {
    const recognized = recognizedTeamName(label);
    return Boolean(recognized) &&
      normalizeTeamText(recognized) === normalizeTeamText(requestedTeamName);
  }

  /*
   * Availability's existing ICS predicate treats the left SUMMARY part as the
   * home side. Keep the optional filter on that already accepted side too.
   */
  function homeSideMatchesTeam(summary, requestedTeamName) {
    return matchBelongsToResolvedTeam(summary, requestedTeamName);
  }

  function matchBelongsToResolvedTeam(summary, resolvedTeamName) {
    const requestedTeamCode = normalizeTeamCode(resolvedTeamName);
    const eventTeamCode = extractIcsTeamCode({ summary });
    return Boolean(requestedTeamCode && eventTeamCode) && eventTeamCode === requestedTeamCode;
  }

  function filterHomeEventsByTeam(homeEvents, requestedTeamName) {
    if (!requestedTeamName) return homeEvents;
    return homeEvents.filter((event) =>
      homeSideMatchesTeam(event.summary, requestedTeamName)
    );
  }

  return {
    buildGroupedMatchTitle,
    KNOWN_TEAM_NAMES,
    decodeAndTrimIcsText,
    extractIcsTeamCode,
    filterHomeEventsByTeam,
    formatActualMatchTime,
    getDefaultAvailabilityMonth,
    getAvailabilityCardTitle,
    getAvailabilityDisplayTitle,
    homeSideMatchesTeam,
    matchBelongsToResolvedTeam,
    naturalSortTeamNames,
    normalizeTeamForGroupedTitle,
    normalizeTeamCode,
    normalizeTeamText,
    normalizeAvailabilityTitleTime,
    recognizedTeamName,
    parseTeamQueryParams,
    splitMatchSummary,
    teamLabelMatches,
  };
}));
