import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringProjectStatus } from "./domain/engineering-project.enums";
import {
  EngineeringProjectAction,
  type EngineeringProjectAvailableAction,
  type EngineeringProjectTransitionContext
} from "./domain/engineering-project-state-machine.types";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStatusLogEntity } from "./entities/engineering-project-status-log.entity";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringProjectPolicy } from "./policies/engineering-project.policy";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";

const ACTION_TARGET_STATUS: Record<EngineeringProjectAction, EngineeringProjectStatus> = {
  [EngineeringProjectAction.SUBMIT]: EngineeringProjectStatus.SUBMITTED,
  [EngineeringProjectAction.APPROVE]: EngineeringProjectStatus.APPROVED,
  [EngineeringProjectAction.CANCEL]: EngineeringProjectStatus.CANCELLED,
  [EngineeringProjectAction.START_PLANNING]: EngineeringProjectStatus.PLANNING,
  [EngineeringProjectAction.START_EXECUTION]: EngineeringProjectStatus.EXECUTING,
  [EngineeringProjectAction.START_INSPECTION]: EngineeringProjectStatus.INSPECTING,
  [EngineeringProjectAction.REQUIRE_RECTIFICATION]: EngineeringProjectStatus.RECTIFYING,
  [EngineeringProjectAction.START_ACCEPTANCE]: EngineeringProjectStatus.ACCEPTING,
  [EngineeringProjectAction.ACCEPTANCE_PASSED]: EngineeringProjectStatus.ACCEPTED,
  [EngineeringProjectAction.ACCEPTANCE_FAILED]: EngineeringProjectStatus.RECTIFYING,
  [EngineeringProjectAction.MARK_TRANSFER_READY]: EngineeringProjectStatus.TRANSFER_READY,
  [EngineeringProjectAction.MARK_SETTLEMENT_READY]: EngineeringProjectStatus.SETTLEMENT_READY,
  [EngineeringProjectAction.CLOSE]: EngineeringProjectStatus.CLOSED,
  [EngineeringProjectAction.ARCHIVE]: EngineeringProjectStatus.ARCHIVED
};

const ALLOWED_ACTIONS_BY_STATUS: Record<EngineeringProjectStatus, EngineeringProjectAction[]> = {
  [EngineeringProjectStatus.DRAFT]: [EngineeringProjectAction.SUBMIT, EngineeringProjectAction.CANCEL],
  [EngineeringProjectStatus.SUBMITTED]: [EngineeringProjectAction.APPROVE, EngineeringProjectAction.CANCEL],
  [EngineeringProjectStatus.APPROVED]: [EngineeringProjectAction.START_PLANNING, EngineeringProjectAction.CANCEL],
  [EngineeringProjectStatus.PLANNING]: [EngineeringProjectAction.START_EXECUTION, EngineeringProjectAction.CANCEL],
  [EngineeringProjectStatus.EXECUTING]: [EngineeringProjectAction.START_INSPECTION, EngineeringProjectAction.CANCEL],
  [EngineeringProjectStatus.INSPECTING]: [EngineeringProjectAction.REQUIRE_RECTIFICATION, EngineeringProjectAction.START_ACCEPTANCE],
  [EngineeringProjectStatus.RECTIFYING]: [EngineeringProjectAction.START_INSPECTION],
  [EngineeringProjectStatus.ACCEPTING]: [EngineeringProjectAction.ACCEPTANCE_PASSED, EngineeringProjectAction.ACCEPTANCE_FAILED],
  [EngineeringProjectStatus.ACCEPTED]: [EngineeringProjectAction.MARK_TRANSFER_READY],
  [EngineeringProjectStatus.TRANSFER_READY]: [EngineeringProjectAction.MARK_SETTLEMENT_READY],
  [EngineeringProjectStatus.SETTLEMENT_READY]: [EngineeringProjectAction.CLOSE],
  [EngineeringProjectStatus.CLOSED]: [EngineeringProjectAction.ARCHIVE],
  [EngineeringProjectStatus.ARCHIVED]: [],
  [EngineeringProjectStatus.CANCELLED]: []
};

@Injectable()
export class EngineeringProjectStateMachine {
  constructor(
    private readonly projectsRepository: EngineeringProjectRepository,
    @InjectRepository(EngineeringProjectStatusLogEntity)
    private readonly statusLogsRepository: Repository<EngineeringProjectStatusLogEntity>,
    private readonly auditLogger: EngineeringAuditLogger,
    private readonly eventPublisher: EngineeringEventPublisher,
    private readonly projectPolicy: EngineeringProjectPolicy
  ) {}

