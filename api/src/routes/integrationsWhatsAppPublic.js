const express = require('express');
const jwt = require('jsonwebtoken');

const { prisma } = require('../prisma');
const { encrypt } = require('../utils/crypto');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_local_secret';

function buildRedirectUrl(result) {
  const suffix = result === 'connected' ? 'connected' : 'error';
  const fallback = `/integrations?whatsapp=${suffix}`;
  const base = process.env.PUBLIC_APP_URL;
  if (!base) return fallback;
  return `${String(base).replace(/\/+$/, '')}${fallback}`;
}

async function fetchJsonWithTimeout(
  url,
  { method = 'GET', headers = {}, body = undefined, timeoutMs = 8000 } = {},
) {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch() não disponível no runtime Node (exige Node >=18).');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...headers },
      body,
      signal: controller.signal,
    });

    const text = await res.text().catch(() => '');
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = text;
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    if (err?.name === 'AbortError') {
      const e = new Error('Timeout ao chamar Meta Graph API');
      e.code = 'ETIMEDOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function ensureMetaEnv() {
  const oauthVersion = process.env.META_OAUTH_VERSION || 'v20.0';
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;

  const missing = [];
  if (!appId) missing.push('META_APP_ID');
  if (!appSecret) missing.push('META_APP_SECRET');
  if (!redirectUri) missing.push('META_OAUTH_REDIRECT_URI');

  if (missing.length) {
    const err = new Error(`Meta OAuth env ausente: ${missing.join(', ')}`);
    err.code = 'MISSING_ENV';
    throw err;
  }

  return { oauthVersion, appId, appSecret, redirectUri };
}

function cleanJson(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cleanJson);

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = cleanJson(v);
  }
  return out;
}

