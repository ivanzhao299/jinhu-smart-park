BEGIN;

CREATE TABLE IF NOT EXISTS admin_issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  issue_no varchar(40) NOT NULL UNIQUE,
  title varchar(200) NOT NULL,
  description text NOT NULL,
  severity varchar(16) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status varchar(40) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','TRIAGED','APPROVED','IN_PROGRESS','VERIFIED','RELEASED','CLOSED','REJECTED')),
  runner_status varchar(40) NOT NULL DEFAULT 'NONE' CHECK (runner_status IN ('NONE','READY','CLAIMED','RUNNING','WAITING_REVIEW','SUCCEEDED','FAILED','HOLD')),
  module_code varchar(80), route varchar(500) NOT NULL, url varchar(1000),
  reporter_id uuid NOT NULL, reporter_name varchar(160) NOT NULL,
  client_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  acceptance_criteria text, approved_by uuid, approved_at timestamptz,
  runner_id varchar(128), lease_token uuid, lease_expires_at timestamptz,
  implementation_commit varchar(64), changed_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  release_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_summary text,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_admin_issue_scope_status ON admin_issue_reports (tenant_id, park_id, status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_admin_issue_runner_ready ON admin_issue_reports (tenant_id, park_id, runner_status, create_time) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_admin_issue_reporter ON admin_issue_reports (tenant_id, park_id, reporter_id, create_time DESC) WHERE is_deleted = false;

COMMIT;
