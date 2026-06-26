import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "@jinhu/shared";
import type { SelectQueryBuilder } from "typeorm";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import {
  CreateEngineeringInspectionDto,
  CreateEngineeringIssueDto,
  EngineeringInspectionQueryDto,
  EngineeringIssueQueryDto,
  GenerateEngineeringRectificationDto,
  UpdateEngineeringInspectionDto,
  UpdateEngineeringIssueDto
} from "./dto/engineering-inspection.dto";
import { EngineeringInspectionStatus, EngineeringIssueSeverity, EngineeringIssueSourceType, EngineeringIssueStatus } from "./domain/engineering-project.enums";
import { EngineeringDailyReportEntity } from "./entities/engineering-daily-report.entity";
import { EngineeringInspectionEntity } from "./entities/engineering-inspection.entity";
import { EngineeringIssueEntity } from "./entities/engineering-issue.entity";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringRectificationEntity } from "./entities/engineering-rectification.entity";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringInspectionAccessPolicy, EngineeringInspectionPermission } from "./policies/engineering-inspection-access.policy";
import { EngineeringDailyReportRepository } from "./repositories/engineering-daily-report.repository";
import {
  EngineeringInspectionRepository,
  type CreateEngineeringInspectionInput,
  type UpdateEngineeringInspectionInput
} from "./repositories/engineering-inspection.repository";
import { EngineeringIssueRepository, type CreateEngineeringIssueInput, type UpdateEngineeringIssueInput } from "./repositories/engineering-issue.repository";
import { EngineeringPlanRepository } from "./repositories/engineering-plan.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";
import { EngineeringRectificationRepository, type CreateEngineeringRectificationInput } from "./repositories/engineering-rectification.repository";

@Injectable()
export class EngineeringInspectionService {
  constructor(
    private readonly inspectionsRepository: EngineeringInspectionRepository,
    private readonly issuesRepository: EngineeringIssueRepository,
    private readonly rectificationsRepository: EngineeringRectificationRepository,
    private readonly projectsRepository: EngineeringProjectRepository,
    private readonly plansRepository: EngineeringPlanRepository,
    private readonly dailyReportsRepository: EngineeringDailyReportRepository,
    private readonly accessPolicy: EngineeringInspectionAccessPolicy,
    private readonly dataScopeAdapter: EngineeringDataScopeAdapter,
    private readonly auditLogger: EngineeringAuditLogger,
    private readonly eventPublisher: EngineeringEventPublisher
  ) {}

