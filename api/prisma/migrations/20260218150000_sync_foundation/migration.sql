-- Sprint 1 foundation: connector state + sync execution audit

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Extend existing enums with unified reauth status.
ALTER TYPE "IntegrationStatus" ADD VALUE IF NOT EXISTS 'REAUTH_REQUIRED';
ALTER TYPE "Ga4IntegrationStatus" ADD VALUE IF NOT EXISTS 'REAUTH_REQUIRED';

DO $$
BEGIN
  CREATE TYPE "ConnectionStateStatus" AS ENUM (
    'CONNECTED',
    'DISCONNECTED',
    'ERROR',
    'REAUTH_REQUIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "SyncRunType" AS ENUM (
    'PREVIEW',
    'BACKFILL',
    'INCREMENTAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "SyncRunStatus" AS ENUM (
    'QUEUED',
    'RUNNING',
    'SUCCESS',
    'PARTIAL_SUCCESS',
    'FAILED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "SyncChunkStatus" AS ENUM (
    'QUEUED',
    'RUNNING',
    'SUCCESS',
    'FAILED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "connection_state" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "stateKey" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "brandId" TEXT,
  "provider" TEXT NOT NULL,
  "connectionId" TEXT,
  "connectionKey" TEXT NOT NULL DEFAULT 'default',
  "status" "ConnectionStateStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "reasonCode" TEXT,
  "reasonMessage" TEXT,
  "nextAction" TEXT,
  "nextRetryAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "connection_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "connection_state_stateKey_key"
ON "connection_state"("stateKey");
CREATE INDEX IF NOT EXISTS "connection_state_tenantId_idx"
ON "connection_state"("tenantId");
CREATE INDEX IF NOT EXISTS "connection_state_tenant_provider_status_idx"
ON "connection_state"("tenantId", "provider", "status");
CREATE INDEX IF NOT EXISTS "connection_state_tenant_brand_provider_idx"
ON "connection_state"("tenantId", "brandId", "provider");
CREATE INDEX IF NOT EXISTS "connection_state_connectionId_idx"
ON "connection_state"("connectionId");

CREATE TABLE IF NOT EXISTS "sync_runs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "brandId" TEXT,
  "provider" TEXT NOT NULL,
  "connectionId" TEXT,
  "connectionKey" TEXT,
  "runType" "SyncRunType" NOT NULL,
  "status" "SyncRunStatus" NOT NULL DEFAULT 'QUEUED',
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "cursorStart" TEXT,
  "cursorEnd" TEXT,
  "rowsRead" INTEGER NOT NULL DEFAULT 0,
  "rowsWritten" INTEGER NOT NULL DEFAULT 0,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sync_runs_tenant_provider_status_createdAt_idx"
ON "sync_runs"("tenantId", "provider", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "sync_runs_tenant_brand_provider_createdAt_idx"
ON "sync_runs"("tenantId", "brandId", "provider", "createdAt");
CREATE INDEX IF NOT EXISTS "sync_runs_connectionId_createdAt_idx"
ON "sync_runs"("connectionId", "createdAt");

CREATE TABLE IF NOT EXISTS "sync_chunks" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "runId" TEXT NOT NULL,
  "tenantId" TEXT,
  "brandId" TEXT,
  "provider" TEXT,
  "status" "SyncChunkStatus" NOT NULL DEFAULT 'QUEUED',
  "cursorStart" TEXT,
  "cursorEnd" TEXT,
  "chunkKey" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "rowsRead" INTEGER NOT NULL DEFAULT 0,
  "rowsWritten" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sync_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sync_chunks_runId_status_idx"
ON "sync_chunks"("runId", "status");
CREATE INDEX IF NOT EXISTS "sync_chunks_tenant_brand_provider_createdAt_idx"
ON "sync_chunks"("tenantId", "brandId", "provider", "createdAt");

DO $$
BEGIN
  ALTER TABLE "sync_chunks"
    ADD CONSTRAINT "sync_chunks_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "sync_runs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "sync_errors" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "runId" TEXT,
  "chunkId" TEXT,
  "tenantId" TEXT,
  "brandId" TEXT,
  "provider" TEXT,
  "connectionId" TEXT,
  "httpStatus" INTEGER,
  "providerCode" TEXT,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "message" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sync_errors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sync_errors_runId_createdAt_idx"
ON "sync_errors"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "sync_errors_chunkId_createdAt_idx"
ON "sync_errors"("chunkId", "createdAt");
CREATE INDEX IF NOT EXISTS "sync_errors_tenant_provider_createdAt_idx"
ON "sync_errors"("tenantId", "provider", "createdAt");

DO $$
BEGIN
  ALTER TABLE "sync_errors"
    ADD CONSTRAINT "sync_errors_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "sync_runs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "sync_errors"
    ADD CONSTRAINT "sync_errors_chunkId_fkey"
    FOREIGN KEY ("chunkId") REFERENCES "sync_chunks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
