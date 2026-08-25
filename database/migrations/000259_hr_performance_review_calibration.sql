BEGIN;

ALTER TABLE hr_performance_review_cycle ALTER COLUMN status TYPE varchar(24);
ALTER TABLE hr_performance_cycle_employee ALTER COLUMN status TYPE varchar(24);

-- 000258 froze the local variable at varchar(20); keep the forward-compatible
-- trigger contract aligned with the widened employee_acknowledged state.
CREATE OR REPLACE FUNCTION hr_performance_cycle_employee_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE r record; cycle_status varchar(24);BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 SELECT status INTO cycle_status FROM hr_performance_review_cycle WHERE id=r.cycle_id AND tenant_id=r.tenant_id AND park_id=r.park_id FOR SHARE;
 IF TG_OP='INSERT' AND cycle_status<>'planning' THEN RAISE EXCEPTION 'published performance cycle employees are frozen'; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'performance cycle employee is immutable'; END IF;
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.park_id,NEW.cycle_id,NEW.employee_id,NEW.employee_snapshot,NEW.goal_snapshot,NEW.create_time) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.cycle_id,OLD.employee_id,OLD.employee_snapshot,OLD.goal_snapshot,OLD.create_time) THEN RAISE EXCEPTION 'performance cycle employee snapshot is immutable'; END IF;
 IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='planning' AND NEW.status='self_review') OR (OLD.status='self_review' AND NEW.status='manager_review') OR (OLD.status='manager_review' AND NEW.status='calibration') OR (OLD.status='calibration' AND NEW.status='employee_acknowledged') OR (OLD.status='employee_acknowledged' AND NEW.status IN('appealed','confirmed')) OR (OLD.status='appealed' AND NEW.status='confirmed')) THEN RAISE EXCEPTION 'invalid performance employee transition'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

ALTER TABLE hr_performance_cycle_employee
  ADD COLUMN self_score numeric(7,2),
  ADD COLUMN manager_score numeric(7,2),
  ADD COLUMN calibrated_score numeric(7,2),
  ADD COLUMN final_score numeric(7,2),
  ADD COLUMN final_level_code varchar(32),
  ADD COLUMN final_level_name varchar(64),
  ADD COLUMN result_finalized_at timestamptz,
  ADD COLUMN acknowledged_at timestamptz,
  ADD COLUMN confirmed_at timestamptz;
ALTER TABLE hr_performance_cycle_employee ADD CONSTRAINT ck_hr_perf_employee_result_scores CHECK(
  (self_score IS NULL OR self_score BETWEEN 0 AND 100) AND
  (manager_score IS NULL OR manager_score BETWEEN 0 AND 100) AND
  (calibrated_score IS NULL OR calibrated_score BETWEEN 0 AND 100) AND
  (final_score IS NULL OR final_score BETWEEN 0 AND 100)
);
ALTER TABLE hr_performance_cycle_employee ADD CONSTRAINT ck_hr_perf_employee_final_result_shape CHECK(
  (final_score IS NULL AND final_level_code IS NULL AND final_level_name IS NULL AND result_finalized_at IS NULL)
  OR (final_score IS NOT NULL AND final_level_code IS NOT NULL AND final_level_name IS NOT NULL AND result_finalized_at IS NOT NULL)
);

