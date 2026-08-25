document.getElementById("share-button").addEventListener("click", async () => {
  const cal = document.querySelector("#ec");
  if (!cal) return;

  const canvas = await html2canvas(cal, {
    scale: 2,              // sharp image
    backgroundColor: null, // keeps transparency if needed
  });

  const dataURL = canvas.toDataURL("image/png");

  // Detect mobile → use WhatsApp share
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    const blob = await (await fetch(dataURL)).blob();
    const file = new File([blob], "kantie-planning.png", { type: "image/png" });

    if (navigator.share) {
      navigator.share({
        files: [file],
        title: "Kantinedienst planning",
        text: "Planning van JVGH",
      });
      return;
    }
  }

  // Desktop fallback → download PNG
  const link = document.createElement("a");
  link.href = dataURL;
  link.download = "kantie-planning.png";
  link.click();
});

// main.js – JVGH Kantinedienst planner
// NOTE:
// dlssus_qty is overloaded:
// - qty < 60  → volunteer capacity
// - qty >= 60 → assignment duration in minutes (JVGH custom)

const DEFAULT_TWILIO_ACCOUNT_SID =
  "ACf53dde3cbb9c74b2446fcd19f7c4df61";

const DEFAULT_TWILIO_WHATSAPP_FROM =
  "whatsapp:+32460215323";

const DEFAULT_TWILIO_CONTENT_SID =
  "HX55eb6858d19820160e4b39b840bee4db";

const DEFAULT_TWILIO_REMINDER_CONTENT_SID =
  "HXd2a76ecab0c9744284fd0f7ec2e4a569";

// TODO: fill with Twilio Content SID for scheduled-volunteer message
const DEFAULT_TWILIO_SCHEDULED_CONTENT_SID = "";

