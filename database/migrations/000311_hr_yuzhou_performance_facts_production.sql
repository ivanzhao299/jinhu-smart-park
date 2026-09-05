BEGIN;

CREATE TABLE hr_yuzhou_performance_facts_production_receipt (
  operation_id varchar(64) PRIMARY KEY
    REFERENCES hr_yuzhou_production_import_operation(operation_id),
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id),
  sealed_plan_sha256 char(64) NOT NULL,
  performance_fact_loader_contract_sha256 char(64) NOT NULL,
  authorization_artifact_sha256 char(64) NOT NULL,
  authorization_nonce_sha256 char(64) NOT NULL,
  code_sha char(40) NOT NULL,
  source_snapshot_sha256 char(64) NOT NULL,
  mapping_contract_sha256 char(64) NOT NULL,
  target_identity_sha256 char(64) NOT NULL,
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  target_scope_sha256 char(64) NOT NULL,
  t0_phase_receipt_sha256 char(64) NOT NULL,
  source_restore_receipt_sha256 char(64) NOT NULL,
  source_fact_location_receipt_sha256 char(64) NOT NULL,
  source_fact_location_canonical_sha256 char(64) NOT NULL,
  fact_payload_artifact_sha256 char(64) NOT NULL,
  master_payload_artifact_sha256 char(64) NOT NULL,
  migration_300_sha256 char(64) NOT NULL,
  migration_301_sha256 char(64) NOT NULL,
  migration_302_sha256 char(64) NOT NULL,
  migration_303_sha256 char(64) NOT NULL,
  migration_310_sha256 char(64) NOT NULL,
  migration_311_sha256 char(64) NOT NULL,
  template_rows bigint NOT NULL,
  level_rule_rows bigint NOT NULL,
  dimension_rows bigint NOT NULL,
  guide_rows bigint NOT NULL,
  dimension_result_rows bigint NOT NULL,
  master_result_rows bigint NOT NULL,
  active_fact_maps bigint NOT NULL,
  identity_fact_set_sha256 char(64) NOT NULL,
  full_fact_set_sha256 char(64) NOT NULL,
  source_outcome_fact_status varchar(32) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'succeeded',
  receipt_sha256 char(64) NOT NULL,
  rollback_operation_id varchar(72)
    REFERENCES hr_yuzhou_production_import_rollback_operation(rollback_operation_id),
  rollback_receipt_sha256 char(64),
  applied_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  CONSTRAINT ck_hr_yuzhou_perf_facts_prod_hashes CHECK (
    sealed_plan_sha256~'^[0-9a-f]{64}$'
    AND performance_fact_loader_contract_sha256~'^[0-9a-f]{64}$'
    AND authorization_artifact_sha256~'^[0-9a-f]{64}$'
    AND authorization_nonce_sha256~'^[0-9a-f]{64}$'
    AND code_sha~'^[0-9a-f]{40}$'
    AND source_snapshot_sha256~'^[0-9a-f]{64}$'
    AND mapping_contract_sha256~'^[0-9a-f]{64}$'
    AND target_identity_sha256~'^[0-9a-f]{64}$'
    AND target_scope_sha256~'^[0-9a-f]{64}$'
    AND t0_phase_receipt_sha256~'^[0-9a-f]{64}$'
    AND source_restore_receipt_sha256~'^[0-9a-f]{64}$'
    AND source_fact_location_receipt_sha256~'^[0-9a-f]{64}$'
    AND source_fact_location_canonical_sha256~'^[0-9a-f]{64}$'
    AND fact_payload_artifact_sha256~'^[0-9a-f]{64}$'
    AND master_payload_artifact_sha256~'^[0-9a-f]{64}$'
    AND migration_300_sha256~'^[0-9a-f]{64}$'
    AND migration_301_sha256~'^[0-9a-f]{64}$'
    AND migration_302_sha256~'^[0-9a-f]{64}$'
    AND migration_303_sha256~'^[0-9a-f]{64}$'
    AND migration_310_sha256~'^[0-9a-f]{64}$'
    AND migration_311_sha256~'^[0-9a-f]{64}$'
    AND identity_fact_set_sha256~'^[0-9a-f]{64}$'
    AND full_fact_set_sha256~'^[0-9a-f]{64}$'
    AND receipt_sha256~'^[0-9a-f]{64}$'
    AND (rollback_receipt_sha256 IS NULL OR rollback_receipt_sha256~'^[0-9a-f]{64}$')
  ),
  CONSTRAINT ck_hr_yuzhou_perf_facts_prod_counts CHECK (
    template_rows>=0 AND level_rule_rows>=0 AND dimension_rows>=0 AND guide_rows>=0
    AND dimension_result_rows>=0 AND master_result_rows>=0
    AND active_fact_maps IN(0,template_rows+level_rule_rows+dimension_rows+guide_rows+
      dimension_result_rows+master_result_rows)
  ),
  CONSTRAINT ck_hr_yuzhou_perf_facts_prod_source_status CHECK (
    (source_outcome_fact_status='AUTHORITATIVE_EMPTY'
      AND dimension_result_rows=0 AND master_result_rows=0)
    OR (source_outcome_fact_status='AUTHORITATIVE_NONEMPTY'
      AND dimension_result_rows+master_result_rows>0)
  ),
  CONSTRAINT ck_hr_yuzhou_perf_facts_prod_status CHECK (
    (status='succeeded' AND rollback_operation_id IS NULL
      AND rollback_receipt_sha256 IS NULL AND rolled_back_at IS NULL
      AND active_fact_maps=template_rows+level_rule_rows+dimension_rows+guide_rows+
        dimension_result_rows+master_result_rows)
    OR (status='rolled_back' AND rollback_operation_id IS NOT NULL
      AND rollback_receipt_sha256 IS NOT NULL AND rolled_back_at IS NOT NULL
      AND active_fact_maps=0)
  )
);

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_facts_production_capability_v1()
RETURNS TABLE(
  capability_id text,migration_300_sha256 char(64),migration_301_sha256 char(64),
  migration_302_sha256 char(64),migration_303_sha256 char(64),
  fact_identity_dependency_supported boolean,reverse_order text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  SELECT 'jinhu-yuzhou-performance-fact-loader-production-v1'::text,
    'ab3410b2121e0772c4b0cc6f273c893340b7925dcecf26414ea336f15dd0656a'::char(64),
    '4a4de62295d7e4ac7e752c435eba49483da7d79384c34aa992b9bc5f1f618e7e'::char(64),
    '7b45377d252a9593d779af779bcb9d6f91ceb326f6b5da1273da50b89f52e43a'::char(64),
    '853d7632ebd2c2c3a9211e0088a3ccda7979a788539db2123aaf43c59c070648'::char(64),
    true,
    'master_result>dimension_result>dimension_level_guide>dimension_profile>level_rule>template_profile'::text
$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_facts_production_context_allowed_v1(
  p_batch_id uuid,p_mode varchar
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT CASE p_mode
    WHEN 'apply' THEN EXISTS(
      SELECT 1
      FROM public.migration_batch batch
      JOIN public.hr_yuzhou_production_import_operation operation
        ON operation.operation_id=batch.production_import_operation_id
      JOIN public.hr_yuzhou_production_import_phase phase
        ON (phase.operation_id,phase.phase)=(operation.operation_id,'T0')
      JOIN public.hr_yuzhou_production_import_authorization_use auth
        ON auth.operation_id=operation.operation_id
       AND auth.import_operation_id=operation.operation_id
       AND auth.intent='production_import'
      WHERE batch.id=p_batch_id AND batch.execution_context='production_import'
        AND batch.production_import_phase='T0' AND batch.target_database=current_database()
        AND batch.status='succeeded' AND operation.execution_contract_version=2
        AND operation.status='running' AND operation.current_phase='T0'
        AND phase.status='succeeded'
        AND current_setting('yuzhou.performance_facts_operation_id',true)=operation.operation_id
        AND current_setting('yuzhou.performance_facts_mode',true)='apply'
    )
    WHEN 'rollback' THEN EXISTS(
      SELECT 1
      FROM public.hr_yuzhou_performance_facts_production_receipt receipt
      JOIN public.migration_batch batch ON batch.id=receipt.migration_batch_id
      JOIN public.hr_yuzhou_production_import_rollback_operation rollback_operation
        ON rollback_operation.rollback_operation_id=
          current_setting('yuzhou.performance_facts_rollback_operation_id',true)
       AND rollback_operation.import_operation_id=receipt.operation_id
       AND rollback_operation.status='running'
      JOIN public.hr_yuzhou_production_import_authorization_use auth
        ON auth.operation_id=rollback_operation.rollback_operation_id
       AND auth.import_operation_id=receipt.operation_id
       AND auth.intent='production_import_rollback'
      WHERE receipt.migration_batch_id=p_batch_id AND receipt.status='succeeded'
        AND batch.execution_context='production_import'
        AND batch.production_import_phase='T0' AND batch.target_database=current_database()
        AND current_setting('yuzhou.performance_facts_operation_id',true)=receipt.operation_id
        AND current_setting('yuzhou.performance_facts_mode',true)='rollback'
        AND NOT EXISTS(SELECT 1
          FROM public.hr_yuzhou_performance_fact_identity_production_receipt identity_receipt
          WHERE identity_receipt.operation_id=receipt.operation_id
            AND (identity_receipt.fact_loader_receipt_sha256<>receipt.receipt_sha256
              OR identity_receipt.status<>'rolled_back'))
        AND NOT EXISTS(SELECT 1
          FROM public.hr_yuzhou_performance_relations_production_receipt relation_receipt
          WHERE relation_receipt.operation_id=receipt.operation_id
            AND relation_receipt.status<>'rolled_back')
    )
    ELSE false
  END
$$;

-- The installed 000301/000303 procedures remain the sole mapping bodies.
-- Their definitions are replaced only to add this reviewed production context
-- beside the original lab gate; all row transforms and replay checks remain
-- byte-for-byte inherited from the checksum-pinned predecessor migrations.
DO $$
DECLARE
  v_definition text;
  v_needle text:=$needle$AND batch.execution_context='lab_rehearsal'
    AND batch.phase='load' AND batch.status='running'$needle$;
  v_replacement text:=$replacement$AND (
      (batch.execution_context='lab_rehearsal'
        AND batch.phase='load' AND batch.status='running')
      OR public.hr_yuzhou_performance_facts_production_context_allowed_v1(p_batch_id,'apply')
    )$replacement$;
BEGIN
  SELECT pg_get_functiondef('public.materialize_yuzhou_performance_legacy_lab(varchar,varchar,uuid,jsonb)'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition,v_needle)=0 OR strpos(substr(v_definition,strpos(v_definition,v_needle)+length(v_needle)),v_needle)>0 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_SHARED_DETAIL_BODY_DRIFT';
  END IF;
  EXECUTE replace(v_definition,v_needle,v_replacement);

  SELECT pg_get_functiondef('public.materialize_yuzhou_performance_legacy_master_lab(varchar,varchar,uuid,jsonb)'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition,v_needle)=0 OR strpos(substr(v_definition,strpos(v_definition,v_needle)+length(v_needle)),v_needle)>0 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_SHARED_MASTER_BODY_DRIFT';
  END IF;
  EXECUTE replace(v_definition,v_needle,v_replacement);
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_full_fact_set_v1(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid
) RETURNS TABLE(
  template_rows bigint,level_rule_rows bigint,dimension_rows bigint,guide_rows bigint,
  dimension_result_rows bigint,master_result_rows bigint,active_fact_maps bigint,
  full_fact_set_sha256 char(64)
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  WITH facts AS (
    SELECT 'template_profile'::text fact_kind,source_identity_sha256,source_row_sha256
      FROM public.hr_performance_legacy_template_profile
      WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'level_rule',source_identity_sha256,source_row_sha256
      FROM public.hr_performance_legacy_level_rule
      WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'dimension_profile',source_identity_sha256,source_row_sha256
      FROM public.hr_performance_legacy_dimension_profile
      WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'dimension_level_guide',source_identity_sha256,source_row_sha256
      FROM public.hr_performance_legacy_dimension_level_guide
      WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'dimension_result',source_identity_sha256,source_row_sha256
      FROM public.hr_performance_legacy_dimension_result
      WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'master_result',source_identity_sha256,source_row_sha256
      FROM public.hr_performance_legacy_master_result
      WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
  ), counts AS (
    SELECT count(*) FILTER(WHERE fact_kind='template_profile') template_rows,
      count(*) FILTER(WHERE fact_kind='level_rule') level_rule_rows,
      count(*) FILTER(WHERE fact_kind='dimension_profile') dimension_rows,
      count(*) FILTER(WHERE fact_kind='dimension_level_guide') guide_rows,
      count(*) FILTER(WHERE fact_kind='dimension_result') dimension_result_rows,
      count(*) FILTER(WHERE fact_kind='master_result') master_result_rows
    FROM facts
  ), maps AS (
    SELECT count(*) active_fact_maps FROM public.legacy_record_map
    WHERE batch_id=p_batch_id AND is_active AND target_table IN(
      'hr_performance_legacy_template_profile','hr_performance_legacy_level_rule',
      'hr_performance_legacy_dimension_profile','hr_performance_legacy_dimension_level_guide',
      'hr_performance_legacy_dimension_result','hr_performance_legacy_master_result')
  ), canonical AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'factKind',fact_kind,'sourceIdentitySha256',source_identity_sha256,
      'sourceRowSha256',source_row_sha256
    ) ORDER BY fact_kind,source_identity_sha256),'[]'::jsonb) body FROM facts
  )
  SELECT counts.*,maps.active_fact_maps,
    encode(digest(convert_to(canonical.body::text,'UTF8'),'sha256'),'hex')::char(64)
  FROM counts CROSS JOIN maps CROSS JOIN canonical
