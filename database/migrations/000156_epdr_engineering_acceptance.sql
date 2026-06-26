CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS biz_engineering_acceptance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  org_id uuid NULL,
  project_id uuid NOT NULL,
  plan_id uuid NULL,
  acceptance_code varchar(64) NOT NULL,
  acceptance_name varchar(200) NOT NULL,
  acceptance_type varchar(40) NOT NULL,
  acceptance_status varchar(40) NOT NULL DEFAULT 'DRAFT',
  risk_level varchar(32) NOT NULL DEFAULT 'MEDIUM',
  planned_acceptance_date date NOT NULL,
  actual_acceptance_date date NULL,
  description text NULL,
  acceptance_scope text NULL,
  acceptance_criteria text NULL,
  result_summary text NULL,
  review_comment text NULL,
  responsible_user_id uuid NULL,
  acceptance_org_id uuid NULL,
  contractor_org_id uuid NULL,
  supervisor_org_id uuid NULL,
  location_text varchar(300) NULL,
  building_id uuid NULL,
  floor_id uuid NULL,
  space_id uuid NULL,
  submitted_at timestamptz NULL,
  submitted_by uuid NULL,
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL,
  closed_at timestamptz NULL,
  closed_by uuid NULL,
  workflow_instance_id uuid NULL,
  attachment_ids jsonb NULL,
  remark varchar(500) NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  create_by uuid NULL,
  update_by uuid NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_engineering_acceptance_code
  ON biz_engineering_acceptance (tenant_id, acceptance_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_engineering_acceptance_tenant_deleted
  ON biz_engineering_acceptance (tenant_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_acceptance_org
  ON biz_engineering_acceptance (tenant_id, org_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_acceptance_park
  ON biz_engineering_acceptance (tenant_id, park_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_acceptance_project
  ON biz_engineering_acceptance (tenant_id, project_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_acceptance_plan
  ON biz_engineering_acceptance (tenant_id, plan_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_acceptance_type
  ON biz_engineering_acceptance (tenant_id, acceptance_type, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_acceptance_status
  ON biz_engineering_acceptance (tenant_id, acceptance_status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_acceptance_date
  ON biz_engineering_acceptance (tenant_id, planned_acceptance_date, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_acceptance_responsible
  ON biz_engineering_acceptance (tenant_id, responsible_user_id, is_deleted);
