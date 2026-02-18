const test = require('node:test');
const assert = require('node:assert/strict');

const syncRunsService = require('../src/services/syncRunsService');
const reliability = require('../src/lib/reliability');

const { executeWithReliability, _internals } = reliability;
const originalIncrementRetryCount = syncRunsService.incrementRunRetryCount;

function transientError(status = 503, message = 'temporary upstream failure') {
  const err = new Error(message);
  err.status = status;
  return err;
}

test.beforeEach(() => {
  _internals.RATE_LIMIT_STATE.clear();
  _internals.CIRCUIT_STATE.clear();
  syncRunsService.incrementRunRetryCount = originalIncrementRetryCount;
});

test.after(() => {
  syncRunsService.incrementRunRetryCount = originalIncrementRetryCount;
});

test('retries transient failures and increments retry metric per run', async () => {
  let attempts = 0;
  let retryMetricCalls = 0;

  syncRunsService.incrementRunRetryCount = async () => {
    retryMetricCalls += 1;
    return null;
  };

  const result = await executeWithReliability(
    {
      provider: 'GA4',
      connectionKey: 'property:123',
      runId: 'run-123',
      timeoutMs: 500,
      maxAttempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 1,
      jitterMs: 1,
      rateLimitMax: 100,
      rateLimitWindowMs: 1000,
      circuitFailureThreshold: 10,
    },
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw transientError(503, 'service unavailable');
      }
      return { ok: true };
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 3);
  assert.equal(retryMetricCalls, 2);
});

test('does not retry fatal errors', async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      executeWithReliability(
        {
          provider: 'META',
          connectionKey: 'act_1',
          timeoutMs: 500,
          maxAttempts: 4,
          baseDelayMs: 1,
          maxDelayMs: 1,
          jitterMs: 1,
          rateLimitMax: 100,
          rateLimitWindowMs: 1000,
        },
        async () => {
          attempts += 1;
          throw transientError(400, 'bad request');
        },
      ),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(attempts, 1);
});

test('enforces rate limiting by provider + connection', async () => {
  const startedAt = Date.now();
  const timestamps = [];

  const runCall = () =>
    executeWithReliability(
      {
        provider: 'GOOGLE_ADS',
        connectionKey: 'customer:abc',
        timeoutMs: 500,
        maxAttempts: 1,
        baseDelayMs: 1,
        maxDelayMs: 1,
        jitterMs: 1,
        rateLimitMax: 1,
        rateLimitWindowMs: 60,
        circuitFailureThreshold: 10,
      },
      async () => {
        timestamps.push(Date.now() - startedAt);
        return 'ok';
      },
    );

  await Promise.all([runCall(), runCall()]);
  assert.equal(timestamps.length, 2);

  const [first, second] = timestamps.sort((a, b) => a - b);
  assert.ok(second - first >= 40, `Expected limiter delay >= 40ms, got ${second - first}ms`);
});

test('opens circuit breaker after threshold and short-circuits next call', async () => {
  let upstreamCalls = 0;

  const reliabilityOptions = {
    provider: 'TIKTOK_ADS',
    connectionKey: 'adv:999',
    timeoutMs: 500,
    maxAttempts: 1,
    baseDelayMs: 1,
    maxDelayMs: 1,
    jitterMs: 1,
    rateLimitMax: 100,
    rateLimitWindowMs: 1000,
    circuitFailureThreshold: 2,
    circuitOpenMs: 300,
  };

  const failingCall = async () => {
    upstreamCalls += 1;
    throw transientError(503, 'upstream down');
  };

  await assert.rejects(() => executeWithReliability(reliabilityOptions, failingCall));
  await assert.rejects(() => executeWithReliability(reliabilityOptions, failingCall));

  let thirdCallExecuted = false;

  await assert.rejects(
    () =>
      executeWithReliability(reliabilityOptions, async () => {
        thirdCallExecuted = true;
        return 'unexpected';
      }),
    (error) => {
      assert.equal(error.code, 'RELIABILITY_CIRCUIT_OPEN');
      return true;
    },
  );

  assert.equal(upstreamCalls, 2);
  assert.equal(thirdCallExecuted, false);
});
