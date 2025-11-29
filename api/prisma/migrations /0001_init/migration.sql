-- Migration: 0001_init
-- Generated for KONDOR STUDIO initial schema (based on the final schema.prisma you approved)
-- Note: Review BEFORE applying to any production DB. This migration only generates DDL files.
-- Requirements: PostgreSQL
-- Recommended extensions: pgcrypto (for gen_random_uuid) or uuid-ossp
-- If using pgcrypto:
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================
-- Enums (Postgres types)
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role') THEN
    CREATE TYPE role AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'CLIENT', 'GUEST');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'poststatus') THEN
    CREATE TYPE poststatus AS ENUM ('DRAFT','SCHEDULED','PUBLISHED','FAILED','CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approvalstatus') THEN
    CREATE TYPE approvalstatus AS ENUM ('PENDING','APPROVED','REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integrationprovider') THEN
    CREATE TYPE integrationprovider AS ENUM ('META','GOOGLE','TIKTOK','YOUTUBE','WHATSAPP','OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integrationstatus') THEN
    CREATE TYPE integrationstatus AS ENUM ('ACTIVE','INACTIVE','ERROR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billinginterval') THEN
    CREATE TYPE billinginterval AS ENUM ('MONTHLY','YEARLY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'paymentstatus') THEN
    CREATE TYPE paymentstatus AS ENUM ('PENDING','SUCCEEDED','FAILED','REFUNDED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'taskstatus') THEN
    CREATE TYPE taskstatus AS ENUM ('TODO','IN_PROGRESS','DONE','BLOCKED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'taskpriority') THEN
    CREATE TYPE taskpriority AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
  END IF;
END$$;

-- =========================
-- Tables
-- =========================

-- tenants
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  settings jsonb,
  plan_id uuid,
  billing_customer_id text,
  created_at_index timestamptz,
  CONSTRAINT fk_tenant_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- users
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  password_hash text,
  name text,
  role role NOT NULL DEFAULT 'MEMBER',
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_user_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- refresh_tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

-- session_tokens
CREATE TABLE IF NOT EXISTS session_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_session_user ON session_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_session_expires ON session_tokens(expires_at);

-- teams
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  handle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_team_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_teams_tenant ON teams(tenant_id);

-- team_members
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role role NOT NULL DEFAULT 'MEMBER',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_tm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_team_user ON team_members(team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_tenant ON team_members(tenant_id);

-- clients
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  metadata jsonb,
  contacts jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_client_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);

-- projects
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_project_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);

-- plans (must exist before tenants referencing plan_id)
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  interval billinginterval NOT NULL DEFAULT 'MONTHLY',
  features jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plans_key ON plans(key);

-- posts
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid,
  author_id uuid,
  title text NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  scheduled_at timestamptz,
  published_at timestamptz,
  status poststatus NOT NULL DEFAULT 'DRAFT',
  platform text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_post_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_post_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_tenant ON posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_posts_external_id ON posts(external_id) WHERE external_id IS NOT NULL;

-- approvals
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  post_id uuid NOT NULL,
  requester_id uuid,
  approver_id uuid,
  status approvalstatus NOT NULL DEFAULT 'PENDING',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_approval_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_approval_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_approval_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_approval_approver FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

-- tasks
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid,
  post_id uuid,
  title text NOT NULL,
  description text,
  status taskstatus NOT NULL DEFAULT 'TODO',
  priority taskpriority NOT NULL DEFAULT 'MEDIUM',
  due_date timestamptz,
  assignee_id uuid,
  created_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_task_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_task_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
  CONSTRAINT fk_task_assignee FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_task_creator FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- metrics
CREATE TABLE IF NOT EXISTS metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  post_id uuid NOT NULL,
  name text NOT NULL,
  value double precision NOT NULL,
  meta jsonb,
  collected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_metric_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_metric_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant ON metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_metrics_post ON metrics(post_id);

-- uploads
CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  uploader_id uuid,
  key text NOT NULL UNIQUE,
  url text NOT NULL,
  filename text NOT NULL,
  size integer NOT NULL,
  mime_type text NOT NULL,
  metadata jsonb,
  versions jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_upload_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_upload_uploader FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_uploads_tenant ON uploads(tenant_id);

-- creatives
CREATE TABLE IF NOT EXISTS creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  post_id uuid,
  upload_id uuid,
  key text,
  url text,
  filename text,
  size integer,
  mime_type text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_creative_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_creative_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
  CONSTRAINT fk_creative_upload FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_creatives_tenant ON creatives(tenant_id);

-- reports
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  params jsonb,
  status text NOT NULL DEFAULT 'pending',
  file_id uuid,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_report_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_file FOREIGN KEY (file_id) REFERENCES uploads(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- integration
CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  provider integrationprovider NOT NULL,
  provider_name text,
  access_token text,
  refresh_token text,
  scopes text[],
  settings jsonb,
  status integrationstatus NOT NULL DEFAULT 'ACTIVE',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_integration_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);

-- integration_jobs
CREATE TABLE IF NOT EXISTS integration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb,
  result jsonb,
  attempt integer NOT NULL DEFAULT 0,
  run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_ij_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_integration_jobs_integration ON integration_jobs(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_jobs_status ON integration_jobs(status);

-- job_queue
CREATE TABLE IF NOT EXISTS job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name text NOT NULL,
  type text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  run_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_job_queue_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_job_queue_tenant ON job_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);

-- job_history
CREATE TABLE IF NOT EXISTS job_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  job_id uuid NOT NULL,
  job_type text NOT NULL,
  payload jsonb,
  result jsonb,
  status text,
  attempts integer NOT NULL DEFAULT 0,
  ran_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_job_history_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_job_history_tenant ON job_history(tenant_id);

-- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid,
  action text NOT NULL,
  resource text,
  resource_id text,
  ip text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);

-- subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  external_subscription_id text,
  status paymentstatus NOT NULL DEFAULT 'PENDING',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_subscription_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- invoices
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  external_invoice_id text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  status paymentstatus NOT NULL DEFAULT 'PENDING',
  metadata jsonb,
  issued_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_invoice_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid,
  tenant_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  status paymentstatus NOT NULL DEFAULT 'PENDING',
  provider text,
  provider_payment_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  CONSTRAINT fk_payment_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- financial_records
CREATE TABLE IF NOT EXISTS financial_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  type text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_finrec_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_finrec_tenant ON financial_records(tenant_id);

-- =========================
-- End of migration
-- =========================

-- Helpful notes for deployment:
-- 1) Run this migration locally against a dev DB first.
-- 2) If your production DB already has tables, don't apply blindly. Generate a diff with your current DB.
-- 3) Use `prisma migrate dev --name init` locally to align Prisma migration files with this DDL (or `prisma migrate diff` if available).
-- 4) Commit the generated prisma/migrations/0001_init/* files to git.
