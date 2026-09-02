// jvgh-api.js

// === CONFIG ==================================================
const JVGH_API_DOMAIN = 'https://jeugdherk.be';
const JVGH_API_BASE   = `${JVGH_API_DOMAIN}/wp-json/jvgh/v1`;

// ⚠️ Use a dedicated WP user + Application Password here,
// just like you did for goldbug / Sportspress.
const JVGH_USERNAME     = 'ive';
const JVGH_APP_PASSWORD = 'x5qd TH4O FngR XBHk yMLI V8tn'; // app password
const JVGH_CREDENTIALS  = btoa(`${JVGH_USERNAME}:${JVGH_APP_PASSWORD}`);

// === LOW-LEVEL REQUEST WRAPPER ===============================
async function jvghRequest(path, { method = 'GET', body = null } = {}) {
  const url = `${JVGH_API_BASE}${path}`;

  const headers = {
    'Authorization': 'Basic ' + JVGH_CREDENTIALS,
    'Accept': 'application/json',
  };

  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  const isGetRequest =
    String(method).toUpperCase() === "GET";

  const requestUrl = isGetRequest
    ? `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`
    : url;

  const res = await fetch(requestUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
    cache: isGetRequest ? "no-store" : "no-cache",
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok) {
    const error = new Error(data?.message || `JVGH API request failed (${res.status})`);
    error.code = data?.code || 'jvgh_request_failed';
    error.status = res.status;
    throw error;
  }

  return data;
}

// === SCHEDULES ===============================================

async function getSchedules() {
  return jvghRequest('/schedules');
}

async function getMonthData(monthKey) {
  return jvghRequest(`/month-data?month=${encodeURIComponent(monthKey)}`);
}

async function getPlannerMonthData(monthKey) {
  return jvghRequest(
    `/planner-month-data?month=${encodeURIComponent(monthKey)}`
  );
}

async function createSchedule({ title, start, end = null }) {
  return jvghRequest('/schedules', {
    method: 'POST',
    body: { title, start, end },
  });
}

async function updateSchedule(id, { title, start, end }) {
  return jvghRequest(`/schedules/${id}`, {
    method: 'PUT',
    body: { title, start, end },
  });
}

async function deleteSchedule(id) {
  return jvghRequest(`/schedules/${id}`, {
    method: 'DELETE',
  });
}

// === TASKS ===================================================

async function getTasks(sheetId) {
  return jvghRequest(`/schedules/${sheetId}/tasks`);
}

async function createTask(sheetId, { title, qty = 1, date = '', time = '' }) {
  return jvghRequest(`/schedules/${sheetId}/tasks`, {
    method: 'POST',
    body: { title, qty, date, time },
  });
}

async function updateTask(sheetId, taskId, payload) {
  return jvghRequest(`/schedules/${sheetId}/tasks/${taskId}`, {
    method: 'PUT',
    body: payload,
  });
}

async function deleteTask(sheetId, taskId) {
  return jvghRequest(`/schedules/${sheetId}/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

// === SIGNUPS (VOLUNTEERS) ====================================

async function getSignups(taskId) {
  return jvghRequest(`/tasks/${taskId}/signups`);
}

// 🔹 now also sends optional userId so PHP can link to the WP user
async function createSignup(
  taskId,
  { firstName, lastName, email = '', phone = '', userId = null }
) {
  const body = { firstName, lastName, email, phone };
  if (userId !== null && userId !== undefined) {
    body.userId = userId;
  }

  return jvghRequest(`/tasks/${taskId}/signups`, {
    method: 'POST',
    body,
  });
}

async function deleteSignup(taskId, signupId) {
  return jvghRequest(`/tasks/${taskId}/signups/${signupId}`, {
    method: 'DELETE',
  });
}

async function resolveOrCreateAvailabilityUser({ firstName, lastName, phone, teamId }) {
  const normalizedTeamId = Number(teamId);
  if (!Number.isInteger(normalizedTeamId) || normalizedTeamId <= 0) {
    throw new Error('Een geldige teamId is verplicht.');
  }

  return jvghRequest('/availability-parent', {
    method: 'POST',
    body: {
      firstName: String(firstName || '').trim(),
      lastName: String(lastName || '').trim(),
      phone: String(phone || '').trim(),
      teamId: normalizedTeamId,
    },
  });
}

// === USERS ===================================================

async function getUserDisplayName(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const authHeaders = {
    'Authorization': 'Basic ' + JVGH_CREDENTIALS,
    'Accept': 'application/json',
  };

  const endpoints = [
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}?context=edit`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users?include=${id}&per_page=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) continue;

      const data = await res.json();
      const normalized = Array.isArray(data) ? data[0] : data;
      const name =
        normalized?.display_name ||
        normalized?.displayName ||
        normalized?.name ||
        [normalized?.first_name, normalized?.last_name].filter(Boolean).join(' ').trim();

      if (name) return name;
    } catch (err) {
      // try the next endpoint
    }
  }

  return null;
}

// === USERS ===================================================

