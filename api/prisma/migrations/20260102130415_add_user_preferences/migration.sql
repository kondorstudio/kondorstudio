-- User preferences table
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "postsViewMode" TEXT,
  "kanbanCollapsedColumns" JSONB,
  "lastFilters" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_preferences_userId_tenantId_key"
  ON "user_preferences"("userId", "tenantId");

CREATE INDEX IF NOT EXISTS "user_preferences_tenantId_idx"
  ON "user_preferences"("tenantId");

CREATE INDEX IF NOT EXISTS "user_preferences_userId_idx"
  ON "user_preferences"("userId");

ALTER TABLE "user_preferences"
ADD CONSTRAINT "user_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_preferences"
ADD CONSTRAINT "user_preferences_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