$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_fact_loader_dependency_valid_v1(
  p_operation_id varchar,p_batch_id uuid,p_tenant_id varchar,p_park_id varchar,
  p_target_scope_sha256 char(64),p_t0_phase_receipt_sha256 char(64),
  p_fact_loader_receipt_sha256 char(64),p_identity_fact_set_sha256 char(64)
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.hr_yuzhou_performance_facts_production_receipt receipt
    CROSS JOIN LATERAL public.hr_yuzhou_performance_fact_identity_set_v1(
      receipt.tenant_id,receipt.park_id,receipt.migration_batch_id) identity_set
    CROSS JOIN LATERAL public.hr_yuzhou_performance_full_fact_set_v1(
      receipt.tenant_id,receipt.park_id,receipt.migration_batch_id) full_set
    WHERE receipt.operation_id=p_operation_id AND receipt.migration_batch_id=p_batch_id
      AND (receipt.tenant_id,receipt.park_id)=(p_tenant_id,p_park_id)
      AND receipt.target_scope_sha256=p_target_scope_sha256
      AND receipt.t0_phase_receipt_sha256=p_t0_phase_receipt_sha256
      AND receipt.receipt_sha256=p_fact_loader_receipt_sha256
      AND receipt.identity_fact_set_sha256=p_identity_fact_set_sha256
      AND receipt.status='succeeded'
      AND identity_set.dimension_rows=receipt.dimension_result_rows
      AND identity_set.master_rows=receipt.master_result_rows
      AND identity_set.fact_set_sha256=receipt.identity_fact_set_sha256
      AND ROW(full_set.template_rows,full_set.level_rule_rows,full_set.dimension_rows,
        full_set.guide_rows,full_set.dimension_result_rows,full_set.master_result_rows,
        full_set.active_fact_maps,full_set.full_fact_set_sha256)
        IS NOT DISTINCT FROM ROW(receipt.template_rows,receipt.level_rule_rows,
          receipt.dimension_rows,receipt.guide_rows,receipt.dimension_result_rows,
          receipt.master_result_rows,receipt.active_fact_maps,receipt.full_fact_set_sha256)
  )
