BEGIN;

ALTER TABLE hr_yuzhou_production_import_operation
  ADD COLUMN execution_contract_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN target_tenant_id varchar(64),
  ADD COLUMN target_park_id varchar(64),
  ADD COLUMN target_scope_sha256 char(64),
  ADD CONSTRAINT ck_hr_yuzhou_prod_import_contract_version CHECK (execution_contract_version IN (1,2)),
  ADD CONSTRAINT ck_hr_yuzhou_prod_import_v2_scope CHECK (
    (execution_contract_version=1 AND target_tenant_id IS NULL AND target_park_id IS NULL AND target_scope_sha256 IS NULL)
    OR
    (execution_contract_version=2
      AND target_tenant_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      AND target_park_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      AND target_scope_sha256 ~ '^[0-9a-f]{64}$')
  );

ALTER TABLE hr_yuzhou_production_import_phase
  ADD COLUMN payload_bundle_artifact_sha256 char(64),
  ADD COLUMN payload_bundle_sha256 char(64),
  ADD COLUMN canonicalization_version varchar(64),
  ADD CONSTRAINT ck_hr_yuzhou_prod_phase_v2_payload_shape CHECK (
    (payload_bundle_artifact_sha256 IS NULL AND payload_bundle_sha256 IS NULL AND canonicalization_version IS NULL)
    OR
    (payload_bundle_artifact_sha256 ~ '^[0-9a-f]{64}$'
      AND payload_bundle_sha256 ~ '^[0-9a-f]{64}$'
      AND canonicalization_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$')
  );

ALTER TABLE hr_yuzhou_production_import_record
  ADD COLUMN planned_target_table varchar(96),
  ADD CONSTRAINT ck_hr_yuzhou_prod_record_planned_target_allowlist CHECK (
    planned_target_table IS NULL
    OR (phase='T0' AND planned_target_table IN ('sys_org','hr_position','hr_employee'))
    OR (phase='T1' AND planned_target_table='hr_employment_event')
    OR (phase='T2' AND planned_target_table IN ('hr_contract_type','hr_contract','hr_contract_change','hr_contract_legacy_evidence'))
    OR (phase='T3' AND planned_target_table IN ('hr_attendance_import_batch','hr_attendance_symbol_rule','hr_attendance_calendar_source','hr_attendance_day','hr_insurance_policy','hr_insurance_policy_item','hr_employee_insurance_period','hr_employee_insurance_item'))
  ),
  ADD CONSTRAINT ck_hr_yuzhou_prod_record_planned_actual_target CHECK (
    target_table IS NULL OR planned_target_table IS NULL OR target_table=planned_target_table
  );

CREATE TABLE hr_yuzhou_production_import_record_dependency (
  operation_id varchar(64) NOT NULL,
  phase varchar(8) NOT NULL,
  source_identity_sha256 char(64) NOT NULL,
  dependency_role varchar(32) NOT NULL,
  depends_on_phase varchar(8) NOT NULL,
  depends_on_source_identity_sha256 char(64) NOT NULL,
  expected_target_table varchar(96) NOT NULL,
  PRIMARY KEY(operation_id,phase,source_identity_sha256,dependency_role),
  FOREIGN KEY(operation_id,phase,source_identity_sha256)
    REFERENCES hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(operation_id,depends_on_phase,depends_on_source_identity_sha256)
    REFERENCES hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT ck_hr_yuzhou_prod_dependency_identity CHECK (
    source_identity_sha256 ~ '^[0-9a-f]{64}$'
    AND depends_on_source_identity_sha256 ~ '^[0-9a-f]{64}$'
    AND dependency_role ~ '^[a-z][a-z0-9_]{1,31}$'
    AND expected_target_table ~ '^[a-z][a-z0-9_]{1,95}$'
    AND (phase,source_identity_sha256) <> (depends_on_phase,depends_on_source_identity_sha256)
  )
);
CREATE INDEX idx_hr_yuzhou_prod_dependency_target
  ON hr_yuzhou_production_import_record_dependency(operation_id,depends_on_phase,depends_on_source_identity_sha256);

CREATE FUNCTION hr_yuzhou_production_target_scope_sha256(p_tenant_id varchar,p_park_id varchar)
RETURNS char(64) LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path=public,pg_temp AS $$
  SELECT encode(digest(
    convert_to('yuzhou-hr-production-target-scope-v1','UTF8')
    || decode('00','hex') || convert_to(p_tenant_id,'UTF8')
    || decode('00','hex') || convert_to(p_park_id,'UTF8'),
    'sha256'
  ),'hex')::char(64)
$$;

CREATE FUNCTION hr_yuzhou_validate_production_import_v2_operation_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.execution_contract_version IS DISTINCT FROM OLD.execution_contract_version
    OR NEW.target_tenant_id IS DISTINCT FROM OLD.target_tenant_id
    OR NEW.target_park_id IS DISTINCT FROM OLD.target_park_id
    OR NEW.target_scope_sha256 IS DISTINCT FROM OLD.target_scope_sha256
  ) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_TARGET_SCOPE_IMMUTABLE';
  END IF;
  IF NEW.execution_contract_version = 2
     AND NEW.target_scope_sha256 <> hr_yuzhou_production_target_scope_sha256(NEW.target_tenant_id,NEW.target_park_id) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_TARGET_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_yuzhou_prod_v2_operation_scope
