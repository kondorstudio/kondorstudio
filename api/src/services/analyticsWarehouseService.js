const crypto = require('crypto');
const { prisma } = require('../prisma');

const WAREHOUSE_STAR_SYNC_DISABLED =
  process.env.WAREHOUSE_STAR_SYNC_DISABLED === 'true' || process.env.NODE_ENV === 'test';

const LEGACY_METRIC_KEYS = [
  'impressions',
  'clicks',
  'spend',
  'conversions',
  'revenue',
  'sessions',
  'leads',
];

const METRIC_DEFINITIONS = {
  impressions: { label: 'Impressions', unit: 'count', aggregation: 'sum' },
  clicks: { label: 'Clicks', unit: 'count', aggregation: 'sum' },
  spend: { label: 'Spend', unit: 'currency', aggregation: 'sum' },
  conversions: { label: 'Conversions', unit: 'count', aggregation: 'sum' },
  revenue: { label: 'Revenue', unit: 'currency', aggregation: 'sum' },
  sessions: { label: 'Sessions', unit: 'count', aggregation: 'sum' },
  leads: { label: 'Leads', unit: 'count', aggregation: 'sum' },
};

const DEFAULT_DIMENSION_KEY = '__all__';

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[analyticsWarehouseService]', ...args);
}

function hasWarehouseModels(db = prisma) {
  return Boolean(
    db &&
      db.dimProvider &&
      db.dimMetric &&
      db.dimDimensionValue &&
      db.factDailyMetric &&
      typeof db.dimProvider.findMany === 'function' &&
      typeof db.factDailyMetric.upsert === 'function',
  );
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function sanitizeValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([key, entry]) => {
      out[key] = sanitizeValue(entry);
    });
    return out;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  return String(value);
}

function stableStringify(value) {
  const normalized = sanitizeValue(value);

  const encode = (entry) => {
    if (entry === null) return 'null';
    if (Array.isArray(entry)) return `[${entry.map((item) => encode(item)).join(',')}]`;
    if (typeof entry === 'object') {
      const keys = Object.keys(entry).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(entry[key])}`).join(',')}}`;
    }
    return JSON.stringify(entry);
  };

  return encode(normalized);
}

function buildDimensionKey(payload = {}) {
  const normalized = sanitizeValue(payload);
  if (!normalized || typeof normalized !== 'object' || !Object.keys(normalized).length) {
    return DEFAULT_DIMENSION_KEY;
  }
  const hash = crypto.createHash('sha1').update(stableStringify(normalized)).digest('hex');
  return `dim:${hash}`;
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.toISOString().slice(0, 10));
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.toISOString().slice(0, 10));
}

function normalizeProviderKey(value) {
  const text = toText(value);
  return text ? text.toUpperCase() : null;
}

function normalizeMetricKey(value) {
  const text = toText(value);
  return text ? text.toLowerCase() : null;
}

function toDecimalInput(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return raw;
}

function normalizeDimensionPayload(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  Object.entries(raw).forEach(([key, entry]) => {
    const cleanKey = toText(key);
    if (!cleanKey) return;
    const cleanValue = sanitizeValue(entry);
    if (cleanValue === null || cleanValue === '') return;
    normalized[cleanKey] = cleanValue;
  });
  return normalized;
}

function normalizeConnectorFact(fact = {}, defaults = {}) {
  const provider = normalizeProviderKey(fact.provider || defaults.provider);
  const metricKey = normalizeMetricKey(fact.metric || fact.name || fact.metricKey);
  const date = toDateOnly(fact.date || fact.collectedAt);
  const metricValue = toDecimalInput(fact.value);

  if (!provider || !metricKey || !date || metricValue === null) return null;

  const dimensionPayload = normalizeDimensionPayload(fact.dimensions || fact.dimension || {});
  const dimensionKey = buildDimensionKey(dimensionPayload);

  return {
    tenantId: toText(fact.tenantId || defaults.tenantId),
    brandId: toText(fact.brandId || defaults.brandId),
    provider,
    metricKey,
    date,
    metricValue,
    currency: toText(fact.currency || defaults.currency),
    sourceSystem: toText(fact.sourceSystem || defaults.sourceSystem || provider),
    sourceFactId: toText(fact.sourceFactId || null),
    dimensionKey,
    dimensionPayload,
  };
}

