// api/src/prisma.js
// Conexão Prisma central com helpers multi-tenant
// Versão robusta que expõe:
//  - prisma (instância padrão, para admin / scripts)
//  - useTenant(tenantId) -> retorna um objeto com métodos do prisma já limitados ao tenant
//
// Principais decisões:
//  - addWhereTenant: adiciona { tenantId } em queries find* / count / aggregate onde fizer sentido
//  - addDataTenant: injeta tenantId em create/createMany
//  - métodos update/delete NÃO forçam tenantId (use com cuidado) — preferir where: { id, tenantId }
//  - exporta $raw / $executeRaw para consultas arbitrárias quando necessário

const { PrismaClient } = require('@prisma/client');

const DEFAULT_PRISMA_CONNECTION_LIMIT = Math.max(
  1,
  Number(
    process.env.PRISMA_CONNECTION_LIMIT ||
      (process.env.NODE_ENV === 'production' ? 3 : 5),
  ),
);
const DEFAULT_PRISMA_POOL_TIMEOUT = Math.max(
  5,
  Number(process.env.PRISMA_POOL_TIMEOUT || 30),
);
const DEFAULT_PRISMA_CONNECT_TIMEOUT = Math.max(
  5,
  Number(process.env.PRISMA_CONNECT_TIMEOUT || 15),
);

function tunePrismaDatabaseUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(String(rawUrl));
    const protocol = String(parsed.protocol || '').toLowerCase();
    const isPostgres =
      protocol === 'postgres:' || protocol === 'postgresql:';
    if (!isPostgres) return rawUrl;

    if (!parsed.searchParams.get('connection_limit')) {
      parsed.searchParams.set(
        'connection_limit',
        String(DEFAULT_PRISMA_CONNECTION_LIMIT),
      );
    }
    if (!parsed.searchParams.get('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', String(DEFAULT_PRISMA_POOL_TIMEOUT));
    }
    if (!parsed.searchParams.get('connect_timeout')) {
      parsed.searchParams.set(
        'connect_timeout',
        String(DEFAULT_PRISMA_CONNECT_TIMEOUT),
      );
    }
    if (
      process.env.PRISMA_PGBOUNCER === 'true' &&
      !parsed.searchParams.get('pgbouncer')
    ) {
      parsed.searchParams.set('pgbouncer', 'true');
    }

    return parsed.toString();
  } catch (_err) {
    return rawUrl;
  }
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = tunePrismaDatabaseUrl(process.env.DATABASE_URL);
}

const defaultLog =
  process.env.NODE_ENV === 'production'
    ? 'warn,error'
    : 'query,info,warn,error';
const prisma = new PrismaClient({
  log: (process.env.PRISMA_LOG || defaultLog)
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean),
});

