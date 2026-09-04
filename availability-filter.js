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

  function getAvailabilityDisplayTitle(task) {
    const sourceType = String(task?.sourceType || "").toLowerCase();
    const summary = decodeAndTrimIcsText(task?.icsSummary || "");

    if (sourceType === "match") {
      const teamNames = Array.isArray(task?.teamNames)
        ? naturalSortTeamNames(task.teamNames)
        : [];
      let title;
      if (teamNames.length) {
        if (teamNames.length === 1) title = `Wedstrijd ${teamNames[0]}`;
        else {
          const lastTeam = teamNames[teamNames.length - 1];
          const precedingTeams = teamNames.slice(0, -1).join(", ");
          title = `Wedstrijden ${precedingTeams} & ${lastTeam}`;
        }
      } else {
        const { leftSide } = splitMatchSummary(summary);
        const teamName = recognizedTeamName(leftSide);
        title = teamName ? `Wedstrijd ${teamName}` : "Wedstrijd";
      }
      const actualTime = formatActualMatchTime(task?.matchStart ?? task?.icsStart,
        task?.matchEnd ?? task?.icsEnd);
      return actualTime ? `${title} (${actualTime})` : title;
    }

    if (sourceType === "event") {
      return summary || "Evenement";
    }

    return task?.sourceLabel || task?.title || "Shift";
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
    KNOWN_TEAM_NAMES,
    decodeAndTrimIcsText,
    extractIcsTeamCode,
    filterHomeEventsByTeam,
    formatActualMatchTime,
    getDefaultAvailabilityMonth,
    getAvailabilityDisplayTitle,
    homeSideMatchesTeam,
    matchBelongsToResolvedTeam,
    naturalSortTeamNames,
    normalizeTeamCode,
    normalizeTeamText,
    recognizedTeamName,
    parseTeamQueryParams,
    splitMatchSummary,
    teamLabelMatches,
  };
}));
