BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_scope_id ON sys_user(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employee_scope_id ON hr_employee(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_feedback_cycle_scope_id ON hr_feedback_cycle(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_feedback_assignment_scope_id ON hr_feedback_assignment(tenant_id,park_id,id);

CREATE TABLE hr_competency_model (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 model_code varchar(64) NOT NULL, model_name varchar(120) NOT NULL, status varchar(16) NOT NULL DEFAULT 'draft', current_version_no integer NOT NULL DEFAULT 1,
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false,
 CONSTRAINT uq_hr_competency_model_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT fk_hr_competency_model_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_competency_model_updater FOREIGN KEY(tenant_id,park_id,update_by) REFERENCES sys_user(tenant_id,park_id,id), CONSTRAINT ck_hr_competency_model_status CHECK(status IN('draft','published','retired'))
);
CREATE UNIQUE INDEX uq_hr_competency_model_code ON hr_competency_model(tenant_id,park_id,model_code) WHERE is_deleted=false;
CREATE INDEX idx_hr_competency_model_creator ON hr_competency_model(tenant_id,park_id,create_by);
CREATE INDEX idx_hr_competency_model_updater ON hr_competency_model(tenant_id,park_id,update_by);

CREATE TABLE hr_competency_model_version (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, model_id uuid NOT NULL,
 version_no integer NOT NULL, version_name varchar(120) NOT NULL, status varchar(16) NOT NULL DEFAULT 'draft', scale_min numeric(7,2) NOT NULL DEFAULT 1, scale_max numeric(7,2) NOT NULL DEFAULT 5,
 published_at timestamptz, create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_competency_version_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_competency_version_no UNIQUE(tenant_id,park_id,model_id,version_no),
 CONSTRAINT fk_hr_competency_version_model FOREIGN KEY(model_id,tenant_id,park_id) REFERENCES hr_competency_model(id,tenant_id,park_id),
 CONSTRAINT fk_hr_competency_version_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT ck_hr_competency_version_status CHECK(status IN('draft','published','retired')), CONSTRAINT ck_hr_competency_version_scale CHECK(scale_min>=0 AND scale_max>scale_min)
);
CREATE INDEX idx_hr_competency_version_model ON hr_competency_model_version(model_id,tenant_id,park_id);
CREATE INDEX idx_hr_competency_version_creator ON hr_competency_model_version(tenant_id,park_id,create_by);

CREATE TABLE hr_competency_dimension (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, model_version_id uuid NOT NULL,
 dimension_code varchar(64) NOT NULL, dimension_name varchar(120) NOT NULL, description varchar(1000), weight numeric(7,4) NOT NULL, sort_order integer NOT NULL,
 CONSTRAINT uq_hr_competency_dimension_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_competency_dimension_code UNIQUE(tenant_id,park_id,model_version_id,dimension_code),
 CONSTRAINT fk_hr_competency_dimension_version FOREIGN KEY(model_version_id,tenant_id,park_id) REFERENCES hr_competency_model_version(id,tenant_id,park_id),
 CONSTRAINT ck_hr_competency_dimension_weight CHECK(weight>0 AND weight<=1)
);
CREATE INDEX idx_hr_competency_dimension_version ON hr_competency_dimension(model_version_id,tenant_id,park_id);

CREATE TABLE hr_competency_behavior_anchor (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, dimension_id uuid NOT NULL,
 level_value numeric(7,2) NOT NULL, anchor_text varchar(1000) NOT NULL, sort_order integer NOT NULL,
 CONSTRAINT uq_hr_competency_anchor_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_competency_anchor_level UNIQUE(tenant_id,park_id,dimension_id,level_value),
 CONSTRAINT fk_hr_competency_anchor_dimension FOREIGN KEY(dimension_id,tenant_id,park_id) REFERENCES hr_competency_dimension(id,tenant_id,park_id), CONSTRAINT ck_hr_competency_anchor_text CHECK(length(btrim(anchor_text))>=2)
);
CREATE INDEX idx_hr_competency_anchor_dimension ON hr_competency_behavior_anchor(dimension_id,tenant_id,park_id);

CREATE TABLE hr_feedback_questionnaire (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, questionnaire_code varchar(64) NOT NULL, questionnaire_name varchar(120) NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'draft', current_version_no integer NOT NULL DEFAULT 1, create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false,
 CONSTRAINT uq_hr_feedback_questionnaire_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback_questionnaire_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_feedback_questionnaire_updater FOREIGN KEY(tenant_id,park_id,update_by) REFERENCES sys_user(tenant_id,park_id,id), CONSTRAINT ck_hr_feedback_questionnaire_status CHECK(status IN('draft','published','retired'))
);
CREATE UNIQUE INDEX uq_hr_feedback_questionnaire_code ON hr_feedback_questionnaire(tenant_id,park_id,questionnaire_code) WHERE is_deleted=false;
CREATE INDEX idx_hr_feedback_questionnaire_creator ON hr_feedback_questionnaire(tenant_id,park_id,create_by);
CREATE INDEX idx_hr_feedback_questionnaire_updater ON hr_feedback_questionnaire(tenant_id,park_id,update_by);

CREATE TABLE hr_feedback_questionnaire_version (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, questionnaire_id uuid NOT NULL, model_version_id uuid NOT NULL,
 version_no integer NOT NULL, version_name varchar(120) NOT NULL, status varchar(16) NOT NULL DEFAULT 'draft', published_at timestamptz, create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_feedback_questionnaire_version_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_feedback_questionnaire_version_no UNIQUE(tenant_id,park_id,questionnaire_id,version_no),
 CONSTRAINT fk_hr_feedback_questionnaire_version_root FOREIGN KEY(questionnaire_id,tenant_id,park_id) REFERENCES hr_feedback_questionnaire(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback_questionnaire_version_model FOREIGN KEY(model_version_id,tenant_id,park_id) REFERENCES hr_competency_model_version(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback_questionnaire_version_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id), CONSTRAINT ck_hr_feedback_questionnaire_version_status CHECK(status IN('draft','published','retired'))
);
CREATE INDEX idx_hr_feedback_questionnaire_version_root ON hr_feedback_questionnaire_version(questionnaire_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback_questionnaire_version_model ON hr_feedback_questionnaire_version(model_version_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback_questionnaire_version_creator ON hr_feedback_questionnaire_version(tenant_id,park_id,create_by);

CREATE TABLE hr_feedback_question (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, questionnaire_version_id uuid NOT NULL, dimension_id uuid NOT NULL,
 question_code varchar(64) NOT NULL, question_text varchar(1000) NOT NULL, question_type varchar(16) NOT NULL DEFAULT 'rating', required boolean NOT NULL DEFAULT true, sort_order integer NOT NULL,
 CONSTRAINT uq_hr_feedback_question_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_feedback_question_code UNIQUE(tenant_id,park_id,questionnaire_version_id,question_code),
 CONSTRAINT fk_hr_feedback_question_version FOREIGN KEY(questionnaire_version_id,tenant_id,park_id) REFERENCES hr_feedback_questionnaire_version(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback_question_dimension FOREIGN KEY(dimension_id,tenant_id,park_id) REFERENCES hr_competency_dimension(id,tenant_id,park_id), CONSTRAINT ck_hr_feedback_question_type CHECK(question_type IN('rating','text'))
);
CREATE INDEX idx_hr_feedback_question_version ON hr_feedback_question(questionnaire_version_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback_question_dimension ON hr_feedback_question(dimension_id,tenant_id,park_id);

CREATE TABLE hr_feedback360_cycle (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, cycle_code varchar(64) NOT NULL, cycle_name varchar(120) NOT NULL,
 model_version_id uuid NOT NULL, questionnaire_version_id uuid NOT NULL, model_snapshot jsonb NOT NULL, questionnaire_snapshot jsonb NOT NULL,
 minimum_anonymous_responses integer NOT NULL DEFAULT 3, self_result_policy varchar(16) NOT NULL DEFAULT 'separate', manager_result_policy varchar(16) NOT NULL DEFAULT 'separate',
 nomination_end date NOT NULL, response_end date NOT NULL, status varchar(20) NOT NULL DEFAULT 'draft', published_at timestamptz, closed_at timestamptz, create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid NOT NULL, update_time timestamptz NOT NULL DEFAULT now(),
 legacy_feedback_cycle_id uuid, legacy_source varchar(24),
 CONSTRAINT uq_hr_feedback360_cycle_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_feedback360_cycle_code UNIQUE(tenant_id,park_id,cycle_code),
 CONSTRAINT fk_hr_feedback360_cycle_model FOREIGN KEY(model_version_id,tenant_id,park_id) REFERENCES hr_competency_model_version(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback360_cycle_questionnaire FOREIGN KEY(questionnaire_version_id,tenant_id,park_id) REFERENCES hr_feedback_questionnaire_version(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback360_cycle_legacy FOREIGN KEY(tenant_id,park_id,legacy_feedback_cycle_id) REFERENCES hr_feedback_cycle(tenant_id,park_id,id),
 CONSTRAINT fk_hr_feedback360_cycle_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_feedback360_cycle_updater FOREIGN KEY(tenant_id,park_id,update_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT ck_hr_feedback360_cycle_threshold CHECK(minimum_anonymous_responses>=3), CONSTRAINT ck_hr_feedback360_cycle_policy CHECK(self_result_policy IN('separate','excluded') AND manager_result_policy IN('separate','anonymous')),
 CONSTRAINT ck_hr_feedback360_cycle_dates CHECK(response_end>=nomination_end), CONSTRAINT ck_hr_feedback360_cycle_status CHECK(status IN('draft','nominating','responding','closed','published')),
 CONSTRAINT ck_hr_feedback360_cycle_snapshot CHECK(jsonb_typeof(model_snapshot)='object' AND jsonb_typeof(questionnaire_snapshot)='object')
);
CREATE INDEX idx_hr_feedback360_cycle_model ON hr_feedback360_cycle(model_version_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback360_cycle_questionnaire ON hr_feedback360_cycle(questionnaire_version_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback360_cycle_legacy ON hr_feedback360_cycle(tenant_id,park_id,legacy_feedback_cycle_id);
CREATE INDEX idx_hr_feedback360_cycle_creator ON hr_feedback360_cycle(tenant_id,park_id,create_by);
CREATE INDEX idx_hr_feedback360_cycle_updater ON hr_feedback360_cycle(tenant_id,park_id,update_by);

CREATE TABLE hr_feedback360_subject (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, cycle_id uuid NOT NULL, employee_id uuid NOT NULL,
 employee_snapshot jsonb NOT NULL, manager_employee_id uuid, status varchar(20) NOT NULL DEFAULT 'nominating', published_at timestamptz, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_feedback360_subject_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_feedback360_subject_employee UNIQUE(tenant_id,park_id,cycle_id,employee_id),
 CONSTRAINT fk_hr_feedback360_subject_cycle FOREIGN KEY(cycle_id,tenant_id,park_id) REFERENCES hr_feedback360_cycle(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback360_subject_employee FOREIGN KEY(employee_id,tenant_id,park_id) REFERENCES hr_employee(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback360_subject_manager FOREIGN KEY(manager_employee_id,tenant_id,park_id) REFERENCES hr_employee(id,tenant_id,park_id),
 CONSTRAINT ck_hr_feedback360_subject_status CHECK(status IN('nominating','responding','closed','published')), CONSTRAINT ck_hr_feedback360_subject_snapshot CHECK(jsonb_typeof(employee_snapshot)='object')
);
CREATE INDEX idx_hr_feedback360_subject_cycle ON hr_feedback360_subject(cycle_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback360_subject_employee ON hr_feedback360_subject(employee_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback360_subject_manager ON hr_feedback360_subject(manager_employee_id,tenant_id,park_id);

CREATE TABLE hr_feedback360_nomination (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, subject_id uuid NOT NULL, nominee_employee_id uuid NOT NULL,
 relation_type varchar(20) NOT NULL, status varchar(16) NOT NULL DEFAULT 'pending', nominated_by uuid NOT NULL, nominated_at timestamptz NOT NULL DEFAULT now(), decided_by uuid, decided_at timestamptz, decision_reason varchar(1000),
 CONSTRAINT uq_hr_feedback360_nomination_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_feedback360_nomination_employee UNIQUE(tenant_id,park_id,subject_id,nominee_employee_id),
 CONSTRAINT fk_hr_feedback360_nomination_subject FOREIGN KEY(subject_id,tenant_id,park_id) REFERENCES hr_feedback360_subject(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback360_nomination_employee FOREIGN KEY(nominee_employee_id,tenant_id,park_id) REFERENCES hr_employee(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback360_nomination_nominator FOREIGN KEY(tenant_id,park_id,nominated_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_feedback360_nomination_decider FOREIGN KEY(tenant_id,park_id,decided_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT ck_hr_feedback360_nomination_relation CHECK(relation_type IN('self','manager','peer','subordinate','collaborator')),
 CONSTRAINT ck_hr_feedback360_nomination_status CHECK(status IN('pending','approved','rejected')), CONSTRAINT ck_hr_feedback360_nomination_decision CHECK((status='pending' AND decided_by IS NULL AND decided_at IS NULL) OR (status IN('approved','rejected') AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX idx_hr_feedback360_nomination_subject ON hr_feedback360_nomination(subject_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback360_nomination_employee ON hr_feedback360_nomination(nominee_employee_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback360_nomination_nominator ON hr_feedback360_nomination(tenant_id,park_id,nominated_by);
CREATE INDEX idx_hr_feedback360_nomination_decider ON hr_feedback360_nomination(tenant_id,park_id,decided_by);

CREATE TABLE hr_feedback360_assignment (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, subject_id uuid NOT NULL, nomination_id uuid NOT NULL, reviewer_employee_id uuid NOT NULL,
 relation_type varchar(20) NOT NULL, questionnaire_snapshot jsonb NOT NULL, status varchar(16) NOT NULL DEFAULT 'pending', submitted_at timestamptz, create_time timestamptz NOT NULL DEFAULT now(),
 legacy_assignment_id uuid, legacy_source varchar(24),
 CONSTRAINT uq_hr_feedback360_assignment_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_feedback360_assignment_reviewer UNIQUE(tenant_id,park_id,subject_id,reviewer_employee_id), CONSTRAINT uq_hr_feedback360_assignment_nomination UNIQUE(tenant_id,park_id,nomination_id),
 CONSTRAINT fk_hr_feedback360_assignment_subject FOREIGN KEY(subject_id,tenant_id,park_id) REFERENCES hr_feedback360_subject(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback360_assignment_nomination FOREIGN KEY(nomination_id,tenant_id,park_id) REFERENCES hr_feedback360_nomination(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback360_assignment_reviewer FOREIGN KEY(reviewer_employee_id,tenant_id,park_id) REFERENCES hr_employee(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback360_assignment_legacy FOREIGN KEY(tenant_id,park_id,legacy_assignment_id) REFERENCES hr_feedback_assignment(tenant_id,park_id,id),
 CONSTRAINT ck_hr_feedback360_assignment_relation CHECK(relation_type IN('self','manager','peer','subordinate','collaborator')), CONSTRAINT ck_hr_feedback360_assignment_status CHECK(status IN('pending','submitted','expired')), CONSTRAINT ck_hr_feedback360_assignment_snapshot CHECK(jsonb_typeof(questionnaire_snapshot)='object')
);
CREATE INDEX idx_hr_feedback360_assignment_subject ON hr_feedback360_assignment(subject_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback360_assignment_reviewer ON hr_feedback360_assignment(reviewer_employee_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback360_assignment_nomination ON hr_feedback360_assignment(nomination_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback360_assignment_legacy ON hr_feedback360_assignment(tenant_id,park_id,legacy_assignment_id);

CREATE TABLE hr_feedback360_response (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, assignment_id uuid NOT NULL,
 answers jsonb NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(), response_hash varchar(64) NOT NULL,
 CONSTRAINT uq_hr_feedback360_response_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_feedback360_response_assignment UNIQUE(tenant_id,park_id,assignment_id),
 CONSTRAINT fk_hr_feedback360_response_assignment FOREIGN KEY(assignment_id,tenant_id,park_id) REFERENCES hr_feedback360_assignment(id,tenant_id,park_id), CONSTRAINT ck_hr_feedback360_response_answers CHECK(jsonb_typeof(answers)='object')
);
CREATE INDEX idx_hr_feedback360_response_assignment ON hr_feedback360_response(assignment_id,tenant_id,park_id);

CREATE TABLE hr_feedback360_dimension_result (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, subject_id uuid NOT NULL, dimension_code varchar(64) NOT NULL,
 relation_group varchar(20) NOT NULL, response_count integer NOT NULL, minimum_required integer NOT NULL, average_score numeric(7,2) NOT NULL, published_at timestamptz NOT NULL,
 CONSTRAINT uq_hr_feedback360_result_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_feedback360_result_dimension UNIQUE(tenant_id,park_id,subject_id,dimension_code,relation_group),
 CONSTRAINT fk_hr_feedback360_result_subject FOREIGN KEY(subject_id,tenant_id,park_id) REFERENCES hr_feedback360_subject(id,tenant_id,park_id),
 CONSTRAINT ck_hr_feedback360_result_relation CHECK(relation_group IN('self','manager','others')),
 CONSTRAINT ck_hr_feedback360_result_threshold CHECK((relation_group IN('self','manager') AND response_count>=1 AND minimum_required=1) OR (relation_group NOT IN('self','manager') AND minimum_required>=3 AND response_count>=minimum_required)), CONSTRAINT ck_hr_feedback360_result_score CHECK(average_score BETWEEN 0 AND 100)
);
CREATE INDEX idx_hr_feedback360_result_subject ON hr_feedback360_dimension_result(subject_id,tenant_id,park_id);

CREATE TABLE hr_feedback360_action (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, subject_id uuid NOT NULL, action_no integer NOT NULL, action_type varchar(32) NOT NULL,
 actor_user_id uuid NOT NULL, reference_type varchar(24), reference_id uuid, detail jsonb NOT NULL DEFAULT '{}'::jsonb, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_feedback360_action_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_feedback360_action_no UNIQUE(tenant_id,park_id,subject_id,action_no),
 CONSTRAINT fk_hr_feedback360_action_subject FOREIGN KEY(subject_id,tenant_id,park_id) REFERENCES hr_feedback360_subject(id,tenant_id,park_id),
 CONSTRAINT fk_hr_feedback360_action_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT ck_hr_feedback360_action_type CHECK(action_type IN('subject_added','nominated','nomination_approved','nomination_rejected','assigned','submitted','closed','result_published')), CONSTRAINT ck_hr_feedback360_action_detail CHECK(jsonb_typeof(detail)='object')
);
CREATE INDEX idx_hr_feedback360_action_subject ON hr_feedback360_action(subject_id,tenant_id,park_id);
CREATE INDEX idx_hr_feedback360_action_actor ON hr_feedback360_action(tenant_id,park_id,actor_user_id);

CREATE FUNCTION hr_feedback360_version_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s varchar(16); r record; BEGIN r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 IF TG_TABLE_NAME='hr_competency_dimension' THEN SELECT status INTO s FROM hr_competency_model_version WHERE id=r.model_version_id AND tenant_id=r.tenant_id AND park_id=r.park_id FOR SHARE;
 ELSIF TG_TABLE_NAME='hr_competency_behavior_anchor' THEN SELECT v.status INTO s FROM hr_competency_dimension d JOIN hr_competency_model_version v ON(v.id,v.tenant_id,v.park_id)=(d.model_version_id,d.tenant_id,d.park_id) WHERE d.id=r.dimension_id AND d.tenant_id=r.tenant_id AND d.park_id=r.park_id FOR SHARE OF v;
 ELSE SELECT status INTO s FROM hr_feedback_questionnaire_version WHERE id=r.questionnaire_version_id AND tenant_id=r.tenant_id AND park_id=r.park_id FOR SHARE; END IF;
 IF s IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'published competency or questionnaire version is immutable'; END IF; RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END $$;
CREATE TRIGGER trg_hr_competency_dimension_frozen BEFORE INSERT OR UPDATE OR DELETE ON hr_competency_dimension FOR EACH ROW EXECUTE FUNCTION hr_feedback360_version_child_guard();
CREATE TRIGGER trg_hr_competency_anchor_frozen BEFORE INSERT OR UPDATE OR DELETE ON hr_competency_behavior_anchor FOR EACH ROW EXECUTE FUNCTION hr_feedback360_version_child_guard();
CREATE TRIGGER trg_hr_feedback_question_frozen BEFORE INSERT OR UPDATE OR DELETE ON hr_feedback_question FOR EACH ROW EXECUTE FUNCTION hr_feedback360_version_child_guard();

CREATE FUNCTION hr_feedback360_model_root_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.status<>'draft' THEN RAISE EXCEPTION 'published competency or questionnaire root is immutable'; END IF;
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.park_id,NEW.model_code,NEW.model_name,NEW.create_by,NEW.create_time,NEW.is_deleted) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.model_code,OLD.model_name,OLD.create_by,OLD.create_time,OLD.is_deleted) THEN RAISE EXCEPTION 'competency model identity is immutable'; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'draft' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'published competency model is immutable'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_hr_competency_model_frozen BEFORE UPDATE OR DELETE ON hr_competency_model FOR EACH ROW EXECUTE FUNCTION hr_feedback360_model_root_guard();

CREATE FUNCTION hr_feedback360_questionnaire_root_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.status<>'draft' THEN RAISE EXCEPTION 'published competency or questionnaire root is immutable'; END IF;
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.park_id,NEW.questionnaire_code,NEW.questionnaire_name,NEW.create_by,NEW.create_time,NEW.is_deleted) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.questionnaire_code,OLD.questionnaire_name,OLD.create_by,OLD.create_time,OLD.is_deleted) THEN RAISE EXCEPTION 'questionnaire identity is immutable'; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'draft' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'published questionnaire is immutable'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_hr_feedback_questionnaire_frozen BEFORE UPDATE OR DELETE ON hr_feedback_questionnaire FOR EACH ROW EXECUTE FUNCTION hr_feedback360_questionnaire_root_guard();

CREATE FUNCTION hr_feedback360_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.status<>'draft' THEN RAISE EXCEPTION 'published competency or questionnaire version is immutable'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['status','published_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','published_at']) THEN RAISE EXCEPTION 'competency or questionnaire version identity is immutable'; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'draft' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'published competency or questionnaire version is immutable'; END IF;
 IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status='draft' AND NEW.status='published') THEN RAISE EXCEPTION 'invalid competency or questionnaire version transition'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_hr_competency_model_version_frozen BEFORE UPDATE OR DELETE ON hr_competency_model_version FOR EACH ROW EXECUTE FUNCTION hr_feedback360_version_guard();
CREATE TRIGGER trg_hr_feedback_questionnaire_version_frozen BEFORE UPDATE OR DELETE ON hr_feedback_questionnaire_version FOR EACH ROW EXECUTE FUNCTION hr_feedback360_version_guard();

CREATE FUNCTION hr_feedback360_cycle_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.status<>'draft' THEN RAISE EXCEPTION 'active 360 cycle is immutable'; END IF;
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.park_id,NEW.cycle_code,NEW.cycle_name,NEW.model_version_id,NEW.questionnaire_version_id,NEW.model_snapshot,NEW.questionnaire_snapshot,NEW.minimum_anonymous_responses,NEW.self_result_policy,NEW.manager_result_policy,NEW.nomination_end,NEW.response_end,NEW.create_by,NEW.create_time,NEW.legacy_feedback_cycle_id,NEW.legacy_source) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.cycle_code,OLD.cycle_name,OLD.model_version_id,OLD.questionnaire_version_id,OLD.model_snapshot,OLD.questionnaire_snapshot,OLD.minimum_anonymous_responses,OLD.self_result_policy,OLD.manager_result_policy,OLD.nomination_end,OLD.response_end,OLD.create_by,OLD.create_time,OLD.legacy_feedback_cycle_id,OLD.legacy_source) THEN RAISE EXCEPTION '360 cycle snapshot is immutable'; END IF;
 IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='draft' AND NEW.status='nominating') OR (OLD.status='nominating' AND NEW.status='responding')) THEN RAISE EXCEPTION 'invalid 360 cycle transition'; END IF;
 IF TG_OP='UPDATE' AND NEW.status=OLD.status AND OLD.status<>'draft' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'active 360 cycle is immutable outside a state transition'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_hr_feedback360_cycle_frozen BEFORE UPDATE OR DELETE ON hr_feedback360_cycle FOR EACH ROW EXECUTE FUNCTION hr_feedback360_cycle_guard();

CREATE FUNCTION hr_feedback360_subject_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cycle_status varchar(20); BEGIN
 SELECT status INTO cycle_status FROM hr_feedback360_cycle WHERE (id,tenant_id,park_id)=(NEW.cycle_id,NEW.tenant_id,NEW.park_id) FOR SHARE;
 IF cycle_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION '360 subjects can only be frozen while the cycle is draft'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_feedback360_subject_insert BEFORE INSERT ON hr_feedback360_subject FOR EACH ROW EXECUTE FUNCTION hr_feedback360_subject_insert_guard();

CREATE FUNCTION hr_feedback360_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '360 feedback evidence is append-only'; END $$;
CREATE TRIGGER trg_hr_feedback360_response_append_only BEFORE UPDATE OR DELETE ON hr_feedback360_response FOR EACH ROW EXECUTE FUNCTION hr_feedback360_append_only_guard();
CREATE TRIGGER trg_hr_feedback360_result_append_only BEFORE UPDATE OR DELETE ON hr_feedback360_dimension_result FOR EACH ROW EXECUTE FUNCTION hr_feedback360_append_only_guard();
CREATE TRIGGER trg_hr_feedback360_action_append_only BEFORE UPDATE OR DELETE ON hr_feedback360_action FOR EACH ROW EXECUTE FUNCTION hr_feedback360_append_only_guard();

CREATE FUNCTION hr_feedback360_nomination_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject_employee uuid; subject_manager uuid; subject_org uuid; nominee_manager uuid; nominee_org uuid; subject_status varchar(20); BEGIN
 SELECT s.employee_id,s.manager_employee_id,e.primary_org_id,s.status INTO subject_employee,subject_manager,subject_org,subject_status
   FROM hr_feedback360_subject s JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(s.employee_id,s.tenant_id,s.park_id)
  WHERE (s.id,s.tenant_id,s.park_id)=(NEW.subject_id,NEW.tenant_id,NEW.park_id) FOR SHARE OF s,e;
 SELECT manager_employee_id,primary_org_id INTO nominee_manager,nominee_org FROM hr_employee
  WHERE (id,tenant_id,park_id)=(NEW.nominee_employee_id,NEW.tenant_id,NEW.park_id) AND is_deleted=false AND employment_status='active' FOR SHARE;
 IF subject_status NOT IN('nominating','responding') OR nominee_org IS NULL THEN RAISE EXCEPTION '360 nomination is outside an active scoped relationship'; END IF;
 IF NEW.relation_type='self' AND NEW.nominee_employee_id<>subject_employee THEN RAISE EXCEPTION 'invalid 360 self relation'; END IF;
 IF NEW.relation_type<>'self' AND NEW.nominee_employee_id=subject_employee THEN RAISE EXCEPTION '360 subject cannot forge an external reviewer identity'; END IF;
 IF NEW.relation_type='manager' AND NEW.nominee_employee_id IS DISTINCT FROM subject_manager THEN RAISE EXCEPTION 'invalid 360 manager relation'; END IF;
 IF NEW.relation_type='subordinate' AND nominee_manager IS DISTINCT FROM subject_employee THEN RAISE EXCEPTION 'invalid 360 subordinate relation'; END IF;
 IF NEW.relation_type='peer' AND nominee_org IS DISTINCT FROM subject_org THEN RAISE EXCEPTION 'invalid 360 peer relation'; END IF;
 IF NEW.relation_type='collaborator' THEN RAISE EXCEPTION '360 collaborator relation requires an authoritative source'; END IF;
 IF TG_OP='UPDATE' THEN
   IF (NEW.tenant_id,NEW.park_id,NEW.subject_id,NEW.nominee_employee_id,NEW.relation_type,NEW.nominated_by,NEW.nominated_at) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.subject_id,OLD.nominee_employee_id,OLD.relation_type,OLD.nominated_by,OLD.nominated_at) THEN RAISE EXCEPTION '360 nomination identity is immutable'; END IF;
   IF OLD.status<>'pending' OR NEW.status NOT IN('approved','rejected') THEN RAISE EXCEPTION 'invalid 360 nomination transition'; END IF;
   IF NEW.decided_by=NEW.nominated_by THEN RAISE EXCEPTION '360 nomination and approval must be separated'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_feedback360_nomination_valid BEFORE INSERT OR UPDATE ON hr_feedback360_nomination FOR EACH ROW EXECUTE FUNCTION hr_feedback360_nomination_guard();
CREATE TRIGGER trg_hr_feedback360_nomination_no_delete BEFORE DELETE ON hr_feedback360_nomination FOR EACH ROW EXECUTE FUNCTION hr_feedback360_append_only_guard();

CREATE FUNCTION hr_feedback360_assignment_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n record; subject_status varchar(20); snapshot jsonb; BEGIN
 SELECT subject_id,nominee_employee_id,relation_type,status INTO n FROM hr_feedback360_nomination
  WHERE (id,tenant_id,park_id)=(NEW.nomination_id,NEW.tenant_id,NEW.park_id) FOR SHARE;
 SELECT s.status,c.questionnaire_snapshot INTO subject_status,snapshot FROM hr_feedback360_subject s
  JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(s.cycle_id,s.tenant_id,s.park_id)
  WHERE (s.id,s.tenant_id,s.park_id)=(NEW.subject_id,NEW.tenant_id,NEW.park_id) FOR SHARE OF s,c;
 IF n.status IS DISTINCT FROM 'approved' OR (NEW.subject_id,NEW.reviewer_employee_id,NEW.relation_type) IS DISTINCT FROM (n.subject_id,n.nominee_employee_id,n.relation_type) THEN RAISE EXCEPTION '360 assignment must exactly match an approved nomination'; END IF;
 IF subject_status NOT IN('nominating','responding') OR NEW.questionnaire_snapshot IS DISTINCT FROM snapshot THEN RAISE EXCEPTION '360 assignment snapshot or subject state is invalid'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_feedback360_assignment_insert BEFORE INSERT ON hr_feedback360_assignment FOR EACH ROW EXECUTE FUNCTION hr_feedback360_assignment_insert_guard();

CREATE FUNCTION hr_feedback360_response_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assignment_status varchar(16); relation varchar(20); reviewer uuid; subject_employee uuid; subject_status varchar(20); snapshot jsonb; question jsonb; answer jsonb; BEGIN
 SELECT a.status,a.relation_type,a.reviewer_employee_id,s.employee_id,s.status,a.questionnaire_snapshot
   INTO assignment_status,relation,reviewer,subject_employee,subject_status,snapshot FROM hr_feedback360_assignment a JOIN hr_feedback360_subject s ON(s.id,s.tenant_id,s.park_id)=(a.subject_id,a.tenant_id,a.park_id)
  WHERE (a.id,a.tenant_id,a.park_id)=(NEW.assignment_id,NEW.tenant_id,NEW.park_id) FOR UPDATE OF a FOR SHARE OF s;
 IF assignment_status IS DISTINCT FROM 'pending' OR subject_status IS DISTINCT FROM 'responding' OR ((relation='self') IS DISTINCT FROM (reviewer=subject_employee)) THEN RAISE EXCEPTION '360 response identity or subject state is invalid'; END IF;
  IF jsonb_typeof(NEW.answers)<>'object' THEN RAISE EXCEPTION '360 answers must be an object'; END IF;
 FOR question IN SELECT value FROM jsonb_array_elements(snapshot->'questions') LOOP
   answer:=NEW.answers->(question->>'code');
   IF COALESCE((question->>'required')::boolean,false) AND answer IS NULL THEN RAISE EXCEPTION 'required 360 answer is missing'; END IF;
   IF answer IS NOT NULL AND question->>'type'='rating' AND (NOT answer ? 'score' OR (SELECT count(*) FROM jsonb_object_keys(answer))<>1 OR (answer->>'score')::numeric NOT BETWEEN 0 AND 100) THEN RAISE EXCEPTION 'invalid 360 rating answer'; END IF;
   IF answer IS NOT NULL AND question->>'type'='text' AND (NOT answer ? 'text' OR (SELECT count(*) FROM jsonb_object_keys(answer))<>1) THEN RAISE EXCEPTION 'invalid 360 text answer'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.answers) keys(k) WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'questions') q WHERE q->>'code'=keys.k)) THEN RAISE EXCEPTION 'unknown 360 answer'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_feedback360_response_valid BEFORE INSERT ON hr_feedback360_response FOR EACH ROW EXECUTE FUNCTION hr_feedback360_response_insert_guard();
CREATE FUNCTION hr_feedback360_response_sync_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE hr_feedback360_assignment SET status='submitted',submitted_at=NEW.submitted_at
  WHERE (id,tenant_id,park_id)=(NEW.assignment_id,NEW.tenant_id,NEW.park_id) AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION '360 assignment is no longer open'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_feedback360_response_sync AFTER INSERT ON hr_feedback360_response FOR EACH ROW EXECUTE FUNCTION hr_feedback360_response_sync_assignment();

CREATE FUNCTION hr_feedback360_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF TG_OP='DELETE' THEN RAISE EXCEPTION '360 assignment is immutable'; END IF;
 IF OLD.status='submitted' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'submitted 360 assignment is immutable'; END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.subject_id,NEW.nomination_id,NEW.reviewer_employee_id,NEW.relation_type,NEW.questionnaire_snapshot,NEW.create_time) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.subject_id,OLD.nomination_id,OLD.reviewer_employee_id,OLD.relation_type,OLD.questionnaire_snapshot,OLD.create_time) THEN RAISE EXCEPTION '360 assignment identity is immutable'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status='pending' AND NEW.status IN('submitted','expired')) THEN RAISE EXCEPTION 'invalid 360 assignment transition'; END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_hr_feedback360_assignment_immutable BEFORE UPDATE OR DELETE ON hr_feedback360_assignment FOR EACH ROW EXECUTE FUNCTION hr_feedback360_assignment_guard();

CREATE FUNCTION hr_feedback360_subject_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE result_count integer; anonymous_count integer; required_threshold integer; expected_count integer; low_count integer; BEGIN IF TG_OP='DELETE' THEN RAISE EXCEPTION '360 subject is immutable'; END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.cycle_id,NEW.employee_id,NEW.employee_snapshot,NEW.manager_employee_id,NEW.create_time) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.cycle_id,OLD.employee_id,OLD.employee_snapshot,OLD.manager_employee_id,OLD.create_time) THEN RAISE EXCEPTION '360 subject snapshot is immutable'; END IF;
 IF OLD.status='published' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'published 360 subject is immutable'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='nominating' AND NEW.status='responding') OR (OLD.status='responding' AND NEW.status='closed') OR (OLD.status='closed' AND NEW.status='published')) THEN RAISE EXCEPTION 'invalid 360 subject transition'; END IF;
 IF NEW.status=OLD.status AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION '360 subject can only change through a valid state transition'; END IF;
 IF OLD.status='closed' AND NEW.status='published' THEN
   SELECT count(*) INTO result_count FROM hr_feedback360_dimension_result WHERE (subject_id,tenant_id,park_id)=(OLD.id,OLD.tenant_id,OLD.park_id);
   SELECT c.minimum_anonymous_responses,count(r.id) FILTER(WHERE a.relation_type NOT IN('self','manager') OR (a.relation_type='manager' AND c.manager_result_policy='anonymous'))
     INTO required_threshold,anonymous_count FROM hr_feedback360_cycle c
     LEFT JOIN hr_feedback360_assignment a ON(a.subject_id,a.tenant_id,a.park_id)=(OLD.id,OLD.tenant_id,OLD.park_id)
     LEFT JOIN hr_feedback360_response r ON(r.assignment_id,r.tenant_id,r.park_id)=(a.id,a.tenant_id,a.park_id)
    WHERE (c.id,c.tenant_id,c.park_id)=(OLD.cycle_id,OLD.tenant_id,OLD.park_id)
    GROUP BY c.minimum_anonymous_responses;
   WITH scored AS (
     SELECT q.item->>'dimensionCode' dimension_code,
            CASE WHEN a.relation_type='self' THEN 'self' WHEN a.relation_type='manager' AND c.manager_result_policy='separate' THEN 'manager' ELSE 'others' END relation_group,
            a.id assignment_id,c.minimum_anonymous_responses anon_threshold
       FROM hr_feedback360_response r
       JOIN hr_feedback360_assignment a ON(a.id,a.tenant_id,a.park_id)=(r.assignment_id,r.tenant_id,r.park_id)
       JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(OLD.cycle_id,OLD.tenant_id,OLD.park_id)
       CROSS JOIN LATERAL jsonb_array_elements(c.questionnaire_snapshot->'questions') q(item)
      WHERE a.subject_id=OLD.id AND a.tenant_id=OLD.tenant_id AND a.park_id=OLD.park_id
        AND q.item->>'type'='rating' AND r.answers->(q.item->>'code') ? 'score'
        AND NOT (a.relation_type='self' AND c.self_result_policy='excluded')
   ), grouped AS (
     SELECT dimension_code,relation_group,count(DISTINCT assignment_id)::int response_count,max(anon_threshold) anon_threshold
       FROM scored GROUP BY dimension_code,relation_group
   )
   SELECT count(*) FILTER(WHERE response_count>=CASE WHEN relation_group='others' THEN anon_threshold ELSE 1 END),
          count(*) FILTER(WHERE relation_group='others' AND response_count<anon_threshold)
     INTO expected_count,low_count FROM grouped;
   IF result_count=0 OR result_count<>expected_count OR low_count>0 OR (anonymous_count>0 AND anonymous_count<required_threshold) THEN RAISE EXCEPTION '360 result publication threshold has not been reached'; END IF;
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER trg_hr_feedback360_subject_immutable BEFORE UPDATE OR DELETE ON hr_feedback360_subject FOR EACH ROW EXECUTE FUNCTION hr_feedback360_subject_guard();

CREATE FUNCTION hr_feedback360_result_threshold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cfg integer; actual integer; expected numeric(7,2); manager_policy varchar(16); self_policy varchar(16); BEGIN
 SELECT c.minimum_anonymous_responses,c.manager_result_policy,c.self_result_policy INTO cfg,manager_policy,self_policy FROM hr_feedback360_subject s JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(s.cycle_id,s.tenant_id,s.park_id) WHERE s.id=NEW.subject_id AND s.tenant_id=NEW.tenant_id AND s.park_id=NEW.park_id AND s.status='closed' FOR SHARE OF s,c;
 IF cfg IS NULL THEN RAISE EXCEPTION '360 subject must be closed before result publication'; END IF;
 SELECT count(DISTINCT a.id)::int,round(avg((r.answers->(q.item->>'code')->>'score')::numeric),2)
   INTO actual,expected
   FROM hr_feedback360_response r
   JOIN hr_feedback360_assignment a ON(a.id,a.tenant_id,a.park_id)=(r.assignment_id,r.tenant_id,r.park_id)
   JOIN hr_feedback360_subject s ON(s.id,s.tenant_id,s.park_id)=(a.subject_id,a.tenant_id,a.park_id)
   JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(s.cycle_id,s.tenant_id,s.park_id)
   CROSS JOIN LATERAL jsonb_array_elements(c.questionnaire_snapshot->'questions') q(item)
  WHERE a.subject_id=NEW.subject_id AND a.tenant_id=NEW.tenant_id AND a.park_id=NEW.park_id
    AND q.item->>'type'='rating' AND q.item->>'dimensionCode'=NEW.dimension_code AND r.answers->(q.item->>'code') ? 'score'
    AND CASE NEW.relation_group WHEN 'self' THEN a.relation_type='self' AND self_policy='separate'
          WHEN 'manager' THEN a.relation_type='manager' AND manager_policy='separate'
          ELSE a.relation_type NOT IN('self','manager') OR (a.relation_type='manager' AND manager_policy='anonymous') END;
 IF NEW.relation_group='others' AND (NEW.minimum_required<>cfg OR NEW.response_count<>actual OR actual<cfg) THEN RAISE EXCEPTION '360 anonymous result threshold has not been reached'; END IF;
 IF NEW.relation_group IN('self','manager') AND (NEW.minimum_required<>1 OR NEW.response_count<>actual OR actual<1) THEN RAISE EXCEPTION '360 separate result requires a response'; END IF;
 IF NEW.average_score IS DISTINCT FROM expected THEN RAISE EXCEPTION '360 result average must be database-derived'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER trg_hr_feedback360_result_threshold BEFORE INSERT ON hr_feedback360_dimension_result FOR EACH ROW EXECUTE FUNCTION hr_feedback360_result_threshold_guard();

-- Old 000232 facts remain readable only through the legacy API. Exact row counts,
-- primary keys, scores and text are intentionally untouched by this migration.
COMMIT;
