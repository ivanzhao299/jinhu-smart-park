BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- B0_CATALOG_OBJECTS_START
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.attempt_count
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.consumer_name
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.created_at
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.error_category
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.error_code
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.failure_side
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.first_failed_at
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.id
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.incident_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.last_failed_at
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.last_replay_at
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.notification_delivery_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.original_event_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.payload_hash
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.status
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_dlq.version
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.after_status
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.before_status
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.created_at
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.dlq_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.id
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.incident_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.operator_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.original_event_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.payload_hash
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.reason
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.result_hash
-- B0_CATALOG_OBJECT column	public.biz_property_event_replay_audit.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_sequence.next_sequence
-- B0_CATALOG_OBJECT column	public.biz_property_event_sequence.ordering_key
-- B0_CATALOG_OBJECT column	public.biz_property_event_sequence.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_sequence.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_event_sequence.version
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.consumer_name
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.consumer_version
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.event_id
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.event_type
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.event_version
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.handled_at
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.id
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.ordering_key
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.payload_hash
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.result_hash
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.result_reference
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.sequence
-- B0_CATALOG_OBJECT column	public.biz_property_inbox.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_notification.created_at
-- B0_CATALOG_OBJECT column	public.biz_property_notification.id
-- B0_CATALOG_OBJECT column	public.biz_property_notification.notification_type
-- B0_CATALOG_OBJECT column	public.biz_property_notification.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_notification.payload_hash
-- B0_CATALOG_OBJECT column	public.biz_property_notification.projection_version
-- B0_CATALOG_OBJECT column	public.biz_property_notification.retention_until
-- B0_CATALOG_OBJECT column	public.biz_property_notification.route_key
-- B0_CATALOG_OBJECT column	public.biz_property_notification.route_params
-- B0_CATALOG_OBJECT column	public.biz_property_notification.severity
-- B0_CATALOG_OBJECT column	public.biz_property_notification.source_event_id
-- B0_CATALOG_OBJECT column	public.biz_property_notification.summary
-- B0_CATALOG_OBJECT column	public.biz_property_notification.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_notification.title
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.attempt_count
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.channel
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.claim_epoch
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.claim_token
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.delivered_at
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.delivery_status
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.exhausted_at
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.failed_at
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.id
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.last_error_code
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.lease_expires_at
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.max_attempts
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.next_retry_at
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.recipient_id
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery.version
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery_audit.attempt
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery_audit.delivery_id
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery_audit.error_code
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery_audit.from_status
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery_audit.id
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery_audit.occurred_at
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery_audit.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery_audit.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_notification_delivery_audit.to_status
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.aggregate_id
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.aggregate_type
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.aggregate_version
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.approval_request_id
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.attempt_count
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.claim_epoch
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.claim_token
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.created_at
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.dlq_at
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.event_id
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.event_ordinal
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.event_type
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.event_version
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.execution_idempotency_key
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.lease_expires_at
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.next_retry_at
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.ordering_key
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.payload
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.payload_hash
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.published_at
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.sequence
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.status
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_outbox.worker_id
-- B0_CATALOG_OBJECT column	public.rel_property_notification_recipient.created_at
-- B0_CATALOG_OBJECT column	public.rel_property_notification_recipient.id
-- B0_CATALOG_OBJECT column	public.rel_property_notification_recipient.notification_id
-- B0_CATALOG_OBJECT column	public.rel_property_notification_recipient.park_id
-- B0_CATALOG_OBJECT column	public.rel_property_notification_recipient.read_at
-- B0_CATALOG_OBJECT column	public.rel_property_notification_recipient.read_status
-- B0_CATALOG_OBJECT column	public.rel_property_notification_recipient.read_version
-- B0_CATALOG_OBJECT column	public.rel_property_notification_recipient.recipient_bundle_snapshot
-- B0_CATALOG_OBJECT column	public.rel_property_notification_recipient.recipient_relation_version
-- B0_CATALOG_OBJECT column	public.rel_property_notification_recipient.recipient_user_id
-- B0_CATALOG_OBJECT column	public.rel_property_notification_recipient.tenant_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.biz_property_event_dlq_attempt_count_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.biz_property_event_dlq_payload_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.biz_property_event_dlq_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.biz_property_event_dlq_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.ck_biz_property_event_dlq_delivery_side
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.ck_biz_property_event_dlq_failure_side
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.ck_biz_property_event_dlq_publisher
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.ck_biz_property_event_dlq_status
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.fk_biz_property_event_dlq_delivery
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.fk_biz_property_event_dlq_event
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.uq_biz_property_event_dlq_event_consumer
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_dlq.uq_biz_property_event_dlq_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_replay_audit.biz_property_event_replay_audit_payload_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_replay_audit.biz_property_event_replay_audit_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_replay_audit.biz_property_event_replay_audit_result_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_replay_audit.ck_biz_property_event_replay_audit_reason
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_replay_audit.fk_biz_property_event_replay_audit_dlq
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_replay_audit.fk_biz_property_event_replay_audit_event
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_replay_audit.uq_biz_property_event_replay_audit_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_sequence.biz_property_event_sequence_next_sequence_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_sequence.biz_property_event_sequence_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_event_sequence.pk_biz_property_event_sequence
-- B0_CATALOG_OBJECT constraint	public.biz_property_inbox.biz_property_inbox_consumer_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_inbox.biz_property_inbox_event_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_inbox.biz_property_inbox_payload_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_inbox.biz_property_inbox_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_inbox.biz_property_inbox_result_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_inbox.biz_property_inbox_sequence_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_inbox.fk_biz_property_inbox_event
-- B0_CATALOG_OBJECT constraint	public.biz_property_inbox.uq_biz_property_inbox_consumer_event
-- B0_CATALOG_OBJECT constraint	public.biz_property_inbox.uq_biz_property_inbox_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification.biz_property_notification_payload_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification.biz_property_notification_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification.biz_property_notification_projection_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification.biz_property_notification_route_params_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification.ck_biz_property_notification_severity
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification.fk_biz_property_notification_event
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification.uq_biz_property_notification_projection
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification.uq_biz_property_notification_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.biz_property_notification_delivery_attempt_count_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.biz_property_notification_delivery_claim_epoch_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.biz_property_notification_delivery_max_attempts_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.biz_property_notification_delivery_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.biz_property_notification_delivery_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.ck_biz_property_notification_delivery_attempts
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.ck_biz_property_notification_delivery_channel
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.ck_biz_property_notification_delivery_claim
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.ck_biz_property_notification_delivery_delivered
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.ck_biz_property_notification_delivery_exhausted
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.ck_biz_property_notification_delivery_retry
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.ck_biz_property_notification_delivery_status
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.fk_biz_property_notification_delivery_recipient
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.uq_biz_property_notification_delivery_channel
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery.uq_biz_property_notification_delivery_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery_audit.biz_property_notification_delivery_audit_attempt_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery_audit.biz_property_notification_delivery_audit_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery_audit.fk_biz_property_notification_delivery_audit_delivery
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery_audit.uq_biz_property_notification_delivery_audit_attempt
-- B0_CATALOG_OBJECT constraint	public.biz_property_notification_delivery_audit.uq_biz_property_notification_delivery_audit_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.biz_property_outbox_aggregate_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.biz_property_outbox_attempt_count_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.biz_property_outbox_claim_epoch_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.biz_property_outbox_event_ordinal_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.biz_property_outbox_event_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.biz_property_outbox_payload_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.biz_property_outbox_payload_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.biz_property_outbox_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.biz_property_outbox_sequence_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.ck_biz_property_outbox_claim
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.ck_biz_property_outbox_dlq
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.ck_biz_property_outbox_published
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.ck_biz_property_outbox_retry
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.ck_biz_property_outbox_status
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.fk_biz_property_outbox_approval_request
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.uq_biz_property_outbox_approval_event
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.uq_biz_property_outbox_order
-- B0_CATALOG_OBJECT constraint	public.biz_property_outbox.uq_biz_property_outbox_scope_event
-- B0_CATALOG_OBJECT constraint	public.rel_property_notification_recipient.ck_rel_property_notification_recipient_read
-- B0_CATALOG_OBJECT constraint	public.rel_property_notification_recipient.ck_rel_property_notification_recipient_status
-- B0_CATALOG_OBJECT constraint	public.rel_property_notification_recipient.fk_rel_property_notification_recipient_notification
-- B0_CATALOG_OBJECT constraint	public.rel_property_notification_recipient.rel_property_notification_recipient_pkey
-- B0_CATALOG_OBJECT constraint	public.rel_property_notification_recipient.rel_property_notification_recipient_read_version_check
-- B0_CATALOG_OBJECT constraint	public.rel_property_notification_recipient.rel_property_notification_recip_recipient_bundle_snapshot_check
-- B0_CATALOG_OBJECT constraint	public.rel_property_notification_recipient.rel_property_notification_reci_recipient_relation_version_check
-- B0_CATALOG_OBJECT constraint	public.rel_property_notification_recipient.uq_rel_property_notification_recipient_scope_id
-- B0_CATALOG_OBJECT constraint	public.rel_property_notification_recipient.uq_rel_property_notification_recipient_user
-- B0_CATALOG_OBJECT function	public.fn_property_event_append_only()
-- B0_CATALOG_OBJECT index	public.biz_property_event_dlq_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_event_replay_audit_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_inbox_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_notification_delivery_audit_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_notification_delivery_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_notification_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_outbox_pkey
-- B0_CATALOG_OBJECT index	public.idx_property_dlq_active
-- B0_CATALOG_OBJECT index	public.idx_property_notification_delivery_claim
-- B0_CATALOG_OBJECT index	public.idx_property_notification_recipient_list
-- B0_CATALOG_OBJECT index	public.idx_property_outbox_claim
-- B0_CATALOG_OBJECT index	public.idx_property_outbox_order
-- B0_CATALOG_OBJECT index	public.pk_biz_property_event_sequence
-- B0_CATALOG_OBJECT index	public.rel_property_notification_recipient_pkey
-- B0_CATALOG_OBJECT index	public.uq_biz_property_event_dlq_active_delivery
-- B0_CATALOG_OBJECT index	public.uq_biz_property_event_dlq_event_consumer
-- B0_CATALOG_OBJECT index	public.uq_biz_property_event_dlq_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_event_replay_audit_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_inbox_consumer_event
-- B0_CATALOG_OBJECT index	public.uq_biz_property_inbox_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_notification_delivery_audit_attempt
-- B0_CATALOG_OBJECT index	public.uq_biz_property_notification_delivery_audit_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_notification_delivery_channel
-- B0_CATALOG_OBJECT index	public.uq_biz_property_notification_delivery_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_notification_projection
-- B0_CATALOG_OBJECT index	public.uq_biz_property_notification_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_outbox_approval_event
-- B0_CATALOG_OBJECT index	public.uq_biz_property_outbox_order
-- B0_CATALOG_OBJECT index	public.uq_biz_property_outbox_scope_event
-- B0_CATALOG_OBJECT index	public.uq_rel_property_notification_recipient_scope_id
-- B0_CATALOG_OBJECT index	public.uq_rel_property_notification_recipient_user
-- B0_CATALOG_OBJECT table	public.biz_property_event_dlq
-- B0_CATALOG_OBJECT table	public.biz_property_event_replay_audit
-- B0_CATALOG_OBJECT table	public.biz_property_event_sequence
-- B0_CATALOG_OBJECT table	public.biz_property_inbox
-- B0_CATALOG_OBJECT table	public.biz_property_notification
-- B0_CATALOG_OBJECT table	public.biz_property_notification_delivery
-- B0_CATALOG_OBJECT table	public.biz_property_notification_delivery_audit
-- B0_CATALOG_OBJECT table	public.biz_property_outbox
-- B0_CATALOG_OBJECT table	public.rel_property_notification_recipient
-- B0_CATALOG_OBJECT trigger	public.biz_property_event_replay_audit.trg_biz_property_event_replay_audit_immutable
-- B0_CATALOG_OBJECT trigger	public.biz_property_inbox.trg_biz_property_inbox_immutable
-- B0_CATALOG_OBJECT trigger	public.biz_property_notification_delivery_audit.trg_biz_property_notification_delivery_audit_immutable
-- B0_CATALOG_OBJECTS_END

