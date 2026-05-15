ALTER TABLE biz_unit
  ADD COLUMN IF NOT EXISTS code varchar(64);

UPDATE biz_unit
SET code = unit_code
WHERE code IS NULL
  AND unit_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biz_unit_scope_code_active
  ON biz_unit (tenant_id, park_id, code)
  WHERE is_deleted = false;
