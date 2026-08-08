import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import type {
  ApprovalDecisionStatus,
  ApprovalExecutionStatus,
  TrackBApprovalActionId
} from "@jinhu/shared";

@Entity("biz_property_approval_request")
export class PropertyApprovalRequestEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "tenant_id", type: "varchar", length: 64 }) tenantId!: string;
  @Column({ name: "park_id", type: "varchar", length: 64 }) parkId!: string;
  @Column({ name: "action_id", type: "varchar", length: 128 }) actionId!: TrackBApprovalActionId;
  @Column({ name: "source_type", type: "varchar", length: 64 }) sourceType!: string;
  @Column({ name: "source_id", type: "uuid" }) sourceId!: string;
  @Column({ name: "source_expected_version", type: "integer" }) sourceExpectedVersion!: number;
  @Column({ name: "requester_id", type: "uuid" }) requesterId!: string;
  @Column({ name: "submitter_id", type: "uuid" }) submitterId!: string;
  @Column({ name: "client_idempotency_key", type: "varchar", length: 128 }) clientIdempotencyKey!: string;
  @Column({ name: "business_intent_key", type: "varchar", length: 128 }) businessIntentKey!: string;
  @Column({ name: "canonical_payload", type: "jsonb" }) canonicalPayload!: Record<string, unknown>;
  @Column({ name: "payload_schema_version", type: "integer" }) payloadSchemaVersion!: number;
  @Column({ name: "payload_hash", type: "char", length: 64 }) payloadHash!: string;
  @Column({ type: "numeric", precision: 18, scale: 2, nullable: true }) amount!: string | null;
  @Column({ type: "varchar", length: 8, nullable: true }) currency!: string | null;
  @Column({ name: "policy_id", type: "uuid" }) policyId!: string;
  @Column({ name: "policy_version", type: "integer" }) policyVersion!: number;
  @Column({ name: "policy_hash", type: "char", length: 64 }) policyHash!: string;
  @Column({ name: "decision_status", type: "varchar", length: 32 }) decisionStatus!: ApprovalDecisionStatus;
  @Column({ name: "execution_status", type: "varchar", length: 32 }) executionStatus!: ApprovalExecutionStatus;
  @Column({ name: "decision_version", type: "integer" }) decisionVersion!: number;
  @Column({ name: "execution_version", type: "integer" }) executionVersion!: number;
  @Column({ name: "execution_idempotency_key", type: "varchar", length: 128 }) executionIdempotencyKey!: string;
  @Column({ name: "claim_epoch", type: "bigint" }) claimEpoch!: string;
  @Column({ name: "claim_token", type: "uuid", nullable: true }) claimToken!: string | null;
  @Column({ name: "worker_id", type: "varchar", length: 128, nullable: true }) workerId!: string | null;
  @Column({ name: "lease_expires_at", type: "timestamptz", nullable: true }) leaseExpiresAt!: Date | null;
  @Column({ name: "heartbeat_at", type: "timestamptz", nullable: true }) heartbeatAt!: Date | null;
  @Column({ name: "attempt_count", type: "integer" }) attemptCount!: number;
  @Column({ name: "next_retry_at", type: "timestamptz", nullable: true }) nextRetryAt!: Date | null;
  @Column({ name: "reconcile_required", type: "boolean" }) reconcileRequired!: boolean;
  @Column({ name: "last_error_category", type: "varchar", length: 32, nullable: true }) lastErrorCategory!: string | null;
  @Column({ name: "last_error_code", type: "varchar", length: 128, nullable: true }) lastErrorCode!: string | null;
  @Column({ name: "last_error_redacted_message", type: "varchar", length: 500, nullable: true }) lastErrorRedactedMessage!: string | null;
  @Column({ name: "infra_exhausted_at", type: "timestamptz", nullable: true }) infraExhaustedAt!: Date | null;
  @Column({ name: "submitted_at", type: "timestamptz", nullable: true }) submittedAt!: Date | null;
  @Column({ name: "decided_at", type: "timestamptz", nullable: true }) decidedAt!: Date | null;
  @Column({ name: "executed_at", type: "timestamptz", nullable: true }) executedAt!: Date | null;
  @Column({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @Column({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}

@Entity("biz_property_approval_stage")
export class PropertyApprovalStageEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "tenant_id", type: "varchar", length: 64 }) tenantId!: string;
  @Column({ name: "park_id", type: "varchar", length: 64 }) parkId!: string;
  @Column({ name: "request_id", type: "uuid" }) requestId!: string;
  @Column({ name: "stage_code", type: "varchar", length: 64 }) stageCode!: string;
  @Column({ name: "stage_ordinal", type: "smallint" }) stageOrdinal!: number;
  @Column({ name: "eligibility_policy_snapshot", type: "jsonb" }) eligibilityPolicySnapshot!: Record<string, unknown>;
  @Column({ name: "eligibility_policy_version", type: "integer" }) eligibilityPolicyVersion!: number;
  @Column({ name: "eligibility_policy_hash", type: "char", length: 64 }) eligibilityPolicyHash!: string;
  @Column({ name: "required_count", type: "smallint" }) requiredCount!: number;
  @Column({ name: "approved_count", type: "smallint" }) approvedCount!: number;
  @Column({ name: "rejected_count", type: "smallint" }) rejectedCount!: number;
  @Column({ name: "stage_status", type: "varchar", length: 24 }) stageStatus!: "pending" | "approved" | "rejected" | "expired";
  @Column({ type: "integer" }) version!: number;
  @Column({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}

@Entity("biz_property_approval_decision")
export class PropertyApprovalDecisionEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "tenant_id", type: "varchar", length: 64 }) tenantId!: string;
  @Column({ name: "park_id", type: "varchar", length: 64 }) parkId!: string;
  @Column({ name: "request_id", type: "uuid" }) requestId!: string;
  @Column({ name: "stage_id", type: "uuid" }) stageId!: string;
  @Column({ name: "actor_id", type: "uuid" }) actorId!: string;
  @Column({ type: "varchar", length: 16 }) decision!: "approve" | "reject";
  @Column({ type: "varchar", length: 1000, nullable: true }) reason!: string | null;
  @Column({ name: "actor_permission_snapshot", type: "jsonb" }) actorPermissionSnapshot!: Record<string, unknown>;
  @Column({ name: "decision_payload_hash", type: "char", length: 64 }) decisionPayloadHash!: string;
  @Column({ name: "decided_at", type: "timestamptz" }) decidedAt!: Date;
  @Column({ name: "supersedes_decision_id", type: "uuid", nullable: true }) supersedesDecisionId!: string | null;
}

