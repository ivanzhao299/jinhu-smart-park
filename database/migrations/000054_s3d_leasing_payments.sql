CREATE TABLE IF NOT EXISTS biz_leasing_payment (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  pay_code varchar(64) NOT NULL,
  park_tenant_id uuid NOT NULL REFERENCES biz_park_tenant(id),
  pay_time timestamptz NOT NULL,
  pay_method varchar(32) NOT NULL,
  pay_amount numeric(14, 2) NOT NULL DEFAULT 0,
  unapplied_amount numeric(14, 2) NOT NULL DEFAULT 0,
  payer_name varchar(100),
  bank_serial varchar(100),
  receipt_file_id uuid REFERENCES sys_file(id),
  status varchar(32) NOT NULL DEFAULT '10',
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT chk_biz_leasing_payment_amounts CHECK (pay_amount > 0 AND unapplied_amount >= 0 AND unapplied_amount <= pay_amount)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_leasing_payment_code_active
  ON biz_leasing_payment (tenant_id, park_id, pay_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_payment_scope_deleted
  ON biz_leasing_payment (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_payment_tenant_company
  ON biz_leasing_payment (tenant_id, park_id, park_tenant_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_payment_status_time
  ON biz_leasing_payment (tenant_id, park_id, status, pay_time)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS rel_leasing_payment_receivable (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  payment_id uuid NOT NULL REFERENCES biz_leasing_payment(id),
  receivable_id uuid NOT NULL REFERENCES biz_leasing_receivable(id),
  applied_amount numeric(14, 2) NOT NULL,
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT chk_rel_leasing_payment_receivable_amount CHECK (applied_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_rel_leasing_payment_receivable_scope_deleted
  ON rel_leasing_payment_receivable (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_rel_leasing_payment_receivable_payment
  ON rel_leasing_payment_receivable (tenant_id, park_id, payment_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rel_leasing_payment_receivable_receivable
  ON rel_leasing_payment_receivable (tenant_id, park_id, receivable_id)
  WHERE is_deleted = false;
