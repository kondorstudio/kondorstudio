const { prisma } = require('../prisma');
const ga4DataService = require('../services/ga4DataService');
const { resolveGa4IntegrationContext } = require('../services/ga4IntegrationResolver');

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[ga4RealtimeSyncJob]', ...args);
}

function parseCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function pollOnce() {
  const maxProperties = Math.max(0, Number(process.env.GA4_REALTIME_SYNC_MAX_PROPERTIES_PER_RUN || 0));
  const cacheTtlMs = Number(process.env.GA4_REALTIME_SYNC_CACHE_TTL_MS || process.env.GA4_REALTIME_CACHE_TTL_MS || 15_000);

  const metrics = parseCsv(process.env.GA4_REALTIME_SYNC_METRICS);
  const dimensions = parseCsv(process.env.GA4_REALTIME_SYNC_DIMENSIONS);

  const payload = {
    metrics: metrics.length ? metrics : ['activeUsers'],
    ...(dimensions.length ? { dimensions } : {}),
    minuteRange: { type: 'LAST_30_MINUTES' },
  };

  const targets = await prisma.brandSourceConnection.findMany({
    where: {
      platform: 'GA4',
      status: 'ACTIVE',
    },
    distinct: ['tenantId', 'externalAccountId'],
    select: {
      tenantId: true,
      externalAccountId: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const slice = maxProperties > 0 ? targets.slice(0, maxProperties) : targets;
  if (!slice.length) return { ok: true, processed: 0, errors: 0, skipped: true };

  let processed = 0;
  let errors = 0;
  let skippedNoIntegration = 0;
  let skippedInvalidProperty = 0;
  const skippedSamples = [];

  safeLog('starting', { properties: slice.length, payload, cacheTtlMs });

  for (const target of slice) {
    const propertyId = String(target.externalAccountId || '').replace(/^properties\//, '');
    if (!propertyId) {
      skippedInvalidProperty += 1;
      continue;
    }

    try {
      // Resolve which GA4 OAuth integration userId should be used for this property.
      // eslint-disable-next-line no-await-in-loop
      const resolved = await resolveGa4IntegrationContext({
        tenantId: target.tenantId,
        propertyId,
        integrationId: null,
        userId: null,
      });

      // eslint-disable-next-line no-await-in-loop
      await ga4DataService.runRealtimeReport({
        tenantId: target.tenantId,
        userId: resolved.userId,
        propertyId,
        payload,
        cacheTtlMs,
        skipSelectionCheck: true,
        rateKey: `job:${target.tenantId}:${propertyId}`,
      });

      processed += 1;
    } catch (err) {
      const code = String(err?.code || '').trim().toUpperCase();
      if (code === 'GA4_INTEGRATION_NOT_CONNECTED' || code === 'GA4_PROPERTY_NOT_SELECTED') {
        skippedNoIntegration += 1;
        if (skippedSamples.length < 5) {
          skippedSamples.push({
            tenantId: target.tenantId,
            propertyId: target.externalAccountId,
            code,
          });
        }
        continue;
      }

      errors += 1;
      safeLog('sync error', {
        tenantId: target.tenantId,
        propertyId: target.externalAccountId,
        message: err?.message || String(err),
        code: err?.code || null,
      });
    }
  }

  safeLog('finished', {
    processed,
    errors,
    skippedNoIntegration,
    skippedInvalidProperty,
    ...(skippedSamples.length ? { skippedSamples } : {}),
  });
  return {
    ok: true,
    processed,
    errors,
    skippedNoIntegration,
    skippedInvalidProperty,
  };
}

module.exports = {
  pollOnce,
};
