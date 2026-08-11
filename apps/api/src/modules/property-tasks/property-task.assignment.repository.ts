import { Injectable } from "@nestjs/common";
import type {
  PropertyTaskAction,
  PropertyTaskStatus,
  PropertyTaskSourceTerminal,
  TenantParkScope
} from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { propertyTaskError } from "./property-task.error";

export interface PropertyTaskAssignmentRow {
  id: string;
  taskKey: string;
  taskKind: string;
  sourceType: string;
  sourceId: string;
  sourceVersionAtGeneration: number;
  assignmentStatus: PropertyTaskStatus;
  assigneeId: string | null;
  assigneeDisplay: string | null;
  claimEpoch: number;
  claimToken: string | null;
  version: number;
  claimedAt: Date | string | null;
  startedAt: Date | string | null;
  blockedReason: string | null;
  blockedUntil: Date | string | null;
  outcomeCode: string | null;
  outcomeSourceVersion: number | null;
  outcomeAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

@Injectable()
export class PropertyTaskAssignmentRepository {
  async ensureOpenAssignments(
    manager: EntityManager,
    scope: TenantParkScope,
    candidates: ReadonlyArray<{
      taskKey: string;
      taskKind: string;
      sourceType: string;
      sourceId: string;
      sourceVersion: number;
    }>
  ): Promise<void> {
    if (candidates.length === 0) return;
    await manager.query(
      `INSERT INTO biz_property_task_assignment(
         tenant_id,park_id,task_key,task_key_version,task_kind,source_type,
         source_id,source_version_at_generation,assignment_status
       )
       SELECT $1,$2,candidate.task_key,1,candidate.task_kind,candidate.source_type,
              candidate.source_id,candidate.source_version,'open'
         FROM jsonb_to_recordset($3::jsonb) AS candidate(
           task_key text,task_kind text,source_type text,source_id uuid,source_version integer
         )
        WHERE NOT EXISTS (
          SELECT 1 FROM biz_property_task_assignment existing
           WHERE existing.tenant_id=$1 AND existing.park_id=$2
             AND existing.task_key=candidate.task_key AND existing.is_deleted=false
             AND existing.assignment_status IN ('open','claimed','in_progress','blocked')
        )
       ON CONFLICT DO NOTHING`,
      [scope.tenantId, scope.parkId, JSON.stringify(candidates.map((candidate) => ({
        task_key: candidate.taskKey,
        task_kind: candidate.taskKind,
        source_type: candidate.sourceType,
        source_id: candidate.sourceId,
        source_version: candidate.sourceVersion
      })))]
    );
  }

  async lockById(
    manager: EntityManager,
    scope: TenantParkScope,
    assignmentId: string
  ): Promise<PropertyTaskAssignmentRow | null> {
    return this.lock(manager, scope, "assignment.id=$3", assignmentId);
  }

  async lockByTaskKey(
    manager: EntityManager,
    scope: TenantParkScope,
    taskKey: string
  ): Promise<PropertyTaskAssignmentRow | null> {
    return this.lock(manager, scope, "assignment.task_key=$3", taskKey);
  }

  async lockByTaskKeys(
    manager: EntityManager,
    scope: TenantParkScope,
    taskKeys: readonly string[]
  ): Promise<PropertyTaskAssignmentRow[]> {
    if (taskKeys.length === 0) return [];
    return manager.query(
      `SELECT ${assignmentSelect()}
         FROM biz_property_task_assignment assignment
         LEFT JOIN sys_user assignee ON assignee.id=assignment.assignee_id
          AND assignee.tenant_id::text=assignment.tenant_id
          AND assignee.park_id::text=assignment.park_id
        WHERE assignment.tenant_id=$1 AND assignment.park_id=$2
          AND assignment.task_key=ANY($3::text[]) AND assignment.is_deleted=false
        ORDER BY assignment.id
        FOR UPDATE OF assignment`,
      [scope.tenantId, scope.parkId, [...taskKeys]]
    ) as Promise<PropertyTaskAssignmentRow[]>;
  }

