-- Competitors
CREATE TABLE IF NOT EXISTS "competitors" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT,
  "platform" TEXT NOT NULL DEFAULT 'instagram',
  "username" TEXT NOT NULL,
  "name" TEXT,
  "profileUrl" TEXT,
  "avatarUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "competitors_tenantId_clientId_platform_username_key"
  ON "competitors"("tenantId", "clientId", "platform", "username");

CREATE INDEX IF NOT EXISTS "competitors_tenantId_idx"
  ON "competitors"("tenantId");

CREATE INDEX IF NOT EXISTS "competitors_clientId_idx"
  ON "competitors"("clientId");

CREATE INDEX IF NOT EXISTS "competitors_platform_idx"
  ON "competitors"("platform");

ALTER TABLE "competitors"
ADD CONSTRAINT "competitors_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "competitors"
ADD CONSTRAINT "competitors_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Competitor snapshots
CREATE TABLE IF NOT EXISTS "competitor_snapshots" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "competitorId" TEXT NOT NULL,
  "platform" TEXT,
  "followers" INTEGER,
  "postsCount" INTEGER,
  "engagementRate" DOUBLE PRECISION,
  "interactions" INTEGER,
  "likes" INTEGER,
  "comments" INTEGER,
  "rangeFrom" TIMESTAMP(3),
  "rangeTo" TIMESTAMP(3),
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meta" JSONB,

  CONSTRAINT "competitor_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "competitor_snapshots_tenantId_idx"
  ON "competitor_snapshots"("tenantId");

CREATE INDEX IF NOT EXISTS "competitor_snapshots_competitorId_idx"
  ON "competitor_snapshots"("competitorId");

CREATE INDEX IF NOT EXISTS "competitor_snapshots_collectedAt_idx"
  ON "competitor_snapshots"("collectedAt");

ALTER TABLE "competitor_snapshots"
ADD CONSTRAINT "competitor_snapshots_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "competitor_snapshots"
ADD CONSTRAINT "competitor_snapshots_competitorId_fkey"
FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
