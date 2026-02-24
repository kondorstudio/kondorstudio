// api/src/routes/clients.js
const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const clientsService = require('../services/clientsService');
const integrationsService = require('../services/integrationsService');

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

// POST /clients/:clientId/integrations/:provider/connect (stub OAuth/connect)
router.post('/:clientId/integrations/:provider/connect', async (req, res) => {
  try {
    const { clientId, provider } = req.params;
    const integration = await integrationsService.connectClientIntegration(
      req.tenantId,
      clientId,
      provider,
      req.body || {},
    );
    return res.json(integration);
  } catch (err) {
    console.error('POST /clients/:clientId/integrations/:provider/connect error:', err);
    return res.status(400).json({ error: err.message || 'Erro ao conectar integração do cliente' });
  }
});

/**
 * GET /clients/:clientId/integrations
 * Lista integrações vinculadas a um cliente específico
 * Query params opcionais:
 *  ?provider=...
 *  ?status=...
 *  ?kind=...
 *  ?page=1
 *  ?perPage=50
 */
router.get('/:clientId/integrations', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { provider, status, kind, page, perPage } = req.query;

    const client = await clientsService.getById(req.tenantId, clientId);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    const result = await integrationsService.list(req.tenantId, {
      clientId,
      provider,
      status,
      kind,
      ownerType: 'CLIENT',
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });

    return res.json(result);
  } catch (err) {
    console.error('GET /clients/:clientId/integrations error:', err);
    return res.status(500).json({ error: 'Erro ao listar integrações do cliente' });
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
    if (err?.statusCode || err?.status) {
      const status = err.statusCode || err.status;
      const payload = { error: err.message || 'Erro ao criar cliente' };
      if (err?.code) payload.code = err.code;
      return res.status(status).json(payload);
    }
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
    if (err?.statusCode || err?.status) {
      const status = err.statusCode || err.status;
      const payload = { error: err.message || 'Erro ao atualizar cliente' };
      if (err?.code) payload.code = err.code;
      return res.status(status).json(payload);
    }
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
