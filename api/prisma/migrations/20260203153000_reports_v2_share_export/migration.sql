-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "report_dashboard"
ADD COLUMN IF NOT EXISTS "sharedEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "report_dashboard"
ADD COLUMN IF NOT EXISTS "sharedTokenHash" TEXT;

ALTER TABLE "report_dashboard"
ADD COLUMN IF NOT EXISTS "sharedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "report_dashboard_sharedTokenHash_idx" ON "report_dashboard"("sharedTokenHash");

CREATE TABLE IF NOT EXISTS "report_dashboard_export" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "dashboardId" TEXT NOT NULL,
  "status" "ReportExportStatus" NOT NULL DEFAULT 'PENDING',
  "format" TEXT NOT NULL DEFAULT 'PDF',
  "fileId" TEXT,
  "publicTokenHash" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "report_dashboard_export_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "report_dashboard_export_tenantId_idx" ON "report_dashboard_export"("tenantId");
CREATE INDEX IF NOT EXISTS "report_dashboard_export_dashboardId_idx" ON "report_dashboard_export"("dashboardId");
CREATE INDEX IF NOT EXISTS "report_dashboard_export_status_idx" ON "report_dashboard_export"("status");
CREATE INDEX IF NOT EXISTS "report_dashboard_export_publicTokenHash_idx" ON "report_dashboard_export"("publicTokenHash");

ALTER TABLE "report_dashboard_export"
ADD CONSTRAINT "report_dashboard_export_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_dashboard_export"
ADD CONSTRAINT "report_dashboard_export_dashboardId_fkey"
FOREIGN KEY ("dashboardId") REFERENCES "report_dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_dashboard_export"
ADD CONSTRAINT "report_dashboard_export_fileId_fkey"
FOREIGN KEY ("fileId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
