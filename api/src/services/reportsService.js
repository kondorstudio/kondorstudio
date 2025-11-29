// api/src/services/reportsService.js
// Service de relatórios (Report) baseado no schema Prisma atual.
//
// Model Report (schema.prisma):
// model Report {
//   id          String   @id @default(uuid())
//   tenantId    String
//   tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
//   name        String
//   type        String   // e.g., monthly_metrics, campaign_performance
//   params      Json?
//   status      String   @default("pending")
//   fileId      String?
//   file        Upload?  @relation(fields: [fileId], references: [id], onDelete: SetNull, name: "Report_File")
//   generatedAt DateTime?
//   createdAt   DateTime @default(now())
//   updatedAt   DateTime @updatedAt
// }
//
// Este service expõe:
//  - list(tenantId, { type, status }?)
//  - getById(tenantId, id)
//  - create(tenantId, userId, data)
//  - update(tenantId, id, data)
//  - remove(tenantId, id)
//
// OBS:
// - clientId, período etc. podem ser salvos dentro de params (JSON).

const { prisma } = require('../prisma');

/**
 * Normaliza params JSON para sempre ser um objeto simples.
 */
function normalizeParams(input) {
  if (!input) return {};
  if (typeof input === 'object') return input;
  try {
    return JSON.parse(String(input));
  } catch (e) {
    return { raw: input };
  }
}

module.exports = {
  /**
   * Lista relatórios do tenant com filtros opcionais.
   * Filtros suportados:
   *  - type   (string)
   *  - status (string)
   *
   * Obs: clientId pode estar em params.clientId; se precisar filtrar por isso
   * futuramente, podemos adicionar filtro JSON específico.
   */
  async list(tenantId, { type, status } = {}) {
    const where = { tenantId };

    if (type) where.type = type;
    if (status) where.status = status;

    return prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        file: true,
      },
    });
  },

  /**
   * getById
   * Retorna um único relatório do tenant.
   */
  async getById(tenantId, id) {
    if (!tenantId || !id) return null;

    return prisma.report.findFirst({
      where: { id, tenantId },
      include: {
        file: true,
      },
    });
  },

  /**
   * create
   *
   * data esperado:
   *  - name/title
   *  - type
   *  - params (objeto extra: clientId, período, métricas, etc.)
   *  - status (opcional, default 'pending')
   *  - fileId (opcional, se já tiver um Upload criado)
   *  - generatedAt (opcional, Date)
   */
  async create(tenantId, userId, data = {}) {
    if (!tenantId) throw new Error('tenantId é obrigatório em reportsService.create');

    const name = data.name || data.title || 'Relatório';
    const type = data.type || 'custom';
    const params = normalizeParams(data.params || data.meta);
    const status = data.status || 'pending';

    const report = await prisma.report.create({
      data: {
        tenantId,
        name,
        type,
        params,
        status,
        fileId: data.fileId || null,
        generatedAt: data.generatedAt || null,
      },
    });

    return report;
  },

  /**
   * update
   *
   * Permite atualizar name, type, status, fileId, generatedAt, params.
   */
  async update(tenantId, id, data = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const updateData = {};

    if (typeof data.name === 'string') updateData.name = data.name;
    if (typeof data.title === 'string') updateData.name = data.title;
    if (typeof data.type === 'string') updateData.type = data.type;
    if (typeof data.status === 'string') updateData.status = data.status;

    if (data.params || data.meta) {
      updateData.params = normalizeParams(data.params || data.meta);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'fileId')) {
      updateData.fileId = data.fileId || null;
    }

    if (data.generatedAt) {
      const d = new Date(data.generatedAt);
      if (!Number.isNaN(d.getTime())) {
        updateData.generatedAt = d;
      }
    }

    if (Object.keys(updateData).length === 0) {
      // nada para atualizar; retorna o existente
      return existing;
    }

    await prisma.report.update({
      where: { id: existing.id },
      data: updateData,
    });

    return this.getById(tenantId, id);
  },

  /**
   * remove
   *
   * Remove relatório do tenant.
   */
  async remove(tenantId, id) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;

    await prisma.report.delete({
      where: { id: existing.id },
    });

    return true;
  },
};
