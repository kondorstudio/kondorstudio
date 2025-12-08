// api/src/services/tasksService.js
// Service para CRUD de tarefas (tasks) dentro de um tenant

const { prisma } = require('../prisma');

/**
 * Converte valores diversos em Date ou null
 */
function toDateOrNull(value) {
  if (!value && value !== 0) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

module.exports = {
  /**
   * Lista tarefas do tenant
   * Filtros:
   *  - status
   *  - assignedTo
   *  - priority
   *  - q (busca livre)
   * Paginação:
   *  - page / perPage
   */
  async list(tenantId, opts = {}) {
    const {
      status,
      assignedTo,
      priority,
      q,
      page = 1,
      perPage = 50,
    } = opts;

    const where = { tenantId };

    if (status) where.status = status;
    if (assignedTo) where.assignedTo = assignedTo;
    if (priority) where.priority = priority;

    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const skip = (Math.max(1, page) - 1) * perPage;

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
      }),
      prisma.task.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  },

  /**
   * Cria uma tarefa
   */
  async create(tenantId, userId, data = {}) {
    const payload = {
      tenantId,
      title: data.title,
      description: data.description || null,
      status: data.status || 'TODO',
      priority: data.priority || 'MEDIUM',
      assignedTo: data.assignedTo || null,
      dueDate: toDateOrNull(data.dueDate || data.due_date),
      createdBy: userId || null,
      comments: data.comments || null,
    };

    return prisma.task.create({ data: payload });
  },

  /**
   * Busca tarefa por ID
   */
  async getById(tenantId, id) {
    if (!id) return null;
    return prisma.task.findFirst({
      where: { id, tenantId },
    });
  },

  /**
   * Atualiza tarefa
   */
  async update(tenantId, id, data = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const updateData = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;

    if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;

    if (data.comments !== undefined) updateData.comments = data.comments;

    if (data.dueDate !== undefined || data.due_date !== undefined) {
      const value = data.dueDate || data.due_date;
      updateData.dueDate = toDateOrNull(value);
    }

    await prisma.task.update({
      where: { id },
      data: updateData,
    });

    return this.getById(tenantId, id);
  },

  /**
   * Remove tarefa
   */
  async remove(tenantId, id) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;

    await prisma.task.delete({
      where: { id },
    });

    return true;
  },

  /**
   * Sugestão rápida para busca por título
   */
  async suggest(tenantId, term, limit = 10) {
    if (!term) return [];
    return prisma.task.findMany({
      where: {
        tenantId,
        title: { contains: term, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, title: true, status: true },
    });
  },
};
