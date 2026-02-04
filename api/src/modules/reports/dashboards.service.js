const crypto = require('crypto');
const { prisma } = require('../../prisma');
const {
  reportLayoutSchema,
  normalizeLayout,
} = require('../../shared/validators/reportLayout');
const { computeDashboardHealth } = require('./dashboardHealth.service');

const DEFAULT_LAYOUT = {
  theme: {
    mode: 'light',
    brandColor: '#F59E0B',
    accentColor: '#22C55E',
    bg: '#FFFFFF',
    text: '#0F172A',
    mutedText: '#64748B',
    cardBg: '#FFFFFF',
    border: '#E2E8F0',
    radius: 16,
  },
  globalFilters: {
    dateRange: { preset: 'last_7_days' },
    platforms: [],
    accounts: [],
    compareTo: null,
    autoRefreshSec: 0,
  },
  pages: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Pagina 1',
      widgets: [],
    },
  ],
};

function generateShareToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashShareToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function resolvePublicAppUrl() {
  return (
    process.env.PUBLIC_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.APP_URL_FRONT ||
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_APP_BASE_URL ||
    'http://localhost:5173'
  ).replace(/\/+$/, '');
}

function buildPublicUrl(token) {
  return `${resolvePublicAppUrl()}/public/reports/${token}`;
}

async function getActiveShare(tenantId, dashboardId) {
  return prisma.reportPublicShare.findFirst({
    where: {
      tenantId,
      dashboardId,
      status: 'ACTIVE',
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function assertBrand(tenantId, brandId) {
  if (!brandId) return null;
  return prisma.client.findFirst({
    where: { id: brandId, tenantId },
    select: { id: true },
  });
}

async function assertGroup(tenantId, groupId) {
  if (!groupId) return null;
  return prisma.brandGroup.findFirst({
    where: { id: groupId, tenantId },
    select: { id: true },
  });
}

async function ensureBrandExists(tenantId, brandId) {
  if (!brandId) return;
  const brand = await assertBrand(tenantId, brandId);
  if (!brand) {
    const err = new Error('Marca não encontrada');
    err.code = 'BRAND_NOT_FOUND';
    err.status = 404;
    throw err;
  }
}

async function ensureGroupExists(tenantId, groupId) {
  if (!groupId) return;
  const group = await assertGroup(tenantId, groupId);
  if (!group) {
    const err = new Error('Grupo não encontrado');
    err.code = 'GROUP_NOT_FOUND';
    err.status = 404;
    throw err;
  }
}

function ensureLayoutValid(layoutJson) {
  const parsed = reportLayoutSchema.safeParse(layoutJson);
  if (!parsed.success) {
    const err = new Error('layout_json inválido');
    err.code = 'INVALID_LAYOUT';
    err.status = 400;
    err.details = parsed.error.flatten ? parsed.error.flatten() : parsed.error.errors;
    throw err;
  }
  return normalizeLayout(parsed.data);
}

function normalizeLayoutForRead(layoutJson) {
  if (!layoutJson) return layoutJson;
  const parsed = reportLayoutSchema.safeParse(layoutJson);
  if (!parsed.success) return layoutJson;
  return normalizeLayout(parsed.data);
}

async function createDashboard(tenantId, userId, payload) {
  const brand = await assertBrand(tenantId, payload.brandId);
  if (!brand) {
    const err = new Error('Marca não encontrada');
    err.code = 'BRAND_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (payload.groupId) {
    const group = await assertGroup(tenantId, payload.groupId);
    if (!group) {
      const err = new Error('Grupo não encontrado');
      err.code = 'GROUP_NOT_FOUND';
      err.status = 404;
      throw err;
    }
  }

  const layout = payload.layoutJson ? ensureLayoutValid(payload.layoutJson) : DEFAULT_LAYOUT;

  return prisma.$transaction(async (tx) => {
    const dashboard = await tx.reportDashboard.create({
      data: {
        tenantId,
        brandId: payload.brandId,
        groupId: payload.groupId || null,
        name: payload.name,
        status: 'DRAFT',
        createdByUserId: userId,
      },
    });

    const version = await tx.reportDashboardVersion.create({
      data: {
        dashboardId: dashboard.id,
        versionNumber: 1,
        layoutJson: layout,
        createdByUserId: userId,
      },
    });

    return {
      ...dashboard,
      latestVersion: version,
      publishedVersion: null,
    };
  });
}

async function listDashboards(tenantId, filters, role) {
  if (filters.brandId) {
    await ensureBrandExists(tenantId, filters.brandId);
  }
  if (filters.groupId) {
    await ensureGroupExists(tenantId, filters.groupId);
  }

  const where = { tenantId };
  if (filters.brandId) where.brandId = filters.brandId;
  if (filters.groupId) where.groupId = filters.groupId;
  if (role === 'viewer') {
    where.status = 'PUBLISHED';
    where.publishedVersionId = { not: null };
  }

  return prisma.reportDashboard.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  });
}

async function getDashboard(tenantId, id, role) {
  const include = {
    publishedVersion: true,
  };

  if (role !== 'viewer') {
    include.versions = {
      orderBy: { versionNumber: 'desc' },
      take: 1,
    };
  }

  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id, tenantId },
    include,
  });

  if (!dashboard) return null;
  if (role === 'viewer' && dashboard.status !== 'PUBLISHED') {
    return null;
  }

  if (role === 'viewer') {
    return {
      ...dashboard,
      publishedVersion: dashboard.publishedVersion
        ? {
            ...dashboard.publishedVersion,
            layoutJson: normalizeLayoutForRead(dashboard.publishedVersion.layoutJson),
          }
        : null,
      latestVersion: null,
    };
  }

  const latestVersion = Array.isArray(dashboard.versions)
    ? dashboard.versions[0] || null
    : null;

  const { versions, ...rest } = dashboard;
  return {
    ...rest,
    latestVersion: latestVersion
      ? {
          ...latestVersion,
          layoutJson: normalizeLayoutForRead(latestVersion.layoutJson),
        }
      : null,
    publishedVersion: rest.publishedVersion
      ? {
          ...rest.publishedVersion,
          layoutJson: normalizeLayoutForRead(rest.publishedVersion.layoutJson),
        }
      : null,
  };
}

