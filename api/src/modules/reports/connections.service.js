const { prisma } = require('../../prisma');

const PLATFORM_SOURCE_MAP = {
  META_ADS: 'META_ADS',
  GOOGLE_ADS: 'GOOGLE_ADS',
  TIKTOK_ADS: 'TIKTOK_ADS',
  LINKEDIN_ADS: 'LINKEDIN_ADS',
  GA4: 'GA4',
  GMB: 'GBP',
  FB_IG: 'META_SOCIAL',
};

function resolveDataSource(platform) {
  return PLATFORM_SOURCE_MAP[platform] || null;
}

async function ensureBrand(tenantId, brandId) {
  if (!brandId) return null;
  return prisma.client.findFirst({
    where: { id: brandId, tenantId },
    select: { id: true },
  });
}

async function assertBrand(tenantId, brandId) {
  const brand = await ensureBrand(tenantId, brandId);
  if (!brand) {
    const err = new Error('Marca não encontrada');
    err.code = 'BRAND_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return brand;
}

async function listConnections(tenantId, brandId) {
  await assertBrand(tenantId, brandId);

  return prisma.brandSourceConnection.findMany({
    where: { tenantId, brandId },
    orderBy: { createdAt: 'desc' },
  });
}

async function listAvailableAccounts(tenantId, brandId, platform) {
  await assertBrand(tenantId, brandId);

  const source = resolveDataSource(platform);
  if (!source) {
    const err = new Error('Plataforma não suportada');
    err.code = 'PLATFORM_NOT_SUPPORTED';
    err.status = 400;
    throw err;
  }

  const accounts = await prisma.dataSourceConnection.findMany({
    where: {
      tenantId,
      brandId,
      source,
      status: 'CONNECTED',
    },
    orderBy: { createdAt: 'desc' },
  });

  const mapped = accounts.map((item) => ({
    connectionId: item.id,
    externalAccountId: item.externalAccountId,
    externalAccountName: item.displayName,
    source: item.source,
    status: item.status,
  }));

  if (source !== 'GA4') {
    return mapped;
  }

  const integration = await prisma.integrationGoogleGa4.findFirst({
    where: { tenantId, status: 'CONNECTED' },
  });
  if (!integration) {
    return mapped;
  }

  const properties = await prisma.integrationGoogleGa4Property.findMany({
    where: { tenantId, integrationId: integration.id },
    orderBy: { displayName: 'asc' },
  });

  const existingIds = new Set(mapped.map((item) => String(item.externalAccountId)));
  const supplemental = properties
    .filter((prop) => !existingIds.has(String(prop.propertyId)))
    .map((prop) => ({
      connectionId: null,
      externalAccountId: String(prop.propertyId),
      externalAccountName: prop.displayName || `Property ${prop.propertyId}`,
      source: 'GA4',
      status: 'CONNECTED',
    }));

  return [...mapped, ...supplemental];
}

async function linkConnection(tenantId, userId, payload) {
  const { brandId, platform, externalAccountId, externalAccountName } = payload;
  await assertBrand(tenantId, brandId);

  const source = resolveDataSource(platform);
  if (!source) {
    const err = new Error('Plataforma não suportada');
    err.code = 'PLATFORM_NOT_SUPPORTED';
    err.status = 400;
    throw err;
  }

  let available = await prisma.dataSourceConnection.findFirst({
    where: {
      tenantId,
      brandId,
      source,
      externalAccountId: String(externalAccountId),
      status: 'CONNECTED',
    },
  });

  if (!available && source === 'GA4') {
    const integration = await prisma.integrationGoogleGa4.findFirst({
      where: { tenantId, status: 'CONNECTED' },
    });
    if (integration) {
      const property = await prisma.integrationGoogleGa4Property.findFirst({
        where: {
          tenantId,
          integrationId: integration.id,
          propertyId: String(externalAccountId),
        },
      });
      if (property) {
        available = {
          id: null,
          displayName: property.displayName || String(property.propertyId),
          externalAccountId: String(property.propertyId),
        };
      }
    }
  }

  if (!available) {
    const err = new Error('Conta não encontrada para esta marca');
    err.code = 'ACCOUNT_NOT_FOUND';
    err.status = 400;
    throw err;
  }

  const name =
    externalAccountName || available.displayName || String(externalAccountId);

  return prisma.brandSourceConnection.upsert({
    where: {
      brandId_platform_externalAccountId: {
        brandId,
        platform,
        externalAccountId: String(externalAccountId),
      },
    },
    update: {
      externalAccountName: name,
      status: 'ACTIVE',
    },
    create: {
      tenantId,
      brandId,
      platform,
      externalAccountId: String(externalAccountId),
      externalAccountName: name,
      status: 'ACTIVE',
    },
  });
}

module.exports = {
  listConnections,
  listAvailableAccounts,
  linkConnection,
};
