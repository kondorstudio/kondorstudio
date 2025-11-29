// api/src/routes/clients.js
const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const clientsService = require('../services/clientsService');

// Todas as rotas exigem auth + tenant
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * GET /clients
 * Lista clientes do tenant com paginação e filtros
 * Query params:
 *  ?q=busca
 *  ?page=1
 *  ?perPage=50
 *  ?tags=tag1,tag2
 */
router.get('/', async (req, res) => {
  try {
    const { q, page, perPage, tags } = req.query;

    const parsedTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined;

    const result = await clientsService.list(req.tenantId, {
      q,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
      tags: parsedTags,
    });

    return res.json(result);
  } catch (err) {
    console.error('GET /clients error:', err);
    return res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

/**
 * GET /clients/suggest?q=...
 * Autosuggest para inputs de busca
 */
router.get('/suggest', async (req, res) => {
  try {
    const { q, limit } = req.query;
    const result = await clientsService.suggest(
      req.tenantId,
      q,
      limit ? Number(limit) : undefined
    );
    return res.json(result);
  } catch (err) {
    console.error('GET /clients/suggest error:', err);
    return res.status(500).json({ error: 'Erro ao buscar sugestões' });
  }
});

/**
 * GET /clients/:id
 * Busca cliente por ID dentro do tenant
 */
router.get('/:id', async (req, res) => {
  try {
    const client = await clientsService.getById(req.tenantId, req.params.id);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    return res.json(client);
  } catch (err) {
    console.error('GET /clients/:id error:', err);
    return res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

/**
 * POST /clients
 * Cria um novo cliente
 */
router.post('/', async (req, res) => {
  try {
    const client = await clientsService.create(req.tenantId, req.body);
    return res.status(201).json(client);
  } catch (err) {
    console.error('POST /clients error:', err);
    return res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

/**
 * PUT /clients/:id
 * Atualiza cliente
 */
router.put('/:id', async (req, res) => {
  try {
    const updated = await clientsService.update(req.tenantId, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Cliente não encontrado' });
    return res.json(updated);
  } catch (err) {
    console.error('PUT /clients/:id error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

/**
 * DELETE /clients/:id
 * Remove cliente
 */
router.delete('/:id', async (req, res) => {
  try {
    const removed = await clientsService.remove(req.tenantId, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Cliente não encontrado' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /clients/:id error:', err);
    return res.status(500).json({ error: 'Erro ao remover cliente' });
  }
});

module.exports = router;
