// api/src/services/ga4BrandTimezoneService.js
// Resolve and persist GA4 property timezone per brand.

const { prisma } = require('../prisma');
const ga4AdminService = require('./ga4AdminService');
const { resolveGa4IntegrationContext } = require('./ga4IntegrationResolver');
const { upsertBrandGa4Settings } = require('./brandGa4SettingsService');
const { isValidIanaTimeZone } = require('../lib/timezone');

const DEFAULT_TZ = 'UTC';

async function getStoredBrandTimezone({ tenantId, brandId }, opts = {}) {
  const db = opts.db || prisma;
  if (!tenantId || !brandId) return null;
  const row = await db.brandGa4Settings.findFirst({
    where: {
      tenantId: String(tenantId),
      brandId: String(brandId),
    },
    select: {
      timezone: true,
    },
  });
  const tz = row?.timezone ? String(row.timezone) : null;
  if (tz && isValidIanaTimeZone(tz)) return tz;
  return null;
}

async function ensureBrandGa4Timezone({ tenantId, brandId, propertyId }, opts = {}) {
  const db = opts.db || prisma;
  if (!tenantId || !brandId || !propertyId) return DEFAULT_TZ;

  const stored = await getStoredBrandTimezone({ tenantId, brandId }, { db });
  if (stored) return stored;

  let resolved;
  try {
    resolved = await resolveGa4IntegrationContext({
      tenantId,
      propertyId,
      integrationId: null,
      userId: null,
    });
  } catch (err) {
    // If the GA4 integration isn't connected we can't resolve the timezone.
    return DEFAULT_TZ;
  }

  let tz = null;
  try {
    tz = await ga4AdminService.getPropertyTimezone({
      tenantId,
      userId: resolved.userId,
      propertyId,
    });
  } catch (_err) {
    tz = null;
  }

  const normalized = tz && isValidIanaTimeZone(tz) ? String(tz) : null;
  if (!normalized) {
    return DEFAULT_TZ;
  }

  try {
    await upsertBrandGa4Settings(
      {
        tenantId,
        brandId,
        propertyId,
        timezone: normalized,
      },
      { db },
    );
  } catch (_err) {
    // Best-effort persistence.
  }

  return normalized;
}

module.exports = {
  DEFAULT_TZ,
  getStoredBrandTimezone,
  ensureBrandGa4Timezone,
};
