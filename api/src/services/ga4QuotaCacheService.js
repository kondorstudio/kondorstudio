const crypto = require('crypto');
const Redis = require('ioredis');

const CACHE_DISABLED = process.env.GA4_CACHE_DISABLED === 'true';
const REDIS_DISABLED =
  process.env.GA4_REDIS_DISABLED === 'true' ||
  process.env.REDIS_DISABLED === 'true' ||
  process.env.NODE_ENV === 'test';
const DEFAULT_TTL_MS = Number(process.env.GA4_CACHE_TTL_MS || 120000);
const METADATA_TTL_MS = Number(process.env.GA4_METADATA_TTL_MS || 24 * 60 * 60 * 1000);
const MAX_CONCURRENT = Number(process.env.GA4_MAX_CONCURRENT || 5);
const RATE_WINDOW_MS = Number(process.env.GA4_RATE_LIMIT_WINDOW_MS || 60000);
const RATE_MAX = Number(process.env.GA4_RATE_LIMIT_MAX || 60);
const CONCURRENCY_TTL_MS = Number(process.env.GA4_CONCURRENCY_TTL_MS || 30000);
const CONCURRENCY_WAIT_MS = Number(process.env.GA4_CONCURRENCY_WAIT_MS || 200);
const CLEANUP_INTERVAL_MS = Number(process.env.GA4_CACHE_CLEANUP_MS || 300000);
const QUEUE_IDLE_TTL_MS = Number(process.env.GA4_QUEUE_IDLE_TTL_MS || 600000);

const memoryCache = new Map();
const propertyQueues = new Map();
const rateCounters = new Map();
let redisClient;

function getRedisClient() {
  if (REDIS_DISABLED) return null;
  if (!redisClient) {
    const url = process.env.GA4_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(url);
  }
  return redisClient;
}

function stableStringify(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `"${key}":${stableStringify(value[key])}`).join(',')}}`;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16);
}

function buildCacheKey({ tenantId, propertyId, payload, kind }) {
  const hash = hashValue(payload || {});
  return ['ga4', kind || 'report', tenantId || 'unknown', propertyId || 'unknown', hash].join(':');
}

async function getCache(key) {
  if (CACHE_DISABLED || !key) return null;
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) return JSON.parse(raw);
    } catch (_) {
      // fallback to memory cache
    }
  }

  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

async function setCache(key, value, ttlMs = DEFAULT_TTL_MS) {
  if (CACHE_DISABLED || !key) return null;
  const ttl = Number(ttlMs) || 0;
  const expiresAt = ttl > 0 ? Date.now() + ttl : null;
  memoryCache.set(key, { value, expiresAt });

  const redis = getRedisClient();
  if (redis) {
    try {
      const payload = JSON.stringify(value ?? {});
      if (ttl > 0) {
        await redis.set(key, payload, 'PX', ttl);
      } else {
        await redis.set(key, payload);
      }
    } catch (_) {
      // ignore redis errors and rely on memory cache
    }
  }

  return value;
}

async function getMetadataCache(key) {
  return getCache(key);
}

async function setMetadataCache(key, value) {
  return setCache(key, value, METADATA_TTL_MS);
}

function getQueueState(propertyId) {
  const key = propertyId || 'global';
  if (!propertyQueues.has(key)) {
    propertyQueues.set(key, { active: 0, queue: [], lastUsedAt: Date.now() });
  }
  const state = propertyQueues.get(key);
  state.lastUsedAt = Date.now();
  return state;
}

async function withPropertyLimit(propertyId, task) {
  if (!MAX_CONCURRENT || MAX_CONCURRENT <= 0) {
    return task();
  }

  const redis = getRedisClient();
  if (redis) {
    try {
      const key = `ga4:concurrency:${propertyId || 'global'}`;
      while (true) {
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.pexpire(key, CONCURRENCY_TTL_MS);
        }
        if (count <= MAX_CONCURRENT) {
          try {
            return await task();
          } finally {
            const nextCount = await redis.decr(key);
            if (nextCount <= 0) {
              await redis.del(key);
            }
          }
        }
        await redis.decr(key);
        await new Promise((resolve) => setTimeout(resolve, CONCURRENCY_WAIT_MS));
      }
    } catch (_) {
      // fallback to in-memory limiter
    }
  }

  const state = getQueueState(propertyId);

  if (state.active >= MAX_CONCURRENT) {
    await new Promise((resolve) => state.queue.push(resolve));
  }

  state.active += 1;
  try {
    return await task();
  } finally {
    state.active = Math.max(0, state.active - 1);
    const next = state.queue.shift();
    if (next) next();
  }
}

async function assertWithinRateLimit(key) {
  if (!RATE_MAX || RATE_MAX <= 0) return;
  const redis = getRedisClient();
  if (redis) {
    try {
      const rateKey = `ga4:rate:${key}`;
      const count = await redis.incr(rateKey);
      if (count === 1) {
        await redis.pexpire(rateKey, RATE_WINDOW_MS);
      }
      if (count > RATE_MAX) {
        const err = new Error('GA4 rate limit exceeded');
        err.status = 429;
        err.code = 'GA4_RATE_LIMIT';
        throw err;
      }
      return;
    } catch (_) {
      // fallback to in-memory limiter
    }
  }

  const now = Date.now();
  const entry = rateCounters.get(key);
  if (!entry || entry.resetAt <= now) {
    rateCounters.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  if (entry.count >= RATE_MAX) {
    const err = new Error('GA4 rate limit exceeded');
    err.status = 429;
    err.code = 'GA4_RATE_LIMIT';
    throw err;
  }
  entry.count += 1;
}

function cleanupMemoryCaches() {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt && entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }

  for (const [key, entry] of rateCounters.entries()) {
    if (entry.resetAt && entry.resetAt <= now) {
      rateCounters.delete(key);
    }
  }

  for (const [key, state] of propertyQueues.entries()) {
    const idleFor = now - (state.lastUsedAt || 0);
    if (state.active === 0 && (!state.queue || state.queue.length === 0) && idleFor > QUEUE_IDLE_TTL_MS) {
      propertyQueues.delete(key);
    }
  }
}

if (process.env.NODE_ENV !== 'test' && CLEANUP_INTERVAL_MS > 0) {
  const timer = setInterval(cleanupMemoryCaches, CLEANUP_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = {
  buildCacheKey,
  getCache,
  setCache,
  getMetadataCache,
  setMetadataCache,
  withPropertyLimit,
  assertWithinRateLimit,
  stableStringify,
  hashValue,
};
