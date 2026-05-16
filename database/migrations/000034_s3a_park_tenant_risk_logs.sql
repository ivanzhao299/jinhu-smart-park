CREATE TABLE IF NOT EXISTS biz_park_tenant_risk_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  park_tenant_id uuid NOT NULL,
  before_risk_level varchar(32),
  after_risk_level varchar(32) NOT NULL,
  before_risk_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  after_risk_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason varchar(500) NOT NULL,
  operator_id varchar(64),
  operator_name varchar(100),
  op_time timestamptz NOT NULL DEFAULT now(),
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_biz_park_tenant_risk_log_tenant
    FOREIGN KEY (park_tenant_id) REFERENCES biz_park_tenant(id)
);

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_risk_log_scope_deleted
  ON biz_park_tenant_risk_log (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_risk_log_parent_time
  ON biz_park_tenant_risk_log (tenant_id, park_id, park_tenant_id, op_time DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_risk_log_after_level
  ON biz_park_tenant_risk_log (tenant_id, park_id, after_risk_level)
  WHERE is_deleted = false;
