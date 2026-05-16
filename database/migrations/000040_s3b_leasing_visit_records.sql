CREATE TABLE IF NOT EXISTS biz_leasing_visit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  lead_id uuid NOT NULL,
  visit_time timestamptz NOT NULL DEFAULT now(),
  visitor_count integer NOT NULL DEFAULT 1,
  reception_user_id uuid,
  reception_user_name varchar(100),
  unit_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  visit_result text,
  photo_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_biz_leasing_visit_lead FOREIGN KEY (lead_id) REFERENCES biz_leasing_lead(id)
);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_visit_scope_deleted
  ON biz_leasing_visit (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_visit_lead_time
  ON biz_leasing_visit (tenant_id, park_id, lead_id, visit_time DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_visit_reception_time
  ON biz_leasing_visit (tenant_id, park_id, reception_user_id, visit_time DESC)
  WHERE is_deleted = false;
