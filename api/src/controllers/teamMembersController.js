const teamMembersService = require('../services/teamMembersService');

module.exports = {
  async list(req, res) {
    try {
      const members = await teamMembersService.list(req.tenantId);
      return res.json(members);
    } catch (err) {
      console.error('Error listing team members:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async create(req, res) {
    try {
      const data = req.body;
      if (!data.name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const member = await teamMembersService.create(req.tenantId, data);
      return res.json(member);
    } catch (err) {
      console.error('Error creating team member:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async getById(req, res) {
    try {
      const id = req.params.id;
      const member = await teamMembersService.getById(req.tenantId, id);
      if (!member) return res.status(404).json({ error: 'team member not found' });
      return res.json(member);
    } catch (err) {
      console.error('Error getting team member:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async update(req, res) {
    try {
      const id = req.params.id;
      const data = req.body;

      const updated = await teamMembersService.update(req.tenantId, id, data);
      if (!updated) return res.status(404).json({ error: 'team member not found' });
      return res.json(updated);
    } catch (err) {
      console.error('Error updating team member:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async remove(req, res) {
    try {
      const id = req.params.id;
      await teamMembersService.remove(req.tenantId, id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Error deleting team member:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },
};
