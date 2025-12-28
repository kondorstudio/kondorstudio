const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'SUPPORT', 'FINANCE', 'TECH']);

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['*', 'data.write'],
  SUPPORT: [
    'tenants.read',
    'tenants.write',
    'users.read',
    'users.update',
    'notes.read',
    'notes.write',
    'logs.read',
    'jobs.read',
    'impersonate',
    'integrations.read',
  ],
  FINANCE: [
    'tenants.read',
    'billing.read',
    'billing.write',
    'reports.read',
  ],
  TECH: [
    'tenants.read',
    'users.read',
    'integrations.read',
    'integrations.write',
    'logs.read',
    'jobs.read',
    'data.query',
  ],
};

function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

function isAdminRole(role) {
  return ADMIN_ROLES.has(normalizeRole(role));
}

function hasPermission(role, permission) {
  const normalizedRole = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalizedRole] || [];
  if (permissions.includes('*')) return true;
  return permissions.includes(permission);
}

module.exports = {
  ADMIN_ROLES,
  ROLE_PERMISSIONS,
  isAdminRole,
  hasPermission,
};
