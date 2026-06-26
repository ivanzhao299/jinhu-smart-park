CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS biz_engineering_rectification (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  org_id uuid NULL,
  project_id uuid NOT NULL,
  issue_id uuid NULL,
  inspection_id uuid NULL,
  rectification_code varchar(64) NOT NULL,
  rectification_title varchar(200) NOT NULL,
  description text NOT NULL,
  severity varchar(32) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'PENDING',
  responsible_user_id uuid NULL,
  responsible_org_id uuid NULL,
  contractor_org_id uuid NULL,
  supervisor_org_id uuid NULL,
  location_text varchar(300) NULL,
  building_id uuid NULL,
  floor_id uuid NULL,
  space_id uuid NULL,
  deadline date NULL,
  started_at timestamptz NULL,
  submitted_at timestamptz NULL,
  submitted_by uuid NULL,
  feedback text NULL,
  rechecked_at timestamptz NULL,
  rechecked_by uuid NULL,
  recheck_comment text NULL,
  closed_at timestamptz NULL,
  closed_by uuid NULL,
  attachment_ids jsonb NULL,
  remark varchar(500) NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  create_by uuid NULL,
  update_by uuid NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_engineering_rectification_code
  ON biz_engineering_rectification (tenant_id, rectification_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_engineering_rectification_tenant_deleted
  ON biz_engineering_rectification (tenant_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_rectification_org
  ON biz_engineering_rectification (tenant_id, org_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_rectification_project
  ON biz_engineering_rectification (tenant_id, project_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_rectification_issue
  ON biz_engineering_rectification (tenant_id, issue_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_rectification_inspection
  ON biz_engineering_rectification (tenant_id, inspection_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_rectification_status
  ON biz_engineering_rectification (tenant_id, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_rectification_responsible_user
  ON biz_engineering_rectification (tenant_id, responsible_user_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_rectification_responsible_org
  ON biz_engineering_rectification (tenant_id, responsible_org_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_rectification_deadline
  ON biz_engineering_rectification (tenant_id, deadline, is_deleted);
