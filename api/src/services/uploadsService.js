// api/src/services/uploadsService.js
// Serviço de upload com suporte a S3/Spaces e fallback automático para storage local.

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");

let provider =
  (process.env.STORAGE_PROVIDER ||
    (process.env.S3_BUCKET ? "s3" : "local")).toLowerCase();

const S3_ENDPOINT = process.env.S3_ENDPOINT || null;
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || "";
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || "";
const UPLOADS_PUBLIC = (process.env.UPLOADS_PUBLIC || "false") === "true";

const LOCAL_UPLOADS_DIR =
  process.env.LOCAL_UPLOADS_DIR ||
  path.join(__dirname, "../../storage/uploads");
const PUBLIC_API_URL =
  process.env.UPLOADS_BASE_URL ||
  process.env.API_PUBLIC_URL ||
  process.env.API_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "";

// AWS SDK (carregado apenas quando necessário)
let S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  getSignedUrl,
  s3Client;

if (provider === "s3") {
  try {
    ({
      S3Client,
      PutObjectCommand,
      DeleteObjectCommand,
      HeadObjectCommand,
      ListObjectsV2Command,
      GetObjectCommand,
    } = require("@aws-sdk/client-s3"));
    ({ getSignedUrl } = require("@aws-sdk/s3-request-presigner"));
  } catch (err) {
    console.error(
      "AWS SDK não encontrado, trocando para storage local:",
      err.message
    );
    provider = "local";
  }
}

if (provider === "s3" && !S3_BUCKET) {
  console.warn(
    "S3_BUCKET não configurado. Usando storage local até que a configuração seja feita."
  );
  provider = "local";
}

if (provider === "s3") {
  s3Client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: !!S3_ENDPOINT,
  });
} else {
  if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
    fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
  }
}

const DIRECT_UPLOAD_SUPPORTED = provider === "s3";

function randomFileName(originalName) {
  const ext = path.extname(originalName || "") || "";
  const id = crypto.randomBytes(10).toString("hex");
  const safeName = (originalName || "file")
    .replace(/[^a-zA-Z0-9_.-]/g, "-")
    .slice(0, 50);
  return `${Date.now()}-${id}-${safeName}${ext}`;
}

function sanitizeKey(inputKey) {
  return (inputKey || "")
    .replace(/\\/g, "/")
    .replace(/\.\./g, "")
    .replace(/^\/+/, "");
}

function buildLocalUrl(key) {
  const normalized = sanitizeKey(key)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  if (PUBLIC_API_URL) {
    return `${PUBLIC_API_URL.replace(/\/$/, "")}/uploads/${normalized}`;
  }
  return `/uploads/${normalized}`;
}

async function ensureLocalPath(fileKey) {
  const sanitized = sanitizeKey(fileKey);
  const fullPath = path.join(LOCAL_UPLOADS_DIR, sanitized);
  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  return fullPath;
}

async function localUpload(body, originalName = "file", contentType, opts = {}) {
  const key = sanitizeKey(opts.key || randomFileName(originalName));
  const fullPath = await ensureLocalPath(key);
  await fsp.writeFile(fullPath, body);
  return { key, url: buildLocalUrl(key) };
}

async function localUploadFromPath(filePath, originalName = "file", opts = {}) {
  const key = sanitizeKey(opts.key || randomFileName(originalName));
  const fullPath = await ensureLocalPath(key);
  try {
    await fsp.rename(filePath, fullPath);
  } catch (err) {
    if (err.code === "EXDEV") {
      await fsp.copyFile(filePath, fullPath);
      await fsp.unlink(filePath);
    } else {
      throw err;
    }
  }
  return { key, url: buildLocalUrl(key) };
}

