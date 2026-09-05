BEGIN;

-- Production capability for the immutable 000307 person.assessment evidence.
-- The writer is deliberately stacked on the reviewed 000308 production owner
-- bridge. It never creates a performance owner batch and stores only hashes,
-- aggregate counts, and statuses in its control ledger.

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jinhu_hr_yuzhou_perf_assessment_reader') THEN
    CREATE ROLE jinhu_hr_yuzhou_perf_assessment_reader
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS(
    SELECT 1 FROM pg_roles WHERE rolname='jinhu_hr_yuzhou_perf_assessment_reader'
      AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR rolcanlogin)
  ) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_READER_ROLE_UNSAFE';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jinhu_hr_yuzhou_perf_assessment_executor') THEN
    CREATE ROLE jinhu_hr_yuzhou_perf_assessment_executor
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS(
    SELECT 1 FROM pg_roles WHERE rolname='jinhu_hr_yuzhou_perf_assessment_executor'
      AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR rolcanlogin)
  ) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_EXECUTOR_ROLE_UNSAFE';
  END IF;
END$$;

CREATE TABLE hr_yuzhou_performance_person_assessment_operation (
  operation_id varchar(80) PRIMARY KEY,
  parent_import_operation_id varchar(64) NOT NULL
    REFERENCES hr_yuzhou_production_import_operation(operation_id),
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id),
  status varchar(24) NOT NULL,
  code_sha char(40) NOT NULL,
  source_snapshot_sha256 char(64) NOT NULL,
  mapping_contract_sha256 char(64) NOT NULL,
  target_identity_sha256 char(64) NOT NULL,
  target_tenant_id varchar(64) NOT NULL,
  target_park_id varchar(64) NOT NULL,
  target_scope_sha256 char(64) NOT NULL,
  t0_artifact_sha256 char(64) NOT NULL,
  source_restore_receipt_sha256 char(64) NOT NULL,
  source_payload_artifact_sha256 char(64) NOT NULL,
  safe_receipt_artifact_sha256 char(64) NOT NULL,
  contract_artifact_sha256 char(64) NOT NULL,
  migration_307_sha256 char(64) NOT NULL,
  migration_308_sha256 char(64) NOT NULL,
  payload_sha256 char(64) NOT NULL,
  sealed_artifact_sha256 char(64) NOT NULL UNIQUE,
  binding_sha256 char(64) NOT NULL UNIQUE,
  authorization_artifact_sha256 char(64) NOT NULL UNIQUE,
  authorization_nonce_sha256 char(64) NOT NULL UNIQUE,
  authorization_expires_at timestamptz NOT NULL,
  owner_state_sha256 char(64) NOT NULL,
  applied_evidence_rows bigint NOT NULL DEFAULT 0,
  applied_master_rows bigint NOT NULL DEFAULT 0,
  applied_resolution_rows bigint NOT NULL DEFAULT 0,
  applied_state_sha256 char(64),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  rolled_back_at timestamptz,
  CONSTRAINT uq_hr_yuzhou_perf_assessment_batch UNIQUE(migration_batch_id),
  CONSTRAINT ck_hr_yuzhou_perf_assessment_operation_identity CHECK(
    operation_id~'^yzprod-perfrel-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$'
    AND code_sha~'^[0-9a-f]{40}$'
    AND source_snapshot_sha256~'^[0-9a-f]{64}$'
    AND mapping_contract_sha256~'^[0-9a-f]{64}$'
    AND target_identity_sha256~'^[0-9a-f]{64}$'
    AND target_scope_sha256~'^[0-9a-f]{64}$'
    AND t0_artifact_sha256~'^[0-9a-f]{64}$'
    AND source_restore_receipt_sha256~'^[0-9a-f]{64}$'
    AND source_payload_artifact_sha256~'^[0-9a-f]{64}$'
    AND safe_receipt_artifact_sha256~'^[0-9a-f]{64}$'
    AND contract_artifact_sha256~'^[0-9a-f]{64}$'
    AND migration_307_sha256~'^[0-9a-f]{64}$'
    AND migration_308_sha256~'^[0-9a-f]{64}$'
    AND payload_sha256~'^[0-9a-f]{64}$'
    AND sealed_artifact_sha256~'^[0-9a-f]{64}$'
    AND binding_sha256~'^[0-9a-f]{64}$'
    AND authorization_artifact_sha256~'^[0-9a-f]{64}$'
    AND authorization_nonce_sha256~'^[0-9a-f]{64}$'
    AND owner_state_sha256~'^[0-9a-f]{64}$'
    AND (applied_state_sha256 IS NULL OR applied_state_sha256~'^[0-9a-f]{64}$')
  ),
  CONSTRAINT ck_hr_yuzhou_perf_assessment_operation_scope CHECK(
    target_tenant_id~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
    AND target_park_id~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  CONSTRAINT ck_hr_yuzhou_perf_assessment_operation_status CHECK(
    status IN('authorized','running','succeeded','rolled_back')
  ),
  CONSTRAINT ck_hr_yuzhou_perf_assessment_operation_counts CHECK(
    applied_evidence_rows>=0 AND applied_master_rows>=0 AND applied_resolution_rows>=0
    AND applied_resolution_rows=applied_master_rows
  ),
  CONSTRAINT ck_hr_yuzhou_perf_assessment_operation_lifecycle CHECK(
    (status='authorized' AND started_at IS NULL AND finished_at IS NULL AND rolled_back_at IS NULL
      AND applied_state_sha256 IS NULL)
    OR (status='running' AND started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL)
    OR (status='succeeded' AND started_at IS NOT NULL AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      AND applied_state_sha256 IS NOT NULL)
    OR (status='rolled_back' AND started_at IS NOT NULL AND finished_at IS NOT NULL AND rolled_back_at IS NOT NULL
      AND applied_state_sha256 IS NOT NULL)
  )
);

CREATE TABLE hr_yuzhou_performance_person_assessment_authorization_use (
  usage_id bigserial PRIMARY KEY,
  intent varchar(64) NOT NULL,
  operation_id varchar(96) NOT NULL UNIQUE,
  import_operation_id varchar(80) NOT NULL
    REFERENCES hr_yuzhou_performance_person_assessment_operation(operation_id),
  authorization_artifact_sha256 char(64) NOT NULL UNIQUE,
  authorization_nonce_sha256 char(64) NOT NULL UNIQUE,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_yuzhou_perf_assessment_auth_use CHECK(
    intent IN('production_performance_person_assessment_import',
      'production_performance_person_assessment_rollback')
    AND authorization_artifact_sha256~'^[0-9a-f]{64}$'
    AND authorization_nonce_sha256~'^[0-9a-f]{64}$'
  )
);

