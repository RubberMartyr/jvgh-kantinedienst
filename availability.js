const DEFAULT_ASSIGNMENT_DURATION_MINUTES = 240;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function monthLabelFromKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
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

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const userRaw = params.get("userId") || params.get("user") || params.get("uid") || "";
  const monthRaw = params.get("month") || "";

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
  const saveButton = document.getElementById("availability-save");
  if (!saveButton) return;
  saveButton.disabled = !isDirty;
  saveButton.textContent = isDirty ? "Opslaan" : "Alles opgeslagen";
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

async function loadSignupsByTask(tasks) {
  const signupsByTask = new Map();

  for (const task of tasks) {
    const signupsResp = await JVGHApi.getSignups(task.id);
    const signups = Array.isArray(signupsResp?.signups) ? signupsResp.signups : signupsResp || [];
    signupsByTask.set(String(task.id), signups);
  }

  return signupsByTask;
}

function resolveUserName({ providedName, userId, signupsByTask }) {
  if (providedName) return providedName;

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
    const state = stateByTask.get(String(task.id));

    const li = document.createElement("li");
    li.className = "availability-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.currentChecked;
    checkbox.title = checkboxHoverTitle(state.signups, userId);

    const textWrap = document.createElement("div");
    textWrap.className = "availability-item-main";

    const label = document.createElement("span");
    label.textContent = formatShiftLabel(task);

    const badge = document.createElement("span");
    badge.className = "availability-badge";
    badge.textContent = `Taak #${task.id}`;

    textWrap.appendChild(label);
    textWrap.appendChild(badge);

    checkbox.addEventListener("change", () => {
      state.currentChecked = checkbox.checked;
      const dirtyCount = computeDirtyCount(stateByTask);
      setSaveDirtyState(dirtyCount > 0);
      setStatus(dirtyCount > 0 ? `${dirtyCount} wijziging(en) nog op te slaan.` : "Alles opgeslagen.");
    });

    li.appendChild(checkbox);
    li.appendChild(textWrap);
    listEl.appendChild(li);
  });

  setStatus(`${tasks.length} shifts geladen.`);
}

async function saveChanges({ stateByTask, userId, userName }) {
  const saveButton = document.getElementById("availability-save");
  saveButton.disabled = true;
  saveButton.textContent = "Opslaan...";

  try {
    const entries = Array.from(stateByTask.values());
    const toCreate = entries.filter((s) => !s.originalChecked && s.currentChecked);
    const toDelete = entries.filter((s) => s.originalChecked && !s.currentChecked);

    if (!toCreate.length && !toDelete.length) {
      setStatus("Geen wijzigingen om op te slaan.");
      setSaveDirtyState(false);
      return;
    }

    for (const state of toCreate) {
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
    document.querySelectorAll('#availability-list input[type="checkbox"]').forEach((checkbox, index) => {
      const task = Array.from(stateByTask.values())[index];
      checkbox.title = checkboxHoverTitle(task.signups, userId);
    });
  } catch (err) {
    console.error(err);
    setStatus("Fout bij opslaan van wijzigingen.", true);
    saveButton.disabled = false;
    saveButton.textContent = "Opslaan";
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

  try {
    setStatus("Shifts laden…");
    const tasks = await loadTasksForMonth(monthKey);

    setStatus("Inschrijvingen laden…");
    const signupsByTask = await loadSignupsByTask(tasks);

    const resolvedName = resolveUserName({ providedName, userId, signupsByTask });
    metaEl.innerHTML = `
      <div><strong>Hallo, ${resolvedName} (${userId})</strong></div>
      <div><strong>Maand:</strong> ${monthLabelFromKey(monthKey)} (${monthKey})</div>
    `;

    const stateByTask = new Map();
    tasks.forEach((task) => {
      const signups = signupsByTask.get(String(task.id)) || [];
      const userSignup = signups.find((su) => Number(su.userId || su.user_id) === Number(userId)) || null;
      stateByTask.set(String(task.id), {
        task,
        signups: [...signups],
        userSignup,
        originalChecked: Boolean(userSignup),
        currentChecked: Boolean(userSignup),
      });
    });

    renderList({ tasks, stateByTask, userId });

    const saveButton = document.getElementById("availability-save");
    saveButton.addEventListener("click", () => {
      saveChanges({ stateByTask, userId, userName: resolvedName });
    });
    setSaveDirtyState(false);
  } catch (err) {
    console.error(err);
    setStatus("Fout bij laden van shifts of inschrijvingen.", true);
  }
});
