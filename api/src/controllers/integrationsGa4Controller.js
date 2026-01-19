const ga4OAuthService = require('../services/ga4OAuthService');
const ga4AdminService = require('../services/ga4AdminService');
const ga4MetadataService = require('../services/ga4MetadataService');
const { useTenant } = require('../prisma');

function getFrontUrl() {
  return process.env.APP_URL_FRONT || 'http://localhost:5173';
}

function buildRedirectUrl(params) {
  const base = getFrontUrl().replace(/\/+$/, '');
  const url = new URL(`${base}/integrations/ga4`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

module.exports = {
  async oauthStart(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      if (!tenantId || !userId) {
        return res.status(400).json({ error: 'tenantId or userId missing' });
      }

      if (ga4OAuthService.isMockMode()) {
        await ga4OAuthService.ensureMockIntegration(tenantId, userId);
        return res.json({ url: buildRedirectUrl({ connected: 1, mock: 1 }) });
      }

      const state = ga4OAuthService.buildState({ tenantId, userId });
      const url = require('../lib/googleClient').buildAuthUrl({ state });
      return res.json({ url });
    } catch (error) {
      const message =
        error?.message ||
        'Failed to start GA4 OAuth';
      console.error('GA4 oauthStart error:', error);
      return res.status(error?.status || 500).json({ error: message });
    }
  },

  async oauthCallback(req, res) {
    const { code, state, error: oauthError, error_description: errorDesc } =
      req.query || {};

    if (oauthError) {
      const redirectUrl = buildRedirectUrl({
        connected: 0,
        error: oauthError,
        message: errorDesc || 'OAuth error',
      });
      return res.redirect(redirectUrl);
    }

    try {
      await ga4OAuthService.exchangeCode({ code, state });
      const redirectUrl = buildRedirectUrl({ connected: 1 });
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error('GA4 oauthCallback error:', error);
      const redirectUrl = buildRedirectUrl({
        connected: 0,
        error: error.code || 'oauth_failed',
        message: error.message || 'OAuth failed',
      });
      return res.redirect(redirectUrl);
    }
  },

  async disconnect(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      if (!tenantId || !userId) {
        return res.status(400).json({ error: 'tenantId or userId missing' });
      }

      const db = req.db || useTenant(tenantId);
      const integrations = await db.integrationGoogleGa4.findMany({
        where: { userId: String(userId) },
      });

      await db.integrationGoogleGa4.updateMany({
        where: { userId: String(userId) },
        data: {
          status: 'DISCONNECTED',
          lastError: null,
          accessToken: null,
          refreshTokenEnc: null,
          tokenExpiry: null,
        },
      });

      const integrationIds = integrations.map((item) => item.id);
      if (integrationIds.length) {
        await db.integrationGoogleGa4Property.updateMany({
          where: { integrationId: { in: integrationIds } },
          data: { isSelected: false },
        });
      }

      return res.json({ ok: true, disconnected: integrations.length > 0 });
    } catch (error) {
      console.error('GA4 disconnect error:', error);
      return res.status(500).json({ error: 'Failed to disconnect GA4' });
    }
  },

  async status(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      if (!tenantId || !userId) {
        return res.status(400).json({ error: 'tenantId or userId missing' });
      }

      const integration = await req.db.integrationGoogleGa4.findFirst({
        where: { tenantId: String(tenantId), userId: String(userId) },
      });

      if (!integration) {
        return res.json({
          status: 'DISCONNECTED',
          properties: [],
          selectedProperty: null,
        });
      }

      const properties = await req.db.integrationGoogleGa4Property.findMany({
        where: { integrationId: integration.id },
        orderBy: { displayName: 'asc' },
      });

      const selectedProperty = properties.find((p) => p.isSelected) || null;

      return res.json({
        status: integration.status,
        lastError: integration.lastError || null,
        properties,
        selectedProperty,
      });
    } catch (error) {
      console.error('GA4 status error:', error);
      return res.status(500).json({ error: 'Failed to fetch GA4 status' });
    }
  },

  async propertiesSync(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      if (!tenantId || !userId) {
        return res.status(400).json({ error: 'tenantId or userId missing' });
      }

      const items = await ga4AdminService.syncProperties({ tenantId, userId });
      const selectedProperty = items.find((p) => p.isSelected) || null;
      return res.json({ items, selectedProperty });
    } catch (error) {
      console.error('GA4 propertiesSync error:', error);
      return res
        .status(error.status || 500)
        .json({ error: error.message || 'Failed to sync GA4 properties' });
    }
  },

  async propertiesList(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      if (!tenantId || !userId) {
        return res.status(400).json({ error: 'tenantId or userId missing' });
      }

      const items = await ga4AdminService.listProperties({ tenantId, userId });
      const selectedProperty = items.find((p) => p.isSelected) || null;
      return res.json({ items, selectedProperty });
    } catch (error) {
      console.error('GA4 propertiesList error:', error);
      return res.status(500).json({ error: 'Failed to list GA4 properties' });
    }
  },

  async propertiesSelect(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      const { propertyId } = req.body || {};
      if (!tenantId || !userId) {
        return res.status(400).json({ error: 'tenantId or userId missing' });
      }

      const selected = await ga4AdminService.selectProperty({
        tenantId,
        userId,
        propertyId,
      });
      return res.json({ selected });
    } catch (error) {
      console.error('GA4 propertiesSelect error:', error);
      return res
        .status(error.status || 500)
        .json({ error: error.message || 'Failed to select GA4 property' });
    }
  },

  async metadata(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      const propertyId = req.query?.propertyId;

      if (!tenantId || !userId) {
        return res.status(400).json({ error: 'tenantId or userId missing' });
      }

      let resolvedPropertyId = propertyId;
      if (!resolvedPropertyId) {
        const selected = await ga4AdminService.getSelectedProperty({
          tenantId,
          userId,
        });
        resolvedPropertyId = selected?.propertyId || null;
      }

      if (!resolvedPropertyId) {
        return res.status(400).json({ error: 'propertyId missing' });
      }

      const metadata = await ga4MetadataService.getMetadata({
        tenantId,
        userId,
        propertyId: resolvedPropertyId,
      });
      return res.json(metadata);
    } catch (error) {
      console.error('GA4 metadata error:', error);
      return res
        .status(error.status || 500)
        .json({ error: error.message || 'Failed to fetch GA4 metadata' });
    }
  },
};
