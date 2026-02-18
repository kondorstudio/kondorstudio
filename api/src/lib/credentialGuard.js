const SECRET_REF_PREFIX = 'vault://';

const SENSITIVE_KEYS = new Set([
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'token',
  'tokenenc',
  'apikey',
  'api_key',
  'appsecret',
  'app_secret',
  'clientsecret',
  'client_secret',
  'password',
  'secret',
  'serviceaccountjson',
  'privatekey',
  'developertoken',
  'webhooksecret',
  'signingsecret',
  'bearertoken',
]);

function normalizeKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]/g, '')
    .replace(/[.]/g, '_');
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSecretRef(value) {
  return typeof value === 'string' && value.trim().startsWith(SECRET_REF_PREFIX);
}

function isSecretReferenceObject(value) {
  if (!isObject(value)) return false;
  const ref =
    value.secretRef ||
    value.secret_ref ||
    value.ref ||
    value.vaultRef ||
    value.vault_ref ||
    null;
  return isSecretRef(ref);
}

function isEmptyValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && !value.trim()) return true;
  return false;
}

function isSensitiveKey(key) {
  const normalized = normalizeKey(key).replace(/_/g, '');
  return SENSITIVE_KEYS.has(normalized);
}

function collectLooseCredentialPaths(input, basePath = '') {
  const paths = [];

  if (Array.isArray(input)) {
    input.forEach((entry, index) => {
      const nextPath = basePath ? `${basePath}[${index}]` : `[${index}]`;
      paths.push(...collectLooseCredentialPaths(entry, nextPath));
    });
    return paths;
  }

  if (!isObject(input)) return paths;

  for (const [key, value] of Object.entries(input)) {
    const path = basePath ? `${basePath}.${key}` : key;

    if (isSensitiveKey(key)) {
      if (isEmptyValue(value)) continue;
      if (isSecretRef(value) || isSecretReferenceObject(value)) continue;
      paths.push(path);
      continue;
    }

    paths.push(...collectLooseCredentialPaths(value, path));
  }

  return paths;
}

function assertNoLooseCredentials(input, context = 'payload') {
  const paths = collectLooseCredentialPaths(input);
  if (!paths.length) return;

  const err = new Error(
    `Credencial em texto claro não permitida em ${context}: ${paths.join(', ')}`,
  );
  err.code = 'LOOSE_CREDENTIAL_BLOCKED';
  err.status = 400;
  err.details = { context, paths };
  throw err;
}

module.exports = {
  SECRET_REF_PREFIX,
  isSecretRef,
  collectLooseCredentialPaths,
  assertNoLooseCredentials,
};
