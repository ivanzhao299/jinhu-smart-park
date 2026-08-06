import type { TenantParkScope, TrackBApprovalActionId } from "@jinhu/shared";
import type { EntityManager } from "typeorm";

export const PROPERTY_APPROVAL_POLICY_PORT = Symbol("PROPERTY_APPROVAL_POLICY_PORT");
export const PROPERTY_APPROVAL_AUTHORIZATION_PORT = Symbol("PROPERTY_APPROVAL_AUTHORIZATION_PORT");
export const PROPERTY_APPROVAL_READ_AUTHORIZATION_PORT =
  Symbol("PROPERTY_APPROVAL_READ_AUTHORIZATION_PORT");
export const PROPERTY_APPROVAL_INCIDENT_AUTHORIZATION_PORT =
  Symbol("PROPERTY_APPROVAL_INCIDENT_AUTHORIZATION_PORT");
export const PROPERTY_APPROVAL_EFFECT_ADAPTERS = Symbol("PROPERTY_APPROVAL_EFFECT_ADAPTERS");
export const PROPERTY_APPROVAL_OUTBOX_PORT = Symbol("PROPERTY_APPROVAL_OUTBOX_PORT");
export const PROPERTY_RUNTIME_CONTROL_PORT = Symbol("PROPERTY_RUNTIME_CONTROL_PORT");
export const PROPERTY_APPROVAL_EFFECT_PROOF_VERIFIERS =
  Symbol("PROPERTY_APPROVAL_EFFECT_PROOF_VERIFIERS");

export interface FrozenApprovalStage {
  stageCode: string;
  stageOrdinal: number;
  eligibilityPolicySnapshot: Record<string, unknown>;
  eligibilityPolicyVersion: number;
  eligibilityPolicyHash: string;
  requiredCount: number;
}

export interface FrozenApprovalExclusion {
  actorId: string;
  reasonCode: string;
  sourceType: string;
  sourceId: string;
}

export interface FrozenApprovalEffect {
  effectKind: string;
  effectOrdinal: number;
  effectLineKey: string;
  owningTable: string;
  owningUniqueName: string;
  expectedCardinality: number;
  lineAmount?: string | null;
  currency?: string | null;
  invariantHash: string;
}

export interface FrozenApprovalPolicy {
  policyId: string;
  policyVersion: number;
  policyHash: string;
  stages: readonly FrozenApprovalStage[];
  exclusions: readonly FrozenApprovalExclusion[];
  effects: readonly FrozenApprovalEffect[];
}

export interface PropertyApprovalPolicyPort {
  resolve(input: {
    manager: EntityManager;
    scope: TenantParkScope;
    actionId: TrackBApprovalActionId;
    sourceType: string;
    sourceId: string;
    requesterId: string;
    canonicalPayload: Record<string, unknown>;
  }): Promise<FrozenApprovalPolicy>;
}

export interface PropertyApprovalAuthorizationPort {
  authorizeDecision(input: {
    manager: EntityManager;
    scope: TenantParkScope;
    actorId: string;
    requestId: string;
    actionId: TrackBApprovalActionId;
    stageId: string;
    eligibilityPolicySnapshot: Readonly<Record<string, unknown>>;
    eligibilityPolicyHash: string;
  }): Promise<{ permissionSnapshot: Record<string, unknown> }>;
  canDecide(input: {
    scope: TenantParkScope;
    actorId: string;
    actionId: TrackBApprovalActionId;
    stageId: string;
    eligibilityPolicySnapshot: Readonly<Record<string, unknown>>;
    eligibilityPolicyHash: string;
  }): Promise<boolean>;
}

export interface PropertyApprovalReadPredicate {
  canReadAll: boolean;
  requesterId: string | null;
  requesterRequestIds: readonly string[];
  allowedSources: readonly { sourceType: string; sourceId: string }[];
  eligibleApproverRequestIds: readonly string[];
  auditorRequestIds: readonly string[];
  canAudit: boolean;
}

export interface PropertyApprovalReadAuthorizationPort {
  predicate(input: {
    scope: TenantParkScope;
    actorId: string;
    permissions: readonly string[];
  }): Promise<PropertyApprovalReadPredicate>;
  authorizeSource(input: {
    scope: TenantParkScope;
    actorId: string;
    sourceType: string;
    sourceId: string;
    predicate: PropertyApprovalReadPredicate;
  }): Promise<void>;
}

