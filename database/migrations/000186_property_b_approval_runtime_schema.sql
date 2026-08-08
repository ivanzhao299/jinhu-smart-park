BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- B0_CATALOG_OBJECTS_START
-- B0_CATALOG_OBJECT column	public.biz_property_approval_actor_exclusion.actor_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_actor_exclusion.created_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_actor_exclusion.id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_actor_exclusion.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_actor_exclusion.reason_code
-- B0_CATALOG_OBJECT column	public.biz_property_approval_actor_exclusion.request_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_actor_exclusion.source_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_actor_exclusion.source_type
-- B0_CATALOG_OBJECT column	public.biz_property_approval_actor_exclusion.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.action_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.actor_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.decision_version
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.execution_version
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.from_decision_status
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.from_execution_status
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.incident_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.occurred_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.payload_hash
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.reason
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.request_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.to_decision_status
-- B0_CATALOG_OBJECT column	public.biz_property_approval_audit.to_execution_status
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.actor_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.actor_permission_snapshot
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.decided_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.decision
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.decision_payload_hash
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.reason
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.request_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.stage_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.supersedes_decision_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_decision.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.action_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.amount
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.attempt_count
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.business_intent_key
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.canonical_payload
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.claim_epoch
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.claim_token
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.client_idempotency_key
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.created_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.currency
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.decided_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.decision_status
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.decision_version
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.executed_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.execution_idempotency_key
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.execution_status
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.execution_version
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.heartbeat_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.infra_exhausted_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.last_error_category
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.last_error_code
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.last_error_redacted_message
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.lease_expires_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.next_retry_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.payload_hash
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.payload_schema_version
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.policy_hash
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.policy_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.policy_version
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.reconcile_required
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.requester_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.source_expected_version
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.source_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.source_type
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.submitted_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.submitter_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.updated_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_request.worker_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.approved_count
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.created_at
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.eligibility_policy_hash
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.eligibility_policy_snapshot
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.eligibility_policy_version
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.rejected_count
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.request_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.required_count
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.stage_code
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.stage_ordinal
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.stage_status
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_approval_stage.version
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.created_at
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.currency
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.effect_kind
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.effect_line_key
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.effect_ordinal
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.expected_cardinality
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.id
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.invariant_hash
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.line_amount
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.owning_table
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.owning_unique_name
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.request_id
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_manifest.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.created_at
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.currency
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.domain_row_id
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.domain_table
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.effect_hash
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.effect_kind
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.effect_line_key
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.effect_ordinal
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.execution_idempotency_key
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.id
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.line_amount
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.manifest_id
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.request_id
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.action_id
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.actor_id
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.client_key
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.completed_at
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.created_at
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.id
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.receipt_status
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.request_hash
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.result_hash
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.result_ref
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.target_id
-- B0_CATALOG_OBJECT column	public.biz_property_mutation_receipt.tenant_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_actor_exclusion.biz_property_approval_actor_exclusion_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_actor_exclusion.fk_biz_property_approval_exclusion_request
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_actor_exclusion.uq_biz_property_approval_exclusion_actor_reason
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_actor_exclusion.uq_biz_property_approval_exclusion_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_audit.biz_property_approval_audit_decision_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_audit.biz_property_approval_audit_execution_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_audit.biz_property_approval_audit_payload_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_audit.biz_property_approval_audit_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_audit.fk_biz_property_approval_audit_request
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_audit.uq_biz_property_approval_audit_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_decision.biz_property_approval_decision_actor_permission_snapshot_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_decision.biz_property_approval_decision_decision_payload_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_decision.biz_property_approval_decision_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_decision.ck_biz_property_approval_decision_reason
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_decision.ck_biz_property_approval_decision_value
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_decision.fk_biz_property_approval_decision_request
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_decision.fk_biz_property_approval_decision_stage
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_decision.fk_biz_property_approval_decision_supersedes
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_decision.uq_biz_property_approval_decision_actor
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_decision.uq_biz_property_approval_decision_request_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_decision.uq_biz_property_approval_decision_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.biz_property_approval_request_attempt_count_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.biz_property_approval_request_canonical_payload_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.biz_property_approval_request_claim_epoch_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.biz_property_approval_request_decision_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.biz_property_approval_request_execution_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.biz_property_approval_request_payload_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.biz_property_approval_request_payload_schema_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.biz_property_approval_request_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.biz_property_approval_request_policy_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.biz_property_approval_request_policy_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.biz_property_approval_request_source_expected_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.ck_biz_property_approval_request_amount_currency
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.ck_biz_property_approval_request_claim
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.ck_biz_property_approval_request_decision_status
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.ck_biz_property_approval_request_executed
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.ck_biz_property_approval_request_execution_failed
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.ck_biz_property_approval_request_execution_status
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.ck_biz_property_approval_request_infra_exhausted
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.ck_biz_property_approval_request_retry
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.ck_biz_property_approval_request_status_pair
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.uq_biz_property_approval_request_client_key
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.uq_biz_property_approval_request_currency
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.uq_biz_property_approval_request_execution_key
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.uq_biz_property_approval_request_id_execution_key
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.uq_biz_property_approval_request_intent
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_request.uq_biz_property_approval_request_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.biz_property_approval_stage_approved_count_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.biz_property_approval_stage_eligibility_policy_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.biz_property_approval_stage_eligibility_policy_snapshot_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.biz_property_approval_stage_eligibility_policy_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.biz_property_approval_stage_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.biz_property_approval_stage_rejected_count_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.biz_property_approval_stage_required_count_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.biz_property_approval_stage_stage_ordinal_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.biz_property_approval_stage_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.ck_biz_property_approval_stage_counts
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.ck_biz_property_approval_stage_status
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.fk_biz_property_approval_stage_request
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.uq_biz_property_approval_stage_code
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.uq_biz_property_approval_stage_ordinal
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.uq_biz_property_approval_stage_request_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_approval_stage.uq_biz_property_approval_stage_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_manifest.biz_property_execution_effect_manifest_effect_ordinal_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_manifest.biz_property_execution_effect_manife_expected_cardinality_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_manifest.biz_property_execution_effect_manifest_invariant_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_manifest.biz_property_execution_effect_manifest_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_manifest.ck_biz_property_effect_manifest_kind
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_manifest.fk_biz_property_effect_manifest_currency
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_manifest.fk_biz_property_effect_manifest_request
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_manifest.uq_biz_property_effect_manifest_line
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_manifest.uq_biz_property_effect_manifest_ordinal
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_manifest.uq_biz_property_effect_manifest_request_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_manifest.uq_biz_property_effect_manifest_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.biz_property_execution_effect_receipt_effect_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.biz_property_execution_effect_receipt_effect_ordinal_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.biz_property_execution_effect_receipt_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.ck_biz_property_effect_receipt_kind
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.fk_biz_property_effect_receipt_currency
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.fk_biz_property_effect_receipt_manifest
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.fk_biz_property_effect_receipt_request
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.uq_biz_property_effect_receipt_line
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.uq_biz_property_effect_receipt_ordinal
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.uq_biz_property_effect_receipt_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_mutation_receipt.biz_property_mutation_receipt_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_mutation_receipt.biz_property_mutation_receipt_request_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_mutation_receipt.biz_property_mutation_receipt_result_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_mutation_receipt.ck_biz_property_mutation_receipt_completed
-- B0_CATALOG_OBJECT constraint	public.biz_property_mutation_receipt.ck_biz_property_mutation_receipt_status
-- B0_CATALOG_OBJECT constraint	public.biz_property_mutation_receipt.uq_biz_property_mutation_receipt_client
-- B0_CATALOG_OBJECT constraint	public.biz_property_mutation_receipt.uq_biz_property_mutation_receipt_scope_id
-- B0_CATALOG_OBJECT function	public.fn_property_approval_immutable()
-- B0_CATALOG_OBJECT function	public.fn_validate_property_execution_terminal()
-- B0_CATALOG_OBJECT index	public.biz_property_approval_actor_exclusion_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_approval_audit_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_approval_decision_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_approval_request_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_approval_stage_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_execution_effect_manifest_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_execution_effect_receipt_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_mutation_receipt_pkey
-- B0_CATALOG_OBJECT index	public.idx_property_approval_lease
-- B0_CATALOG_OBJECT index	public.idx_property_approval_queue
-- B0_CATALOG_OBJECT index	public.idx_property_approval_retry
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_audit_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_decision_actor
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_decision_request_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_decision_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_exclusion_actor_reason
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_exclusion_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_request_active_source
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_request_client_key
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_request_currency
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_request_execution_key
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_request_id_execution_key
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_request_intent
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_request_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_stage_code
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_stage_ordinal
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_stage_request_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_approval_stage_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_effect_manifest_line
-- B0_CATALOG_OBJECT index	public.uq_biz_property_effect_manifest_ordinal
-- B0_CATALOG_OBJECT index	public.uq_biz_property_effect_manifest_request_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_effect_manifest_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_effect_receipt_line
-- B0_CATALOG_OBJECT index	public.uq_biz_property_effect_receipt_ordinal
-- B0_CATALOG_OBJECT index	public.uq_biz_property_effect_receipt_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_mutation_receipt_client
-- B0_CATALOG_OBJECT index	public.uq_biz_property_mutation_receipt_scope_id
-- B0_CATALOG_OBJECT table	public.biz_property_approval_actor_exclusion
-- B0_CATALOG_OBJECT table	public.biz_property_approval_audit
-- B0_CATALOG_OBJECT table	public.biz_property_approval_decision
-- B0_CATALOG_OBJECT table	public.biz_property_approval_request
-- B0_CATALOG_OBJECT table	public.biz_property_approval_stage
-- B0_CATALOG_OBJECT table	public.biz_property_execution_effect_manifest
-- B0_CATALOG_OBJECT table	public.biz_property_execution_effect_receipt
-- B0_CATALOG_OBJECT table	public.biz_property_mutation_receipt
-- B0_CATALOG_OBJECT trigger	public.biz_property_approval_audit.trg_biz_property_approval_audit_immutable
-- B0_CATALOG_OBJECT trigger	public.biz_property_approval_decision.trg_biz_property_approval_decision_immutable
-- B0_CATALOG_OBJECT trigger	public.biz_property_approval_request.trg_biz_property_execution_terminal_validation
-- B0_CATALOG_OBJECT trigger	public.biz_property_execution_effect_manifest.trg_biz_property_effect_manifest_immutable
-- B0_CATALOG_OBJECT trigger	public.biz_property_execution_effect_receipt.trg_biz_property_effect_receipt_immutable
-- B0_CATALOG_OBJECTS_END

