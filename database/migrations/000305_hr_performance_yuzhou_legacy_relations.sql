BEGIN;

CREATE TABLE hr_performance_legacy_session (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_record_map_id uuid NOT NULL REFERENCES legacy_record_map(id) DEFERRABLE INITIALLY DEFERRED,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,
  source_session_id integer NOT NULL,
  source_session_name varchar(50) NOT NULL,
  source_description varchar(100),
  source_assessment_type varchar(12),
  source_year integer,
  source_month integer,
  source_quarter integer,
  source_my_order integer,
  target_review_cycle_id uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_perf_legacy_session_scope UNIQUE(id,tenant_id,park_id),
  CONSTRAINT uq_hr_perf_legacy_session_batch_scope UNIQUE(id,tenant_id,park_id,migration_batch_id),
  CONSTRAINT uq_hr_perf_legacy_session_source UNIQUE(migration_batch_id,tenant_id,park_id,source_session_id),
  CONSTRAINT uq_hr_perf_legacy_session_map UNIQUE(legacy_record_map_id),
  CONSTRAINT ck_hr_perf_legacy_session_identity CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_session_row CHECK(source_row_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT fk_hr_perf_legacy_session_cycle FOREIGN KEY(target_review_cycle_id,tenant_id,park_id)
    REFERENCES hr_performance_review_cycle(id,tenant_id,park_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_hr_perf_legacy_session_period
  ON hr_performance_legacy_session(tenant_id,park_id,source_year,source_month,source_quarter);

CREATE TABLE hr_performance_legacy_score_source (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_record_map_id uuid NOT NULL REFERENCES legacy_record_map(id) DEFERRABLE INITIALLY DEFERRED,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,
  source_score_id integer NOT NULL,
  source_session_id integer,
  source_person_code varchar(10),
  source_item_id integer,
  source_relation_type integer,
  source_item_value numeric(18,2),
  source_ass_grade varchar(50),
  source_appraisal varchar(200),
  legacy_session_id uuid,
  legacy_dimension_profile_id uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_perf_legacy_score_scope UNIQUE(id,tenant_id,park_id),
  CONSTRAINT uq_hr_perf_legacy_score_source UNIQUE(migration_batch_id,tenant_id,park_id,source_score_id),
  CONSTRAINT uq_hr_perf_legacy_score_map UNIQUE(legacy_record_map_id),
  CONSTRAINT ck_hr_perf_legacy_score_identity CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_score_row CHECK(source_row_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT fk_hr_perf_legacy_score_session FOREIGN KEY(
    legacy_session_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_session(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_score_dimension FOREIGN KEY(
    legacy_dimension_profile_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_dimension_profile(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_hr_perf_legacy_score_person
  ON hr_performance_legacy_score_source(tenant_id,park_id,migration_batch_id,source_session_id,source_person_code);

CREATE TABLE hr_performance_legacy_source_person_assignment (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_record_map_id uuid NOT NULL REFERENCES legacy_record_map(id) DEFERRABLE INITIALLY DEFERRED,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,
  source_assignment_id integer NOT NULL,
  source_session_id integer,
  source_person_code varchar(10),
  source_assessor_code varchar(50),
  source_relation_type integer,
  legacy_session_id uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_perf_legacy_source_person_scope UNIQUE(id,tenant_id,park_id),
  CONSTRAINT uq_hr_perf_legacy_source_person_source UNIQUE(migration_batch_id,tenant_id,park_id,source_assignment_id),
  CONSTRAINT uq_hr_perf_legacy_source_person_map UNIQUE(legacy_record_map_id),
  CONSTRAINT ck_hr_perf_legacy_source_person_identity CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_source_person_row CHECK(source_row_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT fk_hr_perf_legacy_source_person_session FOREIGN KEY(
    legacy_session_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_session(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_hr_perf_legacy_source_person_lookup
  ON hr_performance_legacy_source_person_assignment(
    tenant_id,park_id,migration_batch_id,source_session_id,source_person_code,source_assessor_code
  );

CREATE TRIGGER trg_hr_perf_legacy_session_immutable
  BEFORE UPDATE OR DELETE ON hr_performance_legacy_session
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_legacy_fact_guard();
CREATE TRIGGER trg_hr_perf_legacy_score_immutable
  BEFORE UPDATE OR DELETE ON hr_performance_legacy_score_source
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_legacy_fact_guard();
CREATE TRIGGER trg_hr_perf_legacy_source_person_immutable
  BEFORE UPDATE OR DELETE ON hr_performance_legacy_source_person_assignment
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_legacy_fact_guard();

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_assert_relation_record_map(p_map_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_fact record;
  v_map legacy_record_map%ROWTYPE;
BEGIN
  SELECT fact.*,count(*) OVER() AS fact_count INTO v_fact FROM (
    SELECT legacy_record_map_id,migration_batch_id,id,source_identity_sha256,source_row_sha256,
           'dbo.asssession'::varchar source_table,'hr_performance_legacy_session'::varchar target_table
    FROM hr_performance_legacy_session WHERE legacy_record_map_id=p_map_id
    UNION ALL
    SELECT legacy_record_map_id,migration_batch_id,id,source_identity_sha256,source_row_sha256,
           'dbo.asssour','hr_performance_legacy_score_source'
    FROM hr_performance_legacy_score_source WHERE legacy_record_map_id=p_map_id
    UNION ALL
    SELECT legacy_record_map_id,migration_batch_id,id,source_identity_sha256,source_row_sha256,
           'dbo.asssourperson','hr_performance_legacy_source_person_assignment'
    FROM hr_performance_legacy_source_person_assignment WHERE legacy_record_map_id=p_map_id
  ) fact;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_fact.fact_count<>1 THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_MAP_COLLISION'; END IF;
  SELECT * INTO v_map FROM legacy_record_map WHERE id=p_map_id FOR SHARE;
  IF NOT FOUND OR v_map.batch_id<>v_fact.migration_batch_id
    OR v_map.source_system<>'yuzhou-v10' OR v_map.source_table<>v_fact.source_table
    OR v_map.source_identity_sha256<>v_fact.source_identity_sha256
    OR v_map.source_row_sha256<>v_fact.source_row_sha256 OR v_map.target_table<>v_fact.target_table
    OR v_map.target_id<>v_fact.id OR v_map.mapping_status NOT IN('loaded','verified') OR NOT v_map.is_active THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_MAP_MISMATCH';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_validate_relation_map_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN PERFORM hr_performance_yuzhou_assert_relation_record_map(OLD.legacy_record_map_id); END IF;
  IF TG_OP<>'DELETE' THEN PERFORM hr_performance_yuzhou_assert_relation_record_map(NEW.legacy_record_map_id); END IF;
  RETURN COALESCE(NEW,OLD);
END$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_validate_relation_map_reverse_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM hr_performance_yuzhou_assert_relation_record_map(COALESCE(NEW.id,OLD.id));
  RETURN COALESCE(NEW,OLD);
END$$;

CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_session_map_exact
  AFTER INSERT OR UPDATE OR DELETE ON hr_performance_legacy_session
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_validate_relation_map_trigger();
CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_score_map_exact
  AFTER INSERT OR UPDATE OR DELETE ON hr_performance_legacy_score_source
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_validate_relation_map_trigger();
CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_source_person_map_exact
  AFTER INSERT OR UPDATE OR DELETE ON hr_performance_legacy_source_person_assignment
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_validate_relation_map_trigger();
CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_relation_map_reverse_exact
  AFTER INSERT OR UPDATE OR DELETE ON legacy_record_map
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_validate_relation_map_reverse_trigger();

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_prepare_relation_record_map(
  p_batch_id uuid,p_source_table varchar,p_source_identity_sha256 char(64),
  p_source_row_sha256 char(64),p_target_table varchar
) RETURNS TABLE(map_id uuid,fact_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_existing legacy_record_map%ROWTYPE;
  v_namespace constant uuid:='4c377793-4707-4adb-b2bb-7d61ecf73157';
BEGIN
  IF p_target_table<>(CASE p_source_table
      WHEN 'dbo.asssession' THEN 'hr_performance_legacy_session'
      WHEN 'dbo.asssour' THEN 'hr_performance_legacy_score_source'
      WHEN 'dbo.asssourperson' THEN 'hr_performance_legacy_source_person_assignment'
    END)
    OR p_source_identity_sha256!~'^[0-9a-f]{64}$' OR p_source_row_sha256!~'^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_IDENTITY_INVALID';
  END IF;
  fact_id:=uuid_generate_v5(v_namespace,'fact:'||p_batch_id::text||':'||p_source_table||':'||p_source_identity_sha256);
  map_id:=uuid_generate_v5(v_namespace,'map:'||p_batch_id::text||':'||p_source_table||':'||p_source_identity_sha256);
  SELECT * INTO v_existing FROM legacy_record_map
  WHERE source_system='yuzhou-v10' AND source_table=p_source_table
    AND source_identity_sha256=p_source_identity_sha256 AND is_active FOR SHARE;
  IF FOUND THEN
    IF v_existing.id<>map_id OR v_existing.batch_id<>p_batch_id
      OR v_existing.source_row_sha256<>p_source_row_sha256 OR v_existing.target_table<>p_target_table
      OR v_existing.target_id<>fact_id OR v_existing.mapping_status NOT IN('loaded','verified') THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_REPLAY_DRIFT';
    END IF;
    RETURN NEXT; RETURN;
  END IF;
  INSERT INTO legacy_record_map(
    id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
    source_row_sha256,target_table,target_id,mapping_status,is_active
  ) VALUES(
    map_id,p_batch_id,'yuzhou-v10',p_source_table,'sha256:'||p_source_identity_sha256,
    p_source_identity_sha256,p_source_row_sha256,p_target_table,fact_id,'loaded',true
  );
  RETURN NEXT;
END$$;

CREATE OR REPLACE PROCEDURE materialize_yuzhou_performance_legacy_relations_lab(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid,p_payload jsonb
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_row jsonb; v_map_id uuid; v_fact_id uuid; v_session_id uuid; v_dimension_id uuid;
  v_expected bigint; v_actual bigint;
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_REQUIRES_SERIALIZABLE';
  END IF;
  PERFORM 1 FROM migration_batch batch WHERE batch.id=p_batch_id AND batch.source_system='yuzhou-v10'
    AND batch.target_database=current_database() AND batch.execution_context='lab_rehearsal'
    AND batch.phase='load' AND batch.status='running' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_BATCH_INVALID'; END IF;
  IF btrim(COALESCE(p_tenant_id,''))='' OR btrim(COALESCE(p_park_id,''))='' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_SCOPE_INVALID';
  END IF;
  IF NOT hr_performance_yuzhou_jsonb_exact_keys(p_payload,ARRAY['asssession','asssour','asssourperson'])
    OR jsonb_typeof(p_payload->'asssession')<>'array' OR jsonb_typeof(p_payload->'asssour')<>'array'
    OR jsonb_typeof(p_payload->'asssourperson')<>'array' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_PAYLOAD_INVALID';
  END IF;
  LOCK TABLE legacy_record_map,hr_performance_legacy_session,hr_performance_legacy_score_source,
    hr_performance_legacy_source_person_assignment IN SHARE ROW EXCLUSIVE MODE;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'asssession') LOOP
    IF NOT hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','id','asssession','description',
      'assessmenttype','year','month','quarter','myorder'
    ]) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_SESSION_INVALID'; END IF;
    SELECT map_id,fact_id INTO v_map_id,v_fact_id FROM hr_performance_yuzhou_prepare_relation_record_map(
      p_batch_id,'dbo.asssession',v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256','hr_performance_legacy_session'
    );
    INSERT INTO hr_performance_legacy_session(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_session_id,source_session_name,source_description,
      source_assessment_type,source_year,source_month,source_quarter,source_my_order
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,v_row->>'sourceIdentitySha256',
      v_row->>'sourceRowSha256',(v_row->>'id')::integer,v_row->>'asssession',v_row->>'description',
      v_row->>'assessmenttype',(v_row->>'year')::integer,(v_row->>'month')::integer,
      (v_row->>'quarter')::integer,(v_row->>'myorder')::integer
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_session_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM hr_performance_legacy_session fact WHERE fact.id=v_fact_id
      AND fact.legacy_record_map_id=v_map_id AND fact.source_row_sha256=v_row->>'sourceRowSha256') THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_REPLAY_DRIFT'; END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'asssour') LOOP
    IF NOT hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','id','asssessionid','person','assitemid',
      'lb','itemvalue','assgrade','appraisal'
    ]) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_SCORE_INVALID'; END IF;
    SELECT id INTO v_session_id FROM hr_performance_legacy_session WHERE
      (tenant_id,park_id,migration_batch_id,source_session_id)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'asssessionid')::integer);
    SELECT id INTO v_dimension_id FROM hr_performance_legacy_dimension_profile WHERE
      (tenant_id,park_id,migration_batch_id,source_item_id)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'assitemid')::integer);
    SELECT map_id,fact_id INTO v_map_id,v_fact_id FROM hr_performance_yuzhou_prepare_relation_record_map(
      p_batch_id,'dbo.asssour',v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256','hr_performance_legacy_score_source'
    );
    INSERT INTO hr_performance_legacy_score_source(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_score_id,source_session_id,source_person_code,source_item_id,
      source_relation_type,source_item_value,source_ass_grade,source_appraisal,
      legacy_session_id,legacy_dimension_profile_id
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,v_row->>'sourceIdentitySha256',
      v_row->>'sourceRowSha256',(v_row->>'id')::integer,(v_row->>'asssessionid')::integer,
      v_row->>'person',(v_row->>'assitemid')::integer,(v_row->>'lb')::integer,
      (v_row->>'itemvalue')::numeric(18,2),v_row->>'assgrade',v_row->>'appraisal',v_session_id,v_dimension_id
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_score_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM hr_performance_legacy_score_source fact WHERE fact.id=v_fact_id
      AND fact.legacy_record_map_id=v_map_id AND fact.source_row_sha256=v_row->>'sourceRowSha256'
      AND fact.legacy_session_id IS NOT DISTINCT FROM v_session_id
      AND fact.legacy_dimension_profile_id IS NOT DISTINCT FROM v_dimension_id) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_REPLAY_DRIFT'; END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'asssourperson') LOOP
    IF NOT hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','id','asssessionid','person','assperson','lb'
    ]) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_SOURCE_PERSON_INVALID'; END IF;
    SELECT id INTO v_session_id FROM hr_performance_legacy_session WHERE
      (tenant_id,park_id,migration_batch_id,source_session_id)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'asssessionid')::integer);
    SELECT map_id,fact_id INTO v_map_id,v_fact_id FROM hr_performance_yuzhou_prepare_relation_record_map(
      p_batch_id,'dbo.asssourperson',v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256',
      'hr_performance_legacy_source_person_assignment'
    );
    INSERT INTO hr_performance_legacy_source_person_assignment(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_assignment_id,source_session_id,source_person_code,
      source_assessor_code,source_relation_type,legacy_session_id
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,v_row->>'sourceIdentitySha256',
      v_row->>'sourceRowSha256',(v_row->>'id')::integer,(v_row->>'asssessionid')::integer,
      v_row->>'person',v_row->>'assperson',(v_row->>'lb')::integer,v_session_id
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_assignment_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM hr_performance_legacy_source_person_assignment fact WHERE fact.id=v_fact_id
      AND fact.legacy_record_map_id=v_map_id AND fact.source_row_sha256=v_row->>'sourceRowSha256'
      AND fact.legacy_session_id IS NOT DISTINCT FROM v_session_id) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_REPLAY_DRIFT'; END IF;
  END LOOP;

  v_expected:=jsonb_array_length(p_payload->'asssession')+jsonb_array_length(p_payload->'asssour')
    +jsonb_array_length(p_payload->'asssourperson');
  SELECT count(*) INTO v_actual FROM legacy_record_map WHERE batch_id=p_batch_id AND is_active
    AND target_table IN('hr_performance_legacy_session','hr_performance_legacy_score_source',
      'hr_performance_legacy_source_person_assignment');
  IF v_actual<>v_expected THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RELATION_WRITER_CONSERVATION_FAILED'; END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
END$$;

REVOKE ALL ON hr_performance_legacy_session FROM PUBLIC;
REVOKE ALL ON hr_performance_legacy_score_source FROM PUBLIC;
REVOKE ALL ON hr_performance_legacy_source_person_assignment FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_assert_relation_record_map(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_validate_relation_map_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_validate_relation_map_reverse_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_prepare_relation_record_map(uuid,varchar,char,char,varchar) FROM PUBLIC;
REVOKE ALL ON PROCEDURE materialize_yuzhou_performance_legacy_relations_lab(varchar,varchar,uuid,jsonb) FROM PUBLIC;

COMMIT;
