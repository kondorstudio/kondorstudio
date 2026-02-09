const ga4OAuthService = require('../services/ga4OAuthService');
const ga4AdminService = require('../services/ga4AdminService');
const ga4DataService = require('../services/ga4DataService');
const ga4MetadataService = require('../services/ga4MetadataService');
const { prisma, useTenant } = require('../prisma');

function getFrontUrl() {
  return (
    process.env.APP_URL_FRONT ||
    process.env.PUBLIC_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_APP_BASE_URL ||
    'http://localhost:5173'
  );
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

function normalizeGa4Error(error) {
  const message = error?.message || 'GA4 error';
  const lower = String(message).toLowerCase();

  if (error?.code === 'REAUTH_REQUIRED') {
    return 'REAUTH_REQUIRED';
  }

  if (error?.code === 'GA4_REAUTH_REQUIRED') {
    return 'Tokens invalidos ou expirados. Reconecte o GA4.';
  }

  if (error?.code === 'GA4_REFRESH_TOKEN_MISSING' || lower.includes('refresh token')) {
    return 'Refresh token ausente. Reconecte o GA4 com consentimento.';
  }

  if (lower.includes('redirect_uri_mismatch')) {
    return 'redirect_uri_mismatch: verifique GOOGLE_OAUTH_REDIRECT_URI no Google Cloud.';
  }

  if (lower.includes('invalid_grant')) {
    return 'Codigo expirado ou invalido. Tente conectar novamente.';
  }

  if (error?.status === 403) {
    if (
      lower.includes('access not configured') ||
      lower.includes('has not been used') ||
      lower.includes('disabled')
    ) {
      return 'A API Google Analytics Admin nao esta habilitada no projeto. Ative no Google Cloud Console.';
    }
    if (
      lower.includes('insufficient') ||
      lower.includes('permission') ||
      lower.includes('permiss')
    ) {
      return 'A conta Google nao tem permissao para acessar propriedades GA4.';
    }
  }

  return message;
}

function respondReauth(res, error) {
  if (!error) return false;
  const code = error?.code;
  if (code !== 'REAUTH_REQUIRED' && code !== 'GA4_REAUTH_REQUIRED') {
    return false;
  }
  const message = 'Reconecte o GA4 para continuar.';
  res.status(409).json({ code: 'REAUTH_REQUIRED', message, error: message });
  return true;
}

function formatGa4Date(value) {
  const raw = String(value || '');
  if (!/^\d{8}$/.test(raw)) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`;
}

function normalizeDemoRows(response) {
  const dimensionHeaders = Array.isArray(response?.dimensionHeaders)
    ? response.dimensionHeaders
    : [];
  const metricHeaders = Array.isArray(response?.metricHeaders)
    ? response.metricHeaders
    : [];
  const rows = Array.isArray(response?.rows) ? response.rows : [];

  const normalized = rows.map((row) => {
    const item = {};
    dimensionHeaders.forEach((dimension, idx) => {
      const value = row.dimensions?.[idx] ?? null;
      item[dimension] = dimension === 'date' ? formatGa4Date(value) : value;
    });
    metricHeaders.forEach((metric, idx) => {
      const value = Number(row.metrics?.[idx] || 0);
      item[metric] = Number.isFinite(value) ? value : 0;
    });
    return item;
  });

  return {
    dimensions: dimensionHeaders,
    metrics: metricHeaders,
    rows: normalized,
  };
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
      const forceConsent =
        req.query?.forceConsent === '1' ||
        req.query?.forceConsent === 'true' ||
        req.query?.force === '1' ||
        req.query?.force === 'true';
      const integration = await ga4OAuthService.getIntegration(tenantId);
      const needsReconnect = integration?.status === 'NEEDS_RECONNECT';
      const url = require('../lib/googleClient').buildAuthUrl({
        state,
        forceConsent: forceConsent || needsReconnect,
      });
      return res.json({ url });
    } catch (error) {
      const message = error?.message || 'Failed to start GA4 OAuth';
      console.error('GA4 oauthStart error:', {
        message: error?.message,
        code: error?.code,
        status: error?.status,
      });
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
      const payload = ga4OAuthService.verifyState(state);
      await ga4OAuthService.exchangeCode({ code, state });
      try {
        await ga4AdminService.syncProperties({
          tenantId: payload.tenantId,
          userId: payload.userId,
        });
      } catch (syncError) {
        console.warn('GA4 oauthCallback syncProperties warning:', syncError);
      }
      const redirectUrl = buildRedirectUrl({ connected: 1 });
      return res.redirect(redirectUrl);
    } catch (error) {
      const message = normalizeGa4Error(error);
      console.error('GA4 oauthCallback error:', {
        message: error?.message,
        code: error?.code,
        status: error?.status,
      });
      const redirectUrl = buildRedirectUrl({
        connected: 0,
        error: error.code || 'oauth_failed',
        message: message || 'OAuth failed',
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
      const integrationFilter = { tenantId: String(tenantId) };
      let integrations = await db.integrationGoogleGa4.findMany({
        where: integrationFilter,
      });

      const disconnectPayload = {
        status: 'DISCONNECTED',
        lastError: null,
        accessToken: null,
        refreshTokenEnc: null,
        tokenExpiry: null,
      };

      let updated = await db.integrationGoogleGa4.updateMany({
        where: integrationFilter,
        data: disconnectPayload,
      });

      if (!updated?.count) {
        integrations = await prisma.integrationGoogleGa4.findMany({
          where: integrationFilter,
        });
        updated = await prisma.integrationGoogleGa4.updateMany({
          where: integrationFilter,
          data: disconnectPayload,
        });
      }

      const integrationIds = integrations.map((item) => item.id);
      if (integrationIds.length) {
        await db.integrationGoogleGa4Property.updateMany({
          where: { integrationId: { in: integrationIds } },
          data: { isSelected: false },
        });
      }

      return res.json({
        ok: true,
        disconnected: integrations.length > 0,
        updated: updated?.count || 0,
      });
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
        where: { tenantId: String(tenantId) },
      });

      if (!integration) {
        return res.json({
          status: 'DISCONNECTED',
          googleAccountEmail: null,
          properties: [],
          selectedProperty: null,
        });
      }

      let properties = await req.db.integrationGoogleGa4Property.findMany({
        where: { integrationId: integration.id },
        orderBy: { displayName: 'asc' },
      });

      if (integration.status === 'CONNECTED' && properties.length === 0) {
        try {
          properties = await ga4AdminService.syncProperties({
            tenantId,
            userId,
          });
        } catch (syncError) {
          console.warn('GA4 status syncProperties warning:', syncError);
        }
      }

      const selectedProperty = properties.find((p) => p.isSelected) || null;

      return res.json({
        status: integration.status,
        lastError: integration.lastError || null,
        googleAccountEmail: integration.googleAccountEmail || null,
        properties,
        selectedProperty,
      });
    } catch (error) {
      console.error('GA4 status error:', error);
      if (respondReauth(res, error)) return;
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
      if (respondReauth(res, error)) return;
      const message = normalizeGa4Error(error);
      return res
        .status(error.status || 500)
        .json({
          error: message || 'Failed to sync GA4 properties',
          code: error?.code || null,
          reason: error?.reason || null,
        });
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
      if (respondReauth(res, error)) return;
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
      if (respondReauth(res, error)) return;
      return res
        .status(error.status || 500)
        .json({ error: error.message || 'Failed to select GA4 property' });
    }
  },

  async demoReport(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      const propertyId = req.body?.propertyId || null;
      if (!tenantId || !userId) {
        return res.status(400).json({ error: 'tenantId or userId missing' });
      }

      const integration = await req.db.integrationGoogleGa4.findFirst({
        where: { tenantId: String(tenantId) },
      });
      if (!integration || integration.status !== 'CONNECTED') {
        return res.status(400).json({ error: 'GA4 integration not connected' });
      }

      let selected = null;
      if (propertyId) {
        selected = await req.db.integrationGoogleGa4Property.findFirst({
          where: {
            integrationId: integration.id,
            propertyId: String(propertyId),
          },
        });
      } else {
        selected = await ga4AdminService.getSelectedProperty({
          tenantId,
          userId,
        });
      }

      if (!selected?.propertyId) {
        return res.status(404).json({ error: 'GA4 property not found' });
      }

      const response = await ga4DataService.runReport({
        tenantId,
        userId,
        propertyId: String(selected.propertyId),
        payload: {
          dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
          metrics: ['sessions', 'activeUsers'],
          dimensions: ['date'],
        },
        rateKey: [tenantId, userId, selected.propertyId].join(':'),
      });

      const normalized = normalizeDemoRows(response);
      return res.json({
        propertyId: String(selected.propertyId),
        ...normalized,
      });
    } catch (error) {
      const message = normalizeGa4Error(error);
      console.error('GA4 demoReport error:', {
        message: error?.message,
        code: error?.code,
        status: error?.status,
      });
      if (respondReauth(res, error)) return;
      return res
        .status(error.status || 500)
        .json({ error: message || 'Failed to run GA4 demo report' });
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
      if (respondReauth(res, error)) return;
      return res
        .status(error.status || 500)
        .json({ error: error.message || 'Failed to fetch GA4 metadata' });
    }
  },
};
