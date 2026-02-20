const { prisma } = require('../prisma');
const { ga4SyncQueue } = require('../queues');
const { setBrandGa4ActiveProperty } = require('./brandGa4SettingsService');
const {
  invalidateMetricsCacheForBrand,
} = require('../modules/metrics/metrics.service');

const APPLY_MODE = Object.freeze({
  LEGACY_INTEGRATION_ONLY: 'LEGACY_INTEGRATION_ONLY',
  SINGLE_BRAND: 'SINGLE_BRAND',
  ALL_BRANDS: 'ALL_BRANDS',
});

const SCOPE_APPLY_CONCURRENCY = Math.max(
  1,
  Number(process.env.GA4_PROPERTY_SCOPE_CONCURRENCY || 8),
);

function logInfo(event, payload = {}) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.info(`[ga4PropertyScopeService] ${event}`, { event, ...payload });
}

function logWarn(event, payload = {}) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.warn(`[ga4PropertyScopeService] ${event}`, { event, ...payload });
}

function normalizeGa4PropertyId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('properties/')) return raw.replace(/^properties\//, '');
  return raw;
}

function normalizeApplyMode(mode) {
  const raw = String(mode || '').trim().toUpperCase();
  if (!raw) return APPLY_MODE.LEGACY_INTEGRATION_ONLY;
  if (raw in APPLY_MODE) return raw;
  const err = new Error('applyMode invalido');
  err.code = 'GA4_PROPERTY_SCOPE_INVALID_APPLY_MODE';
  err.status = 400;
  throw err;
}

function normalizeSyncDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 30;
  return Math.max(1, Math.min(365, Math.floor(n)));
}

function buildJobId({ tenantId, brandId, propertyId }) {
  return `ga4-brand-facts-sync:${String(tenantId)}:${String(brandId)}:${String(propertyId)}`;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return [];
  const limit = Math.max(1, Number(concurrency || 1));
  const results = new Array(safeItems.length);
  let nextIndex = 0;

  async function run() {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= safeItems.length) break;
      // eslint-disable-next-line no-await-in-loop
      results[idx] = await worker(safeItems[idx], idx);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, safeItems.length) }, () => run()),
  );

  return results;
}

