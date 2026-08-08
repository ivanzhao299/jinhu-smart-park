BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- B0_CATALOG_OBJECTS_START
-- B0_CATALOG_OBJECT column	public.biz_party.current_identity_submission_id
-- B0_CATALOG_OBJECT column	public.biz_party.current_verified_submission_id
-- B0_CATALOG_OBJECT column	public.biz_party.identity_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.acted_by
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.action
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.assignment_version_after
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.assignment_version_before
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.confidence
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.eligibility_policy_hash
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.from_verifier_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.identity_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.legacy_actor_anomaly
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.legacy_backfill
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.occurred_at
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.park_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.party_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.reason
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.request_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.source
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.submission_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.to_verifier_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_assignment_audit.verification_queue_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.assignment_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.confidence
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.create_time
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.decided_at
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.decided_by
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.decision
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.eligibility_policy_hash
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.identity_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.legacy_actor_anomaly
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.legacy_backfill
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.park_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.party_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.reason
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.snapshot_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.source
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.submission_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.submission_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_decision.verification_queue_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.captured_at
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.captured_by
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.confidence
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.create_time
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.document_type
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.encrypted_payload
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.encryption_key_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.hash_algorithm
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.hash_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.identity_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.legacy_actor_anomaly
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.legacy_backfill
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.normalized_identity_hash
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.park_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.party_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.payload_format_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.snapshot_revision
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.source
-- B0_CATALOG_OBJECT column	public.biz_party_identity_snapshot.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.assigned_verifier_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.assignment_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.confidence
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.create_time
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.decided_at
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.decided_by
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.decision_reason
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.draft_encryption_key_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.draft_hash_algorithm
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.draft_hash_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.draft_payload_format_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.drafted_at
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.drafted_by
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.eligibility_policy_hash
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.eligibility_policy_snapshot
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.identity_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.legacy_actor_anomaly
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.legacy_backfill
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.park_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.party_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.recorded_by
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.snapshot_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.source
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.status
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.submission_attempt
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.submitted_at
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.submitted_by
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.superseded_at
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.superseded_by
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.supersedes_submission_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.update_time
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.verification_queue_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.withdrawn_at
-- B0_CATALOG_OBJECT column	public.biz_party_identity_submission.withdrawn_by
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.create_time
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.display_name
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.eligibility_policy_hash
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.eligibility_policy_snapshot
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.eligibility_policy_version
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.legacy_anomaly
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.legacy_backfill
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.park_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.queue_code
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.status
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.update_time
-- B0_CATALOG_OBJECT column	public.biz_party_identity_verification_queue.version
-- B0_CATALOG_OBJECT column	public.rel_party_identity_snapshot_file.captured_at
-- B0_CATALOG_OBJECT column	public.rel_party_identity_snapshot_file.content_sha256
-- B0_CATALOG_OBJECT column	public.rel_party_identity_snapshot_file.file_id
-- B0_CATALOG_OBJECT column	public.rel_party_identity_snapshot_file.file_size
-- B0_CATALOG_OBJECT column	public.rel_party_identity_snapshot_file.file_version
-- B0_CATALOG_OBJECT column	public.rel_party_identity_snapshot_file.id
-- B0_CATALOG_OBJECT column	public.rel_party_identity_snapshot_file.mime_type
-- B0_CATALOG_OBJECT column	public.rel_party_identity_snapshot_file.ordinal
-- B0_CATALOG_OBJECT column	public.rel_party_identity_snapshot_file.park_id
-- B0_CATALOG_OBJECT column	public.rel_party_identity_snapshot_file.snapshot_id
-- B0_CATALOG_OBJECT column	public.rel_party_identity_snapshot_file.tenant_id
-- B0_CATALOG_OBJECT column	public.rel_party_identity_draft_file.file_id
-- B0_CATALOG_OBJECT column	public.rel_party_identity_draft_file.file_version
-- B0_CATALOG_OBJECT column	public.rel_party_identity_draft_file.id
-- B0_CATALOG_OBJECT column	public.rel_party_identity_draft_file.ordinal
-- B0_CATALOG_OBJECT column	public.rel_party_identity_draft_file.park_id
-- B0_CATALOG_OBJECT column	public.rel_party_identity_draft_file.selected_at
-- B0_CATALOG_OBJECT column	public.rel_party_identity_draft_file.selected_by
-- B0_CATALOG_OBJECT column	public.rel_party_identity_draft_file.submission_id
-- B0_CATALOG_OBJECT column	public.rel_party_identity_draft_file.tenant_id
-- B0_CATALOG_OBJECT column	public.sys_file.content_sha256
-- B0_CATALOG_OBJECT constraint	public.biz_party.ck_biz_party_identity_version
-- B0_CATALOG_OBJECT constraint	public.biz_party.fk_biz_party_current_identity_submission
-- B0_CATALOG_OBJECT constraint	public.biz_party.fk_biz_party_current_verified_submission
-- B0_CATALOG_OBJECT constraint	public.biz_party.uq_biz_party_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_assignment_audit.biz_party_identity_assignment_audit_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_action
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_actor
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_anomaly
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_hash
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_transition
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_versions
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_assignment_audit.fk_biz_party_identity_assignment_audit_queue
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_assignment_audit.fk_biz_party_identity_assignment_audit_submission
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_assignment_audit.uq_biz_party_identity_assignment_audit_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_assignment_audit.uq_biz_party_identity_assignment_audit_version
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.biz_party_identity_decision_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.ck_biz_party_identity_decision_actor
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.ck_biz_party_identity_decision_actor_presence
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.ck_biz_party_identity_decision_anomaly
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.ck_biz_party_identity_decision_hash
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.ck_biz_party_identity_decision_reason
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.ck_biz_party_identity_decision_value
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.ck_biz_party_identity_decision_versions
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.fk_biz_party_identity_decision_queue
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.fk_biz_party_identity_decision_snapshot
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.fk_biz_party_identity_decision_submission
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.uq_biz_party_identity_decision_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_decision.uq_biz_party_identity_decision_submission
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.biz_party_identity_snapshot_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_actor
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_actor_presence
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_anomaly
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_hash_version
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_identity_version
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_payload_version
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_revision
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.fk_biz_party_identity_snapshot_party
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.uq_biz_party_identity_snapshot_party_version_id
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.uq_biz_party_identity_snapshot_revision
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_snapshot.uq_biz_party_identity_snapshot_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.biz_party_identity_submission_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_actor
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_anomaly
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_assignment
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_crypto_profile
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_legacy
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_policy
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_queue_assignment
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_snapshot_required
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_status
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_supersedes_self
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_times
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.ck_biz_party_identity_submission_versions
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.fk_biz_party_identity_submission_party
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.fk_biz_party_identity_submission_queue
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.fk_biz_party_identity_submission_snapshot
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.fk_biz_party_identity_submission_supersedes
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.uq_biz_party_identity_submission_attempt
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.uq_biz_party_identity_submission_decision_ref
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.uq_biz_party_identity_submission_party_id
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.uq_biz_party_identity_submission_party_version_id
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.uq_biz_party_identity_submission_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_submission.uq_biz_party_identity_submission_snapshot
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_verification_queue.biz_party_identity_verification_queue_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_verification_queue.ck_biz_party_identity_queue_legacy
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_verification_queue.ck_biz_party_identity_queue_policy_hash
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_verification_queue.ck_biz_party_identity_queue_policy_object
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_verification_queue.ck_biz_party_identity_queue_status
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_verification_queue.ck_biz_party_identity_queue_versions
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_verification_queue.uq_biz_party_identity_queue_code
-- B0_CATALOG_OBJECT constraint	public.biz_party_identity_verification_queue.uq_biz_party_identity_queue_scope_id
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_snapshot_file.ck_rel_party_identity_snapshot_file_hash
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_snapshot_file.ck_rel_party_identity_snapshot_file_values
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_snapshot_file.fk_rel_party_identity_snapshot_file_file
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_snapshot_file.fk_rel_party_identity_snapshot_file_snapshot
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_snapshot_file.rel_party_identity_snapshot_file_pkey
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_snapshot_file.uq_rel_party_identity_snapshot_file_file
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_snapshot_file.uq_rel_party_identity_snapshot_file_ordinal
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_draft_file.ck_rel_party_identity_draft_file_values
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_draft_file.fk_rel_party_identity_draft_file_file
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_draft_file.fk_rel_party_identity_draft_file_submission
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_draft_file.pk_rel_party_identity_draft_file
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_draft_file.uq_rel_party_identity_draft_file_file
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_draft_file.uq_rel_party_identity_draft_file_ordinal
-- B0_CATALOG_OBJECT constraint	public.rel_party_identity_draft_file.uq_rel_party_identity_draft_file_scope_id
-- B0_CATALOG_OBJECT constraint	public.sys_file.ck_sys_file_content_sha256
-- B0_CATALOG_OBJECT constraint	public.sys_file.uq_sys_file_scope_id
-- B0_CATALOG_OBJECT function	public.fn_property_identity_immutable()
-- B0_CATALOG_OBJECT function	public.fn_guard_party_identity_assignment_audit_insert()
-- B0_CATALOG_OBJECT function	public.fn_guard_party_identity_decision_insert()
-- B0_CATALOG_OBJECT function	public.fn_guard_party_identity_draft_file_mutation()
-- B0_CATALOG_OBJECT function	public.fn_party_identity_assignment_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_action character varying, p_to_verifier_id uuid, p_reason character varying, p_request_id character varying, p_expected_submission_version integer, p_expected_assignment_version integer)
-- B0_CATALOG_OBJECT function	public.fn_party_identity_create_draft_cas(p_tenant_id character varying, p_park_id character varying, p_party_id uuid, p_actor_id uuid, p_expected_identity_version bigint, p_supersedes_submission_id uuid, p_expected_superseded_status character varying, p_expected_superseded_version integer)
-- B0_CATALOG_OBJECT function	public.fn_party_identity_decision_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_decision character varying, p_reason character varying, p_expected_submission_version integer, p_expected_assignment_version integer)
-- B0_CATALOG_OBJECT function	public.fn_party_identity_submit_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_expected_submission_version integer, p_verification_queue_id uuid, p_eligibility_policy_snapshot jsonb, p_eligibility_policy_hash character varying)
-- B0_CATALOG_OBJECT function	public.fn_party_identity_update_draft_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_expected_submission_version integer, p_document_type character varying, p_identity_number_encrypted text, p_identity_number_hash character varying, p_identity_number_masked character varying, p_hash_algorithm character varying, p_hash_version integer, p_encryption_key_id character varying, p_payload_format_version integer, p_pending_file_ids uuid[])
-- B0_CATALOG_OBJECT function	public.fn_party_identity_withdraw_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_reason character varying, p_request_id character varying, p_expected_submission_version integer)
-- B0_CATALOG_OBJECT function	public.fn_validate_party_identity_consistency()
-- B0_CATALOG_OBJECT index	public.biz_party_identity_assignment_audit_pkey
-- B0_CATALOG_OBJECT index	public.biz_party_identity_decision_pkey
-- B0_CATALOG_OBJECT index	public.biz_party_identity_snapshot_pkey
-- B0_CATALOG_OBJECT index	public.biz_party_identity_submission_pkey
-- B0_CATALOG_OBJECT index	public.biz_party_identity_verification_queue_pkey
-- B0_CATALOG_OBJECT index	public.idx_biz_party_identity_assignment_history
-- B0_CATALOG_OBJECT index	public.idx_biz_party_identity_submission_queue
-- B0_CATALOG_OBJECT index	public.idx_rel_party_identity_draft_file_submission
-- B0_CATALOG_OBJECT index	public.pk_rel_party_identity_draft_file
-- B0_CATALOG_OBJECT index	public.rel_party_identity_snapshot_file_pkey
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_assignment_audit_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_assignment_audit_version
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_decision_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_decision_submission
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_queue_code
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_queue_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_snapshot_party_version_id
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_snapshot_revision
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_snapshot_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_submission_active
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_submission_attempt
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_submission_decision_ref
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_submission_party_id
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_submission_party_version_id
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_submission_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_party_identity_submission_snapshot
-- B0_CATALOG_OBJECT index	public.uq_biz_party_scope_id
-- B0_CATALOG_OBJECT index	public.uq_rel_party_identity_snapshot_file_file
-- B0_CATALOG_OBJECT index	public.uq_rel_party_identity_snapshot_file_ordinal
-- B0_CATALOG_OBJECT index	public.uq_rel_party_identity_draft_file_file
-- B0_CATALOG_OBJECT index	public.uq_rel_party_identity_draft_file_ordinal
-- B0_CATALOG_OBJECT index	public.uq_rel_party_identity_draft_file_scope_id
-- B0_CATALOG_OBJECT index	public.uq_sys_file_scope_id
-- B0_CATALOG_OBJECT table	public.biz_party_identity_assignment_audit
-- B0_CATALOG_OBJECT table	public.biz_party_identity_decision
-- B0_CATALOG_OBJECT table	public.biz_party_identity_snapshot
-- B0_CATALOG_OBJECT table	public.biz_party_identity_submission
-- B0_CATALOG_OBJECT table	public.biz_party_identity_verification_queue
-- B0_CATALOG_OBJECT table	public.rel_party_identity_snapshot_file
-- B0_CATALOG_OBJECT table	public.rel_party_identity_draft_file
-- B0_CATALOG_OBJECT trigger	public.biz_party.trg_biz_party_identity_party_consistency
-- B0_CATALOG_OBJECT trigger	public.biz_party_identity_assignment_audit.trg_biz_party_identity_assignment_audit_insert_guard
-- B0_CATALOG_OBJECT trigger	public.biz_party_identity_assignment_audit.trg_biz_party_identity_assignment_consistency
-- B0_CATALOG_OBJECT trigger	public.biz_party_identity_assignment_audit.trg_biz_party_identity_assignment_audit_immutable
-- B0_CATALOG_OBJECT trigger	public.biz_party_identity_decision.trg_biz_party_identity_decision_consistency
-- B0_CATALOG_OBJECT trigger	public.biz_party_identity_decision.trg_biz_party_identity_decision_insert_guard
-- B0_CATALOG_OBJECT trigger	public.biz_party_identity_decision.trg_biz_party_identity_decision_immutable
-- B0_CATALOG_OBJECT trigger	public.biz_party_identity_submission.trg_biz_party_identity_submission_consistency
-- B0_CATALOG_OBJECT trigger	public.biz_party_identity_snapshot.trg_biz_party_identity_snapshot_immutable
-- B0_CATALOG_OBJECT trigger	public.rel_party_identity_draft_file.trg_rel_party_identity_draft_file_mutation_guard
-- B0_CATALOG_OBJECT trigger	public.rel_party_identity_snapshot_file.trg_rel_party_identity_snapshot_file_immutable
-- B0_CATALOG_OBJECTS_END

