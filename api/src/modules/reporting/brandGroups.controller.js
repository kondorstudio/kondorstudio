const brandGroupsService = require('./brandGroups.service');

module.exports = {
  async list(req, res) {
    try {
      const items = await brandGroupsService.listGroups(req.tenantId);
      return res.json({ items });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao listar grupos' });
    }
  },

  async listMembers(req, res) {
    try {
      const items = await brandGroupsService.listGroupMembers(
        req.tenantId,
        req.params.groupId,
      );
      return res.json({ items });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao listar membros' });
    }
  },
};
