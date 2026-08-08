import type { TenantParkScope } from "../index";

export const TRACK_B_CONTRACT_SHA256 =
  "e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944" as const;

export const TRACK_B_RUNTIME_CONTRACT_FREEZE_SHA256 =
  "47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf" as const;

export const TRACK_B_PRODUCT_ACCESS_FREEZE_SHA256 =
  "d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040" as const;

export const TRACK_B_IDENTITY_CONTROL_FREEZE_SHA256 =
  "062ba02b310e00a7fb43e3288e1cd78c55f23d30518e8aeac006eae8b7ea9496" as const;

export const TRACK_B_SCHEMA_PHYSICAL_ADDENDUM_SHA256 =
  "3830b12d665bbfb39c6e2747637ebd1592f7abfbe4d44af53c64aa123dd844d5" as const;

export const PROPERTY_TRACK_B_MODULE_DEPENDENCIES = [
  { moduleCode: "homestay", requiredModuleCode: "asset", dependencyKind: "hard" },
  { moduleCode: "housing_rental", requiredModuleCode: "asset", dependencyKind: "hard" }
] as const;

export const IDENTITY_SUBMISSION_STATUSES = [
  "draft",
  "pending_verification",
  "verified",
  "rejected",
  "withdrawn",
  "superseded"
] as const;
export type IdentitySubmissionStatus = (typeof IDENTITY_SUBMISSION_STATUSES)[number];

export const APPROVAL_DECISION_STATUSES = [
  "draft",
  "submitted",
  "pending_approval",
  "approved",
  "rejected",
  "withdrawn",
  "expired"
] as const;
export type ApprovalDecisionStatus = (typeof APPROVAL_DECISION_STATUSES)[number];

export const APPROVAL_EXECUTION_STATUSES = [
  "not_started",
  "executing",
  "retry_wait",
  "executed",
  "execution_failed",
  "infra_exhausted",
  "not_required"
] as const;
export type ApprovalExecutionStatus = (typeof APPROVAL_EXECUTION_STATUSES)[number];

export const PROPERTY_TASK_STATUSES = [
  "open",
  "claimed",
  "in_progress",
  "blocked",
  "closed",
  "cancelled"
] as const;
export type PropertyTaskStatus = (typeof PROPERTY_TASK_STATUSES)[number];

export const PROPERTY_NOTIFICATION_DELIVERY_STATUSES = [
  "pending",
  "delivering",
  "delivered",
  "delivery_failed",
  "delivery_exhausted"
] as const;
export type PropertyNotificationDeliveryStatus =
  (typeof PROPERTY_NOTIFICATION_DELIVERY_STATUSES)[number];

export const PROPERTY_EVENT_DELIVERY_INCIDENT_STATUSES = [
  "active",
  "replaying",
  "resolved",
  "quarantined"
] as const;
export type PropertyEventDeliveryIncidentStatus =
  (typeof PROPERTY_EVENT_DELIVERY_INCIDENT_STATUSES)[number];

export const TRACK_B_ALLOWED_ACTIONS = [
  "party.identity.claim",
  "party.identity.reassign",
  "property.operation.update",
  "property.mode-transition.request",
  "property.occupancy.force-release.request",
  "property.approval.decide",
  "property.approval.withdraw",
  "property.approval.incident-retry",
  "property.event.replay",
  "property.task.claim",
  "property.task.start",
  "property.task.block",
  "property.task.unblock",
  "property.task.release",
  "property.notification.mark-read"
] as const;
export type TrackBAllowedAction = (typeof TRACK_B_ALLOWED_ACTIONS)[number];

