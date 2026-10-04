-- Current business values supplement immutable original import evidence.
-- An explicit null is a maintained value and must not fall back to the source.
CREATE TABLE hr_employee_custom_value_maintenance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  employee_id uuid NOT NULL,
  definition_id uuid NOT NULL,
  value_type varchar(16) NOT NULL CHECK (value_type IN ('text','numeric','date','boolean')),
  value_status varchar(16) NOT NULL CHECK (value_status IN ('valid','null')),
  value_encrypted text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  create_by uuid NOT NULL,
  update_by uuid NOT NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_hr_custom_maintenance_employee FOREIGN KEY (tenant_id,park_id,employee_id)
    REFERENCES hr_employee(tenant_id,park_id,id),
  CONSTRAINT fk_hr_custom_maintenance_definition FOREIGN KEY (tenant_id,park_id,definition_id)
    REFERENCES hr_custom_field_definition(tenant_id,park_id,id),
  CONSTRAINT uq_hr_custom_maintenance_value UNIQUE (tenant_id,park_id,employee_id,definition_id),
  CONSTRAINT uq_hr_custom_maintenance_scope_id UNIQUE (tenant_id,park_id,id)
);

CREATE TABLE hr_employee_custom_value_change (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  maintenance_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  before_encrypted text,
  after_encrypted text NOT NULL,
  actor_id uuid NOT NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_hr_custom_change_maintenance FOREIGN KEY (tenant_id,park_id,maintenance_id)
    REFERENCES hr_employee_custom_value_maintenance(tenant_id,park_id,id),
  CONSTRAINT uq_hr_custom_change_version UNIQUE (maintenance_id,version)
);

CREATE FUNCTION hr_guard_custom_value_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION 'HR_CUSTOM_VALUE_CHANGE_IMMUTABLE';
END $$;
CREATE TRIGGER trg_hr_custom_value_change_immutable BEFORE UPDATE OR DELETE
  ON hr_employee_custom_value_change FOR EACH ROW EXECUTE FUNCTION hr_guard_custom_value_change();
REVOKE ALL ON FUNCTION hr_guard_custom_value_change() FROM PUBLIC;
