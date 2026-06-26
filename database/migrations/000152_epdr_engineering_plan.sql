CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS biz_engineering_plan (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  org_id uuid NULL,
  project_id uuid NOT NULL,
  plan_code varchar(64) NOT NULL,
  plan_name varchar(200) NOT NULL,
  plan_type varchar(32) NOT NULL,
  parent_plan_id uuid NULL,
  plan_level varchar(16) NOT NULL DEFAULT 'L1',
  description text NULL,
  planned_start_date date NULL,
  planned_end_date date NULL,
  actual_start_date date NULL,
  actual_end_date date NULL,
  planned_progress_percent integer NOT NULL DEFAULT 0,
  actual_progress_percent integer NOT NULL DEFAULT 0,
  weight numeric(8, 2) NULL,
  owner_user_id uuid NULL,
  owner_org_id uuid NULL,
  contractor_org_id uuid NULL,
  status varchar(32) NOT NULL DEFAULT 'DRAFT',
  delay_days integer NOT NULL DEFAULT 0,
  risk_level varchar(32) NOT NULL DEFAULT 'LOW',
  sort_order integer NOT NULL DEFAULT 0,
  remark varchar(500) NULL,
  create_by uuid NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid NULL,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT chk_biz_engineering_plan_planned_progress CHECK (planned_progress_percent >= 0 AND planned_progress_percent <= 100),
  CONSTRAINT chk_biz_engineering_plan_actual_progress CHECK (actual_progress_percent >= 0 AND actual_progress_percent <= 100),
  CONSTRAINT chk_biz_engineering_plan_delay_days CHECK (delay_days >= 0),
  CONSTRAINT chk_biz_engineering_plan_weight CHECK (weight IS NULL OR weight >= 0),
  CONSTRAINT chk_biz_engineering_plan_date_range CHECK (
    planned_start_date IS NULL OR planned_end_date IS NULL OR planned_end_date >= planned_start_date
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_engineering_plan_code
  ON biz_engineering_plan (tenant_id, plan_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_tenant_deleted
  ON biz_engineering_plan (tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_org
  ON biz_engineering_plan (tenant_id, org_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_park
  ON biz_engineering_plan (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_project
  ON biz_engineering_plan (tenant_id, project_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_parent
  ON biz_engineering_plan (tenant_id, parent_plan_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_type
  ON biz_engineering_plan (tenant_id, plan_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_status
  ON biz_engineering_plan (tenant_id, status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_owner_user
  ON biz_engineering_plan (tenant_id, owner_user_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_owner_org
  ON biz_engineering_plan (tenant_id, owner_org_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_contractor
  ON biz_engineering_plan (tenant_id, contractor_org_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_planned_start
  ON biz_engineering_plan (tenant_id, planned_start_date, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_plan_sort
  ON biz_engineering_plan (tenant_id, project_id, sort_order, is_deleted);
