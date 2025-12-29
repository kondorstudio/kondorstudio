const { prisma } = require('../prisma');
const { normalizePermissions, DEFAULT_MODULES } = require('../utils/teamPermissions');

function buildFullAccess() {
  return {
    modules: Object.keys(DEFAULT_MODULES).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {}),
    clientAccess: { scope: 'all', clientIds: [] },
  };
}

async function loadTeamAccess(req, res, next) {
  try {
    const role = String(req.user?.role || '').toUpperCase();

    if (role === 'OWNER' || role === 'ADMIN') {
      req.teamAccess = buildFullAccess();
      return next();
    }

    if (!req.user?.id || !req.tenantId) {
      req.teamAccess = normalizePermissions(null, role);
      return next();
    }

    const member = await prisma.teamMember.findFirst({
      where: {
        tenantId: req.tenantId,
        userId: req.user.id,
      },
      select: { permissions: true, role: true },
    });

    if (!member) {
      req.teamAccess = normalizePermissions(null, role);
      return next();
    }

    const memberRole = member.role || role;
    req.teamAccess = normalizePermissions(member.permissions, memberRole);
    return next();
  } catch (error) {
    console.error('[TEAM_ACCESS] error', error);
    return res.status(500).json({ error: 'Erro ao validar acesso da equipe' });
  }
}

function requireTeamPermission(moduleKey) {
  return (req, res, next) => {
    const access = req.teamAccess;
    if (!access || !access.modules) {
      return res.status(403).json({ error: 'Permissao insuficiente' });
    }
    if (!access.modules[moduleKey]) {
      return res.status(403).json({ error: 'Permissao insuficiente' });
    }
    return next();
  };
}

function getClientScope(req) {
  const access = req.teamAccess;
  if (!access || !access.clientAccess) {
    return { all: true, clientIds: [] };
  }
  const scope = access.clientAccess.scope;
  if (scope === 'all') {
    return { all: true, clientIds: [] };
  }
  const ids = Array.isArray(access.clientAccess.clientIds)
    ? access.clientAccess.clientIds
    : [];
  return { all: false, clientIds: ids };
}

function isClientAllowed(req, clientId) {
  if (!clientId) return false;
  const scope = getClientScope(req);
  if (scope.all) return true;
  return scope.clientIds.includes(clientId);
}

module.exports = {
  loadTeamAccess,
  requireTeamPermission,
  getClientScope,
  isClientAllowed,
};