// B) GET /api/integrations/whatsapp/callback
router.get('/callback', async (req, res) => {
  const metaError = req.query && (req.query.error || req.query.error_description);
  if (metaError) {
    const redirectUrl = buildRedirectUrl('error');
    if (process.env.PUBLIC_APP_URL) return res.redirect(302, redirectUrl);
    return res.status(400).json({ error: 'meta_oauth_error' });
  }

  const code = req.query && req.query.code;
  const state = req.query && req.query.state;

  if (!code || !state) {
    const redirectUrl = buildRedirectUrl('error');
    if (process.env.PUBLIC_APP_URL) return res.redirect(302, redirectUrl);
    return res.status(400).json({ error: 'missing code or state' });
  }

  let payload;
  try {
    payload = jwt.verify(String(state), JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'invalid state' });
  }

  // Segurança extra: garantir que o state foi gerado para este propósito
  if (!payload || payload.purpose !== 'whatsapp_oauth_state') {
    return res.status(400).json({ error: 'invalid state' });
  }

  const tenantId = payload && payload.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: 'invalid state' });
  }

  try {
    const { oauthVersion, appId, appSecret, redirectUri } = ensureMetaEnv();
    const graphBase = `https://graph.facebook.com/${oauthVersion}`;

    const tokenBody = new URLSearchParams();
    tokenBody.set('client_id', String(appId));
    tokenBody.set('client_secret', String(appSecret));
    tokenBody.set('redirect_uri', String(redirectUri));
    tokenBody.set('code', String(code));

    const shortResp = await fetchJsonWithTimeout(`${graphBase}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
      timeoutMs: 9000,
    });
    if (!shortResp.ok) {
      const msg = shortResp?.data?.error?.message || 'Falha ao trocar code por token';
      const redirectUrl = buildRedirectUrl('error');
      if (process.env.PUBLIC_APP_URL) return res.redirect(302, redirectUrl);
      return res.status(502).json({ error: msg });
    }

    const shortToken = shortResp?.data?.access_token;
    const shortTokenType = shortResp?.data?.token_type || null;
    const shortExpiresIn = shortResp?.data?.expires_in || null;

    if (!shortToken) {
      const redirectUrl = buildRedirectUrl('error');
      if (process.env.PUBLIC_APP_URL) return res.redirect(302, redirectUrl);
      return res.status(502).json({ error: 'token ausente na resposta da Meta' });
    }

    let finalToken = shortToken;
    let tokenType = shortTokenType;
    let expiresIn = shortExpiresIn;

    // Opcional: troca short-lived por long-lived (melhor para integrações server-side)
    try {
      const exchangeUrl = new URL(`${graphBase}/oauth/access_token`);
      exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token');
      exchangeUrl.searchParams.set('client_id', String(appId));
      exchangeUrl.searchParams.set('client_secret', String(appSecret));
      exchangeUrl.searchParams.set('fb_exchange_token', String(shortToken));

      const longResp = await fetchJsonWithTimeout(exchangeUrl.toString(), { timeoutMs: 9000 });
      if (longResp.ok && longResp?.data?.access_token) {
        finalToken = longResp.data.access_token;
        tokenType = longResp.data.token_type || tokenType;
        expiresIn = longResp.data.expires_in || expiresIn;
      }
    } catch (_) {
      // Best-effort: se falhar, continua com short-lived.
    }

    // Confirma validade do token e captura meta_user_id + businesses/WABA
    const meUrl = new URL(`${graphBase}/me`);
    meUrl.searchParams.set('fields', 'id,name,businesses{owned_whatsapp_business_accounts{id,name}}');
    const meResp = await fetchJsonWithTimeout(meUrl.toString(), {
      timeoutMs: 9000,
      headers: { Authorization: `Bearer ${finalToken}` },
    });

    if (!meResp.ok) {
      const msg = meResp?.data?.error?.message || 'Token inválido (falha em /me)';
      const redirectUrl = buildRedirectUrl('error');
      if (process.env.PUBLIC_APP_URL) return res.redirect(302, redirectUrl);
      return res.status(502).json({ error: msg });
    }

    const metaUserId = meResp?.data?.id || null;
    const metaUserName = meResp?.data?.name || null;

    let wabaId = null;
    const businesses = Array.isArray(meResp?.data?.businesses?.data) ? meResp.data.businesses.data : [];
    for (const business of businesses) {
      const accounts = Array.isArray(business?.owned_whatsapp_business_accounts?.data)
        ? business.owned_whatsapp_business_accounts.data
        : [];
      const firstAccount = accounts.find((acc) => acc?.id);
      if (firstAccount?.id) {
        wabaId = String(firstAccount.id);
        break;
      }
    }

    if (!wabaId) {
      const redirectUrl = buildRedirectUrl('error');
      if (process.env.PUBLIC_APP_URL) return res.redirect(302, redirectUrl);
      return res.status(502).json({ error: 'Nenhuma WABA encontrada para este usuário' });
    }

    // Best-effort: capturar permissões concedidas
    let grantedScopes = null;
    try {
      const permsUrl = new URL(`${graphBase}/me/permissions`);
      const permsResp = await fetchJsonWithTimeout(permsUrl.toString(), {
        timeoutMs: 9000,
        headers: { Authorization: `Bearer ${finalToken}` },
      });
      if (permsResp.ok && Array.isArray(permsResp?.data?.data)) {
        grantedScopes = permsResp.data.data
          .filter((p) => p && p.status === 'granted' && p.permission)
          .map((p) => String(p.permission));
      }
    } catch (_) {}

    let phoneNumberId = null;
    let displayPhoneNumber = null;
    try {
      const phonesUrl = new URL(`${graphBase}/${encodeURIComponent(wabaId)}/phone_numbers`);
      phonesUrl.searchParams.set('fields', 'id,display_phone_number,verified_name');
      const phonesResp = await fetchJsonWithTimeout(phonesUrl.toString(), {
        timeoutMs: 9000,
        headers: { Authorization: `Bearer ${finalToken}` },
      });

      const firstPhone =
        phonesResp?.ok && Array.isArray(phonesResp?.data?.data) ? phonesResp.data.data[0] : null;
      if (firstPhone?.id) {
        phoneNumberId = String(firstPhone.id);
        if (firstPhone.display_phone_number) {
          displayPhoneNumber = String(firstPhone.display_phone_number);
        }
      }
    } catch (_) {}

    if (!phoneNumberId) {
      const redirectUrl = buildRedirectUrl('error');
      if (process.env.PUBLIC_APP_URL) return res.redirect(302, redirectUrl);
      return res.status(502).json({ error: 'Nenhum phone_number_id encontrado para esta WABA' });
    }

    const nowIso = new Date().toISOString();
    const nextConfig = cleanJson({
      connected_at: nowIso,
      callback_received_at: nowIso,
      meta_oauth_version: oauthVersion,
      token_type: tokenType,
      expires_in: expiresIn,
      meta_user_id: metaUserId,
      meta_user_name: metaUserName,
      scopes_granted: grantedScopes || undefined,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber || undefined,
    });

    const encryptedToken = encrypt(finalToken);
    const scopes = Array.isArray(grantedScopes) ? grantedScopes : [];
    await prisma.integration.upsert({
      where: {
        tenantId_provider_ownerKey: {
          tenantId: String(tenantId),
          provider: 'WHATSAPP_META_CLOUD',
          ownerKey: 'AGENCY',
        },
      },
      update: {
        ownerType: 'AGENCY',
        ownerKey: 'AGENCY',
        status: 'CONNECTED',
        accessToken: null,
        accessTokenEncrypted: encryptedToken,
        refreshToken: null,
        scopes,
        config: nextConfig,
      },
      create: {
        tenantId: String(tenantId),
        provider: 'WHATSAPP_META_CLOUD',
        ownerType: 'AGENCY',
        ownerKey: 'AGENCY',
        status: 'CONNECTED',
        accessToken: null,
        accessTokenEncrypted: encryptedToken,
        refreshToken: null,
        scopes,
        config: nextConfig,
      },
    });

    const redirectUrl = buildRedirectUrl('connected');
    if (process.env.PUBLIC_APP_URL) return res.redirect(302, redirectUrl);
    return res.json({
      ok: true,
      status: 'CONNECTED',
      tenantId: String(tenantId),
      meta_user_id: metaUserId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber,
      token_saved: true,
    });
  } catch (err) {
    const redirectUrl = buildRedirectUrl('error');
    if (process.env.PUBLIC_APP_URL) return res.redirect(302, redirectUrl);

    const message =
      err?.code === 'MISSING_ENV'
        ? err.message
        : String(err?.message || '').includes('Missing CRYPTO_KEY')
          ? err.message
        : err?.code === 'ETIMEDOUT'
          ? 'Timeout ao chamar Meta'
          : 'server error';
    const status = err?.code === 'MISSING_ENV' ? 500 : 500;
    return res.status(status).json({ error: message });
  }
});

module.exports = router;