async function localDelete(key) {
  const fullPath = path.join(LOCAL_UPLOADS_DIR, sanitizeKey(key));
  try {
    await fsp.unlink(fullPath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return true;
}

async function localGetUrl(key) {
  const fullPath = path.join(LOCAL_UPLOADS_DIR, sanitizeKey(key));
  await fsp.access(fullPath);
  return buildLocalUrl(key);
}

async function localListObjects(prefix = "", limit = 100) {
  const startPath = path.join(
    LOCAL_UPLOADS_DIR,
    sanitizeKey(prefix || "").replace(/\/$/, "")
  );
  const items = [];

  async function walk(absPath, relPath) {
    if (items.length >= limit) return;
    let entries;
    try {
      entries = await fsp.readdir(absPath, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return;
      throw err;
    }

    for (const entry of entries) {
      if (items.length >= limit) break;
      const childAbs = path.join(absPath, entry.name);
      const prefixClean = relPath ? relPath.replace(/\/+$/, "") : "";
      const childRel = prefixClean ? `${prefixClean}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(childAbs, childRel);
      } else {
        const stats = await fsp.stat(childAbs);
        items.push({
          key: sanitizeKey(childRel),
          size: stats.size,
          lastModified: stats.mtime,
          storageClass: "LOCAL",
        });
      }
    }
  }

  await walk(startPath, sanitizeKey(prefix || ""));
  return items.slice(0, limit);
}

async function localPresign(originalName = "file") {
  const key = sanitizeKey(randomFileName(originalName));
  return { key, url: buildLocalUrl(key), expiresIn: 0 };
}

module.exports = {
  async uploadBuffer(
    body,
    originalName = "file",
    contentType = "application/octet-stream",
    opts = {}
  ) {
    if (provider === "s3") {
      const key = opts.key || randomFileName(originalName);
      const acl = opts.acl || (UPLOADS_PUBLIC ? "public-read" : "private");

      const params = {
        Bucket: S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: acl === "public-read" ? "public-read" : undefined,
        Metadata: opts.metadata || undefined,
      };

      await s3Client.send(new PutObjectCommand(params));

      if (UPLOADS_PUBLIC && S3_ENDPOINT) {
        const publicUrl = `${S3_ENDPOINT.replace(/\/$/, "")}/${S3_BUCKET}/${encodeURIComponent(
          key
        )}`;
        return { key, url: publicUrl };
      }

      const signedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        }),
        { expiresIn: 60 * 60 * 24 * 30 }
      );

      return { key, url: signedUrl };
    }

    return localUpload(body, originalName, contentType, opts);
  },

  async uploadFilePath(
    filePath,
    originalName = "file",
    contentType = "application/octet-stream",
    opts = {}
  ) {
    if (!filePath) {
      throw new Error("filePath obrigatório");
    }

    if (provider === "s3") {
      const key = opts.key || randomFileName(originalName);
      const acl = opts.acl || (UPLOADS_PUBLIC ? "public-read" : "private");

      const stream = fs.createReadStream(filePath);
      const params = {
        Bucket: S3_BUCKET,
        Key: key,
        Body: stream,
        ContentType: contentType,
        ACL: acl === "public-read" ? "public-read" : undefined,
        Metadata: opts.metadata || undefined,
      };

      await s3Client.send(new PutObjectCommand(params));
      try {
        await fsp.unlink(filePath);
      } catch (_) {}

      if (UPLOADS_PUBLIC && S3_ENDPOINT) {
        const publicUrl = `${S3_ENDPOINT.replace(/\/$/, "")}/${S3_BUCKET}/${encodeURIComponent(
          key
        )}`;
        return { key, url: publicUrl };
      }

      const signedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        }),
        { expiresIn: 60 * 60 * 24 * 30 }
      );

      return { key, url: signedUrl };
    }

    return localUploadFromPath(filePath, originalName, opts);
  },

  async createPresignedUpload(opts = {}) {
    const {
      key: providedKey,
      originalName = "file",
      contentType = "application/octet-stream",
      expiresIn = 60 * 15,
      acl,
    } = opts || {};

    if (!DIRECT_UPLOAD_SUPPORTED) {
      throw new Error("Direct uploads are not supported for the current provider");
    }

    const key = sanitizeKey(providedKey || randomFileName(originalName));
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: acl === "public-read" || UPLOADS_PUBLIC ? "public-read" : undefined,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return {
      key,
      url,
      expiresIn,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
      },
    };
  },

  async deleteObject(key) {
    if (provider === "s3") {
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })
      );
      return true;
    }
    return localDelete(key);
  },

  async getUrlForKey(key, expiresIn = 60 * 60) {
    if (provider === "s3") {
      if (UPLOADS_PUBLIC && S3_ENDPOINT) {
        return `${S3_ENDPOINT.replace(/\/$/, "")}/${S3_BUCKET}/${encodeURIComponent(
          key
        )}`;
      }
      try {
        await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      } catch (err) {
        throw new Error("Object not found");
      }
      return await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
        { expiresIn }
      );
    }
    return localGetUrl(key);
  },

  async listObjects(prefix = "", limit = 100) {
    if (provider === "s3") {
      const command = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
        MaxKeys: limit,
      });
      const res = await s3Client.send(command);
      return (res.Contents || []).map((obj) => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        storageClass: obj.StorageClass,
      }));
    }
    return localListObjects(prefix, limit);
  },

  supportsDirectUpload() {
    return DIRECT_UPLOAD_SUPPORTED;
  },
};
