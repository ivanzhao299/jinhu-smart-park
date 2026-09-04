BEGIN;

-- dbo.defs contains useful declarative field metadata alongside sqltext and
-- crosssql fragments.  The modern model keeps only verifiable declarative
-- values plus one-way fingerprints/presence flags for executable material.
-- There is deliberately no column capable of retaining the original SQL.
ALTER TABLE hr_custom_field_definition
  ADD COLUMN legacy_definition_id varchar(128),
  ADD COLUMN legacy_datatype varchar(64),
  ADD COLUMN legacy_group_id varchar(128),
  ADD COLUMN legacy_sort_order integer,
  ADD COLUMN legacy_nullable boolean,
  ADD COLUMN legacy_description_d_present boolean,
  ADD COLUMN legacy_description_d_sha256 char(64),
  ADD COLUMN legacy_sqltext_present boolean,
  ADD COLUMN legacy_sqltext_sha256 char(64),
  ADD COLUMN legacy_crosssql_present boolean,
  ADD COLUMN legacy_crosssql_sha256 char(64),
  ADD COLUMN base_classification varchar(16),
  ADD COLUMN legacy_rule_classification varchar(24),
  ADD CONSTRAINT ck_hr_custom_field_legacy_metadata_origin CHECK (
    origin='legacy'
    OR num_nonnulls(
      legacy_definition_id,legacy_datatype,legacy_group_id,legacy_sort_order,
      legacy_nullable,legacy_description_d_present,legacy_description_d_sha256,
      legacy_sqltext_present,legacy_sqltext_sha256,
      legacy_crosssql_present,legacy_crosssql_sha256,base_classification,legacy_rule_classification
    )=0
  ),
  ADD CONSTRAINT ck_hr_custom_field_legacy_sort_order CHECK (legacy_sort_order IS NULL OR legacy_sort_order>=0),
  ADD CONSTRAINT ck_hr_custom_field_legacy_nullable_unproven CHECK (legacy_nullable IS NULL),
  ADD CONSTRAINT ck_hr_custom_field_legacy_description_d_fingerprint CHECK (
    legacy_description_d_present IS NULL
    OR (legacy_description_d_present AND legacy_description_d_sha256~'^[0-9a-f]{64}$')
    OR (NOT legacy_description_d_present AND legacy_description_d_sha256 IS NULL)
  ),
  ADD CONSTRAINT ck_hr_custom_field_legacy_sqltext_fingerprint CHECK (
    legacy_sqltext_present IS NULL
    OR (legacy_sqltext_present AND legacy_sqltext_sha256~'^[0-9a-f]{64}$')
    OR (NOT legacy_sqltext_present AND legacy_sqltext_sha256 IS NULL)
  ),
  ADD CONSTRAINT ck_hr_custom_field_legacy_crosssql_fingerprint CHECK (
    legacy_crosssql_present IS NULL
    OR (legacy_crosssql_present AND legacy_crosssql_sha256~'^[0-9a-f]{64}$')
    OR (NOT legacy_crosssql_present AND legacy_crosssql_sha256 IS NULL)
  ),
  ADD CONSTRAINT ck_hr_custom_field_legacy_rule_classification CHECK (
    legacy_rule_classification IS NULL
    OR legacy_rule_classification IN('declarative','inert','review_required')
  ),
  ADD CONSTRAINT ck_hr_custom_field_base_classification CHECK (
    base_classification IS NULL OR (base_classification IN('text','numeric','date') AND base_classification=value_type)
  );

CREATE UNIQUE INDEX uq_hr_custom_field_legacy_definition_id
  ON hr_custom_field_definition(tenant_id,park_id,source_system,legacy_definition_id)
  WHERE origin='legacy' AND legacy_definition_id IS NOT NULL AND is_deleted=false;

