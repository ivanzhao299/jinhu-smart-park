CREATE TABLE IF NOT EXISTS biz_leasing_waiver (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  waiver_code varchar(64) NOT NULL,
  receivable_id uuid NOT NULL REFERENCES biz_leasing_receivable(id),
  park_tenant_id uuid NOT NULL REFERENCES biz_park_tenant(id),
  waiver_amount numeric(14, 2) NOT NULL,
  reason varchar(500) NOT NULL,
  status varchar(32) NOT NULL DEFAULT '20',
  apply_by varchar(64),
  apply_time timestamptz NOT NULL DEFAULT now(),
  approve_by varchar(64),
  approve_time timestamptz,
  reject_reason varchar(500),
  approve_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT chk_biz_leasing_waiver_amount CHECK (waiver_amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_leasing_waiver_code_active
  ON biz_leasing_waiver (tenant_id, park_id, waiver_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_waiver_scope_deleted
  ON biz_leasing_waiver (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_waiver_receivable
  ON biz_leasing_waiver (tenant_id, park_id, receivable_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_waiver_tenant_company
  ON biz_leasing_waiver (tenant_id, park_id, park_tenant_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_waiver_status_apply_time
  ON biz_leasing_waiver (tenant_id, park_id, status, apply_time)
  WHERE is_deleted = false;
