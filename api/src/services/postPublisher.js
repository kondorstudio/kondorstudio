const { prisma } = require('../prisma');
const metaSocialService = require('./metaSocialService');
const { decrypt } = require('../utils/crypto');

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveAccessToken(integration) {
  if (!integration) return null;
  if (integration.accessTokenEncrypted) {
    try {
      return decrypt(integration.accessTokenEncrypted);
    } catch (_) {
      return null;
    }
  }
  if (integration.accessToken) return integration.accessToken;
  if (isPlainObject(integration.settings) && integration.settings.accessToken) {
    return integration.settings.accessToken;
  }
  if (isPlainObject(integration.settings) && integration.settings.token) {
    return integration.settings.token;
  }
  return null;
}

function resolveIntegrationKind(integration, post) {
  if (integration?.settings?.kind) return integration.settings.kind;
  if (post?.metadata?.integrationKind) return post.metadata.integrationKind;
  if (post?.metadata?.integration_kind) return post.metadata.integration_kind;
  return null;
}

function resolvePlatform(post, kind) {
  if (post?.platform) return post.platform;
  if (kind === 'instagram_only') return 'instagram';
  if (kind === 'tiktok') return 'tiktok';
  if (kind === 'meta_business') return 'meta_business';
  return null;
}

function resolveMediaType(post) {
  const mediaType = post.mediaType || post.media_type || 'image';
  return String(mediaType).toLowerCase();
}

async function publishWithMeta({ post, integration, platform }) {
  const settings = isPlainObject(integration.settings) ? integration.settings : {};
  const baseToken = resolveAccessToken(integration);
  const pageId = settings.pageId || settings.page_id;
  const accessToken = pageId
    ? await metaSocialService.resolvePageAccessToken(pageId, baseToken)
    : baseToken;
  if (!accessToken) {
    throw new Error('Missing Meta access token');
  }

  const mediaUrl = post.mediaUrl;
  const caption = post.caption || post.content || '';
  const mediaType = resolveMediaType(post);

  if (platform === 'facebook') {
    return metaSocialService.publishFacebookPost({
      pageId,
      accessToken,
      mediaUrl,
      caption,
      mediaType,
    });
  }

  const igBusinessId = settings.igBusinessId || settings.ig_business_id || settings.instagramBusinessId;
  return metaSocialService.publishInstagramPost({
    igBusinessId,
    accessToken,
    mediaUrl,
    caption,
    mediaType,
  });
}

async function publishPost(post) {
  if (!post) throw new Error('Post is required');
  if (!post.mediaUrl) throw new Error('Post mediaUrl is required');

  const metadata = isPlainObject(post.metadata) ? post.metadata : {};
  const integrationId =
    metadata.integrationId ||
    metadata.integration_id ||
    post.integrationId ||
    post.integration_id ||
    null;

  if (!integrationId) {
    throw new Error('Missing integrationId for post');
  }

  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId: post.tenantId },
  });

  if (!integration) {
    throw new Error('Integration not found for post');
  }

  if (String(integration.status || '').toUpperCase() !== 'CONNECTED') {
    throw new Error('Integration not connected');
  }

  const kind = resolveIntegrationKind(integration, post);
  const platform = resolvePlatform(post, kind);

  if (kind === 'meta_business' || kind === 'instagram_only' || kind === 'instagram') {
    const effectivePlatform =
      platform === 'facebook' || platform === 'instagram'
        ? platform
        : integration.settings?.igBusinessId
        ? 'instagram'
        : 'facebook';

    const result = await publishWithMeta({ post, integration, platform: effectivePlatform });
    return {
      provider: 'META',
      platform: effectivePlatform,
      externalId: result.externalId || null,
      raw: result.raw || null,
    };
  }

  if (kind === 'tiktok' || integration.provider === 'TIKTOK') {
    throw new Error('TikTok publish not implemented');
  }

  throw new Error('Unsupported integration kind for publishing');
}

module.exports = {
  publishPost,
};
