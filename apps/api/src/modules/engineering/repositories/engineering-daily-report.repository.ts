import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { EngineeringDailyReportQueryDto } from "../dto/engineering-daily-report.dto";
import { buildEngineeringDailyReportCodePrefix, nextEngineeringDailyReportCode } from "../domain/engineering-daily-report-code.policy";
import { EngineeringDailyReportStatus, EngineeringWeatherType } from "../domain/engineering-project.enums";
import { EngineeringDailyReportEntity } from "../entities/engineering-daily-report.entity";

export interface CreateEngineeringDailyReportInput {
  orgId?: string | null;
  projectId: string;
  planId?: string | null;
  reportCode?: string;
  reportDate: string;
  weather: EngineeringWeatherType;
  temperature?: string | null;
  workContent: string;
  completedWork?: string | null;
  unfinishedWork?: string | null;
  tomorrowPlan?: string | null;
  workerCount?: number;
  managerCount?: number;
  machineSummary?: string | null;
  materialSummary?: string | null;
  qualitySummary?: string | null;
  safetySummary?: string | null;
  issueSummary?: string | null;
  progressPercent?: number;
  contractorOrgId?: string | null;
  supervisorOrgId?: string | null;
  attachmentIds?: string[] | null;
  remark?: string | null;
}

export interface UpdateEngineeringDailyReportInput {
  planId?: string | null;
  weather?: EngineeringWeatherType;
  temperature?: string | null;
  workContent?: string;
  completedWork?: string | null;
  unfinishedWork?: string | null;
  tomorrowPlan?: string | null;
  workerCount?: number;
  managerCount?: number;
  machineSummary?: string | null;
  materialSummary?: string | null;
  qualitySummary?: string | null;
  safetySummary?: string | null;
  issueSummary?: string | null;
  progressPercent?: number;
  contractorOrgId?: string | null;
  supervisorOrgId?: string | null;
  attachmentIds?: string[] | null;
  remark?: string | null;
}

export interface UpdateEngineeringDailyReportStatusInput {
  reportStatus: EngineeringDailyReportStatus;
  submittedAt?: Date | null;
  submittedBy?: string | null;
  reviewedAt?: Date | null;
  reviewedBy?: string | null;
  reviewComment?: string | null;
}

export interface EngineeringDailyReportCountRow<T extends string> {
  key: T;
  count: number;
}

const DEFAULT_SORT_COLUMN = "report.report_date";
const SORT_COLUMN_MAP: Record<string, string> = {
  report_code: "report.report_code",
  report_date: "report.report_date",
  report_status: "report.report_status",
  weather: "report.weather",
  progress_percent: "report.progress_percent",
  create_time: "report.create_time",
  update_time: "report.update_time"
};

@Injectable()
export class EngineeringDailyReportRepository {
  constructor(
    @InjectRepository(EngineeringDailyReportEntity)
    private readonly repository: Repository<EngineeringDailyReportEntity>
  ) {}

