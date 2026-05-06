const express = require('express');
const path = require('path');
const twilio = require('twilio');

const app = express();
const port = Number(process.env.PORT || 8080);

app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/send-availability-whatsapp', async (req, res) => {
  const accountSid = String(req.body?.accountSid || process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(req.body?.authToken || process.env.TWILIO_AUTH_TOKEN || '').trim();

  if (!accountSid || !authToken) {
    return res.status(400).json({ ok: false, error: 'Missing Twilio credentials: accountSid and authToken.' });
  }

  try {
    const from = String(req.body?.from || '').trim();
    const contentSid = String(req.body?.contentSid || '').trim();
    const contentVariablesRaw = String(req.body?.contentVariables || '').trim();
    const to = String(req.body?.to || '').trim();

    if (!from || !contentSid || !contentVariablesRaw || !to) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: from, contentSid, contentVariables, to.' });
    }

    let parsedVariables;
    try {
      parsedVariables = JSON.parse(contentVariablesRaw);
    } catch (_error) {
      return res.status(400).json({ ok: false, error: 'contentVariables must be valid JSON.' });
    }

    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      from,
      contentSid,
      contentVariables: JSON.stringify(parsedVariables),
      to,
    });

    return res.json({ ok: true, sid: message.sid });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Failed to send WhatsApp message.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`JVGH app running on http://localhost:${port}`);
});