async function ensureProviders(db, providerKeys = []) {
  const keys = Array.from(new Set((providerKeys || []).filter(Boolean)));
  if (!keys.length) return new Map();

  const existing = await db.dimProvider.findMany({
    where: { providerKey: { in: keys } },
    select: { id: true, providerKey: true },
  });

  const existingKeys = new Set(existing.map((item) => item.providerKey));
  const missing = keys.filter((key) => !existingKeys.has(key));
  if (missing.length) {
    await db.dimProvider.createMany({
      data: missing.map((key) => ({ providerKey: key, label: key })),
      skipDuplicates: true,
    });
  }

  const all = await db.dimProvider.findMany({
    where: { providerKey: { in: keys } },
    select: { id: true, providerKey: true },
  });
  return new Map(all.map((item) => [item.providerKey, item.id]));
}

async function ensureMetrics(db, metricKeys = []) {
  const keys = Array.from(new Set((metricKeys || []).filter(Boolean)));
  if (!keys.length) return new Map();

  const existing = await db.dimMetric.findMany({
    where: { metricKey: { in: keys } },
    select: { id: true, metricKey: true },
  });

  const existingKeys = new Set(existing.map((item) => item.metricKey));
  const missing = keys.filter((key) => !existingKeys.has(key));
  if (missing.length) {
    await db.dimMetric.createMany({
      data: missing.map((key) => ({
        metricKey: key,
        label: METRIC_DEFINITIONS[key]?.label || key,
        unit: METRIC_DEFINITIONS[key]?.unit || null,
        aggregation: METRIC_DEFINITIONS[key]?.aggregation || 'sum',
      })),
      skipDuplicates: true,
    });
  }

  const all = await db.dimMetric.findMany({
    where: { metricKey: { in: keys } },
    select: { id: true, metricKey: true },
  });
  return new Map(all.map((item) => [item.metricKey, item.id]));
}

async function ensureDimensionValues(db, rows = []) {
  const payloadByKey = new Map();
  (rows || []).forEach((row) => {
    if (!row?.dimensionKey) return;
    if (payloadByKey.has(row.dimensionKey)) return;
    payloadByKey.set(row.dimensionKey, row.dimensionPayload || {});
  });

  const keys = Array.from(payloadByKey.keys());
  if (!keys.length) return new Map();

  const existing = await db.dimDimensionValue.findMany({
    where: { dimensionKey: { in: keys } },
    select: { id: true, dimensionKey: true },
  });

  const existingKeys = new Set(existing.map((item) => item.dimensionKey));
  const missing = keys.filter((key) => !existingKeys.has(key));
  if (missing.length) {
    await db.dimDimensionValue.createMany({
      data: missing.map((key) => ({
        dimensionKey: key,
        payload: payloadByKey.get(key) || {},
      })),
      skipDuplicates: true,
    });
  }

  const all = await db.dimDimensionValue.findMany({
    where: { dimensionKey: { in: keys } },
    select: { id: true, dimensionKey: true },
  });
  return new Map(all.map((item) => [item.dimensionKey, item.id]));
}

async function upsertConnectorFacts(payload = {}, options = {}) {
  const db = options.db || prisma;
  if (WAREHOUSE_STAR_SYNC_DISABLED) {
    return { ok: false, skipped: true, reason: 'warehouse_star_sync_disabled', rows: 0 };
  }
  if (!hasWarehouseModels(db)) {
    return { ok: false, skipped: true, reason: 'warehouse_models_unavailable', rows: 0 };
  }

  const tenantId = toText(payload.tenantId);
  const brandId = toText(payload.brandId);
  if (!tenantId || !brandId) {
    return { ok: false, skipped: true, reason: 'tenant_or_brand_missing', rows: 0 };
  }

  const facts = Array.isArray(payload.facts) ? payload.facts : [];
  if (!facts.length) {
    return { ok: true, rows: 0, written: 0 };
  }

  const normalized = facts
    .map((fact) => normalizeConnectorFact(fact, {
      tenantId,
      brandId,
      provider: payload.provider,
      sourceSystem: payload.sourceSystem,
      currency: payload.currency,
    }))
    .filter(Boolean);

  if (!normalized.length) {
    return { ok: true, rows: facts.length, written: 0 };
  }

  const providerMap = await ensureProviders(
    db,
    normalized.map((row) => row.provider),
  );
  const metricMap = await ensureMetrics(
    db,
    normalized.map((row) => row.metricKey),
  );
  const dimensionMap = await ensureDimensionValues(db, normalized);

  let written = 0;
  for (const row of normalized) {
    const providerId = providerMap.get(row.provider);
    const metricId = metricMap.get(row.metricKey);
    const dimensionValueId = dimensionMap.get(row.dimensionKey);
    if (!providerId || !metricId || !dimensionValueId) continue;

    try {
      // eslint-disable-next-line no-await-in-loop
      await db.factDailyMetric.upsert({
        where: {
          tenantId_brandId_date_providerId_metricId_dimensionValueId: {
            tenantId,
            brandId,
            date: row.date,
            providerId,
            metricId,
            dimensionValueId,
          },
        },
        update: {
          metricValue: row.metricValue,
          currency: row.currency,
          sourceSystem: row.sourceSystem,
          sourceFactId: row.sourceFactId,
          loadedAt: new Date(),
        },
        create: {
          tenantId,
          brandId,
          date: row.date,
          providerId,
          metricId,
          dimensionValueId,
          metricValue: row.metricValue,
          currency: row.currency,
          sourceSystem: row.sourceSystem,
          sourceFactId: row.sourceFactId,
        },
      });
      written += 1;
    } catch (err) {
      safeLog('upsertConnectorFacts row failed (ignored)', err?.code || err?.message || err);
    }
  }

  return {
    ok: true,
    rows: facts.length,
    normalized: normalized.length,
    written,
  };
}