-- B0_DEFINITION_SIGNATURE_GUARD_START
CREATE TEMP TABLE b0_catalog_target (
  kind text NOT NULL CHECK (kind IN
    ('table','column','constraint','index','function','trigger','definition-row')),
  name text NOT NULL,
  PRIMARY KEY (kind,name)
) ON COMMIT DROP;
INSERT INTO b0_catalog_target(kind,name) VALUES
  ('column','public.biz_property_event_dlq.attempt_count'),
  ('column','public.biz_property_event_dlq.consumer_name'),
  ('column','public.biz_property_event_dlq.created_at'),
  ('column','public.biz_property_event_dlq.error_category'),
  ('column','public.biz_property_event_dlq.error_code'),
  ('column','public.biz_property_event_dlq.failure_side'),
  ('column','public.biz_property_event_dlq.first_failed_at'),
  ('column','public.biz_property_event_dlq.id'),
  ('column','public.biz_property_event_dlq.incident_id'),
  ('column','public.biz_property_event_dlq.last_failed_at'),
  ('column','public.biz_property_event_dlq.last_replay_at'),
  ('column','public.biz_property_event_dlq.notification_delivery_id'),
  ('column','public.biz_property_event_dlq.original_event_id'),
  ('column','public.biz_property_event_dlq.park_id'),
  ('column','public.biz_property_event_dlq.payload_hash'),
  ('column','public.biz_property_event_dlq.status'),
  ('column','public.biz_property_event_dlq.tenant_id'),
  ('column','public.biz_property_event_dlq.version'),
  ('column','public.biz_property_event_replay_audit.after_status'),
  ('column','public.biz_property_event_replay_audit.before_status'),
  ('column','public.biz_property_event_replay_audit.created_at'),
  ('column','public.biz_property_event_replay_audit.dlq_id'),
  ('column','public.biz_property_event_replay_audit.id'),
  ('column','public.biz_property_event_replay_audit.incident_id'),
  ('column','public.biz_property_event_replay_audit.operator_id'),
  ('column','public.biz_property_event_replay_audit.original_event_id'),
  ('column','public.biz_property_event_replay_audit.park_id'),
  ('column','public.biz_property_event_replay_audit.payload_hash'),
  ('column','public.biz_property_event_replay_audit.reason'),
  ('column','public.biz_property_event_replay_audit.result_hash'),
  ('column','public.biz_property_event_replay_audit.tenant_id'),
  ('column','public.biz_property_event_sequence.next_sequence'),
  ('column','public.biz_property_event_sequence.ordering_key'),
  ('column','public.biz_property_event_sequence.park_id'),
  ('column','public.biz_property_event_sequence.tenant_id'),
  ('column','public.biz_property_event_sequence.version'),
  ('column','public.biz_property_inbox.consumer_name'),
  ('column','public.biz_property_inbox.consumer_version'),
  ('column','public.biz_property_inbox.event_id'),
  ('column','public.biz_property_inbox.event_type'),
  ('column','public.biz_property_inbox.event_version'),
  ('column','public.biz_property_inbox.handled_at'),
  ('column','public.biz_property_inbox.id'),
  ('column','public.biz_property_inbox.ordering_key'),
  ('column','public.biz_property_inbox.park_id'),
  ('column','public.biz_property_inbox.payload_hash'),
  ('column','public.biz_property_inbox.result_hash'),
  ('column','public.biz_property_inbox.result_reference'),
  ('column','public.biz_property_inbox.sequence'),
  ('column','public.biz_property_inbox.tenant_id'),
  ('column','public.biz_property_notification.created_at'),
  ('column','public.biz_property_notification.id'),
  ('column','public.biz_property_notification.notification_type'),
  ('column','public.biz_property_notification.park_id'),
  ('column','public.biz_property_notification.payload_hash'),
  ('column','public.biz_property_notification.projection_version'),
  ('column','public.biz_property_notification.retention_until'),
  ('column','public.biz_property_notification.route_key'),
  ('column','public.biz_property_notification.route_params'),
  ('column','public.biz_property_notification.severity'),
  ('column','public.biz_property_notification.source_event_id'),
  ('column','public.biz_property_notification.summary'),
  ('column','public.biz_property_notification.tenant_id'),
  ('column','public.biz_property_notification.title'),
  ('column','public.biz_property_notification_delivery.attempt_count'),
  ('column','public.biz_property_notification_delivery.channel'),
  ('column','public.biz_property_notification_delivery.claim_epoch'),
  ('column','public.biz_property_notification_delivery.claim_token'),
  ('column','public.biz_property_notification_delivery.delivered_at'),
  ('column','public.biz_property_notification_delivery.delivery_status'),
  ('column','public.biz_property_notification_delivery.exhausted_at'),
  ('column','public.biz_property_notification_delivery.failed_at'),
  ('column','public.biz_property_notification_delivery.id'),
  ('column','public.biz_property_notification_delivery.last_error_code'),
  ('column','public.biz_property_notification_delivery.lease_expires_at'),
  ('column','public.biz_property_notification_delivery.max_attempts'),
  ('column','public.biz_property_notification_delivery.next_retry_at'),
  ('column','public.biz_property_notification_delivery.park_id'),
  ('column','public.biz_property_notification_delivery.recipient_id'),
  ('column','public.biz_property_notification_delivery.tenant_id'),
  ('column','public.biz_property_notification_delivery.version'),
  ('column','public.biz_property_notification_delivery_audit.attempt'),
  ('column','public.biz_property_notification_delivery_audit.delivery_id'),
  ('column','public.biz_property_notification_delivery_audit.error_code'),
  ('column','public.biz_property_notification_delivery_audit.from_status'),
  ('column','public.biz_property_notification_delivery_audit.id'),
  ('column','public.biz_property_notification_delivery_audit.occurred_at'),
  ('column','public.biz_property_notification_delivery_audit.park_id'),
  ('column','public.biz_property_notification_delivery_audit.tenant_id'),
  ('column','public.biz_property_notification_delivery_audit.to_status'),
  ('column','public.biz_property_outbox.aggregate_id'),
  ('column','public.biz_property_outbox.aggregate_type'),
  ('column','public.biz_property_outbox.aggregate_version'),
  ('column','public.biz_property_outbox.approval_request_id'),
  ('column','public.biz_property_outbox.attempt_count'),
  ('column','public.biz_property_outbox.claim_epoch'),
  ('column','public.biz_property_outbox.claim_token'),
  ('column','public.biz_property_outbox.created_at'),
  ('column','public.biz_property_outbox.dlq_at'),
  ('column','public.biz_property_outbox.event_id'),
  ('column','public.biz_property_outbox.event_ordinal'),
  ('column','public.biz_property_outbox.event_type'),
  ('column','public.biz_property_outbox.event_version'),
  ('column','public.biz_property_outbox.execution_idempotency_key'),
  ('column','public.biz_property_outbox.lease_expires_at'),
  ('column','public.biz_property_outbox.next_retry_at'),
  ('column','public.biz_property_outbox.ordering_key'),
  ('column','public.biz_property_outbox.park_id'),
  ('column','public.biz_property_outbox.payload'),
  ('column','public.biz_property_outbox.payload_hash'),
  ('column','public.biz_property_outbox.published_at'),
  ('column','public.biz_property_outbox.sequence'),
  ('column','public.biz_property_outbox.status'),
  ('column','public.biz_property_outbox.tenant_id'),
  ('column','public.biz_property_outbox.worker_id'),
  ('column','public.rel_property_notification_recipient.created_at'),
  ('column','public.rel_property_notification_recipient.id'),
  ('column','public.rel_property_notification_recipient.notification_id'),
  ('column','public.rel_property_notification_recipient.park_id'),
  ('column','public.rel_property_notification_recipient.read_at'),
  ('column','public.rel_property_notification_recipient.read_status'),
  ('column','public.rel_property_notification_recipient.read_version'),
  ('column','public.rel_property_notification_recipient.recipient_bundle_snapshot'),
  ('column','public.rel_property_notification_recipient.recipient_relation_version'),
  ('column','public.rel_property_notification_recipient.recipient_user_id'),
  ('column','public.rel_property_notification_recipient.tenant_id'),
  ('constraint','public.biz_property_event_dlq.biz_property_event_dlq_attempt_count_check'),
  ('constraint','public.biz_property_event_dlq.biz_property_event_dlq_payload_hash_check'),
  ('constraint','public.biz_property_event_dlq.biz_property_event_dlq_pkey'),
  ('constraint','public.biz_property_event_dlq.biz_property_event_dlq_version_check'),
  ('constraint','public.biz_property_event_dlq.ck_biz_property_event_dlq_delivery_side'),
  ('constraint','public.biz_property_event_dlq.ck_biz_property_event_dlq_failure_side'),
  ('constraint','public.biz_property_event_dlq.ck_biz_property_event_dlq_publisher'),
  ('constraint','public.biz_property_event_dlq.ck_biz_property_event_dlq_status'),
  ('constraint','public.biz_property_event_dlq.fk_biz_property_event_dlq_delivery'),
  ('constraint','public.biz_property_event_dlq.fk_biz_property_event_dlq_event'),
  ('constraint','public.biz_property_event_dlq.uq_biz_property_event_dlq_event_consumer'),
  ('constraint','public.biz_property_event_dlq.uq_biz_property_event_dlq_scope_id'),
  ('constraint','public.biz_property_event_replay_audit.biz_property_event_replay_audit_payload_hash_check'),
  ('constraint','public.biz_property_event_replay_audit.biz_property_event_replay_audit_pkey'),
  ('constraint','public.biz_property_event_replay_audit.biz_property_event_replay_audit_result_hash_check'),
  ('constraint','public.biz_property_event_replay_audit.ck_biz_property_event_replay_audit_reason'),
  ('constraint','public.biz_property_event_replay_audit.fk_biz_property_event_replay_audit_dlq'),
  ('constraint','public.biz_property_event_replay_audit.fk_biz_property_event_replay_audit_event'),
  ('constraint','public.biz_property_event_replay_audit.uq_biz_property_event_replay_audit_scope_id'),
  ('constraint','public.biz_property_event_sequence.biz_property_event_sequence_next_sequence_check'),
  ('constraint','public.biz_property_event_sequence.biz_property_event_sequence_version_check'),
  ('constraint','public.biz_property_event_sequence.pk_biz_property_event_sequence'),
  ('constraint','public.biz_property_inbox.biz_property_inbox_consumer_version_check'),
  ('constraint','public.biz_property_inbox.biz_property_inbox_event_version_check'),
  ('constraint','public.biz_property_inbox.biz_property_inbox_payload_hash_check'),
  ('constraint','public.biz_property_inbox.biz_property_inbox_pkey'),
  ('constraint','public.biz_property_inbox.biz_property_inbox_result_hash_check'),
  ('constraint','public.biz_property_inbox.biz_property_inbox_sequence_check'),
  ('constraint','public.biz_property_inbox.fk_biz_property_inbox_event'),
  ('constraint','public.biz_property_inbox.uq_biz_property_inbox_consumer_event'),
  ('constraint','public.biz_property_inbox.uq_biz_property_inbox_scope_id'),
  ('constraint','public.biz_property_notification.biz_property_notification_payload_hash_check'),
  ('constraint','public.biz_property_notification.biz_property_notification_pkey'),
  ('constraint','public.biz_property_notification.biz_property_notification_projection_version_check'),
  ('constraint','public.biz_property_notification.biz_property_notification_route_params_check'),
  ('constraint','public.biz_property_notification.ck_biz_property_notification_severity'),
  ('constraint','public.biz_property_notification.fk_biz_property_notification_event'),
  ('constraint','public.biz_property_notification.uq_biz_property_notification_projection'),
  ('constraint','public.biz_property_notification.uq_biz_property_notification_scope_id'),
  ('constraint','public.biz_property_notification_delivery.biz_property_notification_delivery_attempt_count_check'),
  ('constraint','public.biz_property_notification_delivery.biz_property_notification_delivery_claim_epoch_check'),
  ('constraint','public.biz_property_notification_delivery.biz_property_notification_delivery_max_attempts_check'),
  ('constraint','public.biz_property_notification_delivery.biz_property_notification_delivery_pkey'),
  ('constraint','public.biz_property_notification_delivery.biz_property_notification_delivery_version_check'),
  ('constraint','public.biz_property_notification_delivery.ck_biz_property_notification_delivery_attempts'),
  ('constraint','public.biz_property_notification_delivery.ck_biz_property_notification_delivery_channel'),
  ('constraint','public.biz_property_notification_delivery.ck_biz_property_notification_delivery_claim'),
  ('constraint','public.biz_property_notification_delivery.ck_biz_property_notification_delivery_delivered'),
  ('constraint','public.biz_property_notification_delivery.ck_biz_property_notification_delivery_exhausted'),
  ('constraint','public.biz_property_notification_delivery.ck_biz_property_notification_delivery_retry'),
  ('constraint','public.biz_property_notification_delivery.ck_biz_property_notification_delivery_status'),
  ('constraint','public.biz_property_notification_delivery.fk_biz_property_notification_delivery_recipient'),
  ('constraint','public.biz_property_notification_delivery.uq_biz_property_notification_delivery_channel'),
  ('constraint','public.biz_property_notification_delivery.uq_biz_property_notification_delivery_scope_id'),
  ('constraint','public.biz_property_notification_delivery_audit.biz_property_notification_delivery_audit_attempt_check'),
  ('constraint','public.biz_property_notification_delivery_audit.biz_property_notification_delivery_audit_pkey'),
  ('constraint','public.biz_property_notification_delivery_audit.fk_biz_property_notification_delivery_audit_delivery'),
  ('constraint','public.biz_property_notification_delivery_audit.uq_biz_property_notification_delivery_audit_attempt'),
  ('constraint','public.biz_property_notification_delivery_audit.uq_biz_property_notification_delivery_audit_scope_id'),
  ('constraint','public.biz_property_outbox.biz_property_outbox_aggregate_version_check'),
  ('constraint','public.biz_property_outbox.biz_property_outbox_attempt_count_check'),
  ('constraint','public.biz_property_outbox.biz_property_outbox_claim_epoch_check'),
  ('constraint','public.biz_property_outbox.biz_property_outbox_event_ordinal_check'),
  ('constraint','public.biz_property_outbox.biz_property_outbox_event_version_check'),
  ('constraint','public.biz_property_outbox.biz_property_outbox_payload_check'),
  ('constraint','public.biz_property_outbox.biz_property_outbox_payload_hash_check'),
  ('constraint','public.biz_property_outbox.biz_property_outbox_pkey'),
  ('constraint','public.biz_property_outbox.biz_property_outbox_sequence_check'),
  ('constraint','public.biz_property_outbox.ck_biz_property_outbox_claim'),
  ('constraint','public.biz_property_outbox.ck_biz_property_outbox_dlq'),
  ('constraint','public.biz_property_outbox.ck_biz_property_outbox_published'),
  ('constraint','public.biz_property_outbox.ck_biz_property_outbox_retry'),
  ('constraint','public.biz_property_outbox.ck_biz_property_outbox_status'),
  ('constraint','public.biz_property_outbox.fk_biz_property_outbox_approval_request'),
  ('constraint','public.biz_property_outbox.uq_biz_property_outbox_approval_event'),
  ('constraint','public.biz_property_outbox.uq_biz_property_outbox_order'),
  ('constraint','public.biz_property_outbox.uq_biz_property_outbox_scope_event'),
  ('constraint','public.rel_property_notification_recipient.ck_rel_property_notification_recipient_read'),
  ('constraint','public.rel_property_notification_recipient.ck_rel_property_notification_recipient_status'),
  ('constraint','public.rel_property_notification_recipient.fk_rel_property_notification_recipient_notification'),
  ('constraint','public.rel_property_notification_recipient.rel_property_notification_recipient_pkey'),
  ('constraint','public.rel_property_notification_recipient.rel_property_notification_recipient_read_version_check'),
  ('constraint','public.rel_property_notification_recipient.rel_property_notification_recip_recipient_bundle_snapshot_check'),
  ('constraint','public.rel_property_notification_recipient.rel_property_notification_reci_recipient_relation_version_check'),
  ('constraint','public.rel_property_notification_recipient.uq_rel_property_notification_recipient_scope_id'),
  ('constraint','public.rel_property_notification_recipient.uq_rel_property_notification_recipient_user'),
  ('function','public.fn_property_event_append_only()'),
  ('index','public.biz_property_event_dlq_pkey'),
  ('index','public.biz_property_event_replay_audit_pkey'),
  ('index','public.biz_property_inbox_pkey'),
  ('index','public.biz_property_notification_delivery_audit_pkey'),
  ('index','public.biz_property_notification_delivery_pkey'),
  ('index','public.biz_property_notification_pkey'),
  ('index','public.biz_property_outbox_pkey'),
  ('index','public.idx_property_dlq_active'),
  ('index','public.idx_property_notification_delivery_claim'),
  ('index','public.idx_property_notification_recipient_list'),
  ('index','public.idx_property_outbox_claim'),
  ('index','public.idx_property_outbox_order'),
  ('index','public.pk_biz_property_event_sequence'),
  ('index','public.rel_property_notification_recipient_pkey'),
  ('index','public.uq_biz_property_event_dlq_active_delivery'),
  ('index','public.uq_biz_property_event_dlq_event_consumer'),
  ('index','public.uq_biz_property_event_dlq_scope_id'),
  ('index','public.uq_biz_property_event_replay_audit_scope_id'),
  ('index','public.uq_biz_property_inbox_consumer_event'),
  ('index','public.uq_biz_property_inbox_scope_id'),
  ('index','public.uq_biz_property_notification_delivery_audit_attempt'),
  ('index','public.uq_biz_property_notification_delivery_audit_scope_id'),
  ('index','public.uq_biz_property_notification_delivery_channel'),
  ('index','public.uq_biz_property_notification_delivery_scope_id'),
  ('index','public.uq_biz_property_notification_projection'),
  ('index','public.uq_biz_property_notification_scope_id'),
  ('index','public.uq_biz_property_outbox_approval_event'),
  ('index','public.uq_biz_property_outbox_order'),
  ('index','public.uq_biz_property_outbox_scope_event'),
  ('index','public.uq_rel_property_notification_recipient_scope_id'),
  ('index','public.uq_rel_property_notification_recipient_user'),
  ('table','public.biz_property_event_dlq'),
  ('table','public.biz_property_event_replay_audit'),
  ('table','public.biz_property_event_sequence'),
  ('table','public.biz_property_inbox'),
  ('table','public.biz_property_notification'),
  ('table','public.biz_property_notification_delivery'),
  ('table','public.biz_property_notification_delivery_audit'),
  ('table','public.biz_property_outbox'),
  ('table','public.rel_property_notification_recipient'),
  ('trigger','public.biz_property_event_replay_audit.trg_biz_property_event_replay_audit_immutable'),
  ('trigger','public.biz_property_inbox.trg_biz_property_inbox_immutable'),
  ('trigger','public.biz_property_notification_delivery_audit.trg_biz_property_notification_delivery_audit_immutable');
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

