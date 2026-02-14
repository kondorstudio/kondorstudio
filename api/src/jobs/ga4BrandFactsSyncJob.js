const { prisma } = require('../prisma');
const { ensureGa4FactMetrics } = require('../services/ga4FactMetricsService');
const { resolveBrandGa4ActivePropertyId } = require('../services/brandGa4SettingsService');
const { ensureBrandGa4Timezone } = require('../services/ga4BrandTimezoneService');
const { upsertBrandGa4Settings } = require('../services/brandGa4SettingsService');
const { buildRollingDateRange } = require('../lib/timezone');

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[ga4BrandFactsSyncJob]', ...args);
}

function toScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object' && typeof value.toString === 'function') {
    return value.toString();
  }
  return value;
}

async function processJob(payload = {}) {
  const tenantId = payload.tenantId;
  const brandId = payload.brandId;
  const days = Math.max(1, Math.min(365, Number(payload.days || 30)));
  const includeCampaigns = payload.includeCampaigns === true;

  if (!tenantId || !brandId) {
    return { ok: false, skipped: true, reason: 'missing_params' };
  }

  const startedAt = Date.now();

  let propertyId = null;
  try {
    propertyId = await resolveBrandGa4ActivePropertyId({ tenantId, brandId });
  } catch (_err) {
    propertyId = null;
  }

  if (!propertyId) {
    return { ok: false, skipped: true, reason: 'property_missing' };
  }

  try {
    await upsertBrandGa4Settings(
      {
        tenantId,
        brandId,
        propertyId,
        lastHistoricalSyncAt: new Date(),
        lastError: null,
        backfillCursor: {
          status: 'RUNNING',
          startedAt: new Date().toISOString(),
          includeCampaigns,
          days,
        },
      },
      { db: prisma },
    );
  } catch (_err) {}

  try {
    const timezone = await ensureBrandGa4Timezone({
      tenantId,
      brandId,
      propertyId: String(propertyId),
    });

    const rolling = buildRollingDateRange({ days, timeZone: timezone });
    if (!rolling?.start || !rolling?.end) {
      return { ok: false, skipped: true, reason: 'date_range_failed' };
    }

    const dateRange = { start: rolling.start, end: rolling.end };
    const metrics = ['sessions', 'leads', 'conversions', 'revenue'];

    await ensureGa4FactMetrics({
      tenantId,
      brandId,
      dateRange,
      metrics,
      dimensions: [],
      filters: [],
      requiredPlatforms: ['GA4'],
    });

    if (includeCampaigns) {
      await ensureGa4FactMetrics({
        tenantId,
        brandId,
        dateRange,
        metrics,
        dimensions: ['campaign_id'],
        filters: [],
        requiredPlatforms: ['GA4'],
      });
    }

    const [aggCount, campaignCount, aggSum] = await Promise.all([
      prisma.factKondorMetricsDaily.count({
        where: {
          tenantId: String(tenantId),
          brandId: String(brandId),
          platform: 'GA4',
          accountId: String(propertyId),
          campaignId: null,
          date: {
            gte: new Date(dateRange.start),
            lte: new Date(dateRange.end),
          },
        },
      }),
      prisma.factKondorMetricsDaily.count({
        where: {
          tenantId: String(tenantId),
          brandId: String(brandId),
          platform: 'GA4',
          accountId: String(propertyId),
          campaignId: { not: null },
          date: {
            gte: new Date(dateRange.start),
            lte: new Date(dateRange.end),
          },
        },
      }),
      prisma.factKondorMetricsDaily.aggregate({
        where: {
          tenantId: String(tenantId),
          brandId: String(brandId),
          platform: 'GA4',
          accountId: String(propertyId),
          campaignId: null,
          date: {
            gte: new Date(dateRange.start),
            lte: new Date(dateRange.end),
          },
        },
        _sum: {
          sessions: true,
          leads: true,
          conversions: true,
          revenue: true,
        },
      }),
    ]);

    const result = {
      ok: true,
      tenantId: String(tenantId),
      brandId: String(brandId),
      propertyId: String(propertyId),
      timezone: rolling.timeZone || timezone || 'UTC',
      dateRange,
      includeCampaigns,
      counts: {
        aggregatedFacts: aggCount,
        campaignFacts: campaignCount,
      },
      totals: {
        sessions: toScalar(aggSum?._sum?.sessions),
        leads: toScalar(aggSum?._sum?.leads),
        conversions: toScalar(aggSum?._sum?.conversions),
        revenue: toScalar(aggSum?._sum?.revenue),
      },
      durationMs: Date.now() - startedAt,
    };

    try {
      await upsertBrandGa4Settings(
        {
          tenantId,
          brandId,
          propertyId,
          lastSuccessAt: new Date(),
          lastError: null,
          backfillCursor: {
            status: 'OK',
            finishedAt: new Date().toISOString(),
            includeCampaigns,
            days,
            dateRange,
            counts: result.counts,
            totals: result.totals,
            durationMs: result.durationMs,
          },
        },
        { db: prisma },
      );
    } catch (_err) {}

    safeLog('completed', result);
    return result;
  } catch (err) {
    const safeError = {
      message: err?.message || String(err),
      code: err?.code || null,
      status: err?.status || null,
    };
    try {
      await upsertBrandGa4Settings(
        {
          tenantId,
          brandId,
          propertyId,
          lastError: safeError,
          backfillCursor: {
            status: 'ERROR',
            at: new Date().toISOString(),
            error: safeError,
            includeCampaigns,
            days,
          },
        },
        { db: prisma },
      );
    } catch (_err) {}
    safeLog('failed', { tenantId, brandId, propertyId, error: safeError });
    throw err;
  }
}

module.exports = {
  processJob,
};

