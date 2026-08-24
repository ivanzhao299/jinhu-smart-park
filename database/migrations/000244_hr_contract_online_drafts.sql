BEGIN;

ALTER TABLE hr_contract_change
  ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'effective';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_hr_contract_change_status'
      AND conrelid = 'hr_contract_change'::regclass
  ) THEN
    ALTER TABLE hr_contract_change
      ADD CONSTRAINT ck_hr_contract_change_status
      CHECK (status IN ('draft','effective','cancelled'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_contract_change_one_draft
  ON hr_contract_change(tenant_id,park_id,contract_id)
  WHERE is_deleted=false AND status='draft';

COMMIT;