  async createDailyReport(
    scope: TenantParkScope,
    actorId: string | null,
    input: CreateEngineeringDailyReportInput
  ): Promise<EngineeringDailyReportEntity> {
    const reportCode = input.reportCode ?? (await this.generateReportCode(scope.tenantId));
    if (await this.existsByCode(scope, reportCode)) {
      throw new ConflictException("Engineering daily report code already exists");
    }
    const entity = this.repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      orgId: input.orgId ?? null,
      projectId: input.projectId,
      planId: input.planId ?? null,
      reportCode,
      reportDate: input.reportDate,
      weather: input.weather,
      temperature: input.temperature ?? null,
      workContent: input.workContent,
      completedWork: input.completedWork ?? null,
      unfinishedWork: input.unfinishedWork ?? null,
      tomorrowPlan: input.tomorrowPlan ?? null,
      workerCount: input.workerCount ?? 0,
      managerCount: input.managerCount ?? 0,
      machineSummary: input.machineSummary ?? null,
      materialSummary: input.materialSummary ?? null,
      qualitySummary: input.qualitySummary ?? null,
      safetySummary: input.safetySummary ?? null,
      issueSummary: input.issueSummary ?? null,
      progressPercent: input.progressPercent ?? 0,
      reportStatus: EngineeringDailyReportStatus.DRAFT,
      submittedAt: null,
      submittedBy: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewComment: null,
      contractorOrgId: input.contractorOrgId ?? null,
      supervisorOrgId: input.supervisorOrgId ?? null,
      attachmentIds: input.attachmentIds ?? null,
      remark: input.remark ?? null,
      createBy: actorId,
      updateBy: actorId
    });
    return this.repository.save(entity);
  }

  async findById(
    scope: TenantParkScope,
    id: string,
    applyScope?: (builder: SelectQueryBuilder<EngineeringDailyReportEntity>) => Promise<void> | void
  ): Promise<EngineeringDailyReportEntity> {
    const builder = this.createScopedQueryBuilder(scope).andWhere("report.id = :id", { id });
    await applyScope?.(builder);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Engineering daily report not found");
    return entity;
  }

  async findByCode(scope: Pick<TenantParkScope, "tenantId">, reportCode: string): Promise<EngineeringDailyReportEntity | null> {
    return this.repository.findOne({ where: { tenantId: scope.tenantId, reportCode, isDeleted: false } });
  }

  async findByProjectAndDate(
    scope: TenantParkScope,
    projectId: string,
    reportDate: string,
    contractorOrgId?: string | null
  ): Promise<EngineeringDailyReportEntity | null> {
    const builder = this.createScopedQueryBuilder(scope)
      .andWhere("report.project_id = :projectId", { projectId })
      .andWhere("report.report_date = :reportDate", { reportDate });
    if (contractorOrgId) {
      builder.andWhere("report.contractor_org_id = :contractorOrgId", { contractorOrgId });
    } else {
      builder.andWhere("report.contractor_org_id IS NULL");
    }
    return builder.getOne();
  }

  async paginateDailyReports(
    scope: TenantParkScope,
    query: EngineeringDailyReportQueryDto,
    applyScope?: (builder: SelectQueryBuilder<EngineeringDailyReportEntity>) => Promise<void> | void
  ): Promise<PaginatedResult<EngineeringDailyReportEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.createScopedQueryBuilder(scope);
    this.applyQuery(builder, query);
    await applyScope?.(builder);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, page_size: pageSize };
  }

  async findByProjectId(
    scope: TenantParkScope,
    projectId: string,
    query: Pick<EngineeringDailyReportQueryDto, "report_date_from" | "report_date_to" | "report_status"> = {},
    applyScope?: (builder: SelectQueryBuilder<EngineeringDailyReportEntity>) => Promise<void> | void
  ): Promise<EngineeringDailyReportEntity[]> {
    const builder = this.createScopedQueryBuilder(scope).andWhere("report.project_id = :projectId", { projectId });
    if (query.report_status) builder.andWhere("report.report_status = :reportStatus", { reportStatus: query.report_status });
    if (query.report_date_from) builder.andWhere("report.report_date >= :reportDateFrom", { reportDateFrom: query.report_date_from });
    if (query.report_date_to) builder.andWhere("report.report_date <= :reportDateTo", { reportDateTo: query.report_date_to });
    await applyScope?.(builder);
    return builder.orderBy("report.report_date", "DESC").addOrderBy("report.create_time", "DESC").getMany();
  }

  async updateDailyReport(
    scope: TenantParkScope,
    actorId: string | null,
    id: string,
    input: UpdateEngineeringDailyReportInput
  ): Promise<EngineeringDailyReportEntity> {
    const entity = await this.findById(scope, id);
    Object.assign(entity, {
      ...input,
      updateBy: actorId
    });
    return this.repository.save(entity);
  }

  async updateStatus(
    scope: TenantParkScope,
    actorId: string | null,
    id: string,
    input: UpdateEngineeringDailyReportStatusInput
  ): Promise<EngineeringDailyReportEntity> {
    const entity = await this.findById(scope, id);
    entity.reportStatus = input.reportStatus;
    if (input.submittedAt !== undefined) entity.submittedAt = input.submittedAt;
    if (input.submittedBy !== undefined) entity.submittedBy = input.submittedBy;
    if (input.reviewedAt !== undefined) entity.reviewedAt = input.reviewedAt;
    if (input.reviewedBy !== undefined) entity.reviewedBy = input.reviewedBy;
    if (input.reviewComment !== undefined) entity.reviewComment = input.reviewComment;
    entity.updateBy = actorId;
    return this.repository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actorId: string | null, id: string): Promise<{ id: string }> {
    const entity = await this.findById(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.repository.save(entity);
    return { id };
  }

  async existsByCode(scope: Pick<TenantParkScope, "tenantId">, reportCode: string): Promise<boolean> {
    return this.repository.exists({ where: { tenantId: scope.tenantId, reportCode, isDeleted: false } });
  }

  async countByStatus(scope: TenantParkScope): Promise<EngineeringDailyReportCountRow<EngineeringDailyReportStatus>[]> {
    const rows = await this.createScopedQueryBuilder(scope)
      .select("report.report_status", "key")
      .addSelect("COUNT(report.id)", "count")
      .groupBy("report.report_status")
      .orderBy("report.report_status", "ASC")
      .getRawMany<{ key: EngineeringDailyReportStatus; count: string }>();
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }

  async countByProjectId(scope: TenantParkScope, projectId: string): Promise<number> {
    return this.createScopedQueryBuilder(scope).andWhere("report.project_id = :projectId", { projectId }).getCount();
  }

  async generateReportCode(tenantId: string, date: Date = new Date()): Promise<string> {
    const prefix = buildEngineeringDailyReportCodePrefix(date);
    const row = await this.repository
      .createQueryBuilder("report")
      .select("report.report_code", "reportCode")
      .where("report.tenant_id = :tenantId", { tenantId })
      .andWhere("report.report_code LIKE :prefix", { prefix: `${prefix}%` })
      .andWhere("report.is_deleted = false")
      .orderBy("report.report_code", "DESC")
      .limit(1)
      .getRawOne<{ reportCode?: string }>();
    return nextEngineeringDailyReportCode(date, row?.reportCode ?? null);
  }

  createScopedQueryBuilder(scope: TenantParkScope): SelectQueryBuilder<EngineeringDailyReportEntity> {
    return this.repository
      .createQueryBuilder("report")
      .where("report.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("report.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("report.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<EngineeringDailyReportEntity>, query: EngineeringDailyReportQueryDto): void {
    if (query.project_id) builder.andWhere("report.project_id = :projectId", { projectId: query.project_id });
    if (query.plan_id) builder.andWhere("report.plan_id = :planId", { planId: query.plan_id });
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("report.report_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("report.work_content ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("report.completed_work ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("report.issue_summary ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.report_status) builder.andWhere("report.report_status = :reportStatus", { reportStatus: query.report_status });
    if (query.weather) builder.andWhere("report.weather = :weather", { weather: query.weather });
    if (query.contractor_org_id) builder.andWhere("report.contractor_org_id = :contractorOrgId", { contractorOrgId: query.contractor_org_id });
    if (query.supervisor_org_id) builder.andWhere("report.supervisor_org_id = :supervisorOrgId", { supervisorOrgId: query.supervisor_org_id });
    if (query.report_date_from) builder.andWhere("report.report_date >= :reportDateFrom", { reportDateFrom: query.report_date_from });
    if (query.report_date_to) builder.andWhere("report.report_date <= :reportDateTo", { reportDateTo: query.report_date_to });
  }

  private applySort(builder: SelectQueryBuilder<EngineeringDailyReportEntity>, sort?: string): void {
    if (!sort) {
      builder.orderBy(DEFAULT_SORT_COLUMN, "DESC").addOrderBy("report.create_time", "DESC");
      return;
    }
    const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
    builder.orderBy(SORT_COLUMN_MAP[field] ?? DEFAULT_SORT_COLUMN, direction as "ASC" | "DESC").addOrderBy("report.create_time", "DESC");
  }
}
