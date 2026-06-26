CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS biz_engineering_event_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid NOT NULL,
  event_type varchar(100) NOT NULL,
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  project_id uuid NULL,
  entity_id uuid NOT NULL,
  actor_user_id uuid NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_engineering_event_log_event_id
  ON biz_engineering_event_log (event_id);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_event_log_scope
  ON biz_engineering_event_log (tenant_id, park_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_event_log_project
  ON biz_engineering_event_log (tenant_id, park_id, project_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_event_log_entity
  ON biz_engineering_event_log (tenant_id, entity_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_biz_engineering_event_log_type
  ON biz_engineering_event_log (tenant_id, event_type, occurred_at);
