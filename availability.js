const DEFAULT_ASSIGNMENT_DURATION_MINUTES = 240;

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
  const firstName = signup.firstName || signup.firstname || signup.first_name || "";
  const lastName = signup.lastName || signup.lastname || signup.last_name || "";
  return `${firstName} ${lastName}`.trim() || "Vrijwilliger";
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

function findStateForTask(stateByTask, task) {
  return (
    stateByTask.get(shiftKey(task)) ||
    stateByTask.get(`slot-${String(task?.date || "").slice(0, 10)}-${String(task?.time || "").slice(0, 5)}`) ||
    stateByTask.get(`task-${task?.id}`)
  );
}

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const userRaw = params.get("userId") || params.get("user") || params.get("uid") || "";
  const defaultNextMonth = monthKeyFromDate(addMonths(new Date(), 1));
  const monthRaw = params.get("month") || defaultNextMonth;

  return {
    userRaw,
    userId: Number.isFinite(Number(userRaw)) ? Number(userRaw) : null,
    monthRaw,
    monthKey: parseMonthInput(monthRaw),
    userName: (params.get("name") || "").trim(),
  };
}

function setStatus(msg, isError = false) {
  const statusEl = document.getElementById("availability-status");
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.toggle("availability-error", isError);
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

async function loadTasksForMonth(monthKey) {
  const schedulesResp = await JVGHApi.getSchedules();
  const schedules = Array.isArray(schedulesResp?.schedules)
    ? schedulesResp.schedules
    : schedulesResp || [];

  const monthSchedules = schedules.filter((s) => String(s?.start || "").slice(0, 7) === monthKey);
  const tasks = [];

  for (const schedule of monthSchedules) {
    const tasksResp = await JVGHApi.getTasks(schedule.id);
    const tasksArr = Array.isArray(tasksResp?.tasks) ? tasksResp.tasks : tasksResp || [];

    tasksArr.forEach((task) => {
      const dateStr = String(task.date || "").slice(0, 10);
      if (dateStr.startsWith(monthKey)) {
        tasks.push({ ...task, sheetId: schedule.id });
      }
    });
  }

  tasks.sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
  return tasks;
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

function parseICS(text) {
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
    const start = parseICalDate(pick("DTSTART"));
    const endRaw = parseICalDate(pick("DTEND"));
    if (!start || Number.isNaN(start.getTime())) continue;

    const parts = String(summary || "").split("/");
    if (!(parts.length >= 2 && parts[0].includes("Herk-De-Stad"))) continue;

    const end = endRaw && !Number.isNaN(endRaw.getTime())
      ? endRaw
      : new Date(start.getTime() + 60 * 60 * 1000);

    events.push({ summary, start, end });
  }

  return events;
}

async function loadShiftSlotsForMonth(monthKey) {
  const ICAL_URL = "https://jeugdherk.be/calendar/jvgh-kalender/?feed=sp-ical";
  const res = await fetch(ICAL_URL, { credentials: "omit" });
  if (!res.ok) return [];
  const text = await res.text();
  const events = parseICS(text);

  return events
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
      };
    })
    .filter((slot) => slot.date.slice(0, 7) === monthKey)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

async function ensureTaskForShift(shift, scheduleByDay) {
  if (shift.id) return shift.id;
  const dayKey = shift.date;
  let scheduleId = scheduleByDay.get(dayKey);

  if (!scheduleId) {
    const createdSchedule = await JVGHApi.createSchedule({
      title: `Kantinedienst ${dayKey}`,
      start: shift.start,
      end: shift.end,
    });
    const sch = createdSchedule?.schedule && createdSchedule.schedule.id
      ? createdSchedule.schedule
      : createdSchedule;
    scheduleId = sch.id;
    scheduleByDay.set(dayKey, scheduleId);
  }

  const tasksResp = await JVGHApi.getTasks(scheduleId);
  const tasksArr = Array.isArray(tasksResp?.tasks) ? tasksResp.tasks : tasksResp || [];
  let task = tasksArr.find((t) =>
    String(t.date || "").slice(0, 10) === shift.date &&
    String(t.time || "").slice(0, 5) === shift.time
  );

  if (!task) {
    const createdTask = await JVGHApi.createTask(scheduleId, {
      title: `Kantinedienst ${shift.time}`,
      qty: Number(shift.qty) || DEFAULT_ASSIGNMENT_DURATION_MINUTES,
      date: shift.date,
      time: shift.time,
    });
    task = createdTask?.task && createdTask.task.id ? createdTask.task : createdTask;
  }

  shift.id = task.id;
  return task.id;
}

async function loadSignupsByTask(tasks) {
  const signupsByTask = new Map();

  for (const task of tasks) {
    const signupsResp = await JVGHApi.getSignups(task.id);
    const signups = Array.isArray(signupsResp?.signups) ? signupsResp.signups : signupsResp || [];
    signupsByTask.set(String(task.id), signups);
  }

  return signupsByTask;
}

