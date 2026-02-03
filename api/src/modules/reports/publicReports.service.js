const crypto = require('crypto');
const { prisma } = require('../../prisma');
const metricsService = require('../metrics/metrics.service');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function resolveDashboardByToken(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);

  const sharedDashboard = await prisma.reportDashboard.findFirst({
    where: {
      sharedEnabled: true,
      sharedTokenHash: tokenHash,
    },
    include: { publishedVersion: true },
  });

  if (sharedDashboard) {
    return { dashboard: sharedDashboard, source: 'share' };
  }

  const exportRecord = await prisma.reportDashboardExport.findFirst({
    where: {
      publicTokenHash: tokenHash,
      status: { in: ['PROCESSING', 'READY'] },
    },
    include: {
      dashboard: { include: { publishedVersion: true } },
    },
  });

  if (!exportRecord?.dashboard) return null;
  return { dashboard: exportRecord.dashboard, source: 'export', export: exportRecord };
}

async function getPublicReport(token) {
  const resolved = await resolveDashboardByToken(token);
  const dashboard = resolved?.dashboard || null;
  if (!dashboard || !dashboard.publishedVersion) return null;

  return {
    dashboard: {
      id: dashboard.id,
      name: dashboard.name,
    },
    layoutJson: dashboard.publishedVersion.layoutJson,
  };
}

async function queryPublicMetrics(token, payload = {}) {
  const resolved = await resolveDashboardByToken(token);
  const dashboard = resolved?.dashboard || null;
  if (!dashboard || !dashboard.publishedVersion) {
    const err = new Error('Relatorio publico nao encontrado');
    err.code = 'PUBLIC_REPORT_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const safePayload = {
    ...payload,
    brandId: dashboard.brandId,
  };

  return metricsService.queryMetrics(dashboard.tenantId, safePayload);
}

module.exports = {
  getPublicReport,
  queryPublicMetrics,
};
