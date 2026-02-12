#!/usr/bin/env node

const { spawn } = require('child_process');

const DEFAULT_MAX_RETRIES = 8;
const DEFAULT_BASE_DELAY_MS = 3_000;
const DEFAULT_BACKOFF_MULTIPLIER = 1.8;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_CONNECTION_LIMIT = 1;
const DEFAULT_POOL_TIMEOUT = 30;
const DEFAULT_CONNECT_TIMEOUT = 15;

function toInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function toFloat(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function upsertSearchParam(url, key, value) {
  if (!url.searchParams.get(key)) {
    url.searchParams.set(key, String(value));
  }
}

function buildMigrateDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    throw new Error('DATABASE_URL (or PRISMA_MIGRATE_DATABASE_URL) is required');
  }

  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch (err) {
    throw new Error('Invalid DATABASE_URL format');
  }

  const connectionLimit = toInt(
    process.env.PRISMA_MIGRATE_CONNECTION_LIMIT,
    DEFAULT_CONNECTION_LIMIT,
  );
  const poolTimeout = toInt(
    process.env.PRISMA_MIGRATE_POOL_TIMEOUT,
    DEFAULT_POOL_TIMEOUT,
  );
  const connectTimeout = toInt(
    process.env.PRISMA_MIGRATE_CONNECT_TIMEOUT,
    DEFAULT_CONNECT_TIMEOUT,
  );

  upsertSearchParam(parsed, 'connection_limit', connectionLimit);
  upsertSearchParam(parsed, 'pool_timeout', poolTimeout);
  upsertSearchParam(parsed, 'connect_timeout', connectTimeout);

  if (process.env.PRISMA_MIGRATE_PGBOUNCER === 'true') {
    upsertSearchParam(parsed, 'pgbouncer', 'true');
  }

  return parsed.toString();
}

function isRetryableError(output) {
  const text = String(output || '').toLowerCase();
  return (
    text.includes('remaining connection slots are reserved') ||
    text.includes('too many clients already') ||
    text.includes('sorry, too many clients already') ||
    text.includes('too many connections') ||
    text.includes('timeout expired') ||
    text.includes('could not connect to server') ||
    text.includes('connection terminated unexpectedly') ||
    text.includes('schema engine error')
  );
}

function runMigrateOnce(databaseUrl) {
  return new Promise((resolve, reject) => {
    const args = ['prisma', 'migrate', 'deploy'];
    const child = spawn('npx', args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      shell: false,
    });

    let output = '';

    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      output += text;
      process.stderr.write(text);
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const err = new Error(`prisma migrate deploy failed with exit code ${code}`);
      err.code = 'PRISMA_MIGRATE_FAILED';
      err.output = output;
      err.exitCode = code;
      reject(err);
    });
  });
}

async function main() {
  const sourceUrl = process.env.PRISMA_MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  const databaseUrl = buildMigrateDatabaseUrl(sourceUrl);
  const maxRetries = toInt(process.env.PRISMA_MIGRATE_MAX_RETRIES, DEFAULT_MAX_RETRIES);
  const baseDelayMs = toInt(process.env.PRISMA_MIGRATE_RETRY_DELAY_MS, DEFAULT_BASE_DELAY_MS);
  const backoffMultiplier = toFloat(
    process.env.PRISMA_MIGRATE_BACKOFF_MULTIPLIER,
    DEFAULT_BACKOFF_MULTIPLIER,
  );
  const maxDelayMs = toInt(process.env.PRISMA_MIGRATE_MAX_DELAY_MS, DEFAULT_MAX_DELAY_MS);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      console.info(
        `[migrate-safe] attempt ${attempt}/${maxRetries} (connection_limit=${new URL(databaseUrl).searchParams.get('connection_limit')})`,
      );
      await runMigrateOnce(databaseUrl);
      console.info('[migrate-safe] migration deploy completed');
      return;
    } catch (err) {
      const output = String(err?.output || err?.message || '');
      const retryable = isRetryableError(output);
      const isLast = attempt >= maxRetries;

      if (!retryable || isLast) {
        throw err;
      }

      const waitMs = Math.min(
        maxDelayMs,
        Math.round(baseDelayMs * backoffMultiplier ** (attempt - 1)),
      );
      console.warn(`[migrate-safe] retrying in ${waitMs}ms due to temporary DB connection pressure`);
      await sleep(waitMs);
    }
  }
}

main().catch((err) => {
  console.error('[migrate-safe] failed:', err?.message || err);
  process.exit(1);
});
