BEGIN;
-- Additive workflow storage. Migration371/schema1 and all source helpers stay immutable.
ALTER TABLE hr_performance_template_version ADD COLUMN channel_workflow_revision_id uuid;
CREATE TABLE hr_performance_channel_workflow_revision (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,template_version_id uuid NOT NULL,
 definition_revision_id uuid NOT NULL,revision_no integer NOT NULL CHECK(revision_no>0),policy jsonb NOT NULL,previous_revision_id uuid,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,tenant_id,park_id,template_version_id),UNIQUE(tenant_id,park_id,template_version_id,revision_no),UNIQUE(previous_revision_id),
 FOREIGN KEY(template_version_id,tenant_id,park_id) REFERENCES hr_performance_template_version(id,tenant_id,park_id),
 FOREIGN KEY(definition_revision_id,tenant_id,park_id,template_version_id) REFERENCES hr_performance_channel_definition_revision(id,tenant_id,park_id,template_version_id),
 FOREIGN KEY(previous_revision_id,tenant_id,park_id,template_version_id) REFERENCES hr_performance_channel_workflow_revision(id,tenant_id,park_id,template_version_id),
 FOREIGN KEY(tenant_id,park_id,created_by) REFERENCES sys_user(tenant_id,park_id,id),
 CHECK((revision_no=1 AND previous_revision_id IS NULL) OR (revision_no>1 AND previous_revision_id IS NOT NULL))
);
ALTER TABLE hr_performance_template_version ADD CONSTRAINT fk_hr_perf_workflow_current FOREIGN KEY(channel_workflow_revision_id,tenant_id,park_id,id) REFERENCES hr_performance_channel_workflow_revision(id,tenant_id,park_id,template_version_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE hr_performance_template_version DROP CONSTRAINT ck_hr_perf_template_mode;
ALTER TABLE hr_performance_template_version ADD CONSTRAINT ck_hr_perf_template_mode CHECK(
 (calculation_mode='dimension_weighted_v1' AND total_weight IS NOT NULL AND total_weight=1 AND channel_definition_revision_id IS NULL AND channel_workflow_revision_id IS NULL)
 OR (calculation_mode='five_channel_v1' AND total_weight IS NULL AND channel_definition_revision_id IS NOT NULL AND (status='draft' OR (status='published' AND channel_workflow_revision_id IS NOT NULL AND published_at IS NOT NULL))));
ALTER TABLE hr_performance_review_cycle ADD COLUMN correction_reason varchar(2000),ADD COLUMN business_period_ref varchar(120),ADD COLUMN selected_employee_ids jsonb,ADD COLUMN predecessor_review_ids jsonb;
ALTER TABLE hr_performance_cycle_employee ADD COLUMN calculation_mode text NOT NULL DEFAULT 'dimension_weighted_v1',ADD COLUMN current_input_revision_id uuid,ADD COLUMN final_input_revision_id uuid,ADD COLUMN final_grade_evidence jsonb,ADD COLUMN predecessor_review_id uuid;
ALTER TABLE hr_performance_cycle_employee ADD CONSTRAINT fk_hr_perf_correction_predecessor FOREIGN KEY(predecessor_review_id,tenant_id,park_id) REFERENCES hr_performance_cycle_employee(id,tenant_id,park_id);
CREATE TABLE hr_performance_channel_input_revision (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,cycle_employee_id uuid NOT NULL,
 revision_no integer NOT NULL CHECK(revision_no>0),previous_revision_id uuid,input jsonb NOT NULL,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,tenant_id,park_id,cycle_employee_id),UNIQUE(tenant_id,park_id,cycle_employee_id,revision_no),UNIQUE(previous_revision_id),
 FOREIGN KEY(cycle_employee_id,tenant_id,park_id) REFERENCES hr_performance_cycle_employee(id,tenant_id,park_id),
 FOREIGN KEY(previous_revision_id,tenant_id,park_id,cycle_employee_id) REFERENCES hr_performance_channel_input_revision(id,tenant_id,park_id,cycle_employee_id),
 FOREIGN KEY(tenant_id,park_id,created_by) REFERENCES sys_user(tenant_id,park_id,id),
 CHECK((revision_no=1 AND previous_revision_id IS NULL) OR (revision_no>1 AND previous_revision_id IS NOT NULL))
);
ALTER TABLE hr_performance_cycle_employee ADD CONSTRAINT fk_hr_perf_input_current FOREIGN KEY(current_input_revision_id,tenant_id,park_id,id) REFERENCES hr_performance_channel_input_revision(id,tenant_id,park_id,cycle_employee_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE hr_performance_cycle_employee ADD CONSTRAINT fk_hr_perf_input_final FOREIGN KEY(final_input_revision_id,tenant_id,park_id,id) REFERENCES hr_performance_channel_input_revision(id,tenant_id,park_id,cycle_employee_id);
ALTER TABLE hr_performance_review_submission ADD COLUMN calculation_mode text NOT NULL DEFAULT 'dimension_weighted_v1',ADD COLUMN input_revision_id uuid,ADD COLUMN calculation_evidence jsonb;
ALTER TABLE hr_performance_calibration_entry ADD COLUMN calculation_mode text NOT NULL DEFAULT 'dimension_weighted_v1',ADD COLUMN input_revision_id uuid,ADD COLUMN calculation_evidence jsonb;
ALTER TABLE hr_performance_review_action ADD COLUMN input_revision_id uuid;
ALTER TABLE hr_performance_review_submission ADD FOREIGN KEY(input_revision_id,tenant_id,park_id,cycle_employee_id) REFERENCES hr_performance_channel_input_revision(id,tenant_id,park_id,cycle_employee_id);
ALTER TABLE hr_performance_calibration_entry ADD FOREIGN KEY(input_revision_id,tenant_id,park_id,cycle_employee_id) REFERENCES hr_performance_channel_input_revision(id,tenant_id,park_id,cycle_employee_id);
ALTER TABLE hr_performance_review_action ADD FOREIGN KEY(input_revision_id,tenant_id,park_id,cycle_employee_id) REFERENCES hr_performance_channel_input_revision(id,tenant_id,park_id,cycle_employee_id);
ALTER TABLE hr_performance_cycle_employee ALTER COLUMN self_score TYPE numeric,ALTER COLUMN manager_score TYPE numeric,ALTER COLUMN calibrated_score TYPE numeric,ALTER COLUMN final_score TYPE numeric,ALTER COLUMN final_level_code TYPE varchar(64);
ALTER TABLE hr_performance_review_submission ALTER COLUMN computed_score TYPE numeric,ALTER COLUMN computed_score DROP NOT NULL,ALTER COLUMN dimension_scores DROP NOT NULL;
ALTER TABLE hr_performance_calibration_entry ALTER COLUMN before_score TYPE numeric,ALTER COLUMN after_score TYPE numeric,ALTER COLUMN before_score DROP NOT NULL,ALTER COLUMN dimension_scores DROP NOT NULL;
CREATE FUNCTION hr_performance_channel_finite_score(n numeric) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT n IS NULL OR (n::text NOT IN('NaN','Infinity','-Infinity') AND scale(n)<=2) $$;
ALTER TABLE hr_performance_cycle_employee DROP CONSTRAINT ck_hr_perf_employee_result_scores;
ALTER TABLE hr_performance_cycle_employee ADD CONSTRAINT ck_hr_perf_employee_result_scores CHECK(calculation_mode IN('dimension_weighted_v1','five_channel_v1') AND hr_performance_channel_finite_score(self_score) AND hr_performance_channel_finite_score(manager_score) AND hr_performance_channel_finite_score(calibrated_score) AND hr_performance_channel_finite_score(final_score) AND (calculation_mode='five_channel_v1' OR ((self_score IS NULL OR self_score BETWEEN 0 AND 100) AND (manager_score IS NULL OR manager_score BETWEEN 0 AND 100) AND (calibrated_score IS NULL OR calibrated_score BETWEEN 0 AND 100) AND (final_score IS NULL OR final_score BETWEEN 0 AND 100))));
ALTER TABLE hr_performance_review_submission DROP CONSTRAINT ck_hr_perf_submission_scores;
ALTER TABLE hr_performance_review_submission ADD CONSTRAINT ck_hr_perf_submission_scores CHECK(
 (calculation_mode='dimension_weighted_v1' AND computed_score IS NOT NULL AND computed_score BETWEEN 0 AND 100 AND dimension_scores IS NOT NULL AND jsonb_typeof(dimension_scores)='object' AND input_revision_id IS NULL)
 OR (calculation_mode='five_channel_v1' AND dimension_scores IS NULL AND input_revision_id IS NOT NULL AND calculation_evidence IS NOT NULL AND hr_performance_channel_finite_score(computed_score)));
ALTER TABLE hr_performance_calibration_entry DROP CONSTRAINT ck_hr_perf_calibration_scores;
ALTER TABLE hr_performance_calibration_entry ADD CONSTRAINT ck_hr_perf_calibration_scores CHECK(
 (calculation_mode='dimension_weighted_v1' AND before_score IS NOT NULL AND before_score BETWEEN 0 AND 100 AND after_score BETWEEN 0 AND 100 AND dimension_scores IS NOT NULL AND jsonb_typeof(dimension_scores)='object' AND input_revision_id IS NULL)
 OR (calculation_mode='five_channel_v1' AND dimension_scores IS NULL AND input_revision_id IS NOT NULL AND calculation_evidence IS NOT NULL AND hr_performance_channel_finite_score(before_score) AND hr_performance_channel_finite_score(after_score)));

CREATE FUNCTION hr_performance_channel_workflow_valid(p jsonb,d jsonb,publish boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE x jsonb;k text;v jsonb;seen text[]:=ARRAY[]::text[];actor text;fields text[]:=ARRAY['s','m','t','x','c','master','timekeep','bonus','selfAppraisal','appraisal','description','salaryReference'];
BEGIN
 IF NOT public.hr_performance_channel_object_v1(p,ARRAY['schemaVersion','detailDefinitions','masterPolicies','appealReviewAllowed']) OR p->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'detailDefinitions') IS DISTINCT FROM 'array' OR NOT public.hr_performance_channel_config_valid_v1(d) THEN RETURN false;END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p->'detailDefinitions') LOOP
  IF NOT public.hr_performance_channel_object_v1(x,ARRAY['id','itemId']) OR jsonb_typeof(x->'id') IS DISTINCT FROM 'string' OR char_length(x->>'id') NOT BETWEEN 1 AND 128 OR x->>'id'=ANY(seen) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d->'items') a WHERE a->'id'=x->'itemId') THEN RETURN false;END IF;seen:=array_append(seen,x->>'id');
 END LOOP;
 IF NOT public.hr_performance_channel_object_v1(p->'masterPolicies',ARRAY['selfAppraisal','appraisal','description','salaryReference']) OR NOT public.hr_performance_channel_object_v1(p->'appealReviewAllowed',fields) THEN RETURN false;END IF;
 FOR v IN SELECT value FROM jsonb_each(p->'appealReviewAllowed') LOOP IF NOT public.hr_performance_channel_scalar_v1(v,'bool') OR (publish AND v='null'::jsonb) THEN RETURN false;END IF;END LOOP;
 FOR k,v IN SELECT key,value FROM jsonb_each(p->'masterPolicies') LOOP
  IF NOT public.hr_performance_channel_object_v1(v,ARRAY['stage','allowedActors','required','allowExplicitNull']) OR NOT public.hr_performance_channel_policy_v1(v||'{"businessName":null}'::jsonb,false) THEN RETURN false;END IF;
 END LOOP;
 IF publish THEN
  IF cardinality(seen)=0 OR jsonb_array_length(d->'items')=0 OR jsonb_array_length(d->'gradeCandidates')=0 THEN RETURN false;END IF;
  FOR v IN SELECT value FROM jsonb_each(d->'channels') UNION ALL SELECT value FROM jsonb_each(d->'adjustmentPolicy') UNION ALL SELECT value FROM jsonb_each(p->'masterPolicies') LOOP
   actor:=CASE v->>'stage' WHEN 'self_review' THEN 'self' WHEN 'manager_review' THEN 'manager' WHEN 'calibration' THEN 'calibrator' END;
   IF actor IS NULL OR NOT v->'allowedActors' ? actor OR jsonb_typeof(v->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(v->'allowExplicitNull') IS DISTINCT FROM 'boolean' OR (v->'required'='true'::jsonb AND v->'allowExplicitNull'='true'::jsonb) THEN RETURN false;END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_each(d->'adjustmentPolicy') a WHERE a.value->>'inputMode' IS DISTINCT FROM 'manual_with_evidence') THEN RETURN false;END IF;
 END IF;
 RETURN true;
