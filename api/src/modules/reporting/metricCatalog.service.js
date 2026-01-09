const { prisma } = require('../../prisma');

async function listCatalog(tenantId, { source, level, type }) {
  const where = { tenantId, source };
  if (level) where.level = level;
  if (type) where.type = type;

  return prisma.metricCatalog.findMany({
    where,
    orderBy: [{ isDefault: 'desc' }, { label: 'asc' }],
  });
}

async function upsertMetric(tenantId, payload) {
  const dimensionKey =
    payload.type === 'DIMENSION'
      ? payload.dimensionKey || payload.metricKey
      : payload.dimensionKey || null;

  return prisma.metricCatalog.upsert({
    where: {
      tenantId_source_level_metricKey_type: {
        tenantId,
        source: payload.source,
        level: payload.level,
        metricKey: payload.metricKey,
        type: payload.type,
      },
    },
    create: {
      tenantId,
      source: payload.source,
      level: payload.level,
      metricKey: payload.metricKey,
      dimensionKey,
      label: payload.label,
      type: payload.type,
      supportedCharts: payload.supportedCharts || [],
      supportedBreakdowns: payload.supportedBreakdowns || [],
      isDefault: Boolean(payload.isDefault),
    },
    update: {
      dimensionKey,
      label: payload.label,
      supportedCharts: payload.supportedCharts || [],
      supportedBreakdowns: payload.supportedBreakdowns || [],
      isDefault: Boolean(payload.isDefault),
    },
  });
}

module.exports = {
  listCatalog,
  upsertMetric,
};
