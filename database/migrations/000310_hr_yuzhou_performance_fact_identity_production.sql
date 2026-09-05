BEGIN;

-- Production-only identity ledger for legacy assessmentdetail and
-- assessmentmaster facts.  It extends the immutable 000308 owner batch; it
-- does not alter the 000308 117/234 relationship receipt or its counters.
CREATE TABLE hr_yuzhou_performance_fact_identity_production_receipt (
  operation_id varchar(64) PRIMARY KEY
    REFERENCES hr_yuzhou_production_import_operation(operation_id),
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id),
  sealed_plan_sha256 char(64) NOT NULL,
  authorization_artifact_sha256 char(64) NOT NULL,
  authorization_nonce_sha256 char(64) NOT NULL,
  extension_nonce_sha256 char(64) NOT NULL UNIQUE,
  code_sha char(40) NOT NULL,
  source_snapshot_sha256 char(64) NOT NULL,
  mapping_contract_sha256 char(64) NOT NULL,
  target_identity_sha256 char(64) NOT NULL,
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  target_scope_sha256 char(64) NOT NULL,
  t0_phase_receipt_sha256 char(64) NOT NULL,
  parent_performance_relations_contract_sha256 char(64) NOT NULL,
  parent_relations_receipt_sha256 char(64) NOT NULL,
  fact_loader_receipt_sha256 char(64) NOT NULL,
  migration_308_sha256 char(64) NOT NULL,
  migration_310_sha256 char(64) NOT NULL,
  dimension_rows bigint NOT NULL,
  master_rows bigint NOT NULL,
  fact_rows bigint NOT NULL,
  resolved_rows bigint NOT NULL,
  unmatched_rows bigint NOT NULL,
  ambiguous_rows bigint NOT NULL,
  not_applicable_rows bigint NOT NULL,
  cycle_resolved_rows bigint NOT NULL,
  cycle_unmatched_rows bigint NOT NULL,
  cycle_ambiguous_rows bigint NOT NULL,
  cycle_not_applicable_rows bigint NOT NULL,
  fact_set_sha256 char(64) NOT NULL,
  resolution_state_sha256 char(64) NOT NULL,
  fact_owner_maps bigint NOT NULL,
  relation_owner_maps bigint NOT NULL,
  verified_owner_maps bigint NOT NULL,
  owner_map_state_sha256 char(64) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'succeeded',
  receipt_sha256 char(64) NOT NULL,
  rollback_operation_id varchar(72)
    REFERENCES hr_yuzhou_production_import_rollback_operation(rollback_operation_id),
  extension_rollback_nonce_sha256 char(64) UNIQUE,
  rollback_receipt_sha256 char(64),
  applied_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  CONSTRAINT ck_hr_yuzhou_perf_fact_identity_hashes CHECK (
    sealed_plan_sha256~'^[0-9a-f]{64}$'
    AND authorization_artifact_sha256~'^[0-9a-f]{64}$'
    AND authorization_nonce_sha256~'^[0-9a-f]{64}$'
    AND extension_nonce_sha256~'^[0-9a-f]{64}$'
    AND code_sha~'^[0-9a-f]{40}$'
    AND source_snapshot_sha256~'^[0-9a-f]{64}$'
    AND mapping_contract_sha256~'^[0-9a-f]{64}$'
    AND target_identity_sha256~'^[0-9a-f]{64}$'
    AND target_scope_sha256~'^[0-9a-f]{64}$'
    AND t0_phase_receipt_sha256~'^[0-9a-f]{64}$'
    AND parent_performance_relations_contract_sha256~'^[0-9a-f]{64}$'
    AND parent_relations_receipt_sha256~'^[0-9a-f]{64}$'
    AND fact_loader_receipt_sha256~'^[0-9a-f]{64}$'
    AND migration_308_sha256~'^[0-9a-f]{64}$'
    AND migration_310_sha256~'^[0-9a-f]{64}$'
    AND fact_set_sha256~'^[0-9a-f]{64}$'
    AND resolution_state_sha256~'^[0-9a-f]{64}$'
    AND owner_map_state_sha256~'^[0-9a-f]{64}$'
    AND receipt_sha256~'^[0-9a-f]{64}$'
    AND (extension_rollback_nonce_sha256 IS NULL
      OR extension_rollback_nonce_sha256~'^[0-9a-f]{64}$')
    AND (rollback_receipt_sha256 IS NULL OR rollback_receipt_sha256~'^[0-9a-f]{64}$')
  ),
  CONSTRAINT ck_hr_yuzhou_perf_fact_identity_counts CHECK (
    dimension_rows>=0 AND master_rows>=0 AND fact_rows=dimension_rows+master_rows
    AND resolved_rows>=0 AND unmatched_rows>=0 AND ambiguous_rows>=0
    AND not_applicable_rows>=0
    AND resolved_rows+unmatched_rows+ambiguous_rows+not_applicable_rows=fact_rows
    AND cycle_resolved_rows>=0 AND cycle_unmatched_rows>=0 AND cycle_ambiguous_rows>=0
    AND cycle_not_applicable_rows>=0
    AND cycle_resolved_rows+cycle_unmatched_rows+cycle_ambiguous_rows
      +cycle_not_applicable_rows=fact_rows
    AND fact_owner_maps>=0 AND relation_owner_maps>=0
    AND verified_owner_maps=fact_owner_maps+relation_owner_maps
  ),
  CONSTRAINT ck_hr_yuzhou_perf_fact_identity_status CHECK (
    (status='succeeded' AND rollback_operation_id IS NULL
      AND extension_rollback_nonce_sha256 IS NULL AND rollback_receipt_sha256 IS NULL
      AND rolled_back_at IS NULL)
    OR (status='rolled_back' AND rollback_operation_id IS NOT NULL
      AND extension_rollback_nonce_sha256 IS NOT NULL AND rollback_receipt_sha256 IS NOT NULL
      AND rolled_back_at IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_fact_identity_production_capability_v1()
RETURNS TABLE(
  capability_id text,migration_308_sha256 char(64),production_context_supported boolean,
  fact_kinds text,rollback_order text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  SELECT 'jinhu-yuzhou-performance-fact-identity-production-v1'::text,
    'ad77e0cf12cf73f98a5984835a9943a9e15c96cde37fe6bd95133845c711befa'::char(64),
    true,'dimension_result>master_result'::text,
    'fact_identity>performance_relations>performance_facts'::text
$$;

-- 000311 (or a later reviewed production fact loader) replaces only this
-- hook.  The default false body guarantees that arbitrary pre-existing facts,
-- including lab facts with a changed status, can never activate 000310.
CREATE OR REPLACE FUNCTION hr_yuzhou_performance_fact_loader_dependency_valid_v1(
  p_operation_id varchar,p_batch_id uuid,p_tenant_id varchar,p_park_id varchar,
  p_target_scope_sha256 char(64),p_t0_phase_receipt_sha256 char(64),
  p_fact_loader_receipt_sha256 char(64),p_identity_fact_set_sha256 char(64)
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT false
$$;

-- Canonical algorithm: yuzhou-performance-fact-identity-set-v1.
-- SHA-256([]) is 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945.
CREATE OR REPLACE FUNCTION hr_yuzhou_performance_fact_identity_set_v1(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid
) RETURNS TABLE(dimension_rows bigint,master_rows bigint,fact_rows bigint,fact_set_sha256 char(64))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  WITH facts AS (
    SELECT 'dimension_result'::text fact_kind,fact.source_identity_sha256,
      fact.source_row_sha256,
      public.hr_performance_yuzhou_person_identity_sha256(fact.source_person_code)
        source_person_identity_sha256,
      fact.source_session_id
    FROM public.hr_performance_legacy_dimension_result fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'master_result',fact.source_identity_sha256,fact.source_row_sha256,
      public.hr_performance_yuzhou_person_identity_sha256(fact.source_person_code),
      fact.source_session_id
    FROM public.hr_performance_legacy_master_result fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
  ), counts AS (
    SELECT count(*) FILTER(WHERE fact_kind='dimension_result') dimension_rows,
      count(*) FILTER(WHERE fact_kind='master_result') master_rows,count(*) fact_rows
    FROM facts
  ), canonical AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'factKind',fact_kind,'sourceIdentitySha256',source_identity_sha256,
      'sourceRowSha256',source_row_sha256,
      'sourcePersonIdentitySha256',source_person_identity_sha256,
      'sourceSessionId',source_session_id
    ) ORDER BY fact_kind,source_identity_sha256),'[]'::jsonb) body FROM facts
  )
  SELECT counts.dimension_rows,counts.master_rows,counts.fact_rows,
    encode(digest(convert_to(canonical.body::text,'UTF8'),'sha256'),'hex')::char(64)
  FROM counts CROSS JOIN canonical
