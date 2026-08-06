BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- B0_CATALOG_OBJECTS_START
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.actual_hash
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.anomaly_kind
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.checkpoint_id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.details_redacted
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.detected_at
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.expected_hash
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.last_transition_by
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.last_transition_reason
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.resolution_reference
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.resolved_at
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.resolved_by
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.run_id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.source_key
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.source_type
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.source_version
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.status
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly.version
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly_audit.actor_id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly_audit.anomaly_id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly_audit.expected_version
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly_audit.from_status
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly_audit.id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly_audit.occurred_at
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly_audit.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly_audit.reason
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly_audit.resulting_version
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly_audit.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_anomaly_audit.to_status
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.anomaly_count
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.artifact_hash
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.artifact_uri
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.checkpoint_id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.contract_hash
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.evidence_kind
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.generated_at
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.generated_by
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.max_source_key
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.migration_set_hash
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.min_source_key
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.row_count
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.run_id
-- B0_CATALOG_OBJECT column	public.biz_property_migration_evidence.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.anomaly_count
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.checkpoint_key
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.checkpoint_kind
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.checkpoint_version
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.cursor_value
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.evidence_hash
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.id
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.last_run_id
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.status
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.updated_at
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.updated_by
-- B0_CATALOG_OBJECT column	public.biz_property_runtime_checkpoint.version
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.adapter_version
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.approval_reference
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.contract_hash
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.control_key
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.control_kind
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.control_mode
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.create_time
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.disabled_reason
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.enabled
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.enabled_at
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.enabled_by
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.id
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.park_id
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.target
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.tenant_id
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.update_time
-- B0_CATALOG_OBJECT column	public.sys_property_runtime_control.version
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly.biz_property_migration_anomaly_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_details
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_hashes
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_kind
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_resolution
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_status
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_transition_actor
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_version
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly.fk_biz_property_migration_anomaly_checkpoint
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly.uq_biz_property_migration_anomaly_run_source
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly.uq_biz_property_migration_anomaly_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly_audit.ck_biz_property_migration_anomaly_audit_from
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly_audit.ck_biz_property_migration_anomaly_audit_reason
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly_audit.ck_biz_property_migration_anomaly_audit_to
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly_audit.ck_biz_property_migration_anomaly_audit_version
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly_audit.fk_biz_property_migration_anomaly_audit_anomaly
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly_audit.pk_biz_property_migration_anomaly_audit
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly_audit.uq_biz_property_migration_anomaly_audit_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_anomaly_audit.uq_biz_property_migration_anomaly_audit_version
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_evidence.biz_property_migration_evidence_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_evidence.ck_biz_property_migration_evidence_counts
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_evidence.ck_biz_property_migration_evidence_hashes
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_evidence.ck_biz_property_migration_evidence_kind
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_evidence.fk_biz_property_migration_evidence_checkpoint
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_evidence.uq_biz_property_migration_evidence_run_kind
-- B0_CATALOG_OBJECT constraint	public.biz_property_migration_evidence.uq_biz_property_migration_evidence_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_runtime_checkpoint.biz_property_runtime_checkpoint_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_runtime_checkpoint.ck_biz_property_runtime_checkpoint_counts
-- B0_CATALOG_OBJECT constraint	public.biz_property_runtime_checkpoint.ck_biz_property_runtime_checkpoint_evidence
-- B0_CATALOG_OBJECT constraint	public.biz_property_runtime_checkpoint.ck_biz_property_runtime_checkpoint_kind
-- B0_CATALOG_OBJECT constraint	public.biz_property_runtime_checkpoint.ck_biz_property_runtime_checkpoint_status
-- B0_CATALOG_OBJECT constraint	public.biz_property_runtime_checkpoint.uq_biz_property_runtime_checkpoint_key
-- B0_CATALOG_OBJECT constraint	public.biz_property_runtime_checkpoint.uq_biz_property_runtime_checkpoint_scope_id
-- B0_CATALOG_OBJECT constraint	public.sys_property_runtime_control.ck_sys_property_runtime_control_disabled
-- B0_CATALOG_OBJECT constraint	public.sys_property_runtime_control.ck_sys_property_runtime_control_hash
-- B0_CATALOG_OBJECT constraint	public.sys_property_runtime_control.ck_sys_property_runtime_control_kind
-- B0_CATALOG_OBJECT constraint	public.sys_property_runtime_control.ck_sys_property_runtime_control_mode
-- B0_CATALOG_OBJECT constraint	public.sys_property_runtime_control.ck_sys_property_runtime_control_target
-- B0_CATALOG_OBJECT constraint	public.sys_property_runtime_control.ck_sys_property_runtime_control_version
-- B0_CATALOG_OBJECT constraint	public.sys_property_runtime_control.sys_property_runtime_control_pkey
-- B0_CATALOG_OBJECT constraint	public.sys_property_runtime_control.uq_sys_property_runtime_control_key
-- B0_CATALOG_OBJECT constraint	public.sys_property_runtime_control.uq_sys_property_runtime_control_scope_id
-- B0_CATALOG_OBJECT function	public.fn_guard_property_migration_anomaly_transition()
-- B0_CATALOG_OBJECT function	public.fn_property_migration_immutable()
-- B0_CATALOG_OBJECT function	public.fn_require_property_migration_anomaly_audit()
-- B0_CATALOG_OBJECT function	public.fn_transition_property_migration_anomaly(p_tenant_id character varying, p_park_id character varying, p_anomaly_id uuid, p_expected_version integer, p_to_status character varying, p_actor_id uuid, p_reason character varying, p_resolution_reference character varying)
-- B0_CATALOG_OBJECT index	public.biz_property_migration_anomaly_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_migration_evidence_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_runtime_checkpoint_pkey
-- B0_CATALOG_OBJECT index	public.idx_biz_property_migration_anomaly_audit_history
-- B0_CATALOG_OBJECT index	public.idx_biz_property_migration_anomaly_open
-- B0_CATALOG_OBJECT index	public.idx_biz_property_migration_anomaly_run
-- B0_CATALOG_OBJECT index	public.idx_biz_property_migration_evidence_run
-- B0_CATALOG_OBJECT index	public.idx_biz_property_runtime_checkpoint_run
-- B0_CATALOG_OBJECT index	public.idx_sys_property_runtime_control_effective
-- B0_CATALOG_OBJECT index	public.pk_biz_property_migration_anomaly_audit
-- B0_CATALOG_OBJECT index	public.sys_property_runtime_control_pkey
-- B0_CATALOG_OBJECT index	public.uq_biz_property_migration_anomaly_audit_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_migration_anomaly_audit_version
-- B0_CATALOG_OBJECT index	public.uq_biz_property_migration_anomaly_run_source
-- B0_CATALOG_OBJECT index	public.uq_biz_property_migration_anomaly_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_migration_evidence_run_kind
-- B0_CATALOG_OBJECT index	public.uq_biz_property_migration_evidence_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_runtime_checkpoint_key
-- B0_CATALOG_OBJECT index	public.uq_biz_property_runtime_checkpoint_scope_id
-- B0_CATALOG_OBJECT index	public.uq_sys_property_runtime_control_key
-- B0_CATALOG_OBJECT index	public.uq_sys_property_runtime_control_scope_id
-- B0_CATALOG_OBJECT table	public.biz_property_migration_anomaly
-- B0_CATALOG_OBJECT table	public.biz_property_migration_anomaly_audit
-- B0_CATALOG_OBJECT table	public.biz_property_migration_evidence
-- B0_CATALOG_OBJECT table	public.biz_property_runtime_checkpoint
-- B0_CATALOG_OBJECT table	public.sys_property_runtime_control
-- B0_CATALOG_OBJECT trigger	public.biz_property_migration_anomaly.trg_biz_property_migration_anomaly_audit_required
-- B0_CATALOG_OBJECT trigger	public.biz_property_migration_anomaly.trg_biz_property_migration_anomaly_no_delete
-- B0_CATALOG_OBJECT trigger	public.biz_property_migration_anomaly.trg_biz_property_migration_anomaly_transition_guard
-- B0_CATALOG_OBJECT trigger	public.biz_property_migration_anomaly_audit.trg_biz_property_migration_anomaly_audit_immutable
-- B0_CATALOG_OBJECT trigger	public.biz_property_migration_evidence.trg_biz_property_migration_evidence_immutable
-- B0_CATALOG_OBJECTS_END