export const TRACK_B_APPROVAL_EFFECT_MANIFEST = {
  "homestay.bookings.cancel.request": [
    "homestay.booking.cancel",
    "homestay.ledger.waiver",
    "homestay.ledger.charge"
  ],
  "homestay.finance.refund-or-waive.request": [
    "homestay.ledger.refund",
    "homestay.ledger.waiver"
  ],
  "housing.leases.approve.request": ["housing.lease.approve"],
  "housing.leases.void.request": ["housing.lease.void"],
  "housing.leases.checkout.request": ["housing.lease.checkout"],
  "housing.finance.refund-waive-or-deposit-refund.request": [
    "housing.ledger.refund",
    "housing.ledger.waiver",
    "housing.ledger.deposit.refund"
  ],
  "housing.handovers.complete-move-out-financial.request": [
    "housing.handover.complete.financial",
    "housing.receivable.checkout",
    "housing.ledger.deduction"
  ],
  "housing.purchases.lifecycle.request": ["housing.purchase.lifecycle"],
  "housing.purchases.transfer.request": [
    "housing.purchase.transfer",
    "housing.receivable.purchase.transfer"
  ],
  "property.mode-transition.request": ["property.mode.transition"],
  "property.occupancy.force-release.request": ["property.occupancy.force.release"]
} as const;
export type TrackBApprovalActionId = keyof typeof TRACK_B_APPROVAL_EFFECT_MANIFEST;
export type TrackBEffectKind =
  (typeof TRACK_B_APPROVAL_EFFECT_MANIFEST)[TrackBApprovalActionId][number];

export const TRACK_B_EFFECT_KIND_PATTERN =
  /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;

export const PROPERTY_ERROR_CODES = [
  "property-validation-failed",
  "property-action-forbidden",
  "property-resource-not-found",
  "property-version-conflict",
  "idempotency-key-conflict",
  "identity-active-submission-exists",
  "identity-snapshot-stale",
  "identity-actor-separation-required",
  "identity-file-not-ready",
  "approval-required",
  "approval-policy-not-found",
  "approval-no-eligible-approver",
  "approval-actor-separation-required",
  "approval-source-changed",
  "approval-already-decided",
  "approval-withdraw-forbidden",
  "approval-execution-failed",
  "approval-infra-exhausted",
  "approval-reconcile-partial",
  "event-checksum-mismatch",
  "event-replay-forbidden",
  "task-already-claimed",
  "task-source-ineligible",
  "task-version-conflict",
  "property-mode-blocked",
  "module-dependency-conflict",
  "property-operation-in-progress",
  "property-runtime-unavailable"
] as const;
export type PropertyErrorCode = (typeof PROPERTY_ERROR_CODES)[number];

export type PropertySortOrder = "asc" | "desc";

export interface PropertyPageQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: PropertySortOrder;
}

export interface PropertyPaginatedResult<T, A extends string = TrackBAllowedAction> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  allowedActions: A[];
}

export interface PropertyErrorData {
  errorCode: PropertyErrorCode;
  retryable: boolean;
  latestVersion?: number;
  recoveryAction?: string;
  details: Record<string, unknown>;
}

export interface PropertyAllowedActionProjection<A extends string = TrackBAllowedAction> {
  allowedActions: A[];
}

export const IDENTITY_IDEMPOTENCY_HEADER = "X-Idempotency-Key" as const;
export const IDENTITY_CLIENT_KEY_MIN_LENGTH = 1 as const;
export const IDENTITY_CLIENT_KEY_MAX_LENGTH = 128 as const;
export const IDENTITY_CLIENT_KEY_PATTERN = /^[\x20-\x7e]{1,128}$/;

export function normalizeIdentityClientKey(value: string): string | null {
  return value.length >= IDENTITY_CLIENT_KEY_MIN_LENGTH
    && value.length <= IDENTITY_CLIENT_KEY_MAX_LENGTH
    && IDENTITY_CLIENT_KEY_PATTERN.test(value)
    && value.trim().length > 0
    ? value
    : null;
}

export function resolveIdentityClientKey(
  headerValue: string | null | undefined,
  bodyValue: string | null | undefined
): string | null {
  return headerValue != null
    && bodyValue != null
    && headerValue === bodyValue
    ? normalizeIdentityClientKey(headerValue)
    : null;
}

export interface CreateIdentityDraftDto {
  clientKey: string;
  partyId: string;
  expectedIdentityVersion: number;
  supersedesSubmissionId?: string;
  expectedSupersededStatus?: "rejected" | "withdrawn" | "verified";
  expectedSupersededVersion?: number;
}

