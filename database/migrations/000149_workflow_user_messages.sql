CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS biz_user_message (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  recipient_id uuid NOT NULL,
  recipient_name varchar(100),
  sender_id uuid,
  sender_name varchar(100),
  category varchar(64) NOT NULL DEFAULT 'workflow',
  priority varchar(32) NOT NULL DEFAULT 'normal',
  source_type varchar(64) NOT NULL,
  source_id uuid,
  biz_type varchar(64) NOT NULL,
  biz_id uuid,
  action varchar(64),
  title varchar(200) NOT NULL,
  content text,
  target_url varchar(255),
  read_at timestamptz,
  archived_at timestamptz,
  unique_key varchar(180) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_user_message_unique_key
  ON biz_user_message (tenant_id, park_id, recipient_id, unique_key)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_user_message_recipient_read
  ON biz_user_message (tenant_id, park_id, recipient_id, read_at, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_user_message_source
  ON biz_user_message (tenant_id, park_id, source_type, source_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_user_message_created
  ON biz_user_message (tenant_id, park_id, recipient_id, create_time DESC)
  WHERE is_deleted = false;
