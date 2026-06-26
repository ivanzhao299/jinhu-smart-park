CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS biz_engineering_inspection (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  org_id uuid NULL,
  project_id uuid NOT NULL,
  plan_id uuid NULL,
  daily_report_id uuid NULL,
  inspection_code varchar(64) NOT NULL,
  inspection_title varchar(200) NOT NULL,
  inspection_type varchar(32) NOT NULL,
  inspection_date date NOT NULL,
  inspector_user_id uuid NULL,
  inspector_org_id uuid NULL,
  contractor_org_id uuid NULL,
  supervisor_org_id uuid NULL,
  location_text varchar(300) NULL,
  building_id uuid NULL,
  floor_id uuid NULL,
  space_id uuid NULL,
  inspection_status varchar(32) NOT NULL DEFAULT 'DRAFT',
  summary text NULL,
  overall_result varchar(64) NULL,
  issue_count integer NOT NULL DEFAULT 0,
  critical_issue_count integer NOT NULL DEFAULT 0,
  attachment_ids jsonb NULL,
  submitted_at timestamptz NULL,
  submitted_by uuid NULL,
  create_by uuid NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid NULL,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500) NULL,
  CONSTRAINT chk_biz_engineering_inspection_issue_count CHECK (issue_count >= 0),
  CONSTRAINT chk_biz_engineering_inspection_critical_issue_count CHECK (critical_issue_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_engineering_inspection_code
  ON biz_engineering_inspection (tenant_id, inspection_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_engineering_inspection_tenant_deleted
  ON biz_engineering_inspection (tenant_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_inspection_org
  ON biz_engineering_inspection (tenant_id, org_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_inspection_project
  ON biz_engineering_inspection (tenant_id, project_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_inspection_plan
  ON biz_engineering_inspection (tenant_id, plan_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_inspection_daily_report
  ON biz_engineering_inspection (tenant_id, daily_report_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_inspection_date
  ON biz_engineering_inspection (tenant_id, inspection_date, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_inspection_status
  ON biz_engineering_inspection (tenant_id, inspection_status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_inspection_type
  ON biz_engineering_inspection (tenant_id, inspection_type, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_inspection_inspector
  ON biz_engineering_inspection (tenant_id, inspector_user_id, is_deleted);

CREATE TABLE IF NOT EXISTS biz_engineering_issue (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  org_id uuid NULL,
  project_id uuid NOT NULL,
  inspection_id uuid NULL,
  plan_id uuid NULL,
  daily_report_id uuid NULL,
  issue_code varchar(64) NOT NULL,
  issue_title varchar(200) NOT NULL,
  issue_type varchar(32) NOT NULL,
  severity varchar(32) NOT NULL,
  issue_status varchar(32) NOT NULL DEFAULT 'OPEN',
  description text NOT NULL,
  location_text varchar(300) NULL,
  building_id uuid NULL,
  floor_id uuid NULL,
  space_id uuid NULL,
  responsible_user_id uuid NULL,
  responsible_org_id uuid NULL,
  contractor_org_id uuid NULL,
  supervisor_org_id uuid NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  deadline date NULL,
  rectification_id uuid NULL,
  source_type varchar(32) NOT NULL DEFAULT 'INSPECTION',
  source_id uuid NULL,
  attachment_ids jsonb NULL,
  closed_at timestamptz NULL,
  closed_by uuid NULL,
  create_by uuid NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid NULL,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500) NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_engineering_issue_code
  ON biz_engineering_issue (tenant_id, issue_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_tenant_deleted
  ON biz_engineering_issue (tenant_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_org
  ON biz_engineering_issue (tenant_id, org_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_project
  ON biz_engineering_issue (tenant_id, project_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_inspection
  ON biz_engineering_issue (tenant_id, inspection_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_plan
  ON biz_engineering_issue (tenant_id, plan_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_daily_report
  ON biz_engineering_issue (tenant_id, daily_report_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_type
  ON biz_engineering_issue (tenant_id, issue_type, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_severity
  ON biz_engineering_issue (tenant_id, severity, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_status
  ON biz_engineering_issue (tenant_id, issue_status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_responsible_user
  ON biz_engineering_issue (tenant_id, responsible_user_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_responsible_org
  ON biz_engineering_issue (tenant_id, responsible_org_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_biz_engineering_issue_deadline
  ON biz_engineering_issue (tenant_id, deadline, is_deleted);
