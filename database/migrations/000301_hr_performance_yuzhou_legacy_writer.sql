BEGIN;

-- This writer deliberately remains lab-only.  It materializes one complete,
-- privately staged performance payload into the lossless compatibility layer
-- added by 000300.  Production authorization and the modern workflow
-- projection are separate later slices.

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_jsonb_exact_keys(
  p_value jsonb,
  p_keys text[]
) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT COALESCE(jsonb_typeof(p_value)='object'
    AND p_value ?& p_keys
    AND NOT EXISTS(
      SELECT 1 FROM jsonb_object_keys(p_value) key
      WHERE NOT key=ANY(p_keys)
    ),false)
$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_prepare_record_map(
  p_batch_id uuid,
  p_source_table varchar,
  p_source_identity_sha256 char(64),
  p_source_row_sha256 char(64),
  p_target_table varchar
) RETURNS TABLE(map_id uuid,fact_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_existing legacy_record_map%ROWTYPE;
  v_namespace constant uuid:='4c377793-4707-4adb-b2bb-7d61ecf73157';
BEGIN
  IF p_source_table NOT IN(
    'dbo.assessmentcode','dbo.assgradecode','dbo.assitem',
    'dbo.assitemgradedes','dbo.assessmentdetail'
  ) OR p_target_table NOT IN(
    'hr_performance_legacy_template_profile','hr_performance_legacy_level_rule',
    'hr_performance_legacy_dimension_profile','hr_performance_legacy_dimension_level_guide',
    'hr_performance_legacy_dimension_result'
  ) OR p_target_table<>(CASE p_source_table
    WHEN 'dbo.assessmentcode' THEN 'hr_performance_legacy_template_profile'
    WHEN 'dbo.assgradecode' THEN 'hr_performance_legacy_level_rule'
    WHEN 'dbo.assitem' THEN 'hr_performance_legacy_dimension_profile'
    WHEN 'dbo.assitemgradedes' THEN 'hr_performance_legacy_dimension_level_guide'
    WHEN 'dbo.assessmentdetail' THEN 'hr_performance_legacy_dimension_result'
    END) OR p_source_identity_sha256!~'^[0-9a-f]{64}$'
    OR p_source_row_sha256!~'^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_IDENTITY_INVALID';
  END IF;

  fact_id:=uuid_generate_v5(
    v_namespace,
    'fact:'||p_batch_id::text||':'||p_source_table||':'||p_source_identity_sha256
  );
  map_id:=uuid_generate_v5(
    v_namespace,
    'map:'||p_batch_id::text||':'||p_source_table||':'||p_source_identity_sha256
  );

  SELECT * INTO v_existing
  FROM legacy_record_map
  WHERE source_system='yuzhou-v10'
    AND source_table=p_source_table
    AND source_identity_sha256=p_source_identity_sha256
    AND is_active
  FOR SHARE;

  IF FOUND THEN
    IF v_existing.id<>map_id OR v_existing.batch_id<>p_batch_id
      OR v_existing.source_row_sha256<>p_source_row_sha256
      OR v_existing.target_table<>p_target_table OR v_existing.target_id<>fact_id
      OR v_existing.mapping_status NOT IN('loaded','verified') THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_REPLAY_DRIFT';
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO legacy_record_map(
    id,batch_id,source_system,source_table,source_pk_canonical,
    source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active
  ) VALUES(
    map_id,p_batch_id,'yuzhou-v10',p_source_table,
    'sha256:'||p_source_identity_sha256,p_source_identity_sha256,p_source_row_sha256,
    p_target_table,fact_id,'loaded',true
  );
  RETURN NEXT;
END$$;

CREATE OR REPLACE PROCEDURE materialize_yuzhou_performance_legacy_lab(
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
  v_parent_id uuid;
  v_level_id uuid;
  v_expected bigint;
  v_actual bigint;
  v_entry record;
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_REQUIRES_SERIALIZABLE';
  END IF;
  PERFORM 1 FROM migration_batch batch
  WHERE batch.id=p_batch_id AND batch.source_system='yuzhou-v10'
    AND batch.target_database=current_database()
    AND batch.execution_context='lab_rehearsal'
    AND batch.phase='load' AND batch.status='running'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_BATCH_INVALID'; END IF;
  IF btrim(COALESCE(p_tenant_id,''))='' OR btrim(COALESCE(p_park_id,''))='' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_SCOPE_INVALID';
  END IF;
  IF NOT hr_performance_yuzhou_jsonb_exact_keys(
    p_payload,ARRAY['assessmentcode','assgradecode','assitem','assitemgradedes','assessmentdetail']
  ) OR EXISTS(
    SELECT 1 FROM jsonb_each(p_payload) entry WHERE jsonb_typeof(entry.value)<>'array'
  ) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_PAYLOAD_INVALID';
  END IF;

  LOCK TABLE legacy_record_map,
    hr_performance_legacy_template_profile,hr_performance_legacy_level_rule,
    hr_performance_legacy_dimension_profile,hr_performance_legacy_dimension_level_guide,
    hr_performance_legacy_dimension_result IN SHARE ROW EXCLUSIVE MODE;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'assessmentcode') LOOP
    IF NOT hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','assessment','assessmentname','department',
      'mpercent','tpercent','xpercent','cpercent','spercent','timekeep','bonus','master'
    ]) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_ASSESSMENTCODE_INVALID'; END IF;
    SELECT map_id,fact_id INTO v_map_id,v_fact_id
    FROM hr_performance_yuzhou_prepare_record_map(
      p_batch_id,'dbo.assessmentcode',v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256',
      'hr_performance_legacy_template_profile'
    );
    INSERT INTO hr_performance_legacy_template_profile(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,
      source_identity_sha256,source_row_sha256,source_assessment,source_assessment_name,
      source_department,source_m_percent,source_t_percent,source_x_percent,source_c_percent,
      source_s_percent,source_timekeep,source_bonus,source_master
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,
      v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256',(v_row->>'assessment')::integer,
      v_row->>'assessmentname',v_row->>'department',(v_row->>'mpercent')::integer,
      (v_row->>'tpercent')::integer,(v_row->>'xpercent')::integer,(v_row->>'cpercent')::integer,
      (v_row->>'spercent')::integer,(v_row->>'timekeep')::boolean,
      (v_row->>'bonus')::boolean,(v_row->>'master')::boolean
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_assessment) DO NOTHING;
    IF NOT EXISTS(
      SELECT 1 FROM hr_performance_legacy_template_profile fact
      WHERE fact.id=v_fact_id AND fact.legacy_record_map_id=v_map_id
        AND fact.source_row_sha256=v_row->>'sourceRowSha256'
        AND (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_REPLAY_DRIFT'; END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'assgradecode') LOOP
    IF NOT hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','assgrade','description','myorder',
      'assessmentid','minvalue','maxvalue'
    ]) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_ASSGRADECODE_INVALID'; END IF;
    SELECT id INTO v_parent_id FROM hr_performance_legacy_template_profile
    WHERE (tenant_id,park_id,migration_batch_id,source_assessment)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'assessmentid')::integer);
    SELECT map_id,fact_id INTO v_map_id,v_fact_id
    FROM hr_performance_yuzhou_prepare_record_map(
      p_batch_id,'dbo.assgradecode',v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256',
      'hr_performance_legacy_level_rule'
    );
    INSERT INTO hr_performance_legacy_level_rule(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_ass_grade,source_description,source_my_order,
      source_assessment_id,source_min_value,source_max_value,legacy_template_profile_id
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,v_row->>'sourceIdentitySha256',
      v_row->>'sourceRowSha256',v_row->>'assgrade',v_row->>'description',v_row->>'myorder',
      (v_row->>'assessmentid')::integer,(v_row->>'minvalue')::integer,
      (v_row->>'maxvalue')::integer,v_parent_id
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_ass_grade) DO NOTHING;
    IF NOT EXISTS(
      SELECT 1 FROM hr_performance_legacy_level_rule fact
      WHERE fact.id=v_fact_id AND fact.legacy_record_map_id=v_map_id
        AND fact.source_row_sha256=v_row->>'sourceRowSha256'
        AND fact.legacy_template_profile_id IS NOT DISTINCT FROM v_parent_id
    ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_REPLAY_DRIFT'; END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'assitem') LOOP
    IF NOT hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','id','assid','assitem','fullvalue','myorder'
    ]) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_ASSITEM_INVALID'; END IF;
    SELECT id INTO v_parent_id FROM hr_performance_legacy_template_profile
    WHERE (tenant_id,park_id,migration_batch_id,source_assessment)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'assid')::integer);
    SELECT map_id,fact_id INTO v_map_id,v_fact_id
    FROM hr_performance_yuzhou_prepare_record_map(
      p_batch_id,'dbo.assitem',v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256',
      'hr_performance_legacy_dimension_profile'
    );
    INSERT INTO hr_performance_legacy_dimension_profile(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_item_id,source_assessment_id,source_item_name,
      source_full_value,source_my_order,legacy_template_profile_id
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,v_row->>'sourceIdentitySha256',
      v_row->>'sourceRowSha256',(v_row->>'id')::integer,(v_row->>'assid')::integer,
      v_row->>'assitem',(v_row->>'fullvalue')::numeric(18,2),(v_row->>'myorder')::integer,v_parent_id
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_item_id) DO NOTHING;
    IF NOT EXISTS(
      SELECT 1 FROM hr_performance_legacy_dimension_profile fact
      WHERE fact.id=v_fact_id AND fact.legacy_record_map_id=v_map_id
        AND fact.source_row_sha256=v_row->>'sourceRowSha256'
        AND fact.legacy_template_profile_id IS NOT DISTINCT FROM v_parent_id
    ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_REPLAY_DRIFT'; END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'assitemgradedes') LOOP
    IF NOT hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','id','assitemid','grade','description',
      'minvalue','maxvalue','myorder'
    ]) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_ASSITEMGRADEDES_INVALID'; END IF;
    SELECT id INTO v_parent_id FROM hr_performance_legacy_dimension_profile
    WHERE (tenant_id,park_id,migration_batch_id,source_item_id)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'assitemid')::integer);
    SELECT id INTO v_level_id FROM hr_performance_legacy_level_rule
    WHERE (tenant_id,park_id,migration_batch_id,source_ass_grade)=
      (p_tenant_id,p_park_id,p_batch_id,v_row->>'grade');
    SELECT map_id,fact_id INTO v_map_id,v_fact_id
    FROM hr_performance_yuzhou_prepare_record_map(
      p_batch_id,'dbo.assitemgradedes',v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256',
      'hr_performance_legacy_dimension_level_guide'
    );
    INSERT INTO hr_performance_legacy_dimension_level_guide(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_guide_id,source_item_id,source_grade,source_description,
      source_min_value,source_max_value,source_my_order,legacy_dimension_profile_id,legacy_level_rule_id
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,v_row->>'sourceIdentitySha256',
      v_row->>'sourceRowSha256',(v_row->>'id')::integer,(v_row->>'assitemid')::integer,
      v_row->>'grade',v_row->>'description',(v_row->>'minvalue')::integer,
      (v_row->>'maxvalue')::integer,(v_row->>'myorder')::integer,v_parent_id,v_level_id
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_guide_id) DO NOTHING;
    IF NOT EXISTS(
      SELECT 1 FROM hr_performance_legacy_dimension_level_guide fact
      WHERE fact.id=v_fact_id AND fact.legacy_record_map_id=v_map_id
        AND fact.source_row_sha256=v_row->>'sourceRowSha256'
        AND fact.legacy_dimension_profile_id IS NOT DISTINCT FROM v_parent_id
        AND fact.legacy_level_rule_id IS NOT DISTINCT FROM v_level_id
    ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_REPLAY_DRIFT'; END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'assessmentdetail') LOOP
    IF NOT hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','id','asssessionid','person','assitemid',
      'selfvalue','mitemvalue','itemvalue','xitemvalue','citemvalue','selfgrade','assgrade','appraisal'
    ]) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_ASSESSMENTDETAIL_INVALID'; END IF;
    SELECT id INTO v_parent_id FROM hr_performance_legacy_dimension_profile
    WHERE (tenant_id,park_id,migration_batch_id,source_item_id)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'assitemid')::integer);
    SELECT map_id,fact_id INTO v_map_id,v_fact_id
    FROM hr_performance_yuzhou_prepare_record_map(
      p_batch_id,'dbo.assessmentdetail',v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256',
      'hr_performance_legacy_dimension_result'
    );
    INSERT INTO hr_performance_legacy_dimension_result(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_detail_id,source_session_id,source_person_code,source_item_id,
      source_self_value,source_m_item_value,source_item_value,source_x_item_value,source_c_item_value,
      source_self_grade,source_ass_grade,source_appraisal,legacy_dimension_profile_id
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,v_row->>'sourceIdentitySha256',
      v_row->>'sourceRowSha256',(v_row->>'id')::integer,(v_row->>'asssessionid')::integer,
      v_row->>'person',(v_row->>'assitemid')::integer,(v_row->>'selfvalue')::numeric(18,2),
      (v_row->>'mitemvalue')::numeric(18,2),(v_row->>'itemvalue')::numeric(18,2),
      (v_row->>'xitemvalue')::numeric(18,2),(v_row->>'citemvalue')::numeric(18,2),
      v_row->>'selfgrade',v_row->>'assgrade',v_row->>'appraisal',v_parent_id
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_detail_id) DO NOTHING;
    IF NOT EXISTS(
      SELECT 1 FROM hr_performance_legacy_dimension_result fact
      WHERE fact.id=v_fact_id AND fact.legacy_record_map_id=v_map_id
        AND fact.source_row_sha256=v_row->>'sourceRowSha256'
        AND fact.legacy_dimension_profile_id IS NOT DISTINCT FROM v_parent_id
    ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_REPLAY_DRIFT'; END IF;
  END LOOP;

  FOR v_entry IN SELECT * FROM jsonb_each(p_payload) LOOP
    v_expected:=jsonb_array_length(v_entry.value);
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE tenant_id=$1 AND park_id=$2 AND migration_batch_id=$3',
      CASE v_entry.key
        WHEN 'assessmentcode' THEN 'hr_performance_legacy_template_profile'
        WHEN 'assgradecode' THEN 'hr_performance_legacy_level_rule'
        WHEN 'assitem' THEN 'hr_performance_legacy_dimension_profile'
        WHEN 'assitemgradedes' THEN 'hr_performance_legacy_dimension_level_guide'
        WHEN 'assessmentdetail' THEN 'hr_performance_legacy_dimension_result'
      END
    ) INTO v_actual USING p_tenant_id,p_park_id,p_batch_id;
    IF v_actual<>v_expected THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_WRITER_CONSERVATION_FAILED'; END IF;
  END LOOP;
  SET CONSTRAINTS ALL IMMEDIATE;
END$$;

REVOKE ALL ON FUNCTION hr_performance_yuzhou_jsonb_exact_keys(jsonb,text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_prepare_record_map(uuid,varchar,char,char,varchar) FROM PUBLIC;
REVOKE ALL ON PROCEDURE materialize_yuzhou_performance_legacy_lab(varchar,varchar,uuid,jsonb) FROM PUBLIC;

COMMIT;
