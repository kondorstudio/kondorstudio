const syncRunsService = require('../services/syncRunsService');

const RATE_LIMIT_STATE = new Map();
const CIRCUIT_STATE = new Map();

function toPositiveInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

function sleep(ms) {
  const waitMs = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}

function normalizeKey({ provider, connectionKey }) {
  const providerKey = String(provider || 'unknown').trim().toUpperCase() || 'UNKNOWN';
  const connection = String(connectionKey || 'default').trim() || 'default';
  return `${providerKey}:${connection}`;
}

function defaultClassifyError(error) {
  if (!error) {
    return { retryable: false, status: null, code: 'UNKNOWN' };
  }

  if (error.retryable === true) {
    return {
      retryable: true,
      status: Number(error.status || error.httpStatus || error.response?.status) || null,
      code: error.code || null,
    };
  }

  const status = Number(error.status || error.httpStatus || error.response?.status) || null;
  const code = String(error.code || error.errno || '').trim().toUpperCase() || null;
  const message = String(error.message || '').toLowerCase();

  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) {
    return { retryable: true, status, code };
  }

  const transientCodes = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ESOCKETTIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
    'ABORT_ERR',
  ]);
  if (code && transientCodes.has(code)) {
    return { retryable: true, status, code };
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return { retryable: true, status, code };
  }

  return { retryable: false, status, code };
}

function getRateLimitBucket(key) {
  const now = Date.now();
  const current = RATE_LIMIT_STATE.get(key);
  if (!current) {
    const bucket = {
      windowStart: now,
      count: 0,
    };
    RATE_LIMIT_STATE.set(key, bucket);
    return bucket;
  }
  return current;
}

async function acquireRateLimitSlot(key, { max, windowMs }) {
  const limit = toPositiveInt(max, 30);
  const windowSize = toPositiveInt(windowMs, 1000);

  // Local in-memory limiter (per process): provider+connection.
  // If saturated, waits for next window instead of hard-failing immediately.
  while (true) {
    const bucket = getRateLimitBucket(key);
    const now = Date.now();

    if (now - bucket.windowStart >= windowSize) {
      bucket.windowStart = now;
      bucket.count = 0;
    }

    if (bucket.count < limit) {
      bucket.count += 1;
      return;
    }

    const waitMs = Math.max(1, windowSize - (now - bucket.windowStart));
    // eslint-disable-next-line no-await-in-loop
    await sleep(waitMs);
  }
}

function getCircuitBucket(key) {
  const current = CIRCUIT_STATE.get(key);
  if (current) return current;

  const bucket = {
    state: 'CLOSED',
    failures: 0,
    openedAt: null,
    halfOpenInFlight: false,
  };
  CIRCUIT_STATE.set(key, bucket);
  return bucket;
}

function buildCircuitOpenError(key, retryAfterMs) {
  const err = new Error(`Circuit breaker open for ${key}`);
  err.code = 'RELIABILITY_CIRCUIT_OPEN';
  err.status = 503;
  err.retryable = true;
  err.retryAfterMs = retryAfterMs;
  return err;
}

function beforeCircuitAttempt(key, circuitOpenMs) {
  const bucket = getCircuitBucket(key);
  const now = Date.now();

  if (bucket.state === 'OPEN') {
    const elapsed = now - Number(bucket.openedAt || 0);
    if (elapsed < circuitOpenMs) {
      throw buildCircuitOpenError(key, circuitOpenMs - elapsed);
    }

    bucket.state = 'HALF_OPEN';
    bucket.halfOpenInFlight = false;
  }

  if (bucket.state === 'HALF_OPEN') {
    if (bucket.halfOpenInFlight) {
      throw buildCircuitOpenError(key, Math.max(250, Math.floor(circuitOpenMs / 4)));
    }
    bucket.halfOpenInFlight = true;
  }
}

function markCircuitSuccess(key) {
  const bucket = getCircuitBucket(key);
  bucket.state = 'CLOSED';
  bucket.failures = 0;
  bucket.openedAt = null;
  bucket.halfOpenInFlight = false;
}

function markCircuitFailure(key, { threshold }) {
  const bucket = getCircuitBucket(key);
  const failThreshold = toPositiveInt(threshold, 5);

  if (bucket.state === 'HALF_OPEN') {
    bucket.state = 'OPEN';
    bucket.openedAt = Date.now();
    bucket.halfOpenInFlight = false;
    bucket.failures = failThreshold;
    return;
  }

  bucket.failures += 1;
  if (bucket.failures >= failThreshold) {
    bucket.state = 'OPEN';
    bucket.openedAt = Date.now();
    bucket.halfOpenInFlight = false;
  }
}

