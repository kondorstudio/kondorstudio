const { prisma } = require('../prisma');
const metricsService = require('./metricsService');

/**
 * Converte "7d", "30d" para quantidade de dias.
 * Default: 7 dias se não enviado ou inválido.
 */
function parseRange(range) {
  if (!range) return 7;
  const m = String(range).match(/^(\d+)(d)$/);
  if (!m) return 7;
  const num = parseInt(m[1], 10);
  if (isNaN(num) || num <= 0) return 7;
  return num;
}

module.exports = {
  async getSummary(tenantId, { range, clientId, clientIds } = {}) {
    const days = parseRange(range);
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // Filtros base
    let clientFilter = {};
    if (clientId) {
      clientFilter = { clientId };
    } else if (Array.isArray(clientIds)) {
      if (clientIds.length === 0) {
        return {
          rangeDays: days,
          totals: { clients: 0, posts: 0, tasks: 0 },
          postsByStatus: {},
          tasksByStatus: {},
          upcomingTasks: [],
          finance: [],
          metrics: {},
        };
      }
      clientFilter = { clientId: { in: clientIds } };
    }

    // Promises em paralelo para otimizar
    const [
      totalClients,
      totalPosts,
      postsByStatus,
      totalTasks,
      tasksByStatus,
      upcomingTasks,
      financeByType,
    ] = await Promise.all([
      // total de clientes
      prisma.client.count({
        where: {
          tenantId,
          ...(clientFilter.clientId ? clientFilter : {}),
        },
      }),

      // total de posts (opcional filtragem por client)
      prisma.post.count({
        where: {
          tenantId,
          ...clientFilter,
        },
      }),

      // posts por status para montar kanban / cards
      prisma.post.groupBy({
        by: ['status'],
        where: {
          tenantId,
          ...clientFilter,
        },
        _count: { _all: true },
      }),

      // total de tarefas
      prisma.task.count({
        where: {
          tenantId,
          ...clientFilter,
        },
      }),

      // tarefas por status
      prisma.task.groupBy({
        by: ['status'],
        where: {
          tenantId,
          ...clientFilter,
        },
        _count: { _all: true },
      }),

      // próximas tarefas (até 5), ordenadas por dueDate
      prisma.task.findMany({
        where: {
          tenantId,
          ...clientFilter,
          dueDate: {
            not: null,
          },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),

      // financeiro por tipo (income/expense/etc) no range de datas
      prisma.financialRecord.groupBy({
        by: ['type'],
        where: {
          tenantId,
          ...clientFilter,
          occurredAt: {
            gte: sinceDate,
          },
        },
        _sum: {
          amountCents: true,
        },
      }),

    ]);

    const metricsAggregated = await metricsService.quickSummary(tenantId, {
      days,
      metricTypes: ['impressions', 'clicks', 'conversions', 'spend', 'revenue'],
      clientId,
      clientIds: clientId ? null : clientIds || null,
    });

    // Transformar financeByType em estrutura amigável (com valor em reais)
    const financeSummary = financeByType.map((item) => ({
      type: item.type,
      amountCents: item._sum.amountCents || 0,
      amount: (item._sum.amountCents || 0) / 100,
    }));

    // Transformar métricas em estrutura amigável
    const metricsSummary = {
      impressions: metricsAggregated.totals.impressions || 0,
      clicks: metricsAggregated.totals.clicks || 0,
      conversions: metricsAggregated.totals.conversions || 0,
      spend: metricsAggregated.totals.spend || 0,
      revenue: metricsAggregated.totals.revenue || 0,
    };

    // Map de posts por status
    const postsStatusMap = {};
    postsByStatus.forEach((p) => {
      postsStatusMap[p.status] = p._count._all;
    });

    // Map de tasks por status
    const tasksStatusMap = {};
    tasksByStatus.forEach((t) => {
      tasksStatusMap[t.status] = t._count._all;
    });

    return {
      rangeDays: days,
      totals: {
        clients: totalClients,
        posts: totalPosts,
        tasks: totalTasks,
      },
      postsByStatus: postsStatusMap,
      tasksByStatus: tasksStatusMap,
      upcomingTasks,
      finance: financeSummary,
      metrics: metricsSummary,
    };
  },
};