-- B0_DEFINITION_SIGNATURE_GUARD_START
CREATE TEMP TABLE b0_catalog_target (
  kind text NOT NULL CHECK (kind IN
    ('table','column','constraint','index','function','trigger','definition-row')),
  name text NOT NULL,
  PRIMARY KEY (kind,name)
) ON COMMIT DROP;
INSERT INTO b0_catalog_target(kind,name) VALUES
  ('column','public.biz_property_migration_anomaly.actual_hash'),
  ('column','public.biz_property_migration_anomaly.anomaly_kind'),
  ('column','public.biz_property_migration_anomaly.checkpoint_id'),
  ('column','public.biz_property_migration_anomaly.details_redacted'),
  ('column','public.biz_property_migration_anomaly.detected_at'),
  ('column','public.biz_property_migration_anomaly.expected_hash'),
  ('column','public.biz_property_migration_anomaly.id'),
  ('column','public.biz_property_migration_anomaly.last_transition_by'),
  ('column','public.biz_property_migration_anomaly.last_transition_reason'),
  ('column','public.biz_property_migration_anomaly.park_id'),
  ('column','public.biz_property_migration_anomaly.resolution_reference'),
  ('column','public.biz_property_migration_anomaly.resolved_at'),
  ('column','public.biz_property_migration_anomaly.resolved_by'),
  ('column','public.biz_property_migration_anomaly.run_id'),
  ('column','public.biz_property_migration_anomaly.source_key'),
  ('column','public.biz_property_migration_anomaly.source_type'),
  ('column','public.biz_property_migration_anomaly.source_version'),
  ('column','public.biz_property_migration_anomaly.status'),
  ('column','public.biz_property_migration_anomaly.tenant_id'),
  ('column','public.biz_property_migration_anomaly.version'),
  ('column','public.biz_property_migration_anomaly_audit.actor_id'),
  ('column','public.biz_property_migration_anomaly_audit.anomaly_id'),
  ('column','public.biz_property_migration_anomaly_audit.expected_version'),
  ('column','public.biz_property_migration_anomaly_audit.from_status'),
  ('column','public.biz_property_migration_anomaly_audit.id'),
  ('column','public.biz_property_migration_anomaly_audit.occurred_at'),
  ('column','public.biz_property_migration_anomaly_audit.park_id'),
  ('column','public.biz_property_migration_anomaly_audit.reason'),
  ('column','public.biz_property_migration_anomaly_audit.resulting_version'),
  ('column','public.biz_property_migration_anomaly_audit.tenant_id'),
  ('column','public.biz_property_migration_anomaly_audit.to_status'),
  ('column','public.biz_property_migration_evidence.anomaly_count'),
  ('column','public.biz_property_migration_evidence.artifact_hash'),
  ('column','public.biz_property_migration_evidence.artifact_uri'),
  ('column','public.biz_property_migration_evidence.checkpoint_id'),
  ('column','public.biz_property_migration_evidence.contract_hash'),
  ('column','public.biz_property_migration_evidence.evidence_kind'),
  ('column','public.biz_property_migration_evidence.generated_at'),
  ('column','public.biz_property_migration_evidence.generated_by'),
  ('column','public.biz_property_migration_evidence.id'),
  ('column','public.biz_property_migration_evidence.max_source_key'),
  ('column','public.biz_property_migration_evidence.migration_set_hash'),
  ('column','public.biz_property_migration_evidence.min_source_key'),
  ('column','public.biz_property_migration_evidence.park_id'),
  ('column','public.biz_property_migration_evidence.row_count'),
  ('column','public.biz_property_migration_evidence.run_id'),
  ('column','public.biz_property_migration_evidence.tenant_id'),
  ('column','public.biz_property_runtime_checkpoint.anomaly_count'),
  ('column','public.biz_property_runtime_checkpoint.checkpoint_key'),
  ('column','public.biz_property_runtime_checkpoint.checkpoint_kind'),
  ('column','public.biz_property_runtime_checkpoint.checkpoint_version'),
  ('column','public.biz_property_runtime_checkpoint.cursor_value'),
  ('column','public.biz_property_runtime_checkpoint.evidence_hash'),
  ('column','public.biz_property_runtime_checkpoint.id'),
  ('column','public.biz_property_runtime_checkpoint.last_run_id'),
  ('column','public.biz_property_runtime_checkpoint.park_id'),
  ('column','public.biz_property_runtime_checkpoint.status'),
  ('column','public.biz_property_runtime_checkpoint.tenant_id'),
  ('column','public.biz_property_runtime_checkpoint.updated_at'),
  ('column','public.biz_property_runtime_checkpoint.updated_by'),
  ('column','public.biz_property_runtime_checkpoint.version'),
  ('column','public.sys_property_runtime_control.adapter_version'),
  ('column','public.sys_property_runtime_control.approval_reference'),
  ('column','public.sys_property_runtime_control.contract_hash'),
  ('column','public.sys_property_runtime_control.control_key'),
  ('column','public.sys_property_runtime_control.control_kind'),
  ('column','public.sys_property_runtime_control.control_mode'),
  ('column','public.sys_property_runtime_control.create_time'),
  ('column','public.sys_property_runtime_control.disabled_reason'),
  ('column','public.sys_property_runtime_control.enabled'),
  ('column','public.sys_property_runtime_control.enabled_at'),
  ('column','public.sys_property_runtime_control.enabled_by'),
  ('column','public.sys_property_runtime_control.id'),
  ('column','public.sys_property_runtime_control.park_id'),
  ('column','public.sys_property_runtime_control.target'),
  ('column','public.sys_property_runtime_control.tenant_id'),
  ('column','public.sys_property_runtime_control.update_time'),
  ('column','public.sys_property_runtime_control.version'),
  ('constraint','public.biz_property_migration_anomaly.biz_property_migration_anomaly_pkey'),
  ('constraint','public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_details'),
  ('constraint','public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_hashes'),
  ('constraint','public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_kind'),
  ('constraint','public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_resolution'),
  ('constraint','public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_status'),
  ('constraint','public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_transition_actor'),
  ('constraint','public.biz_property_migration_anomaly.ck_biz_property_migration_anomaly_version'),
  ('constraint','public.biz_property_migration_anomaly.fk_biz_property_migration_anomaly_checkpoint'),
  ('constraint','public.biz_property_migration_anomaly.uq_biz_property_migration_anomaly_run_source'),
  ('constraint','public.biz_property_migration_anomaly.uq_biz_property_migration_anomaly_scope_id'),
  ('constraint','public.biz_property_migration_anomaly_audit.ck_biz_property_migration_anomaly_audit_from'),
  ('constraint','public.biz_property_migration_anomaly_audit.ck_biz_property_migration_anomaly_audit_reason'),
  ('constraint','public.biz_property_migration_anomaly_audit.ck_biz_property_migration_anomaly_audit_to'),
  ('constraint','public.biz_property_migration_anomaly_audit.ck_biz_property_migration_anomaly_audit_version'),
  ('constraint','public.biz_property_migration_anomaly_audit.fk_biz_property_migration_anomaly_audit_anomaly'),
  ('constraint','public.biz_property_migration_anomaly_audit.pk_biz_property_migration_anomaly_audit'),
  ('constraint','public.biz_property_migration_anomaly_audit.uq_biz_property_migration_anomaly_audit_scope_id'),
  ('constraint','public.biz_property_migration_anomaly_audit.uq_biz_property_migration_anomaly_audit_version'),
  ('constraint','public.biz_property_migration_evidence.biz_property_migration_evidence_pkey'),
  ('constraint','public.biz_property_migration_evidence.ck_biz_property_migration_evidence_counts'),
  ('constraint','public.biz_property_migration_evidence.ck_biz_property_migration_evidence_hashes'),
  ('constraint','public.biz_property_migration_evidence.ck_biz_property_migration_evidence_kind'),
  ('constraint','public.biz_property_migration_evidence.fk_biz_property_migration_evidence_checkpoint'),
  ('constraint','public.biz_property_migration_evidence.uq_biz_property_migration_evidence_run_kind'),
  ('constraint','public.biz_property_migration_evidence.uq_biz_property_migration_evidence_scope_id'),
  ('constraint','public.biz_property_runtime_checkpoint.biz_property_runtime_checkpoint_pkey'),
  ('constraint','public.biz_property_runtime_checkpoint.ck_biz_property_runtime_checkpoint_counts'),
  ('constraint','public.biz_property_runtime_checkpoint.ck_biz_property_runtime_checkpoint_evidence'),
  ('constraint','public.biz_property_runtime_checkpoint.ck_biz_property_runtime_checkpoint_kind'),
  ('constraint','public.biz_property_runtime_checkpoint.ck_biz_property_runtime_checkpoint_status'),
  ('constraint','public.biz_property_runtime_checkpoint.uq_biz_property_runtime_checkpoint_key'),
  ('constraint','public.biz_property_runtime_checkpoint.uq_biz_property_runtime_checkpoint_scope_id'),
  ('constraint','public.sys_property_runtime_control.ck_sys_property_runtime_control_disabled'),
  ('constraint','public.sys_property_runtime_control.ck_sys_property_runtime_control_hash'),
  ('constraint','public.sys_property_runtime_control.ck_sys_property_runtime_control_kind'),
  ('constraint','public.sys_property_runtime_control.ck_sys_property_runtime_control_mode'),
  ('constraint','public.sys_property_runtime_control.ck_sys_property_runtime_control_target'),
  ('constraint','public.sys_property_runtime_control.ck_sys_property_runtime_control_version'),
  ('constraint','public.sys_property_runtime_control.sys_property_runtime_control_pkey'),
  ('constraint','public.sys_property_runtime_control.uq_sys_property_runtime_control_key'),
  ('constraint','public.sys_property_runtime_control.uq_sys_property_runtime_control_scope_id'),
  ('function','public.fn_guard_property_migration_anomaly_transition()'),
  ('function','public.fn_property_migration_immutable()'),
  ('function','public.fn_require_property_migration_anomaly_audit()'),
  ('function','public.fn_transition_property_migration_anomaly(p_tenant_id character varying, p_park_id character varying, p_anomaly_id uuid, p_expected_version integer, p_to_status character varying, p_actor_id uuid, p_reason character varying, p_resolution_reference character varying)'),
  ('index','public.biz_property_migration_anomaly_pkey'),
  ('index','public.biz_property_migration_evidence_pkey'),
  ('index','public.biz_property_runtime_checkpoint_pkey'),
  ('index','public.idx_biz_property_migration_anomaly_audit_history'),
  ('index','public.idx_biz_property_migration_anomaly_open'),
  ('index','public.idx_biz_property_migration_anomaly_run'),
  ('index','public.idx_biz_property_migration_evidence_run'),
  ('index','public.idx_biz_property_runtime_checkpoint_run'),
  ('index','public.idx_sys_property_runtime_control_effective'),
  ('index','public.pk_biz_property_migration_anomaly_audit'),
  ('index','public.sys_property_runtime_control_pkey'),
  ('index','public.uq_biz_property_migration_anomaly_audit_scope_id'),
  ('index','public.uq_biz_property_migration_anomaly_audit_version'),
  ('index','public.uq_biz_property_migration_anomaly_run_source'),
  ('index','public.uq_biz_property_migration_anomaly_scope_id'),
  ('index','public.uq_biz_property_migration_evidence_run_kind'),
  ('index','public.uq_biz_property_migration_evidence_scope_id'),
  ('index','public.uq_biz_property_runtime_checkpoint_key'),
  ('index','public.uq_biz_property_runtime_checkpoint_scope_id'),
  ('index','public.uq_sys_property_runtime_control_key'),
  ('index','public.uq_sys_property_runtime_control_scope_id'),
  ('table','public.biz_property_migration_anomaly'),
  ('table','public.biz_property_migration_anomaly_audit'),
  ('table','public.biz_property_migration_evidence'),
  ('table','public.biz_property_runtime_checkpoint'),
  ('table','public.sys_property_runtime_control'),
  ('trigger','public.biz_property_migration_anomaly.trg_biz_property_migration_anomaly_audit_required'),
  ('trigger','public.biz_property_migration_anomaly.trg_biz_property_migration_anomaly_no_delete'),
  ('trigger','public.biz_property_migration_anomaly.trg_biz_property_migration_anomaly_transition_guard'),
  ('trigger','public.biz_property_migration_anomaly_audit.trg_biz_property_migration_anomaly_audit_immutable'),
  ('trigger','public.biz_property_migration_evidence.trg_biz_property_migration_evidence_immutable');
