BEGIN;

CREATE TABLE hr_talent_profile_snapshot(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(32) NOT NULL,park_id varchar(32) NOT NULL,
 employee_id uuid NOT NULL,snapshot_no integer NOT NULL,as_of_date date NOT NULL,
 employee_snapshot jsonb NOT NULL,performance_source jsonb NOT NULL DEFAULT '{}'::jsonb,
 feedback_source jsonb NOT NULL DEFAULT '{}'::jsonb,development_source jsonb NOT NULL DEFAULT '{}'::jsonb,
 source_digest varchar(64) NOT NULL,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_talent_profile_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT uq_hr_talent_profile_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT uq_hr_talent_profile_employee_scope UNIQUE(id,tenant_id,park_id,employee_id),
 CONSTRAINT uq_hr_talent_profile_no UNIQUE(tenant_id,park_id,employee_id,snapshot_no),
 CONSTRAINT uq_hr_talent_profile_digest UNIQUE(tenant_id,park_id,employee_id,source_digest),
 CONSTRAINT ck_hr_talent_profile_sources CHECK(jsonb_typeof(employee_snapshot)='object' AND jsonb_typeof(performance_source)='object' AND jsonb_typeof(feedback_source)='object' AND jsonb_typeof(development_source)='object')
);
CREATE INDEX idx_hr_talent_profile_employee ON hr_talent_profile_snapshot(tenant_id,park_id,employee_id);

CREATE TABLE hr_talent_review_session(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(32) NOT NULL,park_id varchar(32) NOT NULL,
 session_code varchar(64) NOT NULL,session_name varchar(160) NOT NULL,review_date date NOT NULL,status varchar(24) NOT NULL DEFAULT 'draft',
 performance_definition jsonb NOT NULL,potential_definition jsonb NOT NULL,participant_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),activated_at timestamptz,closed_at timestamptz,
 CONSTRAINT uq_hr_talent_review_session_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT uq_hr_talent_review_session UNIQUE(tenant_id,park_id,session_code),
 CONSTRAINT ck_hr_talent_review_session_status CHECK(status IN('draft','active','closed')),
 CONSTRAINT ck_hr_talent_review_session_defs CHECK(jsonb_typeof(performance_definition)='object' AND jsonb_typeof(potential_definition)='object' AND jsonb_typeof(participant_snapshot)='array')
);

CREATE TABLE hr_talent_review_subject(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(32) NOT NULL,park_id varchar(32) NOT NULL,
 session_id uuid NOT NULL,employee_id uuid NOT NULL,profile_snapshot_id uuid NOT NULL,
 employee_snapshot jsonb NOT NULL,source_snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_talent_subject_session FOREIGN KEY(session_id,tenant_id,park_id) REFERENCES hr_talent_review_session(id,tenant_id,park_id),
 CONSTRAINT fk_hr_talent_subject_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_talent_subject_profile FOREIGN KEY(profile_snapshot_id,tenant_id,park_id,employee_id) REFERENCES hr_talent_profile_snapshot(id,tenant_id,park_id,employee_id),
 CONSTRAINT uq_hr_talent_review_subject_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT uq_hr_talent_review_subject UNIQUE(tenant_id,park_id,session_id,employee_id),
 CONSTRAINT ck_hr_talent_subject_snapshots CHECK(jsonb_typeof(employee_snapshot)='object' AND jsonb_typeof(source_snapshot)='object')
);
CREATE INDEX idx_hr_talent_subject_session ON hr_talent_review_subject(tenant_id,park_id,session_id);
CREATE INDEX idx_hr_talent_subject_employee ON hr_talent_review_subject(tenant_id,park_id,employee_id);
CREATE INDEX idx_hr_talent_subject_profile ON hr_talent_review_subject(tenant_id,park_id,profile_snapshot_id);

