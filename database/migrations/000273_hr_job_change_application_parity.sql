BEGIN;

CREATE TABLE hr_job_change_application (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 application_no varchar(64) NOT NULL, application_name varchar(128) NOT NULL, applicant_user_id uuid NOT NULL,
 subject_employee_id uuid NOT NULL, application_date date NOT NULL, effective_date date NOT NULL,
 change_type varchar(64) NOT NULL, before_org_id uuid NOT NULL, before_position_id uuid,
 after_org_id uuid NOT NULL, after_position_id uuid, reason varchar(2000) NOT NULL,
 before_snapshot jsonb NOT NULL, after_snapshot jsonb NOT NULL, status varchar(24) NOT NULL DEFAULT 'draft',
 review_comment varchar(1000), reviewed_by uuid, reviewed_at timestamptz,
 applied_by uuid, applied_at timestamptz, employment_event_id uuid,
 legacy_app_id integer, legacy_status varchar(32), source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 is_historical_import boolean NOT NULL DEFAULT false,
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL,
 update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_job_change_status CHECK(status IN('draft','submitted','returned','approved','cancelled','applied')),
 CONSTRAINT ck_hr_job_change_dates CHECK(effective_date>=application_date),
 CONSTRAINT ck_hr_job_change_target CHECK(after_org_id<>before_org_id OR after_position_id IS DISTINCT FROM before_position_id),
 CONSTRAINT ck_hr_job_change_review CHECK(
   (status IN('draft','submitted','cancelled') AND reviewed_by IS NULL AND reviewed_at IS NULL)
   OR (status IN('returned','approved','applied') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
 ),
 CONSTRAINT ck_hr_job_change_apply CHECK(
   (status='applied' AND applied_by IS NOT NULL AND applied_at IS NOT NULL AND employment_event_id IS NOT NULL)
   OR (status<>'applied' AND applied_by IS NULL AND applied_at IS NULL AND employment_event_id IS NULL)
 ),
 CONSTRAINT fk_hr_job_change_applicant FOREIGN KEY(tenant_id,park_id,applicant_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_job_change_employee FOREIGN KEY(tenant_id,park_id,subject_employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_job_change_before_org FOREIGN KEY(tenant_id,park_id,before_org_id) REFERENCES sys_org(tenant_id,park_id,id),
 CONSTRAINT fk_hr_job_change_after_org FOREIGN KEY(tenant_id,park_id,after_org_id) REFERENCES sys_org(tenant_id,park_id,id),
 CONSTRAINT fk_hr_job_change_before_position FOREIGN KEY(tenant_id,park_id,before_position_id) REFERENCES hr_position(tenant_id,park_id,id),
 CONSTRAINT fk_hr_job_change_after_position FOREIGN KEY(tenant_id,park_id,after_position_id) REFERENCES hr_position(tenant_id,park_id,id),
 CONSTRAINT fk_hr_job_change_reviewer FOREIGN KEY(tenant_id,park_id,reviewed_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_job_change_applier FOREIGN KEY(tenant_id,park_id,applied_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_job_change_event FOREIGN KEY(tenant_id,park_id,employment_event_id) REFERENCES hr_employment_event(tenant_id,park_id,id),
 CONSTRAINT uq_hr_job_change_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_job_change_application_no ON hr_job_change_application(tenant_id,park_id,application_no);
CREATE UNIQUE INDEX uq_hr_job_change_legacy ON hr_job_change_application(tenant_id,park_id,legacy_app_id) WHERE legacy_app_id IS NOT NULL;
CREATE UNIQUE INDEX uq_hr_job_change_active_employee ON hr_job_change_application(tenant_id,park_id,subject_employee_id) WHERE is_deleted=false AND status IN('draft','submitted','returned','approved');
CREATE INDEX ix_hr_job_change_status ON hr_job_change_application(tenant_id,park_id,status,application_date DESC) WHERE is_deleted=false;

CREATE TABLE hr_job_change_action (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 application_id uuid NOT NULL, sequence_no integer NOT NULL, action varchar(24) NOT NULL,
 from_status varchar(24), to_status varchar(24) NOT NULL, comment varchar(1000), actor_user_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(), create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_hr_job_change_action CHECK(action IN('created','updated','submitted','resubmitted','returned','approved','cancelled','applied')),
 CONSTRAINT fk_hr_job_change_action_application FOREIGN KEY(tenant_id,park_id,application_id) REFERENCES hr_job_change_application(tenant_id,park_id,id),
 CONSTRAINT fk_hr_job_change_action_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_job_change_action_scope_id UNIQUE(tenant_id,park_id,id),
 CONSTRAINT uq_hr_job_change_action_sequence UNIQUE(tenant_id,park_id,application_id,sequence_no)
);
CREATE INDEX ix_hr_job_change_action_application ON hr_job_change_action(tenant_id,park_id,application_id,sequence_no);

CREATE FUNCTION hr_job_change_application_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.is_historical_import THEN RAISE EXCEPTION 'HR_JOB_CHANGE_HISTORICAL_IMMUTABLE'; END IF;
 IF OLD.status IN('cancelled','applied') THEN RAISE EXCEPTION 'HR_JOB_CHANGE_TERMINAL_IMMUTABLE'; END IF;
 IF (OLD.status,NEW.status) NOT IN(
   ('draft','draft'),('draft','submitted'),('draft','cancelled'),
   ('returned','returned'),('returned','submitted'),('returned','cancelled'),
   ('submitted','approved'),('submitted','returned'),('submitted','cancelled'),('approved','applied')
 ) THEN RAISE EXCEPTION 'HR_JOB_CHANGE_TRANSITION_INVALID: % -> %',OLD.status,NEW.status; END IF;
 IF OLD.status NOT IN('draft','returned') AND (
   NEW.application_name,NEW.subject_employee_id,NEW.application_date,NEW.effective_date,NEW.change_type,
   NEW.before_org_id,NEW.before_position_id,NEW.after_org_id,NEW.after_position_id,NEW.reason,
   NEW.before_snapshot,NEW.after_snapshot
 ) IS DISTINCT FROM (
   OLD.application_name,OLD.subject_employee_id,OLD.application_date,OLD.effective_date,OLD.change_type,
   OLD.before_org_id,OLD.before_position_id,OLD.after_org_id,OLD.after_position_id,OLD.reason,
   OLD.before_snapshot,OLD.after_snapshot
 ) THEN RAISE EXCEPTION 'HR_JOB_CHANGE_SUBMITTED_FACTS_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_job_change_application_guard BEFORE UPDATE ON hr_job_change_application FOR EACH ROW EXECUTE FUNCTION hr_job_change_application_guard();

CREATE FUNCTION hr_job_change_action_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'HR job change evidence is append-only'; END $$;
CREATE TRIGGER trg_hr_job_change_action_append_only BEFORE UPDATE OR DELETE ON hr_job_change_action FOR EACH ROW EXECUTE FUNCTION hr_job_change_action_append_only();

COMMIT;