export interface UpdateIdentityDraftDto {
  clientKey: string;
  expectedVersion: number;
  documentType: "id_card" | "passport" | null;
  identityNumber: string | null;
  pendingFileIds: string[];
}

export interface SubmitIdentityDto {
  clientKey: string;
  expectedVersion: number;
}

export interface ClaimIdentityDto {
  clientKey: string;
  expectedVersion: number;
  expectedAssignmentVersion: number;
}

export interface ReassignIdentityDto {
  clientKey: string;
  expectedVersion: number;
  expectedAssignmentVersion: number;
  assignedVerifierId: string | null;
  reason: string;
}

export interface DecideIdentityDto {
  clientKey: string;
  expectedVersion: number;
  expectedAssignmentVersion: number;
  decision: "verified" | "rejected";
  reason?: string;
}

export interface WithdrawIdentityDto {
  clientKey: string;
  expectedVersion: number;
  reason: string;
}

export const IDENTITY_MUTATION_ACTION_IDS = [
  "party.identity.create-draft",
  "party.identity.update-draft",
  "party.identity.submit",
  "party.identity.claim",
  "party.identity.reassign",
  "party.identity.verify",
  "party.identity.withdraw"
] as const;

export interface IdentityEvidenceFileProjection {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileVersion: number;
}

export interface IdentityEvidenceProjection {
  documentType: "id_card" | "passport" | null;
  identityNumberMasked: string | null;
  fileCount: number;
  files: IdentityEvidenceFileProjection[];
}

export interface IdentitySubmissionProjection
  extends PropertyAllowedActionProjection<
    | "party.identity.submit"
    | "party.identity.claim"
    | "party.identity.reassign"
    | "party.identity.verify"
    | "party.identity.withdraw"
  > {
  id: string;
  partyId: string;
  partyDisplayName: string;
  status: IdentitySubmissionStatus;
  version: number;
  identityVersion: number;
  submissionAttempt: number;
  supersedesSubmissionId: string | null;
  verificationQueueId: string | null;
  verificationQueueName: string | null;
  assignedVerifierId: string | null;
  assignedVerifierDisplayName: string | null;
  assignmentVersion: number;
  eligibilityPolicyHash: string | null;
  evidence: IdentityEvidenceProjection;
  draftedAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  withdrawnAt: string | null;
  supersededAt: string | null;
  updateTime: string;
}

export interface IdentitySubmissionListQuery {
  page?: number;
  pageSize?: number;
  status?: IdentitySubmissionStatus;
  partyId?: string;
  verificationQueueId?: string;
  assignment?: "mine" | "unassigned" | "any";
  submittedFrom?: string;
  submittedTo?: string;
  sort?: "createTime" | "submittedAt" | "decidedAt" | "updateTime";
  order?: PropertySortOrder;
}

export type IdentitySubmissionListResponse =
  PropertyPaginatedResult<IdentitySubmissionProjection, never>;
export type IdentitySubmissionDetailResponse = IdentitySubmissionProjection;
export type CreateIdentityDraftResponse = IdentitySubmissionProjection;
export type UpdateIdentityDraftResponse = IdentitySubmissionProjection;
export type SubmitIdentityResponse = IdentitySubmissionProjection;
export type ClaimIdentityResponse = IdentitySubmissionProjection;
export type ReassignIdentityResponse = IdentitySubmissionProjection;
export type DecideIdentityResponse = IdentitySubmissionProjection;
export type WithdrawIdentityResponse = IdentitySubmissionProjection;

export const IDENTITY_AUDIT_EVENT_TYPES = [
  "draft-created",
  "draft-updated",
  "submitted",
  "claimed",
  "reassigned",
  "revoked",
  "verified",
  "rejected",
  "withdrawn",
  "superseded",
  "legacy-imported"
] as const;
export type IdentityAuditEventType = (typeof IDENTITY_AUDIT_EVENT_TYPES)[number];

