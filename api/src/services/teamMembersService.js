// api/src/services/teamMembersService.js
// Service para gerenciar membros da equipe (team members) dentro de um tenant

const { prisma } = require('../prisma');

/**
 * Normaliza tags/roles em arrays quando necessário
 */
function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

module.exports = {
  /**
   * Lista membros do tenant com paginação e filtros
   * opts: { q, role, page, perPage }
   */
  async list(tenantId, opts = {}) {
    const { q, role, page = 1, perPage = 50 } = opts;
    const where = { tenantId };

    if (role) where.role = role;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const skip = (Math.max(1, page) - 1) * perPage;

    const [items, total] = await Promise.all([
      prisma.teamMember.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
      }),
      prisma.teamMember.count({ where }),
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
   * Cria um novo membro de equipe no tenant
   * data: { name, email, role, phone, avatarUrl, permissions, active }
   */
  async create(tenantId, data = {}) {
    if (!data.email) throw new Error('Email é obrigatório para criar membro');
    const payload = {
      tenantId,
      name: data.name || null,
      email: data.email,
      role: data.role || 'member',
      phone: data.phone || null,
      avatarUrl: data.avatarUrl || data.avatar_url || null,
      permissions: data.permissions ? JSON.stringify(data.permissions) : null,
      active: data.active === undefined ? true : Boolean(data.active),
      metadata: data.metadata || null,
    };

    return prisma.teamMember.create({ data: payload });
  },

  /**
   * Busca membro por id dentro do tenant
   */
  async getById(tenantId, id) {
    if (!id) return null;
    return prisma.teamMember.findFirst({
      where: { id, tenantId },
    });
  },

  /**
   * Atualiza membro (campo-a-campo)
   */
  async update(tenantId, id, data = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.avatarUrl !== undefined || data.avatar_url !== undefined) {
      updateData.avatarUrl = data.avatarUrl || data.avatar_url || null;
    }
    if (data.permissions !== undefined) {
      updateData.permissions = typeof data.permissions === 'string'
        ? data.permissions
        : JSON.stringify(data.permissions);
    }
    if (data.active !== undefined) updateData.active = Boolean(data.active);
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    await prisma.teamMember.update({
      where: { id },
      data: updateData,
    });

    return this.getById(tenantId, id);
  },

  /**
   * Remove membro (soft delete preferível, mas aqui implementamos hard delete se desejar)
   * Se preferir soft delete, altere para update({ active: false })
   */
  async remove(tenantId, id, { soft = true } = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;

    if (soft) {
      await prisma.teamMember.update({
        where: { id },
        data: { active: false },
      });
    } else {
      await prisma.teamMember.delete({ where: { id } });
    }

    return true;
  },

  /**
   * Assign role(s) para um usuário da equipe
   * roles pode ser string ou array
   */
  async assignRoles(tenantId, id, roles) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const normalized = toArray(roles);
    // salva como JSON string para flexibilidade ou em campo dedicado se existir
    await prisma.teamMember.update({
      where: { id },
      data: { permissions: JSON.stringify(normalized) },
    });

    return this.getById(t
