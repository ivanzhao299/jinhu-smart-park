import { Injectable } from "@nestjs/common";
import {
  evaluatePropertyTaskEndpointAuthorization,
  type PropertyTaskAccessEvaluator,
  type PropertyTaskEndpointAuthorizationFacts,
  type PropertyTaskSourceAccessDescriptor,
  type TenantParkScope
} from "@jinhu/shared";
interface QueryManager {
  query<T = unknown>(sql: string, parameters?: unknown[]): Promise<T>;
}

interface ManagerPortLike {
  readonly transactionContext: unknown;
}

@Injectable()
export class PropertyTaskAccessEvaluatorService
implements PropertyTaskAccessEvaluator {
  async authorizeTaskRead(
    input: Parameters<PropertyTaskAccessEvaluator["authorizeTaskRead"]>[0]
  ): Promise<boolean> {
    const facts = await this.facts(
      queryManager(input.manager),
      input.scope,
      input.actor.actorId,
      input.descriptor,
      input.sourceId
    );
    return evaluatePropertyTaskEndpointAuthorization(input.endpoint, facts);
  }

  async canReadSourceDetails(
    input: Parameters<PropertyTaskAccessEvaluator["canReadSourceDetails"]>[0]
  ): Promise<boolean> {
    const grants = await this.permissionCodes(
      queryManager(input.manager),
      input.scope,
      input.actor.actorId
    );
    return grants.has(input.descriptor.sourceDetailPermission)
      && await this.activeModules(
        queryManager(input.manager),
        input.scope,
        input.descriptor.requiredModules
      )
      && await this.activePark(
        queryManager(input.manager),
        input.scope,
        input.actor.actorId
      )
      && await this.workspaceScope(
        queryManager(input.manager),
        input.scope,
        input.descriptor,
        input.sourceId
      );
  }

  async authorizeCommand(
    input: Parameters<PropertyTaskAccessEvaluator["authorizeCommand"]>[0]
  ): Promise<boolean> {
    const facts = await this.facts(
      queryManager(input.manager),
      input.scope,
      input.actor.actorId,
      input.descriptor,
      input.sourceId,
      input.relation
    );
    return input.sourceLifecycle === "eligible"
      && evaluatePropertyTaskEndpointAuthorization(input.endpoint, facts);
  }

  private async facts(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string,
    descriptor: PropertyTaskSourceAccessDescriptor,
    sourceId: string,
    relation: "unassigned" | "current-assignee" | "queue-supervisor" = "unassigned"
  ): Promise<PropertyTaskEndpointAuthorizationFacts> {
    const grants = await this.permissionCodes(manager, scope, actorId);
    const requiredModules = descriptor.requiredModules;
    const pagePermission = descriptor.tag === "workspace"
      ? descriptor.pagePermission
      : descriptor.requiredPermission;
    const currentUserPark = await this.activePark(manager, scope, actorId);
    const workspaceScope = descriptor.tag === "internal-rebuild"
      ? currentUserPark
      : await this.workspaceScope(manager, scope, descriptor, sourceId);
    return {
      activeModules: await this.activeModules(manager, scope, requiredModules),
      currentUserPark,
      taskRead: descriptor.tag === "internal-rebuild"
        ? grants.has(descriptor.requiredPermission)
        : grants.has("property_task:read") && grants.has(pagePermission),
      sourceScope: workspaceScope,
      queueScope: workspaceScope,
      currentAssignee: relation === "current-assignee",
      queueSupervisor: grants.has("property_task:supervise") && workspaceScope,
      grantedPermissions: grants
    };
  }

  private async workspaceScope(
    manager: QueryManager,
    scope: TenantParkScope,
    descriptor: Extract<PropertyTaskSourceAccessDescriptor, { tag: "workspace" }>,
    sourceId: string
  ): Promise<boolean> {
    const rows = await manager.query(
      `SELECT 1
         FROM biz_property_task_projection projection
        WHERE projection.tenant_id=$1 AND projection.park_id=$2
          AND projection.source_type=$3 AND projection.source_id=$4
          AND projection.queue_code=$5
        LIMIT 1`,
      [
        scope.tenantId,
        scope.parkId,
        descriptor.sourceType,
        sourceId,
        descriptor.queueCode
      ]
    ) as unknown[];
    return rows.length === 1;
  }

  private async permissionCodes(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string
  ): Promise<Set<string>> {
    const rows = await manager.query(
      `SELECT DISTINCT permission.code
         FROM sys_user actor
         JOIN rel_user_role user_role ON user_role.user_id=actor.id
          AND user_role.tenant_id=actor.tenant_id AND user_role.park_id=actor.park_id
         JOIN sys_role role ON role.id=user_role.role_id
          AND role.tenant_id=user_role.tenant_id
         JOIN rel_role_perm role_permission ON role_permission.role_id=role.id
          AND role_permission.tenant_id=role.tenant_id
          AND role_permission.park_id=user_role.park_id
         JOIN sys_permission permission ON permission.id=role_permission.permission_id
          AND permission.tenant_id=role_permission.tenant_id
        WHERE actor.id::text=$3 AND actor.tenant_id::text=$1 AND actor.park_id::text=$2
          AND actor.is_enabled=true AND actor.status='enabled' AND actor.is_deleted=false
          AND user_role.is_deleted=false AND role.is_enabled=true
          AND role.status='enabled' AND role.is_deleted=false
          AND role_permission.is_deleted=false AND permission.is_enabled=true
          AND permission.status='enabled' AND permission.is_deleted=false`,
      [scope.tenantId, scope.parkId, actorId]
    ) as Array<{ code: string }>;
    return new Set(rows.map((row) => row.code));
  }

  private async activePark(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string
  ): Promise<boolean> {
    const rows = await manager.query(
      `SELECT 1 FROM rel_user_park assignment
        WHERE assignment.tenant_id::text=$1 AND assignment.park_id::text=$2
          AND assignment.user_id::text=$3 AND assignment.status='enabled'
          AND assignment.is_deleted=false LIMIT 1`,
      [scope.tenantId, scope.parkId, actorId]
    ) as unknown[];
    return rows.length === 1;
  }

  private async activeModules(
    manager: QueryManager,
    scope: TenantParkScope,
    requiredModules: readonly string[]
  ): Promise<boolean> {
    if (requiredModules.length === 0) return true;
    const rows = await manager.query(
      `SELECT DISTINCT module.module_code AS code
         FROM rel_tenant_module assignment
         JOIN sys_module module ON module.id=assignment.module_id
        WHERE assignment.tenant_id::text=$1 AND assignment.park_id::text=$2
          AND module.module_code=ANY($3::text[]) AND module.status=1
          AND module.is_deleted=false AND assignment.enabled=true
          AND assignment.status='enabled' AND assignment.is_deleted=false
          AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
          AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())`,
      [scope.tenantId, scope.parkId, [...requiredModules]]
    ) as Array<{ code: string }>;
    return new Set(rows.map((row) => row.code)).size === requiredModules.length;
  }
}

function queryManager(port: ManagerPortLike): QueryManager {
  const transaction = port.transactionContext;
  if (hasQuery(transaction)) return transaction;
  // Test-fixture ports may expose query directly while retaining the ABI field.
  if (hasQuery(port)) return port;
  throw new Error("property-task-manager-port-unavailable");
}

function hasQuery(value: unknown): value is QueryManager {
  return typeof value === "object" && value !== null
    && "query" in value && typeof value.query === "function";
}
