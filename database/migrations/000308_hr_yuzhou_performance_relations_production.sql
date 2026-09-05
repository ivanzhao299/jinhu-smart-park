BEGIN;

-- Production-only control receipt for the immutable Yuzhou performance
-- relationship extension.  It intentionally stores hashes and aggregate
-- counts only; source person codes and names never enter this control table.
CREATE TABLE hr_yuzhou_performance_relations_production_receipt (
  operation_id varchar(64) PRIMARY KEY
    REFERENCES hr_yuzhou_production_import_operation(operation_id),
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id),
  sealed_plan_sha256 char(64) NOT NULL,
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
  relation_payload_artifact_sha256 char(64) NOT NULL,
  identity_decision_artifact_sha256 char(64) NOT NULL,
  migration_305_sha256 char(64) NOT NULL,
  migration_306_sha256 char(64) NOT NULL,
  session_rows integer NOT NULL,
  score_source_rows integer NOT NULL,
  assignment_rows integer NOT NULL,
  active_relation_maps integer NOT NULL,
  identity_resolution_rows integer NOT NULL,
  session_binding_rows integer NOT NULL,
  subject_unmatched_rows integer NOT NULL,
  blank_assessor_rows integer NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'succeeded',
  receipt_sha256 char(64) NOT NULL,
  rollback_operation_id varchar(72)
    REFERENCES hr_yuzhou_production_import_rollback_operation(rollback_operation_id),
  rollback_receipt_sha256 char(64),
  applied_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  CONSTRAINT ck_hr_yuzhou_perf_rel_prod_hashes CHECK (
    sealed_plan_sha256~'^[0-9a-f]{64}$'
    AND authorization_artifact_sha256~'^[0-9a-f]{64}$'
    AND authorization_nonce_sha256~'^[0-9a-f]{64}$'
    AND code_sha~'^[0-9a-f]{40}$'
    AND source_snapshot_sha256~'^[0-9a-f]{64}$'
    AND mapping_contract_sha256~'^[0-9a-f]{64}$'
    AND target_identity_sha256~'^[0-9a-f]{64}$'
    AND target_scope_sha256~'^[0-9a-f]{64}$'
    AND t0_phase_receipt_sha256~'^[0-9a-f]{64}$'
    AND relation_payload_artifact_sha256~'^[0-9a-f]{64}$'
    AND identity_decision_artifact_sha256~'^[0-9a-f]{64}$'
    AND migration_305_sha256~'^[0-9a-f]{64}$'
    AND migration_306_sha256~'^[0-9a-f]{64}$'
    AND receipt_sha256~'^[0-9a-f]{64}$'
    AND (rollback_receipt_sha256 IS NULL OR rollback_receipt_sha256~'^[0-9a-f]{64}$')
  ),
  CONSTRAINT ck_hr_yuzhou_perf_rel_prod_counts CHECK (
    session_rows=7 AND score_source_rows=0 AND assignment_rows=117
    AND active_relation_maps IN(0,124)
    AND identity_resolution_rows IN(0,234)
    AND session_binding_rows IN(0,7)
    AND subject_unmatched_rows=108 AND blank_assessor_rows=117
  ),
  CONSTRAINT ck_hr_yuzhou_perf_rel_prod_status CHECK (
    (status='succeeded' AND rollback_operation_id IS NULL
      AND rollback_receipt_sha256 IS NULL AND rolled_back_at IS NULL
      AND active_relation_maps=124 AND identity_resolution_rows=234
      AND session_binding_rows=7)
    OR
    (status='rolled_back' AND rollback_operation_id IS NOT NULL
      AND rollback_receipt_sha256 IS NOT NULL AND rolled_back_at IS NOT NULL
      AND active_relation_maps=0 AND identity_resolution_rows=0
      AND session_binding_rows=0)
  )
);