CREATE TABLE hr_custom_field_legacy_logic_fingerprint (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  definition_id uuid NOT NULL,
  legacy_column varchar(32) NOT NULL,
  classification varchar(40) NOT NULL,
  execution varchar(16) NOT NULL DEFAULT 'forbidden',
  source_present boolean NOT NULL,
  is_source_null boolean NOT NULL,
  source_value_sha256 char(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_hr_custom_field_logic_definition
    FOREIGN KEY(tenant_id,park_id,definition_id)
    REFERENCES hr_custom_field_definition(tenant_id,park_id,id),
  CONSTRAINT uq_hr_custom_field_logic_column UNIQUE(tenant_id,park_id,definition_id,legacy_column),
  CONSTRAINT ck_hr_custom_field_logic_execution CHECK(execution='forbidden'),
  CONSTRAINT ck_hr_custom_field_logic_presence CHECK(
    (source_present AND NOT is_source_null AND source_value_sha256~'^[0-9a-f]{64}$')
    OR (NOT source_present AND is_source_null AND source_value_sha256 IS NULL)
  ),
  CONSTRAINT ck_hr_custom_field_logic_classification CHECK(
    (legacy_column='description_d' AND classification='presentation_expression') OR
    (legacy_column='sqltext' AND classification='legacy_sql_expression') OR
    (legacy_column='flag' AND classification='legacy_behavior_flag') OR
    (legacy_column='crosssql' AND classification='legacy_cross_lookup_sql') OR
    (legacy_column='crosscolselectsql' AND classification='legacy_cross_column_sql') OR
    (legacy_column='crossrowselectsql' AND classification='legacy_cross_row_sql') OR
    (legacy_column='crosswhere' AND classification='legacy_cross_filter') OR
    (legacy_column='querywhere' AND classification='legacy_query_filter') OR
    (legacy_column='ascount' AND classification='legacy_aggregate_flag') OR
    (legacy_column='ascount2' AND classification='legacy_secondary_aggregate_flag')
  )
);
CREATE INDEX ix_hr_custom_field_logic_definition
  ON hr_custom_field_legacy_logic_fingerprint(tenant_id,park_id,definition_id);

CREATE OR REPLACE FUNCTION hr_guard_legacy_custom_field_logic() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE allowed boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.hr_custom_field_definition definition
    JOIN public.migration_batch batch ON batch.id=definition.migration_batch_id
    WHERE (definition.tenant_id,definition.park_id,definition.id)=(OLD.tenant_id,OLD.park_id,OLD.definition_id)
      AND batch.run_id=current_setting('yuzhou.custom_field_rollback',true)
      AND batch.target_database=current_database()
      AND batch.status='succeeded'
  ) INTO allowed;
  IF NOT COALESCE(allowed,false) THEN RAISE EXCEPTION 'HR_LEGACY_CUSTOM_FIELD_LOGIC_IMMUTABLE'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_hr_custom_field_logic_guard
  BEFORE UPDATE OR DELETE ON hr_custom_field_legacy_logic_fingerprint
  FOR EACH ROW EXECUTE FUNCTION hr_guard_legacy_custom_field_logic();
REVOKE ALL ON FUNCTION hr_guard_legacy_custom_field_logic() FROM PUBLIC;

-- Review state is separate from the immutable imported definition.  This
-- allows governed human decisions without mutating source evidence.
CREATE TABLE hr_custom_field_legacy_review (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  definition_id uuid NOT NULL,
  classification_override varchar(24),
  review_status varchar(16) NOT NULL DEFAULT 'pending',
  coverage_status varchar(16) NOT NULL DEFAULT 'unmapped',
  target_field_key varchar(128),
  review_reason_code varchar(32),
  reviewed_by uuid,
  reviewed_at timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_hr_custom_field_legacy_review_definition
    FOREIGN KEY(tenant_id,park_id,definition_id)
    REFERENCES hr_custom_field_definition(tenant_id,park_id,id),
  CONSTRAINT ck_hr_custom_field_review_classification CHECK (
    classification_override IS NULL
    OR classification_override IN('declarative','inert','review_required')
  ),
  CONSTRAINT ck_hr_custom_field_review_status CHECK (review_status IN('pending','approved','rejected')),
  CONSTRAINT ck_hr_custom_field_review_reason CHECK (
    review_reason_code IS NULL
    OR review_reason_code IN(
      'confirmed_declarative','confirmed_inert','requires_remediation',
      'mapped_to_modern_field','excluded_obsolete','insufficient_evidence'
    )
  ),
  CONSTRAINT ck_hr_custom_field_coverage_status CHECK (coverage_status IN('unmapped','mapped','excluded','blocked')),
  CONSTRAINT ck_hr_custom_field_target_key CHECK (
    (coverage_status='mapped' AND target_field_key~'^[a-z][a-z0-9_.-]{0,127}$')
    OR (coverage_status<>'mapped' AND target_field_key IS NULL)
  ),
  CONSTRAINT ck_hr_custom_field_reviewer CHECK (
    (review_status='pending' AND classification_override IS NULL AND coverage_status='unmapped'
      AND target_field_key IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason_code IS NULL)
    OR (review_status='approved' AND classification_override IS NOT NULL
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason_code IS NOT NULL)
    OR (review_status='rejected' AND classification_override IS NOT NULL AND coverage_status='blocked'
      AND target_field_key IS NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason_code IS NOT NULL)
  )
);
CREATE UNIQUE INDEX uq_hr_custom_field_legacy_review_active
  ON hr_custom_field_legacy_review(tenant_id,park_id,definition_id)
  WHERE is_deleted=false;