async function resolveUserName({ providedName, userId, signupsByTask }) {
  if (providedName) return providedName;

  if (window.JVGHApi && typeof JVGHApi.getUserDisplayName === "function") {
    const apiName = await JVGHApi.getUserDisplayName(userId);
    if (apiName) return apiName;
  }

  for (const signups of signupsByTask.values()) {
    const match = signups.find((su) => Number(su.userId || su.user_id) === Number(userId));
    if (match) {
      return signupName(match);
    }
  }

  return "Gebruiker";
}

function checkboxHoverTitle(signups, userId) {
  const others = signups.filter((su) => Number(su.userId || su.user_id) !== Number(userId));
  if (!others.length) {
    return "Nog geen andere ingeplande gebruikers op deze shift.";
  }
  return `Reeds ingepland: ${others.map(signupName).join(", ")}`;
}

function computeDirtyCount(stateByTask) {
  let count = 0;
  for (const state of stateByTask.values()) {
    if (state.currentChecked !== state.originalChecked) count += 1;
  }
  return count;
}

function renderList({ tasks, stateByTask, userId }) {
  const listEl = document.getElementById("availability-list");
  listEl.innerHTML = "";

  if (!tasks.length) {
    setStatus("Geen shifts gevonden voor deze maand.");
    return;
  }

  tasks.forEach((task) => {
    const state = findStateForTask(stateByTask, task);
    if (!state) return;

    const li = document.createElement("li");
    li.className = "availability-item";
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
    checkbox.checked = state.currentChecked;
    checkbox.title = checkboxHoverTitle(state.signups, userId);

    const textWrap = document.createElement("div");
    textWrap.className = "availability-item-main";

    const label = document.createElement("span");
    label.textContent = formatShiftLabel(task);

    textWrap.appendChild(label);

    const expandButton = document.createElement("button");
    expandButton.type = "button";
    expandButton.className = "availability-expand-btn";
    expandButton.textContent = "+";
    expandButton.title = "Details tonen";

    const details = document.createElement("div");
    details.className = "availability-details";

    const otherUsers = state.signups.filter((su) => Number(su.userId || su.user_id) !== Number(userId));
    const otherUsersHtml = otherUsers.length
      ? `<ul>${otherUsers.map((su) => `<li>${signupName(su)}</li>`).join("")}</ul>`
      : "<div>Geen andere ingeplande personen op dit moment.</div>";

    let reasonHtml = "<div><strong>Reden:</strong> Handmatige/plannings-taak</div>";
    if (task.source === "ics" || task.icsSummary) {
      const matchHours = task.icsStart && task.icsEnd
        ? ` (${formatHourRange(task.icsStart, task.icsEnd)})`
        : "";
      reasonHtml = `<div><strong>Reden:</strong> ${task.sourceReason || "Voetbalwedstrijd kalender"}${matchHours}<br>${task.icsSummary || ""}</div>`;
    }

    details.innerHTML = `
      ${reasonHtml}
      <div style="margin-top:6px;"><strong>Andere ingeplande vrijwilligers:</strong></div>
      ${otherUsersHtml}
    `;

    expandButton.addEventListener("click", () => {
      const open = details.classList.toggle("is-open");
      expandButton.textContent = open ? "−" : "+";
      expandButton.title = open ? "Details verbergen" : "Details tonen";
    });

    checkbox.addEventListener("change", () => {
      state.currentChecked = checkbox.checked;
      const dirtyCount = computeDirtyCount(stateByTask);
      setSaveDirtyState(dirtyCount > 0);
      setStatus(dirtyCount > 0 ? `${dirtyCount} wijziging(en) nog op te slaan.` : "Alles opgeslagen.");
    });

    li.appendChild(checkbox);
    li.appendChild(textWrap);
    li.appendChild(expandButton);
    li.appendChild(details);
    listEl.appendChild(li);
  });

  setStatus(`${tasks.length} shifts geladen.`);
}

