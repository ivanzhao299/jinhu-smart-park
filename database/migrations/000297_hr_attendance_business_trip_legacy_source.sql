BEGIN;

ALTER TABLE hr_attendance_request
  ADD COLUMN IF NOT EXISTS is_historical_import boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_source_table varchar(64),
  ADD COLUMN IF NOT EXISTS legacy_source_id integer,
  ADD COLUMN IF NOT EXISTS legacy_declared_days integer,
  ADD COLUMN IF NOT EXISTS legacy_source_identity_sha256 char(64),
  ADD COLUMN IF NOT EXISTS legacy_source_row_sha256 char(64);

ALTER TABLE hr_attendance_request
  DROP CONSTRAINT IF EXISTS ck_hr_attendance_request_legacy_identity,
  DROP CONSTRAINT IF EXISTS ck_hr_attendance_request_legacy_row,
  DROP CONSTRAINT IF EXISTS ck_hr_attendance_request_legacy_shape;

ALTER TABLE hr_attendance_request
  ADD CONSTRAINT ck_hr_attendance_request_legacy_identity CHECK (
    legacy_source_identity_sha256 IS NULL
    OR legacy_source_identity_sha256 ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT ck_hr_attendance_request_legacy_row CHECK (
    legacy_source_row_sha256 IS NULL
    OR legacy_source_row_sha256 ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT ck_hr_attendance_request_legacy_shape CHECK (
    (
      NOT is_historical_import
      AND legacy_source_table IS NULL
      AND legacy_source_id IS NULL
      AND legacy_declared_days IS NULL
      AND legacy_source_identity_sha256 IS NULL
      AND legacy_source_row_sha256 IS NULL
    )
    OR
    (
      is_historical_import
      AND request_type = 'business_trip'
      AND legacy_source_table = 'dbo.errand'
      AND legacy_source_id IS NOT NULL
      AND legacy_source_identity_sha256 IS NOT NULL
      AND legacy_source_row_sha256 IS NOT NULL
      AND approval_request_id IS NULL
      AND status = 'approved'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_request_legacy_source_id
  ON hr_attendance_request(tenant_id, park_id, legacy_source_table, legacy_source_id)
  WHERE is_historical_import AND is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_request_legacy_source_identity
  ON hr_attendance_request(tenant_id, park_id, legacy_source_identity_sha256)
  WHERE legacy_source_identity_sha256 IS NOT NULL AND is_deleted = false;

COMMENT ON COLUMN hr_attendance_request.legacy_declared_days IS
  'Nullable dbo.errand.days value preserved verbatim; never derived from duration_minutes.';
COMMENT ON COLUMN hr_attendance_request.legacy_source_identity_sha256 IS
  'Stable legacy source identity used with legacy_record_map for audited load and rollback.';
COMMENT ON COLUMN hr_attendance_request.legacy_source_row_sha256 IS
  'Canonical source row digest used to reject rollback against changed evidence.';

COMMIT;
