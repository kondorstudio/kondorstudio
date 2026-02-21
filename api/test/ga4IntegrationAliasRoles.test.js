process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

function mockModule(path, exports) {
  const resolved = require.resolve(path);
  require.cache[resolved] = { exports };
}

function resetModule(path) {
  const resolved = require.resolve(path);
  delete require.cache[resolved];
}

test.afterEach(() => {
  [
    '../src/middleware/auth',
    '../src/middleware/tenant',
    '../src/middleware/validate',
    '../src/controllers/integrationsController',
    '../src/controllers/integrationsGa4Controller',
    '../src/services/metaSocialService',
    '../src/validators/ga4Validator',
    '../src/routes/integrations',
  ].forEach((path) => {
    try {
      resetModule(path);
    } catch (_) {}
  });
});

test('GA4 alias route /integrations/ga4/brands/settings accepts MEMBER role', () => {
  const tracker = { roleSets: [] };

  const auth = (_req, _res, next) => next();
  auth.requireRole = (...roles) => {
    tracker.roleSets.push(roles);
    return (_req, _res, next) => next();
  };

  mockModule('../src/middleware/auth', auth);
  mockModule('../src/middleware/tenant', (_req, _res, next) => next());
  mockModule('../src/middleware/validate', () => (_req, _res, next) => next());
  mockModule('../src/services/metaSocialService', {
    buildConnectUrl: () => 'http://example.com/connect',
  });
  mockModule('../src/validators/ga4Validator', {
    ga4BrandSettingsSchema: {},
    ga4FactsSyncSchema: {},
  });

  const integrationsController = {
    list: (_req, res) => res.json([]),
    create: (_req, res) => res.json({ ok: true }),
    connectForClient: (_req, res) => res.json({ ok: true }),
    getById: (_req, res) => res.json({ ok: true }),
    update: (_req, res) => res.json({ ok: true }),
    remove: (_req, res) => res.json({ ok: true }),
    disconnect: (_req, res) => res.json({ ok: true }),
    storeCredential: (_req, res) => res.json({ ok: true }),
  };
  mockModule('../src/controllers/integrationsController', integrationsController);

  const ga4Controller = {
    brandSettingsGet: (_req, res) => res.json({ ok: true }),
    brandSettingsUpsert: (_req, res) => res.json({ ok: true }),
    syncFacts: (_req, res) => res.json({ ok: true }),
  };
  mockModule('../src/controllers/integrationsGa4Controller', ga4Controller);

  resetModule('../src/routes/integrations');
  require('../src/routes/integrations');

  const hasMemberPermission = tracker.roleSets.some(
    (roles) =>
      roles.includes('OWNER') &&
      roles.includes('ADMIN') &&
      roles.includes('SUPER_ADMIN') &&
      roles.includes('MEMBER'),
  );
  assert.equal(hasMemberPermission, true);
});

