const crypto = require('crypto');
const { prisma } = require('../../prisma');
const metricsService = require('../metrics/metrics.service');
const {
  reportLayoutSchema,
  normalizeLayout,
} = require('../../shared/validators/reportLayout');
const { computeDashboardHealth } = require('./dashboardHealth.service');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function resolveDashboardByToken(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);

  const share = await prisma.reportPublicShare.findFirst({
    where: {
      tokenHash,
      status: 'ACTIVE',
    },
    include: {
      dashboard: {
        include: {
          publishedVersion: true,
        },
      },
    },
  });

  if (share?.dashboard) {
    return {
      dashboard: share.dashboard,
      source: 'share',
      share,
    };
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

  const expiresAt =
    exportRecord.publicTokenExpiresAt ||
    (exportRecord?.meta?.expiresAt ? new Date(exportRecord.meta.expiresAt) : null);

  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return { dashboard: exportRecord.dashboard, source: 'export', export: exportRecord };
}

async function getPublicReport(token) {
  const resolved = await resolveDashboardByToken(token);
  const dashboard = resolved?.dashboard || null;
  if (
    !dashboard ||
    dashboard.status !== 'PUBLISHED' ||
    !dashboard.publishedVersionId ||
    !dashboard.publishedVersion
  ) {
    return null;
  }

  const parsedLayout = reportLayoutSchema.safeParse(dashboard.publishedVersion.layoutJson);
  const layoutJson = parsedLayout.success
    ? normalizeLayout(parsedLayout.data)
    : dashboard.publishedVersion.layoutJson;

  return {
    dashboard: {
      id: dashboard.id,
      name: dashboard.name,
      brandId: dashboard.brandId,
      groupId: dashboard.groupId || null,
    },
    layoutJson,
    health: await computeDashboardHealth(dashboard),
    meta: {
      generatedAt: new Date().toISOString(),
    },
  };
}

async function queryPublicMetrics(token, payload = {}) {
  const resolved = await resolveDashboardByToken(token);
  const dashboard = resolved?.dashboard || null;
  if (
    !dashboard ||
    dashboard.status !== 'PUBLISHED' ||
    !dashboard.publishedVersionId ||
    !dashboard.publishedVersion
  ) {
    const err = new Error('Relatorio publico nao encontrado');
    err.code = 'PUBLIC_REPORT_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const safePayload = {
    ...payload,
    brandId: dashboard.brandId,
  };

  const useReportei = safePayload.responseFormat === 'reportei';
  const queryFn = useReportei
    ? metricsService.queryMetricsReportei
    : metricsService.queryMetrics;
  return queryFn(dashboard.tenantId, safePayload);
}

module.exports = {
  getPublicReport,
  queryPublicMetrics,
};
