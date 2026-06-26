import { BadRequestException, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "@jinhu/shared";
import type { SelectQueryBuilder } from "typeorm";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import {
  CreateEngineeringPlanDto,
  EngineeringPlanQueryDto,
  UpdateEngineeringPlanDto,
  UpdateEngineeringPlanProgressDto,
  UpdateEngineeringPlanStatusDto
} from "./dto/engineering-plan.dto";
import { EngineeringPlanStatus } from "./domain/engineering-project.enums";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringAttachmentService } from "./engineering-attachment.service";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringPlanAccessPolicy, EngineeringPlanPermission } from "./policies/engineering-plan-access.policy";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";
import {
  EngineeringPlanRepository,
  type CreateEngineeringPlanInput,
  type UpdateEngineeringPlanInput,
  type UpdateEngineeringPlanStatusInput
} from "./repositories/engineering-plan.repository";

@Injectable()
export class EngineeringPlanService {
  constructor(
    private readonly plansRepository: EngineeringPlanRepository,
    private readonly projectsRepository: EngineeringProjectRepository,
    private readonly accessPolicy: EngineeringPlanAccessPolicy,
    private readonly dataScopeAdapter: EngineeringDataScopeAdapter,
    private readonly attachmentService: EngineeringAttachmentService,
    private readonly auditLogger: EngineeringAuditLogger,
    private readonly eventPublisher: EngineeringEventPublisher
  ) {}

  async createPlan(dto: CreateEngineeringPlanDto, context: EngineeringProjectRuntimeContext): Promise<EngineeringPlanEntity> {
    this.accessPolicy.assertPermission(EngineeringPlanPermission.CREATE, this.permissionContext(context));
    const project = await this.findProjectInScope(dto.project_id, context);
    await this.assertParentPlan(project.id, dto.parent_plan_id ?? null, context);
    this.assertDateRange(dto.planned_start_date ?? null, dto.planned_end_date ?? null);
    const attachmentIds = await this.attachmentService.normalizeAttachmentIds(context, dto.attachment_ids);

    const plan = await this.plansRepository.createPlan(context, context.actor.sub, this.toCreateInput(dto, project, attachmentIds ?? null));
    await this.auditLogger.logPlanChanged({
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: plan.projectId,
      planId: plan.id,
      action: "CREATE",
      actorUserId: context.actor.sub,
      actorName: context.actor.realName ?? context.actor.username,
      actorRoleCodes: context.actor.roles,
      afterJson: this.planSnapshot(plan),
      requestId: context.requestId ?? null,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null
    });
    await this.eventPublisher.publishPlanEvent({
      eventType: "EngineeringPlanCreatedEvent",
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: plan.projectId,
      planId: plan.id,
      actorUserId: context.actor.sub,
      payload: { planCode: plan.planCode, planName: plan.planName, planType: plan.planType }
    });
    return plan;
  }

  async paginatePlans(query: EngineeringPlanQueryDto, context: EngineeringProjectRuntimeContext): Promise<PaginatedResult<EngineeringPlanEntity>> {
    this.accessPolicy.assertPermission(EngineeringPlanPermission.VIEW, this.permissionContext(context));
    if (query.project_id) {
      await this.findProjectInScope(query.project_id, context);
    }
    return this.plansRepository.paginatePlans(context, query, (builder) => this.applyPlanScope(builder, context));
  }