export interface PropertyApprovalIncidentAuthorizationPort {
  /**
   * Implementations read the active asset-module assignment, distinguish
   * missing/disabled/expired, verify page/read/retry grants and the assigned
   * tenant+park incident scope inside this transaction. Command data is never
   * an authorization source.
   */
  authorizeRetry(input: {
    manager: EntityManager;
    scope: TenantParkScope;
    actorId: string;
    requestId: string;
  }): Promise<{ scopeAssignmentId: string }>;
}

export interface PropertyApprovalEffectReceipt {
  manifestId: string;
  effectKind: string;
  effectOrdinal: number;
  effectLineKey: string;
  domainTable: string;
  domainRowId: string;
  effectHash: string;
  owningUniqueName: string;
  uniqueKeyHash: string;
  observedCardinality: number;
  lineAmount: string | null;
  currency: string | null;
}

export interface PropertyApprovalOutboxEvent {
  eventId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  orderingKey: string;
  eventOrdinal: number;
  payload: Record<string, unknown>;
  payloadHash: string;
}

export type ApprovalReconcileOutcome =
  | {
      state: "complete";
      receipts: readonly PropertyApprovalEffectReceipt[];
      financialMutationCount: number;
    }
  | { state: "absent"; financialMutationCount: 0 }
  | { state: "partial"; reason: string; evidence: Record<string, unknown> };

/**
 * Domain adapters must use the supplied EntityManager and must not open a new
 * transaction or perform an irreversible network side effect.
 */
export interface PropertyApprovalEffectAdapter {
  readonly actionId: TrackBApprovalActionId;
  execute(input: {
    manager: EntityManager;
    requestId: string;
    executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>;
    sourceExpectedVersion: number;
  }): Promise<{
    receipts: readonly PropertyApprovalEffectReceipt[];
    outboxEvents: readonly PropertyApprovalOutboxEvent[];
    financialMutationCount: number;
  }>;
  reconcile(input: {
    manager: EntityManager;
    requestId: string;
    executionIdempotencyKey: string;
  }): Promise<ApprovalReconcileOutcome>;
}

export interface PropertyApprovalEffectAdapterRegistry {
  get(actionId: TrackBApprovalActionId): PropertyApprovalEffectAdapter | null;
}

export interface PropertyApprovalVerifiedEffectProof {
  domainTable: string;
  domainRowId: string;
  owningUniqueName: string;
  uniqueKeyHash: string;
  observedCardinality: number;
  lineAmount: string | null;
  currency: string | null;
}

export interface PropertyApprovalEffectProofVerifier {
  readonly actionId: TrackBApprovalActionId;
  readonly effectKind: string;
  verify(input: {
    manager: EntityManager;
    scope: TenantParkScope;
    requestId: string;
    executionIdempotencyKey: string;
    effectLineKey: string;
    expectedCardinality: number;
    owningTable: string;
    owningUniqueName: string;
  }): Promise<PropertyApprovalVerifiedEffectProof>;
}

export interface PropertyApprovalEffectProofVerifierRegistry {
  get(
    actionId: TrackBApprovalActionId,
    effectKind: string
  ): PropertyApprovalEffectProofVerifier | null;
}

/**
 * The writer only persists rows in biz_property_outbox with the caller's
 * EntityManager. Publication, retry, DLQ and inbox workers are intentionally
 * outside this B-1 core slice.
 */
export interface PropertyApprovalOutboxPort {
  append(
    manager: EntityManager,
    input: {
      scope: TenantParkScope;
      approvalRequestId: string;
      executionIdempotencyKey: string;
      events: readonly PropertyApprovalOutboxEvent[];
    }
  ): Promise<void>;
}

export type PropertyRuntimeControlKey =
  | "approval.shadow-compare"
  | "approval.enforce"
  | "event-notification.enforce";

export interface PropertyRuntimeControlPort {
  inspect(
    manager: EntityManager,
    scope: TenantParkScope,
    key: PropertyRuntimeControlKey
  ): Promise<{ effective: boolean; mode: "disabled" | "shadow" | "enforce"; version: number }>;
  approvalMode(
    manager: EntityManager,
    scope: TenantParkScope
  ): Promise<"disabled" | "shadow" | "enforce">;
  requireApprovalEnforce(manager: EntityManager, scope: TenantParkScope): Promise<void>;
}