  async transition(
    manager: EntityManager,
    input: {
      scope: TenantParkScope;
      assignment: PropertyTaskAssignmentRow;
      actorId: string;
      action: PropertyTaskAction;
      requestHash: string;
      reason?: string;
      blockedUntil?: string | null;
    }
  ): Promise<PropertyTaskAssignmentRow> {
    const next = commandTransition(input.assignment, input.actorId, input.action);
    const mutation = await manager.query(
      `UPDATE biz_property_task_assignment
          SET assignment_status=$6, assignee_id=$7,
              claim_epoch=claim_epoch+$8,
              claim_token=CASE WHEN $9 THEN uuid_generate_v4() ELSE $10::uuid END,
              version=version+1, claimed_at=$11, started_at=$12,
              blocked_reason=$13, blocked_until=$14, updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
          AND assignment_status=$5 AND is_deleted=false
        RETURNING ${assignmentReturning()}`,
      [
        input.scope.tenantId, input.scope.parkId, input.assignment.id,
        input.assignment.version, input.assignment.assignmentStatus,
        next.status, next.assigneeId, next.claimEpochIncrement,
        input.action === "property.task.claim", next.claimToken,
        next.claimedAt, next.startedAt,
        input.action === "property.task.block" ? input.reason : next.blockedReason,
        input.action === "property.task.block"
          ? input.blockedUntil ?? null
          : next.blockedUntil
      ]
    );
    const updated = exactAssignmentMutationRow(mutation);
    if (!updated) {
      throw propertyTaskError("task-version-conflict", {}, input.assignment.version);
    }
    await this.audit(manager, {
      scope: input.scope,
      assignmentId: updated.id,
      actorId: input.actorId,
      actionId: input.action,
      fromStatus: input.assignment.assignmentStatus,
      toStatus: updated.assignmentStatus,
      fromVersion: input.assignment.version,
      toVersion: updated.version,
      reason: input.reason ?? null,
      payloadHash: input.requestHash
    });
    return await this.lockById(manager, input.scope, updated.id) ?? updated;
  }

  async terminal(
    manager: EntityManager,
    input: {
      scope: TenantParkScope;
      assignment: PropertyTaskAssignmentRow;
      actorId: string;
      terminal: PropertyTaskSourceTerminal;
      outcomeCode: string;
      outcomeSourceVersion: number;
      outcomeAt: string;
      requestHash: string;
      actionId: string;
    }
  ): Promise<PropertyTaskAssignmentRow> {
    const mutation = await manager.query(
      `UPDATE biz_property_task_assignment
          SET assignment_status=$6, assignee_id=NULL, claim_token=NULL,
              version=version+1, blocked_reason=NULL, blocked_until=NULL,
              outcome_code=$7, outcome_source_version=$8, outcome_at=$9,
              updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
          AND assignment_status=$5 AND is_deleted=false
        RETURNING ${assignmentReturning()}`,
      [
        input.scope.tenantId, input.scope.parkId, input.assignment.id,
        input.assignment.version, input.assignment.assignmentStatus,
        input.terminal, input.outcomeCode, input.outcomeSourceVersion, input.outcomeAt
      ]
    );
    const updated = exactAssignmentMutationRow(mutation);
    if (!updated) {
      throw propertyTaskError("property-version-conflict");
    }
    await this.audit(manager, {
      scope: input.scope,
      assignmentId: updated.id,
      actorId: input.actorId,
      actionId: input.actionId,
      fromStatus: input.assignment.assignmentStatus,
      toStatus: updated.assignmentStatus,
      fromVersion: input.assignment.version,
      toVersion: updated.version,
      reason: `source-terminal:${input.terminal}`,
      payloadHash: input.requestHash
    });
    return await this.lockById(manager, input.scope, updated.id) ?? updated;
  }

  private async lock(
    manager: EntityManager,
    scope: TenantParkScope,
    predicate: string,
    value: string
  ): Promise<PropertyTaskAssignmentRow | null> {
    const rows = await manager.query(
      `SELECT ${assignmentSelect()}
         FROM biz_property_task_assignment assignment
         LEFT JOIN sys_user assignee ON assignee.id=assignment.assignee_id
          AND assignee.tenant_id::text=assignment.tenant_id
          AND assignee.park_id::text=assignment.park_id
        WHERE assignment.tenant_id=$1 AND assignment.park_id=$2
          AND ${predicate} AND assignment.is_deleted=false
        FOR UPDATE OF assignment`,
      [scope.tenantId, scope.parkId, value]
    ) as PropertyTaskAssignmentRow[];
    if (rows.length > 1) throw propertyTaskError("property-runtime-unavailable");
    return rows[0] ?? null;
  }

