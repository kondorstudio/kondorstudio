const { prisma } = require('../prisma');
const { publishPost } = require('../services/postPublisher');

const BATCH_SIZE = Number(process.env.POST_PUBLISH_BATCH_SIZE) || 5;
const LOCK_TTL_MINUTES = Number(process.env.POST_PUBLISH_LOCK_TTL_MINUTES || 15);

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  console.log('[publishScheduledPostsJob]', ...args);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function pollOnce() {
  const now = new Date();

  const lockTtlSeconds = Math.max(60, Math.floor(LOCK_TTL_MINUTES * 60));

  const posts = await prisma.$queryRaw`
    WITH candidates AS (
      SELECT id
      FROM "posts"
      WHERE status IN ('SCHEDULED','APPROVED')
        AND "scheduledDate" <= NOW()
        AND (
          ("metadata"->>'publishLockAt') IS NULL
          OR ("metadata"->>'publishLockAt')::timestamptz < NOW() - (${lockTtlSeconds} || ' seconds')::interval
        )
      ORDER BY "scheduledDate" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${BATCH_SIZE}
    )
    UPDATE "posts"
    SET "metadata" = jsonb_set(
      COALESCE("metadata", '{}'::jsonb),
      '{publishLockAt}',
      to_jsonb(NOW()::timestamptz),
      true
    )
    FROM candidates
    WHERE "posts"."id" = candidates.id
    RETURNING "posts".*;
  `;

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
      metadata.workflowStatus = 'DONE';

      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'PUBLISHED',
          publishedDate: now,
          externalId: result.externalId || post.externalId || null,
          metadata: {
            ...metadata,
            publishLockAt: null,
          },
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
      metadata.workflowStatus = 'FAILED';

      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'FAILED',
          metadata: {
            ...metadata,
            publishLockAt: null,
          },
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
