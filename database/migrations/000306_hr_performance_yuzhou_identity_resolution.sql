BEGIN;

-- Legacy performance facts stay immutable.  Modern identities are attached by
-- an append-only ledger so an unresolved source code never mutates, merges, or
-- invents a modern workflow record.
CREATE TABLE hr_performance_legacy_session_binding (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_session_id uuid NOT NULL,
  source_session_identity_sha256 char(64) NOT NULL,
  resolution_status varchar(32) NOT NULL,
  resolution_reason_code varchar(64) NOT NULL,
  target_review_cycle_id uuid,
  decision_attestation_sha256 char(64) NOT NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_perf_legacy_session_binding_scope UNIQUE(id,tenant_id,park_id,migration_batch_id),
  CONSTRAINT uq_hr_perf_legacy_session_binding_source UNIQUE(legacy_session_id),
  CONSTRAINT ck_hr_perf_legacy_session_binding_hashes CHECK(
    source_session_identity_sha256~'^[0-9a-f]{64}$'
    AND decision_attestation_sha256~'^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_hr_perf_legacy_session_binding_status CHECK(
    resolution_status IN('resolved','unmatched','ambiguous','semantics_unverified')
  ),
  CONSTRAINT ck_hr_perf_legacy_session_binding_reason CHECK(
    resolution_reason_code~'^[A-Z][A-Z0-9_]{2,63}$'
  ),
  CONSTRAINT ck_hr_perf_legacy_session_binding_target CHECK(
    (resolution_status='resolved' AND target_review_cycle_id IS NOT NULL)
    OR (resolution_status<>'resolved' AND target_review_cycle_id IS NULL)
  ),
  CONSTRAINT fk_hr_perf_legacy_session_binding_source FOREIGN KEY(
    legacy_session_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_session(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_session_binding_target FOREIGN KEY(
    target_review_cycle_id,tenant_id,park_id
  ) REFERENCES hr_performance_review_cycle(id,tenant_id,park_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE hr_performance_legacy_identity_resolution (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  fact_kind varchar(40) NOT NULL,
  person_role varchar(16) NOT NULL,
  legacy_dimension_result_id uuid,
  legacy_master_result_id uuid,
  legacy_score_source_id uuid,
  legacy_source_person_assignment_id uuid,
  source_person_identity_sha256 char(64),
  person_resolution_status varchar(32) NOT NULL,
  person_resolution_reason_code varchar(64) NOT NULL,
  owner_t0_record_map_id uuid REFERENCES legacy_record_map(id) DEFERRABLE INITIALLY DEFERRED,
  target_employee_id uuid,
  session_binding_id uuid,
  cycle_resolution_status varchar(32) NOT NULL,
  cycle_resolution_reason_code varchar(64) NOT NULL,
  target_cycle_employee_id uuid,
  evidence_sha256 char(64) NOT NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_perf_legacy_identity_resolution_scope UNIQUE(id,tenant_id,park_id,migration_batch_id),
  CONSTRAINT ck_hr_perf_legacy_identity_resolution_fact CHECK(
    fact_kind IN('dimension_result','master_result','score_source','source_person_assignment')
    AND num_nonnulls(
      legacy_dimension_result_id,legacy_master_result_id,legacy_score_source_id,
      legacy_source_person_assignment_id
    )=1
    AND ((fact_kind='dimension_result' AND legacy_dimension_result_id IS NOT NULL)
      OR (fact_kind='master_result' AND legacy_master_result_id IS NOT NULL)
      OR (fact_kind='score_source' AND legacy_score_source_id IS NOT NULL)
      OR (fact_kind='source_person_assignment' AND legacy_source_person_assignment_id IS NOT NULL))
  ),
  CONSTRAINT ck_hr_perf_legacy_identity_resolution_role CHECK(
    person_role IN('subject','assessor')
    AND (person_role='subject' OR fact_kind='source_person_assignment')
  ),
  CONSTRAINT ck_hr_perf_legacy_identity_resolution_hashes CHECK(
    (source_person_identity_sha256 IS NULL OR source_person_identity_sha256~'^[0-9a-f]{64}$')
    AND evidence_sha256~'^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_hr_perf_legacy_identity_resolution_person_status CHECK(
    person_resolution_status IN('resolved','unmatched','ambiguous','semantics_unverified','not_applicable')
    AND person_resolution_reason_code~'^[A-Z][A-Z0-9_]{2,63}$'
  ),
  CONSTRAINT ck_hr_perf_legacy_identity_resolution_person_target CHECK(
    (person_resolution_status='resolved' AND source_person_identity_sha256 IS NOT NULL
      AND owner_t0_record_map_id IS NOT NULL AND target_employee_id IS NOT NULL)
    OR (person_resolution_status IN('unmatched','ambiguous','semantics_unverified')
      AND source_person_identity_sha256 IS NOT NULL
      AND owner_t0_record_map_id IS NULL AND target_employee_id IS NULL)
    OR (person_resolution_status='not_applicable' AND source_person_identity_sha256 IS NULL
      AND owner_t0_record_map_id IS NULL AND target_employee_id IS NULL)
  ),
  CONSTRAINT ck_hr_perf_legacy_identity_resolution_cycle_status CHECK(
    cycle_resolution_status IN('resolved','unmatched','ambiguous','not_applicable')
    AND cycle_resolution_reason_code~'^[A-Z][A-Z0-9_]{2,63}$'
  ),
  CONSTRAINT ck_hr_perf_legacy_identity_resolution_cycle_target CHECK(
    (cycle_resolution_status='resolved' AND person_role='subject'
      AND person_resolution_status='resolved' AND session_binding_id IS NOT NULL
      AND target_cycle_employee_id IS NOT NULL)
    OR (cycle_resolution_status<>'resolved' AND target_cycle_employee_id IS NULL)
  ),
  CONSTRAINT fk_hr_perf_legacy_identity_dimension FOREIGN KEY(
    legacy_dimension_result_id,tenant_id,park_id
  ) REFERENCES hr_performance_legacy_dimension_result(id,tenant_id,park_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_identity_master FOREIGN KEY(
    legacy_master_result_id,tenant_id,park_id
  ) REFERENCES hr_performance_legacy_master_result(id,tenant_id,park_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_identity_score FOREIGN KEY(
    legacy_score_source_id,tenant_id,park_id
  ) REFERENCES hr_performance_legacy_score_source(id,tenant_id,park_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_identity_assignment FOREIGN KEY(
    legacy_source_person_assignment_id,tenant_id,park_id
  ) REFERENCES hr_performance_legacy_source_person_assignment(id,tenant_id,park_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_identity_employee FOREIGN KEY(
    tenant_id,park_id,target_employee_id
  ) REFERENCES hr_employee(tenant_id,park_id,id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_identity_session FOREIGN KEY(
    session_binding_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_session_binding(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_identity_cycle_employee FOREIGN KEY(
    target_cycle_employee_id,tenant_id,park_id
  ) REFERENCES hr_performance_cycle_employee(id,tenant_id,park_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX uq_hr_perf_legacy_identity_dimension_role
  ON hr_performance_legacy_identity_resolution(legacy_dimension_result_id,person_role)
  WHERE legacy_dimension_result_id IS NOT NULL;
CREATE UNIQUE INDEX uq_hr_perf_legacy_identity_master_role
  ON hr_performance_legacy_identity_resolution(legacy_master_result_id,person_role)
  WHERE legacy_master_result_id IS NOT NULL;
CREATE UNIQUE INDEX uq_hr_perf_legacy_identity_score_role
  ON hr_performance_legacy_identity_resolution(legacy_score_source_id,person_role)
  WHERE legacy_score_source_id IS NOT NULL;
CREATE UNIQUE INDEX uq_hr_perf_legacy_identity_assignment_role
  ON hr_performance_legacy_identity_resolution(legacy_source_person_assignment_id,person_role)
  WHERE legacy_source_person_assignment_id IS NOT NULL;
CREATE INDEX ix_hr_perf_legacy_identity_employee
  ON hr_performance_legacy_identity_resolution(tenant_id,park_id,target_employee_id)
  WHERE target_employee_id IS NOT NULL;
CREATE INDEX ix_hr_perf_legacy_identity_unresolved
  ON hr_performance_legacy_identity_resolution(
    tenant_id,park_id,migration_batch_id,person_resolution_status,cycle_resolution_status
  );

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_person_identity_sha256(p_source_person_code varchar)
RETURNS char(64) LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN NULLIF(btrim(p_source_person_code),'') IS NULL THEN NULL
    ELSE encode(digest(
      convert_to('dbo.person','UTF8') || decode('00','hex')
      || convert_to(btrim(p_source_person_code),'UTF8'),'sha256'
    ),'hex')::char(64)
  END
$$;

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
  WHERE source_map.source_system='yuzhou-v10'
    AND source_map.source_table='dbo.person'
    AND source_map.source_identity_sha256=p_source_person_identity_sha256
    AND source_map.target_table='hr_employee'
    AND source_map.mapping_status IN('loaded','verified')
    AND source_map.is_active
    AND receipt.source_identity_sha256=source_map.source_identity_sha256
    AND import_record.source_system='yuzhou-v10'
    AND import_record.source_table='dbo.person'
    AND import_record.source_pk_canonical='sha256:'||source_map.source_identity_sha256
    AND import_record.target_table='hr_employee'
    AND import_record.target_id=source_map.target_id
    AND import_record.disposition IN('insert','merge','skip_approved')
    AND import_record.rollback_status='not_started'
    AND import_phase.status='succeeded'
    AND import_operation.status='succeeded'
    AND import_operation.execution_contract_version=2
    AND (import_operation.target_tenant_id,import_operation.target_park_id)=(p_tenant_id,p_park_id)
    AND source_batch.execution_context='production_import'
    AND source_batch.production_import_operation_id=receipt.operation_id
    AND source_batch.production_import_phase='T0'
    AND source_batch.status='succeeded'
    AND NOT employee.is_deleted
$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_identity_resolution_evidence_sha256(
  p_fact_kind varchar,p_fact_id uuid,p_person_role varchar,
  p_source_person_identity_sha256 char(64),p_person_resolution_status varchar,
  p_person_resolution_reason_code varchar,p_owner_t0_record_map_id uuid,
  p_target_employee_id uuid,p_session_binding_id uuid,p_cycle_resolution_status varchar,
  p_cycle_resolution_reason_code varchar,p_target_cycle_employee_id uuid
) RETURNS char(64) LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path=public,pg_temp AS $$
  SELECT encode(digest(convert_to(jsonb_build_object(
    'contract','yuzhou-performance-identity-resolution-v1',
    'factKind',p_fact_kind,'factId',p_fact_id,'personRole',p_person_role,
    'sourcePersonIdentitySha256',p_source_person_identity_sha256,
    'personResolutionStatus',p_person_resolution_status,
    'personResolutionReasonCode',p_person_resolution_reason_code,
    'ownerT0RecordMapId',p_owner_t0_record_map_id,'targetEmployeeId',p_target_employee_id,
    'sessionBindingId',p_session_binding_id,'cycleResolutionStatus',p_cycle_resolution_status,
    'cycleResolutionReasonCode',p_cycle_resolution_reason_code,
    'targetCycleEmployeeId',p_target_cycle_employee_id
  )::text,'UTF8'),'sha256'),'hex')::char(64)
$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_identity_resolution_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_source_code varchar;
  v_source_session_id integer;
  v_fact_batch_id uuid;
  v_expected_identity char(64);
  v_candidate_count integer;
  v_candidate_map_id uuid;
  v_candidate_employee_id uuid;
  v_binding hr_performance_legacy_session_binding%ROWTYPE;
  v_cycle_count integer;
  v_cycle_employee_id uuid;
  v_batch migration_batch%ROWTYPE;
  v_fact_id uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_RESOLUTION_IMMUTABLE';
  END IF;

  SELECT * INTO v_batch FROM migration_batch WHERE id=NEW.migration_batch_id FOR SHARE;
  IF NOT FOUND OR v_batch.execution_context<>'lab_rehearsal'
    OR v_batch.target_database<>current_database()
    OR v_batch.phase<>'load' OR v_batch.status<>'running' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_BATCH_INVALID';
  END IF;

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
      source_session_id
      INTO v_fact_batch_id,v_source_code,v_source_session_id
    FROM hr_performance_legacy_source_person_assignment
    WHERE (id,tenant_id,park_id)=
      (NEW.legacy_source_person_assignment_id,NEW.tenant_id,NEW.park_id);
  END IF;
  IF NOT FOUND OR v_fact_batch_id<>NEW.migration_batch_id THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_RESOLUTION_FACT_MISMATCH';
  END IF;

  v_expected_identity:=hr_performance_yuzhou_person_identity_sha256(v_source_code);
  IF NEW.source_person_identity_sha256 IS DISTINCT FROM v_expected_identity THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_RESOLUTION_HASH_MISMATCH';
  END IF;

  IF NEW.person_role='assessor' THEN
    IF v_expected_identity IS NULL THEN
      IF NEW.person_resolution_status<>'not_applicable'
        OR NEW.person_resolution_reason_code<>'ASSESSOR_CODE_EMPTY' THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_ASSESSOR_EMPTY_REQUIRES_NOT_APPLICABLE';
      END IF;
    ELSIF NEW.person_resolution_status<>'semantics_unverified'
      OR NEW.person_resolution_reason_code<>'ASSESSOR_SEMANTICS_UNVERIFIED' THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_ASSESSOR_SEMANTICS_UNVERIFIED';
    END IF;
  ELSIF v_expected_identity IS NULL THEN
    IF NEW.person_resolution_status<>'not_applicable'
      OR NEW.person_resolution_reason_code<>'SUBJECT_CODE_EMPTY' THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SUBJECT_EMPTY_REQUIRES_NOT_APPLICABLE';
    END IF;
  ELSE
    SELECT count(*) INTO v_candidate_count
    FROM hr_performance_yuzhou_t0_person_candidate(
      NEW.tenant_id,NEW.park_id,v_expected_identity
    );
    IF v_candidate_count=1 THEN
      SELECT owner_t0_record_map_id,target_employee_id
        INTO v_candidate_map_id,v_candidate_employee_id
      FROM hr_performance_yuzhou_t0_person_candidate(
        NEW.tenant_id,NEW.park_id,v_expected_identity
      );
      IF NEW.person_resolution_status<>'resolved'
        OR NEW.person_resolution_reason_code<>'EXACT_T0_PERSON_MAP'
        OR NEW.owner_t0_record_map_id IS DISTINCT FROM v_candidate_map_id
        OR NEW.target_employee_id IS DISTINCT FROM v_candidate_employee_id THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_T0_PERSON_RESOLUTION_MISMATCH';
      END IF;
    ELSIF v_candidate_count=0 THEN
      IF NEW.person_resolution_status<>'unmatched'
        OR NEW.person_resolution_reason_code<>'T0_PERSON_MAP_NOT_FOUND' THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_T0_PERSON_UNMATCHED_REQUIRED';
      END IF;
    ELSE
      IF NEW.person_resolution_status<>'ambiguous'
        OR NEW.person_resolution_reason_code<>'T0_PERSON_MAP_AMBIGUOUS' THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_T0_PERSON_AMBIGUOUS_REQUIRED';
      END IF;
    END IF;
  END IF;

  SELECT binding.* INTO v_binding
  FROM hr_performance_legacy_session source_session
  JOIN hr_performance_legacy_session_binding binding
    ON binding.legacy_session_id=source_session.id
  WHERE (source_session.tenant_id,source_session.park_id,source_session.migration_batch_id,
    source_session.source_session_id)=
    (NEW.tenant_id,NEW.park_id,NEW.migration_batch_id,v_source_session_id);
  IF FOUND THEN
    IF NEW.session_binding_id IS DISTINCT FROM v_binding.id THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_BINDING_MISMATCH';
    END IF;
  ELSIF NEW.session_binding_id IS NOT NULL THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_BINDING_MISMATCH';
  END IF;

  IF NEW.person_role='assessor' OR NEW.person_resolution_status<>'resolved'
    OR v_source_session_id IS NULL THEN
    IF NEW.cycle_resolution_status<>'not_applicable'
      OR NEW.cycle_resolution_reason_code<>(
        CASE WHEN NEW.person_role='assessor' THEN 'ASSESSOR_CYCLE_NOT_APPLICABLE'
          WHEN NEW.person_resolution_status<>'resolved' THEN 'PERSON_UNRESOLVED'
          ELSE 'SESSION_NOT_APPLICABLE' END) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_CYCLE_NOT_APPLICABLE_REQUIRED';
    END IF;
  ELSIF NEW.session_binding_id IS NULL OR v_binding.resolution_status<>'resolved' THEN
    IF NEW.cycle_resolution_status<>'unmatched'
      OR NEW.cycle_resolution_reason_code<>'SESSION_BINDING_UNRESOLVED' THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_UNRESOLVED_REQUIRED';
    END IF;
  ELSE
    SELECT count(*),(array_agg(id ORDER BY id))[1] INTO v_cycle_count,v_cycle_employee_id
    FROM hr_performance_cycle_employee
    WHERE (tenant_id,park_id,cycle_id,employee_id)=
      (NEW.tenant_id,NEW.park_id,v_binding.target_review_cycle_id,NEW.target_employee_id);
    IF v_cycle_count=1 THEN
      IF NEW.cycle_resolution_status<>'resolved'
        OR NEW.cycle_resolution_reason_code<>'EXACT_CYCLE_EMPLOYEE'
        OR NEW.target_cycle_employee_id IS DISTINCT FROM v_cycle_employee_id THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_CYCLE_EMPLOYEE_MISMATCH';
      END IF;
    ELSIF v_cycle_count=0 THEN
      IF NEW.cycle_resolution_status<>'unmatched'
        OR NEW.cycle_resolution_reason_code<>'CYCLE_EMPLOYEE_NOT_FOUND' THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_CYCLE_EMPLOYEE_UNMATCHED_REQUIRED';
      END IF;
    ELSE
      IF NEW.cycle_resolution_status<>'ambiguous'
        OR NEW.cycle_resolution_reason_code<>'CYCLE_EMPLOYEE_AMBIGUOUS' THEN
        RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_CYCLE_EMPLOYEE_AMBIGUOUS_REQUIRED';
      END IF;
    END IF;
  END IF;

  v_fact_id:=COALESCE(
    NEW.legacy_dimension_result_id,NEW.legacy_master_result_id,
    NEW.legacy_score_source_id,NEW.legacy_source_person_assignment_id
  );
  IF NEW.evidence_sha256<>hr_performance_yuzhou_identity_resolution_evidence_sha256(
    NEW.fact_kind,v_fact_id,NEW.person_role,NEW.source_person_identity_sha256,
    NEW.person_resolution_status,NEW.person_resolution_reason_code,NEW.owner_t0_record_map_id,
    NEW.target_employee_id,NEW.session_binding_id,NEW.cycle_resolution_status,
    NEW.cycle_resolution_reason_code,NEW.target_cycle_employee_id
  ) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_EVIDENCE_MISMATCH';
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_perf_legacy_identity_resolution_exact
  BEFORE INSERT ON hr_performance_legacy_identity_resolution
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_identity_resolution_guard();

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_session_binding_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_session hr_performance_legacy_session%ROWTYPE;
  v_batch migration_batch%ROWTYPE;
BEGIN
  IF TG_OP<>'INSERT' THEN
    IF TG_OP='DELETE'
      AND current_setting('yuzhou.performance_identity_resolution_rollback_batch_id',true)=OLD.migration_batch_id::text
      AND EXISTS(SELECT 1 FROM migration_batch batch WHERE batch.id=OLD.migration_batch_id
        AND batch.execution_context='lab_rehearsal' AND batch.phase='rollback' AND batch.status='running') THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_BINDING_IMMUTABLE';
  END IF;
  SELECT * INTO v_batch FROM migration_batch WHERE id=NEW.migration_batch_id FOR SHARE;
  IF NOT FOUND OR v_batch.execution_context<>'lab_rehearsal'
    OR v_batch.target_database<>current_database() OR v_batch.phase<>'load' OR v_batch.status<>'running' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_BATCH_INVALID';
  END IF;
  SELECT * INTO v_session FROM hr_performance_legacy_session
  WHERE (id,tenant_id,park_id,migration_batch_id)=
    (NEW.legacy_session_id,NEW.tenant_id,NEW.park_id,NEW.migration_batch_id);
  IF NOT FOUND OR v_session.source_identity_sha256<>NEW.source_session_identity_sha256 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_BINDING_SOURCE_MISMATCH';
  END IF;
  IF NEW.resolution_status='resolved'
    AND v_session.target_review_cycle_id IS NOT NULL
    AND v_session.target_review_cycle_id<>NEW.target_review_cycle_id THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_SESSION_BINDING_TARGET_DRIFT';
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_perf_legacy_session_binding_exact
  BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_legacy_session_binding
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_session_binding_guard();

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_identity_resolution_delete_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE'
    AND current_setting('yuzhou.performance_identity_resolution_rollback_batch_id',true)=OLD.migration_batch_id::text
    AND EXISTS(SELECT 1 FROM migration_batch batch WHERE batch.id=OLD.migration_batch_id
      AND batch.execution_context='lab_rehearsal' AND batch.phase='rollback' AND batch.status='running') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_RESOLUTION_IMMUTABLE';
END$$;

-- The exact validation trigger owns INSERT.  This earlier trigger opens DELETE
-- only for the named lab rollback batch; UPDATE remains impossible.
CREATE TRIGGER trg_hr_perf_legacy_identity_resolution_rollback
  BEFORE UPDATE OR DELETE ON hr_performance_legacy_identity_resolution
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_identity_resolution_delete_guard();

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_t0_map_resolution_reverse_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM hr_performance_legacy_identity_resolution resolution
    WHERE resolution.owner_t0_record_map_id=OLD.id) THEN
    RETURN COALESCE(NEW,OLD);
  END IF;
  IF TG_OP='DELETE' OR NOT NEW.is_active OR NEW.mapping_status NOT IN('loaded','verified')
    OR ROW(NEW.source_system,NEW.source_table,NEW.source_identity_sha256,NEW.target_table,NEW.target_id)
      IS DISTINCT FROM ROW(OLD.source_system,OLD.source_table,OLD.source_identity_sha256,OLD.target_table,OLD.target_id) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_T0_MAP_REFERENCED';
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_perf_legacy_t0_map_resolution_reverse
  BEFORE UPDATE OF is_active,mapping_status,source_system,source_table,source_identity_sha256,target_table,target_id
    OR DELETE ON legacy_record_map
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_t0_map_resolution_reverse_guard();

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_employee_resolution_reverse_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM hr_performance_legacy_identity_resolution resolution
    WHERE resolution.target_employee_id=OLD.id) THEN
    RETURN COALESCE(NEW,OLD);
  END IF;
  IF TG_OP='DELETE' OR NEW.is_deleted
    OR ROW(NEW.id,NEW.tenant_id,NEW.park_id) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.park_id) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_EMPLOYEE_RESOLUTION_REFERENCED';
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_perf_legacy_employee_resolution_reverse
  BEFORE UPDATE OF id,tenant_id,park_id,is_deleted OR DELETE ON hr_employee
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_employee_resolution_reverse_guard();

CREATE OR REPLACE PROCEDURE materialize_yuzhou_performance_legacy_identity_resolution_lab(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid,p_payload jsonb
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_row jsonb;
  v_session hr_performance_legacy_session%ROWTYPE;
  v_binding_id uuid;
  v_target_cycle_id uuid;
  v_session_expected integer;
  v_fact record;
  v_resolution_id uuid;
  v_identity char(64);
  v_person_status varchar(32);
  v_person_reason varchar(64);
  v_candidate_count integer;
  v_owner_map_id uuid;
  v_employee_id uuid;
  v_binding hr_performance_legacy_session_binding%ROWTYPE;
  v_cycle_count integer;
  v_cycle_employee_id uuid;
  v_cycle_status varchar(32);
  v_cycle_reason varchar(64);
  v_fact_expected integer;
  v_namespace constant uuid:='71382084-c80d-4bbf-b735-a816c79a0f6c';
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_REQUIRES_SERIALIZABLE';
  END IF;
  PERFORM 1 FROM migration_batch batch WHERE batch.id=p_batch_id
    AND batch.source_system='yuzhou-v10' AND batch.target_database=current_database()
    AND batch.execution_context='lab_rehearsal' AND batch.phase='load' AND batch.status='running'
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_BATCH_INVALID'; END IF;
  IF btrim(COALESCE(p_tenant_id,''))='' OR btrim(COALESCE(p_park_id,''))='' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_SCOPE_INVALID';
  END IF;
  IF NOT hr_performance_yuzhou_jsonb_exact_keys(p_payload,ARRAY['sessions'])
    OR jsonb_typeof(p_payload->'sessions')<>'array' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_PAYLOAD_INVALID';
  END IF;

  LOCK TABLE hr_performance_legacy_session_binding,hr_performance_legacy_identity_resolution,
    legacy_record_map,hr_yuzhou_production_import_projection_receipt,
    hr_performance_cycle_employee IN SHARE ROW EXCLUSIVE MODE;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'sessions') LOOP
    IF NOT hr_performance_yuzhou_jsonb_exact_keys(v_row,ARRAY[
      'sourceSessionIdentitySha256','status','reasonCode','targetReviewCycleId','decisionAttestationSha256'
    ]) OR (v_row->>'sourceSessionIdentitySha256')!~'^[0-9a-f]{64}$'
      OR (v_row->>'decisionAttestationSha256')!~'^[0-9a-f]{64}$'
      OR (v_row->>'status') NOT IN('resolved','unmatched','ambiguous','semantics_unverified')
      OR (v_row->>'reasonCode')!~'^[A-Z][A-Z0-9_]{2,63}$' THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_SESSION_INVALID';
    END IF;
    SELECT * INTO STRICT v_session FROM hr_performance_legacy_session
    WHERE (tenant_id,park_id,migration_batch_id,source_identity_sha256)=
      (p_tenant_id,p_park_id,p_batch_id,(v_row->>'sourceSessionIdentitySha256')::char(64));
    v_target_cycle_id:=NULLIF(v_row->>'targetReviewCycleId','')::uuid;
    IF ((v_row->>'status')='resolved')<>(v_target_cycle_id IS NOT NULL) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_SESSION_TARGET_INVALID';
    END IF;
    IF (v_row->>'status')='resolved' AND NOT EXISTS(
      SELECT 1 FROM hr_performance_review_cycle cycle
      WHERE (cycle.id,cycle.tenant_id,cycle.park_id)=(v_target_cycle_id,p_tenant_id,p_park_id)
    ) THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_SESSION_TARGET_INVALID'; END IF;
    v_binding_id:=uuid_generate_v5(v_namespace,
      'session:'||p_batch_id::text||':'||v_session.source_identity_sha256);
    INSERT INTO hr_performance_legacy_session_binding(
      id,tenant_id,park_id,migration_batch_id,legacy_session_id,source_session_identity_sha256,
      resolution_status,resolution_reason_code,target_review_cycle_id,decision_attestation_sha256
    ) VALUES(
      v_binding_id,p_tenant_id,p_park_id,p_batch_id,v_session.id,v_session.source_identity_sha256,
      v_row->>'status',v_row->>'reasonCode',v_target_cycle_id,v_row->>'decisionAttestationSha256'
    ) ON CONFLICT(id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM hr_performance_legacy_session_binding binding
      WHERE binding.id=v_binding_id AND binding.legacy_session_id=v_session.id
        AND binding.resolution_status=v_row->>'status'
        AND binding.resolution_reason_code=v_row->>'reasonCode'
        AND binding.target_review_cycle_id IS NOT DISTINCT FROM v_target_cycle_id
        AND binding.decision_attestation_sha256=v_row->>'decisionAttestationSha256') THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_REPLAY_DRIFT';
    END IF;
  END LOOP;
  SELECT count(*) INTO v_session_expected FROM hr_performance_legacy_session
  WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id);
  IF jsonb_array_length(p_payload->'sessions')<>v_session_expected
    OR (SELECT count(*) FROM hr_performance_legacy_session_binding
      WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id))<>v_session_expected THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_SESSION_CONSERVATION_FAILED';
  END IF;

  FOR v_fact IN
    SELECT 'dimension_result'::varchar fact_kind,fact.id fact_id,'subject'::varchar person_role,
      fact.source_person_code source_code,fact.source_session_id,
      fact.id dimension_id,NULL::uuid master_id,NULL::uuid score_id,NULL::uuid assignment_id
    FROM hr_performance_legacy_dimension_result fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'master_result',fact.id,'subject',fact.source_person_code,fact.source_session_id,
      NULL::uuid,fact.id,NULL::uuid,NULL::uuid
    FROM hr_performance_legacy_master_result fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'score_source',fact.id,'subject',fact.source_person_code,fact.source_session_id,
      NULL::uuid,NULL::uuid,fact.id,NULL::uuid
    FROM hr_performance_legacy_score_source fact
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    UNION ALL
    SELECT 'source_person_assignment',fact.id,role.person_role,
      CASE role.person_role WHEN 'subject' THEN fact.source_person_code ELSE fact.source_assessor_code END,
      fact.source_session_id,NULL::uuid,NULL::uuid,NULL::uuid,fact.id
    FROM hr_performance_legacy_source_person_assignment fact
    CROSS JOIN (VALUES('subject'::varchar),('assessor'::varchar)) role(person_role)
    WHERE (fact.tenant_id,fact.park_id,fact.migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    ORDER BY fact_kind,fact_id,person_role
  LOOP
    v_identity:=hr_performance_yuzhou_person_identity_sha256(v_fact.source_code);
    v_owner_map_id:=NULL; v_employee_id:=NULL;
    IF v_fact.person_role='assessor' THEN
      IF v_identity IS NULL THEN
        v_person_status:='not_applicable'; v_person_reason:='ASSESSOR_CODE_EMPTY';
      ELSE
        v_person_status:='semantics_unverified'; v_person_reason:='ASSESSOR_SEMANTICS_UNVERIFIED';
      END IF;
    ELSIF v_identity IS NULL THEN
      v_person_status:='not_applicable'; v_person_reason:='SUBJECT_CODE_EMPTY';
    ELSE
      SELECT count(*) INTO v_candidate_count
      FROM hr_performance_yuzhou_t0_person_candidate(p_tenant_id,p_park_id,v_identity);
      IF v_candidate_count=1 THEN
        SELECT owner_t0_record_map_id,target_employee_id INTO v_owner_map_id,v_employee_id
        FROM hr_performance_yuzhou_t0_person_candidate(p_tenant_id,p_park_id,v_identity);
        v_person_status:='resolved'; v_person_reason:='EXACT_T0_PERSON_MAP';
      ELSIF v_candidate_count=0 THEN
        v_person_status:='unmatched'; v_person_reason:='T0_PERSON_MAP_NOT_FOUND';
      ELSE
        v_person_status:='ambiguous'; v_person_reason:='T0_PERSON_MAP_AMBIGUOUS';
      END IF;
    END IF;

    SELECT binding.* INTO v_binding
    FROM hr_performance_legacy_session source_session
    JOIN hr_performance_legacy_session_binding binding
      ON binding.legacy_session_id=source_session.id
    WHERE (source_session.tenant_id,source_session.park_id,source_session.migration_batch_id,
      source_session.source_session_id)=(p_tenant_id,p_park_id,p_batch_id,v_fact.source_session_id);
    IF NOT FOUND THEN v_binding:=NULL; END IF;
    v_cycle_employee_id:=NULL;
    IF v_fact.person_role='assessor' THEN
      v_cycle_status:='not_applicable'; v_cycle_reason:='ASSESSOR_CYCLE_NOT_APPLICABLE';
    ELSIF v_person_status<>'resolved' THEN
      v_cycle_status:='not_applicable'; v_cycle_reason:='PERSON_UNRESOLVED';
    ELSIF v_fact.source_session_id IS NULL THEN
      v_cycle_status:='not_applicable'; v_cycle_reason:='SESSION_NOT_APPLICABLE';
    ELSIF v_binding.id IS NULL OR v_binding.resolution_status<>'resolved' THEN
      v_cycle_status:='unmatched'; v_cycle_reason:='SESSION_BINDING_UNRESOLVED';
    ELSE
      SELECT count(*),(array_agg(id ORDER BY id))[1] INTO v_cycle_count,v_cycle_employee_id
      FROM hr_performance_cycle_employee
      WHERE (tenant_id,park_id,cycle_id,employee_id)=
        (p_tenant_id,p_park_id,v_binding.target_review_cycle_id,v_employee_id);
      IF v_cycle_count=1 THEN
        v_cycle_status:='resolved'; v_cycle_reason:='EXACT_CYCLE_EMPLOYEE';
      ELSIF v_cycle_count=0 THEN
        v_cycle_employee_id:=NULL;
        v_cycle_status:='unmatched'; v_cycle_reason:='CYCLE_EMPLOYEE_NOT_FOUND';
      ELSE
        v_cycle_employee_id:=NULL;
        v_cycle_status:='ambiguous'; v_cycle_reason:='CYCLE_EMPLOYEE_AMBIGUOUS';
      END IF;
    END IF;

    v_resolution_id:=uuid_generate_v5(v_namespace,
      'fact:'||p_batch_id::text||':'||v_fact.fact_kind||':'||v_fact.fact_id::text||':'||v_fact.person_role);
    INSERT INTO hr_performance_legacy_identity_resolution(
      id,tenant_id,park_id,migration_batch_id,fact_kind,person_role,
      legacy_dimension_result_id,legacy_master_result_id,legacy_score_source_id,
      legacy_source_person_assignment_id,source_person_identity_sha256,
      person_resolution_status,person_resolution_reason_code,owner_t0_record_map_id,
      target_employee_id,session_binding_id,cycle_resolution_status,
      cycle_resolution_reason_code,target_cycle_employee_id,evidence_sha256
    ) VALUES(
      v_resolution_id,p_tenant_id,p_park_id,p_batch_id,v_fact.fact_kind,v_fact.person_role,
      v_fact.dimension_id,v_fact.master_id,v_fact.score_id,v_fact.assignment_id,v_identity,
      v_person_status,v_person_reason,v_owner_map_id,v_employee_id,v_binding.id,
      v_cycle_status,v_cycle_reason,v_cycle_employee_id,
      hr_performance_yuzhou_identity_resolution_evidence_sha256(
        v_fact.fact_kind,v_fact.fact_id,v_fact.person_role,v_identity,v_person_status,
        v_person_reason,v_owner_map_id,v_employee_id,v_binding.id,v_cycle_status,
        v_cycle_reason,v_cycle_employee_id
      )
    ) ON CONFLICT(id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM hr_performance_legacy_identity_resolution resolution
      WHERE resolution.id=v_resolution_id AND resolution.fact_kind=v_fact.fact_kind
        AND resolution.person_role=v_fact.person_role
        AND resolution.source_person_identity_sha256 IS NOT DISTINCT FROM v_identity
        AND resolution.person_resolution_status=v_person_status
        AND resolution.person_resolution_reason_code=v_person_reason
        AND resolution.owner_t0_record_map_id IS NOT DISTINCT FROM v_owner_map_id
        AND resolution.target_employee_id IS NOT DISTINCT FROM v_employee_id
        AND resolution.session_binding_id IS NOT DISTINCT FROM v_binding.id
        AND resolution.cycle_resolution_status=v_cycle_status
        AND resolution.cycle_resolution_reason_code=v_cycle_reason
        AND resolution.target_cycle_employee_id IS NOT DISTINCT FROM v_cycle_employee_id) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_REPLAY_DRIFT';
    END IF;
  END LOOP;

  SELECT
    (SELECT count(*) FROM hr_performance_legacy_dimension_result WHERE
      (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id))
    +(SELECT count(*) FROM hr_performance_legacy_master_result WHERE
      (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id))
    +(SELECT count(*) FROM hr_performance_legacy_score_source WHERE
      (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id))
    +2*(SELECT count(*) FROM hr_performance_legacy_source_person_assignment WHERE
      (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id))
    INTO v_fact_expected;
  IF (SELECT count(*) FROM hr_performance_legacy_identity_resolution
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id))<>v_fact_expected THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_FACT_CONSERVATION_FAILED';
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
END$$;

CREATE OR REPLACE PROCEDURE rollback_yuzhou_performance_legacy_identity_resolution_lab(p_batch_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_ROLLBACK_REQUIRES_SERIALIZABLE';
  END IF;
  PERFORM 1 FROM migration_batch batch WHERE batch.id=p_batch_id
    AND batch.execution_context='lab_rehearsal' AND batch.target_database=current_database()
    AND batch.phase='rollback' AND batch.status='running' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_ROLLBACK_BATCH_INVALID'; END IF;
  PERFORM set_config('yuzhou.performance_identity_resolution_rollback_batch_id',p_batch_id::text,true);
  DELETE FROM hr_performance_legacy_identity_resolution WHERE migration_batch_id=p_batch_id;
  DELETE FROM hr_performance_legacy_session_binding WHERE migration_batch_id=p_batch_id;
  IF EXISTS(SELECT 1 FROM hr_performance_legacy_identity_resolution WHERE migration_batch_id=p_batch_id)
    OR EXISTS(SELECT 1 FROM hr_performance_legacy_session_binding WHERE migration_batch_id=p_batch_id) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_IDENTITY_ROLLBACK_RESIDUAL';
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
END$$;

REVOKE ALL ON hr_performance_legacy_session_binding FROM PUBLIC;
REVOKE ALL ON hr_performance_legacy_identity_resolution FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_person_identity_sha256(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_t0_person_candidate(varchar,varchar,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_identity_resolution_evidence_sha256(
  varchar,uuid,varchar,char,varchar,varchar,uuid,uuid,uuid,varchar,varchar,uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_identity_resolution_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_session_binding_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_identity_resolution_delete_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_t0_map_resolution_reverse_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_employee_resolution_reverse_guard() FROM PUBLIC;
REVOKE ALL ON PROCEDURE materialize_yuzhou_performance_legacy_identity_resolution_lab(varchar,varchar,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON PROCEDURE rollback_yuzhou_performance_legacy_identity_resolution_lab(uuid) FROM PUBLIC;

COMMIT;
