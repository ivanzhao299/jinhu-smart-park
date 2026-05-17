CREATE TABLE IF NOT EXISTS biz_leasing_receivable (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  ar_code varchar(64) NOT NULL,
  contract_id uuid REFERENCES biz_leasing_contract(id),
  park_tenant_id uuid NOT NULL REFERENCES biz_park_tenant(id),
  fee_type varchar(32) NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  amount_due numeric(14, 2) NOT NULL DEFAULT 0,
  amount_paid numeric(14, 2) NOT NULL DEFAULT 0,
  amount_waived numeric(14, 2) NOT NULL DEFAULT 0,
  amount_remain numeric(14, 2) NOT NULL DEFAULT 0,
  late_fee numeric(14, 2) NOT NULL DEFAULT 0,
  invoice_status varchar(32) NOT NULL DEFAULT '10',
  overdue_days integer NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT '10',
  source_type varchar(32) NOT NULL DEFAULT 'manual',
  source_id uuid,
  generate_batch_no varchar(64),
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT chk_biz_leasing_receivable_period CHECK (period_start <= period_end),
  CONSTRAINT chk_biz_leasing_receivable_amounts CHECK (
    amount_due >= 0
    AND amount_paid >= 0
    AND amount_waived >= 0
    AND amount_remain >= 0
    AND late_fee >= 0
    AND overdue_days >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_leasing_receivable_code_active
  ON biz_leasing_receivable (tenant_id, park_id, ar_code)
  WHERE is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_leasing_receivable_contract_period_active
  ON biz_leasing_receivable (tenant_id, park_id, contract_id, fee_type, period_start, period_end)
  WHERE is_deleted = false AND contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_receivable_scope_deleted
  ON biz_leasing_receivable (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_receivable_tenant_company
  ON biz_leasing_receivable (tenant_id, park_id, park_tenant_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_receivable_contract
  ON biz_leasing_receivable (tenant_id, park_id, contract_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_receivable_status_due
  ON biz_leasing_receivable (tenant_id, park_id, status, due_date)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_receivable_invoice
  ON biz_leasing_receivable (tenant_id, park_id, invoice_status)
  WHERE is_deleted = false;