@Entity("biz_property_approval_actor_exclusion")
export class PropertyApprovalActorExclusionEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "tenant_id", type: "varchar", length: 64 }) tenantId!: string;
  @Column({ name: "park_id", type: "varchar", length: 64 }) parkId!: string;
  @Column({ name: "request_id", type: "uuid" }) requestId!: string;
  @Column({ name: "actor_id", type: "uuid" }) actorId!: string;
  @Column({ name: "reason_code", type: "varchar", length: 64 }) reasonCode!: string;
  @Column({ name: "source_type", type: "varchar", length: 64 }) sourceType!: string;
  @Column({ name: "source_id", type: "uuid" }) sourceId!: string;
  @Column({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}

@Entity("biz_property_approval_audit")
export class PropertyApprovalAuditEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "tenant_id", type: "varchar", length: 64 }) tenantId!: string;
  @Column({ name: "park_id", type: "varchar", length: 64 }) parkId!: string;
  @Column({ name: "request_id", type: "uuid" }) requestId!: string;
  @Column({ name: "actor_id", type: "uuid", nullable: true }) actorId!: string | null;
  @Column({ name: "action_id", type: "varchar", length: 128 }) actionId!: string;
  @Column({ name: "from_decision_status", type: "varchar", length: 32, nullable: true }) fromDecisionStatus!: string | null;
  @Column({ name: "to_decision_status", type: "varchar", length: 32, nullable: true }) toDecisionStatus!: string | null;
  @Column({ name: "from_execution_status", type: "varchar", length: 32, nullable: true }) fromExecutionStatus!: string | null;
  @Column({ name: "to_execution_status", type: "varchar", length: 32, nullable: true }) toExecutionStatus!: string | null;
  @Column({ name: "decision_version", type: "integer" }) decisionVersion!: number;
  @Column({ name: "execution_version", type: "integer" }) executionVersion!: number;
  @Column({ name: "incident_id", type: "varchar", length: 128, nullable: true }) incidentId!: string | null;
  @Column({ type: "varchar", length: 1000, nullable: true }) reason!: string | null;
  @Column({ name: "payload_hash", type: "char", length: 64 }) payloadHash!: string;
  @Column({ name: "occurred_at", type: "timestamptz" }) occurredAt!: Date;
}