CREATE TEMP VIEW b0_guard_catalog(kind,name,definition,signature_comment) AS

SELECT 'table'::text AS kind,n.nspname||'.'||c.relname AS name,
  jsonb_build_object('persistence',c.relpersistence::text,
    'partitionKey',coalesce(pg_get_partkeydef(c.oid),''),
    'rlsEnabled',c.relrowsecurity) AS definition,
  obj_description(c.oid,'pg_class') AS signature_comment
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN b0_catalog_target t ON t.kind='table' AND t.name=n.nspname||'.'||c.relname
UNION ALL
SELECT 'column',n.nspname||'.'||c.relname||'.'||a.attname,
  jsonb_build_object('dataType',format_type(a.atttypid,a.atttypmod),
    'default',coalesce(pg_get_expr(d.adbin,d.adrelid),''),
    'generated',a.attgenerated::text,'identity',a.attidentity::text,
    'notNull',a.attnotnull,'ordinal',a.attnum),
  col_description(c.oid,a.attnum)
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
JOIN b0_catalog_target t ON t.kind='column'
 AND t.name=n.nspname||'.'||c.relname||'.'||a.attname
WHERE a.attnum>0 AND NOT a.attisdropped
UNION ALL
SELECT 'constraint',n.nspname||'.'||c.relname||'.'||x.conname,
  jsonb_build_object('deferrable',x.condeferrable,
    'definition',pg_get_constraintdef(x.oid,false),
    'initiallyDeferred',x.condeferred,'type',x.contype::text),
  obj_description(x.oid,'pg_constraint')
FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN b0_catalog_target t ON t.kind='constraint'
 AND t.name=n.nspname||'.'||c.relname||'.'||x.conname
UNION ALL
SELECT 'index',ni.nspname||'.'||i.relname,
  jsonb_build_object('definition',pg_get_indexdef(i.oid),
    'primary',x.indisprimary,'unique',x.indisunique,'valid',x.indisvalid),
  obj_description(i.oid,'pg_class')
FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
JOIN pg_namespace ni ON ni.oid=i.relnamespace
JOIN b0_catalog_target t ON t.kind='index' AND t.name=ni.nspname||'.'||i.relname
UNION ALL
SELECT 'function',n.nspname||'.'||p.proname||'('||
    pg_get_function_identity_arguments(p.oid)||')',
  jsonb_build_object('definition',pg_get_functiondef(p.oid),
    'language',l.lanname,'securityDefiner',p.prosecdef,
    'volatility',p.provolatile::text),
  obj_description(p.oid,'pg_proc')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_language l ON l.oid=p.prolang
JOIN b0_catalog_target t ON t.kind='function'
 AND t.name=n.nspname||'.'||p.proname||'('||
   pg_get_function_identity_arguments(p.oid)||')'
UNION ALL
SELECT 'trigger',n.nspname||'.'||c.relname||'.'||g.tgname,
  jsonb_build_object('definition',pg_get_triggerdef(g.oid,false),
    'enabled',g.tgenabled::text),
  obj_description(g.oid,'pg_trigger')
FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN b0_catalog_target t ON t.kind='trigger'
 AND t.name=n.nspname||'.'||c.relname||'.'||g.tgname
WHERE NOT g.tgisinternal
;
CREATE TEMP TABLE b0_preexisting_catalog_object (
  kind text NOT NULL,
  name text NOT NULL,
  definition_hash char(64) NOT NULL,
  signature_comment text,
  PRIMARY KEY(kind,name)
) ON COMMIT DROP;
INSERT INTO b0_preexisting_catalog_object
SELECT kind,name,
  encode(digest(convert_to(definition::text,'UTF8'),'sha256'),'hex'),
  signature_comment
FROM b0_guard_catalog;
DO $$
DECLARE invalid text;
BEGIN
  SELECT string_agg(kind||E'\t'||name, E'\n' ORDER BY kind COLLATE "C",name COLLATE "C")
  INTO invalid
  FROM b0_preexisting_catalog_object
  WHERE signature_comment IS DISTINCT FROM
    'b0-catalog-v1:'||definition_hash;
  IF invalid IS NOT NULL THEN
    RAISE EXCEPTION 'b0-preexisting-definition-drift:%', E'\n'||invalid
      USING ERRCODE='23514';
  END IF;
END;
$$;

