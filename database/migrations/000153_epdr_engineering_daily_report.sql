CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS biz_engineering_daily_report (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  org_id uuid NULL,
  project_id uuid NOT NULL,
  plan_id uuid NULL,
  report_code varchar(64) NOT NULL,
  report_date date NOT NULL,
  weather varchar(32) NOT NULL,
  temperature varchar(64) NULL,
  work_content text NOT NULL,
  completed_work text NULL,
  unfinished_work text NULL,
  tomorrow_plan text NULL,
  worker_count integer NOT NULL DEFAULT 0,
  manager_count integer NOT NULL DEFAULT 0,
  machine_summary text NULL,
  material_summary text NULL,
  quality_summary text NULL,
  safety_summary text NULL,
  issue_summary text NULL,
  progress_percent integer NOT NULL DEFAULT 0,
  report_status varchar(32) NOT NULL DEFAULT 'DRAFT',
  submitted_at timestamptz NULL,
  submitted_by uuid NULL,
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL,
  review_comment text NULL,
  contractor_org_id uuid NULL,
  supervisor_org_id uuid NULL,
  attachment_ids jsonb NULL,
  remark varchar(500) NULL,
  create_by uuid NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid NULL,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT chk_biz_engineering_daily_report_worker_count CHECK (worker_count >= 0),
  CONSTRAINT chk_biz_engineering_daily_report_manager_count CHECK (manager_count >= 0),
  CONSTRAINT chk_biz_engineering_daily_report_progress CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_engineering_daily_report_code
  ON biz_engineering_daily_report (tenant_id, report_code)
  WHERE is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_engineering_daily_report_project_date_contractor
  ON biz_engineering_daily_report (tenant_id, project_id, report_date, contractor_org_id)
  WHERE is_deleted = false AND contractor_org_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_engineering_daily_report_project_date_null_contractor
  ON biz_engineering_daily_report (tenant_id, project_id, report_date)
  WHERE is_deleted = false AND contractor_org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_biz_engineering_daily_report_tenant_deleted
  ON biz_engineering_daily_report (tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_daily_report_org
  ON biz_engineering_daily_report (tenant_id, org_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_daily_report_park
  ON biz_engineering_daily_report (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_daily_report_project
  ON biz_engineering_daily_report (tenant_id, project_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_daily_report_plan
  ON biz_engineering_daily_report (tenant_id, plan_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_daily_report_date
  ON biz_engineering_daily_report (tenant_id, report_date, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_daily_report_status
  ON biz_engineering_daily_report (tenant_id, report_status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_daily_report_contractor
  ON biz_engineering_daily_report (tenant_id, contractor_org_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_daily_report_supervisor
  ON biz_engineering_daily_report (tenant_id, supervisor_org_id, is_deleted);
