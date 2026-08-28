BEGIN;

ALTER TABLE hr_employee_profile
  ADD COLUMN legacy_source_identity_sha256 char(64),
  ADD COLUMN legacy_source_row_sha256 char(64),
  ADD CONSTRAINT ck_hr_employee_profile_legacy_source_identity CHECK(legacy_source_identity_sha256 IS NULL OR legacy_source_identity_sha256~'^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_hr_employee_profile_legacy_source_row CHECK(legacy_source_row_sha256 IS NULL OR legacy_source_row_sha256~'^[0-9a-f]{64}$');
CREATE UNIQUE INDEX uq_hr_employee_profile_legacy_source ON hr_employee_profile(tenant_id,park_id,legacy_source_identity_sha256) WHERE legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false;

ALTER TABLE hr_employee_family
  ADD COLUMN birth_date date,
  ADD COLUMN work_unit varchar(200),
  ADD COLUMN job_title varchar(160),
  ADD COLUMN political_status varchar(64),
  ADD COLUMN legacy_source_identity_sha256 char(64),
  ADD COLUMN legacy_source_row_sha256 char(64),
  ADD CONSTRAINT ck_hr_employee_family_legacy_source_identity CHECK(legacy_source_identity_sha256 IS NULL OR legacy_source_identity_sha256~'^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_hr_employee_family_legacy_source_row CHECK(legacy_source_row_sha256 IS NULL OR legacy_source_row_sha256~'^[0-9a-f]{64}$');
CREATE UNIQUE INDEX uq_hr_employee_family_legacy_source ON hr_employee_family(tenant_id,park_id,legacy_source_identity_sha256) WHERE legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false;

ALTER TABLE hr_employee_skill
  ADD COLUMN legacy_grade varchar(64),
  ADD COLUMN note varchar(2000),
  ADD COLUMN legacy_source_identity_sha256 char(64),
  ADD COLUMN legacy_source_row_sha256 char(64),
  ADD CONSTRAINT ck_hr_employee_skill_legacy_source_identity CHECK(legacy_source_identity_sha256 IS NULL OR legacy_source_identity_sha256~'^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_hr_employee_skill_legacy_source_row CHECK(legacy_source_row_sha256 IS NULL OR legacy_source_row_sha256~'^[0-9a-f]{64}$');
CREATE UNIQUE INDEX uq_hr_employee_skill_legacy_source ON hr_employee_skill(tenant_id,park_id,legacy_source_identity_sha256) WHERE legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false;

ALTER TABLE hr_employee_credential
  ADD COLUMN note varchar(2000),
  ADD COLUMN legacy_file_reference_sha256 char(64),
  ADD COLUMN legacy_source_identity_sha256 char(64),
  ADD COLUMN legacy_source_row_sha256 char(64),
  ADD CONSTRAINT ck_hr_employee_credential_legacy_file CHECK(legacy_file_reference_sha256 IS NULL OR legacy_file_reference_sha256~'^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_hr_employee_credential_legacy_source_identity CHECK(legacy_source_identity_sha256 IS NULL OR legacy_source_identity_sha256~'^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_hr_employee_credential_legacy_source_row CHECK(legacy_source_row_sha256 IS NULL OR legacy_source_row_sha256~'^[0-9a-f]{64}$');
CREATE UNIQUE INDEX uq_hr_employee_credential_legacy_source ON hr_employee_credential(tenant_id,park_id,legacy_source_identity_sha256) WHERE legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false;

CREATE TABLE hr_legacy_employee_materialization_gap(
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
  source_table varchar(128) NOT NULL,source_identity_sha256 char(64) NOT NULL,source_row_sha256 char(64) NOT NULL,
  field_locator varchar(160) NOT NULL,reason_code varchar(64) NOT NULL,create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_legacy_employee_gap_source CHECK(source_table IN('dbo.person.core_residue','dbo.family','dbo.knowhow','dbo.ticket')),
  CONSTRAINT ck_hr_legacy_employee_gap_identity CHECK(source_identity_sha256~'^[0-9a-f]{64}$' AND source_row_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_legacy_employee_gap_reason CHECK(reason_code IN('UNKNOWN_FIELD_SEMANTICS','UNKNOWN_SKILL_GRADE','EMPLOYEE_NOT_MAPPED','INVALID_STRUCTURED_VALUE')),
  CONSTRAINT uq_hr_legacy_employee_gap UNIQUE(tenant_id,park_id,source_identity_sha256,field_locator)
);
CREATE INDEX ix_hr_legacy_employee_gap_scope ON hr_legacy_employee_materialization_gap(tenant_id,park_id,source_table,reason_code);

COMMIT;
