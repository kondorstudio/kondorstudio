const express = require('express');
const jwt = require('jsonwebtoken');

const metaSocialService = require('../services/metaSocialService');
const connectionStateService = require('../services/connectionStateService');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_local_secret';

function getPublicAppBase() {
  const value =
    process.env.PUBLIC_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.APP_URL_FRONT ||
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_APP_BASE_URL ||
    '';
  return String(value || '').replace(/\/+$/, '');
}

function buildRedirectUrl(status, info = {}) {
  const suffix = status === 'connected' ? 'connected' : 'error';
  const params = new URLSearchParams();
  params.set('meta', suffix);
  if (info.kind) params.set('kind', info.kind);
  if (info.clientId) params.set('clientId', info.clientId);

  const fallback = `/integrations?${params.toString()}`;
  const base = getPublicAppBase();
  if (!base) return fallback;
  return `${base}${fallback}`;
}

function decodeState(state) {
  if (!state) return {};
  try {
    const payload = jwt.verify(String(state), JWT_SECRET);
    return {
      tenantId: payload?.tenantId ? String(payload.tenantId) : null,
      kind: payload?.kind ? String(payload.kind) : null,
      clientId: payload?.clientId ? String(payload.clientId) : null,
    };
  } catch (_) {
    try {
      const payload = jwt.decode(String(state));
      return {
        tenantId: payload?.tenantId ? String(payload.tenantId) : null,
        kind: payload?.kind ? String(payload.kind) : null,
        clientId: payload?.clientId ? String(payload.clientId) : null,
      };
    } catch {
      return {};
    }
  }
}

async function markMetaOauthErrorState(decoded, reasonCode, reasonMessage) {
  const tenantId = decoded?.tenantId ? String(decoded.tenantId) : null;
  if (!tenantId) return;
  try {
    await connectionStateService.upsertConnectionState({
      tenantId,
      brandId: decoded?.clientId ? String(decoded.clientId) : null,
      provider: 'META',
      connectionKey: metaSocialService.buildOwnerKey(decoded?.clientId || null, decoded?.kind || 'meta_business'),
      status: connectionStateService.STATUS.ERROR,
      reasonCode: reasonCode || 'META_OAUTH_ERROR',
      reasonMessage: reasonMessage || 'Meta OAuth callback failed',
      nextAction: 'Reconnect Meta account',
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[integrationsMetaPublic] failed to save oauth error state', err?.message || err);
    }
  }
}

// GET /api/integrations/meta/callback
router.get('/callback', async (req, res) => {
  const metaError = req.query && (req.query.error || req.query.error_description);
  const state = req.query && req.query.state;
  const decoded = decodeState(state);

  if (metaError) {
    await markMetaOauthErrorState(decoded, 'META_OAUTH_ERROR', String(metaError));
    const redirectUrl = buildRedirectUrl('error', decoded);
    if (getPublicAppBase()) {
      return res.redirect(302, redirectUrl);
    }
    return res.status(400).json({ error: 'meta_oauth_error' });
  }

  const code = req.query && req.query.code;

  if (!code || !state) {
    await markMetaOauthErrorState(decoded, 'META_OAUTH_MISSING_CODE_OR_STATE', 'missing code or state');
    const redirectUrl = buildRedirectUrl('error', decoded);
    if (getPublicAppBase()) {
      return res.redirect(302, redirectUrl);
    }
    return res.status(400).json({ error: 'missing code or state' });
  }

  try {
    const result = await metaSocialService.handleCallback({ code, state });
    const redirectUrl = buildRedirectUrl('connected', result || decoded);
    if (getPublicAppBase()) {
      return res.redirect(302, redirectUrl);
    }
    return res.json({ ok: true, ...result });
  } catch (err) {
    await markMetaOauthErrorState(
      decoded,
      err?.code || 'META_OAUTH_CALLBACK_FAILED',
      err?.message || 'meta_oauth_failed',
    );
    const redirectUrl = buildRedirectUrl('error', decoded);
    if (getPublicAppBase()) {
      return res.redirect(302, redirectUrl);
    }
    return res.status(500).json({ error: err?.message || 'meta_oauth_failed' });
  }
});

module.exports = router;
