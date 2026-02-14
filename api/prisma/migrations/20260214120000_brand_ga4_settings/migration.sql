-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "brand_ga4_settings" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "timezone" TEXT,
  "leadEvents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "conversionEvents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "revenueEvent" TEXT,
  "dedupRule" JSONB,
  "lastHistoricalSyncAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastError" JSONB,
  "backfillCursor" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "brand_ga4_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "brand_ga4_settings_brandId_key" ON "brand_ga4_settings"("brandId");
CREATE INDEX IF NOT EXISTS "brand_ga4_settings_tenantId_idx" ON "brand_ga4_settings"("tenantId");
CREATE INDEX IF NOT EXISTS "brand_ga4_settings_tenant_brand_idx" ON "brand_ga4_settings"("tenantId", "brandId");
CREATE INDEX IF NOT EXISTS "brand_ga4_settings_tenant_property_idx" ON "brand_ga4_settings"("tenantId", "propertyId");

DO $$
BEGIN
  ALTER TABLE "brand_ga4_settings"
    ADD CONSTRAINT "brand_ga4_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "brand_ga4_settings"
    ADD CONSTRAINT "brand_ga4_settings_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "clients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
