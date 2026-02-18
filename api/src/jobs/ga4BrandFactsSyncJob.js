const { prisma } = require('../prisma');
const { ensureGa4FactMetrics } = require('../services/ga4FactMetricsService');
const { resolveBrandGa4ActivePropertyId } = require('../services/brandGa4SettingsService');
const { ensureBrandGa4Timezone } = require('../services/ga4BrandTimezoneService');
const { upsertBrandGa4Settings } = require('../services/brandGa4SettingsService');
const syncRunsService = require('../services/syncRunsService');
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

async function safeUpdateRun(runId, payload) {
  if (!runId) return null;
  try {
    return await syncRunsService.updateRun(runId, payload);
  } catch (_) {
    return null;
  }
}

async function safeCreateChunk(payload) {
  try {
    return await syncRunsService.createChunk(payload);
  } catch (_) {
    return null;
  }
}

async function safeUpdateChunk(chunkId, payload) {
  if (!chunkId) return null;
  try {
    return await syncRunsService.updateChunk(chunkId, payload);
  } catch (_) {
    return null;
  }
}

async function safeRecordError(payload) {
  try {
    return await syncRunsService.recordSyncError(payload);
  } catch (_) {
    return null;
  }
}

async function processJob(payload = {}) {
  const tenantId = payload.tenantId;
  const brandId = payload.brandId;
  const days = Math.max(1, Math.min(365, Number(payload.days || 30)));
  const includeCampaigns = payload.includeCampaigns === true;
  const runId = payload?.runId ? String(payload.runId) : null;
  let chunkId = payload?.chunkId ? String(payload.chunkId) : null;

  if (!tenantId || !brandId) {
    await safeUpdateRun(runId, {
      status: 'FAILED',
      finishedAt: new Date(),
    });
    return { ok: false, skipped: true, reason: 'missing_params' };
  }

  const startedAt = Date.now();

  await safeUpdateRun(runId, {
    status: 'RUNNING',
    startedAt: new Date(),
  });

  if (!chunkId && runId) {
    const createdChunk = await safeCreateChunk({
      runId,
      tenantId: String(tenantId),
      brandId: String(brandId),
      provider: 'GA4',
      status: 'RUNNING',
      chunkKey: `ga4-brand-facts-sync:${String(tenantId)}:${String(brandId)}`,
      startedAt: new Date(),
      meta: {
        includeCampaigns,
        days,
      },
    });
    chunkId = createdChunk?.id || null;
  } else if (chunkId) {
    await safeUpdateChunk(chunkId, {
      status: 'RUNNING',
      startedAt: new Date(),
    });
  }

  let propertyId = null;
  try {
    propertyId = await resolveBrandGa4ActivePropertyId({ tenantId, brandId });
  } catch (_err) {
    propertyId = null;
  }

  if (!propertyId) {
    await safeUpdateChunk(chunkId, {
      status: 'FAILED',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
    });
    await safeUpdateRun(runId, {
      status: 'FAILED',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
    });
    await safeRecordError({
      runId,
      chunkId,
      tenantId: String(tenantId),
      brandId: String(brandId),
      provider: 'GA4',
      providerCode: 'GA4_PROPERTY_MISSING',
      retryable: false,
      message: 'GA4 property não configurada para a marca',
      details: { includeCampaigns, days },
    });
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
      await safeUpdateChunk(chunkId, {
        status: 'FAILED',
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
      });
      await safeUpdateRun(runId, {
        status: 'FAILED',
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
      });
      await safeRecordError({
        runId,
        chunkId,
        tenantId: String(tenantId),
        brandId: String(brandId),
        provider: 'GA4',
        providerCode: 'GA4_DATE_RANGE_FAILED',
        retryable: false,
        message: 'Falha ao resolver date range para backfill GA4',
        details: { includeCampaigns, days },
      });
      return { ok: false, skipped: true, reason: 'date_range_failed' };
    }

    const dateRange = { start: rolling.start, end: rolling.end };
    const metrics = ['sessions', 'leads', 'conversions', 'revenue'];

    const aggregatedSync = await ensureGa4FactMetrics({
      tenantId,
      brandId,
      dateRange,
      metrics,
      dimensions: [],
      filters: [],
      requiredPlatforms: ['GA4'],
    });

    let campaignSync = null;
    if (includeCampaigns) {
      campaignSync = await ensureGa4FactMetrics({
        tenantId,
        brandId,
        dateRange,
        metrics,
        dimensions: ['campaign_id'],
        filters: [],
        requiredPlatforms: ['GA4'],
      });
    }

    const truncated = Boolean(
      aggregatedSync?.meta?.truncated || campaignSync?.meta?.truncated,
    );
    const maxRows =
      campaignSync?.meta?.maxRows ?? aggregatedSync?.meta?.maxRows ?? null;

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
      truncated,
      maxRows,
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

    const rowsWritten = Math.max(0, Number(aggCount || 0)) + Math.max(0, Number(campaignCount || 0));

    await safeUpdateChunk(chunkId, {
      status: 'SUCCESS',
      rowsRead: rowsWritten,
      rowsWritten,
      finishedAt: new Date(),
      durationMs: result.durationMs,
      meta: {
        includeCampaigns,
        days,
        dateRange,
        truncated,
        maxRows,
      },
    });

    await safeUpdateRun(runId, {
      status: 'SUCCESS',
      rowsRead: rowsWritten,
      rowsWritten,
      finishedAt: new Date(),
      durationMs: result.durationMs,
    });

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
          truncated,
          maxRows,
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
    await safeUpdateChunk(chunkId, {
      status: 'FAILED',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
      meta: {
        includeCampaigns,
        days,
      },
    });
    await safeUpdateRun(runId, {
      status: 'FAILED',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
    });
    await safeRecordError({
      runId,
      chunkId,
      tenantId: tenantId ? String(tenantId) : null,
      brandId: brandId ? String(brandId) : null,
      provider: 'GA4',
      providerCode: safeError.code || 'GA4_BACKFILL_FAILED',
      httpStatus: safeError.status || null,
      retryable: false,
      message: safeError.message,
      details: {
        includeCampaigns,
        days,
      },
    });
    safeLog('failed', { tenantId, brandId, propertyId, error: safeError });
    if (runId && err && typeof err === 'object') {
      err.runId = runId;
    }
    throw err;
  }
}

module.exports = {
  processJob,
};
