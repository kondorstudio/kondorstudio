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

function delay(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dateKey(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  return parsed.toISOString().slice(0, 10);
}

function buildNaturalKey(input = {}) {
  return [
    String(input.tenantId || ''),
    String(input.brandId || ''),
    String(input.platform || ''),
    String(input.accountId || ''),
    dateKey(input.date),
    String(input.dimensionKey || '__all__'),
  ].join('|');
}

function buildInMemoryFactDb({ jitterMs = 0 } = {}) {
  const rows = new Map();
  let upsertCalls = 0;

  return {
    factKondorMetricsDaily: {
      upsert: async ({ where, create, update }) => {
        upsertCalls += 1;
        if (jitterMs > 0) {
          await delay(Math.floor(Math.random() * jitterMs));
        }

        const keyInput = where?.tenantId_brandId_platform_accountId_date_dimensionKey;
        const key = buildNaturalKey(keyInput || create || {});

        const existing = rows.get(key);
        const merged = existing
          ? {
              ...existing,
              ...update,
              tenantId: keyInput.tenantId,
              brandId: keyInput.brandId,
              platform: keyInput.platform,
              accountId: keyInput.accountId,
              date: keyInput.date,
              dimensionKey: keyInput.dimensionKey,
            }
          : { ...create };

        rows.set(key, merged);
        return merged;
      },
    },
    __rows: rows,
    __upsertCalls: () => upsertCalls,
  };
}

test('reprocessing the same chunk does not duplicate fact rows', async () => {
  mockModule('../src/prisma', { prisma: {} });
  resetModule('../src/services/factMetricsRepository');
  const { upsertFactMetricsDailyRows } = require('../src/services/factMetricsRepository');

  const db = buildInMemoryFactDb();
  const chunk = [
    {
      tenantId: 'tenant-1',
      brandId: 'brand-1',
      platform: 'META_ADS',
      accountId: 'act_123',
      date: '2026-02-10',
      impressions: 100,
      clicks: 10,
      spend: 20,
      conversions: 2,
      revenue: 40,
      campaignId: null,
      adsetId: null,
      adId: null,
      currency: 'BRL',
    },
    {
      tenantId: 'tenant-1',
      brandId: 'brand-1',
      platform: 'META_ADS',
      accountId: 'act_123',
      date: '2026-02-10',
      impressions: 100,
      clicks: 10,
      spend: 20,
      conversions: 2,
      revenue: 40,
      campaignId: null,
      adsetId: null,
      adId: null,
      currency: 'BRL',
    },
    {
      tenantId: 'tenant-1',
      brandId: 'brand-1',
      platform: 'META_ADS',
      accountId: 'act_123',
      date: '2026-02-11',
      impressions: 130,
      clicks: 13,
      spend: 30,
      conversions: 3,
      revenue: 50,
      campaignId: 'cmp-1',
      adsetId: null,
      adId: null,
      currency: 'BRL',
    },
  ];

  const first = await upsertFactMetricsDailyRows(chunk, {
    db,
    forcePrisma: true,
    chunkSize: 2,
  });
  const second = await upsertFactMetricsDailyRows(chunk, {
    db,
    forcePrisma: true,
    chunkSize: 2,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.rows, 2);
  assert.equal(second.rows, 2);
  assert.equal(db.__rows.size, 2);
  assert.equal(db.__upsertCalls(), 4);
});

test('concurrent upserts keep one fact per natural key', async () => {
  mockModule('../src/prisma', { prisma: {} });
  resetModule('../src/services/factMetricsRepository');
  const { upsertFactMetricsDailyRows } = require('../src/services/factMetricsRepository');

  const db = buildInMemoryFactDb({ jitterMs: 10 });

  const firstChunk = [
    {
      tenantId: 'tenant-1',
      brandId: 'brand-1',
      platform: 'GA4',
      accountId: '12345',
      date: '2026-02-12',
      sessions: 55,
      leads: 7,
      conversions: 5,
      revenue: 120,
      spend: 0,
      impressions: 0,
      clicks: 0,
      campaignId: null,
      adsetId: null,
      adId: null,
      currency: 'BRL',
    },
  ];

  const secondChunk = [
    {
      tenantId: 'tenant-1',
      brandId: 'brand-1',
      platform: 'GA4',
      accountId: '12345',
      date: '2026-02-12',
      sessions: 90,
      leads: 9,
      conversions: 8,
      revenue: 180,
      spend: 0,
      impressions: 0,
      clicks: 0,
      campaignId: null,
      adsetId: null,
      adId: null,
      currency: 'BRL',
    },
  ];

  await Promise.all([
    upsertFactMetricsDailyRows(firstChunk, { db, forcePrisma: true }),
    upsertFactMetricsDailyRows(secondChunk, { db, forcePrisma: true }),
  ]);

  assert.equal(db.__rows.size, 1);

  const onlyRow = Array.from(db.__rows.values())[0];
  assert.ok(['55', '90'].includes(String(onlyRow.sessions)));
  assert.ok(['7', '9'].includes(String(onlyRow.leads)));
  assert.ok(['5.000000', '8.000000'].includes(String(onlyRow.conversions)));
  assert.ok(['120.000000', '180.000000'].includes(String(onlyRow.revenue)));
});
