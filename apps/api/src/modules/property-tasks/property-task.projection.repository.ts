import { Injectable } from "@nestjs/common";
import type {
  PropertyTaskAssignmentAuthority,
  PropertyTaskStatus,
  TenantParkScope
} from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { PropertyTaskListQueryDto } from "./dto/property-task.dto";

export interface PropertyTaskProjectionRow {
  taskId: string;
  taskKey: string;
  assignmentAuthority: PropertyTaskAssignmentAuthority;
  derivedAssignmentId: string | null;
  sourceType: string;
  sourceId: string;
  sourceVersion: number;
  businessOccurrenceKey: string;
  taskKind: string;
  queueCode: string;
  title: string;
  kindLabel: string;
  sourceLabel: string;
  priority: number;
  dueAt: Date | string | null;
  assignmentStatus: PropertyTaskStatus;
  assignmentVersion: number;
  assigneeId: string | null;
  assigneeDisplay: string | null;
  claimedAt: Date | string | null;
  startedAt: Date | string | null;
  blockedReason: string | null;
  blockedUntil: Date | string | null;
  outcomeCode: string | null;
  outcomeSourceVersion: number | null;
  outcomeAt: Date | string | null;
  sourceDeepLink: string | null;
  projectionVersion: number;
  contentHash: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PropertyTaskProjectionWriteRow {
  taskId: string;
  taskKey: string;
  assignmentAuthority: PropertyTaskAssignmentAuthority;
  derivedAssignmentId: string | null;
  sourceType: string;
  sourceId: string;
  sourceVersion: number;
  businessOccurrenceKey: string;
  taskKind: string;
  queueCode: string;
  title: string;
  kindLabel: string;
  sourceLabel: string;
  priority: number;
  dueAt: string | null;
  assignmentStatus: PropertyTaskStatus;
  assignmentVersion: number;
  assigneeId: string | null;
  assigneeDisplay: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  blockedReason: string | null;
  blockedUntil: string | null;
  outcomeCode: string | null;
  outcomeSourceVersion: number | null;
  outcomeAt: string | null;
  sourceDeepLink: string | null;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyTaskProjectionReplacementResult {
  previousProjectionVersion: number;
  projectionVersion: number;
  projectedTaskCount: number;
}

@Injectable()
export class PropertyTaskProjectionRepository {
  async findCandidates(
    manager: EntityManager,
    scope: TenantParkScope,
    query: PropertyTaskListQueryDto
  ): Promise<PropertyTaskProjectionRow[]> {
    const parameters: unknown[] = [scope.tenantId, scope.parkId];
    const predicates = ["projection.tenant_id=$1", "projection.park_id=$2"];
    addPredicate(predicates, parameters, "projection.assignment_status", query.assignmentStatus);
    addPredicate(predicates, parameters, "projection.task_kind", query.taskKind);
    addPredicate(predicates, parameters, "projection.assignee_id", query.assigneeId);
    addPredicate(predicates, parameters, "projection.source_type", query.sourceType);
    const order = query.sort === "createdAt"
      ? "projection.created_at DESC, projection.task_id DESC"
      : "projection.updated_at DESC, projection.task_id DESC";
    return manager.query(
      `${projectionSelect()}
        WHERE ${predicates.join(" AND ")}
        ORDER BY ${order}`,
      parameters
    ) as Promise<PropertyTaskProjectionRow[]>;
  }

  async findByTaskId(
    manager: EntityManager,
    scope: TenantParkScope,
    taskId: string,
    lock = false
  ): Promise<PropertyTaskProjectionRow | null> {
    const rows = await manager.query(
      `${projectionSelect()}
        WHERE projection.tenant_id=$1 AND projection.park_id=$2
          AND projection.task_id=$3
        ${lock ? "FOR UPDATE OF projection" : ""}`,
      [scope.tenantId, scope.parkId, taskId]
    ) as PropertyTaskProjectionRow[];
    return rows[0] ?? null;
  }

  async findByTaskKey(
    manager: EntityManager,
    scope: TenantParkScope,
    taskKey: string
  ): Promise<PropertyTaskProjectionRow | null> {
    const rows = await manager.query(
      `${projectionSelect()}
        WHERE projection.tenant_id=$1 AND projection.park_id=$2
          AND projection.task_key=$3`,
      [scope.tenantId, scope.parkId, taskKey]
    ) as PropertyTaskProjectionRow[];
    if (rows.length > 1) throw new Error("property-task-key-projection-cardinality");
    return rows[0] ?? null;
  }

  async findBySource(
    manager: EntityManager,
    scope: TenantParkScope,
    sourceType: string,
    sourceId: string
  ): Promise<PropertyTaskProjectionRow[]> {
    return manager.query(
      `${projectionSelect()}
        WHERE projection.tenant_id=$1 AND projection.park_id=$2
          AND projection.source_type=$3 AND projection.source_id=$4
        ORDER BY projection.task_id`,
      [scope.tenantId, scope.parkId, sourceType, sourceId]
    ) as Promise<PropertyTaskProjectionRow[]>;
  }

  async currentHeadVersion(
    manager: EntityManager,
    scope: TenantParkScope,
    sourceType: string,
    sourceId: string
  ): Promise<number> {
    const rows = await manager.query(
      `SELECT projection_version::integer AS "projectionVersion"
         FROM biz_property_task_projection_head
        WHERE tenant_id=$1 AND park_id=$2 AND source_type=$3 AND source_id=$4`,
      [scope.tenantId, scope.parkId, sourceType, sourceId]
    ) as Array<{ projectionVersion: number }>;
    return rows[0]?.projectionVersion ?? 0;
  }

  async lockSourceProjection(
    manager: EntityManager,
    scope: TenantParkScope,
    sourceType: string,
    sourceId: string,
    allowMissingHead = false
  ): Promise<{ projectionVersion: number; rows: readonly PropertyTaskProjectionRow[] }> {
    const heads = await manager.query(
      `SELECT projection_version::integer AS "projectionVersion"
         FROM biz_property_task_projection_head
        WHERE tenant_id=$1 AND park_id=$2 AND source_type=$3 AND source_id=$4
        FOR UPDATE`,
      [scope.tenantId, scope.parkId, sourceType, sourceId]
    ) as Array<{ projectionVersion: number }>;
    if (heads.length > 1 || (heads.length === 0 && !allowMissingHead)) {
      throw new Error("property-task-projection-head-unavailable");
    }
    const rows = await manager.query(
      `${projectionSelect()}
        WHERE projection.tenant_id=$1 AND projection.park_id=$2
          AND projection.source_type=$3 AND projection.source_id=$4
        ORDER BY projection.task_id
        FOR UPDATE OF projection`,
      [scope.tenantId, scope.parkId, sourceType, sourceId]
    ) as PropertyTaskProjectionRow[];
    return { projectionVersion: heads[0]?.projectionVersion ?? 0, rows };
  }

  async withDatabaseContentHashes(
    manager: EntityManager,
    rows: readonly Omit<PropertyTaskProjectionWriteRow, "contentHash">[]
  ): Promise<PropertyTaskProjectionWriteRow[]> {
    const result: PropertyTaskProjectionWriteRow[] = [];
    for (const row of rows) {
      const values = await manager.query(
        `SELECT public.fn_property_task_projection_row_hash_v1($1::jsonb)::text AS hash`,
        [JSON.stringify({ ...row, contentHash: "0".repeat(64) })]
      ) as Array<{ hash: string }>;
      result.push({ ...row, contentHash: values[0]!.hash });
    }
    return result.sort((left, right) => left.taskId.localeCompare(right.taskId));
  }

  async replace(
    manager: EntityManager,
    input: {
      scope: TenantParkScope;
      sourceType: string;
      sourceId: string;
      actorId: string;
      receiptId: string;
      replaceMode: "manual-rebuild" | "authority-sync";
      commandAction: string;
      resultVersion: number;
      expectedProjectionVersion: number;
      requestHash: string;
      resultRef: string;
      resultHash: string;
      reason: string;
      rows: readonly PropertyTaskProjectionWriteRow[];
    }
  ): Promise<PropertyTaskProjectionReplacementResult> {
    const rows = await manager.query(
      `SELECT previous_projection_version::integer AS "previousProjectionVersion",
              projection_version::integer AS "projectionVersion",
              projected_task_count::integer AS "projectedTaskCount"
         FROM public.fn_property_task_projection_replace_v1(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
      [
        input.scope.tenantId, input.scope.parkId, input.sourceType, input.sourceId,
        input.actorId, input.receiptId, input.replaceMode, input.commandAction,
        input.resultVersion, input.expectedProjectionVersion, input.requestHash,
        input.resultRef, input.resultHash, input.reason, JSON.stringify(input.rows)
      ]
    ) as PropertyTaskProjectionReplacementResult[];
    if (rows.length !== 1) throw new Error("property-task-projection-replace-cardinality");
    return rows[0]!;
  }
}

function addPredicate(
  predicates: string[],
  parameters: unknown[],
  column: string,
  value: unknown
): void {
  if (value === undefined) return;
  parameters.push(value);
  predicates.push(`${column}=$${parameters.length}`);
}

function projectionSelect(): string {
  return `SELECT projection.task_id::text AS "taskId",
      projection.task_key::text AS "taskKey",
      projection.assignment_authority AS "assignmentAuthority",
      projection.derived_assignment_id::text AS "derivedAssignmentId",
      projection.source_type AS "sourceType", projection.source_id::text AS "sourceId",
      projection.source_version::integer AS "sourceVersion",
      projection.business_occurrence_key AS "businessOccurrenceKey",
      projection.task_kind AS "taskKind", projection.queue_code AS "queueCode",
      projection.title, projection.kind_label AS "kindLabel",
      projection.source_label AS "sourceLabel", projection.priority::integer AS priority,
      projection.due_at AS "dueAt", projection.assignment_status AS "assignmentStatus",
      projection.assignment_version::integer AS "assignmentVersion",
      projection.assignee_id::text AS "assigneeId",
      projection.assignee_display AS "assigneeDisplay", projection.claimed_at AS "claimedAt",
      projection.started_at AS "startedAt", projection.blocked_reason AS "blockedReason",
      projection.blocked_until AS "blockedUntil", projection.outcome_code AS "outcomeCode",
      projection.outcome_source_version::integer AS "outcomeSourceVersion",
      projection.outcome_at AS "outcomeAt", projection.source_deep_link AS "sourceDeepLink",
      projection.projection_version::integer AS "projectionVersion",
      projection.content_hash::text AS "contentHash", projection.created_at AS "createdAt",
      projection.updated_at AS "updatedAt"
    FROM biz_property_task_projection projection`;
}
