BEGIN;

-- Persist the scoped audit actor on the production T5 migration batch.  This
-- makes the low-level writer's actor binding queryable without placing any
-- personal attributes in the migration receipt.
ALTER TABLE migration_batch
  ADD COLUMN production_import_actor_id uuid;

-- A production custom-field delete is allowed only in the exact transaction
-- that bound a consumed, independent rollback authorization.  A session GUC
-- or a caller-supplied run id is deliberately insufficient.
ALTER TABLE hr_yuzhou_production_import_rollback_operation
  ADD COLUMN t5_nonfile_executor_actor_id uuid,
  ADD COLUMN t5_nonfile_execution_xid xid8,
  ADD CONSTRAINT ck_hr_yuzhou_prod_rollback_t5_executor CHECK (
    (t5_nonfile_executor_actor_id IS NULL AND t5_nonfile_execution_xid IS NULL)
    OR
    (t5_nonfile_executor_actor_id IS NOT NULL AND t5_nonfile_execution_xid IS NOT NULL)
  );

CREATE FUNCTION hr_yuzhou_assert_t5_nonfile_writer_context(
  p_operation_id varchar,
  p_target_identity_sha256 char(64),
  p_target_tenant_id varchar,
  p_target_park_id varchar,
  p_target_scope_sha256 char(64),
  p_actor_id uuid,
  p_code_sha char(40),
  p_source_snapshot_sha256 char(64),
  p_mapping_contract_sha256 char(64),
  p_record_count bigint
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_REQUIRES_SERIALIZABLE';
  END IF;
  IF p_target_scope_sha256 <> hr_yuzhou_production_target_scope_sha256(p_target_tenant_id,p_target_park_id) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_TARGET_SCOPE_MISMATCH';
  END IF;

  PERFORM 1
  FROM hr_yuzhou_production_import_operation operation
  JOIN hr_yuzhou_production_import_phase phase
    ON phase.operation_id=operation.operation_id AND phase.phase='T5'
  JOIN sys_user actor
    ON actor.id=p_actor_id
   AND actor.tenant_id::text=operation.target_tenant_id
   AND actor.park_id::text=operation.target_park_id
   AND actor.is_enabled=true AND actor.status='enabled' AND actor.is_deleted=false
  WHERE operation.operation_id=p_operation_id
    AND operation.execution_contract_version=2
    AND operation.status='running' AND operation.current_phase='T5'
    AND operation.target_identity_sha256=p_target_identity_sha256
    AND operation.target_tenant_id=p_target_tenant_id
    AND operation.target_park_id=p_target_park_id
    AND operation.target_scope_sha256=p_target_scope_sha256
    AND operation.code_sha=p_code_sha
    AND operation.source_snapshot_sha256=p_source_snapshot_sha256
    AND operation.mapping_contract_sha256=p_mapping_contract_sha256
    AND phase.status='running' AND phase.planned_record_count=p_record_count
  FOR SHARE OF operation,phase,actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_T5_WRITER_CONTEXT_INVALID';
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION hr_yuzhou_validate_t5_nonfile_batch_actor() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.production_import_actor_id IS DISTINCT FROM OLD.production_import_actor_id THEN
      RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_T5_ACTOR_IMMUTABLE';
    END IF;
  END IF;
  IF NEW.execution_context='production_import' AND NEW.production_import_phase='T5' THEN
    IF NEW.production_import_actor_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM hr_yuzhou_production_import_operation operation
      JOIN sys_user actor
        ON actor.id=NEW.production_import_actor_id
       AND actor.tenant_id::text=operation.target_tenant_id
       AND actor.park_id::text=operation.target_park_id
       AND actor.is_enabled=true AND actor.status='enabled' AND actor.is_deleted=false
      WHERE operation.operation_id=NEW.production_import_operation_id
        AND operation.execution_contract_version=2
        AND operation.status='running' AND operation.current_phase='T5'
        AND operation.source_snapshot_sha256=NEW.source_snapshot_sha256
    ) THEN
      RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_T5_ACTOR_SCOPE_INVALID';
    END IF;
  ELSIF NEW.production_import_actor_id IS NOT NULL THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_T5_ACTOR_CONTEXT_INVALID';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_hr_yuzhou_prod_t5_batch_actor