async function updateDashboard(tenantId, id, payload) {
  const existing = await prisma.reportDashboard.findFirst({
    where: { id, tenantId },
  });
  if (!existing) return null;

  if (payload.brandId) {
    const brand = await assertBrand(tenantId, payload.brandId);
    if (!brand) {
      const err = new Error('Marca não encontrada');
      err.code = 'BRAND_NOT_FOUND';
      err.status = 404;
      throw err;
    }
  }

  if (payload.groupId) {
    const group = await assertGroup(tenantId, payload.groupId);
    if (!group) {
      const err = new Error('Grupo não encontrado');
      err.code = 'GROUP_NOT_FOUND';
      err.status = 404;
      throw err;
    }
  }

  return prisma.reportDashboard.update({
    where: { id: existing.id },
    data: {
      name: payload.name ?? existing.name,
      brandId: payload.brandId ?? existing.brandId,
      groupId: payload.groupId !== undefined ? payload.groupId : existing.groupId,
    },
  });
}

async function createVersion(tenantId, userId, dashboardId, layoutJson) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
  });
  if (!dashboard) return null;

  const layout = ensureLayoutValid(layoutJson);

  return prisma.$transaction(async (tx) => {
    const latest = await tx.reportDashboardVersion.findFirst({
      where: { dashboardId: dashboard.id },
      orderBy: { versionNumber: 'desc' },
    });
    const nextVersion = (latest?.versionNumber || 0) + 1;

    const version = await tx.reportDashboardVersion.create({
      data: {
        dashboardId: dashboard.id,
        versionNumber: nextVersion,
        layoutJson: layout,
        createdByUserId: userId,
      },
    });

    return version;
  });
}

async function listVersions(tenantId, dashboardId) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
    select: { id: true },
  });
  if (!dashboard) return null;

  const versions = await prisma.reportDashboardVersion.findMany({
    where: { dashboardId },
    orderBy: { versionNumber: 'desc' },
  });
  return versions.map((version) => ({
    ...version,
    layoutJson: normalizeLayoutForRead(version.layoutJson),
  }));
}

