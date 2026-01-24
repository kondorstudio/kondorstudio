const { prisma } = require('../../prisma');
const { getAdapter, getIntegrationKind } = require('./providers');
const ga4MetadataService = require('../../services/ga4MetadataService');
const { resolveGa4IntegrationContext } = require('../../services/ga4IntegrationResolver');

const SOURCE_INTEGRATION_MAP = {
  META_ADS: { providers: ['META'], kinds: ['meta_ads'] },
  META_SOCIAL: { providers: ['META'], kinds: ['meta_business', 'instagram_only'] },
  GOOGLE_ADS: { providers: ['GOOGLE', 'GOOGLE_ADS'], kinds: ['google_ads'] },
  GA4: { providers: ['GOOGLE'], kinds: ['google_analytics'] },
  GBP: { providers: ['GOOGLE'], kinds: ['google_business'] },
  TIKTOK_ADS: { providers: ['TIKTOK'], kinds: ['tiktok_ads'] },
  LINKEDIN_ADS: { providers: ['LINKEDIN'], kinds: ['linkedin_ads'] },
};

function sanitizeIntegration(record) {
  if (!record) return null;
  const cloned = { ...record };
  delete cloned.accessToken;
  delete cloned.refreshToken;
  delete cloned.accessTokenEncrypted;
  if (cloned.config && typeof cloned.config === 'object' && !Array.isArray(cloned.config)) {
    const nextConfig = { ...cloned.config };
    for (const key of [
      'access_token',
      'accessToken',
      'accessTokenEncrypted',
      'token',
      'refresh_token',
      'refreshToken',
      'app_secret',
      'client_secret',
      'secret',
    ]) {
      if (Object.prototype.hasOwnProperty.call(nextConfig, key)) delete nextConfig[key];
    }
    cloned.config = nextConfig;
  }
  if (cloned.settings && typeof cloned.settings === 'object' && !Array.isArray(cloned.settings)) {
    const nextSettings = { ...cloned.settings };
    for (const key of [
      'accessToken',
      'access_token',
      'refreshToken',
      'refresh_token',
      'token',
      'appSecret',
      'app_secret',
      'client_secret',
      'secret',
    ]) {
      if (Object.prototype.hasOwnProperty.call(nextSettings, key)) delete nextSettings[key];
    }
    cloned.settings = nextSettings;
  }
  return cloned;
}

async function assertBrand(tenantId, brandId) {
  if (!tenantId || !brandId) return null;
  const brand = await prisma.client.findFirst({
    where: { id: brandId, tenantId },
    select: { id: true, name: true },
  });
  return brand || null;
}

function integrationMatchesSource(integration, source) {
  const rule = SOURCE_INTEGRATION_MAP[source];
  if (!rule || !integration) return false;
  if (!rule.providers.includes(integration.provider)) return false;

  if (!rule.kinds || !rule.kinds.length) return true;
  const kind = getIntegrationKind(integration);
  if (!kind) return false;
  return rule.kinds.includes(kind);
}

async function listConnections(tenantId, brandId) {
  const brand = await assertBrand(tenantId, brandId);
  if (!brand) {
    const err = new Error('Marca não encontrada');
    err.status = 404;
    throw err;
  }

  const connections = await prisma.dataSourceConnection.findMany({
    where: { tenantId, brandId },
    orderBy: { createdAt: 'desc' },
    include: {
      integration: true,
    },
  });

  return connections.map((connection) => ({
    ...connection,
    integration: sanitizeIntegration(connection.integration),
  }));
}

async function listIntegrationAccounts(tenantId, integrationId, source) {
  if (!integrationId) {
    const err = new Error('integrationId é obrigatório');
    err.status = 400;
    throw err;
  }
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });
  if (!integration) {
    const err = new Error('Integração não encontrada');
    err.status = 404;
    throw err;
  }

  if (!integrationMatchesSource(integration, source)) {
    const err = new Error('Integração incompatível com a fonte solicitada');
    err.status = 400;
    throw err;
  }

  const adapter = getAdapter(source);
  if (!adapter) {
    const err = new Error('Fonte não suportada');
    err.status = 400;
    throw err;
  }

  const items = await adapter.listSelectableAccounts(integration);
  return items || [];
}