CREATE OR REPLACE FUNCTION hr_yuzhou_performance_relations_production_capability_v1()
RETURNS TABLE(
  capability_id text,
  migration_305_sha256 char(64),
  migration_306_sha256 char(64),
  production_context_supported boolean,
  reverse_order text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  SELECT
    'jinhu-yuzhou-performance-relations-production-v1'::text,
    'd3784218fc8272bd28b93e44b19a02d5c8124466b6b3c218294920603909dfc0'::char(64),
    'cd49f294f4c9e4105b9f7fd4c678b7b2d29c5433d0348f6e6632d6e7c135a56d'::char(64),
    true,
    'identity_resolution>source_person_assignments'::text
$$;

-- The custom settings are transaction-local routing hints, never authority.
-- Every use is revalidated against the consumed authorization, operation,
-- exact production T0 batch, scope, and control receipt.
CREATE OR REPLACE FUNCTION hr_yuzhou_performance_relations_production_context_allowed(
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
      WHERE batch.id=p_batch_id
        AND batch.execution_context='production_import'
        AND batch.production_import_phase='T0'
        AND batch.target_database=current_database()
        AND batch.status='succeeded'
        AND operation.execution_contract_version=2
        AND operation.status='running'
        AND operation.current_phase='T0'
        AND phase.status='succeeded'
        AND current_setting('yuzhou.performance_relations_operation_id',true)=operation.operation_id
        AND current_setting('yuzhou.performance_relations_mode',true)='apply'
    )
    WHEN 'rollback' THEN EXISTS(
      SELECT 1
      FROM public.migration_batch batch
      JOIN public.hr_yuzhou_performance_relations_production_receipt receipt
        ON receipt.migration_batch_id=batch.id AND receipt.status='succeeded'
      JOIN public.hr_yuzhou_production_import_rollback_operation rollback_operation
        ON rollback_operation.rollback_operation_id=
          current_setting('yuzhou.performance_relations_rollback_operation_id',true)
       AND rollback_operation.import_operation_id=receipt.operation_id
       AND rollback_operation.status='running'
      JOIN public.hr_yuzhou_production_import_authorization_use auth
        ON auth.operation_id=rollback_operation.rollback_operation_id
       AND auth.import_operation_id=receipt.operation_id
       AND auth.intent='production_import_rollback'
      WHERE batch.id=p_batch_id
        AND batch.execution_context='production_import'
        AND batch.production_import_phase='T0'
        AND batch.target_database=current_database()
        AND current_setting('yuzhou.performance_relations_operation_id',true)=receipt.operation_id
        AND current_setting('yuzhou.performance_relations_mode',true)='rollback'
    )
    ELSE false
  END
$$;

-- Extend the append-only guard only for the exact production rollback
-- transaction.  The lab path and its original requirements remain unchanged.
CREATE OR REPLACE FUNCTION hr_performance_yuzhou_legacy_fact_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_batch_id uuid:=COALESCE(NEW.migration_batch_id,OLD.migration_batch_id);
  v_rollback_batch text:=current_setting('yuzhou.performance_legacy_rollback_batch_id',true);
BEGIN
  IF TG_OP='DELETE' AND v_rollback_batch=v_batch_id::text AND (
    EXISTS(SELECT 1 FROM migration_batch batch WHERE batch.id=v_batch_id
      AND batch.target_database=current_database() AND batch.phase='rollback' AND batch.status='running')
    OR hr_yuzhou_performance_relations_production_context_allowed(v_batch_id,'rollback')
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_FACT_APPEND_ONLY' USING ERRCODE='55000';
END$$;

-- During the same authorized production T0 operation, resolved employee
-- identity may use that already-succeeded T0 phase without pretending the
-- whole operation is complete.
CREATE OR REPLACE FUNCTION hr_performance_yuzhou_t0_person_candidate(
  p_tenant_id varchar,p_park_id varchar,p_source_person_identity_sha256 char(64)
) RETURNS TABLE(owner_t0_record_map_id uuid,target_employee_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT source_map.id,employee.id
  FROM legacy_record_map source_map
  JOIN hr_yuzhou_production_import_projection_receipt receipt
    ON receipt.legacy_record_map_id=source_map.id AND receipt.phase='T0'
  JOIN hr_yuzhou_production_import_record import_record
    ON (import_record.operation_id,import_record.phase,import_record.source_identity_sha256)=
       (receipt.operation_id,receipt.phase,receipt.source_identity_sha256)
  JOIN hr_yuzhou_production_import_phase import_phase
    ON (import_phase.operation_id,import_phase.phase)=(receipt.operation_id,receipt.phase)
  JOIN hr_yuzhou_production_import_operation import_operation
    ON import_operation.operation_id=receipt.operation_id
  JOIN migration_batch source_batch
    ON source_batch.id=receipt.migration_batch_id AND source_batch.id=source_map.batch_id
  JOIN hr_employee employee
    ON (employee.id,employee.tenant_id,employee.park_id)=
       (source_map.target_id,p_tenant_id,p_park_id)
  WHERE source_map.source_system='yuzhou-v10' AND source_map.source_table='dbo.person'
    AND source_map.source_identity_sha256=p_source_person_identity_sha256
    AND source_map.target_table='hr_employee' AND source_map.mapping_status IN('loaded','verified')
    AND source_map.is_active AND receipt.source_identity_sha256=source_map.source_identity_sha256
    AND import_record.source_system='yuzhou-v10' AND import_record.source_table='dbo.person'
    AND import_record.source_pk_canonical='sha256:'||source_map.source_identity_sha256
    AND import_record.target_table='hr_employee' AND import_record.target_id=source_map.target_id
    AND import_record.disposition IN('insert','merge','skip_approved')
    AND import_record.rollback_status='not_started' AND import_phase.status='succeeded'
    AND (import_operation.status='succeeded' OR (
      import_operation.status='running' AND import_operation.current_phase='T0'
      AND current_setting('yuzhou.performance_relations_operation_id',true)=import_operation.operation_id
      AND current_setting('yuzhou.performance_relations_mode',true)='apply'
      AND hr_yuzhou_performance_relations_production_context_allowed(source_batch.id,'apply')
    ))
    AND import_operation.execution_contract_version=2
    AND (import_operation.target_tenant_id,import_operation.target_park_id)=(p_tenant_id,p_park_id)
    AND source_batch.execution_context='production_import'
    AND source_batch.production_import_operation_id=receipt.operation_id
    AND source_batch.production_import_phase='T0' AND source_batch.status='succeeded'
    AND NOT employee.is_deleted
$$;

-- Session binding inserts/deletes accept production only through the exact
-- guarded context above; all legacy lab behavior is preserved.
CREATE OR REPLACE FUNCTION hr_performance_yuzhou_session_binding_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_session hr_performance_legacy_session%ROWTYPE; v_batch migration_batch%ROWTYPE;
BEGIN
  IF TG_OP<>'INSERT' THEN
    IF TG_OP='DELETE'
      AND current_setting('yuzhou.performance_identity_resolution_rollback_batch_id',true)=OLD.migration_batch_id::text
      AND (EXISTS(SELECT 1 FROM migration_batch batch WHERE batch.id=OLD.migration_batch_id
        AND batch.execution_context='lab_rehearsal' AND batch.phase='rollback' AND batch.status='running')
        OR hr_yuzhou_performance_relations_production_context_allowed(OLD.migration_batch_id,'rollback'))
    THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_BINDING_IMMUTABLE';
  END IF;
  SELECT * INTO v_batch FROM migration_batch WHERE id=NEW.migration_batch_id FOR SHARE;
  IF NOT FOUND OR v_batch.target_database<>current_database() OR NOT (
    (v_batch.execution_context='lab_rehearsal' AND v_batch.phase='load' AND v_batch.status='running')
    OR hr_yuzhou_performance_relations_production_context_allowed(NEW.migration_batch_id,'apply')
  ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_BATCH_INVALID'; END IF;
  SELECT * INTO v_session FROM hr_performance_legacy_session
  WHERE (id,tenant_id,park_id,migration_batch_id)=
    (NEW.legacy_session_id,NEW.tenant_id,NEW.park_id,NEW.migration_batch_id);
  IF NOT FOUND OR v_session.source_identity_sha256<>NEW.source_session_identity_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_BINDING_SOURCE_MISMATCH'; END IF;
  IF NEW.resolution_status='resolved' AND v_session.target_review_cycle_id IS NOT NULL
    AND v_session.target_review_cycle_id<>NEW.target_review_cycle_id THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_BINDING_TARGET_DRIFT'; END IF;
  RETURN NEW;
END$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_identity_resolution_delete_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE'
    AND current_setting('yuzhou.performance_identity_resolution_rollback_batch_id',true)=OLD.migration_batch_id::text
    AND (EXISTS(SELECT 1 FROM migration_batch batch WHERE batch.id=OLD.migration_batch_id
      AND batch.execution_context='lab_rehearsal' AND batch.phase='rollback' AND batch.status='running')
      OR hr_yuzhou_performance_relations_production_context_allowed(OLD.migration_batch_id,'rollback'))
  THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_RESOLUTION_IMMUTABLE';
END$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_identity_resolution_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_source_code varchar; v_source_session_id integer; v_fact_batch_id uuid;
  v_expected_identity char(64); v_candidate_count integer;
  v_candidate_map_id uuid; v_candidate_employee_id uuid;
  v_binding hr_performance_legacy_session_binding%ROWTYPE;
  v_cycle_count integer; v_cycle_employee_id uuid;
  v_batch migration_batch%ROWTYPE; v_fact_id uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_RESOLUTION_IMMUTABLE'; END IF;
  SELECT * INTO v_batch FROM migration_batch WHERE id=NEW.migration_batch_id FOR SHARE;
  IF NOT FOUND OR v_batch.target_database<>current_database() OR NOT (
    (v_batch.execution_context='lab_rehearsal' AND v_batch.phase='load' AND v_batch.status='running')
    OR hr_yuzhou_performance_relations_production_context_allowed(NEW.migration_batch_id,'apply')
  ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_BATCH_INVALID'; END IF;

  IF NEW.fact_kind='dimension_result' THEN
    SELECT migration_batch_id,source_person_code,source_session_id
      INTO v_fact_batch_id,v_source_code,v_source_session_id
    FROM hr_performance_legacy_dimension_result
    WHERE (id,tenant_id,park_id)=(NEW.legacy_dimension_result_id,NEW.tenant_id,NEW.park_id);
  ELSIF NEW.fact_kind='master_result' THEN
    SELECT migration_batch_id,source_person_code,source_session_id
      INTO v_fact_batch_id,v_source_code,v_source_session_id
    FROM hr_performance_legacy_master_result
    WHERE (id,tenant_id,park_id)=(NEW.legacy_master_result_id,NEW.tenant_id,NEW.park_id);
  ELSIF NEW.fact_kind='score_source' THEN
    SELECT migration_batch_id,source_person_code,source_session_id
      INTO v_fact_batch_id,v_source_code,v_source_session_id
    FROM hr_performance_legacy_score_source
    WHERE (id,tenant_id,park_id)=(NEW.legacy_score_source_id,NEW.tenant_id,NEW.park_id);
  ELSE
    SELECT migration_batch_id,
      CASE NEW.person_role WHEN 'subject' THEN source_person_code ELSE source_assessor_code END,
      source_session_id INTO v_fact_batch_id,v_source_code,v_source_session_id
    FROM hr_performance_legacy_source_person_assignment
    WHERE (id,tenant_id,park_id)=
      (NEW.legacy_source_person_assignment_id,NEW.tenant_id,NEW.park_id);
  END IF;
  IF NOT FOUND OR v_fact_batch_id<>NEW.migration_batch_id THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_RESOLUTION_FACT_MISMATCH'; END IF;

  v_expected_identity:=hr_performance_yuzhou_person_identity_sha256(v_source_code);
  IF NEW.source_person_identity_sha256 IS DISTINCT FROM v_expected_identity THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_RESOLUTION_HASH_MISMATCH'; END IF;
  IF NEW.person_role='assessor' THEN
    IF v_expected_identity IS NULL THEN
      IF NEW.person_resolution_status<>'not_applicable'
        OR NEW.person_resolution_reason_code<>'ASSESSOR_CODE_EMPTY' THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_ASSESSOR_EMPTY_REQUIRES_NOT_APPLICABLE'; END IF;
    ELSIF NEW.person_resolution_status<>'semantics_unverified'
      OR NEW.person_resolution_reason_code<>'ASSESSOR_SEMANTICS_UNVERIFIED' THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_ASSESSOR_SEMANTICS_UNVERIFIED';
    END IF;
  ELSIF v_expected_identity IS NULL THEN
    IF NEW.person_resolution_status<>'not_applicable'
      OR NEW.person_resolution_reason_code<>'SUBJECT_CODE_EMPTY' THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SUBJECT_EMPTY_REQUIRES_NOT_APPLICABLE'; END IF;
  ELSE
    SELECT count(*) INTO v_candidate_count FROM hr_performance_yuzhou_t0_person_candidate(
      NEW.tenant_id,NEW.park_id,v_expected_identity);
    IF v_candidate_count=1 THEN
      SELECT owner_t0_record_map_id,target_employee_id INTO v_candidate_map_id,v_candidate_employee_id
      FROM hr_performance_yuzhou_t0_person_candidate(NEW.tenant_id,NEW.park_id,v_expected_identity);
      IF NEW.person_resolution_status<>'resolved'
        OR NEW.person_resolution_reason_code<>'EXACT_T0_PERSON_MAP'
        OR NEW.owner_t0_record_map_id IS DISTINCT FROM v_candidate_map_id
        OR NEW.target_employee_id IS DISTINCT FROM v_candidate_employee_id THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_T0_PERSON_RESOLUTION_MISMATCH'; END IF;
    ELSIF v_candidate_count=0 THEN
      IF NEW.person_resolution_status<>'unmatched'
        OR NEW.person_resolution_reason_code<>'T0_PERSON_MAP_NOT_FOUND' THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_T0_PERSON_UNMATCHED_REQUIRED'; END IF;
    ELSE
      IF NEW.person_resolution_status<>'ambiguous'
        OR NEW.person_resolution_reason_code<>'T0_PERSON_MAP_AMBIGUOUS' THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_T0_PERSON_AMBIGUOUS_REQUIRED'; END IF;
    END IF;
  END IF;

  SELECT binding.* INTO v_binding
  FROM hr_performance_legacy_session source_session
  JOIN hr_performance_legacy_session_binding binding ON binding.legacy_session_id=source_session.id
  WHERE (source_session.tenant_id,source_session.park_id,source_session.migration_batch_id,
    source_session.source_session_id)=(NEW.tenant_id,NEW.park_id,NEW.migration_batch_id,v_source_session_id);
  IF FOUND THEN
    IF NEW.session_binding_id IS DISTINCT FROM v_binding.id THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_BINDING_MISMATCH'; END IF;
  ELSIF NEW.session_binding_id IS NOT NULL THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_BINDING_MISMATCH';
  END IF;

  IF NEW.person_role='assessor' OR NEW.person_resolution_status<>'resolved'
    OR v_source_session_id IS NULL THEN
    IF NEW.cycle_resolution_status<>'not_applicable'
      OR NEW.cycle_resolution_reason_code<>(CASE
        WHEN NEW.person_role='assessor' THEN 'ASSESSOR_CYCLE_NOT_APPLICABLE'
        WHEN NEW.person_resolution_status<>'resolved' THEN 'PERSON_UNRESOLVED'
        ELSE 'SESSION_NOT_APPLICABLE' END) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_CYCLE_NOT_APPLICABLE_REQUIRED'; END IF;
  ELSIF NEW.session_binding_id IS NULL OR v_binding.resolution_status<>'resolved' THEN
    IF NEW.cycle_resolution_status<>'unmatched'
      OR NEW.cycle_resolution_reason_code<>'SESSION_BINDING_UNRESOLVED' THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_UNRESOLVED_REQUIRED'; END IF;
  ELSE
    SELECT count(*),(array_agg(id ORDER BY id))[1] INTO v_cycle_count,v_cycle_employee_id
    FROM hr_performance_cycle_employee
    WHERE (tenant_id,park_id,cycle_id,employee_id)=
      (NEW.tenant_id,NEW.park_id,v_binding.target_review_cycle_id,NEW.target_employee_id);
    IF v_cycle_count=1 THEN
      IF NEW.cycle_resolution_status<>'resolved'
        OR NEW.cycle_resolution_reason_code<>'EXACT_CYCLE_EMPLOYEE'
        OR NEW.target_cycle_employee_id IS DISTINCT FROM v_cycle_employee_id THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_CYCLE_EMPLOYEE_MISMATCH'; END IF;
    ELSIF v_cycle_count=0 THEN
      IF NEW.cycle_resolution_status<>'unmatched'
        OR NEW.cycle_resolution_reason_code<>'CYCLE_EMPLOYEE_NOT_FOUND' THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_CYCLE_EMPLOYEE_UNMATCHED_REQUIRED'; END IF;
    ELSE
      IF NEW.cycle_resolution_status<>'ambiguous'
        OR NEW.cycle_resolution_reason_code<>'CYCLE_EMPLOYEE_AMBIGUOUS' THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_CYCLE_EMPLOYEE_AMBIGUOUS_REQUIRED'; END IF;
    END IF;
  END IF;
  v_fact_id:=COALESCE(NEW.legacy_dimension_result_id,NEW.legacy_master_result_id,
    NEW.legacy_score_source_id,NEW.legacy_source_person_assignment_id);
  IF NEW.evidence_sha256<>hr_performance_yuzhou_identity_resolution_evidence_sha256(
    NEW.fact_kind,v_fact_id,NEW.person_role,NEW.source_person_identity_sha256,
    NEW.person_resolution_status,NEW.person_resolution_reason_code,NEW.owner_t0_record_map_id,
    NEW.target_employee_id,NEW.session_binding_id,NEW.cycle_resolution_status,
    NEW.cycle_resolution_reason_code,NEW.target_cycle_employee_id
  ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_EVIDENCE_MISMATCH'; END IF;
  RETURN NEW;
END$$;

CREATE OR REPLACE PROCEDURE hr_yuzhou_materialize_performance_relations_production_v1(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid,p_payload jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_row jsonb; v_map_id uuid; v_fact_id uuid; v_session_id uuid; v_dimension_id uuid;
  v_expected bigint; v_actual bigint;
BEGIN
  IF current_setting('transaction_isolation')<>'serializable'
    OR NOT public.hr_yuzhou_performance_relations_production_context_allowed(p_batch_id,'apply') THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_CONTEXT_INVALID'; END IF;
  IF NOT public.hr_performance_yuzhou_jsonb_exact_keys(p_payload,ARRAY['asssession','asssour','asssourperson'])
    OR jsonb_typeof(p_payload->'asssession')<>'array'
    OR jsonb_typeof(p_payload->'asssour')<>'array'
    OR jsonb_typeof(p_payload->'asssourperson')<>'array'
    OR jsonb_array_length(p_payload->'asssession')<>7
    OR jsonb_array_length(p_payload->'asssour')<>0
    OR jsonb_array_length(p_payload->'asssourperson')<>117 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_PAYLOAD_CONSERVATION_FAILED'; END IF;
  LOCK TABLE public.legacy_record_map,public.hr_performance_legacy_session,
    public.hr_performance_legacy_score_source,
    public.hr_performance_legacy_source_person_assignment IN SHARE ROW EXCLUSIVE MODE;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'asssession') LOOP
    IF NOT public.hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','id','asssession','description',
      'assessmenttype','year','month','quarter','myorder']) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_SESSION_INVALID'; END IF;
    SELECT map_id,fact_id INTO v_map_id,v_fact_id
    FROM public.hr_performance_yuzhou_prepare_relation_record_map(
      p_batch_id,'dbo.asssession',v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256',
      'hr_performance_legacy_session');
    INSERT INTO public.hr_performance_legacy_session(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_session_id,source_session_name,source_description,
      source_assessment_type,source_year,source_month,source_quarter,source_my_order
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,v_row->>'sourceIdentitySha256',
      v_row->>'sourceRowSha256',(v_row->>'id')::integer,v_row->>'asssession',v_row->>'description',
      v_row->>'assessmenttype',(v_row->>'year')::integer,(v_row->>'month')::integer,
      (v_row->>'quarter')::integer,(v_row->>'myorder')::integer
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_session_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.hr_performance_legacy_session fact
      WHERE fact.id=v_fact_id AND fact.legacy_record_map_id=v_map_id
        AND fact.source_row_sha256=v_row->>'sourceRowSha256') THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_REPLAY_DRIFT'; END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'asssour') LOOP
    IF NOT public.hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','id','asssessionid','person','assitemid',
      'lb','itemvalue','assgrade','appraisal']) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_SCORE_INVALID'; END IF;
    SELECT id INTO v_session_id FROM public.hr_performance_legacy_session WHERE
      (tenant_id,park_id,migration_batch_id,source_session_id)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'asssessionid')::integer);
    SELECT id INTO v_dimension_id FROM public.hr_performance_legacy_dimension_profile WHERE
      (tenant_id,park_id,migration_batch_id,source_item_id)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'assitemid')::integer);
    SELECT map_id,fact_id INTO v_map_id,v_fact_id
    FROM public.hr_performance_yuzhou_prepare_relation_record_map(
      p_batch_id,'dbo.asssour',v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256',
      'hr_performance_legacy_score_source');
    INSERT INTO public.hr_performance_legacy_score_source(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_score_id,source_session_id,source_person_code,source_item_id,
      source_relation_type,source_item_value,source_ass_grade,source_appraisal,
      legacy_session_id,legacy_dimension_profile_id
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,v_row->>'sourceIdentitySha256',
      v_row->>'sourceRowSha256',(v_row->>'id')::integer,(v_row->>'asssessionid')::integer,
      v_row->>'person',(v_row->>'assitemid')::integer,(v_row->>'lb')::integer,
      (v_row->>'itemvalue')::numeric(18,2),v_row->>'assgrade',v_row->>'appraisal',
      v_session_id,v_dimension_id
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_score_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.hr_performance_legacy_score_source fact
      WHERE fact.id=v_fact_id AND fact.legacy_record_map_id=v_map_id
        AND fact.source_row_sha256=v_row->>'sourceRowSha256'
        AND fact.legacy_session_id IS NOT DISTINCT FROM v_session_id
        AND fact.legacy_dimension_profile_id IS NOT DISTINCT FROM v_dimension_id) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_REPLAY_DRIFT'; END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'asssourperson') LOOP
    IF NOT public.hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceIdentitySha256','sourceRowSha256','id','asssessionid','person','assperson','lb']) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_ASSIGNMENT_INVALID'; END IF;
    SELECT id INTO v_session_id FROM public.hr_performance_legacy_session WHERE
      (tenant_id,park_id,migration_batch_id,source_session_id)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'asssessionid')::integer);
    SELECT map_id,fact_id INTO v_map_id,v_fact_id
    FROM public.hr_performance_yuzhou_prepare_relation_record_map(
      p_batch_id,'dbo.asssourperson',v_row->>'sourceIdentitySha256',v_row->>'sourceRowSha256',
      'hr_performance_legacy_source_person_assignment');
    INSERT INTO public.hr_performance_legacy_source_person_assignment(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_assignment_id,source_session_id,source_person_code,
      source_assessor_code,source_relation_type,legacy_session_id
    ) VALUES(
      v_fact_id,p_tenant_id,p_park_id,p_batch_id,v_map_id,v_row->>'sourceIdentitySha256',
      v_row->>'sourceRowSha256',(v_row->>'id')::integer,(v_row->>'asssessionid')::integer,
      v_row->>'person',v_row->>'assperson',(v_row->>'lb')::integer,v_session_id
    ) ON CONFLICT(migration_batch_id,tenant_id,park_id,source_assignment_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.hr_performance_legacy_source_person_assignment fact
      WHERE fact.id=v_fact_id AND fact.legacy_record_map_id=v_map_id
        AND fact.source_row_sha256=v_row->>'sourceRowSha256'
        AND fact.legacy_session_id IS NOT DISTINCT FROM v_session_id) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_REPLAY_DRIFT'; END IF;
  END LOOP;
  v_expected:=124;
  SELECT count(*) INTO v_actual FROM public.legacy_record_map WHERE batch_id=p_batch_id AND is_active
    AND target_table IN('hr_performance_legacy_session','hr_performance_legacy_score_source',
      'hr_performance_legacy_source_person_assignment');
  IF v_actual<>v_expected THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_MAP_CONSERVATION_FAILED'; END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
