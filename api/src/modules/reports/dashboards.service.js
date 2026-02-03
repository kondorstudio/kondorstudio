const crypto = require('crypto');
const { prisma } = require('../../prisma');
const { reportLayoutSchema } = require('../../shared/validators/reportLayout');

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
  widgets: [],
};

function generateShareToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashShareToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
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
  return parsed.data;
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
      latestVersion: null,
    };
  }

  const latestVersion = Array.isArray(dashboard.versions)
    ? dashboard.versions[0] || null
    : null;

  const { versions, ...rest } = dashboard;
  return {
    ...rest,
    latestVersion,
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

  return prisma.reportDashboardVersion.findMany({
    where: { dashboardId },
    orderBy: { versionNumber: 'desc' },
  });
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

async function shareDashboard(tenantId, dashboardId) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
  });
  if (!dashboard) return null;

  if (!dashboard.publishedVersionId) {
    const err = new Error('Dashboard precisa estar publicado');
    err.code = 'DASHBOARD_NOT_PUBLISHED';
    err.status = 400;
    throw err;
  }

  const token = generateShareToken();
  const tokenHash = hashShareToken(token);

  await prisma.reportDashboard.update({
    where: { id: dashboard.id },
    data: {
      sharedEnabled: true,
      sharedTokenHash: tokenHash,
      sharedAt: new Date(),
    },
  });

  return { token };
}

async function unshareDashboard(tenantId, dashboardId) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
  });
  if (!dashboard) return null;

  return prisma.reportDashboard.update({
    where: { id: dashboard.id },
    data: {
      sharedEnabled: false,
      sharedTokenHash: null,
      sharedAt: null,
    },
  });
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
  shareDashboard,
  unshareDashboard,
  ensureLayoutValid,
};
