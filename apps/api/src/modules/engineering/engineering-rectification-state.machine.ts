import { BadRequestException, Injectable } from "@nestjs/common";
import { EngineeringRectificationStatus } from "./domain/engineering-project.enums";
import {
  EngineeringRectificationAction,
  type EngineeringRectificationAvailableAction,
  type EngineeringRectificationTransitionContext
} from "./domain/engineering-rectification-state-machine.types";
import { EngineeringRectificationEntity } from "./entities/engineering-rectification.entity";
import { EngineeringRectificationRepository, type UpdateEngineeringRectificationStatusInput } from "./repositories/engineering-rectification.repository";

const TRANSITIONS: Record<EngineeringRectificationStatus, Partial<Record<EngineeringRectificationAction, EngineeringRectificationStatus>>> = {
  [EngineeringRectificationStatus.PENDING]: {
    [EngineeringRectificationAction.START]: EngineeringRectificationStatus.IN_PROGRESS,
    [EngineeringRectificationAction.MARK_OVERDUE]: EngineeringRectificationStatus.OVERDUE
  },
  [EngineeringRectificationStatus.IN_PROGRESS]: {
    [EngineeringRectificationAction.SUBMIT]: EngineeringRectificationStatus.SUBMITTED,
    [EngineeringRectificationAction.MARK_OVERDUE]: EngineeringRectificationStatus.OVERDUE
  },
  [EngineeringRectificationStatus.SUBMITTED]: {
    [EngineeringRectificationAction.START_RECHECK]: EngineeringRectificationStatus.RECHECKING,
    [EngineeringRectificationAction.MARK_OVERDUE]: EngineeringRectificationStatus.OVERDUE
  },
  [EngineeringRectificationStatus.RECHECKING]: {
    [EngineeringRectificationAction.PASS]: EngineeringRectificationStatus.PASSED,
    [EngineeringRectificationAction.REJECT]: EngineeringRectificationStatus.REJECTED,
    [EngineeringRectificationAction.MARK_OVERDUE]: EngineeringRectificationStatus.OVERDUE
  },
  [EngineeringRectificationStatus.REJECTED]: {
    [EngineeringRectificationAction.START]: EngineeringRectificationStatus.IN_PROGRESS,
    [EngineeringRectificationAction.MARK_OVERDUE]: EngineeringRectificationStatus.OVERDUE
  },
  [EngineeringRectificationStatus.PASSED]: {
    [EngineeringRectificationAction.CLOSE]: EngineeringRectificationStatus.CLOSED
  },
  [EngineeringRectificationStatus.OVERDUE]: {
    [EngineeringRectificationAction.START]: EngineeringRectificationStatus.IN_PROGRESS,
    [EngineeringRectificationAction.SUBMIT]: EngineeringRectificationStatus.SUBMITTED
  },
  [EngineeringRectificationStatus.CLOSED]: {}
};

@Injectable()
export class EngineeringRectificationStateMachine {
  constructor(private readonly rectificationsRepository: EngineeringRectificationRepository) {}

  getNextStatus(currentStatus: EngineeringRectificationStatus, action: EngineeringRectificationAction): EngineeringRectificationStatus {
    const nextStatus = TRANSITIONS[currentStatus]?.[action];
    if (!nextStatus) {
      throw new BadRequestException(`Invalid engineering rectification transition: ${currentStatus} -> ${action}`);
    }
    return nextStatus;
  }

  canTransition(currentStatus: EngineeringRectificationStatus, action: EngineeringRectificationAction): boolean {
    return Boolean(TRANSITIONS[currentStatus]?.[action]);
  }

  assertCanTransition(currentStatus: EngineeringRectificationStatus, action: EngineeringRectificationAction): void {
    this.getNextStatus(currentStatus, action);
  }

  getAvailableActions(currentStatus: EngineeringRectificationStatus): EngineeringRectificationAvailableAction[] {
    return Object.entries(TRANSITIONS[currentStatus] ?? {}).map(([action, toStatus]) => ({
      action: action as EngineeringRectificationAction,
      fromStatus: currentStatus,
      toStatus: toStatus as EngineeringRectificationStatus
    }));
  }

  async transition(
    rectification: EngineeringRectificationEntity,
    action: EngineeringRectificationAction,
    context: EngineeringRectificationTransitionContext,
    patch: Partial<Pick<UpdateEngineeringRectificationStatusInput, "feedback" | "recheckComment">> = {}
  ): Promise<EngineeringRectificationEntity> {
    const nextStatus = this.getNextStatus(rectification.status, action);
    const now = new Date();
    return this.rectificationsRepository.updateStatus(context, context.actorUserId, rectification.id, {
      status: nextStatus,
      ...this.statusPatch(action, nextStatus, context.actorUserId, now),
      ...patch
    });
  }

  isOverdue(rectification: Pick<EngineeringRectificationEntity, "deadline" | "status">, today: string = new Date().toISOString().slice(0, 10)): boolean {
    if (!rectification.deadline) return false;
    if ([EngineeringRectificationStatus.CLOSED, EngineeringRectificationStatus.PASSED].includes(rectification.status)) return false;
    return rectification.deadline < today;
  }

  private statusPatch(
    action: EngineeringRectificationAction,
    status: EngineeringRectificationStatus,
    actorUserId: string,
    now: Date
  ): Partial<UpdateEngineeringRectificationStatusInput> {
    if (action === EngineeringRectificationAction.START) {
      return { startedAt: now };
    }
    if (action === EngineeringRectificationAction.SUBMIT) {
      return { submittedAt: now, submittedBy: actorUserId };
    }
    if (action === EngineeringRectificationAction.PASS || action === EngineeringRectificationAction.REJECT) {
      return { recheckedAt: now, recheckedBy: actorUserId };
    }
    if (action === EngineeringRectificationAction.CLOSE || status === EngineeringRectificationStatus.CLOSED) {
      return { closedAt: now, closedBy: actorUserId };
    }
    return {};
  }
}
