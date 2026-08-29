BEGIN;

-- migration_batch remains the common ledger for every historical loader.  A
-- production import is an explicit execution context; it must never be made to
-- look safe by giving a production database a lab-shaped name.
ALTER TABLE migration_batch
  ADD COLUMN execution_context varchar(32) NOT NULL DEFAULT 'lab_rehearsal',
  ADD COLUMN production_import_operation_id varchar(64),
  ADD COLUMN production_import_phase varchar(8),
  DROP CONSTRAINT ck_migration_batch_target,
  ADD CONSTRAINT ck_migration_batch_execution_context CHECK (
    (execution_context='lab_rehearsal'
      AND target_database ~ '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$'
      AND production_import_operation_id IS NULL
      AND production_import_phase IS NULL)
    OR
    (execution_context='production_import'
      AND btrim(target_database)<>''
      AND production_import_operation_id IS NOT NULL
      AND production_import_phase IN ('T0','T1','T2','T3'))
  ),
  ADD CONSTRAINT fk_migration_batch_production_import_phase
    FOREIGN KEY(production_import_operation_id,production_import_phase)
    REFERENCES hr_yuzhou_production_import_phase(operation_id,phase)
    DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX uq_migration_batch_production_import_phase
  ON migration_batch(production_import_operation_id,production_import_phase)
  WHERE execution_context='production_import';

