BEGIN;

-- T6 Phase 1 is an additive upgrade of the 000231 goal/report foundation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employee_scope_id ON hr_employee(tenant_id,park_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_org_scope_id ON sys_org(tenant_id,park_id,id);
ALTER TABLE hr_goal_cycle ADD CONSTRAINT uq_hr_goal_cycle_t6_scope_id UNIQUE(tenant_id,park_id,id);
ALTER TABLE hr_goal ADD CONSTRAINT uq_hr_goal_t6_scope_id UNIQUE(tenant_id,park_id,id);
ALTER TABLE hr_goal_checkin ADD CONSTRAINT uq_hr_goal_checkin_t6_scope_id UNIQUE(tenant_id,park_id,id);
ALTER TABLE hr_work_report ADD CONSTRAINT uq_hr_work_report_t6_scope_id UNIQUE(tenant_id,park_id,id);

ALTER TABLE hr_goal
  ADD COLUMN metric_type varchar(24) NOT NULL DEFAULT 'numeric',
  ADD COLUMN metric_definition varchar(1000),
  ADD COLUMN aggregation_strategy varchar(24) NOT NULL DEFAULT 'weighted_children',
  ADD COLUMN current_version_no integer NOT NULL DEFAULT 1,
  ADD COLUMN source_kind varchar(24) NOT NULL DEFAULT 'legacy_000231',
  ADD CONSTRAINT ck_hr_goal_metric_type CHECK(metric_type IN('numeric','percentage','milestone','count','currency')),
  ADD CONSTRAINT ck_hr_goal_aggregation CHECK(aggregation_strategy IN('weighted_children','manual_leaf')),
  ADD CONSTRAINT ck_hr_goal_current_version CHECK(current_version_no>0),
  ADD CONSTRAINT fk_hr_goal_cycle_scope FOREIGN KEY(tenant_id,park_id,cycle_id) REFERENCES hr_goal_cycle(tenant_id,park_id,id),
  ADD CONSTRAINT fk_hr_goal_parent_scope FOREIGN KEY(tenant_id,park_id,parent_goal_id) REFERENCES hr_goal(tenant_id,park_id,id),
  ADD CONSTRAINT fk_hr_goal_owner_org_scope FOREIGN KEY(tenant_id,park_id,owner_org_id) REFERENCES sys_org(tenant_id,park_id,id),
  ADD CONSTRAINT fk_hr_goal_owner_employee_scope FOREIGN KEY(tenant_id,park_id,owner_employee_id) REFERENCES hr_employee(tenant_id,park_id,id);
CREATE INDEX idx_hr_goal_cycle_scope_fk ON hr_goal(tenant_id,park_id,cycle_id);
CREATE INDEX idx_hr_goal_parent_scope_fk ON hr_goal(tenant_id,park_id,parent_goal_id);
CREATE INDEX idx_hr_goal_owner_org_scope_fk ON hr_goal(tenant_id,park_id,owner_org_id);
CREATE INDEX idx_hr_goal_owner_employee_scope_fk ON hr_goal(tenant_id,park_id,owner_employee_id);

ALTER TABLE hr_goal_checkin
  ADD COLUMN confidence varchar(16) NOT NULL DEFAULT 'medium',
  ADD COLUMN next_action varchar(2000),
  ADD CONSTRAINT ck_hr_goal_checkin_confidence CHECK(confidence IN('high','medium','low')),
  ADD CONSTRAINT fk_hr_goal_checkin_goal_scope FOREIGN KEY(tenant_id,park_id,goal_id) REFERENCES hr_goal(tenant_id,park_id,id);
CREATE INDEX idx_hr_goal_checkin_goal_scope_fk ON hr_goal_checkin(tenant_id,park_id,goal_id);

CREATE TABLE hr_goal_version(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 goal_id uuid NOT NULL,version_no integer NOT NULL,snapshot jsonb NOT NULL,change_reason varchar(1000) NOT NULL,
 actor_user_id uuid,create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_goal_version_goal_scope FOREIGN KEY(tenant_id,park_id,goal_id) REFERENCES hr_goal(tenant_id,park_id,id),
 CONSTRAINT ck_hr_goal_version_no CHECK(version_no>0),CONSTRAINT ck_hr_goal_version_snapshot CHECK(jsonb_typeof(snapshot)='object'),
 UNIQUE(tenant_id,park_id,goal_id,version_no)
);
CREATE INDEX idx_hr_goal_version_goal_scope_fk ON hr_goal_version(tenant_id,park_id,goal_id);

CREATE TABLE hr_goal_action(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 goal_id uuid NOT NULL,action_type varchar(32) NOT NULL,from_status varchar(32),to_status varchar(32),
 version_no integer,detail jsonb NOT NULL DEFAULT '{}'::jsonb,actor_user_id uuid,create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_goal_action_goal_scope FOREIGN KEY(tenant_id,park_id,goal_id) REFERENCES hr_goal(tenant_id,park_id,id),
 CONSTRAINT ck_hr_goal_action_type CHECK(action_type IN('baseline','created','changed','activated','closed','checkin','aggregated')),
 CONSTRAINT ck_hr_goal_action_detail CHECK(jsonb_typeof(detail)='object')
);
CREATE INDEX idx_hr_goal_action_goal_scope_fk ON hr_goal_action(tenant_id,park_id,goal_id);

CREATE TABLE hr_goal_collaborator(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 goal_id uuid NOT NULL,employee_id uuid NOT NULL,create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),
 is_deleted boolean NOT NULL DEFAULT false,
 CONSTRAINT fk_hr_goal_collaborator_goal_scope FOREIGN KEY(tenant_id,park_id,goal_id) REFERENCES hr_goal(tenant_id,park_id,id),
 CONSTRAINT fk_hr_goal_collaborator_employee_scope FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_goal_collaborator_active ON hr_goal_collaborator(tenant_id,park_id,goal_id,employee_id) WHERE is_deleted=false;
CREATE INDEX idx_hr_goal_collaborator_goal_scope_fk ON hr_goal_collaborator(tenant_id,park_id,goal_id);
CREATE INDEX idx_hr_goal_collaborator_employee_scope_fk ON hr_goal_collaborator(tenant_id,park_id,employee_id);

ALTER TABLE hr_work_report DROP CONSTRAINT ck_hr_report_status;
ALTER TABLE hr_work_report
  ALTER COLUMN completed_work DROP NOT NULL,
  ADD COLUMN submission_no integer NOT NULL DEFAULT 0,
  ADD COLUMN source_kind varchar(24) NOT NULL DEFAULT 'legacy_000231',
  ADD CONSTRAINT ck_hr_report_status CHECK(status IN('draft','submitted','returned','resubmitted','confirmed')),
  ADD CONSTRAINT ck_hr_report_submission_no CHECK(submission_no>=0),
  ADD CONSTRAINT fk_hr_work_report_employee_scope FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
  ADD CONSTRAINT fk_hr_work_report_reviewer_scope FOREIGN KEY(tenant_id,park_id,reviewer_employee_id) REFERENCES hr_employee(tenant_id,park_id,id);
UPDATE hr_work_report SET submission_no=CASE WHEN status='draft' THEN 0 ELSE 1 END;
CREATE INDEX idx_hr_work_report_employee_scope_fk ON hr_work_report(tenant_id,park_id,employee_id);
CREATE INDEX idx_hr_work_report_reviewer_scope_fk ON hr_work_report(tenant_id,park_id,reviewer_employee_id);

ALTER TABLE hr_work_report_goal
  ADD COLUMN proposed_progress numeric(7,4),
  ADD COLUMN proposed_current_value numeric(18,4),
  ADD COLUMN suggestion_summary varchar(2000),
  ADD CONSTRAINT ck_hr_work_report_goal_proposed_progress CHECK(proposed_progress IS NULL OR proposed_progress BETWEEN 0 AND 1),
  ADD CONSTRAINT fk_hr_work_report_goal_report_scope FOREIGN KEY(tenant_id,park_id,report_id) REFERENCES hr_work_report(tenant_id,park_id,id),
  ADD CONSTRAINT fk_hr_work_report_goal_goal_scope FOREIGN KEY(tenant_id,park_id,goal_id) REFERENCES hr_goal(tenant_id,park_id,id);
CREATE INDEX idx_hr_work_report_goal_report_scope_fk ON hr_work_report_goal(tenant_id,park_id,report_id);
CREATE INDEX idx_hr_work_report_goal_goal_scope_fk ON hr_work_report_goal(tenant_id,park_id,goal_id);

CREATE TABLE hr_work_report_action(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 report_id uuid NOT NULL,action_type varchar(24) NOT NULL,from_status varchar(32),to_status varchar(32) NOT NULL,
 submission_no integer NOT NULL,comment varchar(1000),snapshot jsonb NOT NULL,actor_user_id uuid,create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_work_report_action_scope FOREIGN KEY(tenant_id,park_id,report_id) REFERENCES hr_work_report(tenant_id,park_id,id),
 CONSTRAINT ck_hr_work_report_action_type CHECK(action_type IN('baseline','created','updated','submitted','resubmitted','returned','confirmed')),
 CONSTRAINT ck_hr_work_report_action_submission CHECK(submission_no>=0),CONSTRAINT ck_hr_work_report_action_snapshot CHECK(jsonb_typeof(snapshot)='object')
);
CREATE INDEX idx_hr_work_report_action_report_scope_fk ON hr_work_report_action(tenant_id,park_id,report_id);

INSERT INTO hr_goal_version(tenant_id,park_id,goal_id,version_no,snapshot,change_reason,actor_user_id,create_time)
SELECT tenant_id,park_id,id,1,jsonb_build_object('goalName',goal_name,'goalLevel',goal_level,'ownerOrgId',owner_org_id,'ownerEmployeeId',owner_employee_id,'weight',weight::text,'metricName',metric_name,'targetValue',target_value::text,'unit',unit,'startDate',start_date,'dueDate',due_date,'status',status),'000231 兼容基线',update_by,create_time FROM hr_goal;
INSERT INTO hr_goal_action(tenant_id,park_id,goal_id,action_type,to_status,version_no,detail,actor_user_id,create_time)
SELECT tenant_id,park_id,id,'baseline',status,1,jsonb_build_object('source','legacy_000231'),update_by,create_time FROM hr_goal;
INSERT INTO hr_work_report_action(tenant_id,park_id,report_id,action_type,to_status,submission_no,comment,snapshot,actor_user_id,create_time)
SELECT r.tenant_id,r.park_id,r.id,'baseline',r.status,r.submission_no,r.review_comment,jsonb_build_object('reportType',r.report_type,'periodStart',r.period_start,'periodEnd',r.period_end,'completedWork',r.completed_work,'nextPlan',r.next_plan,'risks',r.risks,'collaborationNeeds',r.collaboration_needs,'hours',r.hours::text,'goalSuggestions',COALESCE((SELECT jsonb_agg(jsonb_build_object('goalId',l.goal_id,'proposedProgress',l.progress_delta::text) ORDER BY l.goal_id) FROM hr_work_report_goal l WHERE l.tenant_id=r.tenant_id AND l.park_id=r.park_id AND l.report_id=r.id AND l.is_deleted=false),'[]'::jsonb)),r.update_by,r.create_time FROM hr_work_report r;

CREATE OR REPLACE FUNCTION hr_goal_validate_t6() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_goal_cycle%ROWTYPE;p hr_goal%ROWTYPE;parent_org uuid;sum_weight numeric;owner_primary uuid;
BEGIN
 SELECT * INTO c FROM hr_goal_cycle WHERE id=NEW.cycle_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND is_deleted=false FOR UPDATE;
 IF NOT FOUND OR c.status='closed' THEN RAISE EXCEPTION 'goal cycle unavailable' USING ERRCODE='23514'; END IF;
 IF NEW.start_date<c.start_date OR NEW.due_date>c.end_date THEN RAISE EXCEPTION 'goal dates outside cycle' USING ERRCODE='23514'; END IF;
 IF NEW.parent_goal_id IS NULL THEN
   IF NEW.goal_level<>'group' THEN RAISE EXCEPTION 'only group goal may be root' USING ERRCODE='23514'; END IF;
 ELSE
   SELECT * INTO p FROM hr_goal WHERE id=NEW.parent_goal_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND is_deleted=false FOR UPDATE;
   IF NOT FOUND OR p.cycle_id<>NEW.cycle_id OR p.status NOT IN('draft','active') THEN RAISE EXCEPTION 'parent goal unavailable' USING ERRCODE='23514'; END IF;
   IF NEW.start_date<p.start_date OR NEW.due_date>p.due_date THEN RAISE EXCEPTION 'child dates outside parent' USING ERRCODE='23514'; END IF;
   IF p.goal_level='group' AND NEW.goal_level<>'department' OR p.goal_level='employee' OR p.goal_level='department' AND NEW.goal_level NOT IN('department','employee') THEN RAISE EXCEPTION 'invalid goal hierarchy' USING ERRCODE='23514'; END IF;
   IF p.goal_level='department' THEN
     IF NEW.goal_level='department' THEN
       WITH RECURSIVE d AS(SELECT id,parent_id FROM sys_org WHERE id=NEW.owner_org_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND is_deleted=false UNION ALL SELECT o.id,o.parent_id FROM sys_org o JOIN d ON d.parent_id=o.id WHERE o.tenant_id=NEW.tenant_id AND o.park_id=NEW.park_id AND o.is_deleted=false) SELECT parent_id INTO parent_org FROM d WHERE parent_id=p.owner_org_id LIMIT 1;
       IF parent_org IS NULL THEN RAISE EXCEPTION 'department owner outside parent organization' USING ERRCODE='23514'; END IF;
     ELSE
       SELECT primary_org_id INTO owner_primary FROM hr_employee WHERE id=NEW.owner_employee_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND is_deleted=false;
       IF owner_primary IS NULL THEN RAISE EXCEPTION 'employee goal owner has no organization' USING ERRCODE='23514'; END IF;
       WITH RECURSIVE d AS(SELECT id,parent_id FROM sys_org WHERE id=owner_primary AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND is_deleted=false UNION ALL SELECT o.id,o.parent_id FROM sys_org o JOIN d ON d.parent_id=o.id WHERE o.tenant_id=NEW.tenant_id AND o.park_id=NEW.park_id AND o.is_deleted=false) SELECT id INTO parent_org FROM d WHERE id=p.owner_org_id LIMIT 1;
       IF parent_org IS NULL THEN RAISE EXCEPTION 'employee owner outside parent organization' USING ERRCODE='23514'; END IF;
     END IF;
   END IF;
 END IF;
 SELECT COALESCE(SUM(weight),0) INTO sum_weight FROM hr_goal WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND cycle_id=NEW.cycle_id AND parent_goal_id IS NOT DISTINCT FROM NEW.parent_goal_id AND is_deleted=false AND id<>NEW.id;
 IF sum_weight+NEW.weight>1.0000 THEN RAISE EXCEPTION 'sibling goal weight exceeds 100 percent' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER trg_hr_goal_validate_t6 BEFORE INSERT OR UPDATE OF tenant_id,park_id,cycle_id,parent_goal_id,goal_level,owner_org_id,owner_employee_id,weight,start_date,due_date,status,is_deleted ON hr_goal FOR EACH ROW EXECUTE FUNCTION hr_goal_validate_t6();

CREATE OR REPLACE FUNCTION hr_goal_cycle_state_guard_t6() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE open_goal boolean;
BEGIN
 IF OLD.status='closed' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'closed goal cycle is immutable' USING ERRCODE='55000'; END IF;
 IF NEW.status<>OLD.status AND NOT (OLD.status='draft' AND NEW.status='active' OR OLD.status='active' AND NEW.status='closed') THEN RAISE EXCEPTION 'invalid goal cycle transition' USING ERRCODE='23514'; END IF;
 IF OLD.status='active' AND NEW.status='closed' THEN SELECT EXISTS(SELECT 1 FROM hr_goal WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND cycle_id=NEW.id AND is_deleted=false AND status NOT IN('completed','cancelled')) INTO open_goal;IF open_goal THEN RAISE EXCEPTION 'goal cycle has open goals' USING ERRCODE='23514';END IF;END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER trg_hr_goal_cycle_state_guard_t6 BEFORE UPDATE ON hr_goal_cycle FOR EACH ROW EXECUTE FUNCTION hr_goal_cycle_state_guard_t6();

CREATE OR REPLACE FUNCTION hr_goal_state_guard_t6() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status varchar(32); open_child boolean;
BEGIN
 IF OLD.status IN('completed','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'terminal goal is immutable' USING ERRCODE='55000'; END IF;
 IF NEW.status<>OLD.status THEN
   IF NOT (OLD.status='draft' AND NEW.status='active' OR OLD.status='active' AND NEW.status IN('completed','cancelled')) THEN RAISE EXCEPTION 'invalid goal transition' USING ERRCODE='23514'; END IF;
   IF NEW.status='active' THEN
     IF NEW.parent_goal_id IS NULL THEN SELECT status INTO parent_status FROM hr_goal_cycle WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.cycle_id FOR SHARE;
     ELSE SELECT status INTO parent_status FROM hr_goal WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.parent_goal_id FOR SHARE; END IF;
     IF parent_status<>'active' THEN RAISE EXCEPTION 'goal parent must be active' USING ERRCODE='23514'; END IF;
   END IF;
   IF NEW.status IN('completed','cancelled') THEN SELECT EXISTS(SELECT 1 FROM hr_goal WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND parent_goal_id=NEW.id AND is_deleted=false AND status NOT IN('completed','cancelled')) INTO open_child;IF open_child THEN RAISE EXCEPTION 'goal has open children' USING ERRCODE='23514'; END IF; END IF;
 END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER trg_hr_goal_state_guard_t6 BEFORE UPDATE ON hr_goal FOR EACH ROW EXECUTE FUNCTION hr_goal_state_guard_t6();

CREATE OR REPLACE FUNCTION hr_work_report_action_freeze_suggestions_t6() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.snapshot=jsonb_set(NEW.snapshot,'{goalSuggestions}',COALESCE((SELECT jsonb_agg(jsonb_build_object('goalId',l.goal_id,'proposedProgress',l.proposed_progress::text,'proposedCurrentValue',l.proposed_current_value::text,'suggestionSummary',l.suggestion_summary) ORDER BY l.goal_id) FROM hr_work_report_goal l WHERE l.tenant_id=NEW.tenant_id AND l.park_id=NEW.park_id AND l.report_id=NEW.report_id AND l.is_deleted=false),'[]'::jsonb),true);
 RETURN NEW;
END$$;
CREATE TRIGGER trg_hr_work_report_action_freeze_suggestions BEFORE INSERT ON hr_work_report_action FOR EACH ROW EXECUTE FUNCTION hr_work_report_action_freeze_suggestions_t6();

CREATE OR REPLACE FUNCTION hr_work_report_goal_mutation_guard_t6() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE report_status varchar(32);v_tenant varchar(64);v_park varchar(64);v_report uuid;
BEGIN
 IF TG_OP='DELETE' THEN v_tenant=OLD.tenant_id;v_park=OLD.park_id;v_report=OLD.report_id;ELSE v_tenant=NEW.tenant_id;v_park=NEW.park_id;v_report=NEW.report_id;END IF;
 SELECT status INTO report_status FROM hr_work_report WHERE tenant_id=v_tenant AND park_id=v_park AND id=v_report FOR SHARE;
 IF report_status NOT IN('draft','returned') THEN RAISE EXCEPTION 'submitted work report suggestions are immutable' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END$$;
CREATE TRIGGER trg_hr_work_report_goal_mutation_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_work_report_goal FOR EACH ROW EXECUTE FUNCTION hr_work_report_goal_mutation_guard_t6();

CREATE OR REPLACE FUNCTION hr_work_report_state_guard_t6() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.status IN('submitted','resubmitted','confirmed') THEN RAISE EXCEPTION 'submitted or confirmed work report is immutable' USING ERRCODE='55000';END IF;
   RETURN OLD;
 END IF;
 IF OLD.status='confirmed' THEN RAISE EXCEPTION 'confirmed work report is immutable' USING ERRCODE='55000';END IF;
 IF OLD.status IN('submitted','resubmitted') THEN
   IF NEW.status NOT IN('returned','confirmed') THEN RAISE EXCEPTION 'invalid submitted work report transition' USING ERRCODE='23514';END IF;
   IF ROW(NEW.employee_id,NEW.report_type,NEW.period_start,NEW.period_end,NEW.completed_work,NEW.next_plan,NEW.risks,NEW.collaboration_needs,NEW.hours) IS DISTINCT FROM ROW(OLD.employee_id,OLD.report_type,OLD.period_start,OLD.period_end,OLD.completed_work,OLD.next_plan,OLD.risks,OLD.collaboration_needs,OLD.hours) THEN RAISE EXCEPTION 'submitted work report content is immutable' USING ERRCODE='55000';END IF;
 ELSIF OLD.status='draft' AND NEW.status NOT IN('draft','submitted') THEN RAISE EXCEPTION 'invalid draft work report transition' USING ERRCODE='23514';
 ELSIF OLD.status='returned' AND NEW.status NOT IN('returned','resubmitted') THEN RAISE EXCEPTION 'invalid returned work report transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER trg_hr_work_report_state_guard_t6 BEFORE UPDATE OR DELETE ON hr_work_report FOR EACH ROW EXECUTE FUNCTION hr_work_report_state_guard_t6();

CREATE OR REPLACE FUNCTION hr_t6_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '% is append-only',TG_TABLE_NAME USING ERRCODE='55000';END$$;
CREATE TRIGGER trg_hr_goal_version_append_only BEFORE UPDATE OR DELETE ON hr_goal_version FOR EACH ROW EXECUTE FUNCTION hr_t6_append_only();
CREATE TRIGGER trg_hr_goal_action_append_only BEFORE UPDATE OR DELETE ON hr_goal_action FOR EACH ROW EXECUTE FUNCTION hr_t6_append_only();
CREATE TRIGGER trg_hr_goal_checkin_append_only BEFORE UPDATE OR DELETE ON hr_goal_checkin FOR EACH ROW EXECUTE FUNCTION hr_t6_append_only();
CREATE TRIGGER trg_hr_work_report_action_append_only BEFORE UPDATE OR DELETE ON hr_work_report_action FOR EACH ROW EXECUTE FUNCTION hr_t6_append_only();

COMMIT;
