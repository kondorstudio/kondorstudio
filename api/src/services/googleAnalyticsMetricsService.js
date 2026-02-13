const { google } = require('googleapis');
const { getServiceAccountAccessToken } = require('../lib/googleServiceAccount');

const DATA_API_VERSION = ['v1beta', 'v1alpha'].includes(process.env.GA4_DATA_API_VERSION)
  ? process.env.GA4_DATA_API_VERSION
  : 'v1beta';
const GA4_HTTP_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.GA4_HTTP_TIMEOUT_MS || process.env.FETCH_TIMEOUT_MS || 20_000),
);

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[googleAnalyticsMetricsService]', ...args);
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

const METRIC_MAP = {
  sessions: 'sessions',
  users: 'totalUsers',
  totalUsers: 'totalUsers',
  activeUsers: 'activeUsers',
  newUsers: 'newUsers',
  pageviews: 'screenPageViews',
  screenPageViews: 'screenPageViews',
  conversions: 'conversions',
  revenue: 'totalRevenue',
  totalRevenue: 'totalRevenue',
  engagementRate: 'engagementRate',
  bounceRate: 'bounceRate',
  eventCount: 'eventCount',
};

function mapMetric(metric) {
  const raw = String(metric || '').trim();
  if (!raw) return null;
  if (raw.includes('.')) return { key: raw, gaName: raw };
  const gaName = METRIC_MAP[raw] || raw;
  return { key: raw, gaName };
}

function buildMetricList(metricTypes, credentials) {
  const fromInput = normalizeList(metricTypes).map(mapMetric).filter(Boolean);
  if (fromInput.length) return fromInput;

  const fromCredentials = normalizeList(credentials.metrics).map(mapMetric).filter(Boolean);
  if (fromCredentials.length) return fromCredentials;

  if (process.env.GA_DEFAULT_METRICS) {
    const fromEnv = normalizeList(process.env.GA_DEFAULT_METRICS).map(mapMetric).filter(Boolean);
    if (fromEnv.length) return fromEnv;
  }

  return [
    { key: 'sessions', gaName: 'sessions' },
    { key: 'users', gaName: 'totalUsers' },
    { key: 'pageviews', gaName: 'screenPageViews' },
    { key: 'conversions', gaName: 'conversions' },
    { key: 'revenue', gaName: 'totalRevenue' },
  ];
}

function parseDateRange(options) {
  const range = options.range || (options.since || options.until ? options : null) || {};
  const since = range.since || options.rangeFrom || null;
  const until = range.until || options.rangeTo || null;
  if (since || until) {
    return {
      since: since || until,
      until: until || since,
    };
  }

  const days = Number(options.rangeDays || 30);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    since: from.toISOString().slice(0, 10),
    until: to.toISOString().slice(0, 10),
  };
}

function formatGaDate(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return raw;
}

async function fetchAccountMetrics(integration, options = {}) {
  if (!integration) {
    safeLog('fetchAccountMetrics chamado sem integration');
    return [];
  }

  let credentials = {};
  try {
    credentials = integration.credentialsJson
      ? JSON.parse(integration.credentialsJson) || {}
      : (integration.settings && typeof integration.settings === 'object' ? integration.settings : {});
  } catch (err) {
    safeLog('Erro ao parsear credenciais', err?.message || err);
    return [];
  }

  const propertyId =
    credentials.propertyId ||
    credentials.property_id ||
    (integration.settings && integration.settings.propertyId) ||
    (integration.settings && integration.settings.property_id);

  if (!propertyId) {
    safeLog('PropertyId ausente para Google Analytics');
    return [];
  }

  const metricList = buildMetricList(options.metricTypes, credentials);
  if (!metricList.length) {
    safeLog('Nenhuma métrica configurada para Google Analytics');
    return [];
  }

  const range = parseDateRange(options);
  const granularity = options.granularity || 'day';
  const includeDate = granularity === 'day' || granularity === 'date';

  let accessToken = credentials.accessToken || integration.accessToken || null;

  if (!accessToken && credentials.serviceAccountJson) {
    try {
      const serviceAccount =
        typeof credentials.serviceAccountJson === 'string'
          ? JSON.parse(credentials.serviceAccountJson)
          : credentials.serviceAccountJson;
      accessToken = await getServiceAccountAccessToken(serviceAccount, [
        'https://www.googleapis.com/auth/analytics.readonly',
      ]);
    } catch (err) {
      safeLog('Falha ao ler serviceAccountJson', err?.message || err);
    }
  }

  if (!accessToken) {
    safeLog('AccessToken ausente para Google Analytics');
    return [];
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const client = google.analyticsdata({
      version: DATA_API_VERSION,
      auth: oauth2Client,
    });

    const requestBody = {
      dateRanges: [
        {
          startDate: range.since,
          endDate: range.until,
        },
      ],
      metrics: metricList.map((metric) => ({ name: metric.gaName })),
    };

    if (includeDate) {
      requestBody.dimensions = [{ name: 'date' }];
    }

    const response = await client.properties.runReport(
      {
        property: `properties/${String(propertyId)}`,
        requestBody,
      },
      { timeout: GA4_HTTP_TIMEOUT_MS },
    );

    const json = response?.data || {};
    const rows = Array.isArray(json.rows) ? json.rows : [];

    if (!rows.length) {
      safeLog('GA retornou zero linhas de resultados');
      return [];
    }

    const metrics = [];

    for (const row of rows) {
      const dateValue = includeDate
        ? formatGaDate(row.dimensionValues?.[0]?.value)
        : null;
      const values = Array.isArray(row.metricValues) ? row.metricValues : [];

      metricList.forEach((metric, idx) => {
        const rawVal = values[idx]?.value;
        if (rawVal === undefined || rawVal === null) return;
        const numVal = Number(rawVal);
        if (Number.isNaN(numVal)) return;

        metrics.push({
          name: metric.key,
          value: numVal,
          collectedAt: dateValue,
          meta: {
            provider: 'google_analytics',
            rawMetric: metric.gaName,
          },
        });
      });
    }

    safeLog('GA metrics obtidas', {
      integrationId: integration.id,
      count: metrics.length,
    });

    return metrics;
  } catch (err) {
    safeLog('Erro ao chamar GA Data API', err?.message || err);
    return [];
  }
}

module.exports = {
  fetchAccountMetrics,
};
