BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_org_scope_id ON sys_org(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_scope_id ON sys_user(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_position_scope_id ON hr_position(tenant_id,park_id,id);

CREATE TABLE hr_recruitment_requisition (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 requisition_code varchar(64) NOT NULL, title varchar(160) NOT NULL, org_id uuid NOT NULL, position_id uuid,
 headcount integer NOT NULL, hired_count integer NOT NULL DEFAULT 0, owner_user_id uuid NOT NULL,
 planned_onboard_date date, status varchar(24) NOT NULL DEFAULT 'draft', approval_note varchar(1000),
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL,
 update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_requisition_status CHECK(status IN ('draft','open','paused','closed','cancelled')),
 CONSTRAINT ck_hr_requisition_headcount CHECK(headcount>0 AND hired_count>=0 AND hired_count<=headcount),
 CONSTRAINT fk_hr_requisition_org FOREIGN KEY(tenant_id,park_id,org_id) REFERENCES sys_org(tenant_id,park_id,id),
 CONSTRAINT fk_hr_requisition_position FOREIGN KEY(tenant_id,park_id,position_id) REFERENCES hr_position(tenant_id,park_id,id),
 CONSTRAINT fk_hr_requisition_owner FOREIGN KEY(tenant_id,park_id,owner_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_requisition_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_requisition_code ON hr_recruitment_requisition(tenant_id,park_id,requisition_code) WHERE is_deleted=false;
CREATE INDEX ix_hr_requisition_org ON hr_recruitment_requisition(tenant_id,park_id,org_id);
CREATE INDEX ix_hr_requisition_position ON hr_recruitment_requisition(tenant_id,park_id,position_id);
CREATE INDEX ix_hr_requisition_owner ON hr_recruitment_requisition(tenant_id,park_id,owner_user_id);

CREATE TABLE hr_candidate (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 requisition_id uuid NOT NULL, candidate_no varchar(64) NOT NULL, full_name varchar(100) NOT NULL,
 mobile_encrypted text, mobile_masked varchar(64), mobile_fingerprint varchar(96),
 email_encrypted text, email_masked varchar(160), email_fingerprint varchar(96),
 identity_encrypted text, identity_masked varchar(64), identity_fingerprint varchar(96),
 source varchar(64), stage varchar(24) NOT NULL DEFAULT 'talent_pool', expected_onboard_date date,
 latest_evaluation varchar(2000), converted_employee_id uuid, create_by uuid NOT NULL,
 create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(),
 is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_candidate_stage CHECK(stage IN ('talent_pool','screening','interview','offer','hired','rejected','withdrawn')),
 CONSTRAINT fk_hr_candidate_requisition FOREIGN KEY(tenant_id,park_id,requisition_id) REFERENCES hr_recruitment_requisition(tenant_id,park_id,id),
 CONSTRAINT fk_hr_candidate_employee FOREIGN KEY(tenant_id,park_id,converted_employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT uq_hr_candidate_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_candidate_no ON hr_candidate(tenant_id,park_id,candidate_no) WHERE is_deleted=false;
CREATE INDEX ix_hr_candidate_requisition ON hr_candidate(tenant_id,park_id,requisition_id);
CREATE INDEX ix_hr_candidate_converted_employee ON hr_candidate(tenant_id,park_id,converted_employee_id);
CREATE INDEX ix_hr_candidate_mobile_fingerprint ON hr_candidate(tenant_id,park_id,mobile_fingerprint) WHERE mobile_fingerprint IS NOT NULL;
CREATE INDEX ix_hr_candidate_email_fingerprint ON hr_candidate(tenant_id,park_id,email_fingerprint) WHERE email_fingerprint IS NOT NULL;
CREATE INDEX ix_hr_candidate_identity_fingerprint ON hr_candidate(tenant_id,park_id,identity_fingerprint) WHERE identity_fingerprint IS NOT NULL;

CREATE TABLE hr_candidate_action (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 candidate_id uuid NOT NULL, sequence_no integer NOT NULL, action varchar(32) NOT NULL, from_stage varchar(24) NOT NULL,
 to_stage varchar(24) NOT NULL, evaluation varchar(2000), occurred_at timestamptz NOT NULL DEFAULT now(), actor_user_id uuid NOT NULL,
 create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_hr_candidate_action_stage CHECK(from_stage IN ('talent_pool','screening','interview','offer','hired','rejected','withdrawn') AND to_stage IN ('talent_pool','screening','interview','offer','hired','rejected','withdrawn')),
 CONSTRAINT fk_hr_candidate_action_candidate FOREIGN KEY(tenant_id,park_id,candidate_id) REFERENCES hr_candidate(tenant_id,park_id,id),
 CONSTRAINT fk_hr_candidate_action_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_candidate_action_sequence UNIQUE(tenant_id,park_id,candidate_id,sequence_no),
 CONSTRAINT uq_hr_candidate_action_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_candidate_action_candidate ON hr_candidate_action(tenant_id,park_id,candidate_id);
CREATE INDEX ix_hr_candidate_action_actor ON hr_candidate_action(tenant_id,park_id,actor_user_id);

CREATE TABLE hr_lifecycle_checklist (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 employee_id uuid NOT NULL, checklist_type varchar(24) NOT NULL DEFAULT 'onboarding', template_version integer NOT NULL DEFAULT 1,
 status varchar(24) NOT NULL DEFAULT 'open', snapshot jsonb NOT NULL, due_date date, create_by uuid NOT NULL,
 create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(),
 is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_lifecycle_checklist_type CHECK(checklist_type IN ('onboarding','offboarding')),
 CONSTRAINT ck_hr_lifecycle_checklist_status CHECK(status IN ('open','in_progress','completed','cancelled')),
 CONSTRAINT fk_hr_lifecycle_checklist_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT uq_hr_lifecycle_checklist_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_lifecycle_checklist_employee_type ON hr_lifecycle_checklist(tenant_id,park_id,employee_id,checklist_type) WHERE is_deleted=false;
CREATE INDEX ix_hr_lifecycle_checklist_employee ON hr_lifecycle_checklist(tenant_id,park_id,employee_id);

CREATE TABLE hr_lifecycle_checklist_item (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 checklist_id uuid NOT NULL, item_code varchar(64) NOT NULL, item_name varchar(160) NOT NULL, category varchar(32) NOT NULL,
 sequence_no integer NOT NULL, status varchar(24) NOT NULL DEFAULT 'pending', responsible_user_id uuid, due_date date,
 create_time timestamptz NOT NULL DEFAULT now(), update_time timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_lifecycle_item_status CHECK(status IN ('pending','completed','waived','returned')),
 CONSTRAINT fk_hr_lifecycle_item_checklist FOREIGN KEY(tenant_id,park_id,checklist_id) REFERENCES hr_lifecycle_checklist(tenant_id,park_id,id),
 CONSTRAINT fk_hr_lifecycle_item_responsible FOREIGN KEY(tenant_id,park_id,responsible_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_lifecycle_item_code UNIQUE(tenant_id,park_id,checklist_id,item_code),
 CONSTRAINT uq_hr_lifecycle_item_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_lifecycle_item_checklist ON hr_lifecycle_checklist_item(tenant_id,park_id,checklist_id);
CREATE INDEX ix_hr_lifecycle_item_responsible ON hr_lifecycle_checklist_item(tenant_id,park_id,responsible_user_id);

CREATE TABLE hr_candidate_conversion (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 candidate_id uuid NOT NULL, requisition_id uuid NOT NULL, employee_id uuid NOT NULL, checklist_id uuid NOT NULL,
 employee_code varchar(64) NOT NULL, converted_by uuid NOT NULL, converted_at timestamptz NOT NULL DEFAULT now(), evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 CONSTRAINT fk_hr_conversion_candidate FOREIGN KEY(tenant_id,park_id,candidate_id) REFERENCES hr_candidate(tenant_id,park_id,id),
 CONSTRAINT fk_hr_conversion_requisition FOREIGN KEY(tenant_id,park_id,requisition_id) REFERENCES hr_recruitment_requisition(tenant_id,park_id,id),
 CONSTRAINT fk_hr_conversion_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_conversion_checklist FOREIGN KEY(tenant_id,park_id,checklist_id) REFERENCES hr_lifecycle_checklist(tenant_id,park_id,id),
 CONSTRAINT fk_hr_conversion_actor FOREIGN KEY(tenant_id,park_id,converted_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_conversion_candidate UNIQUE(tenant_id,park_id,candidate_id),
 CONSTRAINT uq_hr_conversion_employee UNIQUE(tenant_id,park_id,employee_id),
 CONSTRAINT uq_hr_conversion_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_conversion_requisition ON hr_candidate_conversion(tenant_id,park_id,requisition_id);
CREATE INDEX ix_hr_conversion_candidate ON hr_candidate_conversion(tenant_id,park_id,candidate_id);
CREATE INDEX ix_hr_conversion_employee ON hr_candidate_conversion(tenant_id,park_id,employee_id);
CREATE INDEX ix_hr_conversion_checklist ON hr_candidate_conversion(tenant_id,park_id,checklist_id);
CREATE INDEX ix_hr_conversion_actor ON hr_candidate_conversion(tenant_id,park_id,converted_by);

CREATE FUNCTION hr_recruitment_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'HR recruitment evidence is append-only'; END $$;
CREATE TRIGGER trg_hr_candidate_action_append_only BEFORE UPDATE OR DELETE ON hr_candidate_action FOR EACH ROW EXECUTE FUNCTION hr_recruitment_append_only();
CREATE TRIGGER trg_hr_candidate_conversion_append_only BEFORE UPDATE OR DELETE ON hr_candidate_conversion FOR EACH ROW EXECUTE FUNCTION hr_recruitment_append_only();

COMMIT;
