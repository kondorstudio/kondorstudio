export const DEFAULT_MODULES = {
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

function normalizeClientAccess(raw) {
  if (!raw) {
    return { scope: "all", clientIds: [] };
  }
  const scope = raw.scope === "custom" || raw.scope === "all" ? raw.scope : null;
  const ids = Array.isArray(raw.clientIds) ? raw.clientIds.filter(Boolean) : [];
  if (!scope) {
    return { scope: ids.length ? "custom" : "all", clientIds: ids };
  }
  return {
    scope,
    clientIds: scope === "custom" ? ids : [],
  };
}

function normalizeModules(rawModules) {
  if (!rawModules || typeof rawModules !== "object") {
    return { ...DEFAULT_MODULES };
  }
  return {
    ...DEFAULT_MODULES,
    ...rawModules,
  };
}

export function normalizeTeamAccess(rawAccess, role) {
  const roleValue = String(role || "").toUpperCase();
  if (roleValue === "OWNER" || roleValue === "ADMIN") {
    const modules = Object.keys(DEFAULT_MODULES).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
    return { modules, clientAccess: { scope: "all", clientIds: [] } };
  }

  if (!rawAccess) {
    return {
      modules: { ...DEFAULT_MODULES },
      clientAccess: { scope: "all", clientIds: [] },
    };
  }

  if (rawAccess.modules || rawAccess.clientAccess) {
    return {
      modules: normalizeModules(rawAccess.modules || {}),
      clientAccess: normalizeClientAccess(rawAccess.clientAccess),
    };
  }

  return {
    modules: normalizeModules(rawAccess),
    clientAccess: normalizeClientAccess(rawAccess.clientAccess),
  };
}

export function getUserAccess(authData) {
  const user = authData?.user;
  if (!user) {
    return { modules: { ...DEFAULT_MODULES }, clientAccess: { scope: "all", clientIds: [] } };
  }
  return normalizeTeamAccess(user.access || user.permissions, user.role);
}

export function canAccessModule(authData, moduleKey) {
  const access = getUserAccess(authData);
  return Boolean(access.modules?.[moduleKey]);
}
