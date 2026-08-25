'use strict';

const { app } = require('@azure/functions');
const { dailyMessaging } = require('./dailyMessaging');

async function dailyMessagingManual(_request, context) {
  context.log('[JVGH][MANUAL] Manual dailyMessaging run started');

  try {
    const result = await dailyMessaging(null, context);

    context.log('[JVGH][MANUAL] Manual dailyMessaging run completed');

    return {
      status: 200,
      jsonBody: {
        ok: true,
        message: 'dailyMessaging succesvol uitgevoerd',
        result: result ?? null,
      },
    };
  } catch (error) {
    context.error('[JVGH][MANUAL] dailyMessaging failed', error);

    return {
      status: 500,
      jsonBody: {
        ok: false,
        message: 'dailyMessaging is mislukt',
        error: error?.message || String(error),
      },
    };
  }
}

app.http('dailyMessagingManual', {
  methods: ['POST'],
  authLevel: 'function',
  handler: dailyMessagingManual,
});

module.exports = { dailyMessagingManual };