END $$;
CREATE FUNCTION hr_performance_channel_workflow_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v record;par record;d jsonb;n integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'workflow revisions are append-only';END IF;
 IF NOT hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,'hr:performance_template:manage') THEN RAISE EXCEPTION 'workflow revision requires current template management';END IF;
 SELECT * INTO v FROM hr_performance_template_version WHERE(id,tenant_id,park_id)=(NEW.template_version_id,NEW.tenant_id,NEW.park_id);
 SELECT * INTO par FROM hr_performance_template WHERE(id,tenant_id,park_id)=(v.template_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 SELECT * INTO v FROM hr_performance_template_version WHERE(id,tenant_id,park_id)=(NEW.template_version_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 IF v.id IS NULL OR v.status<>'draft' OR v.calculation_mode<>'five_channel_v1' OR par.status='retired' OR par.current_version_no<>v.version_no OR v.channel_definition_revision_id<>NEW.definition_revision_id OR v.channel_workflow_revision_id IS DISTINCT FROM NEW.previous_revision_id THEN RAISE EXCEPTION 'stale workflow definition';END IF;
 SELECT config INTO d FROM hr_performance_channel_definition_revision WHERE id=NEW.definition_revision_id;
 IF NOT hr_performance_channel_workflow_valid(NEW.policy,d,false) THEN RAISE EXCEPTION 'invalid workflow policy';END IF;
 IF NEW.previous_revision_id IS NULL THEN n:=0;ELSE SELECT revision_no INTO n FROM hr_performance_channel_workflow_revision WHERE(id,tenant_id,park_id,template_version_id)=(NEW.previous_revision_id,NEW.tenant_id,NEW.park_id,NEW.template_version_id);END IF;
 IF n IS NULL OR NEW.revision_no<>n+1 THEN RAISE EXCEPTION 'invalid workflow predecessor';END IF;RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_workflow_revision BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_channel_workflow_revision FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_workflow_revision_guard();
CREATE FUNCTION hr_performance_channel_workflow_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM hr_performance_template_version v JOIN hr_performance_channel_workflow_revision r ON r.id=v.channel_workflow_revision_id WHERE(v.id,v.tenant_id,v.park_id)=(NEW.template_version_id,NEW.tenant_id,NEW.park_id) AND r.definition_revision_id=v.channel_definition_revision_id AND r.revision_no=(SELECT max(revision_no) FROM hr_performance_channel_workflow_revision h WHERE(h.template_version_id,h.tenant_id,h.park_id)=(v.id,v.tenant_id,v.park_id))) THEN RAISE EXCEPTION 'workflow head must advance atomically';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_hr_perf_workflow_head AFTER INSERT ON hr_performance_channel_workflow_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_workflow_head_guard();
CREATE FUNCTION hr_performance_channel_policy_for(d jsonb,w jsonb,f text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT CASE WHEN f IN('s','m','t','x','c') THEN d->'channels'->f WHEN f IN('master','timekeep','bonus') THEN d->'adjustmentPolicy'->f ELSE w->'masterPolicies'->f END $$;
CREATE FUNCTION hr_performance_channel_cells(i jsonb) RETURNS TABLE(detail_id text,field text,cell jsonb) LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT a->>'id',c.key,c.value FROM jsonb_array_elements(i->'details') a CROSS JOIN LATERAL jsonb_each(a->'channels') c UNION ALL SELECT NULL,c.key,c.value FROM jsonb_each(i->'adjustments') c UNION ALL SELECT NULL,c.key,c.value FROM jsonb_each(i->'master') c
$$;
CREATE FUNCTION hr_performance_channel_input_valid(i jsonb,w jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE r record;v jsonb;ids text[]:=ARRAY[]::text[];t text;
BEGIN
 IF NOT public.hr_performance_channel_object_v1(i,ARRAY['schemaVersion','details','adjustments','master']) OR i->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(i->'details') IS DISTINCT FROM 'array' OR NOT public.hr_performance_channel_object_v1(i->'adjustments',ARRAY['master','timekeep','bonus']) OR NOT public.hr_performance_channel_object_v1(i->'master',ARRAY['selfAppraisal','appraisal','description','salaryReference']) THEN RETURN false;END IF;
 IF jsonb_array_length(i->'details')<>jsonb_array_length(w->'detailDefinitions') THEN RETURN false;END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(i->'details') LOOP
  IF NOT public.hr_performance_channel_object_v1(v,ARRAY['id','itemId','channels']) OR NOT public.hr_performance_channel_object_v1(v->'channels',ARRAY['s','m','t','x','c']) OR v->>'id'=ANY(ids) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(w->'detailDefinitions') def WHERE def->'id'=v->'id' AND def->'itemId'=v->'itemId') THEN RETURN false;END IF;ids:=array_append(ids,v->>'id');
 END LOOP;
 FOR r IN SELECT * FROM public.hr_performance_channel_cells(i) LOOP
  v:=r.cell;IF NOT public.hr_performance_channel_object_v1(v,ARRAY['state','value','actorUserId','changedAt','evidence']) OR v->>'state' NOT IN('UNPROVIDED','EXPLICIT_NULL','VALUE') OR jsonb_typeof(v->'state')<>'string' THEN RETURN false;END IF;
  IF v->>'state'='UNPROVIDED' THEN IF v IS DISTINCT FROM '{"state":"UNPROVIDED","value":null,"actorUserId":null,"changedAt":null,"evidence":null}'::jsonb THEN RETURN false;END IF;
  ELSE
   IF jsonb_typeof(v->'actorUserId') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'changedAt') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'evidence') IS DISTINCT FROM 'string' OR char_length(v->>'evidence') NOT BETWEEN 2 AND 1000 OR v->>'evidence' !~ '[^[:space:]]' THEN RETURN false;END IF;
   IF v->>'state'='EXPLICIT_NULL' THEN IF v->'value' IS DISTINCT FROM 'null'::jsonb THEN RETURN false;END IF;
   ELSIF r.field IN('selfAppraisal','appraisal','description') THEN IF jsonb_typeof(v->'value') IS DISTINCT FROM 'string' OR char_length(v->>'value')>500 THEN RETURN false;END IF;
   ELSIF r.field='salaryReference' THEN t:=v->>'value';IF jsonb_typeof(v->'value') IS DISTINCT FROM 'string' OR t !~ '^-?[0-9]+([.][0-9]{1,4})?$' OR length(ltrim(split_part(ltrim(t,'-'),'.',1),'0'))>15 THEN RETURN false;END IF;
   ELSE IF v->'value'='null'::jsonb OR NOT public.hr_performance_channel_scalar_v1(v->'value','decimal') THEN RETURN false;END IF;
   END IF;
  END IF;
 END LOOP;RETURN true;
