const express = require('express');
const jwt = require('jsonwebtoken');

const metaSocialService = require('../services/metaSocialService');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_local_secret';

function buildRedirectUrl(status, info = {}) {
  const suffix = status === 'connected' ? 'connected' : 'error';
  const params = new URLSearchParams();
  params.set('meta', suffix);
  if (info.kind) params.set('kind', info.kind);
  if (info.clientId) params.set('clientId', info.clientId);

  const fallback = `/integrations?${params.toString()}`;
  const base = process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL;
  if (!base) return fallback;
  return `${String(base).replace(/\/+$/, '')}${fallback}`;
}

function decodeState(state) {
  if (!state) return {};
  try {
    const payload = jwt.verify(String(state), JWT_SECRET);
    return {
      kind: payload?.kind ? String(payload.kind) : null,
      clientId: payload?.clientId ? String(payload.clientId) : null,
    };
  } catch (_) {
    try {
      const payload = jwt.decode(String(state));
      return {
        kind: payload?.kind ? String(payload.kind) : null,
        clientId: payload?.clientId ? String(payload.clientId) : null,
      };
    } catch {
      return {};
    }
  }
}

// GET /api/integrations/meta/callback
router.get('/callback', async (req, res) => {
  const metaError = req.query && (req.query.error || req.query.error_description);
  const state = req.query && req.query.state;
  const decoded = decodeState(state);

  if (metaError) {
    const redirectUrl = buildRedirectUrl('error', decoded);
    if (process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL) {
      return res.redirect(302, redirectUrl);
    }
    return res.status(400).json({ error: 'meta_oauth_error' });
  }

  const code = req.query && req.query.code;

  if (!code || !state) {
    const redirectUrl = buildRedirectUrl('error', decoded);
    if (process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL) {
      return res.redirect(302, redirectUrl);
    }
    return res.status(400).json({ error: 'missing code or state' });
  }

  try {
    const result = await metaSocialService.handleCallback({ code, state });
    const redirectUrl = buildRedirectUrl('connected', result || decoded);
    if (process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL) {
      return res.redirect(302, redirectUrl);
    }
    return res.json({ ok: true, ...result });
  } catch (err) {
    const redirectUrl = buildRedirectUrl('error', decoded);
    if (process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL) {
      return res.redirect(302, redirectUrl);
    }
    return res.status(500).json({ error: err?.message || 'meta_oauth_failed' });
  }
});

module.exports = router;
