BEGIN;

ALTER TABLE hr_employment_event
  ADD COLUMN IF NOT EXISTS legacy_event_no varchar(64),
  ADD COLUMN IF NOT EXISTS legacy_event_type varchar(32),
  ADD COLUMN IF NOT EXISTS legacy_state varchar(32),
  ADD COLUMN IF NOT EXISTS source_effective_at timestamp,
  ADD COLUMN IF NOT EXISTS migration_decision varchar(32),
  ADD COLUMN IF NOT EXISTS is_historical_import boolean NOT NULL DEFAULT false;

ALTER TABLE hr_employment_event
  DROP CONSTRAINT IF EXISTS ck_hr_employment_event_migration_decision;
ALTER TABLE hr_employment_event
  ADD CONSTRAINT ck_hr_employment_event_migration_decision CHECK (
    (is_historical_import AND migration_decision IN ('accepted','needs_review'))
    OR (NOT is_historical_import AND migration_decision IS NULL)
  );

ALTER TABLE hr_employment_event
  DROP CONSTRAINT IF EXISTS ck_hr_employment_event_legacy_identity;
ALTER TABLE hr_employment_event
  ADD CONSTRAINT ck_hr_employment_event_legacy_identity CHECK (
    (is_historical_import AND legacy_event_no IS NOT NULL AND legacy_event_type IS NOT NULL AND source_effective_at IS NOT NULL)
    OR (NOT is_historical_import AND legacy_event_no IS NULL AND legacy_event_type IS NULL AND legacy_state IS NULL AND source_effective_at IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employment_event_legacy_no
  ON hr_employment_event(tenant_id,park_id,legacy_event_no)
  WHERE is_deleted=false AND is_historical_import=true;

CREATE INDEX IF NOT EXISTS idx_hr_employment_event_legacy_type
  ON hr_employment_event(tenant_id,park_id,legacy_event_type,source_effective_at)
  WHERE is_deleted=false AND is_historical_import=true;

COMMIT;