function mapLegacyFactRowsToConnectorFacts(rows = [], sourceSystem = null) {
  const facts = [];

  (rows || []).forEach((row) => {
    if (!row) return;
    const dimensionPayload = normalizeDimensionPayload({
      accountId: row.accountId || null,
      campaignId: row.campaignId || null,
      adsetId: row.adsetId || null,
      adId: row.adId || null,
    });

    LEGACY_METRIC_KEYS.forEach((metricKey) => {
      const value = row[metricKey];
      if (value === null || value === undefined) return;

      facts.push({
        tenantId: row.tenantId,
        brandId: row.brandId,
        provider: row.platform,
        date: row.date,
        metric: metricKey,
        value,
        currency: row.currency || null,
        sourceSystem: sourceSystem || row.platform,
        sourceFactId: row.id || null,
        dimensions: dimensionPayload,
      });
    });
  });

  return facts;
}

async function upsertLegacyFactRows(payload = {}, options = {}) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) return { ok: true, rows: 0, written: 0 };

  const facts = mapLegacyFactRowsToConnectorFacts(rows, payload.sourceSystem || null);
  if (!facts.length) {
    return { ok: true, rows: rows.length, written: 0 };
  }

  return upsertConnectorFacts(
    {
      tenantId: payload.tenantId,
      brandId: payload.brandId,
      facts,
      sourceSystem: payload.sourceSystem || null,
    },
    options,
  );
}

async function projectLegacyFactsByRange(payload = {}, options = {}) {
  const db = options.db || prisma;
  if (!db?.factKondorMetricsDaily || typeof db.factKondorMetricsDaily.findMany !== 'function') {
    return { ok: false, skipped: true, reason: 'legacy_fact_model_unavailable' };
  }

  const tenantId = toText(payload.tenantId);
  const brandId = toText(payload.brandId);
  if (!tenantId || !brandId) {
    return { ok: false, skipped: true, reason: 'tenant_or_brand_missing' };
  }

  const where = {
    tenantId,
    brandId,
  };
  if (toText(payload.platform)) where.platform = normalizeProviderKey(payload.platform);
  if (toText(payload.accountId)) where.accountId = toText(payload.accountId);

  const start = toDateOnly(payload.start);
  const end = toDateOnly(payload.end);
  if (start || end) {
    where.date = {};
    if (start) where.date.gte = start;
    if (end) where.date.lte = end;
  }

  const rows = await db.factKondorMetricsDaily.findMany({ where });
  return upsertLegacyFactRows(
    {
      tenantId,
      brandId,
      rows,
      sourceSystem: payload.sourceSystem || null,
    },
    options,
  );
}

module.exports = {
  DEFAULT_DIMENSION_KEY,
  LEGACY_METRIC_KEYS,
  buildDimensionKey,
  normalizeDimensionPayload,
  normalizeConnectorFact,
  mapLegacyFactRowsToConnectorFacts,
  upsertConnectorFacts,
  upsertLegacyFactRows,
  projectLegacyFactsByRange,
};
