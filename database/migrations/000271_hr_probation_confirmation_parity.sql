BEGIN;

CREATE TABLE hr_probation_application(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 application_no varchar(64) NOT NULL,application_name varchar(128) NOT NULL,applicant_user_id uuid NOT NULL,
 application_date date NOT NULL,reason varchar(2000) NOT NULL,status varchar(24) NOT NULL DEFAULT 'draft',
 participant_snapshot jsonb,review_comment varchar(1000),reviewed_by uuid,reviewed_at timestamptz,
 confirmed_by uuid,confirmed_at timestamptz,legacy_app_id integer,legacy_status varchar(32),source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 create_by uuid NOT NULL,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid NOT NULL,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_probation_application_status CHECK(status IN('draft','submitted','returned','approved','cancelled','confirmed')),
 CONSTRAINT ck_hr_probation_application_snapshot CHECK((status='draft' AND participant_snapshot IS NULL) OR (status='cancelled' AND (participant_snapshot IS NULL OR (jsonb_typeof(participant_snapshot)='array' AND jsonb_array_length(participant_snapshot)>0))) OR (status IN('submitted','returned','approved','confirmed') AND jsonb_typeof(participant_snapshot)='array' AND jsonb_array_length(participant_snapshot)>0)),
 CONSTRAINT ck_hr_probation_application_review CHECK((status IN('draft','submitted','cancelled') AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (status IN('returned','approved','confirmed') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CONSTRAINT ck_hr_probation_application_confirm CHECK((status='confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL) OR (status<>'confirmed' AND confirmed_by IS NULL AND confirmed_at IS NULL)),
 CONSTRAINT fk_hr_probation_application_applicant FOREIGN KEY(tenant_id,park_id,applicant_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_probation_application_reviewer FOREIGN KEY(tenant_id,park_id,reviewed_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_probation_application_confirmer FOREIGN KEY(tenant_id,park_id,confirmed_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_probation_application_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_probation_application_no ON hr_probation_application(tenant_id,park_id,application_no);
CREATE UNIQUE INDEX uq_hr_probation_application_legacy ON hr_probation_application(tenant_id,park_id,legacy_app_id) WHERE legacy_app_id IS NOT NULL;
CREATE INDEX ix_hr_probation_application_status ON hr_probation_application(tenant_id,park_id,status,application_date DESC) WHERE is_deleted=false;

CREATE TABLE hr_probation_application_employee(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,application_id uuid NOT NULL,employee_id uuid NOT NULL,
 planned_confirmation_date date NOT NULL,confirmed_date date,status varchar(16) NOT NULL DEFAULT 'pending',legacy_prob_emp_id integer,source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 create_by uuid NOT NULL,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid NOT NULL,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_probation_employee_status CHECK(status IN('pending','confirmed','cancelled')),
 CONSTRAINT ck_hr_probation_employee_confirm CHECK((status='confirmed' AND confirmed_date IS NOT NULL) OR (status<>'confirmed' AND confirmed_date IS NULL)),
 CONSTRAINT fk_hr_probation_employee_application FOREIGN KEY(tenant_id,park_id,application_id) REFERENCES hr_probation_application(tenant_id,park_id,id),
 CONSTRAINT fk_hr_probation_employee_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT uq_hr_probation_employee_scope_id UNIQUE(tenant_id,park_id,id),
 CONSTRAINT uq_hr_probation_employee_application UNIQUE(tenant_id,park_id,application_id,employee_id)
);
CREATE UNIQUE INDEX uq_hr_probation_employee_active ON hr_probation_application_employee(tenant_id,park_id,employee_id) WHERE is_deleted=false AND status='pending';
CREATE UNIQUE INDEX uq_hr_probation_employee_legacy ON hr_probation_application_employee(tenant_id,park_id,legacy_prob_emp_id) WHERE legacy_prob_emp_id IS NOT NULL;
CREATE INDEX ix_hr_probation_employee_application ON hr_probation_application_employee(tenant_id,park_id,application_id,employee_id) WHERE is_deleted=false;

CREATE TABLE hr_probation_application_action(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,application_id uuid NOT NULL,sequence_no integer NOT NULL,
 action varchar(24) NOT NULL,from_status varchar(24),to_status varchar(24) NOT NULL,comment varchar(1000),actor_user_id uuid NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_hr_probation_action CHECK(action IN('created','updated','submitted','resubmitted','returned','approved','cancelled','confirmed')),
 CONSTRAINT fk_hr_probation_action_application FOREIGN KEY(tenant_id,park_id,application_id) REFERENCES hr_probation_application(tenant_id,park_id,id),
 CONSTRAINT fk_hr_probation_action_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_probation_action_scope_id UNIQUE(tenant_id,park_id,id),CONSTRAINT uq_hr_probation_action_sequence UNIQUE(tenant_id,park_id,application_id,sequence_no)
);
CREATE INDEX ix_hr_probation_action_application ON hr_probation_application_action(tenant_id,park_id,application_id,sequence_no);

CREATE FUNCTION hr_probation_application_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN('cancelled','confirmed') THEN RAISE EXCEPTION 'HR_PROBATION_TERMINAL_IMMUTABLE'; END IF;
 IF (OLD.status,NEW.status) NOT IN(('draft','draft'),('draft','submitted'),('draft','cancelled'),('returned','draft'),('returned','submitted'),('returned','cancelled'),('submitted','approved'),('submitted','returned'),('submitted','cancelled'),('approved','confirmed')) THEN RAISE EXCEPTION 'HR_PROBATION_TRANSITION_INVALID: % -> %',OLD.status,NEW.status; END IF;
 IF OLD.status NOT IN('draft','returned') AND (NEW.application_name,NEW.application_date,NEW.reason,NEW.participant_snapshot) IS DISTINCT FROM (OLD.application_name,OLD.application_date,OLD.reason,OLD.participant_snapshot) THEN RAISE EXCEPTION 'HR_PROBATION_SUBMITTED_FACTS_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_probation_application_guard BEFORE UPDATE ON hr_probation_application FOR EACH ROW EXECUTE FUNCTION hr_probation_application_guard();

CREATE FUNCTION hr_probation_participant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE application_status varchar(24);
BEGIN
 SELECT status INTO application_status FROM hr_probation_application WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id) AND park_id=COALESCE(NEW.park_id,OLD.park_id) AND id=COALESCE(NEW.application_id,OLD.application_id) FOR SHARE;
 IF TG_OP='DELETE' AND application_status NOT IN('draft','returned') THEN RAISE EXCEPTION 'HR_PROBATION_PARTICIPANT_FROZEN'; END IF;
 IF TG_OP='UPDATE' AND OLD.status='pending' AND NEW.status IN('cancelled','confirmed') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'HR_PROBATION_PARTICIPANT_IMMUTABLE'; END IF;
 IF TG_OP='INSERT' AND application_status NOT IN('draft','returned') THEN RAISE EXCEPTION 'HR_PROBATION_PARTICIPANT_FROZEN'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_probation_participant_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_probation_application_employee FOR EACH ROW EXECUTE FUNCTION hr_probation_participant_guard();

CREATE FUNCTION hr_probation_action_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'HR probation evidence is append-only'; END $$;
CREATE TRIGGER trg_hr_probation_action_append_only BEFORE UPDATE OR DELETE ON hr_probation_application_action FOR EACH ROW EXECUTE FUNCTION hr_probation_action_append_only();

COMMIT;