DO $$
BEGIN
  IF current_user ~* '(api|web|runtime)' THEN
    RAISE EXCEPTION 'property-schema-owner-role-invalid: %', current_user
      USING ERRCODE = '42501';
  END IF;
  IF NOT has_schema_privilege(current_user, 'public', 'CREATE') THEN
    RAISE EXCEPTION 'property-schema-owner-create-privilege-required: %', current_user
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS biz_property_runtime_checkpoint (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  checkpoint_kind varchar(64) NOT NULL,
  checkpoint_key varchar(256) NOT NULL,
  checkpoint_version integer NOT NULL DEFAULT 1,
  cursor_value varchar(512),
  anomaly_count bigint NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'disabled',
  evidence_hash char(64),
  last_run_id uuid,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT ck_biz_property_runtime_checkpoint_kind
    CHECK (checkpoint_kind IN (
      'backfill', 'change_capture', 'mutation_replay', 'shadow_compare',
      'reconcile', 'constraint_validate'
    )),
  CONSTRAINT ck_biz_property_runtime_checkpoint_status
    CHECK (status IN ('disabled', 'running', 'paused', 'completed', 'failed')),
  CONSTRAINT ck_biz_property_runtime_checkpoint_counts
    CHECK (checkpoint_version > 0 AND anomaly_count >= 0 AND version > 0),
  CONSTRAINT ck_biz_property_runtime_checkpoint_evidence
    CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_biz_property_runtime_checkpoint_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_runtime_checkpoint_key
    UNIQUE (tenant_id, park_id, checkpoint_kind, checkpoint_key)
);
CREATE INDEX IF NOT EXISTS idx_biz_property_runtime_checkpoint_run
  ON biz_property_runtime_checkpoint
    (tenant_id, park_id, status, checkpoint_kind, updated_at, id);

CREATE TABLE IF NOT EXISTS sys_property_runtime_control (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  control_key varchar(128) NOT NULL,
  control_kind varchar(32) NOT NULL,
  target varchar(64) NOT NULL,
  adapter_version integer,
  contract_hash char(64) NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  control_mode varchar(16) NOT NULL DEFAULT 'disabled',
  enabled_by uuid,
  enabled_at timestamptz,
  approval_reference varchar(256),
  disabled_reason varchar(500) NOT NULL DEFAULT 'expand-only',
  create_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  update_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT ck_sys_property_runtime_control_kind
    CHECK (control_kind IN (
      'compatibility_read', 'compatibility_write', 'change_capture',
      'mutation_replay', 'shadow_compare', 'enforce'
    )),
  CONSTRAINT ck_sys_property_runtime_control_target
    CHECK (target IN (
      'identity', 'approval', 'event_notification', 'task',
      'property_foundation', 'homestay', 'housing'
    )),
  CONSTRAINT ck_sys_property_runtime_control_mode
    CHECK (control_mode IN ('disabled', 'observe', 'shadow', 'enforce')),
  CONSTRAINT ck_sys_property_runtime_control_hash
    CHECK (contract_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_sys_property_runtime_control_version
    CHECK (version > 0 AND (adapter_version IS NULL OR adapter_version > 0)),
  CONSTRAINT ck_sys_property_runtime_control_disabled
    CHECK (
      (enabled = false AND control_mode = 'disabled'
       AND enabled_by IS NULL AND enabled_at IS NULL)
      OR
      (enabled = true AND control_mode <> 'disabled'
       AND enabled_by IS NOT NULL AND enabled_at IS NOT NULL
       AND approval_reference IS NOT NULL)
    ),
  CONSTRAINT uq_sys_property_runtime_control_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_sys_property_runtime_control_key
    UNIQUE (tenant_id, park_id, control_key)
);
CREATE INDEX IF NOT EXISTS idx_sys_property_runtime_control_effective
  ON sys_property_runtime_control
    (tenant_id, park_id, target, control_kind, enabled, control_mode);

CREATE TEMP TABLE b0_signed_runtime_control (
  control_key varchar(128) PRIMARY KEY,
  control_kind varchar(32) NOT NULL,
  target varchar(64) NOT NULL,
  adapter_version integer
) ON COMMIT DROP;
INSERT INTO b0_signed_runtime_control VALUES
  ('identity.legacy-read-v1','compatibility_read','identity',1),
  ('identity.legacy-write-v1','compatibility_write','identity',1),
  ('identity.change-capture','change_capture','identity',NULL),
  ('identity.mutation-replay','mutation_replay','identity',NULL),
  ('identity.shadow-compare','shadow_compare','identity',NULL),
  ('identity.enforce','enforce','identity',NULL),
  ('approval.shadow-compare','shadow_compare','approval',NULL),
  ('approval.enforce','enforce','approval',NULL),
  ('event-notification.shadow-compare','shadow_compare','event_notification',NULL),
  ('event-notification.enforce','enforce','event_notification',NULL),
  ('task.shadow-compare','shadow_compare','task',NULL),
  ('task.enforce','enforce','task',NULL);

CREATE TEMP TABLE b0_business_target_scope (
  tenant_key text,
  park_key text,
  assignment_audit_ids text[] NOT NULL,
  UNIQUE NULLS NOT DISTINCT (tenant_key, park_key)
) ON COMMIT DROP;
INSERT INTO b0_business_target_scope(tenant_key,park_key,assignment_audit_ids)
SELECT
  btrim(assignment.tenant_id),
  btrim(assignment.park_id),
  array_agg(assignment.id::text ORDER BY assignment.id)
FROM rel_tenant_module assignment
JOIN sys_module module
  ON module.id=assignment.module_id
 AND module.module_code='asset'
 AND module.status=1
 AND module.is_deleted=false
WHERE assignment.enabled=true
  AND assignment.status='enabled'
  AND assignment.is_deleted=false
  AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
  AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
GROUP BY btrim(assignment.tenant_id),btrim(assignment.park_id);

DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM b0_business_target_scope scope
  WHERE scope.tenant_key IS NULL OR scope.park_key IS NULL
     OR lower(scope.tenant_key) IN (
       '','0','all','global','*','00000000-0000-0000-0000-000000000000'
     )
     OR lower(scope.park_key) IN (
       '','0','all','global','*','00000000-0000-0000-0000-000000000000'
     )
     OR (
       SELECT count(*) FROM sys_tenant tenant
       WHERE btrim(tenant.tenant_id)=scope.tenant_key
         AND tenant.status=1 AND tenant.is_deleted=false
         AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp())
     ) <> 1
     OR (
       SELECT count(*) FROM asset_park park
       WHERE btrim(park.tenant_id)=scope.tenant_key
         AND btrim(park.park_id)=scope.park_key
         AND park.status='enabled' AND park.is_deleted=false
     ) <> 1;
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'property-business-scope-preflight-failed'
      USING ERRCODE='23514';
  END IF;
END;
$$;

