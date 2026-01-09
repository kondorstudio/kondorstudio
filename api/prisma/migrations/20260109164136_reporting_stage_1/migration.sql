-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('META_ADS', 'GOOGLE_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'GA4', 'GBP', 'META_SOCIAL');

-- CreateEnum
CREATE TYPE "DataSourceConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "MetricCatalogType" AS ENUM ('METRIC', 'DIMENSION');

-- CreateEnum
CREATE TYPE "ReportTemplateVisibility" AS ENUM ('PRIVATE', 'TENANT', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ReportScope" AS ENUM ('BRAND', 'GROUP');

-- CreateEnum
CREATE TYPE "ReportCompareMode" AS ENUM ('NONE', 'PREVIOUS_PERIOD', 'PREVIOUS_YEAR', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReportWidgetType" AS ENUM ('KPI', 'LINE', 'BAR', 'PIE', 'TABLE', 'TEXT', 'IMAGE');

-- CreateEnum
CREATE TYPE "DashboardScope" AS ENUM ('BRAND', 'GROUP', 'TENANT');

-- CreateEnum
CREATE TYPE "ReportExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "ReportScheduleFrequency" AS ENUM ('WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "competitor_snapshots" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "competitors" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "mfa_challenges" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "brandId" TEXT,
ADD COLUMN     "compareDateFrom" TIMESTAMP(3),
ADD COLUMN     "compareDateTo" TIMESTAMP(3),
ADD COLUMN     "compareMode" "ReportCompareMode",
ADD COLUMN     "dateFrom" TIMESTAMP(3),
ADD COLUMN     "dateTo" TIMESTAMP(3),
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "scope" "ReportScope",
ADD COLUMN     "snapshotTemplate" JSONB,
ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "status",
ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL';

-- AlterTable
ALTER TABLE "user_preferences" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "brand_groups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_group_members" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_source_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "source" "DataSource" NOT NULL,
    "integrationId" TEXT,
    "externalAccountId" TEXT,
    "displayName" TEXT NOT NULL,
    "status" "DataSourceConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_source_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_catalog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" "DataSource" NOT NULL,
    "level" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "dimensionKey" TEXT,
    "label" TEXT NOT NULL,
    "type" "MetricCatalogType" NOT NULL,
    "supportedCharts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportedBreakdowns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "ReportTemplateVisibility" NOT NULL DEFAULT 'TENANT',
    "layoutSchema" JSONB,
    "widgetsSchema" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_widgets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "widgetType" "ReportWidgetType" NOT NULL,
    "title" TEXT,
    "source" "DataSource" NOT NULL,
    "connectionId" TEXT,
    "level" TEXT,
    "breakdown" TEXT,
    "metrics" JSONB,
    "filters" JSONB,
    "options" JSONB,
    "layout" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "DashboardScope" NOT NULL,
    "brandId" TEXT,
    "groupId" TEXT,
    "layoutSchema" JSONB,
    "widgetsSchema" JSONB,
    "globalFiltersSchema" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "status" "ReportExportStatus" NOT NULL DEFAULT 'PENDING',
    "format" TEXT NOT NULL DEFAULT 'PDF',
    "fileId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "ReportScope" NOT NULL,
    "brandId" TEXT,
    "groupId" TEXT,
    "templateId" TEXT,
    "frequency" "ReportScheduleFrequency" NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "scheduleConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_groups_tenantId_idx" ON "brand_groups"("tenantId");

-- CreateIndex
CREATE INDEX "brand_group_members_tenantId_idx" ON "brand_group_members"("tenantId");

-- CreateIndex
CREATE INDEX "brand_group_members_groupId_idx" ON "brand_group_members"("groupId");

-- CreateIndex
CREATE INDEX "brand_group_members_brandId_idx" ON "brand_group_members"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "brand_group_members_tenantId_groupId_brandId_key" ON "brand_group_members"("tenantId", "groupId", "brandId");

-- CreateIndex
CREATE INDEX "data_source_connections_tenantId_idx" ON "data_source_connections"("tenantId");

-- CreateIndex
CREATE INDEX "data_source_connections_brandId_idx" ON "data_source_connections"("brandId");

-- CreateIndex
CREATE INDEX "data_source_connections_source_idx" ON "data_source_connections"("source");

-- CreateIndex
CREATE INDEX "data_source_connections_integrationId_idx" ON "data_source_connections"("integrationId");

-- CreateIndex
CREATE INDEX "metric_catalog_tenantId_idx" ON "metric_catalog"("tenantId");

-- CreateIndex
CREATE INDEX "metric_catalog_source_idx" ON "metric_catalog"("source");

-- CreateIndex
CREATE INDEX "metric_catalog_level_idx" ON "metric_catalog"("level");

-- CreateIndex
CREATE UNIQUE INDEX "metric_catalog_tenantId_source_level_metricKey_type_key" ON "metric_catalog"("tenantId", "source", "level", "metricKey", "type");

-- CreateIndex
CREATE INDEX "report_templates_tenantId_idx" ON "report_templates"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "report_templates_tenantId_name_version_key" ON "report_templates"("tenantId", "name", "version");

-- CreateIndex
CREATE INDEX "report_widgets_tenantId_idx" ON "report_widgets"("tenantId");

-- CreateIndex
CREATE INDEX "report_widgets_reportId_idx" ON "report_widgets"("reportId");

-- CreateIndex
CREATE INDEX "report_widgets_source_idx" ON "report_widgets"("source");

-- CreateIndex
CREATE INDEX "dashboards_tenantId_idx" ON "dashboards"("tenantId");

-- CreateIndex
CREATE INDEX "dashboards_scope_idx" ON "dashboards"("scope");

-- CreateIndex
CREATE INDEX "report_exports_tenantId_idx" ON "report_exports"("tenantId");

-- CreateIndex
CREATE INDEX "report_exports_reportId_idx" ON "report_exports"("reportId");

-- CreateIndex
CREATE INDEX "report_exports_status_idx" ON "report_exports"("status");

-- CreateIndex
CREATE INDEX "report_schedules_tenantId_idx" ON "report_schedules"("tenantId");

-- CreateIndex
CREATE INDEX "report_schedules_scope_idx" ON "report_schedules"("scope");

-- CreateIndex
CREATE INDEX "report_schedules_frequency_idx" ON "report_schedules"("frequency");

-- CreateIndex
CREATE INDEX "reports_brandId_idx" ON "reports"("brandId");

-- CreateIndex
CREATE INDEX "reports_groupId_idx" ON "reports"("groupId");

-- CreateIndex
CREATE INDEX "reports_templateId_idx" ON "reports"("templateId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "brand_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "report_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_groups" ADD CONSTRAINT "brand_groups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_group_members" ADD CONSTRAINT "brand_group_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_group_members" ADD CONSTRAINT "brand_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "brand_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_group_members" ADD CONSTRAINT "brand_group_members_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_source_connections" ADD CONSTRAINT "data_source_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_source_connections" ADD CONSTRAINT "data_source_connections_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_source_connections" ADD CONSTRAINT "data_source_connections_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_catalog" ADD CONSTRAINT "metric_catalog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_parentTemplateId_fkey" FOREIGN KEY ("parentTemplateId") REFERENCES "report_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_widgets" ADD CONSTRAINT "report_widgets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_widgets" ADD CONSTRAINT "report_widgets_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_widgets" ADD CONSTRAINT "report_widgets_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "data_source_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "brand_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "brand_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "report_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
