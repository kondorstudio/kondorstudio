const { google } = require('googleapis');
const { prisma, useTenant } = require('../prisma');
const ga4OAuthService = require('./ga4OAuthService');

const ADMIN_PAGE_SIZE = Number(process.env.GA4_ADMIN_PAGE_SIZE || 200);

function extractErrorReason(payload) {
  const details = payload?.error?.details;
  if (!Array.isArray(details)) return null;
  const reasonEntry = details.find((item) => item?.reason);
  return reasonEntry?.reason || null;
}

function mapGoogleError(error) {
  const payload = error?.response?.data || {};
  const message =
    payload?.error?.message ||
    error?.message ||
    'GA4 Admin API error';
  const err = new Error(message);
  err.status = error?.response?.status || error?.status || 500;
  err.code = payload?.error?.status || error?.code || 'GA4_ADMIN_ERROR';
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

async function fetchAccountSummaries(accessToken) {
  const summaries = [];
  let pageToken = null;
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const client = google.analyticsadmin({
    version: 'v1beta',
    auth: oauth2Client,
  });

  do {
    try {
      const response = await client.accountSummaries.list({
        pageSize: ADMIN_PAGE_SIZE || undefined,
        pageToken: pageToken || undefined,
      });
      const batch = Array.isArray(response.data?.accountSummaries)
        ? response.data.accountSummaries
        : [];
      summaries.push(...batch);
      pageToken = response.data?.nextPageToken || null;
    } catch (error) {
      throw mapGoogleError(error);
    }
  } while (pageToken);

  return summaries;
}

async function fetchProperties(accessToken) {
  const summaries = await fetchAccountSummaries(accessToken);

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
    where: { tenantId: String(tenantId) },
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
        await ga4OAuthService.markIntegrationError(
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

  if (!properties.length) {
    await db.integrationGoogleGa4Property.deleteMany({
      where: { integrationId: integration.id },
    });
    return [];
  }

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

  await db.integrationGoogleGa4Property.deleteMany({
    where: {
      integrationId: integration.id,
      propertyId: { notIn: properties.map((prop) => String(prop.propertyId)) },
    },
  });

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
    where: { tenantId: String(tenantId) },
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

  const [_, selected] = await db.$transaction([
    db.integrationGoogleGa4Property.updateMany({
      where: { integrationId: integration.id },
      data: { isSelected: false },
    }),
    db.integrationGoogleGa4Property.update({
      where: { id: property.id },
      data: { isSelected: true },
    }),
  ]);

  return selected;
}

async function getSelectedProperty({ tenantId, userId }) {
  const integration = await prisma.integrationGoogleGa4.findFirst({
    where: { tenantId: String(tenantId) },
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

async function fetchProperty(accessToken, propertyId) {
  if (!accessToken) {
    const err = new Error('accessToken missing');
    err.status = 400;
    throw err;
  }
  if (!propertyId) {
    const err = new Error('propertyId missing');
    err.status = 400;
    throw err;
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const client = google.analyticsadmin({
    version: 'v1beta',
    auth: oauth2Client,
  });

  try {
    const response = await client.properties.get({
      name: `properties/${String(propertyId).replace(/^properties\//, '')}`,
    });
    return response.data || null;
  } catch (error) {
    throw mapGoogleError(error);
  }
}

async function getPropertyTimezone({ tenantId, userId, propertyId }) {
  if (ga4OAuthService.isMockMode()) return 'UTC';
  const accessToken = await ga4OAuthService.getValidAccessToken({
    tenantId,
    userId,
  });
  const property = await fetchProperty(accessToken, propertyId);
  const tz = property?.timeZone || property?.timezone || null;
  return tz ? String(tz) : null;
}

module.exports = {
  syncProperties,
  listProperties,
  selectProperty,
  getSelectedProperty,
  fetchProperties,
  fetchProperty,
  getPropertyTimezone,
};
