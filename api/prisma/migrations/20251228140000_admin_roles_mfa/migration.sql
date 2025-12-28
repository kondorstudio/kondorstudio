-- Add new admin roles
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPPORT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FINANCE';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'TECH';

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Add MFA flag to users
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;

-- MFA challenges table
CREATE TABLE IF NOT EXISTS "mfa_challenges" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'admin_login',
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mfa_challenges_userId_idx" ON "mfa_challenges"("userId");
CREATE INDEX IF NOT EXISTS "mfa_challenges_expiresAt_idx" ON "mfa_challenges"("expiresAt");

ALTER TABLE "mfa_challenges"
ADD CONSTRAINT "mfa_challenges_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