  async createInspection(dto: CreateEngineeringInspectionDto, context: EngineeringProjectRuntimeContext): Promise<EngineeringInspectionEntity> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.CREATE, this.permissionContext(context));
    const project = await this.findProjectInScope(dto.project_id, context);
    await this.assertPlanBelongsToProject(dto.plan_id ?? null, project.id, context);
    await this.assertDailyReportBelongsToProject(dto.daily_report_id ?? null, project.id, context);
    this.assertInspectionCounts(dto.issue_count, dto.critical_issue_count);

    const inspection = await this.inspectionsRepository.createInspection(context, context.actor.sub, this.toCreateInspectionInput(dto, project));
    await this.logInspectionChange("CREATE", inspection, context, null, this.inspectionSnapshot(inspection));
    await this.publishInspectionEvent("EngineeringInspectionCreatedEvent", inspection, context, {
      inspectionCode: inspection.inspectionCode,
      inspectionType: inspection.inspectionType
    });
    return inspection;
  }

  async paginateInspections(
    query: EngineeringInspectionQueryDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<PaginatedResult<EngineeringInspectionEntity>> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.VIEW, this.permissionContext(context));
    if (query.project_id) {
      await this.findProjectInScope(query.project_id, context);
    }
    return this.inspectionsRepository.paginateInspections(context, query, (builder) => this.applyInspectionScope(builder, context));
  }

  async getInspectionDetail(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringInspectionEntity> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.VIEW, this.permissionContext(context));
    return this.findInspectionInScope(id, context);
  }

  async updateInspection(
    id: string,
    dto: UpdateEngineeringInspectionDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringInspectionEntity> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.UPDATE, this.permissionContext(context));
    const before = await this.findInspectionInScope(id, context);
    this.assertInspectionEditable(before);
    await this.assertPlanBelongsToProject(dto.plan_id ?? undefined, before.projectId, context);
    await this.assertDailyReportBelongsToProject(dto.daily_report_id ?? undefined, before.projectId, context);
    this.assertInspectionCounts(dto.issue_count, dto.critical_issue_count);

    const updated = await this.inspectionsRepository.updateInspection(context, context.actor.sub, id, this.toUpdateInspectionInput(dto));
    await this.logInspectionChange("UPDATE", updated, context, this.inspectionSnapshot(before), this.inspectionSnapshot(updated));
    await this.publishInspectionEvent("EngineeringInspectionUpdatedEvent", updated, context, {
      inspectionCode: updated.inspectionCode,
      inspectionStatus: updated.inspectionStatus
    });
    return updated;
  }

  async deleteInspection(id: string, context: EngineeringProjectRuntimeContext): Promise<{ id: string }> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.DELETE, this.permissionContext(context));
    const before = await this.findInspectionInScope(id, context);
    this.assertInspectionDeletable(before);
    const result = await this.inspectionsRepository.softDelete(context, context.actor.sub, id);
    await this.logInspectionChange("DELETE", before, context, this.inspectionSnapshot(before), { isDeleted: true });
    await this.publishInspectionEvent("EngineeringInspectionDeletedEvent", before, context, {
      inspectionCode: before.inspectionCode,
      inspectionStatus: before.inspectionStatus
    });
    return result;
  }

  async submitInspection(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringInspectionEntity> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.SUBMIT, this.permissionContext(context));
    const before = await this.findInspectionInScope(id, context);
    if (before.inspectionStatus !== EngineeringInspectionStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT engineering inspections can be submitted");
    }
    const updated = await this.inspectionsRepository.updateInspection(context, context.actor.sub, id, {
      inspectionStatus: EngineeringInspectionStatus.SUBMITTED,
      submittedAt: new Date(),
      submittedBy: context.actor.sub
    });
    await this.logInspectionChange("SUBMIT", updated, context, this.inspectionSnapshot(before), this.inspectionSnapshot(updated));
    await this.publishInspectionEvent("EngineeringInspectionSubmittedEvent", updated, context, {
      fromStatus: before.inspectionStatus,
      toStatus: updated.inspectionStatus,
      inspectionCode: updated.inspectionCode
    });
    return updated;
  }

  async getProjectInspections(projectId: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringInspectionEntity[]> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.VIEW, this.permissionContext(context));
    await this.findProjectInScope(projectId, context);
    return this.inspectionsRepository.findByProjectId(context, projectId, (builder) => this.applyInspectionScope(builder, context));
  }

  async createIssue(dto: CreateEngineeringIssueDto, context: EngineeringProjectRuntimeContext): Promise<EngineeringIssueEntity> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.ISSUE_CREATE, this.permissionContext(context));
    const input = await this.prepareIssueInput(dto, context);
    const issue = await this.issuesRepository.createIssue(context, context.actor.sub, input);
    await this.logIssueChange("CREATE", issue, context, null, this.issueSnapshot(issue));
    await this.publishIssueEvent("EngineeringIssueCreatedEvent", issue, context, {
      issueCode: issue.issueCode,
      severity: issue.severity,
      sourceType: issue.sourceType
    });
    await this.syncInspectionIssueCount(issue.inspectionId, context);
    return issue;
  }

  async createInspectionIssue(
    inspectionId: string,
    dto: CreateEngineeringIssueDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringIssueEntity> {
    const inspection = await this.findInspectionInScope(inspectionId, context);
    return this.createIssue({ ...dto, inspection_id: inspection.id, project_id: inspection.projectId }, context);
  }

  async paginateIssues(query: EngineeringIssueQueryDto, context: EngineeringProjectRuntimeContext): Promise<PaginatedResult<EngineeringIssueEntity>> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.ISSUE_VIEW, this.permissionContext(context));
    if (query.project_id) {
      await this.findProjectInScope(query.project_id, context);
    }
    return this.issuesRepository.paginateIssues(context, query, (builder) => this.applyIssueScope(builder, context));
  }

  async getIssueDetail(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringIssueEntity> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.ISSUE_VIEW, this.permissionContext(context));
    return this.findIssueInScope(id, context);
  }

  async getInspectionIssues(inspectionId: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringIssueEntity[]> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.ISSUE_VIEW, this.permissionContext(context));
    await this.findInspectionInScope(inspectionId, context);
    return this.issuesRepository.findByInspectionId(context, inspectionId);
  }

  async updateIssue(id: string, dto: UpdateEngineeringIssueDto, context: EngineeringProjectRuntimeContext): Promise<EngineeringIssueEntity> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.ISSUE_UPDATE, this.permissionContext(context));
    const before = await this.findIssueInScope(id, context);
    await this.assertPlanBelongsToProject(dto.plan_id ?? undefined, before.projectId, context);
    await this.assertDailyReportBelongsToProject(dto.daily_report_id ?? undefined, before.projectId, context);
    const updated = await this.issuesRepository.updateIssue(context, context.actor.sub, id, this.toUpdateIssueInput(dto, context));
    await this.logIssueChange("UPDATE", updated, context, this.issueSnapshot(before), this.issueSnapshot(updated));
    await this.publishIssueEvent("EngineeringIssueUpdatedEvent", updated, context, {
      issueCode: updated.issueCode,
      issueStatus: updated.issueStatus,
      severity: updated.severity
    });
    await this.syncInspectionIssueCount(updated.inspectionId, context);
    return updated;
  }

  async generateRectificationFromIssue(
    id: string,
    dto: GenerateEngineeringRectificationDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringRectificationEntity> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.ISSUE_GENERATE_RECTIFICATION, this.permissionContext(context));
    const issue = await this.findIssueInScope(id, context);
    this.assertIssueCanGenerateRectification(issue);
    const existing = await this.rectificationsRepository.findByIssueId(context, issue.id);
    if (existing) {
      throw new ConflictException("Engineering issue already has a rectification task");
    }

    const rectification = await this.rectificationsRepository.createRectification(
      context,
      context.actor.sub,
      this.toCreateRectificationInput(issue, dto)
    );
    const updatedIssue = await this.issuesRepository.updateIssue(context, context.actor.sub, issue.id, {
      rectificationId: rectification.id,
      issueStatus: EngineeringIssueStatus.RECTIFICATION_PENDING,
      closedAt: null,
      closedBy: null
    });

    await this.logRectificationChange("CREATE_FROM_ISSUE", rectification, context, null, this.rectificationSnapshot(rectification));
    await this.logIssueChange("GENERATE_RECTIFICATION", updatedIssue, context, this.issueSnapshot(issue), this.issueSnapshot(updatedIssue));
    await this.publishRectificationEvent("EngineeringRectificationCreatedEvent", rectification, context, {
      rectificationCode: rectification.rectificationCode,
      issueId: issue.id,
      issueCode: issue.issueCode,
      severity: rectification.severity
    });
    await this.publishIssueEvent("EngineeringIssueUpdatedEvent", updatedIssue, context, {
      issueCode: updatedIssue.issueCode,
      issueStatus: updatedIssue.issueStatus,
      rectificationId: rectification.id
    });
    await this.syncInspectionIssueCount(updatedIssue.inspectionId, context);
    return rectification;
  }

  async deleteIssue(id: string, context: EngineeringProjectRuntimeContext): Promise<{ id: string }> {
    this.accessPolicy.assertPermission(EngineeringInspectionPermission.ISSUE_DELETE, this.permissionContext(context));
    const before = await this.findIssueInScope(id, context);
    const result = await this.issuesRepository.softDelete(context, context.actor.sub, id);
    await this.logIssueChange("DELETE", before, context, this.issueSnapshot(before), { isDeleted: true });
    await this.publishIssueEvent("EngineeringIssueDeletedEvent", before, context, {
      issueCode: before.issueCode,
      issueStatus: before.issueStatus
    });
    await this.syncInspectionIssueCount(before.inspectionId, context);
    return result;
  }

  private findProjectInScope(projectId: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringProjectEntity> {
    return this.projectsRepository.findById(context, projectId, (builder) => this.dataScopeAdapter.applyProjectScope(builder, context, context.actor));
  }

  private findPlanInScope(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringPlanEntity> {
    return this.plansRepository.findById(context, id, (builder) => this.dataScopeAdapter.applyPlanScope(builder, context, context.actor));
  }

  private findDailyReportInScope(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringDailyReportEntity> {
    return this.dailyReportsRepository.findById(context, id, (builder) => this.dataScopeAdapter.applyDailyReportScope(builder, context, context.actor));
  }

  private findInspectionInScope(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringInspectionEntity> {
    return this.inspectionsRepository.findById(context, id, (builder) => this.applyInspectionScope(builder, context));
  }

  private findIssueInScope(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringIssueEntity> {
    return this.issuesRepository.findById(context, id, (builder) => this.applyIssueScope(builder, context));
  }

  private applyInspectionScope(
    builder: SelectQueryBuilder<EngineeringInspectionEntity>,
    context: EngineeringProjectRuntimeContext
  ): Promise<void> {
    return this.dataScopeAdapter.applyInspectionScope(builder, context, context.actor);
  }

  private applyIssueScope(builder: SelectQueryBuilder<EngineeringIssueEntity>, context: EngineeringProjectRuntimeContext): Promise<void> {
    return this.dataScopeAdapter.applyIssueScope(builder, context, context.actor);
  }

  private async assertPlanBelongsToProject(planId: string | null | undefined, projectId: string, context: EngineeringProjectRuntimeContext): Promise<void> {
    if (planId === undefined) return;
    if (planId === null) return;
    const plan = await this.findPlanInScope(planId, context);
    if (plan.projectId !== projectId) {
      throw new BadRequestException("Engineering inspection plan must belong to the same project");
    }
  }

  private async assertDailyReportBelongsToProject(
    dailyReportId: string | null | undefined,
    projectId: string,
    context: EngineeringProjectRuntimeContext
  ): Promise<void> {
    if (dailyReportId === undefined) return;
    if (dailyReportId === null) return;
    const report = await this.findDailyReportInScope(dailyReportId, context);
    if (report.projectId !== projectId) {
      throw new BadRequestException("Engineering inspection daily report must belong to the same project");
    }
  }

  private assertInspectionCounts(issueCount?: number, criticalIssueCount?: number): void {
    if (issueCount !== undefined && (!Number.isInteger(issueCount) || issueCount < 0)) {
      throw new BadRequestException("issueCount must be greater than or equal to 0");
    }
    if (criticalIssueCount !== undefined && (!Number.isInteger(criticalIssueCount) || criticalIssueCount < 0)) {
      throw new BadRequestException("criticalIssueCount must be greater than or equal to 0");
    }
    if (issueCount !== undefined && criticalIssueCount !== undefined && criticalIssueCount > issueCount) {
      throw new BadRequestException("criticalIssueCount cannot exceed issueCount");
    }
  }

  private assertInspectionEditable(inspection: EngineeringInspectionEntity): void {
    if (inspection.inspectionStatus !== EngineeringInspectionStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT engineering inspections can be edited");
    }
  }

  private assertInspectionDeletable(inspection: EngineeringInspectionEntity): void {
    if (inspection.inspectionStatus !== EngineeringInspectionStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT engineering inspections can be deleted");
    }
  }

  private assertIssueCanGenerateRectification(issue: EngineeringIssueEntity): void {
    if (issue.rectificationId) {
      throw new ConflictException("Engineering issue already has a rectification task");
    }
    if ([EngineeringIssueStatus.CLOSED, EngineeringIssueStatus.CANCELLED].includes(issue.issueStatus)) {
      throw new BadRequestException("Closed or cancelled engineering issues cannot generate rectification tasks");
    }
  }

  private async prepareIssueInput(dto: CreateEngineeringIssueDto, context: EngineeringProjectRuntimeContext): Promise<CreateEngineeringIssueInput> {
    let projectId = dto.project_id ?? null;
    let inspection: EngineeringInspectionEntity | null = null;
    if (dto.inspection_id) {
      inspection = await this.findInspectionInScope(dto.inspection_id, context);
      projectId = projectId ?? inspection.projectId;
      if (projectId !== inspection.projectId) {
        throw new BadRequestException("Engineering issue project must match the inspection project");
      }
    }
    if (!projectId) {
      throw new BadRequestException("projectId or inspectionId is required to create an engineering issue");
    }
    const project = await this.findProjectInScope(projectId, context);
    await this.assertPlanBelongsToProject(dto.plan_id ?? inspection?.planId ?? null, project.id, context);
    await this.assertDailyReportBelongsToProject(dto.daily_report_id ?? inspection?.dailyReportId ?? null, project.id, context);
    return {
      orgId: project.orgId,
      projectId: project.id,
      inspectionId: dto.inspection_id ?? inspection?.id ?? null,
      planId: dto.plan_id ?? inspection?.planId ?? null,
      dailyReportId: dto.daily_report_id ?? inspection?.dailyReportId ?? null,
      issueTitle: dto.issue_title,
      issueType: dto.issue_type,
      severity: dto.severity,
      description: dto.description,
      locationText: dto.location_text ?? inspection?.locationText ?? null,
      buildingId: dto.building_id ?? inspection?.buildingId ?? null,
      floorId: dto.floor_id ?? inspection?.floorId ?? null,
      spaceId: dto.space_id ?? inspection?.spaceId ?? null,
      responsibleUserId: dto.responsible_user_id ?? null,
      responsibleOrgId: dto.responsible_org_id ?? null,
      contractorOrgId: dto.contractor_org_id ?? inspection?.contractorOrgId ?? null,
      supervisorOrgId: dto.supervisor_org_id ?? inspection?.supervisorOrgId ?? null,
      deadline: dto.deadline ?? null,
      sourceType: dto.source_type ?? (inspection ? EngineeringIssueSourceType.INSPECTION : EngineeringIssueSourceType.MANUAL),
      sourceId: dto.source_id ?? dto.inspection_id ?? inspection?.id ?? null,
      attachmentIds: dto.attachment_ids ?? null,
      remark: dto.remark ?? null
    };
  }

  private toCreateRectificationInput(issue: EngineeringIssueEntity, dto: GenerateEngineeringRectificationDto): CreateEngineeringRectificationInput {
    return {
      orgId: issue.orgId,
      projectId: issue.projectId,
      issueId: issue.id,
      inspectionId: issue.inspectionId,
      rectificationTitle: dto.rectification_title ?? issue.issueTitle,
      description: dto.description ?? issue.description,
      severity: issue.severity,
      responsibleUserId: dto.responsible_user_id ?? issue.responsibleUserId,
      responsibleOrgId: dto.responsible_org_id ?? issue.responsibleOrgId,
      contractorOrgId: dto.contractor_org_id ?? issue.contractorOrgId,
      supervisorOrgId: dto.supervisor_org_id ?? issue.supervisorOrgId,
      locationText: issue.locationText,
      buildingId: issue.buildingId,
      floorId: issue.floorId,
      spaceId: issue.spaceId,
      deadline: dto.deadline ?? issue.deadline,
      attachmentIds: dto.attachment_ids ?? issue.attachmentIds,
      remark: dto.remark ?? issue.remark
    };
  }

  private toCreateInspectionInput(dto: CreateEngineeringInspectionDto, project: EngineeringProjectEntity): CreateEngineeringInspectionInput {
    return {
      orgId: project.orgId,
      projectId: project.id,
      planId: dto.plan_id ?? null,
      dailyReportId: dto.daily_report_id ?? null,
      inspectionTitle: dto.inspection_title,
      inspectionType: dto.inspection_type,
      inspectionDate: dto.inspection_date,
      inspectorUserId: dto.inspector_user_id ?? null,
      inspectorOrgId: dto.inspector_org_id ?? null,
      contractorOrgId: dto.contractor_org_id ?? null,
      supervisorOrgId: dto.supervisor_org_id ?? null,
      locationText: dto.location_text ?? null,
      buildingId: dto.building_id ?? null,
      floorId: dto.floor_id ?? null,
      spaceId: dto.space_id ?? null,
      summary: dto.summary ?? null,
      overallResult: dto.overall_result ?? null,
      issueCount: dto.issue_count,
      criticalIssueCount: dto.critical_issue_count,
      attachmentIds: dto.attachment_ids ?? null,
      remark: dto.remark ?? null
    };
  }

  private toUpdateInspectionInput(dto: UpdateEngineeringInspectionDto): UpdateEngineeringInspectionInput {
    const input: UpdateEngineeringInspectionInput = {};
    this.assignIfDefined(input, "planId", dto.plan_id ?? undefined);
    this.assignIfDefined(input, "dailyReportId", dto.daily_report_id ?? undefined);
    this.assignIfDefined(input, "inspectionTitle", dto.inspection_title);
    this.assignIfDefined(input, "inspectionType", dto.inspection_type);
    this.assignIfDefined(input, "inspectionDate", dto.inspection_date);
    this.assignIfDefined(input, "inspectorUserId", dto.inspector_user_id ?? undefined);
    this.assignIfDefined(input, "inspectorOrgId", dto.inspector_org_id ?? undefined);
    this.assignIfDefined(input, "contractorOrgId", dto.contractor_org_id ?? undefined);
    this.assignIfDefined(input, "supervisorOrgId", dto.supervisor_org_id ?? undefined);
    this.assignIfDefined(input, "locationText", dto.location_text ?? undefined);
    this.assignIfDefined(input, "buildingId", dto.building_id ?? undefined);
    this.assignIfDefined(input, "floorId", dto.floor_id ?? undefined);
    this.assignIfDefined(input, "spaceId", dto.space_id ?? undefined);
    this.assignIfDefined(input, "summary", dto.summary ?? undefined);
    this.assignIfDefined(input, "overallResult", dto.overall_result ?? undefined);
    this.assignIfDefined(input, "issueCount", dto.issue_count);
    this.assignIfDefined(input, "criticalIssueCount", dto.critical_issue_count);
    this.assignIfDefined(input, "attachmentIds", dto.attachment_ids ?? undefined);
    this.assignIfDefined(input, "remark", dto.remark ?? undefined);
    return input;
  }

  private toUpdateIssueInput(dto: UpdateEngineeringIssueDto, context: EngineeringProjectRuntimeContext): UpdateEngineeringIssueInput {
    const input: UpdateEngineeringIssueInput = {};
    this.assignIfDefined(input, "planId", dto.plan_id ?? undefined);
    this.assignIfDefined(input, "dailyReportId", dto.daily_report_id ?? undefined);
    this.assignIfDefined(input, "issueTitle", dto.issue_title);
    this.assignIfDefined(input, "issueType", dto.issue_type);
    this.assignIfDefined(input, "severity", dto.severity);
    this.assignIfDefined(input, "issueStatus", dto.issue_status);
    this.assignIfDefined(input, "description", dto.description);
    this.assignIfDefined(input, "locationText", dto.location_text ?? undefined);
    this.assignIfDefined(input, "buildingId", dto.building_id ?? undefined);
    this.assignIfDefined(input, "floorId", dto.floor_id ?? undefined);
    this.assignIfDefined(input, "spaceId", dto.space_id ?? undefined);
    this.assignIfDefined(input, "responsibleUserId", dto.responsible_user_id ?? undefined);
    this.assignIfDefined(input, "responsibleOrgId", dto.responsible_org_id ?? undefined);
    this.assignIfDefined(input, "contractorOrgId", dto.contractor_org_id ?? undefined);
    this.assignIfDefined(input, "supervisorOrgId", dto.supervisor_org_id ?? undefined);
    this.assignIfDefined(input, "deadline", dto.deadline ?? undefined);
    this.assignIfDefined(input, "rectificationId", dto.rectification_id ?? undefined);
    this.assignIfDefined(input, "attachmentIds", dto.attachment_ids ?? undefined);
    this.assignIfDefined(input, "remark", dto.remark ?? undefined);
    if (dto.issue_status === EngineeringIssueStatus.CLOSED) {
      input.closedAt = new Date();
      input.closedBy = context.actor.sub;
    }
    if (dto.issue_status !== undefined && dto.issue_status !== EngineeringIssueStatus.CLOSED) {
      input.closedAt = null;
      input.closedBy = null;
    }
    return input;
  }

  private async syncInspectionIssueCount(inspectionId: string | null, context: EngineeringProjectRuntimeContext): Promise<void> {
    if (!inspectionId) return;
    const inspection = await this.findInspectionInScope(inspectionId, context);
    const issues = await this.issuesRepository.findByInspectionId(context, inspectionId);
    const issueCount = issues.filter((issue) => issue.issueStatus !== EngineeringIssueStatus.CANCELLED).length;
    const criticalIssueCount = issues.filter(
      (issue) => issue.issueStatus !== EngineeringIssueStatus.CANCELLED && issue.severity === EngineeringIssueSeverity.CRITICAL
    ).length;
    if (inspection.issueCount === issueCount && inspection.criticalIssueCount === criticalIssueCount) return;
    await this.inspectionsRepository.updateInspection(context, context.actor.sub, inspectionId, { issueCount, criticalIssueCount });
  }

  private assignIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
    if (value !== undefined) {
      target[key] = value;
    }
  }

  private permissionContext(context: EngineeringProjectRuntimeContext): { actorPermissions: string[] } {
    return { actorPermissions: context.actor.permissions };
  }

  private inspectionSnapshot(inspection: EngineeringInspectionEntity): Record<string, unknown> {
    return {
      id: inspection.id,
      projectId: inspection.projectId,
      planId: inspection.planId,
      dailyReportId: inspection.dailyReportId,
      inspectionCode: inspection.inspectionCode,
      inspectionTitle: inspection.inspectionTitle,
      inspectionType: inspection.inspectionType,
      inspectionDate: inspection.inspectionDate,
      inspectionStatus: inspection.inspectionStatus,
      issueCount: inspection.issueCount,
      criticalIssueCount: inspection.criticalIssueCount
    };
  }

  private issueSnapshot(issue: EngineeringIssueEntity): Record<string, unknown> {
    return {
      id: issue.id,
      projectId: issue.projectId,
      inspectionId: issue.inspectionId,
      issueCode: issue.issueCode,
      issueTitle: issue.issueTitle,
      issueType: issue.issueType,
      severity: issue.severity,
      issueStatus: issue.issueStatus,
      responsibleUserId: issue.responsibleUserId,
      responsibleOrgId: issue.responsibleOrgId,
      deadline: issue.deadline,
      rectificationId: issue.rectificationId
    };
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
      deadline: rectification.deadline
    };
  }

  private async logInspectionChange(
    action: string,
    inspection: EngineeringInspectionEntity,
    context: EngineeringProjectRuntimeContext,
    beforeJson: Record<string, unknown> | null,
    afterJson: Record<string, unknown> | null
  ): Promise<void> {
    await this.auditLogger.logInspectionChanged({
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: inspection.projectId,
      inspectionId: inspection.id,
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

  private async logIssueChange(
    action: string,
    issue: EngineeringIssueEntity,
    context: EngineeringProjectRuntimeContext,
    beforeJson: Record<string, unknown> | null,
    afterJson: Record<string, unknown> | null
  ): Promise<void> {
    await this.auditLogger.logIssueChanged({
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: issue.projectId,
      issueId: issue.id,
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

  private async publishInspectionEvent(
    eventType:
      | "EngineeringInspectionCreatedEvent"
      | "EngineeringInspectionUpdatedEvent"
      | "EngineeringInspectionSubmittedEvent"
      | "EngineeringInspectionDeletedEvent",
    inspection: EngineeringInspectionEntity,
    context: EngineeringProjectRuntimeContext,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.eventPublisher.publishInspectionEvent({
      eventType,
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: inspection.projectId,
      inspectionId: inspection.id,
      actorUserId: context.actor.sub,
      payload
    });
  }

  private async publishIssueEvent(
    eventType: "EngineeringIssueCreatedEvent" | "EngineeringIssueUpdatedEvent" | "EngineeringIssueDeletedEvent",
    issue: EngineeringIssueEntity,
    context: EngineeringProjectRuntimeContext,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.eventPublisher.publishIssueEvent({
      eventType,
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: issue.projectId,
      issueId: issue.id,
      actorUserId: context.actor.sub,
      payload
    });
  }

  private async publishRectificationEvent(
    eventType: "EngineeringRectificationCreatedEvent",
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
}
