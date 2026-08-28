BEGIN;

CREATE TABLE hr_departure_application (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 application_no varchar(64) NOT NULL, application_name varchar(128) NOT NULL, applicant_user_id uuid NOT NULL,
 subject_employee_id uuid NOT NULL, application_date date NOT NULL, planned_departure_date date NOT NULL,
 departure_type varchar(64) NOT NULL, reason varchar(2000) NOT NULL, before_snapshot jsonb NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'draft', review_comment varchar(1000), reviewed_by uuid, reviewed_at timestamptz,
 interview_status varchar(16) NOT NULL DEFAULT 'pending', interview_by uuid, interview_at timestamptz,
 interview_place varchar(200), interview_summary varchar(2000),
 survey_status varchar(16) NOT NULL DEFAULT 'pending', survey_by uuid, survey_at timestamptz,
 survey_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb, survey_summary varchar(2000),
 handover_status varchar(16) NOT NULL DEFAULT 'pending', handover_by uuid, handover_at timestamptz,
 handover_to_employee_id uuid, handover_summary varchar(2000),
 wage_status varchar(16) NOT NULL DEFAULT 'pending', wage_by uuid, wage_at timestamptz, wage_note varchar(1000),
 archive_status varchar(16) NOT NULL DEFAULT 'open', archive_by uuid, archive_at timestamptz, archive_note varchar(1000),
 applied_by uuid, applied_at timestamptz, employment_event_id uuid,
 legacy_app_id integer, legacy_status varchar(32), source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 is_historical_import boolean NOT NULL DEFAULT false,
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL,
 update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_departure_status CHECK(status IN('draft','submitted','returned','approved','cancelled','applied')),
 CONSTRAINT ck_hr_departure_dates CHECK(planned_departure_date>=application_date),
 CONSTRAINT ck_hr_departure_interview CHECK(
   (interview_status='pending' AND interview_by IS NULL AND interview_at IS NULL)
   OR (interview_status IN('completed','waived') AND interview_by IS NOT NULL AND interview_at IS NOT NULL)
 ),
 CONSTRAINT ck_hr_departure_survey CHECK(
   jsonb_typeof(survey_reason_codes)='array' AND ((survey_status='pending' AND survey_by IS NULL AND survey_at IS NULL)
   OR (survey_status IN('completed','waived') AND survey_by IS NOT NULL AND survey_at IS NOT NULL))
 ),
 CONSTRAINT ck_hr_departure_handover CHECK(
   (handover_status='pending' AND handover_by IS NULL AND handover_at IS NULL)
   OR (handover_status IN('completed','waived') AND handover_by IS NOT NULL AND handover_at IS NOT NULL)
 ),
 CONSTRAINT ck_hr_departure_wage CHECK(
   (wage_status='pending' AND wage_by IS NULL AND wage_at IS NULL)
   OR (wage_status IN('settled','waived') AND wage_by IS NOT NULL AND wage_at IS NOT NULL)
 ),
 CONSTRAINT ck_hr_departure_archive CHECK(
   (archive_status='open' AND archive_by IS NULL AND archive_at IS NULL)
   OR (archive_status='closed' AND archive_by IS NOT NULL AND archive_at IS NOT NULL)
 ),
 CONSTRAINT ck_hr_departure_review CHECK(
   (status IN('draft','submitted','cancelled') AND reviewed_by IS NULL AND reviewed_at IS NULL)
   OR (status IN('returned','approved','applied') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
 ),
 CONSTRAINT ck_hr_departure_apply CHECK(
   (status='applied' AND applied_by IS NOT NULL AND applied_at IS NOT NULL AND employment_event_id IS NOT NULL
     AND interview_status IN('completed','waived') AND survey_status IN('completed','waived')
     AND handover_status IN('completed','waived') AND wage_status IN('settled','waived') AND archive_status='closed')
   OR (status<>'applied' AND applied_by IS NULL AND applied_at IS NULL AND employment_event_id IS NULL)
 ),
 CONSTRAINT fk_hr_departure_applicant FOREIGN KEY(tenant_id,park_id,applicant_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_departure_employee FOREIGN KEY(tenant_id,park_id,subject_employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_departure_reviewer FOREIGN KEY(tenant_id,park_id,reviewed_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_departure_interviewer FOREIGN KEY(tenant_id,park_id,interview_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_departure_surveyor FOREIGN KEY(tenant_id,park_id,survey_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_departure_handover_actor FOREIGN KEY(tenant_id,park_id,handover_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_departure_handover_employee FOREIGN KEY(tenant_id,park_id,handover_to_employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_departure_wage_actor FOREIGN KEY(tenant_id,park_id,wage_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_departure_archive_actor FOREIGN KEY(tenant_id,park_id,archive_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_departure_applier FOREIGN KEY(tenant_id,park_id,applied_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_departure_event FOREIGN KEY(tenant_id,park_id,employment_event_id) REFERENCES hr_employment_event(tenant_id,park_id,id),
 CONSTRAINT uq_hr_departure_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_departure_application_no ON hr_departure_application(tenant_id,park_id,application_no);
CREATE UNIQUE INDEX uq_hr_departure_legacy ON hr_departure_application(tenant_id,park_id,legacy_app_id) WHERE legacy_app_id IS NOT NULL;
CREATE UNIQUE INDEX uq_hr_departure_active_employee ON hr_departure_application(tenant_id,park_id,subject_employee_id) WHERE is_deleted=false AND status IN('draft','submitted','returned','approved');
CREATE INDEX ix_hr_departure_status ON hr_departure_application(tenant_id,park_id,status,application_date DESC) WHERE is_deleted=false;

CREATE TABLE hr_departure_action (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 application_id uuid NOT NULL, sequence_no integer NOT NULL, action varchar(32) NOT NULL,
 from_status varchar(24), to_status varchar(24) NOT NULL, comment varchar(1000), actor_user_id uuid NOT NULL,
 evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now(), create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_hr_departure_action CHECK(action IN('created','updated','submitted','resubmitted','returned','approved','cancelled','interview_completed','interview_waived','survey_completed','survey_waived','handover_completed','handover_waived','wage_settled','wage_waived','archive_closed','applied')),
 CONSTRAINT fk_hr_departure_action_application FOREIGN KEY(tenant_id,park_id,application_id) REFERENCES hr_departure_application(tenant_id,park_id,id),
 CONSTRAINT fk_hr_departure_action_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_departure_action_scope_id UNIQUE(tenant_id,park_id,id),
 CONSTRAINT uq_hr_departure_action_sequence UNIQUE(tenant_id,park_id,application_id,sequence_no)
);
CREATE INDEX ix_hr_departure_action_application ON hr_departure_action(tenant_id,park_id,application_id,sequence_no);

CREATE FUNCTION hr_departure_application_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.is_historical_import THEN RAISE EXCEPTION 'HR_DEPARTURE_HISTORICAL_IMMUTABLE'; END IF;
 IF OLD.status IN('cancelled','applied') THEN RAISE EXCEPTION 'HR_DEPARTURE_TERMINAL_IMMUTABLE'; END IF;
 IF (OLD.status,NEW.status) NOT IN(
   ('draft','draft'),('draft','submitted'),('draft','cancelled'),
   ('returned','returned'),('returned','submitted'),('returned','cancelled'),
   ('submitted','approved'),('submitted','returned'),('submitted','cancelled'),('approved','approved'),('approved','applied')
 ) THEN RAISE EXCEPTION 'HR_DEPARTURE_TRANSITION_INVALID: % -> %',OLD.status,NEW.status; END IF;
 IF OLD.status NOT IN('draft','returned') AND (
   NEW.application_name,NEW.subject_employee_id,NEW.application_date,NEW.planned_departure_date,
   NEW.departure_type,NEW.reason,NEW.before_snapshot
 ) IS DISTINCT FROM (
   OLD.application_name,OLD.subject_employee_id,OLD.application_date,OLD.planned_departure_date,
   OLD.departure_type,OLD.reason,OLD.before_snapshot
 ) THEN RAISE EXCEPTION 'HR_DEPARTURE_SUBMITTED_FACTS_IMMUTABLE'; END IF;
 IF OLD.status<>'approved' AND (
   NEW.interview_status,NEW.interview_by,NEW.interview_at,NEW.interview_place,NEW.interview_summary,
   NEW.survey_status,NEW.survey_by,NEW.survey_at,NEW.survey_reason_codes,NEW.survey_summary,
   NEW.handover_status,NEW.handover_by,NEW.handover_at,NEW.handover_to_employee_id,NEW.handover_summary,
   NEW.wage_status,NEW.wage_by,NEW.wage_at,NEW.wage_note,
   NEW.archive_status,NEW.archive_by,NEW.archive_at,NEW.archive_note
 ) IS DISTINCT FROM (
   OLD.interview_status,OLD.interview_by,OLD.interview_at,OLD.interview_place,OLD.interview_summary,
   OLD.survey_status,OLD.survey_by,OLD.survey_at,OLD.survey_reason_codes,OLD.survey_summary,
   OLD.handover_status,OLD.handover_by,OLD.handover_at,OLD.handover_to_employee_id,OLD.handover_summary,
   OLD.wage_status,OLD.wage_by,OLD.wage_at,OLD.wage_note,
   OLD.archive_status,OLD.archive_by,OLD.archive_at,OLD.archive_note
 ) THEN RAISE EXCEPTION 'HR_DEPARTURE_CLEARANCE_REQUIRES_APPROVAL'; END IF;
 IF OLD.interview_status<>'pending' AND (NEW.interview_status,NEW.interview_by,NEW.interview_at,NEW.interview_place,NEW.interview_summary) IS DISTINCT FROM (OLD.interview_status,OLD.interview_by,OLD.interview_at,OLD.interview_place,OLD.interview_summary) THEN RAISE EXCEPTION 'HR_DEPARTURE_INTERVIEW_IMMUTABLE'; END IF;
 IF OLD.survey_status<>'pending' AND (NEW.survey_status,NEW.survey_by,NEW.survey_at,NEW.survey_reason_codes,NEW.survey_summary) IS DISTINCT FROM (OLD.survey_status,OLD.survey_by,OLD.survey_at,OLD.survey_reason_codes,OLD.survey_summary) THEN RAISE EXCEPTION 'HR_DEPARTURE_SURVEY_IMMUTABLE'; END IF;
 IF OLD.handover_status<>'pending' AND (NEW.handover_status,NEW.handover_by,NEW.handover_at,NEW.handover_to_employee_id,NEW.handover_summary) IS DISTINCT FROM (OLD.handover_status,OLD.handover_by,OLD.handover_at,OLD.handover_to_employee_id,OLD.handover_summary) THEN RAISE EXCEPTION 'HR_DEPARTURE_HANDOVER_IMMUTABLE'; END IF;
 IF OLD.wage_status<>'pending' AND (NEW.wage_status,NEW.wage_by,NEW.wage_at,NEW.wage_note) IS DISTINCT FROM (OLD.wage_status,OLD.wage_by,OLD.wage_at,OLD.wage_note) THEN RAISE EXCEPTION 'HR_DEPARTURE_WAGE_IMMUTABLE'; END IF;
 IF OLD.archive_status='closed' AND (NEW.archive_status,NEW.archive_by,NEW.archive_at,NEW.archive_note) IS DISTINCT FROM (OLD.archive_status,OLD.archive_by,OLD.archive_at,OLD.archive_note) THEN RAISE EXCEPTION 'HR_DEPARTURE_ARCHIVE_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_departure_application_guard BEFORE UPDATE ON hr_departure_application FOR EACH ROW EXECUTE FUNCTION hr_departure_application_guard();

CREATE FUNCTION hr_departure_action_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'HR departure evidence is append-only'; END $$;
CREATE TRIGGER trg_hr_departure_action_append_only BEFORE UPDATE OR DELETE ON hr_departure_action FOR EACH ROW EXECUTE FUNCTION hr_departure_action_append_only();

CREATE FUNCTION hr_employee_departure_workflow_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.employment_status='departed' AND OLD.employment_status<>'departed' AND NOT EXISTS(
   SELECT 1 FROM hr_departure_application d
   WHERE d.tenant_id=NEW.tenant_id AND d.park_id=NEW.park_id AND d.subject_employee_id=NEW.id
     AND d.is_deleted=false AND d.status='approved' AND d.planned_departure_date=NEW.departure_date
     AND d.interview_status IN('completed','waived') AND d.survey_status IN('completed','waived')
     AND d.handover_status IN('completed','waived') AND d.wage_status IN('settled','waived') AND d.archive_status='closed'
 ) THEN RAISE EXCEPTION 'HR_EMPLOYEE_DEPARTURE_WORKFLOW_REQUIRED'; END IF;
 IF NEW.employment_status=OLD.employment_status AND NEW.departure_date IS DISTINCT FROM OLD.departure_date THEN
   RAISE EXCEPTION 'HR_EMPLOYEE_DEPARTURE_DATE_WORKFLOW_REQUIRED';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_employee_departure_workflow_guard BEFORE UPDATE OF employment_status,departure_date ON hr_employee FOR EACH ROW EXECUTE FUNCTION hr_employee_departure_workflow_guard();

COMMIT;
