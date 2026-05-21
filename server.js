const express = require('express');
const path = require('path');
const twilio = require('twilio');

const app = express();
const port = Number(process.env.PORT || 8080);
const wpSettingsUrl = process.env.WP_WHATSAPP_SETTINGS_URL || 'https://jeugdherk.be/wp-json/jvgh/v1/whatsapp-settings';
const wpVolunteersUrl = process.env.WP_VOLUNTEERS_URL || 'https://jeugdherk.be/wp-json/jvgh/v1/volunteers';

app.use(express.json());
app.use(express.static(__dirname));

function getWpAuthHeader() {
  const user = process.env.WP_API_USER || '';
  const appPassword = process.env.WP_API_APP_PASSWORD || '';
  if (!user || !appPassword) return null;
  const encoded = Buffer.from(`${user}:${appPassword}`).toString('base64');
  return `Basic ${encoded}`;
}

async function fetchWpWhatsAppSettings() {
  const headers = {};
  const authHeader = getWpAuthHeader();
  if (authHeader) headers.Authorization = authHeader;
  const res = await fetch(wpSettingsUrl, { headers });
  if (!res.ok) throw new Error(`WordPress settings fetch failed: HTTP ${res.status}`);
  return res.json();
}

async function fetchWpUserDetails(userId) {
  const headers = {};
  const authHeader = getWpAuthHeader();
  if (authHeader) headers.Authorization = authHeader;
  headers.Accept = 'application/json';

  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const endpoints = [
    `https://jeugdherk.be/wp-json/wp/v2/users/${id}?context=edit`,
    `https://jeugdherk.be/wp-json/wp/v2/users/${id}`,
    `https://jeugdherk.be/wp-json/wp/v2/users?include=${id}&per_page=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const data = await res.json();
      return Array.isArray(data) ? (data[0] || null) : data;
    } catch (_error) {
      // Try the next endpoint
    }
  }
  return null;
}

app.get('/api/volunteers', async (req, res) => {
  try {
    const role = String(req.query?.role || '').trim();
    const url = role ? `${wpVolunteersUrl}?role=${encodeURIComponent(role)}` : wpVolunteersUrl;

    const headers = {};
    const authHeader = getWpAuthHeader();
    if (authHeader) headers.Authorization = authHeader;
    const volunteersRes = await fetch(url, { headers });
    if (!volunteersRes.ok) {
      return res.status(volunteersRes.status).json({ ok: false, error: `WordPress volunteers fetch failed: HTTP ${volunteersRes.status}` });
    }
    const volunteers = await volunteersRes.json();
    if (!Array.isArray(volunteers)) return res.json([]);

    const enriched = await Promise.all(volunteers.map(async (user) => {
      const wpUser = await fetchWpUserDetails(user?.id);
      return {
        ...user,
        systemuser: wpUser || null,
      };
    }));

    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Failed to load volunteers.' });
  }
});

app.get('/api/whatsapp-settings', async (_req, res) => {
  try {
    const data = await fetchWpWhatsAppSettings();
    return res.json({ ok: true, settings: data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Failed to load WhatsApp settings.' });
  }
});

app.post('/api/whatsapp-settings', async (req, res) => {
  try {
    const headers = { 'Content-Type': 'application/json' };
    const authHeader = getWpAuthHeader();
    if (authHeader) headers.Authorization = authHeader;
    const wpRes = await fetch(wpSettingsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body || {}),
    });
    const data = await wpRes.json();
    if (!wpRes.ok) {
      return res.status(wpRes.status).json({ ok: false, error: data?.message || `WordPress save failed: HTTP ${wpRes.status}` });
    }
    return res.json({ ok: true, settings: data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Failed to save WhatsApp settings.' });
  }
});

app.post('/api/send-availability-whatsapp', async (req, res) => {
  try {
    const settings = (await fetchWpWhatsAppSettings()) || {};
    const accountSid = String(req.body?.accountSid || settings.accountSid || '').trim();
    const authToken = String(req.body?.authToken || settings.authToken || process.env.TWILIO_AUTH_TOKEN || '').trim();
    const from = String(req.body?.from || settings.from || '').trim();
    const contentSid = String(req.body?.contentSid || settings.contentSid || '').trim();
    const to = String(req.body?.to || '').trim();
    const firstName = String(req.body?.firstName || '').trim();
    const userId = String(req.body?.userId || '').trim();

    if (!to || !firstName || !userId || !accountSid || !authToken || !from || !contentSid) {
      return res.status(400).json({ ok: false, error: 'Missing required fields in payload/settings.' });
    }

    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      from,
      contentSid,
      contentVariables: JSON.stringify({
        "1": firstName,
        "2": userId,
      }),
      to,
    });

    return res.json({ ok: true, sid: message.sid });
  } catch (error) {
    const code = error && (error.code || error.status);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to send WhatsApp message.',
      code: code || null,
      moreInfo: error?.moreInfo || null,
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`JVGH app running on http://localhost:${port}`);
});