BEFORE INSERT OR UPDATE OF execution_contract_version,target_tenant_id,target_park_id,target_scope_sha256
ON hr_yuzhou_production_import_operation FOR EACH ROW
EXECUTE FUNCTION hr_yuzhou_validate_production_import_v2_operation_scope();

CREATE FUNCTION hr_yuzhou_validate_production_import_v2_dependency_graph() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_operation_id varchar(64) := COALESCE(NEW.operation_id,OLD.operation_id);
  v_phase varchar(8) := COALESCE(NEW.phase,OLD.phase);
  v_source_identity char(64) := COALESCE(NEW.source_identity_sha256,OLD.source_identity_sha256);
  v_record hr_yuzhou_production_import_record%ROWTYPE;
  v_contract_version smallint;
  v_total integer;
  v_invalid integer;
  v_required text[] := ARRAY[]::text[];
  v_optional text[] := ARRAY[]::text[];
BEGIN
  SELECT execution_contract_version INTO v_contract_version
  FROM hr_yuzhou_production_import_operation WHERE operation_id=v_operation_id;
  IF v_contract_version IS DISTINCT FROM 2 THEN RETURN COALESCE(NEW,OLD); END IF;

  SELECT * INTO v_record FROM hr_yuzhou_production_import_record
  WHERE operation_id=v_operation_id AND phase=v_phase AND source_identity_sha256=v_source_identity;
  IF NOT FOUND THEN RETURN COALESCE(NEW,OLD); END IF;
  IF v_record.planned_target_table IS NULL THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_V2_PLANNED_TARGET_REQUIRED'; END IF;

  CASE v_record.planned_target_table
    WHEN 'sys_org' THEN v_optional := ARRAY['parent_org:sys_org'];
    WHEN 'hr_position' THEN v_required := ARRAY['org:sys_org'];
    WHEN 'hr_employee' THEN v_required := ARRAY['primary_org:sys_org']; v_optional := ARRAY['position:hr_position'];
    WHEN 'hr_employment_event' THEN v_required := ARRAY['employee:hr_employee'];
    WHEN 'hr_contract_type' THEN NULL;
    WHEN 'hr_contract' THEN v_required := ARRAY['employee:hr_employee','contract_type:hr_contract_type'];
    WHEN 'hr_contract_change' THEN v_required := ARRAY['contract:hr_contract'];
    WHEN 'hr_contract_legacy_evidence' THEN v_required := ARRAY['contract:hr_contract'];
    WHEN 'hr_attendance_import_batch' THEN NULL;
    WHEN 'hr_attendance_symbol_rule' THEN NULL;
    WHEN 'hr_attendance_calendar_source' THEN v_required := ARRAY['import_batch:hr_attendance_import_batch'];
    WHEN 'hr_attendance_day' THEN v_required := ARRAY['calendar_source:hr_attendance_calendar_source'];
    WHEN 'hr_insurance_policy' THEN NULL;
    WHEN 'hr_insurance_policy_item' THEN v_required := ARRAY['policy:hr_insurance_policy'];
    WHEN 'hr_employee_insurance_period' THEN v_required := ARRAY['employee:hr_employee'];
    WHEN 'hr_employee_insurance_item' THEN v_required := ARRAY['period:hr_employee_insurance_period'];
    ELSE RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_V2_PLANNED_TARGET_INVALID';
  END CASE;

  SELECT count(*) INTO v_total FROM hr_yuzhou_production_import_record_dependency
  WHERE operation_id=v_operation_id AND phase=v_phase AND source_identity_sha256=v_source_identity;
  IF v_total <> cardinality(v_required) + (
    SELECT count(*) FROM hr_yuzhou_production_import_record_dependency d
    WHERE d.operation_id=v_operation_id AND d.phase=v_phase AND d.source_identity_sha256=v_source_identity
      AND (d.dependency_role||':'||d.expected_target_table)=ANY(v_optional)
  ) THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_V2_DEPENDENCY_SET_INVALID'; END IF;

  SELECT count(*) INTO v_invalid
  FROM unnest(v_required) required_dependency
  WHERE NOT EXISTS (
    SELECT 1 FROM hr_yuzhou_production_import_record_dependency d
    WHERE d.operation_id=v_operation_id AND d.phase=v_phase AND d.source_identity_sha256=v_source_identity
      AND (d.dependency_role||':'||d.expected_target_table)=required_dependency
  );
  IF v_invalid <> 0 THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_V2_DEPENDENCY_REQUIRED'; END IF;

  SELECT count(*) INTO v_invalid
  FROM hr_yuzhou_production_import_record_dependency d
  JOIN hr_yuzhou_production_import_record parent
    ON parent.operation_id=d.operation_id AND parent.phase=d.depends_on_phase
   AND parent.source_identity_sha256=d.depends_on_source_identity_sha256
  WHERE d.operation_id=v_operation_id AND d.phase=v_phase AND d.source_identity_sha256=v_source_identity
    AND (
      NOT ((d.dependency_role||':'||d.expected_target_table)=ANY(v_required||v_optional))
      OR parent.planned_target_table<>d.expected_target_table
      OR (
        v_record.disposition<>'quarantine'
        AND (parent.disposition='quarantine' OR parent.target_table<>d.expected_target_table OR parent.target_id IS NULL)
      )
    );
  IF v_invalid <> 0 THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_V2_DEPENDENCY_TARGET_INVALID'; END IF;
  RETURN COALESCE(NEW,OLD);