-- B0_DEFINITION_SIGNATURE_GUARD_START
CREATE TEMP TABLE b0_catalog_target (
  kind text NOT NULL CHECK (kind IN
    ('table','column','constraint','index','function','trigger','definition-row')),
  name text NOT NULL,
  PRIMARY KEY (kind,name)
) ON COMMIT DROP;
INSERT INTO b0_catalog_target(kind,name) VALUES
  ('column','public.biz_property_approval_actor_exclusion.actor_id'),
  ('column','public.biz_property_approval_actor_exclusion.created_at'),
  ('column','public.biz_property_approval_actor_exclusion.id'),
  ('column','public.biz_property_approval_actor_exclusion.park_id'),
  ('column','public.biz_property_approval_actor_exclusion.reason_code'),
  ('column','public.biz_property_approval_actor_exclusion.request_id'),
  ('column','public.biz_property_approval_actor_exclusion.source_id'),
  ('column','public.biz_property_approval_actor_exclusion.source_type'),
  ('column','public.biz_property_approval_actor_exclusion.tenant_id'),
  ('column','public.biz_property_approval_audit.action_id'),
  ('column','public.biz_property_approval_audit.actor_id'),
  ('column','public.biz_property_approval_audit.decision_version'),
  ('column','public.biz_property_approval_audit.execution_version'),
  ('column','public.biz_property_approval_audit.from_decision_status'),
  ('column','public.biz_property_approval_audit.from_execution_status'),
  ('column','public.biz_property_approval_audit.id'),
  ('column','public.biz_property_approval_audit.incident_id'),
  ('column','public.biz_property_approval_audit.occurred_at'),
  ('column','public.biz_property_approval_audit.park_id'),
  ('column','public.biz_property_approval_audit.payload_hash'),
  ('column','public.biz_property_approval_audit.reason'),
  ('column','public.biz_property_approval_audit.request_id'),
  ('column','public.biz_property_approval_audit.tenant_id'),
  ('column','public.biz_property_approval_audit.to_decision_status'),
  ('column','public.biz_property_approval_audit.to_execution_status'),
  ('column','public.biz_property_approval_decision.actor_id'),
  ('column','public.biz_property_approval_decision.actor_permission_snapshot'),
  ('column','public.biz_property_approval_decision.decided_at'),
  ('column','public.biz_property_approval_decision.decision'),
  ('column','public.biz_property_approval_decision.decision_payload_hash'),
  ('column','public.biz_property_approval_decision.id'),
  ('column','public.biz_property_approval_decision.park_id'),
  ('column','public.biz_property_approval_decision.reason'),
  ('column','public.biz_property_approval_decision.request_id'),
  ('column','public.biz_property_approval_decision.stage_id'),
  ('column','public.biz_property_approval_decision.supersedes_decision_id'),
  ('column','public.biz_property_approval_decision.tenant_id'),
  ('column','public.biz_property_approval_request.action_id'),
  ('column','public.biz_property_approval_request.amount'),
  ('column','public.biz_property_approval_request.attempt_count'),
  ('column','public.biz_property_approval_request.business_intent_key'),
  ('column','public.biz_property_approval_request.canonical_payload'),
  ('column','public.biz_property_approval_request.claim_epoch'),
  ('column','public.biz_property_approval_request.claim_token'),
  ('column','public.biz_property_approval_request.client_idempotency_key'),
  ('column','public.biz_property_approval_request.created_at'),
  ('column','public.biz_property_approval_request.currency'),
  ('column','public.biz_property_approval_request.decided_at'),
  ('column','public.biz_property_approval_request.decision_status'),
  ('column','public.biz_property_approval_request.decision_version'),
  ('column','public.biz_property_approval_request.executed_at'),
  ('column','public.biz_property_approval_request.execution_idempotency_key'),
  ('column','public.biz_property_approval_request.execution_status'),
  ('column','public.biz_property_approval_request.execution_version'),
  ('column','public.biz_property_approval_request.heartbeat_at'),
  ('column','public.biz_property_approval_request.id'),
  ('column','public.biz_property_approval_request.infra_exhausted_at'),
  ('column','public.biz_property_approval_request.last_error_category'),
  ('column','public.biz_property_approval_request.last_error_code'),
  ('column','public.biz_property_approval_request.last_error_redacted_message'),
  ('column','public.biz_property_approval_request.lease_expires_at'),
  ('column','public.biz_property_approval_request.next_retry_at'),
  ('column','public.biz_property_approval_request.park_id'),
  ('column','public.biz_property_approval_request.payload_hash'),
  ('column','public.biz_property_approval_request.payload_schema_version'),
  ('column','public.biz_property_approval_request.policy_hash'),
  ('column','public.biz_property_approval_request.policy_id'),
  ('column','public.biz_property_approval_request.policy_version'),
  ('column','public.biz_property_approval_request.reconcile_required'),
  ('column','public.biz_property_approval_request.requester_id'),
  ('column','public.biz_property_approval_request.source_expected_version'),
  ('column','public.biz_property_approval_request.source_id'),
  ('column','public.biz_property_approval_request.source_type'),
  ('column','public.biz_property_approval_request.submitted_at'),
  ('column','public.biz_property_approval_request.submitter_id'),
  ('column','public.biz_property_approval_request.tenant_id'),
  ('column','public.biz_property_approval_request.updated_at'),
  ('column','public.biz_property_approval_request.worker_id'),
  ('column','public.biz_property_approval_stage.approved_count'),
  ('column','public.biz_property_approval_stage.created_at'),
  ('column','public.biz_property_approval_stage.eligibility_policy_hash'),
  ('column','public.biz_property_approval_stage.eligibility_policy_snapshot'),
  ('column','public.biz_property_approval_stage.eligibility_policy_version'),
  ('column','public.biz_property_approval_stage.id'),
  ('column','public.biz_property_approval_stage.park_id'),
  ('column','public.biz_property_approval_stage.rejected_count'),
  ('column','public.biz_property_approval_stage.request_id'),
  ('column','public.biz_property_approval_stage.required_count'),
  ('column','public.biz_property_approval_stage.stage_code'),
  ('column','public.biz_property_approval_stage.stage_ordinal'),
  ('column','public.biz_property_approval_stage.stage_status'),
  ('column','public.biz_property_approval_stage.tenant_id'),
  ('column','public.biz_property_approval_stage.version'),
  ('column','public.biz_property_execution_effect_manifest.created_at'),
  ('column','public.biz_property_execution_effect_manifest.currency'),
  ('column','public.biz_property_execution_effect_manifest.effect_kind'),
  ('column','public.biz_property_execution_effect_manifest.effect_line_key'),
  ('column','public.biz_property_execution_effect_manifest.effect_ordinal'),
  ('column','public.biz_property_execution_effect_manifest.expected_cardinality'),
  ('column','public.biz_property_execution_effect_manifest.id'),
  ('column','public.biz_property_execution_effect_manifest.invariant_hash'),
  ('column','public.biz_property_execution_effect_manifest.line_amount'),
  ('column','public.biz_property_execution_effect_manifest.owning_table'),
  ('column','public.biz_property_execution_effect_manifest.owning_unique_name'),
  ('column','public.biz_property_execution_effect_manifest.park_id'),
  ('column','public.biz_property_execution_effect_manifest.request_id'),
  ('column','public.biz_property_execution_effect_manifest.tenant_id'),
  ('column','public.biz_property_execution_effect_receipt.created_at'),
  ('column','public.biz_property_execution_effect_receipt.currency'),
  ('column','public.biz_property_execution_effect_receipt.domain_row_id'),
  ('column','public.biz_property_execution_effect_receipt.domain_table'),
  ('column','public.biz_property_execution_effect_receipt.effect_hash'),
  ('column','public.biz_property_execution_effect_receipt.effect_kind'),
  ('column','public.biz_property_execution_effect_receipt.effect_line_key'),
  ('column','public.biz_property_execution_effect_receipt.effect_ordinal'),
  ('column','public.biz_property_execution_effect_receipt.execution_idempotency_key'),
  ('column','public.biz_property_execution_effect_receipt.id'),
  ('column','public.biz_property_execution_effect_receipt.line_amount'),
  ('column','public.biz_property_execution_effect_receipt.manifest_id'),
  ('column','public.biz_property_execution_effect_receipt.park_id'),
  ('column','public.biz_property_execution_effect_receipt.request_id'),
  ('column','public.biz_property_execution_effect_receipt.tenant_id'),
  ('column','public.biz_property_mutation_receipt.action_id'),
  ('column','public.biz_property_mutation_receipt.actor_id'),
  ('column','public.biz_property_mutation_receipt.client_key'),
  ('column','public.biz_property_mutation_receipt.completed_at'),
  ('column','public.biz_property_mutation_receipt.created_at'),
  ('column','public.biz_property_mutation_receipt.id'),
  ('column','public.biz_property_mutation_receipt.park_id'),
  ('column','public.biz_property_mutation_receipt.receipt_status'),
  ('column','public.biz_property_mutation_receipt.request_hash'),
  ('column','public.biz_property_mutation_receipt.result_hash'),
  ('column','public.biz_property_mutation_receipt.result_ref'),
  ('column','public.biz_property_mutation_receipt.target_id'),
  ('column','public.biz_property_mutation_receipt.tenant_id'),
  ('constraint','public.biz_property_approval_actor_exclusion.biz_property_approval_actor_exclusion_pkey'),
  ('constraint','public.biz_property_approval_actor_exclusion.fk_biz_property_approval_exclusion_request'),
  ('constraint','public.biz_property_approval_actor_exclusion.uq_biz_property_approval_exclusion_actor_reason'),
  ('constraint','public.biz_property_approval_actor_exclusion.uq_biz_property_approval_exclusion_scope_id'),
  ('constraint','public.biz_property_approval_audit.biz_property_approval_audit_decision_version_check'),
  ('constraint','public.biz_property_approval_audit.biz_property_approval_audit_execution_version_check'),
  ('constraint','public.biz_property_approval_audit.biz_property_approval_audit_payload_hash_check'),
  ('constraint','public.biz_property_approval_audit.biz_property_approval_audit_pkey'),
  ('constraint','public.biz_property_approval_audit.fk_biz_property_approval_audit_request'),
  ('constraint','public.biz_property_approval_audit.uq_biz_property_approval_audit_scope_id'),
  ('constraint','public.biz_property_approval_decision.biz_property_approval_decision_actor_permission_snapshot_check'),
  ('constraint','public.biz_property_approval_decision.biz_property_approval_decision_decision_payload_hash_check'),
  ('constraint','public.biz_property_approval_decision.biz_property_approval_decision_pkey'),
  ('constraint','public.biz_property_approval_decision.ck_biz_property_approval_decision_reason'),
  ('constraint','public.biz_property_approval_decision.ck_biz_property_approval_decision_value'),
  ('constraint','public.biz_property_approval_decision.fk_biz_property_approval_decision_request'),
  ('constraint','public.biz_property_approval_decision.fk_biz_property_approval_decision_stage'),
  ('constraint','public.biz_property_approval_decision.fk_biz_property_approval_decision_supersedes'),
  ('constraint','public.biz_property_approval_decision.uq_biz_property_approval_decision_actor'),
  ('constraint','public.biz_property_approval_decision.uq_biz_property_approval_decision_request_id'),
  ('constraint','public.biz_property_approval_decision.uq_biz_property_approval_decision_scope_id'),
  ('constraint','public.biz_property_approval_request.biz_property_approval_request_attempt_count_check'),
  ('constraint','public.biz_property_approval_request.biz_property_approval_request_canonical_payload_check'),
  ('constraint','public.biz_property_approval_request.biz_property_approval_request_claim_epoch_check'),
  ('constraint','public.biz_property_approval_request.biz_property_approval_request_decision_version_check'),
  ('constraint','public.biz_property_approval_request.biz_property_approval_request_execution_version_check'),
  ('constraint','public.biz_property_approval_request.biz_property_approval_request_payload_hash_check'),
  ('constraint','public.biz_property_approval_request.biz_property_approval_request_payload_schema_version_check'),
  ('constraint','public.biz_property_approval_request.biz_property_approval_request_pkey'),
  ('constraint','public.biz_property_approval_request.biz_property_approval_request_policy_hash_check'),
  ('constraint','public.biz_property_approval_request.biz_property_approval_request_policy_version_check'),
  ('constraint','public.biz_property_approval_request.biz_property_approval_request_source_expected_version_check'),
  ('constraint','public.biz_property_approval_request.ck_biz_property_approval_request_amount_currency'),
  ('constraint','public.biz_property_approval_request.ck_biz_property_approval_request_claim'),
  ('constraint','public.biz_property_approval_request.ck_biz_property_approval_request_decision_status'),
  ('constraint','public.biz_property_approval_request.ck_biz_property_approval_request_executed'),
  ('constraint','public.biz_property_approval_request.ck_biz_property_approval_request_execution_failed'),
  ('constraint','public.biz_property_approval_request.ck_biz_property_approval_request_execution_status'),
  ('constraint','public.biz_property_approval_request.ck_biz_property_approval_request_infra_exhausted'),
  ('constraint','public.biz_property_approval_request.ck_biz_property_approval_request_retry'),
  ('constraint','public.biz_property_approval_request.ck_biz_property_approval_request_status_pair'),
  ('constraint','public.biz_property_approval_request.uq_biz_property_approval_request_client_key'),
  ('constraint','public.biz_property_approval_request.uq_biz_property_approval_request_currency'),
  ('constraint','public.biz_property_approval_request.uq_biz_property_approval_request_execution_key'),
  ('constraint','public.biz_property_approval_request.uq_biz_property_approval_request_id_execution_key'),
  ('constraint','public.biz_property_approval_request.uq_biz_property_approval_request_intent'),
  ('constraint','public.biz_property_approval_request.uq_biz_property_approval_request_scope_id'),
  ('constraint','public.biz_property_approval_stage.biz_property_approval_stage_approved_count_check'),
  ('constraint','public.biz_property_approval_stage.biz_property_approval_stage_eligibility_policy_hash_check'),
  ('constraint','public.biz_property_approval_stage.biz_property_approval_stage_eligibility_policy_snapshot_check'),
  ('constraint','public.biz_property_approval_stage.biz_property_approval_stage_eligibility_policy_version_check'),
  ('constraint','public.biz_property_approval_stage.biz_property_approval_stage_pkey'),
  ('constraint','public.biz_property_approval_stage.biz_property_approval_stage_rejected_count_check'),
  ('constraint','public.biz_property_approval_stage.biz_property_approval_stage_required_count_check'),
  ('constraint','public.biz_property_approval_stage.biz_property_approval_stage_stage_ordinal_check'),
  ('constraint','public.biz_property_approval_stage.biz_property_approval_stage_version_check'),
  ('constraint','public.biz_property_approval_stage.ck_biz_property_approval_stage_counts'),
  ('constraint','public.biz_property_approval_stage.ck_biz_property_approval_stage_status'),
  ('constraint','public.biz_property_approval_stage.fk_biz_property_approval_stage_request'),
  ('constraint','public.biz_property_approval_stage.uq_biz_property_approval_stage_code'),
  ('constraint','public.biz_property_approval_stage.uq_biz_property_approval_stage_ordinal'),
  ('constraint','public.biz_property_approval_stage.uq_biz_property_approval_stage_request_id'),
  ('constraint','public.biz_property_approval_stage.uq_biz_property_approval_stage_scope_id'),
  ('constraint','public.biz_property_execution_effect_manifest.biz_property_execution_effect_manifest_effect_ordinal_check'),
  ('constraint','public.biz_property_execution_effect_manifest.biz_property_execution_effect_manife_expected_cardinality_check'),
  ('constraint','public.biz_property_execution_effect_manifest.biz_property_execution_effect_manifest_invariant_hash_check'),
  ('constraint','public.biz_property_execution_effect_manifest.biz_property_execution_effect_manifest_pkey'),
  ('constraint','public.biz_property_execution_effect_manifest.ck_biz_property_effect_manifest_kind'),
  ('constraint','public.biz_property_execution_effect_manifest.fk_biz_property_effect_manifest_currency'),
  ('constraint','public.biz_property_execution_effect_manifest.fk_biz_property_effect_manifest_request'),
  ('constraint','public.biz_property_execution_effect_manifest.uq_biz_property_effect_manifest_line'),
  ('constraint','public.biz_property_execution_effect_manifest.uq_biz_property_effect_manifest_ordinal'),
  ('constraint','public.biz_property_execution_effect_manifest.uq_biz_property_effect_manifest_request_id'),
  ('constraint','public.biz_property_execution_effect_manifest.uq_biz_property_effect_manifest_scope_id'),
  ('constraint','public.biz_property_execution_effect_receipt.biz_property_execution_effect_receipt_effect_hash_check'),
  ('constraint','public.biz_property_execution_effect_receipt.biz_property_execution_effect_receipt_effect_ordinal_check'),
  ('constraint','public.biz_property_execution_effect_receipt.biz_property_execution_effect_receipt_pkey'),
  ('constraint','public.biz_property_execution_effect_receipt.ck_biz_property_effect_receipt_kind'),
  ('constraint','public.biz_property_execution_effect_receipt.fk_biz_property_effect_receipt_currency'),
  ('constraint','public.biz_property_execution_effect_receipt.fk_biz_property_effect_receipt_manifest'),
  ('constraint','public.biz_property_execution_effect_receipt.fk_biz_property_effect_receipt_request'),
  ('constraint','public.biz_property_execution_effect_receipt.uq_biz_property_effect_receipt_line'),
  ('constraint','public.biz_property_execution_effect_receipt.uq_biz_property_effect_receipt_ordinal'),
  ('constraint','public.biz_property_execution_effect_receipt.uq_biz_property_effect_receipt_scope_id'),
  ('constraint','public.biz_property_mutation_receipt.biz_property_mutation_receipt_pkey'),
  ('constraint','public.biz_property_mutation_receipt.biz_property_mutation_receipt_request_hash_check'),
  ('constraint','public.biz_property_mutation_receipt.biz_property_mutation_receipt_result_hash_check'),
  ('constraint','public.biz_property_mutation_receipt.ck_biz_property_mutation_receipt_completed'),
  ('constraint','public.biz_property_mutation_receipt.ck_biz_property_mutation_receipt_status'),
  ('constraint','public.biz_property_mutation_receipt.uq_biz_property_mutation_receipt_client'),
  ('constraint','public.biz_property_mutation_receipt.uq_biz_property_mutation_receipt_scope_id'),
  ('function','public.fn_property_approval_immutable()'),
  ('function','public.fn_validate_property_execution_terminal()'),
  ('index','public.biz_property_approval_actor_exclusion_pkey'),
  ('index','public.biz_property_approval_audit_pkey'),
  ('index','public.biz_property_approval_decision_pkey'),
  ('index','public.biz_property_approval_request_pkey'),
  ('index','public.biz_property_approval_stage_pkey'),
  ('index','public.biz_property_execution_effect_manifest_pkey'),
  ('index','public.biz_property_execution_effect_receipt_pkey'),
  ('index','public.biz_property_mutation_receipt_pkey'),
  ('index','public.idx_property_approval_lease'),
  ('index','public.idx_property_approval_queue'),
  ('index','public.idx_property_approval_retry'),
  ('index','public.uq_biz_property_approval_audit_scope_id'),
  ('index','public.uq_biz_property_approval_decision_actor'),
  ('index','public.uq_biz_property_approval_decision_request_id'),
  ('index','public.uq_biz_property_approval_decision_scope_id'),
  ('index','public.uq_biz_property_approval_exclusion_actor_reason'),
  ('index','public.uq_biz_property_approval_exclusion_scope_id'),
  ('index','public.uq_biz_property_approval_request_active_source'),
  ('index','public.uq_biz_property_approval_request_client_key'),
  ('index','public.uq_biz_property_approval_request_currency'),
  ('index','public.uq_biz_property_approval_request_execution_key'),
  ('index','public.uq_biz_property_approval_request_id_execution_key'),
  ('index','public.uq_biz_property_approval_request_intent'),
  ('index','public.uq_biz_property_approval_request_scope_id'),
  ('index','public.uq_biz_property_approval_stage_code'),
  ('index','public.uq_biz_property_approval_stage_ordinal'),
  ('index','public.uq_biz_property_approval_stage_request_id'),
  ('index','public.uq_biz_property_approval_stage_scope_id'),
  ('index','public.uq_biz_property_effect_manifest_line'),
  ('index','public.uq_biz_property_effect_manifest_ordinal'),
  ('index','public.uq_biz_property_effect_manifest_request_id'),
  ('index','public.uq_biz_property_effect_manifest_scope_id'),
  ('index','public.uq_biz_property_effect_receipt_line'),
  ('index','public.uq_biz_property_effect_receipt_ordinal'),
  ('index','public.uq_biz_property_effect_receipt_scope_id'),
  ('index','public.uq_biz_property_mutation_receipt_client'),
  ('index','public.uq_biz_property_mutation_receipt_scope_id'),
  ('table','public.biz_property_approval_actor_exclusion'),
  ('table','public.biz_property_approval_audit'),
  ('table','public.biz_property_approval_decision'),
  ('table','public.biz_property_approval_request'),
  ('table','public.biz_property_approval_stage'),
  ('table','public.biz_property_execution_effect_manifest'),
  ('table','public.biz_property_execution_effect_receipt'),
  ('table','public.biz_property_mutation_receipt'),
  ('trigger','public.biz_property_approval_audit.trg_biz_property_approval_audit_immutable'),
  ('trigger','public.biz_property_approval_decision.trg_biz_property_approval_decision_immutable'),
  ('trigger','public.biz_property_approval_request.trg_biz_property_execution_terminal_validation'),
  ('trigger','public.biz_property_execution_effect_manifest.trg_biz_property_effect_manifest_immutable'),
  ('trigger','public.biz_property_execution_effect_receipt.trg_biz_property_effect_receipt_immutable');
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

