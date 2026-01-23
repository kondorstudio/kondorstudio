const { useTenant } = require('../prisma');

module.exports = function tenantGuard(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }
  const tenantId = req.tenantId || (req.user && req.user.tenantId);
  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId missing' });
  }

  req.tenantId = tenantId;
  if (!req.db) {
    try {
      req.db = useTenant(tenantId);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to resolve tenant scope' });
    }
  }

  return next();
};
