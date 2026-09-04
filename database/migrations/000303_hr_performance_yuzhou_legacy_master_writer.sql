BEGIN;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_prepare_master_record_map(
  p_batch_id uuid,
  p_source_identity_sha256 char(64),
  p_source_row_sha256 char(64)
) RETURNS TABLE(map_id uuid,fact_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_existing legacy_record_map%ROWTYPE;
  v_namespace constant uuid:='4c377793-4707-4adb-b2bb-7d61ecf73157';
BEGIN
  IF p_source_identity_sha256!~'^[0-9a-f]{64}$'
    OR p_source_row_sha256!~'^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_MASTER_WRITER_IDENTITY_INVALID';
  END IF;
  fact_id:=uuid_generate_v5(
    v_namespace,'fact:'||p_batch_id::text||':dbo.assessmentmaster:'||p_source_identity_sha256
  );
  map_id:=uuid_generate_v5(
    v_namespace,'map:'||p_batch_id::text||':dbo.assessmentmaster:'||p_source_identity_sha256
  );

  SELECT * INTO v_existing FROM legacy_record_map
  WHERE source_system='yuzhou-v10'
    AND source_table='dbo.assessmentmaster'
    AND source_identity_sha256=p_source_identity_sha256
    AND is_active
  FOR SHARE;
  IF FOUND THEN
    IF v_existing.id<>map_id OR v_existing.batch_id<>p_batch_id
      OR v_existing.source_row_sha256<>p_source_row_sha256
      OR v_existing.target_table<>'hr_performance_legacy_master_result'
      OR v_existing.target_id<>fact_id
      OR v_existing.mapping_status NOT IN('loaded','verified') THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_MASTER_WRITER_REPLAY_DRIFT';
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO legacy_record_map(
    id,batch_id,source_system,source_table,source_pk_canonical,
    source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active
  ) VALUES(
    map_id,p_batch_id,'yuzhou-v10','dbo.assessmentmaster',
    'sha256:'||p_source_identity_sha256,p_source_identity_sha256,p_source_row_sha256,
    'hr_performance_legacy_master_result',fact_id,'loaded',true
  );
  RETURN NEXT;
END$$;

CREATE OR REPLACE PROCEDURE materialize_yuzhou_performance_legacy_master_lab(
  p_tenant_id varchar,
  p_park_id varchar,
  p_batch_id uuid,
  p_payload jsonb
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_row jsonb;
  v_map_id uuid;
  v_fact_id uuid;
  v_template_id uuid;
  v_expected bigint;
  v_actual bigint;
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_MASTER_WRITER_REQUIRES_SERIALIZABLE';
  END IF;
  PERFORM 1 FROM migration_batch batch
  WHERE batch.id=p_batch_id AND batch.source_system='yuzhou-v10'
    AND batch.target_database=current_database()
    AND batch.execution_context='lab_rehearsal'
    AND batch.phase='load' AND batch.status='running'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_MASTER_WRITER_BATCH_INVALID'; END IF;
  IF btrim(COALESCE(p_tenant_id,''))='' OR btrim(COALESCE(p_park_id,''))='' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_MASTER_WRITER_SCOPE_INVALID';
  END IF;
  IF NOT hr_performance_yuzhou_jsonb_exact_keys(p_payload,ARRAY['assessmentmaster'])
    OR jsonb_typeof(p_payload->'assessmentmaster')<>'array' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_MASTER_WRITER_PAYLOAD_INVALID';
  END IF;

  LOCK TABLE legacy_record_map,hr_performance_legacy_master_result,
    hr_performance_legacy_template_profile,hr_performance_legacy_dimension_profile,
    hr_performance_legacy_dimension_result IN SHARE ROW EXCLUSIVE MODE;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'assessmentmaster') LOOP
    IF NOT hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','id','asssessionid','person','selfgrade',
      'assgrade','selfvalue','itemvalue','mitemvalue','xitemvalue','citemvalue',
      'mastervalue','timekeepvalue','bonusvalue','totalvalue','selfappraisal','appraisal',
      'pay','assessmentperson','recdate','operator','des'
    ]) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_MASTER_WRITER_ROW_INVALID'; END IF;

    v_template_id:=NULL;
    SELECT min(candidate.template_id::text)::uuid INTO v_template_id
    FROM (
      SELECT DISTINCT dimension.legacy_template_profile_id template_id
      FROM hr_performance_legacy_dimension_result result
      JOIN hr_performance_legacy_dimension_profile dimension
        ON (dimension.id,dimension.tenant_id,dimension.park_id,dimension.migration_batch_id)=
           (result.legacy_dimension_profile_id,result.tenant_id,result.park_id,result.migration_batch_id)
      WHERE (result.tenant_id,result.park_id,result.migration_batch_id)=
            (p_tenant_id,p_park_id,p_batch_id)
        AND result.source_session_id IS NOT DISTINCT FROM (v_row->>'asssessionid')::integer
        AND result.source_person_code IS NOT DISTINCT FROM v_row->>'person'
        AND dimension.legacy_template_profile_id IS NOT NULL
    ) candidate
    HAVING count(*)=1;

    SELECT map_id,fact_id INTO v_map_id,v_fact_id
    FROM hr_performance_yuzhou_prepare_master_record_map(
      p_batch_id,v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256'
    );
    INSERT INTO hr_performance_legacy_master_result(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,
      source_identity_sha256,source_row_sha256,source_master_id,source_session_id,
      source_person_code,source_self_grade,source_ass_grade,source_self_value,source_item_value,
      source_m_item_value,source_x_item_value,source_c_item_value,source_master_value,
      source_timekeep_value,source_bonus_value,source_total_value,source_self_appraisal,
      source_appraisal,source_pay,source_assessment_person,source_recorded_at,
      source_operator_code,source_description,legacy_template_profile_id
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,
      v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256',(v_row->>'id')::integer,
      (v_row->>'asssessionid')::integer,v_row->>'person',v_row->>'selfgrade',v_row->>'assgrade',
      (v_row->>'selfvalue')::numeric(18,2),(v_row->>'itemvalue')::numeric(18,2),
      (v_row->>'mitemvalue')::numeric(18,0),(v_row->>'xitemvalue')::numeric(18,0),
      (v_row->>'citemvalue')::numeric(18,0),(v_row->>'mastervalue')::numeric(18,2),
      (v_row->>'timekeepvalue')::numeric(18,2),(v_row->>'bonusvalue')::numeric(18,2),
      (v_row->>'totalvalue')::numeric(18,2),v_row->>'selfappraisal',v_row->>'appraisal',
      (v_row->>'pay')::numeric(19,4),v_row->>'assessmentperson',
      (v_row->>'recdate')::timestamp without time zone,v_row->>'operator',v_row->>'des',
      v_template_id
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_master_id) DO NOTHING;
    IF NOT EXISTS(
      SELECT 1 FROM hr_performance_legacy_master_result fact
      WHERE fact.id=v_fact_id AND fact.legacy_record_map_id=v_map_id
        AND fact.source_row_sha256=v_row->>'sourceRowSha256'
        AND fact.legacy_template_profile_id IS NOT DISTINCT FROM v_template_id
        AND (fact.tenant_id,fact.park_id,fact.migration_batch_id)=
            (p_tenant_id,p_park_id,p_batch_id)
    ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_MASTER_WRITER_REPLAY_DRIFT'; END IF;
  END LOOP;

  v_expected:=jsonb_array_length(p_payload->'assessmentmaster');
  SELECT count(*) INTO v_actual FROM hr_performance_legacy_master_result
  WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id);
  IF v_actual<>v_expected THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_MASTER_WRITER_CONSERVATION_FAILED';
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
END$$;

REVOKE ALL ON FUNCTION hr_performance_yuzhou_prepare_master_record_map(uuid,char,char) FROM PUBLIC;
REVOKE ALL ON PROCEDURE materialize_yuzhou_performance_legacy_master_lab(varchar,varchar,uuid,jsonb) FROM PUBLIC;

COMMIT;
