BEGIN;

-- Yuzhou stores employee extension values in person.def*.  Keep the modern
-- model typed and row-oriented so labels can change without rewriting values
-- or executing legacy SQL fragments from dbo.defs.
CREATE TABLE hr_custom_field_definition (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid REFERENCES migration_batch(id),
  field_code varchar(64) NOT NULL,
  display_label varchar(100) NOT NULL,
  value_type varchar(16) NOT NULL,
  field_group varchar(100),
  sort_order integer NOT NULL DEFAULT 0,
  sensitivity varchar(16) NOT NULL DEFAULT 'restricted',
  origin varchar(16) NOT NULL DEFAULT 'native',
  source_system varchar(64),
  source_table varchar(128),
  source_column varchar(64),
  source_identity_sha256 char(64),
  source_row_sha256 char(64),
  status varchar(16) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  update_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT ck_hr_custom_field_code CHECK(field_code~'^[A-Za-z][A-Za-z0-9_]{0,63}$'),
  CONSTRAINT ck_hr_custom_field_label CHECK(btrim(display_label)<>''),
  CONSTRAINT ck_hr_custom_field_type CHECK(value_type IN('text','numeric','date','boolean')),
  CONSTRAINT ck_hr_custom_field_sensitivity CHECK(sensitivity IN('normal','restricted')),
  CONSTRAINT ck_hr_custom_field_origin CHECK(origin IN('native','legacy')),
  CONSTRAINT ck_hr_custom_field_status CHECK(status IN('enabled','disabled')),
  CONSTRAINT ck_hr_custom_field_source CHECK(
    (origin='native' AND migration_batch_id IS NULL AND source_system IS NULL AND source_table IS NULL AND source_column IS NULL
      AND source_identity_sha256 IS NULL AND source_row_sha256 IS NULL)
    OR
    (origin='legacy' AND migration_batch_id IS NOT NULL AND source_system='yuzhou-v10' AND source_table='dbo.defs'
      AND source_column~'^def(?:[1-9]|1[1-5]|2[1-5])$'
      AND source_identity_sha256~'^[0-9a-f]{64}$' AND source_row_sha256~'^[0-9a-f]{64}$')
  ),
  CONSTRAINT uq_hr_custom_field_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_custom_field_active_code ON hr_custom_field_definition(tenant_id,park_id,lower(field_code)) WHERE is_deleted=false;
CREATE UNIQUE INDEX uq_hr_custom_field_legacy_column ON hr_custom_field_definition(tenant_id,park_id,source_system,source_table,lower(source_column)) WHERE origin='legacy' AND is_deleted=false;
CREATE INDEX ix_hr_custom_field_display ON hr_custom_field_definition(tenant_id,park_id,status,sort_order,id) WHERE is_deleted=false;
CREATE INDEX ix_hr_custom_field_migration_batch ON hr_custom_field_definition(migration_batch_id) WHERE migration_batch_id IS NOT NULL;

CREATE TABLE hr_employee_custom_value (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid REFERENCES migration_batch(id),
  employee_id uuid NOT NULL,
  definition_id uuid NOT NULL,
  text_value text,
  numeric_value numeric(28,8),
  date_value date,
  boolean_value boolean,
  is_source_null boolean NOT NULL DEFAULT false,
  value_status varchar(16) NOT NULL DEFAULT 'valid',
  origin varchar(16) NOT NULL DEFAULT 'native',
  source_system varchar(64),
  source_table varchar(128),
  source_column varchar(64),
  source_identity_sha256 char(64),
  source_row_sha256 char(64),
  create_by uuid,
  update_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT fk_hr_employee_custom_value_employee FOREIGN KEY(tenant_id,park_id,employee_id)
    REFERENCES hr_employee(tenant_id,park_id,id),
  CONSTRAINT fk_hr_employee_custom_value_definition FOREIGN KEY(tenant_id,park_id,definition_id)
    REFERENCES hr_custom_field_definition(tenant_id,park_id,id),
  CONSTRAINT ck_hr_employee_custom_value_status CHECK(value_status IN('valid','null','invalid')),
  CONSTRAINT ck_hr_employee_custom_value_exactly_one CHECK(
    (value_status='null' AND is_source_null AND num_nonnulls(text_value,numeric_value,date_value,boolean_value)=0)
    OR (value_status='valid' AND NOT is_source_null AND num_nonnulls(text_value,numeric_value,date_value,boolean_value)=1)
    OR (value_status='invalid' AND NOT is_source_null AND text_value IS NOT NULL AND num_nonnulls(numeric_value,date_value,boolean_value)=0)
  ),
  CONSTRAINT ck_hr_employee_custom_value_origin CHECK(origin IN('native','legacy')),
  CONSTRAINT ck_hr_employee_custom_value_source CHECK(
    (origin='native' AND migration_batch_id IS NULL AND source_system IS NULL AND source_table IS NULL AND source_column IS NULL
      AND source_identity_sha256 IS NULL AND source_row_sha256 IS NULL)
    OR
    (origin='legacy' AND migration_batch_id IS NOT NULL AND source_system='yuzhou-v10' AND source_table='dbo.person'
      AND source_column~'^def(?:[1-9]|1[1-5]|2[1-5])$'
      AND source_identity_sha256~'^[0-9a-f]{64}$' AND source_row_sha256~'^[0-9a-f]{64}$')
  ),
  CONSTRAINT uq_hr_employee_custom_value_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_employee_custom_value_active ON hr_employee_custom_value(tenant_id,park_id,employee_id,definition_id) WHERE is_deleted=false;
CREATE UNIQUE INDEX uq_hr_employee_custom_value_legacy_source ON hr_employee_custom_value(tenant_id,park_id,source_system,source_table,source_identity_sha256,lower(source_column)) WHERE origin='legacy' AND is_deleted=false;
CREATE INDEX ix_hr_employee_custom_value_employee ON hr_employee_custom_value(tenant_id,park_id,employee_id,definition_id) WHERE is_deleted=false;
CREATE INDEX ix_hr_employee_custom_value_migration_batch ON hr_employee_custom_value(migration_batch_id) WHERE migration_batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION hr_validate_custom_field_value_type() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE definition_type varchar(16);
BEGIN
  SELECT value_type INTO definition_type FROM hr_custom_field_definition
  WHERE (tenant_id,park_id,id)=(NEW.tenant_id,NEW.park_id,NEW.definition_id) AND NOT is_deleted;
  IF definition_type IS NULL THEN RAISE EXCEPTION 'HR_CUSTOM_FIELD_DEFINITION_NOT_ACTIVE'; END IF;
  IF NEW.value_status='valid' AND (
    (definition_type='text' AND NEW.text_value IS NULL) OR
    (definition_type='numeric' AND NEW.numeric_value IS NULL) OR
    (definition_type='date' AND NEW.date_value IS NULL) OR
    (definition_type='boolean' AND NEW.boolean_value IS NULL)
  ) THEN RAISE EXCEPTION 'HR_CUSTOM_FIELD_VALUE_TYPE_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_employee_custom_value_type BEFORE INSERT OR UPDATE ON hr_employee_custom_value
  FOR EACH ROW EXECUTE FUNCTION hr_validate_custom_field_value_type();

-- Legacy materializations are evidence. A rollback marker is accepted only
-- when it resolves to this row's exact migration batch and current database.
CREATE OR REPLACE FUNCTION hr_guard_legacy_custom_field() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE allowed boolean;
BEGIN
  IF OLD.origin='legacy' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.migration_batch batch
      WHERE batch.id=OLD.migration_batch_id
        AND batch.run_id=current_setting('yuzhou.custom_field_rollback',true)
        AND batch.target_database=current_database()
        AND batch.status='succeeded'
    ) INTO allowed;
  END IF;
  IF OLD.origin='legacy' AND NOT COALESCE(allowed,false) THEN
    RAISE EXCEPTION 'HR_LEGACY_CUSTOM_FIELD_IMMUTABLE';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_hr_custom_field_definition_legacy_guard BEFORE UPDATE OR DELETE ON hr_custom_field_definition
  FOR EACH ROW EXECUTE FUNCTION hr_guard_legacy_custom_field();
CREATE TRIGGER trg_hr_employee_custom_value_legacy_guard BEFORE UPDATE OR DELETE ON hr_employee_custom_value
  FOR EACH ROW EXECUTE FUNCTION hr_guard_legacy_custom_field();
REVOKE ALL ON FUNCTION hr_guard_legacy_custom_field() FROM PUBLIC;

COMMIT;
