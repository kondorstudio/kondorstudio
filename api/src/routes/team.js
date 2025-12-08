// api/src/routes/team.js
// Rotas da equipe (Team / TeamMembers) para o tenant atual.

const express = require('express');
const router = express.Router();
const teamMembersService = require('../services/teamMembersService');

/**
 * Helper pra garantir tenantId
 */
function getTenantIdOrFail(req, res) {
  const tenantId = req.tenantId || (req.tenant && req.tenant.id);
  if (!tenantId) {
    res.status(401).json({ error: 'Tenant não identificado' });
    return null;
  }
  return tenantId;
}

/**
 * GET /api/team
 * Lista membros da equipe do tenant.
 * Query params opcionais:
 *  - search
 *  - role (admin|member)
 *  - status (active|suspended)
 *  - limit, page
 */
router.get('/', async (req, res) => {
  const tenantId = getTenantIdOrFail(req, res);
  if (!tenantId) return;

  try {
    const {
      search,
      role,
      status,
      limit,
      page,
    } = req.query;

    const members = await teamMembersService.list(tenantId, {
      search,
      role,
      status,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });

    return res.json(members);
  } catch (err) {
    console.error('GET /api/team error', err);
    return res.status(500).json({ error: 'Erro ao listar equipe' });
  }
});

/**
 * GET /api/team/suggest
 * Sugestões rápidas (para autocomplete).
 */
router.get('/suggest', async (req, res) => {
  const tenantId = getTenantIdOrFail(req, res);
  if (!tenantId) return;

  try {
    const { search, limit } = req.query;

    const members = await teamMembersService.suggest(tenantId, {
      search,
      limit: limit ? Number(limit) : undefined,
    });

    return res.json(members);
  } catch (err) {
    console.error('GET /api/team/suggest error', err);
    return res
      .status(500)
      .json({ error: 'Erro ao buscar sugestões de membros' });
  }
});

/**
 * GET /api/team/:id
 * Detalhe de um membro.
 */
router.get('/:id', async (req, res) => {
  const tenantId = getTenantIdOrFail(req, res);
  if (!tenantId) return;

  const { id } = req.params;

  try {
    const member = await teamMembersService.getById(tenantId, id);
    if (!member) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }
    return res.json(member);
  } catch (err) {
    console.error('GET /api/team/:id error', err);
    return res.status(500).json({ error: 'Erro ao carregar membro' });
  }
});

/**
 * POST /api/team
 * Cria novo membro.
 * Body esperado (mínimo):
 *  - name
 *  - email
 *  - role (admin|member) [opcional]
 *  - status (active|suspended) [opcional]
 *  - permissions (objeto JSON) [opcional]
 */
router.post('/', async (req, res) => {
  const tenantId = getTenantIdOrFail(req, res);
  if (!tenantId) return;

  const {
    name,
    email,
    role,
    status,
    permissions,
    username,
    password,
    salary,
  } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Email é obrigatório' });
  }

  try {
    const member = await teamMembersService.create(tenantId, {
      name,
      email,
      role,
      status,
      permissions,
      username,
      password,
      salary,
    });

    return res.status(201).json(member);
  } catch (err) {
    console.error('POST /api/team error', err);
    return res.status(500).json({ error: 'Erro ao criar membro' });
  }
});

/**
 * PUT /api/team/:id
 * Atualiza membro existente.
 * Body pode conter:
 *  - name
 *  - role (admin|member)
 *  - status (active|suspended)
 *  - permissions (objeto JSON)
 */
router.put('/:id', async (req, res) => {
  const tenantId = getTenantIdOrFail(req, res);
  if (!tenantId) return;

  const { id } = req.params;
  const {
    name,
    email,
    role,
    status,
    permissions,
    username,
    password,
    salary,
  } = req.body || {};

  try {
    const updated = await teamMembersService.update(tenantId, id, {
      name,
      email,
      role,
      status,
      permissions,
      username,
      password,
      salary,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    return res.json(updated);
  } catch (err) {
    console.error('PUT /api/team/:id error', err);
    return res.status(500).json({ error: 'Erro ao atualizar membro' });
  }
});

/**
 * POST /api/team/:id/roles
 * Atribui "roles" adicionais (hoje persiste no campo permissions.extraRoles).
 * Body:
 *  - roles: string | string[]
 */
router.post('/:id/roles', async (req, res) => {
  const tenantId = getTenantIdOrFail(req, res);
  if (!tenantId) return;

  const { id } = req.params;
  const { roles } = req.body || {};

  try {
    const updated = await teamMembersService.assignRoles(tenantId, id, roles);
    if (!updated) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }
    return res.json(updated);
  } catch (err) {
    console.error('POST /api/team/:id/roles error', err);
    return res.status(500).json({ error: 'Erro ao atualizar roles do membro' });
  }
});

/**
 * POST /api/team/:id/send-invite
 * Gera uma senha temporária para o usuário do membro e retorna para o admin.
 * (Envio de e-mail pode ser implementado depois.)
 */
router.post('/:id/send-invite', async (req, res) => {
  const tenantId = getTenantIdOrFail(req, res);
  if (!tenantId) return;

  const { id } = req.params;

  try {
    const result = await teamMembersService.sendInvite(tenantId, id);
    if (!result) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    // result: { tempPassword }
    return res.json(result);
  } catch (err) {
    console.error('POST /api/team/:id/send-invite error', err);
    return res
      .status(500)
      .json({ error: 'Erro ao gerar/enviar convite para o membro' });
  }
});

/**
 * DELETE /api/team/:id
 * Remove membro.
 * Query:
 *  - soft=true|false  (default: true → apenas desativa o usuário)
 */
router.delete('/:id', async (req, res) => {
  const tenantId = getTenantIdOrFail(req, res);
  if (!tenantId) return;

  const { id } = req.params;
  const { soft } = req.query;

  try {
    const ok = await teamMembersService.remove(tenantId, id, {
      soft: soft === undefined ? true : soft === 'true',
    });

    if (!ok) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    return res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/team/:id error', err);
    return res.status(500).json({ error: 'Erro ao remover membro' });
  }
});

module.exports = router;