CREATE TEMP TABLE b0_validated_business_target_scope (
  tenant_key text NOT NULL,
  park_key text NOT NULL,
  tenant_entity_uuid uuid NOT NULL,
  park_entity_uuid uuid NOT NULL,
  assignment_audit_ids text[] NOT NULL,
  PRIMARY KEY (tenant_key,park_key)
) ON COMMIT DROP;
INSERT INTO b0_validated_business_target_scope(
  tenant_key,park_key,tenant_entity_uuid,park_entity_uuid,assignment_audit_ids
)
SELECT scope.tenant_key,scope.park_key,tenant.id,park.id,scope.assignment_audit_ids
FROM b0_business_target_scope scope
JOIN sys_tenant tenant
  ON btrim(tenant.tenant_id)=scope.tenant_key
 AND tenant.status=1 AND tenant.is_deleted=false
 AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp())
JOIN asset_park park
  ON btrim(park.tenant_id)=scope.tenant_key
 AND btrim(park.park_id)=scope.park_key
 AND park.status='enabled' AND park.is_deleted=false;

INSERT INTO sys_property_runtime_control (
  tenant_id, park_id, control_key, control_kind, target, adapter_version,
  contract_hash, enabled, control_mode, enabled_by, enabled_at,
  approval_reference, disabled_reason, version
)
SELECT
  scope.tenant_key, scope.park_key,
  control.control_key, control.control_kind, control.target, control.adapter_version,
  'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8',
  false, 'disabled', NULL, NULL, NULL, 'expand-only', 1
FROM b0_validated_business_target_scope scope
CROSS JOIN b0_signed_runtime_control control
ON CONFLICT (tenant_id, park_id, control_key) DO NOTHING;

DO $$
DECLARE
  drift_count integer;
BEGIN
  WITH expected AS (
    SELECT
      scope.tenant_key AS tenant_id,
      scope.park_key AS park_id,
      control.control_key,
      control.control_kind,
      control.target,
      control.adapter_version,
      'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8'::char(64)
        AS contract_hash,
      false AS enabled,
      'disabled'::varchar AS control_mode,
      'expand-only'::varchar AS disabled_reason
    FROM b0_validated_business_target_scope scope
    CROSS JOIN b0_signed_runtime_control control
  ),
  actual AS (
    SELECT tenant_id, park_id, control_key, control_kind, target, adapter_version,
           contract_hash, enabled, control_mode, disabled_reason
    FROM sys_property_runtime_control
    WHERE control_key IN (SELECT control_key FROM b0_signed_runtime_control)
  ),
  drift AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  )
  SELECT count(*) INTO drift_count FROM drift;
  IF drift_count <> 0 THEN
    RAISE EXCEPTION 'property-runtime-control-definition-drift' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS biz_property_migration_anomaly (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  run_id uuid NOT NULL,
  checkpoint_id uuid NOT NULL,
  anomaly_kind varchar(64) NOT NULL,
  source_type varchar(64) NOT NULL,
  source_key varchar(256) NOT NULL,
  source_version varchar(128),
  expected_hash char(64),
  actual_hash char(64),
  details_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(16) NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_reference varchar(256),
  last_transition_by uuid,
  last_transition_reason varchar(1000),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT ck_biz_property_migration_anomaly_kind
    CHECK (anomaly_kind IN (
      'duplicate_active', 'cross_scope', 'pointer_mismatch', 'hash_mismatch',
      'version_mismatch', 'file_missing', 'actor_missing', 'audit_mismatch',
      'mutation_replay_mismatch', 'projection_mismatch', 'constraint_violation'
    )),
  CONSTRAINT ck_biz_property_migration_anomaly_status
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'ignored')),
  CONSTRAINT ck_biz_property_migration_anomaly_details
    CHECK (jsonb_typeof(details_redacted) = 'object'),
  CONSTRAINT ck_biz_property_migration_anomaly_hashes
    CHECK (
      (expected_hash IS NULL OR expected_hash ~ '^[0-9a-f]{64}$')
      AND (actual_hash IS NULL OR actual_hash ~ '^[0-9a-f]{64}$')
    ),
  CONSTRAINT ck_biz_property_migration_anomaly_resolution
    CHECK (
      (status IN ('open', 'acknowledged') AND resolved_at IS NULL
       AND resolved_by IS NULL AND resolution_reference IS NULL)
      OR
      (status IN ('resolved', 'ignored') AND resolved_at IS NOT NULL
       AND resolved_by IS NOT NULL AND resolution_reference IS NOT NULL)
    ),
  CONSTRAINT ck_biz_property_migration_anomaly_transition_actor
    CHECK (
      (version = 1 AND status = 'open'
       AND last_transition_by IS NULL AND last_transition_reason IS NULL)
      OR
      (version > 1 AND last_transition_by IS NOT NULL
       AND length(trim(last_transition_reason)) > 0)
    ),
  CONSTRAINT ck_biz_property_migration_anomaly_version CHECK (version > 0),
  CONSTRAINT fk_biz_property_migration_anomaly_checkpoint
    FOREIGN KEY (tenant_id, park_id, checkpoint_id)
    REFERENCES biz_property_runtime_checkpoint(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_migration_anomaly_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_migration_anomaly_run_source
    UNIQUE (
      tenant_id, park_id, run_id, checkpoint_id, anomaly_kind, source_type, source_key
    )
);
CREATE INDEX IF NOT EXISTS idx_biz_property_migration_anomaly_open
  ON biz_property_migration_anomaly
    (tenant_id, park_id, anomaly_kind, detected_at, id)
  WHERE status IN ('open', 'acknowledged');
CREATE INDEX IF NOT EXISTS idx_biz_property_migration_anomaly_run
  ON biz_property_migration_anomaly
    (tenant_id, park_id, run_id, checkpoint_id, id);

