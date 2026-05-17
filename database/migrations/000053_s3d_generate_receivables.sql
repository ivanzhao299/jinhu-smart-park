CREATE TABLE IF NOT EXISTS biz_leasing_receivable_status_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  receivable_id uuid NOT NULL REFERENCES biz_leasing_receivable(id),
  before_status varchar(32),
  after_status varchar(32) NOT NULL,
  action varchar(32) NOT NULL,
  reason varchar(500),
  operator_id varchar(64),
  operator_name varchar(100),
  op_time timestamptz NOT NULL DEFAULT now(),
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_receivable_status_log_scope_deleted
  ON biz_leasing_receivable_status_log (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_receivable_status_log_receivable_time
  ON biz_leasing_receivable_status_log (tenant_id, park_id, receivable_id, op_time DESC)
  WHERE is_deleted = false;
