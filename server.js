'use strict';
const express = require('express');
const path = require('path');
const { createJvghApiClient } = require('./shared/jvgh-server-api');
const { sendWhatsAppTemplate } = require('./shared/jvgh-messaging-service');
const Core = require('./shared/jvgh-core');

const app = express();
const port = Number(process.env.PORT || 8080);
const api = createJvghApiClient({ baseUrl: process.env.JVGH_BASE_URL || 'https://jeugdherk.be', username: process.env.WP_API_USER, appPassword: process.env.WP_API_APP_PASSWORD });
app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/volunteers', async (req, res) => {
  try {
    const volunteers = await api.getVolunteers(String(req.query?.role || '').trim());
    if (!Array.isArray(volunteers)) return res.json([]);
    const enriched = await Promise.all(volunteers.map(async (user) => ({ ...user, systemuser: await api.getUserDetails(user?.id) })));
    res.json(enriched);
  } catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message }); }
});
app.get('/api/whatsapp-settings', async (_req, res) => {
  try { res.json({ ok: true, settings: await api.getWhatsAppSettings() }); }
  catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message }); }
});
app.post('/api/whatsapp-settings', async (req, res) => {
  try { res.json({ ok: true, settings: await api.saveWhatsAppSettings(req.body) }); }
  catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message }); }
});
app.post('/api/send-availability-whatsapp', async (req, res) => {
  try {
    const wp = await api.getWhatsAppSettings() || {};
    const variables = req.body?.contentVariables || Core.buildAvailabilityContentVariables({ name: req.body?.firstName }, req.body?.userId);
    const message = await sendWhatsAppTemplate({
      accountSid: req.body?.accountSid || wp.accountSid || process.env.TWILIO_ACCOUNT_SID,
      authToken: req.body?.authToken || wp.authToken || process.env.TWILIO_AUTH_TOKEN,
      from: req.body?.from || wp.from || process.env.TWILIO_WHATSAPP_FROM,
      to: req.body?.to,
      contentSid: req.body?.contentSid || wp.contentSid || process.env.TWILIO_CONTENT_SID,
      contentVariables: variables,
    });
    res.json({ ok: true, sid: message.sid });
  } catch (error) { res.status(500).json({ ok: false, error: error.message, code: error?.code || error?.status || null, moreInfo: error?.moreInfo || null }); }
});
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(port, () => console.log(`JVGH app running on http://localhost:${port}`));
