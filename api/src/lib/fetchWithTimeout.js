const DEFAULT_FETCH_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.FETCH_TIMEOUT_MS || 20_000),
);

function buildTimeoutError(message, {
  code = 'HTTP_TIMEOUT',
  status = 504,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  details = null,
} = {}) {
  const err = new Error(message || 'Request timeout');
  err.code = code;
  err.status = status;
  err.timeoutMs = timeoutMs;
  if (details) err.details = details;
  return err;
}

function isTimeoutError(error) {
  return Boolean(
    error?.code === 'HTTP_TIMEOUT' ||
    error?.code === 'ABORT_ERR_TIMEOUT' ||
    error?.name === 'TimeoutError',
  );
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const effectiveTimeout = Math.max(1, Number(timeoutMs) || DEFAULT_FETCH_TIMEOUT_MS);
  const controller = new AbortController();
  let didTimeout = false;

  const externalSignal = options?.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timeoutHandle = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, effectiveTimeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout) {
      throw buildTimeoutError('Request timeout', {
        timeoutMs: effectiveTimeout,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

module.exports = {
  DEFAULT_FETCH_TIMEOUT_MS,
  buildTimeoutError,
  fetchWithTimeout,
  isTimeoutError,
};
