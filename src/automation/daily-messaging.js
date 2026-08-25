'use strict';
const Core = require('../../shared/jvgh-core');

function log(logger, level, message) { (logger?.[level] || logger?.log || console.log).call(logger || console, message); }
function validUserId(user) { const id = Number(user?.id); return Number.isFinite(id) && id > 0 ? id : null; }

async function sendRecipients({ recipients, type, contentSid, buildVariables, messaging, settings, enabled, logger }) {
  let sent = 0;
  for (const entry of recipients) {
    const user = entry.user || entry;
    const userId = entry.userId || validUserId(user);
    const phoneInfo = entry.phoneInfo || Core.getUserPhoneInfo(user);
    const name = Core.getUserFirstName(user) || '-';
    if (!userId) { log(logger, 'warn', `[JVGH][AUTO][SKIP] type=${type} name=${name} invalid userId`); continue; }
    if (!phoneInfo.normalized) { log(logger, 'warn', `[JVGH][AUTO][SKIP] type=${type} userId=${userId} no valid phone`); continue; }
    if (!enabled) { log(logger, 'log', `[JVGH][AUTO][DRY-RUN] type=${type} userId=${userId} name=${name}`); continue; }
    try {
      const message = await messaging.sendWhatsAppTemplate({ ...settings, to: phoneInfo.normalized, contentSid, contentVariables: buildVariables(entry, userId) });
      sent += 1; log(logger, 'log', `[JVGH][AUTO][SENT] type=${type} userId=${userId} name=${name} sid=${message.sid || '-'}`);
    } catch (error) {
      log(logger, 'error', `[JVGH][AUTO][ERROR] type=${type} userId=${userId} name=${name} code=${error?.code || error?.status || 'unknown'} message=${error?.message || 'send failed'}`);
    }
  }
  return sent;
}

async function runBestuurAvailabilityAutomation({ todayKey, api, messaging, settings, enabled, logger }) {
  const days = Core.getDaysUntilMonthEnd(todayKey);
  if (days > 5) { log(logger, 'log', `[JVGH][AUTO][BESTUUR] ${days} days until month end; no availability action`); return; }
  const month = Core.getNextMonthKey(todayKey);
  const bestuurPayload = await api.getVolunteers('bestuur');
  const bestuur = Array.isArray(bestuurPayload) ? bestuurPayload : (bestuurPayload?.volunteers || []);
  if (days === 5) {
    log(logger, 'log', `[JVGH][AUTO][BESTUUR] initial recipients=${bestuur.length} targetMonth=${month}`);
    await sendRecipients({ recipients: bestuur, type: 'availability-initial', contentSid: settings.contentSid,
      buildVariables: (user, id) => Core.buildAvailabilityContentVariables(user, id), messaging, settings, enabled, logger });
    return;
  }
  const plannerData = await api.getPlannerMonthData(month);
  const submitted = Core.getUsersWithSubmittedAvailability(plannerData);
  const missing = bestuur.filter((user) => { const id = validUserId(user); return id && !submitted.has(id); });
  log(logger, 'log', `[JVGH][AUTO][BESTUUR] ${missing.length} reminders required targetMonth=${month}`);
  await sendRecipients({ recipients: missing, type: 'availability-reminder', contentSid: settings.reminderContentSid,
    buildVariables: (user, id) => Core.buildAvailabilityContentVariables(user, id), messaging, settings, enabled, logger });
}

async function runTomorrowScheduledAutomation({ todayKey, api, messaging, settings, enabled, logger }) {
  const tomorrow = Core.addDaysToDateKey(todayKey, 1);
  const payload = await api.getScheduledVolunteers(tomorrow);
  const recipients = Core.groupScheduledVolunteers(Core.normalizeScheduledVolunteersResponse(payload));
  log(logger, 'log', `[JVGH][AUTO][SCHEDULED] ${recipients.length} people scheduled for ${tomorrow}`);
  await sendRecipients({ recipients, type: 'scheduled', contentSid: settings.scheduledContentSid,
    buildVariables: (entry) => Core.buildScheduledVolunteerContentVariables({ user: entry.user, userId: entry.userId, dateKey: tomorrow, shifts: entry.shifts }),
    messaging, settings, enabled, logger });
}

async function runDailyMessagingAutomation({ now = new Date(), api, messaging, logger = console, enabled = false, settings = {} }) {
  const todayKey = Core.getBrusselsDateKey(now);
  if (!enabled) log(logger, 'log', '[JVGH][AUTO] automation disabled - no messages sent');
  const results = await Promise.allSettled([
    runBestuurAvailabilityAutomation({ todayKey, api, messaging, settings, enabled, logger }),
    runTomorrowScheduledAutomation({ todayKey, api, messaging, settings, enabled, logger }),
  ]);
  results.forEach((result, index) => { if (result.status === 'rejected') log(logger, 'error', `[JVGH][AUTO][ERROR] part=${index + 1} message=${result.reason?.message || result.reason}`); });
  return { todayKey, results };
}
module.exports = { runDailyMessagingAutomation, runBestuurAvailabilityAutomation, runTomorrowScheduledAutomation };