function ensureAvailabilityOverlay() {
  let overlay = document.getElementById('jvgh-availability-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'jvgh-availability-overlay';
  overlay.className = 'jvgh-availability-overlay hidden';
  overlay.innerHTML = `
    <div class="jvgh-availability-modal">
      <button type="button" class="jvgh-availability-close" aria-label="Sluiten">×</button>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <h2 style="margin:0;">Beschikbaarheid versturen</h2>
      </div>
      <p>Klik op Verstuur om het eerste beschikbaarheidsbericht te sturen of op Herinner om een herinnering te sturen.</p>
      <div class="jvgh-whatsapp-tabs" role="tablist" aria-label="WhatsApp secties">
        <button type="button" class="jvgh-whatsapp-tab is-active" data-tab="bestuur" aria-selected="true">Bestuur</button>
        <button type="button" class="jvgh-whatsapp-tab" data-tab="vrijwilligers" aria-selected="false">Vrijwilligers</button>
        <button type="button" class="jvgh-whatsapp-tab" data-tab="ingepland" aria-selected="false">Ingepland</button>
        <button type="button" class="jvgh-whatsapp-tab" data-tab="instellingen" aria-selected="false">Instellingen</button>
      </div>
      <div id="jvgh-whatsapp-bestuur-panel" class="jvgh-whatsapp-panel" data-panel="bestuur"></div>
      <div id="jvgh-whatsapp-vrijwilligers-panel" class="jvgh-whatsapp-panel hidden" data-panel="vrijwilligers"></div>
      <div id="jvgh-whatsapp-scheduled-panel" class="jvgh-whatsapp-panel hidden" data-panel="ingepland"></div>
      <div id="jvgh-whatsapp-settings-panel" class="jvgh-whatsapp-panel hidden" data-panel="instellingen">
      <label class="jvgh-whatsapp-field">Account SID (Twilio)
        <input id="jvgh-whatsapp-account-sid" type="text" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
      </label>
      <label class="jvgh-whatsapp-field">Afzender (Twilio WhatsApp nummer)
        <input id="jvgh-whatsapp-from" type="text" placeholder="whatsapp:+32460215323" />
      </label>
      <label class="jvgh-whatsapp-field">Template SID (Twilio ContentSid)
        <input id="jvgh-whatsapp-content-sid" type="text" placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
      </label>
      <label class="jvgh-whatsapp-field">Herinnering Template SID (Twilio ContentSid)
        <input id="jvgh-whatsapp-reminder-content-sid" type="text" placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
      </label>
      <label class="jvgh-whatsapp-field">Ingepland Template SID (Twilio ContentSid)
        <input id="jvgh-whatsapp-scheduled-content-sid" type="text" placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
      </label>
      <label class="jvgh-whatsapp-field">Auth token (Twilio)
        <input id="jvgh-twilio-auth-token" type="password" placeholder="Alleen nodig voor server-side Twilio API" />
      </label>
      <p class="small-muted" style="margin-top:6px;">WhatsApp verzenden gebeurt rechtstreeks vanuit de browser via de Twilio API.</p>
      </div>
      <div id="jvgh-send-whatsapp-status" class="small-muted"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('.jvgh-availability-close')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.classList.add('hidden');
  });

  const bestuurPanel = overlay.querySelector('#jvgh-whatsapp-bestuur-panel');
  const vrijwilligersPanel = overlay.querySelector('#jvgh-whatsapp-vrijwilligers-panel');
  const accountSidInput = overlay.querySelector('#jvgh-whatsapp-account-sid');
  const fromInput = overlay.querySelector('#jvgh-whatsapp-from');
  const contentSidInput = overlay.querySelector('#jvgh-whatsapp-content-sid');
  const reminderContentSidInput = overlay.querySelector('#jvgh-whatsapp-reminder-content-sid');
  const scheduledContentSidInput = overlay.querySelector('#jvgh-whatsapp-scheduled-content-sid');

  if (
    accountSidInput &&
    !accountSidInput.value
  ) {
    accountSidInput.value =
      DEFAULT_TWILIO_ACCOUNT_SID;
  }

  if (
    fromInput &&
    !fromInput.value
  ) {
    fromInput.value =
      DEFAULT_TWILIO_WHATSAPP_FROM;
  }

  if (
    contentSidInput &&
    !contentSidInput.value
  ) {
    contentSidInput.value =
      DEFAULT_TWILIO_CONTENT_SID;
  }

  if (
    reminderContentSidInput &&
    !reminderContentSidInput.value
  ) {
    reminderContentSidInput.value =
      DEFAULT_TWILIO_REMINDER_CONTENT_SID;
  }

  if (
    scheduledContentSidInput &&
    !scheduledContentSidInput.value &&
    DEFAULT_TWILIO_SCHEDULED_CONTENT_SID
  ) {
    scheduledContentSidInput.value =
      DEFAULT_TWILIO_SCHEDULED_CONTENT_SID;
  }
  
  const tabs = Array.from(overlay.querySelectorAll('.jvgh-whatsapp-tab'));
  const panels = Array.from(overlay.querySelectorAll('.jvgh-whatsapp-panel'));
  const activateTab = (tabName) => {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
    panels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.panel !== tabName);
    });
    if (tabName === 'ingepland') {
      overlay.dispatchEvent(new CustomEvent('jvgh:scheduled-tab-activated'));
    }
  };
  tabs.forEach((tab) => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));

  return overlay;
}

document.getElementById("print-button").addEventListener("click", () => {
  window.print();
});


const DEFAULT_ASSIGNMENT_DURATION_MINUTES = 240;
const JVGH_CALENDAR_TIME_ZONE = "Europe/Brussels";

function jvghDayKeyFromDate(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = jvghPad2(d.getMonth() + 1);
  const day = jvghPad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function jvghPad2(n) {
  return String(n).padStart(2, "0");
}

function formatEventCalendarLocalDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return (
    `${date.getFullYear()}-` +
    `${jvghPad2(date.getMonth() + 1)}-` +
    `${jvghPad2(date.getDate())}T` +
    `${jvghPad2(date.getHours())}:` +
    `${jvghPad2(date.getMinutes())}:` +
    `${jvghPad2(date.getSeconds())}`
  );
}

function formatInstantForBrusselsCalendar(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: JVGH_CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatFloatingICalDateTime(year, month, day, hour, minute, second = 0) {
  return (
    `${year}-${jvghPad2(month)}-${jvghPad2(day)}T` +
    `${jvghPad2(hour)}:${jvghPad2(minute)}:${jvghPad2(second)}`
  );
}

function taskDateTimeToCalendarValue(dateStr, timeStr, seconds = 0) {
  return `${dateStr}T${timeStr}:${jvghPad2(seconds)}`;
}

// Calendar values are wall-clock components. UTC is used here only as a
// timezone-neutral component calculator; the result remains a string without Z.
function addMinutesToCalendarValue(calendarValue, minutes) {
  const match = String(calendarValue || "").match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return null;
  const date = new Date(
    Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0)) +
      minutes * 60 * 1000
  );
  return formatFloatingICalDateTime(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  );
}

function jvghMonthKey(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = jvghPad2(d.getMonth() + 1);
  return `${y}-${m}`;
}

function jvghFormatMonthLabel(monthKey) {
  if (!monthKey) return "";

  try {
    const [y, m] = monthKey.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("nl-BE", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return monthKey;
  }
}

// Return array of month keys (YYYY-MM) that intersect [start, end)
function jvghMonthsInRange(start, end) {
  const out = [];
  if (!start || !end) return out;

  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s) || isNaN(e)) return out;

  const cur = new Date(s.getTime());
  cur.setDate(1);
  cur.setHours(0, 0, 0, 0);

  if (cur > e) return out;

  while (cur <= e) {
    const key = jvghMonthKey(cur);
    out.push(key);
    cur.setMonth(cur.getMonth() + 1);
  }

  return Array.from(new Set(out));
}

async function jvghResolveSheetIdForDay(dayKey, loadExistingSchedulesOnce, daySheetMap) {
  if (!dayKey) return null;

  if (daySheetMap.has(dayKey)) {
    return daySheetMap.get(dayKey);
  }

  if (typeof loadExistingSchedulesOnce === "function") {
    try {
      await loadExistingSchedulesOnce();
    } catch {}
  }

  if (daySheetMap.has(dayKey)) {
    return daySheetMap.get(dayKey);
  }

  return null;
}

function logAssignmentDecision(action, reason, details = {}) {
  console.groupCollapsed(`[JVGH][${action}] ${reason}`);
  console.log(details);
  console.trace();
  console.groupEnd();
}

function getTaskDurationMinutes(taskQty) {
  const qty = Number(taskQty);
  if (!Number.isFinite(qty)) {
    return DEFAULT_ASSIGNMENT_DURATION_MINUTES;
  }
  if (qty >= 60) {
    console.log("Using task.qty as duration (JVGH custom)", { qty });
    return qty;
  }
  return DEFAULT_ASSIGNMENT_DURATION_MINUTES;
}

function getTaskCapacity(taskQty) {
  const qty = Number(taskQty);
  if (!Number.isFinite(qty)) return 1;
  return qty < 60 ? qty : 1;
}



document.addEventListener("DOMContentLoaded", function () {
  const el = document.getElementById("ec");
  if (!el) {
    console.warn("[JVGH] No #ec element found.");
    return;
  }

  // 🔹 Local "shifts" (keep your existing planning logic)
  let slots = [];

  // Days (YYYY-MM-DD) that still have open shifts
  //let openShiftDays = new Map();

  // Each assignment = 1 person assigned to 1 slot
  // Also stores taskId, signupId, userId, role ('vrijwilliger' | 'bestuur') for delete/linking
  let assignments = []; // { id, slotId, title, taskId, signupId, userId, role }

  // 🔹 Cache: one signup sheet per day
  const daySheetMap = new Map(); // "YYYY-MM-DD" -> sheetId
  const loadedMonths = new Set(); // e.g. "2026-02"
  let lastVisibleMonths = new Set();
  const loadedTaskIds = new Set(); // avoid refetching signups repeatedly for same taskId
  const loadingMonths = new Set(); // prevent double concurrent loads
  const plannerMonthDataCache = new Map();
  const taskBySheetDateTime = new Map();

  function taskLookupKey(sheetId, dateStr, timeStr) {
    return `${sheetId}|${dateStr}|${timeStr}`;
  }

  let schedulesLoaded = false;

  async function loadPlannerMonthData(monthKey) {
    if (plannerMonthDataCache.has(monthKey)) {
      return plannerMonthDataCache.get(monthKey);
    }

    const resp = await JVGHApi.getPlannerMonthData(monthKey);
    console.log(
      "[JVGH][planner-month-data]",
      monthKey,
      resp
    );

    plannerMonthDataCache.set(monthKey, resp);

    return resp;
  }

  async function loadExistingSchedulesOnce() {
    if (schedulesLoaded) return;
    schedulesLoaded = true;
    try {
      const resp = await JVGHApi.getSchedules();
      const arr = Array.isArray(resp.schedules) ? resp.schedules : resp;
      (arr || []).forEach((sch) => {
        const startRaw = sch.start;
        let key = null;
        if (startRaw) {
          const d = new Date(startRaw);
          if (!isNaN(d)) key = jvghDayKeyFromDate(d);
        }
        if (key && !daySheetMap.has(key)) {
          daySheetMap.set(key, sch.id);
        }
      });
    } catch (err) {
      console.warn("Kon bestaande schedules niet laden:", err);
    }
  }

  // Ensure: exactly ONE sheet per day
  async function ensureDaySheet(dayKey, slot) {
    await loadExistingSchedulesOnce();

    if (daySheetMap.has(dayKey)) {
      const sheetId = daySheetMap.get(dayKey);
      slot.sheetId = sheetId;
      return sheetId;
    }

    const scheduleTitle = `Kantinedienst ${dayKey}`;
    const createdSchedule = await JVGHApi.createSchedule({
      title: scheduleTitle,
      start: slot.start,
      end: slot.end,
    });

    const scheduleObj =
      createdSchedule?.schedule && createdSchedule.schedule.id
        ? createdSchedule.schedule
        : createdSchedule;

    const sheetId = scheduleObj.id;
    daySheetMap.set(dayKey, sheetId);
    slot.sheetId = sheetId;
    return sheetId;
  }

  // Ensure: one task per shift (slot), on that day's sheet
  async function ensureTaskForSlot(slot) {
    if (slot.taskId) return slot.taskId;

    if (!slot.sheetId) {
      throw new Error("Slot heeft nog geen sheetId (sheet ontbreekt).");
    }

    const sheetId = slot.sheetId;
    const startDate = new Date(slot.start);

    const dateStr = slot.start.slice(0, 10);
    const timeStr =
      jvghPad2(startDate.getHours()) +
      ":" +
      jvghPad2(startDate.getMinutes());

    const lookupKey = taskLookupKey(
      sheetId,
      dateStr,
      timeStr
    );

    let existingTask =
      taskBySheetDateTime.get(lookupKey);

    if (!existingTask) {
      const createdTask = await JVGHApi.createTask(sheetId, {
        title: `Kantinedienst ${timeStr}`,
        qty: 1,
        date: dateStr,
        time: timeStr,
      });

      existingTask =
        createdTask?.task && createdTask.task.id
          ? createdTask.task
          : createdTask;

      taskBySheetDateTime.set(
        lookupKey,
        existingTask
      );
    }

    slot.taskId = existingTask.id;
    slot.sheetId = sheetId;

    return existingTask.id;
  }

  // 🔹 iCal feed management
  const icalToggleEl = document.getElementById("ical-toggle");
  const eventsIcalToggleEl = document.getElementById("events-ical-toggle");
  const verhuurIcalToggleEl = document.getElementById("verhuur-ical-toggle");
  const dagelijksBestuurIcalToggleEl = document.getElementById("dagelijks-bestuur-ical-toggle");
  const shiftToggleEl = document.getElementById("shift-toggle");
  const icalStatusEl = document.getElementById("ical-status");
  const ICAL_URL =
    "https://jeugdherk.be/calendar/jvgh-kalender/?feed=sp-ical";
  const EVENTS_ICAL_URL = "https://jeugdherk.be/events/lijst/?ical=1";
  const VERHUUR_ICAL_URL =
    "https://outlook.office365.com/owa/calendar/f2d34940b5f74818ac3baf863b3d9c1a@jeugdherk.be/51ee3ee8905543a1b01ab337a8bd734d13775201653858586117/calendar.ics";
  const DAGELIJKS_BESTUUR_ICAL_URL =
    "https://outlook.office365.com/owa/calendar/f2d34940b5f74818ac3baf863b3d9c1a@jeugdherk.be/35511a0627d644998a24502f56390cf118238942820750685558/calendar.ics";

  let icalEnabled = true;
  let eventsIcalEnabled = true;
  let verhuurIcalEnabled = true;
  let dagelijksBestuurIcalEnabled = true;
  let externalEvents = []; // JVGH parsed VEVENTs from ICS
  let eventsIcalExternalEvents = []; // events parsed VEVENTs from ICS
  let verhuurIcalExternalEvents = []; // verhuur parsed VEVENTs from ICS
  let dagelijksBestuurIcalExternalEvents = []; // dagelijks bestuur parsed VEVENTs from ICS
  let shiftsEnabled = false;
  let lastDatesSetInfo = null;
  const availabilityStatusByMonth = new Map();

  function setIcalStatus(msg) {
    if (icalStatusEl) {
      icalStatusEl.textContent = msg || "";
    }
  }
  function getAllExternalEvents() {
    return [...externalEvents, ...eventsIcalExternalEvents, ...verhuurIcalExternalEvents, ...dagelijksBestuurIcalExternalEvents];
  }
  function getEnabledExternalEvents() {
    const enabled = [];
    if (icalEnabled) enabled.push(...externalEvents);
    if (eventsIcalEnabled) enabled.push(...eventsIcalExternalEvents);
    if (verhuurIcalEnabled) enabled.push(...verhuurIcalExternalEvents);
    if (dagelijksBestuurIcalEnabled) enabled.push(...dagelijksBestuurIcalExternalEvents);
    return enabled;
  }

  function parseICalCalendarValue(line) {
    if (!line) return null;
    const separator = line.indexOf(":");
    const parameters = separator >= 0 ? line.slice(0, separator) : "";
    const raw = (separator >= 0 ? line.slice(separator + 1) : line).trim();

    if (/^\d{8}$/.test(raw)) {
      return {
        calendarValue: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
        instant: null,
        isUtc: false,
        isAllDay: true,
      };
    }

    const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i);
    if (!match) return null;
    const [, year, month, day, hour, minute, seconds = "00", utcMarker] = match;
    const isUtc = Boolean(utcMarker);
    const instant = isUtc
      ? new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +seconds))
      : null;

    return {
      calendarValue: isUtc
        ? formatInstantForBrusselsCalendar(instant)
        : formatFloatingICalDateTime(+year, +month, +day, +hour, +minute, +seconds),
      instant,
      isUtc,
      isAllDay: /(?:^|;)VALUE=DATE(?:;|$)/i.test(parameters),
    };
  }

  function parseICS(text, options = {}) {
    const {
      homeTeamFilter = null, // when set, only keep events where left side of "home/away" contains this token
      sourceLabel = "JVGH Matches",
      className = "ical-jvgh-matches",
    } = options;

    // Unfold lines (join lines that start with a space)
    const unfolded = text.replace(/\r?\n[ \t]/g, "");
    const events = [];
    const regex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
    let m;
    while ((m = regex.exec(unfolded)) !== null) {
      const block = m[1];

      function pick(name, includeProperty = false) {
        // take the last match if multiple lines exist
        const re = new RegExp(name + "(:|;[^\\n]*:)([^\\n]*)", "i");
        const mm = block.match(re);
        return mm ? (includeProperty ? mm[0].trim() : mm[2].trim()) : "";
      }

      const dtStartRaw = pick("DTSTART", true);
      const dtEndRaw = pick("DTEND", true);
      const summary = pick("SUMMARY");
      const location = pick("LOCATION");

      const start = parseICalCalendarValue(dtStartRaw);
      const end = parseICalCalendarValue(dtEndRaw);

      if (!start || !start.calendarValue) continue;

      if (homeTeamFilter) {
        // Only keep home matches where "home/away" summary
        // has the selected team on the left side.
        const parts = String(summary || "").split("/");

        const leftSide = String(parts[0] || "")
          .trim()
          .toLowerCase();

        const normalizedHomeTeamFilter = String(homeTeamFilter || "")
          .trim()
          .toLowerCase();

        const isHome =
          parts.length >= 2 && leftSide.includes(normalizedHomeTeamFilter);

        if (!isHome) {
          continue;
        }
      }

      const finalEndValue =
        end && end.calendarValue
          ? end.calendarValue
          : start.isAllDay
            ? start.calendarValue
            : addMinutesToCalendarValue(start.calendarValue, 60);

      events.push({
        id: "ical-" + start.calendarValue + "-" + Math.random().toString(16).slice(2),
        title: summary || "Externe gebeurtenis",
        start: start.calendarValue,
        end: finalEndValue,
        resourceId: "kantine", // 🔹 this is what puts it in the Kantine lane
        extendedProps: {
          type: "ical",
          source: sourceLabel,
          location: location || "",
        },
        classNames: ["ical-event", className],
      });
    }
    return events;
  }

  async function loadICal(target = "jvgh") {
    try {
      setIcalStatus("Laden…");
      const url =
        target === "events"
          ? EVENTS_ICAL_URL
          : target === "verhuur"
            ? VERHUUR_ICAL_URL
            : target === "dagelijksBestuur"
              ? DAGELIJKS_BESTUUR_ICAL_URL
            : ICAL_URL;
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      const parsed =
        target === "events"
          ? parseICS(text, { sourceLabel: "JVGH evenementen iCal", className: "ical-jvgh-evenementen" })
          : target === "verhuur"
            ? parseICS(text, { sourceLabel: "Verhuur kantine iCal", className: "ical-verhuur-kantine" })
            : target === "dagelijksBestuur"
              ? parseICS(text, { sourceLabel: "Dagelijks Bestuur iCal", className: "ical-dagelijks-bestuur" })
            : parseICS(text, {
                homeTeamFilter: "Herk-De-Stad",
                sourceLabel: "JVGH Matches",
                className: "ical-jvgh-matches",
              });
      if (target === "events") {
        eventsIcalExternalEvents = parsed;
      } else if (target === "verhuur") {
        verhuurIcalExternalEvents = parsed;
      } else if (target === "dagelijksBestuur") {
        dagelijksBestuurIcalExternalEvents = parsed;
      } else {
        externalEvents = parsed;
      }
      setIcalStatus("Geladen (" + getAllExternalEvents().length + " events).");
      renderAll();
      if (lastDatesSetInfo && typeof JVGH_ensureVisibleMonthsLoaded === "function") {
        JVGH_ensureVisibleMonthsLoaded(lastDatesSetInfo);
      }
    } catch (err) {
      console.error("ICS load error:", err);
      setIcalStatus(
        "Kon iCal niet laden. Mogelijk door CORS. Overweeg een proxy endpoint op jeugdherk.be dat de ICS doorstuurt met CORS headers."
      );
      // Keep previously loaded events (if any)
    }
  }

  function findSlotForDate(date) {
    return slots.find((slot) => {
      const s = new Date(slot.start);
      const e = new Date(slot.end);
      return date >= s && date < e;
    });
  }

  function findSlotById(slotId) {
    return slots.find((slot) => slot.id === slotId) || null;
  }

  function isSameDay(date, dayKey) {
    if (!date) return false;
    return jvghDayKeyFromDate(date) === dayKey;
  }

  const DEFAULT_SLOT_MIN_TIME = "08:00:00";
  const DEFAULT_SLOT_MAX_TIME = "23:00:00";
  const FULL_SLOT_MIN_TIME = "00:00:00";
  const FULL_SLOT_MAX_TIME = "24:00:00";

  const ec = EventCalendar.create(el, {
    view: "timeGridWeek", // week view is fine for a single resource
    locale: "nl",
    firstDay: 1,
    editable: true,
    eventStartEditable: true,
    eventDurationEditable: true,
    selectable: false,
    height: "auto",
    nowIndicator: true,
    datesSet(info) {
      lastDatesSetInfo = info;
      console.log(
        "[JVGH] datesSet",
        info.view?.type,
        "start", jvghDayKeyFromDate(new Date(info.start)),
        "endExcl", jvghDayKeyFromDate(new Date(info.end))
      );
      if (typeof JVGH_ensureVisibleMonthsLoaded === "function") {
        JVGH_ensureVisibleMonthsLoaded(info);
      }
    },

    // 🔹 custom renderer: always show time + title
    eventContent(info) {
      const event = info.event;
      const ext = event.extendedProps || {};

      const pad = (n) => String(n).padStart(2, "0");
      let timeText = "";
      if (event.start) {
        const s = event.start;
        const e = event.end;
        const startStr = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
        if (!e || s.getTime() === e.getTime()) {
          timeText = startStr;
        } else {
          const endStr = `${pad(e.getHours())}:${pad(e.getMinutes())}`;
          timeText = `${startStr}–${endStr}`;
        }
      }

      // background slots: color only
      if (ext.type === "slot") {
        return { html: "" };
      }

      // volunteer assignments: two lines (time + name)
      if (ext.type === "assignment") {
        const rawTitle =
          event.title ||
          ext.summary ||
          ext.title ||
          "Gebeurtenis";

        const s = event.start;
        const e = event.end;

        const padInner = (n) => String(n).padStart(2, "0");
        const startStr = `${padInner(s.getHours())}:${padInner(s.getMinutes())}`;
        const endStr = e ? `${padInner(e.getHours())}:${padInner(e.getMinutes())}` : "";

        // Split name on spaces → each part on its own line
        const nameHtml = rawTitle
          .split(/\s+/)
          .map((part) => part.trim())
          .filter(Boolean)
          .join("<br>");

        return {
          html: `
      <div class="jvgh-assignment">
        <div class="jvgh-assignment-times">
          <div class="jvgh-time-line">${startStr}</div>
          <div class="jvgh-time-line">${endStr}</div>
        </div>
        <div class="jvgh-assignment-name">${nameHtml}</div>
      </div>
    `,
        };
      }

      // iCal & others: original one-line behaviour
      const title =
        event.title ||
        ext.summary ||
        ext.title ||
        event._def?.title ||
        event._def?.extendedProps?.summary ||
        "Externe gebeurtenis";

      return {
        html: `
      <div class="jvgh-ical-content">
        <div class="ec-event-time">${timeText}</div>
        <div class="jvgh-ical-title">${title || ""}</div>
      </div>
    `,
      };
    },
    slotMinTime: DEFAULT_SLOT_MIN_TIME,
    slotMaxTime: DEFAULT_SLOT_MAX_TIME,

    headerToolbar: {
      start: "prev,next today",
      center: "title",
      end: "dayGridMonth,timeGridWeek,timeGridDay,listWeek,resourceTimeGridDay,resourceTimelineDay",
    },

    buttonText: {
      today: "today",
      dayGridMonth: "month",
      timeGridWeek: "week",
      timeGridDay: "day",
      listWeek: "list",
      resourceTimeGridDay: "resources",
      resourceTimelineDay: "timeline",
    },

    resources: [{ id: "kantine", title: "Kantine" }],

    dayCellDidMount(info) {
      const viewType = info.view.type || "";
      if (!viewType.toLowerCase().includes("daygridmonth")) return;

      const dateStr = jvghDayKeyFromDate(info.date);
      // if (openShiftDays.has(dateStr)) {
      //  info.el.classList.add("jvgh-open-day");

      //   const dot = document.createElement("span");
      //   dot.className = "jvgh-open-dot";
      //   info.el.appendChild(dot);
      // }
    },

    eventDidMount(info) {
      const role = info.event?.extendedProps?.role;
      if (!role) return;

      if (role === "bestuur") {
        info.el.classList.add("event-bestuur");
      } else if (role === "parents") {
        info.el.classList.add("event-ouders");
      } else {
        info.el.classList.add("event-vrijwilliger");
      }
    },

    events: [],

    eventDrop: async (info) => {
      const event = info.event;
      const ext = event.extendedProps || {};

      if (ext.type !== "assignment") {
        logAssignmentDecision("MOVE", "Non-assignment event", {
          assignmentId: event.id,
          slotId: null,
          start: event.start,
          end: event.end,
          taskId: null,
          sheetId: null,
        });
        info.revert();
        return;
      }

      const assignment = assignments.find((a) => a.id === event.id);
      if (!assignment) {
        logAssignmentDecision("MOVE", "Assignment not found", {
          assignmentId: event.id,
          slotId: null,
          start: event.start,
          end: event.end,
          taskId: null,
          sheetId: null,
        });
        info.revert();
        return;
      }

      if (!assignment.taskId) {
        logAssignmentDecision("MOVE", "Assignment missing taskId", {
          assignmentId: assignment.id,
          slotId: assignment.slotId,
          start: event.start,
          end: event.end,
          taskId: assignment.taskId,
          sheetId: assignment.sheetId || null,
        });
        info.revert();
        return;
      }

      const newStart = event.start ? new Date(event.start) : null;
      const newEnd = event.end ? new Date(event.end) : null;
      if (!newStart || !newEnd || isNaN(newStart) || isNaN(newEnd)) {
        logAssignmentDecision("MOVE", "Missing start/end on event", {
          assignmentId: assignment.id,
          slotId: assignment.slotId,
          start: event.start,
          end: event.end,
          taskId: assignment.taskId,
          sheetId: assignment.sheetId || null,
        });
        info.revert();
        return;
      }

      const targetDateKey = jvghDayKeyFromDate(newStart);
      if (!isSameDay(newEnd, targetDateKey)) {
        logAssignmentDecision("MOVE", "Move crosses calendar day", {
          assignmentId: assignment.id,
          slotId: assignment.slotId,
          targetSlotId: null,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          taskId: assignment.taskId,
          sheetId: assignment.sheetId || null,
        });
        info.revert();
        return;
      }

      const targetSlot = findSlotForDate(newStart);
      const resolvedSheetId = await jvghResolveSheetIdForDay(
        targetDateKey,
        loadExistingSchedulesOnce,
        daySheetMap
      );
      if (!Number.isFinite(Number(resolvedSheetId))) {
        logAssignmentDecision("MOVE", "Target sheetId not found for day", {
          assignmentId: assignment.id,
          slotId: assignment.slotId,
          targetSlotId: targetSlot ? targetSlot.id : null,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          taskId: assignment.taskId,
          sheetId: assignment.sheetId || null,
        });
        info.revert();
        return;
      }

      const dateStr = targetDateKey;
      const timeStr = `${jvghPad2(newStart.getHours())}:${jvghPad2(newStart.getMinutes())}`;

      const previousAssignment = {
        start: assignment.start,
        end: assignment.end,
        slotId: assignment.slotId,
        sheetId: assignment.sheetId,
      };

      assignment.start = formatEventCalendarLocalDateTime(newStart);
      assignment.end = formatEventCalendarLocalDateTime(newEnd);
      if (targetSlot) {
        assignment.slotId = targetSlot.id;
      }
      assignment.sheetId = Number(resolvedSheetId);

      try {
        await JVGHApi.updateTask(Number(resolvedSheetId), assignment.taskId, {
          date: dateStr,
          time: timeStr,
        });
      } catch (err) {
        assignment.start = previousAssignment.start;
        assignment.end = previousAssignment.end;
        assignment.slotId = previousAssignment.slotId;
        assignment.sheetId = previousAssignment.sheetId;
        logAssignmentDecision("MOVE", "Backend update failed", {
          assignmentId: assignment.id,
          slotId: previousAssignment.slotId,
          targetSlotId: targetSlot ? targetSlot.id : null,
          start: assignment.start,
          end: assignment.end,
          taskId: assignment.taskId,
          sheetId: resolvedSheetId,
          error: err,
        });
        console.error("[JVGH] Failed to update task for drag move:", err);
        info.revert();
        return;
      }
    },

    eventResize: async (info) => {
      const event = info.event;
      const ext = event.extendedProps || {};

      if (ext.type !== "assignment") {
        logAssignmentDecision("RESIZE", "Non-assignment event", {
          assignmentId: event.id,
          slotId: null,
          start: event.start,
          end: event.end,
          taskId: null,
          sheetId: null,
        });
        info.revert();
        return;
      }

      const assignment = assignments.find((a) => a.id === event.id);
      if (!assignment) {
        logAssignmentDecision("RESIZE", "Assignment not found", {
          assignmentId: event.id,
          slotId: null,
          start: event.start,
          end: event.end,
          taskId: null,
          sheetId: null,
        });
        info.revert();
        return;
      }

      if (!assignment.taskId) {
        logAssignmentDecision("RESIZE", "Assignment missing taskId", {
          assignmentId: assignment.id,
          slotId: assignment.slotId,
          start: event.start,
          end: event.end,
          taskId: assignment.taskId || null,
          sheetId: assignment.sheetId || null,
        });
        info.revert();
        return;
      }

      const newStart = event.start ? new Date(event.start) : null;
      const newEnd = event.end ? new Date(event.end) : null;
      if (!newStart || !newEnd || isNaN(newStart) || isNaN(newEnd)) {
        logAssignmentDecision("RESIZE", "Missing start/end on event", {
          assignmentId: assignment.id,
          slotId: assignment.slotId,
          start: event.start,
          end: event.end,
          taskId: assignment.taskId || null,
          sheetId: assignment.sheetId || null,
        });
        info.revert();
        return;
      }

      if (newEnd <= newStart) {
        logAssignmentDecision("RESIZE", "Resize resulted in invalid duration", {
          assignmentId: assignment.id,
          slotId: assignment.slotId,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          taskId: assignment.taskId || null,
          sheetId: assignment.sheetId || null,
        });
        info.revert();
        return;
      }

      const targetDateKey = jvghDayKeyFromDate(newStart);
      if (!isSameDay(newEnd, targetDateKey)) {
        logAssignmentDecision("RESIZE", "Resize crosses calendar day", {
          assignmentId: assignment.id,
          slotId: assignment.slotId,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          taskId: assignment.taskId || null,
          sheetId: assignment.sheetId || null,
        });
        info.revert();
        return;
      }

      const resolvedSheetId = await jvghResolveSheetIdForDay(
        targetDateKey,
        loadExistingSchedulesOnce,
        daySheetMap
      );
      if (!Number.isFinite(Number(resolvedSheetId))) {
        logAssignmentDecision("RESIZE", "Target sheetId not found for day", {
          assignmentId: assignment.id,
          slotId: assignment.slotId,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          taskId: assignment.taskId || null,
          sheetId: assignment.sheetId || null,
        });
        info.revert();
        return;
      }

      const durationMinutes = Math.round(
        (newEnd.getTime() - newStart.getTime()) / 60000
      );
      if (durationMinutes < 60) {
        logAssignmentDecision("RESIZE", "Duration below JVGH qty threshold", {
          assignmentId: assignment.id,
          slotId: assignment.slotId,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          durationMinutes,
          taskId: assignment.taskId || null,
          sheetId: Number(resolvedSheetId),
        });
        info.revert();
        return;
      }

      const previousAssignment = {
        start: assignment.start,
        end: assignment.end,
        sheetId: assignment.sheetId,
      };

      assignment.start = formatEventCalendarLocalDateTime(newStart);
      assignment.end = formatEventCalendarLocalDateTime(newEnd);
      assignment.sheetId = Number(resolvedSheetId);

      console.log("Using task.qty as duration (JVGH custom)", {
        qty: durationMinutes,
      });

      try {
        await JVGHApi.updateTask(Number(resolvedSheetId), assignment.taskId, {
          qty: durationMinutes,
        });
      } catch (err) {
        assignment.start = previousAssignment.start;
        assignment.end = previousAssignment.end;
        assignment.sheetId = previousAssignment.sheetId;
        logAssignmentDecision("RESIZE", "Backend update failed", {
          assignmentId: assignment.id,
          slotId: assignment.slotId,
          start: assignment.start,
          end: assignment.end,
          durationMinutes,
          taskId: assignment.taskId || null,
          sheetId: Number(resolvedSheetId),
          error: err,
        });
        console.error("[JVGH] Failed to update task duration:", err);
        info.revert();
      }
    },
  });

  window.ec = ec;

  const toggleHoursButton = document.getElementById("toggle-hours-button");
  const refreshMonthButton = document.getElementById("refresh-month-button");
  let showAllHours = false;

  function applyHourRange() {
    if (!ec) return;
    ec.setOption("slotMinTime", showAllHours ? FULL_SLOT_MIN_TIME : DEFAULT_SLOT_MIN_TIME);
    ec.setOption("slotMaxTime", showAllHours ? FULL_SLOT_MAX_TIME : DEFAULT_SLOT_MAX_TIME);
    ec.setOption("scrollTime", showAllHours ? FULL_SLOT_MIN_TIME : DEFAULT_SLOT_MIN_TIME);
  }

  function updateHourToggleButtonUi() {
    if (!toggleHoursButton) return;
    toggleHoursButton.textContent = showAllHours ? "Toon standaarduren" : "Laat alle uren zien";
    toggleHoursButton.setAttribute("aria-pressed", String(showAllHours));
  }

  if (toggleHoursButton) {
    toggleHoursButton.disabled = false;
    updateHourToggleButtonUi();
    toggleHoursButton.addEventListener("click", () => {
      showAllHours = !showAllHours;
      applyHourRange();
      updateHourToggleButtonUi();
    });
  }

  function getCurrentVisibleMonthKey() {
    const focusedDate =
      lastDatesSetInfo?.view?.currentStart ||
      lastDatesSetInfo?.start ||
      new Date();
    return jvghMonthKey(new Date(focusedDate));
  }

  function getCurrentPlannerMonthKey() {
    const focusedDate =
      lastDatesSetInfo?.view?.currentStart ||
      lastDatesSetInfo?.start ||
      new Date();
    return jvghMonthKey(new Date(focusedDate));
  }

  async function loadAvailabilityStatusForMonth(monthKey) {
    if (!monthKey) return new Map();
    if (availabilityStatusByMonth.has(monthKey)) {
      return availabilityStatusByMonth.get(monthKey);
    }

    const result = new Map();
    try {
      const plannerData = await loadPlannerMonthData(monthKey);
      console.log(
        "[JVGH][planner-month-data]",
        monthKey,
        plannerData
      );

      const schedules = Array.isArray(plannerData?.schedules)
        ? plannerData.schedules
        : [];

      for (const schedule of schedules) {
        const tasks = Array.isArray(schedule?.tasks)
          ? schedule.tasks
          : [];

        for (const task of tasks) {
          const normalizedTitle = String(task?.title || "")
            .trim()
            .toLowerCase();

          const isUnavailableTask =
            normalizedTitle === "niet beschikbaar deze maand" ||
            normalizedTitle === "ik ben niet beschikbaar deze maand";

          const isKantineTask =
            normalizedTitle.includes("kantinedienst");

          const isAvailabilityTask =
            isUnavailableTask ||
            isKantineTask;

          if (!isAvailabilityTask) {
            continue;
          }

          const signups = Array.isArray(task?.signups)
            ? task.signups
            : [];

          console.log(
            "[JVGH][AVAILABILITY] task",
            task.id,
            normalizedTitle,
            signups
          );

          signups.forEach((signup) => {
            const rawUserId =
              signup?.userId ??
              signup?.user_id;

            const userId = Number(rawUserId);

            console.log(
              "[JVGH][AVAILABILITY] signup user",
              rawUserId,
              userId,
              signup
            );

            if (
              Number.isFinite(userId) &&
              isAvailabilityTask
            ) {
              result.set(userId, true);
            }
          });
        }
      }
    } catch (err) {
      console.error("[JVGH] Failed to load availability status", err);
    }

    console.log(
      "[JVGH][AVAILABILITY][FINAL]",
      monthKey,
      Array.from(result.entries())
    );

    availabilityStatusByMonth.set(monthKey, result);
    return result;
  }

  async function refreshCurrentMonthData() {
    const monthKey = getCurrentVisibleMonthKey();
    if (!monthKey) return;

    const monthLabel = jvghFormatMonthLabel(monthKey);
    if (refreshMonthButton) refreshMonthButton.disabled = true;

    try {
      showLoading(`Verversen ${monthLabel}…`);

      loadedMonths.delete(monthKey);
      loadingMonths.delete(monthKey);
      plannerMonthDataCache.delete(monthKey);
      for (const key of Array.from(taskBySheetDateTime.keys())) {
        if (key.includes(`|${monthKey}-`)) {
          taskBySheetDateTime.delete(key);
        }
      }
      loadedTaskIds.clear();
      schedulesLoaded = false;

      for (const dayKey of Array.from(daySheetMap.keys())) {
        if (dayKey.startsWith(monthKey + "-")) {
          daySheetMap.delete(dayKey);
        }
      }

      assignments = assignments.filter((assignment) => {
        const start = String(assignment.start || "");
        return !start.startsWith(monthKey);
      });

      slots = slots.filter((slot) => {
        const start = String(slot.start || "");
        const isMonthSlot = start.startsWith(monthKey);
        const isGeneratedTaskSlot =
          slot.manual &&
          String(slot.id || "").startsWith("shift-task-");
        return !(isMonthSlot && isGeneratedTaskSlot);
      });

      slots.forEach((slot) => {
        const start = String(slot.start || "");
        if (!start.startsWith(monthKey)) return;
        delete slot.taskId;
        delete slot.sheetId;
      });

      renderAll();
      await JVGH_loadMonthTasksAndSignups(monthKey);

      if (icalEnabled || shiftsEnabled) {
        await loadICal();
      }

      if (lastDatesSetInfo && typeof JVGH_ensureVisibleMonthsLoaded === "function") {
        await JVGH_ensureVisibleMonthsLoaded(lastDatesSetInfo);
      }

      setIcalStatus(`Huidige maand ververst (${monthLabel}).`);
    } catch (err) {
      console.error("[JVGH] Error while refreshing current month", err);
      setIcalStatus(`Verversen mislukt (${monthLabel}).`);
    } finally {
      hideLoading();
      if (refreshMonthButton) refreshMonthButton.disabled = false;
    }
  }

  if (refreshMonthButton) {
    refreshMonthButton.disabled = false;
    refreshMonthButton.addEventListener("click", () => {
      refreshCurrentMonthData();
    });
  }

  function jvghTriggerVisibleLoadSoon() {
    if (!lastDatesSetInfo || typeof JVGH_ensureVisibleMonthsLoaded !== "function") return;
    // Wait for the calendar to finish applying the navigation change
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        JVGH_ensureVisibleMonthsLoaded(lastDatesSetInfo);
      });
    });
  }

  const ecRoot = document.getElementById("ec");
  if (ecRoot) {
    ecRoot.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      // Match navigation + view buttons by class names used by EventCalendar
      const cls = btn.className || "";
      const isNav =
        cls.includes("ec-prev") ||
        cls.includes("ec-next") ||
        cls.includes("ec-today") ||
        cls.includes("ec-dayGridMonth") ||
        cls.includes("ec-timeGridWeek") ||
        cls.includes("ec-timeGridDay") ||
        cls.includes("ec-listWeek") ||
        cls.includes("ec-resourceTimeGridDay") ||
        cls.includes("ec-resourceTimelineDay");

      if (!isNav) return;

      // Trigger after click so forward transitions also load correctly
      jvghTriggerVisibleLoadSoon();
    }, true);
  }

  // Click on a day in month/week → open that day
  ec.setOption("dateClick", function (info) {
    ec.setOption("view", "timeGridDay");
    ec.setOption("date", info.date);
  });

  // Dubbelklik op een vrijwilliger → inschrijving verwijderen
  let lastEventClick = { id: null, time: 0 };

  ec.setOption("eventClick", function (info) {
    const event = info.event;
    const ext = event.extendedProps || {};

    // Alleen voor vrijwilliger-assignments
    if (ext.type !== "assignment") {
      return;
    }

    const now = Date.now();

    // Tweede klik binnen 400ms op dezelfde event = dubbelklik
    if (lastEventClick.id === event.id && now - lastEventClick.time < 400) {
      lastEventClick = { id: null, time: 0 };

      const assignment = assignments.find((a) => a.id === event.id);
      if (!assignment) return;

      const name = (assignment.title || "vrijwilliger").trim();
      if (!window.confirm(`Inschrijving van "${name}" verwijderen?`)) {
        return;
      }

      // Optimistisch uit de UI verwijderen
      assignments = assignments.filter((a) => a.id !== assignment.id);
      renderAll();

      // En op de achtergrond ook in de Sign-up Sheets API verwijderen
      if (assignment.taskId && assignment.signupId) {
        JVGHApi.deleteSignup(assignment.taskId, assignment.signupId).catch(
          (err) => {
            console.error("Fout bij verwijderen van inschrijving:", err);
          }
        );
      }
    } else {
      // Eerste klik: enkel onthouden
      lastEventClick = { id: event.id, time: now };
    }
  });

  // Render slots + assignments (+ iCal) into calendar events
  function renderAll() {
    const events = [];

    // Bewaar bestaande handmatige slots
    const manualSlots = slots.filter((s) => s.manual);

    // Rebuild slots dynamically from iCal when shifts are enabled
    slots = [];
    const allExternalEvents = getAllExternalEvents();
    if (shiftsEnabled && allExternalEvents.length) {
      allExternalEvents.forEach((ev, idx) => {
        try {
          if (!ev.start || !ev.start.includes("T")) return;
          const end = ev.end && ev.end.includes("T")
            ? ev.end
            : addMinutesToCalendarValue(ev.start, 60);
          const shiftStart = addMinutesToCalendarValue(ev.start, -60); // 1h before match
          const shiftEnd = addMinutesToCalendarValue(end, 120); // 2h after match
          if (!shiftStart || !shiftEnd) return;

          const shiftId = `shift-${ev.start}-${idx}`;

          slots.push({
            id: shiftId,
            start: shiftStart,
            end: shiftEnd,
            required: 5,
            resourceId: "kantine",
          });
        } catch (e) {
          console.error("Error building shift slot from iCal event", ev, e);
        }
      });
    }

    // Voeg handmatige slots terug toe
    slots = slots.concat(manualSlots);
    // 🔁 Re-attach sheetId to rebuilt slots
    slots.forEach((slot) => {
      const dayKey = slot.start.slice(0, 10);
      if (!slot.sheetId && daySheetMap.has(dayKey)) {
        slot.sheetId = daySheetMap.get(dayKey);
      }
    });

    // track which days still have open shifts
    //openShiftDays = new Map();

    slots.forEach((slot) => {
      const slotAssignments = assignments.filter((a) => a.slotId === slot.id);

      // Deduplicate assignments per slot by title
      const uniqueByName = new Map();
      slotAssignments.forEach((a) => {
        const key = (a.title || "").trim();
        if (!uniqueByName.has(key)) {
          uniqueByName.set(key, a);
        }
      });
      const uniqueAssignments = Array.from(uniqueByName.values());

      const planned = uniqueAssignments.length;
      const req = slot.required;

      let statusClass = "slot-partial";
      if (planned === 0) statusClass = "slot-empty";
      else if (planned >= req) statusClass = "slot-full";

      if (planned < req) {
        const dayKey = slot.start.slice(0, 10); // "YYYY-MM-DD"
        //openShiftDays.add(dayKey);
      }

      // Background band representing the slot
      events.push({
        id: slot.id,
        title: `Kantinedienst (${planned}/${req})`,
        start: slot.start,
        end: slot.end,
        resourceId: "kantine",
        display: "background",
        extendedProps: { type: "slot", slotId: slot.id },
        classNames: ["slot", statusClass],
      });

      // Foreground events = individual assignments (deduped)
      uniqueAssignments.forEach((a) => {
        const role =
          a.role ||
          a.data_role ||
          (a.team_id ? "parents" : null) ||
          (a.player_id ? "parents" : null) ||
          "vrijwilliger";

        const eventStart = a.start || slot.start;
        const eventEnd = a.end || slot.end;

        events.push({
          id: a.id,
          title: a.title,
          start: eventStart,
          end: eventEnd,
          resourceId: "kantine",
          extendedProps: { type: "assignment", slotId: slot.id, role },
        });
      });
    });

    // Merge iCal events if enabled
    const enabledExternalEvents = getEnabledExternalEvents();
    if (enabledExternalEvents.length) {
      enabledExternalEvents.forEach((ev) => {
        // guarantee we have a usable title
        const title =
          ev.title ||
          ev.summary ||
          (ev.extendedProps &&
            (ev.extendedProps.summary || ev.extendedProps.title)) ||
          "Externe gebeurtenis";

        events.push({
          ...ev,
          title,
          classNames: Array.isArray(ev.classNames)
            ? [...ev.classNames, "ical-event"]
            : ["ical-event"],
        });
      });
    }

    ec.setOption("events", events);
  }

  // Fullscreen loading overlay (for slow signup loading)
  let loadingOverlay = null;
  let loadingTextEl = null;

  function ensureLoadingOverlay() {
    if (loadingOverlay) return loadingOverlay;
    loadingOverlay = document.createElement("div");
    loadingOverlay.id = "jvgh-loading-overlay";

    const logoEl = document.querySelector(".jvgh-logo");
    const logoSrc = logoEl ? logoEl.src : "";

    loadingOverlay.innerHTML = `
      <div class="jvgh-loading-box">
        ${logoSrc ? `<img src="${logoSrc}" alt="JVGH" class="jvgh-loading-logo" />` : ""}
        <div class="jvgh-loading-spinner"></div>
        <div class="jvgh-loading-text">Aanwezigheden laden…</div>
      </div>
    `;

    document.body.appendChild(loadingOverlay);
    loadingTextEl = loadingOverlay.querySelector(".jvgh-loading-text");
    return loadingOverlay;
  }

  function showLoading(text) {
    const overlay = ensureLoadingOverlay();
    if (loadingTextEl && text) {
      loadingTextEl.textContent = text;
    }
    overlay.classList.add("jvgh-loading-visible");
  }

  function hideLoading() {
    if (!loadingOverlay) return;
    loadingOverlay.classList.remove("jvgh-loading-visible");
  }

  // 🔹 Load existing tasks/signups month-by-month from JVGH API and map them onto slots
  async function JVGH_loadMonthTasksAndSignups(monthKey) {
    if (!monthKey) return;
    if (!window.JVGHApi || typeof JVGHApi.getPlannerMonthData !== "function") {
      console.warn("[JVGH] JVGHApi not available, cannot load signups.");
      return;
    }

    const monthLabel = jvghFormatMonthLabel(monthKey);

    if (loadedMonths.has(monthKey) || loadingMonths.has(monthKey)) {
      return;
    }

    loadingMonths.add(monthKey);
    showLoading(`Laden ${monthLabel}…`);
    console.log("[JVGH] Loading month", monthKey, "(", monthLabel, ")");

    try {
      let sheetsProcessed = 0;
      let tasksProcessed = 0;

      const plannerData = await loadPlannerMonthData(monthKey);
      console.log(
        "[JVGH][planner-month-data]",
        monthKey,
        plannerData
      );

      const schedules = Array.isArray(plannerData?.schedules)
        ? plannerData.schedules
        : [];

      schedules.forEach((schedule) => {
        const startRaw = schedule?.start;
        let key = null;
        if (startRaw) {
          const d = new Date(startRaw);
          if (!isNaN(d)) key = jvghDayKeyFromDate(d);
        }
        if (key && key.startsWith(monthKey + "-") && !daySheetMap.has(key)) {
          daySheetMap.set(key, schedule.id);
        }
      });

      console.log("[JVGH] Month sheets", monthKey, schedules.length);

      const slotByKey = new Map();
      const slotByTaskId = new Map();
      slots.forEach((slot) => {
        try {
          const d = new Date(slot.start);
          if (!d || isNaN(d)) return;
          const dateStr = jvghDayKeyFromDate(d);
          const timeStr = jvghPad2(d.getHours()) + ":" + jvghPad2(d.getMinutes());
          const key = dateStr + " " + timeStr;
          if (!slotByKey.has(key)) slotByKey.set(key, slot);
          if (slot.taskId !== undefined && slot.taskId !== null) {
            slotByTaskId.set(String(slot.taskId), slot);
          }
        } catch (e) {
          console.warn("[JVGH] Could not build key for slot", slot, e);
        }
      });

      const newAssignments = [];

      for (const schedule of schedules) {
        const sheetId = schedule?.id;
        if (sheetId === undefined || sheetId === null) continue;
        sheetsProcessed += 1;

        const tasksArr = Array.isArray(schedule?.tasks) ? schedule.tasks : [];
        if (!tasksArr.length) continue;

        for (const task of tasksArr) {
          const dateStr = String(task?.date || "").slice(0, 10);
          const timeStr = String(task?.time || "").slice(0, 5);
          if (!dateStr || !timeStr) continue;
          if (!dateStr.startsWith(monthKey)) continue;

          const lookupKey = taskLookupKey(
            sheetId,
            dateStr,
            timeStr
          );
          taskBySheetDateTime.set(
            lookupKey,
            task
          );

          tasksProcessed += 1;

          const taskKey = dateStr + " " + timeStr;
          let slot = slotByTaskId.get(String(task.id)) || slotByKey.get(taskKey);

          if (!slot) {
            const existingManualSlot = slots.find((s) => s.id === "shift-task-" + String(task.id));
            if (existingManualSlot) {
              slot = existingManualSlot;
            }
          }

          if (!slot) {
            try {
              const qty = Number(task.qty) || 1;
              const durationMinutes = qty >= 60 ? qty : DEFAULT_ASSIGNMENT_DURATION_MINUTES;
              const slotStartValue = taskDateTimeToCalendarValue(dateStr, timeStr);
              const slotEndValue = addMinutesToCalendarValue(slotStartValue, durationMinutes);

              slot = {
                id: "shift-task-" + String(task.id),
                start: slotStartValue,
                end: slotEndValue,
                required: 5,
                resourceId: "kantine",
                manual: true,
              };

              slots.push(slot);
            } catch (e) {
              console.warn("[JVGH] Could not create manual slot for task", task, e);
              continue;
            }
          }

          slotByKey.set(taskKey, slot);
          slotByTaskId.set(String(task.id), slot);

          slot.sheetId = sheetId;
          slot.taskId = task.id;
          if (task.qty !== undefined && task.qty !== null) {
            slot.required = getTaskCapacity(task.qty);
          }

          const taskIdKey = String(task.id);
          if (loadedTaskIds.has(taskIdKey)) continue;
          loadedTaskIds.add(taskIdKey);

          const signupsArr = Array.isArray(task?.signups) ? task.signups : [];
          if (!signupsArr.length) continue;

          const durationMinutes = getTaskDurationMinutes(task.qty);
          const assignmentStartValue = taskDateTimeToCalendarValue(dateStr, timeStr);
          const assignmentEndValue = addMinutesToCalendarValue(assignmentStartValue, durationMinutes);

          signupsArr.forEach((su) => {
            const firstName = su.firstName || su.firstname || su.first_name || "";
            const lastName = su.lastName || su.lastname || su.last_name || "";
            const name = (firstName + " " + lastName).trim() || "Vrijwilliger";

            const already = assignments.some((a) =>
              (a.taskId === task.id && a.signupId === su.id) ||
              (a.slotId === slot.id && a.signupId === su.id)
            ) || newAssignments.some((a) =>
              (a.taskId === task.id && a.signupId === su.id) ||
              (a.slotId === slot.id && a.signupId === su.id)
            );
            if (already) return;

            const userId = su.userId || su.user_id || null;
            const dataRole = su.data_role || su.dataRole || null;
            const teamId = su.team_id || su.teamId || null;
            const playerId = su.player_id || su.playerId || null;
            let role =
              su.role ||
              dataRole ||
              (teamId ? "parents" : null) ||
              (playerId ? "parents" : null) ||
              "vrijwilliger";
            if (userId !== null && userId !== undefined && bestuurUserIds.has(Number(userId))) {
              role = "bestuur";
            } else if (name && bestuurNames.has(name)) {
              role = "bestuur";
            }

            newAssignments.push({
              id: "a-" + String(slot.id) + "-" + String(su.id),
              slotId: slot.id,
              title: name,
              taskId: task.id,
              signupId: su.id,
              userId,
              role,
              data_role: dataRole,
              team_id: teamId,
              player_id: playerId,
              start: assignmentStartValue,
              end: assignmentEndValue,
            });
          });
        }
      }

      assignments = assignments.concat(newAssignments);
      retagBestuurAssignments();
      renderAll();

      if (sheetsProcessed > 0) {
        loadedMonths.add(monthKey);
      } else {
        console.warn("[JVGH] Month had no schedules in daySheetMap; not marking loaded:", monthKey);
      }
      console.log("[JVGH] Loaded month", monthKey, "tasks", tasksProcessed, "newAssignments", newAssignments.length);
    } catch (err) {
      console.error("[JVGH] Error while loading month", monthKey, err);
    } finally {
      loadingMonths.delete(monthKey);
      hideLoading();
    }
  }

  async function JVGH_ensureVisibleMonthsLoaded(info) {
    if (!info || !info.start || !info.end) {
      console.warn("[JVGH] ensureVisibleMonthsLoaded called without valid info — ignoring");
      return;
    }

    // EventCalendar provides view type on info.view?.type
    const viewType = info.view?.type || "";

    let months = [];

    if (viewType === "dayGridMonth") {
      // Month view: only load the focused month shown in the title.
      // Use currentStart if available; fallback to info.start.
      const focusedDate = info.view?.currentStart || info.start;
      const focusedMonth = jvghMonthKey(new Date(focusedDate));
      if (focusedMonth) months = [focusedMonth];
    } else {
      // Week/day/list/resource views: load months intersecting the visible range.
      // Use actual focused view range first; fallback to info start/end.
      // end is exclusive → subtract 1ms to make it inclusive for month detection.
      const startSrc = info.view?.currentStart || info.start;
      const endSrcExcl = info.view?.currentEnd || info.end;
      const endInclusive = new Date(new Date(endSrcExcl).getTime() - 1);
      months = jvghMonthsInRange(startSrc, endInclusive);
    }

    console.log("[JVGH] Visible months from info:", months.join(", "), "view:", viewType);

    for (const m of months) {
      if (!loadedMonths.has(m) && !loadingMonths.has(m)) {
        await JVGH_loadMonthTasksAndSignups(m);
      }
    }

    renderAll();
  }

  // make it callable from other scripts if needed
  window.JVGH_loadMonthTasksAndSignups = JVGH_loadMonthTasksAndSignups;
  window.JVGH_ensureVisibleMonthsLoaded = JVGH_ensureVisibleMonthsLoaded;


  // initial empty render
  renderAll();

  // --- External drag & drop from sidebar into calendar ---

  const calendarEl = document.getElementById("ec");
  const volunteerListEl = document.getElementById("vrijwilligers-list");
  const bestuurListEl = document.getElementById("bestuur-list");
  const sendAvailabilityMailsButton = document.getElementById(
    "send-availability-mails-button"
  );
  const parentsTeamSelectEl =
    document.getElementById("jvgh-team-select") ||
    document.getElementById("parentsTeamSelect");
  const parentsListEl =
    document.getElementById("jvgh-parents-options") ||
    document.getElementById("parentsList");
  const parentsTeamsStatusEl = document.getElementById("parentsTeamsStatus");
  const oudersTeamPillHostEl = document.getElementById("jvgh-ouders-team-pill");
  const oudersPlayerPillHostEl = document.getElementById("jvgh-parents-options");
  const bestuurTabLabel = document.querySelector('.people-tab[data-tab="bestuur"]');
  const vrijwilligersTabLabel = document.querySelector('.people-tab[data-tab="vrijwilligers"]');
  let youthTeams = [];
  const youthTeamsById = new Map();

  if (parentsTeamSelectEl && oudersTeamPillHostEl) {
    const row = document.createElement("div");
    row.className = "ouders-row";
    parentsTeamSelectEl.parentNode.insertBefore(row, parentsTeamSelectEl);
    row.appendChild(parentsTeamSelectEl);
    parentsTeamSelectEl.classList.add("jvgh-select");
    row.appendChild(oudersTeamPillHostEl);
    oudersTeamPillHostEl.classList.add("ouders-pillhost");
    oudersTeamPillHostEl.id = "ouders-team-pillhost";
  }

  

  const peopleTabs = Array.from(document.querySelectorAll('.people-tab'));
  const peoplePanels = Array.from(document.querySelectorAll('.people-panel'));

  function setActivePeopleTab(tabName) {
    peopleTabs.forEach((tab) => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    peoplePanels.forEach((panel) => {
      const isActive = panel.dataset.panel === tabName;
      panel.classList.toggle('is-active', isActive);
      panel.hidden = !isActive;
    });
  }

  peopleTabs.forEach((tab) => {
    tab.addEventListener('click', () => setActivePeopleTab(tab.dataset.tab));
  });

  const playerSelectEl = document.querySelector('#jvgh-player-select');
  if (playerSelectEl && oudersPlayerPillHostEl) {
    const row = document.createElement("div");
    row.className = "ouders-row";
    playerSelectEl.parentNode.insertBefore(row, playerSelectEl);
    row.appendChild(playerSelectEl);
    playerSelectEl.classList.add("jvgh-select");
    row.appendChild(oudersPlayerPillHostEl);
    oudersPlayerPillHostEl.classList.add("ouders-pillhost");
    oudersPlayerPillHostEl.id = "ouders-player-pillhost";
  }

  if (calendarEl) {
    calendarEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    });

    calendarEl.addEventListener("drop", async (e) => {
      e.preventDefault();

      const raw = e.dataTransfer && e.dataTransfer.getData("text/plain");
      if (!raw) return;

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      const pos = ec.dateFromPoint(e.clientX, e.clientY);
      if (!pos || !pos.date) return;

      const date = new Date(pos.date);

      // Calculate assignment start/end based on drop time (flexible, even inside shifts)
      const durationMinutes =
        Number(data.duration) || DEFAULT_ASSIGNMENT_DURATION_MINUTES; // default 4u
      const assignmentStartDate = new Date(date);
      const assignmentEndDate = new Date(
        assignmentStartDate.getTime() + durationMinutes * 60 * 1000
      );
      const assignmentStartValue = formatEventCalendarLocalDateTime(assignmentStartDate);
      const assignmentEndValue = formatEventCalendarLocalDateTime(assignmentEndDate);

      let slot = findSlotForDate(date);

      if (!slot) {
        const manualId =
          "shift-custom-" +
          assignmentStartDate.getTime() +
          "-" +
          Math.random().toString(16).slice(2);

        slot = {
          id: manualId,
          start: assignmentStartValue,
          end: assignmentEndValue,
          required: 5,
          resourceId: "kantine",
          manual: true,
        };

        slots.push(slot);
      }

      const name = (data.title || "Kantinedienst").trim();

      // already locally assigned? then skip
      const existing = assignments.find(
        (a) => a.slotId === slot.id && a.title.trim() === name
      );
      if (existing) {
        return;
      }

      // --- talk to Sign-up Sheets REST API via JVGHApi ---
      // Optimistic UI: eerst lokaal tonen, daarna op de achtergrond wegschrijven
      const assignment = {
        id:
          "a-" +
          Date.now() +
          "-" +
          Math.random().toString(16).slice(2),
        slotId: slot.id,
        title: name,
        taskId: null,
        signupId: null,
        userId: data.userId || null,
        role: data.role || "vrijwilliger",
        teamId: data.teamId || null,
        teamTitle: data.teamTitle || null,
        pending: true,
        start: assignmentStartValue,
        end: assignmentEndValue,
      };
      if (assignment.role === "parents") {
        console.log("[JVGH][DROP] parents resource dropped", {
          slotId: slot.id,
          teamId: assignment.teamId,
          teamTitle: assignment.teamTitle,
        });
      }
      assignments.push(assignment);
      renderAll();

      (async () => {
        try {
          const dayKey = slot.start.slice(0, 10); // "YYYY-MM-DD"

          // 1) één sheet per dag
          const sheetId = await ensureDaySheet(dayKey, slot);

          // 2) één taak per shift (slot) op die sheet
          const taskId = await ensureTaskForSlot(slot);

          // 3) inschrijving voor deze vrijwilliger op die taak
          const [firstName, ...rest] = name.split(" ");
          const lastName = rest.join(" ");

          const createdSignup = await JVGHApi.createSignup(taskId, {
            firstName,
            lastName,
            email: data.email || "",
            userId: data.userId || null,
          });

          const signupObj =
            createdSignup?.signup && createdSignup.signup.id
              ? createdSignup.signup
              : createdSignup;

          console.log("Created signup", {
            slotId: slot.id,
            sheetId,
            taskId,
            signup: signupObj,
          });

          assignment.taskId = taskId;
          assignment.signupId = signupObj.id;
          assignment.pending = false;
          renderAll();
        } catch (err) {
          console.error("Fout bij aanmaken sheet/task/signup:", err);
          alert(
            "Kon de Sign-up Sheet / taak / inschrijving niet aanmaken. Kijk in de console voor details."
          );
          // rollback van de optimistische assignment
          assignments = assignments.filter((a) => a.id !== assignment.id);
          renderAll();
        }
      })();
    });
  }

  function JVGH_makeResourceDraggable(card, payload) {
    if (!card || !payload) return;
    card.draggable = true;
    card.dataset.title = payload.title || "Kantinedienst";
    card.dataset.duration = String(
      Number(payload.duration) || DEFAULT_ASSIGNMENT_DURATION_MINUTES
    );
    card.dataset.role = payload.role || "vrijwilliger";

    if (payload.userId !== null && payload.userId !== undefined) {
      card.dataset.userId = String(payload.userId);
    } else {
      delete card.dataset.userId;
    }

    if (payload.teamId !== null && payload.teamId !== undefined) {
      card.dataset.teamId = String(payload.teamId);
    } else {
      delete card.dataset.teamId;
    }

    if (payload.teamTitle) {
      card.dataset.teamTitle = payload.teamTitle;
    } else {
      delete card.dataset.teamTitle;
    }
  }

  async function JVGH_loadPlayersForTeam(teamId) {
    const url =
      `https://jeugdherk.be/wp-json/jvgh/v1/players-by-team?team_id=${teamId}`;

    console.log('[JVGH][PLAYERS] loading', url);

    const res = await fetch(url);

    if (!res.ok) {
      console.error('[JVGH][PLAYERS] HTTP error', res.status);
      return [];
    }

    const data = await res.json();

    console.log('[JVGH][PLAYERS] loaded', data.length);

    return data;
  }

  async function JVGH_loadYouthTeams() {
    if (!parentsTeamSelectEl) return;

    const url = 'https://jeugdherk.be/wp-json/jvgh/v1/teams';
    console.log("[JVGH][TEAMS] loading…", url);

    if (parentsTeamsStatusEl) parentsTeamsStatusEl.textContent = "";
    parentsTeamSelectEl.innerHTML = '<option value="">Kies een team…</option>';
    youthTeams = [];
    youthTeamsById.clear();

    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        console.warn("[JVGH][TEAMS] unexpected response", data);
        if (parentsTeamsStatusEl) parentsTeamsStatusEl.textContent = "Geen jeugdteams gevonden.";
        return;
      }

      youthTeams = data;
      console.log("[JVGH][TEAMS] loaded", youthTeams.length);

      youthTeams.forEach((team) => {
        const teamId = String(team.id ?? "");
        if (!teamId) return;
        youthTeamsById.set(teamId, team);

        const option = document.createElement("option");
        option.value = teamId;
        option.textContent = team.title || `Team ${teamId}`;
        parentsTeamSelectEl.appendChild(option);
      });

      if (!youthTeams.length) {
        if (parentsTeamsStatusEl) parentsTeamsStatusEl.textContent = "Geen jeugdteams gevonden.";
      }
    } catch (err) {
      console.error("[JVGH][TEAMS] failed", err);
      if (parentsTeamsStatusEl) parentsTeamsStatusEl.textContent = "Teams konden niet geladen worden.";
    }
  }

  function JVGH_renderParentsOptions(players) {

    const select = document.querySelector('#jvgh-player-select');

    if (!select) {
        console.warn('[JVGH] player dropdown missing');
        return;
    }

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecteer speler...';
    select.appendChild(placeholder);

    players.forEach(player => {

        const opt = document.createElement('option');
        opt.value = player.id;
        opt.textContent = player.name;

        select.appendChild(opt);
    });
}

  function JVGH_makeDraggable(el) {

    // Important: reuse existing draggable system
    if (typeof JVGH_bindDraggables === 'function') {
        JVGH_bindDraggables(el.parentElement);
    }
}

  function JVGH_renderTeamPill(team) {

    const host = document.getElementById("ouders-team-pillhost");
    if (!host) {
        console.warn("[JVGH] ouders-team-pillhost not found");
        return;
    }

    host.innerHTML = '';

    const el = document.createElement('div');
    el.className = 'resource-card';
    el.draggable = true;
    el.textContent = team.title;

    // ⭐ REQUIRED DATA FOR DROP ENGINE
    el.dataset.title = team.title;
    el.dataset.role = 'parents';
    el.dataset.duration = '240';
    el.dataset.teamId = team.id;
    el.dataset.teamTitle = team.title;

    host.appendChild(el);

    // IMPORTANT: enable drag behaviour
    JVGH_makeResourceDraggable(el, {
        title: team.title,
        role: 'parents',
        duration: 240,
        teamId: team.id,
        teamTitle: team.title
    });
}

  // Dragstart via event delegation on sidebar lists
  function handleDragStart(e) {
    const card = e.target.closest(".resource-card");
    if (!card) return;

    const payload = {
      title: card.dataset.title,
      duration: parseInt(card.dataset.duration || "240", 10),
      userId: card.dataset.userId
        ? parseInt(card.dataset.userId, 10)
        : null,
      role: card.dataset.role || "vrijwilliger",
      teamId: card.dataset.teamId
        ? parseInt(card.dataset.teamId, 10)
        : null,
      teamTitle: card.dataset.teamTitle || null,
    };
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "copy";
    }
  }

  if (volunteerListEl) {
    volunteerListEl.addEventListener("dragstart", handleDragStart);
  }
  if (bestuurListEl) {
    bestuurListEl.addEventListener("dragstart", handleDragStart);
  }
  const oudersTeamHost = document.getElementById("ouders-team-pillhost");
  const oudersPlayerHost = document.getElementById("ouders-player-pillhost");

  if (oudersTeamHost) oudersTeamHost.addEventListener("dragstart", handleDragStart);
  if (oudersPlayerHost) oudersPlayerHost.addEventListener("dragstart", handleDragStart);
  if (parentsListEl) {
    parentsListEl.addEventListener("dragstart", handleDragStart);
  }
  const teamSelect = document.querySelector('#jvgh-team-select') || parentsTeamSelectEl;

  if (teamSelect) {
    teamSelect.addEventListener('change', async (e) => {

    const teamId = e.target.value;
    if (!teamId) return;

    const team = youthTeams.find(t => String(t.id) === String(teamId));

    console.log('[JVGH] Team selected', teamId);

    // 1) Show FULL TEAM draggable pill
    JVGH_renderTeamPill(team);

    // 2) Load players
    const players = await JVGH_loadPlayersForTeam(teamId);

    // 3) Fill dropdown
    JVGH_renderParentsOptions(players);
});
  }

  const playerSelect = document.querySelector('#jvgh-player-select');

