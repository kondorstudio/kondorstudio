const clientsService = require('../services/clientsService');

// Listar clientes
async function list(req, res) {
  try {
    const tenantId = req.tenantId;
    const clients = await clientsService.list(tenantId);
    return res.json(clients);
  } catch (err) {
    console.error('list clients error:', err);
    return res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
}

// Criar cliente
async function create(req, res) {
  try {
    const tenantId = req.tenantId;
    const data = req.body;

    if (!data.name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const client = await clientsService.create(tenantId, data);
    return res.status(201).json(client);
  } catch (err) {
    console.error('create client error:', err);
    return res.status(500).json({ error: 'Erro ao criar cliente' });
  }
}

// Obter cliente por ID
async function getById(req, res) {
  try {
    const tenantId = req.tenantId;
    const clientId = req.params.id;

    const client = await clientsService.getById(tenantId, clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    return res.json(client);
  } catch (err) {
    console.error('getById client error:', err);
    return res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
}

// Atualizar cliente
async function update(req, res) {
  try {
    const tenantId = req.tenantId;
    const clientId = req.params.id;
    const data = req.body;

    const updated = await clientsService.update(tenantId, clientId, data);

    if (!updated) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    return res.json(updated);
  } catch (err) {
    console.error('update client error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
}

// Deletar cliente
async function remove(req, res) {
  try {
    const tenantId = req.tenantId;
    const clientId = req.params.id;

    await clientsService.remove(tenantId, clientId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete client error:', err);
    return res.status(500).json({ error: 'Erro ao deletar cliente' });
  }
}

module.exports = {
  list,
  create,
  getById,
  update,
  remove
};