CREATE INDEX ix_hr_custom_field_legacy_review_queue
  ON hr_custom_field_legacy_review(tenant_id,park_id,review_status,coverage_status,definition_id)
  WHERE is_deleted=false;

-- Review records are governance evidence: remove the ability to place free
-- text (including copied legacy SQL) in their generic remark column.
ALTER TABLE hr_custom_field_legacy_review
  ADD CONSTRAINT ck_hr_custom_field_review_no_remark CHECK (remark IS NULL);

-- Extend the production record contract only after the normalized logic table
-- exists. A logic fingerprint is a first-class T5 child of its exact imported
-- definition; it is never accepted as a free-standing or executable rule.
ALTER TABLE hr_yuzhou_production_import_record
  DROP CONSTRAINT ck_hr_yuzhou_prod_record_target_allowlist,
  ADD CONSTRAINT ck_hr_yuzhou_prod_record_target_allowlist CHECK (
    target_table IS NULL
    OR (phase='T0' AND target_table IN ('sys_org','hr_position','hr_employee'))
    OR (phase='T1' AND target_table='hr_employment_event')
    OR (phase='T2' AND target_table IN ('hr_contract_type','hr_contract','hr_contract_change','hr_contract_legacy_evidence'))
    OR (phase='T3' AND target_table IN ('hr_attendance_import_batch','hr_attendance_symbol_rule','hr_attendance_calendar_source','hr_attendance_day','hr_insurance_policy','hr_insurance_policy_item','hr_employee_insurance_period','hr_employee_insurance_item'))
    OR (phase='T5' AND target_table IN ('hr_employee_profile','hr_employee_family','hr_employee_skill','hr_employee_credential','hr_custom_field_definition','hr_custom_field_legacy_logic_fingerprint','hr_employee_custom_value'))
  ),
  DROP CONSTRAINT ck_hr_yuzhou_prod_record_planned_target_allowlist,
  ADD CONSTRAINT ck_hr_yuzhou_prod_record_planned_target_allowlist CHECK (
    planned_target_table IS NULL
    OR (phase='T0' AND planned_target_table IN ('sys_org','hr_position','hr_employee'))
    OR (phase='T1' AND planned_target_table='hr_employment_event')
    OR (phase='T2' AND planned_target_table IN ('hr_contract_type','hr_contract','hr_contract_change','hr_contract_legacy_evidence'))
    OR (phase='T3' AND planned_target_table IN ('hr_attendance_import_batch','hr_attendance_symbol_rule','hr_attendance_calendar_source','hr_attendance_day','hr_insurance_policy','hr_insurance_policy_item','hr_employee_insurance_period','hr_employee_insurance_item'))
    OR (phase='T5' AND planned_target_table IN ('hr_employee_profile','hr_employee_family','hr_employee_skill','hr_employee_credential','hr_custom_field_definition','hr_custom_field_legacy_logic_fingerprint','hr_employee_custom_value'))
  );

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
    WHEN 'hr_custom_field_legacy_logic_fingerprint' THEN v_required := ARRAY['custom_field_definition:hr_custom_field_definition'];
    WHEN 'hr_employee_custom_value' THEN
      IF v_record.disposition='quarantine' THEN
        v_optional := ARRAY['employee:hr_employee','custom_field_definition:hr_custom_field_definition'];
      ELSE
        v_required := ARRAY['employee:hr_employee','custom_field_definition:hr_custom_field_definition'];
      END IF;
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

COMMIT;
