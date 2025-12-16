/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,provider,ownerKey]` on the table `integrations` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[salaryRecordId]` on the table `team_members` will be added. If there are existing duplicate values, this will fail.
  - Made the column `occurredAt` on table `financial_records` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "IntegrationOwnerType" AS ENUM ('AGENCY', 'CLIENT');

-- CreateEnum
CREATE TYPE "SupportSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "whatsappNumberE164" TEXT;

-- AlterTable
ALTER TABLE "financial_records" ALTER COLUMN "occurredAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "integrations" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "ownerKey" TEXT NOT NULL DEFAULT 'AGENCY',
ADD COLUMN     "ownerType" "IntegrationOwnerType" NOT NULL DEFAULT 'AGENCY';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "whatsappMessageId" TEXT,
ADD COLUMN     "whatsappSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "deviceName" TEXT,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "revoked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tenantId" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "session_tokens" ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "team_members" ADD COLUMN     "salaryCents" INTEGER,
ADD COLUMN     "salaryRecordId" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "tenantId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_logs" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "jobId" TEXT,
    "status" TEXT NOT NULL,
    "attempts" INTEGER,
    "tenantId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "SupportSeverity" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "from" TEXT NOT NULL,
    "waMessageId" TEXT,
    "phoneNumberId" TEXT,
    "type" TEXT NOT NULL,
    "textBody" TEXT,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_logs_tenantId_idx" ON "system_logs"("tenantId");

-- CreateIndex
CREATE INDEX "system_logs_level_idx" ON "system_logs"("level");

-- CreateIndex
CREATE INDEX "system_logs_source_idx" ON "system_logs"("source");

-- CreateIndex
CREATE INDEX "system_logs_createdAt_idx" ON "system_logs"("createdAt");

-- CreateIndex
CREATE INDEX "job_logs_tenantId_idx" ON "job_logs"("tenantId");

-- CreateIndex
CREATE INDEX "job_logs_queue_idx" ON "job_logs"("queue");

-- CreateIndex
CREATE INDEX "job_logs_status_idx" ON "job_logs"("status");

-- CreateIndex
CREATE INDEX "job_logs_createdAt_idx" ON "job_logs"("createdAt");

-- CreateIndex
CREATE INDEX "tenant_notes_tenantId_idx" ON "tenant_notes"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_notes_authorId_idx" ON "tenant_notes"("authorId");

-- CreateIndex
CREATE INDEX "tenant_notes_severity_idx" ON "tenant_notes"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_waMessageId_key" ON "whatsapp_messages"("waMessageId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_tenantId_idx" ON "whatsapp_messages"("tenantId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_from_idx" ON "whatsapp_messages"("from");

-- CreateIndex
CREATE INDEX "integrations_ownerType_ownerKey_idx" ON "integrations"("ownerType", "ownerKey");

-- CreateIndex
CREATE INDEX "integrations_clientId_idx" ON "integrations"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_tenantId_provider_ownerKey_key" ON "integrations"("tenantId", "provider", "ownerKey");

-- CreateIndex
CREATE INDEX "metrics_collectedAt_idx" ON "metrics"("collectedAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_tenantId_idx" ON "refresh_tokens"("tenantId");

-- CreateIndex
CREATE INDEX "refresh_tokens_revoked_idx" ON "refresh_tokens"("revoked");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_salaryRecordId_key" ON "team_members"("salaryRecordId");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_salaryRecordId_fkey" FOREIGN KEY ("salaryRecordId") REFERENCES "financial_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_notes" ADD CONSTRAINT "tenant_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_notes" ADD CONSTRAINT "tenant_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
