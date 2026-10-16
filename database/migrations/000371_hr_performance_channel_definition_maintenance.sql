BEGIN;
ALTER TABLE hr_performance_template_version ADD COLUMN calculation_mode text NOT NULL DEFAULT 'dimension_weighted_v1', ADD COLUMN channel_definition_revision_id uuid;
ALTER TABLE hr_performance_template_version ALTER COLUMN total_weight DROP NOT NULL;
ALTER TABLE hr_performance_template_version DROP CONSTRAINT ck_hr_perf_template_weight;
ALTER TABLE hr_performance_template_version ADD CONSTRAINT ck_hr_perf_template_mode CHECK (
 (calculation_mode='dimension_weighted_v1' AND total_weight IS NOT NULL AND total_weight=1 AND channel_definition_revision_id IS NULL)
 OR (calculation_mode='five_channel_v1' AND total_weight IS NULL AND channel_definition_revision_id IS NOT NULL AND status='draft' AND published_at IS NULL));
CREATE TABLE hr_performance_channel_definition_revision (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 template_version_id uuid NOT NULL, revision_no integer NOT NULL CHECK(revision_no>0), config jsonb NOT NULL,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), previous_revision_id uuid,
 UNIQUE(id,tenant_id,park_id,template_version_id), UNIQUE(tenant_id,park_id,template_version_id,revision_no), UNIQUE(previous_revision_id),
 FOREIGN KEY(template_version_id,tenant_id,park_id) REFERENCES hr_performance_template_version(id,tenant_id,park_id),
 FOREIGN KEY(previous_revision_id,tenant_id,park_id,template_version_id) REFERENCES hr_performance_channel_definition_revision(id,tenant_id,park_id,template_version_id),
 FOREIGN KEY(tenant_id,park_id,created_by) REFERENCES sys_user(tenant_id,park_id,id),
 CHECK((revision_no=1 AND previous_revision_id IS NULL) OR (revision_no>1 AND previous_revision_id IS NOT NULL))
);
ALTER TABLE hr_performance_template_version ADD CONSTRAINT fk_hr_perf_channel_current FOREIGN KEY(channel_definition_revision_id,tenant_id,park_id,id)
 REFERENCES hr_performance_channel_definition_revision(id,tenant_id,park_id,template_version_id) DEFERRABLE INITIALLY DEFERRED;

-- All shape/type failures fail closed, including absent JSON keys and SQL UNKNOWN.
CREATE FUNCTION hr_performance_channel_object_v1(v jsonb, keys text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN jsonb_typeof(v)='object' THEN (SELECT count(*) FROM jsonb_object_keys(v))=cardinality(keys) AND v ?& keys ELSE false END
$$;
CREATE FUNCTION hr_performance_channel_scalar_v1(v jsonb, kind text, lim integer DEFAULT 0) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE t text; n numeric;
BEGIN
 IF v IS NULL THEN RETURN false; END IF;
 IF v='null'::jsonb THEN RETURN true; END IF;
 t:=v#>>'{}';
 IF kind='text' THEN RETURN jsonb_typeof(v)='string' AND char_length(t)<=lim;
 ELSIF kind='bool' THEN RETURN jsonb_typeof(v)='boolean';
 ELSIF kind='order' THEN
  IF jsonb_typeof(v)<>'number' THEN RETURN false; END IF;
  n:=t::numeric; RETURN n=trunc(n) AND n>=-2147483648 AND n<=2147483647;
 ELSIF kind='int' THEN
  IF jsonb_typeof(v)<>'string' OR t !~ '^-?[0-9]+$' THEN RETURN false; END IF;
 ELSIF kind='decimal' THEN
  IF jsonb_typeof(v)<>'string' OR t !~ '^-?[0-9]+([.][0-9]{1,2})?$' THEN RETURN false; END IF;
  RETURN length(ltrim(split_part(ltrim(t,'-'),'.',1),'0'))<=16;
 ELSE RETURN false;
 END IF;
 n:=t::numeric; RETURN n>=-2147483648 AND n<=2147483647;
EXCEPTION WHEN numeric_value_out_of_range THEN RETURN false;
END $$;
CREATE FUNCTION hr_performance_channel_policy_v1(v jsonb, adjustment boolean) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE keys text[]:=ARRAY['businessName','stage','allowedActors','required','allowExplicitNull'];
BEGIN
 IF adjustment THEN keys:=keys||ARRAY['sourceSwitch','inputMode']; END IF;
 IF NOT public.hr_performance_channel_object_v1(v,keys) THEN RETURN false; END IF;
 IF NOT(public.hr_performance_channel_scalar_v1(v->'businessName','text',120) AND public.hr_performance_channel_scalar_v1(v->'required','bool') AND public.hr_performance_channel_scalar_v1(v->'allowExplicitNull','bool')) THEN RETURN false; END IF;
 IF NOT(v->'stage'='null'::jsonb OR (jsonb_typeof(v->'stage')='string' AND v->>'stage' IN('self_review','manager_review','calibration'))) THEN RETURN false; END IF;
 IF jsonb_typeof(v->'allowedActors') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v->'allowedActors') a WHERE jsonb_typeof(a)<>'string' OR a#>>'{}' NOT IN('self','manager','calibrator')) OR (SELECT count(*)<>count(DISTINCT a) FROM jsonb_array_elements(v->'allowedActors') a) THEN RETURN false; END IF;
 IF adjustment AND NOT(public.hr_performance_channel_scalar_v1(v->'sourceSwitch','bool') AND (v->'inputMode'='null'::jsonb OR v->'inputMode'='"manual_with_evidence"'::jsonb)) THEN RETURN false; END IF;
 RETURN true;
