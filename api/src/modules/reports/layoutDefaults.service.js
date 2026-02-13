const { prisma } = require('../../prisma');

function normalizePlatform(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeGa4PropertyId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('properties/')) {
    return raw.replace(/^properties\//, '');
  }
  return raw;
}

function isGa4OnlyLayout(layout) {
  const platforms = Array.isArray(layout?.globalFilters?.platforms)
    ? layout.globalFilters.platforms
    : [];
  if (!platforms.length) return false;
  const set = new Set(platforms.map(normalizePlatform).filter(Boolean));
  return set.size === 1 && set.has('GA4');
}

async function resolveDefaultGa4AccountId(tenantId, brandId) {
  if (!tenantId || !brandId) return null;

  const connections = await prisma.brandSourceConnection.findMany({
    where: {
      tenantId,
      brandId,
      platform: 'GA4',
      status: 'ACTIVE',
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { externalAccountId: true },
  });

  const accountIds = connections
    .map((item) => normalizeGa4PropertyId(item.externalAccountId))
    .filter(Boolean);

  if (!accountIds.length) return null;

  const unique = Array.from(new Set(accountIds));
  if (unique.length === 1) return unique[0];

  // Prefer the GA4 property selected in the GA4 integration settings (if it is linked to this brand).
  const integration = await prisma.integrationGoogleGa4.findFirst({
    where: { tenantId, status: 'CONNECTED' },
    select: { id: true },
  });
  if (integration) {
    const selected = await prisma.integrationGoogleGa4Property.findFirst({
      where: {
        tenantId,
        integrationId: integration.id,
        isSelected: true,
      },
      select: { propertyId: true },
      orderBy: { updatedAt: 'desc' },
    });
    const selectedId = normalizeGa4PropertyId(selected?.propertyId);
    if (selectedId && unique.includes(selectedId)) {
      return selectedId;
    }
  }

  return unique[0];
}

async function applyDefaultGa4AccountIfMissing(tenantId, brandId, layout) {
  if (!layout || !brandId || !isGa4OnlyLayout(layout)) return layout;

  const accounts = Array.isArray(layout?.globalFilters?.accounts)
    ? layout.globalFilters.accounts
    : [];
  if (accounts.length) return layout;

  const accountId = await resolveDefaultGa4AccountId(tenantId, brandId);
  if (!accountId) return layout;

  return {
    ...layout,
    globalFilters: {
      ...layout.globalFilters,
      accounts: [{ platform: 'GA4', external_account_id: String(accountId) }],
    },
  };
}

module.exports = {
  applyDefaultGa4AccountIfMissing,
};