END$$;

CREATE FUNCTION hr_yuzhou_validate_production_import_v2_dependency_dependents() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_contract_version smallint;
  v_invalid integer;
BEGIN
  SELECT execution_contract_version INTO v_contract_version
  FROM hr_yuzhou_production_import_operation WHERE operation_id=NEW.operation_id;
  IF v_contract_version IS DISTINCT FROM 2 THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_invalid
  FROM hr_yuzhou_production_import_record_dependency d
  JOIN hr_yuzhou_production_import_record child
    ON child.operation_id=d.operation_id AND child.phase=d.phase
   AND child.source_identity_sha256=d.source_identity_sha256
  WHERE d.operation_id=NEW.operation_id
    AND d.depends_on_phase=NEW.phase
    AND d.depends_on_source_identity_sha256=NEW.source_identity_sha256
    AND (
      NEW.planned_target_table<>d.expected_target_table
      OR (
        child.disposition<>'quarantine'
        AND (NEW.disposition='quarantine' OR NEW.target_table<>d.expected_target_table OR NEW.target_id IS NULL)
      )
    );
  IF v_invalid <> 0 THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_V2_DEPENDENCY_TARGET_INVALID'; END IF;
  RETURN NEW;
END$$;

CREATE CONSTRAINT TRIGGER trg_hr_yuzhou_prod_v2_record_dependency
AFTER INSERT OR UPDATE OF planned_target_table,disposition,target_table,target_id ON hr_yuzhou_production_import_record
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION hr_yuzhou_validate_production_import_v2_dependency_graph();

