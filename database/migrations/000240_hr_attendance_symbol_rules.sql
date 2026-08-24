BEGIN;
CREATE TABLE IF NOT EXISTS hr_attendance_symbol_rule(
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  rule_version varchar(32) NOT NULL,
  legacy_symbol varchar(64) NOT NULL,
  normalized_kind varchar(32) NOT NULL,
  effective_from date,
  effective_to date,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  is_historical_import boolean NOT NULL DEFAULT true,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_hr_attendance_symbol_rule_status CHECK(status IN('enabled','disabled')),
  CONSTRAINT ck_hr_attendance_symbol_rule_dates CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to>=effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_symbol_rule
  ON hr_attendance_symbol_rule(tenant_id,park_id,rule_version,legacy_symbol)
  WHERE is_deleted=false;
COMMIT;