if (playerSelect) {

    playerSelect.addEventListener('change', (e) => {

    const playerId = e.target.value;
    const name = e.target.options[e.target.selectedIndex].text;

    if (!playerId) return;

    const host = document.getElementById("ouders-player-pillhost");
    if (!host) {
        console.warn("[JVGH] ouders-player-pillhost missing");
        return;
    }

    host.innerHTML = '';

    const el = document.createElement('div');
    el.className = 'resource-card';
    el.draggable = true;
    el.textContent = name;

    el.dataset.title = name;
    el.dataset.role = 'parents';
    el.dataset.duration = '240';
    el.dataset.playerId = playerId;

    host.appendChild(el);

    JVGH_makeResourceDraggable(el, {
        title: name,
        role: 'parents',
        duration: 240
    });
});
}

  JVGH_loadYouthTeams();

  // --- Volunteers / Bestuur: load from WP REST API ---
  const baseVolunteersUrl =
    "/wp-json/jvgh/v1/volunteers";
  const roleDurationMinutes = {
    bestuur: 270,
    vrijwilliger: 240,
  };
  const showPerUserAvailabilityMailButton = false;

  function formatHoursLabel(minutes) {
    const hours = Number(minutes) / 60;
    return Number.isInteger(hours)
      ? `${hours}u`
      : `${String(hours).replace(".", ",")}u`;
  }

  function createUserCard(user, role) {
    const card = document.createElement("div");
    card.className =
      role === "bestuur"
        ? "resource-card resource-card-bestuur"
        : "resource-card";

    // Bestuur standaard 4,5u (270 min), anderen 4u (240 min)
    JVGH_makeResourceDraggable(card, {
      title: user.name,
      duration: roleDurationMinutes[role] ?? 240,
      role,
      userId: user.id != null ? user.id : null,
    });

    card.innerHTML = `
      <div class="resource-line">
        <span class="resource-name">${user.name}</span>
      </div>
    `;

    const email = getUserEmail(user);
    const userId = Number(user?.id);
    if (showPerUserAvailabilityMailButton && email && Number.isFinite(userId) && userId > 0) {
      const mailButton = document.createElement("button");
      mailButton.type = "button";
      mailButton.className = "jvgh-calendar-control-btn";
      mailButton.style.marginTop = "6px";
      mailButton.textContent = "Mail beschikbaarheid";
      mailButton.addEventListener("click", (e) => {
        e.stopPropagation();
        const subject = "Vul uw beschikbaarheid in";
        const body = `Beste ${user.name || ""},

Vul uw beschikbaarheid in via onderstaande link:
${getAvailabilityLinkForUser(userId)}`;
        const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(
          subject
        )}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
      });
      card.appendChild(mailButton);
    }

    return card;
  }

  const bestuurNames = new Set();
  const bestuurUserIds = new Set();
  const usersByRole = {
    bestuur: [],
    vrijwilliger: [],
  };

  function getUserEmail(user) {
    if (!user || typeof user !== "object") return "";
    return String(user.email || user.user_email || user.mail || "").trim();
  }

  function getAvailabilityLinkForUser(userId) {
    const url = new URL("availability.html", window.location.href);
    url.searchParams.set("userId", String(userId));
    return url.toString();
  }

  function updateAvailabilityMailButtonState() {
    if (!sendAvailabilityMailsButton) return;

    const allUsers = [...usersByRole.bestuur, ...usersByRole.vrijwilliger];
    const uniqueUsersById = new Map();
    allUsers.forEach((user) => {
      const uid = Number(user?.id);
      if (!Number.isFinite(uid) || uid <= 0) return;
      const email = getUserEmail(user);
      if (!email) return;
      uniqueUsersById.set(uid, user);
    });

    sendAvailabilityMailsButton.disabled = uniqueUsersById.size === 0;
    sendAvailabilityMailsButton.title =
      uniqueUsersById.size === 0
        ? "Geen gebruikers met e-mailadres geladen."
        : "";
  }

  async function sendWhatsAppMessage({
    statusEl,
    user,
    phone,
    userId,
    contentSidSelector,
    contentVariables,
    progressText,
    successText,
    missingContentSidLabel,
  }) {
    if (!statusEl) return;
    statusEl.textContent = progressText;
    const overlayEl = ensureAvailabilityOverlay();
    const accountSidInput = overlayEl.querySelector('#jvgh-whatsapp-account-sid');
    const fromInput = overlayEl.querySelector('#jvgh-whatsapp-from');
    const contentSidInput = overlayEl.querySelector(contentSidSelector);
    const authTokenInput = overlayEl.querySelector('#jvgh-twilio-auth-token');

    const accountSid = String(accountSidInput?.value || '').trim();
    const from = String(fromInput?.value || '').trim();
    const contentSid = String(contentSidInput?.value || '').trim();
    const authToken = String(authTokenInput?.value || '').trim();

    if (!accountSid || !from || !contentSid || !authToken) {
      throw new Error(`Vul Account SID, From, ${missingContentSidLabel} en Auth token in via Instellingen.`);
    }

    const whatsappTo = phone && !phone.toLowerCase().startsWith('whatsapp:')
      ? `whatsapp:${phone}`
      : phone;
    const params = new URLSearchParams();
    params.set('To', whatsappTo);
    params.set('From', from);
    params.set('ContentSid', contentSid);
    params.set('ContentVariables', JSON.stringify(contentVariables || {
      "1": getUserFirstName(user),
      "2": String(userId),
    }));

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      },
      body: params.toString(),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || 'Twilio verzending mislukt.');
    }
    statusEl.textContent = successText;
  }

  function getTodayBrusselsDateKey() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: JVGH_CALENDAR_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date())
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function formatScheduledDateLabel(dateKey, options = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    if (!year || !month || !day) return String(dateKey || '');
    return new Date(year, month - 1, day).toLocaleDateString('nl-BE', options);
  }

  function normalizeScheduledVolunteersResponse(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.assignments)) return payload.assignments;
    if (Array.isArray(payload?.volunteers)) return payload.volunteers;
    if (Array.isArray(payload?.scheduledVolunteers)) return payload.scheduledVolunteers;
    if (Array.isArray(payload?.scheduled_volunteers)) return payload.scheduled_volunteers;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  function normalizeScheduledVolunteer(item) {
    const sourceUser = item?.user || item?.volunteer || item?.systemuser || item || {};
    const userId = sourceUser.id ?? sourceUser.user_id ?? item?.userId ?? item?.user_id;
    return {
      ...sourceUser,
      id: userId,
      name: sourceUser.name || sourceUser.display_name || sourceUser.full_name || item?.name || item?.volunteer_name || '',
      phone: sourceUser.phone || sourceUser.phone_number || sourceUser.mobile || sourceUser.telefoon || item?.phone || item?.phone_number || item?.mobile || item?.telefoon || '',
      scheduledShift: item,
    };
  }

  function formatScheduledVolunteerShifts(shifts) {
    return shifts.map((shift) => {
      const start = shift?.start_time || shift?.startTime || shift?.start || shift?.from;
      const end = shift?.end_time || shift?.endTime || shift?.end || shift?.to;
      const task = shift?.task || shift?.shift || shift?.task_name || shift?.role;
      const time = start && end ? `${String(start).slice(0, 5)}–${String(end).slice(0, 5)}` : '';
      return [time, task].filter(Boolean).join(' · ');
    }).filter(Boolean).join(', ');
  }

  function formatScheduledMessageDate(dateKey) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (!year || !month || !day) return String(dateKey || '');

    const date = new Date(year, month - 1, day, 12, 0, 0);
    return date.toLocaleDateString('nl-BE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  function buildScheduledVolunteerPlanningText(dateKey, shifts) {
    const dateLabel = formatScheduledMessageDate(dateKey);
    const shiftList = Array.isArray(shifts) ? shifts : [];
    const times = shiftList.map((shift) => {
      const start = shift?.time || shift?.start_time || shift?.startTime || shift?.start || shift?.from || '';
      const end = shift?.end_time || shift?.endTime || shift?.end || shift?.to || '';
      const startTime = String(start || '').slice(0, 5);
      const endTime = String(end || '').slice(0, 5);

      if (!startTime) return '';
      if (endTime) return `van ${startTime} tot ${endTime}`;
      return `om ${startTime}`;
    }).filter(Boolean);

    if (!times.length) return dateLabel;
    if (times.length === 1) return `${dateLabel} ${times[0]}`;
    return `${dateLabel} ${times.slice(0, -1).join(', ')} en ${times[times.length - 1]}`;
  }

  function buildScheduledVolunteerContentVariables({ user, userId, dateKey, shifts }) {
    void userId;
    return {
      "1": getUserFirstName(user),
      "2": buildScheduledVolunteerPlanningText(dateKey, shifts),
    };
  }

  function setupScheduledVolunteersPanel(overlay, statusEl) {
    const panel = overlay.querySelector('#jvgh-whatsapp-scheduled-panel');
    if (!panel || panel.dataset.initialized === 'true') return;
    panel.dataset.initialized = 'true';

    const controls = document.createElement('div');
    controls.className = 'jvgh-scheduled-date-controls';
    controls.style.display = 'flex';
    controls.style.alignItems = 'end';
    controls.style.gap = '8px';

    const label = document.createElement('label');
    label.className = 'jvgh-whatsapp-field';
    label.textContent = 'Datum';
    const dateInput = document.createElement('input');
    dateInput.id = 'jvgh-scheduled-volunteers-date';
    dateInput.type = 'date';
    label.appendChild(dateInput);

    const loadButton = document.createElement('button');
    loadButton.id = 'jvgh-load-scheduled-volunteers';
    loadButton.type = 'button';
    loadButton.className = 'jvgh-calendar-control-btn';
    loadButton.textContent = 'Ophalen';
    controls.appendChild(label);
    controls.appendChild(loadButton);

    const results = document.createElement('div');
    results.className = 'jvgh-scheduled-volunteers-results';
    panel.appendChild(controls);
    panel.appendChild(results);

    let scheduledVolunteersLoading = false;

    const renderScheduledVolunteers = (items, dateKey) => {
      results.replaceChildren();
      const uniqueByUser = new Map();
      items.map(normalizeScheduledVolunteer).forEach((user) => {
        const phoneInfo = getUserPhoneInfo(user);
        const numericUserId = Number(user.id);
        const hasUserId = Number.isFinite(numericUserId) && numericUserId > 0;
        const fallbackKey = `${phoneInfo.normalized}|${String(user.name || '').trim().toLocaleLowerCase('nl-BE')}`;
        const key = hasUserId ? `id:${numericUserId}` : `fallback:${fallbackKey}`;
        const existing = uniqueByUser.get(key);
        if (existing) {
          existing.shifts.push(user.scheduledShift);
        } else {
          uniqueByUser.set(key, {
            user,
            userId: hasUserId ? numericUserId : '',
            phoneInfo,
            shifts: [user.scheduledShift],
          });
        }
      });

      if (uniqueByUser.size === 0) {
        const empty = document.createElement('p');
        empty.className = 'small-muted';
        empty.textContent = `Geen ingeplande vrijwilligers gevonden voor ${formatScheduledDateLabel(dateKey, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}.`;
        results.appendChild(empty);
        return;
      }

      uniqueByUser.forEach(({ user, userId, phoneInfo, shifts }) => {
        const row = document.createElement('div');
        row.className = 'jvgh-availability-user-row';
        const details = document.createElement('span');
        const name = document.createElement('span');
        name.className = 'resource-name';
        name.textContent = user.name || '-';
        details.appendChild(name);
        const shiftText = formatScheduledVolunteerShifts(shifts);
        if (shiftText) {
          const shiftInfo = document.createElement('span');
          shiftInfo.className = 'small-muted';
          shiftInfo.style.display = 'block';
          shiftInfo.textContent = shiftText;
          details.appendChild(shiftInfo);
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'jvgh-calendar-control-btn';
        button.textContent = 'Verstuur';
        const invalidReason = !phoneInfo.normalized
          ? 'Geen geldig telefoonnummer beschikbaar voor deze gebruiker.'
          : (!userId ? 'Gebruiker heeft geen geldig ID om een bericht te versturen.' : '');
        button.disabled = Boolean(invalidReason);
        button.title = invalidReason;
        if (invalidReason) button.setAttribute('aria-label', invalidReason);
        button.addEventListener('click', async (event) => {
          event.stopPropagation();
          if (button.disabled) return;
          button.disabled = true;
          try {
            await sendWhatsAppMessage({
              statusEl,
              user,
              phone: phoneInfo.normalized,
              userId,
              contentSidSelector: '#jvgh-whatsapp-scheduled-content-sid',
              contentVariables: buildScheduledVolunteerContentVariables({ user, userId, dateKey, shifts }),
              progressText: `Bericht versturen naar ${user.name || '-'}...`,
              successText: `WhatsApp verzonden via Twilio naar ${user.name || '-'}.`,
              missingContentSidLabel: 'Ingepland Template SID',
            });
          } catch (error) {
            statusEl.textContent = `Verzenden mislukt: ${error.message}`;
          } finally {
            button.disabled = false;
          }
        });
        row.appendChild(details);
        row.appendChild(button);
        results.appendChild(row);
      });
    };

    async function loadScheduledVolunteersForDate(dateKey) {
      if (scheduledVolunteersLoading || !dateKey) return;
      scheduledVolunteersLoading = true;
      loadButton.disabled = true;
      statusEl.textContent = 'Ingeplande vrijwilligers laden...';
      try {
        const url = `/wp-json/jvgh/v1/scheduled-volunteers?date=${encodeURIComponent(dateKey)}`;
        const response = await fetch(url, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`Ophalen mislukt (${response.status}).`);
        }
        const payload = await response.json();
        renderScheduledVolunteers(normalizeScheduledVolunteersResponse(payload), dateKey);
        statusEl.textContent = '';
      } catch (error) {
        results.replaceChildren();
        statusEl.textContent = `Ingeplande vrijwilligers ophalen mislukt: ${error.message}`;
      } finally {
        scheduledVolunteersLoading = false;
        loadButton.disabled = false;
      }
    }

    const loadSelectedDate = () => loadScheduledVolunteersForDate(dateInput.value);
    dateInput.addEventListener('change', loadSelectedDate);
    loadButton.addEventListener('click', loadSelectedDate);
    overlay.addEventListener('jvgh:scheduled-tab-activated', () => {
      if (!dateInput.value) dateInput.value = getTodayBrusselsDateKey();
      loadSelectedDate();
    });
  }

  async function sendAvailabilityReminderMails() {
    const overlay = ensureAvailabilityOverlay();
    const statusEl = overlay.querySelector('#jvgh-send-whatsapp-status');
    const bestuurPanel = overlay.querySelector('#jvgh-whatsapp-bestuur-panel');
    const vrijwilligersPanel = overlay.querySelector('#jvgh-whatsapp-vrijwilligers-panel');
    setupScheduledVolunteersPanel(overlay, statusEl);
    const monthKey = getCurrentPlannerMonthKey();
    availabilityStatusByMonth.delete(monthKey);
    plannerMonthDataCache.delete(monthKey);
    const availabilityMap = await loadAvailabilityStatusForMonth(monthKey);

    let legend = overlay.querySelector(".jvgh-availability-legend");
    if (!legend) {
      legend = document.createElement("div");
      legend.className = "jvgh-availability-legend";
      legend.innerHTML = `
        <span>
          <span class="jvgh-availability-dot is-available"></span>
          Beschikbaarheid doorgegeven
        </span>
        <span>
          <span class="jvgh-availability-dot is-missing"></span>
          Nog niets doorgegeven
        </span>
      `;

      const tabs = overlay.querySelector(".jvgh-whatsapp-tabs");
      tabs?.insertAdjacentElement("afterend", legend);
    }

    if (statusEl) statusEl.textContent = '';
    if (bestuurPanel && vrijwilligersPanel) {
      const makeSection = (users = [], roleLabel = '') => {
        const section = document.createElement("div");
        if (!Array.isArray(users) || users.length === 0) {
          const empty = document.createElement("p");
          empty.className = "small-muted";
          empty.textContent = `Geen ${roleLabel || 'gebruikers'} gevonden.`;
          section.appendChild(empty);
          return section;
        }

        users.forEach((user) => {
          const phoneInfo = getUserPhoneInfo(user);
          const phone = phoneInfo.normalized;
          const userId = Number(user?.id);
          const hasAvailability =
            Number.isFinite(userId) &&
            availabilityMap.get(userId) === true;
          const statusText = hasAvailability
            ? "Beschikbaarheid doorgegeven"
            : "Nog geen beschikbaarheid doorgegeven";

          const row = document.createElement("div");
          row.className = "jvgh-availability-user-row";
          row.title = statusText;

          const dot = document.createElement("span");
          dot.className =
            `jvgh-availability-dot ${
              hasAvailability
                ? "is-available"
                : "is-missing"
            }`;
          dot.setAttribute("aria-hidden", "true");
          dot.title = statusText;

          const name = document.createElement("span");
          name.className = "resource-name";
          name.textContent = user?.name || "-";

          const statusLabel = document.createElement("span");
          statusLabel.className = "jvgh-visually-hidden";
          statusLabel.textContent = statusText;

          row.appendChild(dot);
          row.appendChild(name);
          row.appendChild(statusLabel);

          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "jvgh-calendar-control-btn";
          btn.textContent = "Verstuur";
          const reminderButton = document.createElement("button");
          reminderButton.type = "button";
          reminderButton.className = "jvgh-calendar-control-btn";
          reminderButton.textContent = "Herinner";
          const isInvalidPhone = !phone;
          const isInvalidUserId = !Number.isFinite(userId) || userId <= 0;
          const buttonsDisabled = isInvalidPhone || isInvalidUserId;
          btn.disabled = buttonsDisabled;
          reminderButton.disabled = buttonsDisabled;
          const disabledReason = isInvalidPhone
            ? phoneInfo.reason || "Geen geldig telefoonnummer beschikbaar voor deze gebruiker."
            : "Gebruiker heeft geen geldig ID om een bericht te versturen.";
          const tooltipWrapper = document.createElement("span");
          tooltipWrapper.title = buttonsDisabled ? disabledReason : "";
          tooltipWrapper.style.display = "inline-flex";
          tooltipWrapper.style.gap = "6px";
          tooltipWrapper.style.alignItems = "center";
          if (buttonsDisabled) {
            btn.setAttribute("aria-label", disabledReason);
            reminderButton.setAttribute("aria-label", disabledReason);
          }


          const handleSendButtonClick = async ({
            event,
            button,
            contentSidSelector,
            progressText,
            successText,
            missingContentSidLabel,
          }) => {
            event.stopPropagation();
            if (button.disabled) return;
            button.disabled = true;
            try {
              await sendWhatsAppMessage({
                statusEl,
                user,
                phone,
                userId,
                contentSidSelector,
                progressText,
                successText,
                missingContentSidLabel,
              });
            } catch (error) {
              statusEl.textContent = `Verzenden mislukt: ${error.message}`;
            } finally {
              button.disabled = buttonsDisabled;
            }
          };
          btn.addEventListener("click", (event) => handleSendButtonClick({
            event,
            button: btn,
            contentSidSelector: '#jvgh-whatsapp-content-sid',
            progressText: "Versturen...",
            successText: `WhatsApp verzonden via Twilio naar ${user?.name || "-"}.`,
            missingContentSidLabel: "Template SID",
          }));
          reminderButton.addEventListener("click", (event) => handleSendButtonClick({
            event,
            button: reminderButton,
            contentSidSelector: '#jvgh-whatsapp-reminder-content-sid',
            progressText: "Herinnering versturen...",
            successText: `Herinnering verzonden via Twilio naar ${user?.name || "-"}.`,
            missingContentSidLabel: "Herinnering Template SID",
          }));
          tooltipWrapper.appendChild(btn);
          tooltipWrapper.appendChild(reminderButton);
          row.appendChild(tooltipWrapper);
          section.appendChild(row);
        });
        return section;
      };

      bestuurPanel.innerHTML = "";
      bestuurPanel.appendChild(makeSection(usersByRole.bestuur, 'bestuursleden'));
      vrijwilligersPanel.innerHTML = "";
      vrijwilligersPanel.appendChild(makeSection(usersByRole.vrijwilliger, 'vrijwilligers'));
    }
    overlay.classList.remove('hidden');
  }

  function getUserEmail(user) {
    if (!user || typeof user !== "object") return "";
    return String(user.email || user.user_email || user.mail || "").trim();
  }

  function getUserPhoneInfo(user) {
    if (!user || typeof user !== "object") {
      return { normalized: "", reason: "Geen gebruikersdata beschikbaar." };
    }

    const sources = [
      user.phone,
      user.mobile,
      user.whatsapp,
      user.tel,
      user.telefoon,
      user.gsm,
      user.user_phone,
      user.phone_number,
      user?.meta?.phone,
      user?.meta?.mobile,
      user?.meta?.telefoon,
      user?.acf?.phone,
      user?.acf?.mobile,
      user?.acf?.telefoon,
      user?.systemuser?.phone,
      user?.systemuser?.mobile,
      user?.systemuser?.telefoon,
    ];

    const raw = sources.find((value) => String(value || "").trim()) || "";
    const rawPhone = String(raw).trim();
    if (!rawPhone) {
      return {
        normalized: "",
        reason: "Geen telefoonnummer gevonden in de API-respons voor deze gebruiker.",
      };
    }

    const normalized = normalizePhoneNumber(rawPhone);
    if (!normalized) {
      return {
        normalized: "",
        reason: `Ongeldig telefoonnummer: ${rawPhone}`,
      };
    }

    return { normalized, reason: "" };
  }

  function normalizePhoneNumber(rawPhone) {
    const raw = String(rawPhone || "").trim();
    if (!raw) return "";

    let digits = raw.replace(/[^\d+]/g, "");
    if (!digits) return "";

    if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
    else if (!digits.startsWith("+") && digits.startsWith("0")) digits = `+32${digits.slice(1)}`;
    else if (!digits.startsWith("+")) digits = `+${digits}`;

    const numberPart = digits.replace(/^\+/, "");
    if (!/^\d{8,15}$/.test(numberPart)) return "";
    return `+${numberPart}`;
  }

  function getUserFirstName(user) {
    const name = String(user?.name || "").trim();
    return name ? name.split(/\s+/)[0] : "";
  }

  function getAvailabilityLinkForUser(userId) {
    const url = new URL("availability.html", window.location.href);
    url.searchParams.set("userId", String(userId));
    return url.toString();
  }

  function retagBestuurAssignments() {
    if (!assignments || !assignments.length) return false;

    let changed = false;
    assignments.forEach((a) => {
      const uidRaw = a.userId !== undefined && a.userId !== null ? a.userId : null;
      const uid = uidRaw !== null ? Number(uidRaw) : null;

      if (uid && bestuurUserIds.has(uid)) {
        if (a.role !== "bestuur") {
          a.role = "bestuur";
          changed = true;
        }
        return;
      }

      const name = (a.title || "").trim();
      if (name && bestuurNames.has(name) && a.role !== "bestuur") {
        a.role = "bestuur";
        changed = true;
      }
    });

    return changed;
  }

  function removeBestuurFromVolunteersList() {
    if (!volunteerListEl) return;
    if (!bestuurNames.size) return;

    const cards = Array.from(volunteerListEl.querySelectorAll(".resource-card"));
    cards.forEach((card) => {
      const name = (card.dataset.title || "").trim();
      if (name && bestuurNames.has(name)) {
        card.remove();
      }
    });
  }

  function loadUsersForRole(role, containerEl) {
    if (!containerEl) return;

    const url = `${baseVolunteersUrl}?role=${encodeURIComponent(role)}`;

    fetch(url, { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((users) => {
        usersByRole[role] = Array.isArray(users) ? users : [];
        updateAvailabilityMailButtonState();
        containerEl.innerHTML = "";

        if (!Array.isArray(users) || users.length === 0) {
          if (role === "bestuur") {
            containerEl.innerHTML = '<p style="margin:6px 0;color:#6c757d;">Geen bestuursleden gevonden.</p>';
            return;
          }
          containerEl.innerHTML =
            '<p style="margin:6px 0;color:#6c757d;">Geen namen gevonden.</p>';
          return;
        }

        users.forEach((user) => {
          const card = createUserCard(user, role);
          containerEl.appendChild(card);

          if (role === "bestuur") {
            const name = (user.name || "").trim();
            if (name) bestuurNames.add(name);
            if (user.id !== undefined && user.id !== null) {
              bestuurUserIds.add(Number(user.id));
            }
          }
        });

        if (role === "bestuur" && bestuurTabLabel) {
          bestuurTabLabel.textContent = `Bestuur · ${formatHoursLabel(roleDurationMinutes.bestuur)}`;
        }
        if (role === "vrijwilliger" && vrijwilligersTabLabel) {
          vrijwilligersTabLabel.textContent = `Vrijwilligers · ${formatHoursLabel(roleDurationMinutes.vrijwilliger)}`;
        }

        // Ensure bestuur members are not duplicated in volunteers list
        if (role === "bestuur") {
          removeBestuurFromVolunteersList();
          // Now we know bestuur members, retag any existing assignments
          const changed = retagBestuurAssignments();
          if (changed) {
            renderAll();
          }
        } else if (role === "vrijwilliger") {
          // If bestuur is already known, strip them out now
          removeBestuurFromVolunteersList();
        }
      })
      .catch((err) => {
        console.error(`Error loading ${role}:`, err);
        usersByRole[role] = [];
        updateAvailabilityMailButtonState();
        containerEl.insertAdjacentHTML(
          "beforeend",
          `<p style="margin:6px 0;color:#dc3545;">Kon ${role} niet laden (${err.message}).</p>`
        );
      });
  }

  // Load bestuur first (top list), then vrijwilligers (bottom list)
  loadUsersForRole("bestuur", bestuurListEl);
  loadUsersForRole("vrijwilliger", volunteerListEl);

  if (sendAvailabilityMailsButton) {
    sendAvailabilityMailsButton.disabled = true;
    sendAvailabilityMailsButton.addEventListener("click", sendAvailabilityReminderMails);
  }

  // --- iCal toggle behavior ---
  function updateIcalToggleUI() {
    if (!icalToggleEl) return;
    icalToggleEl.classList.toggle("active", icalEnabled);
    icalToggleEl.setAttribute("aria-checked", String(icalEnabled));
    setToggleRowActive(".toggle-row-matches", icalEnabled);
  }
  function updateEventsIcalToggleUI() {
    if (!eventsIcalToggleEl) return;
    eventsIcalToggleEl.classList.toggle("active", eventsIcalEnabled);
    eventsIcalToggleEl.setAttribute("aria-checked", String(eventsIcalEnabled));
    setToggleRowActive(".toggle-row-events", eventsIcalEnabled);
  }
  function updateVerhuurIcalToggleUI() {
    if (!verhuurIcalToggleEl) return;
    verhuurIcalToggleEl.classList.toggle("active", verhuurIcalEnabled);
    verhuurIcalToggleEl.setAttribute("aria-checked", String(verhuurIcalEnabled));
    setToggleRowActive(".toggle-row-verhuur", verhuurIcalEnabled);
  }
  function setToggleRowActive(selector, isActive) {
    const row = document.querySelector(selector);
    if (!row) return;
    row.classList.toggle("is-active", isActive);
  }

  function updateDagelijksBestuurIcalToggleUI() {
    if (!dagelijksBestuurIcalToggleEl) return;
    dagelijksBestuurIcalToggleEl.classList.toggle("active", dagelijksBestuurIcalEnabled);
    dagelijksBestuurIcalToggleEl.setAttribute("aria-checked", String(dagelijksBestuurIcalEnabled));
    setToggleRowActive(".toggle-row-bestuur", dagelijksBestuurIcalEnabled);
  }

  function toggleIcal() {
    icalEnabled = !icalEnabled;
    updateIcalToggleUI();
    if (icalEnabled && externalEvents.length === 0) {
      // first enable → load ICS
      loadICal("jvgh");
    } else {
      renderAll();
    }
  }
  function toggleEventsIcal() {
    eventsIcalEnabled = !eventsIcalEnabled;
    updateEventsIcalToggleUI();
    if (eventsIcalEnabled && eventsIcalExternalEvents.length === 0) {
      loadICal("events");
    } else {
      renderAll();
    }
  }
  function toggleVerhuurIcal() {
    verhuurIcalEnabled = !verhuurIcalEnabled;
    updateVerhuurIcalToggleUI();
    if (verhuurIcalEnabled && verhuurIcalExternalEvents.length === 0) {
      loadICal("verhuur");
    } else {
      renderAll();
    }
  }
  function toggleDagelijksBestuurIcal() {
    dagelijksBestuurIcalEnabled = !dagelijksBestuurIcalEnabled;
    updateDagelijksBestuurIcalToggleUI();
    if (dagelijksBestuurIcalEnabled && dagelijksBestuurIcalExternalEvents.length === 0) {
      loadICal("dagelijksBestuur");
    } else {
      renderAll();
    }
  }

  if (icalToggleEl) {
    icalToggleEl.addEventListener("click", toggleIcal);
    icalToggleEl.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleIcal();
      }
    });
  }
  if (eventsIcalToggleEl) {
    eventsIcalToggleEl.addEventListener("click", toggleEventsIcal);
    eventsIcalToggleEl.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleEventsIcal();
      }
    });
  }
  if (verhuurIcalToggleEl) {
    verhuurIcalToggleEl.addEventListener("click", toggleVerhuurIcal);
    verhuurIcalToggleEl.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleVerhuurIcal();
      }
    });
  }
  if (dagelijksBestuurIcalToggleEl) {
    dagelijksBestuurIcalToggleEl.addEventListener("click", toggleDagelijksBestuurIcal);
    dagelijksBestuurIcalToggleEl.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleDagelijksBestuurIcal();
      }
    });
  }

  // --- Shifts toggle behavior ---
  function updateShiftToggleUI() {
    if (!shiftToggleEl) return;
    shiftToggleEl.classList.toggle("active", shiftsEnabled);
    shiftToggleEl.setAttribute("aria-checked", String(shiftsEnabled));
  }

  function toggleShifts() {
    shiftsEnabled = !shiftsEnabled;
    updateShiftToggleUI();
    if (shiftsEnabled && getAllExternalEvents().length === 0) {
      // if we haven't loaded iCal yet, load it now
      loadICal("jvgh").finally(() => {
        if (lastDatesSetInfo && typeof JVGH_ensureVisibleMonthsLoaded === "function") {
          JVGH_ensureVisibleMonthsLoaded(lastDatesSetInfo);
        }
      });
    } else {
      renderAll();
      if (lastDatesSetInfo && typeof JVGH_ensureVisibleMonthsLoaded === "function") {
        JVGH_ensureVisibleMonthsLoaded(lastDatesSetInfo);
      }
    }

    try {
      localStorage.setItem("jvgh-shifts-enabled", String(shiftsEnabled));
    } catch (e) {
      // ignore
    }
  }

  if (shiftToggleEl) {
    shiftToggleEl.addEventListener("click", toggleShifts);
    shiftToggleEl.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleShifts();
      }
    });
  }

  // Start with all external calendars visible by default
  icalEnabled = true;
  updateIcalToggleUI();
  eventsIcalEnabled = true;
  updateEventsIcalToggleUI();
  verhuurIcalEnabled = true;
  updateVerhuurIcalToggleUI();
  dagelijksBestuurIcalEnabled = true;
  updateDagelijksBestuurIcalToggleUI();

  // Shifts ON by default
  shiftsEnabled = true;
  updateShiftToggleUI();

  // No persistence for iCal setting: always off on page load

  if (icalEnabled && externalEvents.length === 0) loadICal("jvgh");
  if (eventsIcalEnabled && eventsIcalExternalEvents.length === 0) loadICal("events");
  if (verhuurIcalEnabled && verhuurIcalExternalEvents.length === 0) loadICal("verhuur");
  if (dagelijksBestuurIcalEnabled && dagelijksBestuurIcalExternalEvents.length === 0) loadICal("dagelijksBestuur");

  // Initial render with current flags
  renderAll();

  // Month corner triangles
  initMonthTriangles();
});

