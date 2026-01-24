const crypto = require('crypto');
const {
  getIntegrationSettings,
  normalizeMetricsPayload,
} = require('./providerUtils');
const googleAnalyticsMetricsService = require('../../../services/googleAnalyticsMetricsService');
const ga4DataService = require('../../../services/ga4DataService');
const { resolveGa4IntegrationContext } = require('../../../services/ga4IntegrationResolver');

function normalizeString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function buildDimensionFilterFromEntries(entries) {
  const filtered = entries.filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && !value.trim()) return false;
    if (Array.isArray(value) && !value.length) return false;
    return true;
  });

  if (!filtered.length) return null;

  const expressions = filtered.map(([fieldName, value]) => {
    if (Array.isArray(value)) {
      return {
        filter: {
          fieldName,
          inListFilter: {
            values: value.map((item) => String(item)),
            caseSensitive: false,
          },
        },
      };
    }
    return {
      filter: {
        fieldName,
        stringFilter: {
          matchType: 'EXACT',
          value: String(value),
          caseSensitive: false,
        },
      },
    };
  });

  if (expressions.length === 1) return expressions[0];
  return { andGroup: { expressions } };
}

function resolveGa4Filters(filters) {
  if (!filters || typeof filters !== 'object') {
    return { dimensionFilter: null, metricFilter: null };
  }

  const direct =
    filters.ga4 && typeof filters.ga4 === 'object' ? filters.ga4 : null;

  const dimensionFilter =
    filters.dimensionFilter ||
    filters.ga4DimensionFilter ||
    direct?.dimensionFilter ||
    null;
  const metricFilter =
    filters.metricFilter ||
    filters.ga4MetricFilter ||
    direct?.metricFilter ||
    null;

  if (dimensionFilter || metricFilter) {
    return {
      dimensionFilter: dimensionFilter || null,
      metricFilter: metricFilter || null,
    };
  }

  const reserved = new Set([
    'dimensionFilter',
    'metricFilter',
    'ga4DimensionFilter',
    'ga4MetricFilter',
    'ga4',
    'compareMode',
    'compareDateFrom',
    'compareDateTo',
    'compare',
  ]);
  const entries = Object.entries(filters).filter(([key]) => !reserved.has(key));
  return {
    dimensionFilter: buildDimensionFilterFromEntries(entries),
    metricFilter: null,
  };
}

function ensureDimension(list, value, { prepend } = {}) {
  const next = Array.isArray(list) ? [...list] : [];
  if (!value) return next;
  if (next.includes(value)) return next;
  if (prepend) {
    next.unshift(value);
  } else {
    next.push(value);
  }
  return next;
}

function buildGa4Dimensions({ breakdown, widgetType }) {
  let dimensions = [];
  if (breakdown) dimensions = ensureDimension(dimensions, String(breakdown));
  if (widgetType === 'LINE' || (!breakdown && widgetType === 'BAR')) {
    dimensions = ensureDimension(dimensions, 'date', { prepend: true });
  }
  return dimensions;
}

