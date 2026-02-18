-- Sprint 4: idempotent fact writes + warehouse query performance

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "fact_kondor_metrics_daily"
  ADD COLUMN IF NOT EXISTS "dimensionKey" TEXT;

UPDATE "fact_kondor_metrics_daily"
SET "dimensionKey" = CASE
  WHEN COALESCE(NULLIF(TRIM("campaignId"), ''), '') = ''
    AND COALESCE(NULLIF(TRIM("adsetId"), ''), '') = ''
    AND COALESCE(NULLIF(TRIM("adId"), ''), '') = ''
    THEN '__all__'
  ELSE 'dim:' || encode(
    digest(
      COALESCE(NULLIF(TRIM("campaignId"), ''), '~') || '|' ||
      COALESCE(NULLIF(TRIM("adsetId"), ''), '~') || '|' ||
      COALESCE(NULLIF(TRIM("adId"), ''), '~'),
      'sha1'
    ),
    'hex'
  )
END
WHERE "dimensionKey" IS NULL OR TRIM("dimensionKey") = '';

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY
        "tenantId",
        "brandId",
        "platform",
        "accountId",
        "date",
        "dimensionKey"
      ORDER BY "id" DESC
    ) AS rn
  FROM "fact_kondor_metrics_daily"
)
DELETE FROM "fact_kondor_metrics_daily" t
USING ranked r
WHERE t.ctid = r.ctid
  AND r.rn > 1;

ALTER TABLE "fact_kondor_metrics_daily"
  ALTER COLUMN "dimensionKey" SET DEFAULT '__all__';

ALTER TABLE "fact_kondor_metrics_daily"
  ALTER COLUMN "dimensionKey" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "fact_kondor_metrics_daily_natural_key"
ON "fact_kondor_metrics_daily"(
  "tenantId",
  "brandId",
  "platform",
  "accountId",
  "date",
  "dimensionKey"
);

-- Query acceleration for tenant/brand date windows and provider/property filters.
CREATE INDEX IF NOT EXISTS "fact_kondor_metrics_daily_tenant_brand_provider_account_date_idx"
ON "fact_kondor_metrics_daily"(
  "tenantId",
  "brandId",
  "platform",
  "accountId",
  "date"
);

CREATE INDEX IF NOT EXISTS "fact_kondor_metrics_daily_tenant_brand_provider_campaign_date_idx"
ON "fact_kondor_metrics_daily"(
  "tenantId",
  "brandId",
  "platform",
  "campaignId",
  "date"
);

CREATE INDEX IF NOT EXISTS "fact_kondor_metrics_daily_ga4_property_agg_date_idx"
ON "fact_kondor_metrics_daily"(
  "tenantId",
  "brandId",
  "accountId",
  "date"
)
WHERE "platform" = 'GA4'::"BrandSourcePlatform"
  AND "campaignId" IS NULL;

CREATE INDEX IF NOT EXISTS "fact_kondor_metrics_daily_ga4_property_campaign_date_idx"
ON "fact_kondor_metrics_daily"(
  "tenantId",
  "brandId",
  "accountId",
  "campaignId",
  "date"
)
WHERE "platform" = 'GA4'::"BrandSourcePlatform"
  AND "campaignId" IS NOT NULL;

-- Time-based strategy: BRIN keeps date scans cheap even as table grows.
CREATE INDEX IF NOT EXISTS "fact_kondor_metrics_daily_date_brin_idx"
ON "fact_kondor_metrics_daily"
USING BRIN ("date");
