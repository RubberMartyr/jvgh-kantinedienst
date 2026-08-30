(function (root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.JVGHCore = core;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizePhoneNumber(rawPhone) {
    const raw = String(rawPhone || '').trim();
    if (!raw) return '';
    let digits = raw.replace(/[^\d+]/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
    else if (!digits.startsWith('+') && digits.startsWith('0')) digits = `+32${digits.slice(1)}`;
    else if (!digits.startsWith('+')) digits = `+${digits}`;
    const numberPart = digits.replace(/^\+/, '');
    return /^\d{8,15}$/.test(numberPart) ? `+${numberPart}` : '';
  }

  function getUserPhoneInfo(user) {
    if (!user || typeof user !== 'object') return { normalized: '', reason: 'Geen gebruikersdata beschikbaar.' };
    const sources = [user.phone, user.mobile, user.whatsapp, user.tel, user.telefoon, user.gsm,
      user.user_phone, user.phone_number, user?.meta?.phone, user?.meta?.mobile, user?.meta?.telefoon,
      user?.acf?.phone, user?.acf?.mobile, user?.acf?.telefoon, user?.systemuser?.phone,
      user?.systemuser?.mobile, user?.systemuser?.telefoon];
    const raw = String(sources.find((value) => String(value || '').trim()) || '').trim();
    if (!raw) return { normalized: '', reason: 'Geen telefoonnummer gevonden in de API-respons voor deze gebruiker.' };
    const normalized = normalizePhoneNumber(raw);
    return normalized ? { normalized, reason: '' } : { normalized: '', reason: `Ongeldig telefoonnummer: ${raw}` };
  }

  function getUserFirstName(user) {
    const name = String(user?.name || user?.display_name || user?.full_name || '').trim();
    return name ? name.split(/\s+/)[0] : '';
  }

  function normalizeScheduledVolunteersResponse(payload) {
    for (const value of [payload, payload?.assignments, payload?.volunteers, payload?.scheduledVolunteers,
      payload?.scheduled_volunteers, payload?.data]) if (Array.isArray(value)) return value;
    return [];
  }

  function normalizeScheduledVolunteer(item) {
    const sourceUser = item?.user || item?.volunteer || item?.systemuser || item || {};
    const userId = sourceUser.id ?? sourceUser.user_id ?? item?.userId ?? item?.user_id;
    return { ...sourceUser, id: userId,
      name: sourceUser.name || sourceUser.display_name || sourceUser.full_name || item?.name || item?.volunteer_name || '',
      phone: sourceUser.phone || sourceUser.phone_number || sourceUser.mobile || sourceUser.telefoon || item?.phone || item?.phone_number || item?.mobile || item?.telefoon || '',
      scheduledShift: item };
  }

  function groupScheduledVolunteers(items) {
    const grouped = new Map();
    (Array.isArray(items) ? items : []).map(normalizeScheduledVolunteer).forEach((user) => {
      const phoneInfo = getUserPhoneInfo(user);
      const numericUserId = Number(user.id);
      const validId = Number.isFinite(numericUserId) && numericUserId > 0;
      const fallback = `${phoneInfo.normalized}|${String(user.name || '').trim().toLocaleLowerCase('nl-BE')}`;
      const key = validId ? `id:${numericUserId}` : `fallback:${fallback}`;
      const existing = grouped.get(key);
      if (existing) existing.shifts.push(user.scheduledShift);
      else grouped.set(key, { user, userId: validId ? numericUserId : '', phoneInfo, shifts: [user.scheduledShift] });
    });
    return Array.from(grouped.values());
  }

  function getScheduledShiftDisplayData(shift) {
    const start = shift?.time || shift?.start_time || shift?.startTime || shift?.start || shift?.from || '';
    const end = shift?.end_time || shift?.endTime || shift?.end || shift?.to || '';
    const task = shift?.task || shift?.shift || shift?.task_name || shift?.role || 'Kantinedienst';
    return { start: String(start).slice(0, 5), end: String(end).slice(0, 5), task: String(task).trim() };
  }

  function parseDateKey(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
    if (!match) throw new TypeError(`Invalid date key: ${dateKey}`);
    const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
    if (date.toISOString().slice(0, 10) !== dateKey) throw new TypeError(`Invalid date key: ${dateKey}`);
    return date;
  }

  function formatScheduledMessageDate(dateKey) {
    return new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(parseDateKey(dateKey));
  }

  function buildScheduledVolunteerPlanningText(dateKey, shifts) {
    const dateLabel = formatScheduledMessageDate(dateKey);
    const times = (Array.isArray(shifts) ? shifts : []).map((shift) => {
      const data = getScheduledShiftDisplayData(shift);
      return data.start ? (data.end ? `van ${data.start} tot ${data.end}` : `om ${data.start}`) : '';
    }).filter(Boolean);
    if (!times.length) return dateLabel;
    return times.length === 1 ? `${dateLabel} ${times[0]}` : `${dateLabel} ${times.slice(0, -1).join(', ')} en ${times.at(-1)}`;
  }

  function buildScheduledVolunteerContentVariables({ user, userId, dateKey, shifts }) {
    return { '1': getUserFirstName(user), '2': buildScheduledVolunteerPlanningText(dateKey, shifts), '3': String(userId) };
  }

  function buildAvailabilityContentVariables(user, userId) {
    return { '1': getUserFirstName(user), '2': String(userId) };
  }

  const teamCollator = new Intl.Collator('nl', {
    numeric: true,
    sensitivity: 'base',
  });

  function getParentAvailabilityTeamName(team) {
    return String(team?.teamName || `Ploeg #${team?.teamId ?? ''}`);
  }

  function sortParentAvailabilityTeams(teams) {
    return [...(Array.isArray(teams) ? teams : [])]
      .sort((a, b) => teamCollator.compare(
        getParentAvailabilityTeamName(a),
        getParentAvailabilityTeamName(b),
      ));
  }

  function normalizeParentAvailabilityTeams(payload) {
    const teams = Array.isArray(payload?.teams) ? payload.teams : [];
    const normalizedTeams = teams.map((team) => {
      const seen = new Set();
      const delegates = (Array.isArray(team?.delegates) ? team.delegates : [])
        .filter((delegate) => {
          const userId = Number(delegate?.userId ?? delegate?.authorId);
          const staffId = Number(delegate?.staffId);
          const key = userId > 0 ? `user:${userId}` : staffId > 0 ? `staff:${staffId}` : '';
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'nl-BE'));
      return { ...team, delegates };
    });
    return sortParentAvailabilityTeams(normalizedTeams);
  }

  function getUsersWithSubmittedAvailability(plannerData) {
    const result = new Set();
    for (const schedule of (Array.isArray(plannerData?.schedules) ? plannerData.schedules : [])) {
      for (const task of (Array.isArray(schedule?.tasks) ? schedule.tasks : [])) {
        const title = String(task?.title || '').trim().toLowerCase();
        if (!(title.includes('kantinedienst') || title === 'niet beschikbaar deze maand' || title === 'ik ben niet beschikbaar deze maand')) continue;
        for (const signup of (Array.isArray(task?.signups) ? task.signups : [])) {
          const id = Number(signup?.userId ?? signup?.user_id);
          if (Number.isFinite(id) && id > 0) result.add(id);
        }
      }
    }
    return result;
  }

  function getBrusselsDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('Invalid date');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function addDaysToDateKey(key, days) { const date = parseDateKey(key); date.setUTCDate(date.getUTCDate() + Number(days)); return date.toISOString().slice(0, 10); }
  function getNextMonthKey(key) { const date = parseDateKey(key); date.setUTCMonth(date.getUTCMonth() + 1, 1); return date.toISOString().slice(0, 7); }
  function getDaysUntilMonthEnd(key) { const date = parseDateKey(key); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate() - date.getUTCDate(); }

  return { normalizePhoneNumber, getUserPhoneInfo, getUserFirstName, normalizeScheduledVolunteersResponse,
    normalizeScheduledVolunteer, groupScheduledVolunteers, getScheduledShiftDisplayData, formatScheduledMessageDate,
    buildScheduledVolunteerPlanningText, buildScheduledVolunteerContentVariables, buildAvailabilityContentVariables,
    sortParentAvailabilityTeams, normalizeParentAvailabilityTeams,
    getUsersWithSubmittedAvailability, getBrusselsDateKey, addDaysToDateKey, getNextMonthKey, getDaysUntilMonthEnd };
}));
