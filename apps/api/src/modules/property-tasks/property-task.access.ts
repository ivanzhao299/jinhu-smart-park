import { Injectable } from "@nestjs/common";
import {
  evaluatePropertyTaskEndpointAuthorization,
  SYSTEM_PERMISSIONS,
  type PropertyTaskAccessEvaluator,
  type PropertyTaskEndpointAuthorizationFacts,
  type PropertyTaskSourceAccessDescriptor,
  type TenantParkScope
} from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
interface QueryManager {
  query<T = unknown>(sql: string, parameters?: unknown[]): Promise<T>;
}

interface ManagerPortLike {
  readonly transactionContext: unknown;
}

interface HousingRepairActorScope {
  readonly actor: JwtPrincipal;
  readonly allowedUnitIds: readonly string[] | null;
  readonly handler: DataScopeFilter;
  readonly canManageAllWorkOrders: boolean;
}

@Injectable()
export class PropertyTaskAccessEvaluatorService
implements PropertyTaskAccessEvaluator {
  private readonly housingRepairActorScopeCache = new WeakMap<
    QueryManager,
    Map<string, Promise<HousingRepairActorScope>>
  >();
  private readonly housingRepairSourceScopeCache = new WeakMap<
    QueryManager,
    Map<string, Promise<boolean>>
  >();
  private readonly homestayTurnoverSourceScopeCache = new WeakMap<
    QueryManager,
    Map<string, Promise<boolean>>
  >();

  constructor(
    private readonly dataScopeService?: DataScopeService,
    private readonly unitAccessService?: PropertyUnitAccessService
  ) {}

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
        input.actor.actorId,
        grants,
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
      : await this.workspaceScope(manager, scope, actorId, grants, descriptor, sourceId);
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
    actorId: string,
    grants: ReadonlySet<string>,
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
    if (rows.length !== 1) return false;
    if (descriptor.sourceType === "housing_repair") {
      return await this.cachedHousingRepairScope(manager, scope, actorId, grants, sourceId);
    }
    if (descriptor.sourceType === "homestay_turnover") {
      return await this.cachedHomestayTurnoverScope(manager, scope, actorId, grants, sourceId);
    }
    return true;
  }

  private cachedHomestayTurnoverScope(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string,
    grants: ReadonlySet<string>,
    sourceId: string
  ): Promise<boolean> {
    const cache = this.mapForManager(this.homestayTurnoverSourceScopeCache, manager);
    const key = `${scope.tenantId}:${scope.parkId}:${actorId}:${sourceId}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const value = this.homestayTurnoverScope(manager, scope, actorId, grants, sourceId);
    cache.set(key, value);
    return value;
  }

  private async homestayTurnoverScope(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string,
    grants: ReadonlySet<string>,
    sourceId: string
  ): Promise<boolean> {
    if (grants.has("*")) return true;
    if (!this.dataScopeService || !this.unitAccessService) return false;
    const rows = await manager.query(
      `SELECT turnover.assignee_id::text AS "assigneeId",
              turnover.unit_id::text AS "unitId"
         FROM biz_homestay_turnover_task turnover
        WHERE turnover.tenant_id=$1 AND turnover.park_id=$2
          AND turnover.id=$3::uuid AND turnover.is_deleted=false
        LIMIT 1`,
      [scope.tenantId, scope.parkId, sourceId]
    ) as Array<{ assigneeId: string | null; unitId: string }>;
    const row = rows[0];
    if (!row) return false;
    const actorScope = await this.cachedHousingRepairActorScope(
      manager, scope, actorId, grants
    );
    if (actorScope.allowedUnitIds !== null && !actorScope.allowedUnitIds.includes(row.unitId)) {
      return false;
    }
    if (row.assigneeId === null) return true;
    if (
      grants.has(SYSTEM_PERMISSIONS.PROPERTY_TASK_SUPERVISE)
      || actorScope.handler.unrestricted
    ) {
      return true;
    }
    return actorScope.handler.allowed_ids.includes(row.assigneeId);
  }

  private cachedHousingRepairScope(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string,
    grants: ReadonlySet<string>,
    sourceId: string
  ): Promise<boolean> {
    const cache = this.mapForManager(this.housingRepairSourceScopeCache, manager);
    const key = `${scope.tenantId}:${scope.parkId}:${actorId}:${sourceId}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const value = this.housingRepairScope(manager, scope, actorId, grants, sourceId);
    cache.set(key, value);
    return value;
  }

  private async housingRepairScope(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string,
    grants: ReadonlySet<string>,
    sourceId: string
  ): Promise<boolean> {
    if (grants.has("*")) return true;
    if (!this.dataScopeService || !this.unitAccessService) return false;
    const rows = await manager.query(
      `SELECT work_order.assignee_id::text AS "assigneeId",
              work_order.reporter_id::text AS "reporterId",
              work_order.create_by::text AS "createBy",
              lease.unit_id::text AS "unitId"
         FROM biz_work_order work_order
         JOIN biz_housing_lease lease ON lease.id::text=work_order.source_id
          AND lease.tenant_id=work_order.tenant_id
          AND lease.park_id=work_order.park_id
          AND lease.is_deleted=false
        WHERE work_order.tenant_id=$1 AND work_order.park_id=$2
          AND work_order.id=$3::uuid AND work_order.is_deleted=false
          AND work_order.source_type='tenant_request'
        LIMIT 1`,
      [scope.tenantId, scope.parkId, sourceId]
    ) as Array<{
      assigneeId: string | null;
      reporterId: string | null;
      createBy: string | null;
      unitId: string;
    }>;
    const row = rows[0];
    if (!row) return false;
    const actorScope = await this.cachedHousingRepairActorScope(manager, scope, actorId, grants);
    if (actorScope.allowedUnitIds !== null && !actorScope.allowedUnitIds.includes(row.unitId)) {
      return false;
    }
    const involvedIds = [row.assigneeId, row.reporterId, row.createBy].filter(
      (id): id is string => Boolean(id)
    );
    if (!actorScope.handler.unrestricted) {
      if (actorScope.handler.allowed_ids.length === 0) {
        if (
          actorScope.handler.scope_types.includes("custom")
          || actorScope.handler.scope_types.includes("self")
        ) {
          return false;
        }
      } else if (!actorScope.handler.allowed_ids.some((id) => involvedIds.includes(id))) {
        return false;
      }
    }
    return actorScope.canManageAllWorkOrders || involvedIds.includes(actorId);
  }

  private cachedHousingRepairActorScope(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string,
    grants: ReadonlySet<string>
  ): Promise<HousingRepairActorScope> {
    const cache = this.mapForManager(this.housingRepairActorScopeCache, manager);
    const key = `${scope.tenantId}:${scope.parkId}:${actorId}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const value = this.housingRepairActorScope(manager, scope, actorId, grants);
    cache.set(key, value);
    return value;
  }

  private async housingRepairActorScope(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string,
    grants: ReadonlySet<string>
  ): Promise<HousingRepairActorScope> {
    if (!this.dataScopeService || !this.unitAccessService) {
      throw new Error("Housing repair task access dependencies are unavailable");
    }
    const actor = await this.propertyTaskPrincipal(manager, scope, actorId, grants);
    const [allowedUnitIds, handler] = await Promise.all([
      this.unitAccessService.allowedUnitIds(scope, actor),
      this.dataScopeService.buildScopeFilter(actor, "workorder_handler")
    ]);
    return {
      actor,
      allowedUnitIds,
      handler,
      canManageAllWorkOrders: grants.has(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)
    };
  }

  private async propertyTaskPrincipal(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string,
    grants: ReadonlySet<string>
  ): Promise<JwtPrincipal> {
    const rows = await manager.query(
      `SELECT role.code AS code, role.is_super AS "isSuper", role.data_scope AS "dataScope"
         FROM sys_user actor
         JOIN rel_user_role user_role ON user_role.user_id=actor.id
          AND user_role.tenant_id=actor.tenant_id AND user_role.park_id=actor.park_id
          AND user_role.is_deleted=false
         JOIN sys_role role ON role.id=user_role.role_id
          AND role.tenant_id=user_role.tenant_id
          AND (role.role_scope='tenant' OR role.park_id=user_role.park_id)
        WHERE actor.id::text=$3 AND actor.tenant_id::text=$1 AND actor.park_id::text=$2
          AND actor.is_enabled=true AND actor.status='enabled' AND actor.is_deleted=false
          AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
        ORDER BY user_role.create_time ASC`,
      [scope.tenantId, scope.parkId, actorId]
    ) as Array<{ code: string; isSuper: boolean; dataScope: string }>;
    const isSuper = rows.some((row) => row.isSuper) || grants.has("*");
    return {
      sub: actorId,
      username: "property-task-runtime",
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      roles: rows.map((row) => row.code),
      permissions: [...grants],
      dataScope: isSuper ? "all" : resolvePropertyTaskDataScope(rows.map((row) => row.dataScope)),
      isSuper
    };
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
          AND (role.role_scope='tenant' OR role.park_id=user_role.park_id)
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

  private mapForManager<T>(
    cache: WeakMap<QueryManager, Map<string, Promise<T>>>,
    manager: QueryManager
  ): Map<string, Promise<T>> {
    let scoped = cache.get(manager);
    if (!scoped) {
      scoped = new Map<string, Promise<T>>();
      cache.set(manager, scoped);
    }
    return scoped;
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

function resolvePropertyTaskDataScope(scopes: readonly string[]): string {
  const normalize = (scope: string): string =>
    ({
      "10": "self",
      "20": "org",
      "30": "org_and_children",
      "40": "park",
      "50": "tenant",
      "60": "custom"
    })[scope] ?? scope;
  const rank: Record<string, number> = {
    self: 1,
    org: 2,
    org_and_children: 3,
    park: 4,
    tenant: 5,
    custom: 6,
    all: 7
  };
  return scopes
    .map(normalize)
    .reduce((current, scope) => ((rank[scope] ?? 0) > (rank[current] ?? 0) ? scope : current), "self");
}
