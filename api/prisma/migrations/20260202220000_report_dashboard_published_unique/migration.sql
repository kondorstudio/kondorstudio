-- Add unique constraint to enforce one-to-one published version
ALTER TABLE "report_dashboard"
ADD CONSTRAINT "report_dashboard_published_version_id_key"
UNIQUE ("published_version_id");