CREATE TABLE IF NOT EXISTS biz_property_migration_anomaly_audit (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  anomaly_id uuid NOT NULL,
  from_status varchar(16) NOT NULL,
  to_status varchar(16) NOT NULL,
  actor_id uuid NOT NULL,
  reason varchar(1000) NOT NULL,
  expected_version integer NOT NULL,
  resulting_version integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_biz_property_migration_anomaly_audit PRIMARY KEY (id),
  CONSTRAINT ck_biz_property_migration_anomaly_audit_from
    CHECK (from_status IN ('open', 'acknowledged', 'resolved', 'ignored')),
  CONSTRAINT ck_biz_property_migration_anomaly_audit_to
    CHECK (to_status IN ('acknowledged', 'resolved', 'ignored')),
  CONSTRAINT ck_biz_property_migration_anomaly_audit_reason
    CHECK (length(trim(reason)) > 0),
  CONSTRAINT ck_biz_property_migration_anomaly_audit_version
    CHECK (expected_version > 0 AND resulting_version = expected_version + 1),
  CONSTRAINT fk_biz_property_migration_anomaly_audit_anomaly
    FOREIGN KEY (tenant_id, park_id, anomaly_id)
    REFERENCES biz_property_migration_anomaly(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_migration_anomaly_audit_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_migration_anomaly_audit_version
    UNIQUE (tenant_id, park_id, anomaly_id, resulting_version)
);
CREATE INDEX IF NOT EXISTS idx_biz_property_migration_anomaly_audit_history
  ON biz_property_migration_anomaly_audit
    (tenant_id, park_id, anomaly_id, occurred_at, id);

CREATE OR REPLACE FUNCTION public.fn_guard_property_migration_anomaly_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(
    NEW.tenant_id, NEW.park_id, NEW.run_id, NEW.checkpoint_id,
    NEW.anomaly_kind, NEW.source_type, NEW.source_key, NEW.source_version,
    NEW.expected_hash, NEW.actual_hash, NEW.details_redacted, NEW.detected_at
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.park_id, OLD.run_id, OLD.checkpoint_id,
    OLD.anomaly_kind, OLD.source_type, OLD.source_key, OLD.source_version,
    OLD.expected_hash, OLD.actual_hash, OLD.details_redacted, OLD.detected_at
  ) THEN
    RAISE EXCEPTION 'property-migration-anomaly-immutable-field' USING ERRCODE = '55000';
  END IF;
  IF NEW.version <> OLD.version + 1
     OR NEW.last_transition_by IS NULL
     OR length(trim(NEW.last_transition_reason)) = 0 THEN
    RAISE EXCEPTION 'property-migration-anomaly-cas-invalid' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (OLD.status = 'open' AND NEW.status IN ('acknowledged', 'resolved', 'ignored'))
    OR (OLD.status = 'acknowledged' AND NEW.status IN ('resolved', 'ignored'))
  ) THEN
    RAISE EXCEPTION 'anomaly-transition-invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_require_property_migration_anomaly_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.biz_property_migration_anomaly_audit audit
    WHERE audit.tenant_id = NEW.tenant_id
      AND audit.park_id = NEW.park_id
      AND audit.anomaly_id = NEW.id
      AND audit.from_status = OLD.status
      AND audit.to_status = NEW.status
      AND audit.expected_version = OLD.version
      AND audit.resulting_version = NEW.version
      AND audit.actor_id = NEW.last_transition_by
      AND audit.reason = NEW.last_transition_reason
  ) THEN
    RAISE EXCEPTION 'property-migration-anomaly-audit-required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_property_migration_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'property-migration-record-immutable' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_transition_property_migration_anomaly(
  p_tenant_id varchar(64),
  p_park_id varchar(64),
  p_anomaly_id uuid,
  p_expected_version integer,
  p_to_status varchar(16),
  p_actor_id uuid,
  p_reason varchar(1000),
  p_resolution_reference varchar(256)
) RETURNS public.biz_property_migration_anomaly
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_row public.biz_property_migration_anomaly;
  updated_row public.biz_property_migration_anomaly;
BEGIN
  IF p_actor_id IS NULL OR coalesce(length(trim(p_reason)), 0) = 0 THEN
    RAISE EXCEPTION 'anomaly-transition-actor-reason-required' USING ERRCODE = '22023';
  END IF;
  IF p_to_status IN ('resolved', 'ignored')
     AND coalesce(length(trim(p_resolution_reference)), 0) = 0 THEN
    RAISE EXCEPTION 'anomaly-resolution-reference-required' USING ERRCODE = '22023';
  END IF;
  IF p_to_status = 'acknowledged' AND p_resolution_reference IS NOT NULL THEN
    RAISE EXCEPTION 'anomaly-acknowledge-resolution-forbidden' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_row
  FROM public.biz_property_migration_anomaly
  WHERE tenant_id = p_tenant_id AND park_id = p_park_id AND id = p_anomaly_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'anomaly-not-found' USING ERRCODE = 'P0002';
  END IF;
  IF current_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'anomaly-version-conflict' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (current_row.status = 'open' AND p_to_status IN ('acknowledged', 'resolved', 'ignored'))
    OR (current_row.status = 'acknowledged' AND p_to_status IN ('resolved', 'ignored'))
  ) THEN
    RAISE EXCEPTION 'anomaly-transition-invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE public.biz_property_migration_anomaly
  SET status = p_to_status,
      resolved_at = CASE WHEN p_to_status IN ('resolved', 'ignored')
                         THEN clock_timestamp() ELSE NULL END,
      resolved_by = CASE WHEN p_to_status IN ('resolved', 'ignored')
                         THEN p_actor_id ELSE NULL END,
      resolution_reference = CASE WHEN p_to_status IN ('resolved', 'ignored')
                                  THEN p_resolution_reference ELSE NULL END,
      last_transition_by = p_actor_id,
      last_transition_reason = p_reason,
      version = version + 1
  WHERE tenant_id = p_tenant_id AND park_id = p_park_id AND id = p_anomaly_id
    AND version = p_expected_version
  RETURNING * INTO updated_row;

  INSERT INTO public.biz_property_migration_anomaly_audit (
    tenant_id, park_id, anomaly_id, from_status, to_status, actor_id,
    reason, expected_version, resulting_version
  ) VALUES (
    p_tenant_id, p_park_id, p_anomaly_id, current_row.status, p_to_status,
    p_actor_id, p_reason, current_row.version, updated_row.version
  );
  RETURN updated_row;
END;
$$;

ALTER FUNCTION public.fn_transition_property_migration_anomaly(
  varchar, varchar, uuid, integer, varchar, uuid, varchar, varchar
) OWNER TO CURRENT_USER;

CREATE OR REPLACE TRIGGER trg_biz_property_migration_anomaly_transition_guard
BEFORE UPDATE ON biz_property_migration_anomaly
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_property_migration_anomaly_transition();
DO $constraint_trigger$
DECLARE
  current_definition text;
BEGIN
  SELECT regexp_replace(pg_get_triggerdef(trigger_row.oid, false), '\s+', ' ', 'g')
  INTO current_definition
  FROM pg_trigger trigger_row
  WHERE trigger_row.tgrelid = 'public.biz_property_migration_anomaly'::regclass
    AND trigger_row.tgname = 'trg_biz_property_migration_anomaly_audit_required'
    AND NOT trigger_row.tgisinternal;

  IF current_definition IS NULL THEN
    EXECUTE $ddl$
      CREATE CONSTRAINT TRIGGER trg_biz_property_migration_anomaly_audit_required
      AFTER UPDATE ON public.biz_property_migration_anomaly
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_require_property_migration_anomaly_audit()
    $ddl$;
  END IF;