ALTER TABLE hr_yuzhou_production_import_record
  ADD COLUMN source_system varchar(64),
  ADD COLUMN source_table varchar(256),
  ADD COLUMN source_pk_canonical varchar(512),
  ADD COLUMN business_identity_sha256 char(64),
  ADD COLUMN expected_target_version_before bigint,
  ADD COLUMN target_version_after bigint,
  ADD CONSTRAINT ck_hr_yuzhou_prod_record_source_receipt CHECK (
    (source_system IS NULL AND source_table IS NULL AND source_pk_canonical IS NULL)
    OR
    (source_system='yuzhou-v10' AND btrim(source_table)<>''
      AND source_pk_canonical='sha256:'||source_identity_sha256)
  ),
  ADD CONSTRAINT ck_hr_yuzhou_prod_record_cas_versions CHECK (
    expected_target_version_before IS NULL OR expected_target_version_before>=0
  ),
  ADD CONSTRAINT ck_hr_yuzhou_prod_record_business_identity CHECK (
    business_identity_sha256 IS NULL OR business_identity_sha256 ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT ck_hr_yuzhou_prod_record_cas_after_version CHECK (
    target_version_after IS NULL OR target_version_after>=0
  );

-- This receipt is the exact bridge between the sealed production record and
-- the legacy compatibility projection used by the existing HR readers.
CREATE TABLE hr_yuzhou_production_import_projection_receipt (
  operation_id varchar(64) NOT NULL,
  phase varchar(8) NOT NULL,
  source_identity_sha256 char(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_record_map_id uuid NOT NULL REFERENCES legacy_record_map(id) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(operation_id,phase,source_identity_sha256),
  UNIQUE(legacy_record_map_id),
  FOREIGN KEY(operation_id,phase,source_identity_sha256)
    REFERENCES hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX idx_hr_yuzhou_prod_projection_batch
  ON hr_yuzhou_production_import_projection_receipt(migration_batch_id);

CREATE FUNCTION hr_yuzhou_validate_production_migration_batch() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_operation hr_yuzhou_production_import_operation%ROWTYPE;
  v_phase hr_yuzhou_production_import_phase%ROWTYPE;
  v_invalid integer;
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.execution_context IS DISTINCT FROM OLD.execution_context
    OR NEW.production_import_operation_id IS DISTINCT FROM OLD.production_import_operation_id
    OR NEW.production_import_phase IS DISTINCT FROM OLD.production_import_phase
    OR NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.source_system IS DISTINCT FROM OLD.source_system
    OR NEW.source_snapshot_sha256 IS DISTINCT FROM OLD.source_snapshot_sha256
    OR NEW.target_database IS DISTINCT FROM OLD.target_database
    OR NEW.tool_version IS DISTINCT FROM OLD.tool_version
  ) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_MIGRATION_BATCH_BINDING_IMMUTABLE';
  END IF;
  IF NEW.execution_context<>'production_import' THEN RETURN NEW; END IF;
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_REQUIRES_SERIALIZABLE';
  END IF;
  IF NEW.target_database<>current_database() THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_TARGET_DATABASE_MISMATCH';
  END IF;
  SELECT * INTO v_operation FROM hr_yuzhou_production_import_operation
    WHERE operation_id=NEW.production_import_operation_id FOR SHARE;
  IF NOT FOUND OR v_operation.execution_contract_version<>2 OR v_operation.status<>'running' THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_OPERATION_NOT_RUNNING';
  END IF;
  SELECT * INTO v_phase FROM hr_yuzhou_production_import_phase
    WHERE operation_id=NEW.production_import_operation_id AND phase=NEW.production_import_phase FOR SHARE;
  IF NOT FOUND OR v_phase.status<>'running' OR v_operation.current_phase IS DISTINCT FROM NEW.production_import_phase THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_PHASE_NOT_RUNNING';
  END IF;
  IF NEW.source_system<>'yuzhou-v10'
     OR NEW.source_snapshot_sha256<>v_operation.source_snapshot_sha256
     OR NEW.run_id<>NEW.production_import_operation_id||'-'||lower(NEW.production_import_phase)
     OR NEW.tool_version<>'prod-import-v2@'||v_operation.code_sha THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_MIGRATION_BATCH_BINDING_INVALID';
  END IF;
  SELECT count(*) INTO v_invalid
  FROM hr_yuzhou_production_import_phase candidate
  WHERE candidate.operation_id=v_operation.operation_id
    AND (
      (candidate.phase_ordinal<v_phase.phase_ordinal AND candidate.status<>'succeeded')
      OR (candidate.phase_ordinal=v_phase.phase_ordinal AND candidate.status<>'running')
      OR (candidate.phase_ordinal>v_phase.phase_ordinal AND candidate.status<>'planned')
    );
  IF v_invalid<>0 THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_PHASE_ORDER_INVALID'; END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_yuzhou_prod_migration_batch
BEFORE INSERT OR UPDATE ON migration_batch
FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_validate_production_migration_batch();

CREATE FUNCTION hr_yuzhou_guard_production_record_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.source_system IS DISTINCT FROM OLD.source_system
    OR NEW.source_table IS DISTINCT FROM OLD.source_table
    OR NEW.source_pk_canonical IS DISTINCT FROM OLD.source_pk_canonical
    OR NEW.business_identity_sha256 IS DISTINCT FROM OLD.business_identity_sha256
    OR NEW.source_identity_sha256 IS DISTINCT FROM OLD.source_identity_sha256
    OR NEW.source_row_sha256 IS DISTINCT FROM OLD.source_row_sha256
    OR NEW.disposition IS DISTINCT FROM OLD.disposition
    OR NEW.planned_target_table IS DISTINCT FROM OLD.planned_target_table
    OR NEW.target_table IS DISTINCT FROM OLD.target_table
    OR NEW.target_id IS DISTINCT FROM OLD.target_id
    OR NEW.expected_target_before_sha256 IS DISTINCT FROM OLD.expected_target_before_sha256
    OR NEW.target_after_sha256 IS DISTINCT FROM OLD.target_after_sha256
    OR NEW.expected_target_version_before IS DISTINCT FROM OLD.expected_target_version_before
    OR NEW.target_version_after IS DISTINCT FROM OLD.target_version_after
  ) AND EXISTS(
    SELECT 1 FROM hr_yuzhou_production_import_projection_receipt receipt
    WHERE (receipt.operation_id,receipt.phase,receipt.source_identity_sha256)=
      (OLD.operation_id,OLD.phase,OLD.source_identity_sha256)
  ) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_RECORD_RECEIPT_IMMUTABLE';
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_yuzhou_prod_record_receipt_guard
BEFORE UPDATE ON hr_yuzhou_production_import_record
FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_guard_production_record_receipt();

CREATE FUNCTION hr_yuzhou_assert_production_projection_record(
  p_operation_id varchar,
  p_phase varchar,
  p_source_identity_sha256 char(64)
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_record hr_yuzhou_production_import_record%ROWTYPE;
  v_batch migration_batch%ROWTYPE;
  v_receipt hr_yuzhou_production_import_projection_receipt%ROWTYPE;
  v_map legacy_record_map%ROWTYPE;
  v_receipt_count integer;
BEGIN
  SELECT * INTO v_record FROM hr_yuzhou_production_import_record
  WHERE operation_id=p_operation_id AND phase=p_phase AND source_identity_sha256=p_source_identity_sha256;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_batch FROM migration_batch
  WHERE execution_context='production_import'
    AND production_import_operation_id=p_operation_id AND production_import_phase=p_phase;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_record.source_system IS DISTINCT FROM 'yuzhou-v10'
     OR v_record.source_table IS NULL OR btrim(v_record.source_table)=''
     OR v_record.source_pk_canonical IS DISTINCT FROM 'sha256:'||v_record.source_identity_sha256 THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_SOURCE_RECEIPT_REQUIRED';
  END IF;
  IF (v_record.disposition='quarantine' AND v_record.business_identity_sha256 IS NOT NULL)
     OR (v_record.disposition<>'quarantine' AND v_record.business_identity_sha256 IS NULL) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_BUSINESS_IDENTITY_RECEIPT_INVALID';
  END IF;

  IF (v_record.disposition='insert' AND (
        v_record.expected_target_version_before IS NOT NULL
        OR v_record.target_version_after IS NULL OR v_record.target_version_after<1))
     OR (v_record.disposition='merge' AND (
        v_record.expected_target_version_before IS NULL OR v_record.target_version_after IS NULL
        OR v_record.target_version_after<>v_record.expected_target_version_before+1))
     OR (v_record.disposition='skip_approved' AND (
        v_record.expected_target_version_before IS NULL OR v_record.target_version_after IS NULL
        OR v_record.target_version_after<>v_record.expected_target_version_before))
     OR (v_record.disposition='quarantine' AND (
        v_record.expected_target_version_before IS NOT NULL OR v_record.target_version_after IS NOT NULL)) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_CAS_VERSION_RECEIPT_INVALID';
  END IF;

  IF (v_record.disposition='insert' AND v_record.rollback_status NOT IN ('not_started','deleted_insert'))
     OR (v_record.disposition='merge' AND v_record.rollback_status NOT IN ('not_started','restored_merge'))
     OR (v_record.disposition='skip_approved' AND v_record.rollback_status NOT IN ('not_started','skip_noop'))
     OR (v_record.disposition='quarantine' AND v_record.rollback_status NOT IN ('not_started','quarantine_noop'))
     OR ((v_record.rollback_status='not_started')<>(v_record.rolled_back_at IS NULL)) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_RECORD_ROLLBACK_STATE_INVALID';
  END IF;

  SELECT count(*) INTO v_receipt_count FROM hr_yuzhou_production_import_projection_receipt
  WHERE operation_id=p_operation_id AND phase=p_phase AND source_identity_sha256=p_source_identity_sha256;
  IF v_receipt_count<>1 THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_PROJECTION_RECEIPT_REQUIRED'; END IF;

  SELECT * INTO v_receipt FROM hr_yuzhou_production_import_projection_receipt
  WHERE operation_id=p_operation_id AND phase=p_phase AND source_identity_sha256=p_source_identity_sha256;
  SELECT * INTO v_map FROM legacy_record_map WHERE id=v_receipt.legacy_record_map_id;
  IF NOT FOUND
     OR v_receipt.migration_batch_id<>v_batch.id
     OR v_map.batch_id<>v_batch.id
     OR v_map.source_system<>v_record.source_system
     OR v_map.source_table<>v_record.source_table
     OR v_map.source_pk_canonical<>v_record.source_pk_canonical
     OR v_map.source_identity_sha256<>v_record.source_identity_sha256
     OR v_map.source_row_sha256<>v_record.source_row_sha256
     OR v_map.target_table<>COALESCE(v_record.target_table,v_record.planned_target_table)
     OR v_map.target_id IS DISTINCT FROM v_record.target_id THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_PROJECTION_MAP_MISMATCH';
  END IF;
  IF v_record.rollback_status IN ('deleted_insert','restored_merge','quarantine_noop','skip_noop') THEN
    IF v_map.is_active OR v_map.mapping_status<>'rolled_back' THEN
      RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_PROJECTION_ROLLBACK_MISMATCH';
    END IF;
  ELSIF v_record.disposition='quarantine' THEN
    IF NOT v_map.is_active OR v_map.mapping_status<>'quarantined' OR v_map.target_id IS NOT NULL THEN
      RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_QUARANTINE_PROJECTION_INVALID';
    END IF;
  ELSE
    IF NOT v_map.is_active OR v_map.mapping_status NOT IN ('loaded','verified') THEN
      RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_PROJECTION_MAP_INACTIVE';
    END IF;
  END IF;
END$$;

CREATE FUNCTION hr_yuzhou_validate_production_projection_record_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    PERFORM hr_yuzhou_assert_production_projection_record(
      OLD.operation_id,OLD.phase,OLD.source_identity_sha256);
  END IF;
  IF TG_OP<>'DELETE' THEN
    PERFORM hr_yuzhou_assert_production_projection_record(
      NEW.operation_id,NEW.phase,NEW.source_identity_sha256);
  END IF;
  RETURN COALESCE(NEW,OLD);
END$$;

CREATE FUNCTION hr_yuzhou_validate_production_projection_map_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_receipt hr_yuzhou_production_import_projection_receipt%ROWTYPE;
BEGIN
  FOR v_receipt IN
    SELECT * FROM hr_yuzhou_production_import_projection_receipt
    WHERE legacy_record_map_id=COALESCE(NEW.id,OLD.id)
  LOOP
    PERFORM hr_yuzhou_assert_production_projection_record(
      v_receipt.operation_id,v_receipt.phase,v_receipt.source_identity_sha256);
  END LOOP;
  RETURN COALESCE(NEW,OLD);
END$$;

CREATE FUNCTION hr_yuzhou_validate_production_projection_batch_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_record record;
BEGIN
  IF COALESCE(NEW.execution_context,OLD.execution_context)='production_import' THEN
    FOR v_record IN
      SELECT operation_id,phase,source_identity_sha256
      FROM hr_yuzhou_production_import_record
      WHERE operation_id=COALESCE(NEW.production_import_operation_id,OLD.production_import_operation_id)
        AND phase=COALESCE(NEW.production_import_phase,OLD.production_import_phase)
    LOOP
      PERFORM hr_yuzhou_assert_production_projection_record(
        v_record.operation_id,v_record.phase,v_record.source_identity_sha256);
    END LOOP;
  END IF;
  RETURN COALESCE(NEW,OLD);
END$$;

CREATE CONSTRAINT TRIGGER trg_hr_yuzhou_prod_projection_record_exact
AFTER INSERT OR UPDATE OR DELETE ON hr_yuzhou_production_import_record
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION hr_yuzhou_validate_production_projection_record_trigger();

CREATE CONSTRAINT TRIGGER trg_hr_yuzhou_prod_projection_receipt_exact
AFTER INSERT OR UPDATE OR DELETE ON hr_yuzhou_production_import_projection_receipt
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION hr_yuzhou_validate_production_projection_record_trigger();

CREATE CONSTRAINT TRIGGER trg_hr_yuzhou_prod_projection_map_exact
AFTER INSERT OR UPDATE OR DELETE ON legacy_record_map
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION hr_yuzhou_validate_production_projection_map_trigger();

CREATE CONSTRAINT TRIGGER trg_hr_yuzhou_prod_projection_batch_exact
AFTER INSERT OR UPDATE OR DELETE ON migration_batch
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION hr_yuzhou_validate_production_projection_batch_trigger();

-- Existing archive materialization keeps an exact T0 owner pointer.  Protect
-- the referenced map in the reverse direction as well as on registry writes.
CREATE FUNCTION hr_yuzhou_guard_t0_owner_map_reverse() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM hr_legacy_identity_registry registry
    WHERE registry.owner_record_map_id=OLD.id
      AND registry.mapping_status IN ('mapped','resolved')
  ) THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'HR_LEGACY_T0_OWNER_MAP_REFERENCED';
  END IF;
  IF NOT NEW.is_active
     OR NEW.mapping_status NOT IN ('loaded','verified')
     OR ROW(NEW.source_system,NEW.source_table,NEW.source_identity_sha256,NEW.target_table,NEW.target_id)
        IS DISTINCT FROM
        ROW(OLD.source_system,OLD.source_table,OLD.source_identity_sha256,OLD.target_table,OLD.target_id) THEN
    RAISE EXCEPTION 'HR_LEGACY_T0_OWNER_MAP_REFERENCED';
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_yuzhou_t0_owner_map_reverse
BEFORE UPDATE OF is_active,mapping_status,source_system,source_table,source_identity_sha256,target_table,target_id
OR DELETE ON legacy_record_map
FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_guard_t0_owner_map_reverse();

REVOKE ALL ON hr_yuzhou_production_import_projection_receipt FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_validate_production_migration_batch() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_guard_production_record_receipt() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_assert_production_projection_record(varchar,varchar,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_validate_production_projection_record_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_validate_production_projection_map_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_validate_production_projection_batch_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_guard_t0_owner_map_reverse() FROM PUBLIC;

COMMIT;
