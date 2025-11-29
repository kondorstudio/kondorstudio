const { prisma } = require('../utils/prisma');

module.exports = {
  // Lista criativos do tenant com filtros opcionais
  async list(tenantId, { clientId, fileType, postId } = {}) {
    const where = { tenantId };

    if (clientId) where.clientId = clientId;
    if (fileType) where.fileType = fileType;
    if (postId) where.postId = postId;

    return prisma.creative.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },

  // Cria um novo criativo
  async create(tenantId, data) {
    return prisma.creative.create({
      data: {
        tenantId,
        clientId: data.clientId || data.client_id || null,
        postId: data.postId || data.post_id || null,
        name: data.name,
        fileUrl: data.fileUrl || data.file_url,
        fileType: data.fileType || data.file_type || 'image',
        tags: data.tags || [],
        notes: data.notes || null,
        performanceScore: data.performanceScore || data.performance_score || null,
        impressions: data.impressions || 0,
        clicks: data.clicks || 0,
        ctr: data.ctr || null,
      },
    });
  },

  // Busca criativo por ID dentro do tenant
  async getById(tenantId, id) {
    return prisma.creative.findFirst({
      where: {
        id,
        tenantId,
      },
    });
  },

  // Atualiza criativo
  async update(tenantId, id, data) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const updateData = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.fileUrl !== undefined || data.file_url !== undefined) {
      updateData.fileUrl = data.fileUrl || data.file_url;
    }
    if (data.fileType !== undefined || data.file_type !== undefined) {
      updateData.fileType = data.fileType || data.file_type;
    }
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.notes !== undefined) updateData.notes = data.notes;

    if (data.clientId !== undefined || data.client_id !== undefined) {
      updateData.clientId = data.clientId || data.client_id || null;
    }
    if (data.postId !== undefined || data.post_id !== undefined) {
      updateData.postId = data.postId || data.post_id || null;
    }

    if (data.performanceScore !== undefined || data.performance_score !== undefined) {
      updateData.performanceScore = data.performanceScore || data.performance_score;
    }
    if (data.impressions !== undefined) updateData.impressions = data.impressions;
    if (data.clicks !== undefined) updateData.clicks = data.clicks;
    if (data.ctr !== undefined) updateData.ctr = data.ctr;

    await prisma.creative.update({
      where: { id },
      data: updateData,
    });

    return this.getById(tenantId, id);
  },

  // Remove criativo
  async remove(tenantId, id) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;

    await prisma.creative.delete({
      where: { id },
    });

    return true;
  },
};