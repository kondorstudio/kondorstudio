-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "ga4_api_calls" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "kind" "Ga4ApiCacheKind" NOT NULL,
  "requestHash" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "response" JSONB,
  "httpStatus" INTEGER,
  "error" TEXT,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ga4_api_calls_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ga4_api_calls"
ADD CONSTRAINT "ga4_api_calls_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ga4_api_calls_tenantId_idx" ON "ga4_api_calls"("tenantId");
CREATE INDEX "ga4_api_calls_tenantId_propertyId_idx" ON "ga4_api_calls"("tenantId", "propertyId");
CREATE INDEX "ga4_api_calls_kind_idx" ON "ga4_api_calls"("kind");
CREATE INDEX "ga4_api_calls_createdAt_idx" ON "ga4_api_calls"("createdAt");