END $$;
CREATE FUNCTION hr_performance_channel_calculate(t jsonb,i jsonb,rid uuid) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE d jsonb;tally numeric;g jsonb;candidate jsonb;complete boolean;
BEGIN
 IF NOT public.hr_performance_channel_input_valid(i,t->'channelWorkflow') THEN RAISE EXCEPTION 'invalid channel input';END IF;
 SELECT NOT EXISTS(SELECT 1 FROM public.hr_performance_channel_cells(i) WHERE field NOT IN('selfAppraisal','appraisal','description','salaryReference') AND cell->>'state'='UNPROVIDED') INTO complete;
 IF complete THEN
  SELECT jsonb_agg(jsonb_build_object('id',a->'id','selfValue',a->'channels'->'s'->'value','mItemValue',a->'channels'->'m'->'value','itemValue',a->'channels'->'t'->'value','xItemValue',a->'channels'->'x'->'value','cItemValue',a->'channels'->'c'->'value') ORDER BY ord) INTO d FROM jsonb_array_elements(i->'details') WITH ORDINALITY x(a,ord);
  tally:=public.hr_performance_five_channel_snapshot_total_v1(t->'channelDefinition'->'weights',COALESCE(d,'[]'::jsonb),jsonb_build_object('masterValue',i->'adjustments'->'master'->'value','timekeepValue',i->'adjustments'->'timekeep'->'value','bonusValue',i->'adjustments'->'bonus'->'value'));
 END IF;
 SELECT public.hr_performance_threshold_snapshot_grade_v1(tally,COALESCE(jsonb_agg(jsonb_build_object('id',a->'id','grade',a->'code','minValue',a->'minValue')),'[]'::jsonb)) INTO g FROM jsonb_array_elements(t->'channelDefinition'->'gradeCandidates') a;
 IF g->>'status'='RESOLVED' THEN SELECT a INTO candidate FROM jsonb_array_elements(t->'channelDefinition'->'gradeCandidates') a WHERE (a->>'minValue')::numeric=(g->>'winningMinValue')::numeric;END IF;
 RETURN jsonb_build_object('schemaVersion',1,'mathVersion','five_channel_v1','inputRevisionId',rid,'complete',complete,'score',tally::text,'grade',g,'gradeCandidate',candidate,'levelCode',candidate->>'code','levelName',candidate->>'code');
END $$;
CREATE FUNCTION hr_performance_channel_stage_complete(t jsonb,i jsonb,stage text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.hr_performance_channel_cells(i) c CROSS JOIN LATERAL(SELECT public.hr_performance_channel_policy_for(t->'channelDefinition',t->'channelWorkflow',c.field) p) x WHERE p->>'stage'=stage AND ((c.field NOT IN('selfAppraisal','appraisal','description','salaryReference') AND c.cell->>'state'='UNPROVIDED') OR (p->'required'='true'::jsonb AND(c.cell->>'state'<>'VALUE' OR(c.field IN('selfAppraisal','appraisal','description') AND c.cell->>'value' !~ '[^[:space:]]'))) OR (c.cell->>'state'='EXPLICIT_NULL' AND p->'allowExplicitNull'<>'true'::jsonb)))
$$;
CREATE FUNCTION hr_performance_channel_final_ready(t jsonb,i jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$ SELECT public.hr_performance_channel_stage_complete(t,i,'self_review') AND public.hr_performance_channel_stage_complete(t,i,'manager_review') AND public.hr_performance_channel_stage_complete(t,i,'calibration') $$;
CREATE FUNCTION hr_performance_channel_input_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ce record;cycle_row record;previous record;c record;old_cell jsonb;p jsonb;role_name text;permission_name text;actor record;changed integer:=0;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'channel input revisions are append-only';END IF;
 IF NEW.created_at<transaction_timestamp()-interval '30 seconds' OR NEW.created_at>clock_timestamp()+interval '1 second' THEN RAISE EXCEPTION 'input revision time must be current';END IF;
 SELECT cycle_id INTO ce FROM hr_performance_cycle_employee WHERE(id,tenant_id,park_id)=(NEW.cycle_employee_id,NEW.tenant_id,NEW.park_id);
 SELECT * INTO cycle_row FROM hr_performance_review_cycle WHERE(id,tenant_id,park_id)=(ce.cycle_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 SELECT * INTO ce FROM hr_performance_cycle_employee WHERE(id,tenant_id,park_id)=(NEW.cycle_employee_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 IF ce.id IS NULL OR ce.calculation_mode<>'five_channel_v1' OR ce.status NOT IN('self_review','manager_review','calibration','appealed') OR ce.current_input_revision_id IS DISTINCT FROM NEW.previous_revision_id OR NOT hr_performance_channel_input_valid(NEW.input,cycle_row.template_snapshot->'channelWorkflow') THEN RAISE EXCEPTION 'invalid or stale channel input revision';END IF;
 SELECT e.* INTO actor FROM hr_employee e WHERE e.tenant_id=NEW.tenant_id AND e.park_id=NEW.park_id AND e.user_id=NEW.created_by AND NOT e.is_deleted ORDER BY e.id LIMIT 1;
 IF NEW.previous_revision_id IS NULL THEN
  IF NOT hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,'hr:performance:manage') THEN RAISE EXCEPTION 'initial input requires cycle management';END IF;
  IF NEW.revision_no<>1 OR EXISTS(SELECT 1 FROM hr_performance_channel_cells(NEW.input) WHERE cell->>'state'<>'UNPROVIDED') THEN RAISE EXCEPTION 'initial input must be unprovided';END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO previous FROM hr_performance_channel_input_revision WHERE(id,tenant_id,park_id,cycle_employee_id)=(NEW.previous_revision_id,NEW.tenant_id,NEW.park_id,NEW.cycle_employee_id);
 IF previous.id IS NULL OR NEW.revision_no<>previous.revision_no+1 THEN RAISE EXCEPTION 'invalid input predecessor';END IF;
 FOR c IN SELECT * FROM hr_performance_channel_cells(NEW.input) LOOP
  SELECT cell INTO old_cell FROM hr_performance_channel_cells(previous.input) prior_cell WHERE prior_cell.detail_id IS NOT DISTINCT FROM c.detail_id AND prior_cell.field=c.field;
  IF c.cell IS NOT DISTINCT FROM old_cell THEN CONTINUE;END IF;changed:=changed+1;
  p:=hr_performance_channel_policy_for(cycle_row.template_snapshot->'channelDefinition',cycle_row.template_snapshot->'channelWorkflow',c.field);
  IF c.cell->>'state'='UNPROVIDED' OR c.cell->>'actorUserId' IS DISTINCT FROM NEW.created_by::text OR (c.cell->>'changedAt')::timestamptz IS DISTINCT FROM NEW.created_at OR (c.cell->>'state'='EXPLICIT_NULL' AND (p->'required'='true'::jsonb OR p->'allowExplicitNull' IS DISTINCT FROM 'true'::jsonb)) THEN RAISE EXCEPTION 'invalid input author or NULL policy';END IF;
  IF ce.status='appealed' THEN
   IF cycle_row.template_snapshot->'channelWorkflow'->'appealReviewAllowed'->c.field IS DISTINCT FROM 'true'::jsonb OR EXISTS(SELECT 1 FROM hr_employee e WHERE(e.id,e.tenant_id,e.park_id)=(ce.employee_id,ce.tenant_id,ce.park_id) AND e.user_id=NEW.created_by) OR NOT EXISTS(SELECT 1 FROM hr_performance_appeal a WHERE(a.cycle_employee_id,a.tenant_id,a.park_id)=(ce.id,ce.tenant_id,ce.park_id) AND a.status='submitted') THEN RAISE EXCEPTION 'appeal field amendment is not allowed';END IF;
  ELSE
   role_name:=CASE ce.status WHEN 'self_review' THEN 'self' WHEN 'manager_review' THEN 'manager' WHEN 'calibration' THEN 'calibrator' END;
   IF p->>'stage' IS DISTINCT FROM ce.status OR NOT p->'allowedActors' ? role_name THEN RAISE EXCEPTION 'field is outside its stage';END IF;
   IF role_name='self' AND actor.id IS DISTINCT FROM ce.employee_id THEN RAISE EXCEPTION 'self field actor mismatch';END IF;
   IF role_name='manager' AND (actor.id=ce.employee_id OR NOT EXISTS(SELECT 1 FROM hr_employee e WHERE(e.id,e.tenant_id,e.park_id)=(ce.employee_id,ce.tenant_id,ce.park_id) AND e.manager_employee_id=actor.id)) THEN RAISE EXCEPTION 'manager field actor mismatch';END IF;
   IF role_name='calibrator' AND (actor.id=ce.employee_id OR NOT EXISTS(SELECT 1 FROM hr_performance_calibration_batch b JOIN hr_performance_calibration_participant p ON(p.batch_id,p.tenant_id,p.park_id)=(b.id,b.tenant_id,b.park_id) WHERE(b.cycle_id,b.tenant_id,b.park_id)=(ce.cycle_id,ce.tenant_id,ce.park_id) AND b.status='active' AND p.participant_user_id=NEW.created_by)) THEN RAISE EXCEPTION 'calibration field actor mismatch';END IF;
  END IF;
  permission_name:=CASE ce.status WHEN 'self_review' THEN 'hr:performance:self_review' WHEN 'manager_review' THEN 'hr:performance:manager_review' WHEN 'calibration' THEN 'hr:performance:calibrate' WHEN 'appealed' THEN 'hr:performance:appeal_review' END;
  IF NOT hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,permission_name) THEN RAISE EXCEPTION 'current performance field permission required';END IF;
  IF c.field='salaryReference' AND NOT(hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,'hr:performance:read') AND hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,'hr:performance:manage') AND hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,'hr:compensation:manage')) THEN RAISE EXCEPTION 'salary reference authority required';END IF;
 END LOOP;
 IF changed=0 THEN RAISE EXCEPTION 'input amendment is empty';END IF;RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_input_revision BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_channel_input_revision FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_input_revision_guard();
