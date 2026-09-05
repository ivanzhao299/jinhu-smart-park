BEGIN;

-- Forward-only: preserve 000292 and all existing table, authorization and graph constraints.
CREATE OR REPLACE FUNCTION hr_yuzhou_validate_production_import_v2_dependency_graph() RETURNS trigger
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
    WHEN 'hr_employee_profile' THEN IF v_record.disposition='quarantine' THEN v_optional := ARRAY['employee:hr_employee']; ELSE v_required := ARRAY['employee:hr_employee']; END IF;
    WHEN 'hr_employee_family' THEN IF v_record.disposition='quarantine' THEN v_optional := ARRAY['employee:hr_employee']; ELSE v_required := ARRAY['employee:hr_employee']; END IF;
    WHEN 'hr_employee_skill' THEN IF v_record.disposition='quarantine' THEN v_optional := ARRAY['employee:hr_employee']; ELSE v_required := ARRAY['employee:hr_employee']; END IF;
    WHEN 'hr_employee_credential' THEN IF v_record.disposition='quarantine' THEN v_optional := ARRAY['employee:hr_employee']; ELSE v_required := ARRAY['employee:hr_employee']; END IF;
    WHEN 'hr_custom_field_definition' THEN NULL;
    WHEN 'hr_employee_custom_value' THEN
      IF v_record.disposition='quarantine' THEN
        v_optional := ARRAY['employee:hr_employee','custom_field_definition:hr_custom_field_definition'];
      ELSE
        v_required := ARRAY['employee:hr_employee','custom_field_definition:hr_custom_field_definition'];
      END IF;
    ELSE RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_V2_PLANNED_TARGET_INVALID';
  END CASE;

  -- Missing parents are the reason for quarantine, not a reason to lose the source.
  -- Supplied roles/tables/parents remain validated below and by existing graph FKs.
  IF v_record.disposition='quarantine' THEN
    v_optional := v_optional || v_required;
    v_required := ARRAY[]::text[];
  END IF;

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

COMMIT;