CREATE TABLE hr_talent_review_decision(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(32) NOT NULL,park_id varchar(32) NOT NULL,
 subject_id uuid NOT NULL,decision_no integer NOT NULL,performance_band varchar(16) NOT NULL,potential_band varchar(16) NOT NULL,
 nine_box varchar(32) NOT NULL,potential_score numeric(7,2) NOT NULL,reason varchar(2000) NOT NULL,evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 supersedes_id uuid,decided_by uuid NOT NULL,decided_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_talent_decision_subject FOREIGN KEY(subject_id,tenant_id,park_id) REFERENCES hr_talent_review_subject(id,tenant_id,park_id),
 CONSTRAINT fk_hr_talent_decision_previous FOREIGN KEY(supersedes_id,tenant_id,park_id,subject_id) REFERENCES hr_talent_review_decision(id,tenant_id,park_id,subject_id),
 CONSTRAINT uq_hr_talent_decision_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT uq_hr_talent_decision_subject_scope UNIQUE(id,tenant_id,park_id,subject_id),
 CONSTRAINT uq_hr_talent_decision_no UNIQUE(tenant_id,park_id,subject_id,decision_no),
 CONSTRAINT ck_hr_talent_decision_bands CHECK(performance_band IN('low','medium','high') AND potential_band IN('low','medium','high')),
 CONSTRAINT ck_hr_talent_decision_box CHECK(nine_box=performance_band||'_'||potential_band),
 CONSTRAINT ck_hr_talent_potential_score CHECK(potential_score BETWEEN 0 AND 100),
 CONSTRAINT ck_hr_talent_decision_reason CHECK(length(btrim(reason))>=4),
 CONSTRAINT ck_hr_talent_decision_evidence CHECK(jsonb_typeof(evidence)='array')
);
CREATE INDEX idx_hr_talent_decision_subject ON hr_talent_review_decision(tenant_id,park_id,subject_id);
CREATE INDEX idx_hr_talent_decision_previous ON hr_talent_review_decision(tenant_id,park_id,supersedes_id);

CREATE TABLE hr_critical_position(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(32) NOT NULL,park_id varchar(32) NOT NULL,
 position_id uuid NOT NULL,criticality varchar(16) NOT NULL,risk_level varchar(16) NOT NULL,risk_reason varchar(2000) NOT NULL,
 evidence jsonb NOT NULL DEFAULT '[]'::jsonb,status varchar(16) NOT NULL DEFAULT 'active',created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_critical_position FOREIGN KEY(tenant_id,park_id,position_id) REFERENCES hr_position(tenant_id,park_id,id),
 CONSTRAINT uq_hr_critical_position_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT uq_hr_critical_position UNIQUE(tenant_id,park_id,position_id),
 CONSTRAINT ck_hr_criticality CHECK(criticality IN('important','critical')),
 CONSTRAINT ck_hr_critical_risk CHECK(risk_level IN('low','medium','high')),
 CONSTRAINT ck_hr_critical_reason CHECK(length(btrim(risk_reason))>=4),
 CONSTRAINT ck_hr_critical_status CHECK(status IN('active','inactive')),
 CONSTRAINT ck_hr_critical_evidence CHECK(jsonb_typeof(evidence)='array')
);

CREATE TABLE hr_succession_candidate_version(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(32) NOT NULL,park_id varchar(32) NOT NULL,
 critical_position_id uuid NOT NULL,employee_id uuid NOT NULL,version_no integer NOT NULL,readiness varchar(24) NOT NULL,
 risk_level varchar(16) NOT NULL,risk_reason varchar(2000) NOT NULL,evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 profile_snapshot_id uuid NOT NULL,supersedes_id uuid,status varchar(16) NOT NULL DEFAULT 'active',created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_succession_position FOREIGN KEY(critical_position_id,tenant_id,park_id) REFERENCES hr_critical_position(id,tenant_id,park_id),
 CONSTRAINT fk_hr_succession_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_succession_profile FOREIGN KEY(profile_snapshot_id,tenant_id,park_id,employee_id) REFERENCES hr_talent_profile_snapshot(id,tenant_id,park_id,employee_id),
 CONSTRAINT fk_hr_succession_previous FOREIGN KEY(supersedes_id,tenant_id,park_id,critical_position_id,employee_id) REFERENCES hr_succession_candidate_version(id,tenant_id,park_id,critical_position_id,employee_id),
 CONSTRAINT uq_hr_succession_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT uq_hr_succession_identity_scope UNIQUE(id,tenant_id,park_id,critical_position_id,employee_id),
 CONSTRAINT uq_hr_succession_version UNIQUE(tenant_id,park_id,critical_position_id,employee_id,version_no),
 CONSTRAINT ck_hr_succession_readiness CHECK(readiness IN('ready_now','ready_1_2_years','ready_3_plus_years')),
 CONSTRAINT ck_hr_succession_risk CHECK(risk_level IN('low','medium','high')),
 CONSTRAINT ck_hr_succession_status CHECK(status IN('active','withdrawn')),
 CONSTRAINT ck_hr_succession_evidence CHECK(jsonb_typeof(evidence)='array')
);
CREATE INDEX idx_hr_succession_employee ON hr_succession_candidate_version(tenant_id,park_id,employee_id);
CREATE INDEX idx_hr_succession_profile ON hr_succession_candidate_version(tenant_id,park_id,profile_snapshot_id);
CREATE INDEX idx_hr_succession_previous ON hr_succession_candidate_version(tenant_id,park_id,supersedes_id);