CREATE FUNCTION hr_performance_channel_input_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM hr_performance_cycle_employee ce JOIN hr_performance_channel_input_revision r ON r.id=ce.current_input_revision_id WHERE(ce.id,ce.tenant_id,ce.park_id)=(NEW.cycle_employee_id,NEW.tenant_id,NEW.park_id) AND r.revision_no=(SELECT max(revision_no) FROM hr_performance_channel_input_revision h WHERE(h.cycle_employee_id,h.tenant_id,h.park_id)=(ce.id,ce.tenant_id,ce.park_id))) THEN RAISE EXCEPTION 'input head must advance atomically';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_hr_perf_input_head AFTER INSERT ON hr_performance_channel_input_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_input_head_guard();
CREATE FUNCTION hr_performance_channel_actor_has(t varchar,p varchar,u uuid,permission_code text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.sys_user actor JOIN public.rel_user_role ur ON(ur.user_id,ur.tenant_id)=(actor.id,actor.tenant_id)
 JOIN public.sys_role r ON(r.id,r.tenant_id)=(ur.role_id,ur.tenant_id)
 LEFT JOIN public.rel_role_perm rp ON(rp.role_id,rp.tenant_id,rp.park_id)=(r.id,ur.tenant_id,p) AND NOT rp.is_deleted
 LEFT JOIN public.sys_permission perm ON(perm.id,perm.tenant_id)=(rp.permission_id,rp.tenant_id) AND NOT perm.is_deleted AND perm.is_enabled AND perm.status='enabled'
 WHERE actor.tenant_id=t AND actor.id=u AND actor.is_enabled AND NOT actor.is_deleted AND actor.status='enabled' AND NOT ur.is_deleted AND NOT r.is_deleted AND r.is_enabled AND r.status='enabled'
 AND ((r.code='SUPER_ADMIN' AND r.role_scope='platform' AND r.is_super AND r.is_system AND r.is_builtin)
 OR (ur.park_id=p AND(r.role_scope='tenant' OR r.park_id=p) AND(r.is_super OR permission_code IS NULL OR perm.code IN(permission_code,'*')))))
$$;

CREATE OR REPLACE FUNCTION hr_performance_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE dimension_weight numeric; level_count integer; level_invalid boolean; BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'performance template version is immutable'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.calculation_mode='five_channel_v1' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'five-channel definitions are draft only'; END IF;
  RETURN NEW;
 END IF;
 IF (NEW.id,NEW.calculation_mode) IS DISTINCT FROM (OLD.id,OLD.calculation_mode) THEN RAISE EXCEPTION 'performance version identity is immutable'; END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.template_id,NEW.version_no,NEW.version_name,NEW.total_weight,NEW.create_by,NEW.create_time) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.template_id,OLD.version_no,OLD.version_name,OLD.total_weight,OLD.create_by,OLD.create_time) THEN RAISE EXCEPTION 'performance template version identity is immutable'; END IF;
 IF OLD.status='published' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'published performance configuration is immutable'; END IF;
 IF NEW.calculation_mode='five_channel_v1' THEN
  IF NEW.status NOT IN('draft','published') THEN RAISE EXCEPTION 'invalid channel version state';END IF;
  IF NEW.status='published' AND NOT EXISTS(SELECT 1 FROM hr_performance_channel_workflow_revision w JOIN hr_performance_channel_definition_revision d ON d.id=w.definition_revision_id WHERE(w.id,w.tenant_id,w.park_id,w.template_version_id)=(NEW.channel_workflow_revision_id,NEW.tenant_id,NEW.park_id,NEW.id) AND d.id=NEW.channel_definition_revision_id AND hr_performance_channel_workflow_valid(w.policy,d.config,true)) THEN RAISE EXCEPTION 'complete frozen workflow policy required';END IF;
  IF NEW.status='published' AND (NOT has_function_privilege(current_user,'hr_performance_five_channel_snapshot_total_v1(jsonb,jsonb,jsonb)','EXECUTE') OR NOT has_function_privilege(current_user,'hr_performance_threshold_snapshot_grade_v1(numeric,jsonb)','EXECUTE')) THEN RAISE EXCEPTION 'channel calculation execution permission required';END IF;
  IF NEW.channel_definition_revision_id IS DISTINCT FROM OLD.channel_definition_revision_id AND NOT EXISTS(SELECT 1 FROM hr_performance_channel_definition_revision r WHERE (r.id,r.tenant_id,r.park_id,r.template_version_id,r.previous_revision_id)=(NEW.channel_definition_revision_id,NEW.tenant_id,NEW.park_id,NEW.id,OLD.channel_definition_revision_id)) THEN RAISE EXCEPTION 'invalid definition successor'; END IF;
 END IF;
 IF NEW.channel_workflow_revision_id IS DISTINCT FROM OLD.channel_workflow_revision_id AND NOT EXISTS(SELECT 1 FROM hr_performance_channel_workflow_revision w WHERE(w.id,w.tenant_id,w.park_id,w.template_version_id)=(NEW.channel_workflow_revision_id,NEW.tenant_id,NEW.park_id,NEW.id) AND w.previous_revision_id IS NOT DISTINCT FROM OLD.channel_workflow_revision_id AND w.definition_revision_id=NEW.channel_definition_revision_id) THEN RAISE EXCEPTION 'invalid workflow successor';END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF OLD.status<>'draft' OR NEW.status<>'published' OR NEW.published_at IS NULL THEN RAISE EXCEPTION 'invalid performance template transition'; END IF;
  IF NEW.calculation_mode='five_channel_v1' THEN RETURN NEW;END IF;
  SELECT COALESCE(sum(weight),0) INTO dimension_weight FROM hr_performance_template_dimension WHERE tenant_id=OLD.tenant_id AND park_id=OLD.park_id AND template_version_id=OLD.id;
  SELECT count(*) INTO level_count FROM hr_performance_template_level WHERE tenant_id=OLD.tenant_id AND park_id=OLD.park_id AND template_version_id=OLD.id;
  SELECT count(*)=0 OR min(score_min)<>0 OR max(score_max)<>100 OR COALESCE(bool_or(score_max<score_min OR (previous_max IS NOT NULL AND score_min<>previous_max+0.01)),false) INTO level_invalid FROM(SELECT score_min,score_max,lag(score_max)OVER(ORDER BY score_min,score_max,level_code)previous_max FROM hr_performance_template_level WHERE tenant_id=OLD.tenant_id AND park_id=OLD.park_id AND template_version_id=OLD.id)levels;
  IF dimension_weight<>OLD.total_weight OR level_count=0 OR level_invalid THEN RAISE EXCEPTION 'performance template children are incomplete'; END IF;
 END IF;
 RETURN NEW;END $$;