async function getUserDisplayName(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const authHeaders = {
    'Authorization': 'Basic ' + JVGH_CREDENTIALS,
    'Accept': 'application/json',
  };

  const endpoints = [
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}?context=edit`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users?include=${id}&per_page=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) continue;

      const data = await res.json();
      const normalized = Array.isArray(data) ? data[0] : data;
      const name =
        normalized?.display_name ||
        normalized?.displayName ||
        normalized?.name ||
        [normalized?.first_name, normalized?.last_name].filter(Boolean).join(' ').trim();

      if (name) return name;
    } catch (err) {
      // try the next endpoint
    }
  }

  return null;
}

// === USERS ===================================================

async function getUserDisplayName(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const authHeaders = {
    'Authorization': 'Basic ' + JVGH_CREDENTIALS,
    'Accept': 'application/json',
  };

  const endpoints = [
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}?context=edit`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users?include=${id}&per_page=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) continue;

      const data = await res.json();
      const normalized = Array.isArray(data) ? data[0] : data;
      const name =
        normalized?.display_name ||
        normalized?.displayName ||
        normalized?.name ||
        [normalized?.first_name, normalized?.last_name].filter(Boolean).join(' ').trim();

      if (name) return name;
    } catch (err) {
      // try the next endpoint
    }
  }

  return null;
}

// === USERS ===================================================

async function getUserDisplayName(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const authHeaders = {
    'Authorization': 'Basic ' + JVGH_CREDENTIALS,
    'Accept': 'application/json',
  };

  const endpoints = [
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}?context=edit`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users?include=${id}&per_page=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) continue;

      const data = await res.json();
      const normalized = Array.isArray(data) ? data[0] : data;
      const name =
        normalized?.display_name ||
        normalized?.displayName ||
        normalized?.name ||
        [normalized?.first_name, normalized?.last_name].filter(Boolean).join(' ').trim();

      if (name) return name;
    } catch (err) {
      // try the next endpoint
    }
  }

  return null;
}

// === USERS ===================================================

async function getUserDisplayName(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const authHeaders = {
    'Authorization': 'Basic ' + JVGH_CREDENTIALS,
    'Accept': 'application/json',
  };

  const endpoints = [
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}?context=edit`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users?include=${id}&per_page=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) continue;

      const data = await res.json();
      const normalized = Array.isArray(data) ? data[0] : data;
      const name =
        normalized?.display_name ||
        normalized?.displayName ||
        normalized?.name ||
        [normalized?.first_name, normalized?.last_name].filter(Boolean).join(' ').trim();

      if (name) return name;
    } catch (err) {
      // try the next endpoint
    }
  }

  return null;
}

// === USERS ===================================================

async function getUserDisplayName(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const authHeaders = {
    'Authorization': 'Basic ' + JVGH_CREDENTIALS,
    'Accept': 'application/json',
  };

  const endpoints = [
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}?context=edit`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users?include=${id}&per_page=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) continue;

      const data = await res.json();
      const normalized = Array.isArray(data) ? data[0] : data;
      const name =
        normalized?.display_name ||
        normalized?.displayName ||
        normalized?.name ||
        [normalized?.first_name, normalized?.last_name].filter(Boolean).join(' ').trim();

      if (name) return name;
    } catch (err) {
      // try the next endpoint
    }
  }

  return null;
}

// === USERS ===================================================

async function getUserDisplayName(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const authHeaders = {
    'Authorization': 'Basic ' + JVGH_CREDENTIALS,
    'Accept': 'application/json',
  };

  const endpoints = [
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}?context=edit`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users?include=${id}&per_page=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) continue;

      const data = await res.json();
      const normalized = Array.isArray(data) ? data[0] : data;
      const name =
        normalized?.display_name ||
        normalized?.displayName ||
        normalized?.name ||
        [normalized?.first_name, normalized?.last_name].filter(Boolean).join(' ').trim();

      if (name) return name;
    } catch (err) {
      // try the next endpoint
    }
  }

  return null;
}

// === USERS ===================================================

async function getUserDisplayName(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const authHeaders = {
    'Authorization': 'Basic ' + JVGH_CREDENTIALS,
    'Accept': 'application/json',
  };

  const endpoints = [
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}?context=edit`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users?include=${id}&per_page=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) continue;

      const data = await res.json();
      const normalized = Array.isArray(data) ? data[0] : data;
      const name =
        normalized?.display_name ||
        normalized?.displayName ||
        normalized?.name ||
        [normalized?.first_name, normalized?.last_name].filter(Boolean).join(' ').trim();

      if (name) return name;
    } catch (err) {
      // try the next endpoint
    }
  }

  return null;
}

// === USERS ===================================================

async function getUserDisplayName(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const authHeaders = {
    'Authorization': 'Basic ' + JVGH_CREDENTIALS,
    'Accept': 'application/json',
  };

  const endpoints = [
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}?context=edit`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users/${id}`,
    `${JVGH_API_DOMAIN}/wp-json/wp/v2/users?include=${id}&per_page=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) continue;

      const data = await res.json();
      const normalized = Array.isArray(data) ? data[0] : data;
      const name =
        normalized?.display_name ||
        normalized?.displayName ||
        normalized?.name ||
        [normalized?.first_name, normalized?.last_name].filter(Boolean).join(' ').trim();

      if (name) return name;
    } catch (err) {
      // try the next endpoint
    }
  }

  return null;
}

// === EXPOSE A GLOBAL OBJECT FOR EASY USE =====================

window.JVGHApi = {
  getSchedules,
  getMonthData,
  getPlannerMonthData,
  createSchedule,
  updateSchedule,
  deleteSchedule,

  getTasks,
  createTask,
  updateTask,
  deleteTask,

  getSignups,
  createSignup,
  deleteSignup,
  resolveOrCreateAvailabilityUser,

  getUserDisplayName,
};