CREATE TABLE IF NOT EXISTS biz_property_approval_request (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  action_id varchar(128) NOT NULL,
  source_type varchar(64) NOT NULL,
  source_id uuid NOT NULL,
  source_expected_version integer NOT NULL CHECK (source_expected_version > 0),
  requester_id uuid NOT NULL,
  submitter_id uuid NOT NULL,
  client_idempotency_key varchar(128) NOT NULL,
  business_intent_key varchar(128) NOT NULL,
  canonical_payload jsonb NOT NULL CHECK (jsonb_typeof(canonical_payload) = 'object'),
  payload_schema_version integer NOT NULL CHECK (payload_schema_version > 0),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  amount numeric(18,2),
  currency varchar(8),
  policy_id uuid NOT NULL,
  policy_version integer NOT NULL CHECK (policy_version > 0),
  policy_hash char(64) NOT NULL CHECK (policy_hash ~ '^[0-9a-f]{64}$'),
  decision_status varchar(32) NOT NULL DEFAULT 'draft',
  execution_status varchar(32) NOT NULL DEFAULT 'not_started',
  decision_version integer NOT NULL DEFAULT 1 CHECK (decision_version > 0),
  execution_version integer NOT NULL DEFAULT 1 CHECK (execution_version > 0),
  execution_idempotency_key varchar(128) NOT NULL,
  claim_epoch bigint NOT NULL DEFAULT 0 CHECK (claim_epoch >= 0),
  claim_token uuid,
  worker_id varchar(128),
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_retry_at timestamptz,
  reconcile_required boolean NOT NULL DEFAULT false,
  last_error_category varchar(32),
  last_error_code varchar(128),
  last_error_redacted_message varchar(500),
  infra_exhausted_at timestamptz,
  submitted_at timestamptz,
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_property_approval_request_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_approval_request_client_key
    UNIQUE (tenant_id, park_id, requester_id, action_id, client_idempotency_key),
  CONSTRAINT uq_biz_property_approval_request_intent
    UNIQUE (tenant_id, park_id, action_id, business_intent_key),
  CONSTRAINT uq_biz_property_approval_request_execution_key
    UNIQUE (tenant_id, park_id, execution_idempotency_key),
  CONSTRAINT uq_biz_property_approval_request_id_execution_key
    UNIQUE (tenant_id, park_id, id, execution_idempotency_key),
  CONSTRAINT uq_biz_property_approval_request_currency
    UNIQUE (tenant_id, park_id, id, currency),
  CONSTRAINT ck_biz_property_approval_request_decision_status
    CHECK (decision_status IN (
      'draft', 'submitted', 'pending_approval', 'approved',
      'rejected', 'withdrawn', 'expired'
    )),
  CONSTRAINT ck_biz_property_approval_request_execution_status
    CHECK (execution_status IN (
      'not_started', 'executing', 'retry_wait', 'executed',
      'execution_failed', 'infra_exhausted', 'not_required'
    )),
  CONSTRAINT ck_biz_property_approval_request_amount_currency
    CHECK (
      (amount IS NULL AND currency IS NULL)
      OR (amount IS NOT NULL AND amount >= 0 AND currency ~ '^[A-Z]{3}$')
    ),
  CONSTRAINT ck_biz_property_approval_request_status_pair
    CHECK (
      (decision_status IN ('draft', 'submitted', 'pending_approval')
       AND execution_status = 'not_started')
      OR
      (decision_status = 'approved'
       AND execution_status IN (
         'not_started', 'executing', 'retry_wait', 'executed',
         'execution_failed', 'infra_exhausted'
       ))
      OR
      (decision_status IN ('rejected', 'withdrawn', 'expired')
       AND execution_status = 'not_required')
    ),
  CONSTRAINT ck_biz_property_approval_request_claim
    CHECK (
      (execution_status = 'executing' AND claim_token IS NOT NULL
       AND worker_id IS NOT NULL AND lease_expires_at IS NOT NULL AND heartbeat_at IS NOT NULL)
      OR
      (execution_status <> 'executing' AND claim_token IS NULL
       AND worker_id IS NULL AND lease_expires_at IS NULL AND heartbeat_at IS NULL)
    ),
  CONSTRAINT ck_biz_property_approval_request_retry
    CHECK ((execution_status = 'retry_wait') = (next_retry_at IS NOT NULL)),
  CONSTRAINT ck_biz_property_approval_request_executed
    CHECK ((execution_status = 'executed') = (executed_at IS NOT NULL)),
  CONSTRAINT ck_biz_property_approval_request_execution_failed
    CHECK (
      execution_status <> 'execution_failed'
      OR (last_error_category IS NOT NULL AND last_error_code IS NOT NULL)
    ),
  CONSTRAINT ck_biz_property_approval_request_infra_exhausted
    CHECK (
      (execution_status = 'infra_exhausted')
      =
      (infra_exhausted_at IS NOT NULL AND last_error_category = 'infra'
       AND last_error_code IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_property_approval_request_active_source
  ON biz_property_approval_request
    (tenant_id, park_id, action_id, source_type, source_id, source_expected_version)
  WHERE decision_status IN ('draft', 'submitted', 'pending_approval', 'approved');

CREATE TABLE IF NOT EXISTS biz_property_approval_stage (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  request_id uuid NOT NULL,
  stage_code varchar(64) NOT NULL,
  stage_ordinal smallint NOT NULL CHECK (stage_ordinal > 0),
  eligibility_policy_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(eligibility_policy_snapshot) = 'object'),
  eligibility_policy_version integer NOT NULL CHECK (eligibility_policy_version > 0),
  eligibility_policy_hash char(64) NOT NULL
    CHECK (eligibility_policy_hash ~ '^[0-9a-f]{64}$'),
  required_count smallint NOT NULL CHECK (required_count > 0),
  approved_count smallint NOT NULL DEFAULT 0 CHECK (approved_count >= 0),
  rejected_count smallint NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  stage_status varchar(24) NOT NULL DEFAULT 'pending',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_biz_property_approval_stage_request
    FOREIGN KEY (tenant_id, park_id, request_id)
    REFERENCES biz_property_approval_request(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_approval_stage_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_approval_stage_request_id
    UNIQUE (tenant_id, park_id, request_id, id),
  CONSTRAINT uq_biz_property_approval_stage_code
    UNIQUE (tenant_id, park_id, request_id, stage_code),
  CONSTRAINT uq_biz_property_approval_stage_ordinal
    UNIQUE (tenant_id, park_id, request_id, stage_ordinal),
  CONSTRAINT ck_biz_property_approval_stage_status
    CHECK (stage_status IN ('pending', 'approved', 'rejected', 'expired')),
  CONSTRAINT ck_biz_property_approval_stage_counts
    CHECK (approved_count <= required_count AND rejected_count <= required_count)
);

CREATE TABLE IF NOT EXISTS biz_property_approval_decision (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  request_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  decision varchar(16) NOT NULL,
  reason varchar(1000),
  actor_permission_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(actor_permission_snapshot) = 'object'),
  decision_payload_hash char(64) NOT NULL
    CHECK (decision_payload_hash ~ '^[0-9a-f]{64}$'),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  supersedes_decision_id uuid,
  CONSTRAINT fk_biz_property_approval_decision_request
    FOREIGN KEY (tenant_id, park_id, request_id)
    REFERENCES biz_property_approval_request(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_property_approval_decision_stage
    FOREIGN KEY (tenant_id, park_id, request_id, stage_id)
    REFERENCES biz_property_approval_stage(tenant_id, park_id, request_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_property_approval_decision_supersedes
    FOREIGN KEY (tenant_id, park_id, supersedes_decision_id)
    REFERENCES biz_property_approval_decision(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_approval_decision_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_approval_decision_request_id
    UNIQUE (tenant_id, park_id, request_id, id),
  CONSTRAINT uq_biz_property_approval_decision_actor
    UNIQUE (tenant_id, park_id, request_id, actor_id),
  CONSTRAINT ck_biz_property_approval_decision_value CHECK (decision IN ('approve', 'reject')),
  CONSTRAINT ck_biz_property_approval_decision_reason
    CHECK (decision = 'approve' OR length(trim(reason)) > 0)
);

CREATE TABLE IF NOT EXISTS biz_property_approval_actor_exclusion (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  request_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  reason_code varchar(64) NOT NULL,
  source_type varchar(64) NOT NULL,
  source_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_biz_property_approval_exclusion_request
    FOREIGN KEY (tenant_id, park_id, request_id)
    REFERENCES biz_property_approval_request(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_approval_exclusion_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_approval_exclusion_actor_reason
    UNIQUE (tenant_id, park_id, request_id, actor_id, reason_code)
);

CREATE TABLE IF NOT EXISTS biz_property_approval_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  request_id uuid NOT NULL,
  actor_id uuid,
  action_id varchar(128) NOT NULL,
  from_decision_status varchar(32),
  to_decision_status varchar(32),
  from_execution_status varchar(32),
  to_execution_status varchar(32),
  decision_version integer NOT NULL CHECK (decision_version > 0),
  execution_version integer NOT NULL CHECK (execution_version > 0),
  incident_id varchar(128),
  reason varchar(1000),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_biz_property_approval_audit_request
    FOREIGN KEY (tenant_id, park_id, request_id)
    REFERENCES biz_property_approval_request(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_approval_audit_scope_id UNIQUE (tenant_id, park_id, id)
);

CREATE TABLE IF NOT EXISTS biz_property_execution_effect_manifest (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  request_id uuid NOT NULL,
  effect_kind varchar(128) NOT NULL,
  effect_ordinal integer NOT NULL CHECK (effect_ordinal >= 0),
  effect_line_key varchar(160) NOT NULL,
  owning_table varchar(128) NOT NULL,
  owning_unique_name varchar(128) NOT NULL,
  expected_cardinality integer NOT NULL CHECK (expected_cardinality > 0),
  line_amount numeric(18,2),
  currency varchar(8),
  invariant_hash char(64) NOT NULL CHECK (invariant_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_biz_property_effect_manifest_kind
    CHECK (effect_kind ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'),
  CONSTRAINT fk_biz_property_effect_manifest_request
    FOREIGN KEY (tenant_id, park_id, request_id)
    REFERENCES biz_property_approval_request(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_property_effect_manifest_currency
    FOREIGN KEY (tenant_id, park_id, request_id, currency)
    REFERENCES biz_property_approval_request(tenant_id, park_id, id, currency)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_effect_manifest_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_effect_manifest_request_id
    UNIQUE (tenant_id, park_id, request_id, id),
  CONSTRAINT uq_biz_property_effect_manifest_ordinal
    UNIQUE (tenant_id, park_id, request_id, effect_kind, effect_ordinal),
  CONSTRAINT uq_biz_property_effect_manifest_line
    UNIQUE (tenant_id, park_id, request_id, effect_line_key)
);

CREATE TABLE IF NOT EXISTS biz_property_execution_effect_receipt (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  request_id uuid NOT NULL,
  manifest_id uuid NOT NULL,
  execution_idempotency_key varchar(128) NOT NULL,
  effect_kind varchar(128) NOT NULL,
  effect_ordinal integer NOT NULL CHECK (effect_ordinal >= 0),
  effect_line_key varchar(160) NOT NULL,
  domain_table varchar(128) NOT NULL,
  domain_row_id uuid NOT NULL,
  effect_hash char(64) NOT NULL CHECK (effect_hash ~ '^[0-9a-f]{64}$'),
  line_amount numeric(18,2),
  currency varchar(8),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_biz_property_effect_receipt_kind
    CHECK (effect_kind ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'),
  CONSTRAINT fk_biz_property_effect_receipt_request
    FOREIGN KEY (tenant_id, park_id, request_id)
    REFERENCES biz_property_approval_request(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_property_effect_receipt_manifest
    FOREIGN KEY (tenant_id, park_id, request_id, manifest_id)
    REFERENCES biz_property_execution_effect_manifest(tenant_id, park_id, request_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_property_effect_receipt_currency
    FOREIGN KEY (tenant_id, park_id, request_id, currency)
    REFERENCES biz_property_approval_request(tenant_id, park_id, id, currency)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_effect_receipt_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_effect_receipt_ordinal
    UNIQUE (tenant_id, park_id, execution_idempotency_key, effect_kind, effect_ordinal),
  CONSTRAINT uq_biz_property_effect_receipt_line
    UNIQUE (tenant_id, park_id, execution_idempotency_key, effect_line_key)
);

CREATE TABLE IF NOT EXISTS biz_property_mutation_receipt (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  actor_id uuid NOT NULL,
  action_id varchar(128) NOT NULL,
  target_id uuid NOT NULL,
  client_key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  receipt_status varchar(16) NOT NULL DEFAULT 'started',
  result_ref varchar(512),
  result_hash char(64) CHECK (result_hash IS NULL OR result_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT uq_biz_property_mutation_receipt_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_mutation_receipt_client
    UNIQUE (tenant_id, park_id, actor_id, action_id, target_id, client_key),
  CONSTRAINT ck_biz_property_mutation_receipt_status
    CHECK (receipt_status IN ('started', 'completed', 'failed')),
  CONSTRAINT ck_biz_property_mutation_receipt_completed
    CHECK ((receipt_status = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_property_approval_queue
  ON biz_property_approval_request (tenant_id, park_id, decision_status, created_at, id)
  WHERE decision_status IN ('submitted', 'pending_approval');
CREATE INDEX IF NOT EXISTS idx_property_approval_retry
  ON biz_property_approval_request (next_retry_at, tenant_id, park_id, id)
  WHERE decision_status = 'approved' AND execution_status = 'retry_wait';
CREATE INDEX IF NOT EXISTS idx_property_approval_lease
  ON biz_property_approval_request (lease_expires_at, tenant_id, park_id, id)
  WHERE execution_status = 'executing';

CREATE OR REPLACE FUNCTION fn_property_approval_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'property-approval-record-immutable' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE TRIGGER trg_biz_property_approval_decision_immutable
BEFORE UPDATE OR DELETE ON biz_property_approval_decision
FOR EACH ROW EXECUTE FUNCTION fn_property_approval_immutable();
CREATE OR REPLACE TRIGGER trg_biz_property_approval_audit_immutable
BEFORE UPDATE OR DELETE ON biz_property_approval_audit
FOR EACH ROW EXECUTE FUNCTION fn_property_approval_immutable();
CREATE OR REPLACE TRIGGER trg_biz_property_effect_manifest_immutable
BEFORE UPDATE OR DELETE ON biz_property_execution_effect_manifest
FOR EACH ROW EXECUTE FUNCTION fn_property_approval_immutable();
CREATE OR REPLACE TRIGGER trg_biz_property_effect_receipt_immutable
BEFORE UPDATE OR DELETE ON biz_property_execution_effect_receipt
FOR EACH ROW EXECUTE FUNCTION fn_property_approval_immutable();

CREATE OR REPLACE FUNCTION fn_validate_property_execution_terminal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  manifest_count integer;
  receipt_count integer;
  manifest_amount numeric(18,2);
  receipt_amount numeric(18,2);
  invalid_rows integer;
BEGIN
  IF NEW.execution_status <> 'executed' THEN
    RETURN NEW;
  END IF;

  SELECT count(*), coalesce(sum(line_amount), 0)
    INTO manifest_count, manifest_amount
  FROM biz_property_execution_effect_manifest
  WHERE tenant_id = NEW.tenant_id AND park_id = NEW.park_id AND request_id = NEW.id;

  SELECT count(*), coalesce(sum(receipt.line_amount), 0),
         count(*) FILTER (
           WHERE receipt.effect_kind <> manifest.effect_kind
              OR receipt.effect_ordinal <> manifest.effect_ordinal
              OR receipt.effect_line_key <> manifest.effect_line_key
              OR receipt.effect_hash <> manifest.invariant_hash
              OR receipt.currency IS DISTINCT FROM manifest.currency
              OR receipt.line_amount IS DISTINCT FROM manifest.line_amount
         )
    INTO receipt_count, receipt_amount, invalid_rows
  FROM biz_property_execution_effect_receipt receipt
  JOIN biz_property_execution_effect_manifest manifest
    ON manifest.tenant_id = receipt.tenant_id
   AND manifest.park_id = receipt.park_id
   AND manifest.request_id = receipt.request_id
   AND manifest.id = receipt.manifest_id
  WHERE receipt.tenant_id = NEW.tenant_id
    AND receipt.park_id = NEW.park_id
    AND receipt.request_id = NEW.id;

  IF manifest_count = 0 OR receipt_count <> manifest_count OR invalid_rows <> 0 THEN
    RAISE EXCEPTION 'property-effect-receipt-incomplete' USING ERRCODE = '23514';
  END IF;
  IF NEW.amount IS NOT NULL
     AND (manifest_amount <> NEW.amount OR receipt_amount <> NEW.amount) THEN
    RAISE EXCEPTION 'property-effect-amount-mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $constraint_trigger$
DECLARE
  current_definition text;
BEGIN
  SELECT regexp_replace(pg_get_triggerdef(trigger_row.oid, false), '\s+', ' ', 'g')
  INTO current_definition
  FROM pg_trigger trigger_row
  WHERE trigger_row.tgrelid = 'public.biz_property_approval_request'::regclass
    AND trigger_row.tgname = 'trg_biz_property_execution_terminal_validation'
    AND NOT trigger_row.tgisinternal;

  IF current_definition IS NULL THEN
    EXECUTE $ddl$
      CREATE CONSTRAINT TRIGGER trg_biz_property_execution_terminal_validation
      AFTER INSERT OR UPDATE OF execution_status
      ON public.biz_property_approval_request
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_validate_property_execution_terminal()
    $ddl$;
  END IF;
END;
$constraint_trigger$;

REVOKE UPDATE, DELETE ON biz_property_approval_decision FROM PUBLIC;
REVOKE UPDATE, DELETE ON biz_property_approval_audit FROM PUBLIC;
REVOKE UPDATE, DELETE ON biz_property_execution_effect_manifest FROM PUBLIC;
REVOKE UPDATE, DELETE ON biz_property_execution_effect_receipt FROM PUBLIC;




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