CREATE OR REPLACE FUNCTION hr_performance_channel_cycle_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v record;d jsonb;w record;
BEGIN
 SELECT * INTO v FROM hr_performance_template_version WHERE(id,tenant_id,park_id)=(NEW.template_version_id,NEW.tenant_id,NEW.park_id) FOR SHARE;
 IF v.calculation_mode='five_channel_v1' THEN
  IF TG_OP='INSERT' AND(NEW.status<>'planning' OR NEW.published_at IS NOT NULL) THEN RAISE EXCEPTION 'channel cycle must start in unpublished planning';END IF;
  SELECT config INTO d FROM hr_performance_channel_definition_revision WHERE id=v.channel_definition_revision_id;
  SELECT * INTO w FROM hr_performance_channel_workflow_revision WHERE id=v.channel_workflow_revision_id;
  IF v.status<>'published' OR NOT hr_performance_channel_workflow_valid(w.policy,d,true) OR NEW.template_snapshot->>'calculationMode' IS DISTINCT FROM 'five_channel_v1' OR NEW.template_snapshot->>'currentRevisionId' IS DISTINCT FROM v.channel_definition_revision_id::text OR NEW.template_snapshot->>'workflowRevisionId' IS DISTINCT FROM v.channel_workflow_revision_id::text OR NEW.template_snapshot->'channelDefinition' IS DISTINCT FROM d OR NEW.template_snapshot->'channelWorkflow' IS DISTINCT FROM w.policy THEN RAISE EXCEPTION 'channel cycle must freeze exact published revisions';END IF;
 ELSIF NEW.template_snapshot ? 'calculationMode' AND NEW.template_snapshot->>'calculationMode' IS DISTINCT FROM 'dimension_weighted_v1' THEN RAISE EXCEPTION 'invalid frozen mode';END IF;
 IF v.calculation_mode='five_channel_v1' AND TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
  IF NOT EXISTS(SELECT 1 FROM hr_performance_cycle_employee e WHERE(e.cycle_id,e.tenant_id,e.park_id)=(NEW.id,NEW.tenant_id,NEW.park_id)) OR EXISTS(SELECT 1 FROM hr_performance_cycle_employee e WHERE(e.cycle_id,e.tenant_id,e.park_id)=(NEW.id,NEW.tenant_id,NEW.park_id) AND ((NEW.status='manager_review' AND e.status='self_review') OR(NEW.status='calibration' AND e.status IN('self_review','manager_review')) OR(NEW.status='employee_acknowledged' AND e.status IN('self_review','manager_review','calibration')) OR(NEW.status='confirmed' AND e.status<>'confirmed'))) THEN RAISE EXCEPTION 'channel cycle stage requires employee evidence';END IF;
 END IF;
 IF TG_OP='UPDATE' AND(NEW.correction_reason,NEW.business_period_ref,NEW.selected_employee_ids,NEW.predecessor_review_ids) IS DISTINCT FROM(OLD.correction_reason,OLD.business_period_ref,OLD.selected_employee_ids,OLD.predecessor_review_ids) THEN RAISE EXCEPTION 'correction identity is immutable';END IF;
 IF NEW.predecessor_review_ids IS NOT NULL THEN
  IF jsonb_typeof(NEW.predecessor_review_ids)<>'array' OR jsonb_typeof(NEW.selected_employee_ids) IS DISTINCT FROM 'array' OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(NEW.predecessor_review_ids))<>jsonb_array_length(NEW.predecessor_review_ids) OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(NEW.selected_employee_ids))<>jsonb_array_length(NEW.selected_employee_ids) OR jsonb_array_length(NEW.predecessor_review_ids)=0 OR jsonb_array_length(NEW.predecessor_review_ids)<>jsonb_array_length(NEW.selected_employee_ids) OR NEW.correction_reason IS NULL OR length(btrim(NEW.correction_reason))<2 OR NEW.business_period_ref IS NULL OR length(btrim(NEW.business_period_ref))=0 THEN RAISE EXCEPTION 'explicit correction identity required';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.predecessor_review_ids) ids(id) WHERE NOT EXISTS(SELECT 1 FROM hr_performance_cycle_employee ce WHERE(ce.id,ce.tenant_id,ce.park_id)=(ids.id::uuid,NEW.tenant_id,NEW.park_id) AND ce.status='confirmed' AND NEW.selected_employee_ids ? ce.employee_id::text)) THEN RAISE EXCEPTION 'confirmed correction predecessor required';END IF;
 ELSIF NEW.selected_employee_ids IS NOT NULL OR NEW.correction_reason IS NOT NULL OR NEW.business_period_ref IS NOT NULL THEN RAISE EXCEPTION 'incomplete correction identity';END IF;RETURN NEW;
END $$;

CREATE FUNCTION hr_performance_channel_employee_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c record;r record;
BEGIN
 SELECT * INTO c FROM hr_performance_review_cycle WHERE(id,tenant_id,park_id)=(NEW.cycle_id,NEW.tenant_id,NEW.park_id) FOR SHARE;
 IF NEW.calculation_mode IS DISTINCT FROM COALESCE(c.template_snapshot->>'calculationMode','dimension_weighted_v1') THEN RAISE EXCEPTION 'employee mode must match frozen cycle';END IF;
 IF TG_OP='INSERT' AND NEW.calculation_mode='five_channel_v1' AND(NEW.status NOT IN('planning','self_review') OR num_nonnulls(NEW.self_score,NEW.manager_score,NEW.calibrated_score,NEW.final_score,NEW.final_level_code,NEW.final_level_name,NEW.result_finalized_at,NEW.acknowledged_at,NEW.confirmed_at,NEW.current_input_revision_id,NEW.final_input_revision_id,NEW.final_grade_evidence)>0) THEN RAISE EXCEPTION 'channel employee must start without score or result evidence';END IF;
 IF TG_OP='INSERT' AND c.selected_employee_ids IS NOT NULL AND (NOT c.selected_employee_ids ? NEW.employee_id::text OR NEW.predecessor_review_id IS NULL OR NOT c.predecessor_review_ids ? NEW.predecessor_review_id::text OR NOT EXISTS(SELECT 1 FROM hr_performance_cycle_employee p WHERE(p.id,p.tenant_id,p.park_id,p.employee_id)=(NEW.predecessor_review_id,NEW.tenant_id,NEW.park_id,NEW.employee_id) AND p.status='confirmed')) THEN RAISE EXCEPTION 'employee is outside explicit correction selection';END IF;
 IF c.selected_employee_ids IS NULL AND NEW.predecessor_review_id IS NOT NULL THEN RAISE EXCEPTION 'predecessor requires correction cycle';END IF;
 IF TG_OP='UPDATE' THEN
  IF(NEW.calculation_mode,NEW.predecessor_review_id) IS DISTINCT FROM(OLD.calculation_mode,OLD.predecessor_review_id) THEN RAISE EXCEPTION 'employee mode/correction identity is immutable';END IF;
  IF NEW.current_input_revision_id IS DISTINCT FROM OLD.current_input_revision_id THEN
   SELECT * INTO r FROM hr_performance_channel_input_revision WHERE(id,tenant_id,park_id,cycle_employee_id)=(NEW.current_input_revision_id,NEW.tenant_id,NEW.park_id,NEW.id);
   IF r.id IS NULL OR r.previous_revision_id IS DISTINCT FROM OLD.current_input_revision_id THEN RAISE EXCEPTION 'invalid input successor';END IF;
  END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_channel_employee BEFORE INSERT OR UPDATE ON hr_performance_cycle_employee FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_employee_guard();

