import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { Repository, SelectQueryBuilder } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import {
  CreateEngineeringProjectDto,
  EngineeringProjectActionDto,
  EngineeringProjectQueryDto,
  UpdateEngineeringProjectDto
} from "./dto/engineering-project.dto";
import { EngineeringProjectAction } from "./domain/engineering-project-state-machine.types";
import type { EngineeringProjectAvailableAction, EngineeringProjectTransitionContext } from "./domain/engineering-project-state-machine.types";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStatusLogEntity } from "./entities/engineering-project-status-log.entity";
import { EngineeringProjectStatusService } from "./engineering-project-status.service";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringProjectAccessPolicy, EngineeringProjectPermission } from "./policies/engineering-project-access.policy";
import { EngineeringProjectRepository, type CreateEngineeringProjectInput, type UpdateEngineeringProjectInput } from "./repositories/engineering-project.repository";

export interface EngineeringProjectRuntimeContext extends TenantParkScope {
  actor: JwtPrincipal;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class EngineeringProjectService {
  constructor(
    private readonly projectsRepository: EngineeringProjectRepository,
    private readonly projectStatusService: EngineeringProjectStatusService,
    private readonly accessPolicy: EngineeringProjectAccessPolicy,
    private readonly dataScopeAdapter: EngineeringDataScopeAdapter,
    private readonly auditLogger: EngineeringAuditLogger,
    @InjectRepository(EngineeringProjectStatusLogEntity)
    private readonly statusLogsRepository: Repository<EngineeringProjectStatusLogEntity>
  ) {}

  async createProject(dto: CreateEngineeringProjectDto, context: EngineeringProjectRuntimeContext): Promise<EngineeringProjectEntity> {
    this.accessPolicy.assertPermission(EngineeringProjectPermission.CREATE, this.permissionContext(context));
    const project = await this.projectsRepository.createProject(context, context.actor.sub, this.toCreateInput(dto));
    await this.logProjectChanged("CREATE", project, context, null, this.projectSnapshot(project));
    return project;
  }

  async paginateProjects(
    query: EngineeringProjectQueryDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<PaginatedResult<EngineeringProjectEntity>> {
    this.accessPolicy.assertPermission(EngineeringProjectPermission.VIEW, this.permissionContext(context));
    return this.projectsRepository.paginateProjects(context, query, (builder) => this.applyProjectScope(builder, context));
  }

  async getProjectDetail(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringProjectEntity> {
    this.accessPolicy.assertPermission(EngineeringProjectPermission.VIEW, this.permissionContext(context));
    return this.findProjectInScope(id, context);
  }

  async updateProject(id: string, dto: UpdateEngineeringProjectDto, context: EngineeringProjectRuntimeContext): Promise<EngineeringProjectEntity> {
    this.accessPolicy.assertPermission(EngineeringProjectPermission.UPDATE, this.permissionContext(context));
    const before = await this.findProjectInScope(id, context);
    const updated = await this.projectsRepository.updateProject(context, context.actor.sub, id, this.toUpdateInput(dto));
    await this.logProjectChanged("UPDATE", updated, context, this.projectSnapshot(before), this.projectSnapshot(updated));
    return updated;
  }

  async deleteProject(id: string, context: EngineeringProjectRuntimeContext): Promise<{ id: string }> {
    this.accessPolicy.assertPermission(EngineeringProjectPermission.DELETE, this.permissionContext(context));
    const before = await this.findProjectInScope(id, context);
    const result = await this.projectsRepository.softDelete(context, context.actor.sub, id);
    await this.logProjectChanged("DELETE", before, context, this.projectSnapshot(before), { id, isDeleted: true });
    return result;
  }

  async executeProjectAction(
    id: string,
    actionValue: string,
    dto: EngineeringProjectActionDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringProjectEntity> {
    const action = this.parseAction(actionValue);
    await this.findProjectInScope(id, context);
    const transitionContext = this.toTransitionContext(id, dto, context);
    switch (action) {
      case EngineeringProjectAction.SUBMIT:
        return this.projectStatusService.submitProject(id, transitionContext);
      case EngineeringProjectAction.APPROVE:
        return this.projectStatusService.approveProject(id, transitionContext);
      case EngineeringProjectAction.CANCEL:
        return this.projectStatusService.cancelProject(id, transitionContext);
      case EngineeringProjectAction.START_PLANNING:
        return this.projectStatusService.startPlanning(id, transitionContext);
      case EngineeringProjectAction.START_EXECUTION:
        return this.projectStatusService.startExecution(id, transitionContext);
      case EngineeringProjectAction.START_INSPECTION:
        return this.projectStatusService.startInspection(id, transitionContext);
      case EngineeringProjectAction.REQUIRE_RECTIFICATION:
        return this.projectStatusService.requireRectification(id, transitionContext);
      case EngineeringProjectAction.START_ACCEPTANCE:
        return this.projectStatusService.startAcceptance(id, transitionContext);
      case EngineeringProjectAction.ACCEPTANCE_PASSED:
        return this.projectStatusService.acceptancePassed(id, transitionContext);
      case EngineeringProjectAction.ACCEPTANCE_FAILED:
        return this.projectStatusService.acceptanceFailed(id, transitionContext);
      case EngineeringProjectAction.MARK_TRANSFER_READY:
        return this.projectStatusService.markTransferReady(id, transitionContext);
      case EngineeringProjectAction.MARK_SETTLEMENT_READY:
        return this.projectStatusService.markSettlementReady(id, transitionContext);
      case EngineeringProjectAction.CLOSE:
        return this.projectStatusService.closeProject(id, transitionContext);
      case EngineeringProjectAction.ARCHIVE:
        return this.projectStatusService.archiveProject(id, transitionContext);
    }
  }

  async getAvailableActions(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringProjectAvailableAction[]> {
    this.accessPolicy.assertPermission(EngineeringProjectPermission.VIEW, this.permissionContext(context));
    await this.findProjectInScope(id, context);
    return this.projectStatusService.getAvailableActions(id, this.toTransitionContext(id, { reason: "query_available_actions" }, context));
  }

  async getStatusLogs(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringProjectStatusLogEntity[]> {
    this.accessPolicy.assertPermission(EngineeringProjectPermission.VIEW, this.permissionContext(context));
    await this.findProjectInScope(id, context);
    return this.statusLogsRepository.find({
      where: { tenantId: context.tenantId, parkId: context.parkId, projectId: id },
      order: { createdAt: "ASC" }
    });
  }

  private findProjectInScope(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringProjectEntity> {
    return this.projectsRepository.findById(context, id, (builder) => this.applyProjectScope(builder, context));
  }

  private applyProjectScope(builder: SelectQueryBuilder<EngineeringProjectEntity>, context: EngineeringProjectRuntimeContext): Promise<void> {
    return this.dataScopeAdapter.applyProjectScope(builder, context, context.actor);
  }

  private parseAction(value: string): EngineeringProjectAction {
    const actions = Object.values(EngineeringProjectAction) as string[];
    if (!actions.includes(value)) {
      throw new BadRequestException(`Invalid engineering project action: ${value}`);
    }
    return value as EngineeringProjectAction;
  }

  private toTransitionContext(
    projectId: string,
    dto: Pick<EngineeringProjectActionDto, "reason" | "comment" | "workflow_instance_id">,
    context: EngineeringProjectRuntimeContext
  ): EngineeringProjectTransitionContext {
    return {
      tenantId: context.tenantId,
      parkId: context.parkId,
      actorUserId: context.actor.sub,
      actorName: context.actor.realName ?? context.actor.username,
      actorRoleCodes: context.actor.roles,
      actorPermissions: context.actor.permissions,
      projectId,
      reason: dto.reason,
      comment: dto.comment ?? null,
      workflowInstanceId: dto.workflow_instance_id ?? null,
      requestId: context.requestId ?? null,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null
    };
  }

  private permissionContext(context: EngineeringProjectRuntimeContext): { actorPermissions: string[] } {
    return { actorPermissions: context.actor.permissions };
  }

  private toCreateInput(dto: CreateEngineeringProjectDto): CreateEngineeringProjectInput {
    return {
      orgId: dto.org_id ?? null,
      projectName: dto.project_name,
      projectType: dto.project_type,
      projectLevel: dto.project_level,
      projectSource: dto.project_source ?? null,
      description: dto.description ?? null,
      locationText: dto.location_text ?? null,
      buildingId: dto.building_id ?? null,
      floorId: dto.floor_id ?? null,
      spaceId: dto.space_id ?? null,
      plannedStartDate: dto.planned_start_date,
      plannedEndDate: dto.planned_end_date,
      budgetAmount: this.toAmount(dto.budget_amount),
      contractAmount: this.toAmount(dto.contract_amount),
      projectManagerId: dto.project_manager_id,
      engineeringDirectorId: dto.engineering_director_id ?? null,
      contractorOrgId: dto.contractor_org_id ?? null,
      supervisorOrgId: dto.supervisor_org_id ?? null,
      riskLevel: dto.risk_level,
      remark: dto.remark ?? null
    };
  }

  private toUpdateInput(dto: UpdateEngineeringProjectDto): UpdateEngineeringProjectInput {
    const input: UpdateEngineeringProjectInput = {};
    this.assignIfDefined(input, "orgId", dto.org_id ?? undefined);
    this.assignIfDefined(input, "projectName", dto.project_name);
    this.assignIfDefined(input, "projectType", dto.project_type);
    this.assignIfDefined(input, "projectLevel", dto.project_level);
    this.assignIfDefined(input, "projectSource", dto.project_source ?? undefined);
    this.assignIfDefined(input, "description", dto.description ?? undefined);
    this.assignIfDefined(input, "locationText", dto.location_text ?? undefined);
    this.assignIfDefined(input, "buildingId", dto.building_id ?? undefined);
    this.assignIfDefined(input, "floorId", dto.floor_id ?? undefined);
    this.assignIfDefined(input, "spaceId", dto.space_id ?? undefined);
    this.assignIfDefined(input, "plannedStartDate", dto.planned_start_date);
    this.assignIfDefined(input, "plannedEndDate", dto.planned_end_date);
    this.assignIfDefined(input, "actualStartDate", dto.actual_start_date);
    this.assignIfDefined(input, "actualEndDate", dto.actual_end_date);
    this.assignIfDefined(input, "budgetAmount", this.toAmount(dto.budget_amount));
    this.assignIfDefined(input, "contractAmount", this.toAmount(dto.contract_amount));
    this.assignIfDefined(input, "projectManagerId", dto.project_manager_id ?? undefined);
    this.assignIfDefined(input, "engineeringDirectorId", dto.engineering_director_id ?? undefined);
    this.assignIfDefined(input, "contractorOrgId", dto.contractor_org_id ?? undefined);
    this.assignIfDefined(input, "supervisorOrgId", dto.supervisor_org_id ?? undefined);
    this.assignIfDefined(input, "progressPercent", dto.progress_percent);
    this.assignIfDefined(input, "riskLevel", dto.risk_level);
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

  private async logProjectChanged(
    action: string,
    project: EngineeringProjectEntity,
    context: EngineeringProjectRuntimeContext,
    beforeJson: Record<string, unknown> | null,
    afterJson: Record<string, unknown> | null
  ): Promise<void> {
    await this.auditLogger.logProjectChanged({
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: project.id,
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

  private projectSnapshot(project: EngineeringProjectEntity): Record<string, unknown> {
    return {
      id: project.id,
      projectCode: project.projectCode,
      projectName: project.projectName,
      projectType: project.projectType,
      projectLevel: project.projectLevel,
      projectSource: project.projectSource,
      status: project.status,
      progressPercent: project.progressPercent,
      riskLevel: project.riskLevel,
      orgId: project.orgId,
      parkId: project.parkId,
      projectManagerId: project.projectManagerId,
      engineeringDirectorId: project.engineeringDirectorId,
      contractorOrgId: project.contractorOrgId,
      supervisorOrgId: project.supervisorOrgId,
      plannedStartDate: project.plannedStartDate,
      plannedEndDate: project.plannedEndDate,
      actualStartDate: project.actualStartDate,
      actualEndDate: project.actualEndDate,
      budgetAmount: project.budgetAmount,
      contractAmount: project.contractAmount,
      locationText: project.locationText
    };
  }
}
