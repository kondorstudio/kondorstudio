const { decrypt } = require('../../utils/crypto');

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function getIntegrationSettings(integration) {
  if (!integration) return {};
  if (isPlainObject(integration.settings)) return integration.settings;
  return {};
}

function getIntegrationConfig(integration) {
  if (!integration) return {};
  if (isPlainObject(integration.config)) return integration.config;
  return {};
}

function resolveAccessToken(integration) {
  if (!integration) return null;
  const settings = getIntegrationSettings(integration);
  if (settings.accessToken) return String(settings.accessToken);
  if (settings.access_token) return String(settings.access_token);
  if (integration.accessToken) return String(integration.accessToken);
  if (integration.accessTokenEncrypted) {
    try {
      return decrypt(integration.accessTokenEncrypted);
    } catch (_) {
      return null;
    }
  }
  const config = getIntegrationConfig(integration);
  if (config.accessToken) return String(config.accessToken);
  if (config.access_token) return String(config.access_token);
  return null;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeMetricsPayload(rows = []) {
  const seriesMap = new Map();
  const totals = {};

  for (const row of rows) {
    if (!row) continue;
    const metric = row.name || row.metric || row.key;
    if (!metric) continue;
    const value = Number(row.value || 0);
    if (Number.isNaN(value)) continue;

    if (!totals[metric]) totals[metric] = 0;
    totals[metric] += value;

    if (!row.collectedAt) continue;
    const dateKey = String(row.collectedAt);
    if (!seriesMap.has(metric)) seriesMap.set(metric, new Map());
    const metricSeries = seriesMap.get(metric);
    metricSeries.set(dateKey, (metricSeries.get(dateKey) || 0) + value);
  }

  const series = Array.from(seriesMap.entries()).map(([metric, points]) => {
    const data = Array.from(points.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([x, y]) => ({ x, y }));
    return { metric, data };
  });

  return {
    series,
    table: [],
    totals,
  };
}

module.exports = {
  getIntegrationSettings,
  getIntegrationConfig,
  resolveAccessToken,
  normalizeList,
  normalizeMetricsPayload,
};
