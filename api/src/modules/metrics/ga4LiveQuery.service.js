const ga4DataService = require('../../services/ga4DataService');
const { resolveGa4IntegrationContext } = require('../../services/ga4IntegrationResolver');

const SUPPORTED_LIVE_METRICS = new Set(['sessions', 'revenue', 'conversions', 'leads']);
const SUPPORTED_LIVE_DIMENSIONS = new Set(['date', 'campaign_id', 'platform', 'account_id']);
const PLATFORM_GA4 = 'GA4';
const DIMENSION_CAMPAIGN_PRIMARY = 'campaignId';
const DIMENSION_CAMPAIGN_FALLBACK = 'campaignName';
const DIMENSION_DELIMITER = '\u001f';

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function uniqueStrings(list = [], normalizer = (value) => String(value || '')) {
  const out = [];
  const seen = new Set();
  list.forEach((entry) => {
    const value = String(normalizer(entry) || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
}

function normalizePlatform(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
}

function normalizeMetrics(metrics = []) {
  return uniqueStrings(metrics, (entry) => String(entry || '').trim().toLowerCase());
}

function normalizeDimensions(dimensions = []) {
  return uniqueStrings(dimensions, (entry) => String(entry || '').trim().toLowerCase());
}

function normalizeFilterValues(filters = [], field) {
  const values = [];
  (filters || []).forEach((filter) => {
    if (!filter || filter.field !== field) return;
    if (filter.op === 'eq') {
      values.push(String(filter.value || '').trim());
      return;
    }
    if (filter.op === 'in') {
      toArray(filter.value).forEach((entry) => {
        values.push(String(entry || '').trim());
      });
    }
  });
  return uniqueStrings(values);
}

function extractPlatformFilters(filters = []) {
  const values = new Set();
  let hasPlatformFilter = false;
  (filters || []).forEach((filter) => {
    if (!filter || filter.field !== 'platform') return;
    hasPlatformFilter = true;
    if (filter.op === 'eq') {
      const normalized = normalizePlatform(filter.value);
      if (normalized) values.add(normalized);
      return;
    }
    if (filter.op === 'in') {
      toArray(filter.value).forEach((entry) => {
        const normalized = normalizePlatform(entry);
        if (normalized) values.add(normalized);
      });
    }
  });
  return { hasPlatformFilter, values };
}

function collectRequiredPlatforms(requiredPlatforms = []) {
  const required = new Set();
  toArray(requiredPlatforms).forEach((entry) => {
    const normalized = normalizePlatform(entry);
    if (normalized) required.add(normalized);
  });
  return required;
}

function isGa4Only(set) {
  if (!set || !set.size) return false;
  return set.size === 1 && set.has(PLATFORM_GA4);
}

function isGa4LiveEligible(payload = {}, requiredPlatformsResolved = []) {
  const filterPlatforms = extractPlatformFilters(payload?.filters || []);
  if (filterPlatforms.hasPlatformFilter) {
    return isGa4Only(filterPlatforms.values);
  }

  const resolvedRequired = collectRequiredPlatforms(
    requiredPlatformsResolved?.length ? requiredPlatformsResolved : payload?.requiredPlatforms,
  );
  if (!resolvedRequired.size) return false;
  return isGa4Only(resolvedRequired);
}

function buildFunctionalError(code, message, details = null) {
  const err = new Error(message);
  err.code = code;
  err.status = 400;
  err.details = details;
  return err;
}

function buildInListExpression(fieldName, values = []) {
  const normalizedValues = uniqueStrings(values);
  if (!normalizedValues.length) return null;
  if (normalizedValues.length === 1) {
    return {
      filter: {
        fieldName,
        stringFilter: {
          matchType: 'EXACT',
          value: normalizedValues[0],
          caseSensitive: false,
        },
      },
    };
  }
  return {
    filter: {
      fieldName,
      inListFilter: {
        values: normalizedValues,
        caseSensitive: false,
      },
    },
  };
}

function combineDimensionFilters(filters = []) {
  const valid = (filters || []).filter(Boolean);
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];
  return {
    andGroup: {
      expressions: valid,
    },
  };
}

function buildGaDimensions(requestedDimensions, campaignDimension, includeCampaignForFilter) {
  const dimensions = [];
  requestedDimensions.forEach((dimension) => {
    if (dimension === 'date' && !dimensions.includes('date')) {
      dimensions.push('date');
    }
    if (dimension === 'campaign_id' && campaignDimension && !dimensions.includes(campaignDimension)) {
      dimensions.push(campaignDimension);
    }
  });
  if (
    includeCampaignForFilter &&
    campaignDimension &&
    !dimensions.includes(campaignDimension)
  ) {
    dimensions.push(campaignDimension);
  }
  return dimensions;
}

function buildDimensionKey(values = []) {
  return values.map((value) => (value === null || value === undefined ? '' : String(value))).join(DIMENSION_DELIMITER);
}

function compareValues(a, b) {
  const aNum = Number(a);
  const bNum = Number(b);
  const aIsNum = Number.isFinite(aNum);
  const bIsNum = Number.isFinite(bNum);
  if (aIsNum && bIsNum) {
    if (aNum === bNum) return 0;
    return aNum > bNum ? 1 : -1;
  }
  const aStr = String(a ?? '');
  const bStr = String(b ?? '');
  return aStr.localeCompare(bStr);
}

function applySort(rows, sort) {
  if (!sort?.field) return rows;
  const field = String(sort.field || '').trim();
  if (!field) return rows;
  const direction = String(sort.direction || 'asc').toLowerCase() === 'desc' ? -1 : 1;
  return [...rows].sort((left, right) => compareValues(left?.[field], right?.[field]) * direction);
}

function applyCapAndPagination(rows, { limit, pagination }) {
  let scoped = Array.isArray(rows) ? [...rows] : [];
  const cap = toPositiveInt(limit);
  if (cap) {
    scoped = scoped.slice(0, cap);
  }

  if (!pagination || typeof pagination !== 'object') {
    return scoped;
  }

  const pageSizeMode = toPositiveInt(pagination.pageSize);
  const pageMode = toPositiveInt(pagination.page);
  if (pageSizeMode || pageMode) {
    const pageSize = pageSizeMode || scoped.length || 1;
    const page = pageMode || 1;
    const offset = Math.max(0, (page - 1) * pageSize);
    return scoped.slice(offset, offset + pageSize);
  }

  const offsetMode = Math.max(0, Number(pagination.offset || 0));
  const limitMode = toPositiveInt(pagination.limit);
  if (limitMode || offsetMode) {
    const pageSize = limitMode || scoped.length || 1;
    return scoped.slice(offsetMode, offsetMode + pageSize);
  }

  return scoped;
}

function createEmptyResult(metrics = [], compareRange = null) {
  const totals = {};
  metrics.forEach((metric) => {
    totals[metric] = 0;
  });
  return {
    rows: [],
    totals,
    compare: compareRange
      ? {
          dateRange: compareRange,
          totals: { ...totals },
        }
      : null,
  };
}

function mapErrorDetailsToInternalMetrics(invalidMetrics = [], conversionsGaMetricName) {
  const out = new Set();
  invalidMetrics.forEach((metric) => {
    if (metric === 'sessions') out.add('sessions');
    if (metric === 'totalRevenue') out.add('revenue');
    if (metric === conversionsGaMetricName || metric === 'conversions' || metric === 'keyEvents') {
      out.add('conversions');
    }
    if (metric === 'eventCount') out.add('leads');
  });
  return Array.from(out);
}

function ensureSupportedMetrics(metrics = []) {
  const unsupported = metrics.filter((metric) => !SUPPORTED_LIVE_METRICS.has(metric));
  if (!unsupported.length) return;
  throw buildFunctionalError(
    'GA4_UNSUPPORTED_METRICS',
    'Métricas não suportadas para consulta direta no GA4',
    {
      unsupportedMetrics: unsupported,
      supportedMetrics: Array.from(SUPPORTED_LIVE_METRICS),
    },
  );
}

function ensureSupportedDimensions(dimensions = []) {
  const unsupported = dimensions.filter((dimension) => !SUPPORTED_LIVE_DIMENSIONS.has(dimension));
  if (!unsupported.length) return;
  throw buildFunctionalError(
    'GA4_UNSUPPORTED_DIMENSIONS',
    'Dimensões não suportadas para consulta direta no GA4',
    {
      unsupportedDimensions: unsupported,
      supportedDimensions: Array.from(SUPPORTED_LIVE_DIMENSIONS),
    },
  );
}

function buildRowsFromBuckets({
  buckets,
  requestedDimensions,
  requestedMetrics,
  propertyId,
}) {
  const rows = [];
  buckets.forEach((bucket) => {
    const row = {};
    requestedDimensions.forEach((dimension) => {
      if (dimension === 'platform') {
        row[dimension] = PLATFORM_GA4;
        return;
      }
      if (dimension === 'account_id') {
        row[dimension] = String(propertyId);
        return;
      }
      row[dimension] = bucket.dimensions?.[dimension] ?? null;
    });
    requestedMetrics.forEach((metric) => {
      row[metric] = toNumber(bucket.metrics?.[metric]);
    });
    rows.push(row);
  });
  return rows;
}

function buildTotalsFromRows(rows = [], requestedMetrics = []) {
  const totals = {};
  requestedMetrics.forEach((metric) => {
    totals[metric] = 0;
  });
  rows.forEach((row) => {
    requestedMetrics.forEach((metric) => {
      totals[metric] += toNumber(row?.[metric]);
    });
  });
  return totals;
}

function appendReportToBuckets({
  buckets,
  report,
  metricMapping,
  requestedDimensions,
  campaignDimension,
}) {
  if (!report || typeof report !== 'object') return;
  const dimensionHeaders = Array.isArray(report.dimensionHeaders) ? report.dimensionHeaders : [];
  const metricHeaders = Array.isArray(report.metricHeaders) ? report.metricHeaders : [];
  const rows = Array.isArray(report.rows) ? report.rows : [];

  const dimensionIndex = new Map();
  dimensionHeaders.forEach((name, index) => {
    dimensionIndex.set(String(name), index);
  });
  const metricIndex = new Map();
  metricHeaders.forEach((name, index) => {
    metricIndex.set(String(name), index);
  });

  rows.forEach((row) => {
    const dimensionValues = Array.isArray(row?.dimensions) ? row.dimensions : [];
    const metricValues = Array.isArray(row?.metrics) ? row.metrics : [];
    const resolvedDimensions = {};

    requestedDimensions.forEach((dimension) => {
      if (dimension === 'date') {
        const idx = dimensionIndex.get('date');
        resolvedDimensions.date = idx === undefined ? null : dimensionValues[idx] ?? null;
      }
      if (dimension === 'campaign_id') {
        const idx = campaignDimension ? dimensionIndex.get(campaignDimension) : undefined;
        resolvedDimensions.campaign_id = idx === undefined ? null : dimensionValues[idx] ?? null;
      }
    });

    const keyValues = requestedDimensions.map((dimension) => resolvedDimensions[dimension] ?? null);
    const key = buildDimensionKey(keyValues);
    const current = buckets.get(key) || { dimensions: resolvedDimensions, metrics: {} };

    Object.entries(metricMapping || {}).forEach(([gaMetric, internalMetric]) => {
      const idx = metricIndex.get(String(gaMetric));
      if (idx === undefined) return;
      const value = toNumber(metricValues[idx]);
      current.metrics[internalMetric] = toNumber(current.metrics[internalMetric]) + value;
    });

    buckets.set(key, current);
  });
}

async function runGa4Report({
  tenantId,
  userId,
  propertyId,
  metrics,
  dimensions,
  dateRange,
  dimensionFilter,
  rateKey,
}) {
  const payload = {
    metrics,
    dimensions,
    dateRanges: [
      {
        startDate: String(dateRange.start),
        endDate: String(dateRange.end),
      },
    ],
  };
  if (dimensionFilter) {
    payload.dimensionFilter = dimensionFilter;
  }

  return ga4DataService.runReport({
    tenantId,
    userId,
    propertyId,
    payload,
    rateKey,
  });
}

async function runRangeQuery({
  tenantId,
  userId,
  propertyId,
  requestedMetrics,
  requestedDimensions,
  filters,
  dateRange,
  leadEvents,
  rateKey,
}) {
  const includeCampaignByDimension = requestedDimensions.includes('campaign_id');
  const campaignFilterValues = normalizeFilterValues(filters, 'campaign_id');
  const includeCampaignForFilter = campaignFilterValues.length > 0;
  const includesCampaign = includeCampaignByDimension || includeCampaignForFilter;
  let campaignDimension = includesCampaign ? DIMENSION_CAMPAIGN_PRIMARY : null;

  const wantsSessions = requestedMetrics.includes('sessions');
  const wantsRevenue = requestedMetrics.includes('revenue');
  const wantsConversions = requestedMetrics.includes('conversions');
  const wantsLeads = requestedMetrics.includes('leads');

  let conversionsGaMetric = wantsConversions ? 'keyEvents' : null;
  const buildMainMetricList = () => {
    const list = [];
    if (wantsSessions) list.push('sessions');
    if (wantsRevenue) list.push('totalRevenue');
    if (wantsConversions && conversionsGaMetric) list.push(conversionsGaMetric);
    return list;
  };

  const campaignFilterExpression = (fieldName) =>
    includesCampaign ? buildInListExpression(fieldName, campaignFilterValues) : null;

  const buckets = new Map();

  const runMainReport = async () => {
    let attempts = 0;
    while (attempts < 4) {
      attempts += 1;
      const mainMetrics = buildMainMetricList();
      if (!mainMetrics.length) {
        return {
          report: null,
          metricMap: {},
        };
      }

      const gaDimensions = buildGaDimensions(
        requestedDimensions,
        campaignDimension,
        includeCampaignForFilter,
      );
      const dimensionFilter = combineDimensionFilters([
        campaignFilterExpression(campaignDimension),
      ]);

      try {
        const report = await runGa4Report({
          tenantId,
          userId,
          propertyId,
          metrics: mainMetrics,
          dimensions: gaDimensions,
          dateRange,
          dimensionFilter,
          rateKey,
        });
        const metricMap = {};
        if (wantsSessions) metricMap.sessions = 'sessions';
        if (wantsRevenue) metricMap.totalRevenue = 'revenue';
        if (wantsConversions && conversionsGaMetric) {
          metricMap[conversionsGaMetric] = 'conversions';
        }
        return { report, metricMap };
      } catch (error) {
        const invalidMetrics = toArray(error?.details?.invalidMetrics).map((item) => String(item));
        const invalidDimensions = toArray(error?.details?.invalidDimensions).map((item) =>
          String(item)
        );
        let retried = false;

        if (wantsConversions && conversionsGaMetric === 'keyEvents' && invalidMetrics.includes('keyEvents')) {
          conversionsGaMetric = 'conversions';
          retried = true;
        }

        if (
          includesCampaign &&
          campaignDimension === DIMENSION_CAMPAIGN_PRIMARY &&
          invalidDimensions.includes(DIMENSION_CAMPAIGN_PRIMARY)
        ) {
          campaignDimension = DIMENSION_CAMPAIGN_FALLBACK;
          retried = true;
        }

        if (retried) continue;

        if (
          includesCampaign &&
          campaignDimension === DIMENSION_CAMPAIGN_FALLBACK &&
          invalidDimensions.includes(DIMENSION_CAMPAIGN_FALLBACK)
        ) {
          throw buildFunctionalError(
            'GA4_UNSUPPORTED_DIMENSIONS',
            'Dimensão de campanha não suportada para esta propriedade GA4',
            {
              unsupportedDimensions: ['campaign_id'],
              invalidDimensions,
            },
          );
        }

        if (
          wantsConversions &&
          conversionsGaMetric === 'conversions' &&
          invalidMetrics.includes('conversions')
        ) {
          throw buildFunctionalError(
            'GA4_UNSUPPORTED_METRICS',
            'Métrica de conversão não suportada para esta propriedade GA4',
            {
              unsupportedMetrics: ['conversions'],
              invalidMetrics,
            },
          );
        }

        if (invalidMetrics.length) {
          const unsupportedMetrics = mapErrorDetailsToInternalMetrics(
            invalidMetrics,
            conversionsGaMetric,
          );
          if (unsupportedMetrics.length) {
            throw buildFunctionalError(
              'GA4_UNSUPPORTED_METRICS',
              'Métricas não suportadas para consulta direta no GA4',
              {
                unsupportedMetrics,
                invalidMetrics,
              },
            );
          }
        }

        if (invalidDimensions.length) {
          const unsupportedDimensions = [];
          if (invalidDimensions.includes('date')) unsupportedDimensions.push('date');
          throw buildFunctionalError(
            'GA4_UNSUPPORTED_DIMENSIONS',
            'Dimensões não suportadas para consulta direta no GA4',
            {
              unsupportedDimensions,
              invalidDimensions,
            },
          );
        }

        throw error;
      }
    }

    throw buildFunctionalError(
      'GA4_UNSUPPORTED_METRICS',
      'Não foi possível resolver métricas compatíveis para GA4',
      null,
    );
  };

  const { report: mainReport, metricMap: mainMetricMap } = await runMainReport();

  if (mainReport && Object.keys(mainMetricMap).length) {
    appendReportToBuckets({
      buckets,
      report: mainReport,
      metricMapping: mainMetricMap,
      requestedDimensions,
      campaignDimension,
    });
  }

  if (wantsLeads && leadEvents.length) {
    let attempts = 0;
    while (attempts < 3) {
      attempts += 1;
      const gaDimensions = buildGaDimensions(
        requestedDimensions,
        campaignDimension,
        includeCampaignForFilter,
      );
      const eventFilter = buildInListExpression('eventName', leadEvents);
      const campaignFilter = campaignFilterExpression(campaignDimension);
      const dimensionFilter = combineDimensionFilters([campaignFilter, eventFilter]);

      try {
        const leadsReport = await runGa4Report({
          tenantId,
          userId,
          propertyId,
          metrics: ['eventCount'],
          dimensions: gaDimensions,
          dateRange,
          dimensionFilter,
          rateKey,
        });
        appendReportToBuckets({
          buckets,
          report: leadsReport,
          metricMapping: { eventCount: 'leads' },
          requestedDimensions,
          campaignDimension,
        });
        break;
      } catch (error) {
        const invalidDimensions = toArray(error?.details?.invalidDimensions).map((item) =>
          String(item)
        );

        if (
          includesCampaign &&
          campaignDimension === DIMENSION_CAMPAIGN_PRIMARY &&
          invalidDimensions.includes(DIMENSION_CAMPAIGN_PRIMARY)
        ) {
          campaignDimension = DIMENSION_CAMPAIGN_FALLBACK;
          continue;
        }

        if (
          includesCampaign &&
          campaignDimension === DIMENSION_CAMPAIGN_FALLBACK &&
          invalidDimensions.includes(DIMENSION_CAMPAIGN_FALLBACK)
        ) {
          throw buildFunctionalError(
            'GA4_UNSUPPORTED_DIMENSIONS',
            'Dimensão de campanha não suportada para esta propriedade GA4',
            {
              unsupportedDimensions: ['campaign_id'],
              invalidDimensions,
            },
          );
        }

        throw error;
      }
    }
  }

  const fullRows = buildRowsFromBuckets({
    buckets,
    requestedDimensions,
    requestedMetrics,
    propertyId,
  });
  const totals = buildTotalsFromRows(fullRows, requestedMetrics);
  const sortedRows = applySort(fullRows, null);

  return {
    rows: sortedRows,
    totals,
  };
}

async function queryGa4LiveMetrics({
  tenantId,
  propertyId,
  dateRange,
  compareRange,
  metrics = [],
  dimensions = [],
  filters = [],
  sort = null,
  pagination = null,
  limit = null,
  leadEvents = [],
}) {
  const requestedMetrics = normalizeMetrics(metrics);
  const requestedDimensions = normalizeDimensions(dimensions);

  ensureSupportedMetrics(requestedMetrics);
  ensureSupportedDimensions(requestedDimensions);

  const hasGa4Platform = (() => {
    const platformFilter = extractPlatformFilters(filters);
    if (!platformFilter.hasPlatformFilter) return true;
    return platformFilter.values.has(PLATFORM_GA4);
  })();
  if (!hasGa4Platform) {
    return createEmptyResult(requestedMetrics, compareRange);
  }

  const accountFilterValues = normalizeFilterValues(filters, 'account_id');
  if (accountFilterValues.length && !accountFilterValues.includes(String(propertyId))) {
    return createEmptyResult(requestedMetrics, compareRange);
  }

  const resolved = await resolveGa4IntegrationContext({
    tenantId,
    propertyId,
    integrationId: null,
    userId: null,
  });
  const userId = resolved?.userId;
  if (!userId) {
    const err = new Error('Contexto GA4 sem usuário resolvido');
    err.status = 400;
    err.code = 'GA4_CONTEXT_INVALID';
    throw err;
  }
  const rateKey = [tenantId, userId, String(propertyId)].join(':');

  const main = await runRangeQuery({
    tenantId,
    userId,
    propertyId,
    requestedMetrics,
    requestedDimensions,
    filters,
    dateRange,
    leadEvents: uniqueStrings(leadEvents, (value) => String(value || '').trim()),
    rateKey,
  });

  const rowsBeforeSort = Array.isArray(main.rows) ? main.rows : [];
  const rowsSorted = applySort(rowsBeforeSort, sort);
  const rows = applyCapAndPagination(rowsSorted, { limit, pagination });
  const totals = main.totals || createEmptyResult(requestedMetrics).totals;

  let compare = null;
  if (compareRange?.start && compareRange?.end) {
    const compareResult = await runRangeQuery({
      tenantId,
      userId,
      propertyId,
      requestedMetrics,
      requestedDimensions,
      filters,
      dateRange: compareRange,
      leadEvents: uniqueStrings(leadEvents, (value) => String(value || '').trim()),
      rateKey,
    });
    compare = {
      dateRange: {
        start: String(compareRange.start),
        end: String(compareRange.end),
      },
      totals: compareResult.totals || createEmptyResult(requestedMetrics).totals,
    };
  }

  return {
    rows,
    totals,
    compare,
  };
}

module.exports = {
  isGa4LiveEligible,
  queryGa4LiveMetrics,
};
