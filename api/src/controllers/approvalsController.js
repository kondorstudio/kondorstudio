const approvalsService = require('../services/approvalsService');

module.exports = {
  async list(req, res) {
    try {
      const { postId } = req.query;
      const approvals = await approvalsService.list(req.tenantId, { postId });
      return res.json(approvals);
    } catch (err) {
      console.error('Error listing approvals:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async create(req, res) {
    try {
      const data = req.body;
      const userId = req.user?.id || null;

      if (!data.postId) {
        return res.status(400).json({ error: 'postId is required' });
      }

      const approval = await approvalsService.create(req.tenantId, userId, data);
      if (!approval) {
        return res.status(404).json({ error: 'post not found for this tenant' });
      }

      return res.json(approval);
    } catch (err) {
      console.error('Error creating approval:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async getById(req, res) {
    try {
      const id = req.params.id;
      const approval = await approvalsService.getById(req.tenantId, id);
      if (!approval) return res.status(404).json({ error: 'approval not found' });
      return res.json(approval);
    } catch (err) {
      console.error('Error getting approval:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async updateStatus(req, res) {
    try {
      const id = req.params.id;
      const { status, comment } = req.body;
      const userId = req.user?.id || null;

      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }

      const updated = await approvalsService.updateStatus(req.tenantId, id, {
        status,
        comment,
        userId,
      });

      if (!updated) return res.status(404).json({ error: 'approval not found' });
      return res.json(updated);
    } catch (err) {
      console.error('Error updating approval status:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },
};
