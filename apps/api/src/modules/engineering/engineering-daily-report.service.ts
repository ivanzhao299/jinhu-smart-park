import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "@jinhu/shared";
import type { SelectQueryBuilder } from "typeorm";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import {
  CreateEngineeringDailyReportDto,
  EngineeringDailyReportQueryDto,
  ReviewEngineeringDailyReportDto,
  UpdateEngineeringDailyReportDto
} from "./dto/engineering-daily-report.dto";
import { EngineeringDailyReportStatus } from "./domain/engineering-project.enums";
import { EngineeringDailyReportEntity } from "./entities/engineering-daily-report.entity";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringDailyReportAccessPolicy, EngineeringDailyReportPermission } from "./policies/engineering-daily-report-access.policy";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringPlanRepository } from "./repositories/engineering-plan.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";
import {
  EngineeringDailyReportRepository,
  type CreateEngineeringDailyReportInput,
  type UpdateEngineeringDailyReportInput
} from "./repositories/engineering-daily-report.repository";

@Injectable()
export class EngineeringDailyReportService {
  constructor(
    private readonly dailyReportsRepository: EngineeringDailyReportRepository,
    private readonly projectsRepository: EngineeringProjectRepository,
    private readonly plansRepository: EngineeringPlanRepository,
    private readonly accessPolicy: EngineeringDailyReportAccessPolicy,
    private readonly dataScopeAdapter: EngineeringDataScopeAdapter,
    private readonly auditLogger: EngineeringAuditLogger,
    private readonly eventPublisher: EngineeringEventPublisher
  ) {}

