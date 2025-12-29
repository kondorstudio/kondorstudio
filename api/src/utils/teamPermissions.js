const DEFAULT_MODULES = {
  dashboard: true,
  clients: true,
  posts: true,
  approvals: true,
  tasks: true,
  metrics: false,
  integrations: false,
  finance: false,
  library: true,
  team: false,
  settings: false,
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeClientAccess(raw) {
  if (!raw) {
    return { scope: 'all', clientIds: [] };
  }

  const scope =
    raw.scope === 'custom' || raw.scope === 'all' ? raw.scope : null;
  const ids = Array.isArray(raw.clientIds) ? raw.clientIds.filter(Boolean) : [];

  if (!scope) {
    return {
      scope: ids.length ? 'custom' : 'all',
      clientIds: ids,
    };
  }

  return {
    scope,
    clientIds: scope === 'custom' ? ids : [],
  };
}

function normalizeModules(rawModules) {
  if (!isPlainObject(rawModules)) return { ...DEFAULT_MODULES };
  return {
    ...DEFAULT_MODULES,
    ...rawModules,
  };
}

function normalizePermissions(rawPermissions, role) {
  const baseRole = String(role || '').toUpperCase();
  if (baseRole === 'OWNER' || baseRole === 'ADMIN') {
    return {
      modules: Object.keys(DEFAULT_MODULES).reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {}),
      clientAccess: { scope: 'all', clientIds: [] },
    };
  }

  if (!rawPermissions) {
    return {
      modules: { ...DEFAULT_MODULES },
      clientAccess: { scope: 'all', clientIds: [] },
    };
  }

  if (isPlainObject(rawPermissions.modules) || isPlainObject(rawPermissions.clientAccess)) {
    return {
      modules: normalizeModules(rawPermissions.modules || {}),
      clientAccess: normalizeClientAccess(rawPermissions.clientAccess),
    };
  }

  return {
    modules: normalizeModules(rawPermissions),
    clientAccess: normalizeClientAccess(rawPermissions.clientAccess),
  };
}

module.exports = {
  DEFAULT_MODULES,
  normalizePermissions,
};
