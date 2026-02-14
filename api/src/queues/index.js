// api/src/queues/index.js
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redisDisabled = process.env.REDIS_DISABLED === 'true' || process.env.NODE_ENV === 'test';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = redisDisabled
  ? null
  : new Redis(REDIS_URL, { maxRetriesPerRequest: null });
let hasLoggedRedisError = false;
if (connection) {
  connection.on('error', (err) => {
    if (hasLoggedRedisError || process.env.NODE_ENV === 'test') return;
    hasLoggedRedisError = true;
    // eslint-disable-next-line no-console
    console.warn('[queues] Redis error:', err?.message || err);
  });
}

const createQueue = (name) => (redisDisabled ? null : new Queue(name, { connection }));

// Filas principais do sistema
const metricsSyncQueue = createQueue('metrics-sync');
const reportsQueue = createQueue('reports-generation');
const whatsappQueue = createQueue('whatsapp-automation');
const publishingQueue = createQueue('posts-publish');
const reportGenerateQueue = createQueue('report-generate');
const dashboardRefreshQueue = createQueue('dashboard-refresh');
const reportScheduleQueue = createQueue('report-schedule');
const ga4SyncQueue = createQueue('ga4-sync');

module.exports = {
  metricsSyncQueue,
  reportsQueue,
  whatsappQueue,
  publishingQueue,
  reportGenerateQueue,
  dashboardRefreshQueue,
  reportScheduleQueue,
  ga4SyncQueue,
};
