import { BadRequestException, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "@jinhu/shared";
import type { SelectQueryBuilder } from "typeorm";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import {
  CreateEngineeringAcceptanceDto,
  EngineeringAcceptanceQueryDto,
  ReviewEngineeringAcceptanceDto,
  UpdateEngineeringAcceptanceDto
} from "./dto/engineering-acceptance.dto";
import { EngineeringAcceptanceStatus } from "./domain/engineering-project.enums";
import { EngineeringAcceptanceEntity } from "./entities/engineering-acceptance.entity";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringAttachmentService } from "./engineering-attachment.service";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import {
  EngineeringAcceptanceAccessPolicy,
  EngineeringAcceptancePermission
} from "./policies/engineering-acceptance-access.policy";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringPlanRepository } from "./repositories/engineering-plan.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";
import {
  EngineeringAcceptanceRepository,
  type CreateEngineeringAcceptanceInput,
  type UpdateEngineeringAcceptanceInput
} from "./repositories/engineering-acceptance.repository";

@Injectable()
export class EngineeringAcceptanceService {
  constructor(
    private readonly acceptancesRepository: EngineeringAcceptanceRepository,
    private readonly projectsRepository: EngineeringProjectRepository,
    private readonly plansRepository: EngineeringPlanRepository,
    private readonly accessPolicy: EngineeringAcceptanceAccessPolicy,
    private readonly dataScopeAdapter: EngineeringDataScopeAdapter,
    private readonly attachmentService: EngineeringAttachmentService,
    private readonly auditLogger: EngineeringAuditLogger,
    private readonly eventPublisher: EngineeringEventPublisher
  ) {}

  async createAcceptance(dto: CreateEngineeringAcceptanceDto, context: EngineeringProjectRuntimeContext): Promise<EngineeringAcceptanceEntity> {
    this.accessPolicy.assertPermission(EngineeringAcceptancePermission.CREATE, this.permissionContext(context));
    const project = await this.findProjectInScope(dto.project_id, context);
    if (dto.plan_id) {
      await this.assertPlanBelongsToProject(dto.plan_id, project.id, context);
    }
    const attachmentIds = await this.attachmentService.normalizeAttachmentIds(context, dto.attachment_ids);
    const acceptance = await this.acceptancesRepository.createAcceptance(context, context.actor.sub, this.toCreateInput(dto, project, attachmentIds ?? null));
    await this.logChange("CREATE", acceptance, context, null, this.acceptanceSnapshot(acceptance));
    await this.publishAcceptanceEvent("EngineeringAcceptanceCreatedEvent", acceptance, context, {
      acceptanceCode: acceptance.acceptanceCode,
      acceptanceType: acceptance.acceptanceType
    });
    return acceptance;
  }

