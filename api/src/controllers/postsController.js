const postsService = require('../services/postsService');

module.exports = {
  async list(req, res) {
    try {
      const { status, clientId } = req.query;
      const posts = await postsService.list(req.tenantId, { status, clientId });
      return res.json(posts);
    } catch (err) {
      console.error('Error listing posts:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async create(req, res) {
    try {
      const data = req.body;
      const userId = req.user?.id || null;
      const post = await postsService.create(req.tenantId, userId, data);
      return res.json(post);
    } catch (err) {
      console.error('Error creating post:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async getById(req, res) {
    try {
      const id = req.params.id;
      const post = await postsService.getById(req.tenantId, id);
      if (!post) return res.status(404).json({ error: 'post not found' });
      return res.json(post);
    } catch (err) {
      console.error('Error getting post:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async update(req, res) {
    try {
      const id = req.params.id;
      const data = req.body;
      const updated = await postsService.update(req.tenantId, id, data);
      if (!updated) return res.status(404).json({ error: 'post not found' });
      return res.json(updated);
    } catch (err) {
      console.error('Error updating post:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async updateStatus(req, res) {
    try {
      const id = req.params.id;
      const { status } = req.body;
      const userId = req.user?.id || null;

      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }

      const updated = await postsService.updateStatus(req.tenantId, id, status, userId);
      if (!updated) return res.status(404).json({ error: 'post not found' });
      return res.json(updated);
    } catch (err) {
      console.error('Error updating post status:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async remove(req, res) {
    try {
      const id = req.params.id;
      await postsService.remove(req.tenantId, id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Error deleting post:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },
};
