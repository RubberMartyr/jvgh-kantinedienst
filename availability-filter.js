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

  function splitMatchSummary(summary) {
    const parts = String(summary || "").split("/");

    return {
      leftSide: String(parts[0] || "").trim(),
      rightSide: String(parts[1] || "").trim(),
      hasTwoSides: parts.length >= 2,
    };
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
      if (teamNames.length) {
        if (teamNames.length === 1) return `Wedstrijd ${teamNames[0]}`;
        const lastTeam = teamNames[teamNames.length - 1];
        const precedingTeams = teamNames.slice(0, -1).join(", ");
        return `Wedstrijden ${precedingTeams} & ${lastTeam}`;
      }
      const { leftSide } = splitMatchSummary(summary);
      const teamName = recognizedTeamName(leftSide);
      return teamName ? `Wedstrijd ${teamName}` : "Wedstrijd";
    }

    if (sourceType === "event") {
      return summary || "Evenement";
    }

    return task?.sourceLabel || task?.title || "Shift";
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
    const { leftSide, hasTwoSides } = splitMatchSummary(summary);

    if (!hasTwoSides) return false;
    return teamLabelMatches(leftSide, requestedTeamName);
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
    filterHomeEventsByTeam,
    getAvailabilityDisplayTitle,
    homeSideMatchesTeam,
    naturalSortTeamNames,
    normalizeTeamText,
    recognizedTeamName,
    splitMatchSummary,
    teamLabelMatches,
  };
}));
