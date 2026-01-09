const { prisma } = require('../../prisma');
const templatesService = require('./templates.service');

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

function buildWidgetPayloads(tenantId, reportId, layoutSchema, widgetsSchema) {
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
      connectionId: widget.connectionId || null,
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
    brandId: payload.brandId || null,
    groupId: payload.groupId || null,
    templateId: template.id,
  };

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
      compareDateFrom: payload.compareDateFrom || null,
      compareDateTo: payload.compareDateTo || null,
      status: 'DRAFT',
      snapshotTemplate,
    },
  });

  const widgetPayloads = buildWidgetPayloads(
    tenantId,
    report.id,
    template.layoutSchema,
    template.widgetsSchema,
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

module.exports = {
  listReports,
  getReport,
  createReport,
  updateReportLayout,
  toDate,
};
