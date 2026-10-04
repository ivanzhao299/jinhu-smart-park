-- Formal business maintenance retains the original source and import receipts.
CREATE UNIQUE INDEX uq_hr_employee_family_scope_employee_id
  ON hr_employee_family(tenant_id,park_id,employee_id,id);

CREATE TABLE hr_employee_family_change (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  employee_id uuid NOT NULL,
  family_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  action varchar(16) NOT NULL CHECK (action IN ('create','update','archive')),
  before_encrypted text,
  after_encrypted text NOT NULL,
  actor_id uuid NOT NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_family_change_before CHECK ((action='create')=(before_encrypted IS NULL)),
  CONSTRAINT fk_hr_family_change_owner FOREIGN KEY (tenant_id,park_id,employee_id,family_id)
    REFERENCES hr_employee_family(tenant_id,park_id,employee_id,id),
  CONSTRAINT fk_hr_family_change_actor FOREIGN KEY (tenant_id,park_id,actor_id)
    REFERENCES sys_user(tenant_id,park_id,id),
  CONSTRAINT uq_hr_family_change_version UNIQUE (family_id,version)
);
CREATE INDEX ix_hr_family_change_employee ON hr_employee_family_change(tenant_id,park_id,employee_id,create_time);

CREATE FUNCTION hr_guard_family_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION 'HR_FAMILY_CHANGE_IMMUTABLE';
END $$;
CREATE TRIGGER trg_hr_family_change_immutable BEFORE UPDATE OR DELETE
  ON hr_employee_family_change FOR EACH ROW EXECUTE FUNCTION hr_guard_family_change();
REVOKE ALL ON FUNCTION hr_guard_family_change() FROM PUBLIC;
