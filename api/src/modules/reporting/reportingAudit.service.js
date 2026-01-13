const { prisma } = require('../../prisma');

async function logReportingAction(payload = {}) {
  const {
    tenantId,
    userId,
    action,
    resource,
    resourceId,
    meta,
    ip,
  } = payload;

  if (!tenantId || !action) return null;
  if (!prisma?.auditLog?.create) return null;

  try {
    return await prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId || null,
        action: String(action),
        resource: resource ? String(resource) : null,
        resourceId: resourceId ? String(resourceId) : null,
        ip: ip || null,
        meta: meta || null,
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[reportingAudit] failed to log action:',
        err?.message || err
      );
    }
    return null;
  }
}

module.exports = {
  logReportingAction,
};