END $$;
CREATE FUNCTION hr_performance_channel_config_valid_v1(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE r jsonb; g jsonb; x jsonb; ids text[]; guides text[];
BEGIN
 IF NOT public.hr_performance_channel_object_v1(v,ARRAY['schemaVersion','displayName','departmentLabel','weights','channels','adjustmentPolicy','items','gradeCandidates']) THEN RETURN false; END IF;
 IF v->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR NOT public.hr_performance_channel_scalar_v1(v->'displayName','text',120) OR NOT public.hr_performance_channel_scalar_v1(v->'departmentLabel','text',30) THEN RETURN false; END IF;
 IF NOT public.hr_performance_channel_object_v1(v->'weights',ARRAY['sPercent','mPercent','tPercent','xPercent','cPercent']) THEN RETURN false; END IF;
 FOR x IN SELECT value FROM jsonb_each(v->'weights') LOOP IF NOT public.hr_performance_channel_scalar_v1(x,'int') THEN RETURN false; END IF; END LOOP;
 IF NOT public.hr_performance_channel_object_v1(v->'channels',ARRAY['s','m','t','x','c']) OR NOT public.hr_performance_channel_object_v1(v->'adjustmentPolicy',ARRAY['master','timekeep','bonus']) THEN RETURN false; END IF;
 FOR x IN SELECT value FROM jsonb_each(v->'channels') LOOP IF NOT public.hr_performance_channel_policy_v1(x,false) THEN RETURN false; END IF; END LOOP;
 FOR x IN SELECT value FROM jsonb_each(v->'adjustmentPolicy') LOOP IF NOT public.hr_performance_channel_policy_v1(x,true) THEN RETURN false; END IF; END LOOP;
 IF jsonb_typeof(v->'items') IS DISTINCT FROM 'array' OR jsonb_typeof(v->'gradeCandidates') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 ids:=ARRAY[]::text[];
 FOR r IN SELECT value FROM jsonb_array_elements(v->'items') LOOP
  IF NOT public.hr_performance_channel_object_v1(r,ARRAY['id','name','fullValue','order','sourceAssessmentRef','guides']) THEN RETURN false; END IF;
  IF jsonb_typeof(r->'id') IS DISTINCT FROM 'string' OR char_length(r->>'id') NOT BETWEEN 1 AND 128 OR r->>'id'=ANY(ids) THEN RETURN false; END IF; ids:=array_append(ids,r->>'id');
  IF NOT(public.hr_performance_channel_scalar_v1(r->'name','text',100) AND public.hr_performance_channel_scalar_v1(r->'fullValue','decimal') AND public.hr_performance_channel_scalar_v1(r->'order','order') AND public.hr_performance_channel_scalar_v1(r->'sourceAssessmentRef','int')) OR jsonb_typeof(r->'guides') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  guides:=ARRAY[]::text[];
  FOR g IN SELECT value FROM jsonb_array_elements(r->'guides') LOOP
   IF NOT public.hr_performance_channel_object_v1(g,ARRAY['id','grade','description','minValue','maxValue','order']) THEN RETURN false; END IF;
   IF jsonb_typeof(g->'id') IS DISTINCT FROM 'string' OR char_length(g->>'id') NOT BETWEEN 1 AND 128 OR g->>'id'=ANY(guides) THEN RETURN false; END IF; guides:=array_append(guides,g->>'id');
   IF NOT(public.hr_performance_channel_scalar_v1(g->'grade','text',64) AND public.hr_performance_channel_scalar_v1(g->'description','text',500) AND public.hr_performance_channel_scalar_v1(g->'minValue','decimal') AND public.hr_performance_channel_scalar_v1(g->'maxValue','decimal') AND public.hr_performance_channel_scalar_v1(g->'order','order')) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 ids:=ARRAY[]::text[];
 FOR r IN SELECT value FROM jsonb_array_elements(v->'gradeCandidates') LOOP
  IF NOT public.hr_performance_channel_object_v1(r,ARRAY['id','code','description','sourceOrderText','sourceAssessmentRef','minValue','maxValue']) THEN RETURN false; END IF;
  IF jsonb_typeof(r->'id') IS DISTINCT FROM 'string' OR char_length(r->>'id') NOT BETWEEN 1 AND 128 OR r->>'id'=ANY(ids) THEN RETURN false; END IF; ids:=array_append(ids,r->>'id');
  IF jsonb_typeof(r->'code') IS DISTINCT FROM 'string' OR NOT(public.hr_performance_channel_scalar_v1(r->'code','text',64) AND public.hr_performance_channel_scalar_v1(r->'description','text',500) AND public.hr_performance_channel_scalar_v1(r->'sourceOrderText','text',2) AND public.hr_performance_channel_scalar_v1(r->'sourceAssessmentRef','int') AND public.hr_performance_channel_scalar_v1(r->'minValue','decimal') AND public.hr_performance_channel_scalar_v1(r->'maxValue','decimal')) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
ALTER TABLE hr_performance_channel_definition_revision ADD CHECK(hr_performance_channel_config_valid_v1(config) IS TRUE);
CREATE OR REPLACE FUNCTION hr_performance_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE dimension_weight numeric; level_count integer; level_invalid boolean;BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'performance template version is immutable'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.calculation_mode='five_channel_v1' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'five-channel definitions are draft only'; END IF;
  RETURN NEW;
 END IF;
 IF (NEW.id,NEW.calculation_mode) IS DISTINCT FROM (OLD.id,OLD.calculation_mode) THEN RAISE EXCEPTION 'performance version identity is immutable'; END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.template_id,NEW.version_no,NEW.version_name,NEW.total_weight,NEW.create_by,NEW.create_time) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.template_id,OLD.version_no,OLD.version_name,OLD.total_weight,OLD.create_by,OLD.create_time) THEN RAISE EXCEPTION 'performance template version identity is immutable'; END IF;
 IF OLD.status='published' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'published performance configuration is immutable'; END IF;
 IF NEW.calculation_mode='five_channel_v1' THEN
  IF NEW.status<>'draft' OR NEW.published_at IS NOT NULL THEN RAISE EXCEPTION 'five-channel definitions are draft only'; END IF;
  IF NEW.channel_definition_revision_id IS DISTINCT FROM OLD.channel_definition_revision_id AND NOT EXISTS(SELECT 1 FROM hr_performance_channel_definition_revision r WHERE (r.id,r.tenant_id,r.park_id,r.template_version_id,r.previous_revision_id)=(NEW.channel_definition_revision_id,NEW.tenant_id,NEW.park_id,NEW.id,OLD.channel_definition_revision_id)) THEN RAISE EXCEPTION 'invalid definition successor'; END IF;
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF OLD.status<>'draft' OR NEW.status<>'published' OR NEW.published_at IS NULL THEN RAISE EXCEPTION 'invalid performance template transition'; END IF;
  SELECT COALESCE(sum(weight),0) INTO dimension_weight FROM hr_performance_template_dimension WHERE tenant_id=OLD.tenant_id AND park_id=OLD.park_id AND template_version_id=OLD.id;
  SELECT count(*) INTO level_count FROM hr_performance_template_level WHERE tenant_id=OLD.tenant_id AND park_id=OLD.park_id AND template_version_id=OLD.id;
  SELECT count(*)=0 OR min(score_min)<>0 OR max(score_max)<>100 OR COALESCE(bool_or(score_max<score_min OR (previous_max IS NOT NULL AND score_min<>previous_max+0.01)),false) INTO level_invalid FROM(SELECT score_min,score_max,lag(score_max)OVER(ORDER BY score_min,score_max,level_code)previous_max FROM hr_performance_template_level WHERE tenant_id=OLD.tenant_id AND park_id=OLD.park_id AND template_version_id=OLD.id)levels;
  IF dimension_weight<>OLD.total_weight OR level_count=0 OR level_invalid THEN RAISE EXCEPTION 'performance template children are incomplete'; END IF;
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER trg_hr_perf_version_immutable ON hr_performance_template_version;
CREATE TRIGGER trg_hr_perf_version_immutable BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_template_version FOR EACH ROW EXECUTE FUNCTION hr_performance_version_guard();
CREATE FUNCTION hr_performance_channel_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v record; p record; prev integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'performance definition revisions are append-only'; END IF;
 SELECT * INTO v FROM hr_performance_template_version WHERE (id,tenant_id,park_id)=(NEW.template_version_id,NEW.tenant_id,NEW.park_id);
 SELECT * INTO p FROM hr_performance_template WHERE (id,tenant_id,park_id)=(v.template_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 SELECT * INTO v FROM hr_performance_template_version WHERE (id,tenant_id,park_id)=(NEW.template_version_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 IF v.id IS NULL OR v.calculation_mode<>'five_channel_v1' OR v.status<>'draft' OR p.status='retired' OR p.current_version_no<>v.version_no THEN RAISE EXCEPTION 'definition requires current channel draft'; END IF;
 IF NEW.previous_revision_id IS NULL THEN
  IF NEW.revision_no<>1 OR v.channel_definition_revision_id<>NEW.id THEN RAISE EXCEPTION 'invalid initial definition'; END IF;
 ELSE
  SELECT revision_no INTO prev FROM hr_performance_channel_definition_revision WHERE (id,tenant_id,park_id,template_version_id)=(NEW.previous_revision_id,NEW.tenant_id,NEW.park_id,NEW.template_version_id);
  IF prev IS NULL OR NEW.revision_no<>prev+1 OR v.channel_definition_revision_id IS DISTINCT FROM NEW.previous_revision_id THEN RAISE EXCEPTION 'stale definition revision'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_channel_revision BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_channel_definition_revision FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_revision_guard();
CREATE FUNCTION hr_performance_channel_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM hr_performance_template_version v JOIN hr_performance_channel_definition_revision r ON (r.id,r.tenant_id,r.park_id,r.template_version_id)=(v.channel_definition_revision_id,v.tenant_id,v.park_id,v.id) WHERE (v.id,v.tenant_id,v.park_id)=(NEW.template_version_id,NEW.tenant_id,NEW.park_id) AND r.revision_no>=(SELECT max(h.revision_no) FROM hr_performance_channel_definition_revision h WHERE (h.template_version_id,h.tenant_id,h.park_id)=(v.id,v.tenant_id,v.park_id))) THEN RAISE EXCEPTION 'definition head must advance atomically'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_hr_perf_channel_head AFTER INSERT ON hr_performance_channel_definition_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_head_guard();
CREATE FUNCTION hr_performance_channel_cycle_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM hr_performance_template_version WHERE (id,tenant_id,park_id)=(NEW.template_version_id,NEW.tenant_id,NEW.park_id) AND calculation_mode='five_channel_v1') THEN RAISE EXCEPTION 'five-channel definitions are draft only'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_channel_cycle BEFORE INSERT OR UPDATE ON hr_performance_review_cycle FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_cycle_guard();
CREATE FUNCTION hr_performance_channel_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM hr_performance_template_version WHERE (id,tenant_id,park_id)=(NEW.template_version_id,NEW.tenant_id,NEW.park_id) AND calculation_mode='five_channel_v1') THEN RAISE EXCEPTION 'five-channel definitions do not use dimension children'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_channel_dimension BEFORE INSERT OR UPDATE ON hr_performance_template_dimension FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_child_guard();
CREATE TRIGGER trg_hr_perf_channel_level BEFORE INSERT OR UPDATE ON hr_performance_template_level FOR EACH ROW EXECUTE FUNCTION hr_performance_channel_child_guard();
REVOKE ALL ON FUNCTION hr_performance_channel_child_guard() FROM PUBLIC;
REVOKE ALL ON hr_performance_channel_definition_revision FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_channel_object_v1(jsonb,text[]),hr_performance_channel_scalar_v1(jsonb,text,integer),hr_performance_channel_policy_v1(jsonb,boolean),hr_performance_channel_config_valid_v1(jsonb),hr_performance_channel_revision_guard(),hr_performance_channel_head_guard(),hr_performance_channel_cycle_guard() FROM PUBLIC;
COMMIT;
