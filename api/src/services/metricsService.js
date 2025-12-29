// api/src/services/metricsService.js
// Serviço de métricas com suporte a integrações (ads/analytics) e posts.

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

async function resolveIntegration(tenantId, data = {}) {
  const integrationId = data.integrationId || data.integration_id;
  if (!integrationId) return null;
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
    select: { id: true, clientId: true, provider: true },
  });
  return integration || null;
}

function normalizeMetricName(input) {
  const raw = input || 'metric';
  return String(raw).trim();
}

module.exports = {
  async list(tenantId, opts = {}) {
    const {
      clientId,
      clientIds,
      integrationId,
      provider,
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
      where.OR = [
        { clientId },
        { post: { clientId } },
        { integration: { clientId } },
      ];
    } else if (Array.isArray(clientIds)) {
      if (clientIds.length === 0) {
        return { items: [], total: 0, page, perPage, totalPages: 0 };
      }
      where.OR = [
        { clientId: { in: clientIds } },
        { post: { clientId: { in: clientIds } } },
        { integration: { clientId: { in: clientIds } } },
      ];
    }
    if (integrationId) where.integrationId = integrationId;
    if (provider) where.provider = provider;

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
          integration: { select: { id: true, provider: true, ownerType: true, clientId: true } },
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
    const integration = await resolveIntegration(tenantId, data);
    if (!postId && !integration) {
      throw new Error('postId ou integrationId é obrigatório para criar a métrica');
    }

    const payload = {
      tenantId,
      postId,
      integrationId: integration ? integration.id : null,
      clientId:
        data.clientId ||
        data.client_id ||
        (integration ? integration.clientId : null) ||
        null,
      provider: data.provider || data.source || (integration ? integration.provider : null),
      name: normalizeMetricName(data.key || data.name || data.type),
      value: Number(data.value),
      collectedAt:
        toDateOrNull(data.timestamp || data.collectedAt || data.collected_at) ||
        new Date(),
      rangeFrom: toDateOrNull(data.rangeFrom || data.range_from),
      rangeTo: toDateOrNull(data.rangeTo || data.range_to),
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
      updateData.name = normalizeMetricName(data.key || data.name || data.type);
    }
    if (data.postId !== undefined || data.post_id !== undefined) {
      const resolved = await resolvePostId(tenantId, data);
      if (!resolved) {
        throw new Error('postId inválido');
      }
      updateData.postId = resolved;
    }
    if (data.integrationId !== undefined || data.integration_id !== undefined) {
      const integration = await resolveIntegration(tenantId, data);
      if (!integration) {
        throw new Error('integrationId inválido');
      }
      updateData.integrationId = integration.id;
      updateData.clientId = integration.clientId || null;
      updateData.provider = integration.provider || null;
    }
    if (data.clientId !== undefined || data.client_id !== undefined) {
      updateData.clientId = data.clientId || data.client_id || null;
    }
    if (data.provider !== undefined || data.source !== undefined) {
      updateData.provider = data.provider || data.source || null;
    }
    if (data.rangeFrom !== undefined || data.range_from !== undefined) {
      updateData.rangeFrom = toDateOrNull(data.rangeFrom || data.range_from);
    }
    if (data.rangeTo !== undefined || data.range_to !== undefined) {
      updateData.rangeTo = toDateOrNull(data.rangeTo || data.range_to);
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
      clientIds = null,
      integrationId = null,
      provider = null,
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
      joinSql = 'LEFT JOIN "posts" p ON p.id = m."postId" LEFT JOIN "integrations" i ON i.id = m."integrationId"';
      whereSql += ` AND (m."clientId" = $${idx} OR p."clientId" = $${idx} OR i."clientId" = $${idx})`;
      params.push(clientId);
      idx += 1;
    } else if (Array.isArray(clientIds)) {
      if (clientIds.length === 0) {
        return { buckets: [] };
      }
      joinSql = 'LEFT JOIN "posts" p ON p.id = m."postId" LEFT JOIN "integrations" i ON i.id = m."integrationId"';
      whereSql += ` AND (m."clientId" = ANY($${idx}) OR p."clientId" = ANY($${idx}) OR i."clientId" = ANY($${idx}))`;
      params.push(clientIds);
      idx += 1;
    }
    if (integrationId) {
      whereSql += ` AND m."integrationId" = $${idx}`;
      params.push(integrationId);
      idx += 1;
    }
    if (provider) {
      whereSql += ` AND m."provider" = $${idx}`;
      params.push(provider);
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
    const {
      days = 7,
      metricTypes = [],
      clientId = null,
      clientIds = null,
      integrationId = null,
      provider = null,
      startDate = null,
      endDate = null,
    } = options;

    let end = endDate ? new Date(endDate) : new Date();
    if (Number.isNaN(end.getTime())) {
      end = new Date();
    }

    let start = startDate ? new Date(startDate) : null;
    if (!start || Number.isNaN(start.getTime())) {
      start = new Date(end);
      start.setDate(start.getDate() - days);
    }

    const where = {
      tenantId,
      collectedAt: { gte: start, lte: end },
    };

    if (Array.isArray(metricTypes) && metricTypes.length) {
      where.name = { in: metricTypes };
    }

    if (clientId) {
      where.OR = [
        { clientId },
        { post: { clientId } },
        { integration: { clientId } },
      ];
    } else if (Array.isArray(clientIds)) {
      if (clientIds.length === 0) {
        return { totals: {}, range: { start, end } };
      }
      where.OR = [
        { clientId: { in: clientIds } },
        { post: { clientId: { in: clientIds } } },
        { integration: { clientId: { in: clientIds } } },
      ];
    }
    if (integrationId) {
      where.integrationId = integrationId;
    }
    if (provider) {
      where.provider = provider;
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