CREATE TABLE hr_development_plan(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(32) NOT NULL,park_id varchar(32) NOT NULL,
 employee_id uuid NOT NULL,profile_snapshot_id uuid NOT NULL,plan_code varchar(64) NOT NULL,plan_name varchar(160) NOT NULL,
 development_goal varchar(2000) NOT NULL,start_date date NOT NULL,end_date date NOT NULL,status varchar(24) NOT NULL DEFAULT 'draft',
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz,completed_at timestamptz,
 CONSTRAINT fk_hr_development_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_development_profile FOREIGN KEY(profile_snapshot_id,tenant_id,park_id,employee_id) REFERENCES hr_talent_profile_snapshot(id,tenant_id,park_id,employee_id),
 CONSTRAINT uq_hr_development_plan_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT uq_hr_development_plan UNIQUE(tenant_id,park_id,plan_code),
 CONSTRAINT ck_hr_development_dates CHECK(end_date>=start_date),
 CONSTRAINT ck_hr_development_status CHECK(status IN('draft','active','completed','cancelled'))
);
CREATE INDEX idx_hr_development_employee ON hr_development_plan(tenant_id,park_id,employee_id);
CREATE INDEX idx_hr_development_profile ON hr_development_plan(tenant_id,park_id,profile_snapshot_id);

CREATE TABLE hr_development_plan_history(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(32) NOT NULL,park_id varchar(32) NOT NULL,
 plan_id uuid NOT NULL,event_no integer NOT NULL,event_type varchar(24) NOT NULL,from_status varchar(24),to_status varchar(24) NOT NULL,
 reason varchar(2000),actor_user_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_development_plan_history FOREIGN KEY(plan_id,tenant_id,park_id) REFERENCES hr_development_plan(id,tenant_id,park_id),
 CONSTRAINT uq_hr_development_plan_history UNIQUE(tenant_id,park_id,plan_id,event_no),
 CONSTRAINT ck_hr_development_plan_event CHECK(event_type IN('created','activated','completed','cancelled'))
);
CREATE INDEX idx_hr_development_plan_history ON hr_development_plan_history(tenant_id,park_id,plan_id);

