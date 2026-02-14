// api/src/lib/redisClient.js
// Shared Redis client for API-side throttles/locks (best-effort).
//
// NOTE: queues/workers have their own connections; this is for request handlers.

const Redis = require('ioredis');

const redisDisabled =
  process.env.REDIS_DISABLED === 'true' || process.env.NODE_ENV === 'test';

let redisClient;
let hasLoggedRedisError = false;

function getRedisClient() {
  if (redisDisabled) return null;
  if (!redisClient) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(url);
    redisClient.on('error', (err) => {
      if (hasLoggedRedisError || process.env.NODE_ENV === 'test') return;
      hasLoggedRedisError = true;
      // Avoid crashing the process on Redis connection issues.
      // eslint-disable-next-line no-console
      console.warn('[redisClient] Redis error:', err?.message || err);
    });
  }
  return redisClient;
}

module.exports = {
  getRedisClient,
  redisDisabled,
};