CREATE TABLE hr_yuzhou_performance_person_assessment_rollback_operation (
  rollback_operation_id varchar(96) PRIMARY KEY,
  import_operation_id varchar(80) NOT NULL UNIQUE
    REFERENCES hr_yuzhou_performance_person_assessment_operation(operation_id),
  status varchar(24) NOT NULL,
  sealed_artifact_sha256 char(64) NOT NULL,
  authorization_artifact_sha256 char(64) NOT NULL UNIQUE,
  authorization_nonce_sha256 char(64) NOT NULL UNIQUE,
  authorization_expires_at timestamptz NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  residual_count bigint,
  rollback_state_sha256 char(64),
  CONSTRAINT ck_hr_yuzhou_perf_assessment_rollback_identity CHECK(
    rollback_operation_id~'^yzprod-perfrel-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$'
    AND sealed_artifact_sha256~'^[0-9a-f]{64}$'
    AND authorization_artifact_sha256~'^[0-9a-f]{64}$'
    AND authorization_nonce_sha256~'^[0-9a-f]{64}$'
    AND (rollback_state_sha256 IS NULL OR rollback_state_sha256~'^[0-9a-f]{64}$')
  ),
  CONSTRAINT ck_hr_yuzhou_perf_assessment_rollback_status CHECK(
    status IN('authorized','running','succeeded')
  ),
  CONSTRAINT ck_hr_yuzhou_perf_assessment_rollback_lifecycle CHECK(
    (status='authorized' AND started_at IS NULL AND finished_at IS NULL
      AND residual_count IS NULL AND rollback_state_sha256 IS NULL)
    OR (status='running' AND started_at IS NOT NULL AND finished_at IS NULL)
    OR (status='succeeded' AND started_at IS NOT NULL AND finished_at IS NOT NULL
      AND residual_count=0 AND rollback_state_sha256 IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_person_assessment_owner_state_sha256(
  p_batch_id uuid
) RETURNS char(64)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT encode(digest(convert_to(jsonb_build_object(
    'contract','yuzhou-performance-person-assessment-owner-state-v1',
    'templateProfiles',COALESCE((SELECT jsonb_agg(jsonb_build_array(
      profile.id,profile.source_identity_sha256,profile.source_row_sha256,
      profile.source_assessment,profile.legacy_record_map_id
    ) ORDER BY profile.id) FROM public.hr_performance_legacy_template_profile profile
      WHERE profile.migration_batch_id=p_batch_id),'[]'::jsonb),
    'dimensionProfiles',COALESCE((SELECT jsonb_agg(jsonb_build_array(
      dimension.id,dimension.source_identity_sha256,dimension.source_row_sha256,
      dimension.legacy_template_profile_id,dimension.legacy_record_map_id
    ) ORDER BY dimension.id) FROM public.hr_performance_legacy_dimension_profile dimension
      WHERE dimension.migration_batch_id=p_batch_id),'[]'::jsonb),
    'dimensionResults',COALESCE((SELECT jsonb_agg(jsonb_build_array(
      result.id,result.source_identity_sha256,result.source_row_sha256,
      result.legacy_dimension_profile_id,result.legacy_record_map_id
    ) ORDER BY result.id) FROM public.hr_performance_legacy_dimension_result result
      WHERE result.migration_batch_id=p_batch_id),'[]'::jsonb),
    'masterResults',COALESCE((SELECT jsonb_agg(jsonb_build_array(
      master.id,master.source_identity_sha256,master.source_row_sha256,
      master.legacy_template_profile_id,master.legacy_record_map_id
    ) ORDER BY master.id) FROM public.hr_performance_legacy_master_result master
      WHERE master.migration_batch_id=p_batch_id),'[]'::jsonb)
  )::text,'UTF8'),'sha256'),'hex')::char(64)
$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_person_assessment_state_sha256(
  p_batch_id uuid,p_status varchar,p_binding_sha256 char(64)
) RETURNS char(64)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT encode(digest(convert_to(jsonb_build_object(
    'contract','yuzhou-performance-person-assessment-state-v1',
    'status',p_status,
    'bindingSha256',p_binding_sha256,
    'evidence',COALESCE((SELECT jsonb_agg(jsonb_build_array(
      evidence.id,evidence.source_person_identity_sha256,
      evidence.source_assessment_id,evidence.evidence_sha256
    ) ORDER BY evidence.id)
      FROM public.hr_performance_legacy_person_assessment_evidence evidence
      WHERE evidence.migration_batch_id=p_batch_id),'[]'::jsonb),
    'resolutions',COALESCE((SELECT jsonb_agg(jsonb_build_array(
      resolution.id,resolution.legacy_master_result_id,
      resolution.person_resolution_status,resolution.detail_resolution_status,
      resolution.comparison_status,resolution.evidence_sha256
    ) ORDER BY resolution.id)
      FROM public.hr_performance_legacy_ass_compute_weight_resolution resolution
      WHERE resolution.migration_batch_id=p_batch_id),'[]'::jsonb)
  )::text,'UTF8'),'sha256'),'hex')::char(64)
$$;

-- This is the exact canonical JSON shape emitted by the production adapter:
-- object keys and row keys are lexicographically ordered, arrays retain source
-- order, and the canonical document ends with one LF byte.
CREATE OR REPLACE FUNCTION hr_yuzhou_performance_person_assessment_payload_sha256(
  p_payload jsonb
) RETURNS char(64)
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
  SELECT encode(digest(convert_to(
    '{"personAssessments":['
      ||COALESCE((SELECT string_agg(
        '{"sourceAssessmentId":'||COALESCE(value->>'sourceAssessmentId','null')
          ||',"sourcePersonIdentitySha256":'||to_json(value->>'sourcePersonIdentitySha256')::text||'}',
        ',' ORDER BY ordinal)
        FROM jsonb_array_elements(p_payload->'personAssessments') WITH ORDINALITY rows(value,ordinal)
      ),'')
      ||']}'||chr(10),
    'UTF8'),'sha256'),'hex')::char(64)
$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_person_assessment_dependency_valid(
  p_parent_import_operation_id varchar,p_batch_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_capability record;
BEGIN
  SELECT * INTO STRICT v_capability
  FROM public.hr_yuzhou_performance_relations_production_capability_v1();
  IF v_capability.capability_id<>'jinhu-yuzhou-performance-relations-production-v1'
    OR v_capability.migration_305_sha256<>'d3784218fc8272bd28b93e44b19a02d5c8124466b6b3c218294920603909dfc0'
    OR v_capability.migration_306_sha256<>'cd49f294f4c9e4105b9f7fd4c678b7b2d29c5433d0348f6e6632d6e7c135a56d'
    OR v_capability.production_context_supported IS DISTINCT FROM true
    OR v_capability.reverse_order<>'identity_resolution>source_person_assignments' THEN
    RETURN false;
  END IF;
  IF NOT EXISTS(
      SELECT 1
      FROM public.sys_schema_migration_history primary_history
      JOIN public.schema_migrations standard_history
        ON standard_history.filename=primary_history.filename
       AND standard_history.checksum=primary_history.checksum
       AND standard_history.status=primary_history.status
      WHERE primary_history.filename='000308_hr_yuzhou_performance_relations_production.sql'
        AND primary_history.status='succeeded'
        AND primary_history.checksum='ad77e0cf12cf73f98a5984835a9943a9e15c96cde37fe6bd95133845c711befa'
    ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS(
    SELECT 1
    FROM public.hr_yuzhou_performance_relations_production_receipt receipt
    JOIN public.migration_batch batch ON batch.id=receipt.migration_batch_id
    JOIN public.hr_yuzhou_production_import_phase phase
      ON (phase.operation_id,phase.phase)=(receipt.operation_id,'T0')
    WHERE receipt.operation_id=p_parent_import_operation_id
      AND receipt.migration_batch_id=p_batch_id
      AND receipt.status='succeeded'
      AND phase.status='succeeded'
      AND phase.after_canonical_sha256 IS NOT NULL
      AND receipt.t0_phase_receipt_sha256=phase.after_canonical_sha256
      AND batch.execution_context='production_import'
      AND batch.production_import_operation_id=p_parent_import_operation_id
      AND batch.production_import_phase='T0'
      AND batch.target_database=current_database()
      AND batch.status='succeeded'
  );
EXCEPTION WHEN undefined_function OR undefined_table OR no_data_found OR too_many_rows THEN
  RETURN false;
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_person_assessment_production_context_allowed(
  p_batch_id uuid,p_mode varchar
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT CASE p_mode
    WHEN 'apply' THEN EXISTS(
      SELECT 1
      FROM public.hr_yuzhou_performance_person_assessment_operation operation
      WHERE operation.migration_batch_id=p_batch_id
        AND operation.status='running'
        AND operation.migration_308_sha256='ad77e0cf12cf73f98a5984835a9943a9e15c96cde37fe6bd95133845c711befa'
        AND current_setting('yuzhou.performance_person_assessment_operation_id',true)=operation.operation_id
        AND current_setting('yuzhou.performance_person_assessment_mode',true)='apply'
        AND public.hr_yuzhou_performance_person_assessment_dependency_valid(
          operation.parent_import_operation_id,operation.migration_batch_id)
        AND public.hr_yuzhou_performance_relations_production_context_allowed(p_batch_id,'apply')
    )
    WHEN 'rollback' THEN EXISTS(
      SELECT 1
      FROM public.hr_yuzhou_performance_person_assessment_operation operation
      JOIN public.hr_yuzhou_performance_person_assessment_rollback_operation rollback_operation
        ON rollback_operation.import_operation_id=operation.operation_id
      JOIN public.hr_yuzhou_performance_person_assessment_authorization_use auth_use
        ON auth_use.operation_id=rollback_operation.rollback_operation_id
       AND auth_use.import_operation_id=operation.operation_id
       AND auth_use.intent='production_performance_person_assessment_rollback'
      WHERE operation.migration_batch_id=p_batch_id
        AND operation.status='succeeded'
        AND operation.migration_308_sha256='ad77e0cf12cf73f98a5984835a9943a9e15c96cde37fe6bd95133845c711befa'
        AND rollback_operation.status='running'
        AND current_setting('yuzhou.performance_person_assessment_operation_id',true)=operation.operation_id
        AND current_setting('yuzhou.performance_person_assessment_rollback_operation_id',true)=rollback_operation.rollback_operation_id
        AND current_setting('yuzhou.performance_person_assessment_mode',true)='rollback'
        AND public.hr_yuzhou_performance_person_assessment_dependency_valid(
          operation.parent_import_operation_id,operation.migration_batch_id)
    )
    ELSE false
  END
$$;

-- Preserve every 000307 lab rule. Production INSERT/DELETE is accepted only
-- while the exact operation is authorized and its 000308 owner receipt remains
-- active; UPDATE is never allowed.
CREATE OR REPLACE FUNCTION hr_performance_yuzhou_person_assessment_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_batch public.migration_batch%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' AND (
    (current_setting('yuzhou.ass_compute_weight_rollback_batch_id',true)=OLD.migration_batch_id::text
      AND EXISTS(SELECT 1 FROM public.migration_batch batch WHERE batch.id=OLD.migration_batch_id
        AND batch.execution_context='lab_rehearsal' AND batch.phase='rollback' AND batch.status='running'))
    OR public.hr_yuzhou_performance_person_assessment_production_context_allowed(
      OLD.migration_batch_id,'rollback')
  ) THEN RETURN OLD; END IF;
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_EVIDENCE_IMMUTABLE';
  END IF;
  SELECT * INTO v_batch FROM public.migration_batch WHERE id=NEW.migration_batch_id FOR SHARE;
  IF NOT FOUND OR v_batch.target_database<>current_database() OR NOT (
    (v_batch.execution_context='lab_rehearsal' AND v_batch.phase='load' AND v_batch.status='running')
    OR public.hr_yuzhou_performance_person_assessment_production_context_allowed(
      NEW.migration_batch_id,'apply')
  ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_BATCH_INVALID'; END IF;
  IF NEW.evidence_sha256<>public.hr_performance_yuzhou_person_assessment_evidence_sha256(
      NEW.source_person_identity_sha256,NEW.source_assessment_id) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_EVIDENCE_HASH_MISMATCH';
  END IF;
  RETURN NEW;
END$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_ass_compute_weight_resolution_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_batch public.migration_batch%ROWTYPE;
  v_master public.hr_performance_legacy_master_result%ROWTYPE;
  v_expected record;
  v_expected_evidence char(64);
BEGIN
  IF TG_OP='DELETE' AND (
    (current_setting('yuzhou.ass_compute_weight_rollback_batch_id',true)=OLD.migration_batch_id::text
      AND EXISTS(SELECT 1 FROM public.migration_batch batch WHERE batch.id=OLD.migration_batch_id
        AND batch.execution_context='lab_rehearsal' AND batch.phase='rollback' AND batch.status='running'))
    OR public.hr_yuzhou_performance_person_assessment_production_context_allowed(
      OLD.migration_batch_id,'rollback')
  ) THEN RETURN OLD; END IF;
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_RESOLUTION_IMMUTABLE';
  END IF;
  SELECT * INTO v_batch FROM public.migration_batch WHERE id=NEW.migration_batch_id FOR SHARE;
  IF NOT FOUND OR v_batch.target_database<>current_database() OR NOT (
    (v_batch.execution_context='lab_rehearsal' AND v_batch.phase='load' AND v_batch.status='running')
    OR public.hr_yuzhou_performance_person_assessment_production_context_allowed(
      NEW.migration_batch_id,'apply')
  ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_BATCH_INVALID'; END IF;
  SELECT * INTO v_master FROM public.hr_performance_legacy_master_result
  WHERE (id,tenant_id,park_id,migration_batch_id)=
    (NEW.legacy_master_result_id,NEW.tenant_id,NEW.park_id,NEW.migration_batch_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_MASTER_MISMATCH'; END IF;
  SELECT * INTO STRICT v_expected
  FROM public.hr_performance_yuzhou_ass_compute_weight_expectation(NEW.legacy_master_result_id);
  IF v_master.legacy_template_profile_id IS DISTINCT FROM v_expected.detail_template_profile_id THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_DETAIL_DERIVATION_DRIFT'; END IF;
  IF ROW(NEW.source_person_identity_sha256,NEW.source_person_evidence_count,
      NEW.source_person_assessment_id,NEW.person_template_candidate_count,
      NEW.person_template_profile_id,NEW.person_resolution_status,
      NEW.detail_template_candidate_count,NEW.detail_template_profile_id,
      NEW.detail_resolution_status,NEW.comparison_status)
    IS DISTINCT FROM ROW(v_expected.source_person_identity_sha256,
      v_expected.source_person_evidence_count,v_expected.source_person_assessment_id,
      v_expected.person_template_candidate_count,v_expected.person_template_profile_id,
      v_expected.person_resolution_status,v_expected.detail_template_candidate_count,
      v_expected.detail_template_profile_id,v_expected.detail_resolution_status,
      v_expected.comparison_status) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_RESOLUTION_MISMATCH';
  END IF;
  v_expected_evidence:=public.hr_performance_yuzhou_ass_compute_weight_evidence_sha256(
    NEW.legacy_master_result_id,NEW.source_person_identity_sha256,
    NEW.source_person_evidence_count,NEW.source_person_assessment_id,
    NEW.person_template_candidate_count,NEW.person_template_profile_id,
    NEW.person_resolution_status,NEW.detail_template_candidate_count,
    NEW.detail_template_profile_id,NEW.detail_resolution_status,NEW.comparison_status
  );
  IF NEW.evidence_sha256<>v_expected_evidence THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_EVIDENCE_HASH_MISMATCH'; END IF;
  RETURN NEW;
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_person_assessment_production_capability(
  p_parent_import_operation_id varchar,p_t0_artifact_sha256 char(64),
  p_contract_artifact_sha256 char(64),p_migration_artifact_sha256 char(64),
  p_target_scope_sha256 char(64)
) RETURNS TABLE(
  execution_context varchar,phase varchar,migration_artifact_sha256 char(64),
  parent_import_operation_id varchar,t0_artifact_sha256 char(64),
  contract_artifact_sha256 char(64),apply_procedure varchar,rollback_procedure varchar
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_operation public.hr_yuzhou_production_import_operation%ROWTYPE;
  v_receipt public.hr_yuzhou_performance_relations_production_receipt%ROWTYPE;
BEGIN
  IF p_contract_artifact_sha256<>'f9eac8435900c05251c82c0c1be04bbe63992ca9f65a9879c21c838af898f62c'
    OR p_migration_artifact_sha256<>'0467f31888a5fb52c7c63ab1e754a68ab76822b2e177318bf249f71eb1f8887a' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_CAPABILITY_ARTIFACT_DRIFT'; END IF;
  SELECT * INTO v_operation FROM public.hr_yuzhou_production_import_operation
    WHERE operation_id=p_parent_import_operation_id;
  SELECT * INTO v_receipt FROM public.hr_yuzhou_performance_relations_production_receipt
    WHERE operation_id=p_parent_import_operation_id;
  IF v_operation.operation_id IS NULL OR v_receipt.operation_id IS NULL
    OR v_operation.execution_contract_version<>2
    OR v_operation.status NOT IN('running','succeeded')
    OR v_operation.target_scope_sha256<>p_target_scope_sha256
    OR v_receipt.status<>'succeeded'
    OR v_receipt.t0_phase_receipt_sha256<>p_t0_artifact_sha256
    OR NOT public.hr_yuzhou_performance_person_assessment_dependency_valid(
      p_parent_import_operation_id,v_receipt.migration_batch_id) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_CAPABILITY_DEPENDENCY_INVALID'; END IF;
  RETURN QUERY SELECT
    'production_import'::varchar,'PERFREL'::varchar,
    '0467f31888a5fb52c7c63ab1e754a68ab76822b2e177318bf249f71eb1f8887a'::char(64),
    p_parent_import_operation_id,p_t0_artifact_sha256,p_contract_artifact_sha256,
    'materialize_yuzhou_performance_ass_compute_weight_relation_production'::varchar,
    'rollback_yuzhou_performance_ass_compute_weight_relation_production'::varchar;
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_consume_performance_person_assessment_authorization(
  p_operation_id varchar,p_parent_import_operation_id varchar,p_code_sha char(40),
  p_source_snapshot_sha256 char(64),p_mapping_contract_sha256 char(64),
  p_t0_artifact_sha256 char(64),p_contract_artifact_sha256 char(64),
  p_source_restore_receipt_sha256 char(64),p_source_payload_artifact_sha256 char(64),
  p_safe_receipt_artifact_sha256 char(64),p_migration_artifact_sha256 char(64),
  p_payload_sha256 char(64),p_sealed_artifact_sha256 char(64),p_binding_sha256 char(64),
  p_authorization_artifact_sha256 char(64),p_authorization_nonce_sha256 char(64),
  p_authorization_expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_parent public.hr_yuzhou_production_import_operation%ROWTYPE;
  v_relations public.hr_yuzhou_performance_relations_production_receipt%ROWTYPE;
  v_existing public.hr_yuzhou_performance_person_assessment_operation%ROWTYPE;
  v_owner_state char(64);
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_REQUIRES_SERIALIZABLE'; END IF;
  IF now()>=p_authorization_expires_at THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_AUTH_STALE'; END IF;
  IF p_operation_id!~'^yzprod-perfrel-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$'
    OR p_code_sha!~'^[0-9a-f]{40}$'
    OR p_source_snapshot_sha256!~'^[0-9a-f]{64}$'
    OR p_mapping_contract_sha256!~'^[0-9a-f]{64}$'
    OR p_t0_artifact_sha256!~'^[0-9a-f]{64}$'
    OR p_source_restore_receipt_sha256!~'^[0-9a-f]{64}$'
    OR p_source_payload_artifact_sha256!~'^[0-9a-f]{64}$'
    OR p_safe_receipt_artifact_sha256!~'^[0-9a-f]{64}$'
    OR p_payload_sha256!~'^[0-9a-f]{64}$'
    OR p_sealed_artifact_sha256!~'^[0-9a-f]{64}$'
    OR p_binding_sha256!~'^[0-9a-f]{64}$'
    OR p_authorization_artifact_sha256!~'^[0-9a-f]{64}$'
    OR p_authorization_nonce_sha256!~'^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_AUTH_INVALID'; END IF;
  IF p_contract_artifact_sha256<>'f9eac8435900c05251c82c0c1be04bbe63992ca9f65a9879c21c838af898f62c'
    OR p_migration_artifact_sha256<>'0467f31888a5fb52c7c63ab1e754a68ab76822b2e177318bf249f71eb1f8887a' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_ARTIFACT_DRIFT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_performance_person_assessment',0));
  SELECT * INTO v_existing FROM public.hr_yuzhou_performance_person_assessment_operation
    WHERE operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF ROW(v_existing.parent_import_operation_id,v_existing.code_sha,
        v_existing.source_snapshot_sha256,v_existing.mapping_contract_sha256,
        v_existing.t0_artifact_sha256,v_existing.contract_artifact_sha256,
        v_existing.source_restore_receipt_sha256,v_existing.source_payload_artifact_sha256,
        v_existing.safe_receipt_artifact_sha256,v_existing.migration_307_sha256,
        v_existing.payload_sha256,v_existing.sealed_artifact_sha256,
        v_existing.binding_sha256,v_existing.authorization_artifact_sha256,
        v_existing.authorization_nonce_sha256)
      IS DISTINCT FROM ROW(p_parent_import_operation_id,p_code_sha,
        p_source_snapshot_sha256,p_mapping_contract_sha256,p_t0_artifact_sha256,
        p_contract_artifact_sha256,p_source_restore_receipt_sha256,
        p_source_payload_artifact_sha256,p_safe_receipt_artifact_sha256,
        p_migration_artifact_sha256,p_payload_sha256,p_sealed_artifact_sha256,
        p_binding_sha256,p_authorization_artifact_sha256,p_authorization_nonce_sha256) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_AUTH_REPLAY_DRIFT'; END IF;
    RETURN;
  END IF;
  SELECT * INTO v_parent FROM public.hr_yuzhou_production_import_operation
    WHERE operation_id=p_parent_import_operation_id FOR SHARE;
  SELECT * INTO v_relations FROM public.hr_yuzhou_performance_relations_production_receipt
    WHERE operation_id=p_parent_import_operation_id FOR SHARE;
  IF v_parent.operation_id IS NULL OR v_relations.operation_id IS NULL
    OR v_parent.execution_contract_version<>2 OR v_parent.status<>'running'
    OR v_parent.current_phase<>'T0'
    OR ROW(v_parent.code_sha,v_parent.source_snapshot_sha256,v_parent.mapping_contract_sha256)
      IS DISTINCT FROM ROW(p_code_sha,p_source_snapshot_sha256,p_mapping_contract_sha256)
    OR v_relations.status<>'succeeded'
    OR ROW(v_relations.code_sha,v_relations.source_snapshot_sha256,
      v_relations.mapping_contract_sha256,v_relations.target_identity_sha256,
      v_relations.tenant_id,v_relations.park_id,v_relations.target_scope_sha256,
      v_relations.t0_phase_receipt_sha256)
      IS DISTINCT FROM ROW(v_parent.code_sha,v_parent.source_snapshot_sha256,
        v_parent.mapping_contract_sha256,v_parent.target_identity_sha256,
        v_parent.target_tenant_id,v_parent.target_park_id,v_parent.target_scope_sha256,
        p_t0_artifact_sha256)
    OR p_authorization_expires_at>v_parent.window_ends_at
    OR NOT public.hr_yuzhou_performance_person_assessment_dependency_valid(
      p_parent_import_operation_id,v_relations.migration_batch_id) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_PARENT_BINDING_INVALID'; END IF;
  v_owner_state:=public.hr_yuzhou_performance_person_assessment_owner_state_sha256(
    v_relations.migration_batch_id);
  IF EXISTS(SELECT 1 FROM public.hr_yuzhou_performance_person_assessment_authorization_use
    WHERE authorization_artifact_sha256=p_authorization_artifact_sha256
      OR authorization_nonce_sha256=p_authorization_nonce_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_AUTH_REUSED'; END IF;
  INSERT INTO public.hr_yuzhou_performance_person_assessment_operation(
    operation_id,parent_import_operation_id,migration_batch_id,status,code_sha,
    source_snapshot_sha256,mapping_contract_sha256,target_identity_sha256,
    target_tenant_id,target_park_id,target_scope_sha256,t0_artifact_sha256,
    source_restore_receipt_sha256,source_payload_artifact_sha256,
    safe_receipt_artifact_sha256,contract_artifact_sha256,migration_307_sha256,
    migration_308_sha256,payload_sha256,sealed_artifact_sha256,binding_sha256,
    authorization_artifact_sha256,authorization_nonce_sha256,
    authorization_expires_at,owner_state_sha256
  ) VALUES(
    p_operation_id,p_parent_import_operation_id,v_relations.migration_batch_id,'authorized',p_code_sha,
    p_source_snapshot_sha256,p_mapping_contract_sha256,v_parent.target_identity_sha256,
    v_parent.target_tenant_id,v_parent.target_park_id,v_parent.target_scope_sha256,p_t0_artifact_sha256,
    p_source_restore_receipt_sha256,p_source_payload_artifact_sha256,
    p_safe_receipt_artifact_sha256,p_contract_artifact_sha256,p_migration_artifact_sha256,
    'ad77e0cf12cf73f98a5984835a9943a9e15c96cde37fe6bd95133845c711befa',p_payload_sha256,p_sealed_artifact_sha256,p_binding_sha256,
    p_authorization_artifact_sha256,p_authorization_nonce_sha256,p_authorization_expires_at,v_owner_state
  );
  INSERT INTO public.hr_yuzhou_performance_person_assessment_authorization_use(
    intent,operation_id,import_operation_id,authorization_artifact_sha256,authorization_nonce_sha256
  ) VALUES('production_performance_person_assessment_import',p_operation_id,p_operation_id,
    p_authorization_artifact_sha256,p_authorization_nonce_sha256);
END$$;

CREATE OR REPLACE PROCEDURE materialize_yuzhou_performance_ass_compute_weight_relation_production(
  p_operation_id varchar,p_tenant_id varchar,p_park_id varchar,
  p_migration_artifact_sha256 char(64),p_payload_sha256 char(64),p_payload jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_operation public.hr_yuzhou_performance_person_assessment_operation%ROWTYPE;
  v_row jsonb; v_evidence_id uuid; v_evidence_hash char(64); v_assessment_id integer;
  v_master record; v_expected record; v_resolution_id uuid; v_resolution_hash char(64);
  v_evidence_count bigint; v_master_count bigint; v_resolution_count bigint;
  v_state char(64); v_namespace constant uuid:='be9df574-adbd-4bbf-8da1-1875ba647055';
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_REQUIRES_SERIALIZABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_performance_person_assessment',0));
  SELECT * INTO v_operation FROM public.hr_yuzhou_performance_person_assessment_operation
    WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_AUTH_REQUIRED'; END IF;
  IF ROW(v_operation.target_tenant_id,v_operation.target_park_id,
      v_operation.migration_307_sha256,v_operation.payload_sha256)
    IS DISTINCT FROM ROW(p_tenant_id,p_park_id,p_migration_artifact_sha256,p_payload_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_APPLY_DRIFT'; END IF;
  IF NOT public.hr_performance_yuzhou_jsonb_exact_keys(p_payload,ARRAY['personAssessments'])
    OR jsonb_typeof(p_payload->'personAssessments')<>'array'
    OR jsonb_array_length(p_payload->'personAssessments')<1 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_PAYLOAD_INVALID'; END IF;
  IF public.hr_yuzhou_performance_person_assessment_payload_sha256(p_payload)<>p_payload_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_PAYLOAD_DRIFT'; END IF;
  IF v_operation.status='succeeded' THEN RETURN; END IF;
  IF v_operation.status<>'authorized' OR now()>=v_operation.authorization_expires_at THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_AUTH_INVALID'; END IF;
  UPDATE public.hr_yuzhou_performance_person_assessment_operation
    SET status='running',started_at=now() WHERE operation_id=p_operation_id;
  PERFORM set_config('yuzhou.performance_relations_operation_id',
    v_operation.parent_import_operation_id,true);
  PERFORM set_config('yuzhou.performance_relations_mode','apply',true);
  PERFORM set_config('yuzhou.performance_person_assessment_operation_id',p_operation_id,true);
  PERFORM set_config('yuzhou.performance_person_assessment_mode','apply',true);
  IF NOT public.hr_yuzhou_performance_person_assessment_production_context_allowed(
      v_operation.migration_batch_id,'apply') THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_CONTEXT_INVALID'; END IF;
  LOCK TABLE public.hr_performance_legacy_person_assessment_evidence,
    public.hr_performance_legacy_ass_compute_weight_resolution,
    public.hr_performance_legacy_master_result,public.hr_performance_legacy_template_profile,
    public.hr_performance_legacy_dimension_profile,public.hr_performance_legacy_dimension_result
    IN SHARE ROW EXCLUSIVE MODE;
  IF public.hr_yuzhou_performance_person_assessment_owner_state_sha256(
      v_operation.migration_batch_id)<>v_operation.owner_state_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_OWNER_DRIFT'; END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'personAssessments') LOOP
    IF NOT public.hr_performance_yuzhou_jsonb_exact_keys(
        v_row,ARRAY['sourcePersonIdentitySha256','sourceAssessmentId'])
      OR (v_row->>'sourcePersonIdentitySha256')!~'^[0-9a-f]{64}$'
      OR jsonb_typeof(v_row->'sourceAssessmentId') NOT IN('number','null') THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_PERSON_EVIDENCE_INVALID'; END IF;
    v_assessment_id:=NULLIF(v_row->>'sourceAssessmentId','')::integer;
    v_evidence_hash:=public.hr_performance_yuzhou_person_assessment_evidence_sha256(
      (v_row->>'sourcePersonIdentitySha256')::char(64),v_assessment_id);
    v_evidence_id:=uuid_generate_v5(v_namespace,'person-assessment:'
      ||v_operation.migration_batch_id::text||':'||(v_row->>'sourcePersonIdentitySha256')
      ||':'||COALESCE(v_assessment_id::text,'<null>'));
    INSERT INTO public.hr_performance_legacy_person_assessment_evidence(
      id,tenant_id,park_id,migration_batch_id,source_person_identity_sha256,
      source_assessment_id,evidence_sha256
    ) VALUES(v_evidence_id,p_tenant_id,p_park_id,v_operation.migration_batch_id,
      v_row->>'sourcePersonIdentitySha256',v_assessment_id,v_evidence_hash)
    ON CONFLICT(id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.hr_performance_legacy_person_assessment_evidence evidence
      WHERE (evidence.id,evidence.tenant_id,evidence.park_id,evidence.migration_batch_id)=
        (v_evidence_id,p_tenant_id,p_park_id,v_operation.migration_batch_id)
        AND evidence.source_person_identity_sha256=v_row->>'sourcePersonIdentitySha256'
        AND evidence.source_assessment_id IS NOT DISTINCT FROM v_assessment_id
        AND evidence.evidence_sha256=v_evidence_hash) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_REPLAY_DRIFT'; END IF;
  END LOOP;
  SELECT count(*) INTO v_evidence_count
    FROM public.hr_performance_legacy_person_assessment_evidence
    WHERE migration_batch_id=v_operation.migration_batch_id;
  IF v_evidence_count<>jsonb_array_length(p_payload->'personAssessments') THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_PERSON_EVIDENCE_CONSERVATION_FAILED'; END IF;

  FOR v_master IN SELECT id FROM public.hr_performance_legacy_master_result
    WHERE (tenant_id,park_id,migration_batch_id)=
      (p_tenant_id,p_park_id,v_operation.migration_batch_id) ORDER BY id
  LOOP
    SELECT * INTO STRICT v_expected
      FROM public.hr_performance_yuzhou_ass_compute_weight_expectation(v_master.id);
    v_resolution_id:=uuid_generate_v5(v_namespace,'master-weight:'
      ||v_operation.migration_batch_id::text||':'||v_master.id::text);
    v_resolution_hash:=public.hr_performance_yuzhou_ass_compute_weight_evidence_sha256(
      v_master.id,v_expected.source_person_identity_sha256,
      v_expected.source_person_evidence_count,v_expected.source_person_assessment_id,
      v_expected.person_template_candidate_count,v_expected.person_template_profile_id,
      v_expected.person_resolution_status,v_expected.detail_template_candidate_count,
      v_expected.detail_template_profile_id,v_expected.detail_resolution_status,
      v_expected.comparison_status);
    INSERT INTO public.hr_performance_legacy_ass_compute_weight_resolution(
      id,tenant_id,park_id,migration_batch_id,legacy_master_result_id,
      source_person_identity_sha256,source_person_evidence_count,
      source_person_assessment_id,person_template_candidate_count,
      person_template_profile_id,person_resolution_status,
      detail_template_candidate_count,detail_template_profile_id,
      detail_resolution_status,comparison_status,evidence_sha256
    ) VALUES(v_resolution_id,p_tenant_id,p_park_id,v_operation.migration_batch_id,v_master.id,
      v_expected.source_person_identity_sha256,v_expected.source_person_evidence_count,
      v_expected.source_person_assessment_id,v_expected.person_template_candidate_count,
      v_expected.person_template_profile_id,v_expected.person_resolution_status,
      v_expected.detail_template_candidate_count,v_expected.detail_template_profile_id,
      v_expected.detail_resolution_status,v_expected.comparison_status,v_resolution_hash)
    ON CONFLICT(id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.hr_performance_legacy_ass_compute_weight_resolution resolution
      WHERE resolution.id=v_resolution_id AND resolution.evidence_sha256=v_resolution_hash) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_REPLAY_DRIFT'; END IF;
  END LOOP;
  SELECT count(*) INTO v_master_count FROM public.hr_performance_legacy_master_result
    WHERE (tenant_id,park_id,migration_batch_id)=
      (p_tenant_id,p_park_id,v_operation.migration_batch_id);
  SELECT count(*) INTO v_resolution_count
    FROM public.hr_performance_legacy_ass_compute_weight_resolution
    WHERE migration_batch_id=v_operation.migration_batch_id;
  IF v_resolution_count<>v_master_count THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_RESOLUTION_CONSERVATION_FAILED'; END IF;
  IF public.hr_yuzhou_performance_person_assessment_owner_state_sha256(
      v_operation.migration_batch_id)<>v_operation.owner_state_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_OWNER_DRIFT'; END IF;
  v_state:=public.hr_yuzhou_performance_person_assessment_state_sha256(
    v_operation.migration_batch_id,'succeeded',v_operation.binding_sha256);
  UPDATE public.hr_yuzhou_performance_person_assessment_operation
    SET status='succeeded',applied_evidence_rows=v_evidence_count,
      applied_master_rows=v_master_count,applied_resolution_rows=v_resolution_count,
      applied_state_sha256=v_state,finished_at=now()
    WHERE operation_id=p_operation_id;
  SET CONSTRAINTS ALL IMMEDIATE;
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_consume_performance_person_assessment_rollback_authorization(
  p_rollback_operation_id varchar,p_import_operation_id varchar,
  p_sealed_artifact_sha256 char(64),p_authorization_artifact_sha256 char(64),
  p_authorization_nonce_sha256 char(64),p_authorization_expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_import public.hr_yuzhou_performance_person_assessment_operation%ROWTYPE;
  v_existing public.hr_yuzhou_performance_person_assessment_rollback_operation%ROWTYPE;
  v_parent public.hr_yuzhou_production_import_operation%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_REQUIRES_SERIALIZABLE'; END IF;
  IF now()>=p_authorization_expires_at
    OR p_rollback_operation_id!~'^yzprod-perfrel-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$'
    OR p_authorization_artifact_sha256!~'^[0-9a-f]{64}$'
    OR p_authorization_nonce_sha256!~'^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_ROLLBACK_AUTH_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_performance_person_assessment',0));
  SELECT * INTO v_existing
    FROM public.hr_yuzhou_performance_person_assessment_rollback_operation
    WHERE rollback_operation_id=p_rollback_operation_id FOR UPDATE;
  IF FOUND THEN
    IF ROW(v_existing.import_operation_id,v_existing.sealed_artifact_sha256,
        v_existing.authorization_artifact_sha256,v_existing.authorization_nonce_sha256)
      IS DISTINCT FROM ROW(p_import_operation_id,p_sealed_artifact_sha256,
        p_authorization_artifact_sha256,p_authorization_nonce_sha256) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_ROLLBACK_AUTH_REPLAY_DRIFT'; END IF;
    RETURN;
  END IF;
  SELECT * INTO v_import FROM public.hr_yuzhou_performance_person_assessment_operation
    WHERE operation_id=p_import_operation_id FOR UPDATE;
  SELECT * INTO v_parent FROM public.hr_yuzhou_production_import_operation
    WHERE operation_id=v_import.parent_import_operation_id FOR SHARE;
  IF v_import.operation_id IS NULL OR v_parent.operation_id IS NULL
    OR v_import.status<>'succeeded'
    OR v_import.sealed_artifact_sha256<>p_sealed_artifact_sha256
    OR p_authorization_expires_at>v_parent.window_ends_at
    OR NOT public.hr_yuzhou_performance_person_assessment_dependency_valid(
      v_import.parent_import_operation_id,v_import.migration_batch_id)
    OR public.hr_yuzhou_performance_person_assessment_owner_state_sha256(
      v_import.migration_batch_id)<>v_import.owner_state_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_ROLLBACK_SOURCE_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.hr_yuzhou_performance_person_assessment_authorization_use
    WHERE authorization_artifact_sha256=p_authorization_artifact_sha256
      OR authorization_nonce_sha256=p_authorization_nonce_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_AUTH_REUSED'; END IF;
  INSERT INTO public.hr_yuzhou_performance_person_assessment_rollback_operation(
    rollback_operation_id,import_operation_id,status,sealed_artifact_sha256,
    authorization_artifact_sha256,authorization_nonce_sha256,authorization_expires_at
  ) VALUES(p_rollback_operation_id,p_import_operation_id,'authorized',p_sealed_artifact_sha256,
    p_authorization_artifact_sha256,p_authorization_nonce_sha256,p_authorization_expires_at);
  INSERT INTO public.hr_yuzhou_performance_person_assessment_authorization_use(
    intent,operation_id,import_operation_id,authorization_artifact_sha256,authorization_nonce_sha256
  ) VALUES('production_performance_person_assessment_rollback',p_rollback_operation_id,
    p_import_operation_id,p_authorization_artifact_sha256,p_authorization_nonce_sha256);
END$$;

CREATE OR REPLACE PROCEDURE rollback_yuzhou_performance_ass_compute_weight_relation_production(
  p_rollback_operation_id varchar,p_import_operation_id varchar
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_import public.hr_yuzhou_performance_person_assessment_operation%ROWTYPE;
  v_rollback public.hr_yuzhou_performance_person_assessment_rollback_operation%ROWTYPE;
  v_residual bigint; v_state char(64);
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_ROLLBACK_REQUIRES_SERIALIZABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_performance_person_assessment',0));
  SELECT * INTO v_rollback
    FROM public.hr_yuzhou_performance_person_assessment_rollback_operation
    WHERE rollback_operation_id=p_rollback_operation_id FOR UPDATE;
  SELECT * INTO v_import FROM public.hr_yuzhou_performance_person_assessment_operation
    WHERE operation_id=p_import_operation_id FOR UPDATE;
  IF NOT FOUND OR v_rollback.import_operation_id IS DISTINCT FROM p_import_operation_id THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_ROLLBACK_AUTH_REQUIRED'; END IF;
  IF v_rollback.status='succeeded' AND v_import.status='rolled_back' THEN RETURN; END IF;
  IF v_rollback.status<>'authorized' OR v_import.status<>'succeeded'
    OR now()>=v_rollback.authorization_expires_at THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_ROLLBACK_AUTH_INVALID'; END IF;
  IF public.hr_yuzhou_performance_person_assessment_owner_state_sha256(
      v_import.migration_batch_id)<>v_import.owner_state_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_OWNER_DRIFT'; END IF;
  UPDATE public.hr_yuzhou_performance_person_assessment_rollback_operation
    SET status='running',started_at=now() WHERE rollback_operation_id=p_rollback_operation_id;
  PERFORM set_config('yuzhou.performance_person_assessment_operation_id',p_import_operation_id,true);
  PERFORM set_config('yuzhou.performance_person_assessment_rollback_operation_id',p_rollback_operation_id,true);
  PERFORM set_config('yuzhou.performance_person_assessment_mode','rollback',true);
  IF NOT public.hr_yuzhou_performance_person_assessment_production_context_allowed(
      v_import.migration_batch_id,'rollback') THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_ROLLBACK_CONTEXT_INVALID'; END IF;
  LOCK TABLE public.hr_performance_legacy_ass_compute_weight_resolution,
    public.hr_performance_legacy_person_assessment_evidence,
    public.hr_performance_legacy_master_result,public.hr_performance_legacy_template_profile,
    public.hr_performance_legacy_dimension_profile,public.hr_performance_legacy_dimension_result
    IN SHARE ROW EXCLUSIVE MODE;
  DELETE FROM public.hr_performance_legacy_ass_compute_weight_resolution
    WHERE migration_batch_id=v_import.migration_batch_id;
  DELETE FROM public.hr_performance_legacy_person_assessment_evidence
    WHERE migration_batch_id=v_import.migration_batch_id;
  SELECT (SELECT count(*) FROM public.hr_performance_legacy_ass_compute_weight_resolution
      WHERE migration_batch_id=v_import.migration_batch_id)
    +(SELECT count(*) FROM public.hr_performance_legacy_person_assessment_evidence
      WHERE migration_batch_id=v_import.migration_batch_id) INTO v_residual;
  IF v_residual<>0 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_ROLLBACK_RESIDUAL'; END IF;
  IF public.hr_yuzhou_performance_person_assessment_owner_state_sha256(
      v_import.migration_batch_id)<>v_import.owner_state_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_OWNER_DRIFT'; END IF;
  v_state:=public.hr_yuzhou_performance_person_assessment_state_sha256(
    v_import.migration_batch_id,'rolled_back',v_import.binding_sha256);
  UPDATE public.hr_yuzhou_performance_person_assessment_rollback_operation
    SET status='succeeded',residual_count=0,rollback_state_sha256=v_state,finished_at=now()
    WHERE rollback_operation_id=p_rollback_operation_id;
  UPDATE public.hr_yuzhou_performance_person_assessment_operation
    SET status='rolled_back',rolled_back_at=now(),applied_state_sha256=v_state
    WHERE operation_id=p_import_operation_id;
  SET CONSTRAINTS ALL IMMEDIATE;
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_person_assessment_production_receipt(
  p_operation_id varchar
) RETURNS TABLE(
  operation_id varchar,status varchar,sealed_artifact_sha256 char(64),
  binding_sha256 char(64),target_scope_sha256 char(64),evidence_rows bigint,
  master_rows bigint,resolution_rows bigint,state_sha256 char(64)
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_operation public.hr_yuzhou_performance_person_assessment_operation%ROWTYPE;
  v_evidence bigint; v_master bigint; v_resolution bigint; v_state char(64);
BEGIN
  SELECT operation_row.* INTO v_operation
    FROM public.hr_yuzhou_performance_person_assessment_operation operation_row
    WHERE operation_row.operation_id=p_operation_id;
  IF NOT FOUND OR v_operation.status NOT IN('succeeded','rolled_back') THEN RETURN; END IF;
  SELECT count(*) INTO v_evidence
    FROM public.hr_performance_legacy_person_assessment_evidence
    WHERE migration_batch_id=v_operation.migration_batch_id;
  SELECT count(*) INTO v_resolution
    FROM public.hr_performance_legacy_ass_compute_weight_resolution
    WHERE migration_batch_id=v_operation.migration_batch_id;
  IF public.hr_yuzhou_performance_person_assessment_owner_state_sha256(
      v_operation.migration_batch_id)<>v_operation.owner_state_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_OWNER_DRIFT'; END IF;
  IF v_operation.status='succeeded' THEN
    SELECT count(*) INTO v_master FROM public.hr_performance_legacy_master_result
      WHERE migration_batch_id=v_operation.migration_batch_id;
    IF ROW(v_evidence,v_master,v_resolution)
      IS DISTINCT FROM ROW(v_operation.applied_evidence_rows,
        v_operation.applied_master_rows,v_operation.applied_resolution_rows) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_RECEIPT_DRIFT'; END IF;
  ELSE
    v_master:=0;
    IF v_evidence<>0 OR v_resolution<>0 THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_ROLLBACK_RESIDUAL'; END IF;
  END IF;
  v_state:=public.hr_yuzhou_performance_person_assessment_state_sha256(
    v_operation.migration_batch_id,v_operation.status,v_operation.binding_sha256);
  IF v_state<>v_operation.applied_state_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_STATE_DRIFT'; END IF;
  RETURN QUERY SELECT v_operation.operation_id,v_operation.status,
    v_operation.sealed_artifact_sha256,v_operation.binding_sha256,
    v_operation.target_scope_sha256,v_evidence,v_master,v_resolution,v_state;
END$$;

COMMENT ON TABLE hr_yuzhou_performance_person_assessment_operation IS
  'Hash-only one-time production ledger for 000307, bound to reviewed 000308 owner capability; contains no person code or assessment value.';

REVOKE ALL ON hr_yuzhou_performance_person_assessment_operation,
  hr_yuzhou_performance_person_assessment_authorization_use,
  hr_yuzhou_performance_person_assessment_rollback_operation FROM PUBLIC;
DO $$
DECLARE v_usage_sequence regclass;
BEGIN
  v_usage_sequence:=pg_get_serial_sequence(
    'public.hr_yuzhou_performance_person_assessment_authorization_use','usage_id');
  IF v_usage_sequence IS NULL THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_AUTH_SEQUENCE_MISSING';
  END IF;
  EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC',v_usage_sequence);
END$$;
REVOKE ALL ON FUNCTION hr_yuzhou_performance_person_assessment_owner_state_sha256(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_performance_person_assessment_state_sha256(uuid,varchar,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_performance_person_assessment_payload_sha256(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_performance_person_assessment_dependency_valid(varchar,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_performance_person_assessment_production_context_allowed(uuid,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_person_assessment_evidence_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_ass_compute_weight_resolution_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_performance_person_assessment_production_capability(varchar,char,char,char,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_consume_performance_person_assessment_authorization(
  varchar,varchar,char,char,char,char,char,char,char,char,char,char,char,char,char,char,timestamptz
) FROM PUBLIC;
REVOKE ALL ON PROCEDURE materialize_yuzhou_performance_ass_compute_weight_relation_production(
  varchar,varchar,varchar,char,char,jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_consume_performance_person_assessment_rollback_authorization(
  varchar,varchar,char,char,char,timestamptz
) FROM PUBLIC;
REVOKE ALL ON PROCEDURE rollback_yuzhou_performance_ass_compute_weight_relation_production(varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_performance_person_assessment_production_receipt(varchar) FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO jinhu_hr_yuzhou_perf_assessment_reader,
  jinhu_hr_yuzhou_perf_assessment_executor;
GRANT EXECUTE ON FUNCTION hr_yuzhou_performance_person_assessment_production_capability(
  varchar,char,char,char,char
) TO jinhu_hr_yuzhou_perf_assessment_reader,jinhu_hr_yuzhou_perf_assessment_executor;
GRANT EXECUTE ON FUNCTION hr_yuzhou_performance_person_assessment_production_receipt(varchar)
  TO jinhu_hr_yuzhou_perf_assessment_reader,jinhu_hr_yuzhou_perf_assessment_executor;
GRANT EXECUTE ON FUNCTION hr_yuzhou_consume_performance_person_assessment_authorization(
  varchar,varchar,char,char,char,char,char,char,char,char,char,char,char,char,char,char,timestamptz
) TO jinhu_hr_yuzhou_perf_assessment_executor;
GRANT EXECUTE ON PROCEDURE materialize_yuzhou_performance_ass_compute_weight_relation_production(
  varchar,varchar,varchar,char,char,jsonb
) TO jinhu_hr_yuzhou_perf_assessment_executor;
GRANT EXECUTE ON FUNCTION hr_yuzhou_consume_performance_person_assessment_rollback_authorization(
  varchar,varchar,char,char,char,timestamptz
) TO jinhu_hr_yuzhou_perf_assessment_executor;
GRANT EXECUTE ON PROCEDURE rollback_yuzhou_performance_ass_compute_weight_relation_production(varchar,varchar)
  TO jinhu_hr_yuzhou_perf_assessment_executor;

COMMIT;