CREATE OR REPLACE FUNCTION hr_performance_submission_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE ce record; cycle_snapshot jsonb; expected numeric; channel_review record;channel_input jsonb;channel_result jsonb;channel_actor uuid; BEGIN
 SELECT x.*,c.template_snapshot INTO channel_review FROM hr_performance_cycle_employee x JOIN hr_performance_review_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) WHERE(x.id,x.tenant_id,x.park_id)=(NEW.cycle_employee_id,NEW.tenant_id,NEW.park_id) FOR UPDATE OF x,c;
 IF NEW.calculation_mode IS DISTINCT FROM channel_review.calculation_mode THEN RAISE EXCEPTION 'submission mode mismatch';END IF;
 IF channel_review.calculation_mode='five_channel_v1' THEN
  IF channel_review.status IS DISTINCT FROM (CASE NEW.submission_type WHEN 'self' THEN 'self_review' WHEN 'manager' THEN 'manager_review' END) OR NEW.input_revision_id IS DISTINCT FROM channel_review.current_input_revision_id THEN RAISE EXCEPTION 'submission input/stage mismatch';END IF;
  SELECT id INTO channel_actor FROM hr_employee WHERE(tenant_id,park_id,user_id)=(NEW.tenant_id,NEW.park_id,NEW.actor_user_id) AND NOT is_deleted ORDER BY id LIMIT 1;
  IF NEW.actor_employee_id IS DISTINCT FROM channel_actor OR NOT hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.actor_user_id,CASE NEW.submission_type WHEN 'self' THEN 'hr:performance:self_review' ELSE 'hr:performance:manager_review' END) OR (NEW.submission_type='self' AND channel_actor IS DISTINCT FROM channel_review.employee_id) OR (NEW.submission_type='manager' AND (channel_actor IS NULL OR channel_actor=channel_review.employee_id OR NOT EXISTS(SELECT 1 FROM hr_employee e WHERE e.id=channel_review.employee_id AND e.manager_employee_id=channel_actor))) THEN RAISE EXCEPTION 'submission actor mismatch';END IF;
  SELECT input INTO channel_input FROM hr_performance_channel_input_revision WHERE(id,tenant_id,park_id,cycle_employee_id)=(NEW.input_revision_id,NEW.tenant_id,NEW.park_id,NEW.cycle_employee_id);
  IF NOT hr_performance_channel_stage_complete(channel_review.template_snapshot,channel_input,channel_review.status) THEN RAISE EXCEPTION 'stage input is incomplete';END IF;
  channel_result:=hr_performance_channel_calculate(channel_review.template_snapshot,channel_input,NEW.input_revision_id);
  IF NEW.computed_score IS DISTINCT FROM(channel_result->>'score')::numeric OR NEW.calculation_evidence IS DISTINCT FROM channel_result THEN RAISE EXCEPTION 'channel submission evidence mismatch';END IF;RETURN NEW;
 END IF;


 SELECT x.*,c.template_snapshot INTO ce FROM hr_performance_cycle_employee x JOIN hr_performance_review_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) WHERE x.id=NEW.cycle_employee_id AND x.tenant_id=NEW.tenant_id AND x.park_id=NEW.park_id FOR UPDATE OF x,c;
 IF ce.id IS NULL OR (NEW.submission_type='self' AND ce.status<>'self_review') OR (NEW.submission_type='manager' AND ce.status<>'manager_review') THEN RAISE EXCEPTION 'performance submission is outside its stage'; END IF;
 expected:=hr_performance_snapshot_score(ce.template_snapshot,NEW.dimension_scores);
 IF NEW.computed_score<>expected THEN RAISE EXCEPTION 'performance submission score is not reproducible'; END IF;
 RETURN NEW;END $$;

CREATE OR REPLACE FUNCTION hr_performance_calibration_entry_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE batch_row record;ce record;expected_before numeric;expected_after numeric; channel_review record;channel_input jsonb;channel_result jsonb;channel_before numeric; BEGIN
 SELECT x.*,c.template_snapshot INTO channel_review FROM hr_performance_cycle_employee x JOIN hr_performance_review_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) WHERE(x.id,x.tenant_id,x.park_id)=(NEW.cycle_employee_id,NEW.tenant_id,NEW.park_id) FOR UPDATE OF x,c;
 IF NEW.calculation_mode IS DISTINCT FROM channel_review.calculation_mode THEN RAISE EXCEPTION 'calibration mode mismatch';END IF;
 IF channel_review.calculation_mode='five_channel_v1' THEN
  IF channel_review.status<>'calibration' OR NEW.input_revision_id IS DISTINCT FROM channel_review.current_input_revision_id OR NOT hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.actor_user_id,'hr:performance:calibrate') OR EXISTS(SELECT 1 FROM hr_employee e WHERE e.id=channel_review.employee_id AND e.user_id=NEW.actor_user_id) OR NOT EXISTS(SELECT 1 FROM hr_performance_calibration_batch b JOIN hr_performance_calibration_participant p ON(p.batch_id,p.tenant_id,p.park_id)=(b.id,b.tenant_id,b.park_id) WHERE(b.id,b.tenant_id,b.park_id,b.cycle_id)=(NEW.batch_id,NEW.tenant_id,NEW.park_id,channel_review.cycle_id) AND b.status='active' AND p.participant_user_id=NEW.actor_user_id) THEN RAISE EXCEPTION 'calibration input/actor/batch mismatch';END IF;
  SELECT input INTO channel_input FROM hr_performance_channel_input_revision WHERE id=NEW.input_revision_id;
  channel_result:=hr_performance_channel_calculate(channel_review.template_snapshot,channel_input,NEW.input_revision_id);
  channel_before:=COALESCE(channel_review.calibrated_score,channel_review.manager_score);
  IF NOT hr_performance_channel_final_ready(channel_review.template_snapshot,channel_input) OR channel_result->'complete' IS DISTINCT FROM 'true'::jsonb OR channel_result->'grade'->>'status' IS DISTINCT FROM 'RESOLVED' OR NEW.before_score IS DISTINCT FROM channel_before OR NEW.after_score IS DISTINCT FROM(channel_result->>'score')::numeric OR NEW.calculation_evidence IS DISTINCT FROM channel_result THEN RAISE EXCEPTION 'calibration requires complete unique result evidence';END IF;RETURN NEW;
 END IF;


 SELECT * INTO batch_row FROM hr_performance_calibration_batch WHERE id=NEW.batch_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id FOR UPDATE;
 SELECT x.*,c.template_snapshot INTO ce FROM hr_performance_cycle_employee x JOIN hr_performance_review_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) WHERE x.id=NEW.cycle_employee_id AND x.tenant_id=NEW.tenant_id AND x.park_id=NEW.park_id FOR UPDATE OF x,c;
 IF batch_row.id IS NULL OR batch_row.status<>'active' OR ce.id IS NULL OR ce.cycle_id<>batch_row.cycle_id OR ce.status<>'calibration' THEN RAISE EXCEPTION 'calibration entry is outside its active batch';END IF;
 SELECT COALESCE((SELECT after_score FROM hr_performance_calibration_entry WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND batch_id=NEW.batch_id AND cycle_employee_id=NEW.cycle_employee_id ORDER BY entry_no DESC LIMIT 1),ce.manager_score) INTO expected_before;
 expected_after:=hr_performance_snapshot_score(ce.template_snapshot,NEW.dimension_scores);
 IF expected_before IS NULL OR NEW.before_score<>expected_before OR NEW.after_score<>expected_after THEN RAISE EXCEPTION 'calibration adjustment is not reproducible';END IF;
 RETURN NEW;END $$;

