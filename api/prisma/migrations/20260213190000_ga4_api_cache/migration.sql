-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  CREATE TYPE "Ga4ApiCacheKind" AS ENUM (
    'REPORT',
    'REALTIME',
    'METADATA',
    'COMPATIBILITY',
    'BATCH_REPORT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "ga4_api_cache" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "kind" "Ga4ApiCacheKind" NOT NULL,
  "requestHash" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "response" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ga4_api_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ga4_api_cache_tenant_property_kind_hash_key"
  ON "ga4_api_cache"("tenantId", "propertyId", "kind", "requestHash");

CREATE INDEX IF NOT EXISTS "ga4_api_cache_tenantId_idx" ON "ga4_api_cache"("tenantId");
CREATE INDEX IF NOT EXISTS "ga4_api_cache_tenant_property_idx" ON "ga4_api_cache"("tenantId", "propertyId");
CREATE INDEX IF NOT EXISTS "ga4_api_cache_expiresAt_idx" ON "ga4_api_cache"("expiresAt");

DO $$
BEGIN
  ALTER TABLE "ga4_api_cache"
    ADD CONSTRAINT "ga4_api_cache_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