async function resolveTargetBrands({ tenantId, brandId, applyMode }) {
  if (applyMode === APPLY_MODE.LEGACY_INTEGRATION_ONLY) {
    return [];
  }

  if (applyMode === APPLY_MODE.SINGLE_BRAND) {
    if (!brandId) {
      const err = new Error('brandId obrigatorio para SINGLE_BRAND');
      err.code = 'GA4_PROPERTY_SCOPE_BRAND_REQUIRED';
      err.status = 400;
      throw err;
    }

    const brand = await prisma.client.findFirst({
      where: {
        id: String(brandId),
        tenantId: String(tenantId),
      },
      select: { id: true },
    });

    if (!brand?.id) {
      const err = new Error('Marca nao encontrada');
      err.code = 'BRAND_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    return [String(brand.id)];
  }

  const brands = await prisma.client.findMany({
    where: {
      tenantId: String(tenantId),
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  return (brands || []).map((item) => String(item.id));
}

async function enqueueBrandSync({
  tenantId,
  userId,
  brandId,
  propertyId,
  syncDays,
  includeCampaigns,
}) {
  if (!ga4SyncQueue) {
    return {
      queued: false,
      skipped: true,
      reason: 'queue_unavailable',
    };
  }

  const jobId = buildJobId({ tenantId, brandId, propertyId });

  try {
    const existing = await ga4SyncQueue.getJob(jobId);
    if (existing) {
      return {
        queued: false,
        skipped: true,
        reason: 'already_queued',
      };
    }

    await ga4SyncQueue.add(
      'ga4-brand-facts-sync',
      {
        tenantId: String(tenantId),
        brandId: String(brandId),
        propertyId: String(propertyId),
        days: normalizeSyncDays(syncDays),
        includeCampaigns: includeCampaigns === true,
        requestedBy: userId ? String(userId) : null,
        trigger: 'property_select',
      },
      {
        jobId,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    );

    logInfo('GA4_PROPERTY_SYNC_ENQUEUED', {
      tenantId: String(tenantId),
      brandId: String(brandId),
      propertyId: String(propertyId),
      jobId,
      includeCampaigns: includeCampaigns === true,
      syncDays: normalizeSyncDays(syncDays),
    });

    return {
      queued: true,
      skipped: false,
      reason: null,
    };
  } catch (error) {
    return {
      queued: false,
      skipped: true,
      reason: error?.code || error?.message || 'queue_failed',
      error,
    };
  }
}

async function applyPropertyScopeSelection({
  tenantId,
  userId,
  propertyId,
  propertyDisplayName,
  brandId,
  applyMode,
  syncAfterSelect,
  includeCampaigns,
  syncDays,
}) {
  const normalizedTenantId = String(tenantId || '').trim();
  const normalizedPropertyId = normalizeGa4PropertyId(propertyId);
  const normalizedBrandId = brandId ? String(brandId) : null;

  if (!normalizedTenantId) {
    const err = new Error('tenantId obrigatorio');
    err.code = 'TENANT_REQUIRED';
    err.status = 400;
    throw err;
  }

  if (!normalizedPropertyId) {
    const err = new Error('propertyId obrigatorio');
    err.code = 'GA4_PROPERTY_REQUIRED';
    err.status = 400;
    throw err;
  }

  const scopeApplied = normalizeApplyMode(applyMode);
  const targetBrandIds = await resolveTargetBrands({
    tenantId: normalizedTenantId,
    brandId: normalizedBrandId,
    applyMode: scopeApplied,
  });

  const failures = [];
  const appliedBrandIds = [];

  if (scopeApplied === APPLY_MODE.SINGLE_BRAND) {
    const targetBrandId = targetBrandIds[0];
    try {
      await setBrandGa4ActiveProperty({
        tenantId: normalizedTenantId,
        brandId: targetBrandId,
        propertyId: normalizedPropertyId,
        externalAccountName: propertyDisplayName || null,
      });
      invalidateMetricsCacheForBrand(normalizedTenantId, targetBrandId);
      appliedBrandIds.push(targetBrandId);
    } catch (error) {
      throw error;
    }
  } else if (scopeApplied === APPLY_MODE.ALL_BRANDS) {
    const results = await mapWithConcurrency(
      targetBrandIds,
      SCOPE_APPLY_CONCURRENCY,
      async (targetBrandId) => {
        try {
          await setBrandGa4ActiveProperty({
            tenantId: normalizedTenantId,
            brandId: targetBrandId,
            propertyId: normalizedPropertyId,
            externalAccountName: propertyDisplayName || null,
          });
          invalidateMetricsCacheForBrand(normalizedTenantId, targetBrandId);
          return { brandId: targetBrandId, ok: true };
        } catch (error) {
          return {
            brandId: targetBrandId,
            ok: false,
            error,
          };
        }
      },
    );

    results.forEach((entry) => {
      if (entry?.ok) {
        appliedBrandIds.push(entry.brandId);
        return;
      }
      failures.push({
        brandId: entry?.brandId || null,
        code: entry?.error?.code || null,
        message: entry?.error?.message || 'Failed to apply property on brand',
      });
    });
  }

  let syncQueuedTotal = 0;
  let syncSkippedTotal = 0;

  if (syncAfterSelect === true && appliedBrandIds.length) {
    const syncResults = await mapWithConcurrency(
      appliedBrandIds,
      SCOPE_APPLY_CONCURRENCY,
      (targetBrandId) =>
        enqueueBrandSync({
          tenantId: normalizedTenantId,
          userId,
          brandId: targetBrandId,
          propertyId: normalizedPropertyId,
          syncDays,
          includeCampaigns,
        }),
    );

    syncResults.forEach((syncResult, index) => {
      const targetBrandId = appliedBrandIds[index];
      if (syncResult?.queued) {
        syncQueuedTotal += 1;
      } else {
        syncSkippedTotal += 1;
        if (syncResult?.reason && syncResult.reason !== 'already_queued') {
          failures.push({
            brandId: targetBrandId || null,
            code: 'GA4_PROPERTY_SYNC_QUEUE_FAILED',
            message: String(syncResult.reason),
          });
        }
      }
    });
  }

  const response = {
    scopeApplied,
    affectedBrandsTotal: targetBrandIds.length,
    affectedBrandsSucceeded: appliedBrandIds.length,
    affectedBrandsFailed: Math.max(0, targetBrandIds.length - appliedBrandIds.length),
    failures,
    syncQueuedTotal,
    syncSkippedTotal,
    appliedBrandIds,
  };

  logInfo('GA4_PROPERTY_SCOPE_APPLIED', {
    tenantId: normalizedTenantId,
    propertyId: normalizedPropertyId,
    applyMode: scopeApplied,
    affectedBrandsTotal: response.affectedBrandsTotal,
    affectedBrandsSucceeded: response.affectedBrandsSucceeded,
    affectedBrandsFailed: response.affectedBrandsFailed,
    syncQueuedTotal,
    syncSkippedTotal,
  });

  if (scopeApplied !== APPLY_MODE.LEGACY_INTEGRATION_ONLY && response.affectedBrandsFailed > 0) {
    logWarn('GA4_PROPERTY_SCOPE_PARTIAL_FAILURE', {
      tenantId: normalizedTenantId,
      propertyId: normalizedPropertyId,
      applyMode: scopeApplied,
      affectedBrandsFailed: response.affectedBrandsFailed,
      failureCount: failures.length,
    });
  }

  return response;
}

module.exports = {
  APPLY_MODE,
  applyPropertyScopeSelection,
  normalizeGa4PropertyId,
};