async function saveChanges({ stateByTask, userId, userName }) {
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

    const schedulesResp = await JVGHApi.getSchedules();
    const schedules = Array.isArray(schedulesResp?.schedules) ? schedulesResp.schedules : schedulesResp || [];
    const scheduleByDay = new Map();
    schedules.forEach((s) => {
      const day = String(s?.start || "").slice(0, 10);
      if (day) scheduleByDay.set(day, s.id);
    });

    for (const state of toCreate) {
      const previousKey = shiftKey(state.task);
      if (!state.task.id) {
        await ensureTaskForShift(state.task, scheduleByDay);
      }
      const newKey = shiftKey(state.task);
      if (previousKey !== newKey && stateByTask.has(previousKey)) {
        stateByTask.delete(previousKey);
        stateByTask.set(newKey, state);
      }
      const created = await JVGHApi.createSignup(state.task.id, {
        firstName: userName,
        lastName: "",
        email: "",
        phone: "",
        userId,
      });

      const signup = created?.signup && created.signup.id ? created.signup : created;
      state.signups.push(signup);
      state.userSignup = signup;
      state.originalChecked = true;
      state.currentChecked = true;
    }

    for (const state of toDelete) {
      const signup = state.userSignup;
      if (!signup?.id) continue;
      await JVGHApi.deleteSignup(state.task.id, signup.id);
      state.signups = state.signups.filter((su) => Number(su.id) !== Number(signup.id));
      state.userSignup = null;
      state.originalChecked = false;
      state.currentChecked = false;
    }

    setStatus("Wijzigingen opgeslagen.");
    setSaveDirtyState(false);
    const refreshedTasks = Array.from(stateByTask.values()).map((s) => s.task);
    renderList({ tasks: refreshedTasks, stateByTask, userId });
    document.querySelectorAll('#availability-list input[type="checkbox"]').forEach((checkbox, index) => {
      const state = Array.from(stateByTask.values())[index];
      checkbox.title = checkboxHoverTitle(state.signups, userId);
    });
  } catch (err) {
    console.error(err);
    setStatus("Fout bij opslaan van wijzigingen.", true);
    saveButtons.forEach((saveButton) => {
      saveButton.disabled = false;
      saveButton.textContent = "Opslaan";
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const metaEl = document.getElementById("availability-meta");
  const { userRaw, userId, monthRaw, monthKey, userName: providedName } = getQueryParams();

  if (!userRaw || userId === null) {
    setStatus("Parameter userId ontbreekt of is ongeldig.", true);
    return;
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
  let resolvedName = providedName || null;
  let monthLoading = false;
  setSaveButtonsVisible(false);

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
      <div><strong>Hallo, ${resolvedName || "Gebruiker"} (${userId})</strong></div>
      <div class="availability-month">${monthLabelFromKey(currentMonthKey)}</div>
      <div class="availability-month-nav">
        <button type="button" id="availability-prev-month" class="availability-month-btn">${prevLabel}</button>
        <button type="button" id="availability-next-month" class="availability-month-btn">${nextLabel}</button>
      </div>
    `;

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

  async function loadMonth() {
    if (monthLoading) return;
    monthLoading = true;
    const currentMonthKey = monthKeyFromDate(currentMonthDate);
    try {
      setSaveButtonsVisible(false);
      renderMetaHeader();
      setMonthButtonsDisabled(true);
      setStatus("Shifts laden…");
      const tasks = await loadTasksForMonth(currentMonthKey);
      const slotShifts = await loadShiftSlotsForMonth(currentMonthKey);

      const mergedByKey = new Map();
      slotShifts.forEach((shift) => {
        mergedByKey.set(`${shift.date} ${shift.time}`, shift);
      });
      tasks.forEach((task) => {
        const key = `${String(task.date || "").slice(0, 10)} ${String(task.time || "").slice(0, 5)}`;
        const existing = mergedByKey.get(key) || {};
        mergedByKey.set(key, {
          ...existing,
          ...task,
          date: String(task.date || "").slice(0, 10),
          time: String(task.time || "").slice(0, 5),
        });
      });
      const allShifts = Array.from(mergedByKey.values()).sort((a, b) =>
        `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`)
      );

      setStatus("Inschrijvingen laden…");
      const signupsByTask = await loadSignupsByTask(allShifts.filter((s) => s.id));
      if (!resolvedName) {
        resolvedName = await resolveUserName({ providedName, userId, signupsByTask });
        renderMetaHeader();
      }

      currentStateByTask = new Map();
      allShifts.forEach((task) => {
        const signups = signupsByTask.get(String(task.id)) || [];
        const userSignup = signups.find((su) => Number(su.userId || su.user_id) === Number(userId)) || null;
        currentStateByTask.set(shiftKey(task), {
          task,
          signups: [...signups],
          userSignup,
          originalChecked: Boolean(userSignup),
          currentChecked: Boolean(userSignup),
        });
      });

      renderList({ tasks: allShifts, stateByTask: currentStateByTask, userId });
      setSaveDirtyState(false);
      setSaveButtonsVisible(true);
    } catch (err) {
      console.error(err);
      setStatus("Fout bij laden van shifts of inschrijvingen.", true);
    } finally {
      monthLoading = false;
      setMonthButtonsDisabled(false);
    }
  }

  document.querySelectorAll(".availability-save-btn").forEach((saveButton) => {
    saveButton.onclick = () => {
      saveChanges({ stateByTask: currentStateByTask, userId, userName: resolvedName || "Gebruiker" });
    };
  });

  await loadMonth();
});
