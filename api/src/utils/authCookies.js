const isProduction = process.env.NODE_ENV === 'production';

const ACCESS_COOKIE = process.env.AUTH_ACCESS_COOKIE || 'kondor_access_token';
const REFRESH_COOKIE = process.env.AUTH_REFRESH_COOKIE || 'kondor_refresh_token';
const REFRESH_ID_COOKIE = process.env.AUTH_REFRESH_ID_COOKIE || 'kondor_refresh_id';
const CLIENT_ACCESS_COOKIE = process.env.CLIENT_ACCESS_COOKIE || 'kondor_client_token';

function parseCookies(req) {
  const header = req?.headers?.cookie;
  if (!header || typeof header !== 'string') return {};

  return header.split(';').reduce((acc, part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return acc;
    const value = rest.join('=');
    acc[rawKey] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

function getCookieOptions({ expires, maxAgeMs } = {}) {
  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
  if (expires) options.expires = expires;
  if (typeof maxAgeMs === 'number') options.maxAge = maxAgeMs;
  return options;
}

function getClientCookieOptions({ expires, maxAgeMs } = {}) {
  return getCookieOptions({ expires, maxAgeMs });
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_ID_COOKIE,
  CLIENT_ACCESS_COOKIE,
  parseCookies,
  getCookieOptions,
  getClientCookieOptions,
};