  async createDailyReport(
    dto: CreateEngineeringDailyReportDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringDailyReportEntity> {
    this.accessPolicy.assertPermission(EngineeringDailyReportPermission.CREATE, this.permissionContext(context));
    const project = await this.findProjectInScope(dto.project_id, context);
    if (dto.plan_id) {
      await this.assertPlanBelongsToProject(dto.plan_id, project.id, context);
    }
    this.assertReportDate(dto.report_date);
    this.assertCounts(dto.worker_count, dto.manager_count);
    this.assertProgress(dto.progress_percent ?? 0, "progressPercent");
    await this.assertNoDuplicate(project.id, dto.report_date, dto.contractor_org_id ?? null, context);

    const report = await this.dailyReportsRepository.createDailyReport(context, context.actor.sub, this.toCreateInput(dto, project));
    await this.logChange("CREATE", report, context, null, this.reportSnapshot(report));
    await this.publishReportEvent("EngineeringDailyReportCreatedEvent", report, context, {
      reportCode: report.reportCode,
      reportDate: report.reportDate,
      weather: report.weather
    });
    return report;
  }

  async paginateDailyReports(
    query: EngineeringDailyReportQueryDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<PaginatedResult<EngineeringDailyReportEntity>> {
    this.accessPolicy.assertPermission(EngineeringDailyReportPermission.VIEW, this.permissionContext(context));
    if (query.project_id) {
      await this.findProjectInScope(query.project_id, context);
    }
    return this.dailyReportsRepository.paginateDailyReports(context, query, (builder) => this.applyDailyReportScope(builder, context));
  }

  async getDailyReportDetail(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringDailyReportEntity> {
    this.accessPolicy.assertPermission(EngineeringDailyReportPermission.VIEW, this.permissionContext(context));
    return this.findDailyReportInScope(id, context);
  }

  async updateDailyReport(
    id: string,
    dto: UpdateEngineeringDailyReportDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringDailyReportEntity> {
    this.accessPolicy.assertPermission(EngineeringDailyReportPermission.UPDATE, this.permissionContext(context));
    const before = await this.findDailyReportInScope(id, context);
    this.assertEditable(before);
    if (dto.plan_id) {
      await this.assertPlanBelongsToProject(dto.plan_id, before.projectId, context);
    }
    this.assertCounts(dto.worker_count, dto.manager_count);
    if (dto.progress_percent !== undefined) {
      this.assertProgress(dto.progress_percent, "progressPercent");
    }
    if (dto.contractor_org_id !== undefined && dto.contractor_org_id !== before.contractorOrgId) {
      await this.assertNoDuplicate(before.projectId, before.reportDate, dto.contractor_org_id ?? null, context, before.id);
    }

    const updated = await this.dailyReportsRepository.updateDailyReport(context, context.actor.sub, id, this.toUpdateInput(dto));
    await this.logChange("UPDATE", updated, context, this.reportSnapshot(before), this.reportSnapshot(updated));
    await this.publishReportEvent("EngineeringDailyReportUpdatedEvent", updated, context, {
      reportCode: updated.reportCode,
      reportStatus: updated.reportStatus
    });
    return updated;
  }

  async deleteDailyReport(id: string, context: EngineeringProjectRuntimeContext): Promise<{ id: string }> {
    this.accessPolicy.assertPermission(EngineeringDailyReportPermission.DELETE, this.permissionContext(context));
    const before = await this.findDailyReportInScope(id, context);
    this.assertDeletable(before);
    const result = await this.dailyReportsRepository.softDelete(context, context.actor.sub, id);
    await this.logChange("DELETE", before, context, this.reportSnapshot(before), { isDeleted: true });
    await this.publishReportEvent("EngineeringDailyReportDeletedEvent", before, context, {
      reportCode: before.reportCode,
      reportStatus: before.reportStatus
    });
    return result;
  }

  async submitDailyReport(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringDailyReportEntity> {
    this.accessPolicy.assertPermission(EngineeringDailyReportPermission.SUBMIT, this.permissionContext(context));
    const before = await this.findDailyReportInScope(id, context);
    this.assertSubmittable(before);
    const updated = await this.dailyReportsRepository.updateStatus(context, context.actor.sub, id, {
      reportStatus: EngineeringDailyReportStatus.SUBMITTED,
      submittedAt: new Date(),
      submittedBy: context.actor.sub
    });
    await this.logChange("SUBMIT", updated, context, this.reportSnapshot(before), this.reportSnapshot(updated));
    await this.publishReportEvent("EngineeringDailyReportSubmittedEvent", updated, context, {
      fromStatus: before.reportStatus,
      toStatus: updated.reportStatus,
      reportCode: updated.reportCode
    });
    return updated;
  }

  async reviewDailyReport(
    id: string,
    dto: ReviewEngineeringDailyReportDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringDailyReportEntity> {
    this.accessPolicy.assertPermission(EngineeringDailyReportPermission.REVIEW, this.permissionContext(context));
    const before = await this.findDailyReportInScope(id, context);
    this.assertReviewable(before);
    const nextStatus = dto.approved ? EngineeringDailyReportStatus.REVIEWED : EngineeringDailyReportStatus.REJECTED;
    const updated = await this.dailyReportsRepository.updateStatus(context, context.actor.sub, id, {
      reportStatus: nextStatus,
      reviewedAt: new Date(),
      reviewedBy: context.actor.sub,
      reviewComment: dto.review_comment ?? null
    });
    await this.logChange(dto.approved ? "REVIEW_APPROVE" : "REVIEW_REJECT", updated, context, this.reportSnapshot(before), this.reportSnapshot(updated));
    await this.publishReportEvent(dto.approved ? "EngineeringDailyReportReviewedEvent" : "EngineeringDailyReportRejectedEvent", updated, context, {
      fromStatus: before.reportStatus,
      toStatus: updated.reportStatus,
      reviewComment: dto.review_comment ?? null,
      reportCode: updated.reportCode
    });
    return updated;
  }

  async getProjectDailyReports(
    projectId: string,
    query: EngineeringDailyReportQueryDto,
    context: EngineeringProjectRuntimeContext
  ): Promise<EngineeringDailyReportEntity[]> {
    this.accessPolicy.assertPermission(EngineeringDailyReportPermission.VIEW, this.permissionContext(context));
    await this.findProjectInScope(projectId, context);
    return this.dailyReportsRepository.findByProjectId(context, projectId, query, (builder) => this.applyDailyReportScope(builder, context));
  }

  private findProjectInScope(projectId: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringProjectEntity> {
    return this.projectsRepository.findById(context, projectId, (builder) => this.dataScopeAdapter.applyProjectScope(builder, context, context.actor));
  }

  private findPlanInScope(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringPlanEntity> {
    return this.plansRepository.findById(context, id, (builder) => this.dataScopeAdapter.applyPlanScope(builder, context, context.actor));
  }

  private findDailyReportInScope(id: string, context: EngineeringProjectRuntimeContext): Promise<EngineeringDailyReportEntity> {
    return this.dailyReportsRepository.findById(context, id, (builder) => this.applyDailyReportScope(builder, context));
  }

  private applyDailyReportScope(
    builder: SelectQueryBuilder<EngineeringDailyReportEntity>,
    context: EngineeringProjectRuntimeContext
  ): Promise<void> {
    return this.dataScopeAdapter.applyDailyReportScope(builder, context, context.actor);
  }

  private async assertPlanBelongsToProject(planId: string, projectId: string, context: EngineeringProjectRuntimeContext): Promise<void> {
    const plan = await this.findPlanInScope(planId, context);
    if (plan.projectId !== projectId) {
      throw new BadRequestException("Engineering daily report plan must belong to the same project");
    }
  }

  private async assertNoDuplicate(
    projectId: string,
    reportDate: string,
    contractorOrgId: string | null,
    context: EngineeringProjectRuntimeContext,
    currentReportId?: string
  ): Promise<void> {
    const existing = await this.dailyReportsRepository.findByProjectAndDate(context, projectId, reportDate, contractorOrgId);
    if (existing && existing.id !== currentReportId) {
      throw new ConflictException("Engineering daily report already exists for this project date and contractor");
    }
  }

  private assertReportDate(reportDate: string | undefined): void {
    if (!reportDate) {
      throw new BadRequestException("reportDate is required");
    }
  }

  private assertCounts(workerCount?: number, managerCount?: number): void {
    if (workerCount !== undefined && (!Number.isInteger(workerCount) || workerCount < 0)) {
      throw new BadRequestException("workerCount must be greater than or equal to 0");
    }
    if (managerCount !== undefined && (!Number.isInteger(managerCount) || managerCount < 0)) {
      throw new BadRequestException("managerCount must be greater than or equal to 0");
    }
  }

  private assertProgress(progress: number, fieldName: string): void {
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      throw new BadRequestException(`${fieldName} must be between 0 and 100`);
    }
  }

  private assertEditable(report: EngineeringDailyReportEntity): void {
    if (![EngineeringDailyReportStatus.DRAFT, EngineeringDailyReportStatus.REJECTED].includes(report.reportStatus)) {
      throw new BadRequestException("Only DRAFT or REJECTED engineering daily reports can be edited");
    }
  }

  private assertSubmittable(report: EngineeringDailyReportEntity): void {
    if (![EngineeringDailyReportStatus.DRAFT, EngineeringDailyReportStatus.REJECTED].includes(report.reportStatus)) {
      throw new BadRequestException("Only DRAFT or REJECTED engineering daily reports can be submitted");
    }
  }

  private assertReviewable(report: EngineeringDailyReportEntity): void {
    if (report.reportStatus !== EngineeringDailyReportStatus.SUBMITTED) {
      throw new BadRequestException("Only SUBMITTED engineering daily reports can be reviewed");
    }
  }

  private assertDeletable(report: EngineeringDailyReportEntity): void {
    if (![EngineeringDailyReportStatus.DRAFT, EngineeringDailyReportStatus.REJECTED].includes(report.reportStatus)) {
      throw new BadRequestException("Only DRAFT or REJECTED engineering daily reports can be deleted");
    }
  }

  private permissionContext(context: EngineeringProjectRuntimeContext): { actorPermissions: string[] } {
    return { actorPermissions: context.actor.permissions };
  }

  private toCreateInput(dto: CreateEngineeringDailyReportDto, project: EngineeringProjectEntity): CreateEngineeringDailyReportInput {
    return {
      orgId: project.orgId,
      projectId: dto.project_id,
      planId: dto.plan_id ?? null,
      reportDate: dto.report_date,
      weather: dto.weather,
      temperature: dto.temperature ?? null,
      workContent: dto.work_content,
      completedWork: dto.completed_work ?? null,
      unfinishedWork: dto.unfinished_work ?? null,
      tomorrowPlan: dto.tomorrow_plan ?? null,
      workerCount: dto.worker_count,
      managerCount: dto.manager_count,
      machineSummary: dto.machine_summary ?? null,
      materialSummary: dto.material_summary ?? null,
      qualitySummary: dto.quality_summary ?? null,
      safetySummary: dto.safety_summary ?? null,
      issueSummary: dto.issue_summary ?? null,
      progressPercent: dto.progress_percent,
      contractorOrgId: dto.contractor_org_id ?? null,
      supervisorOrgId: dto.supervisor_org_id ?? null,
      attachmentIds: dto.attachment_ids ?? null,
      remark: dto.remark ?? null
    };
  }

  private toUpdateInput(dto: UpdateEngineeringDailyReportDto): UpdateEngineeringDailyReportInput {
    const input: UpdateEngineeringDailyReportInput = {};
    this.assignIfDefined(input, "planId", dto.plan_id ?? undefined);
    this.assignIfDefined(input, "weather", dto.weather);
    this.assignIfDefined(input, "temperature", dto.temperature ?? undefined);
    this.assignIfDefined(input, "workContent", dto.work_content);
    this.assignIfDefined(input, "completedWork", dto.completed_work ?? undefined);
    this.assignIfDefined(input, "unfinishedWork", dto.unfinished_work ?? undefined);
    this.assignIfDefined(input, "tomorrowPlan", dto.tomorrow_plan ?? undefined);
    this.assignIfDefined(input, "workerCount", dto.worker_count);
    this.assignIfDefined(input, "managerCount", dto.manager_count);
    this.assignIfDefined(input, "machineSummary", dto.machine_summary ?? undefined);
    this.assignIfDefined(input, "materialSummary", dto.material_summary ?? undefined);
    this.assignIfDefined(input, "qualitySummary", dto.quality_summary ?? undefined);
    this.assignIfDefined(input, "safetySummary", dto.safety_summary ?? undefined);
    this.assignIfDefined(input, "issueSummary", dto.issue_summary ?? undefined);
    this.assignIfDefined(input, "progressPercent", dto.progress_percent);
    this.assignIfDefined(input, "contractorOrgId", dto.contractor_org_id ?? undefined);
    this.assignIfDefined(input, "supervisorOrgId", dto.supervisor_org_id ?? undefined);
    this.assignIfDefined(input, "attachmentIds", dto.attachment_ids ?? undefined);
    this.assignIfDefined(input, "remark", dto.remark ?? undefined);
    return input;
  }

  private assignIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
    if (value !== undefined) {
      target[key] = value;
    }
  }

  private reportSnapshot(report: EngineeringDailyReportEntity): Record<string, unknown> {
    return {
      id: report.id,
      projectId: report.projectId,
      planId: report.planId,
      reportCode: report.reportCode,
      reportDate: report.reportDate,
      weather: report.weather,
      progressPercent: report.progressPercent,
      reportStatus: report.reportStatus,
      contractorOrgId: report.contractorOrgId,
      supervisorOrgId: report.supervisorOrgId,
      submittedAt: report.submittedAt,
      reviewedAt: report.reviewedAt
    };
  }

  private async logChange(
    action: string,
    report: EngineeringDailyReportEntity,
    context: EngineeringProjectRuntimeContext,
    beforeJson: Record<string, unknown> | null,
    afterJson: Record<string, unknown> | null
  ): Promise<void> {
    await this.auditLogger.logDailyReportChanged({
      tenantId: context.tenantId,
      parkId: context.parkId,
      projectId: report.projectId,
      dailyReportId: report.id,
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

  private async publishReportEvent(
    eventType:
      | "EngineeringDailyReportCreatedEvent"
      | "EngineeringDailyReportUpdatedEvent"
      | "EngineeringDailyReportSubmittedEvent"
      | "EngineeringDailyReportReviewedEvent"
      | "EngineeringDailyReportRejectedEvent"
      | "EngineeringDailyReportDeletedEvent",
    report: EngineeringDailyReportEntity,
    context: EngineeringProjectRuntimeContext,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.eventPublisher.publishDailyReportEvent({
      eventType,
      tenantId: context.tenantId,
      projectId: report.projectId,
      dailyReportId: report.id,
      actorUserId: context.actor.sub,
      payload
    });
  }
}