@Entity("biz_property_execution_effect_manifest")
export class PropertyExecutionEffectManifestEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "tenant_id", type: "varchar", length: 64 }) tenantId!: string;
  @Column({ name: "park_id", type: "varchar", length: 64 }) parkId!: string;
  @Column({ name: "request_id", type: "uuid" }) requestId!: string;
  @Column({ name: "effect_kind", type: "varchar", length: 128 }) effectKind!: string;
  @Column({ name: "effect_ordinal", type: "integer" }) effectOrdinal!: number;
  @Column({ name: "effect_line_key", type: "varchar", length: 160 }) effectLineKey!: string;
  @Column({ name: "owning_table", type: "varchar", length: 128 }) owningTable!: string;
  @Column({ name: "owning_unique_name", type: "varchar", length: 128 }) owningUniqueName!: string;
  @Column({ name: "expected_cardinality", type: "integer" }) expectedCardinality!: number;
  @Column({ name: "line_amount", type: "numeric", precision: 18, scale: 2, nullable: true }) lineAmount!: string | null;
  @Column({ type: "varchar", length: 8, nullable: true }) currency!: string | null;
  @Column({ name: "invariant_hash", type: "char", length: 64 }) invariantHash!: string;
  @Column({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}

@Entity("biz_property_execution_effect_receipt")
export class PropertyExecutionEffectReceiptEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "tenant_id", type: "varchar", length: 64 }) tenantId!: string;
  @Column({ name: "park_id", type: "varchar", length: 64 }) parkId!: string;
  @Column({ name: "request_id", type: "uuid" }) requestId!: string;
  @Column({ name: "manifest_id", type: "uuid" }) manifestId!: string;
  @Column({ name: "execution_idempotency_key", type: "varchar", length: 128 }) executionIdempotencyKey!: string;
  @Column({ name: "effect_kind", type: "varchar", length: 128 }) effectKind!: string;
  @Column({ name: "effect_ordinal", type: "integer" }) effectOrdinal!: number;
  @Column({ name: "effect_line_key", type: "varchar", length: 160 }) effectLineKey!: string;
  @Column({ name: "domain_table", type: "varchar", length: 128 }) domainTable!: string;
  @Column({ name: "domain_row_id", type: "uuid" }) domainRowId!: string;
  @Column({ name: "effect_hash", type: "char", length: 64 }) effectHash!: string;
  @Column({ name: "owning_unique_name", type: "varchar", length: 128 }) owningUniqueName!: string;
  @Column({ name: "unique_key_hash", type: "char", length: 64 }) uniqueKeyHash!: string;
  @Column({ name: "observed_cardinality", type: "integer" }) observedCardinality!: number;
  @Column({ name: "line_amount", type: "numeric", precision: 18, scale: 2, nullable: true }) lineAmount!: string | null;
  @Column({ type: "varchar", length: 8, nullable: true }) currency!: string | null;
  @Column({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}

@Entity("biz_property_mutation_receipt")
export class PropertyMutationReceiptEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "receipt_contract_version", type: "varchar", length: 16 })
  receiptContractVersion!: "legacy-v1" | "port-v2";
  @Column({ name: "identity_kind", type: "varchar", length: 32, nullable: true })
  identityKind!: "property-task" | "property-task-source-rebuild" | null;
  @Column({ name: "business_occurrence_key", type: "varchar", length: 256, nullable: true })
  businessOccurrenceKey!: string | null;
  @Column({ name: "task_key", type: "char", length: 64, nullable: true })
  taskKey!: string | null;
  @Column({ name: "identity_source_type", type: "varchar", length: 64, nullable: true })
  identitySourceType!: string | null;
  @Column({ name: "tenant_id", type: "varchar", length: 64 }) tenantId!: string;
  @Column({ name: "park_id", type: "varchar", length: 64 }) parkId!: string;
  @Column({ name: "actor_id", type: "uuid" }) actorId!: string;
  @Column({ name: "action_id", type: "varchar", length: 128 }) actionId!: string;
  @Column({ name: "target_id", type: "uuid" }) targetId!: string;
  @Column({ name: "client_key", type: "varchar", length: 128 }) clientKey!: string;
  @Column({ name: "request_hash", type: "char", length: 64 }) requestHash!: string;
  @Column({ name: "receipt_status", type: "varchar", length: 16 }) receiptStatus!: "started" | "completed" | "failed";
  @Column({ name: "result_ref", type: "varchar", length: 512, nullable: true }) resultRef!: string | null;
  @Column({ name: "result_hash", type: "char", length: 64, nullable: true }) resultHash!: string | null;
  @Column({ name: "result_version", type: "integer", nullable: true }) resultVersion!: number | null;
  @Column({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @Column({ name: "completed_at", type: "timestamptz", nullable: true }) completedAt!: Date | null;
}

export const PROPERTY_APPROVAL_ENTITIES = [
  PropertyApprovalRequestEntity,
  PropertyApprovalStageEntity,
  PropertyApprovalDecisionEntity,
  PropertyApprovalActorExclusionEntity,
  PropertyApprovalAuditEntity,
  PropertyExecutionEffectManifestEntity,
  PropertyExecutionEffectReceiptEntity,
  PropertyMutationReceiptEntity
] as const;
