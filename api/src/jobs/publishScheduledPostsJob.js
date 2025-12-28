const { prisma } = require('../prisma');
const { publishPost } = require('../services/postPublisher');

const BATCH_SIZE = Number(process.env.POST_PUBLISH_BATCH_SIZE) || 5;

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  console.log('[publishScheduledPostsJob]', ...args);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function pollOnce() {
  const now = new Date();

  const posts = await prisma.post.findMany({
    where: {
      status: { in: ['SCHEDULED', 'APPROVED'] },
      scheduledDate: { lte: now },
    },
    orderBy: { scheduledDate: 'asc' },
    take: BATCH_SIZE,
  });

  if (!posts.length) {
    return { ok: true, processed: 0 };
  }

  let processed = 0;
  let published = 0;
  let failed = 0;

  for (const post of posts) {
    processed += 1;
    try {
      const result = await publishPost(post);
      const metadata = isPlainObject(post.metadata) ? { ...post.metadata } : {};

      metadata.publish = {
        provider: result.provider,
        platform: result.platform,
        externalId: result.externalId || null,
        publishedAt: now.toISOString(),
      };

      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'PUBLISHED',
          publishedDate: now,
          externalId: result.externalId || post.externalId || null,
          metadata,
        },
      });

      published += 1;
      safeLog('post published', post.id, result.platform);
    } catch (err) {
      failed += 1;
      const metadata = isPlainObject(post.metadata) ? { ...post.metadata } : {};
      metadata.publishError = {
        message: err?.message || 'Publish failed',
        at: now.toISOString(),
      };

      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'FAILED',
          metadata,
        },
      });

      safeLog('post publish failed', post.id, err?.message || err);
    }
  }

  return { ok: true, processed, published, failed };
}

module.exports = {
  pollOnce,
};
