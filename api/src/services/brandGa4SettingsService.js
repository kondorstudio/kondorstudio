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

async function enforceSingleActiveGa4Connection(
  { tenantId, brandId, preferredPropertyId },
  opts = {},
) {
  const db = opts.db || prisma;
  if (!tenantId || !brandId) return null;

  const preferred = normalizeGa4PropertyId(preferredPropertyId);

  const shouldStartOwnTransaction = !opts.db && typeof db.$transaction === 'function';
  const runner = shouldStartOwnTransaction
    ? db.$transaction.bind(db)
    : async (fn) => fn(db);

  return runner(async (tx) => {
    await acquireTenantBrandLock(tx, tenantId, brandId);

    const connections = await tx.brandSourceConnection.findMany({
      where: {
        tenantId: String(tenantId),
        brandId: String(brandId),
        platform: 'GA4',
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        externalAccountId: true,
        status: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    if (!connections.length) return null;

    const normalized = connections
      .map((conn) => ({
        ...conn,
        normalizedPropertyId: normalizeGa4PropertyId(conn.externalAccountId),
      }))
      .filter((conn) => Boolean(conn.normalizedPropertyId));

    if (!normalized.length) return null;

    let targetPropertyId = preferred || '';
    if (!targetPropertyId) {
      const stored = await tx.brandGa4Settings.findFirst({
        where: {
          tenantId: String(tenantId),
          brandId: String(brandId),
        },
        select: { propertyId: true },
      });
      targetPropertyId = normalizeGa4PropertyId(stored?.propertyId);
    }

    let targetConn = targetPropertyId
      ? normalized.find(
          (conn) => String(conn.normalizedPropertyId) === String(targetPropertyId),
        )
      : null;

    if (!targetConn) {
      targetConn = normalized.find((conn) => conn.status === 'ACTIVE') || normalized[0];
      targetPropertyId = String(targetConn.normalizedPropertyId);
    }

    if (!targetConn || !targetPropertyId) return null;

    if (targetConn.status !== 'ACTIVE') {
      await tx.brandSourceConnection.update({
        where: { id: targetConn.id },
        data: { status: 'ACTIVE' },
      });
    }

    await tx.brandSourceConnection.updateMany({
      where: {
        tenantId: String(tenantId),
        brandId: String(brandId),
        platform: 'GA4',
        status: 'ACTIVE',
        id: { not: targetConn.id },
      },
      data: { status: 'DISCONNECTED' },
    });

    if (tx.factKondorMetricsDaily) {
      await tx.factKondorMetricsDaily.deleteMany({
        where: {
          tenantId: String(tenantId),
          brandId: String(brandId),
          platform: 'GA4',
          accountId: { not: String(targetPropertyId) },
        },
      });
    }

    if (tx.brandGa4Settings) {
      await upsertBrandGa4Settings(
        {
          tenantId,
          brandId,
          propertyId: targetPropertyId,
        },
        { db: tx },
      );
    }

    return String(targetPropertyId);
  });
}

async function setBrandGa4ActiveProperty(
  { tenantId, brandId, propertyId, externalAccountName },
  opts = {},
) {
  const db = opts.db || prisma;
  if (!tenantId || !brandId) {
    const err = new Error('tenantId e brandId são obrigatórios');
    err.code = 'BRAND_GA4_PARAMS_REQUIRED';
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

  const nameOverride = externalAccountName ? String(externalAccountName) : null;

  const shouldStartOwnTransaction = !opts.db && typeof db.$transaction === 'function';
  const runner = shouldStartOwnTransaction
    ? db.$transaction.bind(db)
    : async (fn) => fn(db);

  return runner(async (tx) => {
    await acquireTenantBrandLock(tx, tenantId, brandId);

    const propertyRecord = await tx.integrationGoogleGa4Property.findFirst({
      where: {
        tenantId: String(tenantId),
        propertyId: String(normalizedPropertyId),
      },
      select: {
        integrationId: true,
        displayName: true,
        integration: {
          select: {
            userId: true,
          },
        },
      },
    });

    const existingConnections = await tx.brandSourceConnection.findMany({
      where: {
        tenantId: String(tenantId),
        brandId: String(brandId),
        platform: 'GA4',
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        externalAccountId: true,
        externalAccountName: true,
        status: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    const matching = existingConnections.filter(
      (conn) => normalizeGa4PropertyId(conn.externalAccountId) === normalizedPropertyId,
    );

    let target = matching[0] || null;

    // If the brand has never linked this property, create a GA4 connection row for it.
    if (!target) {
      if (!propertyRecord) {
        const err = new Error('Propriedade GA4 não encontrada para este tenant');
        err.code = 'GA4_PROPERTY_NOT_AVAILABLE';
        err.status = 400;
        err.details = { propertyId: String(normalizedPropertyId) };
        throw err;
      }

      const displayName = propertyRecord?.displayName
        ? String(propertyRecord.displayName)
        : null;
      const resolvedName = nameOverride || displayName || `Property ${normalizedPropertyId}`;

      target = await tx.brandSourceConnection.create({
        data: {
          tenantId: String(tenantId),
          brandId: String(brandId),
          platform: 'GA4',
          externalAccountId: String(normalizedPropertyId),
          externalAccountName: String(resolvedName),
          status: 'ACTIVE',
        },
      });
    } else {
      const nextName = nameOverride || target.externalAccountName || null;
      const needsUpdate =
        target.status !== 'ACTIVE' || (nextName && nextName !== target.externalAccountName);
      if (needsUpdate) {
        target = await tx.brandSourceConnection.update({
          where: { id: target.id },
          data: {
            status: 'ACTIVE',
            ...(nextName ? { externalAccountName: String(nextName) } : {}),
          },
        });
      }
    }

    await tx.brandSourceConnection.updateMany({
      where: {
        tenantId: String(tenantId),
        brandId: String(brandId),
        platform: 'GA4',
        status: 'ACTIVE',
        id: { not: target.id },
      },
      data: { status: 'DISCONNECTED' },
    });

    if (tx.dataSourceConnection) {
      const ga4Meta = {
        propertyId: String(normalizedPropertyId),
        ga4IntegrationId: propertyRecord?.integrationId
          ? String(propertyRecord.integrationId)
          : null,
        ga4UserId: propertyRecord?.integration?.userId
          ? String(propertyRecord.integration.userId)
          : null,
      };
      const ga4DisplayName =
        nameOverride ||
        target.externalAccountName ||
        propertyRecord?.displayName ||
        `Property ${normalizedPropertyId}`;

      const existingGa4DataConnection = await tx.dataSourceConnection.findFirst({
        where: {
          tenantId: String(tenantId),
          brandId: String(brandId),
          source: 'GA4',
          externalAccountId: String(normalizedPropertyId),
        },
        select: { id: true },
      });

      let activeGa4DataConnectionId = null;
      if (existingGa4DataConnection?.id) {
        const updated = await tx.dataSourceConnection.update({
          where: { id: existingGa4DataConnection.id },
          data: {
            integrationId: null,
            displayName: String(ga4DisplayName),
            status: 'CONNECTED',
            meta: ga4Meta,
          },
        });
        activeGa4DataConnectionId = updated.id;
      } else {
        const created = await tx.dataSourceConnection.create({
          data: {
            tenantId: String(tenantId),
            brandId: String(brandId),
            source: 'GA4',
            integrationId: null,
            externalAccountId: String(normalizedPropertyId),
            displayName: String(ga4DisplayName),
            status: 'CONNECTED',
            meta: ga4Meta,
          },
        });
        activeGa4DataConnectionId = created.id;
      }

      await tx.dataSourceConnection.updateMany({
        where: {
          tenantId: String(tenantId),
          brandId: String(brandId),
          source: 'GA4',
          status: 'CONNECTED',
          id: { not: activeGa4DataConnectionId },
        },
        data: { status: 'DISCONNECTED' },
      });
    }

    if (tx.factKondorMetricsDaily) {
      await tx.factKondorMetricsDaily.deleteMany({
        where: {
          tenantId: String(tenantId),
          brandId: String(brandId),
          platform: 'GA4',
          accountId: { not: String(normalizedPropertyId) },
        },
      });
    }

    if (tx.brandGa4Settings) {
      await upsertBrandGa4Settings(
        {
          tenantId,
          brandId,
          propertyId: normalizedPropertyId,
        },
        { db: tx },
      );
    }

    return String(normalizedPropertyId);
  });
}

async function resolveBrandGa4ActivePropertyId({ tenantId, brandId }, opts = {}) {
  const db = opts.db || prisma;
  if (!tenantId || !brandId) return null;

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

  const activeConnections = await db.brandSourceConnection.findMany({
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

  const activePropertyIds = (activeConnections || [])
    .map((conn) => normalizeGa4PropertyId(conn.externalAccountId))
    .filter(Boolean);

  const hasMultipleActive = activePropertyIds.length > 1;
  const activeMismatch =
    storedPropertyId &&
    activePropertyIds.length === 1 &&
    String(activePropertyIds[0]) !== String(storedPropertyId);

  if (hasMultipleActive || activeMismatch) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[brandGa4Settings] enforcing single GA4 property', {
        tenantId: String(tenantId),
        brandId: String(brandId),
        storedPropertyId: storedPropertyId || null,
        activePropertyIds,
      });
    }
  }

  // Fast path: already consistent.
  if (!hasMultipleActive && !activeMismatch && storedPropertyId) {
    return storedPropertyId;
  }
  if (!hasMultipleActive && !activeMismatch && !storedPropertyId && activePropertyIds.length === 1) {
    return enforceSingleActiveGa4Connection(
      { tenantId, brandId, preferredPropertyId: activePropertyIds[0] },
      opts,
    );
  }

  // Nothing connected.
  if (!activePropertyIds.length && !storedPropertyId) return null;

  return enforceSingleActiveGa4Connection(
    { tenantId, brandId, preferredPropertyId: storedPropertyId || null },
    opts,
  );
}

module.exports = {
  normalizeGa4PropertyId,
  getBrandGa4Settings,
  upsertBrandGa4Settings,
  resolveBrandGa4ActivePropertyId,
  enforceSingleActiveGa4Connection,
  setBrandGa4ActiveProperty,
};
