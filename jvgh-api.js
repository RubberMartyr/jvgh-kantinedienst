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

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok) {
    console.error('JVGH API error', res.status, data);
    throw data || { status: res.status, message: 'Unknown error' };
  }

  return data;
}

// === SCHEDULES ===============================================

async function getSchedules() {
  return jvghRequest('/schedules');
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

// === EXPOSE A GLOBAL OBJECT FOR EASY USE =====================

window.JVGHApi = {
  getSchedules,
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
};
