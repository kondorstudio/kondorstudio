const { prisma } = require('../../prisma');
const reportingData = require('./reportingData.service');
const cache = require('./reportingCache.service');

const DEFAULT_RANGE_DAYS =
  Number(process.env.REPORTING_DEFAULT_RANGE_DAYS) || 30;

async function buildConnectionMapForReport(report, tenantId) {
  const brandId = report?.brandId || report?.params?.brandId || null;
  if (!brandId) return new Map();
  const connections = await prisma.dataSourceConnection.findMany({
    where: { tenantId, brandId, status: 'CONNECTED' },
    orderBy: { createdAt: 'desc' },
  });
  const map = new Map();
  connections.forEach((connection) => {
    if (!connection?.source) return;
    if (!map.has(connection.source)) {
      map.set(connection.source, connection.id);
    }
  });
  return map;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function resolveDateRange({ dateFrom, dateTo }, fallbackDays = DEFAULT_RANGE_DAYS) {
  let from = parseDate(dateFrom);
  let to = parseDate(dateTo);
  if (!to) to = new Date();
  if (!from) {
    const days = Number(fallbackDays) || DEFAULT_RANGE_DAYS;
    from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  }
  return { dateFrom: from, dateTo: to };
}

function mergeFilters(globalFilters, widgetFilters) {
  const isPlainObject = (value) =>
    value && typeof value === 'object' && !Array.isArray(value);

  if (isPlainObject(globalFilters) && isPlainObject(widgetFilters)) {
    const { dateFrom, dateTo, ...restGlobal } = globalFilters;
    return { ...restGlobal, ...widgetFilters };
  }

  if (isPlainObject(globalFilters)) {
    const { dateFrom, dateTo, ...restGlobal } = globalFilters;
    return restGlobal;
  }

  return widgetFilters || null;
}

async function generateReportData(tenantId, reportId) {
  const report = await prisma.report.findFirst({
    where: { id: reportId, tenantId },
    include: { widgets: true },
  });

  if (!report) {
    return { ok: false, error: 'report_not_found' };
  }

  const { dateFrom, dateTo } = resolveDateRange({
    dateFrom: report.dateFrom,
    dateTo: report.dateTo,
  });

  await prisma.report.update({
    where: { id: report.id },
    data: { status: 'GENERATING' },
  });

  const errors = [];
  const widgets = Array.isArray(report.widgets) ? report.widgets : [];
  const connectionMap = await buildConnectionMapForReport(report, tenantId);

  for (const widget of widgets) {
    if (!widget?.source) {
      errors.push({
        widgetId: widget?.id || null,
        message: 'Widget sem fonte configurada',
      });
      continue;
    }

    try {
      let connectionId = widget.connectionId || null;
      if (!connectionId) {
        connectionId = connectionMap.get(widget.source) || null;
        if (connectionId) {
          await prisma.reportWidget.update({
            where: { id: widget.id },
            data: { connectionId },
          });
        }
      }

      if (!connectionId) {
        errors.push({
          widgetId: widget?.id || null,
          message: `Sem conexao para fonte ${widget.source}`,
        });
        continue;
      }

      const result = await reportingData.queryMetrics(tenantId, {
        source: widget.source,
        connectionId,
        dateFrom,
        dateTo,
        level: widget.level,
        breakdown: widget.breakdown,
        metrics: Array.isArray(widget.metrics) ? widget.metrics : [],
        filters: widget.filters || null,
        options: widget.options || null,
        widgetType: widget.widgetType,
      });

      const snapshotKey = cache.buildReportSnapshotKey(
        tenantId,
        report.id,
        widget.id,
      );
      await cache.setReportSnapshot(snapshotKey, {
        widgetId: widget.id,
        reportId: report.id,
        generatedAt: new Date().toISOString(),
        cacheKey: result.cacheKey,
        data: result.data,
      });
    } catch (err) {
      errors.push({
        widgetId: widget.id,
        message: err?.message || 'Erro ao consultar widget',
      });
    }
  }

  const now = new Date();
  const status = errors.length ? 'ERROR' : 'READY';
  const params =
    report.params && typeof report.params === 'object' && !Array.isArray(report.params)
      ? report.params
      : {};

  await prisma.report.update({
    where: { id: report.id },
    data: {
      status,
      generatedAt: now,
      params: {
        ...params,
        reporting: {
          ...(params.reporting && typeof params.reporting === 'object'
            ? params.reporting
            : {}),
          lastRunAt: now.toISOString(),
          errors,
        },
      },
    },
  });

  return {
    ok: errors.length === 0,
    reportId: report.id,
    errors,
    status,
  };
}

async function refreshDashboards(tenantId, payload = {}) {
  if (!tenantId) return { ok: false, error: 'missing_tenant' };
  const limit = Number(payload.limit) || 25;

  const dashboards = await prisma.dashboard.findMany({
    where: { tenantId },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  const errors = [];
  const fallbackDays = Number(payload.rangeDays) || DEFAULT_RANGE_DAYS;

  for (const dashboard of dashboards) {
    const filters =
      dashboard.globalFiltersSchema &&
      typeof dashboard.globalFiltersSchema === 'object' &&
      !Array.isArray(dashboard.globalFiltersSchema)
        ? dashboard.globalFiltersSchema
        : null;

    const { dateFrom, dateTo } = resolveDateRange(
      {
        dateFrom: filters?.dateFrom || filters?.from,
        dateTo: filters?.dateTo || filters?.to,
      },
      fallbackDays,
    );

    const widgets = Array.isArray(dashboard.widgetsSchema)
      ? dashboard.widgetsSchema
      : [];

    for (const widget of widgets) {
      if (!widget?.source || !widget?.connectionId) continue;
      try {
        await reportingData.queryMetrics(tenantId, {
          source: widget.source,
          connectionId: widget.connectionId,
          dateFrom,
          dateTo,
          level: widget.level || null,
          breakdown: widget.breakdown || null,
          metrics: Array.isArray(widget.metrics) ? widget.metrics : [],
          filters: mergeFilters(filters, widget.filters),
          options: widget.options || null,
          widgetType: widget.widgetType,
        });
      } catch (err) {
        errors.push({
          dashboardId: dashboard.id,
          widgetId: widget.id || null,
          message: err?.message || 'Erro ao atualizar dashboard',
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

module.exports = {
  generateReportData,
  refreshDashboards,
  resolveDateRange,
};