  getNextStatus(currentStatus: EngineeringProjectStatus, action: EngineeringProjectAction): EngineeringProjectStatus {
    this.assertCanTransition(currentStatus, action);
    return ACTION_TARGET_STATUS[action];
  }

  canTransition(currentStatus: EngineeringProjectStatus, action: EngineeringProjectAction): boolean {
    return ALLOWED_ACTIONS_BY_STATUS[currentStatus]?.includes(action) ?? false;
  }

  assertCanTransition(currentStatus: EngineeringProjectStatus, action: EngineeringProjectAction): void {
    if (!this.canTransition(currentStatus, action)) {
      throw new BadRequestException(`Illegal engineering project transition: ${currentStatus} -> ${action}`);
    }
  }

  getAvailableActions(
    currentStatus: EngineeringProjectStatus,
    _context?: Partial<EngineeringProjectTransitionContext>
  ): EngineeringProjectAvailableAction[] {
    return (ALLOWED_ACTIONS_BY_STATUS[currentStatus] ?? []).map((action) => ({
      action,
      targetStatus: ACTION_TARGET_STATUS[action],
      requiredPermission: this.projectPolicy.requiredPermissionForAction(action)
    }));
  }

  async transition(
    project: EngineeringProjectEntity,
    action: EngineeringProjectAction,
    context: EngineeringProjectTransitionContext
  ): Promise<EngineeringProjectEntity> {
    this.assertContext(project, context);
    const fromStatus = project.status;
    const toStatus = this.getNextStatus(fromStatus, action);
    this.projectPolicy.assertCanPerform(action, context);

    const updated = await this.projectsRepository.updateStatus(
      { tenantId: project.tenantId, parkId: project.parkId },
      context.actorUserId,
      project.id,
      toStatus
    );
    await this.writeStatusLog(project, action, fromStatus, toStatus, context);
    await this.auditLogger.logProjectStatusChanged({
      tenantId: project.tenantId,
      parkId: project.parkId,
      projectId: project.id,
      fromStatus,
      toStatus,
      action,
      context
    });
    await this.eventPublisher.publishProjectStatusChanged({
      tenantId: project.tenantId,
      parkId: project.parkId,
      projectId: project.id,
      fromStatus,
      toStatus,
      action,
      actorUserId: context.actorUserId,
      reason: context.reason,
      comment: context.comment ?? null,
      workflowInstanceId: context.workflowInstanceId ?? null,
      requestId: context.requestId ?? null,
      ...(action === EngineeringProjectAction.SUBMIT && project.engineeringDirectorId
        ? {
            notificationRecipients: [project.engineeringDirectorId],
            notificationTitle: "工程立项待审批",
            notificationContent: `${project.projectCode} ${project.projectName} 已提交，请工程负责人处理。`,
            notificationTargetUrl: `/engineering/projects/${project.id}`
          }
        : {})
    });
    return updated;
  }

  private async writeStatusLog(
    project: EngineeringProjectEntity,
    action: EngineeringProjectAction,
    fromStatus: EngineeringProjectStatus,
    toStatus: EngineeringProjectStatus,
    context: EngineeringProjectTransitionContext
  ): Promise<void> {
    await this.statusLogsRepository.save(
      this.statusLogsRepository.create({
        tenantId: project.tenantId,
        parkId: project.parkId,
        projectId: project.id,
        fromStatus,
        toStatus,
        action,
        reason: context.reason,
        comment: context.comment ?? null,
        actorUserId: context.actorUserId,
        actorName: context.actorName ?? null,
        workflowInstanceId: context.workflowInstanceId ?? null,
        requestId: context.requestId ?? null
      })
    );
  }

  private assertContext(project: EngineeringProjectEntity, context: EngineeringProjectTransitionContext): void {
    if (!context.tenantId || context.tenantId !== project.tenantId) {
      throw new BadRequestException("Engineering project transition tenant scope mismatch");
    }
    if (!context.parkId || context.parkId !== project.parkId) {
      throw new BadRequestException("Engineering project transition park scope mismatch");
    }
    if (!context.projectId || context.projectId !== project.id) {
      throw new BadRequestException("Engineering project transition project scope mismatch");
    }
    if (!context.actorUserId) {
      throw new BadRequestException("Engineering project transition actorUserId is required");
    }
    if (!context.reason?.trim()) {
      throw new BadRequestException("Engineering project transition reason is required");
    }
  }
}