CREATE TABLE IF NOT EXISTS biz_property_outbox (
  event_id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  event_type varchar(128) NOT NULL,
  event_version integer NOT NULL CHECK (event_version > 0),
  aggregate_type varchar(64) NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  ordering_key varchar(256) NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  event_ordinal integer NOT NULL CHECK (event_ordinal >= 0),
  approval_request_id uuid,
  execution_idempotency_key varchar(128),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status varchar(16) NOT NULL DEFAULT 'pending',
  claim_epoch bigint NOT NULL DEFAULT 0 CHECK (claim_epoch >= 0),
  claim_token uuid,
  worker_id varchar(128),
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_retry_at timestamptz,
  published_at timestamptz,
  dlq_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_biz_property_outbox_approval_request
    FOREIGN KEY (tenant_id, park_id, approval_request_id)
    REFERENCES biz_property_approval_request(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_outbox_scope_event UNIQUE (tenant_id, park_id, event_id),
  CONSTRAINT uq_biz_property_outbox_order UNIQUE
    (tenant_id, park_id, ordering_key, sequence, event_ordinal),
  CONSTRAINT uq_biz_property_outbox_approval_event UNIQUE
    (tenant_id, park_id, approval_request_id, event_type, event_ordinal),
  CONSTRAINT ck_biz_property_outbox_status
    CHECK (status IN ('pending', 'publishing', 'retry_wait', 'published', 'dlq')),
  CONSTRAINT ck_biz_property_outbox_claim
    CHECK (
      (status = 'publishing' AND claim_token IS NOT NULL
       AND worker_id IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR
      (status <> 'publishing' AND claim_token IS NULL
       AND worker_id IS NULL AND lease_expires_at IS NULL)
    ),
  CONSTRAINT ck_biz_property_outbox_retry
    CHECK ((status = 'retry_wait') = (next_retry_at IS NOT NULL)),
  CONSTRAINT ck_biz_property_outbox_published
    CHECK ((status = 'published') = (published_at IS NOT NULL)),
  CONSTRAINT ck_biz_property_outbox_dlq
    CHECK ((status = 'dlq') = (dlq_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS biz_property_event_sequence (
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  ordering_key varchar(256) NOT NULL,
  next_sequence bigint NOT NULL DEFAULT 1 CHECK (next_sequence > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT pk_biz_property_event_sequence
    PRIMARY KEY (tenant_id, park_id, ordering_key)
);

CREATE TABLE IF NOT EXISTS biz_property_inbox (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  consumer_name varchar(128) NOT NULL,
  consumer_version integer NOT NULL CHECK (consumer_version > 0),
  event_id uuid NOT NULL,
  event_type varchar(128) NOT NULL,
  event_version integer NOT NULL CHECK (event_version > 0),
  ordering_key varchar(256) NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  result_hash char(64) NOT NULL CHECK (result_hash ~ '^[0-9a-f]{64}$'),
  result_reference varchar(512),
  handled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_biz_property_inbox_event
    FOREIGN KEY (tenant_id, park_id, event_id)
    REFERENCES biz_property_outbox(tenant_id, park_id, event_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_inbox_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_inbox_consumer_event
    UNIQUE (tenant_id, park_id, consumer_name, event_id)
);

CREATE TABLE IF NOT EXISTS biz_property_notification (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  source_event_id uuid NOT NULL,
  notification_type varchar(128) NOT NULL,
  projection_version integer NOT NULL CHECK (projection_version > 0),
  title varchar(200) NOT NULL,
  summary varchar(1000) NOT NULL,
  severity varchar(16) NOT NULL DEFAULT 'info',
  route_key varchar(128) NOT NULL,
  route_params jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(route_params) = 'object'),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_until timestamptz NOT NULL,
  CONSTRAINT fk_biz_property_notification_event
    FOREIGN KEY (tenant_id, park_id, source_event_id)
    REFERENCES biz_property_outbox(tenant_id, park_id, event_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_notification_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_notification_projection
    UNIQUE (tenant_id, park_id, source_event_id, notification_type, projection_version),
  CONSTRAINT ck_biz_property_notification_severity
    CHECK (severity IN ('info', 'warning', 'critical'))
);

CREATE TABLE IF NOT EXISTS rel_property_notification_recipient (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  notification_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  recipient_relation_version integer NOT NULL CHECK (recipient_relation_version > 0),
  recipient_bundle_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(recipient_bundle_snapshot) = 'object'),
  read_status varchar(8) NOT NULL DEFAULT 'unread',
  read_version integer NOT NULL DEFAULT 1 CHECK (read_version > 0),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_rel_property_notification_recipient_notification
    FOREIGN KEY (tenant_id, park_id, notification_id)
    REFERENCES biz_property_notification(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_rel_property_notification_recipient_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_rel_property_notification_recipient_user
    UNIQUE (tenant_id, park_id, notification_id, recipient_user_id),
  CONSTRAINT ck_rel_property_notification_recipient_status
    CHECK (read_status IN ('unread', 'read')),
  CONSTRAINT ck_rel_property_notification_recipient_read
    CHECK ((read_status = 'read') = (read_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS biz_property_notification_delivery (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  recipient_id uuid NOT NULL,
  channel varchar(32) NOT NULL,
  delivery_status varchar(24) NOT NULL DEFAULT 'pending',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  claim_epoch bigint NOT NULL DEFAULT 0 CHECK (claim_epoch >= 0),
  claim_token uuid,
  lease_expires_at timestamptz,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  exhausted_at timestamptz,
  last_error_code varchar(128),
  CONSTRAINT fk_biz_property_notification_delivery_recipient
    FOREIGN KEY (tenant_id, park_id, recipient_id)
    REFERENCES rel_property_notification_recipient(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_notification_delivery_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_notification_delivery_channel
    UNIQUE (tenant_id, park_id, recipient_id, channel),
  CONSTRAINT ck_biz_property_notification_delivery_channel
    CHECK (channel IN ('in_app', 'email', 'sms', 'webhook')),
  CONSTRAINT ck_biz_property_notification_delivery_status
    CHECK (delivery_status IN (
      'pending', 'delivering', 'delivered', 'delivery_failed', 'delivery_exhausted'
    )),
  CONSTRAINT ck_biz_property_notification_delivery_claim
    CHECK (
      (delivery_status = 'delivering' AND claim_token IS NOT NULL
       AND lease_expires_at IS NOT NULL)
      OR
      (delivery_status <> 'delivering' AND claim_token IS NULL
       AND lease_expires_at IS NULL)
    ),
  CONSTRAINT ck_biz_property_notification_delivery_retry
    CHECK ((delivery_status = 'delivery_failed') = (next_retry_at IS NOT NULL)),
  CONSTRAINT ck_biz_property_notification_delivery_delivered
    CHECK ((delivery_status = 'delivered') = (delivered_at IS NOT NULL)),
  CONSTRAINT ck_biz_property_notification_delivery_exhausted
    CHECK ((delivery_status = 'delivery_exhausted') = (exhausted_at IS NOT NULL)),
  CONSTRAINT ck_biz_property_notification_delivery_attempts
    CHECK (
      attempt_count <= max_attempts
      AND (delivery_status <> 'delivery_exhausted' OR attempt_count = max_attempts)
      AND (delivery_status <> 'delivery_failed' OR attempt_count < max_attempts)
    )
);

CREATE TABLE IF NOT EXISTS biz_property_notification_delivery_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  delivery_id uuid NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  from_status varchar(24) NOT NULL,
  to_status varchar(24) NOT NULL,
  error_code varchar(128),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_biz_property_notification_delivery_audit_delivery
    FOREIGN KEY (tenant_id, park_id, delivery_id)
    REFERENCES biz_property_notification_delivery(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_notification_delivery_audit_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_notification_delivery_audit_attempt
    UNIQUE (tenant_id, park_id, delivery_id, attempt)
);

CREATE TABLE IF NOT EXISTS biz_property_event_dlq (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  original_event_id uuid NOT NULL,
  consumer_name varchar(128) NOT NULL,
  notification_delivery_id uuid,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  failure_side varchar(16) NOT NULL,
  error_category varchar(32) NOT NULL,
  error_code varchar(128) NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  first_failed_at timestamptz NOT NULL,
  last_failed_at timestamptz NOT NULL,
  incident_id varchar(128),
  last_replay_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status varchar(16) NOT NULL DEFAULT 'active',
  CONSTRAINT fk_biz_property_event_dlq_event
    FOREIGN KEY (tenant_id, park_id, original_event_id)
    REFERENCES biz_property_outbox(tenant_id, park_id, event_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_property_event_dlq_delivery
    FOREIGN KEY (tenant_id, park_id, notification_delivery_id)
    REFERENCES biz_property_notification_delivery(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_event_dlq_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_event_dlq_event_consumer
    UNIQUE (tenant_id, park_id, original_event_id, consumer_name, failure_side),
  CONSTRAINT ck_biz_property_event_dlq_failure_side
    CHECK (failure_side IN ('publisher', 'consumer')),
  CONSTRAINT ck_biz_property_event_dlq_publisher
    CHECK ((failure_side = 'publisher') = (consumer_name = '__publisher__')),
  CONSTRAINT ck_biz_property_event_dlq_delivery_side
    CHECK (notification_delivery_id IS NULL OR failure_side = 'consumer'),
  CONSTRAINT ck_biz_property_event_dlq_status
    CHECK (status IN ('active', 'replaying', 'resolved', 'quarantined'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_property_event_dlq_active_delivery
  ON biz_property_event_dlq (tenant_id, park_id, notification_delivery_id)
  WHERE notification_delivery_id IS NOT NULL AND status IN ('active', 'replaying');

CREATE TABLE IF NOT EXISTS biz_property_event_replay_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  dlq_id uuid NOT NULL,
  original_event_id uuid NOT NULL,
  operator_id uuid NOT NULL,
  incident_id varchar(128) NOT NULL,
  reason varchar(1000) NOT NULL,
  before_status varchar(16) NOT NULL,
  after_status varchar(16) NOT NULL,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  result_hash char(64) CHECK (result_hash IS NULL OR result_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_biz_property_event_replay_audit_dlq
    FOREIGN KEY (tenant_id, park_id, dlq_id)
    REFERENCES biz_property_event_dlq(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_property_event_replay_audit_event
    FOREIGN KEY (tenant_id, park_id, original_event_id)
    REFERENCES biz_property_outbox(tenant_id, park_id, event_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_event_replay_audit_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT ck_biz_property_event_replay_audit_reason CHECK (length(trim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_property_outbox_claim
  ON biz_property_outbox (tenant_id, park_id, status, next_retry_at, created_at, event_id)
  WHERE status IN ('pending', 'retry_wait');
CREATE INDEX IF NOT EXISTS idx_property_outbox_order
  ON biz_property_outbox (ordering_key, sequence, event_ordinal)
  WHERE status <> 'published';
CREATE INDEX IF NOT EXISTS idx_property_dlq_active
  ON biz_property_event_dlq (tenant_id, park_id, last_failed_at, id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_property_notification_recipient_list
  ON rel_property_notification_recipient
    (tenant_id, park_id, recipient_user_id, read_status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_property_notification_delivery_claim
  ON biz_property_notification_delivery
    (tenant_id, park_id, delivery_status, next_retry_at, id)
  WHERE delivery_status IN ('pending', 'delivery_failed');

CREATE OR REPLACE FUNCTION fn_property_event_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'property-event-record-immutable' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE TRIGGER trg_biz_property_inbox_immutable
BEFORE UPDATE OR DELETE ON biz_property_inbox
FOR EACH ROW EXECUTE FUNCTION fn_property_event_append_only();
CREATE OR REPLACE TRIGGER trg_biz_property_notification_delivery_audit_immutable
BEFORE UPDATE OR DELETE ON biz_property_notification_delivery_audit
FOR EACH ROW EXECUTE FUNCTION fn_property_event_append_only();
CREATE OR REPLACE TRIGGER trg_biz_property_event_replay_audit_immutable
BEFORE UPDATE OR DELETE ON biz_property_event_replay_audit
FOR EACH ROW EXECUTE FUNCTION fn_property_event_append_only();

REVOKE UPDATE, DELETE ON biz_property_inbox FROM PUBLIC;
REVOKE UPDATE, DELETE ON biz_property_notification_delivery_audit FROM PUBLIC;
REVOKE UPDATE, DELETE ON biz_property_event_replay_audit FROM PUBLIC;




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
