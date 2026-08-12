import { Injectable } from "@nestjs/common";
import {
  PROPERTY_TASK_ACTIONS,
  PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST,
  type PropertyTaskAction,
  type PropertyTaskDetailResponse,
  type PropertyTaskEndpointContract,
  type PropertyTaskListResponse,
  type PropertyTaskSourceSnapshot,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type {
  PropertyTaskBlockDto,
  PropertyTaskListQueryDto,
  PropertyTaskMutationDto,
  PropertyTaskRebuildDto,
  PropertyTaskReleaseDto
} from "./dto/property-task.dto";
import { PropertyTaskAccessEvaluatorService } from "./property-task.access";
import { propertyTaskError } from "./property-task.error";
import { PropertyTaskMapper } from "./property-task.mapper";
import { toPropertyTaskManagerPort } from "./property-task.manager-port";
import { PropertyTaskOrchestrator } from "./property-task.orchestrator";
import {
  PropertyTaskProjectionRepository,
  type PropertyTaskProjectionRow
} from "./property-task.projection.repository";
import { PropertyTaskSourceRegistryProvider } from "./property-task.registry";

@Injectable()
export class PropertyTaskService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly projections: PropertyTaskProjectionRepository,
    private readonly registry: PropertyTaskSourceRegistryProvider,
    private readonly access: PropertyTaskAccessEvaluatorService,
    private readonly mapper: PropertyTaskMapper,
    private readonly orchestrator: PropertyTaskOrchestrator
  ) {}

  async list(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: PropertyTaskListQueryDto
  ): Promise<PropertyTaskListResponse> {
    return this.dataSource.transaction("REPEATABLE READ", async (manager) => {
      const candidates = await this.projections.findCandidates(manager, scope, query);
      const visible: Array<{ row: PropertyTaskProjectionRow; details: boolean;
        actions: readonly PropertyTaskAction[] }> = [];
      for (const row of candidates) {
        const context = await this.readContext(manager, scope, actor, row);
        if (context !== null) visible.push({ row, ...context });
      }
      const start = (query.page - 1) * query.pageSize;
      return {
        items: visible.slice(start, start + query.pageSize).map((item) =>
          this.mapper.toListItem(item.row, item.actions, item.details)
        ),
        page: query.page,
        pageSize: query.pageSize,
        total: visible.length
      };
    });
  }

  async detail(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    taskId: string
  ): Promise<PropertyTaskDetailResponse> {
    return this.dataSource.transaction("REPEATABLE READ", async (manager) => {
      const row = await this.projections.findByTaskId(manager, scope, taskId);
      if (!row) throw propertyTaskError("property-resource-not-found");
      const context = await this.readContext(manager, scope, actor, row);
      if (context === null) throw propertyTaskError("property-resource-not-found");
      return this.mapper.toDetail(row, context.actions, context.details);
    });
  }

  claim(scope: TenantParkScope, actor: JwtPrincipal, taskId: string,
    request: PropertyTaskMutationDto) {
    return this.orchestrator.command(
      scope, actor, taskId, "property.task.claim", request
    );
  }

  start(scope: TenantParkScope, actor: JwtPrincipal, taskId: string,
    request: PropertyTaskMutationDto) {
    return this.orchestrator.command(
      scope, actor, taskId, "property.task.start", request
    );
  }

  block(scope: TenantParkScope, actor: JwtPrincipal, taskId: string,
    request: PropertyTaskBlockDto) {
    return this.orchestrator.command(
      scope, actor, taskId, "property.task.block", request
    );
  }

  unblock(scope: TenantParkScope, actor: JwtPrincipal, taskId: string,
    request: PropertyTaskMutationDto) {
    return this.orchestrator.command(
      scope, actor, taskId, "property.task.unblock", request
    );
  }

  release(scope: TenantParkScope, actor: JwtPrincipal, taskId: string,
    request: PropertyTaskReleaseDto) {
    return this.orchestrator.command(
      scope, actor, taskId, "property.task.release", request
    );
  }

  rebuild(scope: TenantParkScope, actor: JwtPrincipal,
    request: PropertyTaskRebuildDto) {
    return this.orchestrator.rebuild(scope, actor, request);
  }

  private async readContext(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    row: PropertyTaskProjectionRow
  ): Promise<{ details: boolean; actions: readonly PropertyTaskAction[] } | null> {
    const resolver = this.registry.resolve(row.sourceType, row.taskKind);
    if (!resolver || resolver.access.tag !== "workspace") return null;
    const managerPort = toPropertyTaskManagerPort(manager);
    const endpoint = endpointContract("property.task.read");
    const permitted = await this.access.authorizeTaskRead({
      manager: managerPort,
      scope,
      actor: { actorId: actor.sub },
      endpoint,
      descriptor: resolver.access,
      sourceId: row.sourceId
    });
    if (!permitted) return null;
    const snapshot = await resolver.lockAndResolve({
      manager: managerPort,
      scope,
      sourceId: row.sourceId,
      businessOccurrenceKey: row.businessOccurrenceKey,
      expectedSourceVersion: row.sourceVersion,
      taskKey: row.taskKey
    });
    if (!snapshot) return null;
    const details = await this.access.canReadSourceDetails({
      manager: managerPort,
      scope,
      actor: { actorId: actor.sub },
      descriptor: resolver.access,
      sourceId: row.sourceId
    });
    return {
      details,
      actions: await this.allowedActions(
        managerPort, scope, actor, row, snapshot, resolver.access
      )
    };
  }

  private async allowedActions(
    manager: ReturnType<typeof toPropertyTaskManagerPort>,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    row: PropertyTaskProjectionRow,
    snapshot: PropertyTaskSourceSnapshot,
    descriptor: Extract<
      Parameters<PropertyTaskAccessEvaluatorService["canReadSourceDetails"]>[0]["descriptor"],
      { tag: "workspace" }
    >
  ): Promise<readonly PropertyTaskAction[]> {
    const relation = row.assigneeId === actor.sub
      ? "current-assignee" as const
      : "unassigned" as const;
    const candidates = transitionActions(
      row.assignmentStatus,
      relation,
      row.assigneeId === null
    );
    const allowed: PropertyTaskAction[] = [];
    for (const action of candidates) {
      if (await this.access.authorizeCommand({
        manager,
        scope,
        actor: { actorId: actor.sub },
        endpoint: endpointContract(action),
        descriptor,
        sourceId: row.sourceId,
        action,
        relation,
        sourceLifecycle: snapshot.lifecycle
      })) allowed.push(action);
    }
    return PROPERTY_TASK_ACTIONS.filter((action) => allowed.includes(action));
  }
}

function transitionActions(
  status: PropertyTaskProjectionRow["assignmentStatus"],
  relation: "unassigned" | "current-assignee",
  unassigned: boolean
): PropertyTaskAction[] {
  if (status === "open") return unassigned ? ["property.task.claim"] : [];
  if (status === "claimed") return relation === "current-assignee"
    ? ["property.task.start", "property.task.release"]
    : ["property.task.release"];
  if (status === "in_progress") return relation === "current-assignee"
    ? ["property.task.block", "property.task.release"]
    : ["property.task.release"];
  if (status === "blocked") return ["property.task.unblock", "property.task.release"];
  return [];
}

function endpointContract(actionId: string): PropertyTaskEndpointContract {
  const endpoint = PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.find(
    (candidate) => candidate.actionId === actionId
  );
  if (!endpoint) throw propertyTaskError("property-runtime-unavailable");
  return {
    requiredPermissions: endpoint.requiredPermissions,
    anyOfPermissions: endpoint.anyOfPermissions,
    authorizationAlternatives: endpoint.authorizationAlternatives
  };
}