// --- Month corner triangles ---------------------------------

function initMonthTriangles() {
  const ecEl = document.getElementById("ec");
  const cal = window.ec;

  if (!ecEl) {
    console.warn("No #ec element found for month triangles.");
    return;
  }
  if (!cal || typeof cal.getEvents !== "function") {
    console.warn("No EventCalendar instance on window.ec for month triangles.");
    return;
  }

  (function () {
    const months = [
      "januari",
      "februari",
      "maart",
      "april",
      "mei",
      "juni",
      "juli",
      "augustus",
      "september",
      "oktober",
      "november",
      "december",
    ];
    const priority = { red: 3, orange: 2, green: 1 };

    function applyTrianglesForCurrentMonth() {
      // Only do something if month view is visible
      if (!ecEl.querySelector(".ec-month-view")) {
        return;
      }

      const toolbar = ecEl.querySelector(".ec-toolbar");
      if (!toolbar) {
        console.warn("No .ec-toolbar found.");
        return;
      }
      const toolbarText = toolbar.textContent.toLowerCase();

      // 1) Determine month/year from toolbar text
      let monthIndex = -1;
      for (let i = 0; i < months.length; i++) {
        if (toolbarText.includes(months[i])) {
          monthIndex = i;
          break;
        }
      }
      const yearMatch = toolbarText.match(/(20\d{2})/);
      if (monthIndex === -1 || !yearMatch) {
        console.warn(
          "Could not detect month/year from toolbar text:",
          toolbarText
        );
        return;
      }
      const year = parseInt(yearMatch[1], 10);

      const firstOfMonth = new Date(year, monthIndex, 1);
      const weekday = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
      const visibleStart = new Date(firstOfMonth);
      visibleStart.setDate(firstOfMonth.getDate() - weekday);

      // 2) Build date → status map from slot events
      const events = cal.getEvents();
      const statusByDay = new Map();

      events.forEach((ev) => {
        if (!ev.start) return;

        const cls = new Set(ev.classNames || ev._def?.ui?.classNames || []);
        let status = null;
        if (cls.has("slot-empty")) status = "red";
        else if (cls.has("slot-partial")) status = "orange";
        else if (cls.has("slot-full")) status = "green";
        else return;

        const d = new Date(ev.start);
        d.setHours(0, 0, 0, 0);
        const key = jvghDayKeyFromDate(d);

        const prev = statusByDay.get(key);
        if (!prev || priority[status] > priority[prev]) {
          statusByDay.set(key, status);
        }
      });

      // 3) Clear old triangles
      ecEl
        .querySelectorAll(".jvgh-corner-triangle")
        .forEach((el) => el.remove());

      // 4) Walk visible month cells and apply triangles
      const footCells = ecEl.querySelectorAll(".ec-month-view .ec-day-foot");
      if (!footCells.length) {
        console.warn(
          "No .ec-month-view .ec-day-foot cells found. Are you in month view?"
        );
        return;
      }

      footCells.forEach((foot, idx) => {
        const d = new Date(visibleStart);
        d.setDate(visibleStart.getDate() + idx);
        const key = jvghDayKeyFromDate(d);
        const status = statusByDay.get(key);
        if (!status) return;

        const dayCell = foot.closest(".ec-day");
        if (!dayCell) return;

        // Make sure the whole day cell is the positioning context
        if (getComputedStyle(dayCell).position === "static") {
          dayCell.style.position = "relative";
        }

        const tri = document.createElement("div");
        tri.className = "jvgh-corner-triangle";
        Object.assign(tri.style, {
          position: "absolute",
          width: "0",
          height: "0",
          borderTop: "12px solid transparent",
          borderLeft: "12px solid transparent",
          borderRight: "0",
          borderBottom: "0",
          top: "0",
          right: "0",
          zIndex: "5",
          pointerEvents: "none",
        });

        if (status === "red") {
          tri.style.borderTopColor = "#e74c3c";
        } else if (status === "orange") {
          tri.style.borderTopColor = "#f2b400";
        } else if (status === "green") {
          tri.style.borderTopColor = "#1fa45a";
        }

        dayCell.appendChild(tri);
      });

      // Also (lazy) load signups for this visible month, if available
      if (window.JVGH_loadSignupsForVisibleMonth) {
        window.JVGH_loadSignupsForVisibleMonth();
      }

      console.log(
        "Triangles applied for visible month.",
        Array.from(statusByDay.entries())
      );
    }

    // Run once now
    applyTrianglesForCurrentMonth();

    // Observe DOM changes and re-apply when month/view changes
    const observer = new MutationObserver(() => {
      // tiny debounce so the DOM has fully updated
      requestAnimationFrame(applyTrianglesForCurrentMonth);
    });

    observer.observe(ecEl, { childList: true, subtree: true });

    console.log("JVGH month triangles: observer installed.");
  })();
}