CREATE CONSTRAINT TRIGGER trg_hr_yuzhou_prod_v2_dependency_record
AFTER INSERT OR UPDATE OR DELETE ON hr_yuzhou_production_import_record_dependency
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION hr_yuzhou_validate_production_import_v2_dependency_graph();

CREATE CONSTRAINT TRIGGER trg_hr_yuzhou_prod_v2_dependency_parent
AFTER UPDATE OF planned_target_table,disposition,target_table,target_id ON hr_yuzhou_production_import_record
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION hr_yuzhou_validate_production_import_v2_dependency_dependents();

CREATE FUNCTION hr_yuzhou_validate_production_import_v2_phase_payload() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_contract_version smallint;
BEGIN
  SELECT execution_contract_version INTO v_contract_version
  FROM hr_yuzhou_production_import_operation WHERE operation_id=NEW.operation_id;
  IF v_contract_version=2 AND (
    NEW.payload_bundle_artifact_sha256 IS NULL OR NEW.payload_bundle_sha256 IS NULL OR NEW.canonicalization_version IS NULL
  ) THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_V2_PAYLOAD_BINDING_REQUIRED'; END IF;
  IF v_contract_version=2 AND NEW.canonicalization_version <> 'yuzhou-production-import-canonical-json-v1' THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_V2_CANONICALIZATION_VERSION_INVALID';
  END IF;
  IF v_contract_version=1 AND (
    NEW.payload_bundle_artifact_sha256 IS NOT NULL OR NEW.payload_bundle_sha256 IS NOT NULL OR NEW.canonicalization_version IS NOT NULL
  ) THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_V1_PAYLOAD_BINDING_FORBIDDEN'; END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_yuzhou_prod_v2_phase_payload
BEFORE INSERT OR UPDATE OF operation_id,payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version
ON hr_yuzhou_production_import_phase FOR EACH ROW
EXECUTE FUNCTION hr_yuzhou_validate_production_import_v2_phase_payload();

CREATE OR REPLACE FUNCTION hr_yuzhou_validate_production_import_owner_map() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  owner_record hr_yuzhou_production_import_record%ROWTYPE;
  v_contract_version smallint;
BEGIN
  SELECT execution_contract_version INTO v_contract_version
  FROM hr_yuzhou_production_import_operation WHERE operation_id=NEW.operation_id;
  IF v_contract_version=2 THEN
    IF NEW.owner_source_identity_sha256 IS NOT NULL THEN
      RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_V2_LEGACY_OWNER_FORBIDDEN';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.phase = 'T0' THEN
    IF NEW.owner_source_identity_sha256 IS NOT NULL THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_T0_OWNER_FORBIDDEN'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.owner_source_identity_sha256 IS NULL THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_OWNER_RECORD_MAP_REQUIRED'; END IF;
  SELECT * INTO owner_record FROM hr_yuzhou_production_import_record
  WHERE operation_id=NEW.operation_id AND phase='T0' AND source_identity_sha256=NEW.owner_source_identity_sha256;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_OWNER_RECORD_MAP_REQUIRED'; END IF;
  IF NEW.disposition <> 'quarantine'
     AND (owner_record.disposition='quarantine' OR owner_record.target_table <> 'hr_employee' OR owner_record.target_id IS NULL) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_OWNER_RECORD_MAP_REQUIRED';
  END IF;
  RETURN NEW;