export interface IdentityAuditListQuery {
  page?: number;
  pageSize?: number;
  sort?: "occurredAt";
  order?: PropertySortOrder;
}

export interface IdentityAuditItem {
  id: string;
  eventType: IdentityAuditEventType;
  submissionVersion: number;
  assignmentVersion: number;
  actor: { id: string | null; displayName: string };
  reason: string | null;
  occurredAt: string;
  evidence: Omit<IdentityEvidenceProjection, "files"> | null;
}

export type IdentityAuditListResponse =
  PropertyPaginatedResult<IdentityAuditItem, never>;

export interface PartyIdentitySummary {
  status:
    | "unverified"
    | "draft"
    | "pending_verification"
    | "verified"
    | "rejected"
    | "withdrawn";
  identityVersion: number;
  currentSubmissionId: string | null;
  currentVerifiedSubmissionId: string | null;
  documentType: "id_card" | "passport" | null;
  identityNumberMasked: string | null;
  submissionDeepLink: string | null;
  updatedAt: string | null;
}

export interface PartyIdentitySummaryProjection {
  identitySummary: PartyIdentitySummary | null;
}

export interface EntityManagerPort {
  readonly transactionContext: unknown;
}

export const PROPERTY_APPROVAL_PORT_CONTRACT_VERSION =
  "property-approval-port-v2" as const;

export const PROPERTY_APPROVAL_COMMAND_PORT =
  Symbol("PROPERTY_APPROVAL_COMMAND_PORT");

export const PROPERTY_APPROVAL_PROJECTION_PORT =
  Symbol("PROPERTY_APPROVAL_PROJECTION_PORT");

export type PropertyApprovalJsonValue =
  | null
  | boolean
  | string
  | number
  | readonly PropertyApprovalJsonValue[]
  | { readonly [key: string]: PropertyApprovalJsonValue };

export interface CreatePendingPropertyApprovalCommand {
  contractVersion: typeof PROPERTY_APPROVAL_PORT_CONTRACT_VERSION;
  scope: TenantParkScope;
  actionId: TrackBApprovalActionId;
  sourceType: string;
  sourceId: string;
  sourceExpectedVersion: number;
  requesterId: string;
  submitterId: string;
  actorId: string;
  clientKey: string;
  businessIntentKey: string;
  canonicalPayload: Readonly<Record<string, PropertyApprovalJsonValue>>;
  payloadSchemaVersion: number;
  amount: string | null;
  currency: string | null;
}

export interface PropertyApprovalRequestProjection {
  requestId: string;
  tenantId: string;
  parkId: string;
  actionId: TrackBApprovalActionId;
  sourceType: string;
  sourceId: string;
  sourceExpectedVersion: number;
  requesterId: string;
  submitterId: string;
  businessIntentKey: string;
  payloadSchemaVersion: number;
  payloadHash: string;
  amount: string | null;
  currency: string | null;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  decisionStatus: ApprovalDecisionStatus;
  executionStatus: ApprovalExecutionStatus;
  decisionVersion: number;
  executionVersion: number;
  submittedAt: string | null;
  decidedAt: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PropertyApprovalCreateDisposition =
  | "created"
  | "replayed-client-key"
  | "replayed-business-intent";

export interface CreatePendingPropertyApprovalResult {
  disposition: PropertyApprovalCreateDisposition;
  request: PropertyApprovalRequestProjection;
}

export interface PropertyApprovalCommandPort {
  createPendingRequest(
    manager: EntityManagerPort,
    command: CreatePendingPropertyApprovalCommand
  ): Promise<CreatePendingPropertyApprovalResult>;
}

export interface PropertyApprovalRequestByIdQuery {
  scope: TenantParkScope;
  requestId: string;
}

export interface PropertyApprovalActiveBySourceQuery {
  scope: TenantParkScope;
  actionId: TrackBApprovalActionId;
  sourceType: string;
  sourceId: string;
  sourceExpectedVersion: number;
}

export interface PropertyApprovalRequestsBySourceQuery {
  scope: TenantParkScope;
  actionId: TrackBApprovalActionId;
  sourceType: string;
  sourceId: string;
}

export interface PropertyApprovalProjectionPort {
  findById(
    manager: EntityManagerPort,
    query: PropertyApprovalRequestByIdQuery
  ): Promise<PropertyApprovalRequestProjection | null>;

