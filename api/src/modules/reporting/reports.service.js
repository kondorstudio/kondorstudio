const { prisma } = require('../../prisma');
const templatesService = require('./templates.service');
const reportingJobs = require('./reportingJobs.service');

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDateLabel(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function resolveCompareDates({ dateFrom, dateTo, compareMode, compareDateFrom, compareDateTo }) {
  const mode = compareMode ? String(compareMode).toUpperCase() : 'NONE';
  if (mode === 'CUSTOM') {
    if (compareDateFrom && compareDateTo) {
      return { compareDateFrom, compareDateTo };
    }
    return { compareDateFrom: null, compareDateTo: null };
  }
  if (!dateFrom || !dateTo || mode === 'NONE') {
    return { compareDateFrom: null, compareDateTo: null };
  }

  const baseFrom = new Date(dateFrom);
  const baseTo = new Date(dateTo);
  if (Number.isNaN(baseFrom.getTime()) || Number.isNaN(baseTo.getTime())) {
    return { compareDateFrom: null, compareDateTo: null };
  }

  if (mode === 'PREVIOUS_YEAR') {
    const prevFrom = new Date(baseFrom.getTime());
    const prevTo = new Date(baseTo.getTime());
    prevFrom.setFullYear(prevFrom.getFullYear() - 1);
    prevTo.setFullYear(prevTo.getFullYear() - 1);
    return {
      compareDateFrom: prevFrom.toISOString().slice(0, 10),
      compareDateTo: prevTo.toISOString().slice(0, 10),
    };
  }

  if (mode === 'PREVIOUS_PERIOD') {
    const dayMs = 86400000;
    const diffDays = Math.floor((baseTo - baseFrom) / dayMs) + 1;
    const prevTo = new Date(baseFrom.getTime() - dayMs);
    const prevFrom = new Date(prevTo.getTime() - (diffDays - 1) * dayMs);
    return {
      compareDateFrom: prevFrom.toISOString().slice(0, 10),
      compareDateTo: prevTo.toISOString().slice(0, 10),
    };
  }

  return { compareDateFrom: null, compareDateTo: null };
}

async function assertBrand(tenantId, brandId) {
  if (!brandId) return null;
  return prisma.client.findFirst({
    where: { id: brandId, tenantId },
    select: { id: true, name: true },
  });
}

async function assertGroup(tenantId, groupId) {
  if (!groupId) return null;
  return prisma.brandGroup.findFirst({
    where: { id: groupId, tenantId },
    select: { id: true, name: true },
  });
}

async function resolveBrandForGroup(tenantId, groupId) {
  if (!tenantId || !groupId) return null;
  const member = await prisma.brandGroupMember.findFirst({
    where: { tenantId, groupId },
    select: { brandId: true },
    orderBy: { createdAt: 'asc' },
  });
  return member?.brandId || null;
}

function buildWidgetPayloads(
  tenantId,
  reportId,
  layoutSchema,
  widgetsSchema,
  connectionMap,
) {
  const layoutMap = new Map();
  if (Array.isArray(layoutSchema)) {
    layoutSchema.forEach((item) => {
      if (item && item.i) layoutMap.set(String(item.i), item);
    });
  }

  const widgets = Array.isArray(widgetsSchema) ? widgetsSchema : [];
  return widgets.map((widget) => {
    const widgetId = widget.id ? String(widget.id) : null;
    const layout = widgetId ? layoutMap.get(widgetId) || null : null;
    const connectionId =
      widget.connectionId ||
      (widget.source ? connectionMap?.get(widget.source) : null) ||
      null;

    if (!widget.source) {
      const err = new Error(`Widget ${widgetId || ''} sem source definido`);
      err.status = 400;
      throw err;
    }

    return {
      tenantId,
      reportId,
      widgetType: widget.widgetType || 'KPI',
      title: widget.title || null,
      source: widget.source,
      connectionId,
      level: widget.level || null,
      breakdown: widget.breakdown || null,
      metrics: widget.metrics || [],
      filters: widget.filters || null,
      options: widget.options || null,
      layout: layout || null,
    };
  });
}

async function listReports(tenantId, filters = {}) {
  const where = { tenantId };
  if (filters.scope) where.scope = filters.scope;
  if (filters.brandId) where.brandId = filters.brandId;
  if (filters.groupId) where.groupId = filters.groupId;
  if (filters.status) where.status = filters.status;

  return prisma.report.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

async function getReport(tenantId, id) {
  return prisma.report.findFirst({
    where: { id, tenantId },
    include: {
      widgets: {
        orderBy: { createdAt: 'asc' },
      },
      template: true,
    },
  });
}

async function createReport(tenantId, payload) {
  const template = await templatesService.getTemplate(tenantId, payload.templateId);
  if (!template) {
    const err = new Error('Template nao encontrado');
    err.status = 404;
    throw err;
  }

  const brand = payload.brandId ? await assertBrand(tenantId, payload.brandId) : null;
  const group = payload.groupId ? await assertGroup(tenantId, payload.groupId) : null;

  if (payload.scope === 'BRAND' && !brand) {
    const err = new Error('Marca nao encontrada');
    err.status = 404;
    throw err;
  }

  if (payload.scope === 'GROUP' && !group) {
    const err = new Error('Grupo nao encontrado');
    err.status = 404;
    throw err;
  }

  let resolvedBrandId = payload.brandId || null;
  if (!resolvedBrandId && payload.scope === 'GROUP' && payload.groupId) {
    resolvedBrandId = await resolveBrandForGroup(tenantId, payload.groupId);
    if (!resolvedBrandId) {
      const err = new Error('Grupo sem marcas associadas');
      err.status = 400;
      throw err;
    }
  }

  const snapshotTemplate = {
    id: template.id,
    name: template.name,
    version: template.version,
    layoutSchema: template.layoutSchema || [],
    widgetsSchema: template.widgetsSchema || [],
  };

  const reportName =
    payload.name ||
    `${template.name} - ${formatDateLabel(payload.dateFrom)} a ${formatDateLabel(payload.dateTo)}`;

  const params = {
    scope: payload.scope,
    brandId: resolvedBrandId || null,
    groupId: payload.groupId || null,
    templateId: template.id,
  };

  const resolvedCompare = resolveCompareDates({
    dateFrom: payload.dateFrom,
    dateTo: payload.dateTo,
    compareMode: payload.compareMode,
    compareDateFrom: payload.compareDateFrom,
    compareDateTo: payload.compareDateTo,
  });

  const report = await prisma.report.create({
    data: {
      tenantId,
      name: reportName,
      type: 'reporting',
      params,
      scope: payload.scope,
      brandId: payload.brandId || null,
      groupId: payload.groupId || null,
      templateId: template.id,
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
      compareMode: payload.compareMode || 'NONE',
      compareDateFrom: resolvedCompare.compareDateFrom,
      compareDateTo: resolvedCompare.compareDateTo,
      status: 'DRAFT',
      snapshotTemplate,
    },
  });

  let connectionMap = null;
  if (resolvedBrandId) {
    const connections = await prisma.dataSourceConnection.findMany({
      where: { tenantId, brandId: resolvedBrandId, status: 'CONNECTED' },
      orderBy: { createdAt: 'desc' },
    });
    connectionMap = new Map();
    connections.forEach((connection) => {
      if (!connection?.source) return;
      if (!connectionMap.has(connection.source)) {
        connectionMap.set(connection.source, connection.id);
      }
    });
  }

  const widgetPayloads = buildWidgetPayloads(
    tenantId,
    report.id,
    template.layoutSchema,
    template.widgetsSchema,
    connectionMap,
  );

  if (widgetPayloads.length) {
    await prisma.reportWidget.createMany({
      data: widgetPayloads,
    });
  }

  return getReport(tenantId, report.id);
}

async function updateReportLayout(tenantId, reportId, widgets) {
  const existing = await getReport(tenantId, reportId);
  if (!existing) return null;

  const operations = widgets.map((item) =>
    prisma.reportWidget.updateMany({
      where: { id: item.id, reportId, tenantId },
      data: { layout: item.layout },
    }),
  );

  await prisma.$transaction(operations);
  return getReport(tenantId, reportId);
}

async function refreshReport(tenantId, reportId) {
  const existing = await getReport(tenantId, reportId);
  if (!existing) return null;

  await prisma.report.update({
    where: { id: existing.id },
    data: { status: 'GENERATING' },
  });

  await reportingJobs.enqueueReportGeneration(tenantId, existing.id);
  return getReport(tenantId, existing.id);
}

async function updateReport(tenantId, reportId, payload = {}) {
  const existing = await getReport(tenantId, reportId);
  if (!existing) return null;

  const nextName = payload.name ? String(payload.name) : existing.name;
  const nextDateFrom = payload.dateFrom || existing.dateFrom;
  const nextDateTo = payload.dateTo || existing.dateTo;
  const nextCompareMode = payload.compareMode || existing.compareMode || 'NONE';
  const compareDateFrom =
    payload.compareDateFrom || (nextCompareMode === 'CUSTOM' ? existing.compareDateFrom : null);
  const compareDateTo =
    payload.compareDateTo || (nextCompareMode === 'CUSTOM' ? existing.compareDateTo : null);

  const resolvedCompare = resolveCompareDates({
    dateFrom: nextDateFrom,
    dateTo: nextDateTo,
    compareMode: nextCompareMode,
    compareDateFrom,
    compareDateTo,
  });

  const shouldReset =
    Boolean(payload.dateFrom) ||
    Boolean(payload.dateTo) ||
    Boolean(payload.compareMode) ||
    Boolean(payload.compareDateFrom) ||
    Boolean(payload.compareDateTo);

  const data = {
    name: nextName,
    dateFrom: nextDateFrom,
    dateTo: nextDateTo,
    compareMode: nextCompareMode,
    compareDateFrom: resolvedCompare.compareDateFrom,
    compareDateTo: resolvedCompare.compareDateTo,
  };

  if (shouldReset) {
    data.status = 'DRAFT';
    data.generatedAt = null;
  }

  await prisma.report.update({
    where: { id: existing.id },
    data,
  });

  return getReport(tenantId, existing.id);
}

async function removeReport(tenantId, reportId) {
  const existing = await getReport(tenantId, reportId);
  if (!existing) return null;
  await prisma.report.delete({ where: { id: existing.id } });
  return existing;
}

module.exports = {
  listReports,
  getReport,
  createReport,
  updateReport,
  updateReportLayout,
  refreshReport,
  removeReport,
  toDate,
};
