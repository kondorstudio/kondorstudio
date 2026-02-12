const { google } = require('googleapis');
const { fetchWithTimeout, isTimeoutError } = require('./fetchWithTimeout');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.GA4_OAUTH_TIMEOUT_MS || process.env.FETCH_TIMEOUT_MS || 15_000),
);
const REQUIRED_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/analytics.readonly',
];
const FORBIDDEN_SCOPES = new Set(['https://www.googleapis.com/auth/analytics']);

function normalizeScopes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function applyScopePolicy(scopes = []) {
  const filtered = scopes.filter((scope) => !FORBIDDEN_SCOPES.has(scope));
  const seen = new Set();
  const merged = [];

  REQUIRED_SCOPES.forEach((scope) => {
    if (seen.has(scope)) return;
    seen.add(scope);
    merged.push(scope);
  });

  filtered.forEach((scope) => {
    if (seen.has(scope)) return;
    seen.add(scope);
    merged.push(scope);
  });

  return merged;
}

function getOAuthScopes() {
  const rawScopes = process.env.GOOGLE_OAUTH_SCOPES;
  const normalized = normalizeScopes(rawScopes);
  return applyScopePolicy(normalized);
}

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const scopes = getOAuthScopes();

  if (!clientId) throw new Error('GOOGLE_OAUTH_CLIENT_ID missing');
  if (!clientSecret) throw new Error('GOOGLE_OAUTH_CLIENT_SECRET missing');
  if (!redirectUri) throw new Error('GOOGLE_OAUTH_REDIRECT_URI missing');
  if (!scopes.length) throw new Error('GOOGLE_OAUTH_SCOPES missing');

  return { clientId, clientSecret, redirectUri, scopes };
}

function createOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function assertAuthUrlParams(url, { requireConsent = false } = {}) {
  const parsed = new URL(url);
  const required = {
    access_type: 'offline',
    include_granted_scopes: 'true',
  };
  const missing = Object.entries(required)
    .filter(([key, value]) => parsed.searchParams.get(key) !== value)
    .map(([key]) => key);
  if (missing.length) {
    const err = new Error(`GA4 OAuth URL missing params: ${missing.join(', ')}`);
    err.status = 500;
    throw err;
  }
  if (requireConsent && parsed.searchParams.get('prompt') !== 'consent') {
    const err = new Error('GA4 OAuth URL missing prompt=consent');
    err.status = 500;
    throw err;
  }
  if (process.env.GA4_OAUTH_DEBUG === 'true') {
    console.info('GA4 OAuth URL params', {
      prompt: parsed.searchParams.get('prompt'),
      access_type: parsed.searchParams.get('access_type'),
      include_granted_scopes: parsed.searchParams.get('include_granted_scopes'),
    });
  }
  return url;
}

function buildAuthUrl({ state, forceConsent, force } = {}) {
  const { scopes } = getOAuthConfig();
  const oauth2Client = createOAuthClient();
  const shouldConsent = Boolean(forceConsent || force);
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: shouldConsent ? 'consent' : undefined,
    include_granted_scopes: true,
    scope: scopes,
    state,
  });
  return assertAuthUrlParams(url, { requireConsent: shouldConsent });
}

async function exchangeCodeForTokens(code) {
  if (!code) throw new Error('OAuth code missing');
  const oauth2Client = createOAuthClient();
  const response = await oauth2Client.getToken(code);
  return response.tokens || {};
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) throw new Error('refreshToken missing');
  const { clientId, clientSecret } = getOAuthConfig();

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  let res;
  try {
    res = await fetchWithTimeout(
      TOKEN_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      OAUTH_TIMEOUT_MS,
    );
  } catch (error) {
    if (isTimeoutError(error)) {
      const err = new Error('OAuth refresh timeout');
      err.status = 504;
      err.code = 'GA4_OAUTH_TIMEOUT';
      err.data = {
        timeoutMs: error?.timeoutMs || OAUTH_TIMEOUT_MS,
      };
      throw err;
    }
    throw error;
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error_description || json?.error || 'OAuth refresh failed';
    const err = new Error(message);
    err.status = res.status;
    err.data = json;
    throw err;
  }

  return json;
}

module.exports = {
  normalizeScopes,
  applyScopePolicy,
  getOAuthScopes,
  getOAuthConfig,
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
};
