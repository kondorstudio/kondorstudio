const { prisma } = require('../../prisma');

const RAW_CONFIG_KEYS = [
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'token',
  'api_key',
  'apiKey',
  'client_secret',
  'clientSecret',
  'app_secret',
  'appSecret',
  'verify_token',
  'verifyToken',
  'serviceAccountJson',
  'private_key',
  'privateKey',
  'secret',
  'password',
  'developerToken',
];

function toInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

function clampInt(value, min, max, fallback) {
  const parsed = toInt(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function hasRawKeysInObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return RAW_CONFIG_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function classifyIntegrationExposure(item) {
  const hasRawColumns = Boolean(
    item.accessToken || item.refreshToken || item.accessTokenEncrypted,
  );
  const hasRawSettings = hasRawKeysInObject(item.settings);
  const hasRawConfig = hasRawKeysInObject(item.config);
  const hasCredentialRef = Boolean(
    item.config &&
      typeof item.config === 'object' &&
      !Array.isArray(item.config) &&
      (item.config.credentialRef ||
        (item.config.credentialsRefs &&
          typeof item.config.credentialsRefs === 'object' &&
          Object.keys(item.config.credentialsRefs).length > 0)),
  );

  return {
    hasRawColumns,
    hasRawSettings,
    hasRawConfig,
    hasCredentialRef,
    isExposed: hasRawColumns || hasRawSettings || hasRawConfig,
  };
}

async function getCredentialsComplianceReport(params = {}) {
  const tenantId = params.tenantId ? String(params.tenantId) : null;
  const sampleSize = clampInt(params.sampleSize, 1, 100, 25);

  const integrationWhere = {};
  if (tenantId) integrationWhere.tenantId = tenantId;

  const vaultWhere = {};
  if (tenantId) vaultWhere.tenantId = tenantId;

  const [integrations, vaultCount, vaultByProvider] = await Promise.all([
    prisma.integration.findMany({
      where: integrationWhere,
      select: {
        id: true,
        tenantId: true,
        provider: true,
        status: true,
        updatedAt: true,
        accessToken: true,
        refreshToken: true,
        accessTokenEncrypted: true,
        settings: true,
        config: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 3000,
    }),
    prisma.credentialVault.count({ where: vaultWhere }),
    prisma.credentialVault.groupBy({
      by: ['provider'],
      where: vaultWhere,
      _count: { _all: true },
    }),
  ]);

  const byProvider = {};
  const exposedItems = [];
  let rawColumnsCount = 0;
  let rawSettingsCount = 0;
  let rawConfigCount = 0;
  let withCredentialRefCount = 0;

  for (const integration of integrations) {
    const exposure = classifyIntegrationExposure(integration);
    const provider = integration.provider || 'UNKNOWN';

    if (!byProvider[provider]) {
      byProvider[provider] = {
        total: 0,
        exposed: 0,
        withCredentialRef: 0,
      };
    }

    byProvider[provider].total += 1;

    if (exposure.hasCredentialRef) {
      withCredentialRefCount += 1;
      byProvider[provider].withCredentialRef += 1;
    }

    if (exposure.hasRawColumns) rawColumnsCount += 1;
    if (exposure.hasRawSettings) rawSettingsCount += 1;
    if (exposure.hasRawConfig) rawConfigCount += 1;

    if (exposure.isExposed) {
      byProvider[provider].exposed += 1;
      exposedItems.push({
        id: integration.id,
        tenantId: integration.tenantId,
        provider,
        status: integration.status,
        updatedAt: integration.updatedAt,
        exposure,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    totals: {
      integrations: integrations.length,
      integrationsExposed: exposedItems.length,
      integrationsWithCredentialRef: withCredentialRefCount,
      vaultEntries: vaultCount,
      rawColumns: rawColumnsCount,
      rawSettings: rawSettingsCount,
      rawConfig: rawConfigCount,
    },
    byProvider,
    vaultByProvider: vaultByProvider.reduce((acc, row) => {
      acc[row.provider || 'UNKNOWN'] = row._count._all;
      return acc;
    }, {}),
    samples: {
      exposedIntegrations: exposedItems.slice(0, sampleSize),
    },
  };
}

module.exports = {
  RAW_CONFIG_KEYS,
  classifyIntegrationExposure,
  getCredentialsComplianceReport,
};
