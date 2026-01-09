const { prisma } = require('../../prisma');

async function listGroups(tenantId) {
  return prisma.brandGroup.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

module.exports = {
  listGroups,
};
