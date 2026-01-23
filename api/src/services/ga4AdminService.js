const { prisma, useTenant } = require('../prisma');
const ga4OAuthService = require('./ga4OAuthService');

const ADMIN_API_URL =
  process.env.GA4_ADMIN_API_URL || 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries';

function extractErrorReason(payload) {
  const details = payload?.error?.details;
  if (!Array.isArray(details)) return null;
  const reasonEntry = details.find((item) => item?.reason);
  return reasonEntry?.reason || null;
}

function mapError(res, payload) {
  const message = payload?.error?.message || payload?.error || 'GA4 Admin API error';
  const err = new Error(message);
  err.status = res.status;
  err.code = payload?.error?.status || 'GA4_ADMIN_ERROR';
  err.reason = extractErrorReason(payload);
  return err;
}

function parsePropertyId(value) {
  if (!value) return null;
  const raw = String(value);
  if (raw.startsWith('properties/')) return raw.replace('properties/', '');
  return raw;
}

function parseAccountId(value) {
  if (!value) return null;
  const raw = String(value);
  if (raw.startsWith('accounts/')) return raw.replace('accounts/', '');
  return raw;
}

function buildMockProperties() {
  return [
    {
      propertyId: '111111111',
      displayName: 'Mock Property 111111111',
      accountId: '999999999',
    },
    {
      propertyId: '222222222',
      displayName: 'Mock Property 222222222',
      accountId: '999999999',
    },
  ];
}

async function fetchProperties(accessToken) {
  const res = await fetch(ADMIN_API_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw mapError(res, json);

  const summaries = Array.isArray(json.accountSummaries)
    ? json.accountSummaries
    : [];

  const properties = [];
  summaries.forEach((summary) => {
    const accountId = parseAccountId(summary.account);
    const propList = Array.isArray(summary.propertySummaries)
      ? summary.propertySummaries
      : [];
    propList.forEach((prop) => {
      const propertyId = parsePropertyId(prop.property);
      if (!propertyId) return;
      properties.push({
        propertyId: String(propertyId),
        displayName: prop.displayName || `Property ${propertyId}`,
        accountId,
      });
    });
  });

  return properties;
}

async function getIntegrationOrThrow(tenantId, userId) {
  if (ga4OAuthService.isMockMode()) {
    return ga4OAuthService.ensureMockIntegration(tenantId, userId);
  }
  const integration = await prisma.integrationGoogleGa4.findFirst({
    where: { tenantId: String(tenantId), userId: String(userId) },
  });
  if (!integration) {
    const err = new Error('GA4 integration not found');
    err.status = 404;
    throw err;
  }
  if (integration.status !== 'CONNECTED') {
    const err = new Error('GA4 integration not connected');
    err.status = 400;
    throw err;
  }
  return integration;
}

async function syncProperties({ tenantId, userId }) {
  const integration = await getIntegrationOrThrow(tenantId, userId);
  const db = useTenant(tenantId);

  let properties = [];
  if (ga4OAuthService.isMockMode()) {
    properties = buildMockProperties();
  } else {
    const accessToken = await ga4OAuthService.getValidAccessToken({
      tenantId,
      userId,
    });
    try {
      properties = await fetchProperties(accessToken);
    } catch (error) {
      if (error?.status === 401) {
        await ga4OAuthService.resetIntegration(
          tenantId,
          userId,
          'Token GA4 expirado ou invalido. Reconecte.'
        );
      } else if (error?.status === 403) {
        await ga4OAuthService.markIntegrationError(
          tenantId,
          userId,
          error?.message || 'Permissao insuficiente para GA4.'
        );
      }
      throw error;
    }
  }

  if (!properties.length) return [];

  await Promise.all(
    properties.map((prop) =>
      db.integrationGoogleGa4Property.upsert({
        where: {
          tenantId_integrationId_propertyId: {
            tenantId: String(tenantId),
            integrationId: integration.id,
            propertyId: String(prop.propertyId),
          },
        },
        create: {
          integrationId: integration.id,
          propertyId: String(prop.propertyId),
          displayName: prop.displayName || `Property ${prop.propertyId}`,
          accountId: prop.accountId || null,
          isSelected: false,
        },
        update: {
          displayName: prop.displayName || `Property ${prop.propertyId}`,
          accountId: prop.accountId || null,
        },
      })
    )
  );

  const items = await db.integrationGoogleGa4Property.findMany({
    where: { integrationId: integration.id },
    orderBy: { displayName: 'asc' },
  });

  if (!items.some((item) => item.isSelected) && items.length) {
    const first = items[0];
    const selected = await db.integrationGoogleGa4Property.update({
      where: { id: first.id },
      data: { isSelected: true },
    });
    return items.map((item) =>
      item.id === selected.id ? { ...item, isSelected: true } : item
    );
  }

  return items;
}

async function listProperties({ tenantId, userId }) {
  const integration = await prisma.integrationGoogleGa4.findFirst({
    where: { tenantId: String(tenantId), userId: String(userId) },
  });
  if (!integration) return [];
  const db = useTenant(tenantId);
  return db.integrationGoogleGa4Property.findMany({
    where: { integrationId: integration.id },
    orderBy: { displayName: 'asc' },
  });
}

async function selectProperty({ tenantId, userId, propertyId }) {
  const integration = await getIntegrationOrThrow(tenantId, userId);
  const db = useTenant(tenantId);
  const property = await db.integrationGoogleGa4Property.findFirst({
    where: {
      integrationId: integration.id,
      propertyId: String(propertyId),
    },
  });

  if (!property) {
    const err = new Error('GA4 property not found');
    err.status = 404;
    throw err;
  }

  await db.integrationGoogleGa4Property.updateMany({
    where: { integrationId: integration.id },
    data: { isSelected: false },
  });

  return db.integrationGoogleGa4Property.update({
    where: { id: property.id },
    data: { isSelected: true },
  });
}

async function getSelectedProperty({ tenantId, userId }) {
  const integration = await prisma.integrationGoogleGa4.findFirst({
    where: { tenantId: String(tenantId), userId: String(userId) },
  });
  if (!integration) return null;
  const db = useTenant(tenantId);
  const selected = await db.integrationGoogleGa4Property.findFirst({
    where: { integrationId: integration.id, isSelected: true },
  });
  if (selected) return selected;
  return db.integrationGoogleGa4Property.findFirst({
    where: { integrationId: integration.id },
    orderBy: { displayName: 'asc' },
  });
}

module.exports = {
  syncProperties,
  listProperties,
  selectProperty,
  getSelectedProperty,
  fetchProperties,
};