async function trackRetry(runId) {
  if (!runId) return;
  try {
    await syncRunsService.incrementRunRetryCount(runId, 1);
  } catch (_err) {
    // best-effort metric update only
  }
}

async function runWithTimeout(executor, timeoutMs, parentSignal, attempt) {
  const timeout = toPositiveInt(timeoutMs, 20_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const abortFromParent = () => controller.abort();
  if (parentSignal && typeof parentSignal.addEventListener === 'function') {
    parentSignal.addEventListener('abort', abortFromParent, { once: true });
  }

  try {
    return await executor({
      signal: controller.signal,
      attempt,
    });
  } catch (error) {
    if (controller.signal.aborted && !error?.code) {
      const timeoutErr = new Error('Request timeout');
      timeoutErr.code = 'ETIMEDOUT';
      timeoutErr.status = 504;
      timeoutErr.retryable = true;
      throw timeoutErr;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (parentSignal && typeof parentSignal.removeEventListener === 'function') {
      parentSignal.removeEventListener('abort', abortFromParent);
    }
  }
}

async function executeWithReliability(options = {}, executor) {
  if (typeof executor !== 'function') {
    throw new TypeError('executor function is required');
  }

  const key = normalizeKey({
    provider: options.provider,
    connectionKey: options.connectionKey,
  });

  const maxAttempts = toPositiveInt(
    options.maxAttempts,
    toPositiveInt(process.env.RELIABILITY_MAX_ATTEMPTS, 3),
  );
  const baseDelayMs = toPositiveInt(
    options.baseDelayMs,
    toPositiveInt(process.env.RELIABILITY_BASE_DELAY_MS, 250),
  );
  const maxDelayMs = toPositiveInt(
    options.maxDelayMs,
    toPositiveInt(process.env.RELIABILITY_MAX_DELAY_MS, 5_000),
  );
  const jitterMs = toPositiveInt(
    options.jitterMs,
    toPositiveInt(process.env.RELIABILITY_JITTER_MS, 250),
  );

  const rateLimitMax = toPositiveInt(
    options.rateLimitMax,
    toPositiveInt(process.env.RELIABILITY_RATE_LIMIT_MAX, 60),
  );
  const rateLimitWindowMs = toPositiveInt(
    options.rateLimitWindowMs,
    toPositiveInt(process.env.RELIABILITY_RATE_LIMIT_WINDOW_MS, 60_000),
  );

  const circuitFailureThreshold = toPositiveInt(
    options.circuitFailureThreshold,
    toPositiveInt(process.env.RELIABILITY_CIRCUIT_FAILURE_THRESHOLD, 5),
  );
  const circuitOpenMs = toPositiveInt(
    options.circuitOpenMs,
    toPositiveInt(process.env.RELIABILITY_CIRCUIT_OPEN_MS, 30_000),
  );

  const classifyError =
    typeof options.classifyError === 'function' ? options.classifyError : defaultClassifyError;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      beforeCircuitAttempt(key, circuitOpenMs);
      await acquireRateLimitSlot(key, {
        max: rateLimitMax,
        windowMs: rateLimitWindowMs,
      });

      const result = await runWithTimeout(
        executor,
        options.timeoutMs || process.env.RELIABILITY_TIMEOUT_MS || 20_000,
        options.signal,
        attempt,
      );

      markCircuitSuccess(key);
      return result;
    } catch (err) {
      lastError = err;
      const classification = classifyError(err) || { retryable: false };
      const retryable = classification.retryable === true;

      err.retryable = retryable;
      if (!err.status && classification.status) err.status = classification.status;
      if (!err.code && classification.code) err.code = classification.code;
      err.reliability = {
        provider: String(options.provider || '').toUpperCase() || 'UNKNOWN',
        connectionKey: String(options.connectionKey || 'default'),
        key,
        attempt,
        maxAttempts,
        retryable,
      };

      markCircuitFailure(key, {
        threshold: circuitFailureThreshold,
      });

      if (!retryable || attempt >= maxAttempts) {
        throw err;
      }

      await trackRetry(options.runId || null);
      if (typeof options.onRetry === 'function') {
        await options.onRetry({ attempt, key, error: err, classification });
      }

      const expBackoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * Math.max(1, jitterMs));
      // eslint-disable-next-line no-await-in-loop
      await sleep(expBackoff + jitter);
    }
  }

  throw lastError;
}

module.exports = {
  executeWithReliability,
  defaultClassifyError,
  _internals: {
    RATE_LIMIT_STATE,
    CIRCUIT_STATE,
    normalizeKey,
    acquireRateLimitSlot,
    beforeCircuitAttempt,
    markCircuitSuccess,
    markCircuitFailure,
  },
};
