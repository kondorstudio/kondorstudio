// api/src/queues/index.js
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL);

// Filas principais do sistema
const metricsSyncQueue = new Queue('metrics-sync', { connection });
const reportsQueue = new Queue('reports-generation', { connection });
const whatsappQueue = new Queue('whatsapp-automation', { connection });
const publishingQueue = new Queue('posts-publish', { connection });

module.exports = {
  metricsSyncQueue,
  reportsQueue,
  whatsappQueue,
  publishingQueue,
};
