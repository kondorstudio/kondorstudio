-- Add richer bookkeeping fields to financial_records
ALTER TABLE "financial_records"
  ADD COLUMN IF NOT EXISTS "clientId" TEXT,
  ADD COLUMN IF NOT EXISTS "note" TEXT,
  ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "financial_records"
  ADD CONSTRAINT "financial_records_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "financial_records_clientId_idx"
  ON "financial_records"("clientId");
