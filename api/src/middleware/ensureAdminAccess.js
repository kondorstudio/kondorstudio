const { isAdminRole } = require('../utils/adminPermissions');

function ensureAdminAccess(req, res, next) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Autenticação necessária' });
  }

  if (!isAdminRole(user.role)) {
    return res.status(403).json({ error: 'Acesso restrito ao painel mestre' });
  }

  return next();
}

module.exports = ensureAdminAccess;
