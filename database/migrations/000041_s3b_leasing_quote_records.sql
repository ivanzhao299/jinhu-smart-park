CREATE TABLE IF NOT EXISTS biz_leasing_quote (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  lead_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  quote_price numeric(14, 2) NOT NULL DEFAULT 0,
  quote_period varchar(100),
  free_rent_months numeric(8, 2) NOT NULL DEFAULT 0,
  deposit_months numeric(8, 2) NOT NULL DEFAULT 0,
  payment_period varchar(32),
  property_fee_price numeric(14, 2) NOT NULL DEFAULT 0,
  quote_status varchar(32) NOT NULL DEFAULT '10',
  approve_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  submit_time timestamptz,
  approve_time timestamptz,
  approve_by uuid,
  reject_reason varchar(500),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_biz_leasing_quote_lead FOREIGN KEY (lead_id) REFERENCES biz_leasing_lead(id),
  CONSTRAINT fk_biz_leasing_quote_unit FOREIGN KEY (unit_id) REFERENCES biz_unit(id)
);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_quote_scope_deleted
  ON biz_leasing_quote (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_quote_lead_status
  ON biz_leasing_quote (tenant_id, park_id, lead_id, quote_status)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_quote_unit
  ON biz_leasing_quote (tenant_id, park_id, unit_id)
  WHERE is_deleted = false;