  private async audit(
    manager: EntityManager,
    input: {
      scope: TenantParkScope;
      assignmentId: string;
      actorId: string;
      actionId: string;
      fromStatus: PropertyTaskStatus;
      toStatus: PropertyTaskStatus;
      fromVersion: number;
      toVersion: number;
      reason: string | null;
      payloadHash: string;
    }
  ): Promise<void> {
    const rows = await manager.query(
      `INSERT INTO biz_property_task_assignment_audit(
         tenant_id,park_id,assignment_id,actor_id,action_id,from_status,to_status,
         from_version,to_version,reason,payload_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        input.scope.tenantId, input.scope.parkId, input.assignmentId, input.actorId,
        input.actionId, input.fromStatus, input.toStatus, input.fromVersion,
        input.toVersion, input.reason, input.payloadHash
      ]
    ) as Array<{ id: string }>;
    if (rows.length !== 1) throw propertyTaskError("property-runtime-unavailable");
  }
}

function exactAssignmentMutationRow(value: unknown): PropertyTaskAssignmentRow | null {
  if (!Array.isArray(value)) throw propertyTaskError("property-runtime-unavailable");
  const postgresResult = Array.isArray(value[0]);
  const rows = postgresResult ? value[0] : value;
  const rowCount = postgresResult ? value[1] : rows.length;
  if ((postgresResult && value.length !== 2)
    || !Array.isArray(rows)
    || !Number.isInteger(rowCount)
    || (rowCount as number) < 0
    || rows.length !== rowCount
    || rows.length > 1) {
    throw propertyTaskError("property-runtime-unavailable");
  }
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw propertyTaskError("property-runtime-unavailable");
  }
  return row as PropertyTaskAssignmentRow;
}

function commandTransition(
  assignment: PropertyTaskAssignmentRow,
  actorId: string,
  action: PropertyTaskAction
) {
  const sameActor = assignment.assigneeId === actorId;
  if (action === "property.task.claim") {
    if (assignment.assignmentStatus !== "open") {
      throw propertyTaskError("task-already-claimed", {
        assigneeDisplay: assignment.assigneeDisplay
      });
    }
    return {
      status: "claimed" as const, assigneeId: actorId, claimEpochIncrement: 1,
      claimToken: null, claimedAt: new Date(), startedAt: null,
      blockedReason: null, blockedUntil: null
    };
  }
  if (action === "property.task.start"
    && (assignment.assignmentStatus !== "claimed" || !sameActor)) {
    throw propertyTaskError("property-action-forbidden");
  }
  if (action === "property.task.block"
    && (assignment.assignmentStatus !== "in_progress" || !sameActor)) {
    throw propertyTaskError("property-action-forbidden");
  }
  if (action === "property.task.unblock" && assignment.assignmentStatus !== "blocked") {
    throw propertyTaskError("task-version-conflict", {}, assignment.version);
  }
  if (action === "property.task.release"
    && !["claimed", "in_progress", "blocked"].includes(assignment.assignmentStatus)) {
    throw propertyTaskError("task-version-conflict", {}, assignment.version);
  }
  if (action === "property.task.release") {
    return {
      status: "open" as const, assigneeId: null, claimEpochIncrement: 0,
      claimToken: null, claimedAt: null, startedAt: null,
      blockedReason: null, blockedUntil: null
    };
  }
  if (action === "property.task.start" || action === "property.task.unblock") {
    return {
      status: "in_progress" as const, assigneeId: assignment.assigneeId,
      claimEpochIncrement: 0, claimToken: assignment.claimToken,
      claimedAt: assignment.claimedAt, startedAt: assignment.startedAt ?? new Date(),
      blockedReason: null, blockedUntil: null
    };
  }
  return {
    status: "blocked" as const, assigneeId: assignment.assigneeId,
    claimEpochIncrement: 0, claimToken: assignment.claimToken,
    claimedAt: assignment.claimedAt, startedAt: assignment.startedAt,
    blockedReason: "blocked", blockedUntil: null
  };
}

function assignmentSelect(): string {
  return `assignment.id::text AS "id", assignment.task_key AS "taskKey",
    assignment.task_kind AS "taskKind", assignment.source_type AS "sourceType",
    assignment.source_id::text AS "sourceId",
    assignment.source_version_at_generation::integer AS "sourceVersionAtGeneration",
    assignment.assignment_status AS "assignmentStatus",
    assignment.assignee_id::text AS "assigneeId", assignee.display_name AS "assigneeDisplay",
    assignment.claim_epoch::integer AS "claimEpoch", assignment.claim_token::text AS "claimToken",
    assignment.version::integer AS version, assignment.claimed_at AS "claimedAt",
    assignment.started_at AS "startedAt", assignment.blocked_reason AS "blockedReason",
    assignment.blocked_until AS "blockedUntil", assignment.outcome_code AS "outcomeCode",
    assignment.outcome_source_version::integer AS "outcomeSourceVersion",
    assignment.outcome_at AS "outcomeAt", assignment.created_at AS "createdAt",
    assignment.updated_at AS "updatedAt"`;
}

function assignmentReturning(): string {
  return `id::text AS "id", task_key AS "taskKey", task_kind AS "taskKind",
    source_type AS "sourceType", source_id::text AS "sourceId",
    source_version_at_generation::integer AS "sourceVersionAtGeneration",
    assignment_status AS "assignmentStatus", assignee_id::text AS "assigneeId",
    NULL::text AS "assigneeDisplay", claim_epoch::integer AS "claimEpoch",
    claim_token::text AS "claimToken", version::integer AS version,
    claimed_at AS "claimedAt", started_at AS "startedAt",
    blocked_reason AS "blockedReason", blocked_until AS "blockedUntil",
    outcome_code AS "outcomeCode", outcome_source_version::integer AS "outcomeSourceVersion",
    outcome_at AS "outcomeAt", created_at AS "createdAt", updated_at AS "updatedAt"`;
}
