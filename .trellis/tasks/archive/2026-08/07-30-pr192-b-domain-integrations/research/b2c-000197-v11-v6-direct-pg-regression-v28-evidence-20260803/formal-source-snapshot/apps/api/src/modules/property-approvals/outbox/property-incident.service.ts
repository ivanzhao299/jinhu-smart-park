import { Inject, Injectable } from "@nestjs/common";
import type {
  ApprovalIncidentListQuery,
  EventReplayCommand,
  IncidentListQuery,
  TenantParkScope
} from "@jinhu/shared";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";
import { propertyApprovalError } from "../property-approval.error";
import {
  PROPERTY_APPROVAL_INCIDENT_RETRY,
  PROPERTY_EVENT_RUNTIME_STORE,
  PROPERTY_INCIDENT_AUTHORIZATION,
  type PropertyApprovalIncidentRetryPort,
  type PropertyEventRuntimeStore,
  type PropertyIncidentAuthorizationPort
} from "./property-event-runtime.contracts";

@Injectable()
export class PropertyIncidentService {
  constructor(
    @Inject(PROPERTY_EVENT_RUNTIME_STORE) private readonly store: PropertyEventRuntimeStore,
    @Inject(PROPERTY_INCIDENT_AUTHORIZATION) private readonly auth: PropertyIncidentAuthorizationPort,
    @Inject(PROPERTY_APPROVAL_INCIDENT_RETRY)
    private readonly approvalRetry: PropertyApprovalIncidentRetryPort
  ) {}

  async listEvents(scope: TenantParkScope, actor: JwtPrincipal, query: IncidentListQuery) {
    const access = await this.auth.authorize({
      scope, actor, surface: "event-delivery", operation: "read"
    });
    const page = await this.store.listEventIncidents(scope, query);
    const allowedActions = access.allowedActions.filter(
      (action): action is "property.event.replay" => action === "property.event.replay"
    );
    return { ...page, items: page.items.map((item) => ({ ...item, allowedActions })) };
  }

  async eventDetail(scope: TenantParkScope, actor: JwtPrincipal, dlqId: string) {
    const access = await this.auth.authorize({
      scope, actor, surface: "event-delivery", operation: "read", resourceId: dlqId
    });
    const incident = await this.store.getEventIncident(scope, dlqId);
    if (!incident) throw propertyApprovalError("property-resource-not-found");
    return {
      ...incident,
      allowedActions: access.allowedActions.filter(
        (action): action is "property.event.replay" => action === "property.event.replay"
      )
    };
  }

  async replayEvent(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dlqId: string,
    command: EventReplayCommand
  ) {
    const result = await this.store.prepareEventReplay({
      scope,
      actorId: actor.sub,
      dlqId,
      command,
      authorize: async (manager) => {
        await this.auth.authorize({
          manager,
          scope,
          actor,
          surface: "event-delivery",
          operation: "replay",
          resourceId: dlqId
        });
      }
    });
    if (!result) throw propertyApprovalError("property-resource-not-found");
    if (result.status === "quarantined") {
      throw propertyApprovalError("property-version-conflict");
    }
    return result;
  }

  async listApprovals(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: ApprovalIncidentListQuery
  ) {
    const access = await this.auth.authorize({
      scope, actor, surface: "approval", operation: "read"
    });
    const page = await this.store.listApprovalIncidents(
      scope, access.assignedResourceIds ?? [], query
    );
    const allowedActions = access.allowedActions.filter(
      (action): action is "property.approval.incident-retry" =>
        action === "property.approval.incident-retry"
    );
    return { ...page, items: page.items.map((item) => ({ ...item, allowedActions })) };
  }

  async approvalDetail(scope: TenantParkScope, actor: JwtPrincipal, requestId: string) {
    const access = await this.auth.authorize({
      scope, actor, surface: "approval", operation: "read", resourceId: requestId
    });
    const incident = await this.store.getApprovalIncident(scope, requestId);
    if (!incident) throw propertyApprovalError("property-resource-not-found");
    return {
      ...incident,
      allowedActions: access.allowedActions.filter(
        (action): action is "property.approval.incident-retry" =>
          action === "property.approval.incident-retry"
      )
    };
  }

  async retryApproval(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    requestId: string,
    command: {
      clientKey: string;
      incidentId: string;
      reason: string;
      expectedExecutionVersion: number;
    }
  ) {
    // The canonical base runtime owns reconciliation, mutation receipt, exact
    // transactional authorization and infra_exhausted -> retry_wait CAS.
    return this.approvalRetry.retry({ scope, actor, requestId, command });
  }
}