-- B0_DEFINITION_SIGNATURE_GUARD_START
CREATE TEMP TABLE b0_catalog_target (
  kind text NOT NULL CHECK (kind IN
    ('table','column','constraint','index','function','trigger','definition-row')),
  name text NOT NULL,
  PRIMARY KEY (kind,name)
) ON COMMIT DROP;
INSERT INTO b0_catalog_target(kind,name) VALUES
  ('column','public.biz_party.current_identity_submission_id'),
  ('column','public.biz_party.current_verified_submission_id'),
  ('column','public.biz_party.identity_version'),
  ('column','public.biz_party_identity_assignment_audit.acted_by'),
  ('column','public.biz_party_identity_assignment_audit.action'),
  ('column','public.biz_party_identity_assignment_audit.assignment_version_after'),
  ('column','public.biz_party_identity_assignment_audit.assignment_version_before'),
  ('column','public.biz_party_identity_assignment_audit.confidence'),
  ('column','public.biz_party_identity_assignment_audit.eligibility_policy_hash'),
  ('column','public.biz_party_identity_assignment_audit.from_verifier_id'),
  ('column','public.biz_party_identity_assignment_audit.id'),
  ('column','public.biz_party_identity_assignment_audit.identity_version'),
  ('column','public.biz_party_identity_assignment_audit.legacy_actor_anomaly'),
  ('column','public.biz_party_identity_assignment_audit.legacy_backfill'),
  ('column','public.biz_party_identity_assignment_audit.occurred_at'),
  ('column','public.biz_party_identity_assignment_audit.park_id'),
  ('column','public.biz_party_identity_assignment_audit.party_id'),
  ('column','public.biz_party_identity_assignment_audit.reason'),
  ('column','public.biz_party_identity_assignment_audit.request_id'),
  ('column','public.biz_party_identity_assignment_audit.source'),
  ('column','public.biz_party_identity_assignment_audit.submission_id'),
  ('column','public.biz_party_identity_assignment_audit.tenant_id'),
  ('column','public.biz_party_identity_assignment_audit.to_verifier_id'),
  ('column','public.biz_party_identity_assignment_audit.verification_queue_id'),
  ('column','public.biz_party_identity_decision.assignment_version'),
  ('column','public.biz_party_identity_decision.confidence'),
  ('column','public.biz_party_identity_decision.create_time'),
  ('column','public.biz_party_identity_decision.decided_at'),
  ('column','public.biz_party_identity_decision.decided_by'),
  ('column','public.biz_party_identity_decision.decision'),
  ('column','public.biz_party_identity_decision.eligibility_policy_hash'),
  ('column','public.biz_party_identity_decision.id'),
  ('column','public.biz_party_identity_decision.identity_version'),
  ('column','public.biz_party_identity_decision.legacy_actor_anomaly'),
  ('column','public.biz_party_identity_decision.legacy_backfill'),
  ('column','public.biz_party_identity_decision.park_id'),
  ('column','public.biz_party_identity_decision.party_id'),
  ('column','public.biz_party_identity_decision.reason'),
  ('column','public.biz_party_identity_decision.snapshot_id'),
  ('column','public.biz_party_identity_decision.source'),
  ('column','public.biz_party_identity_decision.submission_id'),
  ('column','public.biz_party_identity_decision.submission_version'),
  ('column','public.biz_party_identity_decision.tenant_id'),
  ('column','public.biz_party_identity_decision.verification_queue_id'),
  ('column','public.biz_party_identity_snapshot.captured_at'),
  ('column','public.biz_party_identity_snapshot.captured_by'),
  ('column','public.biz_party_identity_snapshot.confidence'),
  ('column','public.biz_party_identity_snapshot.create_time'),
  ('column','public.biz_party_identity_snapshot.document_type'),
  ('column','public.biz_party_identity_snapshot.encrypted_payload'),
  ('column','public.biz_party_identity_snapshot.encryption_key_id'),
  ('column','public.biz_party_identity_snapshot.hash_algorithm'),
  ('column','public.biz_party_identity_snapshot.hash_version'),
  ('column','public.biz_party_identity_snapshot.id'),
  ('column','public.biz_party_identity_snapshot.identity_version'),
  ('column','public.biz_party_identity_snapshot.legacy_actor_anomaly'),
  ('column','public.biz_party_identity_snapshot.legacy_backfill'),
  ('column','public.biz_party_identity_snapshot.normalized_identity_hash'),
  ('column','public.biz_party_identity_snapshot.park_id'),
  ('column','public.biz_party_identity_snapshot.party_id'),
  ('column','public.biz_party_identity_snapshot.payload_format_version'),
  ('column','public.biz_party_identity_snapshot.snapshot_revision'),
  ('column','public.biz_party_identity_snapshot.source'),
  ('column','public.biz_party_identity_snapshot.tenant_id'),
  ('column','public.biz_party_identity_submission.assigned_verifier_id'),
  ('column','public.biz_party_identity_submission.assignment_version'),
  ('column','public.biz_party_identity_submission.confidence'),
  ('column','public.biz_party_identity_submission.create_time'),
  ('column','public.biz_party_identity_submission.decided_at'),
  ('column','public.biz_party_identity_submission.decided_by'),
  ('column','public.biz_party_identity_submission.decision_reason'),
  ('column','public.biz_party_identity_submission.draft_encryption_key_id'),
  ('column','public.biz_party_identity_submission.draft_hash_algorithm'),
  ('column','public.biz_party_identity_submission.draft_hash_version'),
  ('column','public.biz_party_identity_submission.draft_payload_format_version'),
  ('column','public.biz_party_identity_submission.drafted_at'),
  ('column','public.biz_party_identity_submission.drafted_by'),
  ('column','public.biz_party_identity_submission.eligibility_policy_hash'),
  ('column','public.biz_party_identity_submission.eligibility_policy_snapshot'),
  ('column','public.biz_party_identity_submission.id'),
  ('column','public.biz_party_identity_submission.identity_version'),
  ('column','public.biz_party_identity_submission.legacy_actor_anomaly'),
  ('column','public.biz_party_identity_submission.legacy_backfill'),
  ('column','public.biz_party_identity_submission.park_id'),
  ('column','public.biz_party_identity_submission.party_id'),
  ('column','public.biz_party_identity_submission.recorded_by'),
  ('column','public.biz_party_identity_submission.snapshot_id'),
  ('column','public.biz_party_identity_submission.source'),
  ('column','public.biz_party_identity_submission.status'),
  ('column','public.biz_party_identity_submission.submission_attempt'),
  ('column','public.biz_party_identity_submission.submitted_at'),
  ('column','public.biz_party_identity_submission.submitted_by'),
  ('column','public.biz_party_identity_submission.superseded_at'),
  ('column','public.biz_party_identity_submission.superseded_by'),
  ('column','public.biz_party_identity_submission.supersedes_submission_id'),
  ('column','public.biz_party_identity_submission.tenant_id'),
  ('column','public.biz_party_identity_submission.update_time'),
  ('column','public.biz_party_identity_submission.verification_queue_id'),
  ('column','public.biz_party_identity_submission.version'),
  ('column','public.biz_party_identity_submission.withdrawn_at'),
  ('column','public.biz_party_identity_submission.withdrawn_by'),
  ('column','public.biz_party_identity_verification_queue.create_time'),
  ('column','public.biz_party_identity_verification_queue.display_name'),
  ('column','public.biz_party_identity_verification_queue.eligibility_policy_hash'),
  ('column','public.biz_party_identity_verification_queue.eligibility_policy_snapshot'),
  ('column','public.biz_party_identity_verification_queue.eligibility_policy_version'),
  ('column','public.biz_party_identity_verification_queue.id'),
  ('column','public.biz_party_identity_verification_queue.legacy_anomaly'),
  ('column','public.biz_party_identity_verification_queue.legacy_backfill'),
  ('column','public.biz_party_identity_verification_queue.park_id'),
  ('column','public.biz_party_identity_verification_queue.queue_code'),
  ('column','public.biz_party_identity_verification_queue.status'),
  ('column','public.biz_party_identity_verification_queue.tenant_id'),
  ('column','public.biz_party_identity_verification_queue.update_time'),
  ('column','public.biz_party_identity_verification_queue.version'),
  ('column','public.rel_party_identity_snapshot_file.captured_at'),
  ('column','public.rel_party_identity_snapshot_file.content_sha256'),
  ('column','public.rel_party_identity_snapshot_file.file_id'),
  ('column','public.rel_party_identity_snapshot_file.file_size'),
  ('column','public.rel_party_identity_snapshot_file.file_version'),
  ('column','public.rel_party_identity_snapshot_file.id'),
  ('column','public.rel_party_identity_snapshot_file.mime_type'),
  ('column','public.rel_party_identity_snapshot_file.ordinal'),
  ('column','public.rel_party_identity_snapshot_file.park_id'),
  ('column','public.rel_party_identity_snapshot_file.snapshot_id'),
  ('column','public.rel_party_identity_snapshot_file.tenant_id'),
  ('column','public.rel_party_identity_draft_file.file_id'),
  ('column','public.rel_party_identity_draft_file.file_version'),
  ('column','public.rel_party_identity_draft_file.id'),
  ('column','public.rel_party_identity_draft_file.ordinal'),
  ('column','public.rel_party_identity_draft_file.park_id'),
  ('column','public.rel_party_identity_draft_file.selected_at'),
  ('column','public.rel_party_identity_draft_file.selected_by'),
  ('column','public.rel_party_identity_draft_file.submission_id'),
  ('column','public.rel_party_identity_draft_file.tenant_id'),
  ('column','public.sys_file.content_sha256'),
  ('constraint','public.biz_party.ck_biz_party_identity_version'),
  ('constraint','public.biz_party.fk_biz_party_current_identity_submission'),
  ('constraint','public.biz_party.fk_biz_party_current_verified_submission'),
  ('constraint','public.biz_party.uq_biz_party_scope_id'),
  ('constraint','public.biz_party_identity_assignment_audit.biz_party_identity_assignment_audit_pkey'),
  ('constraint','public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_action'),
  ('constraint','public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_actor'),
  ('constraint','public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_anomaly'),
  ('constraint','public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_hash'),
  ('constraint','public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_transition'),
  ('constraint','public.biz_party_identity_assignment_audit.ck_biz_party_identity_assignment_audit_versions'),
  ('constraint','public.biz_party_identity_assignment_audit.fk_biz_party_identity_assignment_audit_queue'),
  ('constraint','public.biz_party_identity_assignment_audit.fk_biz_party_identity_assignment_audit_submission'),
  ('constraint','public.biz_party_identity_assignment_audit.uq_biz_party_identity_assignment_audit_scope_id'),
  ('constraint','public.biz_party_identity_assignment_audit.uq_biz_party_identity_assignment_audit_version'),
  ('constraint','public.biz_party_identity_decision.biz_party_identity_decision_pkey'),
  ('constraint','public.biz_party_identity_decision.ck_biz_party_identity_decision_actor'),
  ('constraint','public.biz_party_identity_decision.ck_biz_party_identity_decision_actor_presence'),
  ('constraint','public.biz_party_identity_decision.ck_biz_party_identity_decision_anomaly'),
  ('constraint','public.biz_party_identity_decision.ck_biz_party_identity_decision_hash'),
  ('constraint','public.biz_party_identity_decision.ck_biz_party_identity_decision_reason'),
  ('constraint','public.biz_party_identity_decision.ck_biz_party_identity_decision_value'),
  ('constraint','public.biz_party_identity_decision.ck_biz_party_identity_decision_versions'),
  ('constraint','public.biz_party_identity_decision.fk_biz_party_identity_decision_queue'),
  ('constraint','public.biz_party_identity_decision.fk_biz_party_identity_decision_snapshot'),
  ('constraint','public.biz_party_identity_decision.fk_biz_party_identity_decision_submission'),
  ('constraint','public.biz_party_identity_decision.uq_biz_party_identity_decision_scope_id'),
  ('constraint','public.biz_party_identity_decision.uq_biz_party_identity_decision_submission'),
  ('constraint','public.biz_party_identity_snapshot.biz_party_identity_snapshot_pkey'),
  ('constraint','public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_actor'),
  ('constraint','public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_actor_presence'),
  ('constraint','public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_anomaly'),
  ('constraint','public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_hash_version'),
  ('constraint','public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_identity_version'),
  ('constraint','public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_payload_version'),
  ('constraint','public.biz_party_identity_snapshot.ck_biz_party_identity_snapshot_revision'),
  ('constraint','public.biz_party_identity_snapshot.fk_biz_party_identity_snapshot_party'),
  ('constraint','public.biz_party_identity_snapshot.uq_biz_party_identity_snapshot_party_version_id'),
  ('constraint','public.biz_party_identity_snapshot.uq_biz_party_identity_snapshot_revision'),
  ('constraint','public.biz_party_identity_snapshot.uq_biz_party_identity_snapshot_scope_id'),
  ('constraint','public.biz_party_identity_submission.biz_party_identity_submission_pkey'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_actor'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_anomaly'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_assignment'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_crypto_profile'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_legacy'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_policy'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_queue_assignment'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_snapshot_required'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_status'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_supersedes_self'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_times'),
  ('constraint','public.biz_party_identity_submission.ck_biz_party_identity_submission_versions'),
  ('constraint','public.biz_party_identity_submission.fk_biz_party_identity_submission_party'),
  ('constraint','public.biz_party_identity_submission.fk_biz_party_identity_submission_queue'),
  ('constraint','public.biz_party_identity_submission.fk_biz_party_identity_submission_snapshot'),
  ('constraint','public.biz_party_identity_submission.fk_biz_party_identity_submission_supersedes'),
  ('constraint','public.biz_party_identity_submission.uq_biz_party_identity_submission_attempt'),
  ('constraint','public.biz_party_identity_submission.uq_biz_party_identity_submission_decision_ref'),
  ('constraint','public.biz_party_identity_submission.uq_biz_party_identity_submission_party_id'),
  ('constraint','public.biz_party_identity_submission.uq_biz_party_identity_submission_party_version_id'),
  ('constraint','public.biz_party_identity_submission.uq_biz_party_identity_submission_scope_id'),
  ('constraint','public.biz_party_identity_submission.uq_biz_party_identity_submission_snapshot'),
  ('constraint','public.biz_party_identity_verification_queue.biz_party_identity_verification_queue_pkey'),
  ('constraint','public.biz_party_identity_verification_queue.ck_biz_party_identity_queue_legacy'),
  ('constraint','public.biz_party_identity_verification_queue.ck_biz_party_identity_queue_policy_hash'),
  ('constraint','public.biz_party_identity_verification_queue.ck_biz_party_identity_queue_policy_object'),
  ('constraint','public.biz_party_identity_verification_queue.ck_biz_party_identity_queue_status'),
  ('constraint','public.biz_party_identity_verification_queue.ck_biz_party_identity_queue_versions'),
  ('constraint','public.biz_party_identity_verification_queue.uq_biz_party_identity_queue_code'),
  ('constraint','public.biz_party_identity_verification_queue.uq_biz_party_identity_queue_scope_id'),
  ('constraint','public.rel_party_identity_snapshot_file.ck_rel_party_identity_snapshot_file_hash'),
  ('constraint','public.rel_party_identity_snapshot_file.ck_rel_party_identity_snapshot_file_values'),
  ('constraint','public.rel_party_identity_snapshot_file.fk_rel_party_identity_snapshot_file_file'),
  ('constraint','public.rel_party_identity_snapshot_file.fk_rel_party_identity_snapshot_file_snapshot'),
  ('constraint','public.rel_party_identity_snapshot_file.rel_party_identity_snapshot_file_pkey'),
  ('constraint','public.rel_party_identity_snapshot_file.uq_rel_party_identity_snapshot_file_file'),
  ('constraint','public.rel_party_identity_snapshot_file.uq_rel_party_identity_snapshot_file_ordinal'),
  ('constraint','public.rel_party_identity_draft_file.ck_rel_party_identity_draft_file_values'),
  ('constraint','public.rel_party_identity_draft_file.fk_rel_party_identity_draft_file_file'),
  ('constraint','public.rel_party_identity_draft_file.fk_rel_party_identity_draft_file_submission'),
  ('constraint','public.rel_party_identity_draft_file.pk_rel_party_identity_draft_file'),
  ('constraint','public.rel_party_identity_draft_file.uq_rel_party_identity_draft_file_file'),
  ('constraint','public.rel_party_identity_draft_file.uq_rel_party_identity_draft_file_ordinal'),
  ('constraint','public.rel_party_identity_draft_file.uq_rel_party_identity_draft_file_scope_id'),
  ('constraint','public.sys_file.ck_sys_file_content_sha256'),
  ('constraint','public.sys_file.uq_sys_file_scope_id'),
  ('function','public.fn_property_identity_immutable()'),
  ('function','public.fn_guard_party_identity_assignment_audit_insert()'),
  ('function','public.fn_guard_party_identity_decision_insert()'),
  ('function','public.fn_guard_party_identity_draft_file_mutation()'),
  ('function','public.fn_party_identity_assignment_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_action character varying, p_to_verifier_id uuid, p_reason character varying, p_request_id character varying, p_expected_submission_version integer, p_expected_assignment_version integer)'),
  ('function','public.fn_party_identity_create_draft_cas(p_tenant_id character varying, p_park_id character varying, p_party_id uuid, p_actor_id uuid, p_expected_identity_version bigint, p_supersedes_submission_id uuid, p_expected_superseded_status character varying, p_expected_superseded_version integer)'),
  ('function','public.fn_party_identity_decision_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_decision character varying, p_reason character varying, p_expected_submission_version integer, p_expected_assignment_version integer)'),
  ('function','public.fn_party_identity_submit_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_expected_submission_version integer, p_verification_queue_id uuid, p_eligibility_policy_snapshot jsonb, p_eligibility_policy_hash character varying)'),
  ('function','public.fn_party_identity_update_draft_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_expected_submission_version integer, p_document_type character varying, p_identity_number_encrypted text, p_identity_number_hash character varying, p_identity_number_masked character varying, p_hash_algorithm character varying, p_hash_version integer, p_encryption_key_id character varying, p_payload_format_version integer, p_pending_file_ids uuid[])'),
  ('function','public.fn_party_identity_withdraw_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_reason character varying, p_request_id character varying, p_expected_submission_version integer)'),
  ('function','public.fn_validate_party_identity_consistency()'),
  ('index','public.biz_party_identity_assignment_audit_pkey'),
  ('index','public.biz_party_identity_decision_pkey'),
  ('index','public.biz_party_identity_snapshot_pkey'),
  ('index','public.biz_party_identity_submission_pkey'),
  ('index','public.biz_party_identity_verification_queue_pkey'),
  ('index','public.idx_biz_party_identity_assignment_history'),
  ('index','public.idx_biz_party_identity_submission_queue'),
  ('index','public.idx_rel_party_identity_draft_file_submission'),
  ('index','public.pk_rel_party_identity_draft_file'),
  ('index','public.rel_party_identity_snapshot_file_pkey'),
  ('index','public.uq_biz_party_identity_assignment_audit_scope_id'),
  ('index','public.uq_biz_party_identity_assignment_audit_version'),
  ('index','public.uq_biz_party_identity_decision_scope_id'),
  ('index','public.uq_biz_party_identity_decision_submission'),
  ('index','public.uq_biz_party_identity_queue_code'),
  ('index','public.uq_biz_party_identity_queue_scope_id'),
  ('index','public.uq_biz_party_identity_snapshot_party_version_id'),
  ('index','public.uq_biz_party_identity_snapshot_revision'),
  ('index','public.uq_biz_party_identity_snapshot_scope_id'),
  ('index','public.uq_biz_party_identity_submission_active'),
  ('index','public.uq_biz_party_identity_submission_attempt'),
  ('index','public.uq_biz_party_identity_submission_decision_ref'),
  ('index','public.uq_biz_party_identity_submission_party_id'),
  ('index','public.uq_biz_party_identity_submission_party_version_id'),
  ('index','public.uq_biz_party_identity_submission_scope_id'),
  ('index','public.uq_biz_party_identity_submission_snapshot'),
  ('index','public.uq_biz_party_scope_id'),
  ('index','public.uq_rel_party_identity_snapshot_file_file'),
  ('index','public.uq_rel_party_identity_snapshot_file_ordinal'),
  ('index','public.uq_rel_party_identity_draft_file_file'),
  ('index','public.uq_rel_party_identity_draft_file_ordinal'),
  ('index','public.uq_rel_party_identity_draft_file_scope_id'),
  ('index','public.uq_sys_file_scope_id'),
  ('table','public.biz_party_identity_assignment_audit'),
  ('table','public.biz_party_identity_decision'),
  ('table','public.biz_party_identity_snapshot'),
  ('table','public.biz_party_identity_submission'),
  ('table','public.biz_party_identity_verification_queue'),
  ('table','public.rel_party_identity_snapshot_file'),
  ('table','public.rel_party_identity_draft_file'),
  ('trigger','public.biz_party.trg_biz_party_identity_party_consistency'),
  ('trigger','public.biz_party_identity_assignment_audit.trg_biz_party_identity_assignment_audit_insert_guard'),
  ('trigger','public.biz_party_identity_assignment_audit.trg_biz_party_identity_assignment_consistency'),
  ('trigger','public.biz_party_identity_assignment_audit.trg_biz_party_identity_assignment_audit_immutable'),
  ('trigger','public.biz_party_identity_decision.trg_biz_party_identity_decision_consistency'),
  ('trigger','public.biz_party_identity_decision.trg_biz_party_identity_decision_insert_guard'),
  ('trigger','public.biz_party_identity_decision.trg_biz_party_identity_decision_immutable'),
  ('trigger','public.biz_party_identity_submission.trg_biz_party_identity_submission_consistency'),
  ('trigger','public.biz_party_identity_snapshot.trg_biz_party_identity_snapshot_immutable'),
  ('trigger','public.rel_party_identity_draft_file.trg_rel_party_identity_draft_file_mutation_guard'),
  ('trigger','public.rel_party_identity_snapshot_file.trg_rel_party_identity_snapshot_file_immutable');
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

ALTER TABLE biz_party
  ADD COLUMN IF NOT EXISTS identity_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_identity_submission_id uuid,
  ADD COLUMN IF NOT EXISTS current_verified_submission_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='biz_party'::regclass AND conname='ck_biz_party_identity_version') THEN
    ALTER TABLE biz_party ADD CONSTRAINT ck_biz_party_identity_version CHECK (identity_version >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='biz_party'::regclass AND conname='uq_biz_party_scope_id') THEN
    ALTER TABLE biz_party ADD CONSTRAINT uq_biz_party_scope_id UNIQUE (tenant_id, park_id, id);
  END IF;
