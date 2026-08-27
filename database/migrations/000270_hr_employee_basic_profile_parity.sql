BEGIN;

ALTER TABLE hr_employee_profile
  ADD COLUMN id_number_encrypted text,
  ADD COLUMN id_number_fingerprint varchar(96),
  ADD COLUMN english_name varchar(100),
  ADD COLUMN gender varchar(32),
  ADD COLUMN date_of_birth date,
  ADD COLUMN ethnicity varchar(64),
  ADD COLUMN native_place varchar(128),
  ADD COLUMN political_status varchar(64),
  ADD COLUMN party_join_date date,
  ADD COLUMN height_cm numeric(5,2),
  ADD COLUMN weight_kg numeric(6,2),
  ADD COLUMN marital_status varchar(32),
  ADD COLUMN health_status varchar(64),
  ADD COLUMN household_registration varchar(256),
  ADD COLUMN highest_education varchar(64),
  ADD COLUMN major varchar(128),
  ADD COLUMN degree varchar(64),
  ADD COLUMN foreign_language varchar(64),
  ADD COLUMN language_level varchar(64),
  ADD COLUMN graduation_date date,
  ADD COLUMN graduation_school varchar(160),
  ADD COLUMN home_phone varchar(32),
  ADD COLUMN job_title varchar(100),
  ADD COLUMN job_grade varchar(64),
  ADD COLUMN employee_category varchar(64),
  ADD COLUMN technical_title varchar(100),
  ADD COLUMN technical_grade varchar(64),
  ADD COLUMN legacy_basic_info_id integer,
  ADD COLUMN source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT ck_hr_employee_profile_height CHECK(height_cm IS NULL OR height_cm BETWEEN 30 AND 300),
  ADD CONSTRAINT ck_hr_employee_profile_weight CHECK(weight_kg IS NULL OR weight_kg BETWEEN 1 AND 500);

CREATE UNIQUE INDEX uq_hr_employee_profile_identity_fingerprint
  ON hr_employee_profile(tenant_id,park_id,id_number_fingerprint)
  WHERE is_deleted=false AND id_number_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX uq_hr_employee_profile_legacy_basic_info
  ON hr_employee_profile(tenant_id,park_id,legacy_basic_info_id)
  WHERE legacy_basic_info_id IS NOT NULL;
CREATE INDEX ix_hr_employee_profile_birth_date
  ON hr_employee_profile(tenant_id,park_id,date_of_birth)
  WHERE is_deleted=false AND date_of_birth IS NOT NULL;

COMMIT;
