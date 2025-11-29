const { prisma } = require('../utils/prisma');

function toIntCents(value) {
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }
  if (typeof value === 'string') {
    const num = parseFloat(value.replace(',', '.'));
    if (isNaN(num)) return null;
    return Math.round(num * 100);
  }
  return null;
}

module.exports = {
  // Lista registros financeiros do tenant com filtros opcionais
  async list(tenantId, { clientId, type, startDate, endDate } = {}) {
    const where = { tenantId };

    if (clientId) {
      where.clientId = clientId;
    }

    if (type) {
      where.type = type;
    }

    if (startDate || endDate) {
      where.occurredAt = {};
      if (startDate) {
        where.occurredAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.occurredAt.lte = new Date(endDate);
      }
    }

    return prisma.financialRecord.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
    });
  },

  // Cria um novo registro financeiro
  async create(tenantId, data) {
    let amountCents = data.amountCents || data.amount_cents;

    if (typeof amountCents === 'undefined' && typeof data.amount !== 'undefined') {
      amountCents = toIntCents(data.amount);
    }

    if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
      throw new Error('invalid amountCents');
    }

    return prisma.financialRecord.create({
      data: {
        tenantId,
        clientId: data.clientId || data.client_id || null,
        type: data.type,
        amountCents,
        currency: data.currency || 'BRL',
        note: data.note || null,
        occurredAt: data.occurredAt || data.occurred_at ? new Date(data.occurredAt || data.occurred_at) : new Date(),
      },
    });
  },

  // Busca registro por ID dentro do tenant
  async getById(tenantId, id) {
    return prisma.financialRecord.findFirst({
      where: {
        id,
        tenantId,
      },
    });
  },

  // Atualiza um registro financeiro
  async update(tenantId, id, data) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const updateData = {};

    if (data.type !== undefined) updateData.type = data.type;
    if (data.note !== undefined) updateData.note = data.note;
    if (data.currency !== undefined) updateData.currency = data.currency;

    if (data.clientId !== undefined || data.client_id !== undefined) {
      updateData.clientId = data.clientId || data.client_id || null;
    }

    if (data.amountCents !== undefined || data.amount_cents !== undefined || data.amount !== undefined) {
      let amountCents = data.amountCents || data.amount_cents;
      if (typeof amountCents === 'undefined' && typeof data.amount !== 'undefined') {
        amountCents = toIntCents(data.amount);
      }
      if (typeof amountCents === 'number' && Number.isInteger(amountCents)) {
        updateData.amountCents = amountCents;
      }
    }

    if (data.occurredAt !== undefined || data.occurred_at !== undefined) {
      const occurredValue = data.occurredAt || data.occurred_at;
      updateData.occurredAt = occurredValue ? new Date(occurredValue) : new Date();
    }

    await prisma.financialRecord.update({
      where: { id },
      data: updateData,
    });

    return this.getById(tenantId, id);
  },

  // Remove um registro
  async remove(tenantId, id) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;

    await prisma.financialRecord.delete({
      where: { id },
    });

    return true;
  },
};