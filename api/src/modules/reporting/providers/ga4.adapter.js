const crypto = require('crypto');
const {
  getIntegrationSettings,
  normalizeMetricsPayload,
} = require('./providerUtils');
const googleAnalyticsMetricsService = require('../../services/googleAnalyticsMetricsService');

function base64UrlEncode(input) {
  const value = typeof input === 'string' ? input : JSON.stringify(input);
  return Buffer.from(value)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function fetchServiceAccountToken(serviceAccount, scopes) {
  if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key) {
    return null;
  }

  const tokenUri = serviceAccount.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: scopes.join(' '),
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };

  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(serviceAccount.private_key, 'base64');
  const encodedSignature = signature
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const assertion = `${unsignedToken}.${encodedSignature}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  try {
    /* eslint-disable no-undef */
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.access_token || null;
  } catch (_) {
    return null;
  }
}

async function listSelectableAccounts(integration) {
  const settings = getIntegrationSettings(integration);
  const propertyId = settings.propertyId || settings.property_id || null;

  if (propertyId) {
    return [
      {
        id: String(propertyId),
        displayName: `Property ${propertyId}`,
        meta: { propertyId: String(propertyId) },
      },
    ];
  }

  let accessToken = settings.accessToken || settings.access_token || null;

  if (!accessToken && settings.serviceAccountJson) {
    try {
      const serviceAccount =
        typeof settings.serviceAccountJson === 'string'
          ? JSON.parse(settings.serviceAccountJson)
          : settings.serviceAccountJson;
      accessToken = await fetchServiceAccountToken(serviceAccount, [
        'https://www.googleapis.com/auth/analytics.readonly',
      ]);
    } catch (_) {
      accessToken = null;
    }
  }

  if (!accessToken) return [];

  const url = 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries';

  try {
    /* eslint-disable no-undef */
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const summaries = Array.isArray(json.accountSummaries) ? json.accountSummaries : [];
    const properties = [];
    summaries.forEach((summary) => {
      const props = Array.isArray(summary.propertySummaries)
        ? summary.propertySummaries
        : [];
      props.forEach((prop) => {
        const id = prop.property ? prop.property.replace('properties/', '') : null;
        if (!id) return;
        properties.push({
          id: String(id),
          displayName: prop.displayName || `Property ${id}`,
          meta: { propertyId: String(id), accountId: summary.account || null },
        });
      });
    });
    return properties;
  } catch (_) {
    return [];
  }
}

async function queryMetrics(connection, querySpec = {}) {
  if (!connection || !connection.integration) {
    return { series: [], table: [], totals: {}, meta: { mocked: true } };
  }

  const integration = {
    ...connection.integration,
    settings: {
      ...(connection.integration.settings || {}),
      propertyId: connection.externalAccountId,
      property_id: connection.externalAccountId,
    },
  };

  const range = {
    since: querySpec?.dateFrom || querySpec?.since || null,
    until: querySpec?.dateTo || querySpec?.until || null,
  };

  const metrics = Array.isArray(querySpec.metrics) ? querySpec.metrics : null;
  const rows = await googleAnalyticsMetricsService.fetchAccountMetrics(integration, {
    range,
    metricTypes: metrics,
    granularity: querySpec.granularity || 'day',
  });

  const normalized = normalizeMetricsPayload(rows || []);
  return { ...normalized, meta: { source: 'GA4' } };
}

module.exports = {
  listSelectableAccounts,
  queryMetrics,
};
