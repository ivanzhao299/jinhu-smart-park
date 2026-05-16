CREATE TABLE IF NOT EXISTS biz_leasing_lead_status_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  lead_id uuid NOT NULL,
  before_status varchar(32) NOT NULL,
  after_status varchar(32) NOT NULL,
  reason varchar(500) NOT NULL,
  operator_id uuid,
  operator_name varchar(100),
  op_time timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_biz_leasing_lead_status_log_lead FOREIGN KEY (lead_id) REFERENCES biz_leasing_lead(id)
);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_status_log_scope_deleted
  ON biz_leasing_lead_status_log (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_lead_status_log_lead_time
  ON biz_leasing_lead_status_log (tenant_id, park_id, lead_id, op_time DESC)
  WHERE is_deleted = false;

UPDATE biz_leasing_lead
SET status = CASE status
  WHEN '30' THEN '40'
  WHEN '40' THEN '50'
  WHEN '50' THEN '78'
  WHEN '90' THEN '91'
  ELSE status
END,
update_time = now()
WHERE status IN ('30', '40', '50', '90');