$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_fact_identity_state_v1(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid
) RETURNS char(64)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT encode(digest(convert_to(COALESCE(jsonb_agg(jsonb_build_array(
    resolution.fact_kind,resolution.id,resolution.source_person_identity_sha256,
    resolution.person_resolution_status,resolution.person_resolution_reason_code,
    resolution.owner_t0_record_map_id,resolution.target_employee_id,
    resolution.session_binding_id,resolution.cycle_resolution_status,
    resolution.cycle_resolution_reason_code,resolution.target_cycle_employee_id,
    resolution.evidence_sha256
  ) ORDER BY resolution.fact_kind,resolution.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')::char(64)
  FROM public.hr_performance_legacy_identity_resolution resolution
  WHERE (resolution.tenant_id,resolution.park_id,resolution.migration_batch_id)=
      (p_tenant_id,p_park_id,p_batch_id)
    AND resolution.fact_kind IN('dimension_result','master_result')
$$;

-- Exact owner projection for all six fact and three relation tables.  It
-- deliberately returns hashes/identifiers only; no source values are exposed.
CREATE OR REPLACE FUNCTION hr_yuzhou_performance_owner_map_projection_v1(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid
) RETURNS TABLE(
  owner_family text,source_table varchar,target_table varchar,target_id uuid,
  legacy_record_map_id uuid,source_identity_sha256 char(64),source_row_sha256 char(64),
  mapping_status varchar,is_active boolean,exact_binding boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  WITH owners AS (
    SELECT 'fact'::text owner_family,'dbo.assessmentcode'::varchar source_table,
      'hr_performance_legacy_template_profile'::varchar target_table,
      fact.id target_id,fact.legacy_record_map_id,fact.source_identity_sha256,fact.source_row_sha256
    FROM public.hr_performance_legacy_template_profile fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'fact','dbo.assgradecode','hr_performance_legacy_level_rule',
      fact.id,fact.legacy_record_map_id,fact.source_identity_sha256,fact.source_row_sha256
    FROM public.hr_performance_legacy_level_rule fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'fact','dbo.assitem','hr_performance_legacy_dimension_profile',
      fact.id,fact.legacy_record_map_id,fact.source_identity_sha256,fact.source_row_sha256
    FROM public.hr_performance_legacy_dimension_profile fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'fact','dbo.assitemgradedes','hr_performance_legacy_dimension_level_guide',
      fact.id,fact.legacy_record_map_id,fact.source_identity_sha256,fact.source_row_sha256
    FROM public.hr_performance_legacy_dimension_level_guide fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'fact','dbo.assessmentdetail','hr_performance_legacy_dimension_result',
      fact.id,fact.legacy_record_map_id,fact.source_identity_sha256,fact.source_row_sha256
    FROM public.hr_performance_legacy_dimension_result fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'fact','dbo.assessmentmaster','hr_performance_legacy_master_result',
      fact.id,fact.legacy_record_map_id,fact.source_identity_sha256,fact.source_row_sha256
    FROM public.hr_performance_legacy_master_result fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'relation','dbo.asssession','hr_performance_legacy_session',
      fact.id,fact.legacy_record_map_id,fact.source_identity_sha256,fact.source_row_sha256
    FROM public.hr_performance_legacy_session fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'relation','dbo.asssour','hr_performance_legacy_score_source',
      fact.id,fact.legacy_record_map_id,fact.source_identity_sha256,fact.source_row_sha256
    FROM public.hr_performance_legacy_score_source fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'relation','dbo.asssourperson','hr_performance_legacy_source_person_assignment',
      fact.id,fact.legacy_record_map_id,fact.source_identity_sha256,fact.source_row_sha256
    FROM public.hr_performance_legacy_source_person_assignment fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
  )
  SELECT owner.owner_family,owner.source_table,owner.target_table,owner.target_id,
    owner.legacy_record_map_id,owner.source_identity_sha256,owner.source_row_sha256,
    map.mapping_status,map.is_active,
    (map.id IS NOT NULL AND map.batch_id=p_batch_id AND map.source_system='yuzhou-v10'
      AND map.source_table=owner.source_table
      AND map.source_pk_canonical='sha256:'||owner.source_identity_sha256
      AND map.source_identity_sha256=owner.source_identity_sha256
      AND map.source_row_sha256=owner.source_row_sha256
      AND map.target_table=owner.target_table AND map.target_id=owner.target_id
      AND map.mapping_status IN('loaded','verified') AND map.is_active) exact_binding
  FROM owners owner
  LEFT JOIN public.legacy_record_map map ON map.id=owner.legacy_record_map_id
$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_owner_map_state_v1(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid
) RETURNS TABLE(
  fact_owner_maps bigint,relation_owner_maps bigint,owner_maps bigint,
  distinct_owner_maps bigint,active_target_maps bigint,loaded_owner_maps bigint,
  verified_owner_maps bigint,invalid_owner_maps bigint,owner_map_state_sha256 char(64)
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  WITH owners AS MATERIALIZED (
    SELECT * FROM public.hr_yuzhou_performance_owner_map_projection_v1(
      p_tenant_id,p_park_id,p_batch_id)
  ), aggregate_state AS (
    SELECT count(*) FILTER(WHERE owner_family='fact') fact_owner_maps,
      count(*) FILTER(WHERE owner_family='relation') relation_owner_maps,
      count(*) owner_maps,count(DISTINCT legacy_record_map_id) distinct_owner_maps,
      count(*) FILTER(WHERE exact_binding AND mapping_status='loaded') loaded_owner_maps,
      count(*) FILTER(WHERE exact_binding AND mapping_status='verified') verified_owner_maps,
      count(*) FILTER(WHERE NOT exact_binding OR mapping_status NOT IN('loaded','verified'))
        invalid_owner_maps,
      COALESCE(jsonb_agg(jsonb_build_array(owner_family,source_table,target_table,target_id,
        legacy_record_map_id,source_identity_sha256,source_row_sha256,mapping_status,
        is_active,exact_binding) ORDER BY owner_family,source_table,source_identity_sha256),
        '[]'::jsonb) canonical
    FROM owners
  ), active_maps AS (
    SELECT count(*) active_target_maps FROM public.legacy_record_map map
    WHERE map.batch_id=p_batch_id AND map.is_active AND map.target_table IN(
      'hr_performance_legacy_template_profile','hr_performance_legacy_level_rule',
      'hr_performance_legacy_dimension_profile','hr_performance_legacy_dimension_level_guide',
      'hr_performance_legacy_dimension_result','hr_performance_legacy_master_result',
      'hr_performance_legacy_session','hr_performance_legacy_score_source',
      'hr_performance_legacy_source_person_assignment')
  )
  SELECT aggregate_state.fact_owner_maps,aggregate_state.relation_owner_maps,
    aggregate_state.owner_maps,aggregate_state.distinct_owner_maps,active_maps.active_target_maps,
    aggregate_state.loaded_owner_maps,aggregate_state.verified_owner_maps,
    aggregate_state.invalid_owner_maps,
    encode(digest(convert_to(aggregate_state.canonical::text,'UTF8'),'sha256'),'hex')::char(64)
  FROM aggregate_state CROSS JOIN active_maps
$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_verify_performance_owner_maps_v1(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid,
  p_expected_relation_maps bigint,p_replayed boolean
) RETURNS TABLE(
  fact_owner_maps bigint,relation_owner_maps bigint,verified_owner_maps bigint,
  owner_map_state_sha256 char(64)
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_before record; v_after record; v_updated bigint;
BEGIN
  IF current_setting('transaction_isolation')<>'serializable'
    OR p_expected_relation_maps<0 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_OWNER_MAP_VERIFICATION_CONTEXT_INVALID'; END IF;
  SELECT * INTO STRICT v_before FROM public.hr_yuzhou_performance_owner_map_state_v1(
    p_tenant_id,p_park_id,p_batch_id);
  IF v_before.relation_owner_maps<>p_expected_relation_maps
    OR v_before.owner_maps<>v_before.fact_owner_maps+v_before.relation_owner_maps
    OR v_before.distinct_owner_maps<>v_before.owner_maps
    OR v_before.active_target_maps<>v_before.owner_maps
    OR v_before.invalid_owner_maps<>0 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_OWNER_MAP_CONSERVATION_FAILED'; END IF;
  IF p_replayed THEN
    IF v_before.loaded_owner_maps<>0 OR v_before.verified_owner_maps<>v_before.owner_maps THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_OWNER_MAP_REPLAY_DRIFT'; END IF;
  ELSE
    IF v_before.loaded_owner_maps<>v_before.owner_maps OR v_before.verified_owner_maps<>0 THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_OWNER_MAP_PRECONDITION_FAILED'; END IF;
    UPDATE public.legacy_record_map map SET mapping_status='verified',update_time=now()
    FROM public.hr_yuzhou_performance_owner_map_projection_v1(
      p_tenant_id,p_park_id,p_batch_id) owner
    WHERE map.id=owner.legacy_record_map_id AND owner.exact_binding
      AND owner.mapping_status='loaded' AND map.mapping_status='loaded' AND map.is_active;
    GET DIAGNOSTICS v_updated=ROW_COUNT;
    IF v_updated<>v_before.owner_maps THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_OWNER_MAP_PROMOTION_FAILED'; END IF;
    SET CONSTRAINTS ALL IMMEDIATE;
  END IF;
  SELECT * INTO STRICT v_after FROM public.hr_yuzhou_performance_owner_map_state_v1(
    p_tenant_id,p_park_id,p_batch_id);
  IF v_after.fact_owner_maps<>v_before.fact_owner_maps
    OR v_after.relation_owner_maps<>v_before.relation_owner_maps
    OR v_after.owner_maps<>v_before.owner_maps
    OR v_after.distinct_owner_maps<>v_after.owner_maps
    OR v_after.active_target_maps<>v_after.owner_maps
    OR v_after.loaded_owner_maps<>0 OR v_after.verified_owner_maps<>v_after.owner_maps
    OR v_after.invalid_owner_maps<>0 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_OWNER_MAP_PROMOTION_FAILED'; END IF;
  RETURN QUERY SELECT v_after.fact_owner_maps,v_after.relation_owner_maps,
    v_after.verified_owner_maps,v_after.owner_map_state_sha256;
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_fact_identity_context_allowed_v1(
  p_batch_id uuid,p_mode varchar
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT CASE p_mode
    WHEN 'apply' THEN EXISTS(
      SELECT 1
      FROM public.hr_yuzhou_performance_relations_production_receipt parent
      JOIN public.migration_batch batch ON batch.id=parent.migration_batch_id
      WHERE batch.id=p_batch_id AND parent.status='succeeded'
        AND current_setting('yuzhou.performance_fact_identity_operation_id',true)=parent.operation_id
        AND current_setting('yuzhou.performance_fact_identity_mode',true)='apply'
        AND public.hr_yuzhou_performance_relations_production_context_allowed(p_batch_id,'apply')
    )
    WHEN 'rollback' THEN EXISTS(
      SELECT 1
      FROM public.hr_yuzhou_performance_fact_identity_production_receipt receipt
      JOIN public.hr_yuzhou_production_import_rollback_operation rollback
        ON rollback.rollback_operation_id=
          current_setting('yuzhou.performance_fact_identity_rollback_operation_id',true)
       AND rollback.import_operation_id=receipt.operation_id AND rollback.status='running'
      JOIN public.hr_yuzhou_production_import_authorization_use auth
        ON auth.operation_id=rollback.rollback_operation_id
       AND auth.import_operation_id=receipt.operation_id
       AND auth.intent='production_import_rollback'
      WHERE receipt.migration_batch_id=p_batch_id AND receipt.status='succeeded'
        AND current_setting('yuzhou.performance_fact_identity_operation_id',true)=receipt.operation_id
        AND current_setting('yuzhou.performance_fact_identity_mode',true)='rollback'
    )
    ELSE false
  END
$$;

-- Preserve lab rollback and 000308 assignment rollback, but require the
-- 000310 context for master/dimension identity deletion.  This makes reverse
-- order executable rather than advisory.
CREATE OR REPLACE FUNCTION hr_performance_yuzhou_identity_resolution_delete_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE'
    AND current_setting('yuzhou.performance_identity_resolution_rollback_batch_id',true)=OLD.migration_batch_id::text
    AND (
      EXISTS(SELECT 1 FROM public.migration_batch batch WHERE batch.id=OLD.migration_batch_id
        AND batch.execution_context='lab_rehearsal' AND batch.phase='rollback' AND batch.status='running')
      OR (OLD.fact_kind IN('dimension_result','master_result')
        AND public.hr_yuzhou_performance_fact_identity_context_allowed_v1(OLD.migration_batch_id,'rollback'))
      OR (OLD.fact_kind NOT IN('dimension_result','master_result')
        AND public.hr_yuzhou_performance_relations_production_context_allowed(OLD.migration_batch_id,'rollback'))
    ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_RESOLUTION_IMMUTABLE';
END$$;

CREATE OR REPLACE PROCEDURE hr_yuzhou_materialize_performance_fact_identity_production_v1(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_fact record; v_identity char(64); v_candidate_count integer;
  v_owner_map_id uuid; v_employee_id uuid; v_binding public.hr_performance_legacy_session_binding%ROWTYPE;
  v_person_status varchar; v_person_reason varchar; v_cycle_status varchar; v_cycle_reason varchar;
  v_cycle_count integer; v_cycle_employee_id uuid; v_resolution_id uuid;
  v_namespace constant uuid:='71382084-c80d-4bbf-b735-a816c79a0f6c';
BEGIN
  IF current_setting('transaction_isolation')<>'serializable'
    OR NOT public.hr_yuzhou_performance_fact_identity_context_allowed_v1(p_batch_id,'apply') THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_CONTEXT_INVALID'; END IF;
  LOCK TABLE public.hr_performance_legacy_identity_resolution,public.legacy_record_map,
    public.hr_yuzhou_production_import_projection_receipt,
    public.hr_performance_legacy_session_binding,public.hr_performance_cycle_employee
    IN SHARE ROW EXCLUSIVE MODE;
  FOR v_fact IN
    SELECT 'dimension_result'::varchar fact_kind,fact.id fact_id,fact.source_person_code,
      fact.source_session_id,fact.id dimension_id,NULL::uuid master_id
    FROM public.hr_performance_legacy_dimension_result fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'master_result',fact.id,fact.source_person_code,fact.source_session_id,
      NULL::uuid,fact.id
    FROM public.hr_performance_legacy_master_result fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    ORDER BY fact_kind,fact_id
  LOOP
    v_identity:=public.hr_performance_yuzhou_person_identity_sha256(v_fact.source_person_code);
    v_owner_map_id:=NULL; v_employee_id:=NULL;
    IF v_identity IS NULL THEN
      v_person_status:='not_applicable'; v_person_reason:='SUBJECT_CODE_EMPTY';
    ELSE
      SELECT count(*),(array_agg(owner_t0_record_map_id ORDER BY owner_t0_record_map_id))[1],
        (array_agg(target_employee_id ORDER BY owner_t0_record_map_id))[1]
        INTO v_candidate_count,v_owner_map_id,v_employee_id
      FROM public.hr_performance_yuzhou_t0_person_candidate(p_tenant_id,p_park_id,v_identity);
      IF v_candidate_count=1 THEN
        v_person_status:='resolved'; v_person_reason:='EXACT_T0_PERSON_MAP';
      ELSIF v_candidate_count=0 THEN
        v_owner_map_id:=NULL; v_employee_id:=NULL;
        v_person_status:='unmatched'; v_person_reason:='T0_PERSON_MAP_NOT_FOUND';
      ELSE
        v_owner_map_id:=NULL; v_employee_id:=NULL;
        v_person_status:='ambiguous'; v_person_reason:='T0_PERSON_MAP_AMBIGUOUS';
      END IF;
    END IF;
    SELECT binding.* INTO v_binding
    FROM public.hr_performance_legacy_session source_session
    JOIN public.hr_performance_legacy_session_binding binding
      ON binding.legacy_session_id=source_session.id
    WHERE (source_session.tenant_id,source_session.park_id,source_session.migration_batch_id,
      source_session.source_session_id)=
      (p_tenant_id,p_park_id,p_batch_id,v_fact.source_session_id);
    IF NOT FOUND THEN v_binding:=NULL; END IF;
    v_cycle_employee_id:=NULL;
    IF v_person_status<>'resolved' THEN
      v_cycle_status:='not_applicable'; v_cycle_reason:='PERSON_UNRESOLVED';
    ELSIF v_fact.source_session_id IS NULL THEN
      v_cycle_status:='not_applicable'; v_cycle_reason:='SESSION_NOT_APPLICABLE';
    ELSIF v_binding.id IS NULL OR v_binding.resolution_status<>'resolved' THEN
      v_cycle_status:='unmatched'; v_cycle_reason:='SESSION_BINDING_UNRESOLVED';
    ELSE
      SELECT count(*),(array_agg(id ORDER BY id))[1] INTO v_cycle_count,v_cycle_employee_id
      FROM public.hr_performance_cycle_employee
      WHERE (tenant_id,park_id,cycle_id,employee_id)=
        (p_tenant_id,p_park_id,v_binding.target_review_cycle_id,v_employee_id);
      IF v_cycle_count=1 THEN
        v_cycle_status:='resolved'; v_cycle_reason:='EXACT_CYCLE_EMPLOYEE';
      ELSIF v_cycle_count=0 THEN
        v_cycle_employee_id:=NULL; v_cycle_status:='unmatched';
        v_cycle_reason:='CYCLE_EMPLOYEE_NOT_FOUND';
      ELSE
        v_cycle_employee_id:=NULL; v_cycle_status:='ambiguous';
        v_cycle_reason:='CYCLE_EMPLOYEE_AMBIGUOUS';
      END IF;
    END IF;
    v_resolution_id:=uuid_generate_v5(v_namespace,
      'fact:'||p_batch_id::text||':'||v_fact.fact_kind||':'||v_fact.fact_id::text||':subject');
    INSERT INTO public.hr_performance_legacy_identity_resolution(
      id,tenant_id,park_id,migration_batch_id,fact_kind,person_role,
      legacy_dimension_result_id,legacy_master_result_id,source_person_identity_sha256,
      person_resolution_status,person_resolution_reason_code,owner_t0_record_map_id,
      target_employee_id,session_binding_id,cycle_resolution_status,
      cycle_resolution_reason_code,target_cycle_employee_id,evidence_sha256
    ) VALUES(v_resolution_id,p_tenant_id,p_park_id,p_batch_id,v_fact.fact_kind,'subject',
      v_fact.dimension_id,v_fact.master_id,v_identity,v_person_status,v_person_reason,v_owner_map_id,
      v_employee_id,v_binding.id,v_cycle_status,v_cycle_reason,v_cycle_employee_id,
      public.hr_performance_yuzhou_identity_resolution_evidence_sha256(
        v_fact.fact_kind,v_fact.fact_id,'subject',v_identity,v_person_status,v_person_reason,
        v_owner_map_id,v_employee_id,v_binding.id,v_cycle_status,v_cycle_reason,v_cycle_employee_id))
    ON CONFLICT(id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.hr_performance_legacy_identity_resolution resolution
      WHERE resolution.id=v_resolution_id AND resolution.fact_kind=v_fact.fact_kind
        AND resolution.source_person_identity_sha256 IS NOT DISTINCT FROM v_identity
        AND resolution.person_resolution_status=v_person_status
        AND resolution.person_resolution_reason_code=v_person_reason
        AND resolution.owner_t0_record_map_id IS NOT DISTINCT FROM v_owner_map_id
        AND resolution.target_employee_id IS NOT DISTINCT FROM v_employee_id
        AND resolution.session_binding_id IS NOT DISTINCT FROM v_binding.id
        AND resolution.cycle_resolution_status=v_cycle_status
        AND resolution.cycle_resolution_reason_code=v_cycle_reason
        AND resolution.target_cycle_employee_id IS NOT DISTINCT FROM v_cycle_employee_id) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_REPLAY_DRIFT'; END IF;
  END LOOP;
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_apply_performance_fact_identity_production_v1(
  p_operation_id varchar,p_sealed_plan_sha256 char(64),
  p_authorization_artifact_sha256 char(64),p_authorization_nonce_sha256 char(64),
  p_extension_nonce_sha256 char(64),p_code_sha char(40),p_source_snapshot_sha256 char(64),
  p_mapping_contract_sha256 char(64),p_target_identity_sha256 char(64),
  p_tenant_id varchar,p_park_id varchar,p_target_scope_sha256 char(64),
  p_t0_phase_receipt_sha256 char(64),p_parent_relations_receipt_sha256 char(64),
  p_parent_performance_relations_contract_sha256 char(64),
  p_fact_loader_receipt_sha256 char(64),
  p_expected_dimension_rows bigint,p_expected_master_rows bigint,p_expected_fact_set_sha256 char(64),
  p_migration_308_sha256 char(64),p_migration_310_sha256 char(64)
) RETURNS TABLE(
  status varchar,replayed boolean,dimension_rows bigint,master_rows bigint,fact_rows bigint,
  resolved_rows bigint,unmatched_rows bigint,ambiguous_rows bigint,not_applicable_rows bigint,
  cycle_resolved_rows bigint,cycle_unmatched_rows bigint,cycle_ambiguous_rows bigint,
  cycle_not_applicable_rows bigint,fact_set_sha256 char(64),
  resolution_state_sha256 char(64),fact_owner_maps bigint,relation_owner_maps bigint,
  verified_owner_maps bigint,owner_map_state_sha256 char(64),receipt_sha256 char(64)
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_parent public.hr_yuzhou_performance_relations_production_receipt%ROWTYPE;
  v_existing public.hr_yuzhou_performance_fact_identity_production_receipt%ROWTYPE;
  v_dimension bigint; v_master bigint; v_facts bigint; v_fact_set char(64);
  v_resolved bigint; v_unmatched bigint; v_ambiguous bigint; v_na bigint;
  v_cycle_resolved bigint; v_cycle_unmatched bigint; v_cycle_ambiguous bigint; v_cycle_na bigint;
  v_state char(64); v_fact_owner_maps bigint; v_relation_owner_maps bigint;
  v_verified_owner_maps bigint; v_owner_map_state char(64);
  v_receipt char(64); v_replayed boolean:=false;
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_REQUIRES_SERIALIZABLE'; END IF;
  IF p_migration_308_sha256<>'ad77e0cf12cf73f98a5984835a9943a9e15c96cde37fe6bd95133845c711befa'
    OR p_target_scope_sha256<>public.hr_yuzhou_production_target_scope_sha256(p_tenant_id,p_park_id)
    OR p_expected_dimension_rows<0 OR p_expected_master_rows<0
    OR p_parent_performance_relations_contract_sha256!~'^[0-9a-f]{64}$'
    OR p_fact_loader_receipt_sha256!~'^[0-9a-f]{64}$'
    OR p_expected_fact_set_sha256!~'^[0-9a-f]{64}$'
    OR p_extension_nonce_sha256!~'^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_BINDING_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sys_schema_migration_history a
      JOIN public.schema_migrations b USING(filename,checksum,status)
      WHERE a.filename='000308_hr_yuzhou_performance_relations_production.sql'
        AND a.status='succeeded' AND a.checksum=p_migration_308_sha256)
    OR NOT EXISTS(SELECT 1 FROM public.sys_schema_migration_history a
      JOIN public.schema_migrations b USING(filename,checksum,status)
      WHERE a.filename='000310_hr_yuzhou_performance_fact_identity_production.sql'
        AND a.status='succeeded' AND a.checksum=p_migration_310_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_MIGRATION_DRIFT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_performance_relations_production',0));
  SELECT * INTO v_parent FROM public.hr_yuzhou_performance_relations_production_receipt
    WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR v_parent.status<>'succeeded'
    OR ROW(v_parent.sealed_plan_sha256,v_parent.authorization_artifact_sha256,
      v_parent.authorization_nonce_sha256,v_parent.code_sha,v_parent.source_snapshot_sha256,
      v_parent.mapping_contract_sha256,v_parent.target_identity_sha256,v_parent.tenant_id,
      v_parent.park_id,v_parent.target_scope_sha256,v_parent.t0_phase_receipt_sha256,
      v_parent.receipt_sha256)
    IS DISTINCT FROM ROW(p_sealed_plan_sha256,p_authorization_artifact_sha256,
      p_authorization_nonce_sha256,p_code_sha,p_source_snapshot_sha256,
      p_mapping_contract_sha256,p_target_identity_sha256,p_tenant_id,p_park_id,
      p_target_scope_sha256,p_t0_phase_receipt_sha256,p_parent_relations_receipt_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_PARENT_INVALID'; END IF;
  IF NOT public.hr_yuzhou_performance_fact_loader_dependency_valid_v1(
    p_operation_id,v_parent.migration_batch_id,p_tenant_id,p_park_id,
    p_target_scope_sha256,p_t0_phase_receipt_sha256,p_fact_loader_receipt_sha256,
    p_expected_fact_set_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_FACT_LOADER_INVALID'; END IF;
  SELECT * INTO v_existing FROM public.hr_yuzhou_performance_fact_identity_production_receipt
    WHERE operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status<>'succeeded' OR ROW(v_existing.extension_nonce_sha256,
      v_existing.parent_performance_relations_contract_sha256,
      v_existing.parent_relations_receipt_sha256,v_existing.fact_loader_receipt_sha256,
      v_existing.dimension_rows,v_existing.master_rows,
      v_existing.fact_set_sha256,v_existing.migration_308_sha256,v_existing.migration_310_sha256)
      IS DISTINCT FROM ROW(p_extension_nonce_sha256,p_parent_performance_relations_contract_sha256,
        p_parent_relations_receipt_sha256,
        p_fact_loader_receipt_sha256,
        p_expected_dimension_rows,p_expected_master_rows,p_expected_fact_set_sha256,
        p_migration_308_sha256,p_migration_310_sha256) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_REPLAY_DRIFT'; END IF;
    v_replayed:=true;
  ELSE
    SELECT * INTO STRICT v_dimension,v_master,v_facts,v_fact_set
      FROM public.hr_yuzhou_performance_fact_identity_set_v1(p_tenant_id,p_park_id,v_parent.migration_batch_id);
    IF ROW(v_dimension,v_master,v_facts,v_fact_set) IS DISTINCT FROM
      ROW(p_expected_dimension_rows,p_expected_master_rows,
        p_expected_dimension_rows+p_expected_master_rows,p_expected_fact_set_sha256) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_FACT_SET_DRIFT'; END IF;
    PERFORM set_config('yuzhou.performance_relations_operation_id',p_operation_id,true);
    PERFORM set_config('yuzhou.performance_relations_mode','apply',true);
    PERFORM set_config('yuzhou.performance_fact_identity_operation_id',p_operation_id,true);
    PERFORM set_config('yuzhou.performance_fact_identity_mode','apply',true);
    CALL public.hr_yuzhou_materialize_performance_fact_identity_production_v1(
      p_tenant_id,p_park_id,v_parent.migration_batch_id);
  END IF;
  SELECT * INTO STRICT v_dimension,v_master,v_facts,v_fact_set
    FROM public.hr_yuzhou_performance_fact_identity_set_v1(p_tenant_id,p_park_id,v_parent.migration_batch_id);
  SELECT count(*) FILTER(WHERE person_resolution_status='resolved'),
    count(*) FILTER(WHERE person_resolution_status='unmatched'),
    count(*) FILTER(WHERE person_resolution_status='ambiguous'),
    count(*) FILTER(WHERE person_resolution_status='not_applicable'),
    count(*) FILTER(WHERE cycle_resolution_status='resolved'),
    count(*) FILTER(WHERE cycle_resolution_status='unmatched'),
    count(*) FILTER(WHERE cycle_resolution_status='ambiguous'),
    count(*) FILTER(WHERE cycle_resolution_status='not_applicable')
    INTO v_resolved,v_unmatched,v_ambiguous,v_na,v_cycle_resolved,v_cycle_unmatched,
      v_cycle_ambiguous,v_cycle_na
  FROM public.hr_performance_legacy_identity_resolution
  WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,v_parent.migration_batch_id)
    AND fact_kind IN('dimension_result','master_result');
  IF v_resolved+v_unmatched+v_ambiguous+v_na<>v_facts
    OR v_cycle_resolved+v_cycle_unmatched+v_cycle_ambiguous+v_cycle_na<>v_facts
    OR v_fact_set<>p_expected_fact_set_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_CONSERVATION_FAILED'; END IF;
  v_state:=public.hr_yuzhou_performance_fact_identity_state_v1(
    p_tenant_id,p_park_id,v_parent.migration_batch_id);
  SELECT * INTO STRICT v_fact_owner_maps,v_relation_owner_maps,v_verified_owner_maps,
    v_owner_map_state
  FROM public.hr_yuzhou_verify_performance_owner_maps_v1(
    p_tenant_id,p_park_id,v_parent.migration_batch_id,v_parent.active_relation_maps,v_replayed);
  v_receipt:=encode(digest(convert_to(jsonb_build_object(
    'contract','jinhu-yuzhou-performance-fact-identity-production-v1',
    'operationId',p_operation_id,'extensionNonceSha256',p_extension_nonce_sha256,
    'parentPerformanceRelationsContractSha256',p_parent_performance_relations_contract_sha256,
    'parentRelationsReceiptSha256',p_parent_relations_receipt_sha256,
    'factLoaderReceiptSha256',p_fact_loader_receipt_sha256,
    'targetScopeSha256',p_target_scope_sha256,'t0PhaseReceiptSha256',p_t0_phase_receipt_sha256,
    'migration308Sha256',p_migration_308_sha256,'migration310Sha256',p_migration_310_sha256,
    'factSetSha256',v_fact_set,'resolutionStateSha256',v_state,
    'ownerMapStateSha256',v_owner_map_state,
    'counts',jsonb_build_array(v_dimension,v_master,v_facts,v_resolved,v_unmatched,v_ambiguous,v_na,
      v_cycle_resolved,v_cycle_unmatched,v_cycle_ambiguous,v_cycle_na,
      v_fact_owner_maps,v_relation_owner_maps,v_verified_owner_maps))::text,'UTF8'),'sha256'),'hex');
  INSERT INTO public.hr_yuzhou_performance_fact_identity_production_receipt(
    operation_id,migration_batch_id,sealed_plan_sha256,authorization_artifact_sha256,
    authorization_nonce_sha256,extension_nonce_sha256,code_sha,source_snapshot_sha256,
    mapping_contract_sha256,target_identity_sha256,tenant_id,park_id,target_scope_sha256,
    t0_phase_receipt_sha256,parent_performance_relations_contract_sha256,
    parent_relations_receipt_sha256,fact_loader_receipt_sha256,migration_308_sha256,
    migration_310_sha256,dimension_rows,master_rows,fact_rows,resolved_rows,unmatched_rows,
    ambiguous_rows,not_applicable_rows,cycle_resolved_rows,cycle_unmatched_rows,
    cycle_ambiguous_rows,cycle_not_applicable_rows,fact_set_sha256,resolution_state_sha256,
    fact_owner_maps,relation_owner_maps,verified_owner_maps,owner_map_state_sha256,receipt_sha256
  ) VALUES(p_operation_id,v_parent.migration_batch_id,p_sealed_plan_sha256,
    p_authorization_artifact_sha256,p_authorization_nonce_sha256,p_extension_nonce_sha256,
    p_code_sha,p_source_snapshot_sha256,p_mapping_contract_sha256,p_target_identity_sha256,
    p_tenant_id,p_park_id,p_target_scope_sha256,p_t0_phase_receipt_sha256,
    p_parent_performance_relations_contract_sha256,p_parent_relations_receipt_sha256,
    p_fact_loader_receipt_sha256,
    p_migration_308_sha256,p_migration_310_sha256,
    v_dimension,v_master,v_facts,v_resolved,v_unmatched,v_ambiguous,v_na,v_cycle_resolved,
    v_cycle_unmatched,v_cycle_ambiguous,v_cycle_na,v_fact_set,v_state,
    v_fact_owner_maps,v_relation_owner_maps,v_verified_owner_maps,v_owner_map_state,v_receipt)
  ON CONFLICT(operation_id) DO NOTHING;
  IF v_replayed AND (v_existing.resolution_state_sha256<>v_state
    OR v_existing.fact_owner_maps<>v_fact_owner_maps
    OR v_existing.relation_owner_maps<>v_relation_owner_maps
    OR v_existing.verified_owner_maps<>v_verified_owner_maps
    OR v_existing.owner_map_state_sha256<>v_owner_map_state
    OR v_existing.receipt_sha256<>v_receipt) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_REPLAY_DRIFT'; END IF;
  RETURN QUERY SELECT 'succeeded'::varchar,v_replayed,v_dimension,v_master,v_facts,
    v_resolved,v_unmatched,v_ambiguous,v_na,v_cycle_resolved,v_cycle_unmatched,
    v_cycle_ambiguous,v_cycle_na,v_fact_set,v_state,v_fact_owner_maps,
    v_relation_owner_maps,v_verified_owner_maps,v_owner_map_state,v_receipt;
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_rollback_performance_fact_identity_production_v1(
  p_rollback_operation_id varchar,p_operation_id varchar,p_sealed_plan_sha256 char(64),
  p_authorization_artifact_sha256 char(64),p_authorization_nonce_sha256 char(64),
  p_extension_rollback_nonce_sha256 char(64),p_code_sha char(40),
  p_source_snapshot_sha256 char(64),p_mapping_contract_sha256 char(64),
  p_target_identity_sha256 char(64),p_tenant_id varchar,p_park_id varchar,
  p_target_scope_sha256 char(64),p_t0_phase_receipt_sha256 char(64),
  p_parent_performance_relations_contract_sha256 char(64),
  p_parent_relations_receipt_sha256 char(64),p_fact_loader_receipt_sha256 char(64),
  p_migration_308_sha256 char(64),
  p_migration_310_sha256 char(64)
) RETURNS TABLE(status varchar,rollback_order text,residual_count bigint,replayed boolean,
  receipt_sha256 char(64))
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_receipt public.hr_yuzhou_performance_fact_identity_production_receipt%ROWTYPE;
  v_parent public.hr_yuzhou_performance_relations_production_receipt%ROWTYPE;
  v_residual bigint; v_assignment_rows bigint; v_rollback_receipt char(64); v_replayed boolean:=false;
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_REQUIRES_SERIALIZABLE'; END IF;
  IF p_extension_rollback_nonce_sha256!~'^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_ROLLBACK_BINDING_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_performance_relations_production',0));
  SELECT * INTO v_receipt FROM public.hr_yuzhou_performance_fact_identity_production_receipt
    WHERE operation_id=p_operation_id FOR UPDATE;
  SELECT * INTO v_parent FROM public.hr_yuzhou_performance_relations_production_receipt
    WHERE operation_id=p_operation_id FOR UPDATE;
  IF v_receipt.operation_id IS NULL OR v_parent.operation_id IS NULL
    OR ROW(v_receipt.sealed_plan_sha256,v_receipt.code_sha,v_receipt.source_snapshot_sha256,
      v_receipt.mapping_contract_sha256,v_receipt.target_identity_sha256,v_receipt.tenant_id,
      v_receipt.park_id,v_receipt.target_scope_sha256,v_receipt.t0_phase_receipt_sha256,
      v_receipt.parent_performance_relations_contract_sha256,
      v_receipt.parent_relations_receipt_sha256,v_receipt.fact_loader_receipt_sha256,
      v_receipt.migration_308_sha256,v_receipt.migration_310_sha256)
    IS DISTINCT FROM ROW(p_sealed_plan_sha256,p_code_sha,p_source_snapshot_sha256,
      p_mapping_contract_sha256,p_target_identity_sha256,p_tenant_id,p_park_id,
      p_target_scope_sha256,p_t0_phase_receipt_sha256,
      p_parent_performance_relations_contract_sha256,p_parent_relations_receipt_sha256,
      p_fact_loader_receipt_sha256,p_migration_308_sha256,p_migration_310_sha256)
    OR v_parent.receipt_sha256<>p_parent_relations_receipt_sha256
    OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_operation operation
      WHERE operation.operation_id=p_operation_id AND operation.status='succeeded')
    OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_rollback_operation rollback
      WHERE rollback.rollback_operation_id=p_rollback_operation_id
        AND rollback.import_operation_id=p_operation_id
        AND rollback.status IN('running','succeeded')
        AND rollback.sealed_plan_sha256=p_sealed_plan_sha256
        AND rollback.target_identity_sha256=p_target_identity_sha256
        AND rollback.authorization_artifact_sha256=p_authorization_artifact_sha256
        AND rollback.authorization_nonce_sha256=p_authorization_nonce_sha256)
    OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_authorization_use auth
      WHERE auth.intent='production_import_rollback' AND auth.operation_id=p_rollback_operation_id
        AND auth.import_operation_id=p_operation_id
        AND auth.authorization_artifact_sha256=p_authorization_artifact_sha256
        AND auth.authorization_nonce_sha256=p_authorization_nonce_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_ROLLBACK_BINDING_INVALID'; END IF;
  IF v_receipt.status='rolled_back' THEN
    IF v_receipt.rollback_operation_id<>p_rollback_operation_id
      OR v_receipt.extension_rollback_nonce_sha256<>p_extension_rollback_nonce_sha256
      OR v_parent.status NOT IN('succeeded','rolled_back') THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_ROLLBACK_REPLAY_DRIFT'; END IF;
    SELECT count(*) INTO v_residual FROM public.hr_performance_legacy_identity_resolution
      WHERE migration_batch_id=v_receipt.migration_batch_id
        AND fact_kind IN('dimension_result','master_result');
    IF v_residual<>0 THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_ROLLBACK_REPLAY_DRIFT'; END IF;
    v_replayed:=true; v_rollback_receipt:=v_receipt.rollback_receipt_sha256;
  ELSE
    IF v_receipt.status<>'succeeded' OR v_parent.status<>'succeeded'
      OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_rollback_operation rollback
        WHERE rollback.rollback_operation_id=p_rollback_operation_id
          AND rollback.status='running') THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_ROLLBACK_BINDING_INVALID'; END IF;
    PERFORM set_config('yuzhou.performance_fact_identity_operation_id',p_operation_id,true);
    PERFORM set_config('yuzhou.performance_fact_identity_rollback_operation_id',p_rollback_operation_id,true);
    PERFORM set_config('yuzhou.performance_fact_identity_mode','rollback',true);
    PERFORM set_config('yuzhou.performance_identity_resolution_rollback_batch_id',v_receipt.migration_batch_id::text,true);
    DELETE FROM public.hr_performance_legacy_identity_resolution
    WHERE migration_batch_id=v_receipt.migration_batch_id
      AND fact_kind IN('dimension_result','master_result');
    SELECT count(*) INTO v_residual FROM public.hr_performance_legacy_identity_resolution
      WHERE migration_batch_id=v_receipt.migration_batch_id
        AND fact_kind IN('dimension_result','master_result');
    SELECT count(*) INTO v_assignment_rows FROM public.hr_performance_legacy_identity_resolution
      WHERE migration_batch_id=v_receipt.migration_batch_id
        AND fact_kind='source_person_assignment';
    IF v_residual<>0 OR v_assignment_rows<>234 THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_ROLLBACK_RESIDUAL'; END IF;
    v_rollback_receipt:=encode(digest(convert_to(jsonb_build_object(
      'contract','jinhu-yuzhou-performance-fact-identity-production-rollback-v1',
      'rollbackOperationId',p_rollback_operation_id,'operationId',p_operation_id,
      'extensionRollbackNonceSha256',p_extension_rollback_nonce_sha256,
      'parentRelationsReceiptSha256',p_parent_relations_receipt_sha256,
      'factSetSha256',v_receipt.fact_set_sha256,
      'rollbackOrder','fact_identity>performance_relations>performance_facts',
      'residualCount',0)::text,'UTF8'),'sha256'),'hex');
    UPDATE public.hr_yuzhou_performance_fact_identity_production_receipt SET
      status='rolled_back',rollback_operation_id=p_rollback_operation_id,
      extension_rollback_nonce_sha256=p_extension_rollback_nonce_sha256,
      rollback_receipt_sha256=v_rollback_receipt,rolled_back_at=now()
    WHERE operation_id=p_operation_id;
  END IF;
  RETURN QUERY SELECT 'rolled_back'::varchar,
    'fact_identity>performance_relations>performance_facts'::text,
    COALESCE(v_residual,0)::bigint,v_replayed,v_rollback_receipt;
END$$;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jinhu_hr_yuzhou_performance_fact_identity_probe') THEN
    CREATE ROLE jinhu_hr_yuzhou_performance_fact_identity_probe
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jinhu_hr_yuzhou_performance_fact_identity_writer') THEN
    CREATE ROLE jinhu_hr_yuzhou_performance_fact_identity_writer
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN(
    'jinhu_hr_yuzhou_performance_fact_identity_probe',
    'jinhu_hr_yuzhou_performance_fact_identity_writer')
    AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole
      OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_ROLE_UNSAFE'; END IF;
END$$;

REVOKE ALL ON public.hr_yuzhou_performance_fact_identity_production_receipt FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_fact_identity_production_capability_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_fact_loader_dependency_valid_v1(
  varchar,uuid,varchar,varchar,char,char,char,char
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_fact_identity_set_v1(varchar,varchar,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_fact_identity_state_v1(varchar,varchar,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_owner_map_projection_v1(varchar,varchar,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_owner_map_state_v1(varchar,varchar,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_verify_performance_owner_maps_v1(
  varchar,varchar,uuid,bigint,boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_fact_identity_context_allowed_v1(uuid,varchar) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.hr_yuzhou_materialize_performance_fact_identity_production_v1(varchar,varchar,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_apply_performance_fact_identity_production_v1(
  varchar,char,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char,char,bigint,bigint,char,char,char
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_rollback_performance_fact_identity_production_v1(
  varchar,varchar,char,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char,char,char,char
) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO jinhu_hr_yuzhou_performance_fact_identity_probe,
  jinhu_hr_yuzhou_performance_fact_identity_writer;
GRANT EXECUTE ON FUNCTION public.hr_yuzhou_performance_fact_identity_production_capability_v1()
  TO jinhu_hr_yuzhou_performance_fact_identity_probe,jinhu_hr_yuzhou_performance_fact_identity_writer;
GRANT EXECUTE ON FUNCTION public.hr_yuzhou_apply_performance_fact_identity_production_v1(
  varchar,char,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char,char,bigint,bigint,char,char,char
) TO jinhu_hr_yuzhou_performance_fact_identity_writer;
GRANT EXECUTE ON FUNCTION public.hr_yuzhou_rollback_performance_fact_identity_production_v1(
  varchar,varchar,char,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char,char,char,char
) TO jinhu_hr_yuzhou_performance_fact_identity_writer;

COMMIT;
