import { ConflictException, Injectable } from "@nestjs/common";
import type {
  EntityManagerPort,
  PropertyTaskAction,
  PropertyTaskOwningCommandInput,
  PropertyTaskProjectorSource,
  PropertyTaskSourceResolver,
  PropertyTaskSourceSnapshot,
  TenantParkScope
} from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";

export const HOMESTAY_TURNOVER_TASK_RESOLVER = Symbol("HOMESTAY_TURNOVER_TASK_RESOLVER");

type TurnoverRow = {
  id: string; bookingId: string; unitId: string; status: string; version: number;
  assigneeId: string | null; assigneeName: string | null; createTime: Date | string;
  updateTime: Date | string;
  startedAt: Date | string | null; completedAt: Date | string | null;
  exceptionDescription: string | null;
};

@Injectable()
export class HomestayTurnoverTaskResolver implements PropertyTaskSourceResolver,
PropertyTaskProjectorSource {
  readonly sourceType = "homestay_turnover";
  readonly taskKind = "turnover";
  readonly assignmentAuthority = "owning" as const;
  readonly access = {
    tag: "workspace" as const,
    sourceType: this.sourceType,
    requiredModules: ["asset", "homestay"] as const,
    surfaceId: "homestay:tasks:page",
    pagePermission: "homestay:tasks:page",
    queueCode: "homestay_turnover",
    domainRoute: "/homestay/turnovers/[taskId]",
    sourceDetailPermission: "homestay:turnover:read"
  };

  async lockAndResolve(input: {
    manager: EntityManagerPort; scope: TenantParkScope; sourceId: string;
    businessOccurrenceKey: string; expectedSourceVersion: number; taskKey: string;
  }): Promise<PropertyTaskSourceSnapshot | null> {
    const row = await this.row(this.manager(input.manager), input.scope, input.sourceId, true);
    if (!row) return null;
    if (input.businessOccurrenceKey !== this.occurrence(row.id)
      || row.version !== input.expectedSourceVersion) {
      throw new ConflictException("Property task source version changed");
    }
    return this.snapshot(row);
  }

  async invokeOwningCommand(input: PropertyTaskOwningCommandInput): Promise<void> {
    const manager = this.manager(input.manager);
    const row = await this.row(manager, input.scope, input.sourceId, true);
    if (!row || input.businessOccurrenceKey !== this.occurrence(input.sourceId)
      || row.version !== input.expectedSourceVersion
      || row.version !== input.expectedAssignmentVersion) {
      throw new ConflictException("Property task source version changed");
    }
    const next = this.transition(row, input.action, input.actor.actorId);
    const updated = typeormQueryRows<{ version: number }>(await manager.query(
      `UPDATE biz_homestay_turnover_task SET status=$6,assignee_id=$7,
              assignee_name=CASE WHEN $7::uuid IS NULL THEN NULL ELSE assignee_name END,
              started_at=CASE WHEN $6='cleaning' AND started_at IS NULL THEN clock_timestamp() ELSE started_at END,
              exception_description=$8,update_by=$9,update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 AND status=$5
          AND is_deleted=false RETURNING version`,
      [input.scope.tenantId, input.scope.parkId, row.id, row.version, row.status,
        next.status, next.assigneeId, next.exceptionDescription, input.actor.actorId]
    ));
    if (updated.length !== 1 || updated[0]!.version !== row.version + 1) {
      throw new ConflictException("Property task source version changed");
    }
  }

  async scanCandidates(input: {
    manager: EntityManagerPort; scope: TenantParkScope;
    after: { sourceId: string; businessOccurrenceKey: string } | null; limit: number;
  }) {
    const rows = await this.manager(input.manager).query(
      `SELECT id::text AS id,booking_id::text AS "bookingId",unit_id::text AS "unitId",
              status,version,assignee_id::text AS "assigneeId",assignee_name AS "assigneeName",
              create_time AS "createTime",update_time AS "updateTime",started_at AS "startedAt",completed_at AS "completedAt",
              exception_description AS "exceptionDescription"
         FROM biz_homestay_turnover_task WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false
          AND ($3::uuid IS NULL OR id>$3::uuid) ORDER BY id LIMIT $4`,
      [input.scope.tenantId, input.scope.parkId, input.after?.sourceId ?? null, input.limit]
    ) as TurnoverRow[];
    const items = rows.map((row) => this.snapshot(row));
    const last = rows.at(-1);
    return { items, next: rows.length === input.limit && last
      ? { sourceId: last.id, businessOccurrenceKey: this.occurrence(last.id) } : null };
  }

  private transition(row: TurnoverRow, action: PropertyTaskAction, actorId: string) {
    switch (action) {
      case "property.task.claim":
        if (row.status !== "pending" || row.assigneeId) break;
        return { status: row.status, assigneeId: actorId,
          exceptionDescription: row.exceptionDescription };
      case "property.task.start":
        if (row.status !== "pending" || row.assigneeId !== actorId) break;
        return { status: "cleaning", assigneeId: actorId,
          exceptionDescription: row.exceptionDescription };
      case "property.task.block":
        if (!["pending", "cleaning"].includes(row.status) || row.assigneeId !== actorId) break;
        return { status: "exception", assigneeId: actorId,
          exceptionDescription: row.exceptionDescription ?? "property-task-blocked" };
      case "property.task.unblock":
        if (row.status !== "exception" || row.assigneeId !== actorId) break;
        return { status: "cleaning", assigneeId: actorId, exceptionDescription: null };
      case "property.task.release":
        if (row.status !== "pending" || row.assigneeId !== actorId) break;
        return { status: "pending", assigneeId: null,
          exceptionDescription: row.exceptionDescription };
    }
    throw new ConflictException("Property task source is not eligible for this action");
  }

  private snapshot(row: TurnoverRow): PropertyTaskSourceSnapshot {
    const status = row.status === "completed" ? "closed"
      : row.status === "exception" ? "blocked"
        : row.status === "cleaning" ? "in_progress" : row.assigneeId ? "claimed" : "open";
    const createdAt = this.time(row.createTime);
    return {
      sourceId: row.id, sourceVersion: row.version,
      lifecycle: row.status === "completed" ? "succeeded" : "eligible",
      businessOccurrenceKey: this.occurrence(row.id),
      title: `民宿周转 · ${row.bookingId}`, kindLabel: "民宿周转",
      sourceLabel: row.bookingId, priority: row.status === "exception" ? 100 : 50,
      dueAt: null, sourceDeepLink: `/homestay/turnovers/${row.id}`,
      owningAssignment: {
        status, version: row.version, assigneeId: row.assigneeId,
        assigneeDisplay: row.assigneeName, claimedAt: row.assigneeId ? this.time(row.updateTime) : null,
        startedAt: row.startedAt ? this.time(row.startedAt) : null,
        blockedReason: row.status === "exception" ? row.exceptionDescription : null,
        blockedUntil: null, outcomeCode: row.status === "completed" ? "turnover-completed" : null,
        outcomeSourceVersion: row.status === "completed" ? row.version : null,
        outcomeAt: row.completedAt ? this.time(row.completedAt) : null,
        createdAt, updatedAt: this.time(row.updateTime)
      }
    };
  }

  private async row(manager: EntityManager, scope: TenantParkScope, id: string, lock: boolean) {
    const rows = await manager.query(
      `SELECT id::text AS id,booking_id::text AS "bookingId",unit_id::text AS "unitId",
              status,version,assignee_id::text AS "assigneeId",assignee_name AS "assigneeName",
              create_time AS "createTime",update_time AS "updateTime",started_at AS "startedAt",completed_at AS "completedAt",
              exception_description AS "exceptionDescription"
         FROM biz_homestay_turnover_task WHERE tenant_id=$1 AND park_id=$2 AND id=$3
          AND is_deleted=false${lock ? " FOR UPDATE" : ""}`,
      [scope.tenantId, scope.parkId, id]
    ) as TurnoverRow[];
    return rows[0] ?? null;
  }
  private manager(port: EntityManagerPort) {
    const manager = port.transactionContext;
    if (!(manager && typeof manager === "object" && "query" in manager)) {
      throw new ConflictException("Property task runtime is unavailable");
    }
    return manager as EntityManager;
  }
  private occurrence(id: string) { return `homestay-turnover:${id}`; }
  private time(value: Date | string) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
}
