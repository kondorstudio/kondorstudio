// api/src/services/integrationsService.js
// Gerencia integrações (Meta, Google, TikTok, WhatsApp) com suporte a ownerType/ownerKey

const { prisma } = require('../prisma');
const connectionStateService = require('./connectionStateService');
const credentialsService = require('./credentialsService');

function toDateOrNull(v) {
  if (!v && v !== 0) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

function sanitizeScopes(scopes) {
  if (!scopes) return [];
  if (Array.isArray(scopes)) return scopes.map((s) => String(s));
  if (typeof scopes === 'string') return scopes.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

function hasConnectionStateModel() {
  return Boolean(
    prisma &&
      prisma.connectionState &&
      typeof prisma.connectionState.findMany === 'function',
  );
}

function buildOwnerFields(data = {}) {
  const isClientIntegration =
    (data.ownerType && data.ownerType === 'CLIENT') ||
    Boolean(data.clientId);

  const ownerType = isClientIntegration ? 'CLIENT' : data.ownerType || 'AGENCY';
  const ownerKey = isClientIntegration
    ? String(data.ownerKey || data.clientId)
    : data.ownerKey || 'AGENCY';

  return {
    ownerType,
    ownerKey,
    clientId: isClientIntegration ? String(data.clientId || ownerKey) : null,
  };
}

function sanitizeIntegrationResponse(record) {
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
  return cloned;
}

function normalizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

function mergeCredentialRefIntoConfig(config, kind, secretRef) {
  const nextConfig = normalizeObject(config);
  const refs = normalizeObject(nextConfig.credentialsRefs);
  refs[String(kind || 'default')] = String(secretRef);
  nextConfig.credentialsRefs = refs;
  if (!nextConfig.credentialRef) {
    nextConfig.credentialRef = String(secretRef);
  }
  return nextConfig;
}

const INTEGRATION_BRIDGE_KIND_MAP = Object.freeze({
  meta_ads: {
    source: 'META_ADS',
    platform: 'META_ADS',
    label: 'Meta Ads',
    accountIdKeys: ['adAccountId', 'accountId'],
    nameKeys: ['adAccountName', 'accountName', 'displayName'],
    configAccountIdKeys: ['adAccountId', 'accountId'],
    configNameKeys: ['name', 'adAccountName', 'accountName'],
  },
  meta_business: {
    source: 'META_SOCIAL',
    platform: 'FB_IG',
    label: 'Meta Social',
    accountIdKeys: ['pageId', 'igBusinessId', 'igBusinessAccountId'],
    nameKeys: ['pageName', 'igUsername', 'displayName'],
    configAccountIdKeys: ['pageId', 'igBusinessAccountId'],
    configNameKeys: ['pageName', 'igUsername'],
  },
  instagram_only: {
    source: 'META_SOCIAL',
    platform: 'FB_IG',
    label: 'Instagram',
    accountIdKeys: ['igBusinessId', 'igBusinessAccountId', 'pageId'],
    nameKeys: ['igUsername', 'pageName', 'displayName'],
    configAccountIdKeys: ['igBusinessAccountId', 'pageId'],
    configNameKeys: ['igUsername', 'pageName'],
  },
  google_ads: {
    source: 'GOOGLE_ADS',
    platform: 'GOOGLE_ADS',
    label: 'Google Ads',
    accountIdKeys: ['customerId', 'accountId', 'googleAdsAccountId'],
    nameKeys: ['accountName', 'customerName', 'displayName'],
    configAccountIdKeys: ['customerId', 'accountId'],
    configNameKeys: ['name', 'accountName', 'customerName'],
    normalizeAccountId(value) {
      return String(value).replace(/^customers\//i, '');
    },
  },
  tiktok_ads: {
    source: 'TIKTOK_ADS',
    platform: 'TIKTOK_ADS',
    label: 'TikTok Ads',
    accountIdKeys: ['adAccountId', 'advertiserId', 'accountId', 'openId'],
    nameKeys: ['accountName', 'advertiserName', 'displayName'],
    configAccountIdKeys: ['adAccountId', 'advertiserId', 'accountId', 'openId'],
    configNameKeys: ['name', 'accountName', 'advertiserName'],
  },
  linkedin_ads: {
    source: 'LINKEDIN_ADS',
    platform: 'LINKEDIN_ADS',
    label: 'LinkedIn Ads',
    accountIdKeys: ['accountId', 'adAccountId', 'organizationId'],
    nameKeys: ['accountName', 'organizationName', 'displayName'],
    configAccountIdKeys: ['accountId', 'adAccountId', 'organizationId'],
    configNameKeys: ['name', 'accountName', 'organizationName'],
  },
  google_business: {
    source: 'GBP',
    platform: 'GMB',
    label: 'Google Business',
    accountIdKeys: ['locationId', 'profileId', 'accountId', 'businessId'],
    nameKeys: ['locationName', 'businessName', 'accountName', 'displayName'],
    configAccountIdKeys: ['locationId', 'profileId', 'accountId'],
    configNameKeys: ['name', 'locationName', 'businessName'],
    normalizeAccountId(value) {
      return String(value).replace(/^locations\//i, '');
    },
  },
  google_analytics: {
    source: 'GA4',
    platform: 'GA4',
    label: 'GA4',
    accountIdKeys: ['propertyId', 'property_id', 'ga4PropertyId'],
    nameKeys: ['propertyName', 'displayName'],
    configAccountIdKeys: ['propertyId', 'property_id'],
    configNameKeys: ['displayName', 'name'],
    normalizeAccountId(value) {
      return String(value).replace(/^properties\//i, '');
    },
  },
});

function normalizeIntegrationKind(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const fromOwnerKey = raw.includes(':') ? raw.split(':').pop() : raw;
  const normalized = fromOwnerKey
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');

  const aliases = {
    ga4: 'google_analytics',
    googleanalytics: 'google_analytics',
    analytics: 'google_analytics',
    google_ads_api: 'google_ads',
    googleads: 'google_ads',
    metaads: 'meta_ads',
    meta: 'meta_ads',
    instagrambusiness: 'instagram_only',
    instagram: 'instagram_only',
    tiktok: 'tiktok_ads',
    linkedin: 'linkedin_ads',
    linkedinads: 'linkedin_ads',
    gmb: 'google_business',
    google_my_business: 'google_business',
    googlebusiness: 'google_business',
  };

  return aliases[normalized] || normalized;
}

function pickFirstString(source, keys = []) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function resolveAccountFromConfig(accounts = [], currentAccountId, idKeys = [], nameKeys = []) {
  const list = Array.isArray(accounts) ? accounts : [];
  const expected = currentAccountId ? String(currentAccountId) : null;

  let fallback = null;
  for (const account of list) {
    const accountId = pickFirstString(account, idKeys);
    if (!accountId) continue;
    const accountName = pickFirstString(account, nameKeys);
    const candidate = { accountId, accountName };
    if (!fallback) fallback = candidate;
    if (expected && String(accountId) === expected) {
      return candidate;
    }
  }

  return fallback;
}

function resolveBridgeKind(record, settings = {}) {
  const provider = String(record?.provider || '').trim().toUpperCase();
  const candidates = [
    settings.kind,
    settings.sourceKind,
    record?.ownerKey,
    record?.providerName,
  ];

  for (const candidate of candidates) {
    const kind = normalizeIntegrationKind(candidate);
    if (INTEGRATION_BRIDGE_KIND_MAP[kind]) return kind;
  }

  const hasAny = (keys = []) =>
    keys.some((key) => settings[key] !== null && settings[key] !== undefined && String(settings[key]).trim());

  if (provider === 'GOOGLE') {
    if (hasAny(['propertyId', 'property_id', 'ga4PropertyId'])) return 'google_analytics';
    if (hasAny(['customerId', 'accountId', 'googleAdsAccountId'])) return 'google_ads';
    if (hasAny(['locationId', 'profileId', 'businessId'])) return 'google_business';
  }
  if (provider === 'META') {
    if (hasAny(['adAccountId', 'accountId'])) return 'meta_ads';
    if (hasAny(['pageId', 'igBusinessId', 'igBusinessAccountId'])) return 'meta_business';
  }
  if (provider === 'TIKTOK') {
    if (hasAny(['adAccountId', 'advertiserId', 'accountId', 'openId'])) return 'tiktok_ads';
  }
  if (provider === 'LINKEDIN') {
    if (hasAny(['accountId', 'adAccountId', 'organizationId'])) return 'linkedin_ads';
  }

  if (provider === 'GOOGLE_ADS') return 'google_ads';
  if (provider === 'GOOGLE_ANALYTICS' || provider === 'GA4') return 'google_analytics';
  return '';
}

function resolveBridgeTarget(record) {
  if (!record || !record.clientId) return null;

  const settings = normalizeObject(record.settings);
  const config = normalizeObject(record.config);
  const kind = resolveBridgeKind(record, settings);
  if (!kind) return null;

  const rule = INTEGRATION_BRIDGE_KIND_MAP[kind];
  if (!rule) return null;

  let externalAccountId = pickFirstString(settings, rule.accountIdKeys);
  let displayName = pickFirstString(settings, rule.nameKeys);
  const configAccounts = Array.isArray(config.accounts) ? config.accounts : [];

  const fromConfig = resolveAccountFromConfig(
    configAccounts,
    externalAccountId,
    rule.configAccountIdKeys || rule.accountIdKeys,
    rule.configNameKeys || rule.nameKeys,
  );

  if (!externalAccountId && fromConfig?.accountId) {
    externalAccountId = String(fromConfig.accountId);
  }
  if (!displayName && fromConfig?.accountName) {
    displayName = String(fromConfig.accountName);
  }

  if (rule.normalizeAccountId && externalAccountId) {
    externalAccountId = rule.normalizeAccountId(externalAccountId);
  }

  if (!externalAccountId) return null;

  return {
    kind,
    source: rule.source,
    platform: rule.platform,
    brandId: String(record.clientId),
    externalAccountId: String(externalAccountId),
    displayName: String(
      displayName || `${rule.label} ${String(externalAccountId)}`,
    ),
  };
}

function isIntegrationConnectedStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  return normalized === 'CONNECTED' || normalized === 'ACTIVE';
}

async function syncBrandAndDataSourceConnections(record, { forceDisconnect = false } = {}) {
  if (!record || !record.tenantId || !record.clientId || !record.id) return null;
  if (!prisma?.dataSourceConnection || !prisma?.brandSourceConnection) return null;

  const tenantId = String(record.tenantId);
  const integrationId = String(record.id);
  const target = resolveBridgeTarget(record);
  const shouldConnect = !forceDisconnect && isIntegrationConnectedStatus(record.status);

  const runInTransaction =
    typeof prisma.$transaction === 'function'
      ? prisma.$transaction.bind(prisma)
      : async (executor) => executor(prisma);

  return runInTransaction(async (tx) => {
    const dataSourceConnectionModel = tx.dataSourceConnection;
    const brandSourceConnectionModel = tx.brandSourceConnection;
    if (!dataSourceConnectionModel || !brandSourceConnectionModel) return null;

    if (!shouldConnect || !target) {
      if (typeof dataSourceConnectionModel.updateMany === 'function') {
        const where = {
          tenantId,
          brandId: String(record.clientId),
          integrationId,
        };
        if (target?.source) where.source = target.source;
        await dataSourceConnectionModel.updateMany({
          where,
          data: { status: 'DISCONNECTED' },
        });
      }

      if (target && typeof brandSourceConnectionModel.updateMany === 'function') {
        await brandSourceConnectionModel.updateMany({
          where: {
            tenantId,
            brandId: target.brandId,
            platform: target.platform,
            externalAccountId: target.externalAccountId,
            status: 'ACTIVE',
          },
          data: { status: 'DISCONNECTED' },
        });
      }
      return null;
    }

    if (typeof dataSourceConnectionModel.updateMany === 'function') {
      await dataSourceConnectionModel.updateMany({
        where: {
          tenantId,
          brandId: target.brandId,
          source: target.source,
          integrationId,
          externalAccountId: { not: target.externalAccountId },
          status: 'CONNECTED',
        },
        data: { status: 'DISCONNECTED' },
      });
    }

    let dataSourceConnection = null;
    if (typeof dataSourceConnectionModel.findFirst === 'function') {
      dataSourceConnection = await dataSourceConnectionModel.findFirst({
        where: {
          tenantId,
          brandId: target.brandId,
          source: target.source,
          integrationId,
          externalAccountId: target.externalAccountId,
        },
      });
    }

    const nextMeta = {
      provider: String(record.provider || '').toUpperCase() || null,
      kind: target.kind,
      ownerKey: record.ownerKey || null,
      synchronizedFrom: 'integrations_service',
    };

    if (dataSourceConnection && typeof dataSourceConnectionModel.update === 'function') {
      dataSourceConnection = await dataSourceConnectionModel.update({
        where: { id: dataSourceConnection.id },
        data: {
          displayName: target.displayName,
          status: 'CONNECTED',
          meta: nextMeta,
        },
      });
    } else if (typeof dataSourceConnectionModel.create === 'function') {
      dataSourceConnection = await dataSourceConnectionModel.create({
        data: {
          tenantId,
          brandId: target.brandId,
          source: target.source,
          integrationId,
          externalAccountId: target.externalAccountId,
          displayName: target.displayName,
          status: 'CONNECTED',
          meta: nextMeta,
        },
      });
    }

    if (typeof brandSourceConnectionModel.updateMany === 'function') {
      await brandSourceConnectionModel.updateMany({
        where: {
          tenantId,
          brandId: target.brandId,
          platform: target.platform,
          externalAccountId: { not: target.externalAccountId },
          status: 'ACTIVE',
        },
        data: { status: 'DISCONNECTED' },
      });
    }

    const brandSourceConnection =
      typeof brandSourceConnectionModel.upsert === 'function'
        ? await brandSourceConnectionModel.upsert({
            where: {
              brandId_platform_externalAccountId: {
                brandId: target.brandId,
                platform: target.platform,
                externalAccountId: target.externalAccountId,
              },
            },
            update: {
              externalAccountName: target.displayName,
              status: 'ACTIVE',
            },
            create: {
              tenantId,
              brandId: target.brandId,
              platform: target.platform,
              externalAccountId: target.externalAccountId,
              externalAccountName: target.displayName,
              status: 'ACTIVE',
            },
          })
        : null;

    return {
      dataSourceConnection,
      brandSourceConnection,
      target,
    };
  });
}

function buildStatePayloadFromIntegration(record, overrides = {}) {
  if (!record) return null;
  const provider = String(record.provider || '').toUpperCase();
  if (!provider) return null;
  return {
    tenantId: String(record.tenantId),
    brandId: record.clientId ? String(record.clientId) : null,
    provider,
    connectionId: record.id ? String(record.id) : null,
    connectionKey: record.ownerKey || record.id || 'default',
    status: connectionStateService.normalizeConnectionStatus(
      overrides.status || record.status,
      connectionStateService.STATUS.ERROR,
    ),
    reasonCode:
      overrides.reasonCode !== undefined
        ? overrides.reasonCode
        : record.lastError
          ? 'INTEGRATION_ERROR'
          : null,
    reasonMessage:
      overrides.reasonMessage !== undefined
        ? overrides.reasonMessage
        : record.lastError || null,
    nextAction:
      overrides.nextAction !== undefined
        ? overrides.nextAction
        : connectionStateService.normalizeConnectionStatus(
              overrides.status || record.status,
              connectionStateService.STATUS.ERROR,
            ) === connectionStateService.STATUS.REAUTH_REQUIRED
          ? 'Reconnect account'
          : null,
    metadata: overrides.metadata,
  };
}

async function syncConnectionState(record, overrides = {}) {
  const payload = buildStatePayloadFromIntegration(record, overrides);
  if (!payload) return null;
  return connectionStateService.upsertConnectionState(payload);
}

async function attachConnectionState(records = []) {
  const list = Array.isArray(records) ? records : [];
  if (!list.length || !hasConnectionStateModel()) return list;

  const stateKeys = Array.from(
    new Set(
      list
        .map((record) =>
          connectionStateService.buildStateKey({
            tenantId: record.tenantId,
            provider: record.provider,
            brandId: record.clientId || null,
            connectionKey: record.ownerKey || record.id || 'default',
          }),
        )
        .filter(Boolean),
    ),
  );

  if (!stateKeys.length) return list;

  const states = await prisma.connectionState.findMany({
    where: { stateKey: { in: stateKeys } },
  });
  const stateMap = new Map(states.map((state) => [state.stateKey, state]));

  return list.map((record) => {
    const stateKey = connectionStateService.buildStateKey({
      tenantId: record.tenantId,
      provider: record.provider,
      brandId: record.clientId || null,
      connectionKey: record.ownerKey || record.id || 'default',
    });
    const state = stateMap.get(stateKey) || null;
    return {
      ...record,
      connectionStatus:
        state?.status ||
        connectionStateService.normalizeConnectionStatus(
          record.status,
          connectionStateService.STATUS.DISCONNECTED,
        ),
      connectionState: state,
    };
  });
}

async function ensureIntegrationBelongsToTenant(tenantId, integrationId) {
  return prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });
}

module.exports = {
  async list(tenantId, opts = {}) {
    const {
      provider,
      status,
      ownerType,
      ownerKey,
      clientId,
      kind,
      page = 1,
      perPage = 50,
    } = opts;
    const where = { tenantId };

    if (provider) where.provider = provider;
    if (status) where.status = status;
    if (ownerType) where.ownerType = ownerType;
    if (ownerKey) where.ownerKey = ownerKey;
    if (clientId) {
      where.OR = [
        { clientId },
        { ownerKey: String(clientId), ownerType: 'CLIENT' },
      ];
    }
    if (kind) {
      where.settings = {
        path: ['kind'],
        equals: String(kind),
      };
    }

    const skip = (Math.max(1, page) - 1) * perPage;

    const [items, total] = await Promise.all([
      prisma.integration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
        select: {
          id: true,
          tenantId: true,
          clientId: true,
          provider: true,
          providerName: true,
          status: true,
          settings: true,
          config: true,
          ownerType: true,
          ownerKey: true,
          lastSyncedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.integration.count({ where }),
    ]);
    const withState = await attachConnectionState(items);

    return {
      items: withState.map((item) => sanitizeIntegrationResponse(item)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  },

  async create(tenantId, data = {}) {
    if (!data.provider) throw new Error('Provider é obrigatório');
    const owner = buildOwnerFields(data);

    const payload = {
      tenantId,
      provider: data.provider,
      providerName: data.providerName || data.name || null,
      accessToken: data.accessToken || null,
      refreshToken: data.refreshToken || null,
      scopes: sanitizeScopes(data.scopes),
      settings: data.settings || null,
      status: data.status || 'ACTIVE',
      lastSyncedAt: toDateOrNull(data.lastSyncedAt),
      ownerType: owner.ownerType,
      ownerKey: owner.ownerKey,
      clientId: owner.clientId,
    };

    let created = await prisma.integration.create({ data: payload });

    if (data.credentials !== undefined) {
      const kind = String(data.credentialKind || data.kind || 'default');
      const stored = await credentialsService.storeCredential({
        tenantId,
        provider: created.provider,
        integrationId: created.id,
        kind,
        secret: data.credentials,
      });
      const nextConfig = mergeCredentialRefIntoConfig(created.config, kind, stored.secretRef);
      created = await prisma.integration.update({
        where: { id: created.id },
        data: { config: nextConfig },
      });
    }

    await syncConnectionState(created);
    await syncBrandAndDataSourceConnections(created);
    return sanitizeIntegrationResponse(created);
  },

  async getById(tenantId, id) {
    if (!id) return null;
    const record = await prisma.integration.findFirst({
      where: { id, tenantId },
    });
    const [withState] = await attachConnectionState(record ? [record] : []);
    return sanitizeIntegrationResponse(withState || null);
  },

  async update(tenantId, id, data = {}) {
    const existing = await ensureIntegrationBelongsToTenant(tenantId, id);
    if (!existing) return null;

    const updateData = {};
    if (data.providerName !== undefined || data.name !== undefined) {
      updateData.providerName = data.providerName || data.name || null;
    }
    if (data.status !== undefined) updateData.status = data.status;
    if (data.settings !== undefined) updateData.settings = data.settings;
    if (data.scopes !== undefined) updateData.scopes = sanitizeScopes(data.scopes);
    if (data.accessToken !== undefined) updateData.accessToken = data.accessToken || null;
    if (data.refreshToken !== undefined) updateData.refreshToken = data.refreshToken || null;
    if (data.lastSyncedAt !== undefined) updateData.lastSyncedAt = toDateOrNull(data.lastSyncedAt);

    if (data.ownerType !== undefined || data.ownerKey !== undefined || data.clientId !== undefined) {
      const owner = buildOwnerFields({
        ownerType: data.ownerType !== undefined ? data.ownerType : existing.ownerType,
        ownerKey: data.ownerKey !== undefined ? data.ownerKey : existing.ownerKey,
        clientId: data.clientId !== undefined ? data.clientId : existing.clientId,
      });
      updateData.ownerType = owner.ownerType;
      updateData.ownerKey = owner.ownerKey;
      updateData.clientId = owner.clientId;
    }

    if (data.config !== undefined) {
      updateData.config = data.config;
    }

    let updated = await prisma.integration.update({ where: { id }, data: updateData });

    if (data.credentials !== undefined) {
      const kind = String(data.credentialKind || data.kind || 'default');
      const stored = await credentialsService.storeCredential({
        tenantId,
        provider: existing.provider,
        integrationId: existing.id,
        kind,
        secret: data.credentials,
      });
      const nextConfig = mergeCredentialRefIntoConfig(updated.config, kind, stored.secretRef);
      updated = await prisma.integration.update({
        where: { id },
        data: { config: nextConfig },
      });
    }

    await syncConnectionState(updated);
    await syncBrandAndDataSourceConnections(updated);
    const [withState] = await attachConnectionState([updated]);
    return sanitizeIntegrationResponse(withState);
  },

  async remove(tenantId, id) {
    const existing = await ensureIntegrationBelongsToTenant(tenantId, id);
    if (!existing) return false;
    await syncConnectionState(existing, {
      status: connectionStateService.STATUS.DISCONNECTED,
      reasonCode: 'INTEGRATION_REMOVED',
      reasonMessage: 'Integration removed',
      nextAction: null,
    });
    await syncBrandAndDataSourceConnections(existing, { forceDisconnect: true });
    await prisma.integration.delete({ where: { id } });
    return true;
  },

  async connectClientIntegration(tenantId, clientId, provider, data = {}) {
    if (!tenantId || !clientId || !provider) {
      throw new Error('tenantId, clientId e provider são obrigatórios');
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
    });
    if (!client) {
      throw new Error('Cliente não encontrado para este tenant');
    }

    const owner = buildOwnerFields({ ownerType: 'CLIENT', ownerKey: clientId, clientId });

    const payload = {
      tenantId,
      provider,
      providerName: data.providerName || data.name || null,
      accessToken: data.accessToken || null,
      refreshToken: data.refreshToken || null,
      scopes: sanitizeScopes(data.scopes),
      settings: data.settings || null,
      status: data.status || 'ACTIVE',
      ownerType: owner.ownerType,
      ownerKey: owner.ownerKey,
      clientId: owner.clientId,
    };

    let created = await prisma.integration.create({ data: payload });

    if (data.credentials !== undefined) {
      const kind = String(data.credentialKind || data.kind || 'default');
      const stored = await credentialsService.storeCredential({
        tenantId,
        provider,
        integrationId: created.id,
        kind,
        secret: data.credentials,
      });
      const nextConfig = mergeCredentialRefIntoConfig(created.config, kind, stored.secretRef);
      created = await prisma.integration.update({
        where: { id: created.id },
        data: { config: nextConfig },
      });
    }

    await syncConnectionState(created);
    await syncBrandAndDataSourceConnections(created);
    return sanitizeIntegrationResponse(created);
  },

  async storeCredentialRef(tenantId, integrationId, data = {}) {
    const integration = await ensureIntegrationBelongsToTenant(tenantId, integrationId);
    if (!integration) return null;

    const secret = data.secret !== undefined ? data.secret : data.credentials;
    if (secret === undefined) {
      const err = new Error('secret is required');
      err.code = 'CREDENTIAL_SECRET_REQUIRED';
      err.status = 400;
      throw err;
    }

    const kind = String(data.kind || 'default');
    const stored = await credentialsService.storeCredential({
      tenantId,
      provider: integration.provider,
      integrationId: integration.id,
      kind,
      secret,
      meta: data.meta || null,
    });

    const nextConfig = mergeCredentialRefIntoConfig(integration.config, kind, stored.secretRef);
    const updated = await prisma.integration.update({
      where: { id: integration.id },
      data: { config: nextConfig },
    });

    return {
      integration: sanitizeIntegrationResponse(updated),
      kind,
      secretRef: stored.secretRef,
    };
  },

  async disconnect(tenantId, id) {
    const existing = await ensureIntegrationBelongsToTenant(tenantId, id);
    if (!existing) return null;

    const updated = await prisma.integration.update({
      where: { id },
      data: { status: 'INACTIVE', accessToken: null, refreshToken: null },
    });
    await syncConnectionState(updated, {
      status: connectionStateService.STATUS.DISCONNECTED,
      reasonCode: 'MANUAL_DISCONNECT',
      reasonMessage: null,
      nextAction: null,
    });
    await syncBrandAndDataSourceConnections(updated, { forceDisconnect: true });

    const [withState] = await attachConnectionState([updated]);
    return sanitizeIntegrationResponse(withState);
  },

  async queueIntegrationJob(tenantId, integrationId, type, payload = {}) {
    const integration = await ensureIntegrationBelongsToTenant(tenantId, integrationId);
    if (!integration) throw new Error('Integration not found');

    const job = await prisma.integrationJob.create({
      data: {
        integrationId: integration.id,
        type,
        status: 'pending',
        payload,
      },
    });
    return job;
  },

  async processIntegrationJob(integrationJobId) {
    const job = await prisma.integrationJob.findUnique({
      where: { id: integrationJobId },
      include: { integration: true },
    });

    if (!job || !job.integration) {
      throw new Error('IntegrationJob não encontrado ou sem integração associada');
    }

    await prisma.integrationJob.update({
      where: { id: job.id },
      data: {
        status: 'done',
        attempt: job.attempt + 1,
        result: { processedAt: new Date(), type: job.type || null },
      },
    });

    return { ok: true, jobId: job.id };
  },
};
