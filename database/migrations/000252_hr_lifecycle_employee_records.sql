BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employment_event_scope_id ON hr_employment_event(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employment_event_employee_scope_id ON hr_employment_event(tenant_id,park_id,employee_id,id);

CREATE TABLE hr_lifecycle_checklist_template (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 template_code varchar(64) NOT NULL, template_name varchar(160) NOT NULL, checklist_type varchar(24) NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'enabled', create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_lifecycle_template_type CHECK(checklist_type IN ('onboarding','offboarding')),
 CONSTRAINT ck_hr_lifecycle_template_status CHECK(status IN ('enabled','disabled')),
 CONSTRAINT fk_hr_lifecycle_template_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_lifecycle_template_updater FOREIGN KEY(tenant_id,park_id,update_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_lifecycle_template_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_lifecycle_template_code ON hr_lifecycle_checklist_template(tenant_id,park_id,template_code) WHERE is_deleted=false;
CREATE INDEX ix_hr_lifecycle_template_creator ON hr_lifecycle_checklist_template(tenant_id,park_id,create_by);
CREATE INDEX ix_hr_lifecycle_template_updater ON hr_lifecycle_checklist_template(tenant_id,park_id,update_by);

CREATE TABLE hr_lifecycle_checklist_template_version (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 template_id uuid NOT NULL, version_no integer NOT NULL, status varchar(24) NOT NULL DEFAULT 'draft', published_at timestamptz,
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_hr_lifecycle_template_version_no CHECK(version_no > 0),
 CONSTRAINT ck_hr_lifecycle_template_version_status CHECK(status IN ('draft','published','retired')),
 CONSTRAINT ck_hr_lifecycle_template_version_publish CHECK((status='draft' AND published_at IS NULL) OR (status IN ('published','retired') AND published_at IS NOT NULL)),
 CONSTRAINT fk_hr_lifecycle_template_version_template FOREIGN KEY(tenant_id,park_id,template_id) REFERENCES hr_lifecycle_checklist_template(tenant_id,park_id,id),
 CONSTRAINT fk_hr_lifecycle_template_version_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_lifecycle_template_version UNIQUE(tenant_id,park_id,template_id,version_no),
 CONSTRAINT uq_hr_lifecycle_template_version_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_lifecycle_template_version_template ON hr_lifecycle_checklist_template_version(tenant_id,park_id,template_id);
CREATE INDEX ix_hr_lifecycle_template_version_creator ON hr_lifecycle_checklist_template_version(tenant_id,park_id,create_by);

CREATE TABLE hr_lifecycle_checklist_template_item (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 template_version_id uuid NOT NULL, item_code varchar(64) NOT NULL, item_name varchar(160) NOT NULL, category varchar(32) NOT NULL,
 sequence_no integer NOT NULL, default_due_days integer, required boolean NOT NULL DEFAULT true, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_hr_lifecycle_template_item_sequence CHECK(sequence_no > 0),
 CONSTRAINT ck_hr_lifecycle_template_item_due CHECK(default_due_days IS NULL OR default_due_days BETWEEN -365 AND 365),
 CONSTRAINT fk_hr_lifecycle_template_item_version FOREIGN KEY(tenant_id,park_id,template_version_id) REFERENCES hr_lifecycle_checklist_template_version(tenant_id,park_id,id),
 CONSTRAINT uq_hr_lifecycle_template_item_code UNIQUE(tenant_id,park_id,template_version_id,item_code),
 CONSTRAINT uq_hr_lifecycle_template_item_sequence UNIQUE(tenant_id,park_id,template_version_id,sequence_no),
 CONSTRAINT uq_hr_lifecycle_template_item_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_lifecycle_template_item_version ON hr_lifecycle_checklist_template_item(tenant_id,park_id,template_version_id);

ALTER TABLE hr_lifecycle_checklist ADD COLUMN template_version_id uuid;
ALTER TABLE hr_lifecycle_checklist ADD COLUMN employment_event_id uuid;
ALTER TABLE hr_lifecycle_checklist ADD COLUMN completed_at timestamptz;
ALTER TABLE hr_lifecycle_checklist ADD CONSTRAINT fk_hr_lifecycle_checklist_template_version FOREIGN KEY(tenant_id,park_id,template_version_id) REFERENCES hr_lifecycle_checklist_template_version(tenant_id,park_id,id);
ALTER TABLE hr_lifecycle_checklist ADD CONSTRAINT fk_hr_lifecycle_checklist_event FOREIGN KEY(tenant_id,park_id,employee_id,employment_event_id) REFERENCES hr_employment_event(tenant_id,park_id,employee_id,id);
ALTER TABLE hr_lifecycle_checklist ADD CONSTRAINT ck_hr_lifecycle_checklist_event CHECK((checklist_type='onboarding') OR employment_event_id IS NOT NULL);
ALTER TABLE hr_lifecycle_checklist ADD CONSTRAINT ck_hr_lifecycle_checklist_completed CHECK((status='completed' AND completed_at IS NOT NULL) OR (status<>'completed' AND completed_at IS NULL));
CREATE INDEX ix_hr_lifecycle_checklist_template_version ON hr_lifecycle_checklist(tenant_id,park_id,template_version_id);
CREATE INDEX ix_hr_lifecycle_checklist_event ON hr_lifecycle_checklist(tenant_id,park_id,employment_event_id);
CREATE INDEX ix_hr_lifecycle_checklist_employee_event ON hr_lifecycle_checklist(tenant_id,park_id,employee_id,employment_event_id);

DROP INDEX uq_hr_lifecycle_checklist_employee_type;
CREATE UNIQUE INDEX uq_hr_lifecycle_checklist_active_employee_type ON hr_lifecycle_checklist(tenant_id,park_id,employee_id,checklist_type) WHERE is_deleted=false AND status IN ('open','in_progress');
CREATE UNIQUE INDEX uq_hr_lifecycle_checklist_employment_event ON hr_lifecycle_checklist(tenant_id,park_id,employment_event_id) WHERE employment_event_id IS NOT NULL AND is_deleted=false;

ALTER TABLE hr_lifecycle_checklist_item ADD COLUMN required boolean NOT NULL DEFAULT true;
ALTER TABLE hr_lifecycle_checklist_item ADD COLUMN completed_at timestamptz;
ALTER TABLE hr_lifecycle_checklist_item ADD COLUMN completed_by uuid;
ALTER TABLE hr_lifecycle_checklist_item ADD CONSTRAINT fk_hr_lifecycle_item_completed_by FOREIGN KEY(tenant_id,park_id,completed_by) REFERENCES sys_user(tenant_id,park_id,id);
ALTER TABLE hr_lifecycle_checklist_item ADD CONSTRAINT ck_hr_lifecycle_item_completion CHECK((status IN ('completed','waived') AND completed_at IS NOT NULL AND completed_by IS NOT NULL) OR (status IN ('pending','returned') AND completed_at IS NULL AND completed_by IS NULL));
ALTER TABLE hr_lifecycle_checklist_item ADD CONSTRAINT uq_hr_lifecycle_item_checklist_id UNIQUE(tenant_id,park_id,checklist_id,id);
CREATE INDEX ix_hr_lifecycle_item_completed_by ON hr_lifecycle_checklist_item(tenant_id,park_id,completed_by);

CREATE TABLE hr_lifecycle_checklist_action (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 checklist_id uuid NOT NULL, item_id uuid NOT NULL, sequence_no integer NOT NULL, action varchar(24) NOT NULL,
 from_status varchar(24) NOT NULL, to_status varchar(24) NOT NULL, assignee_user_id uuid, note varchar(1000), actor_user_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(), create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_hr_lifecycle_action_action CHECK(action IN ('complete','waive','return','reassign','correct')),
 CONSTRAINT ck_hr_lifecycle_action_status CHECK(from_status IN ('pending','completed','waived','returned') AND to_status IN ('pending','completed','waived','returned')),
 CONSTRAINT ck_hr_lifecycle_action_transition CHECK(
   (action='complete' AND from_status IN ('pending','returned') AND to_status='completed') OR
   (action='waive' AND from_status IN ('pending','returned') AND to_status='waived') OR
   (action='return' AND from_status='completed' AND to_status='returned') OR
   (action='correct' AND from_status IN ('completed','waived') AND to_status='returned') OR
   (action='reassign' AND from_status IN ('pending','returned') AND to_status=from_status)
 ),
 CONSTRAINT fk_hr_lifecycle_action_checklist FOREIGN KEY(tenant_id,park_id,checklist_id) REFERENCES hr_lifecycle_checklist(tenant_id,park_id,id),
 CONSTRAINT fk_hr_lifecycle_action_item FOREIGN KEY(tenant_id,park_id,checklist_id,item_id) REFERENCES hr_lifecycle_checklist_item(tenant_id,park_id,checklist_id,id),
 CONSTRAINT fk_hr_lifecycle_action_assignee FOREIGN KEY(tenant_id,park_id,assignee_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_lifecycle_action_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_lifecycle_action_sequence UNIQUE(tenant_id,park_id,item_id,sequence_no),
 CONSTRAINT uq_hr_lifecycle_action_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_lifecycle_action_checklist ON hr_lifecycle_checklist_action(tenant_id,park_id,checklist_id);
CREATE INDEX ix_hr_lifecycle_action_item ON hr_lifecycle_checklist_action(tenant_id,park_id,item_id);
CREATE INDEX ix_hr_lifecycle_action_checklist_item ON hr_lifecycle_checklist_action(tenant_id,park_id,checklist_id,item_id);
CREATE INDEX ix_hr_lifecycle_action_assignee ON hr_lifecycle_checklist_action(tenant_id,park_id,assignee_user_id);
CREATE INDEX ix_hr_lifecycle_action_actor ON hr_lifecycle_checklist_action(tenant_id,park_id,actor_user_id);

CREATE TABLE hr_employee_family (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, employee_id uuid NOT NULL,
 relationship varchar(32) NOT NULL, full_name_encrypted text NOT NULL, full_name_masked varchar(100) NOT NULL, full_name_fingerprint varchar(96) NOT NULL,
 identity_encrypted text, identity_masked varchar(64), identity_fingerprint varchar(96), contact_encrypted text, contact_masked varchar(64), contact_fingerprint varchar(96),
 is_emergency_contact boolean NOT NULL DEFAULT false, create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT fk_hr_employee_family_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_employee_family_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_employee_family_updater FOREIGN KEY(tenant_id,park_id,update_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_employee_family_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_employee_family_employee ON hr_employee_family(tenant_id,park_id,employee_id);
CREATE INDEX ix_hr_employee_family_creator ON hr_employee_family(tenant_id,park_id,create_by);
CREATE INDEX ix_hr_employee_family_updater ON hr_employee_family(tenant_id,park_id,update_by);
CREATE INDEX ix_hr_employee_family_name_fingerprint ON hr_employee_family(tenant_id,park_id,full_name_fingerprint);
CREATE INDEX ix_hr_employee_family_identity_fingerprint ON hr_employee_family(tenant_id,park_id,identity_fingerprint) WHERE identity_fingerprint IS NOT NULL;
CREATE INDEX ix_hr_employee_family_contact_fingerprint ON hr_employee_family(tenant_id,park_id,contact_fingerprint) WHERE contact_fingerprint IS NOT NULL;

CREATE TABLE hr_employee_experience (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, employee_id uuid NOT NULL,
 experience_type varchar(24) NOT NULL, organization_name varchar(200) NOT NULL, title varchar(160), start_date date NOT NULL, end_date date, summary varchar(2000),
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_employee_experience_type CHECK(experience_type IN ('education','work')),
 CONSTRAINT ck_hr_employee_experience_dates CHECK(end_date IS NULL OR end_date>=start_date),
 CONSTRAINT fk_hr_employee_experience_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_employee_experience_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_employee_experience_updater FOREIGN KEY(tenant_id,park_id,update_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_employee_experience_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_employee_experience_employee ON hr_employee_experience(tenant_id,park_id,employee_id);
CREATE INDEX ix_hr_employee_experience_creator ON hr_employee_experience(tenant_id,park_id,create_by);
CREATE INDEX ix_hr_employee_experience_updater ON hr_employee_experience(tenant_id,park_id,update_by);

CREATE TABLE hr_employee_skill (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, employee_id uuid NOT NULL,
 skill_name varchar(160) NOT NULL, proficiency varchar(24), acquired_date date, create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_employee_skill_proficiency CHECK(proficiency IS NULL OR proficiency IN ('basic','intermediate','advanced','expert')),
 CONSTRAINT fk_hr_employee_skill_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_employee_skill_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_employee_skill_updater FOREIGN KEY(tenant_id,park_id,update_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_employee_skill_name UNIQUE(tenant_id,park_id,employee_id,skill_name),
 CONSTRAINT uq_hr_employee_skill_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_employee_skill_employee ON hr_employee_skill(tenant_id,park_id,employee_id);
CREATE INDEX ix_hr_employee_skill_creator ON hr_employee_skill(tenant_id,park_id,create_by);
CREATE INDEX ix_hr_employee_skill_updater ON hr_employee_skill(tenant_id,park_id,update_by);

CREATE TABLE hr_employee_credential (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, employee_id uuid NOT NULL,
 credential_type varchar(64) NOT NULL, credential_name varchar(160) NOT NULL, number_encrypted text, number_masked varchar(64), number_fingerprint varchar(96), issuing_authority varchar(200), acquired_date date, valid_to date,
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_employee_credential_dates CHECK(valid_to IS NULL OR acquired_date IS NULL OR valid_to>=acquired_date),
 CONSTRAINT fk_hr_employee_credential_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_employee_credential_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_employee_credential_updater FOREIGN KEY(tenant_id,park_id,update_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_employee_credential_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_employee_credential_employee ON hr_employee_credential(tenant_id,park_id,employee_id);
CREATE INDEX ix_hr_employee_credential_creator ON hr_employee_credential(tenant_id,park_id,create_by);
CREATE INDEX ix_hr_employee_credential_updater ON hr_employee_credential(tenant_id,park_id,update_by);
CREATE INDEX ix_hr_employee_credential_expiry ON hr_employee_credential(tenant_id,park_id,valid_to);
CREATE INDEX ix_hr_employee_credential_number_fingerprint ON hr_employee_credential(tenant_id,park_id,number_fingerprint) WHERE number_fingerprint IS NOT NULL;

CREATE FUNCTION hr_lifecycle_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'HR lifecycle history is append-only'; END $$;
CREATE FUNCTION hr_lifecycle_validate_offboarding_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.checklist_type='offboarding' AND NOT EXISTS(
    SELECT 1 FROM hr_employment_event event
    WHERE event.tenant_id=NEW.tenant_id AND event.park_id=NEW.park_id
      AND event.employee_id=NEW.employee_id AND event.id=NEW.employment_event_id
      AND event.event_type='depart' AND event.status='effective'
      AND event.is_deleted=false AND event.is_historical_import=false
      AND event.after_snapshot->>'employmentStatus'='departed'
  ) THEN
    RAISE EXCEPTION 'Offboarding checklist requires a current effective departure transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_lifecycle_validate_offboarding_event BEFORE INSERT OR UPDATE OF tenant_id,park_id,employee_id,checklist_type,employment_event_id ON hr_lifecycle_checklist FOR EACH ROW EXECUTE FUNCTION hr_lifecycle_validate_offboarding_event();
CREATE FUNCTION hr_lifecycle_preserve_linked_departure_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(
    SELECT 1 FROM hr_lifecycle_checklist checklist
    WHERE checklist.tenant_id=OLD.tenant_id AND checklist.park_id=OLD.park_id
      AND checklist.employee_id=OLD.employee_id AND checklist.employment_event_id=OLD.id
      AND checklist.checklist_type='offboarding' AND checklist.is_deleted=false
  ) AND NOT (
    NEW.tenant_id=OLD.tenant_id AND NEW.park_id=OLD.park_id
    AND NEW.employee_id=OLD.employee_id AND NEW.id=OLD.id
    AND NEW.event_type='depart' AND NEW.status='effective'
    AND NEW.is_deleted=false AND NEW.is_historical_import=false
    AND NEW.after_snapshot->>'employmentStatus'='departed'
  ) THEN
    RAISE EXCEPTION 'A linked departure transition cannot be invalidated';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_lifecycle_preserve_linked_departure_event BEFORE UPDATE OF tenant_id,park_id,employee_id,id,event_type,status,is_deleted,is_historical_import,after_snapshot ON hr_employment_event FOR EACH ROW EXECUTE FUNCTION hr_lifecycle_preserve_linked_departure_event();
CREATE TRIGGER trg_hr_lifecycle_template_version_append_only BEFORE UPDATE OR DELETE ON hr_lifecycle_checklist_template_version FOR EACH ROW WHEN (OLD.status IN ('published','retired')) EXECUTE FUNCTION hr_lifecycle_append_only();
CREATE TRIGGER trg_hr_lifecycle_template_item_append_only BEFORE UPDATE OR DELETE ON hr_lifecycle_checklist_template_item FOR EACH ROW EXECUTE FUNCTION hr_lifecycle_append_only();
CREATE TRIGGER trg_hr_lifecycle_action_append_only BEFORE UPDATE OR DELETE ON hr_lifecycle_checklist_action FOR EACH ROW EXECUTE FUNCTION hr_lifecycle_append_only();

COMMIT;