CREATE OR REPLACE FUNCTION hr_performance_cycle_employee_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE template jsonb; scores jsonb; expected numeric; expected_level record; channel_template jsonb;channel_input jsonb;channel_result jsonb;channel_action record;channel_sub record; BEGIN
 IF OLD.calculation_mode='five_channel_v1' THEN
  IF OLD.status='confirmed' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'confirmed performance result is immutable';END IF;
  SELECT template_snapshot INTO channel_template FROM hr_performance_review_cycle WHERE(id,tenant_id,park_id)=(NEW.cycle_id,NEW.tenant_id,NEW.park_id) FOR SHARE;
  IF NEW.self_score IS DISTINCT FROM OLD.self_score OR (OLD.status='self_review' AND NEW.status='manager_review') THEN
   SELECT * INTO channel_sub FROM hr_performance_review_submission WHERE(tenant_id,park_id,cycle_employee_id)=(NEW.tenant_id,NEW.park_id,NEW.id) AND submission_type='self' ORDER BY submission_no DESC LIMIT 1;
   IF channel_sub.id IS NULL OR NEW.self_score IS DISTINCT FROM channel_sub.computed_score THEN RAISE EXCEPTION 'self score requires submission evidence';END IF;
  END IF;
  IF NEW.manager_score IS DISTINCT FROM OLD.manager_score OR(OLD.status='manager_review' AND NEW.status='calibration') THEN
   SELECT * INTO channel_sub FROM hr_performance_review_submission WHERE(tenant_id,park_id,cycle_employee_id)=(NEW.tenant_id,NEW.park_id,NEW.id) AND submission_type='manager' ORDER BY submission_no DESC LIMIT 1;
   IF channel_sub.id IS NULL OR NEW.manager_score IS DISTINCT FROM channel_sub.computed_score THEN RAISE EXCEPTION 'manager score requires submission evidence';END IF;
  END IF;
  IF NEW.calibrated_score IS DISTINCT FROM OLD.calibrated_score AND NEW.status='calibration' AND NOT EXISTS(SELECT 1 FROM hr_performance_calibration_entry e WHERE(e.cycle_employee_id,e.tenant_id,e.park_id)=(NEW.id,NEW.tenant_id,NEW.park_id) AND e.input_revision_id=NEW.current_input_revision_id AND e.after_score IS NOT DISTINCT FROM NEW.calibrated_score) THEN RAISE EXCEPTION 'calibrated score requires current entry evidence';END IF;
  IF OLD.status='calibration' AND NEW.status='employee_acknowledged' AND NEW.calibrated_score IS DISTINCT FROM NEW.final_score THEN RAISE EXCEPTION 'final calibration score mismatch';END IF;
  IF NEW.status IN('self_review','manager_review','calibration') AND (NEW.final_score IS NOT NULL OR NEW.final_input_revision_id IS NOT NULL OR NEW.final_grade_evidence IS NOT NULL) THEN RAISE EXCEPTION 'channel result cannot finalize early';END IF;
  IF OLD.status='employee_acknowledged' AND NEW.status IN('appealed','confirmed') THEN
   SELECT * INTO channel_action FROM hr_performance_review_action WHERE(tenant_id,park_id,cycle_employee_id)=(NEW.tenant_id,NEW.park_id,NEW.id) AND action_type=CASE NEW.status WHEN 'appealed' THEN 'appealed' ELSE 'acknowledged' END ORDER BY action_no DESC LIMIT 1;
   IF channel_action.id IS NULL OR (NEW.status='confirmed' AND(NEW.acknowledged_at IS NULL OR NEW.confirmed_at IS NULL)) THEN RAISE EXCEPTION 'employee acknowledgement/appeal evidence required';END IF;
  END IF;
  IF NEW.status IN('employee_acknowledged','appealed','confirmed') THEN
   IF NEW.final_input_revision_id IS NULL OR NEW.final_score IS NULL OR NEW.final_grade_evidence IS NULL THEN RAISE EXCEPTION 'channel final evidence is required';END IF;
   SELECT input INTO channel_input FROM hr_performance_channel_input_revision WHERE(id,tenant_id,park_id,cycle_employee_id)=(NEW.final_input_revision_id,NEW.tenant_id,NEW.park_id,NEW.id);
   channel_result:=hr_performance_channel_calculate(channel_template,channel_input,NEW.final_input_revision_id);
   IF NOT hr_performance_channel_final_ready(channel_template,channel_input) OR channel_result->'complete' IS DISTINCT FROM 'true'::jsonb OR channel_result->'grade'->>'status' IS DISTINCT FROM 'RESOLVED' OR NEW.final_score IS DISTINCT FROM(channel_result->>'score')::numeric OR NEW.final_level_code IS DISTINCT FROM channel_result->>'levelCode' OR NEW.final_level_name IS DISTINCT FROM channel_result->>'levelName' OR NEW.final_grade_evidence IS DISTINCT FROM channel_result THEN RAISE EXCEPTION 'channel final result is not reproducible';END IF;
   IF OLD.status='calibration' OR (OLD.status='appealed' AND NEW.status='confirmed') THEN
    SELECT * INTO channel_action FROM hr_performance_review_action WHERE(tenant_id,park_id,cycle_employee_id)=(NEW.tenant_id,NEW.park_id,NEW.id) AND action_type IN('result_finalized','appeal_upheld','appeal_rejected') ORDER BY action_no DESC LIMIT 1;
    IF channel_action.id IS NULL OR channel_action.input_revision_id IS DISTINCT FROM NEW.final_input_revision_id OR channel_action.result_snapshot IS DISTINCT FROM channel_result OR channel_action.actor_user_id IS NULL OR EXISTS(SELECT 1 FROM hr_employee e WHERE e.id=NEW.employee_id AND e.user_id=channel_action.actor_user_id) THEN RAISE EXCEPTION 'channel final action evidence required';END IF;
    IF NOT hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,channel_action.actor_user_id,CASE WHEN OLD.status='appealed' THEN 'hr:performance:appeal_review' ELSE 'hr:performance:calibrate' END) THEN RAISE EXCEPTION 'channel final permission required';END IF;
    IF channel_action.action_type='appeal_rejected' AND(NEW.final_input_revision_id,NEW.final_score,NEW.final_grade_evidence) IS DISTINCT FROM(OLD.final_input_revision_id,OLD.final_score,OLD.final_grade_evidence) THEN RAISE EXCEPTION 'rejected appeal must preserve result';END IF;
   ELSIF(NEW.final_input_revision_id,NEW.final_score,NEW.final_grade_evidence,NEW.final_level_code,NEW.final_level_name) IS DISTINCT FROM(OLD.final_input_revision_id,OLD.final_score,OLD.final_grade_evidence,OLD.final_level_code,OLD.final_level_name) THEN RAISE EXCEPTION 'result amendment requires calibration or appeal decision';END IF;
  END IF;
  RETURN NEW;
 END IF;


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
 RETURN NEW;END $$;
CREATE FUNCTION hr_performance_channel_action_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ce record;i jsonb;result jsonb;expected_permission text;employee_user uuid;
BEGIN
 SELECT x.*,c.template_snapshot INTO ce FROM hr_performance_cycle_employee x JOIN hr_performance_review_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) WHERE(x.id,x.tenant_id,x.park_id)=(NEW.cycle_employee_id,NEW.tenant_id,NEW.park_id) FOR UPDATE OF x,c;
 IF ce.calculation_mode<>'five_channel_v1' THEN RETURN NEW;END IF;
 IF NEW.action_type='baseline' THEN IF NEW.input_revision_id IS NOT NULL OR NEW.result_snapshot<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid channel baseline';END IF;RETURN NEW;END IF;
 IF NEW.actor_user_id IS NULL OR NEW.from_status IS DISTINCT FROM ce.status THEN RAISE EXCEPTION 'channel action actor/stage mismatch';END IF;
 SELECT user_id INTO employee_user FROM hr_employee WHERE(id,tenant_id,park_id)=(ce.employee_id,ce.tenant_id,ce.park_id);
 expected_permission:=CASE NEW.action_type WHEN 'self_submitted' THEN 'hr:performance:self_review' WHEN 'manager_submitted' THEN 'hr:performance:manager_review' WHEN 'calibration_adjusted' THEN 'hr:performance:calibrate' WHEN 'result_finalized' THEN 'hr:performance:calibrate' WHEN 'acknowledged' THEN 'hr:performance:acknowledge' WHEN 'appealed' THEN 'hr:performance:appeal' WHEN 'appeal_upheld' THEN 'hr:performance:appeal_review' WHEN 'appeal_rejected' THEN 'hr:performance:appeal_review' END;
 IF expected_permission IS NULL OR NOT hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.actor_user_id,expected_permission) THEN RAISE EXCEPTION 'channel action permission required';END IF;
 IF NEW.action_type IN('acknowledged','appealed','self_submitted') AND NEW.actor_user_id IS DISTINCT FROM employee_user THEN RAISE EXCEPTION 'employee action actor mismatch';END IF;
 IF NEW.action_type IN('calibration_adjusted','result_finalized','appeal_upheld','appeal_rejected') AND NEW.actor_user_id=employee_user THEN RAISE EXCEPTION 'self finalization is not allowed';END IF;
 IF NEW.action_type IN('self_submitted','manager_submitted','calibration_adjusted','result_finalized','appeal_upheld','appeal_rejected') THEN
  IF NEW.input_revision_id IS NULL OR(NEW.action_type<>'appeal_rejected' AND NEW.input_revision_id IS DISTINCT FROM ce.current_input_revision_id) THEN RAISE EXCEPTION 'action input revision mismatch';END IF;
  SELECT input INTO i FROM hr_performance_channel_input_revision WHERE(id,tenant_id,park_id,cycle_employee_id)=(NEW.input_revision_id,NEW.tenant_id,NEW.park_id,NEW.cycle_employee_id);
  result:=hr_performance_channel_calculate(ce.template_snapshot,i,NEW.input_revision_id);
  IF NEW.result_snapshot IS DISTINCT FROM result THEN RAISE EXCEPTION 'action calculation evidence mismatch';END IF;
  IF NEW.action_type IN('result_finalized','appeal_upheld','appeal_rejected') AND(NOT hr_performance_channel_final_ready(ce.template_snapshot,i) OR result->'complete' IS DISTINCT FROM 'true'::jsonb OR result->'grade'->>'status' IS DISTINCT FROM 'RESOLVED') THEN RAISE EXCEPTION 'final action requires complete unique result';END IF;
 END IF;
 IF NEW.action_type IN('calibration_adjusted','result_finalized') AND NOT EXISTS(SELECT 1 FROM hr_performance_calibration_batch b JOIN hr_performance_calibration_participant p ON(p.batch_id,p.tenant_id,p.park_id)=(b.id,b.tenant_id,b.park_id) WHERE(b.cycle_id,b.tenant_id,b.park_id)=(ce.cycle_id,ce.tenant_id,ce.park_id) AND b.status='active' AND p.participant_user_id=NEW.actor_user_id) THEN RAISE EXCEPTION 'active calibration participation required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_channel_action BEFORE INSERT ON hr_performance_review_action FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_action_guard();

