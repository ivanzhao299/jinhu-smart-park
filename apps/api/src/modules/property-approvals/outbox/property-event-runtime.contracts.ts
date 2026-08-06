import type {
  ApprovalIncidentDetail,
  ApprovalIncidentListItem,
  ApprovalIncidentListQuery,
  EventReplayCommand,
  IncidentDetail,
  IncidentListItem,
  IncidentListQuery,
  PropertyPaginatedResult,
  TenantParkScope
} from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";

export const PROPERTY_EVENT_RUNTIME_STORE = Symbol("PROPERTY_EVENT_RUNTIME_STORE");
export const PROPERTY_EVENT_PUBLISHER = Symbol("PROPERTY_EVENT_PUBLISHER");
export const PROPERTY_INCIDENT_AUTHORIZATION = Symbol("PROPERTY_INCIDENT_AUTHORIZATION");
export const PROPERTY_APPROVAL_INCIDENT_RETRY = Symbol("PROPERTY_APPROVAL_INCIDENT_RETRY");

export interface PropertyEventEnvelope {
  eventId: string;
  tenantId: string;
  parkId: string;
  eventType: string;
  eventVersion: number;
  orderingKey: string;
  sequence: string;
  eventOrdinal: number;
  payload: Record<string, unknown>;
  payloadHash: string;
  attemptCount: number;
  claimEpoch: string;
  claimToken: string;
  replayDlqId?: string;
  replayDlqVersion?: number;
}

export interface PropertyEventPublisherPort {
  publish(event: Readonly<PropertyEventEnvelope>): Promise<void>;
}

export interface PropertyIncidentAuthorizationPort {
  /**
   * This port must independently verify the active asset module assignment,
   * exact page permission, exact action permission and assigned tenant+park
   * incident scope. Missing configuration must reject, never allow.
   */
  authorize(input: {
    manager?: EntityManager;
    scope: TenantParkScope;
    actor: JwtPrincipal;
    surface: "event-delivery" | "approval";
    operation: "read" | "replay" | "retry";
    resourceId?: string;
  }): Promise<{
    allowedActions: readonly (
      "property.event.replay" | "property.approval.incident-retry"
    )[];
    assignedResourceIds?: readonly string[];
  }>;
}

export interface PropertyApprovalIncidentRetryPort {
  retry(input: {
    scope: TenantParkScope;
    actor: JwtPrincipal;
    requestId: string;
    command: {
      clientKey: string;
      incidentId: string;
      reason: string;
      expectedExecutionVersion: number;
    };
  }): Promise<unknown>;
}

export interface InboxConsumeInput {
  scope: TenantParkScope;
  consumerName: string;
  consumerVersion: number;
  event: Omit<PropertyEventEnvelope, "attemptCount" | "claimEpoch" | "claimToken">;
}

export type CanonicalInboxEvent =
  Omit<PropertyEventEnvelope, "attemptCount" | "claimEpoch" | "claimToken">;

export interface InboxConsumeResult<T> {
  duplicate: boolean;
  result: T;
  resultHash: string;
  resultReference: string | null;
}

export interface EventReplayResult {
  dlqId: string;
  eventId: string;
  status: "replaying" | "quarantined";
  version: number;
}

export interface PropertyEventRuntimeStore {
  claimPublishable(input: {
    workerId: string;
    limit: number;
    leaseSeconds: number;
    authorize: (manager: EntityManager, scope: TenantParkScope) => Promise<boolean>;
  }): Promise<PropertyEventEnvelope[]>;
  markPublished(event: PropertyEventEnvelope): Promise<boolean>;
  markPublishFailure(input: {
    event: PropertyEventEnvelope;
    errorCategory: string;
    errorCode: string;
    maxAttempts: number;
    retryAt: Date;
  }): Promise<"retry_wait" | "dlq" | "stale-claim">;
  consumeInbox<T>(
    input: InboxConsumeInput,
    handler: (manager: EntityManager, event: Readonly<CanonicalInboxEvent>) => Promise<{
      result: T;
      resultHash: string;
      resultReference?: string | null;
    }>
  ): Promise<InboxConsumeResult<T>>;
  listEventIncidents(
    scope: TenantParkScope,
    query: IncidentListQuery
  ): Promise<PropertyPaginatedResult<IncidentListItem, never>>;
  getEventIncident(scope: TenantParkScope, dlqId: string): Promise<IncidentDetail | null>;
  prepareEventReplay(input: {
    scope: TenantParkScope;
    actorId: string;
    dlqId: string;
    command: EventReplayCommand;
    authorize: (manager: EntityManager) => Promise<void>;
  }): Promise<EventReplayResult | null>;
  listReplayingEvents(input: {
    limit: number;
    authorize: (manager: EntityManager, scope: TenantParkScope) => Promise<boolean>;
  }): Promise<PropertyEventEnvelope[]>;
  completeConsumerReplay(
    manager: EntityManager,
    input: {
      dlqId: string;
      eventId: string;
      consumerName: string;
      expectedDlqVersion: number;
      inboxResultHash: string;
    }
  ): Promise<boolean>;
  listApprovalIncidents(
    scope: TenantParkScope,
    assignedRequestIds: readonly string[],
    query: ApprovalIncidentListQuery
  ): Promise<PropertyPaginatedResult<ApprovalIncidentListItem, never>>;
  getApprovalIncident(
    scope: TenantParkScope,
    requestId: string
  ): Promise<ApprovalIncidentDetail | null>;
}
