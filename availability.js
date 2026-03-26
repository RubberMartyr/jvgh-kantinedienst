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

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const userRaw =
    params.get("userId") ||
    params.get("user") ||
    params.get("uid") ||
    "";

  const monthRaw = params.get("month") || "";
  const monthKey = parseMonthInput(monthRaw);

  return {
    userRaw,
    userId: Number.isFinite(Number(userRaw)) ? Number(userRaw) : null,
    monthRaw,
    monthKey,
  };
}

function setStatus(msg, isError = false) {
  const statusEl = document.getElementById("availability-status");
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.toggle("availability-error", isError);
}

async function loadTasksForMonth(monthKey) {
  const schedulesResp = await JVGHApi.getSchedules();
  const schedules = Array.isArray(schedulesResp?.schedules)
    ? schedulesResp.schedules
    : schedulesResp || [];

  const monthSchedules = schedules.filter((s) => {
    const start = String(s?.start || "");
    return start.slice(0, 7) === monthKey;
  });

  const tasks = [];

  for (const schedule of monthSchedules) {
    const tasksResp = await JVGHApi.getTasks(schedule.id);
    const tasksArr = Array.isArray(tasksResp?.tasks) ? tasksResp.tasks : tasksResp || [];

    tasksArr.forEach((task) => {
      const dateStr = String(task.date || "").slice(0, 10);
      if (dateStr.startsWith(monthKey)) {
        tasks.push({
          ...task,
          sheetId: schedule.id,
        });
      }
    });
  }

  tasks.sort((a, b) => {
    const aKey = `${a.date || ""} ${a.time || ""}`;
    const bKey = `${b.date || ""} ${b.time || ""}`;
    return aKey.localeCompare(bKey);
  });

  return tasks;
}

async function loadExistingSignupMap(tasks, userId) {
  const map = new Map();

  for (const task of tasks) {
    const signupsResp = await JVGHApi.getSignups(task.id);
    const signups = Array.isArray(signupsResp?.signups) ? signupsResp.signups : signupsResp || [];

    const existing = signups.find((su) => Number(su.userId || su.user_id) === Number(userId));
    if (existing) {
      map.set(String(task.id), existing);
    }
  }

  return map;
}

async function onToggleSignup({ checkbox, task, userId, signupMap }) {
  const firstName = "Gebruiker";
  const lastName = String(userId);
  const taskKey = String(task.id);

  checkbox.disabled = true;

  try {
    if (checkbox.checked) {
      if (signupMap.has(taskKey)) {
        return;
      }

      const created = await JVGHApi.createSignup(task.id, {
        firstName,
        lastName,
        email: "",
        phone: "",
        userId,
      });

      const signup = created?.signup && created.signup.id ? created.signup : created;
      signupMap.set(taskKey, signup);
    } else {
      const signup = signupMap.get(taskKey);
      if (!signup?.id) {
        return;
      }

      await JVGHApi.deleteSignup(task.id, signup.id);
      signupMap.delete(taskKey);
    }
  } catch (err) {
    checkbox.checked = !checkbox.checked;
    const message = err?.message || "Kon de inschrijving niet bijwerken.";
    window.alert(message);
  } finally {
    checkbox.disabled = false;
  }
}

function renderList({ tasks, signupMap, userId }) {
  const listEl = document.getElementById("availability-list");
  listEl.innerHTML = "";

  if (!tasks.length) {
    setStatus("Geen shifts gevonden voor deze maand.");
    return;
  }

  setStatus(`${tasks.length} shifts geladen.`);

  tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "availability-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = signupMap.has(String(task.id));

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
      onToggleSignup({ checkbox, task, userId, signupMap });
    });

    li.appendChild(checkbox);
    li.appendChild(textWrap);
    listEl.appendChild(li);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const metaEl = document.getElementById("availability-meta");
  const { userRaw, userId, monthRaw, monthKey } = getQueryParams();

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

  metaEl.innerHTML = `
    <div><strong>Gebruiker:</strong> #${userId}</div>
    <div><strong>Maand:</strong> ${monthLabelFromKey(monthKey)} (${monthKey})</div>
  `;

  try {
    setStatus("Shifts laden…");
    const tasks = await loadTasksForMonth(monthKey);

    setStatus("Inschrijvingen laden…");
    const signupMap = await loadExistingSignupMap(tasks, userId);

    renderList({ tasks, signupMap, userId });
  } catch (err) {
    console.error(err);
    setStatus("Fout bij laden van shifts of inschrijvingen.", true);
  }
});
