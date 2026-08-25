'use strict';
const { app } = require('@azure/functions');
const { createJvghApiClient } = require('../../shared/jvgh-server-api');
const messaging = require('../../shared/jvgh-messaging-service');
const { runDailyMessagingAutomation } = require('../automation/daily-messaging');

async function dailyMessaging(_timer, context) {
  const api = createJvghApiClient({ baseUrl: process.env.JVGH_BASE_URL || 'https://jeugdherk.be', username: process.env.WP_API_USER, appPassword: process.env.WP_API_APP_PASSWORD });
  let wordpress = {};
  try { wordpress = await api.getWhatsAppSettings() || {}; } catch (error) { context.warn(`[JVGH][AUTO] WhatsApp settings unavailable; environment fallback used: ${error.message}`); }
  const settings = {
    accountSid: wordpress.accountSid || process.env.TWILIO_ACCOUNT_SID,
    authToken: wordpress.authToken || process.env.TWILIO_AUTH_TOKEN,
    from: wordpress.from || process.env.TWILIO_WHATSAPP_FROM,
    contentSid: wordpress.contentSid || process.env.TWILIO_CONTENT_SID,
    reminderContentSid: wordpress.reminderContentSid || process.env.TWILIO_REMINDER_CONTENT_SID,
    scheduledContentSid: wordpress.scheduledContentSid || process.env.TWILIO_SCHEDULED_CONTENT_SID,
  };
  return runDailyMessagingAutomation({ api, messaging, logger: context, enabled: process.env.JVGH_AUTOMATION_ENABLED === 'true', settings });
}
app.timer('dailyMessaging', { schedule: '%JVGH_DAILY_SCHEDULE%', runOnStartup: false, handler: dailyMessaging });
module.exports = { dailyMessaging };