END$$;

CREATE OR REPLACE PROCEDURE hr_yuzhou_materialize_performance_identity_production_v1(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid,p_payload jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_row jsonb; v_session hr_performance_legacy_session%ROWTYPE; v_binding_id uuid;
  v_target_cycle_id uuid; v_assignment hr_performance_legacy_source_person_assignment%ROWTYPE;
  v_role varchar; v_source_code varchar; v_identity char(64); v_person_status varchar;
  v_person_reason varchar; v_candidate_count integer; v_owner_map_id uuid; v_employee_id uuid;
  v_binding hr_performance_legacy_session_binding%ROWTYPE; v_cycle_status varchar;
  v_cycle_reason varchar; v_cycle_count integer; v_cycle_employee_id uuid; v_resolution_id uuid;
  v_namespace constant uuid:='71382084-c80d-4bbf-b735-a816c79a0f6c';
BEGIN
  IF current_setting('transaction_isolation')<>'serializable'
    OR NOT public.hr_yuzhou_performance_relations_production_context_allowed(p_batch_id,'apply') THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_CONTEXT_INVALID'; END IF;
  IF NOT public.hr_performance_yuzhou_jsonb_exact_keys(p_payload,ARRAY['sessions'])
    OR jsonb_typeof(p_payload->'sessions')<>'array'
    OR jsonb_array_length(p_payload->'sessions')<>7 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_IDENTITY_PAYLOAD_INVALID'; END IF;
  LOCK TABLE public.hr_performance_legacy_session_binding,
    public.hr_performance_legacy_identity_resolution,public.legacy_record_map,
    public.hr_yuzhou_production_import_projection_receipt,
    public.hr_performance_cycle_employee IN SHARE ROW EXCLUSIVE MODE;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'sessions') LOOP
    IF NOT public.hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceSessionIdentitySha256','status','reasonCode','targetReviewCycleId','decisionAttestationSha256'])
      OR (v_row->>'sourceSessionIdentitySha256')!~'^[0-9a-f]{64}$'
      OR (v_row->>'decisionAttestationSha256')!~'^[0-9a-f]{64}$'
      OR (v_row->>'status') NOT IN('resolved','unmatched','ambiguous','semantics_unverified')
      OR (v_row->>'reasonCode')!~'^[A-Z][A-Z0-9_]{2,63}$' THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_SESSION_DECISION_INVALID'; END IF;
    SELECT * INTO STRICT v_session FROM public.hr_performance_legacy_session
    WHERE (tenant_id,park_id,migration_batch_id,source_identity_sha256)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'sourceSessionIdentitySha256')::char(64));
    v_target_cycle_id:=NULLIF(v_row->>'targetReviewCycleId','')::uuid;
    IF ((v_row->>'status')='resolved')<>(v_target_cycle_id IS NOT NULL) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_SESSION_TARGET_INVALID'; END IF;
    IF (v_row->>'status')='resolved' AND NOT EXISTS(SELECT 1
      FROM public.hr_performance_review_cycle cycle
      WHERE (cycle.id,cycle.tenant_id,cycle.park_id)=(v_target_cycle_id,p_tenant_id,p_park_id)) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_SESSION_TARGET_INVALID'; END IF;
    v_binding_id:=uuid_generate_v5(v_namespace,
      'session:'||p_batch_id::text||':'||v_session.source_identity_sha256);
    INSERT INTO public.hr_performance_legacy_session_binding(
      id,tenant_id,park_id,migration_batch_id,legacy_session_id,source_session_identity_sha256,
      resolution_status,resolution_reason_code,target_review_cycle_id,decision_attestation_sha256
    ) VALUES(v_binding_id,p_tenant_id,p_park_id,p_batch_id,v_session.id,v_session.source_identity_sha256,
      v_row->>'status',v_row->>'reasonCode',v_target_cycle_id,v_row->>'decisionAttestationSha256')
    ON CONFLICT(id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.hr_performance_legacy_session_binding binding
      WHERE binding.id=v_binding_id AND binding.legacy_session_id=v_session.id
        AND binding.resolution_status=v_row->>'status'
        AND binding.resolution_reason_code=v_row->>'reasonCode'
        AND binding.target_review_cycle_id IS NOT DISTINCT FROM v_target_cycle_id
        AND binding.decision_attestation_sha256=v_row->>'decisionAttestationSha256') THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_REPLAY_DRIFT'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.hr_performance_legacy_session_binding
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id))<>7 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_SESSION_CONSERVATION_FAILED'; END IF;

  FOR v_assignment IN SELECT * FROM public.hr_performance_legacy_source_person_assignment
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    ORDER BY id
  LOOP
    FOREACH v_role IN ARRAY ARRAY['subject'::varchar,'assessor'::varchar] LOOP
      v_source_code:=CASE v_role WHEN 'subject' THEN v_assignment.source_person_code
        ELSE v_assignment.source_assessor_code END;
      v_identity:=public.hr_performance_yuzhou_person_identity_sha256(v_source_code);
      v_owner_map_id:=NULL; v_employee_id:=NULL;
      IF v_role='assessor' THEN
        IF v_identity IS NULL THEN v_person_status:='not_applicable'; v_person_reason:='ASSESSOR_CODE_EMPTY';
        ELSE v_person_status:='semantics_unverified'; v_person_reason:='ASSESSOR_SEMANTICS_UNVERIFIED'; END IF;
      ELSIF v_identity IS NULL THEN
        v_person_status:='not_applicable'; v_person_reason:='SUBJECT_CODE_EMPTY';
      ELSE
        SELECT count(*) INTO v_candidate_count
        FROM public.hr_performance_yuzhou_t0_person_candidate(p_tenant_id,p_park_id,v_identity);
        IF v_candidate_count=1 THEN
          SELECT owner_t0_record_map_id,target_employee_id INTO v_owner_map_id,v_employee_id
          FROM public.hr_performance_yuzhou_t0_person_candidate(p_tenant_id,p_park_id,v_identity);
          v_person_status:='resolved'; v_person_reason:='EXACT_T0_PERSON_MAP';
        ELSIF v_candidate_count=0 THEN
          v_person_status:='unmatched'; v_person_reason:='T0_PERSON_MAP_NOT_FOUND';
        ELSE v_person_status:='ambiguous'; v_person_reason:='T0_PERSON_MAP_AMBIGUOUS'; END IF;
      END IF;
      SELECT binding.* INTO v_binding FROM public.hr_performance_legacy_session source_session
      JOIN public.hr_performance_legacy_session_binding binding ON binding.legacy_session_id=source_session.id
      WHERE (source_session.tenant_id,source_session.park_id,source_session.migration_batch_id,
        source_session.source_session_id)=
        (p_tenant_id,p_park_id,p_batch_id,v_assignment.source_session_id);
      IF NOT FOUND THEN v_binding:=NULL; END IF;
      v_cycle_employee_id:=NULL;
      IF v_role='assessor' THEN v_cycle_status:='not_applicable'; v_cycle_reason:='ASSESSOR_CYCLE_NOT_APPLICABLE';
      ELSIF v_person_status<>'resolved' THEN v_cycle_status:='not_applicable'; v_cycle_reason:='PERSON_UNRESOLVED';
      ELSIF v_assignment.source_session_id IS NULL THEN v_cycle_status:='not_applicable'; v_cycle_reason:='SESSION_NOT_APPLICABLE';
      ELSIF v_binding.id IS NULL OR v_binding.resolution_status<>'resolved' THEN
        v_cycle_status:='unmatched'; v_cycle_reason:='SESSION_BINDING_UNRESOLVED';
      ELSE
        SELECT count(*),(array_agg(id ORDER BY id))[1] INTO v_cycle_count,v_cycle_employee_id
        FROM public.hr_performance_cycle_employee WHERE (tenant_id,park_id,cycle_id,employee_id)=
          (p_tenant_id,p_park_id,v_binding.target_review_cycle_id,v_employee_id);
        IF v_cycle_count=1 THEN v_cycle_status:='resolved'; v_cycle_reason:='EXACT_CYCLE_EMPLOYEE';
        ELSIF v_cycle_count=0 THEN v_cycle_employee_id:=NULL; v_cycle_status:='unmatched';
          v_cycle_reason:='CYCLE_EMPLOYEE_NOT_FOUND';
        ELSE v_cycle_employee_id:=NULL; v_cycle_status:='ambiguous';
          v_cycle_reason:='CYCLE_EMPLOYEE_AMBIGUOUS'; END IF;
      END IF;
      v_resolution_id:=uuid_generate_v5(v_namespace,
        'fact:'||p_batch_id::text||':source_person_assignment:'||v_assignment.id::text||':'||v_role);
      INSERT INTO public.hr_performance_legacy_identity_resolution(
        id,tenant_id,park_id,migration_batch_id,fact_kind,person_role,
        legacy_source_person_assignment_id,source_person_identity_sha256,
        person_resolution_status,person_resolution_reason_code,owner_t0_record_map_id,
        target_employee_id,session_binding_id,cycle_resolution_status,
        cycle_resolution_reason_code,target_cycle_employee_id,evidence_sha256
      ) VALUES(v_resolution_id,p_tenant_id,p_park_id,p_batch_id,'source_person_assignment',v_role,
        v_assignment.id,v_identity,v_person_status,v_person_reason,v_owner_map_id,v_employee_id,
        v_binding.id,v_cycle_status,v_cycle_reason,v_cycle_employee_id,
        public.hr_performance_yuzhou_identity_resolution_evidence_sha256(
          'source_person_assignment',v_assignment.id,v_role,v_identity,v_person_status,v_person_reason,
          v_owner_map_id,v_employee_id,v_binding.id,v_cycle_status,v_cycle_reason,v_cycle_employee_id))
      ON CONFLICT(id) DO NOTHING;
      IF NOT EXISTS(SELECT 1 FROM public.hr_performance_legacy_identity_resolution r
        WHERE r.id=v_resolution_id AND r.person_resolution_status=v_person_status
          AND r.person_resolution_reason_code=v_person_reason
          AND r.owner_t0_record_map_id IS NOT DISTINCT FROM v_owner_map_id
          AND r.target_employee_id IS NOT DISTINCT FROM v_employee_id
          AND r.session_binding_id IS NOT DISTINCT FROM v_binding.id
          AND r.cycle_resolution_status=v_cycle_status
          AND r.cycle_resolution_reason_code=v_cycle_reason
          AND r.target_cycle_employee_id IS NOT DISTINCT FROM v_cycle_employee_id) THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_REPLAY_DRIFT'; END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM public.hr_performance_legacy_identity_resolution
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id))<>234 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_IDENTITY_CONSERVATION_FAILED'; END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_apply_performance_relations_production_v1(
  p_operation_id varchar,p_sealed_plan_sha256 char(64),
  p_authorization_artifact_sha256 char(64),p_authorization_nonce_sha256 char(64),
  p_code_sha char(40),p_source_snapshot_sha256 char(64),p_mapping_contract_sha256 char(64),
  p_target_identity_sha256 char(64),p_tenant_id varchar,p_park_id varchar,
  p_target_scope_sha256 char(64),p_t0_phase_receipt_sha256 char(64),
  p_relation_payload_artifact_sha256 char(64),p_identity_decision_artifact_sha256 char(64),
  p_relation_payload bytea,p_identity_decision bytea,
  p_migration_305_sha256 char(64),p_migration_306_sha256 char(64)
) RETURNS TABLE(
  status varchar,replayed boolean,session_rows integer,score_source_rows integer,
  assignment_rows integer,active_relation_maps integer,identity_resolution_rows integer,
  session_binding_rows integer,subject_unmatched_rows integer,blank_assessor_rows integer,
  receipt_sha256 char(64)
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_operation public.hr_yuzhou_production_import_operation%ROWTYPE;
  v_t0_phase public.hr_yuzhou_production_import_phase%ROWTYPE;
  v_batch public.migration_batch%ROWTYPE;
  v_existing public.hr_yuzhou_performance_relations_production_receipt%ROWTYPE;
  v_relations jsonb; v_identity jsonb; v_receipt char(64);
  v_session_rows integer; v_score_rows integer; v_assignment_rows integer;
  v_map_rows integer; v_identity_rows integer; v_binding_rows integer;
  v_subject_unmatched integer; v_blank_assessor integer;
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_REQUIRES_SERIALIZABLE'; END IF;
  IF p_migration_305_sha256<>'d3784218fc8272bd28b93e44b19a02d5c8124466b6b3c218294920603909dfc0'
    OR p_migration_306_sha256<>'cd49f294f4c9e4105b9f7fd4c678b7b2d29c5433d0348f6e6632d6e7c135a56d' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_MIGRATION_DRIFT'; END IF;
  IF p_target_scope_sha256<>public.hr_yuzhou_production_target_scope_sha256(p_tenant_id,p_park_id)
    OR encode(digest(p_relation_payload,'sha256'),'hex')<>p_relation_payload_artifact_sha256
    OR encode(digest(p_identity_decision,'sha256'),'hex')<>p_identity_decision_artifact_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_BINDING_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_performance_relations_production',0));
  SELECT * INTO v_operation FROM public.hr_yuzhou_production_import_operation
  WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR v_operation.status<>'running' OR v_operation.current_phase<>'T0'
    OR v_operation.execution_contract_version<>2
    OR v_operation.sealed_plan_sha256<>p_sealed_plan_sha256
    OR v_operation.code_sha<>p_code_sha
    OR v_operation.source_snapshot_sha256<>p_source_snapshot_sha256
    OR v_operation.mapping_contract_sha256<>p_mapping_contract_sha256
    OR v_operation.target_identity_sha256<>p_target_identity_sha256
    OR (v_operation.target_tenant_id,v_operation.target_park_id,v_operation.target_scope_sha256)
      IS DISTINCT FROM (p_tenant_id,p_park_id,p_target_scope_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_OPERATION_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_authorization_use auth
    WHERE auth.intent='production_import' AND auth.operation_id=p_operation_id
      AND auth.import_operation_id=p_operation_id
      AND auth.authorization_artifact_sha256=p_authorization_artifact_sha256
      AND auth.authorization_nonce_sha256=p_authorization_nonce_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_AUTHORIZATION_INVALID'; END IF;
  SELECT * INTO v_t0_phase FROM public.hr_yuzhou_production_import_phase phase
  WHERE phase.operation_id=p_operation_id AND phase.phase='T0' FOR SHARE;
  IF NOT FOUND OR v_t0_phase.status<>'succeeded'
    OR v_t0_phase.after_canonical_sha256 IS NULL
    OR v_t0_phase.after_canonical_sha256<>p_t0_phase_receipt_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_T0_RECEIPT_INVALID'; END IF;
  SELECT * INTO v_batch FROM public.migration_batch batch
  WHERE batch.execution_context='production_import'
    AND batch.production_import_operation_id=p_operation_id
    AND batch.production_import_phase='T0' AND batch.status='succeeded'
    AND batch.target_database=current_database() FOR SHARE;
  IF NOT FOUND OR v_batch.source_system<>'yuzhou-v10'
    OR v_batch.source_snapshot_sha256<>p_source_snapshot_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_T0_BATCH_INVALID'; END IF;

  SELECT * INTO v_existing FROM public.hr_yuzhou_performance_relations_production_receipt
    WHERE operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status<>'succeeded' OR ROW(
      v_existing.migration_batch_id,v_existing.sealed_plan_sha256,
      v_existing.authorization_artifact_sha256,v_existing.authorization_nonce_sha256,
      v_existing.code_sha,v_existing.source_snapshot_sha256,v_existing.mapping_contract_sha256,
      v_existing.target_identity_sha256,v_existing.tenant_id,v_existing.park_id,
      v_existing.target_scope_sha256,v_existing.t0_phase_receipt_sha256,
      v_existing.relation_payload_artifact_sha256,v_existing.identity_decision_artifact_sha256,
      v_existing.migration_305_sha256,v_existing.migration_306_sha256
    ) IS DISTINCT FROM ROW(
      v_batch.id,p_sealed_plan_sha256,p_authorization_artifact_sha256,p_authorization_nonce_sha256,
      p_code_sha,p_source_snapshot_sha256,p_mapping_contract_sha256,p_target_identity_sha256,
      p_tenant_id,p_park_id,p_target_scope_sha256,p_t0_phase_receipt_sha256,
      p_relation_payload_artifact_sha256,p_identity_decision_artifact_sha256,
      p_migration_305_sha256,p_migration_306_sha256
    ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_REPLAY_DRIFT'; END IF;
  ELSE
    BEGIN
      v_relations:=convert_from(p_relation_payload,'UTF8')::jsonb;
      v_identity:=convert_from(p_identity_decision,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_ARTIFACT_INVALID';
    END;
    PERFORM set_config('yuzhou.performance_relations_operation_id',p_operation_id,true);
    PERFORM set_config('yuzhou.performance_relations_mode','apply',true);
    CALL public.hr_yuzhou_materialize_performance_relations_production_v1(
      p_tenant_id,p_park_id,v_batch.id,v_relations);
    CALL public.hr_yuzhou_materialize_performance_identity_production_v1(
      p_tenant_id,p_park_id,v_batch.id,v_identity);
  END IF;

  SELECT count(*) INTO v_session_rows FROM public.hr_performance_legacy_session
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,v_batch.id);
  SELECT count(*) INTO v_score_rows FROM public.hr_performance_legacy_score_source
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,v_batch.id);
  SELECT count(*) INTO v_assignment_rows FROM public.hr_performance_legacy_source_person_assignment
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,v_batch.id);
  SELECT count(*) INTO v_map_rows FROM public.legacy_record_map WHERE batch_id=v_batch.id AND is_active
    AND target_table IN('hr_performance_legacy_session','hr_performance_legacy_score_source',
      'hr_performance_legacy_source_person_assignment');
  SELECT count(*) INTO v_identity_rows FROM public.hr_performance_legacy_identity_resolution
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,v_batch.id);
  SELECT count(*) INTO v_binding_rows FROM public.hr_performance_legacy_session_binding
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,v_batch.id);
  SELECT count(*) INTO v_subject_unmatched FROM public.hr_performance_legacy_identity_resolution
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,v_batch.id)
      AND person_role='subject' AND person_resolution_status='unmatched';
  SELECT count(*) INTO v_blank_assessor FROM public.hr_performance_legacy_identity_resolution
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,v_batch.id)
      AND person_role='assessor' AND person_resolution_status='not_applicable'
      AND person_resolution_reason_code='ASSESSOR_CODE_EMPTY';
  IF ROW(v_session_rows,v_score_rows,v_assignment_rows,v_map_rows,v_identity_rows,
    v_binding_rows,v_subject_unmatched,v_blank_assessor)
    IS DISTINCT FROM ROW(7,0,117,124,234,7,108,117) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_CONSERVATION_FAILED'; END IF;
  v_receipt:=encode(digest(convert_to(jsonb_build_object(
    'contract','jinhu-yuzhou-performance-relations-production-v1','operationId',p_operation_id,
    'sealedPlanSha256',p_sealed_plan_sha256,
    'authorizationArtifactSha256',p_authorization_artifact_sha256,
    'authorizationNonceSha256',p_authorization_nonce_sha256,'codeSha',p_code_sha,
    'sourceSnapshotSha256',p_source_snapshot_sha256,'mappingContractSha256',p_mapping_contract_sha256,
    'targetIdentitySha256',p_target_identity_sha256,'targetScopeSha256',p_target_scope_sha256,
    't0PhaseReceiptSha256',p_t0_phase_receipt_sha256,
    'relationPayloadArtifactSha256',p_relation_payload_artifact_sha256,
    'identityDecisionArtifactSha256',p_identity_decision_artifact_sha256,
    'migration305Sha256',p_migration_305_sha256,'migration306Sha256',p_migration_306_sha256,
    'counts',jsonb_build_array(7,0,117,124,234,7,108,117))::text,'UTF8'),'sha256'),'hex');
  INSERT INTO public.hr_yuzhou_performance_relations_production_receipt(
    operation_id,migration_batch_id,sealed_plan_sha256,authorization_artifact_sha256,
    authorization_nonce_sha256,code_sha,source_snapshot_sha256,mapping_contract_sha256,
    target_identity_sha256,tenant_id,park_id,target_scope_sha256,t0_phase_receipt_sha256,
    relation_payload_artifact_sha256,identity_decision_artifact_sha256,
    migration_305_sha256,migration_306_sha256,session_rows,score_source_rows,assignment_rows,
    active_relation_maps,identity_resolution_rows,session_binding_rows,subject_unmatched_rows,
    blank_assessor_rows,receipt_sha256
  ) VALUES(p_operation_id,v_batch.id,p_sealed_plan_sha256,p_authorization_artifact_sha256,
    p_authorization_nonce_sha256,p_code_sha,p_source_snapshot_sha256,p_mapping_contract_sha256,
    p_target_identity_sha256,p_tenant_id,p_park_id,p_target_scope_sha256,p_t0_phase_receipt_sha256,
    p_relation_payload_artifact_sha256,p_identity_decision_artifact_sha256,
    p_migration_305_sha256,p_migration_306_sha256,7,0,117,124,234,7,108,117,v_receipt)
  ON CONFLICT(operation_id) DO NOTHING;
  RETURN QUERY SELECT 'succeeded'::varchar,(v_existing.operation_id IS NOT NULL),
    7,0,117,124,234,7,108,117,v_receipt;
