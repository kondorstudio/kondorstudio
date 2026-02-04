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
    const key = `${issue.widgetId || ''}:${issue.status || ''}:${issue.platform || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(issue);
  });
  return list;
}

async function computeDashboardHealthForDashboard(dashboard) {
  if (!dashboard) return null;

  if (!dashboard.publishedVersion || !dashboard.publishedVersionId) {
    return {
      status: 'WARN',
      summary: {
        missingPlatforms: [],
        invalidWidgets: [],
        unknownPlatformRequirement: true,
      },
      widgets: [],
      meta: {
        generatedAt: new Date().toISOString(),
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

  const widgetHealth = [];

  allWidgets.forEach((widget) => {
    if (!widget) return;
    const widgetId = widget.id || null;
    if (widget.type === 'text') {
      widgetHealth.push({
        widgetId,
        status: 'OK',
        reasonCode: 'OK',
      });
      return;
    }

    const queryValidation = validateWidgetQuery(widget);
    if (!queryValidation.valid) {
      widgetHealth.push({
        widgetId,
        status: 'INVALID_QUERY',
        reasonCode: 'INVALID_QUERY',
      });
      return;
    }

    let pushedMissingConnection = false;
    const widgetRequired = buildWidgetRequiredPlatforms(widget, requiredPlatforms);
    widgetRequired.forEach((platform) => {
      if (!connectedPlatforms.has(platform)) {
        pushedMissingConnection = true;
        widgetHealth.push({
          widgetId,
          status: 'MISSING_CONNECTION',
          platform,
          reasonCode: 'MISSING_CONNECTION',
        });
      }
    });

    if (!pushedMissingConnection) {
      widgetHealth.push({
        widgetId,
        status: 'OK',
        reasonCode: 'OK',
      });
    }
  });

  const uniqueWidgetHealth = uniqIssues(widgetHealth);
  const invalidWidgets = uniqueWidgetHealth.filter(
    (item) => item.status === 'MISSING_CONNECTION' || item.status === 'INVALID_QUERY',
  );

  const hasMissingConnectionIssues = invalidWidgets.some(
    (item) => item.status === 'MISSING_CONNECTION',
  );
  const hasInvalidQueryIssues = invalidWidgets.some(
    (item) => item.status === 'INVALID_QUERY',
  );

  let status = 'OK';
  if (missingPlatforms.length || hasMissingConnectionIssues || hasInvalidQueryIssues) {
    status = 'BLOCKED';
  } else if (unknownPlatformRequirement) {
    status = 'WARN';
  }

  return {
    status,
    summary: {
      missingPlatforms,
      invalidWidgets,
      unknownPlatformRequirement,
    },
    widgets: uniqueWidgetHealth,
    meta: {
      generatedAt: new Date().toISOString(),
    },
  };
}

async function computeDashboardHealth(input) {
  if (!input) return null;
  if (input?.id && input?.tenantId) {
    return computeDashboardHealthForDashboard(input);
  }

  const dashboardId = input?.dashboardId;
  const tenantId = input?.tenantId;
  if (!dashboardId || !tenantId) return null;

  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
    include: { publishedVersion: true },
  });
  if (!dashboard) return null;
  return computeDashboardHealthForDashboard(dashboard);
}

module.exports = {
  computeDashboardHealth,
  computeDashboardHealthForDashboard,
  normalizeLayoutPages,
  validateWidgetQuery,
  collectRequiredPlatforms,
};
