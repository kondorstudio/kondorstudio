const { hasPermission, isAdminRole } = require('../utils/adminPermissions');

function requireAdminPermission(permission) {
  return (req, res, next) => {
    const user = req.user;
    if (!user || !isAdminRole(user.role)) {
      return res.status(403).json({ error: 'Acesso restrito ao painel mestre' });
    }

    if (!hasPermission(user.role, permission)) {
      return res.status(403).json({ error: 'Permissão insuficiente' });
    }

    return next();
  };
}

module.exports = requireAdminPermission;