END$$;

CREATE OR REPLACE FUNCTION hr_yuzhou_rollback_performance_relations_production_v1(
  p_rollback_operation_id varchar,p_operation_id varchar,p_sealed_plan_sha256 char(64),
  p_authorization_artifact_sha256 char(64),p_authorization_nonce_sha256 char(64),
  p_code_sha char(40),p_source_snapshot_sha256 char(64),p_mapping_contract_sha256 char(64),
  p_target_identity_sha256 char(64),p_tenant_id varchar,p_park_id varchar,
  p_target_scope_sha256 char(64),p_t0_phase_receipt_sha256 char(64),
  p_migration_305_sha256 char(64),p_migration_306_sha256 char(64)
) RETURNS TABLE(status varchar,rollback_order text,residual_count integer,replayed boolean,receipt_sha256 char(64))
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_receipt public.hr_yuzhou_performance_relations_production_receipt%ROWTYPE;
  v_residual integer; v_rollback_receipt char(64); v_replayed boolean:=false;
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_REQUIRES_SERIALIZABLE'; END IF;
  IF p_migration_305_sha256<>'d3784218fc8272bd28b93e44b19a02d5c8124466b6b3c218294920603909dfc0'
    OR p_migration_306_sha256<>'cd49f294f4c9e4105b9f7fd4c678b7b2d29c5433d0348f6e6632d6e7c135a56d'
    OR p_target_scope_sha256<>public.hr_yuzhou_production_target_scope_sha256(p_tenant_id,p_park_id) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_BINDING_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_performance_relations_production',0));
  SELECT * INTO v_receipt FROM public.hr_yuzhou_performance_relations_production_receipt
    WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR ROW(v_receipt.sealed_plan_sha256,v_receipt.code_sha,
    v_receipt.source_snapshot_sha256,v_receipt.mapping_contract_sha256,
    v_receipt.target_identity_sha256,v_receipt.tenant_id,v_receipt.park_id,
    v_receipt.target_scope_sha256,v_receipt.t0_phase_receipt_sha256,
    v_receipt.migration_305_sha256,v_receipt.migration_306_sha256)
    IS DISTINCT FROM ROW(p_sealed_plan_sha256,p_code_sha,p_source_snapshot_sha256,
      p_mapping_contract_sha256,p_target_identity_sha256,p_tenant_id,p_park_id,
      p_target_scope_sha256,p_t0_phase_receipt_sha256,p_migration_305_sha256,p_migration_306_sha256)
  THEN RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_ROLLBACK_BINDING_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_operation operation
      WHERE operation.operation_id=p_operation_id AND operation.status='succeeded')
    OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_rollback_operation rollback_operation
      WHERE rollback_operation.rollback_operation_id=p_rollback_operation_id
        AND rollback_operation.import_operation_id=p_operation_id
        AND rollback_operation.status='running'
        AND rollback_operation.sealed_plan_sha256=p_sealed_plan_sha256
        AND rollback_operation.target_identity_sha256=p_target_identity_sha256
        AND rollback_operation.authorization_artifact_sha256=p_authorization_artifact_sha256
        AND rollback_operation.authorization_nonce_sha256=p_authorization_nonce_sha256)
    OR NOT EXISTS(SELECT 1 FROM public.hr_yuzhou_production_import_authorization_use auth
      WHERE auth.intent='production_import_rollback' AND auth.operation_id=p_rollback_operation_id
        AND auth.import_operation_id=p_operation_id
        AND auth.authorization_artifact_sha256=p_authorization_artifact_sha256
        AND auth.authorization_nonce_sha256=p_authorization_nonce_sha256) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_ROLLBACK_AUTHORIZATION_INVALID'; END IF;
  IF v_receipt.status='rolled_back' THEN
    IF v_receipt.rollback_operation_id<>p_rollback_operation_id THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_ROLLBACK_REPLAY_DRIFT'; END IF;
    v_replayed:=true; v_rollback_receipt:=v_receipt.rollback_receipt_sha256;
  ELSE
    PERFORM set_config('yuzhou.performance_relations_operation_id',p_operation_id,true);
    PERFORM set_config('yuzhou.performance_relations_rollback_operation_id',p_rollback_operation_id,true);
    PERFORM set_config('yuzhou.performance_relations_mode','rollback',true);
    PERFORM set_config('yuzhou.performance_identity_resolution_rollback_batch_id',v_receipt.migration_batch_id::text,true);
    PERFORM set_config('yuzhou.performance_legacy_rollback_batch_id',v_receipt.migration_batch_id::text,true);
    DELETE FROM public.hr_performance_legacy_identity_resolution
      WHERE migration_batch_id=v_receipt.migration_batch_id;
    DELETE FROM public.hr_performance_legacy_session_binding
      WHERE migration_batch_id=v_receipt.migration_batch_id;
    DELETE FROM public.hr_performance_legacy_score_source
      WHERE migration_batch_id=v_receipt.migration_batch_id;
    DELETE FROM public.hr_performance_legacy_source_person_assignment
      WHERE migration_batch_id=v_receipt.migration_batch_id;
    DELETE FROM public.hr_performance_legacy_session
      WHERE migration_batch_id=v_receipt.migration_batch_id;
    UPDATE public.legacy_record_map SET is_active=false,mapping_status='rolled_back'
    WHERE batch_id=v_receipt.migration_batch_id AND is_active
      AND target_table IN('hr_performance_legacy_session','hr_performance_legacy_score_source',
        'hr_performance_legacy_source_person_assignment');
    SET CONSTRAINTS ALL IMMEDIATE;
    SELECT
      (SELECT count(*) FROM public.hr_performance_legacy_identity_resolution WHERE migration_batch_id=v_receipt.migration_batch_id)
      +(SELECT count(*) FROM public.hr_performance_legacy_session_binding WHERE migration_batch_id=v_receipt.migration_batch_id)
      +(SELECT count(*) FROM public.hr_performance_legacy_score_source WHERE migration_batch_id=v_receipt.migration_batch_id)
      +(SELECT count(*) FROM public.hr_performance_legacy_source_person_assignment WHERE migration_batch_id=v_receipt.migration_batch_id)
      +(SELECT count(*) FROM public.hr_performance_legacy_session WHERE migration_batch_id=v_receipt.migration_batch_id)
      +(SELECT count(*) FROM public.legacy_record_map WHERE batch_id=v_receipt.migration_batch_id AND is_active
        AND target_table IN('hr_performance_legacy_session','hr_performance_legacy_score_source',
          'hr_performance_legacy_source_person_assignment')) INTO v_residual;
    IF v_residual<>0 THEN RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_ROLLBACK_RESIDUAL'; END IF;
    v_rollback_receipt:=encode(digest(convert_to(jsonb_build_object(
      'contract','jinhu-yuzhou-performance-relations-production-rollback-v1',
      'rollbackOperationId',p_rollback_operation_id,'operationId',p_operation_id,
      'sealedPlanSha256',p_sealed_plan_sha256,
      'authorizationArtifactSha256',p_authorization_artifact_sha256,
      'authorizationNonceSha256',p_authorization_nonce_sha256,
      'codeSha',p_code_sha,'sourceSnapshotSha256',p_source_snapshot_sha256,
      'mappingContractSha256',p_mapping_contract_sha256,
      'targetIdentitySha256',p_target_identity_sha256,
      'targetScopeSha256',p_target_scope_sha256,'t0PhaseReceiptSha256',p_t0_phase_receipt_sha256,
      'migration305Sha256',p_migration_305_sha256,'migration306Sha256',p_migration_306_sha256,
      'rollbackOrder','identity_resolution>source_person_assignments','residualCount',0)::text,'UTF8'),
      'sha256'),'hex');
    UPDATE public.hr_yuzhou_performance_relations_production_receipt SET
      status='rolled_back',active_relation_maps=0,identity_resolution_rows=0,session_binding_rows=0,
      rollback_operation_id=p_rollback_operation_id,rollback_receipt_sha256=v_rollback_receipt,
      rolled_back_at=now() WHERE operation_id=p_operation_id;
  END IF;
  SELECT
    (SELECT count(*) FROM public.hr_performance_legacy_identity_resolution WHERE migration_batch_id=v_receipt.migration_batch_id)
    +(SELECT count(*) FROM public.hr_performance_legacy_session_binding WHERE migration_batch_id=v_receipt.migration_batch_id)
    +(SELECT count(*) FROM public.hr_performance_legacy_score_source WHERE migration_batch_id=v_receipt.migration_batch_id)
    +(SELECT count(*) FROM public.hr_performance_legacy_source_person_assignment WHERE migration_batch_id=v_receipt.migration_batch_id)
    +(SELECT count(*) FROM public.hr_performance_legacy_session WHERE migration_batch_id=v_receipt.migration_batch_id)
    +(SELECT count(*) FROM public.legacy_record_map WHERE batch_id=v_receipt.migration_batch_id AND is_active
      AND target_table IN('hr_performance_legacy_session','hr_performance_legacy_score_source',
        'hr_performance_legacy_source_person_assignment')) INTO v_residual;
  IF v_residual<>0 THEN RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_ROLLBACK_RESIDUAL'; END IF;
  RETURN QUERY SELECT 'rolled_back'::varchar,
    'identity_resolution>source_person_assignments'::text,0,v_replayed,v_rollback_receipt;
