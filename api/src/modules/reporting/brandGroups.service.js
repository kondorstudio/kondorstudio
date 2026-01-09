const { prisma } = require('../../prisma');

async function listGroups(tenantId) {
  return prisma.brandGroup.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

async function listGroupMembers(tenantId, groupId) {
  if (!tenantId || !groupId) {
    const err = new Error('groupId obrigatorio');
    err.status = 400;
    throw err;
  }

  const group = await prisma.brandGroup.findFirst({
    where: { id: groupId, tenantId },
    select: { id: true },
  });

  if (!group) {
    const err = new Error('Grupo nao encontrado');
    err.status = 404;
    throw err;
  }

  return prisma.brandGroupMember.findMany({
    where: { tenantId, groupId },
    include: {
      brand: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

module.exports = {
  listGroups,
  listGroupMembers,
};