END$$;

CREATE FUNCTION hr_yuzhou_consume_import_authorization_v2(
  p_operation_id varchar,
  p_code_sha char(40),
  p_source_snapshot_sha256 char(64),
  p_mapping_contract_sha256 char(64),
  p_sealed_plan_sha256 char(64),
  p_target_identity_sha256 char(64),
  p_target_tenant_id varchar,
  p_target_park_id varchar,
  p_target_scope_sha256 char(64),
  p_authorization_artifact_sha256 char(64),
  p_authorization_nonce_sha256 char(64),
  p_authorization_issued_at timestamptz,
  p_authorization_expires_at timestamptz,
  p_window_starts_at timestamptz,
  p_window_ends_at timestamptz,
  p_approval_set_sha256 char(64),
  p_manifest_sha256 char(64),
  p_final_rehearsal_pair_sha256 char(64),
  p_rehearsal_a_manifest_sha256 char(64),
  p_rehearsal_b_manifest_sha256 char(64)
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_REQUIRES_SERIALIZABLE'; END IF;
  IF p_target_scope_sha256 <> hr_yuzhou_production_target_scope_sha256(p_target_tenant_id,p_target_park_id) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_TARGET_SCOPE_MISMATCH';
  END IF;
  IF now() < p_window_starts_at OR now() >= p_window_ends_at
     OR now() < p_authorization_issued_at OR now() >= p_authorization_expires_at
     OR p_authorization_issued_at < p_window_starts_at OR p_authorization_expires_at > p_window_ends_at THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_AUTH_STALE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_production_import',0));
  INSERT INTO hr_yuzhou_production_import_operation(
    operation_id,intent,status,code_sha,source_snapshot_sha256,mapping_contract_sha256,sealed_plan_sha256,
    target_identity_sha256,execution_contract_version,target_tenant_id,target_park_id,target_scope_sha256,
    authorization_artifact_sha256,authorization_nonce_sha256,authorization_issued_at,authorization_expires_at,
    window_starts_at,window_ends_at,approval_set_sha256,manifest_sha256,final_rehearsal_pair_sha256,
    rehearsal_a_manifest_sha256,rehearsal_b_manifest_sha256,phase_order
  ) VALUES (
    p_operation_id,'production_import','authorized',p_code_sha,p_source_snapshot_sha256,p_mapping_contract_sha256,p_sealed_plan_sha256,
    p_target_identity_sha256,2,p_target_tenant_id,p_target_park_id,p_target_scope_sha256,
    p_authorization_artifact_sha256,p_authorization_nonce_sha256,p_authorization_issued_at,p_authorization_expires_at,
    p_window_starts_at,p_window_ends_at,p_approval_set_sha256,p_manifest_sha256,p_final_rehearsal_pair_sha256,
    p_rehearsal_a_manifest_sha256,p_rehearsal_b_manifest_sha256,'["T0","T1","T2","T3"]'::jsonb
  );
  INSERT INTO hr_yuzhou_production_import_authorization_use(intent,operation_id,import_operation_id,authorization_artifact_sha256,authorization_nonce_sha256)
  VALUES('production_import',p_operation_id,p_operation_id,p_authorization_artifact_sha256,p_authorization_nonce_sha256);
END$$;

REVOKE ALL ON FUNCTION hr_yuzhou_production_target_scope_sha256(varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_validate_production_import_v2_operation_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_validate_production_import_v2_dependency_graph() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_validate_production_import_v2_dependency_dependents() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_validate_production_import_v2_phase_payload() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_consume_import_authorization_v2(varchar,char,char,char,char,char,varchar,varchar,char,char,char,timestamptz,timestamptz,timestamptz,timestamptz,char,char,char,char,char) FROM PUBLIC;
REVOKE ALL ON hr_yuzhou_production_import_record_dependency FROM PUBLIC;

COMMIT;
