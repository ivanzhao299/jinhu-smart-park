BEGIN;

-- Preserve the source job-state dimension instead of collapsing legacy-only
-- values into an opaque remark.  The modern lifecycle status remains the
-- operational state; these columns are compatibility/read-model evidence.
ALTER TABLE hr_employee
  ADD COLUMN IF NOT EXISTS legacy_jobstate_code varchar(8),
  ADD COLUMN IF NOT EXISTS legacy_jobstate_name varchar(64);

ALTER TABLE hr_employee
  DROP CONSTRAINT IF EXISTS ck_hr_employee_type;

ALTER TABLE hr_employee
  ADD CONSTRAINT ck_hr_employee_type
  CHECK (employment_type IN ('full_time','part_time','intern','contractor','temporary'));

CREATE INDEX IF NOT EXISTS ix_hr_employee_legacy_jobstate
  ON hr_employee(tenant_id,park_id,legacy_jobstate_code)
  WHERE is_deleted=false AND legacy_jobstate_code IS NOT NULL;

COMMENT ON COLUMN hr_employee.legacy_jobstate_code IS
  'Yuzhou dbo.person.jobstate code retained for compatibility queries; not an operational lifecycle override.';
COMMENT ON COLUMN hr_employee.legacy_jobstate_name IS
  'Yuzhou dbo.jobstatecode.jobstatename retained alongside the normalized employment status.';

COMMIT;