  async getPlanDetail(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringPlanEntity> {
    this.accessPolicy.assertPermission(EngineeringPlanPermission.VIEW, this.permissionContext(context));
    return this.findPlanInScope(id, context);
  }

  async updatePlan(id: string, dto: UpdateEngineeringPlanDto, context: EngineeringProjectRuntimeContext): Promise<EngineeringPlanEntity> {
    this.accessPolicy.assertPermission(EngineeringPlanPermission.UPDATE, this.permissionContext(context));
    const before = await this.findPlanInScope(id, context);
    const parentPlanId = dto.parent_plan_id === undefined ? before.parentPlanId : dto.parent_plan_id ?? null;
    await this.assertParentPlan(before.projectId, parentPlanId, context, before.id);
    this.assertDateRange(dto.planned_start_date ?? before.plannedStartDate, dto.planned_end_date ?? before.plannedEndDate);
    const attachmentIds = await this.attachmentService.normalizeAttachmentIds(context, dto.attachment_ids);

    const updated = await this.plansRepository.updatePlan(context, context.actor.sub, id, this.toUpdateInput(dto, attachmentIds));
    await this.auditLogger.logPlanChanged({
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: updated.projectId,
      planId: updated.id,
      action: "UPDATE",
      actorUserId: context.actor.sub,
      actorName: context.actor.realName ?? context.actor.username,
      actorRoleCodes: context.actor.roles,
      beforeJson: this.planSnapshot(before),
      afterJson: this.planSnapshot(updated),
      requestId: context.requestId ?? null,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null
    });
    await this.eventPublisher.publishPlanEvent({
      eventType: "EngineeringPlanUpdatedEvent",
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: updated.projectId,
      planId: updated.id,
      actorUserId: context.actor.sub,
      payload: { planCode: updated.planCode, planName: updated.planName }
    });
    return updated;
  }

  async deletePlan(id: string, context: EngineeringProjectRuntimeContext): Promise<{ id: string }> {
    this.accessPolicy.assertPermission(EngineeringPlanPermission.DELETE, this.permissionContext(context));
    const before = await this.findPlanInScope(id, context);
    const result = await this.plansRepository.softDelete(context, context.actor.sub, id);
    await this.auditLogger.logPlanChanged({
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: before.projectId,
      planId: before.id,
      action: "DELETE",
      actorUserId: context.actor.sub,
      actorName: context.actor.realName ?? context.actor.username,
      actorRoleCodes: context.actor.roles,
      beforeJson: this.planSnapshot(before),
      afterJson: { isDeleted: true },
      requestId: context.requestId ?? null,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null
    });
    return result;
  }

  async getProjectPlans(projectId: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringPlanEntity[]> {
    this.accessPolicy.assertPermission(EngineeringPlanPermission.VIEW, this.permissionContext(context));
    await this.findProjectInScope(projectId, context);
    return this.plansRepository.findByProjectId(context, projectId, (builder) => this.applyPlanScope(builder, context));
  }

  async updateProgress(id: string, dto: UpdateEngineeringPlanProgressDto, context: EngineeringProjectRuntimeContext): Promise<EngineeringPlanEntity> {
    this.accessPolicy.assertPermission(EngineeringPlanPermission.UPDATE, this.permissionContext(context));
    this.assertProgress(dto.actual_progress_percent);
    const before = await this.findPlanInScope(id, context);
    const delayDays = this.calculateDelayDays(before.plannedEndDate, dto.actual_progress_percent >= 100 ? EngineeringPlanStatus.COMPLETED : before.status);
    const status = this.nextStatusForProgress(before.status, dto.actual_progress_percent, delayDays);
    const updated = await this.plansRepository.updateProgress(context, context.actor.sub, id, {
      actualProgressPercent: dto.actual_progress_percent,
      actualStartDate: dto.actual_start_date ?? before.actualStartDate,
      actualEndDate: dto.actual_end_date ?? before.actualEndDate,
      status,
      delayDays
    });
    await this.auditLogger.logPlanChanged({
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: updated.projectId,
      planId: updated.id,
      action: "UPDATE_PROGRESS",
      actorUserId: context.actor.sub,
      actorName: context.actor.realName ?? context.actor.username,
      actorRoleCodes: context.actor.roles,
      beforeJson: this.planSnapshot(before),
      afterJson: { actualProgressPercent: updated.actualProgressPercent, status: updated.status, comment: dto.comment ?? null },
      requestId: context.requestId ?? null,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null
    });
    await this.eventPublisher.publishPlanEvent({
      eventType: "EngineeringPlanProgressUpdatedEvent",
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: updated.projectId,
      planId: updated.id,
      actorUserId: context.actor.sub,
      payload: {
        beforeProgress: before.actualProgressPercent,
        afterProgress: updated.actualProgressPercent,
        status: updated.status,
        comment: dto.comment ?? null
      }
    });
    await this.publishTerminalPlanEvents(before, updated, context);
    return updated;
  }

  async updateStatus(id: string, dto: UpdateEngineeringPlanStatusDto, context: EngineeringProjectRuntimeContext): Promise<EngineeringPlanEntity> {
    const permission = dto.status === EngineeringPlanStatus.APPROVED ? EngineeringPlanPermission.APPROVE : EngineeringPlanPermission.UPDATE;
    this.accessPolicy.assertPermission(permission, this.permissionContext(context));
    const before = await this.findPlanInScope(id, context);
    const input = this.toStatusInput(before, dto.status);
    const updated = await this.plansRepository.updateStatus(context, context.actor.sub, id, input);
    await this.auditLogger.logPlanChanged({
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: updated.projectId,
      planId: updated.id,
      action: "UPDATE_STATUS",
      actorUserId: context.actor.sub,
      actorName: context.actor.realName ?? context.actor.username,
      actorRoleCodes: context.actor.roles,
      beforeJson: this.planSnapshot(before),
      afterJson: { status: updated.status, reason: dto.reason, comment: dto.comment ?? null },
      requestId: context.requestId ?? null,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null
    });
    await this.eventPublisher.publishPlanEvent({
      eventType: "EngineeringPlanStatusChangedEvent",
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: updated.projectId,
      planId: updated.id,
      actorUserId: context.actor.sub,
      payload: {
        fromStatus: before.status,
        toStatus: updated.status,
        reason: dto.reason,
        comment: dto.comment ?? null
      }
    });
    await this.publishTerminalPlanEvents(before, updated, context);
    return updated;
  }

  private findProjectInScope(projectId: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringProjectEntity> {
    return this.projectsRepository.findById(context, projectId, (builder) => this.dataScopeAdapter.applyProjectScope(builder, context, context.actor));
  }

  private findPlanInScope(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringPlanEntity> {
    return this.plansRepository.findById(context, id, (builder) => this.applyPlanScope(builder, context));
  }

  private applyPlanScope(builder: SelectQueryBuilder<EngineeringPlanEntity>, context: EngineeringProjectRuntimeContext): Promise<void> {
    return this.dataScopeAdapter.applyPlanScope(builder, context, context.actor);
  }

  private async assertParentPlan(
    projectId: string,
    parentPlanId: string | null,
    context: EngineeringProjectRuntimeContext,
    selfPlanId?: string
  ): Promise<void> {
    if (!parentPlanId) return;
    if (selfPlanId && parentPlanId === selfPlanId) {
      throw new BadRequestException("Engineering plan cannot use itself as parent plan");
    }
    const parentPlan = await this.findPlanInScope(parentPlanId, context);
    if (parentPlan.projectId !== projectId) {
      throw new BadRequestException("Parent engineering plan must belong to the same project");
    }
  }

  private assertDateRange(startDate: string | null | undefined, endDate: string | null | undefined): void {
    if (!startDate || !endDate) return;
    if (this.dateOnly(endDate).getTime() < this.dateOnly(startDate).getTime()) {
      throw new BadRequestException("plannedEndDate cannot be earlier than plannedStartDate");
    }
  }

  private assertProgress(progress: number): void {
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      throw new BadRequestException("actualProgressPercent must be between 0 and 100");
    }
  }

  private nextStatusForProgress(currentStatus: EngineeringPlanStatus, progress: number, delayDays: number): EngineeringPlanStatus | undefined {
    if (progress >= 100) return EngineeringPlanStatus.COMPLETED;
    if (delayDays > 0 && currentStatus !== EngineeringPlanStatus.CANCELLED) return EngineeringPlanStatus.DELAYED;
    return currentStatus === EngineeringPlanStatus.DRAFT || currentStatus === EngineeringPlanStatus.SUBMITTED ? EngineeringPlanStatus.IN_PROGRESS : undefined;
  }

  private toStatusInput(before: EngineeringPlanEntity, requestedStatus: EngineeringPlanStatus): UpdateEngineeringPlanStatusInput {
    if (requestedStatus === EngineeringPlanStatus.COMPLETED) {
      return { status: EngineeringPlanStatus.COMPLETED, actualProgressPercent: 100, delayDays: 0 };
    }
    const delayDays = this.calculateDelayDays(before.plannedEndDate, requestedStatus);
    const status =
      delayDays > 0 && requestedStatus !== EngineeringPlanStatus.CANCELLED && requestedStatus !== EngineeringPlanStatus.DELAYED
        ? EngineeringPlanStatus.DELAYED
        : requestedStatus;
    return { status, delayDays };
  }

  private calculateDelayDays(plannedEndDate: string | null, status: EngineeringPlanStatus): number {
    if (!plannedEndDate || status === EngineeringPlanStatus.COMPLETED || status === EngineeringPlanStatus.CANCELLED) {
      return 0;
    }
    const plannedEnd = this.dateOnly(plannedEndDate).getTime();
    const today = this.dateOnly(new Date()).getTime();
    if (today <= plannedEnd) return 0;
    return Math.ceil((today - plannedEnd) / 86_400_000);
  }

  private dateOnly(value: string | Date): Date {
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const parts = value.split("-").map((item) => Number(item));
    const year = parts[0] ?? 1970;
    const month = parts[1] ?? 1;
    const day = parts[2] ?? 1;
    return new Date(year, month - 1, day);
  }

  private async publishTerminalPlanEvents(
    before: EngineeringPlanEntity,
    updated: EngineeringPlanEntity,
    context: EngineeringProjectRuntimeContext
  ): Promise<void> {
    if (before.status !== EngineeringPlanStatus.COMPLETED && updated.status === EngineeringPlanStatus.COMPLETED) {
      await this.eventPublisher.publishPlanEvent({
        eventType: "EngineeringPlanCompletedEvent",
        tenantId: context.tenantId,
        parkId: context.parkId,
        projectId: updated.projectId,
        planId: updated.id,
        actorUserId: context.actor.sub,
        payload: { actualProgressPercent: updated.actualProgressPercent }
      });
    }
    if (before.status !== EngineeringPlanStatus.DELAYED && updated.status === EngineeringPlanStatus.DELAYED) {
      await this.eventPublisher.publishPlanEvent({
        eventType: "EngineeringPlanDelayedEvent",
        tenantId: context.tenantId,
        parkId: context.parkId,
        projectId: updated.projectId,
        planId: updated.id,
        actorUserId: context.actor.sub,
        payload: { delayDays: updated.delayDays }
      });
    }
  }

  private permissionContext(context: EngineeringProjectRuntimeContext): { actorPermissions: string[] } {
    return { actorPermissions: context.actor.permissions };
  }

  private toCreateInput(dto: CreateEngineeringPlanDto, project: EngineeringProjectEntity, attachmentIds: string[] | null): CreateEngineeringPlanInput {
    return {
      orgId: project.orgId,
      projectId: dto.project_id,
      planName: dto.plan_name,
      planType: dto.plan_type,
      parentPlanId: dto.parent_plan_id ?? null,
      planLevel: dto.plan_level,
      description: dto.description ?? null,
      plannedStartDate: dto.planned_start_date ?? null,
      plannedEndDate: dto.planned_end_date ?? null,
      plannedProgressPercent: dto.planned_progress_percent,
      weight: this.toAmount(dto.weight),
      ownerUserId: dto.owner_user_id ?? null,
      ownerOrgId: dto.owner_org_id ?? null,
      contractorOrgId: dto.contractor_org_id ?? null,
      riskLevel: dto.risk_level,
      sortOrder: dto.sort_order,
      attachmentIds,
      remark: dto.remark ?? null
    };
  }

  private toUpdateInput(dto: UpdateEngineeringPlanDto, attachmentIds: string[] | null | undefined): UpdateEngineeringPlanInput {
    const input: UpdateEngineeringPlanInput = {};
    this.assignIfDefined(input, "planName", dto.plan_name);
    this.assignIfDefined(input, "planType", dto.plan_type);
    this.assignIfDefined(input, "parentPlanId", dto.parent_plan_id ?? undefined);
    this.assignIfDefined(input, "planLevel", dto.plan_level);
    this.assignIfDefined(input, "description", dto.description ?? undefined);
    this.assignIfDefined(input, "plannedStartDate", dto.planned_start_date);
    this.assignIfDefined(input, "plannedEndDate", dto.planned_end_date);
    this.assignIfDefined(input, "actualStartDate", dto.actual_start_date);
    this.assignIfDefined(input, "actualEndDate", dto.actual_end_date);
    this.assignIfDefined(input, "plannedProgressPercent", dto.planned_progress_percent);
    this.assignIfDefined(input, "actualProgressPercent", dto.actual_progress_percent);
    this.assignIfDefined(input, "weight", this.toAmount(dto.weight));
    this.assignIfDefined(input, "ownerUserId", dto.owner_user_id ?? undefined);
    this.assignIfDefined(input, "ownerOrgId", dto.owner_org_id ?? undefined);
    this.assignIfDefined(input, "contractorOrgId", dto.contractor_org_id ?? undefined);
    this.assignIfDefined(input, "riskLevel", dto.risk_level);
    this.assignIfDefined(input, "sortOrder", dto.sort_order);
    this.assignIfDefined(input, "attachmentIds", attachmentIds);
    this.assignIfDefined(input, "remark", dto.remark ?? undefined);
    return input;
  }

  private assignIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
    if (value !== undefined) {
      target[key] = value;
    }
  }

  private toAmount(value: number | undefined): string | undefined {
    return value === undefined ? undefined : Number(value).toFixed(2);
  }

  private planSnapshot(plan: EngineeringPlanEntity): Record<string, unknown> {
    return {
      id: plan.id,
      projectId: plan.projectId,
      planCode: plan.planCode,
      planName: plan.planName,
      planType: plan.planType,
      status: plan.status,
      actualProgressPercent: plan.actualProgressPercent,
      delayDays: plan.delayDays,
      attachmentIds: plan.attachmentIds
    };
  }
}
