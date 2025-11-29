const financialRecordsService = require('../services/financialRecordsService');

module.exports = {
  async list(req, res) {
    try {
      const { clientId, type, startDate, endDate } = req.query;
      const records = await financialRecordsService.list(req.tenantId, {
        clientId,
        type,
        startDate,
        endDate,
      });
      return res.json(records);
    } catch (err) {
      console.error('Error listing financial records:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async create(req, res) {
    try {
      const data = req.body;

      if (!data.type) {
        return res.status(400).json({ error: 'type is required' });
      }

      if (typeof data.amountCents === 'undefined' && typeof data.amount === 'undefined') {
        return res.status(400).json({ error: 'amountCents or amount is required' });
      }

      const record = await financialRecordsService.create(req.tenantId, data);
      return res.json(record);
    } catch (err) {
      console.error('Error creating financial record:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async getById(req, res) {
    try {
      const id = req.params.id;
      const record = await financialRecordsService.getById(req.tenantId, id);
      if (!record) return res.status(404).json({ error: 'financial record not found' });
      return res.json(record);
    } catch (err) {
      console.error('Error getting financial record:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async update(req, res) {
    try {
      const id = req.params.id;
      const data = req.body;

      const updated = await financialRecordsService.update(req.tenantId, id, data);
      if (!updated) return res.status(404).json({ error: 'financial record not found' });
      return res.json(updated);
    } catch (err) {
      console.error('Error updating financial record:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async remove(req, res) {
    try {
      const id = req.params.id;
      await financialRecordsService.remove(req.tenantId, id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Error deleting financial record:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },
};