CREATE TABLE hr_performance_review_submission (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 cycle_employee_id uuid NOT NULL, submission_type varchar(16) NOT NULL, submission_no integer NOT NULL,
 dimension_scores jsonb NOT NULL, dimension_comments jsonb NOT NULL DEFAULT '{}'::jsonb, computed_score numeric(7,2) NOT NULL,
 actor_user_id uuid NOT NULL, actor_employee_id uuid, submitted_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_perf_submission_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT uq_hr_perf_submission_no UNIQUE(tenant_id,park_id,cycle_employee_id,submission_type,submission_no),
	 CONSTRAINT fk_hr_perf_submission_employee FOREIGN KEY(cycle_employee_id,tenant_id,park_id) REFERENCES hr_performance_cycle_employee(id,tenant_id,park_id),
	 CONSTRAINT fk_hr_perf_submission_actor_user FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
	 CONSTRAINT fk_hr_perf_submission_actor_employee FOREIGN KEY(tenant_id,park_id,actor_employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT ck_hr_perf_submission_type CHECK(submission_type IN('self','manager')),
 CONSTRAINT ck_hr_perf_submission_scores CHECK(jsonb_typeof(dimension_scores)='object' AND jsonb_typeof(dimension_comments)='object' AND computed_score BETWEEN 0 AND 100)
);
CREATE INDEX idx_hr_perf_submission_employee ON hr_performance_review_submission(cycle_employee_id,tenant_id,park_id);
CREATE INDEX idx_hr_perf_submission_actor_user ON hr_performance_review_submission(tenant_id,park_id,actor_user_id);
CREATE INDEX idx_hr_perf_submission_actor_employee ON hr_performance_review_submission(tenant_id,park_id,actor_employee_id);

CREATE TABLE hr_performance_calibration_batch (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 cycle_id uuid NOT NULL, batch_name varchar(120) NOT NULL, meeting_at timestamptz NOT NULL, status varchar(16) NOT NULL DEFAULT 'draft',
 created_by uuid NOT NULL, completed_by uuid, completed_at timestamptz, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_perf_calibration_batch_scope UNIQUE(id,tenant_id,park_id),
	 CONSTRAINT uq_hr_perf_calibration_batch_name UNIQUE(tenant_id,park_id,cycle_id,batch_name),
	 CONSTRAINT fk_hr_perf_calibration_batch_cycle FOREIGN KEY(cycle_id,tenant_id,park_id) REFERENCES hr_performance_review_cycle(id,tenant_id,park_id),
	 CONSTRAINT fk_hr_perf_calibration_batch_creator FOREIGN KEY(tenant_id,park_id,created_by) REFERENCES sys_user(tenant_id,park_id,id),
	 CONSTRAINT fk_hr_perf_calibration_batch_completer FOREIGN KEY(tenant_id,park_id,completed_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT ck_hr_perf_calibration_batch_status CHECK(status IN('draft','active','completed')),
 CONSTRAINT ck_hr_perf_calibration_batch_complete CHECK((status='completed')=(completed_by IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE INDEX idx_hr_perf_calibration_batch_cycle ON hr_performance_calibration_batch(cycle_id,tenant_id,park_id);
CREATE INDEX idx_hr_perf_calibration_batch_creator ON hr_performance_calibration_batch(tenant_id,park_id,created_by);
CREATE INDEX idx_hr_perf_calibration_batch_completer ON hr_performance_calibration_batch(tenant_id,park_id,completed_by);
CREATE UNIQUE INDEX uq_hr_perf_active_calibration_batch ON hr_performance_calibration_batch(tenant_id,park_id,cycle_id) WHERE status='active';

CREATE TABLE hr_performance_calibration_participant (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 batch_id uuid NOT NULL, participant_user_id uuid NOT NULL, participant_employee_id uuid, create_time timestamptz NOT NULL DEFAULT now(),
	 CONSTRAINT uq_hr_perf_calibration_participant UNIQUE(tenant_id,park_id,batch_id,participant_user_id),
	 CONSTRAINT fk_hr_perf_calibration_participant_batch FOREIGN KEY(batch_id,tenant_id,park_id) REFERENCES hr_performance_calibration_batch(id,tenant_id,park_id),
	 CONSTRAINT fk_hr_perf_calibration_participant_user FOREIGN KEY(tenant_id,park_id,participant_user_id) REFERENCES sys_user(tenant_id,park_id,id),
	 CONSTRAINT fk_hr_perf_calibration_participant_employee FOREIGN KEY(tenant_id,park_id,participant_employee_id) REFERENCES hr_employee(tenant_id,park_id,id)
);
CREATE INDEX idx_hr_perf_calibration_participant_batch ON hr_performance_calibration_participant(batch_id,tenant_id,park_id);
CREATE INDEX idx_hr_perf_calibration_participant_user ON hr_performance_calibration_participant(tenant_id,park_id,participant_user_id);
CREATE INDEX idx_hr_perf_calibration_participant_employee ON hr_performance_calibration_participant(tenant_id,park_id,participant_employee_id);

CREATE TABLE hr_performance_calibration_entry (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 batch_id uuid NOT NULL, cycle_employee_id uuid NOT NULL, entry_no integer NOT NULL,
 before_score numeric(7,2) NOT NULL, after_score numeric(7,2) NOT NULL, dimension_scores jsonb NOT NULL,
 reason varchar(1000) NOT NULL, actor_user_id uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_perf_calibration_entry_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT uq_hr_perf_calibration_entry_no UNIQUE(tenant_id,park_id,batch_id,cycle_employee_id,entry_no),
	 CONSTRAINT fk_hr_perf_calibration_entry_batch FOREIGN KEY(batch_id,tenant_id,park_id) REFERENCES hr_performance_calibration_batch(id,tenant_id,park_id),
	 CONSTRAINT fk_hr_perf_calibration_entry_employee FOREIGN KEY(cycle_employee_id,tenant_id,park_id) REFERENCES hr_performance_cycle_employee(id,tenant_id,park_id),
	 CONSTRAINT fk_hr_perf_calibration_entry_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT ck_hr_perf_calibration_scores CHECK(before_score BETWEEN 0 AND 100 AND after_score BETWEEN 0 AND 100 AND jsonb_typeof(dimension_scores)='object'),
 CONSTRAINT ck_hr_perf_calibration_reason CHECK(length(btrim(reason))>=2)
);
CREATE INDEX idx_hr_perf_calibration_entry_batch ON hr_performance_calibration_entry(batch_id,tenant_id,park_id);
CREATE INDEX idx_hr_perf_calibration_entry_employee ON hr_performance_calibration_entry(cycle_employee_id,tenant_id,park_id);
CREATE INDEX idx_hr_perf_calibration_entry_actor ON hr_performance_calibration_entry(tenant_id,park_id,actor_user_id);

CREATE TABLE hr_performance_appeal (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 cycle_employee_id uuid NOT NULL, appeal_no integer NOT NULL, reason varchar(2000) NOT NULL, status varchar(16) NOT NULL DEFAULT 'submitted',
 submitted_by uuid NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(), resolved_by uuid, resolved_at timestamptz,
 decision varchar(16), decision_reason varchar(2000),
 CONSTRAINT uq_hr_perf_appeal_scope UNIQUE(id,tenant_id,park_id),
	 CONSTRAINT uq_hr_perf_appeal_no UNIQUE(tenant_id,park_id,cycle_employee_id,appeal_no),
	 CONSTRAINT fk_hr_perf_appeal_employee FOREIGN KEY(cycle_employee_id,tenant_id,park_id) REFERENCES hr_performance_cycle_employee(id,tenant_id,park_id),
	 CONSTRAINT fk_hr_perf_appeal_submitter FOREIGN KEY(tenant_id,park_id,submitted_by) REFERENCES sys_user(tenant_id,park_id,id),
	 CONSTRAINT fk_hr_perf_appeal_resolver FOREIGN KEY(tenant_id,park_id,resolved_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT ck_hr_perf_appeal_status CHECK(status IN('submitted','upheld','rejected')),
 CONSTRAINT ck_hr_perf_appeal_reason CHECK(length(btrim(reason))>=2),
 CONSTRAINT ck_hr_perf_appeal_resolution CHECK((status='submitted' AND resolved_by IS NULL AND resolved_at IS NULL AND decision IS NULL AND decision_reason IS NULL) OR (status IN('upheld','rejected') AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND decision=status AND length(btrim(decision_reason))>=2))
);
CREATE INDEX idx_hr_perf_appeal_employee ON hr_performance_appeal(cycle_employee_id,tenant_id,park_id);
CREATE INDEX idx_hr_perf_appeal_submitter ON hr_performance_appeal(tenant_id,park_id,submitted_by);
CREATE INDEX idx_hr_perf_appeal_resolver ON hr_performance_appeal(tenant_id,park_id,resolved_by);

CREATE TABLE hr_performance_review_action (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 cycle_employee_id uuid NOT NULL, action_no integer NOT NULL, action_type varchar(32) NOT NULL,
 from_status varchar(24), to_status varchar(24) NOT NULL, actor_user_id uuid, actor_employee_id uuid,
 reference_type varchar(24), reference_id uuid, reason varchar(2000), result_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_perf_review_action_scope UNIQUE(id,tenant_id,park_id),
	 CONSTRAINT uq_hr_perf_review_action_no UNIQUE(tenant_id,park_id,cycle_employee_id,action_no),
	 CONSTRAINT fk_hr_perf_review_action_employee FOREIGN KEY(cycle_employee_id,tenant_id,park_id) REFERENCES hr_performance_cycle_employee(id,tenant_id,park_id),
	 CONSTRAINT fk_hr_perf_review_action_actor_user FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
	 CONSTRAINT fk_hr_perf_review_action_actor_employee FOREIGN KEY(tenant_id,park_id,actor_employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT ck_hr_perf_review_action_type CHECK(action_type IN('baseline','self_submitted','manager_submitted','calibration_adjusted','result_finalized','acknowledged','appealed','appeal_upheld','appeal_rejected','confirmed')),
 CONSTRAINT ck_hr_perf_review_action_status CHECK(to_status IN('planning','self_review','manager_review','calibration','employee_acknowledged','appealed','confirmed')),
 CONSTRAINT ck_hr_perf_review_action_snapshot CHECK(jsonb_typeof(result_snapshot)='object')
);
CREATE INDEX idx_hr_perf_review_action_employee ON hr_performance_review_action(cycle_employee_id,tenant_id,park_id);
CREATE INDEX idx_hr_perf_review_action_actor_user ON hr_performance_review_action(tenant_id,park_id,actor_user_id);
CREATE INDEX idx_hr_perf_review_action_actor_employee ON hr_performance_review_action(tenant_id,park_id,actor_employee_id);

CREATE FUNCTION hr_performance_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'performance review evidence is append-only'; END $$;
CREATE TRIGGER trg_hr_perf_submission_append_only BEFORE UPDATE OR DELETE ON hr_performance_review_submission FOR EACH ROW EXECUTE FUNCTION hr_performance_append_only_guard();
CREATE TRIGGER trg_hr_perf_calibration_participant_append_only BEFORE UPDATE OR DELETE ON hr_performance_calibration_participant FOR EACH ROW EXECUTE FUNCTION hr_performance_append_only_guard();
CREATE TRIGGER trg_hr_perf_calibration_entry_append_only BEFORE UPDATE OR DELETE ON hr_performance_calibration_entry FOR EACH ROW EXECUTE FUNCTION hr_performance_append_only_guard();
CREATE TRIGGER trg_hr_perf_review_action_append_only BEFORE UPDATE OR DELETE ON hr_performance_review_action FOR EACH ROW EXECUTE FUNCTION hr_performance_append_only_guard();

CREATE FUNCTION hr_performance_submission_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ce record; cycle_snapshot jsonb; expected numeric;
BEGIN
 SELECT x.*,c.template_snapshot INTO ce FROM hr_performance_cycle_employee x JOIN hr_performance_review_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) WHERE x.id=NEW.cycle_employee_id AND x.tenant_id=NEW.tenant_id AND x.park_id=NEW.park_id FOR UPDATE OF x,c;
 IF ce.id IS NULL OR (NEW.submission_type='self' AND ce.status<>'self_review') OR (NEW.submission_type='manager' AND ce.status<>'manager_review') THEN RAISE EXCEPTION 'performance submission is outside its stage'; END IF;
 expected:=hr_performance_snapshot_score(ce.template_snapshot,NEW.dimension_scores);
 IF NEW.computed_score<>expected THEN RAISE EXCEPTION 'performance submission score is not reproducible'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_submission_insert BEFORE INSERT ON hr_performance_review_submission FOR EACH ROW EXECUTE FUNCTION hr_performance_submission_insert_guard();

CREATE FUNCTION hr_performance_participant_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_status varchar(16);BEGIN SELECT status INTO batch_status FROM hr_performance_calibration_batch WHERE id=NEW.batch_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id FOR UPDATE;IF batch_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'calibration participants are frozen after activation';END IF;RETURN NEW;END $$;
CREATE TRIGGER trg_hr_perf_participant_insert BEFORE INSERT ON hr_performance_calibration_participant FOR EACH ROW EXECUTE FUNCTION hr_performance_participant_insert_guard();

CREATE FUNCTION hr_performance_calibration_entry_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_row record;ce record;expected_before numeric;expected_after numeric;
BEGIN
 SELECT * INTO batch_row FROM hr_performance_calibration_batch WHERE id=NEW.batch_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id FOR UPDATE;
 SELECT x.*,c.template_snapshot INTO ce FROM hr_performance_cycle_employee x JOIN hr_performance_review_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) WHERE x.id=NEW.cycle_employee_id AND x.tenant_id=NEW.tenant_id AND x.park_id=NEW.park_id FOR UPDATE OF x,c;
 IF batch_row.id IS NULL OR batch_row.status<>'active' OR ce.id IS NULL OR ce.cycle_id<>batch_row.cycle_id OR ce.status<>'calibration' THEN RAISE EXCEPTION 'calibration entry is outside its active batch';END IF;
 SELECT COALESCE((SELECT after_score FROM hr_performance_calibration_entry WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND batch_id=NEW.batch_id AND cycle_employee_id=NEW.cycle_employee_id ORDER BY entry_no DESC LIMIT 1),ce.manager_score) INTO expected_before;
 expected_after:=hr_performance_snapshot_score(ce.template_snapshot,NEW.dimension_scores);
 IF expected_before IS NULL OR NEW.before_score<>expected_before OR NEW.after_score<>expected_after THEN RAISE EXCEPTION 'calibration adjustment is not reproducible';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_calibration_entry_insert BEFORE INSERT ON hr_performance_calibration_entry FOR EACH ROW EXECUTE FUNCTION hr_performance_calibration_entry_insert_guard();

CREATE FUNCTION hr_performance_calibration_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'performance calibration batch is immutable'; END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.cycle_id,NEW.batch_name,NEW.meeting_at,NEW.created_by,NEW.create_time) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.cycle_id,OLD.batch_name,OLD.meeting_at,OLD.created_by,OLD.create_time) THEN RAISE EXCEPTION 'performance calibration batch identity is immutable'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='draft' AND NEW.status='active') OR (OLD.status='active' AND NEW.status='completed')) THEN RAISE EXCEPTION 'invalid performance calibration transition'; END IF;
 IF OLD.status='completed' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'completed performance calibration batch is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_calibration_batch_immutable BEFORE UPDATE OR DELETE ON hr_performance_calibration_batch FOR EACH ROW EXECUTE FUNCTION hr_performance_calibration_batch_guard();

CREATE FUNCTION hr_performance_appeal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'performance appeal is immutable'; END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.cycle_employee_id,NEW.appeal_no,NEW.reason,NEW.submitted_by,NEW.submitted_at) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.cycle_employee_id,OLD.appeal_no,OLD.reason,OLD.submitted_by,OLD.submitted_at) THEN RAISE EXCEPTION 'performance appeal identity is immutable'; END IF;
 IF OLD.status<>'submitted' OR NEW.status NOT IN('upheld','rejected') THEN RAISE EXCEPTION 'invalid performance appeal transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_appeal_immutable BEFORE UPDATE OR DELETE ON hr_performance_appeal FOR EACH ROW EXECUTE FUNCTION hr_performance_appeal_guard();

