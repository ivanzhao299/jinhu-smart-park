BEGIN;

-- T5 is the lightweight, non-file employee supplement slice.  It shares the
-- production-import transaction and record-map rules with T0-T3.  Its table
-- allowlist is intentionally limited to the four employee supplement tables.
ALTER TABLE hr_yuzhou_production_import_phase
  DROP CONSTRAINT ck_hr_yuzhou_prod_phase_identity,
  ADD CONSTRAINT ck_hr_yuzhou_prod_phase_identity CHECK (
    (phase,phase_ordinal) IN (('T0',0),('T1',1),('T2',2),('T3',3),('T5',4))
    AND source_batch_manifest_sha256 ~ '^[0-9a-f]{64}$'
    AND before_canonical_sha256 ~ '^[0-9a-f]{64}$'
    AND (after_canonical_sha256 IS NULL OR after_canonical_sha256 ~ '^[0-9a-f]{64}$')
    AND (rollback_canonical_sha256 IS NULL OR rollback_canonical_sha256 ~ '^[0-9a-f]{64}$')
  );

ALTER TABLE hr_yuzhou_production_import_record
  DROP CONSTRAINT ck_hr_yuzhou_prod_record_target_allowlist,
  ADD CONSTRAINT ck_hr_yuzhou_prod_record_target_allowlist CHECK (
    target_table IS NULL
    OR (phase='T0' AND target_table IN ('sys_org','hr_position','hr_employee'))
    OR (phase='T1' AND target_table='hr_employment_event')
    OR (phase='T2' AND target_table IN ('hr_contract_type','hr_contract','hr_contract_change','hr_contract_legacy_evidence'))
    OR (phase='T3' AND target_table IN ('hr_attendance_import_batch','hr_attendance_symbol_rule','hr_attendance_calendar_source','hr_attendance_day','hr_insurance_policy','hr_insurance_policy_item','hr_employee_insurance_period','hr_employee_insurance_item'))
    OR (phase='T5' AND target_table IN ('hr_employee_profile','hr_employee_family','hr_employee_skill','hr_employee_credential'))
  ),
  DROP CONSTRAINT ck_hr_yuzhou_prod_record_planned_target_allowlist,
  ADD CONSTRAINT ck_hr_yuzhou_prod_record_planned_target_allowlist CHECK (
    planned_target_table IS NULL
    OR (phase='T0' AND planned_target_table IN ('sys_org','hr_position','hr_employee'))
    OR (phase='T1' AND planned_target_table='hr_employment_event')
    OR (phase='T2' AND planned_target_table IN ('hr_contract_type','hr_contract','hr_contract_change','hr_contract_legacy_evidence'))
    OR (phase='T3' AND planned_target_table IN ('hr_attendance_import_batch','hr_attendance_symbol_rule','hr_attendance_calendar_source','hr_attendance_day','hr_insurance_policy','hr_insurance_policy_item','hr_employee_insurance_period','hr_employee_insurance_item'))
    OR (phase='T5' AND planned_target_table IN ('hr_employee_profile','hr_employee_family','hr_employee_skill','hr_employee_credential'))
  );

ALTER TABLE migration_batch
  DROP CONSTRAINT ck_migration_batch_execution_context,
  ADD CONSTRAINT ck_migration_batch_execution_context CHECK (
    (execution_context='lab_rehearsal'
      AND target_database ~ '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$'
      AND production_import_operation_id IS NULL
      AND production_import_phase IS NULL)
    OR
    (execution_context='production_import'
      AND btrim(target_database)<>''
      AND production_import_operation_id IS NOT NULL
      AND production_import_phase IN ('T0','T1','T2','T3','T5'))
  );

COMMIT;