CREATE FUNCTION hr_performance_channel_version_pair_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.channel_workflow_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_performance_template_version v JOIN hr_performance_channel_workflow_revision w ON w.id=v.channel_workflow_revision_id WHERE(v.id,v.tenant_id,v.park_id)=(NEW.id,NEW.tenant_id,NEW.park_id) AND w.definition_revision_id=v.channel_definition_revision_id) THEN RAISE EXCEPTION 'definition and workflow revisions must advance together';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_hr_perf_version_workflow_pair AFTER INSERT OR UPDATE ON hr_performance_template_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_version_pair_guard();
REVOKE ALL ON FUNCTION hr_performance_channel_version_pair_guard() FROM PUBLIC;
CREATE FUNCTION hr_performance_channel_batch_complete_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status AND EXISTS(SELECT 1 FROM hr_performance_review_cycle c WHERE(c.id,c.tenant_id,c.park_id)=(NEW.cycle_id,NEW.tenant_id,NEW.park_id) AND c.template_snapshot->>'calculationMode'='five_channel_v1') AND EXISTS(SELECT 1 FROM hr_performance_cycle_employee e WHERE(e.cycle_id,e.tenant_id,e.park_id)=(NEW.cycle_id,NEW.tenant_id,NEW.park_id) AND e.status='calibration') THEN RAISE EXCEPTION 'pending channel employees keep the batch active';END IF;RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_channel_batch_complete BEFORE UPDATE ON hr_performance_calibration_batch FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_batch_complete_guard();
CREATE FUNCTION hr_performance_channel_appeal_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ce record;a record;
BEGIN
 SELECT * INTO ce FROM hr_performance_cycle_employee WHERE(id,tenant_id,park_id)=(NEW.cycle_employee_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 IF ce.calculation_mode='five_channel_v1' THEN
  SELECT * INTO a FROM hr_performance_review_action WHERE(cycle_employee_id,tenant_id,park_id)=(ce.id,ce.tenant_id,ce.park_id) AND reference_id=NEW.id AND action_type=CASE NEW.status WHEN 'upheld' THEN 'appeal_upheld' ELSE 'appeal_rejected' END ORDER BY action_no DESC LIMIT 1;
  IF ce.status<>'appealed' OR a.id IS NULL OR a.actor_user_id IS DISTINCT FROM NEW.resolved_by THEN RAISE EXCEPTION 'appeal decision requires exact action evidence';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_channel_appeal_decision BEFORE UPDATE ON hr_performance_appeal FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_appeal_decision_guard();
REVOKE ALL ON FUNCTION hr_performance_channel_batch_complete_guard(),hr_performance_channel_appeal_decision_guard() FROM PUBLIC;

CREATE FUNCTION hr_performance_channel_author_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field text;u uuid;old_u text;
BEGIN
 FOREACH field IN ARRAY TG_ARGV LOOP
  u:=(to_jsonb(NEW)->>field)::uuid;
  IF u IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM sys_user WHERE id=u AND tenant_id=NEW.tenant_id) THEN RAISE EXCEPTION 'performance author must belong to the same tenant';END IF;
   old_u:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>field ELSE NULL END;
   IF TG_OP='INSERT' AND TG_TABLE_NAME='hr_performance_channel_definition_revision' AND NOT hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,u,'hr:performance_template:manage') THEN RAISE EXCEPTION 'definition revision requires current template management';END IF;
   IF(TG_OP='INSERT' OR u::text IS DISTINCT FROM old_u) AND NOT hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,u,NULL) THEN RAISE EXCEPTION 'performance author lacks active selected-park authorization';END IF;
  END IF;
 END LOOP;RETURN NEW;
END $$;
DO $$
DECLARE r record;tbl text;field text;fields text[];
BEGIN
 -- Only the formal performance actor references listed in the review inventory.
 FOR r IN SELECT c.conname,cl.relname,a.attname FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[cardinality(c.conkey)] WHERE c.contype='f' AND c.confrelid='sys_user'::regclass AND cl.relname IN('hr_performance_channel_definition_revision','hr_performance_channel_workflow_revision','hr_performance_channel_input_revision','hr_performance_review_submission','hr_performance_calibration_batch','hr_performance_calibration_participant','hr_performance_calibration_entry','hr_performance_appeal','hr_performance_review_action') LOOP
  EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',r.relname,r.conname);
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(%I) REFERENCES sys_user(id)',r.relname,r.conname,r.attname);
 END LOOP;
 FOR tbl,fields IN SELECT * FROM(VALUES
 ('hr_performance_template',ARRAY['create_by','update_by']),('hr_performance_template_version',ARRAY['create_by']),
 ('hr_performance_channel_definition_revision',ARRAY['created_by']),('hr_performance_channel_workflow_revision',ARRAY['created_by']),('hr_performance_channel_input_revision',ARRAY['created_by']),
 ('hr_performance_review_cycle',ARRAY['create_by','update_by']),('hr_performance_evidence_reference',ARRAY['create_by']),
 ('hr_performance_review_submission',ARRAY['actor_user_id']),('hr_performance_calibration_batch',ARRAY['created_by','completed_by']),('hr_performance_calibration_participant',ARRAY['participant_user_id']),
 ('hr_performance_calibration_entry',ARRAY['actor_user_id']),('hr_performance_appeal',ARRAY['submitted_by','resolved_by']),('hr_performance_review_action',ARRAY['actor_user_id']))list(tbl,fields) LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_author_scope_guard(%s)',left('trg_hr_actor_'||tbl,63),tbl,(SELECT string_agg(quote_literal(x),',') FROM unnest(fields)x));
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION hr_performance_channel_author_scope_guard() FROM PUBLIC;
DO $$ BEGIN
 IF NOT has_function_privilege(current_user,'hr_performance_five_channel_snapshot_total_v1(jsonb,jsonb,jsonb)','EXECUTE') OR NOT has_function_privilege(current_user,'hr_performance_threshold_snapshot_grade_v1(numeric,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'migration connection lacks existing channel math execution permission';END IF;
END $$;
REVOKE ALL ON hr_performance_channel_workflow_revision,hr_performance_channel_input_revision FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_channel_final_ready(jsonb,jsonb),hr_performance_channel_finite_score(numeric),hr_performance_channel_workflow_valid(jsonb,jsonb,boolean),hr_performance_channel_workflow_revision_guard(),hr_performance_channel_workflow_head_guard(),hr_performance_channel_policy_for(jsonb,jsonb,text),hr_performance_channel_cells(jsonb),hr_performance_channel_input_valid(jsonb,jsonb),hr_performance_channel_calculate(jsonb,jsonb,uuid),hr_performance_channel_stage_complete(jsonb,jsonb,text),hr_performance_channel_input_revision_guard(),hr_performance_channel_input_head_guard(),hr_performance_channel_actor_has(varchar,varchar,uuid,text),hr_performance_channel_employee_guard(),hr_performance_channel_action_guard() FROM PUBLIC;
COMMIT;
