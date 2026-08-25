'use strict';

function createJvghApiClient({ baseUrl = 'https://jeugdherk.be', username = '', appPassword = '', fetchImpl = global.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const root = String(baseUrl).replace(/\/$/, '');
  const auth = username && appPassword ? `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}` : '';
  async function request(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (auth) headers.Authorization = auth;
    const response = await fetchImpl(`${root}${path}`, { cache: 'no-store', ...options, headers });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data?.message || `WordPress request failed: HTTP ${response.status}`); error.status = response.status; throw error; }
    return data;
  }
  async function getVolunteers(role = '') { return request(`/wp-json/jvgh/v1/volunteers${role ? `?role=${encodeURIComponent(role)}` : ''}`); }
  async function getPlannerMonthData(month) { return request(`/wp-json/jvgh/v1/planner-month-data?month=${encodeURIComponent(month)}`); }
  async function getScheduledVolunteers(date) { return request(`/wp-json/jvgh/v1/scheduled-volunteers?date=${encodeURIComponent(date)}`); }
  async function getWhatsAppSettings() { return request('/wp-json/jvgh/v1/whatsapp-settings'); }
  async function saveWhatsAppSettings(settings) { return request('/wp-json/jvgh/v1/whatsapp-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings || {}) }); }
  async function getUserDetails(id) {
    const userId = Number(id); if (!Number.isFinite(userId) || userId <= 0) return null;
    for (const path of [`/wp-json/wp/v2/users/${userId}?context=edit`, `/wp-json/wp/v2/users/${userId}`, `/wp-json/wp/v2/users?include=${userId}&per_page=1`]) {
      try { const data = await request(path); return Array.isArray(data) ? data[0] || null : data; } catch (_) { /* try public fallback */ }
    }
    return null;
  }
  return { getVolunteers, getPlannerMonthData, getScheduledVolunteers, getWhatsAppSettings, saveWhatsAppSettings, getUserDetails };
}
module.exports = { createJvghApiClient };
