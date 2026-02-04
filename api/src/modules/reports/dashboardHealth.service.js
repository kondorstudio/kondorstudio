const { prisma } = require('../../prisma');

const SUPPORTED_PLATFORMS = new Set([
  'META_ADS',
  'GOOGLE_ADS',
  'TIKTOK_ADS',
  'LINKEDIN_ADS',
  'GA4',
  'GMB',
  'FB_IG',
]);

const WIDGET_QUERY_TYPES = new Set([
  'kpi',
  'timeseries',
  'bar',
  'table',
  'pie',
  'donut',
]);

function normalizePlatform(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  if (!SUPPORTED_PLATFORMS.has(normalized)) return null;
  return normalized;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeLayoutPages(layoutJson) {
  if (!layoutJson || typeof layoutJson !== 'object') return [];
  if (Array.isArray(layoutJson.pages)) {
    return layoutJson.pages.map((page, index) => ({
      id: page?.id || `page-${index + 1}`,
      name: String(page?.name || `Pagina ${index + 1}`),
      widgets: Array.isArray(page?.widgets) ? page.widgets : [],
    }));
  }
  if (Array.isArray(layoutJson.widgets)) {
    return [
      {
        id: 'legacy-page',
        name: 'Pagina 1',
        widgets: layoutJson.widgets,
      },
    ];
  }
  return [];
}

function extractPlatformsFromFilters(filters = []) {
  const set = new Set();
  (filters || []).forEach((filter) => {
    if (!filter || filter.field !== 'platform') return;
    if (filter.op === 'eq') {
      const platform = normalizePlatform(filter.value);
      if (platform) set.add(platform);
      return;
    }
    if (filter.op === 'in') {
      toArray(filter.value).forEach((entry) => {
        const platform = normalizePlatform(entry);
        if (platform) set.add(platform);
      });
    }
  });
  return set;
}

function collectRequiredPlatforms(layoutJson, pages) {
  const required = new Set();

  toArray(layoutJson?.globalFilters?.platforms).forEach((platform) => {
    const normalized = normalizePlatform(platform);
    if (normalized) required.add(normalized);
  });

  (pages || []).forEach((page) => {
    (page.widgets || []).forEach((widget) => {
      const query = widget?.query || {};
      toArray(query.requiredPlatforms).forEach((platform) => {
        const normalized = normalizePlatform(platform);
        if (normalized) required.add(normalized);
      });
      const fromFilters = extractPlatformsFromFilters(query.filters || []);
      fromFilters.forEach((platform) => required.add(platform));
    });
  });

  return required;
}

function isValidFilter(filter) {
  if (!filter || typeof filter !== 'object') return false;
  const allowedFields = new Set(['platform', 'account_id', 'campaign_id']);
  if (!allowedFields.has(String(filter.field || ''))) return false;
  if (filter.op !== 'eq' && filter.op !== 'in') return false;

  if (filter.op === 'eq') {
    return typeof filter.value === 'string' && String(filter.value).trim().length > 0;
  }
  const values = toArray(filter.value)
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  return values.length > 0;
}

function validateWidgetQuery(widget) {
  if (!widget || widget.type === 'text') return { valid: true };
  if (!WIDGET_QUERY_TYPES.has(String(widget.type || ''))) {
    return { valid: false };
  }

  const query = widget.query || null;
  if (!query || typeof query !== 'object') return { valid: false };

  const metrics = Array.isArray(query.metrics) ? query.metrics.filter(Boolean) : [];
  const dimensions = Array.isArray(query.dimensions)
    ? query.dimensions.filter(Boolean)
    : [];

  if (!metrics.length) return { valid: false };

  const filters = Array.isArray(query.filters) ? query.filters : [];
  if (filters.some((filter) => !isValidFilter(filter))) {
    return { valid: false };
  }

  const type = String(widget.type || '');
  if (type === 'kpi') {
    if (dimensions.length > 1) return { valid: false };
    if (dimensions.length === 1 && dimensions[0] !== 'date') return { valid: false };
  }

  if (type === 'timeseries') {
    if (dimensions.length !== 1 || dimensions[0] !== 'date') return { valid: false };
  }

  if (type === 'bar') {
    if (dimensions.length !== 1 || dimensions[0] === 'date') return { valid: false };
  }

  if (type === 'pie' || type === 'donut') {
    if (dimensions.length !== 1 || dimensions[0] === 'date') return { valid: false };
    if (metrics.length !== 1) return { valid: false };
  }

  return { valid: true };
}

function buildWidgetRequiredPlatforms(widget, globalPlatformsSet) {
  const platforms = new Set();
  const query = widget?.query || {};

  toArray(query.requiredPlatforms).forEach((platform) => {
    const normalized = normalizePlatform(platform);
    if (normalized) platforms.add(normalized);
  });

  const fromFilters = extractPlatformsFromFilters(query.filters || []);
  fromFilters.forEach((platform) => platforms.add(platform));

  if (!platforms.size && globalPlatformsSet?.size) {
    globalPlatformsSet.forEach((platform) => platforms.add(platform));
  }

  return platforms;
}

function uniqIssues(issues) {
  const seen = new Set();
  const list = [];
  (issues || []).forEach((issue) => {
    const key = `${issue.widgetId || ''}:${issue.reason || ''}:${issue.platform || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(issue);
  });
  return list;
}

async function computeDashboardHealth(dashboard) {
  if (!dashboard) return null;

  if (!dashboard.publishedVersion || !dashboard.publishedVersionId) {
    return {
      status: 'WARN',
      missingPlatforms: [],
      invalidWidgets: [],
      meta: {
        generatedAt: new Date().toISOString(),
        unknownPlatformRequirement: true,
        reason: 'NOT_PUBLISHED',
      },
    };
  }

  const layoutJson = dashboard.publishedVersion.layoutJson || {};
  const pages = normalizeLayoutPages(layoutJson);
  const allWidgets = pages.flatMap((page) => page.widgets || []);
  const requiredPlatforms = collectRequiredPlatforms(layoutJson, pages);
  const unknownPlatformRequirement = requiredPlatforms.size === 0;

  const connections = await prisma.brandSourceConnection.findMany({
    where: {
      tenantId: dashboard.tenantId,
      brandId: dashboard.brandId,
      status: 'ACTIVE',
    },
    select: { platform: true },
  });
  const connectedPlatforms = new Set(
    (connections || [])
      .map((item) => normalizePlatform(item.platform))
      .filter(Boolean),
  );

  const missingPlatforms = Array.from(requiredPlatforms).filter(
    (platform) => !connectedPlatforms.has(platform),
  );

  const invalidWidgets = [];

  allWidgets.forEach((widget) => {
    if (!widget || widget.type === 'text') return;
    const widgetId = widget.id || null;
    const widgetTitle = String(widget.title || '').trim() || 'Widget';
    const queryValidation = validateWidgetQuery(widget);
    if (!queryValidation.valid) {
      invalidWidgets.push({
        widgetId,
        widgetTitle,
        reason: 'INVALID_QUERY',
      });
      return;
    }

    const widgetRequired = buildWidgetRequiredPlatforms(widget, requiredPlatforms);
    widgetRequired.forEach((platform) => {
      if (!connectedPlatforms.has(platform)) {
        invalidWidgets.push({
          widgetId,
          widgetTitle,
          reason: 'MISSING_CONNECTION',
          platform,
        });
      }
    });
  });

  const uniqueInvalidWidgets = uniqIssues(invalidWidgets);
  const hasMissingConnectionIssues = uniqueInvalidWidgets.some(
    (item) => item.reason === 'MISSING_CONNECTION',
  );
  const hasInvalidQueryIssues = uniqueInvalidWidgets.some(
    (item) => item.reason === 'INVALID_QUERY',
  );

  let status = 'OK';
  if (missingPlatforms.length || hasMissingConnectionIssues) {
    status = 'BLOCKED';
  } else if (unknownPlatformRequirement || hasInvalidQueryIssues) {
    status = 'WARN';
  }

  return {
    status,
    missingPlatforms,
    invalidWidgets: uniqueInvalidWidgets,
    meta: {
      generatedAt: new Date().toISOString(),
      unknownPlatformRequirement,
    },
  };
}

module.exports = {
  computeDashboardHealth,
  normalizeLayoutPages,
  validateWidgetQuery,
  collectRequiredPlatforms,
};

