import { Injectable } from "@nestjs/common";
import {
  PROPERTY_BUSINESS_PERMISSIONS as P,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";
import { decodeEligibilitySnapshot } from "../property-approval.authorization";
import { propertyApprovalError } from "../property-approval.error";
import type { PropertyIncidentAuthorizationPort } from "./property-event-runtime.contracts";
import type { PropertyNotificationAuthorizationPort } from "./property-notification.contracts";

type QueryManager = Pick<EntityManager, "query">;
type IncidentInput = Parameters<PropertyIncidentAuthorizationPort["authorize"]>[0];
type IncidentResult = Awaited<ReturnType<PropertyIncidentAuthorizationPort["authorize"]>>;
type NotificationInput = Parameters<PropertyNotificationAuthorizationPort["authorize"]>[0];
type NotificationResult =
  Awaited<ReturnType<PropertyNotificationAuthorizationPort["authorize"]>>;

/**
 * Database-backed authorization for the incident and notification projections.
 *
 * JWT super/wildcard claims are deliberately not consulted: these projections
 * require a current module assignment, current database grants and current
 * resource assignment on every request.
 */
@Injectable()
export class DatabasePropertyRuntimeAuthorizationAdapter
implements PropertyIncidentAuthorizationPort, PropertyNotificationAuthorizationPort {
  constructor(private readonly dataSource: DataSource) {}

  authorize(input: IncidentInput): Promise<IncidentResult>;
  authorize(input: NotificationInput): Promise<NotificationResult>;
  async authorize(
    input: IncidentInput | NotificationInput
  ): Promise<IncidentResult | NotificationResult> {
    if ("surface" in input) return this.authorizeIncident(input);
    return this.authorizeNotification(input);
  }

  private async authorizeIncident(
    input: Parameters<PropertyIncidentAuthorizationPort["authorize"]>[0]
  ): Promise<Awaited<ReturnType<PropertyIncidentAuthorizationPort["authorize"]>>> {
    this.assertActorScope(input.scope, input.actor);
    const mutation = input.operation === "replay" || input.operation === "retry";
    if (mutation && !input.manager) this.deny();
    const run = async (manager: EntityManager) => {
      await this.assertActiveAssetModule(manager, input.scope);
      const grants = await this.permissionCodes(manager, input.scope, input.actor.sub);
      const page = input.surface === "event-delivery"
        ? P.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE
        : P.PROPERTY_APPROVAL_INCIDENTS_PAGE;
      const read = input.surface === "event-delivery"
        ? P.PROPERTY_EVENT_READ_INCIDENT
        : P.PROPERTY_APPROVAL_READ_INCIDENT;
      if (!grants.has(page) || !grants.has(read)) this.deny();
      if (input.surface === "event-delivery") {
        await this.assertEventIncidentScope(
          manager, input.scope, input.actor.sub, input.resourceId
        );
        if (input.operation === "replay" && !grants.has(P.PROPERTY_EVENT_REPLAY)) this.deny();
        return {
          allowedActions: grants.has(P.PROPERTY_EVENT_REPLAY)
            ? ["property.event.replay" as const]
            : []
        };
      }
      const assignedResourceIds = await this.assertApprovalIncidentScope(
        manager, input.scope, input.actor.sub, input.resourceId
      );
      if (input.operation === "retry" && !grants.has(P.PROPERTY_APPROVAL_RETRY)) this.deny();
      return {
        allowedActions: grants.has(P.PROPERTY_APPROVAL_RETRY)
          ? ["property.approval.incident-retry" as const]
          : [],
        assignedResourceIds
      };
    };
    if (input.manager) return run(input.manager);
    return this.dataSource.transaction(run);
  }

  private async authorizeNotification(
    input: Parameters<PropertyNotificationAuthorizationPort["authorize"]>[0]
  ): Promise<Awaited<ReturnType<PropertyNotificationAuthorizationPort["authorize"]>>> {
    this.assertActorScope(input.scope, input.actor);
    if (input.operation === "mark-read" && !input.manager) this.deny();
    const run = async (manager: EntityManager) => {
      await this.assertActiveAssetModule(manager, input.scope);
      const grants = await this.permissionCodes(manager, input.scope, input.actor.sub);
      const action = input.operation === "read"
        ? P.PROPERTY_NOTIFICATION_READ
        : P.PROPERTY_NOTIFICATION_MARK_READ;
      if (!grants.has(P.PROPERTY_NOTIFICATIONS_PAGE) || !grants.has(action)) this.deny();
      await this.assertNotificationRecipientScope(
        manager, input.scope, input.actor.sub, input.notificationId
      );
      return { canMarkRead: grants.has(P.PROPERTY_NOTIFICATION_MARK_READ) };
    };
    if (input.manager) return run(input.manager);
    return this.dataSource.transaction(run);
  }

  private assertActorScope(scope: TenantParkScope, actor: JwtPrincipal): void {
    if (actor.tenantId !== scope.tenantId || actor.parkId !== scope.parkId) this.deny();
  }

  private async assertActiveAssetModule(
    manager: QueryManager,
    scope: TenantParkScope
  ): Promise<void> {
    const rows = await manager.query(
      `SELECT assignment.id
         FROM rel_tenant_module assignment
         JOIN sys_module module ON module.id=assignment.module_id
        WHERE assignment.tenant_id::text=$1 AND assignment.park_id::text=$2
          AND module.module_code='asset' AND module.status=1 AND module.is_deleted=false
          AND assignment.enabled=true AND assignment.status='enabled'
          AND assignment.is_deleted=false
          AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
          AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
        LIMIT 1`,
      [scope.tenantId, scope.parkId]
    ) as unknown[];
    if (rows.length !== 1) this.deny();
  }

  private async permissionCodes(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string
  ): Promise<Set<string>> {
    const rows = await manager.query(
      `SELECT DISTINCT permission.code
         FROM sys_user actor
         JOIN rel_user_role user_role
           ON user_role.user_id=actor.id
          AND user_role.tenant_id=actor.tenant_id
          AND user_role.park_id=actor.park_id
         JOIN sys_role role
           ON role.id=user_role.role_id
          AND role.tenant_id=user_role.tenant_id
         JOIN rel_role_perm role_permission
           ON role_permission.role_id=role.id
          AND role_permission.tenant_id=role.tenant_id
          AND role_permission.park_id=user_role.park_id
         JOIN sys_permission permission
           ON permission.id=role_permission.permission_id
          AND permission.tenant_id=role_permission.tenant_id
        WHERE actor.id::text=$3 AND actor.tenant_id::text=$1 AND actor.park_id::text=$2
          AND actor.is_enabled=true AND actor.status='enabled' AND actor.is_deleted=false
          AND user_role.is_deleted=false
          AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
          AND role_permission.is_deleted=false
          AND permission.is_enabled=true AND permission.status='enabled'
          AND permission.is_deleted=false`,
      [scope.tenantId, scope.parkId, actorId]
    ) as Array<{ code: string }>;
    return new Set(rows.map((row) => row.code));
  }

  private async assertParkAssignment(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string
  ): Promise<void> {
    const rows = await manager.query(
      `SELECT assignment.id
         FROM rel_user_park assignment
        WHERE assignment.tenant_id::text=$1 AND assignment.park_id::text=$2
          AND assignment.user_id::text=$3
          AND assignment.status='enabled' AND assignment.is_deleted=false
        LIMIT 1`,
      [scope.tenantId, scope.parkId, actorId]
    ) as unknown[];
    if (rows.length !== 1) this.deny();
  }

  private async assertEventIncidentScope(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string,
    resourceId?: string
  ): Promise<void> {
    await this.assertParkAssignment(manager, scope, actorId);
    if (!resourceId) return;
    const rows = await manager.query(
      `SELECT id FROM biz_property_event_dlq
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3
        LIMIT 1`,
      [scope.tenantId, scope.parkId, resourceId]
    ) as unknown[];
    if (rows.length !== 1) this.deny();
  }

  private async assertApprovalIncidentScope(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string,
    resourceId?: string
  ): Promise<string[]> {
    await this.assertParkAssignment(manager, scope, actorId);
    const params: unknown[] = [scope.tenantId, scope.parkId];
    const resource = resourceId ? " AND request.id=$3" : "";
    if (resourceId) params.push(resourceId);
    const rows = await manager.query(
      `SELECT request.id::text AS "requestId",
              stage.eligibility_policy_snapshot AS snapshot,
              stage.eligibility_policy_hash AS "snapshotHash"
         FROM biz_property_approval_request request
         JOIN biz_property_approval_stage stage
           ON stage.tenant_id=request.tenant_id
          AND stage.park_id=request.park_id
          AND stage.request_id=request.id
        WHERE request.tenant_id=$1 AND request.park_id=$2
          AND request.execution_status='infra_exhausted'${resource}
        ORDER BY stage.stage_ordinal`,
      params
    ) as Array<{
      requestId: string;
      snapshot: Record<string, unknown>;
      snapshotHash: string;
    }>;
    const assigned = new Set<string>();
    for (const row of rows) {
      try {
        if (decodeEligibilitySnapshot(row.snapshot, row.snapshotHash)
          .incidentActorIds.includes(actorId)) assigned.add(row.requestId);
      } catch {
        // A malformed or hash-mismatched assignment snapshot is never authority.
      }
    }
    if (!assigned.size) this.deny();
    return [...assigned];
  }

  private async assertNotificationRecipientScope(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string,
    notificationId?: string
  ): Promise<void> {
    await this.assertParkAssignment(manager, scope, actorId);
    if (!notificationId) return;
    const rows = await manager.query(
      `SELECT recipient.id
         FROM rel_property_notification_recipient recipient
         JOIN biz_property_notification notification
           ON notification.tenant_id=recipient.tenant_id
          AND notification.park_id=recipient.park_id
          AND notification.id=recipient.notification_id
        WHERE recipient.tenant_id=$1 AND recipient.park_id=$2
          AND recipient.recipient_user_id=$3 AND recipient.notification_id=$4
        LIMIT 1`,
      [scope.tenantId, scope.parkId, actorId, notificationId]
    ) as unknown[];
    if (rows.length !== 1) this.deny();
  }

  private deny(): never {
    throw propertyApprovalError("property-action-forbidden");
  }
}
