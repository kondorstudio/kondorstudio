const { prisma } = require('../prisma');

async function resolveGa4IntegrationContext({
  tenantId,
  propertyId,
  integrationId,
  userId,
}) {
  if (!tenantId) {
    const err = new Error('tenantId é obrigatório');
    err.status = 400;
    throw err;
  }

  if (!propertyId) {
    const err = new Error('propertyId é obrigatório');
    err.status = 400;
    throw err;
  }

  const tenantKey = String(tenantId);
  const propertyKey = String(propertyId);

  let integration = null;

  if (integrationId) {
    integration = await prisma.integrationGoogleGa4.findFirst({
      where: { id: String(integrationId), tenantId: tenantKey, status: 'CONNECTED' },
    });
  }

  if (!integration && userId) {
    integration = await prisma.integrationGoogleGa4.findFirst({
      where: { tenantId: tenantKey, userId: String(userId), status: 'CONNECTED' },
    });
  }

  if (!integration) {
    const propertyMatch = await prisma.integrationGoogleGa4Property.findFirst({
      where: {
        tenantId: tenantKey,
        propertyId: propertyKey,
        integration: { status: 'CONNECTED' },
      },
      include: { integration: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (propertyMatch?.integration) {
      integration = propertyMatch.integration;
    }
  }

  if (!integration) {
    const err = new Error('Nenhuma integração GA4 conectada para esta propriedade');
    err.status = 400;
    throw err;
  }

  return {
    integrationId: integration.id,
    userId: integration.userId,
  };
}

module.exports = {
  resolveGa4IntegrationContext,
};
