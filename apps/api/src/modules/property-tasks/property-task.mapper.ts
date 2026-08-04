import { Injectable } from "@nestjs/common";
import type {
  PropertyTaskAction,
  PropertyTaskDetailResponse,
  PropertyTaskListItem
} from "@jinhu/shared";
import type { PropertyTaskProjectionRow } from
  "./property-task.projection.repository";

@Injectable()
export class PropertyTaskMapper {
  toListItem(
    row: PropertyTaskProjectionRow,
    allowedActions: readonly PropertyTaskAction[],
    canReadSourceDetails: boolean
  ): PropertyTaskListItem {
    const item: PropertyTaskListItem = {
      taskId: row.taskId,
      assignmentAuthority: row.assignmentAuthority,
      taskKind: row.taskKind,
      kindLabel: row.kindLabel,
      sourceType: row.sourceType,
      sourceLabel: row.sourceLabel,
      title: row.title,
      priority: row.priority,
      dueAt: iso(row.dueAt),
      assignmentStatus: row.assignmentStatus,
      assignmentVersion: row.assignmentVersion,
      assigneeDisplay: row.assigneeDisplay,
      createdAt: iso(row.createdAt)!,
      updatedAt: iso(row.updatedAt)!,
      allowedActions: [...allowedActions]
    };
    if (row.assignmentStatus === "blocked" && canReadSourceDetails) {
      item.blockedReason = row.blockedReason!;
    }
    return item;
  }

  toDetail(
    row: PropertyTaskProjectionRow,
    allowedActions: readonly PropertyTaskAction[],
    canReadSourceDetails: boolean
  ): PropertyTaskDetailResponse {
    const detail: PropertyTaskDetailResponse = {
      ...this.toListItem(row, allowedActions, canReadSourceDetails),
      sourceVersion: row.sourceVersion,
      businessOccurrenceKey: row.businessOccurrenceKey,
      claimedAt: iso(row.claimedAt),
      startedAt: iso(row.startedAt),
      blockedUntil: iso(row.blockedUntil)
    };
    if (canReadSourceDetails) {
      detail.sourceId = row.sourceId;
      detail.sourceDeepLink = safeDeepLink(row.sourceDeepLink);
      if (
        (row.assignmentStatus === "closed" || row.assignmentStatus === "cancelled")
        && row.outcomeCode !== null
        && row.outcomeSourceVersion !== null
        && row.outcomeAt !== null
      ) {
        detail.outcome = {
          code: row.outcomeCode,
          sourceVersion: row.outcomeSourceVersion,
          at: iso(row.outcomeAt)!
        };
      }
    }
    return detail;
  }
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function safeDeepLink(value: string | null): string | null {
  return value !== null && /^\/[a-z0-9][a-z0-9/_-]*(?:\?[a-z0-9_=&%-]+)?$/.test(value)
    ? value
    : null;
}
