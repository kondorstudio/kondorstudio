// api/src/services/brandGa4SettingsService.js
// Canonical GA4 settings per brand (client).
//
// Key rules implemented here:
// - Exactly 1 GA4 property per brand (agency scale). If multiple GA4 connections exist, we keep the
//   most recently updated one ACTIVE and DISCONNECT the others.
// - Historical facts must always be tied to the brand's active GA4 propertyId.

const { prisma } = require('../prisma');
const { acquireTenantBrandLock } = require('../lib/pgAdvisoryLock');

function parseEnvList(value) {
  if (!value) return [];
  return String(value)
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueStrings(list) {
  const out = [];
  const seen = new Set();
  (list || []).forEach((entry) => {
    const value = String(entry || '').trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

function normalizeGa4PropertyId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('properties/')) return raw.replace(/^properties\//, '');
  return raw;
}

const DEFAULT_LEAD_EVENTS = (() => {
  const list = parseEnvList(process.env.GA4_LEAD_EVENT_NAMES);
  if (list.length) return uniqueStrings(list);
  const single = String(process.env.GA4_LEAD_EVENT_NAME || '').trim();
  if (single) return [single];
  return ['generate_lead'];
})();

const DEFAULT_CONVERSION_EVENTS = (() => {
  const list = parseEnvList(process.env.GA4_CONVERSION_EVENT_NAMES);
  if (list.length) return uniqueStrings(list);
  const single = String(process.env.GA4_CONVERSION_EVENT_NAME || '').trim();
  if (single) return [single];
  return [];
})();

function buildDefaults() {
  return {
    leadEvents: DEFAULT_LEAD_EVENTS,
    conversionEvents: DEFAULT_CONVERSION_EVENTS,
  };
}

async function getBrandGa4Settings({ tenantId, brandId }, opts = {}) {
  const db = opts.db || prisma;
  if (!tenantId || !brandId) return null;
  return db.brandGa4Settings.findFirst({
    where: {
      tenantId: String(tenantId),
      brandId: String(brandId),
    },
  });
}

async function upsertBrandGa4Settings(
  {
    tenantId,
    brandId,
    propertyId,
    timezone,
    leadEvents,
    conversionEvents,
    revenueEvent,
    dedupRule,
    backfillCursor,
    lastHistoricalSyncAt,
    lastSuccessAt,
    lastError,
  },
  opts = {},
) {
  const db = opts.db || prisma;
  if (!tenantId || !brandId) {
    const err = new Error('tenantId e brandId são obrigatórios');
    err.code = 'BRAND_GA4_SETTINGS_PARAMS_REQUIRED';
    err.status = 400;
    throw err;
  }

  const normalizedPropertyId = normalizeGa4PropertyId(propertyId);
  if (!normalizedPropertyId) {
    const err = new Error('propertyId é obrigatório');
    err.code = 'BRAND_GA4_PROPERTY_REQUIRED';
    err.status = 400;
    throw err;
  }

  const defaults = buildDefaults();

  const nextLeadEvents =
    leadEvents === undefined ? undefined : uniqueStrings(leadEvents);
  const nextConversionEvents =
    conversionEvents === undefined ? undefined : uniqueStrings(conversionEvents);

  const createData = {
    tenantId: String(tenantId),
    brandId: String(brandId),
    propertyId: normalizedPropertyId,
    timezone: timezone || null,
    leadEvents: nextLeadEvents ?? defaults.leadEvents,
    conversionEvents: nextConversionEvents ?? defaults.conversionEvents,
    revenueEvent: revenueEvent || null,
    dedupRule: dedupRule || null,
    backfillCursor: backfillCursor || null,
    lastHistoricalSyncAt: lastHistoricalSyncAt || null,
    lastSuccessAt: lastSuccessAt || null,
    lastError: lastError || null,
  };

  const updateData = {
    propertyId: normalizedPropertyId,
    ...(timezone !== undefined ? { timezone: timezone || null } : {}),
    ...(nextLeadEvents !== undefined ? { leadEvents: nextLeadEvents } : {}),
    ...(nextConversionEvents !== undefined
      ? { conversionEvents: nextConversionEvents }
      : {}),
    ...(revenueEvent !== undefined ? { revenueEvent: revenueEvent || null } : {}),
    ...(dedupRule !== undefined ? { dedupRule: dedupRule || null } : {}),
    ...(backfillCursor !== undefined ? { backfillCursor: backfillCursor || null } : {}),
    ...(lastHistoricalSyncAt !== undefined
      ? { lastHistoricalSyncAt: lastHistoricalSyncAt || null }
      : {}),
    ...(lastSuccessAt !== undefined ? { lastSuccessAt: lastSuccessAt || null } : {}),
    ...(lastError !== undefined ? { lastError: lastError || null } : {}),
  };

  // brandId is globally unique, but we still guard against cross-tenant mismatch.
  const existing = await db.brandGa4Settings.findFirst({
    where: { brandId: String(brandId) },
    select: { id: true, tenantId: true },
  });
  if (existing && String(existing.tenantId) !== String(tenantId)) {
    const err = new Error('Brand GA4 settings pertence a outro tenant');
    err.code = 'BRAND_GA4_SETTINGS_TENANT_MISMATCH';
    err.status = 404;
    throw err;
  }

  return db.brandGa4Settings.upsert({
    where: {
      brandId: String(brandId),
    },
    create: createData,
    update: updateData,
  });
}

async function resolveBrandGa4ActivePropertyId({ tenantId, brandId }, opts = {}) {
  const db = opts.db || prisma;
  if (!tenantId || !brandId) return null;

  // Fast path: use canonical settings without mutating connections.
  const stored = await db.brandGa4Settings.findFirst({
    where: {
      tenantId: String(tenantId),
      brandId: String(brandId),
    },
    select: {
      propertyId: true,
    },
  });
  const storedPropertyId = normalizeGa4PropertyId(stored?.propertyId);
  if (storedPropertyId) return storedPropertyId;

  const runner = typeof db.$transaction === 'function'
    ? db.$transaction.bind(db)
    : async (fn) => fn(db);

  return runner(async (tx) => {
    // Initialize settings and cleanup legacy duplicates/facts atomically.
    await acquireTenantBrandLock(tx, tenantId, brandId);

    const connections = await tx.brandSourceConnection.findMany({
      where: {
        tenantId: String(tenantId),
        brandId: String(brandId),
        platform: 'GA4',
        status: 'ACTIVE',
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        externalAccountId: true,
      },
    });

    if (!connections.length) return null;

    const primaryExternal = String(connections[0].externalAccountId || '');
    const propertyId = normalizeGa4PropertyId(primaryExternal);
    if (!propertyId) return null;

    if (connections.length > 1) {
      await tx.brandSourceConnection.updateMany({
        where: {
          tenantId: String(tenantId),
          brandId: String(brandId),
          platform: 'GA4',
          status: 'ACTIVE',
          externalAccountId: { not: primaryExternal },
        },
        data: { status: 'DISCONNECTED' },
      });
    }

    // Purge any GA4 facts not tied to the active property to avoid invisible sums/residue.
    if (tx.factKondorMetricsDaily) {
      await tx.factKondorMetricsDaily.deleteMany({
        where: {
          tenantId: String(tenantId),
          brandId: String(brandId),
          platform: 'GA4',
          accountId: { not: String(propertyId) },
        },
      });
    }

    if (tx.brandGa4Settings) {
      await upsertBrandGa4Settings(
        {
          tenantId,
          brandId,
          propertyId,
        },
        { db: tx },
      );
    }

    return propertyId;
  });
}

module.exports = {
  normalizeGa4PropertyId,
  getBrandGa4Settings,
  upsertBrandGa4Settings,
  resolveBrandGa4ActivePropertyId,
};
