// api/src/services/metricsService.js
// Serviço de métricas baseado no schema atual (metric -> post obrigatório).

const { prisma } = require('../prisma');

function toDateOrNull(value) {
  if (!value && value !== 0) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function resolvePostId(tenantId, data = {}) {
  const postId = data.postId || data.post_id;
  if (!postId) return null;
  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId },
    select: { id: true },
  });
  return post ? post.id : null;
}

module.exports = {
  async list(tenantId, opts = {}) {
    const {
      clientId,
      key,
      metricType,
      startDate,
      endDate,
      startTs,
      endTs,
      page = 1,
      perPage = 100,
      order = 'desc',
    } = opts;

    const where = { tenantId };
    const metricKey = key || metricType;
    if (metricKey) where.name = metricKey;

    if (clientId) {
      where.post = { clientId };
    }

    const rangeStart = startTs || startDate;
    const rangeEnd = endTs || endDate;
    if (rangeStart || rangeEnd) {
      where.collectedAt = {};
      if (rangeStart) where.collectedAt.gte = toDateOrNull(rangeStart);
      if (rangeEnd) where.collectedAt.lte = toDateOrNull(rangeEnd);
    }

    const skip = (Math.max(1, page) - 1) * perPage;
    const take = perPage;

    const [items, total] = await Promise.all([
      prisma.metric.findMany({
        where,
        orderBy: { collectedAt: order === 'asc' ? 'asc' : 'desc' },
        skip,
        take,
        include: {
          post: { select: { id: true, clientId: true, title: true } },
        },
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

  async create(tenantId, data = {}) {
    const postId = await resolvePostId(tenantId, data);
    if (!postId) {
      throw new Error('postId é obrigatório para criar a métrica');
    }

    const payload = {
      tenantId,
      postId,
      name: data.key || data.name || data.type || 'metric',
      value: Number(data.value),
      collectedAt:
        toDateOrNull(data.timestamp || data.collectedAt || data.collected_at) ||
        new Date(),
      meta: data.meta || data.metadata || {},
    };

    return prisma.metric.create({ data: payload });
  },

  async ingest(tenantId, data = {}) {
    return this.create(tenantId, data);
  },

  async getById(tenantId, id) {
    if (!id) return null;
    return prisma.metric.findFirst({ where: { id, tenantId } });
  },

  async update(tenantId, id, data = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const updateData = {};
    if (data.value !== undefined) updateData.value = Number(data.value);
    if (
      data.timestamp !== undefined ||
      data.collectedAt !== undefined ||
      data.collected_at !== undefined
    ) {
      updateData.collectedAt = toDateOrNull(
        data.timestamp || data.collectedAt || data.collected_at,
      );
    }
    if (data.meta !== undefined) updateData.meta = data.meta;
    if (data.key !== undefined || data.name !== undefined || data.type !== undefined) {
      updateData.name = data.key || data.name || data.type;
    }
    if (data.postId !== undefined || data.post_id !== undefined) {
      const resolved = await resolvePostId(tenantId, data);
      if (!resolved) {
        throw new Error('postId inválido');
      }
      updateData.postId = resolved;
    }

    await prisma.metric.update({ where: { id }, data: updateData });
    return this.getById(tenantId, id);
  },

  async remove(tenantId, id) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;
    await prisma.metric.delete({ where: { id } });
    return true;
  },

  async aggregate(tenantId, options = {}) {
    const {
      groupBy = 'day',
      metricTypes = null,
      clientId = null,
      startDate = null,
      endDate = null,
    } = options;

    const precisionMap = {
      hour: 'hour',
      day: 'day',
      week: 'week',
      month: 'month',
    };
    const precision = precisionMap[groupBy] || 'day';

    const params = [tenantId];
    let idx = 2;
    let joinSql = '';
    let whereSql = `m."tenantId" = $1`;

    if (clientId) {
      joinSql = 'INNER JOIN "posts" p ON p.id = m."postId"';
      whereSql += ` AND p."clientId" = $${idx}`;
      params.push(clientId);
      idx += 1;
    }

    if (startDate) {
      whereSql += ` AND m."collectedAt" >= $${idx}`;
      params.push(new Date(startDate).toISOString());
      idx += 1;
    }
    if (endDate) {
      whereSql += ` AND m."collectedAt" <= $${idx}`;
      params.push(new Date(endDate).toISOString());
      idx += 1;
    }
    if (Array.isArray(metricTypes) && metricTypes.length) {
      const placeholders = metricTypes.map((_, i) => `$${idx + i}`).join(', ');
      whereSql += ` AND m."name" IN (${placeholders})`;
      metricTypes.forEach((t) => params.push(t));
      idx += metricTypes.length;
    }

    const raw = `
      SELECT date_trunc('${precision}', m."collectedAt") AS period,
             m."name" AS metric_name,
             SUM(m.value) AS total_value
      FROM "metrics" m
      ${joinSql}
      WHERE ${whereSql}
      GROUP BY period, metric_name
      ORDER BY period ASC
    `;

    const rows = await prisma.$queryRawUnsafe(raw, ...params);

    const bucketsMap = new Map();
    rows.forEach((r) => {
      const periodKey = new Date(r.period).toISOString();
      if (!bucketsMap.has(periodKey)) {
        bucketsMap.set(periodKey, { period: periodKey, metrics: {} });
      }
      const bucket = bucketsMap.get(periodKey);
      bucket.metrics[r.metric_name] = Number(r.total_value);
    });

    return { buckets: Array.from(bucketsMap.values()) };
  },

  async quickSummary(tenantId, options = {}) {
    const { days = 7, metricTypes = [], clientId = null } = options;
    const start = new Date();
    start.setDate(start.getDate() - days);

    const where = {
      tenantId,
      collectedAt: { gte: start },
    };

    if (Array.isArray(metricTypes) && metricTypes.length) {
      where.name = { in: metricTypes };
    }

    if (clientId) {
      where.post = { clientId };
    }

    const rows = await prisma.metric.groupBy({
      by: ['name'],
      where,
      _sum: { value: true },
    });

    const totals = {};
    rows.forEach((row) => {
      totals[row.name] =
        row._sum && row._sum.value ? Number(row._sum.value) : 0;
    });

    return {
      since: start.toISOString(),
      totals,
    };
  },
};
