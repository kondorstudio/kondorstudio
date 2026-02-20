process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

function mockModule(path, exports) {
  const resolved = require.resolve(path);
  require.cache[resolved] = { exports };
}

function resetModule(path) {
  const resolved = require.resolve(path);
  delete require.cache[resolved];
}

test.afterEach(() => {
  [
    '../src/prisma',
    '../src/queues',
    '../src/services/brandGa4SettingsService',
    '../src/modules/metrics/metrics.service',
    '../src/services/ga4PropertyScopeService',
  ].forEach((path) => {
    try {
      resetModule(path);
    } catch (_) {}
  });
});

function loadService({
  brandIds = ['brand-1', 'brand-2'],
  setBrandFailMap = {},
  queueEnabled = true,
  existingJobIds = [],
} = {}) {
  const calls = {
    setBrand: [],
    invalidate: [],
    queueAdd: [],
    queueGetJob: [],
  };

  const brandSet = new Set((brandIds || []).map((item) => String(item)));
  const existingJobs = new Set((existingJobIds || []).map((item) => String(item)));

  mockModule('../src/prisma', {
    prisma: {
      client: {
        findFirst: async ({ where }) => {
          const id = String(where?.id || '');
          if (!brandSet.has(id)) return null;
          return { id };
        },
        findMany: async () =>
          Array.from(brandSet).map((id) => ({
            id,
            createdAt: new Date(),
          })),
      },
    },
  });

  mockModule('../src/services/brandGa4SettingsService', {
    setBrandGa4ActiveProperty: async (payload) => {
      const brandId = String(payload?.brandId || '');
      calls.setBrand.push({ ...payload, brandId });
      const failure = setBrandFailMap[brandId];
      if (failure) {
        const err = new Error(failure.message || 'failed');
        err.code = failure.code || null;
        err.status = failure.status || 500;
        throw err;
      }
      return payload?.propertyId;
    },
  });

  mockModule('../src/modules/metrics/metrics.service', {
    invalidateMetricsCacheForBrand: (tenantId, brandId) => {
      calls.invalidate.push({ tenantId, brandId });
    },
  });

  mockModule('../src/queues', {
    ga4SyncQueue: queueEnabled
      ? {
          getJob: async (jobId) => {
            const id = String(jobId || '');
            calls.queueGetJob.push(id);
            return existingJobs.has(id) ? { id } : null;
          },
          add: async (_name, _data, options = {}) => {
            const jobId = String(options?.jobId || '');
            existingJobs.add(jobId);
            calls.queueAdd.push(jobId);
            return { id: jobId };
          },
        }
      : null,
  });

  resetModule('../src/services/ga4PropertyScopeService');
  const service = require('../src/services/ga4PropertyScopeService');
  return { service, calls };
}

test('applyPropertyScopeSelection with SINGLE_BRAND updates only target brand', async () => {
  const { service, calls } = loadService({
    brandIds: ['brand-1', 'brand-2', 'brand-3'],
  });

  const result = await service.applyPropertyScopeSelection({
    tenantId: 'tenant-1',
    userId: 'user-1',
    propertyId: '123456789',
    brandId: 'brand-2',
    applyMode: 'SINGLE_BRAND',
    syncAfterSelect: false,
  });

  assert.equal(result.scopeApplied, 'SINGLE_BRAND');
  assert.equal(result.affectedBrandsTotal, 1);
  assert.equal(result.affectedBrandsSucceeded, 1);
  assert.equal(result.affectedBrandsFailed, 0);
  assert.equal(calls.setBrand.length, 1);
  assert.equal(calls.setBrand[0].brandId, 'brand-2');
  assert.equal(calls.invalidate.length, 1);
  assert.equal(calls.invalidate[0].brandId, 'brand-2');
});

test('applyPropertyScopeSelection with ALL_BRANDS reports partial failures', async () => {
  const { service } = loadService({
    brandIds: ['brand-1', 'brand-2'],
    setBrandFailMap: {
      'brand-2': {
        message: 'cannot apply',
        code: 'GA4_PROPERTY_NOT_AVAILABLE',
        status: 400,
      },
    },
  });

  const result = await service.applyPropertyScopeSelection({
    tenantId: 'tenant-1',
    userId: 'user-1',
    propertyId: '123456789',
    applyMode: 'ALL_BRANDS',
    syncAfterSelect: false,
  });

  assert.equal(result.scopeApplied, 'ALL_BRANDS');
  assert.equal(result.affectedBrandsTotal, 2);
  assert.equal(result.affectedBrandsSucceeded, 1);
  assert.equal(result.affectedBrandsFailed, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].brandId, 'brand-2');
});

test('applyPropertyScopeSelection queues sync with dedupe by tenant/brand/property', async () => {
  const existingJobId = 'ga4-brand-facts-sync:tenant-1:brand-1:123456789';
  const { service, calls } = loadService({
    brandIds: ['brand-1', 'brand-2'],
    existingJobIds: [existingJobId],
  });

  const result = await service.applyPropertyScopeSelection({
    tenantId: 'tenant-1',
    userId: 'user-1',
    propertyId: '123456789',
    applyMode: 'ALL_BRANDS',
    syncAfterSelect: true,
    includeCampaigns: false,
    syncDays: 30,
  });

  assert.equal(result.affectedBrandsSucceeded, 2);
  assert.equal(result.syncQueuedTotal, 1);
  assert.equal(result.syncSkippedTotal, 1);
  assert.ok(calls.queueGetJob.includes(existingJobId));
  assert.equal(calls.queueAdd.length, 1);
});
