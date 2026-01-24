const Redis = require('ioredis');
const crypto = require('crypto');

const redisDisabled =
  process.env.REDIS_DISABLED === 'true' || process.env.NODE_ENV === 'test';

const DEFAULT_TTL_SECONDS =
  Number(process.env.REPORTING_CACHE_TTL_SECONDS) || 3600;
const REPORT_SNAPSHOT_TTL_SECONDS =
  Number(process.env.REPORTING_SNAPSHOT_TTL_SECONDS) || 86400;

const TTL_BY_SOURCE = {
  META_ADS: Number(process.env.REPORTING_TTL_META_ADS) || DEFAULT_TTL_SECONDS,
  GOOGLE_ADS: Number(process.env.REPORTING_TTL_GOOGLE_ADS) || DEFAULT_TTL_SECONDS,
  TIKTOK_ADS: Number(process.env.REPORTING_TTL_TIKTOK_ADS) || DEFAULT_TTL_SECONDS,
  LINKEDIN_ADS: Number(process.env.REPORTING_TTL_LINKEDIN_ADS) || DEFAULT_TTL_SECONDS,
  GA4: Number(process.env.REPORTING_TTL_GA4) || DEFAULT_TTL_SECONDS,
  GBP: Number(process.env.REPORTING_TTL_GBP) || DEFAULT_TTL_SECONDS,
  META_SOCIAL: Number(process.env.REPORTING_TTL_META_SOCIAL) || DEFAULT_TTL_SECONDS,
};

let redisClient;

function getRedisClient() {
  if (redisDisabled) return null;
  if (!redisClient) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(url);
  }
  return redisClient;
}

function normalizeDateKey(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return String(value);
}

function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => String(item))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
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
  const raw = stableStringify(value);
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

function buildMetricsCacheKey({
  tenantId,
  source,
  connectionId,
  dateFrom,
  dateTo,
  level,
  breakdown,
  metrics,
  filters,
  options,
  widgetType,
}) {
  const metricsHash = hashValue(normalizeList(metrics));
  const filtersHash = hashValue(filters || {});
  const optionsHash = hashValue(options || {});
  const dateFromKey = normalizeDateKey(dateFrom);
  const dateToKey = normalizeDateKey(dateTo);
  const levelKey = level ? String(level) : 'all';
  const breakdownKey = breakdown ? String(breakdown) : 'none';
  const widgetTypeKey = widgetType ? String(widgetType) : 'any';
  return [
    'metrics',
    tenantId || 'unknown',
    source || 'unknown',
    connectionId || 'none',
    dateFromKey || 'start',
    dateToKey || 'end',
    levelKey,
    breakdownKey,
    widgetTypeKey,
    metricsHash,
    filtersHash,
    optionsHash,
  ].join(':');
}

function buildReportSnapshotKey(tenantId, reportId, widgetId) {
  return ['report_snapshot', tenantId || 'unknown', reportId, widgetId]
    .filter(Boolean)
    .join(':');
}

async function getCachedValue(key) {
  const client = getRedisClient();
  if (!client || !key) return null;
  const raw = await client.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function setCachedValue(key, value, ttlSeconds) {
  const client = getRedisClient();
  if (!client || !key) return null;
  const payload = JSON.stringify(value ?? {});
  const ttl = Number(ttlSeconds) || null;
  if (ttl && ttl > 0) {
    return client.set(key, payload, 'EX', ttl);
  }
  return client.set(key, payload);
}

function getTtlForSource(source) {
  if (!source) return DEFAULT_TTL_SECONDS;
  return TTL_BY_SOURCE[source] || DEFAULT_TTL_SECONDS;
}

async function getMetricsCache(key) {
  return getCachedValue(key);
}

async function setMetricsCache(key, value, ttlSeconds) {
  return setCachedValue(key, value, ttlSeconds);
}

async function getReportSnapshot(key) {
  return getCachedValue(key);
}

async function setReportSnapshot(key, value) {
  return setCachedValue(key, value, REPORT_SNAPSHOT_TTL_SECONDS);
}

module.exports = {
  getRedisClient,
  normalizeDateKey,
  buildMetricsCacheKey,
  buildReportSnapshotKey,
  getMetricsCache,
  setMetricsCache,
  getReportSnapshot,
  setReportSnapshot,
  getTtlForSource,
  hashValue,
  normalizeList,
  stableStringify,
};
