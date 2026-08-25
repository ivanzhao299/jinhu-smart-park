BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employee_scope_id ON hr_employee(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_scope_id ON sys_user(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_file_scope_id ON sys_file(tenant_id,park_id,id);

CREATE TABLE hr_training_course (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 course_code varchar(64) NOT NULL, current_version_no integer NOT NULL DEFAULT 1, status varchar(24) NOT NULL DEFAULT 'enabled',
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(),
 is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_training_course_version CHECK(current_version_no>0), CONSTRAINT ck_hr_training_course_status CHECK(status IN('enabled','disabled')),
 CONSTRAINT fk_hr_training_course_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_course_updater FOREIGN KEY(tenant_id,park_id,update_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_training_course_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_training_course_code ON hr_training_course(tenant_id,park_id,course_code) WHERE is_deleted=false;
CREATE INDEX ix_hr_training_course_creator ON hr_training_course(tenant_id,park_id,create_by);
CREATE INDEX ix_hr_training_course_updater ON hr_training_course(tenant_id,park_id,update_by);

CREATE TABLE hr_training_course_version (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, course_id uuid NOT NULL,
 version_no integer NOT NULL, title varchar(160) NOT NULL, category varchar(64) NOT NULL, provider varchar(160),
 hours numeric(10,2) NOT NULL, description varchar(2000), create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_hr_training_course_hours CHECK(hours>0 AND hours<=999999.99),
 CONSTRAINT fk_hr_training_course_version_course FOREIGN KEY(tenant_id,park_id,course_id) REFERENCES hr_training_course(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_course_version_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_training_course_version_scope_id UNIQUE(tenant_id,park_id,id),
 CONSTRAINT uq_hr_training_course_version_course_scope_id UNIQUE(tenant_id,park_id,course_id,id),
 CONSTRAINT uq_hr_training_course_version_no UNIQUE(tenant_id,park_id,course_id,version_no)
);
CREATE INDEX ix_hr_training_course_version_course ON hr_training_course_version(tenant_id,park_id,course_id);
CREATE INDEX ix_hr_training_course_version_creator ON hr_training_course_version(tenant_id,park_id,create_by);

CREATE TABLE hr_training_plan (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 plan_code varchar(64) NOT NULL, plan_name varchar(160) NOT NULL, course_id uuid NOT NULL, course_version_id uuid NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'draft', mandatory boolean NOT NULL DEFAULT false, start_date date NOT NULL, end_date date NOT NULL,
 budget_amount numeric(20,4) NOT NULL DEFAULT 0, cost_currency varchar(3) NOT NULL DEFAULT 'CNY', participant_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
 snapshot jsonb, published_at timestamptz, started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_training_plan_status CHECK(status IN('draft','published','in_progress','completed','cancelled')),
 CONSTRAINT ck_hr_training_plan_dates CHECK(end_date>=start_date), CONSTRAINT ck_hr_training_plan_budget CHECK(budget_amount>=0),
 CONSTRAINT ck_hr_training_plan_currency CHECK(cost_currency~'^[A-Z]{3}$'),
 CONSTRAINT ck_hr_training_plan_snapshot CHECK((status='draft' AND snapshot IS NULL AND published_at IS NULL) OR (status<>'draft' AND snapshot IS NOT NULL AND published_at IS NOT NULL)),
 CONSTRAINT fk_hr_training_plan_course FOREIGN KEY(tenant_id,park_id,course_id) REFERENCES hr_training_course(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_plan_course_version FOREIGN KEY(tenant_id,park_id,course_id,course_version_id) REFERENCES hr_training_course_version(tenant_id,park_id,course_id,id),
 CONSTRAINT fk_hr_training_plan_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_plan_updater FOREIGN KEY(tenant_id,park_id,update_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_training_plan_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_training_plan_code ON hr_training_plan(tenant_id,park_id,plan_code) WHERE is_deleted=false;
CREATE INDEX ix_hr_training_plan_course ON hr_training_plan(tenant_id,park_id,course_id);
CREATE INDEX ix_hr_training_plan_course_version ON hr_training_plan(tenant_id,park_id,course_version_id);
CREATE INDEX ix_hr_training_plan_course_version_scope ON hr_training_plan(tenant_id,park_id,course_id,course_version_id);
CREATE INDEX ix_hr_training_plan_creator ON hr_training_plan(tenant_id,park_id,create_by);
CREATE INDEX ix_hr_training_plan_updater ON hr_training_plan(tenant_id,park_id,update_by);
CREATE INDEX ix_hr_training_plan_status_dates ON hr_training_plan(tenant_id,park_id,status,start_date,end_date) WHERE is_deleted=false;

CREATE TABLE hr_training_participant (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, plan_id uuid NOT NULL, employee_id uuid NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'assigned', checked_in_at timestamptz, completed_at timestamptz,
 completed_hours numeric(10,2), score numeric(8,2), evaluation varchar(1000), actual_cost numeric(20,4), certificate_file_id uuid,
 create_time timestamptz NOT NULL DEFAULT now(), update_time timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_training_participant_status CHECK(status IN('assigned','checked_in','completed','cancelled')),
 CONSTRAINT ck_hr_training_participant_hours CHECK(completed_hours IS NULL OR (completed_hours>=0 AND completed_hours<=999999.99)),
 CONSTRAINT ck_hr_training_participant_score CHECK(score IS NULL OR (score>=0 AND score<=100)), CONSTRAINT ck_hr_training_participant_cost CHECK(actual_cost IS NULL OR actual_cost>=0),
 CONSTRAINT ck_hr_training_participant_completion CHECK((status='completed' AND completed_at IS NOT NULL AND completed_hours IS NOT NULL) OR (status<>'completed' AND completed_at IS NULL)),
 CONSTRAINT fk_hr_training_participant_plan FOREIGN KEY(tenant_id,park_id,plan_id) REFERENCES hr_training_plan(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_participant_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_participant_certificate FOREIGN KEY(tenant_id,park_id,certificate_file_id) REFERENCES sys_file(tenant_id,park_id,id),
 CONSTRAINT uq_hr_training_participant_scope_id UNIQUE(tenant_id,park_id,id),
 CONSTRAINT uq_hr_training_participant_plan_scope_id UNIQUE(tenant_id,park_id,plan_id,id),
 CONSTRAINT uq_hr_training_participant_employee UNIQUE(tenant_id,park_id,plan_id,employee_id)
);
CREATE INDEX ix_hr_training_participant_plan ON hr_training_participant(tenant_id,park_id,plan_id);
CREATE INDEX ix_hr_training_participant_employee ON hr_training_participant(tenant_id,park_id,employee_id);
CREATE INDEX ix_hr_training_participant_certificate ON hr_training_participant(tenant_id,park_id,certificate_file_id);

CREATE TABLE hr_training_result_correction (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 participant_id uuid NOT NULL, sequence_no integer NOT NULL, corrected_hours numeric(10,2), corrected_score numeric(8,2), corrected_evaluation varchar(1000), corrected_actual_cost numeric(20,4), certificate_file_id uuid,
 reason varchar(1000) NOT NULL, create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_hr_training_correction_seq CHECK(sequence_no>0),
 CONSTRAINT ck_hr_training_correction_value CHECK(corrected_hours IS NOT NULL OR corrected_score IS NOT NULL OR corrected_evaluation IS NOT NULL OR corrected_actual_cost IS NOT NULL OR certificate_file_id IS NOT NULL),
 CONSTRAINT ck_hr_training_correction_hours CHECK(corrected_hours IS NULL OR (corrected_hours>=0 AND corrected_hours<=999999.99)),
 CONSTRAINT ck_hr_training_correction_score CHECK(corrected_score IS NULL OR (corrected_score>=0 AND corrected_score<=100)), CONSTRAINT ck_hr_training_correction_cost CHECK(corrected_actual_cost IS NULL OR corrected_actual_cost>=0),
 CONSTRAINT fk_hr_training_correction_participant FOREIGN KEY(tenant_id,park_id,participant_id) REFERENCES hr_training_participant(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_correction_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_correction_certificate FOREIGN KEY(tenant_id,park_id,certificate_file_id) REFERENCES sys_file(tenant_id,park_id,id),
 CONSTRAINT uq_hr_training_correction_scope_id UNIQUE(tenant_id,park_id,id),
 CONSTRAINT uq_hr_training_correction_seq UNIQUE(tenant_id,park_id,participant_id,sequence_no)
);
CREATE INDEX ix_hr_training_correction_participant ON hr_training_result_correction(tenant_id,park_id,participant_id);
CREATE INDEX ix_hr_training_correction_creator ON hr_training_result_correction(tenant_id,park_id,create_by);
CREATE INDEX ix_hr_training_correction_certificate ON hr_training_result_correction(tenant_id,park_id,certificate_file_id);

CREATE TABLE hr_training_action (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, plan_id uuid NOT NULL,
 participant_id uuid, action varchar(32) NOT NULL, from_status varchar(24), to_status varchar(24), note varchar(1000), actor_user_id uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_hr_training_action_type CHECK(action IN('publish','start','cancel','check_in','complete','correct')),
 CONSTRAINT fk_hr_training_action_plan FOREIGN KEY(tenant_id,park_id,plan_id) REFERENCES hr_training_plan(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_action_participant FOREIGN KEY(tenant_id,park_id,plan_id,participant_id) REFERENCES hr_training_participant(tenant_id,park_id,plan_id,id),
 CONSTRAINT fk_hr_training_action_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_training_action_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_training_action_plan ON hr_training_action(tenant_id,park_id,plan_id);
CREATE INDEX ix_hr_training_action_participant ON hr_training_action(tenant_id,park_id,participant_id);
CREATE INDEX ix_hr_training_action_actor ON hr_training_action(tenant_id,park_id,actor_user_id);

CREATE OR REPLACE FUNCTION fn_hr_training_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '% is append-only',TG_TABLE_NAME; END $$;
CREATE TRIGGER tr_hr_training_course_version_immutable BEFORE UPDATE OR DELETE ON hr_training_course_version FOR EACH ROW EXECUTE FUNCTION fn_hr_training_append_only();
CREATE TRIGGER tr_hr_training_correction_immutable BEFORE UPDATE OR DELETE ON hr_training_result_correction FOR EACH ROW EXECUTE FUNCTION fn_hr_training_append_only();
CREATE TRIGGER tr_hr_training_action_immutable BEFORE UPDATE OR DELETE ON hr_training_action FOR EACH ROW EXECUTE FUNCTION fn_hr_training_append_only();

CREATE OR REPLACE FUNCTION fn_hr_training_plan_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'training plan is immutable'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='draft' AND NEW.status='published') OR (OLD.status='published' AND NEW.status='in_progress') OR (OLD.status='in_progress' AND NEW.status IN('completed','cancelled'))) THEN RAISE EXCEPTION 'invalid training plan transition'; END IF;
 IF OLD.status<>'draft' AND (NEW.course_id,NEW.course_version_id,NEW.mandatory,NEW.start_date,NEW.end_date,NEW.budget_amount,NEW.cost_currency,NEW.participant_scope,NEW.snapshot,NEW.published_at) IS DISTINCT FROM (OLD.course_id,OLD.course_version_id,OLD.mandatory,OLD.start_date,OLD.end_date,OLD.budget_amount,OLD.cost_currency,OLD.participant_scope,OLD.snapshot,OLD.published_at) THEN RAISE EXCEPTION 'published training plan snapshot is immutable'; END IF;
 IF OLD.status IN('completed','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'terminal training plan is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_hr_training_plan_guard BEFORE UPDATE OR DELETE ON hr_training_plan FOR EACH ROW EXECUTE FUNCTION fn_hr_training_plan_guard();

CREATE OR REPLACE FUNCTION fn_hr_training_participant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ps varchar(24);
BEGIN
 SELECT status INTO ps FROM hr_training_plan WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id) AND park_id=COALESCE(NEW.park_id,OLD.park_id) AND id=COALESCE(NEW.plan_id,OLD.plan_id) FOR SHARE;
 IF TG_OP='INSERT' AND ps<>'draft' THEN RAISE EXCEPTION 'published training participants are immutable'; END IF;
 IF TG_OP='DELETE' AND ps<>'draft' THEN RAISE EXCEPTION 'published training participants are immutable'; END IF;
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.park_id,NEW.plan_id,NEW.employee_id) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.plan_id,OLD.employee_id) THEN RAISE EXCEPTION 'training participant ownership is immutable'; END IF;
 IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='assigned' AND NEW.status IN('checked_in','completed','cancelled')) OR (OLD.status='checked_in' AND NEW.status IN('completed','cancelled'))) THEN RAISE EXCEPTION 'invalid training participant transition'; END IF;
 IF TG_OP='UPDATE' AND OLD.status='completed' AND (NEW.status,NEW.checked_in_at,NEW.completed_at,NEW.completed_hours,NEW.score,NEW.evaluation,NEW.actual_cost,NEW.certificate_file_id) IS DISTINCT FROM (OLD.status,OLD.checked_in_at,OLD.completed_at,OLD.completed_hours,OLD.score,OLD.evaluation,OLD.actual_cost,OLD.certificate_file_id) THEN RAISE EXCEPTION 'completed training result requires correction'; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER tr_hr_training_participant_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_training_participant FOR EACH ROW EXECUTE FUNCTION fn_hr_training_participant_guard();

CREATE OR REPLACE FUNCTION fn_hr_training_certificate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE file_id uuid; owner_id uuid;
BEGIN
 file_id:=NEW.certificate_file_id;
 IF file_id IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='hr_training_participant' THEN
  owner_id:=NEW.id;
 ELSE
  owner_id:=NEW.participant_id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM sys_file f WHERE f.tenant_id=NEW.tenant_id AND f.park_id=NEW.park_id AND f.id=file_id AND f.biz_type='hr_training_certificate' AND f.biz_id=owner_id AND f.status=1 AND f.is_deleted=false FOR SHARE) THEN
  RAISE EXCEPTION 'training certificate file owner mismatch';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_hr_training_participant_certificate BEFORE INSERT OR UPDATE OF certificate_file_id ON hr_training_participant FOR EACH ROW EXECUTE FUNCTION fn_hr_training_certificate_guard();
CREATE TRIGGER tr_hr_training_correction_certificate BEFORE INSERT OR UPDATE OF certificate_file_id ON hr_training_result_correction FOR EACH ROW EXECUTE FUNCTION fn_hr_training_certificate_guard();

COMMIT;
