const { createHash, randomUUID } = require('crypto');
const { prisma } = require('../prisma');

const DEFAULT_DIMENSION_KEY = '__all__';

function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function toDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(`${parsed.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function toBigIntString(value, fallback = '0') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'bigint') return value.toString();
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return BigInt(Math.round(num)).toString();
}

function toOptionalBigIntString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return BigInt(Math.round(num)).toString();
}

function toDecimalString(value) {
  if (value === null || value === undefined) return '0';
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toFixed(6);
}

function buildFactDimensionKey({ campaignId, adsetId, adId } = {}) {
  const campaign = toText(campaignId);
  const adset = toText(adsetId);
  const ad = toText(adId);

  if (!campaign && !adset && !ad) {
    return DEFAULT_DIMENSION_KEY;
  }

  const signature = `${campaign || '~'}|${adset || '~'}|${ad || '~'}`;
  const hash = createHash('sha1').update(signature).digest('hex');
  return `dim:${hash}`;
}

function normalizeFactRow(row = {}) {
  const tenantId = toText(row.tenantId);
  const brandId = toText(row.brandId);
  const platform = toText(row.platform);
  const accountId = toText(row.accountId);
  const date = toDateOnly(row.date);

  if (!tenantId || !brandId || !platform || !accountId || !date) {
    return null;
  }

  const campaignId = toText(row.campaignId);
  const adsetId = toText(row.adsetId);
  const adId = toText(row.adId);

  const dimensionKey =
    toText(row.dimensionKey) ||
    buildFactDimensionKey({ campaignId, adsetId, adId });

  return {
    id: toText(row.id) || randomUUID(),
    tenantId,
    brandId,
    date,
    platform,
    accountId,
    campaignId,
    adsetId,
    adId,
    dimensionKey,
    currency: toText(row.currency) || 'BRL',
    impressions: toBigIntString(row.impressions),
    clicks: toBigIntString(row.clicks),
    spend: toDecimalString(row.spend),
    conversions: toDecimalString(row.conversions),
    revenue: toDecimalString(row.revenue),
    sessions: toOptionalBigIntString(row.sessions),
    leads: toOptionalBigIntString(row.leads),
  };
}

function dedupeRows(rows = []) {
  const deduped = new Map();
  (rows || []).forEach((row) => {
    const normalized = normalizeFactRow(row);
    if (!normalized) return;

    const key = [
      normalized.tenantId,
      normalized.brandId,
      normalized.platform,
      normalized.accountId,
      normalized.date.toISOString().slice(0, 10),
      normalized.dimensionKey,
    ].join('|');

    deduped.set(key, normalized);
  });

  return Array.from(deduped.values());
}

function chunkRows(rows = [], chunkSize = 500) {
  const size = Math.max(1, Number(chunkSize) || 1);
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function buildInsertPayload(chunk = []) {
  const values = [];
  const placeholders = chunk.map((row) => {
    const rowValues = [
      row.id,
      row.tenantId,
      row.brandId,
      row.date,
      row.platform,
      row.accountId,
      row.campaignId,
      row.adsetId,
      row.adId,
      row.dimensionKey,
      row.currency,
      row.impressions,
      row.clicks,
      row.spend,
      row.conversions,
      row.revenue,
      row.sessions,
      row.leads,
    ];

    const current = rowValues.map((entry) => {
      values.push(entry);
      return `$${values.length}`;
    });

    return `(${current.join(', ')})`;
  });

  const sql = `
    INSERT INTO "fact_kondor_metrics_daily" (
      "id",
      "tenantId",
      "brandId",
      "date",
      "platform",
      "accountId",
      "campaignId",
      "adsetId",
      "adId",
      "dimensionKey",
      "currency",
      "impressions",
      "clicks",
      "spend",
      "conversions",
      "revenue",
      "sessions",
      "leads"
    )
    VALUES ${placeholders.join(',\n')}
    ON CONFLICT ("tenantId", "brandId", "platform", "accountId", "date", "dimensionKey")
    DO UPDATE SET
      "campaignId" = EXCLUDED."campaignId",
      "adsetId" = EXCLUDED."adsetId",
      "adId" = EXCLUDED."adId",
      "currency" = EXCLUDED."currency",
      "impressions" = EXCLUDED."impressions",
      "clicks" = EXCLUDED."clicks",
      "spend" = EXCLUDED."spend",
      "conversions" = EXCLUDED."conversions",
      "revenue" = EXCLUDED."revenue",
      "sessions" = EXCLUDED."sessions",
      "leads" = EXCLUDED."leads"
  `;

  return { sql, values };
}

async function upsertChunkWithRaw(db, chunk = []) {
  if (!chunk.length) return;
  const { sql, values } = buildInsertPayload(chunk);
  await db.$executeRawUnsafe(sql, ...values);
}

async function upsertChunkWithPrisma(db, chunk = []) {
  for (const row of chunk) {
    // eslint-disable-next-line no-await-in-loop
    await db.factKondorMetricsDaily.upsert({
      where: {
        tenantId_brandId_platform_accountId_date_dimensionKey: {
          tenantId: row.tenantId,
          brandId: row.brandId,
          platform: row.platform,
          accountId: row.accountId,
          date: row.date,
          dimensionKey: row.dimensionKey,
        },
      },
      update: {
        campaignId: row.campaignId,
        adsetId: row.adsetId,
        adId: row.adId,
        currency: row.currency,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spend,
        conversions: row.conversions,
        revenue: row.revenue,
        sessions: row.sessions,
        leads: row.leads,
      },
      create: row,
    });
  }
}

function canUseRawUpsert(db) {
  return Boolean(db && typeof db.$executeRawUnsafe === 'function');
}

async function upsertFactMetricsDailyRows(rows = [], options = {}) {
  const db = options.db || prisma;

  const chunkSize = Math.max(
    50,
    Number(
      options.chunkSize ||
        process.env.FACT_METRICS_UPSERT_CHUNK ||
        process.env.FACT_METRICS_INSERT_CHUNK ||
        process.env.GA4_FACT_INSERT_CHUNK ||
        500,
    ),
  );

  const normalizedRows = dedupeRows(rows);
  if (!normalizedRows.length) {
    return { ok: true, rows: 0, chunks: 0 };
  }

  const chunks = chunkRows(normalizedRows, chunkSize);
  const useRaw = canUseRawUpsert(db) && options.forcePrisma !== true;

  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop
    await (useRaw ? upsertChunkWithRaw(db, chunk) : upsertChunkWithPrisma(db, chunk));
  }

  return {
    ok: true,
    rows: normalizedRows.length,
    chunks: chunks.length,
    strategy: useRaw ? 'raw_on_conflict' : 'prisma_upsert',
  };
}

module.exports = {
  DEFAULT_DIMENSION_KEY,
  buildFactDimensionKey,
  normalizeFactRow,
  upsertFactMetricsDailyRows,
};