async function publishDashboard(tenantId, userId, dashboardId, versionId) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
  });
  if (!dashboard) return null;

  const version = await prisma.reportDashboardVersion.findFirst({
    where: { id: versionId, dashboardId: dashboard.id },
  });
  if (!version) {
    const err = new Error('Versão não encontrada');
    err.code = 'VERSION_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  ensureLayoutValid(version.layoutJson);

  return prisma.reportDashboard.update({
    where: { id: dashboard.id },
    data: {
      status: 'PUBLISHED',
      publishedVersionId: version.id,
    },
  });
}

async function rollbackDashboard(tenantId, dashboardId, versionId) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
  });
  if (!dashboard) return null;

  const version = await prisma.reportDashboardVersion.findFirst({
    where: { id: versionId, dashboardId: dashboard.id },
  });
  if (!version) {
    const err = new Error('Versão não encontrada');
    err.code = 'VERSION_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  ensureLayoutValid(version.layoutJson);

  return prisma.reportDashboard.update({
    where: { id: dashboard.id },
    data: {
      status: 'PUBLISHED',
      publishedVersionId: version.id,
    },
  });
}

async function cloneDashboard(tenantId, userId, dashboardId) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
  });
  if (!dashboard) return null;

  const latestVersion = await prisma.reportDashboardVersion.findFirst({
    where: { dashboardId: dashboard.id },
    orderBy: { versionNumber: 'desc' },
  });

  const publishedVersion = dashboard.publishedVersionId
    ? await prisma.reportDashboardVersion.findFirst({
        where: { id: dashboard.publishedVersionId, dashboardId: dashboard.id },
      })
    : null;

  const baseLayout = latestVersion?.layoutJson || publishedVersion?.layoutJson || DEFAULT_LAYOUT;
  const layout = ensureLayoutValid(baseLayout);

  return prisma.$transaction(async (tx) => {
    const cloned = await tx.reportDashboard.create({
      data: {
        tenantId,
        brandId: dashboard.brandId,
        groupId: dashboard.groupId,
        name: `${dashboard.name} (cópia)`,
        status: 'DRAFT',
        createdByUserId: userId,
      },
    });

    const version = await tx.reportDashboardVersion.create({
      data: {
        dashboardId: cloned.id,
        versionNumber: 1,
        layoutJson: layout,
        createdByUserId: userId,
      },
    });

    return {
      ...cloned,
      latestVersion: version,
      publishedVersion: null,
    };
  });
}

async function ensureDashboardPublished(dashboard) {
  if (!dashboard || dashboard.status !== 'PUBLISHED' || !dashboard.publishedVersionId) {
    const err = new Error('Dashboard precisa estar publicado');
    err.code = 'DASHBOARD_NOT_PUBLISHED';
    err.status = 400;
    throw err;
  }
}

async function getPublicShareStatus(tenantId, dashboardId) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
  });
  if (!dashboard) return null;

  const activeShare = await getActiveShare(tenantId, dashboard.id);
  if (!activeShare) {
    return {
      status: 'INACTIVE',
      createdAt: null,
      revokedAt: null,
    };
  }

  return {
    status: 'ACTIVE',
    createdAt: activeShare.createdAt,
    revokedAt: activeShare.revokedAt || null,
  };
}

async function getDashboardHealth(tenantId, dashboardId) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
    include: { publishedVersion: true },
  });
  if (!dashboard) return null;
  return computeDashboardHealth(dashboard);
}

