-- Append-only encrypted maintenance history. Existing business/source rows stay unchanged.
CREATE FUNCTION hr_guard_extended_record_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 RAISE EXCEPTION 'HR_RECORD_CHANGE_IMMUTABLE';
END $$;
REVOKE ALL ON FUNCTION hr_guard_extended_record_change() FROM PUBLIC;
CREATE UNIQUE INDEX uq_hr_experience_scope_employee_id ON hr_employee_experience(tenant_id,park_id,employee_id,id);
CREATE TABLE hr_employee_experience_change (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 employee_id uuid NOT NULL, record_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 action varchar(16) NOT NULL CHECK(action IN ('create','update','archive')),
 before_encrypted text, after_encrypted text NOT NULL, actor_id uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 CHECK ((action='create')=(before_encrypted IS NULL)),
 FOREIGN KEY(tenant_id,park_id,employee_id,record_id) REFERENCES hr_employee_experience(tenant_id,park_id,employee_id,id),
 FOREIGN KEY(tenant_id,park_id,actor_id) REFERENCES sys_user(tenant_id,park_id,id),
 UNIQUE(record_id,version)
);
CREATE INDEX ix_hr_experience_change_employee ON hr_employee_experience_change(tenant_id,park_id,employee_id,create_time);
CREATE TRIGGER trg_hr_experience_change_immutable BEFORE UPDATE OR DELETE ON hr_employee_experience_change
 FOR EACH ROW EXECUTE FUNCTION hr_guard_extended_record_change();
CREATE UNIQUE INDEX uq_hr_skill_scope_employee_id ON hr_employee_skill(tenant_id,park_id,employee_id,id);
CREATE TABLE hr_employee_skill_change (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 employee_id uuid NOT NULL, record_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 action varchar(16) NOT NULL CHECK(action IN ('create','update','archive')),
 before_encrypted text, after_encrypted text NOT NULL, actor_id uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 CHECK ((action='create')=(before_encrypted IS NULL)),
 FOREIGN KEY(tenant_id,park_id,employee_id,record_id) REFERENCES hr_employee_skill(tenant_id,park_id,employee_id,id),
 FOREIGN KEY(tenant_id,park_id,actor_id) REFERENCES sys_user(tenant_id,park_id,id),
 UNIQUE(record_id,version)
);
CREATE INDEX ix_hr_skill_change_employee ON hr_employee_skill_change(tenant_id,park_id,employee_id,create_time);
CREATE TRIGGER trg_hr_skill_change_immutable BEFORE UPDATE OR DELETE ON hr_employee_skill_change
 FOR EACH ROW EXECUTE FUNCTION hr_guard_extended_record_change();
CREATE UNIQUE INDEX uq_hr_credential_scope_employee_id ON hr_employee_credential(tenant_id,park_id,employee_id,id);
CREATE TABLE hr_employee_credential_change (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 employee_id uuid NOT NULL, record_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 action varchar(16) NOT NULL CHECK(action IN ('create','update','archive')),
 before_encrypted text, after_encrypted text NOT NULL, actor_id uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 CHECK ((action='create')=(before_encrypted IS NULL)),
 FOREIGN KEY(tenant_id,park_id,employee_id,record_id) REFERENCES hr_employee_credential(tenant_id,park_id,employee_id,id),
 FOREIGN KEY(tenant_id,park_id,actor_id) REFERENCES sys_user(tenant_id,park_id,id),
 UNIQUE(record_id,version)
);
CREATE INDEX ix_hr_credential_change_employee ON hr_employee_credential_change(tenant_id,park_id,employee_id,create_time);
CREATE TRIGGER trg_hr_credential_change_immutable BEFORE UPDATE OR DELETE ON hr_employee_credential_change
 FOR EACH ROW EXECUTE FUNCTION hr_guard_extended_record_change();
