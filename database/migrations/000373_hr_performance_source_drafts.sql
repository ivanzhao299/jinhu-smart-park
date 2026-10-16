BEGIN;
-- Additive business drafts. No source, legacy guard, ACL or permission data changes.
CREATE TABLE hr_performance_source_manifest (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 migration_batch_id uuid NOT NULL REFERENCES migration_batch(id),schema_version integer NOT NULL CHECK(schema_version=1),
 manifest_sha256 char(64) NOT NULL CHECK(manifest_sha256~'^[0-9a-f]{64}$'),content jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES sys_user(id),created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 UNIQUE(id,tenant_id,park_id),UNIQUE(tenant_id,park_id,migration_batch_id,manifest_sha256)
);
CREATE TABLE hr_performance_source_draft (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 kind text NOT NULL CHECK(kind IN('template','review')),source_table text NOT NULL,
 source_identity_sha256 char(64) NOT NULL CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),current_revision_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES sys_user(id),created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 CHECK(source_table=CASE kind WHEN 'template' THEN 'hr_performance_legacy_template_profile' ELSE 'hr_performance_legacy_master_result' END),
 UNIQUE(id,tenant_id,park_id),UNIQUE(tenant_id,park_id,kind,source_identity_sha256)
);
CREATE TABLE hr_performance_source_draft_revision (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,draft_id uuid NOT NULL,
 revision_no integer NOT NULL CHECK(revision_no>0),previous_revision_id uuid,manifest_id uuid NOT NULL,source_fact_id uuid NOT NULL,
 snapshot jsonb NOT NULL,origin text NOT NULL CHECK(origin IN('source','human','refresh')),reason text NOT NULL CHECK(length(btrim(reason))>=2 AND length(reason)<=2000),
 created_by uuid NOT NULL REFERENCES sys_user(id),created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 UNIQUE(id,tenant_id,park_id,draft_id),UNIQUE(draft_id,revision_no),
 FOREIGN KEY(draft_id,tenant_id,park_id) REFERENCES hr_performance_source_draft(id,tenant_id,park_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(manifest_id,tenant_id,park_id) REFERENCES hr_performance_source_manifest(id,tenant_id,park_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(previous_revision_id,tenant_id,park_id,draft_id) REFERENCES hr_performance_source_draft_revision(id,tenant_id,park_id,draft_id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE hr_performance_source_draft ADD FOREIGN KEY(current_revision_id,tenant_id,park_id,id) REFERENCES hr_performance_source_draft_revision(id,tenant_id,park_id,draft_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION hr_performance_source_field_valid(f text,k text,v jsonb,editable boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER AS $$
DECLARE typ text;allowed boolean;
BEGIN
 SELECT a->>'type',(a->>'editable')::boolean INTO typ,allowed FROM jsonb_array_elements('[{"family": "template_profile", "field": "source_assessment", "type": "integer", "editable": false}, {"family": "template_profile", "field": "source_assessment_name", "type": "varchar(50)", "editable": true}, {"family": "template_profile", "field": "source_department", "type": "varchar(30)", "editable": true}, {"family": "template_profile", "field": "source_m_percent", "type": "integer", "editable": true}, {"family": "template_profile", "field": "source_t_percent", "type": "integer", "editable": true}, {"family": "template_profile", "field": "source_x_percent", "type": "integer", "editable": true}, {"family": "template_profile", "field": "source_c_percent", "type": "integer", "editable": true}, {"family": "template_profile", "field": "source_s_percent", "type": "integer", "editable": true}, {"family": "template_profile", "field": "source_timekeep", "type": "boolean", "editable": true}, {"family": "template_profile", "field": "source_bonus", "type": "boolean", "editable": true}, {"family": "template_profile", "field": "source_master", "type": "boolean", "editable": true}, {"family": "level_rule", "field": "source_ass_grade", "type": "varchar(12)", "editable": false}, {"family": "level_rule", "field": "source_description", "type": "varchar(500)", "editable": true}, {"family": "level_rule", "field": "source_my_order", "type": "varchar(2)", "editable": true}, {"family": "level_rule", "field": "source_assessment_id", "type": "integer", "editable": false}, {"family": "level_rule", "field": "source_min_value", "type": "integer", "editable": true}, {"family": "level_rule", "field": "source_max_value", "type": "integer", "editable": true}, {"family": "dimension_profile", "field": "source_item_id", "type": "integer", "editable": false}, {"family": "dimension_profile", "field": "source_assessment_id", "type": "integer", "editable": false}, {"family": "dimension_profile", "field": "source_item_name", "type": "varchar(100)", "editable": true}, {"family": "dimension_profile", "field": "source_full_value", "type": "numeric(18,2)", "editable": true}, {"family": "dimension_profile", "field": "source_my_order", "type": "integer", "editable": true}, {"family": "dimension_level_guide", "field": "source_guide_id", "type": "integer", "editable": false}, {"family": "dimension_level_guide", "field": "source_item_id", "type": "integer", "editable": false}, {"family": "dimension_level_guide", "field": "source_grade", "type": "varchar(12)", "editable": true}, {"family": "dimension_level_guide", "field": "source_description", "type": "varchar(500)", "editable": true}, {"family": "dimension_level_guide", "field": "source_min_value", "type": "integer", "editable": true}, {"family": "dimension_level_guide", "field": "source_max_value", "type": "integer", "editable": true}, {"family": "dimension_level_guide", "field": "source_my_order", "type": "integer", "editable": true}, {"family": "dimension_result", "field": "source_detail_id", "type": "integer", "editable": false}, {"family": "dimension_result", "field": "source_session_id", "type": "integer", "editable": false}, {"family": "dimension_result", "field": "source_person_code", "type": "varchar(10)", "editable": false}, {"family": "dimension_result", "field": "source_item_id", "type": "integer", "editable": false}, {"family": "dimension_result", "field": "source_self_value", "type": "numeric(18,2)", "editable": true}, {"family": "dimension_result", "field": "source_m_item_value", "type": "numeric(18,2)", "editable": true}, {"family": "dimension_result", "field": "source_item_value", "type": "numeric(18,2)", "editable": true}, {"family": "dimension_result", "field": "source_x_item_value", "type": "numeric(18,2)", "editable": true}, {"family": "dimension_result", "field": "source_c_item_value", "type": "numeric(18,2)", "editable": true}, {"family": "dimension_result", "field": "source_self_grade", "type": "varchar(12)", "editable": false}, {"family": "dimension_result", "field": "source_ass_grade", "type": "varchar(12)", "editable": false}, {"family": "dimension_result", "field": "source_appraisal", "type": "varchar(200)", "editable": true}, {"family": "master_result", "field": "source_master_id", "type": "integer", "editable": false}, {"family": "master_result", "field": "source_session_id", "type": "integer", "editable": false}, {"family": "master_result", "field": "source_person_code", "type": "varchar(10)", "editable": false}, {"family": "master_result", "field": "source_self_grade", "type": "varchar(12)", "editable": false}, {"family": "master_result", "field": "source_ass_grade", "type": "varchar(12)", "editable": false}, {"family": "master_result", "field": "source_self_value", "type": "numeric(18,2)", "editable": false}, {"family": "master_result", "field": "source_item_value", "type": "numeric(18,2)", "editable": false}, {"family": "master_result", "field": "source_m_item_value", "type": "numeric(18,0)", "editable": false}, {"family": "master_result", "field": "source_x_item_value", "type": "numeric(18,0)", "editable": false}, {"family": "master_result", "field": "source_c_item_value", "type": "numeric(18,0)", "editable": false}, {"family": "master_result", "field": "source_master_value", "type": "numeric(18,2)", "editable": true}, {"family": "master_result", "field": "source_timekeep_value", "type": "numeric(18,2)", "editable": true}, {"family": "master_result", "field": "source_bonus_value", "type": "numeric(18,2)", "editable": true}, {"family": "master_result", "field": "source_total_value", "type": "numeric(18,2)", "editable": false}, {"family": "master_result", "field": "source_self_appraisal", "type": "varchar(500)", "editable": true}, {"family": "master_result", "field": "source_appraisal", "type": "varchar(500)", "editable": true}, {"family": "master_result", "field": "source_pay", "type": "numeric(19,4)", "editable": true}, {"family": "master_result", "field": "source_assessment_person", "type": "varchar(50)", "editable": false}, {"family": "master_result", "field": "source_recorded_at", "type": "timestamp without time zone", "editable": false}, {"family": "master_result", "field": "source_operator_code", "type": "varchar(10)", "editable": false}, {"family": "master_result", "field": "source_description", "type": "varchar(500)", "editable": true}]'::jsonb) a WHERE a->>'family'=f AND a->>'field'=k;
 IF typ IS NULL OR (editable AND NOT allowed) THEN RETURN false;END IF;
 IF v='null'::jsonb THEN RETURN true;END IF;
 IF typ='boolean' THEN RETURN jsonb_typeof(v)='boolean';END IF;
 IF jsonb_typeof(v) IS DISTINCT FROM 'string' THEN RETURN false;END IF;
 IF typ='integer' THEN RETURN v#>>'{}' ~ '^-?[0-9]+$' AND (v#>>'{}')::numeric BETWEEN -2147483648 AND 2147483647;END IF;
 IF typ LIKE 'numeric%' THEN RETURN v#>>'{}' ~ CASE WHEN typ='numeric(19,4)' THEN '^-?[0-9]+([.][0-9]{1,4})?$' WHEN typ='numeric(18,0)' THEN '^-?[0-9]+$' ELSE '^-?[0-9]+([.][0-9]{1,2})?$' END AND abs((v#>>'{}')::numeric)<CASE WHEN typ='numeric(19,4)' THEN 1000000000000000::numeric WHEN typ='numeric(18,0)' THEN 1000000000000000000::numeric ELSE 10000000000000000::numeric END;END IF;
 IF typ LIKE 'varchar%' THEN RETURN length(v#>>'{}')<=substring(typ FROM '[0-9]+')::int;END IF;
 RETURN v#>>'{}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}$';
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION hr_performance_source_generation(t varchar,p varchar,k text,s uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
WITH selected AS (
 SELECT migration_batch_id,source_identity_sha256::text identity,id,legacy_template_profile_id profile_id,source_session_id session_id,source_person_code person_code FROM public.hr_performance_legacy_master_result WHERE k='review' AND id=s AND tenant_id=t AND park_id=p
 UNION ALL SELECT migration_batch_id,source_identity_sha256::text,id,id,NULL,NULL FROM public.hr_performance_legacy_template_profile WHERE k='template' AND id=s AND tenant_id=t AND park_id=p
),facts AS (
SELECT 'template_profile'::text family,'dbo.assessmentcode'::text source_table,'hr_performance_legacy_template_profile'::text target_table,f.id,f.migration_batch_id,f.legacy_record_map_id,f.source_identity_sha256::text identity,f.source_row_sha256::text row_hash,jsonb_build_object('source_assessment',f.source_assessment::text,'source_assessment_name',f.source_assessment_name::text,'source_department',f.source_department::text,'source_m_percent',f.source_m_percent::text,'source_t_percent',f.source_t_percent::text,'source_x_percent',f.source_x_percent::text,'source_c_percent',f.source_c_percent::text,'source_s_percent',f.source_s_percent::text,'source_timekeep',f.source_timekeep,'source_bonus',f.source_bonus,'source_master',f.source_master) values FROM public.hr_performance_legacy_template_profile f WHERE f.tenant_id=t AND f.park_id=p AND f.migration_batch_id=(SELECT migration_batch_id FROM selected)
 UNION ALL
SELECT 'level_rule'::text family,'dbo.assgradecode'::text source_table,'hr_performance_legacy_level_rule'::text target_table,f.id,f.migration_batch_id,f.legacy_record_map_id,f.source_identity_sha256::text identity,f.source_row_sha256::text row_hash,jsonb_build_object('source_ass_grade',f.source_ass_grade::text,'source_description',f.source_description::text,'source_my_order',f.source_my_order::text,'source_assessment_id',f.source_assessment_id::text,'source_min_value',f.source_min_value::text,'source_max_value',f.source_max_value::text) values FROM public.hr_performance_legacy_level_rule f WHERE f.tenant_id=t AND f.park_id=p AND f.migration_batch_id=(SELECT migration_batch_id FROM selected)
 UNION ALL
SELECT 'dimension_profile'::text family,'dbo.assitem'::text source_table,'hr_performance_legacy_dimension_profile'::text target_table,f.id,f.migration_batch_id,f.legacy_record_map_id,f.source_identity_sha256::text identity,f.source_row_sha256::text row_hash,jsonb_build_object('source_item_id',f.source_item_id::text,'source_assessment_id',f.source_assessment_id::text,'source_item_name',f.source_item_name::text,'source_full_value',f.source_full_value::text,'source_my_order',f.source_my_order::text) values FROM public.hr_performance_legacy_dimension_profile f WHERE f.tenant_id=t AND f.park_id=p AND f.migration_batch_id=(SELECT migration_batch_id FROM selected)
 UNION ALL
SELECT 'dimension_level_guide'::text family,'dbo.assitemgradedes'::text source_table,'hr_performance_legacy_dimension_level_guide'::text target_table,f.id,f.migration_batch_id,f.legacy_record_map_id,f.source_identity_sha256::text identity,f.source_row_sha256::text row_hash,jsonb_build_object('source_guide_id',f.source_guide_id::text,'source_item_id',f.source_item_id::text,'source_grade',f.source_grade::text,'source_description',f.source_description::text,'source_min_value',f.source_min_value::text,'source_max_value',f.source_max_value::text,'source_my_order',f.source_my_order::text) values FROM public.hr_performance_legacy_dimension_level_guide f WHERE f.tenant_id=t AND f.park_id=p AND f.migration_batch_id=(SELECT migration_batch_id FROM selected)
 UNION ALL
SELECT 'dimension_result'::text family,'dbo.assessmentdetail'::text source_table,'hr_performance_legacy_dimension_result'::text target_table,f.id,f.migration_batch_id,f.legacy_record_map_id,f.source_identity_sha256::text identity,f.source_row_sha256::text row_hash,jsonb_build_object('source_detail_id',f.source_detail_id::text,'source_session_id',f.source_session_id::text,'source_person_code',f.source_person_code::text,'source_item_id',f.source_item_id::text,'source_self_value',f.source_self_value::text,'source_m_item_value',f.source_m_item_value::text,'source_item_value',f.source_item_value::text,'source_x_item_value',f.source_x_item_value::text,'source_c_item_value',f.source_c_item_value::text,'source_self_grade',f.source_self_grade::text,'source_ass_grade',f.source_ass_grade::text,'source_appraisal',f.source_appraisal::text) values FROM public.hr_performance_legacy_dimension_result f WHERE f.tenant_id=t AND f.park_id=p AND f.migration_batch_id=(SELECT migration_batch_id FROM selected)
 UNION ALL
SELECT 'master_result'::text family,'dbo.assessmentmaster'::text source_table,'hr_performance_legacy_master_result'::text target_table,f.id,f.migration_batch_id,f.legacy_record_map_id,f.source_identity_sha256::text identity,f.source_row_sha256::text row_hash,jsonb_build_object('source_master_id',f.source_master_id::text,'source_session_id',f.source_session_id::text,'source_person_code',f.source_person_code::text,'source_self_grade',f.source_self_grade::text,'source_ass_grade',f.source_ass_grade::text,'source_self_value',f.source_self_value::text,'source_item_value',f.source_item_value::text,'source_m_item_value',f.source_m_item_value::text,'source_x_item_value',f.source_x_item_value::text,'source_c_item_value',f.source_c_item_value::text,'source_master_value',f.source_master_value::text,'source_timekeep_value',f.source_timekeep_value::text,'source_bonus_value',f.source_bonus_value::text,'source_total_value',f.source_total_value::text,'source_self_appraisal',f.source_self_appraisal::text,'source_appraisal',f.source_appraisal::text,'source_pay',f.source_pay::text,'source_assessment_person',f.source_assessment_person::text,'source_recorded_at',to_char(f.source_recorded_at,'YYYY-MM-DD"T"HH24:MI:SS.US'),'source_operator_code',f.source_operator_code::text,'source_description',f.source_description::text) values FROM public.hr_performance_legacy_master_result f WHERE f.tenant_id=t AND f.park_id=p AND f.migration_batch_id=(SELECT migration_batch_id FROM selected)
),evidence AS (
 SELECT f.*,jsonb_build_object('id',m.id,'batchId',m.batch_id,'sourceSystem',m.source_system,'sourceTable',m.source_table,'sourcePkCanonical',m.source_pk_canonical,'sourceIdentitySha256',m.source_identity_sha256,'sourceRowSha256',m.source_row_sha256,'targetTable',m.target_table,'targetId',m.target_id,'mappingStatus',m.mapping_status,'isActive',m.is_active) map,
 COALESCE(m.batch_id=f.migration_batch_id AND m.source_system='yuzhou-v10' AND m.source_table=f.source_table AND m.source_pk_canonical='sha256:'||f.identity AND m.source_identity_sha256=f.identity AND m.source_row_sha256=f.row_hash AND m.target_table=f.target_table AND m.target_id=f.id AND m.mapping_status='verified' AND m.is_active,false) valid
 FROM facts f LEFT JOIN public.legacy_record_map m ON m.id=f.legacy_record_map_id
),record_set AS (
 SELECT *,jsonb_build_object('family',family,'identitySha256',identity,'sourceFactId',id,'values',values) record FROM evidence
),batch AS (
 SELECT jsonb_build_object('id',b.id,'runId',b.run_id,'sourceSystem',b.source_system,'sourceSnapshotSha256',b.source_snapshot_sha256,'targetDatabase',b.target_database,'phase',b.phase,'status',b.status,'executionContext',b.execution_context,'productionImportPhase',b.production_import_phase) evidence
 FROM public.migration_batch b WHERE b.id=(SELECT migration_batch_id FROM selected) AND b.source_system='yuzhou-v10' AND b.execution_context='production_import' AND b.production_import_phase='T0' AND b.target_database=current_database() AND b.status='succeeded'
),complete AS (
 SELECT jsonb_build_object('schemaVersion',1,'batch',(SELECT evidence FROM batch),'facts',COALESCE(jsonb_agg(record||jsonb_build_object('sourceRowSha256',row_hash,'map',map) ORDER BY family COLLATE "C",identity COLLATE "C",id),'[]'::jsonb)) content FROM record_set
),baseline AS (
 SELECT jsonb_build_object('schemaVersion',1,'records',COALESCE(jsonb_agg(record ORDER BY family COLLATE "C",identity COLLATE "C",id),'[]'::jsonb),'binding',jsonb_build_object('employeeId',NULL,'orgId',NULL,'startDate',NULL,'endDate',NULL,'businessPeriodRef',NULL),'definition',NULL,'workflow',NULL) snapshot FROM record_set
 WHERE family IN('level_rule','dimension_profile','dimension_level_guide') OR (family='template_profile' AND (k='review' OR id=(SELECT profile_id FROM selected))) OR (k='review' AND family='master_result' AND id=s) OR (k='review' AND family='dimension_result' AND values->>'source_session_id' IS NOT DISTINCT FROM (SELECT session_id::text FROM selected) AND values->>'source_person_code' IS NOT DISTINCT FROM (SELECT person_code FROM selected))
)
SELECT jsonb_build_object('content',content,'manifestSha256',encode(sha256(convert_to(content::text,'UTF8')),'hex'),'snapshot',(SELECT snapshot FROM baseline),'sourceIdentitySha256',(SELECT identity FROM selected),'migrationBatchId',(SELECT migration_batch_id FROM selected),'familyCounts',(SELECT jsonb_object_agg(family,n) FROM (SELECT family,count(*) n FROM facts GROUP BY family) counts)) FROM complete
WHERE EXISTS(SELECT 1 FROM selected) AND EXISTS(SELECT 1 FROM batch) AND NOT EXISTS(SELECT 1 FROM evidence WHERE NOT valid) AND NOT EXISTS(SELECT 1 FROM facts f CROSS JOIN LATERAL jsonb_each(f.values) kv WHERE NOT public.hr_performance_source_field_valid(f.family,kv.key,kv.value))
$$;
CREATE FUNCTION hr_performance_source_snapshot_valid(s jsonb,t varchar,p varchar) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE b jsonb;r jsonb;kv record;expected int;
BEGIN
 IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(s))<>5 OR NOT s ?& ARRAY['schemaVersion','records','binding','definition','workflow'] OR s->'schemaVersion'<>'1'::jsonb OR jsonb_typeof(s->'records') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 b:=s->'binding';IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>5 OR NOT b ?& ARRAY['employeeId','orgId','startDate','endDate','businessPeriodRef'] THEN RETURN false;END IF;
 IF b->>'employeeId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hr_employee WHERE id=(b->>'employeeId')::uuid AND tenant_id=t AND park_id=p AND NOT is_deleted) THEN RETURN false;END IF;
 IF b->>'orgId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sys_org WHERE id=(b->>'orgId')::uuid AND tenant_id=t AND park_id=p AND NOT is_deleted AND status='enabled') THEN RETURN false;END IF;
 FOR kv IN SELECT * FROM jsonb_each(b) LOOP
 IF kv.value='null'::jsonb THEN CONTINUE;END IF;
 IF jsonb_typeof(kv.value)<>'string' THEN RETURN false;END IF;
 IF kv.key IN('startDate','endDate') AND (kv.value#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char((kv.value#>>'{}')::date,'YYYY-MM-DD')<>kv.value#>>'{}') THEN RETURN false;END IF;
 END LOOP;
 IF b->>'startDate'>b->>'endDate' OR (b->>'businessPeriodRef' IS NOT NULL AND(length(btrim(b->>'businessPeriodRef'))=0 OR length(b->>'businessPeriodRef')>120)) THEN RETURN false;END IF;
 IF s->'definition'<>'null'::jsonb AND NOT public.hr_performance_channel_config_valid_v1(s->'definition') THEN RETURN false;END IF;
 IF s->'workflow'<>'null'::jsonb AND (s->'definition'='null'::jsonb OR NOT public.hr_performance_channel_workflow_valid(s->'workflow',s->'definition',false)) THEN RETURN false;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(s->'records') LOOP
 IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(r))<>4 OR NOT r ?& ARRAY['family','identitySha256','sourceFactId','values'] OR r->>'identitySha256' !~ '^[0-9a-f]{64}$' OR jsonb_typeof(r->'values') IS DISTINCT FROM 'object' THEN RETURN false;END IF;
 SELECT CASE r->>'family' WHEN 'template_profile' THEN 11 WHEN 'level_rule' THEN 6 WHEN 'dimension_profile' THEN 5 WHEN 'dimension_level_guide' THEN 7 WHEN 'dimension_result' THEN 12 WHEN 'master_result' THEN 21 ELSE 0 END INTO expected;
 IF expected=0 OR (SELECT count(*) FROM jsonb_object_keys(r->'values'))<>expected THEN RETURN false;END IF;
 FOR kv IN SELECT * FROM jsonb_each(r->'values') LOOP IF NOT public.hr_performance_source_field_valid(r->>'family',kv.key,kv.value) THEN RETURN false;END IF;END LOOP;
 END LOOP;RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION hr_performance_source_manifest_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE f jsonb;g jsonb;k text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SOURCE_MANIFEST_IMMUTABLE';END IF;
 IF NEW.created_at IS DISTINCT FROM transaction_timestamp() OR NOT EXISTS(SELECT 1 FROM public.sys_user WHERE id=NEW.created_by AND tenant_id=NEW.tenant_id) THEN RAISE EXCEPTION 'SOURCE_ACTOR_INVALID';END IF;
 SELECT value INTO f FROM jsonb_array_elements(NEW.content->'facts') WHERE value->>'family' IN('template_profile','master_result') LIMIT 1;
 k:=CASE f->>'family' WHEN 'template_profile' THEN 'template' ELSE 'review' END;
 g:=public.hr_performance_source_generation(NEW.tenant_id,NEW.park_id,k,(f->>'sourceFactId')::uuid);
 IF g IS NULL OR NEW.content IS DISTINCT FROM g->'content' OR NEW.manifest_sha256 IS DISTINCT FROM g->>'manifestSha256' OR NEW.migration_batch_id::text IS DISTINCT FROM g->>'migrationBatchId' THEN RAISE EXCEPTION 'SOURCE_NOT_CURRENT';END IF;
 IF NOT public.hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,'hr:performance_template:manage') AND NOT public.hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,'hr:performance:manage') THEN RAISE EXCEPTION 'SOURCE_PERMISSION_REQUIRED';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_source_manifest BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_source_manifest FOR EACH ROW EXECUTE FUNCTION hr_performance_source_manifest_guard();
CREATE FUNCTION hr_performance_source_draft_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.hr_performance_source_draft_revision%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SOURCE_DRAFT_IMMUTABLE';END IF;
 IF TG_OP='INSERT' THEN
 IF NEW.created_at IS DISTINCT FROM transaction_timestamp() OR NOT public.hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,CASE NEW.kind WHEN 'template' THEN 'hr:performance_template:manage' ELSE 'hr:performance:manage' END) THEN RAISE EXCEPTION 'SOURCE_PERMISSION_REQUIRED';END IF;RETURN NEW;END IF;
 IF (to_jsonb(NEW)-'current_revision_id') IS DISTINCT FROM (to_jsonb(OLD)-'current_revision_id') OR NEW.current_revision_id IS NULL OR NEW.current_revision_id=OLD.current_revision_id THEN RAISE EXCEPTION 'SOURCE_DRAFT_IDENTITY_IMMUTABLE';END IF;
 SELECT * INTO r FROM public.hr_performance_source_draft_revision WHERE id=NEW.current_revision_id AND draft_id=NEW.id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id;
 IF r.id IS NULL OR r.previous_revision_id IS DISTINCT FROM OLD.current_revision_id THEN RAISE EXCEPTION 'SOURCE_HEAD_INVALID';END IF;RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_source_draft BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_source_draft FOR EACH ROW EXECUTE FUNCTION hr_performance_source_draft_guard();
CREATE FUNCTION hr_performance_source_revision_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE d public.hr_performance_source_draft%ROWTYPE;m public.hr_performance_source_manifest%ROWTYPE;prior public.hr_performance_source_draft_revision%ROWTYPE;g jsonb;r jsonb;oldr jsonb;kv record;i integer;pay jsonb;oldpay jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SOURCE_REVISION_IMMUTABLE';END IF;
 SELECT * INTO d FROM public.hr_performance_source_draft WHERE id=NEW.draft_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id FOR UPDATE;
 IF d.id IS NULL OR NEW.created_at IS DISTINCT FROM transaction_timestamp() OR NOT public.hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,CASE d.kind WHEN 'template' THEN 'hr:performance_template:manage' ELSE 'hr:performance:manage' END) THEN RAISE EXCEPTION 'SOURCE_PERMISSION_REQUIRED';END IF;
 SELECT * INTO m FROM public.hr_performance_source_manifest WHERE id=NEW.manifest_id AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id;
 IF d.kind='template' AND NEW.snapshot->'binding'->>'employeeId' IS NOT NULL THEN RAISE EXCEPTION 'SOURCE_PERMISSION_REQUIRED';END IF;
 IF m.id IS NULL OR NOT public.hr_performance_source_snapshot_valid(NEW.snapshot,NEW.tenant_id,NEW.park_id) THEN RAISE EXCEPTION 'SOURCE_SNAPSHOT_INVALID';END IF;
 IF NEW.previous_revision_id IS NULL THEN
 IF NEW.origin<>'source' OR NEW.revision_no<>1 OR NEW.reason<>'source intake' OR d.current_revision_id<>NEW.id OR EXISTS(SELECT 1 FROM public.hr_performance_source_draft_revision WHERE draft_id=d.id) THEN RAISE EXCEPTION 'SOURCE_ORIGIN_INVALID';END IF;
 ELSE
 SELECT * INTO prior FROM public.hr_performance_source_draft_revision WHERE id=NEW.previous_revision_id AND draft_id=d.id AND tenant_id=d.tenant_id AND park_id=d.park_id;
 IF prior.id IS NULL OR d.current_revision_id<>prior.id OR NEW.revision_no<>prior.revision_no+1 OR NEW.origin='source' THEN RAISE EXCEPTION 'STALE_REVISION';END IF;
 END IF;
 IF NEW.origin IN('source','refresh') THEN
 -- STABLE helper shares this INSERT statement's snapshot, including reused manifests.
 g:=public.hr_performance_source_generation(NEW.tenant_id,NEW.park_id,d.kind,NEW.source_fact_id);
 IF g IS NULL OR g->'content' IS DISTINCT FROM m.content OR g->>'manifestSha256' IS DISTINCT FROM m.manifest_sha256 OR g->'snapshot' IS DISTINCT FROM NEW.snapshot OR g->>'sourceIdentitySha256' IS DISTINCT FROM d.source_identity_sha256 OR g->>'migrationBatchId' IS DISTINCT FROM m.migration_batch_id::text THEN RAISE EXCEPTION 'SOURCE_NOT_CURRENT';END IF;
 IF NEW.origin='refresh' AND (NEW.manifest_id=prior.manifest_id OR EXISTS(SELECT 1 FROM public.hr_performance_source_draft_revision WHERE draft_id=d.id AND origin='human')) THEN RAISE EXCEPTION 'HUMAN_REFRESH_CONFLICT';END IF;
 ELSE
 IF NEW.manifest_id<>prior.manifest_id OR NEW.source_fact_id<>prior.source_fact_id OR NEW.snapshot=prior.snapshot OR jsonb_array_length(NEW.snapshot->'records')<>jsonb_array_length(prior.snapshot->'records') THEN RAISE EXCEPTION 'SOURCE_HUMAN_IDENTITY_INVALID';END IF;
 FOR i IN 0..jsonb_array_length(NEW.snapshot->'records')-1 LOOP
 r:=NEW.snapshot->'records'->i;oldr:=prior.snapshot->'records'->i;
 IF r-'values' IS DISTINCT FROM oldr-'values' THEN RAISE EXCEPTION 'SOURCE_HUMAN_IDENTITY_INVALID';END IF;
 FOR kv IN SELECT * FROM jsonb_each(r->'values') LOOP IF kv.value IS DISTINCT FROM oldr->'values'->kv.key AND NOT public.hr_performance_source_field_valid(r->>'family',kv.key,kv.value,true) THEN RAISE EXCEPTION 'SOURCE_FIXED_FIELD';END IF;END LOOP;
 END LOOP;
 END IF;
 SELECT value->'values'->'source_pay' INTO pay FROM jsonb_array_elements(NEW.snapshot->'records') WHERE value->>'family'='master_result';
 SELECT value->'values'->'source_pay' INTO oldpay FROM jsonb_array_elements(prior.snapshot->'records') WHERE value->>'family'='master_result';
 IF d.kind='review' AND ((NEW.origin='source' AND pay IS DISTINCT FROM 'null'::jsonb) OR (NEW.origin<>'source' AND pay IS DISTINCT FROM oldpay)) AND NOT (public.hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,'hr:performance:read') AND public.hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,'hr:performance:manage') AND public.hr_performance_channel_actor_has(NEW.tenant_id,NEW.park_id,NEW.created_by,'hr:compensation:manage')) THEN RAISE EXCEPTION 'SOURCE_SALARY_PERMISSION_REQUIRED';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_source_revision BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_source_draft_revision FOR EACH ROW EXECUTE FUNCTION hr_performance_source_revision_guard();
CREATE FUNCTION hr_performance_source_head_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE did uuid;t varchar;p varchar;
BEGIN
 did:=(to_jsonb(NEW)->>CASE TG_TABLE_NAME WHEN 'hr_performance_source_draft' THEN 'id' ELSE 'draft_id' END)::uuid;t:=NEW.tenant_id;p:=NEW.park_id;
 IF NOT EXISTS(SELECT 1 FROM public.hr_performance_source_draft d JOIN public.hr_performance_source_draft_revision r ON(r.id,r.tenant_id,r.park_id,r.draft_id)=(d.current_revision_id,d.tenant_id,d.park_id,d.id) WHERE(d.id,d.tenant_id,d.park_id)=(did,t,p) AND r.revision_no=(SELECT max(revision_no) FROM public.hr_performance_source_draft_revision h WHERE h.draft_id=d.id)) THEN RAISE EXCEPTION 'SOURCE_HEAD_MUST_ADVANCE';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_hr_perf_source_head AFTER INSERT OR UPDATE ON hr_performance_source_draft DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_performance_source_head_guard();
CREATE CONSTRAINT TRIGGER trg_hr_perf_source_revision_head AFTER INSERT ON hr_performance_source_draft_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_performance_source_head_guard();
COMMIT;
