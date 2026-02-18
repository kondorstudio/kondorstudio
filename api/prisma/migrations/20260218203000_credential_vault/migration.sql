CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "credential_vault" (
  "id" TEXT NOT NULL,
  "secretRef" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "integrationId" TEXT,
  "kind" TEXT NOT NULL,
  "secretEnc" TEXT NOT NULL,
  "meta" JSONB,
  "rotatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credential_vault_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "credential_vault_secretRef_key"
  ON "credential_vault"("secretRef");

CREATE INDEX IF NOT EXISTS "credential_vault_tenant_provider_kind_idx"
  ON "credential_vault"("tenantId", "provider", "kind");

CREATE INDEX IF NOT EXISTS "credential_vault_integrationId_idx"
  ON "credential_vault"("integrationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credential_vault_tenantId_fkey'
  ) THEN
    ALTER TABLE "credential_vault"
      ADD CONSTRAINT "credential_vault_tenantId_fkey"
      FOREIGN KEY ("tenantId")
      REFERENCES "tenants"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credential_vault_integrationId_fkey'
  ) THEN
    ALTER TABLE "credential_vault"
      ADD CONSTRAINT "credential_vault_integrationId_fkey"
      FOREIGN KEY ("integrationId")
      REFERENCES "integrations"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
