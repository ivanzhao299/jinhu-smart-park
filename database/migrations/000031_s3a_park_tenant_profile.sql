CREATE TABLE IF NOT EXISTS biz_park_tenant (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  park_tenant_code varchar(64) NOT NULL,
  company_name varchar(200) NOT NULL,
  unified_credit_code varchar(32),
  legal_person varchar(100),
  legal_person_id varchar(32),
  contact_name varchar(100),
  contact_mobile varchar(32),
  contact_email varchar(120),
  industry_code varchar(64),
  industry_detail varchar(200),
  business_scope text,
  tenant_type varchar(32),
  risk_level varchar(32),
  risk_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  check_in_date date,
  check_out_date date,
  status varchar(32) NOT NULL DEFAULT 'active',
  source_type varchar(32) NOT NULL DEFAULT 'manual',
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_park_tenant_code
  ON biz_park_tenant (tenant_id, park_id, park_tenant_code)
  WHERE is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_park_tenant_credit
  ON biz_park_tenant (tenant_id, park_id, unified_credit_code)
  WHERE is_deleted = false AND unified_credit_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_scope_deleted
  ON biz_park_tenant (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_status
  ON biz_park_tenant (tenant_id, park_id, status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_type
  ON biz_park_tenant (tenant_id, park_id, tenant_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_risk
  ON biz_park_tenant (tenant_id, park_id, risk_level, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_park_tenant_industry
  ON biz_park_tenant (tenant_id, park_id, industry_code, is_deleted);
