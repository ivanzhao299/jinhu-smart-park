import { BadRequestException, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "@jinhu/shared";
import type { SelectQueryBuilder } from "typeorm";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import {
  CreateEngineeringRectificationDto,
  EngineeringRectificationActionDto,
  EngineeringRectificationOverdueScanDto,
  EngineeringRectificationQueryDto,
  UpdateEngineeringRectificationDto
} from "./dto/engineering-rectification.dto";
import { EngineeringIssueStatus, EngineeringRectificationStatus } from "./domain/engineering-project.enums";
import { EngineeringRectificationAction, type EngineeringRectificationTransitionContext } from "./domain/engineering-rectification-state-machine.types";
import { EngineeringIssueEntity } from "./entities/engineering-issue.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringRectificationEntity } from "./entities/engineering-rectification.entity";
import { EngineeringAttachmentService } from "./engineering-attachment.service";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import { EngineeringRectificationStateMachine } from "./engineering-rectification-state.machine";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import {
  EngineeringRectificationAccessPolicy,
  EngineeringRectificationPermission,
  type EngineeringRectificationPermissionValue
} from "./policies/engineering-rectification-access.policy";
import { EngineeringIssueRepository } from "./repositories/engineering-issue.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";
import {
  EngineeringRectificationRepository,
  type CreateEngineeringRectificationInput,
  type UpdateEngineeringRectificationInput
} from "./repositories/engineering-rectification.repository";

@Injectable()
export class EngineeringRectificationService {
  constructor(
    private readonly rectificationsRepository: EngineeringRectificationRepository,
    private readonly issuesRepository: EngineeringIssueRepository,
    private readonly projectsRepository: EngineeringProjectRepository,
    private readonly stateMachine: EngineeringRectificationStateMachine,
    private readonly accessPolicy: EngineeringRectificationAccessPolicy,
    private readonly dataScopeAdapter: EngineeringDataScopeAdapter,
    private readonly attachmentService: EngineeringAttachmentService,
    private readonly auditLogger: EngineeringAuditLogger,
    private readonly eventPublisher: EngineeringEventPublisher
  ) {}

  async createRectification(dto: CreateEngineeringRectificationDto, context: EngineeringProjectRuntimeContext): Promise<EngineeringRectificationEntity> {
    this.accessPolicy.assertPermission(EngineeringRectificationPermission.ASSIGN, this.permissionContext(context));
    const project = await this.findProjectInScope(dto.project_id, context);
    let issue: EngineeringIssueEntity | null = null;
    if (dto.issue_id) {
      issue = await this.findIssueInScope(dto.issue_id, context);
      if (issue.projectId !== project.id) {
        throw new BadRequestException("Engineering rectification issue must belong to the same project");
      }
      if (issue.rectificationId) {
        throw new BadRequestException("Engineering issue already has a rectification task");
      }
    }
    const attachmentIds = await this.attachmentService.normalizeAttachmentIds(context, dto.attachment_ids);
    const rectification = await this.rectificationsRepository.createRectification(
      context,
      context.actor.sub,
      this.toCreateRectificationInput(dto, project, issue, attachmentIds ?? issue?.attachmentIds ?? null)
    );
    if (issue) {
      await this.issuesRepository.updateIssue(context, context.actor.sub, issue.id, {
        rectificationId: rectification.id,
        issueStatus: EngineeringIssueStatus.RECTIFICATION_PENDING,
        closedAt: null,
        closedBy: null
      });
    }
    await this.logRectificationChange("CREATE", rectification, context, null, this.rectificationSnapshot(rectification));
    await this.publishRectificationEvent("EngineeringRectificationCreatedEvent", rectification, context, {
      rectificationCode: rectification.rectificationCode,
      issueId: rectification.issueId,
      severity: rectification.severity,
      notificationRecipients: rectification.responsibleUserId ? [rectification.responsibleUserId] : [],
      notificationTitle: "整改任务待处理",
      notificationContent: `${rectification.rectificationCode} ${rectification.rectificationTitle} 已创建，请责任人处理。`,
      notificationTargetUrl: `/engineering/rectifications/${rectification.id}`,
      notificationPriority: rectification.severity === "CRITICAL" || rectification.severity === "HIGH" ? "urgent" : "high"
    });
    return rectification;
  }

  async paginateRectifications(
    query: EngineeringRectificationQueryDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<PaginatedResult<EngineeringRectificationEntity>> {
    this.accessPolicy.assertPermission(EngineeringRectificationPermission.VIEW, this.permissionContext(context));
    if (query.project_id) {
      await this.findProjectInScope(query.project_id, context);
    }
    return this.rectificationsRepository.paginateRectifications(context, query, (builder) => this.applyRectificationScope(builder, context));
  }

  async getRectificationDetail(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringRectificationEntity> {
    this.accessPolicy.assertPermission(EngineeringRectificationPermission.VIEW, this.permissionContext(context));
    return this.findRectificationInScope(id, context);
  }

  async updateRectification(
    id: string,
    dto: UpdateEngineeringRectificationDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringRectificationEntity> {
    this.accessPolicy.assertPermission(EngineeringRectificationPermission.UPDATE, this.permissionContext(context));
    const before = await this.findRectificationInScope(id, context);
    this.assertRectificationEditable(before);
    const attachmentIds = await this.attachmentService.normalizeAttachmentIds(context, dto.attachment_ids);
    const updated = await this.rectificationsRepository.updateRectification(context, context.actor.sub, id, this.toUpdateRectificationInput(dto, attachmentIds));
    await this.logRectificationChange("UPDATE", updated, context, this.rectificationSnapshot(before), this.rectificationSnapshot(updated));
    return updated;
  }

  async deleteRectification(id: string, context: EngineeringProjectRuntimeContext): Promise<{ id: string }> {
    this.accessPolicy.assertPermission(EngineeringRectificationPermission.DELETE, this.permissionContext(context));
    const before = await this.findRectificationInScope(id, context);
    if (![EngineeringRectificationStatus.PENDING, EngineeringRectificationStatus.REJECTED].includes(before.status)) {
      throw new BadRequestException("Only PENDING or REJECTED engineering rectifications can be deleted");
    }
    const result = await this.rectificationsRepository.softDelete(context, context.actor.sub, id);
    await this.logRectificationChange("DELETE", before, context, this.rectificationSnapshot(before), { isDeleted: true });
    return result;
  }

  async getProjectRectifications(projectId: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringRectificationEntity[]> {
    this.accessPolicy.assertPermission(EngineeringRectificationPermission.VIEW, this.permissionContext(context));
    await this.findProjectInScope(projectId, context);
    const result = await this.rectificationsRepository.paginateRectifications(
      context,
      { project_id: projectId, page: 1, page_size: 100, sort: "deadline" },
      (builder) => this.applyRectificationScope(builder, context)
    );
    return result.items;
  }

  async executeRectificationAction(
    id: string,
    dto: EngineeringRectificationActionDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringRectificationEntity> {
    this.accessPolicy.assertPermission(this.permissionForAction(dto.action), this.permissionContext(context));
    const before = await this.findRectificationInScope(id, context);
    this.assertActionPayload(dto);
    const updated = await this.stateMachine.transition(before, dto.action, this.transitionContext(before, dto, context), {
      feedback: dto.feedback ?? undefined,
      recheckComment: dto.recheck_comment ?? dto.comment ?? undefined
    });
    await this.syncIssueStatusAfterAction(updated, dto.action, context);
    await this.logRectificationChange("ACTION_" + dto.action, updated, context, this.rectificationSnapshot(before), this.rectificationSnapshot(updated));
    await this.publishActionEvent(dto.action, updated, context);
    return updated;
  }

  async scanOverdueRectifications(
    dto: EngineeringRectificationOverdueScanDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<{ today: string; scanned: number; markedOverdue: number; rectificationIds: string[] }> {
    this.accessPolicy.assertPermission(EngineeringRectificationPermission.UPDATE, this.permissionContext(context));
    const today = dto.today ?? new Date().toISOString().slice(0, 10);
    const candidates = await this.rectificationsRepository.findOverdueCandidates(context, today, (builder) =>
      this.applyRectificationScope(builder, context)
    );
    const rectificationIds: string[] = [];
    for (const candidate of candidates) {
      if (!this.stateMachine.isOverdue(candidate, today)) continue;
      if (!this.stateMachine.canTransition(candidate.status, EngineeringRectificationAction.MARK_OVERDUE)) continue;
      const updated = await this.stateMachine.transition(
        candidate,
        EngineeringRectificationAction.MARK_OVERDUE,
        this.transitionContext(
          candidate,
          {
            action: EngineeringRectificationAction.MARK_OVERDUE,
            reason: "RECTIFICATION_OVERDUE_SCAN",
            comment: `deadline ${candidate.deadline} is before ${today}`
          },
          context
        )
      );
      rectificationIds.push(updated.id);
      await this.logRectificationChange(
        "ACTION_" + EngineeringRectificationAction.MARK_OVERDUE,
        updated,
        context,
        this.rectificationSnapshot(candidate),
        this.rectificationSnapshot(updated)
      );
      await this.publishActionEvent(EngineeringRectificationAction.MARK_OVERDUE, updated, context);
    }
    return {
      today,
      scanned: candidates.length,
      markedOverdue: rectificationIds.length,
      rectificationIds
    };
  }

  private findProjectInScope(projectId: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringProjectEntity> {
    return this.projectsRepository.findById(context, projectId, (builder) => this.dataScopeAdapter.applyProjectScope(builder, context, context.actor));
  }

  private findIssueInScope(issueId: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringIssueEntity> {
    return this.issuesRepository.findById(context, issueId, (builder) => this.dataScopeAdapter.applyIssueScope(builder, context, context.actor));
  }

  private findRectificationInScope(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringRectificationEntity> {
    return this.rectificationsRepository.findById(context, id, (builder) => this.applyRectificationScope(builder, context));
  }

  private applyRectificationScope(
    builder: SelectQueryBuilder<EngineeringRectificationEntity>,
    context: EngineeringProjectRuntimeContext
  ): Promise<void> {
    return this.dataScopeAdapter.applyRectificationScope(builder, context, context.actor);
  }

  private assertRectificationEditable(rectification: EngineeringRectificationEntity): void {
    if ([EngineeringRectificationStatus.PASSED, EngineeringRectificationStatus.CLOSED].includes(rectification.status)) {
      throw new BadRequestException("PASSED or CLOSED engineering rectifications cannot be edited");
    }
  }

  private assertActionPayload(dto: EngineeringRectificationActionDto): void {
    if (dto.action === EngineeringRectificationAction.SUBMIT && !dto.feedback) {
      throw new BadRequestException("feedback is required when submitting engineering rectification");
    }
    if (dto.action === EngineeringRectificationAction.REJECT && !dto.recheck_comment && !dto.comment) {
      throw new BadRequestException("recheckComment is required when rejecting engineering rectification");
    }
  }

  private permissionForAction(action: EngineeringRectificationAction): EngineeringRectificationPermissionValue {
    if (action === EngineeringRectificationAction.SUBMIT) return EngineeringRectificationPermission.SUBMIT;
    if ([EngineeringRectificationAction.START_RECHECK, EngineeringRectificationAction.PASS, EngineeringRectificationAction.REJECT].includes(action)) {
      return EngineeringRectificationPermission.RECHECK;
    }
    if (action === EngineeringRectificationAction.CLOSE) return EngineeringRectificationPermission.CLOSE;
    return EngineeringRectificationPermission.UPDATE;
  }

  private async syncIssueStatusAfterAction(
    rectification: EngineeringRectificationEntity,
    action: EngineeringRectificationAction,
    context: EngineeringProjectRuntimeContext
  ): Promise<void> {
    if (!rectification.issueId) return;
    const issueStatus = this.issueStatusForAction(action);
    if (!issueStatus) return;
    await this.issuesRepository.updateIssue(context, context.actor.sub, rectification.issueId, {
      issueStatus,
      closedAt: issueStatus === EngineeringIssueStatus.CLOSED ? new Date() : null,
      closedBy: issueStatus === EngineeringIssueStatus.CLOSED ? context.actor.sub : null
    });
  }

  private issueStatusForAction(action: EngineeringRectificationAction): EngineeringIssueStatus | null {
    if (action === EngineeringRectificationAction.START) return EngineeringIssueStatus.RECTIFYING;
    if (action === EngineeringRectificationAction.SUBMIT || action === EngineeringRectificationAction.START_RECHECK) return EngineeringIssueStatus.RECHECKING;
    if (action === EngineeringRectificationAction.REJECT) return EngineeringIssueStatus.RECTIFYING;
    if (action === EngineeringRectificationAction.PASS || action === EngineeringRectificationAction.CLOSE) return EngineeringIssueStatus.CLOSED;
    return null;
  }

  private async publishActionEvent(
    action: EngineeringRectificationAction,
    rectification: EngineeringRectificationEntity,
    context: EngineeringProjectRuntimeContext
  ): Promise<void> {
    const eventType = this.eventTypeForAction(action);
    if (!eventType) return;
    await this.publishRectificationEvent(eventType, rectification, context, {
      rectificationCode: rectification.rectificationCode,
      issueId: rectification.issueId,
      status: rectification.status,
      ...(eventType === "EngineeringRectificationOverdueEvent" && rectification.responsibleUserId
        ? {
            notificationRecipients: [rectification.responsibleUserId],
            notificationTitle: "整改任务已逾期",
            notificationContent: `${rectification.rectificationCode} ${rectification.rectificationTitle} 已逾期，请立即跟进。`,
            notificationTargetUrl: `/engineering/rectifications/${rectification.id}`,
            notificationPriority: "urgent"
          }
        : {})
    });
  }

  private eventTypeForAction(
    action: EngineeringRectificationAction
  ):
    | "EngineeringRectificationSubmittedEvent"
    | "EngineeringRectificationPassedEvent"
    | "EngineeringRectificationRejectedEvent"
    | "EngineeringRectificationOverdueEvent"
    | null {
    if (action === EngineeringRectificationAction.SUBMIT) return "EngineeringRectificationSubmittedEvent";
    if (action === EngineeringRectificationAction.PASS) return "EngineeringRectificationPassedEvent";
    if (action === EngineeringRectificationAction.REJECT) return "EngineeringRectificationRejectedEvent";
    if (action === EngineeringRectificationAction.MARK_OVERDUE) return "EngineeringRectificationOverdueEvent";
    return null;
  }

  private toCreateRectificationInput(
    dto: CreateEngineeringRectificationDto,
    project: EngineeringProjectEntity,
    issue: EngineeringIssueEntity | null,
    attachmentIds: string[] | null
  ): CreateEngineeringRectificationInput {
    return {
      orgId: project.orgId,
      projectId: project.id,
      issueId: issue?.id ?? dto.issue_id ?? null,
      inspectionId: dto.inspection_id ?? issue?.inspectionId ?? null,
      rectificationTitle: dto.rectification_title,
      description: dto.description,
      severity: dto.severity,
      responsibleUserId: dto.responsible_user_id ?? issue?.responsibleUserId ?? null,
      responsibleOrgId: dto.responsible_org_id ?? issue?.responsibleOrgId ?? null,
      contractorOrgId: dto.contractor_org_id ?? issue?.contractorOrgId ?? null,
      supervisorOrgId: dto.supervisor_org_id ?? issue?.supervisorOrgId ?? null,
      locationText: dto.location_text ?? issue?.locationText ?? null,
      buildingId: dto.building_id ?? issue?.buildingId ?? null,
      floorId: dto.floor_id ?? issue?.floorId ?? null,
      spaceId: dto.space_id ?? issue?.spaceId ?? null,
      deadline: dto.deadline ?? issue?.deadline ?? null,
      attachmentIds,
      remark: dto.remark ?? null
    };
  }

  private toUpdateRectificationInput(
    dto: UpdateEngineeringRectificationDto,
    attachmentIds: string[] | null | undefined
  ): UpdateEngineeringRectificationInput {
    const input: UpdateEngineeringRectificationInput = {};
    this.assignIfDefined(input, "rectificationTitle", dto.rectification_title);
    this.assignIfDefined(input, "description", dto.description);
    this.assignIfDefined(input, "severity", dto.severity);
    this.assignIfDefined(input, "responsibleUserId", dto.responsible_user_id ?? undefined);
    this.assignIfDefined(input, "responsibleOrgId", dto.responsible_org_id ?? undefined);
    this.assignIfDefined(input, "contractorOrgId", dto.contractor_org_id ?? undefined);
    this.assignIfDefined(input, "supervisorOrgId", dto.supervisor_org_id ?? undefined);
    this.assignIfDefined(input, "locationText", dto.location_text ?? undefined);
    this.assignIfDefined(input, "buildingId", dto.building_id ?? undefined);
    this.assignIfDefined(input, "floorId", dto.floor_id ?? undefined);
    this.assignIfDefined(input, "spaceId", dto.space_id ?? undefined);
    this.assignIfDefined(input, "deadline", dto.deadline ?? undefined);
    this.assignIfDefined(input, "attachmentIds", attachmentIds);
    this.assignIfDefined(input, "remark", dto.remark ?? undefined);
    return input;
  }

  private transitionContext(
    rectification: EngineeringRectificationEntity,
    dto: EngineeringRectificationActionDto,
    context: EngineeringProjectRuntimeContext
  ): EngineeringRectificationTransitionContext {
    return {
      tenantId: context.tenantId,
      parkId: context.parkId,
      actorUserId: context.actor.sub,
      actorName: context.actor.realName ?? context.actor.username,
      actorRoleCodes: context.actor.roles,
      actorPermissions: context.actor.permissions,
      projectId: rectification.projectId,
      rectificationId: rectification.id,
      reason: dto.reason ?? dto.action,
      comment: dto.comment ?? null,
      requestId: context.requestId ?? null,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null
    };
  }

  private async logRectificationChange(
    action: string,
    rectification: EngineeringRectificationEntity,
    context: EngineeringProjectRuntimeContext,
    beforeJson: Record<string, unknown> | null,
    afterJson: Record<string, unknown> | null
  ): Promise<void> {
    await this.auditLogger.logRectificationChanged({
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: rectification.projectId,
      rectificationId: rectification.id,
      issueId: rectification.issueId,
      action,
      actorUserId: context.actor.sub,
      actorName: context.actor.realName ?? context.actor.username,
      actorRoleCodes: context.actor.roles,
      beforeJson,
      afterJson,
      requestId: context.requestId ?? null,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null
    });
  }

  private async publishRectificationEvent(
    eventType:
      | "EngineeringRectificationCreatedEvent"
      | "EngineeringRectificationSubmittedEvent"
      | "EngineeringRectificationPassedEvent"
      | "EngineeringRectificationRejectedEvent"
      | "EngineeringRectificationOverdueEvent",
    rectification: EngineeringRectificationEntity,
    context: EngineeringProjectRuntimeContext,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.eventPublisher.publishRectificationEvent({
      eventType,
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: rectification.projectId,
      rectificationId: rectification.id,
      issueId: rectification.issueId,
      actorUserId: context.actor.sub,
      payload
    });
  }

  private rectificationSnapshot(rectification: EngineeringRectificationEntity): Record<string, unknown> {
    return {
      id: rectification.id,
      projectId: rectification.projectId,
      issueId: rectification.issueId,
      inspectionId: rectification.inspectionId,
      rectificationCode: rectification.rectificationCode,
      rectificationTitle: rectification.rectificationTitle,
      severity: rectification.severity,
      status: rectification.status,
      responsibleUserId: rectification.responsibleUserId,
      responsibleOrgId: rectification.responsibleOrgId,
      contractorOrgId: rectification.contractorOrgId,
      deadline: rectification.deadline
    };
  }

  private assignIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
    if (value !== undefined) {
      target[key] = value;
    }
  }

  private permissionContext(context: EngineeringProjectRuntimeContext): { actorPermissions: string[] } {
    return { actorPermissions: context.actor.permissions };
  }
}
