-- Sprint 2 foundation: raw append-only layer + star schema warehouse

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "raw_api_responses" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT,
  "brandId" TEXT,
  "provider" TEXT NOT NULL,
  "connectionId" TEXT,
  "runId" TEXT,
  "chunkId" TEXT,
  "endpoint" TEXT NOT NULL,
  "paramsHash" TEXT NOT NULL,
  "params" JSONB,
  "payload" JSONB NOT NULL,
  "cursor" TEXT,
  "httpStatus" INTEGER,
  "compressed" BOOLEAN NOT NULL DEFAULT false,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retentionUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "raw_api_responses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "raw_api_responses_provider_fetchedAt_idx"
ON "raw_api_responses"("provider", "fetchedAt");
CREATE INDEX IF NOT EXISTS "raw_api_responses_tenant_provider_fetchedAt_idx"
ON "raw_api_responses"("tenantId", "provider", "fetchedAt");
CREATE INDEX IF NOT EXISTS "raw_api_responses_brand_provider_fetchedAt_idx"
ON "raw_api_responses"("brandId", "provider", "fetchedAt");
CREATE INDEX IF NOT EXISTS "raw_api_responses_runId_fetchedAt_idx"
ON "raw_api_responses"("runId", "fetchedAt");
CREATE INDEX IF NOT EXISTS "raw_api_responses_chunkId_fetchedAt_idx"
ON "raw_api_responses"("chunkId", "fetchedAt");
CREATE INDEX IF NOT EXISTS "raw_api_responses_retentionUntil_idx"
ON "raw_api_responses"("retentionUntil");
CREATE INDEX IF NOT EXISTS "raw_api_responses_paramsHash_idx"
ON "raw_api_responses"("paramsHash");

CREATE TABLE IF NOT EXISTS "dim_provider" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "providerKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dim_provider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dim_provider_providerKey_key"
ON "dim_provider"("providerKey");

CREATE TABLE IF NOT EXISTS "dim_metric" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "metricKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "unit" TEXT,
  "aggregation" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dim_metric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dim_metric_metricKey_key"
ON "dim_metric"("metricKey");

CREATE TABLE IF NOT EXISTS "dim_dimension_value" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "dimensionKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dim_dimension_value_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dim_dimension_value_dimensionKey_key"
ON "dim_dimension_value"("dimensionKey");

CREATE TABLE IF NOT EXISTS "fact_daily_metrics" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "providerId" TEXT NOT NULL,
  "metricId" TEXT NOT NULL,
  "dimensionValueId" TEXT NOT NULL,
  "metricValue" DECIMAL(18, 6) NOT NULL,
  "currency" TEXT,
  "sourceSystem" TEXT,
  "sourceFactId" TEXT,
  "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fact_daily_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fact_daily_metrics_tenant_brand_date_provider_metric_dimension_key"
ON "fact_daily_metrics"("tenantId", "brandId", "date", "providerId", "metricId", "dimensionValueId");
CREATE INDEX IF NOT EXISTS "fact_daily_metrics_tenant_brand_date_idx"
ON "fact_daily_metrics"("tenantId", "brandId", "date");
CREATE INDEX IF NOT EXISTS "fact_daily_metrics_tenant_brand_provider_date_idx"
ON "fact_daily_metrics"("tenantId", "brandId", "providerId", "date");
CREATE INDEX IF NOT EXISTS "fact_daily_metrics_metric_date_idx"
ON "fact_daily_metrics"("metricId", "date");
CREATE INDEX IF NOT EXISTS "fact_daily_metrics_source_fact_idx"
ON "fact_daily_metrics"("sourceFactId");

DO $$
BEGIN
  ALTER TABLE "fact_daily_metrics"
    ADD CONSTRAINT "fact_daily_metrics_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "dim_provider"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "fact_daily_metrics"
    ADD CONSTRAINT "fact_daily_metrics_metricId_fkey"
    FOREIGN KEY ("metricId") REFERENCES "dim_metric"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "fact_daily_metrics"
    ADD CONSTRAINT "fact_daily_metrics_dimensionValueId_fkey"
    FOREIGN KEY ("dimensionValueId") REFERENCES "dim_dimension_value"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