  async paginateAcceptances(
    query: EngineeringAcceptanceQueryDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<PaginatedResult<EngineeringAcceptanceEntity>> {
    this.accessPolicy.assertPermission(EngineeringAcceptancePermission.VIEW, this.permissionContext(context));
    if (query.project_id) {
      await this.findProjectInScope(query.project_id, context);
    }
    return this.acceptancesRepository.paginateAcceptances(context, query, (builder) => this.applyAcceptanceScope(builder, context));
  }

  async getAcceptanceDetail(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringAcceptanceEntity> {
    this.accessPolicy.assertPermission(EngineeringAcceptancePermission.VIEW, this.permissionContext(context));
    return this.findAcceptanceInScope(id, context);
  }

  async updateAcceptance(
    id: string,
    dto: UpdateEngineeringAcceptanceDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringAcceptanceEntity> {
    this.accessPolicy.assertPermission(EngineeringAcceptancePermission.UPDATE, this.permissionContext(context));
    const before = await this.findAcceptanceInScope(id, context);
    this.assertEditable(before);
    if (dto.plan_id) {
      await this.assertPlanBelongsToProject(dto.plan_id, before.projectId, context);
    }
    const attachmentIds = await this.attachmentService.normalizeAttachmentIds(context, dto.attachment_ids);
    const updated = await this.acceptancesRepository.updateAcceptance(context, context.actor.sub, id, this.toUpdateInput(dto, attachmentIds));
    await this.logChange("UPDATE", updated, context, this.acceptanceSnapshot(before), this.acceptanceSnapshot(updated));
    await this.publishAcceptanceEvent("EngineeringAcceptanceUpdatedEvent", updated, context, {
      acceptanceCode: updated.acceptanceCode,
      acceptanceStatus: updated.acceptanceStatus
    });
    return updated;
  }

  async deleteAcceptance(id: string, context: EngineeringProjectRuntimeContext): Promise<{ id: string }> {
    this.accessPolicy.assertPermission(EngineeringAcceptancePermission.DELETE, this.permissionContext(context));
    const before = await this.findAcceptanceInScope(id, context);
    if (before.acceptanceStatus !== EngineeringAcceptanceStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT engineering acceptances can be deleted");
    }
    const result = await this.acceptancesRepository.softDelete(context, context.actor.sub, id);
    await this.logChange("DELETE", before, context, this.acceptanceSnapshot(before), { isDeleted: true });
    await this.publishAcceptanceEvent("EngineeringAcceptanceDeletedEvent", before, context, {
      acceptanceCode: before.acceptanceCode,
      acceptanceStatus: before.acceptanceStatus
    });
    return result;
  }

  async submitAcceptance(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringAcceptanceEntity> {
    this.accessPolicy.assertPermission(EngineeringAcceptancePermission.SUBMIT, this.permissionContext(context));
    const before = await this.findAcceptanceInScope(id, context);
    this.assertSubmittable(before);
    const updated = await this.acceptancesRepository.updateStatus(context, context.actor.sub, id, {
      acceptanceStatus: EngineeringAcceptanceStatus.SUBMITTED,
      submittedAt: new Date(),
      submittedBy: context.actor.sub
    });
    await this.logChange("SUBMIT", updated, context, this.acceptanceSnapshot(before), this.acceptanceSnapshot(updated));
    await this.publishAcceptanceEvent("EngineeringAcceptanceSubmittedEvent", updated, context, {
      fromStatus: before.acceptanceStatus,
      toStatus: updated.acceptanceStatus,
      acceptanceCode: updated.acceptanceCode
    });
    return updated;
  }

  async reviewAcceptance(
    id: string,
    dto: ReviewEngineeringAcceptanceDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringAcceptanceEntity> {
    this.accessPolicy.assertPermission(EngineeringAcceptancePermission.REVIEW, this.permissionContext(context));
    const before = await this.findAcceptanceInScope(id, context);
    if (before.acceptanceStatus !== EngineeringAcceptanceStatus.SUBMITTED && before.acceptanceStatus !== EngineeringAcceptanceStatus.REVIEWING) {
      throw new BadRequestException("Only SUBMITTED or REVIEWING engineering acceptances can be reviewed");
    }
    const nextStatus = this.reviewStatus(dto);
    const updated = await this.acceptancesRepository.updateStatus(context, context.actor.sub, id, {
      acceptanceStatus: nextStatus,
      actualAcceptanceDate: dto.actual_acceptance_date ?? before.actualAcceptanceDate ?? new Date().toISOString().slice(0, 10),
      reviewedAt: new Date(),
      reviewedBy: context.actor.sub,
      reviewComment: dto.review_comment ?? null,
      resultSummary: dto.result_summary ?? null
    });
    await this.logChange("REVIEW_" + nextStatus, updated, context, this.acceptanceSnapshot(before), this.acceptanceSnapshot(updated));
    await this.publishAcceptanceEvent(this.eventTypeForReviewStatus(nextStatus), updated, context, {
      fromStatus: before.acceptanceStatus,
      toStatus: updated.acceptanceStatus,
      acceptanceCode: updated.acceptanceCode,
      reviewComment: dto.review_comment ?? null
    });
    return updated;
  }

  async closeAcceptance(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringAcceptanceEntity> {
    this.accessPolicy.assertPermission(EngineeringAcceptancePermission.CLOSE, this.permissionContext(context));
    const before = await this.findAcceptanceInScope(id, context);
    if (
      ![
        EngineeringAcceptanceStatus.PASSED,
        EngineeringAcceptanceStatus.FAILED,
        EngineeringAcceptanceStatus.RECTIFICATION_REQUIRED
      ].includes(before.acceptanceStatus)
    ) {
      throw new BadRequestException("Only reviewed engineering acceptances can be closed");
    }
    const updated = await this.acceptancesRepository.updateStatus(context, context.actor.sub, id, {
      acceptanceStatus: EngineeringAcceptanceStatus.CLOSED,
      closedAt: new Date(),
      closedBy: context.actor.sub
    });
    await this.logChange("CLOSE", updated, context, this.acceptanceSnapshot(before), this.acceptanceSnapshot(updated));
    await this.publishAcceptanceEvent("EngineeringAcceptanceClosedEvent", updated, context, {
      fromStatus: before.acceptanceStatus,
      toStatus: updated.acceptanceStatus,
      acceptanceCode: updated.acceptanceCode
    });
    return updated;
  }

  async getProjectAcceptances(projectId: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringAcceptanceEntity[]> {
    this.accessPolicy.assertPermission(EngineeringAcceptancePermission.VIEW, this.permissionContext(context));
    await this.findProjectInScope(projectId, context);
    return this.acceptancesRepository.findByProjectId(context, projectId, {}, (builder) => this.applyAcceptanceScope(builder, context));
  }

  private findProjectInScope(projectId: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringProjectEntity> {
    return this.projectsRepository.findById(context, projectId, (builder) => this.dataScopeAdapter.applyProjectScope(builder, context, context.actor));
  }

  private findPlanInScope(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringPlanEntity> {
    return this.plansRepository.findById(context, id, (builder) => this.dataScopeAdapter.applyPlanScope(builder, context, context.actor));
  }

  private findAcceptanceInScope(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringAcceptanceEntity> {
    return this.acceptancesRepository.findById(context, id, (builder) => this.applyAcceptanceScope(builder, context));
  }

  private applyAcceptanceScope(builder: SelectQueryBuilder<EngineeringAcceptanceEntity>, context: EngineeringProjectRuntimeContext): Promise<void> {
    return this.dataScopeAdapter.applyAcceptanceScope(builder, context, context.actor);
  }

  private async assertPlanBelongsToProject(planId: string, projectId: string, context: EngineeringProjectRuntimeContext): Promise<void> {
    const plan = await this.findPlanInScope(planId, context);
    if (plan.projectId !== projectId) {
      throw new BadRequestException("Engineering acceptance plan must belong to the same project");
    }
  }

  private assertEditable(acceptance: EngineeringAcceptanceEntity): void {
    if (
      ![
        EngineeringAcceptanceStatus.DRAFT,
        EngineeringAcceptanceStatus.FAILED,
        EngineeringAcceptanceStatus.RECTIFICATION_REQUIRED
      ].includes(acceptance.acceptanceStatus)
    ) {
      throw new BadRequestException("Only DRAFT, FAILED or RECTIFICATION_REQUIRED engineering acceptances can be edited");
    }
  }

  private assertSubmittable(acceptance: EngineeringAcceptanceEntity): void {
    if (
      ![
        EngineeringAcceptanceStatus.DRAFT,
        EngineeringAcceptanceStatus.FAILED,
        EngineeringAcceptanceStatus.RECTIFICATION_REQUIRED
      ].includes(acceptance.acceptanceStatus)
    ) {
      throw new BadRequestException("Only DRAFT, FAILED or RECTIFICATION_REQUIRED engineering acceptances can be submitted");
    }
  }

  private reviewStatus(dto: ReviewEngineeringAcceptanceDto): EngineeringAcceptanceStatus {
    if (dto.passed) return EngineeringAcceptanceStatus.PASSED;
    if (dto.rectification_required) return EngineeringAcceptanceStatus.RECTIFICATION_REQUIRED;
    return EngineeringAcceptanceStatus.FAILED;
  }

  private eventTypeForReviewStatus(
    status: EngineeringAcceptanceStatus
  ):
    | "EngineeringAcceptancePassedEvent"
    | "EngineeringAcceptanceFailedEvent"
    | "EngineeringAcceptanceRectificationRequiredEvent" {
    if (status === EngineeringAcceptanceStatus.PASSED) return "EngineeringAcceptancePassedEvent";
    if (status === EngineeringAcceptanceStatus.RECTIFICATION_REQUIRED) return "EngineeringAcceptanceRectificationRequiredEvent";
    return "EngineeringAcceptanceFailedEvent";
  }

  private permissionContext(context: EngineeringProjectRuntimeContext): { actorPermissions: string[] } {
    return { actorPermissions: context.actor.permissions };
  }

  private toCreateInput(
    dto: CreateEngineeringAcceptanceDto,
    project: EngineeringProjectEntity,
    attachmentIds: string[] | null
  ): CreateEngineeringAcceptanceInput {
    return {
      orgId: project.orgId,
      projectId: dto.project_id,
      planId: dto.plan_id ?? null,
      acceptanceName: dto.acceptance_name,
      acceptanceType: dto.acceptance_type,
      riskLevel: dto.risk_level,
      plannedAcceptanceDate: dto.planned_acceptance_date,
      description: dto.description ?? null,
      acceptanceScope: dto.acceptance_scope ?? null,
      acceptanceCriteria: dto.acceptance_criteria ?? null,
      responsibleUserId: dto.responsible_user_id ?? null,
      acceptanceOrgId: dto.acceptance_org_id ?? null,
      contractorOrgId: dto.contractor_org_id ?? null,
      supervisorOrgId: dto.supervisor_org_id ?? null,
      locationText: dto.location_text ?? null,
      buildingId: dto.building_id ?? null,
      floorId: dto.floor_id ?? null,
      spaceId: dto.space_id ?? null,
      workflowInstanceId: dto.workflow_instance_id ?? null,
      attachmentIds
    };
  }

  private toUpdateInput(dto: UpdateEngineeringAcceptanceDto, attachmentIds: string[] | null | undefined): UpdateEngineeringAcceptanceInput {
    const input: UpdateEngineeringAcceptanceInput = {};
    this.assignIfDefined(input, "planId", dto.plan_id ?? undefined);
    this.assignIfDefined(input, "acceptanceName", dto.acceptance_name);
    this.assignIfDefined(input, "acceptanceType", dto.acceptance_type);
    this.assignIfDefined(input, "riskLevel", dto.risk_level);
    this.assignIfDefined(input, "plannedAcceptanceDate", dto.planned_acceptance_date);
    this.assignIfDefined(input, "actualAcceptanceDate", dto.actual_acceptance_date ?? undefined);
    this.assignIfDefined(input, "description", dto.description ?? undefined);
    this.assignIfDefined(input, "acceptanceScope", dto.acceptance_scope ?? undefined);
    this.assignIfDefined(input, "acceptanceCriteria", dto.acceptance_criteria ?? undefined);
    this.assignIfDefined(input, "resultSummary", dto.result_summary ?? undefined);
    this.assignIfDefined(input, "responsibleUserId", dto.responsible_user_id ?? undefined);
    this.assignIfDefined(input, "acceptanceOrgId", dto.acceptance_org_id ?? undefined);
    this.assignIfDefined(input, "contractorOrgId", dto.contractor_org_id ?? undefined);
    this.assignIfDefined(input, "supervisorOrgId", dto.supervisor_org_id ?? undefined);
    this.assignIfDefined(input, "locationText", dto.location_text ?? undefined);
    this.assignIfDefined(input, "buildingId", dto.building_id ?? undefined);
    this.assignIfDefined(input, "floorId", dto.floor_id ?? undefined);
    this.assignIfDefined(input, "spaceId", dto.space_id ?? undefined);
    this.assignIfDefined(input, "attachmentIds", attachmentIds);
    return input;
  }

  private acceptanceSnapshot(acceptance: EngineeringAcceptanceEntity): Record<string, unknown> {
    return {
      id: acceptance.id,
      projectId: acceptance.projectId,
      planId: acceptance.planId,
      acceptanceCode: acceptance.acceptanceCode,
      acceptanceName: acceptance.acceptanceName,
      acceptanceType: acceptance.acceptanceType,
      acceptanceStatus: acceptance.acceptanceStatus,
      riskLevel: acceptance.riskLevel,
      plannedAcceptanceDate: acceptance.plannedAcceptanceDate,
      actualAcceptanceDate: acceptance.actualAcceptanceDate,
      responsibleUserId: acceptance.responsibleUserId,
      acceptanceOrgId: acceptance.acceptanceOrgId
    };
  }

  private async logChange(
    action: string,
    acceptance: EngineeringAcceptanceEntity,
    context: EngineeringProjectRuntimeContext,
    beforeJson: Record<string, unknown> | null,
    afterJson: Record<string, unknown> | null
  ): Promise<void> {
    await this.auditLogger.logAcceptanceChanged({
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: acceptance.projectId,
      acceptanceId: acceptance.id,
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

  private async publishAcceptanceEvent(
    eventType:
      | "EngineeringAcceptanceCreatedEvent"
      | "EngineeringAcceptanceUpdatedEvent"
      | "EngineeringAcceptanceSubmittedEvent"
      | "EngineeringAcceptancePassedEvent"
      | "EngineeringAcceptanceFailedEvent"
      | "EngineeringAcceptanceRectificationRequiredEvent"
      | "EngineeringAcceptanceClosedEvent"
      | "EngineeringAcceptanceDeletedEvent",
    acceptance: EngineeringAcceptanceEntity,
    context: EngineeringProjectRuntimeContext,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.eventPublisher.publishAcceptanceEvent({
      eventType,
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: acceptance.projectId,
      acceptanceId: acceptance.id,
      actorUserId: context.actor.sub,
      payload
    });
  }

  private assignIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
    if (value !== undefined) {
      target[key] = value;
    }
  }
}
