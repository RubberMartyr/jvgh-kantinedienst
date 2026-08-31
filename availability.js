const DEFAULT_ASSIGNMENT_DURATION_MINUTES = 240;
const {
  filterHomeEventsByTeam,
  getAvailabilityDisplayTitle,
  recognizedTeamName,
  splitMatchSummary,
} = window.JVGHAvailabilityFilter;

const queryParams = new URLSearchParams(window.location.search);

const rawTeamId =
  queryParams.get("teamId") ??
  queryParams.get("team") ??
  "";

const parsedTeamId = String(rawTeamId).trim();

const teamId =
  /^\d+$/.test(parsedTeamId) && Number(parsedTeamId) > 0
    ? Number(parsedTeamId)
    : null;

const isTeamMode = teamId !== null;

let requestedTeamName = "";
let updateSaveStateForMode = null;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function monthLabelFromKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
}

function monthDateFromKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function addMonths(date, amount) {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + amount);
  return next;
}

function parseMonthInput(raw) {
  if (!raw) return null;
  const input = String(raw).trim().toLowerCase();
  const now = new Date();

  if (/^\d{4}-\d{1,2}$/.test(input)) {
    const [y, m] = input.split("-").map(Number);
    if (m >= 1 && m <= 12) return `${y}-${pad2(m)}`;
  }

  if (/^\d{1,2}-\d{4}$/.test(input)) {
    const [m, y] = input.split("-").map(Number);
    if (m >= 1 && m <= 12) return `${y}-${pad2(m)}`;
  }

  if (/^\d{1,2}$/.test(input)) {
    const m = Number(input);
    if (m >= 1 && m <= 12) return `${now.getFullYear()}-${pad2(m)}`;
  }

  const monthMap = {
    january: 1, januari: 1,
    february: 2, februari: 2,
    march: 3, maart: 3,
    april: 4,
    may: 5, mei: 5,
    june: 6, juni: 6,
    july: 7, juli: 7,
    august: 8, augustus: 8,
    september: 9,
    october: 10, oktober: 10,
    november: 11,
    december: 12,
  };

  const normalized = input.replace(/[,_]/g, " ").replace(/\s+/g, " ").trim();
  const withYear = normalized.match(/^([a-z]+)\s+(\d{4})$/i);
  if (withYear) {
    const month = monthMap[withYear[1].toLowerCase()];
    const year = Number(withYear[2]);
    if (month) return `${year}-${pad2(month)}`;
  }

  const onlyMonthName = monthMap[normalized];
  if (onlyMonthName) return `${now.getFullYear()}-${pad2(onlyMonthName)}`;

  return null;
}


function monthUnavailableTask(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);

  // Use midday to avoid timezone conversion moving this to the previous UTC day/month.
  const start = new Date(year, month - 1, 1, 12, 0, 0);
  const end = new Date(year, month - 1, 1, 13, 0, 0);
  return {
    id: null,
    date: `${monthKey}-01`,
    time: "",
    qty: 0,
    title: "Ik ben niet beschikbaar deze maand",
    start: start.toISOString(),
    end: end.toISOString(),
    source: "monthly-unavailable",
    sourceReason: "Maand niet beschikbaar",
    isMonthUnavailableDummy: true,
  };
}

