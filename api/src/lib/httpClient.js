const { executeWithReliability, defaultClassifyError } = require('./reliability');

const DEFAULT_RETRY_STATUSES = [408, 409, 425, 429, 500, 502, 503, 504];

function toPositiveInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

function toNullableInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
}

function parseRetryStatuses(input) {
  if (Array.isArray(input) && input.length) {
    return input
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 100);
  }
  return [...DEFAULT_RETRY_STATUSES];
}

async function safeReadBody(response) {
  try {
    return await response.text();
  } catch (_err) {
    return '';
  }
}

function buildHttpError({
  url,
  method,
  status,
  statusText,
  body,
  retryStatuses,
}) {
  const message = `HTTP ${status}${statusText ? ` ${statusText}` : ''}`.trim();
  const err = new Error(message);
  err.name = 'HttpError';
  err.code = `HTTP_${status}`;
  err.status = status;
  err.url = url;
  err.method = method;
  err.responseBody = body || '';
  err.isHttpError = true;
  err.retryable = retryStatuses.includes(Number(status));
  return err;
}

function getProviderPrefix(provider) {
  return String(provider || 'HTTP').trim().toUpperCase() || 'HTTP';
}

function resolveReliabilityOptions(options = {}) {
  const providerPrefix = getProviderPrefix(options.provider);

  const timeoutMs =
    toNullableInt(options.timeoutMs) ||
    toNullableInt(process.env[`${providerPrefix}_HTTP_TIMEOUT_MS`]) ||
    toPositiveInt(process.env.RELIABILITY_TIMEOUT_MS, 20_000);

  const maxAttempts =
    toNullableInt(options.maxAttempts) ||
    toNullableInt(process.env[`${providerPrefix}_HTTP_MAX_ATTEMPTS`]) ||
    toPositiveInt(process.env.RELIABILITY_MAX_ATTEMPTS, 3);

  const baseDelayMs =
    toNullableInt(options.baseDelayMs) ||
    toNullableInt(process.env[`${providerPrefix}_HTTP_RETRY_DELAY_MS`]) ||
    toPositiveInt(process.env.RELIABILITY_BASE_DELAY_MS, 250);

  const maxDelayMs =
    toNullableInt(options.maxDelayMs) ||
    toNullableInt(process.env[`${providerPrefix}_HTTP_MAX_DELAY_MS`]) ||
    toPositiveInt(process.env.RELIABILITY_MAX_DELAY_MS, 5_000);

  const jitterMs =
    toNullableInt(options.jitterMs) ||
    toNullableInt(process.env[`${providerPrefix}_HTTP_RETRY_JITTER_MS`]) ||
    toPositiveInt(process.env.RELIABILITY_JITTER_MS, 250);

  const rateLimitMax =
    toNullableInt(options.rateLimitMax) ||
    toNullableInt(process.env[`${providerPrefix}_RATE_LIMIT_MAX`]) ||
    toPositiveInt(process.env.RELIABILITY_RATE_LIMIT_MAX, 60);

  const rateLimitWindowMs =
    toNullableInt(options.rateLimitWindowMs) ||
    toNullableInt(process.env[`${providerPrefix}_RATE_LIMIT_WINDOW_MS`]) ||
    toPositiveInt(process.env.RELIABILITY_RATE_LIMIT_WINDOW_MS, 60_000);

  const circuitFailureThreshold =
    toNullableInt(options.circuitFailureThreshold) ||
    toNullableInt(process.env[`${providerPrefix}_CIRCUIT_FAILURE_THRESHOLD`]) ||
    toPositiveInt(process.env.RELIABILITY_CIRCUIT_FAILURE_THRESHOLD, 5);

  const circuitOpenMs =
    toNullableInt(options.circuitOpenMs) ||
    toNullableInt(process.env[`${providerPrefix}_CIRCUIT_OPEN_MS`]) ||
    toPositiveInt(process.env.RELIABILITY_CIRCUIT_OPEN_MS, 30_000);

  return {
    timeoutMs,
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    jitterMs,
    rateLimitMax,
    rateLimitWindowMs,
    circuitFailureThreshold,
    circuitOpenMs,
  };
}

async function request(url, fetchOptions = {}, options = {}) {
  const method = String(fetchOptions.method || 'GET').toUpperCase();
  const throwOnHttpError = options.throwOnHttpError !== false;
  const responseType = options.responseType || 'json';
  const retryStatuses = parseRetryStatuses(options.retryOnStatuses);

  const reliabilityOptions = resolveReliabilityOptions(options);
  const classifyError = (error) => {
    if (error?.isHttpError) {
      const status = Number(error.status) || null;
      return {
        retryable: status ? retryStatuses.includes(status) : false,
        status,
        code: error.code || null,
      };
    }
    return defaultClassifyError(error);
  };

  const response = await executeWithReliability(
    {
      provider: options.provider || 'HTTP',
      connectionKey: options.connectionKey || 'default',
      runId: options.runId || null,
      timeoutMs: reliabilityOptions.timeoutMs,
      maxAttempts: reliabilityOptions.maxAttempts,
      baseDelayMs: reliabilityOptions.baseDelayMs,
      maxDelayMs: reliabilityOptions.maxDelayMs,
      jitterMs: reliabilityOptions.jitterMs,
      rateLimitMax: reliabilityOptions.rateLimitMax,
      rateLimitWindowMs: reliabilityOptions.rateLimitWindowMs,
      circuitFailureThreshold: reliabilityOptions.circuitFailureThreshold,
      circuitOpenMs: reliabilityOptions.circuitOpenMs,
      classifyError,
      signal: options.signal,
      onRetry: options.onRetry,
    },
    async ({ signal }) => {
      /* eslint-disable no-undef */
      const res = await fetch(url, {
        ...fetchOptions,
        method,
        signal,
      });

      if (throwOnHttpError && !res.ok) {
        const body = await safeReadBody(res);
        throw buildHttpError({
          url,
          method,
          status: res.status,
          statusText: res.statusText,
          body,
          retryStatuses,
        });
      }

      return res;
    },
  );

  if (responseType === 'response') {
    return response;
  }

  const rawText = await safeReadBody(response);

  if (responseType === 'text') {
    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      data: rawText,
      rawText,
    };
  }

  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch (_err) {
      data = null;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    data,
    rawText,
  };
}

async function requestJson(url, fetchOptions = {}, options = {}) {
  return request(url, fetchOptions, {
    ...options,
    responseType: 'json',
  });
}

async function requestText(url, fetchOptions = {}, options = {}) {
  return request(url, fetchOptions, {
    ...options,
    responseType: 'text',
  });
}

module.exports = {
  request,
  requestJson,
  requestText,
  DEFAULT_RETRY_STATUSES,
};
