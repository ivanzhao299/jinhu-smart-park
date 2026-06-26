CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS biz_engineering_project_status_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  project_id uuid NOT NULL,
  from_status varchar(32) NOT NULL,
  to_status varchar(32) NOT NULL,
  action varchar(64) NOT NULL,
  reason varchar(500) NOT NULL,
  comment text,
  actor_user_id uuid NOT NULL,
  actor_name varchar(100),
  workflow_instance_id uuid,
  request_id varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_project_status_log_scope
  ON biz_engineering_project_status_log (tenant_id, park_id, project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_project_status_log_actor
  ON biz_engineering_project_status_log (tenant_id, park_id, actor_user_id, created_at);
