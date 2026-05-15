CREATE TABLE IF NOT EXISTS biz_unit_status_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  unit_id uuid NOT NULL REFERENCES biz_unit(id),
  before_status smallint NOT NULL DEFAULT 0,
  after_status smallint NOT NULL DEFAULT 0,
  reason varchar(500) NOT NULL DEFAULT '',
  source_type varchar(32) NOT NULL DEFAULT 'manual',
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

ALTER TABLE biz_unit
  ADD COLUMN IF NOT EXISTS lock_reason varchar(500),
  ADD COLUMN IF NOT EXISTS lock_expire_time timestamptz,
  ADD COLUMN IF NOT EXISTS status_update_time timestamptz,
  ADD COLUMN IF NOT EXISTS status_update_by varchar(64);

ALTER TABLE biz_unit_status_log
  ADD COLUMN IF NOT EXISTS before_status smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS after_status smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reason varchar(500) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_type varchar(32) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS operator_id varchar(64),
  ADD COLUMN IF NOT EXISTS operator_name varchar(100),
  ADD COLUMN IF NOT EXISTS op_time timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'biz_unit_status_log' AND column_name = 'from_status'
  ) THEN
    UPDATE biz_unit_status_log
       SET before_status = from_status
     WHERE before_status = 0;
    EXECUTE 'ALTER TABLE biz_unit_status_log ALTER COLUMN from_status DROP NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'biz_unit_status_log' AND column_name = 'to_status'
  ) THEN
    UPDATE biz_unit_status_log
       SET after_status = to_status
     WHERE after_status = 0;
    EXECUTE 'ALTER TABLE biz_unit_status_log ALTER COLUMN to_status DROP NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_biz_unit_status_log_scope_deleted
  ON biz_unit_status_log (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_unit_status_log_scope_unit_time
  ON biz_unit_status_log (tenant_id, park_id, unit_id, op_time DESC);

CREATE INDEX IF NOT EXISTS idx_biz_unit_status_log_scope_unit_op_time
  ON biz_unit_status_log (tenant_id, park_id, unit_id, op_time DESC);

CREATE INDEX IF NOT EXISTS idx_biz_unit_status_log_scope_status
  ON biz_unit_status_log (tenant_id, park_id, after_status, is_deleted);
