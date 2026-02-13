const { google } = require('googleapis');

const jwtClientCache = new Map();

function normalizePrivateKey(value) {
  if (!value) return null;
  const raw = String(value);
  // Common when keys are stored in env vars.
  if (raw.includes('\\n') && !raw.includes('\n')) {
    return raw.replace(/\\n/g, '\n');
  }
  return raw;
}

function buildCacheKey(email, scopes) {
  const normalized = Array.isArray(scopes) ? scopes.map(String).filter(Boolean) : [];
  normalized.sort();
  return `${email}:${normalized.join(' ')}`;
}

function getJwtClient(serviceAccount, scopes) {
  if (!serviceAccount) return null;
  const email = serviceAccount.client_email || serviceAccount.clientEmail;
  const privateKey = normalizePrivateKey(serviceAccount.private_key || serviceAccount.privateKey);
  if (!email || !privateKey) return null;

  const key = buildCacheKey(String(email), scopes);
  if (jwtClientCache.has(key)) return jwtClientCache.get(key);

  const client = new google.auth.JWT({
    email: String(email),
    key: privateKey,
    scopes,
    subject: serviceAccount.subject || undefined,
  });

  // Simple bounded cache to avoid unbounded growth.
  if (jwtClientCache.size > 100) {
    const firstKey = jwtClientCache.keys().next().value;
    if (firstKey) jwtClientCache.delete(firstKey);
  }
  jwtClientCache.set(key, client);
  return client;
}

async function getServiceAccountAccessToken(serviceAccount, scopes) {
  const client = getJwtClient(serviceAccount, scopes);
  if (!client) return null;

  try {
    const tokenResult = await client.getAccessToken();
    if (typeof tokenResult === 'string') return tokenResult;
    return tokenResult?.token || null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  getServiceAccountAccessToken,
};

