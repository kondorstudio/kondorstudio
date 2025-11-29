// api/src/services/clientsService.js
// Service responsável por operações CRUD e utilitárias sobre clients (escopadas por tenant)

const { prisma } = require('../prisma');

module.exports = {
  /**
   * Lista clientes do tenant com opções de paginação e filtros básicos.
   * @param {String} tenantId
   * @param {Object} opts - { q, page, perPage, tags }
   */
  async list(tenantId, opts = {}) {
    const { q, page = 1, perPage = 50, tags } = opts;
    const where = { tenantId };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (tags && Array.isArray(tags) && tags.length) {
      where.tags = { hasSome: tags };
    }

    const skip = (Math.max(1, page) - 1) * perPage;
    const take = perPage;

    const [items, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.client.count({ where }),
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
   * Cria um novo client no tenant
   * @param {String} tenantId
   * @param {Object} data
   */
    async create(tenantId, data = {}) {
    const payload = {
      tenantId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      company: data.company || null,
      website: data.website || null,
      notes: data.notes || null,
      tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []),
      metadata: data.metadata || null,
      monthlyFee: data.monthlyFee !== undefined ? data.monthlyFee : null,
      renewalDate: data.renewalDate ? new Date(data.renewalDate) : null,
      // Opt-in para receber mensagens via WhatsApp
      whatsappOptIn: data.whatsappOptIn === true, // default false
    };

    return prisma.client.create({ data: payload });
  },

  /**
   * Busca client por id (dentro do tenant)
   * @param {String} tenantId
   * @param {String} id
   */
  async getById(tenantId, id) {
    if (!id) return null;
    return prisma.client.findFirst({
      where: { id, tenantId },
    });
  },

  /**
   * Atualiza client. Retorna o client atualizado ou null se não existir.
   * @param {String} tenantId
   * @param {String} id
   * @param {Object} data
   */
  async update(tenantId, id, data = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

        const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.company !== undefined) updateData.company = data.company;
    if (data.website !== undefined) updateData.website = data.website;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.monthlyFee !== undefined) updateData.monthlyFee = data.monthlyFee;
    if (data.renewalDate !== undefined) updateData.renewalDate = data.renewalDate ? new Date(data.renewalDate) : null;
    if (data.tags !== undefined) updateData.tags = Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []);
    if (data.metadata !== undefined) updateData.metadata = data.metadata;
    if (data.whatsappOptIn !== undefined) updateData.whatsappOptIn = !!data.whatsappOptIn;

    await prisma.client.update({
      where: { id },
      data: updateData,
    });

    return this.getById(tenantId, id);
  },

  /**
   * Remove client (dentro do tenant)
   * @param {String} tenantId
   * @param {String} id
   */
  async remove(tenantId, id) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;

    await prisma.client.delete({
      where: { id },
    });

    return true;
  },

  /**
   * Busca clientes por campo específico (útil para autosuggest)
   * @param {String} tenantId
   * @param {String} term
   * @param {Number} limit
   */
  async suggest(tenantId, term, limit = 10) {
    if (!term) return [];
    return prisma.client.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { company: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
  },

  /**
   * Upsert helper: cria ou atualiza por email (dentro do tenant)
   * @param {String} tenantId
   * @param {Object} data
   */
  async upsertByEmail(tenantId, data = {}) {
    if (!data.email) {
      throw new Error('Email é necessário para upsertByEmail');
    }
    const existing = await prisma.client.findFirst({
      where: { tenantId, email: data.email },
    });
    if (existing) {
      return this.update(tenantId, existing.id, data);
    }
    return this.create(tenantId, data);
  },
};
