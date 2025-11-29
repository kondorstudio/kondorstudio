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

const prisma = new PrismaClient({
  log: (process.env.PRISMA_LOG || 'query,info,warn,error')
    .split(',')
    .map(l => l.trim())
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

    // findMany / findFirst / findUnique
    wrapper.findMany = (args = {}) => model.findMany(addWhereTenant(args, tenantId));
    wrapper.findFirst = (args = {}) => model.findFirst(addWhereTenant(args, tenantId));
    // findUnique often requires explicit id, don't alter where deeply (but inject tenant if possible)
    wrapper.findUnique = (args = {}) => model.findUnique(addWhereTenant(args, tenantId));

    // create/createMany
    wrapper.create = (args = {}) => model.create(addDataTenant(args, tenantId));
    wrapper.createMany = (args = {}) => model.createMany(addDataTenant(args, tenantId));

    // update/updateMany/delete/deleteMany - keep caller control but try to protect updateMany/deleteMany by adding tenant
    wrapper.update = (args = {}) => model.update(addWhereTenant(args, tenantId));
    wrapper.updateMany = (args = {}) => model.updateMany(addWhereTenant(args, tenantId));
    wrapper.delete = (args = {}) => model.delete(addWhereTenant(args, tenantId));
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
