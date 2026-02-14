const ga4OAuthService = require('../services/ga4OAuthService');
const ga4AdminService = require('../services/ga4AdminService');
const ga4DataService = require('../services/ga4DataService');
const ga4MetadataService = require('../services/ga4MetadataService');
const { ensureGa4FactMetrics } = require('../services/ga4FactMetricsService');
const {
  resolveBrandGa4ActivePropertyId,
  upsertBrandGa4Settings,
  setBrandGa4ActiveProperty,
} = require('../services/brandGa4SettingsService');
const { ensureBrandGa4Timezone } = require('../services/ga4BrandTimezoneService');
const { buildRollingDateRange } = require('../lib/timezone');
const { getRedisClient } = require('../lib/redisClient');
const { ga4SyncQueue } = require('../queues');
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

const GA4_FACT_SYNC_COOLDOWN_MS = Math.max(
  0,
  Number(process.env.GA4_FACT_SYNC_COOLDOWN_MS || 60_000),
);

async function assertGa4FactsSyncCooldown({ tenantId, brandId }) {
  const cooldownMs = GA4_FACT_SYNC_COOLDOWN_MS;
  if (!cooldownMs || cooldownMs <= 0) return;
  if (!tenantId || !brandId) return;

  const key = `ga4:facts:sync:cooldown:${tenantId}:${brandId}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      const inserted = await redis.set(key, String(Date.now()), 'PX', cooldownMs, 'NX');
      if (inserted === 'OK') return;
      const ttl = await redis.pttl(key);
      const retryAfterMs = ttl && ttl > 0 ? ttl : cooldownMs;
      const err = new Error('GA4 facts sync em cooldown');
      err.status = 429;
      err.code = 'GA4_FACT_SYNC_COOLDOWN';
      err.details = { retryAfterMs };
      throw err;
    } catch (err) {
      if (err?.code === 'GA4_FACT_SYNC_COOLDOWN') throw err;
      // If Redis is flaky, fall back to DB-based cooldown.
    }
  }

  const row = await prisma.brandGa4Settings.findFirst({
    where: {
      tenantId: String(tenantId),
      brandId: String(brandId),
    },
    select: {
      lastHistoricalSyncAt: true,
    },
  });

  const last = row?.lastHistoricalSyncAt ? new Date(row.lastHistoricalSyncAt) : null;
  if (!last || Number.isNaN(last.getTime())) return;

  const elapsed = Date.now() - last.getTime();
  if (elapsed >= cooldownMs) return;

  const retryAfterMs = Math.max(1, cooldownMs - elapsed);
  const err = new Error('GA4 facts sync em cooldown');
  err.status = 429;
  err.code = 'GA4_FACT_SYNC_COOLDOWN';
  err.details = { retryAfterMs };
  throw err;
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

  async brandSettingsGet(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      const brandId = req.query?.brandId;

      if (!tenantId || !userId) {
        return res.status(400).json({ error: 'tenantId or userId missing' });
      }
      if (!brandId) {
        return res.status(400).json({ error: 'brandId missing' });
      }

      const brand = await prisma.client.findFirst({
        where: { id: String(brandId), tenantId: String(tenantId) },
        select: { id: true, name: true },
      });
      if (!brand) {
        return res.status(404).json({ error: 'Marca não encontrada' });
      }

      // Enforce 1 GA4 property per brand and materialize canonical settings if possible.
      const propertyId = await resolveBrandGa4ActivePropertyId({ tenantId, brandId });
      if (!propertyId) {
        return res.status(409).json({
          error: 'GA4 property não configurada para esta marca',
          code: 'GA4_PROPERTY_REQUIRED',
        });
      }

      const settings = await prisma.brandGa4Settings.findFirst({
        where: { tenantId: String(tenantId), brandId: String(brandId) },
      });
      if (!settings) {
        return res.status(409).json({
          error: 'GA4 settings não encontrados para esta marca',
          code: 'GA4_SETTINGS_REQUIRED',
        });
      }

      return res.json({
        ok: true,
        brandId: brand.id,
        brandName: brand.name || null,
        settings: {
          propertyId: settings.propertyId,
          timezone: settings.timezone || null,
          leadEvents: settings.leadEvents || [],
          conversionEvents: settings.conversionEvents || [],
          revenueEvent: settings.revenueEvent || null,
          lastHistoricalSyncAt: settings.lastHistoricalSyncAt || null,
          lastSuccessAt: settings.lastSuccessAt || null,
          lastError: settings.lastError || null,
          backfillCursor: settings.backfillCursor || null,
          updatedAt: settings.updatedAt || null,
        },
      });
    } catch (error) {
      console.error('GA4 brandSettingsGet error:', error);
      return res
        .status(error.status || 500)
        .json({ error: error.message || 'Failed to fetch GA4 brand settings' });
    }
  },

  async brandSettingsUpsert(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      const {
        brandId,
        propertyId: desiredPropertyId,
        timezone,
        leadEvents,
        conversionEvents,
        revenueEvent,
      } = req.body || {};

      if (!tenantId || !userId) {
        return res.status(400).json({ error: 'tenantId or userId missing' });
      }
      if (!brandId) {
        return res.status(400).json({ error: 'brandId missing' });
      }

      const brand = await prisma.client.findFirst({
        where: { id: String(brandId), tenantId: String(tenantId) },
        select: { id: true, name: true },
      });
      if (!brand) {
        return res.status(404).json({ error: 'Marca não encontrada' });
      }

      let propertyId = null;
      if (desiredPropertyId) {
        propertyId = await setBrandGa4ActiveProperty({
          tenantId,
          brandId,
          propertyId: desiredPropertyId,
        });
      } else {
        propertyId = await resolveBrandGa4ActivePropertyId({ tenantId, brandId });
      }
      if (!propertyId) {
        return res.status(409).json({
          error: 'GA4 property não configurada para esta marca',
          code: 'GA4_PROPERTY_REQUIRED',
        });
      }

      const updated = await upsertBrandGa4Settings(
        {
          tenantId,
          brandId,
          propertyId,
          ...(timezone !== undefined ? { timezone } : {}),
          ...(leadEvents !== undefined ? { leadEvents } : {}),
          ...(conversionEvents !== undefined ? { conversionEvents } : {}),
          ...(revenueEvent !== undefined ? { revenueEvent } : {}),
        },
        { db: prisma },
      );

      // Best-effort auto-resolve timezone if not set explicitly.
      if (timezone === undefined && !updated.timezone) {
        ensureBrandGa4Timezone({
          tenantId,
          brandId,
          propertyId: String(updated.propertyId),
        }).catch(() => null);
      }

      return res.json({
        ok: true,
        brandId: brand.id,
        brandName: brand.name || null,
        settings: {
          propertyId: updated.propertyId,
          timezone: updated.timezone || null,
          leadEvents: updated.leadEvents || [],
          conversionEvents: updated.conversionEvents || [],
          revenueEvent: updated.revenueEvent || null,
          lastHistoricalSyncAt: updated.lastHistoricalSyncAt || null,
          lastSuccessAt: updated.lastSuccessAt || null,
          lastError: updated.lastError || null,
          backfillCursor: updated.backfillCursor || null,
          updatedAt: updated.updatedAt || null,
        },
      });
    } catch (error) {
      console.error('GA4 brandSettingsUpsert error:', error);
      return res
        .status(error.status || 500)
        .json({ error: error.message || 'Failed to update GA4 brand settings' });
    }
  },

  async syncFacts(req, res) {
    const tenantId = req.tenantId;
    const userId = req.user?.id;
    const { brandId, days, includeCampaigns } = req.body || {};
    let propertyId = null;
    let timezoneForLog = null;
    let dateRangeForLog = null;
    let leadEventsForLog = null;
    let conversionEventsForLog = null;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'tenantId or userId missing' });
    }
    if (!brandId) {
      return res.status(400).json({ error: 'brandId missing' });
    }

    const windowDays = Math.max(1, Math.min(365, Number(days || 30)));
    const wantsCampaigns = includeCampaigns === true;

    try {
      await assertGa4FactsSyncCooldown({ tenantId, brandId });
    } catch (cooldownErr) {
      return res.status(cooldownErr.status || 429).json({
        error: cooldownErr.message || 'Cooldown ativo',
        code: cooldownErr.code || 'GA4_FACT_SYNC_COOLDOWN',
        ...(cooldownErr.details ? cooldownErr.details : {}),
      });
    }

    const brand = await prisma.client.findFirst({
      where: { id: String(brandId), tenantId: String(tenantId) },
      select: { id: true, name: true },
    });
    if (!brand) {
      return res.status(404).json({ error: 'Marca não encontrada' });
    }

    try {
      propertyId = await resolveBrandGa4ActivePropertyId({ tenantId, brandId });
    } catch (err) {
      propertyId = null;
    }

    if (!propertyId) {
      return res.status(409).json({
        error: 'GA4 property não configurada para esta marca',
        code: 'GA4_PROPERTY_REQUIRED',
      });
    }

    const startedAt = Date.now();

    try {
      // Observability: log mismatch between canonical settings and active connection (should not happen).
      try {
        const [settingsRow, activeConn] = await Promise.all([
          prisma.brandGa4Settings.findFirst({
            where: { tenantId: String(tenantId), brandId: String(brandId) },
            select: { propertyId: true, leadEvents: true, conversionEvents: true },
          }),
          prisma.brandSourceConnection.findFirst({
            where: {
              tenantId: String(tenantId),
              brandId: String(brandId),
              platform: 'GA4',
              status: 'ACTIVE',
            },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            select: { externalAccountId: true },
          }),
        ]);

        leadEventsForLog = settingsRow?.leadEvents || null;
        conversionEventsForLog = settingsRow?.conversionEvents || null;

        const normalizeProp = (value) =>
          String(value || '').trim().replace(/^properties\//, '');
        const settingsProp = normalizeProp(settingsRow?.propertyId);
        const activeProp = normalizeProp(activeConn?.externalAccountId);
        if (settingsProp && activeProp && settingsProp !== activeProp) {
          // eslint-disable-next-line no-console
          console.warn('[ga4] property mismatch before syncFacts', {
            tenantId: String(tenantId),
            brandId: String(brandId),
            settingsPropertyId: settingsProp,
            activeExternalAccountId: activeProp,
          });
        }
      } catch (_err) {}

      const timezone = await ensureBrandGa4Timezone({
        tenantId,
        brandId,
        propertyId: String(propertyId),
      });
      timezoneForLog = timezone || null;

      const rolling = buildRollingDateRange({ days: windowDays, timeZone: timezone });
      if (!rolling?.start || !rolling?.end) {
        return res.status(400).json({ error: 'Falha ao resolver dateRange' });
      }

      const dateRange = { start: rolling.start, end: rolling.end };
      dateRangeForLog = dateRange;
      const metrics = ['sessions', 'leads', 'conversions', 'revenue'];

      await upsertBrandGa4Settings(
        {
          tenantId,
          brandId,
          propertyId,
          lastHistoricalSyncAt: new Date(),
          lastError: null,
          backfillCursor: wantsCampaigns
            ? {
                status: 'QUEUED',
                queuedAt: new Date().toISOString(),
                dateRange,
                includeCampaigns: true,
              }
            : undefined,
        },
        { db: prisma },
      );

      if (wantsCampaigns) {
        if (!ga4SyncQueue) {
          return res.status(503).json({
            error: 'Fila GA4 indisponível (Redis desativado)',
            code: 'GA4_QUEUE_UNAVAILABLE',
          });
        }

        const job = await ga4SyncQueue.add(
          'ga4-brand-facts-sync',
          {
            tenantId: String(tenantId),
            brandId: String(brandId),
            days: windowDays,
            includeCampaigns: true,
            requestedBy: String(userId),
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2_000 },
          },
        );

        return res.status(202).json({
          ok: true,
          queued: true,
          jobId: job.id,
          tenantId: String(tenantId),
          brandId: String(brandId),
          brandName: brand.name || null,
          propertyId: String(propertyId),
          timezone: rolling.timeZone || timezone || 'UTC',
          dateRange,
          includeCampaigns: true,
        });
      }

      const syncResult = await ensureGa4FactMetrics({
        tenantId,
        brandId,
        dateRange,
        metrics,
        dimensions: [],
        filters: [],
        requiredPlatforms: ['GA4'],
      });

      if (wantsCampaigns) {
        await ensureGa4FactMetrics({
          tenantId,
          brandId,
          dateRange,
          metrics,
          dimensions: ['campaign_id'],
          filters: [],
          requiredPlatforms: ['GA4'],
        });
      }

      const [aggCount, campaignCount, aggSum] = await Promise.all([
        prisma.factKondorMetricsDaily.count({
          where: {
            tenantId: String(tenantId),
            brandId: String(brandId),
            platform: 'GA4',
            accountId: String(propertyId),
            campaignId: null,
            date: {
              gte: new Date(dateRange.start),
              lte: new Date(dateRange.end),
            },
          },
        }),
        prisma.factKondorMetricsDaily.count({
          where: {
            tenantId: String(tenantId),
            brandId: String(brandId),
            platform: 'GA4',
            accountId: String(propertyId),
            campaignId: { not: null },
            date: {
              gte: new Date(dateRange.start),
              lte: new Date(dateRange.end),
            },
          },
        }),
        prisma.factKondorMetricsDaily.aggregate({
          where: {
            tenantId: String(tenantId),
            brandId: String(brandId),
            platform: 'GA4',
            accountId: String(propertyId),
            campaignId: null,
            date: {
              gte: new Date(dateRange.start),
              lte: new Date(dateRange.end),
            },
          },
          _sum: {
            sessions: true,
            leads: true,
            conversions: true,
            revenue: true,
          },
        }),
      ]);

      await upsertBrandGa4Settings(
        {
          tenantId,
          brandId,
          propertyId,
          lastSuccessAt: new Date(),
          lastError: null,
        },
        { db: prisma },
      );

      const toScalar = (value) => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'bigint') return value.toString();
        if (typeof value === 'object' && typeof value.toString === 'function') {
          return value.toString();
        }
        return value;
      };

      return res.json({
        ok: true,
        tenantId: String(tenantId),
        brandId: String(brandId),
        brandName: brand.name || null,
        propertyId: String(propertyId),
        timezone: rolling.timeZone || timezone || 'UTC',
        dateRange,
        includeCampaigns: wantsCampaigns,
        truncated: Boolean(syncResult?.meta?.truncated),
        maxRows: syncResult?.meta?.maxRows ?? null,
        counts: {
          aggregatedFacts: aggCount,
          campaignFacts: campaignCount,
        },
        totals: {
          sessions: toScalar(aggSum?._sum?.sessions),
          leads: toScalar(aggSum?._sum?.leads),
          conversions: toScalar(aggSum?._sum?.conversions),
          revenue: toScalar(aggSum?._sum?.revenue),
        },
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const safeError = {
        message: error?.message || String(error),
        code: error?.code || null,
        status: error?.status || null,
      };

      try {
        await upsertBrandGa4Settings(
          {
            tenantId,
            brandId,
            propertyId,
            lastHistoricalSyncAt: new Date(),
            lastError: safeError,
            backfillCursor: {
              status: 'ERROR',
              at: new Date().toISOString(),
              error: safeError,
            },
          },
          { db: prisma },
        );
      } catch (_) {}

      console.error('GA4 syncFacts error:', safeError);
      if (respondReauth(res, error)) return;
      return res
        .status(error?.status || 500)
        .json({ error: error?.message || 'Failed to sync GA4 facts', details: safeError });
    } finally {
      if (process.env.NODE_ENV !== 'test') {
        // eslint-disable-next-line no-console
        console.log('[ga4] syncFacts finished', {
          tenantId,
          brandId,
          propertyId,
          timezone: timezoneForLog,
          dateRange: dateRangeForLog,
          leadEvents: leadEventsForLog,
          conversionEvents: conversionEventsForLog,
          ms: Date.now() - startedAt,
        });
      }
    }
  },
};
