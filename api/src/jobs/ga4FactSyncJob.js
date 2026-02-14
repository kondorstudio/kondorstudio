const { prisma } = require('../prisma');
const { ensureGa4FactMetrics } = require('../services/ga4FactMetricsService');
const { resolveBrandGa4ActivePropertyId } = require('../services/brandGa4SettingsService');
const { ensureBrandGa4Timezone } = require('../services/ga4BrandTimezoneService');
const { buildRollingDateRange } = require('../lib/timezone');

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[ga4FactSyncJob]', ...args);
}

async function pollOnce() {
  const days = Math.max(1, Number(process.env.GA4_FACT_SYNC_DAYS || 30));
  const maxBrands = Math.max(0, Number(process.env.GA4_FACT_SYNC_MAX_BRANDS_PER_RUN || 0));

  const targets = await prisma.brandSourceConnection.findMany({
    where: {
      platform: 'GA4',
      status: 'ACTIVE',
    },
    distinct: ['tenantId', 'brandId'],
    select: {
      tenantId: true,
      brandId: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const slice = maxBrands > 0 ? targets.slice(0, maxBrands) : targets;
  if (!slice.length) return { ok: true, processed: 0, errors: 0, skipped: true };

  const metrics = ['sessions', 'leads', 'conversions', 'revenue'];

  let processed = 0;
  let errors = 0;

  safeLog('starting', { brands: slice.length, days });

  for (const target of slice) {
    try {
      // Resolve active GA4 property and timezone for the brand so the date range matches GA4 UI.
      // eslint-disable-next-line no-await-in-loop
      const propertyId = await resolveBrandGa4ActivePropertyId({
        tenantId: target.tenantId,
        brandId: target.brandId,
      });
      if (!propertyId) continue;

      // eslint-disable-next-line no-await-in-loop
      const timeZone = await ensureBrandGa4Timezone({
        tenantId: target.tenantId,
        brandId: target.brandId,
        propertyId,
      });

      const rolling = buildRollingDateRange({ days, timeZone });
      if (!rolling?.start || !rolling?.end) continue;
      const dateRange = { start: rolling.start, end: rolling.end };

      // eslint-disable-next-line no-await-in-loop
      await ensureGa4FactMetrics({
        tenantId: target.tenantId,
        brandId: target.brandId,
        dateRange,
        metrics,
        dimensions: [],
        filters: [],
        requiredPlatforms: ['GA4'],
      });
      processed += 1;
    } catch (err) {
      errors += 1;
      safeLog('sync error', {
        tenantId: target.tenantId,
        brandId: target.brandId,
        message: err?.message || String(err),
        code: err?.code || null,
      });
    }
  }

  safeLog('finished', { processed, errors });
  return { ok: true, processed, errors };
}

module.exports = {
  pollOnce,
};