async function createPublicShare(tenantId, userId, dashboardId) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
    include: { publishedVersion: true },
  });
  if (!dashboard) return null;

  await ensureDashboardPublished(dashboard);

  const health = await computeDashboardHealth(dashboard);
  if (health?.status === 'BLOCKED') {
    const err = new Error(
      'Nao e possivel compartilhar este relatorio enquanto houver conexoes pendentes.',
    );
    err.code = 'DASHBOARD_BLOCKED';
    err.status = 422;
    err.details = health;
    throw err;
  }

  const existing = await getActiveShare(tenantId, dashboard.id);
  if (existing) {
    return {
      status: 'ACTIVE',
      createdAt: existing.createdAt,
      publicUrl: null,
      revealed: false,
      alreadyActive: true,
    };
  }

  const token = generateShareToken();
  const tokenHash = hashShareToken(token);
  const createdAt = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const share = await tx.reportPublicShare.create({
        data: {
          tenantId,
          dashboardId: dashboard.id,
          tokenHash,
          status: 'ACTIVE',
          createdByUserId: userId,
          createdAt,
        },
      });

      await tx.reportDashboard.update({
        where: { id: dashboard.id },
        data: {
          sharedEnabled: true,
          sharedTokenHash: tokenHash,
          sharedAt: share.createdAt,
        },
      });

      return share;
    });

    return {
      status: 'ACTIVE',
      createdAt: result.createdAt,
      publicUrl: buildPublicUrl(token),
      revealed: true,
      alreadyActive: false,
    };
  } catch (err) {
    if (err?.code === 'P2002') {
      const active = await getActiveShare(tenantId, dashboard.id);
      if (active) {
        return {
          status: 'ACTIVE',
          createdAt: active.createdAt,
          publicUrl: null,
          revealed: false,
          alreadyActive: true,
        };
      }
    }
    throw err;
  }
}

async function rotatePublicShare(tenantId, userId, dashboardId) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
    include: { publishedVersion: true },
  });
  if (!dashboard) return null;

  await ensureDashboardPublished(dashboard);

  const health = await computeDashboardHealth(dashboard);
  if (health?.status === 'BLOCKED') {
    const err = new Error(
      'Nao e possivel compartilhar este relatorio enquanto houver conexoes pendentes.',
    );
    err.code = 'DASHBOARD_BLOCKED';
    err.status = 422;
    err.details = health;
    throw err;
  }

  const token = generateShareToken();
  const tokenHash = hashShareToken(token);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    await tx.reportPublicShare.updateMany({
      where: {
        tenantId,
        dashboardId: dashboard.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: now,
      },
    });

    const share = await tx.reportPublicShare.create({
      data: {
        tenantId,
        dashboardId: dashboard.id,
        tokenHash,
        status: 'ACTIVE',
        createdByUserId: userId,
        createdAt: now,
      },
    });

    await tx.reportDashboard.update({
      where: { id: dashboard.id },
      data: {
        sharedEnabled: true,
        sharedTokenHash: tokenHash,
        sharedAt: share.createdAt,
      },
    });

    return share;
  });

  return {
    status: 'ACTIVE',
    createdAt: result.createdAt,
    publicUrl: buildPublicUrl(token),
    revealed: true,
    alreadyActive: false,
  };
}

async function revokePublicShare(tenantId, dashboardId) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
  });
  if (!dashboard) return null;

  const revokedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.reportPublicShare.updateMany({
      where: {
        tenantId,
        dashboardId: dashboard.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt,
      },
    });

    await tx.reportDashboard.update({
      where: { id: dashboard.id },
      data: {
        sharedEnabled: false,
        sharedTokenHash: null,
        sharedAt: null,
      },
    });
  });

  return {
    status: 'REVOKED',
    revokedAt,
  };
}

async function shareDashboard(tenantId, userId, dashboardId) {
  const result = await rotatePublicShare(tenantId, userId, dashboardId);
  if (!result) return null;
  const token = result.publicUrl ? result.publicUrl.split('/').pop() : null;
  return { token };
}

async function unshareDashboard(tenantId, dashboardId) {
  const result = await revokePublicShare(tenantId, dashboardId);
  if (!result) return null;
  return { ok: true };
}

module.exports = {
  createDashboard,
  listDashboards,
  getDashboard,
  updateDashboard,
  createVersion,
  listVersions,
  publishDashboard,
  rollbackDashboard,
  cloneDashboard,
  getPublicShareStatus,
  getDashboardHealth,
  createPublicShare,
  rotatePublicShare,
  revokePublicShare,
  shareDashboard,
  unshareDashboard,
  ensureLayoutValid,
  hashShareToken,
};
