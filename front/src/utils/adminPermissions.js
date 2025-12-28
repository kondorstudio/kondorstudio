// front/src/utils/adminPermissions.js
export const ADMIN_ROLES = ["SUPER_ADMIN", "SUPPORT", "FINANCE", "TECH"];

export const ADMIN_ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  SUPPORT: "Suporte",
  FINANCE: "Financeiro",
  TECH: "Tecnico",
};

const ROLE_PERMISSIONS = {
  SUPPORT: [
    "tenants.read",
    "tenants.write",
    "users.read",
    "users.update",
    "notes.read",
    "notes.write",
    "logs.read",
    "jobs.read",
    "impersonate",
    "integrations.read",
  ],
  FINANCE: [
    "tenants.read",
    "billing.read",
    "billing.write",
    "reports.read",
  ],
  TECH: [
    "tenants.read",
    "users.read",
    "integrations.read",
    "integrations.write",
    "logs.read",
    "jobs.read",
    "data.query",
  ],
};

export function hasAdminPermission(role, permission) {
  if (!role) return false;
  if (role === "SUPER_ADMIN") return true;
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (!permission) return true;
  return perms.includes(permission);
}

export function getAdminRoleLabel(role) {
  return ADMIN_ROLE_LABELS[role] || role || "Admin";
}
