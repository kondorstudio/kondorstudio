process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectLooseCredentialPaths,
  assertNoLooseCredentials,
} = require('../src/lib/credentialGuard');

test('collectLooseCredentialPaths identifica credenciais em texto claro', () => {
  const paths = collectLooseCredentialPaths({
    settings: {
      accessToken: 'abc123',
      nested: {
        api_key: 'xyz',
      },
    },
    config: {
      notSecret: 'ok',
    },
  });

  assert.deepEqual(paths.sort(), ['settings.accessToken', 'settings.nested.api_key'].sort());
});

test('collectLooseCredentialPaths ignora secretRef', () => {
  const paths = collectLooseCredentialPaths({
    settings: {
      accessToken: 'vault://credential/123',
      token: { secretRef: 'vault://credential/456' },
    },
  });
  assert.equal(paths.length, 0);
});

test('assertNoLooseCredentials lança erro com code esperado', () => {
  assert.throws(
    () =>
      assertNoLooseCredentials(
        {
          access_token: 'plain',
        },
        'integration.create.data.settings',
      ),
    (error) => {
      assert.equal(error.code, 'LOOSE_CREDENTIAL_BLOCKED');
      return true;
    },
  );
});