END$$;

-- No login role is created by this migration.  The cutover provisioner grants
-- these narrowly-scoped role capabilities to a fresh one-time login and drops
-- it after the transaction.  Neither role can read the source fact tables.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jinhu_hr_yuzhou_performance_relations_probe') THEN
    CREATE ROLE jinhu_hr_yuzhou_performance_relations_probe NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jinhu_hr_yuzhou_performance_relations_writer') THEN
    CREATE ROLE jinhu_hr_yuzhou_performance_relations_writer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN(
      'jinhu_hr_yuzhou_performance_relations_probe','jinhu_hr_yuzhou_performance_relations_writer')
    AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_RELATIONS_PRODUCTION_ROLE_UNSAFE';
  END IF;
END$$;
REVOKE ALL ON public.hr_yuzhou_performance_relations_production_receipt FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_relations_production_capability_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_performance_relations_production_context_allowed(uuid,varchar) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.hr_yuzhou_materialize_performance_relations_production_v1(varchar,varchar,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.hr_yuzhou_materialize_performance_identity_production_v1(varchar,varchar,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_apply_performance_relations_production_v1(
  varchar,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char,bytea,bytea,char,char
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_yuzhou_rollback_performance_relations_production_v1(
  varchar,varchar,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_yuzhou_performance_relations_production_capability_v1()
  TO jinhu_hr_yuzhou_performance_relations_probe,jinhu_hr_yuzhou_performance_relations_writer;
GRANT USAGE ON SCHEMA public
  TO jinhu_hr_yuzhou_performance_relations_probe,jinhu_hr_yuzhou_performance_relations_writer;
GRANT EXECUTE ON FUNCTION public.hr_yuzhou_apply_performance_relations_production_v1(
  varchar,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char,bytea,bytea,char,char
) TO jinhu_hr_yuzhou_performance_relations_writer;
GRANT EXECUTE ON FUNCTION public.hr_yuzhou_rollback_performance_relations_production_v1(
  varchar,varchar,char,char,char,char,char,char,char,varchar,varchar,char,char,char,char
) TO jinhu_hr_yuzhou_performance_relations_writer;

COMMIT;
