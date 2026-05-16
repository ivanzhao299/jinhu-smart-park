CREATE TABLE IF NOT EXISTS biz_leasing_follow (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  lead_id uuid NOT NULL,
  follow_time timestamptz NOT NULL DEFAULT now(),
  follow_user_id uuid,
  follow_user_name varchar(100),
  follow_type varchar(32),
  content text NOT NULL,
  next_action varchar(500),
  next_follow_time timestamptz,
  attachment_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_biz_leasing_follow_lead FOREIGN KEY (lead_id) REFERENCES biz_leasing_lead(id)
);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_follow_scope_deleted
  ON biz_leasing_follow (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_follow_lead_time
  ON biz_leasing_follow (tenant_id, park_id, lead_id, follow_time DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_follow_user_time
  ON biz_leasing_follow (tenant_id, park_id, follow_user_id, follow_time DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_follow_type
  ON biz_leasing_follow (tenant_id, park_id, follow_type)
  WHERE is_deleted = false;
