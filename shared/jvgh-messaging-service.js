'use strict';
const twilio = require('twilio');

async function sendWhatsAppTemplate({ accountSid, authToken, from, to, contentSid, contentVariables, twilioFactory = twilio }) {
  const destination = String(to || '').toLowerCase().startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  if (![accountSid, authToken, from, to, contentSid].every((value) => String(value || '').trim())) throw new Error('Missing required Twilio template setting.');
  return twilioFactory(accountSid, authToken).messages.create({ from, to: destination, contentSid, contentVariables: JSON.stringify(contentVariables || {}) });
}
module.exports = { sendWhatsAppTemplate };