async function linkConnection(tenantId, brandId, payload, userId) {
  const brand = await assertBrand(tenantId, brandId);
  if (!brand) {
    const err = new Error('Marca não encontrada');
    err.status = 404;
    throw err;
  }

  const { source, integrationId, externalAccountId, displayName } = payload;
  if (source === 'GA4' && !integrationId) {
    if (!userId) {
      const err = new Error('userId é obrigatório para conectar GA4');
      err.status = 400;
      throw err;
    }

    const property = await prisma.integrationGoogleGa4Property.findFirst({
      where: {
        tenantId,
        propertyId: String(externalAccountId),
        integration: { userId: String(userId) },
      },
      include: { integration: true },
    });

    if (!property) {
      const err = new Error('Propriedade GA4 não encontrada');
      err.status = 404;
      throw err;
    }

    if (property.integration?.status !== 'CONNECTED') {
      const err = new Error('Integração GA4 não está CONNECTED');
      err.status = 400;
      throw err;
    }

    const meta = {
      ga4UserId: String(userId),
      ga4IntegrationId: property.integrationId,
      propertyId: String(property.propertyId),
    };

    const existing = await prisma.dataSourceConnection.findFirst({
      where: {
        tenantId,
        brandId,
        source,
        externalAccountId: String(externalAccountId),
      },
    });

    if (existing) {
      return prisma.dataSourceConnection.update({
        where: { id: existing.id },
        data: {
          integrationId: null,
          displayName: displayName || property.displayName || existing.displayName,
          status: 'CONNECTED',
          meta,
        },
      });
    }

    return prisma.dataSourceConnection.create({
      data: {
        tenantId,
        brandId,
        source,
        integrationId: null,
        externalAccountId: String(externalAccountId),
        displayName: displayName || property.displayName || String(externalAccountId),
        status: 'CONNECTED',
        meta,
      },
    });
  }
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });
  if (!integration) {
    const err = new Error('Integração não encontrada');
    err.status = 404;
    throw err;
  }

  if (integration.status !== 'CONNECTED') {
    const err = new Error('Integração não está CONNECTED');
    err.status = 400;
    throw err;
  }

  if (integration.clientId && integration.clientId !== brandId) {
    const err = new Error('Integração não pertence a esta marca');
    err.status = 400;
    throw err;
  }

  if (!integrationMatchesSource(integration, source)) {
    const err = new Error('Integração incompatível com a fonte solicitada');
    err.status = 400;
    throw err;
  }

  const adapter = getAdapter(source);
  let meta = null;

  if (adapter) {
    try {
      const accounts = await adapter.listSelectableAccounts(integration);
      const match = (accounts || []).find(
        (item) => String(item.id) === String(externalAccountId),
      );
      if (match && match.meta) meta = match.meta;
    } catch (_) {
      meta = null;
    }
  }

  const existing = await prisma.dataSourceConnection.findFirst({
    where: {
      tenantId,
      brandId,
      source,
      externalAccountId: String(externalAccountId),
    },
  });

  if (existing) {
    return prisma.dataSourceConnection.update({
      where: { id: existing.id },
      data: {
        integrationId,
        displayName,
        status: 'CONNECTED',
        meta,
      },
    });
  }

  return prisma.dataSourceConnection.create({
    data: {
      tenantId,
      brandId,
      source,
      integrationId,
      externalAccountId: String(externalAccountId),
      displayName,
      status: 'CONNECTED',
      meta,
    },
  });
}

async function getGa4Metadata(tenantId, connectionId) {
  if (!connectionId) {
    const err = new Error('connectionId é obrigatório');
    err.status = 400;
    throw err;
  }

  const connection = await prisma.dataSourceConnection.findFirst({
    where: { id: connectionId, tenantId },
  });

  if (!connection) {
    const err = new Error('Conexão não encontrada');
    err.status = 404;
    throw err;
  }

  if (connection.source !== 'GA4') {
    const err = new Error('Conexão não é GA4');
    err.status = 400;
    throw err;
  }

  const propertyId =
    connection.externalAccountId ||
    connection.meta?.propertyId ||
    null;

  if (!propertyId) {
    const err = new Error('Conexão GA4 sem propertyId');
    err.status = 400;
    throw err;
  }

  const resolved = await resolveGa4IntegrationContext({
    tenantId,
    propertyId,
    integrationId: connection.meta?.ga4IntegrationId,
    userId: connection.meta?.ga4UserId,
  });

  const metadata = await ga4MetadataService.getMetadata({
    tenantId,
    userId: resolved.userId,
    propertyId: String(propertyId),
  });

  if (
    resolved.integrationId !== connection.meta?.ga4IntegrationId ||
    resolved.userId !== connection.meta?.ga4UserId
  ) {
    await prisma.dataSourceConnection.update({
      where: { id: connection.id },
      data: {
        meta: {
          ...(connection.meta || {}),
          ga4IntegrationId: resolved.integrationId,
          ga4UserId: resolved.userId,
          propertyId: String(propertyId),
        },
      },
    });
  }

  return {
    propertyId: String(propertyId),
    ...metadata,
  };
}

async function checkGa4Compatibility(tenantId, connectionId, payload = {}) {
  if (!connectionId) {
    const err = new Error('connectionId é obrigatório');
    err.status = 400;
    throw err;
  }

  const connection = await prisma.dataSourceConnection.findFirst({
    where: { id: connectionId, tenantId },
    include: {
      integration: true,
    },
  });

  if (!connection) {
    const err = new Error('Conexão não encontrada');
    err.status = 404;
    throw err;
  }

  if (connection.source !== 'GA4') {
    const err = new Error('Conexão não é GA4');
    err.status = 400;
    throw err;
  }

  const adapter = getAdapter('GA4');
  if (!adapter || typeof adapter.checkCompatibility !== 'function') {
    const err = new Error('Compatibilidade GA4 indisponivel');
    err.status = 400;
    throw err;
  }

  return adapter.checkCompatibility(connection, payload);
}

module.exports = {
  listConnections,
  listIntegrationAccounts,
  linkConnection,
  getGa4Metadata,
  checkGa4Compatibility,
};