BEFORE INSERT OR UPDATE OF production_import_actor_id,execution_context,production_import_operation_id,production_import_phase
ON migration_batch FOR EACH ROW
EXECUTE FUNCTION hr_yuzhou_validate_t5_nonfile_batch_actor();

CREATE FUNCTION hr_yuzhou_bind_t5_nonfile_rollback_context(
  p_rollback_operation_id varchar,
  p_import_operation_id varchar,
  p_target_identity_sha256 char(64),
  p_target_tenant_id varchar,
  p_target_park_id varchar,
  p_target_scope_sha256 char(64),
  p_actor_id uuid
) RETURNS TABLE(batch_id uuid,run_id varchar)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_batch_id uuid;
  v_run_id varchar(64);
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_REQUIRES_SERIALIZABLE';
  END IF;
  IF p_target_scope_sha256 <> hr_yuzhou_production_target_scope_sha256(p_target_tenant_id,p_target_park_id) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_TARGET_SCOPE_MISMATCH';
  END IF;

  SELECT batch.id,batch.run_id INTO v_batch_id,v_run_id
  FROM hr_yuzhou_production_import_rollback_operation rollback_operation
  JOIN hr_yuzhou_production_import_operation operation
    ON operation.operation_id=rollback_operation.import_operation_id
  JOIN hr_yuzhou_production_import_authorization_use authorization_use
    ON authorization_use.intent='production_import_rollback'
   AND authorization_use.operation_id=rollback_operation.rollback_operation_id
   AND authorization_use.import_operation_id=operation.operation_id
   AND authorization_use.authorization_artifact_sha256=rollback_operation.authorization_artifact_sha256
   AND authorization_use.authorization_nonce_sha256=rollback_operation.authorization_nonce_sha256
  JOIN hr_yuzhou_production_import_phase phase
    ON phase.operation_id=operation.operation_id AND phase.phase='T5'
  JOIN migration_batch batch
    ON batch.production_import_operation_id=operation.operation_id
   AND batch.production_import_phase='T5'
   AND batch.execution_context='production_import'
  JOIN sys_user actor
    ON actor.id=p_actor_id
   AND actor.tenant_id::text=operation.target_tenant_id
   AND actor.park_id::text=operation.target_park_id
   AND actor.is_enabled=true AND actor.status='enabled' AND actor.is_deleted=false
  WHERE rollback_operation.rollback_operation_id=p_rollback_operation_id
    AND rollback_operation.import_operation_id=p_import_operation_id
    AND rollback_operation.status='running'
    AND now()>=rollback_operation.authorization_issued_at
    AND now()<rollback_operation.authorization_expires_at
    AND rollback_operation.target_identity_sha256=p_target_identity_sha256
    AND rollback_operation.target_identity_sha256=operation.target_identity_sha256
    AND rollback_operation.sealed_plan_sha256=operation.sealed_plan_sha256
    AND operation.execution_contract_version=2
    AND operation.status='succeeded' AND operation.current_phase='T5'
    AND operation.target_tenant_id=p_target_tenant_id
    AND operation.target_park_id=p_target_park_id
    AND operation.target_scope_sha256=p_target_scope_sha256
    AND phase.status='rolling_back'
    AND batch.status='succeeded'
    AND batch.run_id=operation.operation_id||'-t5'
    AND batch.target_database=current_database()
    AND batch.production_import_actor_id=p_actor_id
  FOR UPDATE OF rollback_operation,operation,phase,batch,actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_T5_ROLLBACK_AUTH_INVALID';
  END IF;

  UPDATE hr_yuzhou_production_import_rollback_operation rollback_operation
  SET t5_nonfile_executor_actor_id=p_actor_id,
      t5_nonfile_execution_xid=pg_current_xact_id()
  WHERE rollback_operation.rollback_operation_id=p_rollback_operation_id
    AND (
      rollback_operation.t5_nonfile_execution_xid IS NULL
      OR (
        rollback_operation.t5_nonfile_execution_xid=pg_current_xact_id()
        AND rollback_operation.t5_nonfile_executor_actor_id=p_actor_id
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_T5_ROLLBACK_TRANSACTION_MISMATCH';
  END IF;

  RETURN QUERY SELECT v_batch_id,v_run_id;
END $$;

-- Preserve the isolated-lab run-id marker for lab-only cleanup, while making
-- the production branch depend on the consumed rollback authorization and the
-- transaction binding established above.
CREATE FUNCTION hr_yuzhou_t5_nonfile_rollback_context_allowed(p_batch_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.migration_batch batch
    WHERE batch.id=p_batch_id
      AND batch.target_database=current_database()
      AND batch.status='succeeded'
      AND (
        (
          batch.execution_context='lab_rehearsal'
          AND batch.target_database~'^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$'
          AND batch.run_id=current_setting('yuzhou.custom_field_rollback',true)
        )
        OR
        (
          batch.execution_context='production_import'
          AND batch.production_import_phase='T5'
          AND batch.run_id=batch.production_import_operation_id||'-t5'
          AND EXISTS (
            SELECT 1
            FROM public.hr_yuzhou_production_import_operation operation
            JOIN public.hr_yuzhou_production_import_phase phase
              ON phase.operation_id=operation.operation_id AND phase.phase='T5'
            JOIN public.hr_yuzhou_production_import_rollback_operation rollback_operation
              ON rollback_operation.import_operation_id=operation.operation_id
            JOIN public.hr_yuzhou_production_import_authorization_use authorization_use
              ON authorization_use.intent='production_import_rollback'
             AND authorization_use.operation_id=rollback_operation.rollback_operation_id
             AND authorization_use.import_operation_id=operation.operation_id
             AND authorization_use.authorization_artifact_sha256=rollback_operation.authorization_artifact_sha256
             AND authorization_use.authorization_nonce_sha256=rollback_operation.authorization_nonce_sha256
            JOIN public.sys_user actor
              ON actor.id=rollback_operation.t5_nonfile_executor_actor_id
             AND actor.tenant_id::text=operation.target_tenant_id
             AND actor.park_id::text=operation.target_park_id
             AND actor.is_enabled=true AND actor.status='enabled' AND actor.is_deleted=false
            WHERE operation.operation_id=batch.production_import_operation_id
              AND operation.execution_contract_version=2
              AND operation.status='succeeded' AND operation.current_phase='T5'
              AND operation.target_identity_sha256=rollback_operation.target_identity_sha256
              AND operation.sealed_plan_sha256=rollback_operation.sealed_plan_sha256
              AND operation.target_scope_sha256=public.hr_yuzhou_production_target_scope_sha256(operation.target_tenant_id,operation.target_park_id)
              AND phase.status='rolling_back'
              AND rollback_operation.status='running'
              AND now()>=rollback_operation.authorization_issued_at
              AND now()<rollback_operation.authorization_expires_at
              AND rollback_operation.t5_nonfile_executor_actor_id=batch.production_import_actor_id
              AND rollback_operation.t5_nonfile_execution_xid=pg_current_xact_id()
          )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION hr_guard_legacy_custom_field() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE allowed boolean;
BEGIN
  IF OLD.origin='legacy' THEN
    SELECT public.hr_yuzhou_t5_nonfile_rollback_context_allowed(OLD.migration_batch_id) INTO allowed;
  END IF;
  IF OLD.origin='legacy' AND NOT COALESCE(allowed,false) THEN
    RAISE EXCEPTION 'HR_LEGACY_CUSTOM_FIELD_IMMUTABLE';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION hr_guard_legacy_custom_field_logic() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE allowed boolean;
BEGIN
  SELECT public.hr_yuzhou_t5_nonfile_rollback_context_allowed(definition.migration_batch_id) INTO allowed
  FROM public.hr_custom_field_definition definition
  WHERE (definition.tenant_id,definition.park_id,definition.id)=(OLD.tenant_id,OLD.park_id,OLD.definition_id);
  IF NOT COALESCE(allowed,false) THEN
    RAISE EXCEPTION 'HR_LEGACY_CUSTOM_FIELD_LOGIC_IMMUTABLE';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

REVOKE ALL ON FUNCTION hr_yuzhou_assert_t5_nonfile_writer_context(varchar,char,varchar,varchar,char,uuid,char,char,char,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_validate_t5_nonfile_batch_actor() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_bind_t5_nonfile_rollback_context(varchar,varchar,char,varchar,varchar,char,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_t5_nonfile_rollback_context_allowed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_guard_legacy_custom_field() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_guard_legacy_custom_field_logic() FROM PUBLIC;

COMMIT;
