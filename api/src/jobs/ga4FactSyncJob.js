const { prisma } = require('../prisma');
const { ensureGa4FactMetrics } = require('../services/ga4FactMetricsService');

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[ga4FactSyncJob]', ...args);
}

function formatDateOnly(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function buildRollingDateRange(days) {
  const windowDays = Math.max(1, Number(days) || 1);
  const end = new Date();
  const start = new Date(end);
  // Include "today" as the end of the window.
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  return {
    start: formatDateOnly(start),
    end: formatDateOnly(end),
    days: windowDays,
  };
}

async function pollOnce() {
  const { start, end, days } = buildRollingDateRange(process.env.GA4_FACT_SYNC_DAYS || 30);
  if (!start || !end) return false;

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

  const dateRange = { start, end };
  const metrics = ['sessions', 'leads', 'conversions', 'revenue'];

  let processed = 0;
  let errors = 0;

  safeLog('starting', { brands: slice.length, dateRange, days });

  for (const target of slice) {
    try {
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

  safeLog('finished', { processed, errors, dateRange });
  return { ok: true, processed, errors, dateRange };
}

module.exports = {
  pollOnce,
};