  findActiveBySource(
    manager: EntityManagerPort,
    query: PropertyApprovalActiveBySourceQuery
  ): Promise<PropertyApprovalRequestProjection | null>;

  listBySource(
    manager: EntityManagerPort,
    query: PropertyApprovalRequestsBySourceQuery
  ): Promise<readonly PropertyApprovalRequestProjection[]>;
}

export interface VerifiedIdentityEvidence {
  partyId: string;
  submissionId: string;
  submissionVersion: number;
  snapshotId: string;
  identityVersion: number;
  documentType: string;
  hashAlgorithm: string;
  hashVersion: number;
  files: readonly {
    fileId: string;
    fileVersion: number;
    contentSha256: string;
  }[];
  verifiedAt: string;
}

export interface IdentityVerificationPort {
  verifyForCheckIn(input: {
    manager: EntityManagerPort;
    scope: TenantParkScope;
    bookingId: string;
    partyIds: readonly string[];
    expectedConsent: "granted";
  }): Promise<readonly VerifiedIdentityEvidence[]>;
}

export interface ApprovalMutationCommand {
  clientKey: string;
}

export interface ApprovalDecisionCommand extends ApprovalMutationCommand {
  decision: "approve" | "reject";
  reason?: string;
  stageId: string;
  expectedStageVersion: number;
  expectedRequestVersion: number;
}

export interface ApprovalWithdrawCommand extends ApprovalMutationCommand {
  reason: string;
  expectedDecisionVersion: number;
}

export interface ApprovalRetryCommand extends ApprovalMutationCommand {
  incidentId: string;
  reason: string;
  expectedExecutionVersion: number;
}

export interface EventReplayCommand extends ApprovalMutationCommand {
  incidentId: string;
  reason: string;
  expectedDlqVersion: number;
}

export interface TaskVersionCommand extends ApprovalMutationCommand {
  expectedAssignmentVersion: number;
}

export interface TaskBlockCommand extends TaskVersionCommand {
  blockedReason: string;
  blockedUntil?: string | null;
}

export interface NotificationMarkReadCommand extends ApprovalMutationCommand {
  expectedReadVersion: number;
}

export interface PropertyNotification {
  id: string;
  eventId: string;
  notificationType: string;
  title: string;
  summary: string;
  severity: string;
  sourceType: string;
  sourceId: string;
  deepLink: string;
  createdAt: string;
}

export interface PropertyNotificationRecipient {
  notificationId: string;
  recipientUserId: string;
  tenantId: string;
  parkId: string;
  readAt: string | null;
  createdAt: string;
}

export interface PropertyNotificationDelivery {
  notificationId: string;
  recipientUserId: string;
  channel: string;
  status: PropertyNotificationDeliveryStatus;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  exhaustedAt: string | null;
  errorCode: string | null;
}

export type NotificationChannelDelivery = Omit<
  PropertyNotificationDelivery,
  "notificationId" | "recipientUserId"
>;

export interface NotificationListItem
  extends PropertyNotification,
    PropertyAllowedActionProjection<"property.notification.mark-read"> {
  readAt: string | null;
  readVersion: number;
  channelDeliveries: NotificationChannelDelivery[];
}

export interface NotificationDetail extends NotificationListItem {
  safeDetails: Record<string, unknown>;
}

export interface NotificationListQuery extends PropertyPageQuery {
  readStatus?: "read" | "unread";
  severity?: string;
  notificationType?: string;
  sort?: "createdAt" | "readAt";
}

export interface IncidentListItem
  extends PropertyAllowedActionProjection<"property.event.replay"> {
  dlqId: string;
  eventId: string;
  notificationDeliveryId: string | null;
  failureSide: string;
  consumerName: string;
  status: string;
  version: number;
  attemptCount: number;
  firstFailedAt: string;
  lastFailedAt: string;
  errorCategory: string;
  errorCode: string;
  incidentId: string;
  lastReplayAt: string | null;
  deepLink: string;
}

export type IncidentDetail = IncidentListItem;

export interface IncidentListQuery extends PropertyPageQuery {
  eventId?: string;
  failureSide?: string;
  consumerName?: string;
  status?: string;
  sort?: "lastFailedAt" | "createdAt";
}

export interface ApprovalIncidentListItem
  extends PropertyAllowedActionProjection<"property.approval.incident-retry"> {
  requestId: string;
  incidentId: string;
  actionId: TrackBApprovalActionId;
  sourceType: string;
  sourceId: string;
  title: string;
  executionStatus: "infra_exhausted";
  executionVersion: number;
  errorCode: string;
  infraExhaustedAt: string;
  lastRetryAt: string | null;
  updatedAt: string;
  requestedBy: string;
  requestedAt: string;
  deepLink: string;
}

export interface ApprovalIncidentDetail extends ApprovalIncidentListItem {
  safeReconcileSummary: Record<string, unknown>;
  auditTimeline: readonly Record<string, unknown>[];
}

export interface ApprovalIncidentListQuery extends PropertyPageQuery {
  actionId?: TrackBApprovalActionId;
  sourceType?: string;
  sort?: "infraExhaustedAt" | "lastRetryAt" | "updatedAt";
}

export interface ApprovalSummary
  extends PropertyAllowedActionProjection<
    "property.approval.decide" | "property.approval.withdraw"
  > {
  requestId: string;
  actionId: TrackBApprovalActionId;
  decisionStatus: ApprovalDecisionStatus;
  executionStatus: ApprovalExecutionStatus;
  requestedAt: string;
  updatedAt: string;
}

export interface PropertyBlocker {
  code: string;
  label: string;
  count: number;
  sourceDomain: string;
  sourceType: string;
  sourceId?: string;
  deepLink?: string;
}

export interface PropertyOperationListQuery extends PropertyPageQuery {
  keyword?: string;
  buildingId?: string;
  configuredMode?: string;
  operationStatus?: string;
  blockerCode?: string;
  sort?: "unitCode" | "configuredMode" | "updateTime";
}

export interface PropertyOccupancyListQuery extends PropertyPageQuery {
  unitId?: string;
  sourceDomain?: string;
  sourceType?: string;
  status?: string;
  startFrom?: string;
  endTo?: string;
  sort?: "startAt" | "endAt" | "updateTime";
}

export interface PropertyModeTransitionListQuery extends PropertyPageQuery {
  decisionStatus?: ApprovalDecisionStatus;
  executionStatus?: ApprovalExecutionStatus;
  sort?: "createTime" | "decisionTime" | "executionTime";
}

export interface PropertyTaskListQuery extends PropertyPageQuery {
  assignmentStatus?: PropertyTaskStatus;
  taskKind?: string;
  assigneeId?: string;
  sourceType?: string;
  sort?: "updatedAt" | "createdAt";
}

export interface ApprovalListQuery extends PropertyPageQuery {
  decisionStatus?: ApprovalDecisionStatus;
  executionStatus?: ApprovalExecutionStatus;
  actionId?: TrackBApprovalActionId;
  sourceType?: string;
  sort?: "createdAt" | "updatedAt";
}

export const PROPERTY_NOTIFICATION_DEEP_LINK_TEMPLATES = {
  "identity-verification-assigned":
    "/assets/identity-submissions/[submissionId]",
  "homestay-approval-stage-assigned":
    "/homestay/tasks?requestId=[requestId]",
  "housing-approval-stage-assigned":
    "/housing/tasks?requestId=[requestId]",
  "homestay-task-assigned": "/homestay/tasks?taskId=[taskId]",
  "housing-task-assigned": "/housing/tasks?taskId=[taskId]",
  "property-event-delivery-incident":
    "/property/event-delivery-incidents/[dlqId]",
  "approval-infra-exhausted":
    "/property/approval-incidents/[requestId]"
} as const;
