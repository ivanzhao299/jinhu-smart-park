BEGIN;

ALTER TABLE hr_employee
  ADD COLUMN attendance_card_no varchar(20);

CREATE UNIQUE INDEX uq_hr_employee_attendance_card_no
  ON hr_employee(tenant_id,park_id,attendance_card_no)
  WHERE is_deleted=false AND attendance_card_no IS NOT NULL;

CREATE TABLE hr_onboarding_application (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 application_no varchar(64) NOT NULL, application_name varchar(64) NOT NULL, employee_id uuid NOT NULL,
 candidate_id uuid, applicant_user_id uuid NOT NULL, application_date date NOT NULL, planned_hire_date date NOT NULL,
 probation_months integer NOT NULL, attendance_card_no varchar(20) NOT NULL, remark varchar(250),
 status varchar(24) NOT NULL DEFAULT 'draft', review_comment varchar(1000), reviewed_by uuid, reviewed_at timestamptz,
 confirmed_by uuid, confirmed_at timestamptz, legacy_app_id integer, legacy_notice_no varchar(20),
 legacy_status varchar(32), source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL,
 update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_onboarding_status CHECK(status IN ('draft','submitted','returned','approved','cancelled','confirmed')),
 CONSTRAINT ck_hr_onboarding_probation CHECK(probation_months BETWEEN 0 AND 12),
 CONSTRAINT ck_hr_onboarding_dates CHECK(planned_hire_date>=application_date),
 CONSTRAINT ck_hr_onboarding_review CHECK(
   (status IN ('draft','submitted','cancelled') AND reviewed_by IS NULL AND reviewed_at IS NULL)
   OR (status IN ('returned','approved','confirmed') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
 ),
 CONSTRAINT ck_hr_onboarding_confirm CHECK(
   (status='confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
   OR (status<>'confirmed' AND confirmed_by IS NULL AND confirmed_at IS NULL)
 ),
 CONSTRAINT fk_hr_onboarding_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_onboarding_candidate FOREIGN KEY(tenant_id,park_id,candidate_id) REFERENCES hr_candidate(tenant_id,park_id,id),
 CONSTRAINT fk_hr_onboarding_applicant FOREIGN KEY(tenant_id,park_id,applicant_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_onboarding_reviewer FOREIGN KEY(tenant_id,park_id,reviewed_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_onboarding_confirmer FOREIGN KEY(tenant_id,park_id,confirmed_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_onboarding_scope_id UNIQUE(tenant_id,park_id,id)
);

CREATE UNIQUE INDEX uq_hr_onboarding_application_no ON hr_onboarding_application(tenant_id,park_id,application_no);
CREATE UNIQUE INDEX uq_hr_onboarding_active_employee ON hr_onboarding_application(tenant_id,park_id,employee_id) WHERE is_deleted=false AND status<>'cancelled';
CREATE UNIQUE INDEX uq_hr_onboarding_active_card ON hr_onboarding_application(tenant_id,park_id,attendance_card_no) WHERE is_deleted=false AND status<>'cancelled';
CREATE UNIQUE INDEX uq_hr_onboarding_legacy_app ON hr_onboarding_application(tenant_id,park_id,legacy_app_id) WHERE legacy_app_id IS NOT NULL;
CREATE INDEX ix_hr_onboarding_status ON hr_onboarding_application(tenant_id,park_id,status,application_date DESC);
CREATE INDEX ix_hr_onboarding_candidate ON hr_onboarding_application(tenant_id,park_id,candidate_id) WHERE candidate_id IS NOT NULL;

CREATE FUNCTION hr_onboarding_application_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('cancelled','confirmed') THEN RAISE EXCEPTION 'HR_ONBOARDING_TERMINAL_IMMUTABLE'; END IF;
 IF (OLD.status,NEW.status) NOT IN (('draft','draft'),('draft','submitted'),('draft','cancelled'),('returned','draft'),('returned','submitted'),('returned','cancelled'),('submitted','approved'),('submitted','returned'),('submitted','cancelled'),('approved','confirmed')) THEN
  RAISE EXCEPTION 'HR_ONBOARDING_TRANSITION_INVALID: % -> %',OLD.status,NEW.status;
 END IF;
 IF OLD.status NOT IN ('draft','returned') AND (
   NEW.application_name IS DISTINCT FROM OLD.application_name OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
   OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id OR NEW.application_date IS DISTINCT FROM OLD.application_date
   OR NEW.planned_hire_date IS DISTINCT FROM OLD.planned_hire_date OR NEW.probation_months IS DISTINCT FROM OLD.probation_months
   OR NEW.attendance_card_no IS DISTINCT FROM OLD.attendance_card_no OR NEW.remark IS DISTINCT FROM OLD.remark
 ) THEN RAISE EXCEPTION 'HR_ONBOARDING_SUBMITTED_FIELDS_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_onboarding_application_guard BEFORE UPDATE ON hr_onboarding_application FOR EACH ROW EXECUTE FUNCTION hr_onboarding_application_guard();

CREATE TABLE hr_onboarding_application_action (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 application_id uuid NOT NULL, sequence_no integer NOT NULL, action varchar(24) NOT NULL,
 from_status varchar(24), to_status varchar(24) NOT NULL, comment varchar(1000), actor_user_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(), create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_hr_onboarding_action CHECK(action IN ('created','updated','submitted','resubmitted','returned','approved','cancelled','confirmed')),
 CONSTRAINT fk_hr_onboarding_action_application FOREIGN KEY(tenant_id,park_id,application_id) REFERENCES hr_onboarding_application(tenant_id,park_id,id),
 CONSTRAINT fk_hr_onboarding_action_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_onboarding_action_sequence UNIQUE(tenant_id,park_id,application_id,sequence_no),
 CONSTRAINT uq_hr_onboarding_action_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_onboarding_action_application ON hr_onboarding_application_action(tenant_id,park_id,application_id,sequence_no);

CREATE FUNCTION hr_onboarding_action_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'HR onboarding evidence is append-only'; END $$;
CREATE TRIGGER trg_hr_onboarding_action_append_only BEFORE UPDATE OR DELETE ON hr_onboarding_application_action FOR EACH ROW EXECUTE FUNCTION hr_onboarding_action_append_only();

COMMIT;
