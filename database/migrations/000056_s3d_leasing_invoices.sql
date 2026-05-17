CREATE TABLE IF NOT EXISTS biz_leasing_invoice (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  invoice_code varchar(64) NOT NULL,
  park_tenant_id uuid NOT NULL REFERENCES biz_park_tenant(id),
  invoice_type varchar(32) NOT NULL,
  buyer_name varchar(200) NOT NULL,
  buyer_tax_no varchar(64),
  amount numeric(14, 2) NOT NULL,
  tax_rate numeric(8, 4) NOT NULL DEFAULT 0,
  invoice_no varchar(100),
  invoice_date date NOT NULL,
  file_id uuid REFERENCES sys_file(id),
  status varchar(32) NOT NULL DEFAULT '30',
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT chk_biz_leasing_invoice_amount CHECK (amount > 0 AND tax_rate >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_leasing_invoice_code_active
  ON biz_leasing_invoice (tenant_id, park_id, invoice_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_invoice_scope_deleted
  ON biz_leasing_invoice (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_invoice_tenant_company
  ON biz_leasing_invoice (tenant_id, park_id, park_tenant_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_invoice_status_date
  ON biz_leasing_invoice (tenant_id, park_id, status, invoice_date)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS rel_leasing_invoice_receivable (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  invoice_id uuid NOT NULL REFERENCES biz_leasing_invoice(id),
  receivable_id uuid NOT NULL REFERENCES biz_leasing_receivable(id),
  invoice_amount numeric(14, 2) NOT NULL,
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT chk_rel_leasing_invoice_receivable_amount CHECK (invoice_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_rel_leasing_invoice_receivable_scope_deleted
  ON rel_leasing_invoice_receivable (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_rel_leasing_invoice_receivable_invoice
  ON rel_leasing_invoice_receivable (tenant_id, park_id, invoice_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rel_leasing_invoice_receivable_receivable
  ON rel_leasing_invoice_receivable (tenant_id, park_id, receivable_id)
  WHERE is_deleted = false;
