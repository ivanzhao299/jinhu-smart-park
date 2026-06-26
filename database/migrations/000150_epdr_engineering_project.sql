CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS biz_engineering_project (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  org_id uuid,
  project_code varchar(64) NOT NULL,
  project_name varchar(200) NOT NULL,
  project_type varchar(64) NOT NULL,
  project_level varchar(32) NOT NULL DEFAULT 'NORMAL',
  project_source varchar(64),
  description text,
  location_text varchar(300),
  building_id uuid,
  floor_id uuid,
  space_id uuid,
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  budget_amount numeric(18, 2),
  contract_amount numeric(18, 2),
  settlement_amount numeric(18, 2),
  project_manager_id uuid,
  engineering_director_id uuid,
  contractor_org_id uuid,
  supervisor_org_id uuid,
  status varchar(32) NOT NULL DEFAULT 'DRAFT',
  progress_percent integer NOT NULL DEFAULT 0,
  risk_level varchar(32) NOT NULL DEFAULT 'LOW',
  quality_score numeric(5, 2),
  safety_score numeric(5, 2),
  workflow_instance_id uuid,
  transfer_status varchar(32) NOT NULL DEFAULT 'NOT_READY',
  finance_status varchar(32) NOT NULL DEFAULT 'NOT_REQUIRED',
  asset_status varchar(32) NOT NULL DEFAULT 'NOT_REQUIRED',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT chk_biz_engineering_project_progress
    CHECK (progress_percent >= 0 AND progress_percent <= 100),
  CONSTRAINT chk_biz_engineering_project_quality_score
    CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)),
  CONSTRAINT chk_biz_engineering_project_safety_score
    CHECK (safety_score IS NULL OR (safety_score >= 0 AND safety_score <= 100))
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_engineering_project_code
  ON biz_engineering_project (tenant_id, project_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_engineering_project_tenant_deleted
  ON biz_engineering_project (tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_project_org
  ON biz_engineering_project (tenant_id, org_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_project_park
  ON biz_engineering_project (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_project_type
  ON biz_engineering_project (tenant_id, project_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_project_status
  ON biz_engineering_project (tenant_id, status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_project_manager
  ON biz_engineering_project (tenant_id, project_manager_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_project_contractor
  ON biz_engineering_project (tenant_id, contractor_org_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_project_planned_start
  ON biz_engineering_project (tenant_id, planned_start_date, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_project_created
  ON biz_engineering_project (tenant_id, create_time, is_deleted);