function addMonthToKey(monthKey, amount) {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  d.setMonth(d.getMonth() + amount);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function isMonthUnavailableTask(task) {
  return Boolean(task?.isMonthUnavailableDummy === true);
}

function isPersistedMonthUnavailableTask(task, monthKey) {
  if (!task) return false;
  const taskDate = String(task.date || "").slice(0, 10);
  if (!taskDate.startsWith(`${monthKey}-`)) return false;

  const taskTime = String(task.time || "").slice(0, 5);
  const normalizedTitle = String(task.title || "").trim().toLowerCase();
  const isUnavailableTitle = normalizedTitle === "niet beschikbaar deze maand" || normalizedTitle === "ik ben niet beschikbaar deze maand";
  const qty = Number(task.qty);

  return isUnavailableTitle && (taskTime === "" || taskTime === "00:00") && (!Number.isFinite(qty) || qty === 0);
}

function getDurationMinutes(taskQty) {
  const qty = Number(taskQty);
  if (!Number.isFinite(qty)) return DEFAULT_ASSIGNMENT_DURATION_MINUTES;
  return qty >= 60 ? qty : DEFAULT_ASSIGNMENT_DURATION_MINUTES;
}

function formatShiftLabel(task) {
  if (task.start && task.end) {
    const start = new Date(task.start);
    const end = new Date(task.end);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const dateLabel = start.toLocaleDateString("nl-BE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const startLabel = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
      const endLabel = `${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
      return `${dateLabel} · ${startLabel}–${endLabel}`;
    }
  }

  const dateStr = String(task.date || "").slice(0, 10);
  const timeStr = String(task.time || "").slice(0, 5);
  if (isMonthUnavailableTask(task)) {
    return "Ik ben niet beschikbaar deze maand";
  }
  if (!dateStr || !timeStr) return "Onbekende shift";

  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const start = new Date(y, m - 1, d, hh || 0, mm || 0, 0);
  const end = new Date(start.getTime() + getDurationMinutes(task.qty) * 60 * 1000);

  const dateLabel = start.toLocaleDateString("nl-BE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const startLabel = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
  const endLabel = `${pad2(end.getHours())}:${pad2(end.getMinutes())}`;

  return `${dateLabel} · ${startLabel}–${endLabel}`;
}

function signupName(signup) {
  if (!signup || typeof signup !== "object") {
    return "";
  }

  const directName =
    signup.name ||
    signup.displayName ||
    signup.display_name ||
    signup.fullName ||
    signup.full_name ||
    "";

  if (String(directName).trim()) {
    return String(directName).trim();
  }

  const firstName =
    signup.firstName ||
    signup.firstname ||
    signup.first_name ||
    "";

  const lastName =
    signup.lastName ||
    signup.lastname ||
    signup.last_name ||
    "";

  return `${firstName} ${lastName}`.trim();
}

function signupDisplayName(signup) {
  return signupName(signup) || "Vrijwilliger";
}

function normalizeSignupPersonName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function formatHourRange(startIso, endIso) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
  return `${pad2(s.getHours())}:${pad2(s.getMinutes())}–${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
}

function shiftKey(task) {
  const date = String(task?.date || "").slice(0, 10);
  const time = String(task?.time || "").slice(0, 5);
  if (task?.id) return `task-${task.id}`;
  return `slot-${date}-${time}`;
}

function persistedSlotKey(task) {
  const date = String(task?.date || "").slice(0, 10);
  const time = String(task?.time || "").slice(0, 5);

  return `${date} ${time}`;
}

function findStateForTask(stateByTask, task) {
  return (
    stateByTask.get(shiftKey(task)) ||
    stateByTask.get(`slot-${String(task?.date || "").slice(0, 10)}-${String(task?.time || "").slice(0, 5)}`) ||
    stateByTask.get(`task-${task?.id}`)
  );
}

function getDefaultAvailabilityMonthKey(now = new Date()) {
  const monthOffset = now.getDate() <= 15 ? 0 : 1;

  return monthKeyFromDate(addMonths(now, monthOffset));
}

function getQueryParams() {
  const userRaw = queryParams.get("userId") || queryParams.get("user") || queryParams.get("uid") || "";
  const defaultMonth = getDefaultAvailabilityMonthKey();
  const monthRaw = queryParams.get("month") || defaultMonth;

  return {
    userRaw,
    userId: Number.isFinite(Number(userRaw)) ? Number(userRaw) : null,
    monthRaw,
    monthKey: parseMonthInput(monthRaw),
    userName: (queryParams.get("name") || "").trim(),
    teamId,
    isTeamMode,
  };
}

async function resolveTeamName(teamId) {
  const response = await fetch("/wp-json/jvgh/v1/team-delegates", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Ploegen konden niet worden geladen.");
  const payload = await response.json();
  const teams = Array.isArray(payload?.teams) ? payload.teams : [];
  const team = teams.find((item) => Number(item.teamId) === teamId);
  return String(team?.teamName || "").trim() || null;
}

function getParentDetails() {
  return {
    firstName: document.getElementById("availability-first-name").value.trim(),
    lastName: document.getElementById("availability-last-name").value.trim(),
    phone: document.getElementById("availability-phone").value.trim(),
  };
}

function validateParentDetails(values = getParentDetails(), { showErrors = true } = {}) {
  const normalizedPhone = window.JVGHCore?.normalizePhoneNumber(values.phone) || "";
  const errors = {
    firstName: values.firstName ? "" : "Vul uw voornaam in.",
    lastName: values.lastName ? "" : "Vul uw naam in.",
    phone: normalizedPhone && /^\+324\d{8}$/.test(normalizedPhone) ? "" : "Geef een geldig Belgisch gsm-nummer in.",
  };
  let firstInvalid = null;
  Object.entries(errors).forEach(([name, message]) => {
    const input = document.querySelector(`[name="${name}"]`);
    document.querySelector(`[data-error-for="${name}"]`).textContent = showErrors ? message : "";
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (message && !firstInvalid) firstInvalid = input;
  });
  if (firstInvalid && showErrors) {
    firstInvalid.focus({ preventScroll: true });
    firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    return null;
  }
  return firstInvalid ? null : { ...values, phone: normalizedPhone };
}

function setStatus(msg, isError = false) {
  const statusEl = document.getElementById("availability-status");
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.toggle("availability-error", isError);
}

function ensureAvailabilityToast() {
  let toast = document.getElementById(
    "availability-save-toast"
  );

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "availability-save-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
    document.body.appendChild(toast);
  }

  return toast;
}

let availabilityToastTimeout = null;

function showAvailabilityToast(message, isError = false) {
  const toast = ensureAvailabilityToast();

  toast.textContent = message;

  toast.classList.remove(
    "is-visible",
    "is-error"
  );

  if (isError) {
    toast.classList.add("is-error");
  }

  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  clearTimeout(availabilityToastTimeout);

  availabilityToastTimeout = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2500);
}

function setSaveDirtyState(isDirty) {
  const saveButtons = document.querySelectorAll(".availability-save-btn");
  saveButtons.forEach((saveButton) => {
    saveButton.disabled = !isDirty;
    saveButton.textContent = "Opslaan";
  });
}

function setSaveButtonsVisible(visible) {
  document.querySelectorAll(".availability-save-wrap").forEach((wrap) => {
    wrap.classList.toggle("hidden", !visible);
  });
}

function setCalendarButtonVisible(visible) {
  const wrap = document.querySelector(".availability-actions-wrap");
  if (!wrap) return;
  wrap.classList.toggle("hidden", !visible);
}

function escapeICSText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatICSDateUTC(date) {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

function getShiftStartAndEnd(task) {
  if (task.start && task.end) {
    const startFromIso = new Date(task.start);
    const endFromIso = new Date(task.end);
    if (!Number.isNaN(startFromIso.getTime()) && !Number.isNaN(endFromIso.getTime())) {
      return { start: startFromIso, end: endFromIso };
    }
  }

  const dateStr = String(task.date || "").slice(0, 10);
  const timeStr = String(task.time || "").slice(0, 5);
  if (!dateStr || !timeStr) return null;

  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const start = new Date(y, m - 1, d, hh || 0, mm || 0, 0);
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + getDurationMinutes(task.qty) * 60 * 1000);
  return { start, end };
}

function hasSavedNormalAvailabilityShift(stateByTask) {
  return Array.from(stateByTask.values()).some(
    (state) =>
      !isMonthUnavailableTask(state.task) &&
      Boolean(state.originalChecked)
  );
}

function updateCalendarButtonForState(stateByTask) {
  const hasUnsavedChanges = computeDirtyCount(stateByTask) > 0;
  setCalendarButtonVisible(
    !hasUnsavedChanges && hasSavedNormalAvailabilityShift(stateByTask)
  );
}

function buildAvailabilityICS({ stateByTask, userName }) {
  const nowStamp = formatICSDateUTC(new Date());
  const selectedStates = Array.from(stateByTask.values()).filter(
    (state) =>
      !isMonthUnavailableTask(state.task) &&
      state.currentChecked
  );
  const events = selectedStates
    .map((state, index) => {
      const range = getShiftStartAndEnd(state.task);
      if (!range) return null;
      const summary = `JVGH Kantinedienst - ${userName || "Vrijwilliger"}`;
      const description = `Ingeplande kantinedienst (${formatShiftLabel(state.task)})`;
      const uid = `jvgh-availability-${Date.now()}-${index}@jeugdherk.be`;
      return [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART:${formatICSDateUTC(range.start)}`,
        `DTEND:${formatICSDateUTC(range.end)}`,
        `SUMMARY:${escapeICSText(summary)}`,
        `DESCRIPTION:${escapeICSText(description)}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .filter(Boolean);

  if (!events.length) return "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JVGH//Availability//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function getSignupUserId(signup) {
  if (!signup || typeof signup !== "object") {
    return null;
  }

  const rawUserId =
    signup.userId ??
    signup.user_id ??
    signup.wpUserId ??
    signup.wp_user_id ??
    signup.wordpressUserId ??
    signup.wordpress_user_id ??
    signup.user?.id ??
    signup.meta?.userId ??
    signup.meta?.user_id;

  if (
    rawUserId === null ||
    rawUserId === undefined ||
    rawUserId === false ||
    String(rawUserId).trim() === ""
  ) {
    return null;
  }

  const normalizedUserId = Number(rawUserId);

  return (
    Number.isInteger(normalizedUserId) &&
    normalizedUserId > 0
  )
    ? normalizedUserId
    : null;
}

function isSignupForCurrentUser(
  signup,
  currentUserId,
  currentUserName
) {
  const normalizedCurrentUserId =
    Number(currentUserId);

  const signupUserId =
    getSignupUserId(signup);

  if (signupUserId !== null) {
    return (
      Number.isInteger(normalizedCurrentUserId) &&
      normalizedCurrentUserId > 0 &&
      signupUserId === normalizedCurrentUserId
    );
  }

  const normalizedCurrentUserName =
    normalizeSignupPersonName(currentUserName);

  const normalizedSignupName =
    normalizeSignupPersonName(
      signupName(signup)
    );

  const invalidFallbackNames = new Set([
    "",
    "gebruiker",
    "vrijwilliger"
  ]);

  if (
    invalidFallbackNames.has(
      normalizedCurrentUserName
    )
  ) {
    return false;
  }

  return (
    normalizedSignupName !== "" &&
    normalizedSignupName ===
      normalizedCurrentUserName
  );
}

const volunteerNameByUserIdCache = new Map();

async function getVolunteerNameByUserId(userId) {
  const normalizedUserId = Number(userId);

  if (
    !Number.isInteger(normalizedUserId) ||
    normalizedUserId <= 0
  ) {
    return null;
  }

  if (volunteerNameByUserIdCache.has(normalizedUserId)) {
    return volunteerNameByUserIdCache.get(normalizedUserId);
  }

  const roles = ["bestuur", "vrijwilliger"];

  for (const role of roles) {
    try {
      const response = await fetch(
        `/wp-json/jvgh/v1/volunteers?role=${encodeURIComponent(role)}&_=${Date.now()}`,
        {
          credentials: "same-origin",
          cache: "no-store"
        }
      );

      if (!response.ok) {
        continue;
      }

      const users = await response.json();

      const match = Array.isArray(users)
        ? users.find(
            (user) =>
              Number(user?.id) === normalizedUserId
          )
        : null;

      const name = String(match?.name || "").trim();

      if (name) {
        volunteerNameByUserIdCache.set(
          normalizedUserId,
          name
        );

        return name;
      }
    } catch (error) {
      console.warn(
        `[availability] Kon gebruiker ${normalizedUserId} niet ophalen voor rol ${role}.`,
        error
      );
    }
  }

  volunteerNameByUserIdCache.set(
    normalizedUserId,
    null
  );

  return null;
}

async function loadTasksForMonth(monthKey) {
  const resp = await JVGHApi.getMonthData(monthKey);

  const schedules = Array.isArray(resp?.schedules)
    ? resp.schedules
    : [];

  const tasks = [];
  const signupsByTask = new Map();
  const scheduleByDay = new Map();

  schedules.forEach((schedule) => {
    const scheduleStart = String(schedule.start || "").slice(0, 10);
    if (scheduleStart) {
      scheduleByDay.set(scheduleStart, schedule.id);
    }

    const scheduleTasks = Array.isArray(schedule.tasks)
      ? schedule.tasks
      : [];

    scheduleTasks.forEach((task) => {
      const normalizedTask = {
        ...task,
        sheetId: schedule.id,
      };

      tasks.push(normalizedTask);

      signupsByTask.set(
        String(task.id),
        Array.isArray(task.signups)
          ? task.signups
          : []
      );
    });
  });

  tasks.sort((a, b) =>
    `${a.date || ""} ${a.time || ""}`.localeCompare(
      `${b.date || ""} ${b.time || ""}`
    )
  );

  return {
    tasks,
    signupsByTask,
    scheduleByDay,
  };
}

async function loadAuthoritativeSignupsByTask(
  tasks,
  fallbackSignupsByTask = new Map()
) {
  const result = new Map();

  const taskIds = Array.from(
    new Set(
      (Array.isArray(tasks) ? tasks : [])
        .map((task) => task?.id)
        .filter(
          (taskId) =>
            taskId !== null &&
            taskId !== undefined &&
            String(taskId).trim() !== ""
        )
        .map(String)
    )
  );

  if (
    !window.JVGHApi ||
    typeof JVGHApi.getSignups !== "function"
  ) {
    console.warn(
      "[availability] JVGHApi.getSignups ontbreekt; embedded month-data signups worden gebruikt."
    );

    taskIds.forEach((taskId) => {
      result.set(
        taskId,
        fallbackSignupsByTask.get(taskId) || []
      );
    });

    return result;
  }

  for (const taskId of taskIds) {
    try {
      const response =
        await JVGHApi.getSignups(taskId);

      const signups =
        Array.isArray(response?.signups)
          ? response.signups
          : Array.isArray(response)
            ? response
            : [];

      result.set(taskId, signups);
    } catch (error) {
      console.warn(
        `[availability] Kon actuele signups voor taak ${taskId} niet laden; fallback wordt gebruikt.`,
        error
      );

      result.set(
        taskId,
        fallbackSignupsByTask.get(taskId) || []
      );
    }
  }

  return result;
}

function collectSignupsForTaskGroup(task, signupsByTask) {
  const taskIds =
    Array.isArray(task?.relatedTaskIds) && task.relatedTaskIds.length
      ? task.relatedTaskIds
      : task?.id !== null && task?.id !== undefined
        ? [task.id]
        : [];

  const combined = [];
  const seen = new Set();

  taskIds.forEach((taskId) => {
    const signups = signupsByTask.get(String(taskId)) || [];

    signups.forEach((signup) => {
      const uniqueKey = `${String(taskId)}:${String(signup.id)}`;

      if (seen.has(uniqueKey)) {
        return;
      }

      seen.add(uniqueKey);
      combined.push({
        ...signup,
        /*
         * Intern veld zodat verwijderen via de juiste
         * persisted task gebeurt.
         */
        __taskId: taskId,
      });
    });
  });

  return combined;
}

function parseICalDate(line) {
  if (!line) return null;
  const raw = line.split(":").slice(-1)[0].trim();

  if (/^\d{8}$/.test(raw)) {
    const y = +raw.slice(0, 4);
    const m = +raw.slice(4, 6);
    const d = +raw.slice(6, 8);
    return new Date(y, m - 1, d, 0, 0, 0);
  }
  if (/^\d{8}T\d{4}$/.test(raw)) {
    const y = +raw.slice(0, 4);
    const m = +raw.slice(4, 6);
    const d = +raw.slice(6, 8);
    const H = +raw.slice(9, 11);
    const M = +raw.slice(11, 13);
    return new Date(y, m - 1, d, H, M, 0);
  }
  if (/^\d{8}T\d{6}$/.test(raw)) {
    const y = +raw.slice(0, 4);
    const m = +raw.slice(4, 6);
    const d = +raw.slice(6, 8);
    const H = +raw.slice(9, 11);
    const M = +raw.slice(11, 13);
    const S = +raw.slice(13, 15);
    return new Date(y, m - 1, d, H, M, S);
  }
  if (/^\d{8}T\d{4}Z$/.test(raw) || /^\d{8}T\d{6}Z$/.test(raw)) {
    const y = +raw.slice(0, 4);
    const m = +raw.slice(4, 6);
    const d = +raw.slice(6, 8);
    const H = +raw.slice(9, 11);
    const M = +raw.slice(11, 13);
    const S = raw.length === 16 ? +raw.slice(13, 15) : 0;
    return new Date(Date.UTC(y, m - 1, d, H, M, S));
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ICAL_URL = "https://jeugdherk.be/calendar/jvgh-kalender/?feed=sp-ical";
const EVENTS_ICAL_URL = "https://jeugdherk.be/events/lijst/?ical=1";
const VERHUUR_ICAL_URL =
  "/wp-json/jvgh/v1/ics-proxy?url=" +
  encodeURIComponent(
    "https://outlook.office365.com/owa/calendar/f2d34940b5f74818ac3baf863b3d9c1a@jeugdherk.be/51ee3ee8905543a1b01ab337a8bd734d13775201653858586117/calendar.ics"
  );
const DAGELIJKS_BESTUUR_ICAL_URL =
  "/wp-json/jvgh/v1/ics-proxy?url=" +
  encodeURIComponent(
    "https://outlook.office365.com/owa/calendar/f2d34940b5f74818ac3baf863b3d9c1a@jeugdherk.be/35511a0627d644998a24502f56390cf118238942820750685558/calendar.ics"
  );

function parseICS(text, options = {}) {
  const { sourceType = "match", sourceLabel = "Wedstrijd", homeTeamFilter = null } = options;
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const events = [];
  const regex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let m;

  while ((m = regex.exec(unfolded)) !== null) {
    const block = m[1];
    const pick = (name) => {
      const re = new RegExp(name + "(:|;[^\\n]*:)([^\\n]*)", "i");
      const mm = block.match(re);
      return mm ? mm[2].trim() : "";
    };

    const summary = pick("SUMMARY");
    const startRaw = pick("DTSTART");
    const endRawValue = pick("DTEND");
    const start = parseICalDate(startRaw);
    const endRaw = parseICalDate(endRawValue);
    const isAllDay =
      /^\d{8}$/.test(startRaw) &&
      (!endRawValue || /^\d{8}$/.test(endRawValue));
    if (!start || Number.isNaN(start.getTime())) continue;

    if (!summary) continue;

    if (homeTeamFilter) {
      const { leftSide: homePart, hasTwoSides } = splitMatchSummary(summary);
      const normalizedFilter = String(homeTeamFilter).toLowerCase();

      if (!(hasTwoSides && homePart.toLowerCase().includes(normalizedFilter))) {
        continue;
      }
    }

    const end = endRaw && !Number.isNaN(endRaw.getTime())
      ? endRaw
      : new Date(start.getTime() + 60 * 60 * 1000);

    events.push({ summary, start, end, isAllDay, sourceType, sourceLabel });
  }

  return events;
}

function startOfCalendarDay(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0
  );
}

function addCalendarDays(date, amount) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + amount,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
}

function createDateUsingTime(day, timeSource) {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    0
  );
}

function expandEventIntoDailyOccurrences(event) {
  if (!event?.start || !event?.end) {
    return [];
  }

  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);

  if (
    Number.isNaN(eventStart.getTime()) ||
    Number.isNaN(eventEnd.getTime()) ||
    eventEnd <= eventStart
  ) {
    return [];
  }

  const startDay = startOfCalendarDay(eventStart);
  const endDay = startOfCalendarDay(eventEnd);

  // An event within one calendar day keeps its original time range.
  if (!event.isAllDay && startDay.getTime() === endDay.getTime()) {
    return [{
      ...event,
      start: eventStart,
      end: eventEnd,
    }];
  }

  const occurrences = [];

  // VALUE=DATE has no times and uses an exclusive DTEND.
  if (event.isAllDay) {
    let currentDay = startDay;
    const exclusiveEndDay = endDay;

    while (currentDay < exclusiveEndDay) {
      occurrences.push({
        ...event,
        start: new Date(currentDay),
        end: addCalendarDays(currentDay, 1),
      });

      currentDay = addCalendarDays(currentDay, 1);
    }

    return occurrences;
  }

  // Timed multi-day events reuse the original DTSTART and DTEND times daily.
  let currentDay = startDay;

  while (currentDay <= endDay) {
    const dailyStart = createDateUsingTime(currentDay, eventStart);
    let dailyEnd = createDateUsingTime(currentDay, eventEnd);

    // An end time no later than the start time belongs to the next day.
    if (dailyEnd <= dailyStart) {
      dailyEnd = addCalendarDays(dailyEnd, 1);
    }

    occurrences.push({
      ...event,
      start: dailyStart,
      end: dailyEnd,
    });

    currentDay = addCalendarDays(currentDay, 1);
  }

  return occurrences;
}

async function loadShiftSlotsForMonth(monthKey, { teamMode = false, resolvedTeamName = "" } = {}) {
  const [matchesText, eventsText, verhuurText, bestuurText] = await Promise.all([
    fetch(ICAL_URL, { credentials: "omit" }).then((r) => {
      if (!r.ok) throw new Error("Wedstrijdkalender kon niet worden geladen.");
      return r.text();
    }),
    fetch(EVENTS_ICAL_URL, { credentials: "omit" }).then((r) => (r.ok ? r.text() : "")),
    fetch(VERHUUR_ICAL_URL, { credentials: "omit" }).then((r) => (r.ok ? r.text() : "")),
    fetch(DAGELIJKS_BESTUUR_ICAL_URL, { credentials: "omit" }).then((r) => (r.ok ? r.text() : "")),
  ]);

  if (!/BEGIN:VEVENT[\s\S]*END:VEVENT/i.test(matchesText)) {
    throw new Error("Wedstrijdkalender bevat geen geldige events.");
  }

  const homeMatchEvents = parseICS(matchesText, {
    sourceType: "match",
    sourceLabel: "Wedstrijd",
    homeTeamFilter: "Herk-De-Stad",
  });
  const visibleMatchEvents = filterHomeEventsByTeam(
    homeMatchEvents,
    teamMode ? resolvedTeamName : ""
  );

  const events = teamMode ? visibleMatchEvents : [
    ...homeMatchEvents,
    ...parseICS(eventsText, { sourceType: "event", sourceLabel: "Evenement" }),
    ...parseICS(verhuurText, { sourceType: "rental", sourceLabel: "Verhuur" }),
    ...parseICS(bestuurText, { sourceType: "board", sourceLabel: "Dagelijks bestuur" }),
  ];

  const dailyEvents = events.flatMap((event) =>
    expandEventIntoDailyOccurrences(event)
  );

  const shifts = dailyEvents
    .map((ev) => {
      const shiftStart = new Date(ev.start.getTime() - 60 * 60 * 1000);
      const shiftEnd = new Date(ev.end.getTime() + 2 * 60 * 60 * 1000);
      const date = `${shiftStart.getFullYear()}-${pad2(shiftStart.getMonth() + 1)}-${pad2(shiftStart.getDate())}`;
      const time = `${pad2(shiftStart.getHours())}:${pad2(shiftStart.getMinutes())}`;
      return {
        id: null,
        date,
        time,
        qty: Math.round((shiftEnd.getTime() - shiftStart.getTime()) / 60000),
        start: shiftStart.toISOString(),
        end: shiftEnd.toISOString(),
        source: "ics",
        sourceReason: "Voetbalwedstrijd kalender",
        icsSummary: ev.summary || "",
        icsStart: ev.start.toISOString(),
        icsEnd: ev.end.toISOString(),
        sourceType: ev.sourceType,
        sourceLabel: ev.sourceLabel,
        sourceEvents: [ev],
        icsSummaries: [ev.summary || ""].filter(Boolean),
        teamNames: ev.sourceType === "match"
          ? [teamMode ? resolvedTeamName : recognizedTeamName(splitMatchSummary(ev.summary).leftSide)].filter(Boolean)
          : [],
      };
    })
    .filter((slot) => slot.date.slice(0, 7) === monthKey)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  shifts.teamModeCounts = {
    parsedHomeMatches: homeMatchEvents.length,
    matchedTeamEvents: visibleMatchEvents.length,
    generatedTeamShifts: shifts.length,
  };
  return shifts;
}

async function ensureTaskForShift(shift, scheduleByDay) {
  if (shift.id) return shift.id;
  const dayKey = shift.date;
  let scheduleId = scheduleByDay.get(dayKey);
  const isUnavailable = isMonthUnavailableTask(shift);

  if (!scheduleId) {
    let fallbackStart = shift.start || `${shift.date}T00:00:00.000Z`;
    let fallbackEnd = shift.end || `${shift.date}T01:00:00.000Z`;

    if (isUnavailable) {
      const [y, m, d] = String(shift.date).slice(0, 10).split("-").map(Number);
      fallbackStart = new Date(y, m - 1, d, 12, 0, 0).toISOString();
      fallbackEnd = new Date(y, m - 1, d, 13, 0, 0).toISOString();
    }

    const createdSchedule = await JVGHApi.createSchedule({
      title: `Kantinedienst ${dayKey}`,
      start: fallbackStart,
      end: fallbackEnd,
    });
    const sch = createdSchedule?.schedule && createdSchedule.schedule.id
      ? createdSchedule.schedule
      : createdSchedule;
    scheduleId = sch.id;
    scheduleByDay.set(dayKey, scheduleId);
    shift.sheetId = scheduleId;
  }

  const createdTask = await JVGHApi.createTask(scheduleId, {
    title: isUnavailable ? "Niet beschikbaar deze maand" : `Kantinedienst ${shift.time}`,
    qty: isUnavailable ? 0 : Number(shift.qty) || DEFAULT_ASSIGNMENT_DURATION_MINUTES,
    date: shift.date,
    time: isUnavailable ? "" : shift.time,
  });

  const task =
    createdTask?.task && createdTask.task.id
      ? createdTask.task
      : createdTask;

  shift.id = task.id;
  shift.sheetId = scheduleId;

  return task.id;
}


async function resolveUserName({
  providedName,
  userId,
  signupsByTask
}) {
  const cleanProvidedName =
    String(providedName || "").trim();

  if (cleanProvidedName) {
    return cleanProvidedName;
  }

  if (
    window.JVGHApi &&
    typeof JVGHApi.getUserDisplayName === "function"
  ) {
    try {
      const apiName =
        await JVGHApi.getUserDisplayName(userId);

      if (String(apiName || "").trim()) {
        return String(apiName).trim();
      }
    } catch (error) {
      console.warn(
        "[availability] getUserDisplayName mislukt.",
        error
      );
    }
  }

  const volunteerName =
    await getVolunteerNameByUserId(userId);

  if (volunteerName) {
    return volunteerName;
  }

  for (const signups of signupsByTask.values()) {
    const match = signups.find(
      (signup) =>
        getSignupUserId(signup) === Number(userId)
    );

    const name = signupName(match);

    if (name) {
      return name;
    }
  }

  return "";
}

function checkboxHoverTitle(
  signups,
  userId,
  userName
) {
  const others = signups.filter(
    (signup) =>
      !isSignupForCurrentUser(
        signup,
        userId,
        userName
      )
  );
  if (!others.length) {
    return "Nog geen andere ingeplande gebruikers op deze shift.";
  }
  return `Reeds ingepland: ${others.map(signupDisplayName).join(", ")}`;
}

function computeDirtyCount(stateByTask) {
  let count = 0;
  for (const state of stateByTask.values()) {
    if (state.currentChecked !== state.originalChecked) count += 1;
  }
  return count;
}

function getMonthUnavailableState(stateByTask) {
  return Array.from(stateByTask.values()).find((state) =>
    isMonthUnavailableTask(state.task)
  );
}

function syncAvailabilityDom(stateByTask) {
const monthUnavailableState =
getMonthUnavailableState(stateByTask);

const monthUnavailableChecked =
Boolean(monthUnavailableState?.currentChecked);

// Only count NORMAL shifts
const hasNormalShiftSelected =
Array.from(stateByTask.values()).some(
(state) =>
!isMonthUnavailableTask(state.task) &&
Boolean(state.currentChecked)
);

const topCheckbox = document.getElementById(
"availability-month-unavailable-checkbox"
);

// Update top checkbox
if (topCheckbox) {
topCheckbox.checked = monthUnavailableChecked;

// Disable top checkbox only when normal shifts selected
topCheckbox.disabled =
hasNormalShiftSelected &&
!monthUnavailableChecked;
}

// Update normal shift checkboxes
document
.querySelectorAll(
"#availability-list input[data-shift-key]"
)
.forEach((checkbox) => {
const state =
stateByTask.get(checkbox.dataset.shiftKey);

  if (!state) return;

  checkbox.checked =
    Boolean(state.currentChecked);

  // IMPORTANT:
  // Disable normal shifts ONLY when month unavailable checked
  checkbox.disabled =
    monthUnavailableChecked;
});

}
function updateDirtyUi(stateByTask) {
  const dirtyCount = computeDirtyCount(stateByTask);
  if (updateSaveStateForMode) updateSaveStateForMode(dirtyCount > 0);
  else setSaveDirtyState(dirtyCount > 0);
  updateCalendarButtonForState(stateByTask);
  setStatus(
    dirtyCount > 0
      ? `${dirtyCount} wijziging(en) nog op te slaan.`
      : "Alles opgeslagen."
  );
}


function renderList({
  tasks,
  stateByTask,
  userId,
  userName
}) {
  const listEl = document.getElementById("availability-list");
  listEl.innerHTML = "";
  const visibleTasks = tasks.filter((task) => !isMonthUnavailableTask(task));

  if (!visibleTasks.length) {
    if (requestedTeamName) {
      const message = document.createElement("span");
      message.textContent = `Geen thuiswedstrijden gevonden voor ${requestedTeamName}.`;
      const statusEl = document.getElementById("availability-status");
      statusEl.replaceChildren(message);
      statusEl.classList.remove("availability-error");
    } else {
      setStatus("Geen shifts gevonden voor deze maand.");
    }
    return;
  }

  visibleTasks.forEach((task, taskIndex) => {
    const state = findStateForTask(stateByTask, task);
    if (!state) return;

    const li = document.createElement("li");
    li.className = "availability-item";
    if (task.sourceType) {
      li.classList.add(`availability-type-${task.sourceType}`);
    }
    const plannedCount = Array.isArray(state.signups) ? state.signups.length : 0;
    if (plannedCount >= 3) {
      li.classList.add("availability-item-full");
    } else if (plannedCount >= 1) {
      li.classList.add("availability-item-partial");
    } else {
      li.classList.add("availability-item-empty");
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `availability-shift-${taskIndex}`;
    checkbox.checked = Boolean(state.currentChecked);
    checkbox.title =
      checkboxHoverTitle(
        state.signups,
        userId,
        userName
      );
    checkbox.dataset.shiftKey = shiftKey(task);

    const textWrap = document.createElement("label");
    textWrap.className = "availability-item-main";
    textWrap.htmlFor = checkbox.id;

    const label = document.createElement("span");
    label.className = "availability-shift-time";
    label.textContent = formatShiftLabel(task);

    const sourceBadge = document.createElement("span");
    sourceBadge.className = "availability-source-badge";
    sourceBadge.textContent = getAvailabilityDisplayTitle(task);

    textWrap.appendChild(label);
    textWrap.appendChild(sourceBadge);

    const expandButton = document.createElement("button");
    expandButton.type = "button";
    expandButton.className = "availability-expand-btn";
    expandButton.textContent = "+";
    expandButton.title = "Details tonen";
    expandButton.setAttribute("aria-expanded", "false");

    const details = document.createElement("div");
    details.className = "availability-details";
    details.id = `availability-details-${taskIndex}`;
    expandButton.setAttribute("aria-controls", details.id);

    const otherUsers = state.signups.filter(
      (signup) =>
        !isSignupForCurrentUser(
          signup,
          userId,
          userName
        )
    );
    const reason = document.createElement("div");
    const reasonLabel = document.createElement("strong");
    reasonLabel.textContent = "Reden:";
    reason.append(reasonLabel, " Handmatige/plannings-taak");
    if (task.source === "ics" || task.icsSummary) {
      const matchHours = task.icsStart && task.icsEnd
        ? ` (${formatHourRange(task.icsStart, task.icsEnd)})`
        : "";
      reason.replaceChildren(reasonLabel);
      reason.append(
        ` ${task.sourceReason || "Voetbalwedstrijd kalender"}${matchHours}`,
        document.createElement("br")
      );
      const summaries = Array.from(new Set(
        (Array.isArray(task.icsSummaries) && task.icsSummaries.length
          ? task.icsSummaries
          : [task.icsSummary]
        ).filter(Boolean)
      ));
      summaries.forEach((summary, summaryIndex) => {
        if (summaryIndex > 0) reason.append(document.createElement("br"));
        reason.append(summary);
      });
    }

    details.appendChild(reason);
    const volunteersHeading = document.createElement("div");
    volunteersHeading.style.marginTop = "6px";
    const volunteersLabel = document.createElement("strong");
    volunteersLabel.textContent = "Andere ingeplande vrijwilligers:";
    volunteersHeading.appendChild(volunteersLabel);
    details.appendChild(volunteersHeading);
    if (otherUsers.length) {
      const volunteers = document.createElement("ul");
      otherUsers.forEach((signup) => {
        const volunteer = document.createElement("li");
        volunteer.textContent = signupDisplayName(signup);
        volunteers.appendChild(volunteer);
      });
      details.appendChild(volunteers);
    } else {
      const noVolunteers = document.createElement("div");
      noVolunteers.textContent = "Geen andere ingeplande personen op dit moment.";
      details.appendChild(noVolunteers);
    }

    expandButton.addEventListener("click", () => {
      const open = details.classList.toggle("is-open");
      expandButton.textContent = open ? "−" : "+";
      expandButton.title = open ? "Details verbergen" : "Details tonen";
      expandButton.setAttribute("aria-expanded", String(open));
    });

    checkbox.addEventListener("change", () => {
      const state = findStateForTask(stateByTask, task);
      if (!state) return;

      state.currentChecked = Boolean(checkbox.checked);

      const monthUnavailableState = getMonthUnavailableState(stateByTask);
      if (monthUnavailableState && state.currentChecked) {
        monthUnavailableState.currentChecked = false;
      }

      syncAvailabilityDom(stateByTask);
      updateDirtyUi(stateByTask);
    });

    const checkboxCell = document.createElement("label");
    checkboxCell.className = "availability-checkbox-cell";
    checkboxCell.htmlFor = checkbox.id;
    checkboxCell.appendChild(checkbox);

    li.appendChild(checkboxCell);
    li.appendChild(textWrap);
    li.appendChild(expandButton);
    li.appendChild(details);
    listEl.appendChild(li);
  });

  syncAvailabilityDom(stateByTask);
  setStatus(`${visibleTasks.length} shifts geladen.`);
}

async function saveChanges({
  stateByTask,
  userId,
  userName,
  scheduleByDay,
  isTeamMode = false,
  teamIsValid = true,
  teamId = null,
  parentDetails = null
}) {
  let parent = null;
  if (isTeamMode) {
    setStatus("");
    if (!teamIsValid) { setStatus("Ploeg niet gevonden.", true); return; }
    const resolvedTeamId = Number(teamId);
    if (!Number.isInteger(resolvedTeamId) || resolvedTeamId <= 0) {
      setStatus("teamId ontbreekt of is ongeldig.", true);
      return;
    }
    parent = validateParentDetails(parentDetails || getParentDetails());
    if (!parent) { setStatus("Controleer de verplichte contactgegevens.", true); return; }
    if (!Array.from(stateByTask.values()).some((state) => state.currentChecked)) {
      setStatus("Selecteer minstens één shift.", true);
      return;
    }
    if (!navigator.onLine) {
      setStatus("Geen internetverbinding. Uw wijzigingen zijn nog niet opgeslagen.", true);
      showAvailabilityToast("Geen internetverbinding. Probeer later opnieuw.", true);
      return;
    }
    try {
      const parentPayload = {
        firstName: parent.firstName.trim(),
        lastName: parent.lastName.trim(),
        phone: parent.phone.trim(),
        teamId: resolvedTeamId
      };
      const person = await JVGHApi.resolveOrCreateAvailabilityUser(parentPayload);
      userId = Number(person?.userId);
      userName = String(person?.displayName || `${parent.firstName} ${parent.lastName}`).trim();
      if (!Number.isInteger(userId) || userId <= 0) throw new Error("Geen geldige gebruiker ontvangen.");
      stateByTask.forEach((state) => {
        const match = state.signups.find((signup) => getSignupUserId(signup) === userId) || null;
        state.userSignup = match;
        state.userSignupTaskId = match?.__taskId ?? state.task.id ?? null;
        state.originalChecked = Boolean(match);
      });
    } catch (error) {
      console.error("[availability-parent]", {
        status: error.status,
        code: error.code,
        message: error.message
      });
      const errorDetails = [
        error.message || "Contactgegevens konden niet worden verwerkt",
        error.code ? `code: ${error.code}` : "",
        error.status ? `status: ${error.status}` : ""
      ].filter(Boolean).join(" — ");
      setStatus(errorDetails, true);
      showAvailabilityToast(`❌ ${errorDetails}`, true);
      return;
    }
  }
  if (!navigator.onLine) {
    setStatus("Geen internetverbinding. Uw wijzigingen zijn nog niet opgeslagen.", true);
    showAvailabilityToast("Geen internetverbinding. Probeer later opnieuw.", true);
    return;
  }

  const saveButtons = document.querySelectorAll(".availability-save-btn");
  saveButtons.forEach((saveButton) => {
    saveButton.disabled = true;
    saveButton.textContent = "Opslaan...";
  });

  try {
    const entries = Array.from(stateByTask.values());
    const toCreate = entries.filter((s) => !s.originalChecked && s.currentChecked);
    const toDelete = entries.filter((s) => s.originalChecked && !s.currentChecked);

    if (!toCreate.length && !toDelete.length) {
      setStatus("Geen wijzigingen om op te slaan.");
      setSaveDirtyState(false);
      return;
    }

    if (!(scheduleByDay instanceof Map)) {
      scheduleByDay = new Map();
    }

    const deleteCurrentSignupFromState = async (state) => {
      const signup = state.userSignup;
      if (!signup?.id) return;

      const signupTaskId =
        state.userSignupTaskId ?? signup.__taskId ?? state.task.id;

      if (!signupTaskId) {
        throw new Error(
          "Kan inschrijving niet verwijderen: oorspronkelijk taskId ontbreekt."
        );
      }

      await JVGHApi.deleteSignup(signupTaskId, signup.id);

      state.signups = state.signups.filter(
        (su) =>
          !(
            Number(su.id) === Number(signup.id) &&
            String(su.__taskId ?? "") === String(signupTaskId)
          )
      );

      state.userSignup = null;
      state.userSignupTaskId = null;
      state.originalChecked = false;
      state.currentChecked = false;
    };

    for (const state of toCreate) {
      const isUnavailable = isMonthUnavailableTask(state.task);
      if (isUnavailable) {
        // Remove ALL normal shift signups first
        for (const otherState of entries) {
          if (
            otherState === state ||
            isMonthUnavailableTask(otherState.task)
          ) {
            continue;
          }

          const signup = otherState.userSignup;

          if (signup?.id) {
            await deleteCurrentSignupFromState(otherState);
          }
        }
      }
      const previousKey = shiftKey(state.task);
      if (
        !state.task.id &&
        Array.isArray(state.task.relatedTaskIds) &&
        state.task.relatedTaskIds.length
      ) {
        state.task.id = state.task.relatedTaskIds[0];
      }

      if (!state.task.id) {
        await ensureTaskForShift(state.task, scheduleByDay);
      }
      const newKey = shiftKey(state.task);
      if (previousKey !== newKey && stateByTask.has(previousKey)) {
        stateByTask.delete(previousKey);
        stateByTask.set(newKey, state);
      }
      if (isUnavailable && !state.userSignup) {
        const created = await JVGHApi.createSignup(state.task.id, {
          firstName: userName,
          lastName: "",
          email: "",
          phone: "",
          userId,
        });

        const signup =
          created?.signup && created.signup.id
            ? created.signup
            : created;

        const normalizedSignup = {
          ...signup,
          __taskId: state.task.id,
        };

        state.signups.push(normalizedSignup);
        state.userSignup = normalizedSignup;
        state.userSignupTaskId = state.task.id;
      }
      if (!isUnavailable) {
        const created = await JVGHApi.createSignup(state.task.id, {
          firstName: parent?.firstName || userName,
          lastName: parent?.lastName || "",
          email: "",
          phone: parent?.phone || "",
          userId,
        });

        const signup = created?.signup && created.signup.id ? created.signup : created;

        const normalizedSignup = {
          ...signup,
          __taskId: state.task.id,
        };

        state.signups.push(normalizedSignup);
        state.userSignup = normalizedSignup;
        state.userSignupTaskId = state.task.id;
      }
      state.originalChecked = true;
      state.currentChecked = true;
    }

    for (const state of toDelete) {
      const isUnavailable = isMonthUnavailableTask(state.task);
      if (isUnavailable) {
        if (!state.task?.id || !state.task?.sheetId) {
          throw new Error(
            "Kan maand-niet-beschikbaar niet verwijderen: task id of sheet id ontbreekt."
          );
        }

        if (typeof JVGHApi.deleteTask !== "function") {
          throw new Error(
            "Kan maand-niet-beschikbaar niet verwijderen: JVGHApi.deleteTask ontbreekt."
          );
        }

        await JVGHApi.deleteTask(state.task.sheetId, state.task.id);

        state.task.id = null;
        state.userSignup = null;
        state.userSignupTaskId = null;
        state.signups = [];
        state.originalChecked = false;
        state.currentChecked = false;
        continue;
      }
      await deleteCurrentSignupFromState(state);
    }

    setStatus("Wijzigingen opgeslagen.");
    showAvailabilityToast(
      "✅ Beschikbaarheid opgeslagen"
    );
    if (updateSaveStateForMode) updateSaveStateForMode(false);
    else setSaveDirtyState(false);

    // Fully reload month from backend after save.
    // This avoids stale in-memory state mismatches.
    if (typeof loadMonth === "function") {
      await loadMonth();
    }
  } catch (err) {
    console.error(err);
    setStatus("Fout bij opslaan van wijzigingen.", true);
    showAvailabilityToast(
      "❌ Fout bij opslaan",
      true
    );
    saveButtons.forEach((saveButton) => {
      saveButton.disabled = false;
      saveButton.textContent = "Opslaan";
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  ensureAvailabilityToast();

  const metaEl = document.getElementById("availability-meta");
  const { userRaw, userId, monthRaw, monthKey, userName: providedName, teamId, isTeamMode } = getQueryParams();
  let resolvedTeamName = null;
  const unavailableContainer = document.querySelector(".availability-month-unavailable");
  if (unavailableContainer) {
    unavailableContainer.hidden = isTeamMode;
    unavailableContainer.classList.toggle("is-hidden", isTeamMode);
  }

  if (!isTeamMode && (!userRaw || userId === null)) {
    setStatus("Open de persoonlijke link die u via WhatsApp of e-mail ontvangen heeft om uw beschikbaarheid door te geven.");
    document.querySelector(".availability-month-unavailable")?.setAttribute("hidden", "");
    return;
  }

  if (isTeamMode) {
    document.querySelector(".availability-month-unavailable")?.setAttribute("hidden", "");
    document.getElementById("availability-parent-details").hidden = false;
    try { resolvedTeamName = await resolveTeamName(teamId); }
    catch (error) { setStatus("Ploeg kon niet worden opgehaald.", true); return; }
    if (!resolvedTeamName) {
      setStatus("Ploeg niet gevonden.", true);
      document.getElementById("availability-list").replaceChildren();
      return;
    }
    requestedTeamName = resolvedTeamName;
  }

  if (!monthRaw || !monthKey) {
    setStatus(
      "Parameter month ontbreekt of is ongeldig. Gebruik bv. ?month=3, ?month=2026-03 of ?month=maart 2026.",
      true
    );
    return;
  }

  let currentMonthDate = monthDateFromKey(monthKey);
  let currentStateByTask = new Map();
  let currentScheduleByDay = new Map();
  let resolvedName = isTeamMode ? null : (providedName || null);
  let monthLoading = false;
  let personalDirty = false;
  function updateExistingPersonalSaveState(isDirty = personalDirty) {
    personalDirty = isDirty;
    setSaveDirtyState(isDirty);
  }
  function updateTeamModeSaveState(isDirty = personalDirty) {
    personalDirty = isDirty;
    if (!isTeamMode) {
      updateExistingPersonalSaveState(isDirty);
      return;
    }
    const contactValid = Boolean(
      validateParentDetails(getParentDetails(), { showErrors: false })
    );
    document.querySelectorAll(".availability-save-btn").forEach((button) => {
      button.disabled = !contactValid || monthLoading;
      button.textContent = "Opslaan";
    });
  }
  updateSaveStateForMode = updateTeamModeSaveState;
  setSaveButtonsVisible(false);
  setCalendarButtonVisible(false);

  function setMonthButtonsDisabled(disabled) {
    const prevBtn = document.getElementById("availability-prev-month");
    const nextBtn = document.getElementById("availability-next-month");
    if (prevBtn) prevBtn.disabled = disabled;
    if (nextBtn) nextBtn.disabled = disabled;
  }

  function renderMetaHeader() {
    const currentMonthKey = monthKeyFromDate(currentMonthDate);
    const prevMonthDate = addMonths(currentMonthDate, -1);
    const nextMonthDate = addMonths(currentMonthDate, 1);
    const prevLabel = prevMonthDate.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
    const nextLabel = nextMonthDate.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });

    metaEl.innerHTML = `
      <div><strong id="availability-page-heading"></strong></div>
      <div class="availability-month">${monthLabelFromKey(currentMonthKey)}</div>
      <div class="availability-month-nav">
        <button type="button" id="availability-prev-month" class="availability-month-btn">${prevLabel}</button>
        <button type="button" id="availability-next-month" class="availability-month-btn">${nextLabel}</button>
      </div>
    `;
    document.getElementById("availability-page-heading").textContent = isTeamMode
      ? `Beschikbaarheid kantinedienst – ${resolvedTeamName}`
      : `Hallo, ${resolvedName || "Gebruiker"} (${userId})`;

    document.getElementById("availability-prev-month").onclick = () => {
      currentMonthDate = addMonths(currentMonthDate, -1);
      loadMonth();
    };
    document.getElementById("availability-next-month").onclick = () => {
      currentMonthDate = addMonths(currentMonthDate, 1);
      loadMonth();
    };
    setMonthButtonsDisabled(monthLoading);
  }

  window.loadMonth = async function loadMonth() {
    if (monthLoading) return;
    monthLoading = true;
    const currentMonthKey = monthKeyFromDate(currentMonthDate);
    try {
      setSaveButtonsVisible(false);
      setCalendarButtonVisible(false);
      renderMetaHeader();
      setMonthButtonsDisabled(true);
      setStatus("Shifts laden…");
      const {
        tasks,
        signupsByTask: embeddedSignupsByTask,
        scheduleByDay
      } = await loadTasksForMonth(currentMonthKey);

      currentScheduleByDay = scheduleByDay;

      console.log(
        "[availability] month-data loaded",
        {
          tasks: tasks.length,
          signups:
            Array.from(embeddedSignupsByTask.values())
              .reduce(
                (sum, arr) => sum + arr.length,
                0
              )
        }
      );

      // Signups worden eerst autoritatief geladen. Pas daarna mag een
      // persisted taak visueel als ghost beoordeeld worden.
      setStatus("Inschrijvingen laden…");
      const signupsByTask = await loadAuthoritativeSignupsByTask(
        tasks.filter((task) => task?.id !== null && task?.id !== undefined),
        embeddedSignupsByTask
      );
      console.log("[availability] authoritative signups loaded", {
        tasks: tasks.filter((task) => task?.id !== null && task?.id !== undefined).length,
        signups: Array.from(signupsByTask.values()).reduce((total, signups) => total + signups.length, 0),
        currentUserId: Number(userId),
      });

      const generatedCalendarShifts = await loadShiftSlotsForMonth(currentMonthKey, {
        teamMode: isTeamMode,
        resolvedTeamName,
      });
      const validTeamShiftKeys = new Set(generatedCalendarShifts.map(
        (shift) => `${shift.date}|${shift.time}`
      ));

      const persistedTasksBySlotKey = new Map();

      tasks.forEach((task) => {
        if (isPersistedMonthUnavailableTask(task, currentMonthKey)) {
          return;
        }

        const key = persistedSlotKey(task);
        const teamKey = `${String(task.date || "").slice(0, 10)}|${String(task.time || "").slice(0, 5)}`;
        if (isTeamMode && !validTeamShiftKeys.has(teamKey)) return;

        if (!persistedTasksBySlotKey.has(key)) {
          persistedTasksBySlotKey.set(key, []);
        }

        persistedTasksBySlotKey.get(key).push(task);
      });

      console.log(
        "[availability] persisted task groups",
        Array.from(persistedTasksBySlotKey.entries()).map(
          ([key, groupedTasks]) => ({
            key,
            taskIds: groupedTasks.map((task) => task.id),
          })
        )
      );

      const mergedByKey = new Map();
      generatedCalendarShifts.forEach((shift) => {
        const key = `${shift.date} ${shift.time}`;
        const existing = mergedByKey.get(key);
        if (!existing) {
          mergedByKey.set(key, shift);
          return;
        }

        mergedByKey.set(key, {
          ...existing,
          sourceEvents: [...(existing.sourceEvents || []), ...(shift.sourceEvents || [])],
          icsSummaries: Array.from(new Set([
            ...(existing.icsSummaries || []),
            ...(shift.icsSummaries || []),
          ].filter(Boolean))),
          teamNames: Array.from(new Set([
            ...(existing.teamNames || []),
            ...(shift.teamNames || []),
          ].filter(Boolean))),
        });
      });
      persistedTasksBySlotKey.forEach((groupedTasks, key) => {
        const existing = mergedByKey.get(key);
        if (isTeamMode && !existing) return;
        /*
         * Gebruik deterministisch de eerste persisted task
         * als canonical task voor deze visuele shift.
         */
        const canonicalTask = groupedTasks[0];

        mergedByKey.set(key, {
          ...(existing || canonicalTask),
          id: canonicalTask.id,
          sheetId: canonicalTask.sheetId,
          scheduleId: canonicalTask.scheduleId,
          date: String(canonicalTask.date || "").slice(0, 10),
          time: String(canonicalTask.time || "").slice(0, 5),
          /*
           * Bewaar alle task-ID's die dezelfde zichtbare shift
           * vertegenwoordigen.
           */
          relatedTaskIds: groupedTasks
            .map((task) => task.id)
            .filter(
              (taskId) => taskId !== null && taskId !== undefined
            ),
        });
      });
      const monthUnavailable = monthUnavailableTask(currentMonthKey);
      const existingMonthUnavailable = tasks.find((task) =>
        isPersistedMonthUnavailableTask(task, currentMonthKey)
      );
      console.log("[availability] existingMonthUnavailable", existingMonthUnavailable);
      if (!isTeamMode && existingMonthUnavailable) {
        mergedByKey.set("month-unavailable", {
          ...monthUnavailable,
          ...existingMonthUnavailable,
          source: "monthly-unavailable",
          sourceReason: "Maand niet beschikbaar",
          isMonthUnavailableDummy: true,
        });
      } else if (!isTeamMode) {
        mergedByKey.set("month-unavailable", monthUnavailable);
      }

      const allShifts = Array.from(mergedByKey.values()).sort((a, b) => {
        if (isMonthUnavailableTask(a)) return -1;
        if (isMonthUnavailableTask(b)) return 1;
        return `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`);
      });
      console.log("[availability] allShifts", allShifts.length, allShifts);
      console.log("[availability] visible shifts", allShifts.filter((task) => !isMonthUnavailableTask(task)).length);

      if (!isTeamMode && !resolvedName) {
        resolvedName = await resolveUserName({ providedName, userId, signupsByTask });
        renderMetaHeader();
      }

      currentStateByTask = new Map();
      allShifts.forEach((task) => {
        const signups = collectSignupsForTaskGroup(task, signupsByTask);
        const userSignup =
          signups.find((signup) =>
            isSignupForCurrentUser(
              signup,
              isTeamMode ? null : userId,
              resolvedName
            )
          ) || null;
        const isMonthUnavailable = isMonthUnavailableTask(task);
        const checked = Boolean(userSignup);
        currentStateByTask.set(shiftKey(task), {
          task,
          signups: [...signups],
          userSignup,
          userSignupTaskId: userSignup?.__taskId ?? task.id ?? null,
          originalChecked: checked,
          currentChecked: checked,
        });
      });
      console.log(
        "[availability] month unavailable state",
        getMonthUnavailableState(currentStateByTask)
      );

      const currentCalendarShiftKeys = new Set(
        generatedCalendarShifts.map((task) => shiftKey(task))
      );
      const hiddenTaskIds = [];
      const visibleShifts = allShifts.filter((task) => {
        const state = currentStateByTask.get(shiftKey(task));
        const signups = Array.isArray(state?.signups) ? state.signups : [];
        const hidden = window.JVGHGhostShifts?.isGhostShift(task, {
          signupCollectionLoaded: true,
          signups,
          currentUserSelected:
            state?.currentChecked === true || state?.originalChecked === true,
          hasCalendarMatch: currentCalendarShiftKeys.has(shiftKey(task)),
        }) === true;
        if (hidden) hiddenTaskIds.push(task.id ?? task.taskId ?? task.task_id);
        return !hidden;
      });
      console.info("[ghost-visual-filter]", {
        page: "availability",
        inputCount: allShifts.length,
        visibleCount: visibleShifts.length,
        hiddenTaskIds,
      });
      if (isTeamMode) console.info("[availability-team-mode]", {
        teamId,
        resolvedTeamName,
        ...generatedCalendarShifts.teamModeCounts,
        renderedShifts: visibleShifts.length,
      });

      renderList({
        tasks: visibleShifts,
        stateByTask: currentStateByTask,
        userId,
        userName: resolvedName
      });
      updateTeamModeSaveState(false);
      setSaveButtonsVisible(true);
      updateCalendarButtonForState(currentStateByTask);

    } catch (err) {
      console.error(err);
      setCalendarButtonVisible(false);
      setStatus("Fout bij laden van shifts of inschrijvingen.", true);
    } finally {
      monthLoading = false;
      setMonthButtonsDisabled(false);
      updateTeamModeSaveState(personalDirty);
    }
  }

  const monthUnavailableCheckbox = document.getElementById("availability-month-unavailable-checkbox");
  if (monthUnavailableCheckbox) {
    monthUnavailableCheckbox.addEventListener("change", () => {
      const monthUnavailableState = getMonthUnavailableState(currentStateByTask);
      if (!monthUnavailableState) return;

      monthUnavailableState.currentChecked = Boolean(monthUnavailableCheckbox.checked);

      if (monthUnavailableState.currentChecked) {
        currentStateByTask.forEach((state) => {
          if (!isMonthUnavailableTask(state.task)) {
            state.currentChecked = false;
          }
        });
      }

      syncAvailabilityDom(currentStateByTask);
      updateDirtyUi(currentStateByTask);
    });
  }

  document.querySelectorAll(".availability-save-btn").forEach((saveButton) => {
    saveButton.onclick = () => {
      saveChanges({
        stateByTask: currentStateByTask,
        userId: isTeamMode ? null : userId,
        userName: resolvedName || "Gebruiker",
        scheduleByDay: currentScheduleByDay,
        isTeamMode,
        teamIsValid: Boolean(resolvedTeamName),
        teamId: teamId,
        parentDetails: isTeamMode ? getParentDetails() : null
      });
    };
  });

  if (isTeamMode) {
    document.querySelectorAll("#availability-parent-details input").forEach((input) => {
      ["input", "change", "blur"].forEach((eventName) => {
        input.addEventListener(eventName, () => updateTeamModeSaveState(personalDirty));
      });
    });
  }

  const calendarBtn = document.getElementById("availability-add-calendar");
  if (calendarBtn) {
    calendarBtn.onclick = () => {
      if (computeDirtyCount(currentStateByTask) > 0) {
        setStatus("Sla je wijzigingen eerst op voordat je je kantinediensten exporteert.");
        return;
      }

      const selectedCount = Array.from(currentStateByTask.values()).filter(
        (state) =>
          !isMonthUnavailableTask(state.task) &&
          state.currentChecked
      ).length;
      if (!selectedCount) {
        setStatus("Selecteer minstens één opgeslagen kantinedienst om naar je kalender te exporteren.");
        return;
      }

      const icsText = buildAvailabilityICS({ stateByTask: currentStateByTask, userName: resolvedName || "Gebruiker" });
      if (!icsText) {
        setStatus("Kon geen geldige kalenderitems maken voor de geselecteerde shifts.", true);
        return;
      }

      const currentMonthKey = monthKeyFromDate(currentMonthDate);
      const safeName = String(resolvedName || "gebruiker")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/(^-|-$)/g, "");
      const fileName = `jvgh-beschikbaarheid-${currentMonthKey}-${safeName || "gebruiker"}.ics`;
      const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setStatus(`${selectedCount} shift(s) geëxporteerd naar kalenderbestand.`);
    };
  }

  await loadMonth();
});
