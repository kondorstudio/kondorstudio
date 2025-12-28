const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const integrationsController = require('../controllers/integrationsController');
const metaSocialService = require('../services/metaSocialService');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_local_secret';

// Todas as rotas de integração exigem auth + tenant
router.use(authMiddleware);
router.use(tenantMiddleware);

// =========================
// WhatsApp (Meta Cloud) - Onboarding/OAuth (placeholder)
// =========================

// A) GET /api/integrations/whatsapp/connect-url
router.get('/whatsapp/connect-url', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.user && req.user.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId missing' });

    const oauthVersion = process.env.META_OAUTH_VERSION || 'v20.0';
    const appId = process.env.META_APP_ID;
    const redirectUri = process.env.META_OAUTH_REDIRECT_URI;

    if (!appId) return res.status(500).json({ error: 'META_APP_ID missing' });
    if (!redirectUri)
      return res.status(500).json({ error: 'META_OAUTH_REDIRECT_URI missing' });

    const nonce = crypto.randomBytes(16).toString('hex');
    const state = jwt.sign(
      { tenantId, nonce, purpose: 'whatsapp_oauth_state' },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    // ✅ scope com permissão business (destrava o "supported permission" em Business Login)
    const scope = ['public_profile', 'email', 'business_management'].join(',');

    const url = new URL(`https://www.facebook.com/${oauthVersion}/dialog/oauth`);
    url.searchParams.set('client_id', String(appId));
    url.searchParams.set('redirect_uri', String(redirectUri));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', scope);

    return res.json({ url: url.toString() });
  } catch (err) {
    return res.status(500).json({ error: 'server error' });
  }
});

// =========================
// Meta (Business / Ads) - OAuth
// =========================

// GET /api/integrations/meta/connect-url?clientId=...&kind=meta_business|meta_ads|instagram_only
router.get('/meta/connect-url', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.user && req.user.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId missing' });

    const clientId = req.query?.clientId ? String(req.query.clientId) : null;
    const kind = req.query?.kind ? String(req.query.kind) : undefined;

    if (clientId) {
      const client = await req.db.client.findFirst({
        where: { id: clientId, tenantId: String(tenantId) },
        select: { id: true },
      });
      if (!client) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
      }
    }

    const url = metaSocialService.buildConnectUrl({
      tenantId,
      clientId,
      kind,
    });

    return res.json({ url });
  } catch (err) {
    console.error('GET /integrations/meta/connect-url error:', err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
});

// B) GET /api/integrations/whatsapp/status
router.get('/whatsapp/status', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.user && req.user.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId missing' });

    const db = req.db;
    const integration = await db.integration.findFirst({
      where: {
        tenantId: String(tenantId),
        provider: 'WHATSAPP_META_CLOUD',
        ownerType: 'AGENCY',
        ownerKey: 'AGENCY',
        status: 'CONNECTED',
      },
      select: { status: true, config: true },
    });

    if (!integration) {
      return res.json({
        ok: true,
        provider: 'WHATSAPP_META_CLOUD',
        status: 'DISCONNECTED',
        phoneNumberId: null,
        displayPhoneNumber: null,
        lastWebhookAt: null,
      });
    }

    const config =
      integration.config && typeof integration.config === 'object' && !Array.isArray(integration.config)
        ? integration.config
        : {};
    const phoneNumberId = config.phone_number_id ? String(config.phone_number_id) : null;
    const displayPhoneNumber = config.display_phone_number
      ? String(config.display_phone_number)
      : config.displayPhoneNumber
        ? String(config.displayPhoneNumber)
        : null;
    const lastWebhookAt = config.last_webhook_at
      ? String(config.last_webhook_at)
      : config.lastWebhookAt
        ? String(config.lastWebhookAt)
        : null;

    return res.json({
      ok: true,
      provider: 'WHATSAPP_META_CLOUD',
      status: 'CONNECTED',
      phoneNumberId,
      displayPhoneNumber,
      lastWebhookAt,
    });
  } catch (err) {
    return res.status(500).json({ error: 'server error' });
  }
});

// C) POST /api/integrations/whatsapp/disconnect
router.post('/whatsapp/disconnect', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.user && req.user.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId missing' });

    const db = req.db;
    const existing = await db.integration.findFirst({
      where: {
        tenantId: String(tenantId),
        provider: 'WHATSAPP_META_CLOUD',
      },
      select: { id: true, config: true },
    });

    if (!existing) return res.json({ ok: true });

    let nextConfig = existing.config;
    if (nextConfig && typeof nextConfig === 'object' && !Array.isArray(nextConfig)) {
      nextConfig = { ...nextConfig };

      if (Object.prototype.hasOwnProperty.call(nextConfig, 'phone_number_id')) {
        delete nextConfig.phone_number_id;
      }

      if (Object.keys(nextConfig).length === 0) nextConfig = null;
    }

    await db.integration.update({
      where: { id: existing.id },
      data: {
        status: 'DISCONNECTED',
        accessTokenEncrypted: null,
        accessToken: null,
        refreshToken: null,
        config: nextConfig,
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server error' });
  }
});

// D) POST /api/integrations/whatsapp/test
router.post('/whatsapp/test', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.user && req.user.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId missing' });

    const db = req.db;
    const existing = await db.integration.findFirst({
      where: {
        tenantId: String(tenantId),
        provider: 'WHATSAPP_META_CLOUD',
      },
      select: { id: true, status: true },
    });

    if (!existing) {
      return res.json({ ok: true, connected: false, reason: 'no_integration' });
    }

    return res.json({ ok: true, connected: existing.status === 'CONNECTED' });
  } catch (err) {
    return res.status(500).json({ error: 'server error' });
  }
});

// =========================
// Rotas genéricas existentes
// =========================
router.get('/', integrationsController.list);
router.post('/', integrationsController.create);
router.post(
  '/clients/:clientId/integrations/:provider/connect',
  integrationsController.connectForClient
);
router.get('/:id', integrationsController.getById);
router.put('/:id', integrationsController.update);
router.delete('/:id', integrationsController.remove);
router.post('/:id/disconnect', integrationsController.disconnect);

module.exports = router;