function resolveNumericLimit(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function resolveGa4Limit({ widgetType, breakdown, options }) {
  const explicit =
    resolveNumericLimit(options?.ga4Limit) ??
    resolveNumericLimit(options?.limit) ??
    null;
  if (explicit) return explicit;

  if (!breakdown && (widgetType === 'BAR' || widgetType === 'PIE')) {
    return null;
  }

  if (widgetType === 'PIE') return 12;
  if (widgetType === 'BAR') return 12;
  if (widgetType === 'TABLE') return 100;
  return null;
}

function buildGa4OrderBys({ widgetType, metrics, dimensions, options }) {
  const manual = options?.ga4OrderBys || options?.orderBys;
  if (Array.isArray(manual) && manual.length) return manual;

  if (dimensions.includes('date')) {
    return [
      {
        dimension: {
          dimensionName: 'date',
        },
      },
    ];
  }

  const primaryMetric = metrics?.[0];
  if (!primaryMetric) return null;

  if (widgetType === 'BAR' || widgetType === 'PIE' || widgetType === 'TABLE') {
    return [
      {
        desc: true,
        metric: {
          metricName: primaryMetric,
        },
      },
    ];
  }

  return null;
}

function buildGa4DateRanges(querySpec = {}) {
  const dateFrom = normalizeString(querySpec.dateFrom);
  const dateTo = normalizeString(querySpec.dateTo);
  if (!dateFrom && !dateTo) return null;
  return [
    {
      startDate: dateFrom || dateTo,
      endDate: dateTo || dateFrom,
    },
  ];
}

function buildTotals(metricHeaders, totals, rows) {
  const totalsRow = Array.isArray(totals) ? totals[0] : null;
  if (totalsRow && Array.isArray(totalsRow.metrics)) {
    const map = {};
    metricHeaders.forEach((metric, idx) => {
      const raw = totalsRow.metrics?.[idx];
      const value = Number(raw || 0);
      map[metric] = Number.isFinite(value) ? value : 0;
    });
    return map;
  }

  const fallback = {};
  metricHeaders.forEach((metric) => {
    fallback[metric] = 0;
  });
  rows.forEach((row) => {
    metricHeaders.forEach((metric, idx) => {
      const value = Number(row.metrics?.[idx] || 0);
      if (!Number.isFinite(value)) return;
      fallback[metric] += value;
    });
  });
  return fallback;
}

function buildSeries(dimensionHeaders, metricHeaders, rows) {
  if (!dimensionHeaders.length) return [];
  const dateIndex = dimensionHeaders.indexOf('date');
  const primaryIndex = dateIndex >= 0 ? dateIndex : 0;
  const secondaryIndex = dimensionHeaders.length > 1 ? (primaryIndex === 0 ? 1 : 0) : null;
  const seriesMap = new Map();

  rows.forEach((row) => {
    const x = row.dimensions?.[primaryIndex];
    if (x === null || x === undefined) return;
    const secondaryValue = secondaryIndex !== null ? row.dimensions?.[secondaryIndex] : null;
    metricHeaders.forEach((metric, metricIndex) => {
      const value = Number(row.metrics?.[metricIndex] || 0);
      if (!Number.isFinite(value)) return;
      const name = secondaryValue ? `${secondaryValue} • ${metric}` : metric;
      if (!seriesMap.has(name)) seriesMap.set(name, new Map());
      const points = seriesMap.get(name);
      points.set(x, (points.get(x) || 0) + value);
    });
  });

  return Array.from(seriesMap.entries()).map(([name, points]) => ({
    name,
    metric: name,
    data: Array.from(points.entries())
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([x, y]) => ({ x, y })),
  }));
}

function buildTable(dimensionHeaders, metricHeaders, rows) {
  if (!rows.length) return [];
  return rows.map((row) => {
    const item = {};
    dimensionHeaders.forEach((dimension, idx) => {
      item[dimension] = row.dimensions?.[idx] ?? null;
    });
    metricHeaders.forEach((metric, idx) => {
      const value = Number(row.metrics?.[idx] || 0);
      item[metric] = Number.isFinite(value) ? value : 0;
    });
    return item;
  });
}

function buildPie(dimensionHeaders, metricHeaders, rows) {
  if (!rows.length || !dimensionHeaders.length || !metricHeaders.length) return [];
  const dateIndex = dimensionHeaders.indexOf('date');
  const dimensionIndex = dimensionHeaders.findIndex(
    (dimension, idx) => idx !== dateIndex,
  );
  if (dimensionIndex < 0) return [];

  const bucket = new Map();
  rows.forEach((row) => {
    const name = row.dimensions?.[dimensionIndex];
    if (!name) return;
    const value = Number(row.metrics?.[0] || 0);
    if (!Number.isFinite(value)) return;
    bucket.set(name, (bucket.get(name) || 0) + value);
  });

  return Array.from(bucket.entries()).map(([name, value]) => ({
    name,
    value,
  }));
}

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

