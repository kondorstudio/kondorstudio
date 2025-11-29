// api/src/services/metricsService.js
// Service responsável por ingestão, consulta e agregação de métricas para um tenant.
// Projetado para ser simples, testável e eficiente com Prisma/Postgres.

const { prisma } = require('../prisma');

/**
 * Normaliza um valor de tempo para Date ou null
 */
function toDateOrNull(v) {
  if (!v && v !== 0) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

module.exports = {
  /**
   * Lista métricas com filtros básicos e paginação
   * opts: { metricType, clientId, startDate, endDate, page, perPage }
   */
  async list(tenantId, opts = {}) {
    const {
      metricType,
      clientId,
      startDate,
      endDate,
      page = 1,
      perPage = 100,
      order = 'desc',
    } = opts;

    const where = { tenantId };

    if (metricType) where.type = metricType;
    if (clientId) where.clientId = clientId;
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = toDateOrNull(startDate);
      if (endDate) where.timestamp.lte = toDateOrNull(endDate);
    }

    const skip = (Math.max(1, page) - 1) * perPage;
    const take = perPage;

    const [items, total] = await Promise.all([
      prisma.metric.findMany({
        where,
        orderBy: { timestamp: order === 'asc' ? 'asc' : 'desc' },
        skip,
        take,
      }),
      prisma.metric.count({ where }),
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
   * Ingesta (cria) uma métrica.
   * data: {
   *   clientId?,
   *   type: 'impression'|'click'|'spend'|'conversion'|...,
   *   value: number,
   *   timestamp?: Date|string|number,
   *   meta?: JSON
   * }
   */
  async ingest(tenantId, data = {}) {
    if (!data || typeof data !== 'object') {
      throw new Error('Dados de métrica inválidos');
    }
    if (!data.type) throw new Error('Campo "type" é obrigatório');
    if (data.value === undefined || data.value === null) throw new Error('Campo "value" é obrigatório');

    const payload = {
      tenantId,
      clientId: data.clientId || data.client_id || null,
      type: data.type,
      value: Number(data.value),
      timestamp: toDateOrNull(data.timestamp) || new Date(),
      meta: data.meta || data.metadata || null,
      source: data.source || null, // ex: "facebook", "google", "manual"
    };

    return prisma.metric.create({ data: payload });
  },

  /**
   * Recupera métrica por id (dentro do tenant)
   */
  async getById(tenantId, id) {
    if (!id) return null;
    return prisma.metric.findFirst({ where: { id, tenantId } });
  },

  /**
   * Atualiza métrica (pouco comum, mas disponível)
   */
  async update(tenantId, id, data = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const updateData = {};
    if (data.value !== undefined) updateData.value = Number(data.value);
    if (data.timestamp !== undefined) updateData.timestamp = toDateOrNull(data.timestamp);
    if (data.meta !== undefined) updateData.meta = data.meta;
    if (data.clientId !== undefined) updateData.clientId = data.clientId;

    await prisma.metric.update({ where: { id }, data: updateData });
    return this.getById(tenantId, id);
  },

  /**
   * Remove métrica
   */
  async remove(tenantId, id) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;
    await prisma.metric.delete({ where: { id } });
    return true;
  },

  /**
   * Agregação rápida de métricas por período e tipo.
   * options: { groupBy: 'day'|'hour'|'week'|'month', metricTypes: [], clientId, startDate, endDate }
   * Retorna objeto { buckets: [{ period, metrics: { type: aggregatedValue, ... } }, ...] }
   *
   * NOTE: Utiliza queries simples e Postgres date_trunc via prisma.$queryRaw para eficiência.
   */
  async aggregate(tenantId, options = {}) {
    const {
      groupBy = 'day',
      metricTypes = null,
      clientId = null,
      startDate = null,
      endDate = null,
    } = options;

    // map groupBy to postgres date_trunc precision
    const precisionMap = {
      hour: 'hour',
      day: 'day',
      week: 'week',
      month: 'month',
    };
    const precision = precisionMap[groupBy] || 'day';

    const params = [tenantId];
    let whereSql = `tenant_id = $1`;
    let idx = 2;

    if (clientId) {
      whereSql += ` AND client_id = $${idx}`;
      params.push(clientId);
      idx++;
    }
    if (startDate) {
      whereSql += ` AND timestamp >= $${idx}`;
      params.push(new Date(startDate).toISOString());
      idx++;
    }
    if (endDate) {
      whereSql += ` AND timestamp <= $${idx}`;
      params.push(new Date(endDate).toISOString());
      idx++;
    }
    if (Array.isArray(metricTypes) && metricTypes.length) {
      // build IN list with parameter placeholders
      const placeholders = metricTypes.map((_, i) => `$${idx + i}`).join(', ');
      whereSql += ` AND type IN (${placeholders})`;
      metricTypes.forEach((t) => params.push(t));
      idx += metricTypes.length;
    }

    // raw query: group by truncated timestamp and type, sum values
    const raw = `
      SELECT date_trunc('${precision}', timestamp) AS period,
             type,
             SUM(value) AS total_value
      FROM metric
      WHERE ${whereSql}
      GROUP BY period, type
      ORDER BY period ASC
    `;

    const rows = await prisma.$queryRawUnsafe(raw, ...params);

    // transform to buckets
    const bucketsMap = new Map();
    for (const r of rows) {
      const periodKey = new Date(r.period).toISOString();
      if (!bucketsMap.has(periodKey)) bucketsMap.set(periodKey, { period: periodKey, metrics: {} });
      const bucket = bucketsMap.get(periodKey);
      bucket.metrics[r.type] = Number(r.total_value);
    }

    return { buckets: Array.from(bucketsMap.values()) };
  },

  /**
   * Retorna resumo rápido (last N days) com totals por tipo.
   * options: { days: 7, metricTypes: [] }
   */
  async quickSummary(tenantId, options = {}) {
    const { days = 7, metricTypes = [] } = options;
    const start = new Date();
    start.setDate(start.getDate() - days);

    const where = {
      tenantId,
      timestamp: { gte: start },
    };
    if (Array.isArray(metricTypes) && metricTypes.length) {
      where.type = { in: metricTypes };
    }

    // group by type using prisma aggregation
    const rows = await prisma.metric.groupBy({
      by: ['type'],
      where,
      _sum: { value: true },
    });

    const result = {};
    for (const r of rows) {
      result[r.type] = (r._sum && r._sum.value) ? Number(r._sum.value) : 0;
    }

    return {
      since: start.toISOString(),
      totals: result,
    };
  },
};