CREATE FUNCTION hr_performance_cycle_employee_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE template jsonb; scores jsonb; expected numeric; expected_level record;
BEGIN
 IF OLD.status='confirmed' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'confirmed performance result is immutable'; END IF;
 IF NEW.status IN('self_review','manager_review','calibration') AND (NEW.final_score IS NOT NULL OR NEW.final_level_code IS NOT NULL OR NEW.result_finalized_at IS NOT NULL) THEN RAISE EXCEPTION 'performance result cannot be finalized before calibration'; END IF;
 IF NEW.status IN('employee_acknowledged','appealed','confirmed') AND NEW.final_score IS NULL THEN RAISE EXCEPTION 'performance result is required after calibration'; END IF;
 IF NEW.final_score IS NOT NULL AND (OLD.final_score IS NULL OR NEW.final_score IS DISTINCT FROM OLD.final_score OR NEW.final_level_code IS DISTINCT FROM OLD.final_level_code) THEN
  SELECT template_snapshot INTO template FROM hr_performance_review_cycle WHERE id=NEW.cycle_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id FOR SHARE;
  IF OLD.status='appealed' AND NEW.status='confirmed' THEN
   SELECT CASE WHEN action_type='appeal_upheld' THEN result_snapshot->'dimensionScores' ELSE NULL END INTO scores FROM hr_performance_review_action WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND cycle_employee_id=NEW.id AND action_type IN('appeal_upheld','appeal_rejected') ORDER BY action_no DESC LIMIT 1;
   IF scores IS NULL THEN expected:=OLD.final_score;ELSE expected:=hr_performance_snapshot_score(template,scores);END IF;
  ELSE
   SELECT dimension_scores INTO scores FROM hr_performance_calibration_entry WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND cycle_employee_id=NEW.id ORDER BY create_time DESC,id DESC LIMIT 1;
   IF scores IS NULL THEN SELECT dimension_scores INTO scores FROM hr_performance_review_submission WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND cycle_employee_id=NEW.id AND submission_type='manager' ORDER BY submission_no DESC LIMIT 1;END IF;
   IF scores IS NULL THEN RAISE EXCEPTION 'performance final result has no frozen score evidence';END IF;
   expected:=hr_performance_snapshot_score(template,scores);
  END IF;
  SELECT value->>'code' code,value->>'name' name INTO expected_level FROM jsonb_array_elements(template->'levels') WHERE expected>=(value->>'scoreMin')::numeric AND expected<=(value->>'scoreMax')::numeric ORDER BY (value->>'scoreMin')::numeric DESC LIMIT 1;
  IF NEW.final_score<>expected OR expected_level.code IS NULL OR NEW.final_level_code<>expected_level.code OR NEW.final_level_name<>expected_level.name THEN RAISE EXCEPTION 'performance final result is not reproducible';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_employee_result_guard BEFORE UPDATE ON hr_performance_cycle_employee FOR EACH ROW EXECUTE FUNCTION hr_performance_cycle_employee_result_guard();

INSERT INTO hr_performance_review_action(tenant_id,park_id,cycle_employee_id,action_no,action_type,from_status,to_status,result_snapshot)
SELECT ce.tenant_id,ce.park_id,ce.id,1,'baseline',NULL,ce.status,
 jsonb_build_object('compatibility','phase2a','status',ce.status)
FROM hr_performance_cycle_employee ce
WHERE NOT EXISTS(SELECT 1 FROM hr_performance_review_action a WHERE a.tenant_id=ce.tenant_id AND a.park_id=ce.park_id AND a.cycle_employee_id=ce.id);

COMMIT;