// Graceful shutdown para evitar conexões pendentes em serverless/containers
async function shutdown() {
  try {
    await prisma.$disconnect();
    // eslint-disable-next-line no-console
    console.info('Prisma disconnected.');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error disconnecting Prisma:', err);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);

// Helpers para multi-tenant
function addWhereTenant(args = {}, tenantId) {
  if (!tenantId) return args;
  const clone = Object.assign({}, args);
  // for findUnique/update/delete the where usually provided by caller;
  // here we add tenantId inside where if where is an object
  if (!clone.where) {
    clone.where = { tenantId };
  } else if (typeof clone.where === 'object') {
    // If where already has OR/AND we wrap to ensure tenant constraint
    // Common cases: { id: '...', other: '...' } -> add tenantId
    // If where contains 'OR' we add tenant constraint as an AND
    if (clone.where.OR || clone.where.AND) {
      clone.where = {
        AND: [{ tenantId }, clone.where],
      };
    } else {
      clone.where = Object.assign({}, clone.where, { tenantId });
    }
  }
  return clone;
}

function addDataTenant(args = {}, tenantId) {
  if (!tenantId) return args;
  const clone = Object.assign({}, args);
  if (!clone.data) clone.data = {};
  if (Array.isArray(clone.data)) {
    // createMany with data array
    clone.data = clone.data.map(d => Object.assign({}, d, { tenantId }));
  } else {
    clone.data = Object.assign({}, clone.data, { tenantId });
  }
  return clone;
}

// factory que cria um "prisma tenant-scoped" com métodos que automaticamente injetam tenantId
function useTenant(tenantId) {
  if (!tenantId) {
    throw new Error('useTenant called without tenantId');
  }

  // small helper to wrap single-methods
  function wrapModel(modelName) {
    const model = prisma[modelName];
    if (!model) return undefined;

    const wrapper = {};
    const notFoundError = () => {
      const err = new Error(`${modelName} not found`);
      err.code = 'P2025';
      return err;
    };

    // findMany / findFirst / findUnique
    wrapper.findMany = (args = {}) => model.findMany(addWhereTenant(args, tenantId));
    wrapper.findFirst = (args = {}) => model.findFirst(addWhereTenant(args, tenantId));
    // findUnique exige where único; usamos findFirst para permitir tenantId
    wrapper.findUnique = (args = {}) => model.findFirst(addWhereTenant(args, tenantId));

    // create/createMany
    wrapper.create = (args = {}) => model.create(addDataTenant(args, tenantId));
    wrapper.createMany = (args = {}) => model.createMany(addDataTenant(args, tenantId));

    // upsert (garante tenantId)
    wrapper.upsert = async (args = {}) => {
      if (!tenantId) return model.upsert(args);
      const where = args.where || {};

      let existing = null;
      let resolvedByUniqueLookup = false;

      // Prefer findUnique whenever the caller passes a unique selector
      // (id/compound unique). This avoids Prisma validation errors on findFirst.
      if (
        where &&
        typeof where === 'object' &&
        !Array.isArray(where) &&
        !where.OR &&
        !where.AND &&
        !where.NOT
      ) {
        try {
          existing = await model.findUnique({ where });
          resolvedByUniqueLookup = true;
        } catch (_err) {
          resolvedByUniqueLookup = false;
        }
      }

      // Legacy fallback for non-unique where selectors
      if (!resolvedByUniqueLookup) {
        const scoped = addWhereTenant({ where }, tenantId).where;
        existing = await model.findFirst({ where: scoped });
      }

      if (existing) {
        if (
          Object.prototype.hasOwnProperty.call(existing, 'tenantId') &&
          existing.tenantId &&
          String(existing.tenantId) !== String(tenantId)
        ) {
          throw notFoundError();
        }
        return model.update({
          where: args.where,
          data: args.update,
          select: args.select,
          include: args.include,
        });
      }
      const createData = Object.assign({}, args.create || {}, { tenantId });
      return model.create({
        data: createData,
        select: args.select,
        include: args.include,
      });
    };

    // update/updateMany/delete/deleteMany
    wrapper.update = async (args = {}) => {
      if (!tenantId) return model.update(args);
      const where = args.where || {};
      const scoped = addWhereTenant({ where }, tenantId).where;
      const existing = await model.findFirst({ where: scoped });
      if (!existing) throw notFoundError();
      return model.update(args);
    };
    wrapper.updateMany = (args = {}) => model.updateMany(addWhereTenant(args, tenantId));
    wrapper.delete = async (args = {}) => {
      if (!tenantId) return model.delete(args);
      const where = args.where || {};
      const scoped = addWhereTenant({ where }, tenantId).where;
      const existing = await model.findFirst({ where: scoped });
      if (!existing) throw notFoundError();
      return model.delete(args);
    };
    wrapper.deleteMany = (args = {}) => model.deleteMany(addWhereTenant(args, tenantId));

    // count, aggregate
    wrapper.count = (args = {}) => model.count(addWhereTenant(args, tenantId));
    wrapper.aggregate = (args = {}) => model.aggregate(addWhereTenant(args, tenantId));

    return wrapper;
  }

  // Lista de modelos que o projeto costuma usar — mapeie conforme seu schema
  const models = [
    'user',
    'tenant',
    'plan',
    'subscription',
    'invoice',
    'payment',
    'client',
    'post',
    'approval',
    'task',
    'team',
    'metric',
    'report',
    'upload',
    'integration',
    'integrationJob',
    'integrationGoogleGa4',
    'integrationGoogleGa4Property',
    'analyticsDashboard',
    'analyticsDashboardWidget',
    'jobQueue',
    'financialRecord',
  ];

  const exposed = {};
  models.forEach((m) => {
    // Prisma Client instancia os modelos em camelCase (ex: prisma.user, prisma.plan)
    try {
      if (prisma[m]) {
        exposed[m] = wrapModel(m);
      }
    } catch (err) {
      // ignore if model not present
    }
  });

  // Expor acesso direto ao prisma se precisar (ex.: prisma.$transaction)
  exposed.$raw = prisma.$queryRaw;
  exposed.$executeRaw = prisma.$executeRaw;
  exposed.$transaction = prisma.$transaction;

  // helper para buscar subscription atual do tenant (útil em middleware)
  exposed.getCurrentSubscription = async function getCurrentSubscription(opts = {}) {
    // procura a subscription mais relevante (ordena por currentPeriodEnd desc)
    const s = await prisma.subscription.findFirst({
      where: {
        tenantId,
      },
      orderBy: {
        currentPeriodEnd: 'desc',
      },
      ...opts,
    });
    return s;
  };

  return exposed;
}

module.exports = { prisma, useTenant };
