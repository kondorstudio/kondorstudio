// api/src/services/uploadsService.js
// Serviço de upload para S3 / DigitalOcean Spaces / S3-compatible storages
// Requer AWS SDK v3: @aws-sdk/client-s3 e @aws-sdk/s3-request-presigner
// Variáveis de ambiente esperadas:
//   STORAGE_PROVIDER = "s3" (placeholder)
//   S3_ENDPOINT (opcional, ex: https://nyc3.digitaloceanspaces.com)
//   S3_REGION
//   S3_BUCKET
//   S3_ACCESS_KEY_ID
//   S3_SECRET_ACCESS_KEY
//   UPLOADS_PUBLIC = "true" ou "false" (se true, objetos são públicos)

const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 's3';
const S3_ENDPOINT = process.env.S3_ENDPOINT || null;
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || '';
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || '';
const UPLOADS_PUBLIC = (process.env.UPLOADS_PUBLIC || 'false') === 'true';

if (!S3_BUCKET) {
  console.warn('Warning: S3_BUCKET not configured. Uploads service will fail until configured.');
}

// Setup S3 client
const s3Client = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT || undefined,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: !!S3_ENDPOINT, // useful for some S3-compatible providers
});

function randomFileName(originalName) {
  const ext = path.extname(originalName || '') || '';
  const id = crypto.randomBytes(10).toString('hex');
  const safeName = (originalName || 'file').replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 50);
  return `${Date.now()}-${id}-${safeName}${ext}`;
}

module.exports = {
  /**
   * Upload buffer stream to S3.
   * @param {Buffer|Uint8Array|Readable} body
   * @param {string} key (optional) - if omitted, generated automatically
   * @param {string} contentType
   * @param {object} opts - { acl: 'public-read' | 'private', metadata: {} }
   */
  async uploadBuffer(body, originalName = 'file', contentType = 'application/octet-stream', opts = {}) {
    if (!S3_BUCKET) throw new Error('S3 bucket not configured');

    const key = opts.key || randomFileName(originalName);
    const acl = opts.acl || (UPLOADS_PUBLIC ? 'public-read' : 'private');

    const params = {
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: acl === 'public-read' ? 'public-read' : undefined,
      Metadata: opts.metadata || undefined,
    };

    await s3Client.send(new PutObjectCommand(params));

    // If public, return public URL (endpoint + bucket + key) or S3 URL
    if (UPLOADS_PUBLIC && S3_ENDPOINT) {
      // For Spaces: endpoint already contains region host
      const publicUrl = `${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}/${encodeURIComponent(key)}`;
      return { key, url: publicUrl };
    }

    // Else, return key and signed URL
    const signedUrl = await getSignedUrl(s3Client, new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }), { expiresIn: 60 * 60 }); // 1h signed URL (for reference)

    return { key, url: signedUrl };
  },

  /**
   * Generate a presigned PUT URL for direct client upload (recommended for large files)
   * returns { url, key, expiresIn }
   */
  async createPresignedUpload(originalName = 'file', contentType = 'application/octet-stream', expiresIn = 60 * 15 /* 15 min */) {
    if (!S3_BUCKET) throw new Error('S3 bucket not configured');

    const key = randomFileName(originalName);
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: UPLOADS_PUBLIC ? 'public-read' : undefined,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return { key, url, expiresIn };
  },

  /**
   * Delete object by key
   */
  async deleteObject(key) {
    if (!S3_BUCKET) throw new Error('S3 bucket not configured');
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  },

  /**
   * Get public or signed URL for a key
   */
  async getUrlForKey(key, expiresIn = 60 * 60) {
    if (!S3_BUCKET) throw new Error('S3 bucket not configured');
    if (UPLOADS_PUBLIC && S3_ENDPOINT) {
      return `${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}/${encodeURIComponent(key)}`;
    }
    // try HEAD to ensure object exists
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    } catch (err) {
      throw new Error('Object not found');
    }
    const command = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key });
    // use GetSignedUrl but GetObjectCommand would be more appropriate:
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    return await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn });
  },

  /**
   * List objects under a prefix
   */
  async listObjects(prefix = '', limit = 100) {
    if (!S3_BUCKET) throw new Error('S3 bucket not configured');
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      MaxKeys: limit,
    });
    const res = await s3Client.send(command);
    const items = (res.Contents || []).map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
      storageClass: obj.StorageClass,
    }));
    return items;
  },
};
