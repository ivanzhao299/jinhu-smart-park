CREATE TABLE IF NOT EXISTS biz_leasing_lead (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  lead_code varchar(64) NOT NULL,
  customer_name varchar(200) NOT NULL,
  contact_name varchar(100) NOT NULL,
  contact_mobile varchar(32) NOT NULL,
  contact_email varchar(120),
  source varchar(32),
  channel_name varchar(100),
  industry_code varchar(64),
  industry_detail varchar(200),
  demand_area numeric(14, 2),
  demand_price numeric(14, 2),
  demand_unit_type varchar(32),
  intention_level varchar(32),
  follow_user_id uuid,
  follow_user_name varchar(100),
  park_tenant_id uuid,
  status varchar(32) NOT NULL DEFAULT '10',
  lost_reason varchar(64),
  lost_remark varchar(500),
  last_follow_time timestamptz,
  next_follow_time timestamptz,
  expected_close_date date,
  is_in_pool boolean NOT NULL DEFAULT false,
  pool_enter_time timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_biz_leasing_lead_park_tenant FOREIGN KEY (park_tenant_id) REFERENCES biz_park_tenant(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_leasing_lead_code
  ON biz_leasing_lead (tenant_id, park_id, lead_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_scope_deleted
  ON biz_leasing_lead (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_duplicate
  ON biz_leasing_lead (tenant_id, park_id, customer_name, contact_mobile)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_status
  ON biz_leasing_lead (tenant_id, park_id, status)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_source
  ON biz_leasing_lead (tenant_id, park_id, source)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_intention
  ON biz_leasing_lead (tenant_id, park_id, intention_level)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_follow_user
  ON biz_leasing_lead (tenant_id, park_id, follow_user_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_pool
  ON biz_leasing_lead (tenant_id, park_id, is_in_pool)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_park_tenant
  ON biz_leasing_lead (tenant_id, park_id, park_tenant_id)
  WHERE is_deleted = false;
