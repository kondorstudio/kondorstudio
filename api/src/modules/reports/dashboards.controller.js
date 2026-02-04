const {
  createDashboardSchema,
  updateDashboardSchema,
  createVersionSchema,
  publishSchema,
  rollbackSchema,
} = require('./dashboards.validators');
const dashboardsService = require('./dashboards.service');
const { resolveReportingRole } = require('../reporting/reportingAccess.middleware');

function formatValidationError(error) {
  return error.flatten ? error.flatten() : error.errors || error;
}

function handleError(res, err) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Erro inesperado';
  const details = err.details || null;
  return res.status(status).json({
    error: {
      code,
      message,
      details,
    },
  });
}

async function create(req, res) {
  const parsed = createDashboardSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: formatValidationError(parsed.error),
      },
    });
  }

  try {
    const dashboard = await dashboardsService.createDashboard(
      req.tenantId,
      req.user?.id,
      parsed.data,
    );
    return res.status(201).json(dashboard);
  } catch (err) {
    return handleError(res, err);
  }
}

async function list(req, res) {
  const role = resolveReportingRole(req);
  const { brandId, groupId } = req.query || {};

  try {
    const items = await dashboardsService.listDashboards(
      req.tenantId,
      {
        brandId: brandId || null,
        groupId: groupId || null,
      },
      role,
    );
    return res.json({ items });
  } catch (err) {
    return handleError(res, err);
  }
}

async function get(req, res) {
  const role = resolveReportingRole(req);
  try {
    const dashboard = await dashboardsService.getDashboard(
      req.tenantId,
      req.params.id,
      role,
    );
    if (!dashboard) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.json(dashboard);
  } catch (err) {
    return handleError(res, err);
  }
}

async function update(req, res) {
  const parsed = updateDashboardSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: formatValidationError(parsed.error),
      },
    });
  }

  try {
    const dashboard = await dashboardsService.updateDashboard(
      req.tenantId,
      req.params.id,
      parsed.data,
    );
    if (!dashboard) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.json(dashboard);
  } catch (err) {
    return handleError(res, err);
  }
}

async function createVersion(req, res) {
  const parsed = createVersionSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: formatValidationError(parsed.error),
      },
    });
  }

  try {
    const version = await dashboardsService.createVersion(
      req.tenantId,
      req.user?.id,
      req.params.id,
      parsed.data.layoutJson,
    );
    if (!version) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.status(201).json(version);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listVersions(req, res) {
  try {
    const versions = await dashboardsService.listVersions(req.tenantId, req.params.id);
    if (!versions) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.json({ items: versions });
  } catch (err) {
    return handleError(res, err);
  }
}

async function publish(req, res) {
  const parsed = publishSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: formatValidationError(parsed.error),
      },
    });
  }

  try {
    const dashboard = await dashboardsService.publishDashboard(
      req.tenantId,
      req.user?.id,
      req.params.id,
      parsed.data.versionId,
    );
    if (!dashboard) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.json(dashboard);
  } catch (err) {
    return handleError(res, err);
  }
}

async function rollback(req, res) {
  const parsed = rollbackSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: formatValidationError(parsed.error),
      },
    });
  }

  try {
    const dashboard = await dashboardsService.rollbackDashboard(
      req.tenantId,
      req.params.id,
      parsed.data.versionId,
    );
    if (!dashboard) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.json(dashboard);
  } catch (err) {
    return handleError(res, err);
  }
}

async function clone(req, res) {
  try {
    const dashboard = await dashboardsService.cloneDashboard(
      req.tenantId,
      req.user?.id,
      req.params.id,
    );
    if (!dashboard) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.status(201).json(dashboard);
  } catch (err) {
    return handleError(res, err);
  }
}

async function share(req, res) {
  try {
    const result = await dashboardsService.shareDashboard(
      req.tenantId,
      req.user?.id,
      req.params.id,
    );
    if (!result) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.status(201).json({ publicUrlPath: `/public/reports/${result.token}` });
  } catch (err) {
    return handleError(res, err);
  }
}

async function unshare(req, res) {
  try {
    const dashboard = await dashboardsService.unshareDashboard(req.tenantId, req.params.id);
    if (!dashboard) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getPublicShare(req, res) {
  try {
    const share = await dashboardsService.getPublicShareStatus(req.tenantId, req.params.id);
    if (!share) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.json(share);
  } catch (err) {
    return handleError(res, err);
  }
}

async function getHealth(req, res) {
  try {
    const health = await dashboardsService.getDashboardHealth(req.tenantId, req.params.id);
    if (!health) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.json(health);
  } catch (err) {
    return handleError(res, err);
  }
}

async function createPublicShare(req, res) {
  try {
    const share = await dashboardsService.createPublicShare(
      req.tenantId,
      req.user?.id,
      req.params.id,
    );
    if (!share) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.status(share.revealed ? 201 : 200).json({
      status: share.status,
      createdAt: share.createdAt,
      publicUrl: share.publicUrl,
      alreadyActive: share.alreadyActive,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function rotatePublicShare(req, res) {
  try {
    const share = await dashboardsService.rotatePublicShare(
      req.tenantId,
      req.user?.id,
      req.params.id,
    );
    if (!share) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.status(201).json({
      status: share.status,
      createdAt: share.createdAt,
      publicUrl: share.publicUrl,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function revokePublicShare(req, res) {
  try {
    const share = await dashboardsService.revokePublicShare(
      req.tenantId,
      req.params.id,
    );
    if (!share) {
      return res.status(404).json({
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado', details: null },
      });
    }
    return res.json({
      status: share.status,
      revokedAt: share.revokedAt,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  create,
  list,
  get,
  update,
  createVersion,
  listVersions,
  publish,
  rollback,
  clone,
  getPublicShare,
  getHealth,
  createPublicShare,
  rotatePublicShare,
  revokePublicShare,
  share,
  unshare,
};