END;
$constraint_trigger$;
CREATE OR REPLACE TRIGGER trg_biz_property_migration_anomaly_no_delete
BEFORE DELETE ON biz_property_migration_anomaly
FOR EACH ROW EXECUTE FUNCTION public.fn_property_migration_immutable();
CREATE OR REPLACE TRIGGER trg_biz_property_migration_anomaly_audit_immutable
BEFORE UPDATE OR DELETE ON biz_property_migration_anomaly_audit
FOR EACH ROW EXECUTE FUNCTION public.fn_property_migration_immutable();

CREATE TABLE IF NOT EXISTS biz_property_migration_evidence (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  run_id uuid NOT NULL,
  checkpoint_id uuid NOT NULL,
  evidence_kind varchar(64) NOT NULL,
  artifact_uri varchar(512),
  artifact_hash char(64) NOT NULL,
  row_count bigint NOT NULL,
  anomaly_count bigint NOT NULL,
  min_source_key varchar(256),
  max_source_key varchar(256),
  contract_hash char(64) NOT NULL,
  migration_set_hash char(64) NOT NULL,
  generated_by varchar(128) NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_biz_property_migration_evidence_kind
    CHECK (evidence_kind IN (
      'inventory', 'backfill', 'change_capture', 'mutation_replay',
      'shadow_compare', 'reconcile', 'constraint_validation', 'rollback_drill'
    )),
  CONSTRAINT ck_biz_property_migration_evidence_hashes
    CHECK (
      artifact_hash ~ '^[0-9a-f]{64}$'
      AND contract_hash ~ '^[0-9a-f]{64}$'
      AND migration_set_hash ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT ck_biz_property_migration_evidence_counts
    CHECK (row_count >= 0 AND anomaly_count >= 0),
  CONSTRAINT fk_biz_property_migration_evidence_checkpoint
    FOREIGN KEY (tenant_id, park_id, checkpoint_id)
    REFERENCES biz_property_runtime_checkpoint(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_migration_evidence_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_migration_evidence_run_kind
    UNIQUE (
      tenant_id, park_id, run_id, checkpoint_id, evidence_kind, artifact_hash
    )
);
CREATE INDEX IF NOT EXISTS idx_biz_property_migration_evidence_run
  ON biz_property_migration_evidence
    (tenant_id, park_id, run_id, checkpoint_id, generated_at, id);
CREATE OR REPLACE TRIGGER trg_biz_property_migration_evidence_immutable
BEFORE UPDATE OR DELETE ON biz_property_migration_evidence
FOR EACH ROW EXECUTE FUNCTION public.fn_property_migration_immutable();

REVOKE ALL ON FUNCTION public.fn_transition_property_migration_anomaly(
  varchar, varchar, uuid, integer, varchar, uuid, varchar, varchar
) FROM PUBLIC;
REVOKE UPDATE, DELETE ON biz_property_migration_anomaly FROM PUBLIC;
REVOKE UPDATE, DELETE ON biz_property_migration_anomaly_audit FROM PUBLIC;
REVOKE UPDATE, DELETE ON biz_property_migration_evidence FROM PUBLIC;




DO $signature_guard$
DECLARE
  unresolved text;
  object_row record;
  signature text;
  relation_name text;
  object_name text;
BEGIN
  SELECT string_agg(target.kind||E'\t'||target.name,E'\n'
                    ORDER BY target.kind COLLATE "C",target.name COLLATE "C")
  INTO unresolved
  FROM b0_catalog_target target
  LEFT JOIN b0_guard_catalog actual
    ON actual.kind=target.kind AND actual.name=target.name
  WHERE actual.name IS NULL;
  IF unresolved IS NOT NULL THEN
    RAISE EXCEPTION 'b0-structural-object-missing:%',E'\n'||unresolved
      USING ERRCODE='23514';
  END IF;

  FOR object_row IN
    SELECT catalog.*,
      encode(digest(convert_to(catalog.definition::text,'UTF8'),'sha256'),'hex') AS definition_hash
    FROM b0_guard_catalog catalog
    LEFT JOIN b0_preexisting_catalog_object old
      ON old.kind=catalog.kind AND old.name=catalog.name
    WHERE old.name IS NULL
    ORDER BY catalog.kind COLLATE "C",catalog.name COLLATE "C"
  LOOP
    signature := 'b0-catalog-v1:'||object_row.definition_hash;
    IF object_row.kind='table' THEN
      EXECUTE format('COMMENT ON TABLE %s IS %L',object_row.name,signature);
    ELSIF object_row.kind='column' THEN
      EXECUTE format('COMMENT ON COLUMN %s IS %L',object_row.name,signature);
    ELSIF object_row.kind='index' THEN
      EXECUTE format('COMMENT ON INDEX %s IS %L',object_row.name,signature);
    ELSIF object_row.kind='function' THEN
      EXECUTE format('COMMENT ON FUNCTION %s IS %L',object_row.name,signature);
    ELSIF object_row.kind IN ('constraint','trigger') THEN
      relation_name := regexp_replace(object_row.name,'\.[^.]+$','');
      object_name := substring(object_row.name from '[^.]+$');
      IF object_row.kind='constraint' THEN
        EXECUTE format('COMMENT ON CONSTRAINT %I ON %s IS %L',
          object_name,relation_name,signature);
      ELSE
        EXECUTE format('COMMENT ON TRIGGER %I ON %s IS %L',
          object_name,relation_name,signature);
      END IF;
    END IF;
  END LOOP;

  SELECT string_agg(kind||E'\t'||name,E'\n'
                    ORDER BY kind COLLATE "C",name COLLATE "C")
  INTO unresolved
  FROM b0_guard_catalog
  WHERE signature_comment IS DISTINCT FROM
    'b0-catalog-v1:'||
    encode(digest(convert_to(definition::text,'UTF8'),'sha256'),'hex');
  IF unresolved IS NOT NULL THEN
    RAISE EXCEPTION 'b0-definition-signature-write-failed:%',E'\n'||unresolved
      USING ERRCODE='23514';
  END IF;
END;
$signature_guard$;
-- B0_DEFINITION_SIGNATURE_GUARD_END

COMMIT;
