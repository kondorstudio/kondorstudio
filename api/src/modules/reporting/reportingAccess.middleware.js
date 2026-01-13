const ADMIN_ROLES = new Set([
  'OWNER',
  'ADMIN',
  'SUPER_ADMIN',
  'SUPPORT',
  'FINANCE',
  'TECH',
]);
const EDITOR_ROLES = new Set(['MEMBER']);
const VIEWER_ROLES = new Set(['CLIENT', 'GUEST']);

const ROLE_LEVELS = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

function resolveReportingRole(req) {
  if (req?.isClientPortal) return 'viewer';
  const role = normalizeRole(req?.user?.role);
  if (ADMIN_ROLES.has(role)) return 'admin';
  if (EDITOR_ROLES.has(role)) return 'editor';
  if (VIEWER_ROLES.has(role)) return 'viewer';
  return 'viewer';
}

function requireReportingRole(...allowed) {
  const allowedRoles = (allowed || []).map((item) =>
    String(item || '').toLowerCase()
  );
  const allowedLevels = allowedRoles
    .map((role) => ROLE_LEVELS[role])
    .filter(Boolean);

  return (req, res, next) => {
    const current = resolveReportingRole(req);
    const currentLevel = ROLE_LEVELS[current] || 0;
    const minLevel = Math.min(...allowedLevels);
    if (!minLevel || currentLevel < minLevel) {
      return res.status(403).json({ error: 'Permissao insuficiente' });
    }
    return next();
  };
}

module.exports = {
  resolveReportingRole,
  requireReportingRole,
};
