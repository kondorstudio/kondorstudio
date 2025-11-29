const tasksService = require('../services/tasksService');

// Listar tarefas
async function list(req, res) {
  try {
    const tenantId = req.tenantId;
    const { status, clientId, assigneeId } = req.query;

    const tasks = await tasksService.list(tenantId, { status, clientId, assigneeId });
    return res.json(tasks);
  } catch (err) {
    console.error('list tasks error:', err);
    return res.status(500).json({ error: 'Erro ao buscar tarefas' });
  }
}

// Criar tarefa
async function create(req, res) {
  try {
    const tenantId = req.tenantId;
    const data = req.body;

    if (!data.title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const task = await tasksService.create(tenantId, data);
    return res.status(201).json(task);
  } catch (err) {
    console.error('create task error:', err);
    return res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
}

// Obter tarefa por ID
async function getById(req, res) {
  try {
    const tenantId = req.tenantId;
    const taskId = req.params.id;

    const task = await tasksService.getById(tenantId, taskId);

    if (!task) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    return res.json(task);
  } catch (err) {
    console.error('getById task error:', err);
    return res.status(500).json({ error: 'Erro ao buscar tarefa' });
  }
}

// Atualizar tarefa
async function update(req, res) {
  try {
    const tenantId = req.tenantId;
    const taskId = req.params.id;
    const data = req.body;

    const updated = await tasksService.update(tenantId, taskId, data);

    if (!updated) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    return res.json(updated);
  } catch (err) {
    console.error('update task error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar tarefa' });
  }
}

// Atualizar status da tarefa
async function updateStatus(req, res) {
  try {
    const tenantId = req.tenantId;
    const taskId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const updated = await tasksService.updateStatus(tenantId, taskId, status);

    if (!updated) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    return res.json(updated);
  } catch (err) {
    console.error('updateStatus task error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status' });
  }
}

// Deletar tarefa
async function remove(req, res) {
  try {
    const tenantId = req.tenantId;
    const taskId = req.params.id;

    await tasksService.remove(tenantId, taskId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete task error:', err);
    return res.status(500).json({ error: 'Erro ao deletar tarefa' });
  }
}

module.exports = {
  list,
  create,
  getById,
  update,
  updateStatus,
  remove
};