CREATE TABLE hr_development_action(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(32) NOT NULL,park_id varchar(32) NOT NULL,
 plan_id uuid NOT NULL,action_no integer NOT NULL,action_name varchar(200) NOT NULL,owner_employee_id uuid NOT NULL,
 due_date date NOT NULL,status varchar(24) NOT NULL DEFAULT 'pending',completion_note varchar(2000),evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 CONSTRAINT fk_hr_development_action_plan FOREIGN KEY(plan_id,tenant_id,park_id) REFERENCES hr_development_plan(id,tenant_id,park_id),
 CONSTRAINT fk_hr_development_action_owner FOREIGN KEY(tenant_id,park_id,owner_employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT uq_hr_development_action_scope UNIQUE(id,tenant_id,park_id),
 CONSTRAINT uq_hr_development_action_no UNIQUE(tenant_id,park_id,plan_id,action_no),
 CONSTRAINT ck_hr_development_action_status CHECK(status IN('pending','in_progress','completed','cancelled')),
 CONSTRAINT ck_hr_development_action_evidence CHECK(jsonb_typeof(evidence)='array')
);
CREATE INDEX idx_hr_development_action_owner ON hr_development_action(tenant_id,park_id,owner_employee_id,status,due_date);

CREATE TABLE hr_development_action_history(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(32) NOT NULL,park_id varchar(32) NOT NULL,
 action_id uuid NOT NULL,event_no integer NOT NULL,event_type varchar(24) NOT NULL,from_status varchar(24),to_status varchar(24) NOT NULL,
 note varchar(2000),evidence jsonb NOT NULL DEFAULT '[]'::jsonb,actor_user_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_development_history_action FOREIGN KEY(action_id,tenant_id,park_id) REFERENCES hr_development_action(id,tenant_id,park_id),
 CONSTRAINT uq_hr_development_history_no UNIQUE(tenant_id,park_id,action_id,event_no),
 CONSTRAINT ck_hr_development_history_event CHECK(event_type IN('created','started','completed','cancelled','evidence_added')),
 CONSTRAINT ck_hr_development_history_evidence CHECK(jsonb_typeof(evidence)='array')
);
CREATE INDEX idx_hr_development_history_action ON hr_development_action_history(tenant_id,park_id,action_id);

CREATE OR REPLACE FUNCTION hr_talent_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION '% is append-only',TG_TABLE_NAME;END$$;
CREATE OR REPLACE FUNCTION hr_talent_decision_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE v_status varchar(24);v_no integer;v_previous uuid;BEGIN
 SELECT s.status INTO v_status FROM hr_talent_review_subject x JOIN hr_talent_review_session s ON(s.id,s.tenant_id,s.park_id)=(x.session_id,x.tenant_id,x.park_id) WHERE (x.id,x.tenant_id,x.park_id)=(NEW.subject_id,NEW.tenant_id,NEW.park_id) FOR UPDATE OF x,s;
 IF v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'talent review session is not active';END IF;
 SELECT d.decision_no,d.id INTO v_no,v_previous FROM hr_talent_review_decision d WHERE (d.tenant_id,d.park_id,d.subject_id)=(NEW.tenant_id,NEW.park_id,NEW.subject_id) ORDER BY d.decision_no DESC LIMIT 1;
 IF NEW.decision_no IS DISTINCT FROM COALESCE(v_no,0)+1 OR NEW.supersedes_id IS DISTINCT FROM v_previous THEN RAISE EXCEPTION 'talent decision chain is invalid';END IF;
 RETURN NEW;
END$$;
CREATE OR REPLACE FUNCTION hr_succession_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE v_status varchar(16);v_no integer;v_previous uuid;BEGIN
 SELECT status INTO v_status FROM hr_critical_position WHERE (id,tenant_id,park_id)=(NEW.critical_position_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 IF v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'critical position is not active';END IF;
 SELECT version_no,id INTO v_no,v_previous FROM hr_succession_candidate_version WHERE (tenant_id,park_id,critical_position_id,employee_id)=(NEW.tenant_id,NEW.park_id,NEW.critical_position_id,NEW.employee_id) ORDER BY version_no DESC LIMIT 1;
 IF NEW.version_no IS DISTINCT FROM COALESCE(v_no,0)+1 OR NEW.supersedes_id IS DISTINCT FROM v_previous THEN RAISE EXCEPTION 'succession version chain is invalid';END IF;
 RETURN NEW;
END$$;
CREATE OR REPLACE FUNCTION hr_development_action_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE v_status varchar(24);v_start date;v_end date;BEGIN
 SELECT status,start_date,end_date INTO v_status,v_start,v_end FROM hr_development_plan WHERE (id,tenant_id,park_id)=(NEW.plan_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 IF v_status IN('completed','cancelled') THEN RAISE EXCEPTION 'development plan is terminal';END IF;
 IF NEW.due_date<v_start OR NEW.due_date>v_end THEN RAISE EXCEPTION 'development action due date is outside the plan';END IF;
 RETURN NEW;
END$$;
CREATE OR REPLACE FUNCTION hr_talent_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'talent review session cannot be deleted';END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.session_code,NEW.session_name,NEW.review_date,NEW.performance_definition,NEW.potential_definition,NEW.participant_snapshot,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.session_code,OLD.session_name,OLD.review_date,OLD.performance_definition,OLD.potential_definition,OLD.participant_snapshot,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'talent review session snapshot is immutable';END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT((OLD.status='draft' AND NEW.status='active')OR(OLD.status='active' AND NEW.status='closed'))THEN RAISE EXCEPTION 'invalid talent review session transition';END IF;RETURN NEW;
END$$;
CREATE OR REPLACE FUNCTION hr_development_action_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'development action cannot be deleted';END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.plan_id,NEW.action_no,NEW.action_name,NEW.owner_employee_id,NEW.due_date,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.plan_id,OLD.action_no,OLD.action_name,OLD.owner_employee_id,OLD.due_date,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'development action identity is immutable';END IF;
 IF OLD.status IN('completed','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'terminal development action is immutable';END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT((OLD.status='pending' AND NEW.status IN('in_progress','completed','cancelled'))OR(OLD.status='in_progress' AND NEW.status IN('completed','cancelled')))THEN RAISE EXCEPTION 'invalid development action transition';END IF;RETURN NEW;
END$$;
CREATE OR REPLACE FUNCTION hr_development_plan_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'development plan cannot be deleted';END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.employee_id,NEW.profile_snapshot_id,NEW.plan_code,NEW.plan_name,NEW.development_goal,NEW.start_date,NEW.end_date,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.employee_id,OLD.profile_snapshot_id,OLD.plan_code,OLD.plan_name,OLD.development_goal,OLD.start_date,OLD.end_date,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'development plan snapshot is immutable';END IF;
 IF OLD.status IN('completed','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'terminal development plan is immutable';END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT((OLD.status='draft' AND NEW.status IN('active','cancelled'))OR(OLD.status='active' AND NEW.status IN('completed','cancelled')))THEN RAISE EXCEPTION 'invalid development plan transition';END IF;RETURN NEW;
END$$;
CREATE OR REPLACE FUNCTION hr_critical_position_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'critical position cannot be deleted';END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.position_id,NEW.criticality,NEW.risk_level,NEW.risk_reason,NEW.evidence,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.position_id,OLD.criticality,OLD.risk_level,OLD.risk_reason,OLD.evidence,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'critical position assessment is immutable';END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT(OLD.status='active' AND NEW.status='inactive')THEN RAISE EXCEPTION 'invalid critical position transition';END IF;RETURN NEW;
END$$;
CREATE TRIGGER trg_hr_talent_session_guard BEFORE UPDATE OR DELETE ON hr_talent_review_session FOR EACH ROW EXECUTE FUNCTION hr_talent_session_guard();
CREATE TRIGGER trg_hr_talent_profile_immutable BEFORE UPDATE OR DELETE ON hr_talent_profile_snapshot FOR EACH ROW EXECUTE FUNCTION hr_talent_append_only_guard();
CREATE TRIGGER trg_hr_talent_subject_immutable BEFORE UPDATE OR DELETE ON hr_talent_review_subject FOR EACH ROW EXECUTE FUNCTION hr_talent_append_only_guard();
CREATE TRIGGER trg_hr_talent_decision_immutable BEFORE UPDATE OR DELETE ON hr_talent_review_decision FOR EACH ROW EXECUTE FUNCTION hr_talent_append_only_guard();
CREATE TRIGGER trg_hr_talent_decision_insert_guard BEFORE INSERT ON hr_talent_review_decision FOR EACH ROW EXECUTE FUNCTION hr_talent_decision_insert_guard();
CREATE TRIGGER trg_hr_critical_position_guard BEFORE UPDATE OR DELETE ON hr_critical_position FOR EACH ROW EXECUTE FUNCTION hr_critical_position_guard();
CREATE TRIGGER trg_hr_succession_version_immutable BEFORE UPDATE OR DELETE ON hr_succession_candidate_version FOR EACH ROW EXECUTE FUNCTION hr_talent_append_only_guard();
CREATE TRIGGER trg_hr_succession_insert_guard BEFORE INSERT ON hr_succession_candidate_version FOR EACH ROW EXECUTE FUNCTION hr_succession_insert_guard();
CREATE TRIGGER trg_hr_development_history_immutable BEFORE UPDATE OR DELETE ON hr_development_action_history FOR EACH ROW EXECUTE FUNCTION hr_talent_append_only_guard();
CREATE TRIGGER trg_hr_development_plan_history_immutable BEFORE UPDATE OR DELETE ON hr_development_plan_history FOR EACH ROW EXECUTE FUNCTION hr_talent_append_only_guard();
CREATE TRIGGER trg_hr_development_action_guard BEFORE UPDATE OR DELETE ON hr_development_action FOR EACH ROW EXECUTE FUNCTION hr_development_action_guard();
CREATE TRIGGER trg_hr_development_action_insert_guard BEFORE INSERT ON hr_development_action FOR EACH ROW EXECUTE FUNCTION hr_development_action_insert_guard();
CREATE TRIGGER trg_hr_development_plan_guard BEFORE UPDATE OR DELETE ON hr_development_plan FOR EACH ROW EXECUTE FUNCTION hr_development_plan_guard();

COMMIT;
