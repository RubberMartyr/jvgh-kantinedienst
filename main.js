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
document.getElementById("print-button").addEventListener("click", () => {
  window.print();
});

const DEFAULT_ASSIGNMENT_DURATION_MINUTES = 240;

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
  let schedulesLoaded = false;

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
    const resp = await JVGHApi.getTasks(sheetId);
    const tasksArr = Array.isArray(resp.tasks) ? resp.tasks : resp || [];

    const startDate = new Date(slot.start);
    const dateStr = slot.start.slice(0, 10);
    const timeStr =
      jvghPad2(startDate.getHours()) + ":" + jvghPad2(startDate.getMinutes());

    // probeer bestaande taak te vinden
    let existingTask = tasksArr.find((t) => {
      const tDate = (t.date || "").slice(0, 10);
      const tTime = (t.time || "").slice(0, 5);
      return tDate === dateStr && tTime === timeStr;
    });

    // zo niet → nieuwe taak aanmaken
    if (!existingTask) {
      const createdTask = await JVGHApi.createTask(sheetId, {
        title: `Kantinedienst ${timeStr}`,
        qty: 1,
        date: dateStr,
        time: timeStr,
      });

      const taskObj =
        createdTask?.task && createdTask.task.id ? createdTask.task : createdTask;

      existingTask = taskObj;
    }

    slot.taskId = existingTask.id;
    return existingTask.id;
  }

  // 🔹 iCal feed management
  const icalToggleEl = document.getElementById("ical-toggle");
  const shiftToggleEl = document.getElementById("shift-toggle");
  const icalStatusEl = document.getElementById("ical-status");
  const ICAL_URL =
    "https://jeugdherk.be/calendar/jvgh-kalender/?feed=sp-ical"; // convert webcal:// → https://

  let icalEnabled = false;
  let externalEvents = []; // parsed VEVENTs from ICS
  let shiftsEnabled = false;
  let lastDatesSetInfo = null;

  function setIcalStatus(msg) {
    if (icalStatusEl) {
      icalStatusEl.textContent = msg || "";
    }
  }

  function parseICalDate(line) {
    if (!line) return null;
    const raw = line.split(":").slice(-1)[0].trim();

    // YYYYMMDD (all-day)
    if (/^\d{8}$/.test(raw)) {
      const y = +raw.slice(0, 4),
        m = +raw.slice(4, 6),
        d = +raw.slice(4 + 2, 4 + 2 + 2);
      return new Date(y, m - 1, d, 0, 0, 0);
    }
    // YYYYMMDDTHHMM  (lokale tijd, zonder seconden)
    if (/^\d{8}T\d{4}$/.test(raw)) {
      const y = +raw.slice(0, 4),
        m = +raw.slice(4, 6),
        d = +raw.slice(6, 8),
        H = +raw.slice(9, 11),
        M = +raw.slice(11, 13);
      return new Date(y, m - 1, d, H, M, 0);
    }
    // YYYYMMDDTHHMMZ (UTC, zonder seconden)
    if (/^\d{8}T\d{4}Z$/.test(raw)) {
      const y = +raw.slice(0, 4),
        m = +raw.slice(4, 6),
        d = +raw.slice(6, 8),
        H = +raw.slice(9, 11),
        M = +raw.slice(11, 13);
      return new Date(Date.UTC(y, m - 1, d, H, M, 0));
    }
    // YYYYMMDDTHHMMSS (lokaal)
    if (/^\d{8}T\d{6}$/.test(raw)) {
      const y = +raw.slice(0, 4),
        m = +raw.slice(4, 6),
        d = +raw.slice(6, 8),
        H = +raw.slice(9, 11),
        M = +raw.slice(11, 13),
        S = +raw.slice(13, 15);
      return new Date(y, m - 1, d, H, M, S);
    }
    // YYYYMMDDTHHMMSSZ (UTC)
    if (/^\d{8}T\d{6}Z$/.test(raw)) {
      const y = +raw.slice(0, 4),
        m = +raw.slice(4, 6),
        d = +raw.slice(6, 8),
        H = +raw.slice(9, 11),
        M = +raw.slice(11, 13),
        S = +raw.slice(13, 15);
      return new Date(Date.UTC(y, m - 1, d, H, M, S));
    }
    const d = new Date(raw);
    return isNaN(d) ? null : d;
  }

  function parseICS(text) {
    // Unfold lines (join lines that start with a space)
    const unfolded = text.replace(/\r?\n[ \t]/g, "");
    const events = [];
    const regex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
    let m;
    while ((m = regex.exec(unfolded)) !== null) {
      const block = m[1];

      function pick(name) {
        // take the last match if multiple lines exist
        const re = new RegExp(name + "(:|;[^\\n]*:)([^\\n]*)", "i");
        const mm = block.match(re);
        return mm ? mm[2].trim() : "";
      }

      const dtStartRaw = pick("DTSTART");
      const dtEndRaw = pick("DTEND");
      const summary = pick("SUMMARY");
      const location = pick("LOCATION");

      const start = parseICalDate(dtStartRaw);
      const end = parseICalDate(dtEndRaw);

      if (!start || isNaN(start)) continue;

      // 🔥 HOME MATCH FILTER (only keep events where Herk-De-Stad is before "/")
      let isHome = false;
      if (summary) {
        const parts = summary.split("/");
        if (parts.length >= 2) {
          const leftSide = parts[0];
          if (leftSide.includes("Herk-De-Stad")) {
            isHome = true;
          }
        }
      }
      if (!isHome) continue; // skip away matches

      const finalEnd =
        end && !isNaN(end)
          ? end
          : new Date(start.getTime() + 60 * 60 * 1000);

      events.push({
        id: "ical-" + start.getTime() + "-" + Math.random().toString(16).slice(2),
        title: summary || "Externe gebeurtenis",
        start: start.toISOString(),
        end: finalEnd.toISOString(),
        resourceId: "kantine", // 🔹 this is what puts it in the Kantine lane
        extendedProps: {
          type: "ical",
          source: "JVGH iCal",
          location: location || "",
        },
        classNames: ["ical-event"],
      });
    }
    return events;
  }

  async function loadICal() {
    try {
      setIcalStatus("Laden…");
      const res = await fetch(ICAL_URL, { credentials: "omit" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      externalEvents = parseICS(text);
      setIcalStatus("Geladen (" + externalEvents.length + " events).");
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
      <div class="ec-event-time">
        ${timeText}${title ? " – " + title : ""}
      </div>
    `,
      };
    },
    slotMinTime: "08:00:00",
    slotMaxTime: "23:00:00",

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

      assignment.start = newStart.toISOString();
      assignment.end = newEnd.toISOString();
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

      assignment.start = newStart.toISOString();
      assignment.end = newEnd.toISOString();
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
    if (shiftsEnabled && externalEvents.length) {
      externalEvents.forEach((ev, idx) => {
        try {
          const start = new Date(ev.start);
          const endRaw = new Date(ev.end);
          if (!start || isNaN(start)) return;
          const end =
            !endRaw || isNaN(endRaw)
              ? new Date(start.getTime() + 60 * 60 * 1000)
              : endRaw;

          const shiftStart = new Date(start.getTime() - 60 * 60 * 1000); // 1h before match
          const shiftEnd = new Date(end.getTime() + 2 * 60 * 60 * 1000); // 2h after match

          const shiftId = `shift-${start.getTime()}-${idx}`;

          slots.push({
            id: shiftId,
            start: shiftStart.toISOString(),
            end: shiftEnd.toISOString(),
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
        const role = a.role || "vrijwilliger";

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
    if (icalEnabled && externalEvents.length) {
      externalEvents.forEach((ev) => {
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
    if (!window.JVGHApi || typeof JVGHApi.getSchedules !== "function") {
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
      await loadExistingSchedulesOnce();
      let sheetsProcessed = 0;
      let tasksProcessed = 0;

      const sheetIds = new Set();
      for (const [dayKey, sheetId] of daySheetMap.entries()) {
        if (dayKey.startsWith(monthKey + "-")) sheetIds.add(sheetId);
      }

      console.log("[JVGH] Month sheets", monthKey, sheetIds.size);

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

      for (const sheetId of sheetIds) {
        sheetsProcessed += 1;
        let tasksResp;
        try {
          tasksResp = await JVGHApi.getTasks(sheetId);
        } catch (err) {
          console.warn("[JVGH] Could not load tasks for sheet", sheetId, err);
          continue;
        }

        const tasksArr = Array.isArray(tasksResp?.tasks) ? tasksResp.tasks : tasksResp || [];
        if (!tasksArr.length) continue;

        for (const task of tasksArr) {
          const dateStr = String(task?.date || "").slice(0, 10);
          const timeStr = String(task?.time || "").slice(0, 5);
          if (!dateStr || !timeStr) continue;
          if (!dateStr.startsWith(monthKey)) continue;
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
              const year = parseInt(dateStr.slice(0, 4), 10);
              const month = parseInt(dateStr.slice(5, 7), 10);
              const day = parseInt(dateStr.slice(8, 10), 10);
              const hour = parseInt(timeStr.slice(0, 2), 10) || 0;
              const minute = parseInt(timeStr.slice(3, 5), 10) || 0;

              const slotStartDate = new Date(year, month - 1, day, hour, minute, 0);
              const qty = Number(task.qty) || 1;
              const durationMinutes = qty >= 60 ? qty : DEFAULT_ASSIGNMENT_DURATION_MINUTES;
              const slotEndDate = new Date(slotStartDate.getTime() + durationMinutes * 60 * 1000);

              slot = {
                id: "shift-task-" + String(task.id),
                start: slotStartDate.toISOString(),
                end: slotEndDate.toISOString(),
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

          let signupsResp;
          try {
            signupsResp = await JVGHApi.getSignups(task.id);
          } catch (err) {
            loadedTaskIds.delete(taskIdKey);
            console.warn("[JVGH] Could not load signups for task", task.id, err);
            continue;
          }

          const signupsArr = Array.isArray(signupsResp?.signups) ? signupsResp.signups : signupsResp || [];
          if (!signupsArr.length) continue;

          const startYear = parseInt(dateStr.slice(0, 4), 10);
          const startMonth = parseInt(dateStr.slice(5, 7), 10);
          const startDay = parseInt(dateStr.slice(8, 10), 10);
          const startHour = parseInt(timeStr.slice(0, 2), 10) || 0;
          const startMinute = parseInt(timeStr.slice(3, 5), 10) || 0;
          const assignmentStartDate = new Date(startYear, startMonth - 1, startDay, startHour, startMinute, 0);
          const durationMinutes = getTaskDurationMinutes(task.qty);
          const assignmentEndDate = new Date(assignmentStartDate.getTime() + durationMinutes * 60 * 1000);
          const assignmentStartIso = assignmentStartDate.toISOString();
          const assignmentEndIso = assignmentEndDate.toISOString();

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
            let role = "vrijwilliger";
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
              start: assignmentStartIso,
              end: assignmentEndIso,
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
      console.log("[JVGH] Loaded month", monthKey, "newAssignments", newAssignments.length);
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
  const parentsTeamSelectEl =
    document.getElementById("jvgh-team-select") ||
    document.getElementById("parentsTeamSelect");
  const parentsListEl =
    document.getElementById("jvgh-parents-options") ||
    document.getElementById("parentsList");
  const parentsTeamsStatusEl = document.getElementById("parentsTeamsStatus");
  const oudersTeamPillHostEl = document.getElementById("jvgh-ouders-team-pill");
  const oudersPlayerPillHostEl = document.getElementById("jvgh-parents-options");
  const bestuurTitle = document.querySelector(".people-column.bestuur h3");
  const vrijwilligersTitle = document.querySelector(
    ".people-column.vrijwilligers h3"
  );
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
      const assignmentStartIso = assignmentStartDate.toISOString();
      const assignmentEndIso = assignmentEndDate.toISOString();

      let slot = findSlotForDate(date);

      if (!slot) {
        const manualId =
          "shift-custom-" +
          assignmentStartDate.getTime() +
          "-" +
          Math.random().toString(16).slice(2);

        slot = {
          id: manualId,
          start: assignmentStartIso,
          end: assignmentEndIso,
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
        start: assignmentStartIso,
        end: assignmentEndIso,
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
  const baseVolunteersUrl = `https://jeugdherk.be/wp-json/jvgh/v1/volunteers`;
  const roleDurationMinutes = {
    bestuur: 270,
    vrijwilliger: 240,
  };

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
    return card;
  }

  const bestuurNames = new Set();
  const bestuurUserIds = new Set();

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
        containerEl.innerHTML = "";

        if (!Array.isArray(users) || users.length === 0) {
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

        if (role === "bestuur" && bestuurTitle) {
          bestuurTitle.textContent = `Bestuur · ${formatHoursLabel(
            roleDurationMinutes.bestuur
          )}`;
        }
        if (role === "vrijwilliger" && vrijwilligersTitle) {
          vrijwilligersTitle.textContent = `Vrijwilligers · ${formatHoursLabel(
            roleDurationMinutes.vrijwilliger
          )}`;
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
        containerEl.insertAdjacentHTML(
          "beforeend",
          `<p style="margin:6px 0;color:#dc3545;">Kon ${role} niet laden (${err.message}).</p>`
        );
      });
  }

  // Load bestuur first (top list), then vrijwilligers (bottom list)
  loadUsersForRole("bestuur", bestuurListEl);
  loadUsersForRole("vrijwilliger", volunteerListEl);

  // --- iCal toggle behavior ---
  function updateIcalToggleUI() {
    if (!icalToggleEl) return;
    icalToggleEl.classList.toggle("active", icalEnabled);
    icalToggleEl.setAttribute("aria-checked", String(icalEnabled));
  }

  function toggleIcal() {
    icalEnabled = !icalEnabled;
    updateIcalToggleUI();
    if (icalEnabled && externalEvents.length === 0) {
      // first enable → load ICS
      loadICal();
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

  // --- Shifts toggle behavior ---
  function updateShiftToggleUI() {
    if (!shiftToggleEl) return;
    shiftToggleEl.classList.toggle("active", shiftsEnabled);
    shiftToggleEl.setAttribute("aria-checked", String(shiftsEnabled));
  }

  function toggleShifts() {
    shiftsEnabled = !shiftsEnabled;
    updateShiftToggleUI();
    if (shiftsEnabled && externalEvents.length === 0) {
      // if we haven't loaded iCal yet, load it now
      loadICal().finally(() => {
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

  // Always start with iCal hidden on page load
  icalEnabled = false;
  updateIcalToggleUI();

  // Shifts ON by default
  shiftsEnabled = true;
  updateShiftToggleUI();

  // No persistence for iCal setting: always off on page load

  // If shifts are enabled but we have no iCal data yet, load it (for slot generation only)
  if (shiftsEnabled && externalEvents.length === 0) {
    loadICal();
  }

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