END;
$$;

ALTER TABLE sys_file
  ADD COLUMN IF NOT EXISTS content_sha256 varchar(64);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='sys_file'::regclass AND conname='ck_sys_file_content_sha256') THEN
    ALTER TABLE sys_file ADD CONSTRAINT ck_sys_file_content_sha256
      CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='sys_file'::regclass AND conname='uq_sys_file_scope_id') THEN
    ALTER TABLE sys_file ADD CONSTRAINT uq_sys_file_scope_id UNIQUE (tenant_id, park_id, id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS biz_party_identity_verification_queue (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  queue_code varchar(64) NOT NULL,
  display_name varchar(128) NOT NULL,
  status varchar(16) NOT NULL,
  eligibility_policy_version bigint NOT NULL,
  eligibility_policy_snapshot jsonb NOT NULL,
  eligibility_policy_hash varchar(64) NOT NULL,
  legacy_backfill boolean NOT NULL DEFAULT false,
  legacy_anomaly boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  create_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  update_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_party_identity_queue_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_party_identity_queue_code UNIQUE (tenant_id, park_id, queue_code),
  CONSTRAINT ck_biz_party_identity_queue_status CHECK (status IN ('active', 'inactive')),
  CONSTRAINT ck_biz_party_identity_queue_versions
    CHECK (eligibility_policy_version > 0 AND version > 0),
  CONSTRAINT ck_biz_party_identity_queue_policy_object
    CHECK (jsonb_typeof(eligibility_policy_snapshot) = 'object'),
  CONSTRAINT ck_biz_party_identity_queue_policy_hash
    CHECK (eligibility_policy_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_biz_party_identity_queue_legacy
    CHECK (
      (legacy_backfill = false AND legacy_anomaly = false)
      OR (legacy_backfill = true AND queue_code LIKE 'legacy-%')
    )
);

CREATE TABLE IF NOT EXISTS biz_party_identity_snapshot (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  party_id uuid NOT NULL,
  identity_version bigint NOT NULL,
  snapshot_revision integer NOT NULL,
  document_type varchar(32) NOT NULL,
  normalized_identity_hash varchar(128) NOT NULL,
  hash_algorithm varchar(32) NOT NULL,
  hash_version integer NOT NULL,
  encrypted_payload text NOT NULL,
  encryption_key_id varchar(128) NOT NULL,
  payload_format_version integer NOT NULL,
  captured_by uuid,
  captured_at timestamptz NOT NULL,
  source varchar(32) NOT NULL,
  confidence varchar(32),
  legacy_backfill boolean NOT NULL DEFAULT false,
  legacy_actor_anomaly boolean NOT NULL DEFAULT false,
  create_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_party_identity_snapshot_revision
    UNIQUE (tenant_id, park_id, party_id, identity_version, snapshot_revision),
  CONSTRAINT uq_biz_party_identity_snapshot_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_party_identity_snapshot_party_version_id
    UNIQUE (tenant_id, park_id, party_id, identity_version, id),
  CONSTRAINT fk_biz_party_identity_snapshot_party
    FOREIGN KEY (tenant_id, park_id, party_id)
    REFERENCES biz_party(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_biz_party_identity_snapshot_identity_version CHECK (identity_version > 0),
  CONSTRAINT ck_biz_party_identity_snapshot_revision CHECK (snapshot_revision > 0),
  CONSTRAINT ck_biz_party_identity_snapshot_hash_version CHECK (hash_version > 0),
  CONSTRAINT ck_biz_party_identity_snapshot_payload_version CHECK (payload_format_version > 0),
  CONSTRAINT ck_biz_party_identity_snapshot_actor
    CHECK (
      (legacy_backfill = false AND captured_by IS NOT NULL AND legacy_actor_anomaly = false)
      OR (legacy_backfill = true AND source LIKE 'legacy_%')
    ),
  CONSTRAINT ck_biz_party_identity_snapshot_actor_presence
    CHECK (captured_by IS NOT NULL OR legacy_actor_anomaly = true),
  CONSTRAINT ck_biz_party_identity_snapshot_anomaly
    CHECK (legacy_actor_anomaly = false OR (legacy_backfill = true AND confidence IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS biz_party_identity_submission (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  party_id uuid NOT NULL,
  identity_version bigint NOT NULL,
  submission_attempt integer NOT NULL,
  snapshot_id uuid,
  supersedes_submission_id uuid,
  verification_queue_id uuid,
  assigned_verifier_id uuid,
  assignment_version integer NOT NULL DEFAULT 0,
  eligibility_policy_snapshot jsonb,
  eligibility_policy_hash varchar(64),
  draft_hash_algorithm varchar(32),
  draft_hash_version integer,
  draft_encryption_key_id varchar(128),
  draft_payload_format_version integer,
  status varchar(32) NOT NULL,
  drafted_by uuid,
  recorded_by uuid,
  submitted_by uuid,
  decided_by uuid,
  withdrawn_by uuid,
  superseded_by uuid,
  drafted_at timestamptz NOT NULL,
  submitted_at timestamptz,
  decided_at timestamptz,
  withdrawn_at timestamptz,
  superseded_at timestamptz,
  decision_reason varchar(500),
  source varchar(32) NOT NULL,
  confidence varchar(32),
  legacy_backfill boolean NOT NULL DEFAULT false,
  legacy_actor_anomaly boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  create_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  update_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_party_identity_submission_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_party_identity_submission_party_id
    UNIQUE (tenant_id, park_id, party_id, id),
  CONSTRAINT uq_biz_party_identity_submission_party_version_id
    UNIQUE (tenant_id, park_id, party_id, identity_version, id),
  CONSTRAINT uq_biz_party_identity_submission_snapshot
    UNIQUE (tenant_id, park_id, party_id, identity_version, id, snapshot_id),
  CONSTRAINT uq_biz_party_identity_submission_decision_ref
    UNIQUE (
      tenant_id, park_id, party_id, identity_version, id, snapshot_id,
      verification_queue_id, assignment_version, eligibility_policy_hash
    ),
  CONSTRAINT uq_biz_party_identity_submission_attempt
    UNIQUE (tenant_id, park_id, party_id, identity_version, submission_attempt),
  CONSTRAINT fk_biz_party_identity_submission_party
    FOREIGN KEY (tenant_id, park_id, party_id)
    REFERENCES biz_party(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_party_identity_submission_queue
    FOREIGN KEY (tenant_id, park_id, verification_queue_id)
    REFERENCES biz_party_identity_verification_queue(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_party_identity_submission_snapshot
    FOREIGN KEY (tenant_id, park_id, party_id, identity_version, snapshot_id)
    REFERENCES biz_party_identity_snapshot(tenant_id, park_id, party_id, identity_version, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_party_identity_submission_supersedes
    FOREIGN KEY (tenant_id, park_id, party_id, supersedes_submission_id)
    REFERENCES biz_party_identity_submission(tenant_id, park_id, party_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_biz_party_identity_submission_status
    CHECK (status IN (
      'draft', 'pending_verification', 'verified', 'rejected', 'withdrawn', 'superseded'
    )),
  CONSTRAINT ck_biz_party_identity_submission_versions
    CHECK (identity_version > 0 AND submission_attempt > 0 AND assignment_version >= 0 AND version > 0),
  CONSTRAINT ck_biz_party_identity_submission_snapshot_required
    CHECK (status IN ('draft', 'superseded') OR snapshot_id IS NOT NULL),
  CONSTRAINT ck_biz_party_identity_submission_supersedes_self
    CHECK (supersedes_submission_id IS NULL OR supersedes_submission_id <> id),
  CONSTRAINT ck_biz_party_identity_submission_policy
    CHECK (
      (
        status IN ('draft', 'superseded')
        AND (
          (verification_queue_id IS NULL AND eligibility_policy_snapshot IS NULL
           AND eligibility_policy_hash IS NULL)
          OR
          (verification_queue_id IS NOT NULL AND eligibility_policy_snapshot IS NOT NULL
           AND jsonb_typeof(eligibility_policy_snapshot) = 'object'
           AND eligibility_policy_hash ~ '^[0-9a-f]{64}$')
        )
      )
      OR
      (
        status IN ('pending_verification', 'verified', 'rejected', 'withdrawn')
        AND verification_queue_id IS NOT NULL
        AND eligibility_policy_snapshot IS NOT NULL
        AND jsonb_typeof(eligibility_policy_snapshot) = 'object'
        AND eligibility_policy_hash ~ '^[0-9a-f]{64}$'
      )
    ),
  CONSTRAINT ck_biz_party_identity_submission_assignment
    CHECK (assigned_verifier_id IS NULL OR status = 'pending_verification'),
  CONSTRAINT ck_biz_party_identity_submission_queue_assignment
    CHECK (verification_queue_id IS NOT NULL OR (assignment_version = 0 AND assigned_verifier_id IS NULL)),
  CONSTRAINT ck_biz_party_identity_submission_crypto_profile
    CHECK (
      (
        draft_hash_algorithm IS NULL
        AND draft_hash_version IS NULL
        AND draft_encryption_key_id IS NULL
        AND draft_payload_format_version IS NULL
      )
      OR (
        draft_hash_algorithm = 'hmac-sha256'
        AND draft_hash_version = 1
        AND length(btrim(draft_encryption_key_id)) > 0
        AND draft_payload_format_version = 1
      )
    ),
  CONSTRAINT ck_biz_party_identity_submission_actor
    CHECK (
      legacy_backfill = true
      OR (
        drafted_by IS NOT NULL AND recorded_by IS NOT NULL
        AND (status NOT IN ('pending_verification', 'verified', 'rejected') OR submitted_by IS NOT NULL)
        AND (status NOT IN ('verified', 'rejected') OR decided_by IS NOT NULL)
        AND (status <> 'withdrawn' OR withdrawn_by IS NOT NULL)
        AND (status <> 'superseded' OR superseded_by IS NOT NULL)
      )
    ),
  CONSTRAINT ck_biz_party_identity_submission_legacy
    CHECK (
      (legacy_backfill = false AND legacy_actor_anomaly = false)
      OR (legacy_backfill = true AND source LIKE 'legacy_%')
    ),
  CONSTRAINT ck_biz_party_identity_submission_anomaly
    CHECK (legacy_actor_anomaly = false OR confidence IS NOT NULL),
  CONSTRAINT ck_biz_party_identity_submission_times
    CHECK (
      (status = 'draft' AND submitted_at IS NULL AND decided_at IS NULL
       AND withdrawn_at IS NULL AND superseded_at IS NULL)
      OR (status = 'pending_verification' AND submitted_at IS NOT NULL
          AND decided_at IS NULL AND withdrawn_at IS NULL AND superseded_at IS NULL)
      OR (status IN ('verified', 'rejected') AND submitted_at IS NOT NULL
          AND decided_at IS NOT NULL AND withdrawn_at IS NULL AND superseded_at IS NULL)
      OR (status = 'withdrawn' AND submitted_at IS NOT NULL
          AND decided_at IS NULL AND withdrawn_at IS NOT NULL AND superseded_at IS NULL)
      OR (status = 'superseded' AND superseded_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_party_identity_submission_active
  ON biz_party_identity_submission (tenant_id, park_id, party_id)
  WHERE status IN ('draft', 'pending_verification');

CREATE TABLE IF NOT EXISTS biz_party_identity_assignment_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  party_id uuid NOT NULL,
  identity_version bigint NOT NULL,
  submission_id uuid NOT NULL,
  verification_queue_id uuid NOT NULL,
  action varchar(16) NOT NULL,
  from_verifier_id uuid,
  to_verifier_id uuid,
  acted_by uuid,
  reason varchar(500),
  eligibility_policy_hash varchar(64) NOT NULL,
  assignment_version_before integer NOT NULL,
  assignment_version_after integer NOT NULL,
  request_id varchar(128) NOT NULL,
  source varchar(32) NOT NULL,
  confidence varchar(32),
  legacy_backfill boolean NOT NULL DEFAULT false,
  legacy_actor_anomaly boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_party_identity_assignment_audit_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_party_identity_assignment_audit_version
    UNIQUE (tenant_id, park_id, submission_id, assignment_version_after),
  CONSTRAINT fk_biz_party_identity_assignment_audit_submission
    FOREIGN KEY (tenant_id, park_id, party_id, identity_version, submission_id)
    REFERENCES biz_party_identity_submission(tenant_id, park_id, party_id, identity_version, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_party_identity_assignment_audit_queue
    FOREIGN KEY (tenant_id, park_id, verification_queue_id)
    REFERENCES biz_party_identity_verification_queue(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_biz_party_identity_assignment_audit_action
    CHECK (action IN ('claim', 'reassign', 'revoke', 'legacy-import')),
  CONSTRAINT ck_biz_party_identity_assignment_audit_versions
    CHECK (assignment_version_before >= 0
      AND assignment_version_after = assignment_version_before + 1),
  CONSTRAINT ck_biz_party_identity_assignment_audit_hash
    CHECK (eligibility_policy_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_biz_party_identity_assignment_audit_actor
    CHECK (
      (legacy_backfill = false AND action <> 'legacy-import' AND acted_by IS NOT NULL
       AND legacy_actor_anomaly = false)
      OR (legacy_backfill = true AND action = 'legacy-import' AND source LIKE 'legacy-%')
    ),
  CONSTRAINT ck_biz_party_identity_assignment_audit_anomaly
    CHECK (
      legacy_actor_anomaly = false
      OR (legacy_backfill = true AND confidence IS NOT NULL AND to_verifier_id IS NULL)
    ),
  CONSTRAINT ck_biz_party_identity_assignment_audit_transition
    CHECK (
      (action = 'claim' AND from_verifier_id IS NULL AND to_verifier_id IS NOT NULL)
      OR (action = 'reassign' AND from_verifier_id IS NOT NULL AND to_verifier_id IS NOT NULL
          AND from_verifier_id <> to_verifier_id AND length(trim(reason)) > 0)
      OR (action = 'revoke' AND from_verifier_id IS NOT NULL AND to_verifier_id IS NULL
          AND length(trim(reason)) > 0)
      OR (action = 'legacy-import' AND from_verifier_id IS NULL
          AND assignment_version_before = 0 AND assignment_version_after = 1)
    )
);

CREATE TABLE IF NOT EXISTS biz_party_identity_decision (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  party_id uuid NOT NULL,
  identity_version bigint NOT NULL,
  submission_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  verification_queue_id uuid NOT NULL,
  assignment_version integer NOT NULL,
  eligibility_policy_hash varchar(64) NOT NULL,
  decision varchar(16) NOT NULL,
  reason varchar(500),
  decided_by uuid,
  decided_at timestamptz NOT NULL,
  submission_version integer NOT NULL,
  source varchar(32) NOT NULL,
  confidence varchar(32),
  legacy_backfill boolean NOT NULL DEFAULT false,
  legacy_actor_anomaly boolean NOT NULL DEFAULT false,
  create_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_party_identity_decision_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_party_identity_decision_submission UNIQUE (tenant_id, park_id, submission_id),
  CONSTRAINT fk_biz_party_identity_decision_submission
    FOREIGN KEY (
      tenant_id, park_id, party_id, identity_version, submission_id, snapshot_id,
      verification_queue_id, assignment_version, eligibility_policy_hash
    )
    REFERENCES biz_party_identity_submission(
      tenant_id, park_id, party_id, identity_version, id, snapshot_id,
      verification_queue_id, assignment_version, eligibility_policy_hash
    )
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_party_identity_decision_queue
    FOREIGN KEY (tenant_id, park_id, verification_queue_id)
    REFERENCES biz_party_identity_verification_queue(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_party_identity_decision_snapshot
    FOREIGN KEY (tenant_id, park_id, party_id, identity_version, snapshot_id)
    REFERENCES biz_party_identity_snapshot(tenant_id, park_id, party_id, identity_version, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_biz_party_identity_decision_value CHECK (decision IN ('verified', 'rejected')),
  CONSTRAINT ck_biz_party_identity_decision_versions
    CHECK (submission_version > 0 AND assignment_version > 0),
  CONSTRAINT ck_biz_party_identity_decision_hash
    CHECK (eligibility_policy_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_biz_party_identity_decision_reason
    CHECK (decision <> 'rejected' OR length(trim(reason)) > 0),
  CONSTRAINT ck_biz_party_identity_decision_actor
    CHECK (
      (legacy_backfill = false AND decided_by IS NOT NULL AND legacy_actor_anomaly = false)
      OR (legacy_backfill = true AND source LIKE 'legacy_%')
    ),
  CONSTRAINT ck_biz_party_identity_decision_actor_presence
    CHECK (decided_by IS NOT NULL OR legacy_actor_anomaly = true),
  CONSTRAINT ck_biz_party_identity_decision_anomaly
    CHECK (legacy_actor_anomaly = false OR confidence IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS rel_party_identity_snapshot_file (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  snapshot_id uuid NOT NULL,
  file_id uuid NOT NULL,
  file_version integer NOT NULL,
  content_sha256 varchar(64) NOT NULL,
  mime_type varchar(128) NOT NULL,
  file_size bigint NOT NULL,
  ordinal integer NOT NULL,
  captured_at timestamptz NOT NULL,
  CONSTRAINT uq_rel_party_identity_snapshot_file_file
    UNIQUE (tenant_id, park_id, snapshot_id, file_id),
  CONSTRAINT uq_rel_party_identity_snapshot_file_ordinal
    UNIQUE (tenant_id, park_id, snapshot_id, ordinal),
  CONSTRAINT fk_rel_party_identity_snapshot_file_snapshot
    FOREIGN KEY (tenant_id, park_id, snapshot_id)
    REFERENCES biz_party_identity_snapshot(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_rel_party_identity_snapshot_file_file
    FOREIGN KEY (tenant_id, park_id, file_id)
    REFERENCES sys_file(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_rel_party_identity_snapshot_file_hash
    CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_rel_party_identity_snapshot_file_values
    CHECK (file_version > 0 AND file_size >= 0 AND ordinal >= 0)
);

CREATE TABLE IF NOT EXISTS rel_party_identity_draft_file (
  id uuid NOT NULL DEFAULT public.uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  submission_id uuid NOT NULL,
  file_id uuid NOT NULL,
  file_version integer NOT NULL,
  ordinal integer NOT NULL,
  selected_by uuid NOT NULL,
  selected_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT pk_rel_party_identity_draft_file PRIMARY KEY (id),
  CONSTRAINT uq_rel_party_identity_draft_file_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_rel_party_identity_draft_file_file
    UNIQUE (tenant_id, park_id, submission_id, file_id),
  CONSTRAINT uq_rel_party_identity_draft_file_ordinal
    UNIQUE (tenant_id, park_id, submission_id, ordinal),
  CONSTRAINT fk_rel_party_identity_draft_file_submission
    FOREIGN KEY (tenant_id, park_id, submission_id)
    REFERENCES public.biz_party_identity_submission(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_rel_party_identity_draft_file_file
    FOREIGN KEY (tenant_id, park_id, file_id)
    REFERENCES public.sys_file(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_rel_party_identity_draft_file_values
    CHECK (file_version > 0 AND ordinal >= 0 AND ordinal < 20)
);

CREATE INDEX IF NOT EXISTS idx_rel_party_identity_draft_file_submission
  ON public.rel_party_identity_draft_file
    (tenant_id, park_id, submission_id, ordinal, file_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='biz_party'::regclass AND conname='fk_biz_party_current_identity_submission') THEN
    ALTER TABLE biz_party ADD CONSTRAINT fk_biz_party_current_identity_submission
      FOREIGN KEY (tenant_id, park_id, id, identity_version, current_identity_submission_id)
      REFERENCES biz_party_identity_submission(tenant_id, park_id, party_id, identity_version, id)
      ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='biz_party'::regclass AND conname='fk_biz_party_current_verified_submission') THEN
    ALTER TABLE biz_party ADD CONSTRAINT fk_biz_party_current_verified_submission
      FOREIGN KEY (tenant_id, park_id, id, identity_version, current_verified_submission_id)
      REFERENCES biz_party_identity_submission(tenant_id, park_id, party_id, identity_version, id)
      ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;

DO $install$
BEGIN
  IF pg_catalog.to_regprocedure('public.fn_property_identity_immutable()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.fn_property_identity_immutable()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $body$
      BEGIN
        RAISE EXCEPTION 'property-identity-record-immutable' USING ERRCODE = '55000';
      END;
      $body$
    $function$;
  END IF;
END;
$install$;

DO $install$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.fn_party_identity_create_draft_cas(character varying,character varying,uuid,uuid,bigint,uuid,character varying,integer)'
  ) IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.fn_party_identity_create_draft_cas(
        p_tenant_id character varying,
        p_park_id character varying,
        p_party_id uuid,
        p_actor_id uuid,
        p_expected_identity_version bigint,
        p_supersedes_submission_id uuid,
        p_expected_superseded_status character varying,
        p_expected_superseded_version integer
      )
      RETURNS public.biz_party_identity_submission
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
      DECLARE
        v_party public.biz_party;
        v_old public.biz_party_identity_submission;
        v_new public.biz_party_identity_submission;
        v_new_id uuid := public.uuid_generate_v4();
        v_new_identity_version bigint;
        v_new_attempt integer;
        v_now timestamptz := pg_catalog.clock_timestamp();
      BEGIN
        SET CONSTRAINTS
          public.trg_biz_party_identity_party_consistency,
          public.trg_biz_party_identity_submission_consistency,
          public.trg_biz_party_identity_assignment_consistency,
          public.trg_biz_party_identity_decision_consistency
        DEFERRED;

        IF p_actor_id IS NULL OR p_expected_identity_version < 0 THEN
          RAISE EXCEPTION 'property-validation-failed' USING ERRCODE = '23514';
        END IF;

        SELECT party.*
        INTO v_party
        FROM public.biz_party party
        WHERE party.tenant_id = p_tenant_id
          AND party.park_id = p_park_id
          AND party.id = p_party_id
          AND party.is_deleted = false
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-resource-not-found' USING ERRCODE = 'P0002';
        END IF;
        IF v_party.identity_version <> p_expected_identity_version THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;

        IF p_supersedes_submission_id IS NULL
           AND p_expected_superseded_status IS NULL
           AND p_expected_superseded_version IS NULL
        THEN
          IF v_party.current_identity_submission_id IS NOT NULL
             OR v_party.current_verified_submission_id IS NOT NULL
             OR EXISTS (
               SELECT 1
               FROM public.biz_party_identity_submission submission
               WHERE submission.tenant_id = p_tenant_id
                 AND submission.park_id = p_park_id
                 AND submission.party_id = p_party_id
                 AND submission.legacy_backfill = false
             )
          THEN
            RAISE EXCEPTION 'identity-active-submission-exists' USING ERRCODE = '23505';
          END IF;
          v_new_identity_version := p_expected_identity_version + 1;
          v_new_attempt := 1;
        ELSIF p_supersedes_submission_id IS NOT NULL
           AND p_expected_superseded_status IS NOT NULL
           AND p_expected_superseded_version IS NOT NULL
        THEN
          IF p_expected_superseded_status NOT IN ('rejected', 'withdrawn', 'verified') THEN
            RAISE EXCEPTION 'property-validation-failed' USING ERRCODE = '23514';
          END IF;

          SELECT submission.*
          INTO v_old
          FROM public.biz_party_identity_submission submission
          WHERE submission.tenant_id = p_tenant_id
            AND submission.park_id = p_park_id
            AND submission.party_id = p_party_id
            AND submission.id = p_supersedes_submission_id
          FOR UPDATE;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'property-resource-not-found' USING ERRCODE = 'P0002';
          END IF;
          IF v_old.status <> p_expected_superseded_status
             OR v_old.version <> p_expected_superseded_version
             OR v_old.identity_version <> v_party.identity_version
             OR v_party.current_identity_submission_id <> v_old.id
             OR (v_old.status = 'verified'
                 AND v_party.current_verified_submission_id <> v_old.id)
             OR (v_old.status <> 'verified'
                 AND v_party.current_verified_submission_id IS NOT NULL)
          THEN
            RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
          END IF;

          IF v_old.status = 'verified' THEN
            v_new_identity_version := v_old.identity_version + 1;
            v_new_attempt := 1;
          ELSE
            v_new_identity_version := v_old.identity_version;
            v_new_attempt := v_old.submission_attempt + 1;
          END IF;

          UPDATE public.biz_party_identity_submission
          SET status = 'superseded',
              superseded_by = p_actor_id,
              superseded_at = v_now,
              version = version + 1,
              update_time = v_now
          WHERE tenant_id = p_tenant_id
            AND park_id = p_park_id
            AND id = v_old.id
            AND status = p_expected_superseded_status
            AND version = p_expected_superseded_version;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
          END IF;
        ELSE
          RAISE EXCEPTION 'property-validation-failed' USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.biz_party_identity_submission (
          id, tenant_id, park_id, party_id, identity_version, submission_attempt,
          supersedes_submission_id, status, drafted_by, recorded_by, drafted_at,
          source, version, create_time, update_time
        ) VALUES (
          v_new_id, p_tenant_id, p_park_id, p_party_id, v_new_identity_version,
          v_new_attempt, p_supersedes_submission_id, 'draft', p_actor_id, p_actor_id,
          v_now, 'canonical', 1, v_now, v_now
        )
        RETURNING * INTO v_new;

        UPDATE public.biz_party
        SET identity_version = v_new_identity_version,
            current_identity_submission_id = v_new_id,
            current_verified_submission_id = NULL,
            identity_document_type = NULL,
            identity_number_encrypted = NULL,
            identity_number_hash = NULL,
            identity_number_masked = NULL,
            verification_status = 'unverified',
            update_by = p_actor_id,
            update_time = v_now,
            version = version + 1
        WHERE tenant_id = p_tenant_id
          AND park_id = p_park_id
          AND id = p_party_id
          AND identity_version = p_expected_identity_version;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;
        RETURN v_new;
      EXCEPTION
        WHEN unique_violation THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
      END;
      $body$
    $function$;
  END IF;
END;
$install$;

DO $install$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.fn_party_identity_update_draft_cas(character varying,character varying,uuid,uuid,integer,character varying,text,character varying,character varying,character varying,integer,character varying,integer,uuid[])'
  ) IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.fn_party_identity_update_draft_cas(
        p_tenant_id character varying,
        p_park_id character varying,
        p_submission_id uuid,
        p_actor_id uuid,
        p_expected_submission_version integer,
        p_document_type character varying,
        p_identity_number_encrypted text,
        p_identity_number_hash character varying,
        p_identity_number_masked character varying,
        p_hash_algorithm character varying,
        p_hash_version integer,
        p_encryption_key_id character varying,
        p_payload_format_version integer,
        p_pending_file_ids uuid[]
      )
      RETURNS public.biz_party_identity_submission
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
      DECLARE
        v_party_id uuid;
        v_party public.biz_party;
        v_submission public.biz_party_identity_submission;
        v_result public.biz_party_identity_submission;
        v_file record;
        v_file_count integer;
        v_now timestamptz := pg_catalog.clock_timestamp();
      BEGIN
        SET CONSTRAINTS
          public.trg_biz_party_identity_party_consistency,
          public.trg_biz_party_identity_submission_consistency,
          public.trg_biz_party_identity_assignment_consistency,
          public.trg_biz_party_identity_decision_consistency
        DEFERRED;

        IF p_actor_id IS NULL OR p_expected_submission_version < 1
           OR p_pending_file_ids IS NULL
           OR coalesce(pg_catalog.array_length(p_pending_file_ids, 1), 0) > 20
           OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_pending_file_ids) value WHERE value IS NULL)
           OR (
             SELECT pg_catalog.count(*) <> pg_catalog.count(DISTINCT value)
             FROM pg_catalog.unnest(p_pending_file_ids) value
           )
        THEN
          RAISE EXCEPTION 'property-validation-failed' USING ERRCODE = '23514';
        END IF;

        SELECT submission.party_id
        INTO v_party_id
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = p_tenant_id
          AND submission.park_id = p_park_id
          AND submission.id = p_submission_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-resource-not-found' USING ERRCODE = 'P0002';
        END IF;

        SELECT party.*
        INTO v_party
        FROM public.biz_party party
        WHERE party.tenant_id = p_tenant_id
          AND party.park_id = p_park_id
          AND party.id = v_party_id
          AND party.is_deleted = false
        FOR UPDATE;

        SELECT submission.*
        INTO v_submission
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = p_tenant_id
          AND submission.park_id = p_park_id
          AND submission.id = p_submission_id
        FOR UPDATE;

        IF v_submission.party_id <> v_party.id
           OR v_submission.status <> 'draft'
           OR v_submission.version <> p_expected_submission_version
           OR v_party.current_identity_submission_id <> v_submission.id
           OR v_party.identity_version <> v_submission.identity_version
        THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;

        IF p_document_type IS NULL
           AND p_identity_number_encrypted IS NULL
           AND p_identity_number_hash IS NULL
           AND p_identity_number_masked IS NULL
        THEN
          IF coalesce(pg_catalog.array_length(p_pending_file_ids, 1), 0) <> 0
             OR p_hash_algorithm IS NOT NULL OR p_hash_version IS NOT NULL
             OR p_encryption_key_id IS NOT NULL OR p_payload_format_version IS NOT NULL
          THEN
            RAISE EXCEPTION 'property-validation-failed' USING ERRCODE = '23514';
          END IF;
        ELSIF p_document_type IN ('id_card', 'passport')
           AND p_identity_number_encrypted IS NOT NULL
           AND p_identity_number_hash IS NOT NULL
           AND p_identity_number_masked IS NOT NULL
           AND p_hash_algorithm = 'hmac-sha256'
           AND p_hash_version = 1
           AND p_encryption_key_id IS NOT NULL
           AND pg_catalog.length(pg_catalog.btrim(p_encryption_key_id)) BETWEEN 1 AND 128
           AND p_payload_format_version = 1
        THEN
          NULL;
        ELSE
          RAISE EXCEPTION 'property-validation-failed' USING ERRCODE = '23514';
        END IF;

        PERFORM 1
        FROM public.rel_party_identity_draft_file selection
        WHERE selection.tenant_id = p_tenant_id
          AND selection.park_id = p_park_id
          AND selection.submission_id = p_submission_id
        ORDER BY selection.ordinal, selection.file_id
        FOR UPDATE;

        FOR v_file IN
          SELECT file.*
          FROM public.sys_file file
          JOIN pg_catalog.unnest(p_pending_file_ids) ids(id)
            ON ids.id = file.id
          WHERE file.tenant_id::text = p_tenant_id
            AND file.park_id::text = p_park_id
          ORDER BY file.id
          FOR UPDATE OF file
        LOOP
          IF v_file.is_deleted
             OR v_file.status <> 1
             OR v_file.biz_type <> 'party_identity_evidence'
             OR v_file.biz_id <> p_submission_id
             OR v_file.content_sha256 IS NULL
             OR EXISTS (
               SELECT 1
               FROM public.rel_party_identity_snapshot_file frozen
               WHERE frozen.tenant_id = p_tenant_id
                 AND frozen.park_id = p_park_id
                 AND frozen.file_id = v_file.id
             )
          THEN
            RAISE EXCEPTION 'identity-file-not-ready' USING ERRCODE = '23514';
          END IF;
        END LOOP;

        SELECT pg_catalog.count(*)
        INTO v_file_count
        FROM public.sys_file file
        WHERE file.tenant_id::text = p_tenant_id
          AND file.park_id::text = p_park_id
          AND file.id = ANY(p_pending_file_ids);
        IF v_file_count <> coalesce(pg_catalog.array_length(p_pending_file_ids, 1), 0) THEN
          RAISE EXCEPTION 'identity-file-not-ready' USING ERRCODE = '23514';
        END IF;

        UPDATE public.biz_party_identity_submission
        SET draft_hash_algorithm = p_hash_algorithm,
            draft_hash_version = p_hash_version,
            draft_encryption_key_id = p_encryption_key_id,
            draft_payload_format_version = p_payload_format_version,
            recorded_by = p_actor_id,
            version = version + 1,
            update_time = v_now
        WHERE tenant_id = p_tenant_id
          AND park_id = p_park_id
          AND id = p_submission_id
          AND status = 'draft'
          AND version = p_expected_submission_version
        RETURNING * INTO v_result;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;

        UPDATE public.biz_party
        SET identity_document_type = p_document_type,
            identity_number_encrypted = p_identity_number_encrypted,
            identity_number_hash = p_identity_number_hash,
            identity_number_masked = p_identity_number_masked,
            update_by = p_actor_id,
            update_time = v_now,
            version = version + 1
        WHERE tenant_id = p_tenant_id
          AND park_id = p_park_id
          AND id = v_party.id
          AND identity_version = v_submission.identity_version;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;

        DELETE FROM public.rel_party_identity_draft_file selection
        WHERE selection.tenant_id = p_tenant_id
          AND selection.park_id = p_park_id
          AND selection.submission_id = p_submission_id;

        INSERT INTO public.rel_party_identity_draft_file (
          tenant_id, park_id, submission_id, file_id, file_version, ordinal,
          selected_by, selected_at
        )
        SELECT p_tenant_id, p_park_id, p_submission_id, requested.file_id,
               file.version, requested.ordinal - 1, p_actor_id, v_now
        FROM pg_catalog.unnest(p_pending_file_ids) WITH ORDINALITY
          AS requested(file_id, ordinal)
        JOIN public.sys_file file ON file.id = requested.file_id
        ORDER BY requested.ordinal;

        RETURN v_result;
      END;
      $body$
    $function$;
  END IF;
END;
$install$;

DO $install$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.fn_guard_party_identity_draft_file_mutation()'
  ) IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.fn_guard_party_identity_draft_file_mutation()
      RETURNS trigger
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
      DECLARE
        v_submission public.biz_party_identity_submission;
        v_submission_id uuid;
        v_same_transaction boolean;
      BEGIN
        v_submission_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.submission_id ELSE NEW.submission_id END;
        SELECT submission.*
        INTO v_submission
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END
          AND submission.park_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.park_id ELSE NEW.park_id END
          AND submission.id = v_submission_id
        FOR UPDATE;
        SELECT submission.xmin::text::bigint = pg_catalog.txid_current()
        INTO v_same_transaction
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END
          AND submission.park_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.park_id ELSE NEW.park_id END
          AND submission.id = v_submission_id;

        IF NOT FOUND
           OR v_submission.status <> 'draft'
           OR NOT coalesce(v_same_transaction, false)
        THEN
          RAISE EXCEPTION 'identity-draft-file-mutation-forbidden' USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $body$
    $function$;
  END IF;
END;
$install$;

DO $install$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.fn_guard_party_identity_assignment_audit_insert()'
  ) IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.fn_guard_party_identity_assignment_audit_insert()
      RETURNS trigger
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
      DECLARE
        v_submission public.biz_party_identity_submission;
        v_previous integer;
        v_same_transaction boolean;
      BEGIN
        SELECT submission.*
        INTO v_submission
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = NEW.tenant_id
          AND submission.park_id = NEW.park_id
          AND submission.id = NEW.submission_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-resource-not-found' USING ERRCODE = 'P0002';
        END IF;

        IF NEW.legacy_backfill THEN
          IF NEW.action <> 'legacy-import'
             OR NEW.assignment_version_before <> 0
             OR NEW.assignment_version_after <> 1
          THEN
            RAISE EXCEPTION 'identity-assignment-audit-invalid' USING ERRCODE = '23514';
          END IF;
          RETURN NEW;
        END IF;

        SELECT coalesce(pg_catalog.max(audit.assignment_version_after), 0)
        INTO v_previous
        FROM public.biz_party_identity_assignment_audit audit
        WHERE audit.tenant_id = NEW.tenant_id
          AND audit.park_id = NEW.park_id
          AND audit.submission_id = NEW.submission_id;
        SELECT submission.xmin::text::bigint = pg_catalog.txid_current()
        INTO v_same_transaction
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = NEW.tenant_id
          AND submission.park_id = NEW.park_id
          AND submission.id = NEW.submission_id;

        IF v_submission.status <> 'pending_verification'
           OR EXISTS (
             SELECT 1 FROM public.biz_party_identity_decision decision
             WHERE decision.tenant_id = NEW.tenant_id
               AND decision.park_id = NEW.park_id
               AND decision.submission_id = NEW.submission_id
           )
           OR v_submission.party_id <> NEW.party_id
           OR v_submission.identity_version <> NEW.identity_version
           OR v_submission.verification_queue_id <> NEW.verification_queue_id
           OR v_submission.eligibility_policy_hash <> NEW.eligibility_policy_hash
           OR v_previous <> NEW.assignment_version_before
           OR NEW.assignment_version_after <> NEW.assignment_version_before + 1
           OR v_submission.assignment_version <> NEW.assignment_version_after
           OR v_submission.assigned_verifier_id IS DISTINCT FROM NEW.to_verifier_id
           OR NOT coalesce(v_same_transaction, false)
        THEN
          RAISE EXCEPTION 'identity-assignment-audit-invalid' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $body$
    $function$;
  END IF;
END;
$install$;

DO $install$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.fn_guard_party_identity_decision_insert()'
  ) IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.fn_guard_party_identity_decision_insert()
      RETURNS trigger
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
      DECLARE
        v_submission public.biz_party_identity_submission;
        v_latest public.biz_party_identity_assignment_audit;
      BEGIN
        SELECT submission.*
        INTO v_submission
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = NEW.tenant_id
          AND submission.park_id = NEW.park_id
          AND submission.id = NEW.submission_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-resource-not-found' USING ERRCODE = 'P0002';
        END IF;

        SELECT audit.*
        INTO v_latest
        FROM public.biz_party_identity_assignment_audit audit
        WHERE audit.tenant_id = NEW.tenant_id
          AND audit.park_id = NEW.park_id
          AND audit.submission_id = NEW.submission_id
        ORDER BY audit.assignment_version_after DESC
        LIMIT 1;

        IF NOT NEW.legacy_backfill
           AND (
             v_submission.status <> 'pending_verification'
             OR v_submission.assigned_verifier_id IS DISTINCT FROM NEW.decided_by
             OR v_submission.party_id <> NEW.party_id
             OR v_submission.identity_version <> NEW.identity_version
             OR v_submission.snapshot_id <> NEW.snapshot_id
             OR v_submission.verification_queue_id <> NEW.verification_queue_id
             OR v_submission.assignment_version <> NEW.assignment_version
             OR v_submission.eligibility_policy_hash <> NEW.eligibility_policy_hash
             OR v_submission.version <> NEW.submission_version
             OR v_latest.assignment_version_after <> NEW.assignment_version
             OR v_latest.action NOT IN ('claim', 'reassign')
             OR v_latest.to_verifier_id IS DISTINCT FROM NEW.decided_by
             OR v_latest.verification_queue_id <> NEW.verification_queue_id
             OR v_latest.eligibility_policy_hash <> NEW.eligibility_policy_hash
             OR NEW.decided_by = v_submission.drafted_by
             OR NEW.decided_by = v_submission.recorded_by
             OR NEW.decided_by = v_submission.submitted_by
           )
        THEN
          RAISE EXCEPTION 'identity-decision-invalid' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $body$
    $function$;
  END IF;
END;
$install$;

DO $install$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.fn_party_identity_submit_cas(character varying,character varying,uuid,uuid,integer,uuid,jsonb,character varying)'
  ) IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.fn_party_identity_submit_cas(
        p_tenant_id character varying,
        p_park_id character varying,
        p_submission_id uuid,
        p_actor_id uuid,
        p_expected_submission_version integer,
        p_verification_queue_id uuid,
        p_eligibility_policy_snapshot jsonb,
        p_eligibility_policy_hash character varying
      )
      RETURNS public.biz_party_identity_submission
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
      DECLARE
        v_party_id uuid;
        v_party public.biz_party;
        v_submission public.biz_party_identity_submission;
        v_queue public.biz_party_identity_verification_queue;
        v_result public.biz_party_identity_submission;
        v_snapshot_id uuid := public.uuid_generate_v4();
        v_revision integer;
        v_selection_count integer;
        v_now timestamptz := pg_catalog.clock_timestamp();
      BEGIN
        SET CONSTRAINTS
          public.trg_biz_party_identity_party_consistency,
          public.trg_biz_party_identity_submission_consistency,
          public.trg_biz_party_identity_assignment_consistency,
          public.trg_biz_party_identity_decision_consistency
        DEFERRED;

        IF p_actor_id IS NULL
           OR p_expected_submission_version < 1
           OR p_verification_queue_id IS NULL
           OR p_eligibility_policy_snapshot IS NULL
           OR pg_catalog.jsonb_typeof(p_eligibility_policy_snapshot) <> 'object'
           OR p_eligibility_policy_hash !~ '^[0-9a-f]{64}$'
        THEN
          RAISE EXCEPTION 'property-validation-failed' USING ERRCODE = '23514';
        END IF;

        SELECT submission.party_id
        INTO v_party_id
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = p_tenant_id
          AND submission.park_id = p_park_id
          AND submission.id = p_submission_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-resource-not-found' USING ERRCODE = 'P0002';
        END IF;

        SELECT party.*
        INTO v_party
        FROM public.biz_party party
        WHERE party.tenant_id = p_tenant_id
          AND party.park_id = p_park_id
          AND party.id = v_party_id
          AND party.is_deleted = false
        FOR UPDATE;

        SELECT submission.*
        INTO v_submission
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = p_tenant_id
          AND submission.park_id = p_park_id
          AND submission.id = p_submission_id
        FOR UPDATE;

        IF v_submission.party_id <> v_party.id
           OR v_submission.status <> 'draft'
           OR v_submission.version <> p_expected_submission_version
           OR v_party.current_identity_submission_id <> v_submission.id
           OR v_party.identity_version <> v_submission.identity_version
           OR v_party.identity_document_type NOT IN ('id_card', 'passport')
           OR v_party.identity_number_encrypted IS NULL
           OR v_party.identity_number_hash IS NULL
           OR v_party.identity_number_masked IS NULL
           OR v_submission.draft_hash_algorithm <> 'hmac-sha256'
           OR v_submission.draft_hash_version <> 1
           OR pg_catalog.length(pg_catalog.btrim(v_submission.draft_encryption_key_id)) < 1
           OR v_submission.draft_payload_format_version <> 1
        THEN
          RAISE EXCEPTION 'identity-snapshot-stale' USING ERRCODE = '23514';
        END IF;

        SELECT queue.*
        INTO v_queue
        FROM public.biz_party_identity_verification_queue queue
        WHERE queue.tenant_id = p_tenant_id
          AND queue.park_id = p_park_id
          AND queue.id = p_verification_queue_id
        FOR UPDATE;
        IF NOT FOUND
           OR v_queue.status <> 'active'
           OR v_queue.legacy_backfill
           OR v_queue.eligibility_policy_snapshot <> p_eligibility_policy_snapshot
           OR v_queue.eligibility_policy_hash <> p_eligibility_policy_hash
        THEN
          RAISE EXCEPTION 'property-validation-failed' USING ERRCODE = '23514';
        END IF;

        PERFORM 1
        FROM public.rel_party_identity_draft_file selection
        WHERE selection.tenant_id = p_tenant_id
          AND selection.park_id = p_park_id
          AND selection.submission_id = p_submission_id
        ORDER BY selection.ordinal, selection.file_id
        FOR UPDATE;

        PERFORM 1
        FROM public.sys_file file
        JOIN public.rel_party_identity_draft_file selection
          ON selection.file_id = file.id
         AND selection.tenant_id = file.tenant_id::text
         AND selection.park_id = file.park_id::text
        WHERE selection.tenant_id = p_tenant_id
          AND selection.park_id = p_park_id
          AND selection.submission_id = p_submission_id
        ORDER BY file.id
        FOR UPDATE OF file;

        IF EXISTS (
          SELECT 1
          FROM public.rel_party_identity_draft_file selection
          LEFT JOIN public.sys_file file
            ON file.id = selection.file_id
           AND file.tenant_id::text = selection.tenant_id
           AND file.park_id::text = selection.park_id
          WHERE selection.tenant_id = p_tenant_id
            AND selection.park_id = p_park_id
            AND selection.submission_id = p_submission_id
            AND (
              file.id IS NULL
              OR file.version <> selection.file_version
              OR file.is_deleted
              OR file.status <> 1
              OR file.biz_type <> 'party_identity_evidence'
              OR file.biz_id <> p_submission_id
              OR file.content_sha256 IS NULL
            )
        ) THEN
          RAISE EXCEPTION 'identity-file-not-ready' USING ERRCODE = '23514';
        END IF;

        SELECT pg_catalog.count(*)
        INTO v_selection_count
        FROM public.rel_party_identity_draft_file selection
        WHERE selection.tenant_id = p_tenant_id
          AND selection.park_id = p_park_id
          AND selection.submission_id = p_submission_id;
        IF EXISTS (
          SELECT 1
          FROM pg_catalog.generate_series(0, v_selection_count - 1) ordinal
          WHERE NOT EXISTS (
            SELECT 1 FROM public.rel_party_identity_draft_file selection
            WHERE selection.tenant_id = p_tenant_id
              AND selection.park_id = p_park_id
              AND selection.submission_id = p_submission_id
              AND selection.ordinal = ordinal
          )
        ) THEN
          RAISE EXCEPTION 'identity-file-not-ready' USING ERRCODE = '23514';
        END IF;

        SELECT coalesce(pg_catalog.max(snapshot.snapshot_revision), 0) + 1
        INTO v_revision
        FROM public.biz_party_identity_snapshot snapshot
        WHERE snapshot.tenant_id = p_tenant_id
          AND snapshot.park_id = p_park_id
          AND snapshot.party_id = v_party.id
          AND snapshot.identity_version = v_submission.identity_version;

        INSERT INTO public.biz_party_identity_snapshot (
          id, tenant_id, park_id, party_id, identity_version, snapshot_revision,
          document_type, normalized_identity_hash, hash_algorithm, hash_version,
          encrypted_payload, encryption_key_id, payload_format_version, captured_by,
          captured_at, source, create_time
        ) VALUES (
          v_snapshot_id, p_tenant_id, p_park_id, v_party.id,
          v_submission.identity_version, v_revision, v_party.identity_document_type,
          v_party.identity_number_hash, v_submission.draft_hash_algorithm,
          v_submission.draft_hash_version, v_party.identity_number_encrypted,
          v_submission.draft_encryption_key_id,
          v_submission.draft_payload_format_version, p_actor_id, v_now,
          'canonical', v_now
        );

        INSERT INTO public.rel_party_identity_snapshot_file (
          tenant_id, park_id, snapshot_id, file_id, file_version, content_sha256,
          mime_type, file_size, ordinal, captured_at
        )
        SELECT p_tenant_id, p_park_id, v_snapshot_id, selection.file_id,
               selection.file_version, file.content_sha256, file.mime_type,
               file.file_size, selection.ordinal, v_now
        FROM public.rel_party_identity_draft_file selection
        JOIN public.sys_file file ON file.id = selection.file_id
        WHERE selection.tenant_id = p_tenant_id
          AND selection.park_id = p_park_id
          AND selection.submission_id = p_submission_id
        ORDER BY selection.ordinal;

        UPDATE public.biz_party_identity_submission
        SET snapshot_id = v_snapshot_id,
            verification_queue_id = p_verification_queue_id,
            eligibility_policy_snapshot = p_eligibility_policy_snapshot,
            eligibility_policy_hash = p_eligibility_policy_hash,
            status = 'pending_verification',
            submitted_by = p_actor_id,
            submitted_at = v_now,
            version = version + 1,
            update_time = v_now
        WHERE tenant_id = p_tenant_id
          AND park_id = p_park_id
          AND id = p_submission_id
          AND status = 'draft'
          AND version = p_expected_submission_version
        RETURNING * INTO v_result;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;
        RETURN v_result;
      EXCEPTION
        WHEN unique_violation THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
      END;
      $body$
    $function$;
  END IF;
END;
$install$;

DO $install$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.fn_party_identity_assignment_cas(character varying,character varying,uuid,uuid,character varying,uuid,character varying,character varying,integer,integer)'
  ) IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.fn_party_identity_assignment_cas(
        p_tenant_id character varying,
        p_park_id character varying,
        p_submission_id uuid,
        p_actor_id uuid,
        p_action character varying,
        p_to_verifier_id uuid,
        p_reason character varying,
        p_request_id character varying,
        p_expected_submission_version integer,
        p_expected_assignment_version integer
      )
      RETURNS public.biz_party_identity_submission
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
      DECLARE
        v_party_id uuid;
        v_submission public.biz_party_identity_submission;
        v_result public.biz_party_identity_submission;
        v_now timestamptz := pg_catalog.clock_timestamp();
      BEGIN
        SET CONSTRAINTS
          public.trg_biz_party_identity_party_consistency,
          public.trg_biz_party_identity_submission_consistency,
          public.trg_biz_party_identity_assignment_consistency,
          public.trg_biz_party_identity_decision_consistency
        DEFERRED;

        SELECT submission.party_id
        INTO v_party_id
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = p_tenant_id
          AND submission.park_id = p_park_id
          AND submission.id = p_submission_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-resource-not-found' USING ERRCODE = 'P0002';
        END IF;

        PERFORM 1
        FROM public.biz_party party
        WHERE party.tenant_id = p_tenant_id
          AND party.park_id = p_park_id
          AND party.id = v_party_id
          AND party.is_deleted = false
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-resource-not-found' USING ERRCODE = 'P0002';
        END IF;

        SELECT submission.*
        INTO v_submission
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = p_tenant_id
          AND submission.park_id = p_park_id
          AND submission.id = p_submission_id
        FOR UPDATE;
        IF v_submission.party_id <> v_party_id
           OR v_submission.status <> 'pending_verification'
           OR v_submission.version <> p_expected_submission_version
           OR v_submission.assignment_version <> p_expected_assignment_version
           OR v_submission.verification_queue_id IS NULL
           OR v_submission.eligibility_policy_hash IS NULL
           OR p_actor_id IS NULL
           OR p_request_id IS NULL
           OR pg_catalog.length(pg_catalog.btrim(p_request_id)) = 0
           OR EXISTS (
             SELECT 1 FROM public.biz_party_identity_decision decision
             WHERE decision.tenant_id = p_tenant_id
               AND decision.park_id = p_park_id
               AND decision.submission_id = p_submission_id
           )
        THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;

        IF (p_action = 'claim'
            AND v_submission.assigned_verifier_id IS NULL
            AND p_to_verifier_id IS NOT NULL
            AND p_actor_id = p_to_verifier_id)
           OR (p_action = 'reassign'
               AND v_submission.assigned_verifier_id IS NOT NULL
               AND p_to_verifier_id IS NOT NULL
               AND v_submission.assigned_verifier_id <> p_to_verifier_id
               AND p_reason IS NOT NULL
               AND pg_catalog.length(pg_catalog.btrim(p_reason)) > 0)
           OR (p_action = 'revoke'
               AND v_submission.assigned_verifier_id IS NOT NULL
               AND p_to_verifier_id IS NULL
               AND p_reason IS NOT NULL
               AND pg_catalog.length(pg_catalog.btrim(p_reason)) > 0)
        THEN
          NULL;
        ELSE
          RAISE EXCEPTION 'property-validation-failed' USING ERRCODE = '23514';
        END IF;

        UPDATE public.biz_party_identity_submission
        SET assigned_verifier_id = p_to_verifier_id,
            assignment_version = assignment_version + 1,
            version = version + 1,
            update_time = v_now
        WHERE tenant_id = p_tenant_id
          AND park_id = p_park_id
          AND id = p_submission_id
          AND status = 'pending_verification'
          AND version = p_expected_submission_version
          AND assignment_version = p_expected_assignment_version
        RETURNING * INTO v_result;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;

        INSERT INTO public.biz_party_identity_assignment_audit (
          tenant_id, park_id, party_id, identity_version, submission_id,
          verification_queue_id, action, from_verifier_id, to_verifier_id,
          acted_by, reason, eligibility_policy_hash, assignment_version_before,
          assignment_version_after, request_id, source, occurred_at
        ) VALUES (
          p_tenant_id, p_park_id, v_submission.party_id,
          v_submission.identity_version, p_submission_id,
          v_submission.verification_queue_id, p_action,
          v_submission.assigned_verifier_id, p_to_verifier_id, p_actor_id,
          p_reason, v_submission.eligibility_policy_hash,
          p_expected_assignment_version, p_expected_assignment_version + 1,
          p_request_id, 'canonical', v_now
        );
        RETURN v_result;
      END;
      $body$
    $function$;
  END IF;
END;
$install$;

DO $install$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.fn_party_identity_withdraw_cas(character varying,character varying,uuid,uuid,character varying,character varying,integer)'
  ) IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.fn_party_identity_withdraw_cas(
        p_tenant_id character varying,
        p_park_id character varying,
        p_submission_id uuid,
        p_actor_id uuid,
        p_reason character varying,
        p_request_id character varying,
        p_expected_submission_version integer
      )
      RETURNS public.biz_party_identity_submission
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
      DECLARE
        v_party_id uuid;
        v_submission public.biz_party_identity_submission;
        v_result public.biz_party_identity_submission;
        v_now timestamptz := pg_catalog.clock_timestamp();
      BEGIN
        SET CONSTRAINTS
          public.trg_biz_party_identity_party_consistency,
          public.trg_biz_party_identity_submission_consistency,
          public.trg_biz_party_identity_assignment_consistency,
          public.trg_biz_party_identity_decision_consistency
        DEFERRED;

        IF p_actor_id IS NULL
           OR p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason)) = 0
           OR p_request_id IS NULL OR pg_catalog.length(pg_catalog.btrim(p_request_id)) = 0
        THEN
          RAISE EXCEPTION 'property-validation-failed' USING ERRCODE = '23514';
        END IF;

        SELECT submission.party_id
        INTO v_party_id
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = p_tenant_id
          AND submission.park_id = p_park_id
          AND submission.id = p_submission_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-resource-not-found' USING ERRCODE = 'P0002';
        END IF;

        PERFORM 1
        FROM public.biz_party party
        WHERE party.tenant_id = p_tenant_id
          AND party.park_id = p_park_id
          AND party.id = v_party_id
          AND party.is_deleted = false
        FOR UPDATE;

        SELECT submission.*
        INTO v_submission
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = p_tenant_id
          AND submission.park_id = p_park_id
          AND submission.id = p_submission_id
        FOR UPDATE;

        IF v_submission.party_id <> v_party_id
           OR v_submission.status <> 'pending_verification'
           OR v_submission.submitted_by <> p_actor_id
           OR v_submission.version <> p_expected_submission_version
           OR EXISTS (
             SELECT 1 FROM public.biz_party_identity_decision decision
             WHERE decision.tenant_id = p_tenant_id
               AND decision.park_id = p_park_id
               AND decision.submission_id = p_submission_id
           )
        THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;

        IF v_submission.assigned_verifier_id IS NOT NULL THEN
          UPDATE public.biz_party_identity_submission
          SET assigned_verifier_id = NULL,
              assignment_version = assignment_version + 1,
              version = version + 1,
              update_time = v_now
          WHERE tenant_id = p_tenant_id
            AND park_id = p_park_id
            AND id = p_submission_id
            AND version = p_expected_submission_version
            AND assignment_version = v_submission.assignment_version
          RETURNING * INTO v_result;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
          END IF;

          INSERT INTO public.biz_party_identity_assignment_audit (
            tenant_id, park_id, party_id, identity_version, submission_id,
            verification_queue_id, action, from_verifier_id, to_verifier_id,
            acted_by, reason, eligibility_policy_hash, assignment_version_before,
            assignment_version_after, request_id, source, occurred_at
          ) VALUES (
            p_tenant_id, p_park_id, v_submission.party_id,
            v_submission.identity_version, p_submission_id,
            v_submission.verification_queue_id, 'revoke',
            v_submission.assigned_verifier_id, NULL, p_actor_id, p_reason,
            v_submission.eligibility_policy_hash, v_submission.assignment_version,
            v_submission.assignment_version + 1, p_request_id, 'canonical', v_now
          );
          v_submission := v_result;
        END IF;

        UPDATE public.biz_party_identity_submission
        SET status = 'withdrawn',
            withdrawn_by = p_actor_id,
            withdrawn_at = v_now,
            decision_reason = p_reason,
            version = version + 1,
            update_time = v_now
        WHERE tenant_id = p_tenant_id
          AND park_id = p_park_id
          AND id = p_submission_id
          AND status = 'pending_verification'
          AND version = v_submission.version
          AND assignment_version = v_submission.assignment_version
          AND assigned_verifier_id IS NULL
        RETURNING * INTO v_result;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;
        RETURN v_result;
      END;
      $body$
    $function$;
  END IF;
END;
$install$;

DO $install$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.fn_party_identity_decision_cas(character varying,character varying,uuid,uuid,character varying,character varying,integer,integer)'
  ) IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.fn_party_identity_decision_cas(
        p_tenant_id character varying,
        p_park_id character varying,
        p_submission_id uuid,
        p_actor_id uuid,
        p_decision character varying,
        p_reason character varying,
        p_expected_submission_version integer,
        p_expected_assignment_version integer
      )
      RETURNS public.biz_party_identity_submission
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
      DECLARE
        v_party_id uuid;
        v_party public.biz_party;
        v_submission public.biz_party_identity_submission;
        v_latest public.biz_party_identity_assignment_audit;
        v_result public.biz_party_identity_submission;
        v_now timestamptz := pg_catalog.clock_timestamp();
      BEGIN
        SET CONSTRAINTS
          public.trg_biz_party_identity_party_consistency,
          public.trg_biz_party_identity_submission_consistency,
          public.trg_biz_party_identity_assignment_consistency,
          public.trg_biz_party_identity_decision_consistency
        DEFERRED;

        SELECT submission.party_id
        INTO v_party_id
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = p_tenant_id
          AND submission.park_id = p_park_id
          AND submission.id = p_submission_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-resource-not-found' USING ERRCODE = 'P0002';
        END IF;

        SELECT party.*
        INTO v_party
        FROM public.biz_party party
        WHERE party.tenant_id = p_tenant_id
          AND party.park_id = p_park_id
          AND party.id = v_party_id
          AND party.is_deleted = false
        FOR UPDATE;

        SELECT submission.*
        INTO v_submission
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = p_tenant_id
          AND submission.park_id = p_park_id
          AND submission.id = p_submission_id
        FOR UPDATE;

        PERFORM 1
        FROM public.biz_party_identity_snapshot snapshot
        WHERE snapshot.tenant_id = p_tenant_id
          AND snapshot.park_id = p_park_id
          AND snapshot.id = v_submission.snapshot_id
        FOR UPDATE;
        PERFORM 1
        FROM public.rel_party_identity_snapshot_file snapshot_file
        WHERE snapshot_file.tenant_id = p_tenant_id
          AND snapshot_file.park_id = p_park_id
          AND snapshot_file.snapshot_id = v_submission.snapshot_id
        ORDER BY snapshot_file.file_id
        FOR UPDATE;

        SELECT audit.*
        INTO v_latest
        FROM public.biz_party_identity_assignment_audit audit
        WHERE audit.tenant_id = p_tenant_id
          AND audit.park_id = p_park_id
          AND audit.submission_id = p_submission_id
        ORDER BY audit.assignment_version_after DESC
        LIMIT 1;

        IF v_submission.party_id <> v_party.id
           OR v_submission.status <> 'pending_verification'
           OR v_submission.version <> p_expected_submission_version
           OR v_submission.assignment_version <> p_expected_assignment_version
           OR v_submission.assigned_verifier_id <> p_actor_id
           OR v_submission.snapshot_id IS NULL
           OR v_submission.verification_queue_id IS NULL
           OR v_submission.eligibility_policy_hash IS NULL
           OR v_latest.assignment_version_after <> p_expected_assignment_version
           OR v_latest.action NOT IN ('claim', 'reassign')
           OR v_latest.to_verifier_id <> p_actor_id
           OR v_latest.verification_queue_id <> v_submission.verification_queue_id
           OR v_latest.eligibility_policy_hash <> v_submission.eligibility_policy_hash
        THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;

        IF p_actor_id = v_submission.drafted_by
           OR p_actor_id = v_submission.recorded_by
           OR p_actor_id = v_submission.submitted_by
        THEN
          RAISE EXCEPTION 'identity-actor-separation-required' USING ERRCODE = '23514';
        END IF;
        IF p_decision NOT IN ('verified', 'rejected')
           OR (p_decision = 'rejected'
               AND (p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason)) = 0))
        THEN
          RAISE EXCEPTION 'property-validation-failed' USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.biz_party_identity_decision (
          tenant_id, park_id, party_id, identity_version, submission_id,
          snapshot_id, verification_queue_id, assignment_version,
          eligibility_policy_hash, decision, reason, decided_by, decided_at,
          submission_version, source, create_time
        ) VALUES (
          p_tenant_id, p_park_id, v_submission.party_id,
          v_submission.identity_version, p_submission_id, v_submission.snapshot_id,
          v_submission.verification_queue_id, v_submission.assignment_version,
          v_submission.eligibility_policy_hash, p_decision, p_reason, p_actor_id,
          v_now, v_submission.version, 'canonical', v_now
        );

        UPDATE public.biz_party_identity_submission
        SET status = p_decision,
            assigned_verifier_id = NULL,
            decided_by = p_actor_id,
            decided_at = v_now,
            decision_reason = p_reason,
            version = version + 1,
            update_time = v_now
        WHERE tenant_id = p_tenant_id
          AND park_id = p_park_id
          AND id = p_submission_id
          AND status = 'pending_verification'
          AND version = p_expected_submission_version
          AND assignment_version = p_expected_assignment_version
          AND assigned_verifier_id = p_actor_id
        RETURNING * INTO v_result;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;

        UPDATE public.biz_party
        SET current_identity_submission_id = p_submission_id,
            current_verified_submission_id =
              CASE WHEN p_decision = 'verified' THEN p_submission_id ELSE NULL END,
            verification_status = p_decision,
            update_by = p_actor_id,
            update_time = v_now,
            version = version + 1
        WHERE tenant_id = p_tenant_id
          AND park_id = p_park_id
          AND id = v_party.id
          AND identity_version = v_submission.identity_version;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
        END IF;
        RETURN v_result;
      EXCEPTION
        WHEN unique_violation THEN
          RAISE EXCEPTION 'property-version-conflict' USING ERRCODE = '40001';
      END;
      $body$
    $function$;
  END IF;
END;
$install$;

DO $install$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.fn_validate_party_identity_consistency()'
  ) IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.fn_validate_party_identity_consistency()
      RETURNS trigger
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
      DECLARE
        v_tenant_id varchar(64);
        v_park_id varchar(64);
        v_party_id uuid;
        v_submission_id uuid;
        v_party public.biz_party;
        v_current public.biz_party_identity_submission;
        v_submission public.biz_party_identity_submission;
        v_old public.biz_party_identity_submission;
        v_latest public.biz_party_identity_assignment_audit;
        v_decision public.biz_party_identity_decision;
        v_max_identity_version bigint;
        v_audit_count integer;
        v_decision_count integer;
      BEGIN
        IF TG_TABLE_NAME = 'biz_party' THEN
          v_tenant_id := NEW.tenant_id;
          v_park_id := NEW.park_id;
          v_party_id := NEW.id;
        ELSIF TG_TABLE_NAME = 'biz_party_identity_submission' THEN
          v_tenant_id := NEW.tenant_id;
          v_park_id := NEW.park_id;
          v_party_id := NEW.party_id;
          v_submission_id := NEW.id;
        ELSE
          v_tenant_id := NEW.tenant_id;
          v_park_id := NEW.park_id;
          v_party_id := NEW.party_id;
          v_submission_id := NEW.submission_id;
        END IF;

        SELECT party.*
        INTO v_party
        FROM public.biz_party party
        WHERE party.tenant_id = v_tenant_id
          AND party.park_id = v_park_id
          AND party.id = v_party_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'identity-consistency-party-missing' USING ERRCODE = '23514';
        END IF;

        SELECT pg_catalog.max(submission.identity_version)
        INTO v_max_identity_version
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = v_tenant_id
          AND submission.park_id = v_park_id
          AND submission.party_id = v_party_id
          AND submission.legacy_backfill = false;

        IF v_party.identity_version = 0 THEN
          IF v_party.current_identity_submission_id IS NOT NULL
             OR v_party.current_verified_submission_id IS NOT NULL
             OR v_max_identity_version IS NOT NULL
          THEN
            RAISE EXCEPTION 'identity-consistency-zero-version-invalid' USING ERRCODE = '23514';
          END IF;
          RETURN NEW;
        END IF;

        IF v_party.current_identity_submission_id IS NULL
           OR v_max_identity_version IS DISTINCT FROM v_party.identity_version
        THEN
          RAISE EXCEPTION 'identity-consistency-current-pointer-invalid' USING ERRCODE = '23514';
        END IF;

        SELECT submission.*
        INTO v_current
        FROM public.biz_party_identity_submission submission
        WHERE submission.tenant_id = v_tenant_id
          AND submission.park_id = v_park_id
          AND submission.party_id = v_party_id
          AND submission.id = v_party.current_identity_submission_id;
        IF NOT FOUND
           OR v_current.identity_version <> v_party.identity_version
           OR v_current.status = 'superseded'
        THEN
          RAISE EXCEPTION 'identity-consistency-current-pointer-invalid' USING ERRCODE = '23514';
        END IF;

        IF (v_current.status = 'verified'
            AND v_party.current_verified_submission_id <> v_current.id)
           OR (v_current.status <> 'verified'
               AND v_party.current_verified_submission_id IS NOT NULL)
        THEN
          RAISE EXCEPTION 'identity-consistency-verified-pointer-invalid' USING ERRCODE = '23514';
        END IF;

        FOR v_submission IN
          SELECT submission.*
          FROM public.biz_party_identity_submission submission
          WHERE submission.tenant_id = v_tenant_id
            AND submission.park_id = v_park_id
            AND submission.party_id = v_party_id
            AND submission.legacy_backfill = false
          ORDER BY submission.identity_version, submission.submission_attempt, submission.id
        LOOP
          IF v_submission.supersedes_submission_id IS NOT NULL THEN
            SELECT old_submission.*
            INTO v_old
            FROM public.biz_party_identity_submission old_submission
            WHERE old_submission.tenant_id = v_tenant_id
              AND old_submission.park_id = v_park_id
              AND old_submission.party_id = v_party_id
              AND old_submission.id = v_submission.supersedes_submission_id;
            IF NOT FOUND OR v_old.status <> 'superseded' THEN
              RAISE EXCEPTION 'identity-consistency-supersedes-invalid' USING ERRCODE = '23514';
            END IF;
            IF EXISTS (
              SELECT 1
              FROM public.biz_party_identity_decision old_decision
              WHERE old_decision.tenant_id = v_tenant_id
                AND old_decision.park_id = v_park_id
                AND old_decision.submission_id = v_old.id
                AND old_decision.decision = 'verified'
            ) THEN
              IF v_submission.identity_version <> v_old.identity_version + 1
                 OR v_submission.submission_attempt <> 1
              THEN
                RAISE EXCEPTION 'identity-consistency-supersedes-invalid' USING ERRCODE = '23514';
              END IF;
            ELSIF v_old.withdrawn_at IS NOT NULL
               OR EXISTS (
                 SELECT 1
                 FROM public.biz_party_identity_decision old_decision
                 WHERE old_decision.tenant_id = v_tenant_id
                   AND old_decision.park_id = v_park_id
                   AND old_decision.submission_id = v_old.id
                   AND old_decision.decision = 'rejected'
               )
            THEN
              IF v_submission.identity_version <> v_old.identity_version
                 OR v_submission.submission_attempt <> v_old.submission_attempt + 1
              THEN
                RAISE EXCEPTION 'identity-consistency-supersedes-invalid' USING ERRCODE = '23514';
              END IF;
            ELSE
              RAISE EXCEPTION 'identity-consistency-supersedes-invalid' USING ERRCODE = '23514';
            END IF;
          END IF;

          SELECT pg_catalog.count(*),
                 pg_catalog.max(audit.assignment_version_after)
          INTO v_audit_count, v_max_identity_version
          FROM public.biz_party_identity_assignment_audit audit
          WHERE audit.tenant_id = v_tenant_id
            AND audit.park_id = v_park_id
            AND audit.submission_id = v_submission.id;

          IF v_submission.assignment_version = 0 THEN
            IF v_audit_count <> 0 OR v_submission.assigned_verifier_id IS NOT NULL THEN
              RAISE EXCEPTION 'identity-consistency-assignment-invalid' USING ERRCODE = '23514';
            END IF;
            v_latest := NULL;
          ELSE
            IF v_audit_count <> v_submission.assignment_version
               OR v_max_identity_version <> v_submission.assignment_version
               OR EXISTS (
                 SELECT 1
                 FROM pg_catalog.generate_series(1, v_submission.assignment_version) expected
                 WHERE NOT EXISTS (
                   SELECT 1
                   FROM public.biz_party_identity_assignment_audit audit
                   WHERE audit.tenant_id = v_tenant_id
                     AND audit.park_id = v_park_id
                     AND audit.submission_id = v_submission.id
                     AND audit.assignment_version_after = expected
                 )
               )
            THEN
              RAISE EXCEPTION 'identity-consistency-assignment-invalid' USING ERRCODE = '23514';
            END IF;
            SELECT audit.*
            INTO v_latest
            FROM public.biz_party_identity_assignment_audit audit
            WHERE audit.tenant_id = v_tenant_id
              AND audit.park_id = v_park_id
              AND audit.submission_id = v_submission.id
            ORDER BY audit.assignment_version_after DESC
            LIMIT 1;
          END IF;

          SELECT pg_catalog.count(*)
          INTO v_decision_count
          FROM public.biz_party_identity_decision decision
          WHERE decision.tenant_id = v_tenant_id
            AND decision.park_id = v_park_id
            AND decision.submission_id = v_submission.id;

          IF v_submission.status = 'draft' THEN
            IF v_submission.assignment_version <> 0 OR v_decision_count <> 0 THEN
              RAISE EXCEPTION 'identity-consistency-draft-invalid' USING ERRCODE = '23514';
            END IF;
          ELSIF v_submission.status = 'pending_verification' THEN
            IF v_decision_count <> 0
               OR (
                 v_submission.assigned_verifier_id IS NULL
                 AND v_submission.assignment_version > 0
                 AND v_latest.action <> 'revoke'
               )
               OR (
                 v_submission.assigned_verifier_id IS NOT NULL
                 AND (
                   v_latest.action NOT IN ('claim', 'reassign')
                   OR v_latest.to_verifier_id <> v_submission.assigned_verifier_id
                 )
               )
            THEN
              RAISE EXCEPTION 'identity-consistency-pending-invalid' USING ERRCODE = '23514';
            END IF;
          ELSIF v_submission.status IN ('verified', 'rejected') THEN
            SELECT decision.*
            INTO v_decision
            FROM public.biz_party_identity_decision decision
            WHERE decision.tenant_id = v_tenant_id
              AND decision.park_id = v_park_id
              AND decision.submission_id = v_submission.id;
            IF v_decision_count <> 1
               OR v_submission.assigned_verifier_id IS NOT NULL
               OR v_decision.decision <> v_submission.status
               OR v_decision.party_id <> v_submission.party_id
               OR v_decision.identity_version <> v_submission.identity_version
               OR v_decision.snapshot_id <> v_submission.snapshot_id
               OR v_decision.verification_queue_id <> v_submission.verification_queue_id
               OR v_decision.assignment_version <> v_submission.assignment_version
               OR v_decision.eligibility_policy_hash <> v_submission.eligibility_policy_hash
               OR v_decision.decided_by IS DISTINCT FROM v_submission.decided_by
               OR v_decision.decided_at <> v_submission.decided_at
               OR v_decision.submission_version <> v_submission.version - 1
               OR v_latest.action NOT IN ('claim', 'reassign')
               OR v_latest.to_verifier_id IS DISTINCT FROM v_decision.decided_by
            THEN
              RAISE EXCEPTION 'identity-consistency-decision-invalid' USING ERRCODE = '23514';
            END IF;
          ELSIF v_submission.status = 'withdrawn' THEN
            IF v_decision_count <> 0
               OR v_submission.assigned_verifier_id IS NOT NULL
               OR (v_submission.assignment_version > 0 AND v_latest.action <> 'revoke')
            THEN
              RAISE EXCEPTION 'identity-consistency-terminal-invalid' USING ERRCODE = '23514';
            END IF;
          ELSIF v_submission.status = 'superseded' THEN
            IF v_submission.assigned_verifier_id IS NOT NULL
               OR v_decision_count > 1
               OR (
                 v_decision_count = 0
                 AND v_submission.assignment_version > 0
                 AND v_latest.action <> 'revoke'
               )
            THEN
              RAISE EXCEPTION 'identity-consistency-terminal-invalid' USING ERRCODE = '23514';
            END IF;
            IF v_decision_count = 1 THEN
              SELECT decision.*
              INTO v_decision
              FROM public.biz_party_identity_decision decision
              WHERE decision.tenant_id = v_tenant_id
                AND decision.park_id = v_park_id
                AND decision.submission_id = v_submission.id;
              IF v_decision.party_id <> v_submission.party_id
                 OR v_decision.identity_version <> v_submission.identity_version
                 OR v_decision.snapshot_id <> v_submission.snapshot_id
                 OR v_decision.verification_queue_id <> v_submission.verification_queue_id
                 OR v_decision.assignment_version <> v_submission.assignment_version
                 OR v_decision.eligibility_policy_hash <> v_submission.eligibility_policy_hash
                 OR v_decision.decided_by IS DISTINCT FROM v_submission.decided_by
                 OR v_decision.decided_at <> v_submission.decided_at
                 OR v_latest.to_verifier_id IS DISTINCT FROM v_decision.decided_by
              THEN
                RAISE EXCEPTION 'identity-consistency-decision-invalid' USING ERRCODE = '23514';
              END IF;
            END IF;
          END IF;

          IF v_submission.snapshot_id IS NOT NULL
             AND (
               EXISTS (
                 SELECT 1
                 FROM public.rel_party_identity_draft_file draft_file
                 WHERE draft_file.tenant_id = v_tenant_id
                   AND draft_file.park_id = v_park_id
                   AND draft_file.submission_id = v_submission.id
                   AND NOT EXISTS (
                     SELECT 1
                     FROM public.rel_party_identity_snapshot_file snapshot_file
                     WHERE snapshot_file.tenant_id = draft_file.tenant_id
                       AND snapshot_file.park_id = draft_file.park_id
                       AND snapshot_file.snapshot_id = v_submission.snapshot_id
                       AND snapshot_file.file_id = draft_file.file_id
                       AND snapshot_file.file_version = draft_file.file_version
                       AND snapshot_file.ordinal = draft_file.ordinal
                   )
               )
               OR EXISTS (
                 SELECT 1
                 FROM public.rel_party_identity_snapshot_file snapshot_file
                 WHERE snapshot_file.tenant_id = v_tenant_id
                   AND snapshot_file.park_id = v_park_id
                   AND snapshot_file.snapshot_id = v_submission.snapshot_id
                   AND NOT EXISTS (
                     SELECT 1
                     FROM public.rel_party_identity_draft_file draft_file
                     WHERE draft_file.tenant_id = snapshot_file.tenant_id
                       AND draft_file.park_id = snapshot_file.park_id
                       AND draft_file.submission_id = v_submission.id
                       AND draft_file.file_id = snapshot_file.file_id
                       AND draft_file.file_version = snapshot_file.file_version
                       AND draft_file.ordinal = snapshot_file.ordinal
                   )
               )
             )
          THEN
            RAISE EXCEPTION 'identity-consistency-evidence-invalid' USING ERRCODE = '23514';
          END IF;
        END LOOP;
        RETURN NEW;
      END;
      $body$
    $function$;
  END IF;
END;
$install$;

CREATE INDEX IF NOT EXISTS idx_biz_party_identity_submission_queue
  ON biz_party_identity_submission
    (tenant_id, park_id, verification_queue_id, status, update_time, id);
CREATE INDEX IF NOT EXISTS idx_biz_party_identity_assignment_history
  ON biz_party_identity_assignment_audit
    (tenant_id, park_id, submission_id, assignment_version_after);

DO $triggers$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.biz_party_identity_assignment_audit'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_biz_party_identity_assignment_audit_insert_guard'
      AND NOT trigger_row.tgisinternal
  ) THEN
    CREATE TRIGGER trg_biz_party_identity_assignment_audit_insert_guard
    BEFORE INSERT ON public.biz_party_identity_assignment_audit
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_guard_party_identity_assignment_audit_insert();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.biz_party_identity_decision'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_biz_party_identity_decision_insert_guard'
      AND NOT trigger_row.tgisinternal
  ) THEN
    CREATE TRIGGER trg_biz_party_identity_decision_insert_guard
    BEFORE INSERT ON public.biz_party_identity_decision
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_guard_party_identity_decision_insert();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.rel_party_identity_draft_file'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_rel_party_identity_draft_file_mutation_guard'
      AND NOT trigger_row.tgisinternal
  ) THEN
    CREATE TRIGGER trg_rel_party_identity_draft_file_mutation_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.rel_party_identity_draft_file
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_guard_party_identity_draft_file_mutation();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.biz_party_identity_snapshot'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_biz_party_identity_snapshot_immutable'
      AND NOT trigger_row.tgisinternal
  ) THEN
    CREATE TRIGGER trg_biz_party_identity_snapshot_immutable
    BEFORE DELETE ON public.biz_party_identity_snapshot
    FOR EACH ROW EXECUTE FUNCTION public.fn_property_identity_immutable();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.biz_party_identity_decision'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_biz_party_identity_decision_immutable'
      AND NOT trigger_row.tgisinternal
  ) THEN
    CREATE TRIGGER trg_biz_party_identity_decision_immutable
    BEFORE UPDATE OR DELETE ON public.biz_party_identity_decision
    FOR EACH ROW EXECUTE FUNCTION public.fn_property_identity_immutable();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.biz_party_identity_assignment_audit'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_biz_party_identity_assignment_audit_immutable'
      AND NOT trigger_row.tgisinternal
  ) THEN
    CREATE TRIGGER trg_biz_party_identity_assignment_audit_immutable
    BEFORE UPDATE OR DELETE ON public.biz_party_identity_assignment_audit
    FOR EACH ROW EXECUTE FUNCTION public.fn_property_identity_immutable();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.rel_party_identity_snapshot_file'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_rel_party_identity_snapshot_file_immutable'
      AND NOT trigger_row.tgisinternal
  ) THEN
    CREATE TRIGGER trg_rel_party_identity_snapshot_file_immutable
    BEFORE UPDATE OR DELETE ON public.rel_party_identity_snapshot_file
    FOR EACH ROW EXECUTE FUNCTION public.fn_property_identity_immutable();
  END IF;
END;
$triggers$;

DO $constraint_triggers$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.biz_party'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_biz_party_identity_party_consistency'
      AND NOT trigger_row.tgisinternal
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_biz_party_identity_party_consistency
    AFTER INSERT OR UPDATE ON public.biz_party
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_party_identity_consistency();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.biz_party_identity_submission'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_biz_party_identity_submission_consistency'
      AND NOT trigger_row.tgisinternal
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_biz_party_identity_submission_consistency
    AFTER INSERT OR UPDATE ON public.biz_party_identity_submission
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_party_identity_consistency();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.biz_party_identity_assignment_audit'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_biz_party_identity_assignment_consistency'
      AND NOT trigger_row.tgisinternal
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_biz_party_identity_assignment_consistency
    AFTER INSERT ON public.biz_party_identity_assignment_audit
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_party_identity_consistency();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.biz_party_identity_decision'::pg_catalog.regclass
      AND trigger_row.tgname = 'trg_biz_party_identity_decision_consistency'
      AND NOT trigger_row.tgisinternal
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_biz_party_identity_decision_consistency
    AFTER INSERT ON public.biz_party_identity_decision
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_party_identity_consistency();
  END IF;
END;
$constraint_triggers$;

REVOKE INSERT, UPDATE, DELETE
  ON public.biz_party_identity_submission,
     public.biz_party_identity_snapshot,
     public.rel_party_identity_snapshot_file,
     public.rel_party_identity_draft_file,
     public.biz_party_identity_assignment_audit,
     public.biz_party_identity_decision
  FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public.fn_party_identity_create_draft_cas(
    character varying, character varying, uuid, uuid, bigint, uuid,
    character varying, integer
  ),
  public.fn_party_identity_update_draft_cas(
    character varying, character varying, uuid, uuid, integer,
    character varying, text, character varying, character varying,
    character varying, integer, character varying, integer, uuid[]
  ),
  public.fn_party_identity_submit_cas(
    character varying, character varying, uuid, uuid, integer, uuid, jsonb,
    character varying
  ),
  public.fn_party_identity_withdraw_cas(
    character varying, character varying, uuid, uuid, character varying,
    character varying, integer
  ),
  public.fn_party_identity_assignment_cas(
    character varying, character varying, uuid, uuid, character varying, uuid,
    character varying, character varying, integer, integer
  ),
  public.fn_party_identity_decision_cas(
    character varying, character varying, uuid, uuid, character varying,
    character varying, integer, integer
  ),
  public.fn_guard_party_identity_assignment_audit_insert(),
  public.fn_guard_party_identity_decision_insert(),
  public.fn_guard_party_identity_draft_file_mutation(),
  public.fn_validate_party_identity_consistency()
  FROM PUBLIC;




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