$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_legacy_fact_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_batch_id uuid:=COALESCE(NEW.migration_batch_id,OLD.migration_batch_id);
  v_rollback_batch text:=current_setting('yuzhou.performance_legacy_rollback_batch_id',true);
BEGIN
  IF TG_OP='DELETE' AND v_rollback_batch=v_batch_id::text THEN
    IF EXISTS(SELECT 1 FROM public.migration_batch batch WHERE batch.id=v_batch_id
      AND batch.target_database=current_database() AND batch.phase='rollback' AND batch.status='running') THEN
      RETURN OLD;
    END IF;
    IF TG_TABLE_NAME IN(
        'hr_performance_legacy_template_profile','hr_performance_legacy_level_rule',
        'hr_performance_legacy_dimension_profile','hr_performance_legacy_dimension_level_guide',
        'hr_performance_legacy_dimension_result','hr_performance_legacy_master_result')
      AND public.hr_yuzhou_performance_facts_production_context_allowed_v1(v_batch_id,'rollback') THEN
      RETURN OLD;
    END IF;
    IF TG_TABLE_NAME IN(
        'hr_performance_legacy_session','hr_performance_legacy_score_source',
        'hr_performance_legacy_source_person_assignment')
      AND public.hr_yuzhou_performance_relations_production_context_allowed(v_batch_id,'rollback') THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_FACT_APPEND_ONLY' USING ERRCODE='55000';
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_apply_performance_facts_production_v1(
  p_operation_id varchar,p_sealed_plan_sha256 char(64),
  p_performance_fact_loader_contract_sha256 char(64),
  p_authorization_artifact_sha256 char(64),p_authorization_nonce_sha256 char(64),
  p_code_sha char(40),p_source_snapshot_sha256 char(64),p_mapping_contract_sha256 char(64),
  p_target_identity_sha256 char(64),p_tenant_id varchar,p_park_id varchar,
  p_target_scope_sha256 char(64),p_t0_phase_receipt_sha256 char(64),
  p_source_restore_receipt_sha256 char(64),p_source_fact_location_receipt_sha256 char(64),
  p_source_fact_location_canonical_sha256 char(64),p_fact_payload_artifact_sha256 char(64),
  p_master_payload_artifact_sha256 char(64),p_fact_payload bytea,p_master_payload bytea,
  p_expected_template_rows bigint,p_expected_level_rule_rows bigint,
  p_expected_dimension_rows bigint,p_expected_guide_rows bigint,
  p_expected_dimension_result_rows bigint,p_expected_master_result_rows bigint,
  p_expected_active_fact_maps bigint,p_expected_identity_fact_set_sha256 char(64),
  p_expected_full_fact_set_sha256 char(64),p_migration_300_sha256 char(64),
  p_migration_301_sha256 char(64),p_migration_302_sha256 char(64),
  p_migration_303_sha256 char(64),p_migration_310_sha256 char(64),p_migration_311_sha256 char(64)
) RETURNS TABLE(
  status varchar,replayed boolean,template_rows bigint,level_rule_rows bigint,
  dimension_rows bigint,guide_rows bigint,dimension_result_rows bigint,
  master_result_rows bigint,active_fact_maps bigint,identity_fact_set_sha256 char(64),
  full_fact_set_sha256 char(64),receipt_sha256 char(64)
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_operation public.hr_yuzhou_production_import_operation%ROWTYPE;
  v_phase public.hr_yuzhou_production_import_phase%ROWTYPE;
  v_batch public.migration_batch%ROWTYPE;
  v_existing public.hr_yuzhou_performance_facts_production_receipt%ROWTYPE;
  v_fact_payload jsonb; v_master_payload jsonb;
  v_template bigint; v_level bigint; v_dimension bigint; v_guide bigint;
  v_dimension_result bigint; v_master_result bigint; v_maps bigint;
  v_identity_dimension bigint; v_identity_master bigint; v_identity_total bigint;
  v_identity_hash char(64); v_full_hash char(64); v_receipt char(64);
  v_replayed boolean:=false; v_source_status varchar(32);
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_REQUIRES_SERIALIZABLE'; END IF;
  IF p_target_scope_sha256<>public.hr_yuzhou_production_target_scope_sha256(p_tenant_id,p_park_id)
    OR p_performance_fact_loader_contract_sha256!~'^[0-9a-f]{64}$'
    OR p_source_restore_receipt_sha256!~'^[0-9a-f]{64}$'
    OR p_source_fact_location_receipt_sha256!~'^[0-9a-f]{64}$'
    OR p_source_fact_location_canonical_sha256!~'^[0-9a-f]{64}$'
    OR p_expected_identity_fact_set_sha256!~'^[0-9a-f]{64}$'
    OR p_expected_full_fact_set_sha256!~'^[0-9a-f]{64}$'
    OR encode(digest(p_fact_payload,'sha256'),'hex')<>p_fact_payload_artifact_sha256
    OR encode(digest(p_master_payload,'sha256'),'hex')<>p_master_payload_artifact_sha256
    OR p_expected_template_rows<0 OR p_expected_level_rule_rows<0
    OR p_expected_dimension_rows<0 OR p_expected_guide_rows<0
    OR p_expected_dimension_result_rows<0 OR p_expected_master_result_rows<0
    OR p_expected_active_fact_maps<>p_expected_template_rows+p_expected_level_rule_rows+
      p_expected_dimension_rows+p_expected_guide_rows+p_expected_dimension_result_rows+
      p_expected_master_result_rows THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_BINDING_INVALID';
  END IF;
  IF ROW(p_migration_300_sha256,p_migration_301_sha256,p_migration_302_sha256,p_migration_303_sha256)
    IS DISTINCT FROM ROW(
      'ab3410b2121e0772c4b0cc6f273c893340b7925dcecf26414ea336f15dd0656a'::char(64),
      '4a4de62295d7e4ac7e752c435eba49483da7d79384c34aa992b9bc5f1f618e7e'::char(64),
      '7b45377d252a9593d779af779bcb9d6f91ceb326f6b5da1273da50b89f52e43a'::char(64),
      '853d7632ebd2c2c3a9211e0088a3ccda7979a788539db2123aaf43c59c070648'::char(64))
    OR p_migration_310_sha256<>'e67936f0983dea544d09d4885c75bf1ee50cc9e08fa5684a2fbe46f8ca8afee5'
    OR EXISTS(
      SELECT 1 FROM (VALUES
        ('000300_hr_performance_yuzhou_legacy_model.sql',p_migration_300_sha256),
        ('000301_hr_performance_yuzhou_legacy_writer.sql',p_migration_301_sha256),
        ('000302_hr_performance_yuzhou_legacy_master.sql',p_migration_302_sha256),
        ('000303_hr_performance_yuzhou_legacy_master_writer.sql',p_migration_303_sha256),
        ('000310_hr_yuzhou_performance_fact_identity_production.sql',p_migration_310_sha256),
        ('000311_hr_yuzhou_performance_facts_production.sql',p_migration_311_sha256)
      ) expected(filename,checksum)
      WHERE NOT EXISTS(SELECT 1 FROM public.sys_schema_migration_history a
        JOIN public.schema_migrations b USING(filename,checksum,status)
        WHERE a.filename=expected.filename AND a.checksum=expected.checksum
          AND a.status='succeeded')
    ) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_MIGRATION_DRIFT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_performance_relations_production',0));
  SELECT * INTO v_operation FROM public.hr_yuzhou_production_import_operation
    WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR v_operation.status<>'running' OR v_operation.current_phase<>'T0'
    OR v_operation.execution_contract_version<>2
    OR ROW(v_operation.sealed_plan_sha256,v_operation.code_sha,
      v_operation.source_snapshot_sha256,v_operation.mapping_contract_sha256,
      v_operation.target_identity_sha256,v_operation.target_tenant_id,
      v_operation.target_park_id,v_operation.target_scope_sha256)
      IS DISTINCT FROM ROW(p_sealed_plan_sha256,p_code_sha,p_source_snapshot_sha256,
        p_mapping_contract_sha256,p_target_identity_sha256,p_tenant_id,p_park_id,
        p_target_scope_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_OPERATION_INVALID';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_authorization_use auth
    WHERE auth.intent='production_import' AND auth.operation_id=p_operation_id
      AND auth.import_operation_id=p_operation_id
      AND auth.authorization_artifact_sha256=p_authorization_artifact_sha256
      AND auth.authorization_nonce_sha256=p_authorization_nonce_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_AUTHORIZATION_INVALID';
  END IF;
  SELECT * INTO v_phase FROM public.hr_yuzhou_production_import_phase
    WHERE operation_id=p_operation_id AND phase='T0' FOR SHARE;
  IF NOT FOUND OR v_phase.status<>'succeeded'
    OR v_phase.after_canonical_sha256<>p_t0_phase_receipt_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_T0_RECEIPT_INVALID';
  END IF;
  SELECT * INTO v_batch FROM public.migration_batch batch
    WHERE batch.execution_context='production_import'
      AND batch.production_import_operation_id=p_operation_id
      AND batch.production_import_phase='T0' AND batch.status='succeeded'
      AND batch.target_database=current_database() FOR SHARE;
  IF NOT FOUND OR v_batch.source_system<>'yuzhou-v10'
    OR v_batch.source_snapshot_sha256<>p_source_snapshot_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_T0_BATCH_INVALID';
  END IF;
  SELECT * INTO v_existing FROM public.hr_yuzhou_performance_facts_production_receipt
    WHERE operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status<>'succeeded' OR ROW(
      v_existing.migration_batch_id,v_existing.sealed_plan_sha256,
      v_existing.performance_fact_loader_contract_sha256,
      v_existing.authorization_artifact_sha256,v_existing.authorization_nonce_sha256,
      v_existing.code_sha,v_existing.source_snapshot_sha256,v_existing.mapping_contract_sha256,
      v_existing.target_identity_sha256,v_existing.tenant_id,v_existing.park_id,
      v_existing.target_scope_sha256,v_existing.t0_phase_receipt_sha256,
      v_existing.source_restore_receipt_sha256,v_existing.source_fact_location_receipt_sha256,
      v_existing.source_fact_location_canonical_sha256,v_existing.fact_payload_artifact_sha256,
      v_existing.master_payload_artifact_sha256,v_existing.template_rows,
      v_existing.level_rule_rows,v_existing.dimension_rows,v_existing.guide_rows,
      v_existing.dimension_result_rows,v_existing.master_result_rows,v_existing.active_fact_maps,
      v_existing.identity_fact_set_sha256,v_existing.full_fact_set_sha256,
      v_existing.migration_300_sha256,v_existing.migration_301_sha256,
      v_existing.migration_302_sha256,v_existing.migration_303_sha256,
      v_existing.migration_310_sha256,v_existing.migration_311_sha256)
      IS DISTINCT FROM ROW(v_batch.id,p_sealed_plan_sha256,
        p_performance_fact_loader_contract_sha256,p_authorization_artifact_sha256,
        p_authorization_nonce_sha256,p_code_sha,p_source_snapshot_sha256,
        p_mapping_contract_sha256,p_target_identity_sha256,p_tenant_id,p_park_id,
        p_target_scope_sha256,p_t0_phase_receipt_sha256,p_source_restore_receipt_sha256,
        p_source_fact_location_receipt_sha256,p_source_fact_location_canonical_sha256,
        p_fact_payload_artifact_sha256,p_master_payload_artifact_sha256,
        p_expected_template_rows,p_expected_level_rule_rows,p_expected_dimension_rows,
        p_expected_guide_rows,p_expected_dimension_result_rows,p_expected_master_result_rows,
        p_expected_active_fact_maps,p_expected_identity_fact_set_sha256,
        p_expected_full_fact_set_sha256,p_migration_300_sha256,p_migration_301_sha256,
        p_migration_302_sha256,p_migration_303_sha256,p_migration_310_sha256,
        p_migration_311_sha256) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_REPLAY_DRIFT';
    END IF;
    v_replayed:=true;
  ELSE
    BEGIN
      v_fact_payload:=convert_from(p_fact_payload,'UTF8')::jsonb;
      v_master_payload:=convert_from(p_master_payload,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_ARTIFACT_INVALID';
    END;
    PERFORM set_config('yuzhou.performance_facts_operation_id',p_operation_id,true);
    PERFORM set_config('yuzhou.performance_facts_mode','apply',true);
    SET CONSTRAINTS ALL DEFERRED;
    CALL public.materialize_yuzhou_performance_legacy_lab(
      p_tenant_id,p_park_id,v_batch.id,v_fact_payload);
    SET CONSTRAINTS ALL DEFERRED;
    CALL public.materialize_yuzhou_performance_legacy_master_lab(
      p_tenant_id,p_park_id,v_batch.id,v_master_payload);
  END IF;
  SELECT * INTO STRICT v_template,v_level,v_dimension,v_guide,v_dimension_result,
    v_master_result,v_maps,v_full_hash
    FROM public.hr_yuzhou_performance_full_fact_set_v1(p_tenant_id,p_park_id,v_batch.id);
  SELECT * INTO STRICT v_identity_dimension,v_identity_master,v_identity_total,v_identity_hash
    FROM public.hr_yuzhou_performance_fact_identity_set_v1(p_tenant_id,p_park_id,v_batch.id);
  IF ROW(v_template,v_level,v_dimension,v_guide,v_dimension_result,v_master_result,v_maps,
    v_identity_dimension,v_identity_master,v_identity_hash,v_full_hash)
    IS DISTINCT FROM ROW(p_expected_template_rows,p_expected_level_rule_rows,
      p_expected_dimension_rows,p_expected_guide_rows,p_expected_dimension_result_rows,
      p_expected_master_result_rows,p_expected_active_fact_maps,p_expected_dimension_result_rows,
      p_expected_master_result_rows,p_expected_identity_fact_set_sha256,
      p_expected_full_fact_set_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_CONSERVATION_FAILED';
  END IF;
  v_source_status:=CASE WHEN v_dimension_result+v_master_result=0
    THEN 'AUTHORITATIVE_EMPTY' ELSE 'AUTHORITATIVE_NONEMPTY' END;
  v_receipt:=encode(digest(convert_to(jsonb_build_object(
    'contract','jinhu-yuzhou-performance-fact-loader-production-v1',
    'operationId',p_operation_id,'sealedPlanSha256',p_sealed_plan_sha256,
    'performanceFactLoaderContractSha256',p_performance_fact_loader_contract_sha256,
    'authorizationArtifactSha256',p_authorization_artifact_sha256,
    'authorizationNonceSha256',p_authorization_nonce_sha256,'codeSha',p_code_sha,
    'sourceSnapshotSha256',p_source_snapshot_sha256,
    'mappingContractSha256',p_mapping_contract_sha256,
    'targetIdentitySha256',p_target_identity_sha256,'targetScopeSha256',p_target_scope_sha256,
    't0PhaseReceiptSha256',p_t0_phase_receipt_sha256,
    'sourceRestoreReceiptSha256',p_source_restore_receipt_sha256,
    'sourceFactLocationReceiptSha256',p_source_fact_location_receipt_sha256,
    'sourceFactLocationCanonicalSha256',p_source_fact_location_canonical_sha256,
    'factPayloadArtifactSha256',p_fact_payload_artifact_sha256,
    'masterPayloadArtifactSha256',p_master_payload_artifact_sha256,
    'counts',jsonb_build_array(v_template,v_level,v_dimension,v_guide,
      v_dimension_result,v_master_result,v_maps),
    'identityFactSetSha256',v_identity_hash,'fullFactSetSha256',v_full_hash,
    'migrations',jsonb_build_array(p_migration_300_sha256,p_migration_301_sha256,
      p_migration_302_sha256,p_migration_303_sha256,p_migration_310_sha256,
      p_migration_311_sha256))::text,'UTF8'),'sha256'),'hex');
  IF v_replayed THEN
    IF v_existing.receipt_sha256<>v_receipt THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_REPLAY_DRIFT'; END IF;
  ELSE
    INSERT INTO public.hr_yuzhou_performance_facts_production_receipt(
      operation_id,migration_batch_id,sealed_plan_sha256,
      performance_fact_loader_contract_sha256,authorization_artifact_sha256,
      authorization_nonce_sha256,code_sha,source_snapshot_sha256,mapping_contract_sha256,
      target_identity_sha256,tenant_id,park_id,target_scope_sha256,t0_phase_receipt_sha256,
      source_restore_receipt_sha256,source_fact_location_receipt_sha256,
      source_fact_location_canonical_sha256,fact_payload_artifact_sha256,
      master_payload_artifact_sha256,migration_300_sha256,migration_301_sha256,
      migration_302_sha256,migration_303_sha256,migration_310_sha256,migration_311_sha256,
      template_rows,level_rule_rows,dimension_rows,guide_rows,dimension_result_rows,
      master_result_rows,active_fact_maps,identity_fact_set_sha256,full_fact_set_sha256,
      source_outcome_fact_status,receipt_sha256
    ) VALUES(p_operation_id,v_batch.id,p_sealed_plan_sha256,
      p_performance_fact_loader_contract_sha256,p_authorization_artifact_sha256,
      p_authorization_nonce_sha256,p_code_sha,p_source_snapshot_sha256,
      p_mapping_contract_sha256,p_target_identity_sha256,p_tenant_id,p_park_id,
      p_target_scope_sha256,p_t0_phase_receipt_sha256,p_source_restore_receipt_sha256,
      p_source_fact_location_receipt_sha256,p_source_fact_location_canonical_sha256,
      p_fact_payload_artifact_sha256,p_master_payload_artifact_sha256,
      p_migration_300_sha256,p_migration_301_sha256,p_migration_302_sha256,
      p_migration_303_sha256,p_migration_310_sha256,p_migration_311_sha256,
      v_template,v_level,v_dimension,v_guide,v_dimension_result,v_master_result,v_maps,
      v_identity_hash,v_full_hash,v_source_status,v_receipt);
  END IF;
  RETURN QUERY SELECT 'succeeded'::varchar,v_replayed,v_template,v_level,v_dimension,
    v_guide,v_dimension_result,v_master_result,v_maps,v_identity_hash,v_full_hash,v_receipt;
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_rollback_performance_facts_production_v1(
  p_rollback_operation_id varchar,p_operation_id varchar,p_sealed_plan_sha256 char(64),
  p_performance_fact_loader_contract_sha256 char(64),
  p_authorization_artifact_sha256 char(64),p_authorization_nonce_sha256 char(64),
  p_code_sha char(40),p_source_snapshot_sha256 char(64),p_mapping_contract_sha256 char(64),
  p_target_identity_sha256 char(64),p_tenant_id varchar,p_park_id varchar,
  p_target_scope_sha256 char(64),p_t0_phase_receipt_sha256 char(64),
  p_source_restore_receipt_sha256 char(64),p_source_fact_location_receipt_sha256 char(64),
  p_source_fact_location_canonical_sha256 char(64),p_fact_payload_artifact_sha256 char(64),
  p_master_payload_artifact_sha256 char(64),p_expected_template_rows bigint,
  p_expected_level_rule_rows bigint,p_expected_dimension_rows bigint,p_expected_guide_rows bigint,
  p_expected_dimension_result_rows bigint,p_expected_master_result_rows bigint,
  p_expected_active_fact_maps bigint,p_expected_identity_fact_set_sha256 char(64),
  p_expected_full_fact_set_sha256 char(64),p_migration_300_sha256 char(64),
  p_migration_301_sha256 char(64),p_migration_302_sha256 char(64),
  p_migration_303_sha256 char(64),p_migration_310_sha256 char(64),p_migration_311_sha256 char(64)
) RETURNS TABLE(status varchar,rollback_order text,residual_count bigint,replayed boolean,
  receipt_sha256 char(64))
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_receipt public.hr_yuzhou_performance_facts_production_receipt%ROWTYPE;
  v_residual bigint; v_rollback_receipt char(64); v_replayed boolean:=false;
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_REQUIRES_SERIALIZABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_performance_relations_production',0));
  SELECT * INTO v_receipt FROM public.hr_yuzhou_performance_facts_production_receipt
    WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR ROW(v_receipt.sealed_plan_sha256,
    v_receipt.performance_fact_loader_contract_sha256,v_receipt.code_sha,v_receipt.source_snapshot_sha256,
    v_receipt.mapping_contract_sha256,v_receipt.target_identity_sha256,v_receipt.tenant_id,
    v_receipt.park_id,v_receipt.target_scope_sha256,v_receipt.t0_phase_receipt_sha256,
    v_receipt.source_restore_receipt_sha256,v_receipt.source_fact_location_receipt_sha256,
    v_receipt.source_fact_location_canonical_sha256,v_receipt.fact_payload_artifact_sha256,
    v_receipt.master_payload_artifact_sha256,v_receipt.template_rows,v_receipt.level_rule_rows,
    v_receipt.dimension_rows,v_receipt.guide_rows,v_receipt.dimension_result_rows,
    v_receipt.master_result_rows,v_receipt.identity_fact_set_sha256,
    v_receipt.full_fact_set_sha256,v_receipt.migration_300_sha256,v_receipt.migration_301_sha256,
    v_receipt.migration_302_sha256,v_receipt.migration_303_sha256,
    v_receipt.migration_310_sha256,v_receipt.migration_311_sha256)
    IS DISTINCT FROM ROW(p_sealed_plan_sha256,p_performance_fact_loader_contract_sha256,
      p_code_sha,p_source_snapshot_sha256,p_mapping_contract_sha256,p_target_identity_sha256,
      p_tenant_id,p_park_id,p_target_scope_sha256,p_t0_phase_receipt_sha256,
      p_source_restore_receipt_sha256,p_source_fact_location_receipt_sha256,
      p_source_fact_location_canonical_sha256,p_fact_payload_artifact_sha256,
      p_master_payload_artifact_sha256,p_expected_template_rows,p_expected_level_rule_rows,
      p_expected_dimension_rows,p_expected_guide_rows,p_expected_dimension_result_rows,
      p_expected_master_result_rows,p_expected_identity_fact_set_sha256,
      p_expected_full_fact_set_sha256,p_migration_300_sha256,p_migration_301_sha256,
      p_migration_302_sha256,p_migration_303_sha256,p_migration_310_sha256,
      p_migration_311_sha256)
    OR NOT ((v_receipt.status='succeeded' AND v_receipt.active_fact_maps=p_expected_active_fact_maps)
      OR (v_receipt.status='rolled_back' AND v_receipt.active_fact_maps=0)) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_ROLLBACK_BINDING_INVALID';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_rollback_operation rollback
      WHERE rollback.rollback_operation_id=p_rollback_operation_id
        AND rollback.import_operation_id=p_operation_id
        AND ((v_receipt.status='succeeded' AND rollback.status='running')
          OR (v_receipt.status='rolled_back' AND rollback.status IN('running','succeeded')))
        AND rollback.sealed_plan_sha256=p_sealed_plan_sha256
        AND rollback.target_identity_sha256=p_target_identity_sha256
        AND rollback.authorization_artifact_sha256=p_authorization_artifact_sha256
        AND rollback.authorization_nonce_sha256=p_authorization_nonce_sha256)
    OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_authorization_use auth
      WHERE auth.intent='production_import_rollback' AND auth.operation_id=p_rollback_operation_id
        AND auth.import_operation_id=p_operation_id
        AND auth.authorization_artifact_sha256=p_authorization_artifact_sha256
        AND auth.authorization_nonce_sha256=p_authorization_nonce_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_ROLLBACK_AUTHORIZATION_INVALID';
  END IF;
  IF v_receipt.status='rolled_back' THEN
    IF v_receipt.rollback_operation_id<>p_rollback_operation_id THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_ROLLBACK_REPLAY_DRIFT'; END IF;
    v_replayed:=true; v_rollback_receipt:=v_receipt.rollback_receipt_sha256;
  ELSE
    IF EXISTS(SELECT 1 FROM public.hr_yuzhou_performance_fact_identity_production_receipt identity_receipt
        WHERE identity_receipt.operation_id=p_operation_id
          AND (identity_receipt.fact_loader_receipt_sha256<>v_receipt.receipt_sha256
            OR identity_receipt.status<>'rolled_back'))
      OR EXISTS(SELECT 1 FROM public.hr_yuzhou_performance_relations_production_receipt relation_receipt
        WHERE relation_receipt.operation_id=p_operation_id AND relation_receipt.status<>'rolled_back') THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_ROLLBACK_ORDER_INVALID';
    END IF;
    PERFORM set_config('yuzhou.performance_facts_operation_id',p_operation_id,true);
    PERFORM set_config('yuzhou.performance_facts_rollback_operation_id',p_rollback_operation_id,true);
    PERFORM set_config('yuzhou.performance_facts_mode','rollback',true);
    PERFORM set_config('yuzhou.performance_legacy_rollback_batch_id',v_receipt.migration_batch_id::text,true);
    DELETE FROM public.hr_performance_legacy_master_result
      WHERE migration_batch_id=v_receipt.migration_batch_id;
    DELETE FROM public.hr_performance_legacy_dimension_result
      WHERE migration_batch_id=v_receipt.migration_batch_id;
    DELETE FROM public.hr_performance_legacy_dimension_level_guide
      WHERE migration_batch_id=v_receipt.migration_batch_id;
    DELETE FROM public.hr_performance_legacy_dimension_profile
      WHERE migration_batch_id=v_receipt.migration_batch_id;
    DELETE FROM public.hr_performance_legacy_level_rule
      WHERE migration_batch_id=v_receipt.migration_batch_id;
    DELETE FROM public.hr_performance_legacy_template_profile
      WHERE migration_batch_id=v_receipt.migration_batch_id;
    UPDATE public.legacy_record_map SET is_active=false,mapping_status='rolled_back'
      WHERE batch_id=v_receipt.migration_batch_id AND is_active AND target_table IN(
        'hr_performance_legacy_template_profile','hr_performance_legacy_level_rule',
        'hr_performance_legacy_dimension_profile','hr_performance_legacy_dimension_level_guide',
        'hr_performance_legacy_dimension_result','hr_performance_legacy_master_result');
    SET CONSTRAINTS ALL IMMEDIATE;
    SELECT (SELECT count(*) FROM public.hr_performance_legacy_template_profile WHERE migration_batch_id=v_receipt.migration_batch_id)
      +(SELECT count(*) FROM public.hr_performance_legacy_level_rule WHERE migration_batch_id=v_receipt.migration_batch_id)
      +(SELECT count(*) FROM public.hr_performance_legacy_dimension_profile WHERE migration_batch_id=v_receipt.migration_batch_id)
      +(SELECT count(*) FROM public.hr_performance_legacy_dimension_level_guide WHERE migration_batch_id=v_receipt.migration_batch_id)
      +(SELECT count(*) FROM public.hr_performance_legacy_dimension_result WHERE migration_batch_id=v_receipt.migration_batch_id)
      +(SELECT count(*) FROM public.hr_performance_legacy_master_result WHERE migration_batch_id=v_receipt.migration_batch_id)
      +(SELECT count(*) FROM public.legacy_record_map WHERE batch_id=v_receipt.migration_batch_id
        AND is_active AND target_table IN('hr_performance_legacy_template_profile',
          'hr_performance_legacy_level_rule','hr_performance_legacy_dimension_profile',
          'hr_performance_legacy_dimension_level_guide','hr_performance_legacy_dimension_result',
          'hr_performance_legacy_master_result')) INTO v_residual;
    IF v_residual<>0 THEN RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_ROLLBACK_RESIDUAL'; END IF;
    v_rollback_receipt:=encode(digest(convert_to(jsonb_build_object(
      'contract','jinhu-yuzhou-performance-fact-loader-production-rollback-v1',
      'rollbackOperationId',p_rollback_operation_id,'operationId',p_operation_id,
      'sealedPlanSha256',p_sealed_plan_sha256,
      'performanceFactLoaderContractSha256',p_performance_fact_loader_contract_sha256,
      'authorizationArtifactSha256',p_authorization_artifact_sha256,
      'authorizationNonceSha256',p_authorization_nonce_sha256,
      'identityFactSetSha256',p_expected_identity_fact_set_sha256,
      'fullFactSetSha256',p_expected_full_fact_set_sha256,
      'rollbackOrder','master_result>dimension_result>dimension_level_guide>dimension_profile>level_rule>template_profile',
      'residualCount',0)::text,'UTF8'),'sha256'),'hex');
    UPDATE public.hr_yuzhou_performance_facts_production_receipt SET
      status='rolled_back',active_fact_maps=0,rollback_operation_id=p_rollback_operation_id,
      rollback_receipt_sha256=v_rollback_receipt,rolled_back_at=now()
      WHERE operation_id=p_operation_id;
  END IF;
  SELECT (SELECT count(*) FROM public.hr_performance_legacy_template_profile WHERE migration_batch_id=v_receipt.migration_batch_id)
    +(SELECT count(*) FROM public.hr_performance_legacy_level_rule WHERE migration_batch_id=v_receipt.migration_batch_id)
    +(SELECT count(*) FROM public.hr_performance_legacy_dimension_profile WHERE migration_batch_id=v_receipt.migration_batch_id)
    +(SELECT count(*) FROM public.hr_performance_legacy_dimension_level_guide WHERE migration_batch_id=v_receipt.migration_batch_id)
    +(SELECT count(*) FROM public.hr_performance_legacy_dimension_result WHERE migration_batch_id=v_receipt.migration_batch_id)
    +(SELECT count(*) FROM public.hr_performance_legacy_master_result WHERE migration_batch_id=v_receipt.migration_batch_id)
    +(SELECT count(*) FROM public.legacy_record_map WHERE batch_id=v_receipt.migration_batch_id
      AND is_active AND target_table IN('hr_performance_legacy_template_profile',
        'hr_performance_legacy_level_rule','hr_performance_legacy_dimension_profile',
        'hr_performance_legacy_dimension_level_guide','hr_performance_legacy_dimension_result',
        'hr_performance_legacy_master_result')) INTO v_residual;
  IF v_residual<>0 THEN RAISE EXCEPTION 'HR_PERFORMANCE_FACTS_PRODUCTION_ROLLBACK_RESIDUAL'; END IF;
  RETURN QUERY SELECT 'rolled_back'::varchar,
    'master_result>dimension_result>dimension_level_guide>dimension_profile>level_rule>template_profile'::text,
    0::bigint,v_replayed,v_rollback_receipt;
END$$;

-- A rollback caller obtains the three runtime receipts under one database
-- lock.  It cannot provide receipt hashes from outside the transaction, and
-- it never receives table access or source values.
CREATE OR REPLACE FUNCTION hr_yuzhou_performance_production_receipt_chain_v1(
  p_operation_id varchar,p_sealed_plan_sha256 char(64),p_code_sha char(40),
  p_source_snapshot_sha256 char(64),p_mapping_contract_sha256 char(64),
  p_target_identity_sha256 char(64),p_tenant_id varchar,p_park_id varchar,
  p_target_scope_sha256 char(64),p_t0_phase_receipt_sha256 char(64)
) RETURNS TABLE(
  relations_receipt_sha256 char(64),fact_loader_receipt_sha256 char(64),
  fact_identity_receipt_sha256 char(64)
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_relations public.hr_yuzhou_performance_relations_production_receipt%ROWTYPE;
  v_facts public.hr_yuzhou_performance_facts_production_receipt%ROWTYPE;
  v_identity public.hr_yuzhou_performance_fact_identity_production_receipt%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_performance_relations_production',0));
  SELECT * INTO v_relations FROM public.hr_yuzhou_performance_relations_production_receipt
    WHERE operation_id=p_operation_id FOR SHARE;
  SELECT * INTO v_facts FROM public.hr_yuzhou_performance_facts_production_receipt
    WHERE operation_id=p_operation_id FOR SHARE;
  SELECT * INTO v_identity FROM public.hr_yuzhou_performance_fact_identity_production_receipt
    WHERE operation_id=p_operation_id FOR SHARE;
  IF v_relations.operation_id IS NULL OR v_facts.operation_id IS NULL OR v_identity.operation_id IS NULL
    OR v_relations.status<>'succeeded' OR v_facts.status<>'succeeded' OR v_identity.status<>'succeeded'
    OR ROW(v_relations.migration_batch_id,v_relations.sealed_plan_sha256,v_relations.code_sha,
      v_relations.source_snapshot_sha256,v_relations.mapping_contract_sha256,
      v_relations.target_identity_sha256,v_relations.tenant_id,v_relations.park_id,
      v_relations.target_scope_sha256,v_relations.t0_phase_receipt_sha256)
      IS DISTINCT FROM ROW(v_facts.migration_batch_id,p_sealed_plan_sha256,p_code_sha,
        p_source_snapshot_sha256,p_mapping_contract_sha256,p_target_identity_sha256,
        p_tenant_id,p_park_id,p_target_scope_sha256,p_t0_phase_receipt_sha256)
    OR ROW(v_facts.sealed_plan_sha256,v_facts.code_sha,v_facts.source_snapshot_sha256,
      v_facts.mapping_contract_sha256,v_facts.target_identity_sha256,v_facts.tenant_id,
      v_facts.park_id,v_facts.target_scope_sha256,v_facts.t0_phase_receipt_sha256)
      IS DISTINCT FROM ROW(p_sealed_plan_sha256,p_code_sha,p_source_snapshot_sha256,
        p_mapping_contract_sha256,p_target_identity_sha256,p_tenant_id,p_park_id,
        p_target_scope_sha256,p_t0_phase_receipt_sha256)
    OR v_identity.migration_batch_id<>v_facts.migration_batch_id
    OR v_identity.sealed_plan_sha256<>p_sealed_plan_sha256
    OR v_identity.code_sha<>p_code_sha
    OR v_identity.source_snapshot_sha256<>p_source_snapshot_sha256
    OR v_identity.mapping_contract_sha256<>p_mapping_contract_sha256
    OR v_identity.target_identity_sha256<>p_target_identity_sha256
    OR (v_identity.tenant_id,v_identity.park_id,v_identity.target_scope_sha256,
      v_identity.t0_phase_receipt_sha256)
      IS DISTINCT FROM (p_tenant_id,p_park_id,p_target_scope_sha256,p_t0_phase_receipt_sha256)
    OR v_identity.parent_relations_receipt_sha256<>v_relations.receipt_sha256
    OR v_identity.fact_loader_receipt_sha256<>v_facts.receipt_sha256
    OR v_identity.dimension_rows<>v_facts.dimension_result_rows
    OR v_identity.master_rows<>v_facts.master_result_rows
    OR v_identity.fact_set_sha256<>v_facts.identity_fact_set_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PRODUCTION_RECEIPT_CHAIN_INVALID';
  END IF;
  RETURN QUERY SELECT v_relations.receipt_sha256,v_facts.receipt_sha256,
    v_identity.receipt_sha256;
END$$;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jinhu_hr_yuzhou_performance_facts_probe') THEN
    CREATE ROLE jinhu_hr_yuzhou_performance_facts_probe NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jinhu_hr_yuzhou_performance_facts_writer') THEN
    CREATE ROLE jinhu_hr_yuzhou_performance_facts_writer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END$$;

REVOKE ALL ON public.hr_yuzhou_performance_facts_production_receipt FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_facts_production_capability_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_facts_production_context_allowed_v1(uuid,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_full_fact_set_v1(varchar,varchar,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_fact_loader_dependency_valid_v1(varchar,uuid,varchar,varchar,char,char,char,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_production_receipt_chain_v1(
  varchar,char,char,char,char,char,varchar,varchar,char,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_apply_performance_facts_production_v1(
  varchar,char,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char,char,char,char,bytea,bytea,
  bigint,bigint,bigint,bigint,bigint,bigint,bigint,char,char,char,char,char,char,char,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_rollback_performance_facts_production_v1(
  varchar,varchar,char,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char,char,char,char,
  bigint,bigint,bigint,bigint,bigint,bigint,bigint,char,char,char,char,char,char,char,char) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_yuzhou_performance_facts_production_capability_v1()
  TO jinhu_hr_yuzhou_performance_facts_probe,jinhu_hr_yuzhou_performance_facts_writer;
GRANT EXECUTE ON FUNCTION public.hr_yuzhou_performance_production_receipt_chain_v1(
  varchar,char,char,char,char,char,varchar,varchar,char,char)
  TO jinhu_hr_yuzhou_performance_facts_writer;
GRANT EXECUTE ON FUNCTION public.hr_yuzhou_apply_performance_facts_production_v1(
  varchar,char,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char,char,char,char,bytea,bytea,
  bigint,bigint,bigint,bigint,bigint,bigint,bigint,char,char,char,char,char,char,char,char)
  TO jinhu_hr_yuzhou_performance_facts_writer;
GRANT EXECUTE ON FUNCTION public.hr_yuzhou_rollback_performance_facts_production_v1(
  varchar,varchar,char,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char,char,char,char,
  bigint,bigint,bigint,bigint,bigint,bigint,bigint,char,char,char,char,char,char,char,char)
  TO jinhu_hr_yuzhou_performance_facts_writer;

COMMIT;