async function fetchAccountSummaries(accessToken) {
  const summaries = [];
  let pageToken = null;
  const pageSize = Number(process.env.GA4_ADMIN_PAGE_SIZE || 200);

  do {
    const url = new URL('https://analyticsadmin.googleapis.com/v1/accountSummaries');
    if (pageSize) url.searchParams.set('pageSize', String(pageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    try {
      /* eslint-disable no-undef */
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return summaries;
      const json = await res.json();
      const batch = Array.isArray(json.accountSummaries)
        ? json.accountSummaries
        : [];
      summaries.push(...batch);
      pageToken = json.nextPageToken || null;
    } catch (_) {
      return summaries;
    }
  } while (pageToken);

  return summaries;
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

  try {
    const summaries = await fetchAccountSummaries(accessToken);
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
  if (!connection) {
    return { series: [], table: [], totals: {}, meta: { mocked: true } };
  }

  if (connection.integration) {
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

  const tenantId = connection.tenantId;
  const propertyId =
    connection.externalAccountId ||
    connection.meta?.propertyId ||
    null;

  if (!tenantId || !propertyId) {
    return { series: [], table: [], totals: {}, meta: { source: 'GA4', mocked: true } };
  }

  const resolved = await resolveGa4IntegrationContext({
    tenantId,
    propertyId,
    integrationId: connection.meta?.ga4IntegrationId,
    userId: connection.meta?.ga4UserId,
  });

  const metrics = Array.isArray(querySpec.metrics) ? querySpec.metrics : [];
  if (!metrics.length) {
    return { series: [], table: [], totals: {}, meta: { source: 'GA4', mocked: true } };
  }

  const breakdown = normalizeString(querySpec.breakdown);
  const widgetType = normalizeString(querySpec.widgetType || querySpec.type);
  const dimensions = buildGa4Dimensions({ breakdown, widgetType });
  const dateRanges = buildGa4DateRanges(querySpec);
  const { dimensionFilter, metricFilter } = resolveGa4Filters(querySpec.filters);
  const limit = resolveGa4Limit({ widgetType, breakdown, options: querySpec.options });
  const orderBys = buildGa4OrderBys({
    widgetType,
    metrics,
    dimensions,
    options: querySpec.options,
  });

  const payload = {
    metrics,
    dimensions,
  };
  if (dateRanges) payload.dateRanges = dateRanges;
  if (dimensionFilter) payload.dimensionFilter = dimensionFilter;
  if (metricFilter) payload.metricFilter = metricFilter;
  if (orderBys) payload.orderBys = orderBys;
  if (limit) payload.limit = limit;

  const response = await ga4DataService.runReport({
    tenantId,
    userId: resolved.userId,
    propertyId,
    payload,
    rateKey: [tenantId, resolved.userId, propertyId].join(':'),
  });

  const dimensionHeaders = Array.isArray(response.dimensionHeaders)
    ? response.dimensionHeaders
    : [];
  const metricHeaders = Array.isArray(response.metricHeaders)
    ? response.metricHeaders
    : metrics;
  const rows = Array.isArray(response.rows) ? response.rows : [];

  const totals = buildTotals(metricHeaders, response.totals, rows);
  const series = buildSeries(dimensionHeaders, metricHeaders, rows);
  const table = buildTable(dimensionHeaders, metricHeaders, rows);
  const pie = buildPie(dimensionHeaders, metricHeaders, rows);

  return {
    series,
    table,
    totals,
    pie,
    meta: { source: 'GA4', propertyId },
  };
}

async function checkCompatibility(connection, querySpec = {}) {
  if (!connection) {
    return {
      compatible: true,
      metrics: [],
      dimensions: [],
      incompatibleMetrics: [],
      incompatibleDimensions: [],
      meta: { source: 'GA4', skipped: true },
    };
  }

  const tenantId = connection.tenantId;
  const propertyId =
    connection.externalAccountId ||
    connection.meta?.propertyId ||
    null;

  if (!tenantId || !propertyId) {
    const err = new Error('Conexao GA4 sem propertyId');
    err.status = 400;
    throw err;
  }

  const metrics = Array.isArray(querySpec.metrics) ? querySpec.metrics : [];
  if (!metrics.length) {
    return {
      compatible: true,
      metrics: [],
      dimensions: [],
      incompatibleMetrics: [],
      incompatibleDimensions: [],
      meta: { source: 'GA4', skipped: true },
    };
  }

  const breakdown = normalizeString(querySpec.breakdown);
  const widgetType = normalizeString(querySpec.widgetType || querySpec.type);
  const dimensions = buildGa4Dimensions({ breakdown, widgetType });
  const { dimensionFilter, metricFilter } = resolveGa4Filters(querySpec.filters);

  const resolved = await resolveGa4IntegrationContext({
    tenantId,
    propertyId,
    integrationId: connection.meta?.ga4IntegrationId,
    userId: connection.meta?.ga4UserId,
  });

  const response = await ga4DataService.checkCompatibility({
    tenantId,
    userId: resolved.userId,
    propertyId,
    payload: {
      metrics,
      dimensions,
      dimensionFilter,
      metricFilter,
    },
    rateKey: [tenantId, resolved.userId, propertyId].join(':'),
  });

  return {
    ...response,
    metrics,
    dimensions,
    meta: { source: 'GA4', propertyId },
  };
}

module.exports = {
  listSelectableAccounts,
  queryMetrics,
  checkCompatibility,
};
