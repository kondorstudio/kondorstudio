const { prisma } = require('../../prisma');
const dashboardsService = require('./dashboards.service');
const { DEFAULT_TEMPLATES_V2 } = require('./templates.defaults');

async function ensureDefaultTemplates() {
  if (process.env.NODE_ENV === 'test') return;
  const existing = await prisma.reportTemplateV2.findMany({
    where: { tenantId: null },
    select: { id: true, name: true },
  });
  const existingNames = new Set(existing.map((item) => item.name));

  for (const template of DEFAULT_TEMPLATES_V2) {
    if (existingNames.has(template.name)) {
      await prisma.reportTemplateV2.update({
        where: { id: existing.find((item) => item.name === template.name).id },
        data: {
          category: template.category,
          layoutJson: template.layoutJson,
        },
      });
      continue;
    }
    await prisma.reportTemplateV2.create({
      data: {
        tenantId: template.tenantId ?? null,
        name: template.name,
        category: template.category,
        layoutJson: template.layoutJson,
      },
    });
  }
}

function collectRequiredPlatforms(layoutJson) {
  const platforms = new Set();
  const widgets = Array.isArray(layoutJson?.pages)
    ? layoutJson.pages.flatMap((page) =>
        Array.isArray(page?.widgets) ? page.widgets : []
      )
    : Array.isArray(layoutJson?.widgets)
      ? layoutJson.widgets
      : [];
  widgets.forEach((widget) => {
    const required = widget?.query?.requiredPlatforms;
    if (Array.isArray(required)) {
      required.forEach((platform) => platforms.add(platform));
    }
  });
  return Array.from(platforms);
}

async function listTemplates(tenantId) {
  await ensureDefaultTemplates();
  const templates = await prisma.reportTemplateV2.findMany({
    where: {
      OR: [{ tenantId: null }, { tenantId }],
    },
    orderBy: [
      { tenantId: 'asc' },
      { name: 'asc' },
    ],
  });

  return templates.map((template) => ({
    ...template,
    requiredPlatforms: collectRequiredPlatforms(template.layoutJson),
  }));
}

async function getTemplateForTenant(tenantId, templateId) {
  return prisma.reportTemplateV2.findFirst({
    where: {
      id: templateId,
      OR: [{ tenantId: null }, { tenantId }],
    },
  });
}

async function instantiateTemplate(tenantId, userId, templateId, payload) {
  const template = await getTemplateForTenant(tenantId, templateId);
  if (!template) return null;

  const layout = dashboardsService.ensureLayoutValid(template.layoutJson);
  const name = payload.nameOverride || template.name;

  const dashboard = await dashboardsService.createDashboard(tenantId, userId, {
    name,
    brandId: payload.brandId,
    groupId: payload.groupId ?? null,
    layoutJson: layout,
  });

  return { dashboardId: dashboard.id };
}

async function createTemplate(tenantId, _userId, payload) {
  const layout = dashboardsService.ensureLayoutValid(payload.layoutJson);
  const name = String(payload.name || '').trim();
  if (!name) {
    const err = new Error('Nome do template é obrigatório');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  const category = String(payload.category || '').trim() || 'Meus templates';
  const template = await prisma.reportTemplateV2.create({
    data: {
      tenantId,
      name,
      category,
      layoutJson: layout,
    },
  });

  return {
    ...template,
    requiredPlatforms: collectRequiredPlatforms(template.layoutJson),
  };
}

module.exports = {
  listTemplates,
  getTemplateForTenant,
  instantiateTemplate,
  createTemplate,
};
