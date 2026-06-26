import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { buildEngineeringIssueCodePrefix, nextEngineeringIssueCode } from "../domain/engineering-issue-code.policy";
import {
  EngineeringIssueSeverity,
  EngineeringIssueSourceType,
  EngineeringIssueStatus,
  EngineeringIssueType
} from "../domain/engineering-project.enums";
import { EngineeringIssueEntity } from "../entities/engineering-issue.entity";

export interface EngineeringIssueQuery {
  project_id?: string;
  inspection_id?: string;
  plan_id?: string;
  daily_report_id?: string;
  keyword?: string;
  issue_type?: EngineeringIssueType | "";
  severity?: EngineeringIssueSeverity | "";
  issue_status?: EngineeringIssueStatus | "";
  responsible_user_id?: string;
  responsible_org_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  deadline_from?: string;
  deadline_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface CreateEngineeringIssueInput {
  orgId?: string | null;
  projectId: string;
  inspectionId?: string | null;
  planId?: string | null;
  dailyReportId?: string | null;
  issueCode?: string;
  issueTitle: string;
  issueType: EngineeringIssueType;
  severity: EngineeringIssueSeverity;
  description: string;
  locationText?: string | null;
  buildingId?: string | null;
  floorId?: string | null;
  spaceId?: string | null;
  responsibleUserId?: string | null;
  responsibleOrgId?: string | null;
  contractorOrgId?: string | null;
  supervisorOrgId?: string | null;
  discoveredAt?: Date;
  deadline?: string | null;
  rectificationId?: string | null;
  sourceType?: EngineeringIssueSourceType;
  sourceId?: string | null;
  attachmentIds?: string[] | null;
  remark?: string | null;
}

export interface UpdateEngineeringIssueInput {
  inspectionId?: string | null;
  planId?: string | null;
  dailyReportId?: string | null;
  issueTitle?: string;
  issueType?: EngineeringIssueType;
  severity?: EngineeringIssueSeverity;
  issueStatus?: EngineeringIssueStatus;
  description?: string;
  locationText?: string | null;
  buildingId?: string | null;
  floorId?: string | null;
  spaceId?: string | null;
  responsibleUserId?: string | null;
  responsibleOrgId?: string | null;
  contractorOrgId?: string | null;
  supervisorOrgId?: string | null;
  discoveredAt?: Date;
  deadline?: string | null;
  rectificationId?: string | null;
  sourceType?: EngineeringIssueSourceType;
  sourceId?: string | null;
  attachmentIds?: string[] | null;
  closedAt?: Date | null;
  closedBy?: string | null;
  remark?: string | null;
}

export interface EngineeringIssueCountRow<T extends string> {
  key: T;
  count: number;
}

const DEFAULT_SORT_COLUMN = "issue.discovered_at";
const SORT_COLUMN_MAP: Record<string, string> = {
  issue_code: "issue.issue_code",
  discovered_at: "issue.discovered_at",
  deadline: "issue.deadline",
  issue_status: "issue.issue_status",
  severity: "issue.severity",
  create_time: "issue.create_time",
  update_time: "issue.update_time"
};

@Injectable()
export class EngineeringIssueRepository {
  constructor(
    @InjectRepository(EngineeringIssueEntity)
    private readonly repository: Repository<EngineeringIssueEntity>
  ) {}

  async createIssue(scope: TenantParkScope, actorId: string | null, input: CreateEngineeringIssueInput): Promise<EngineeringIssueEntity> {
    const issueCode = input.issueCode ?? (await this.generateIssueCode(scope.tenantId));
    if (await this.existsByCode(scope, issueCode)) {
      throw new ConflictException("Engineering issue code already exists");
    }
    const entity = this.repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      orgId: input.orgId ?? null,
      projectId: input.projectId,
      inspectionId: input.inspectionId ?? null,
      planId: input.planId ?? null,
      dailyReportId: input.dailyReportId ?? null,
      issueCode,
      issueTitle: input.issueTitle,
      issueType: input.issueType,
      severity: input.severity,
      issueStatus: EngineeringIssueStatus.OPEN,
      description: input.description,
      locationText: input.locationText ?? null,
      buildingId: input.buildingId ?? null,
      floorId: input.floorId ?? null,
      spaceId: input.spaceId ?? null,
      responsibleUserId: input.responsibleUserId ?? null,
      responsibleOrgId: input.responsibleOrgId ?? null,
      contractorOrgId: input.contractorOrgId ?? null,
      supervisorOrgId: input.supervisorOrgId ?? null,
      discoveredAt: input.discoveredAt ?? new Date(),
      deadline: input.deadline ?? null,
      rectificationId: input.rectificationId ?? null,
      sourceType: input.sourceType ?? EngineeringIssueSourceType.INSPECTION,
      sourceId: input.sourceId ?? input.inspectionId ?? null,
      attachmentIds: input.attachmentIds ?? null,
      closedAt: null,
      closedBy: null,
      remark: input.remark ?? null,
      createBy: actorId,
      updateBy: actorId
    });
    return this.repository.save(entity);
  }

  async findById(
    scope: TenantParkScope,
    id: string,
    applyScope?: (builder: SelectQueryBuilder<EngineeringIssueEntity>) => Promise<void> | void
  ): Promise<EngineeringIssueEntity> {
    const builder = this.createScopedQueryBuilder(scope).andWhere("issue.id = :id", { id });
    await applyScope?.(builder);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Engineering issue not found");
    return entity;
  }

  async findByCode(scope: Pick<TenantParkScope, "tenantId">, issueCode: string): Promise<EngineeringIssueEntity | null> {
    return this.repository.findOne({ where: { tenantId: scope.tenantId, issueCode, isDeleted: false } });
  }

  async paginateIssues(
    scope: TenantParkScope,
    query: EngineeringIssueQuery,
    applyScope?: (builder: SelectQueryBuilder<EngineeringIssueEntity>) => Promise<void> | void
  ): Promise<PaginatedResult<EngineeringIssueEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.createScopedQueryBuilder(scope);
    this.applyQuery(builder, query);
    await applyScope?.(builder);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, page_size: pageSize };
  }

  async findByInspectionId(scope: TenantParkScope, inspectionId: string): Promise<EngineeringIssueEntity[]> {
    return this.createScopedQueryBuilder(scope)
      .andWhere("issue.inspection_id = :inspectionId", { inspectionId })
      .orderBy("issue.severity", "DESC")
      .addOrderBy("issue.create_time", "ASC")
      .getMany();
  }

  async findByProjectId(
    scope: TenantParkScope,
    projectId: string,
    applyScope?: (builder: SelectQueryBuilder<EngineeringIssueEntity>) => Promise<void> | void
  ): Promise<EngineeringIssueEntity[]> {
    const builder = this.createScopedQueryBuilder(scope).andWhere("issue.project_id = :projectId", { projectId });
    await applyScope?.(builder);
    return builder.orderBy("issue.discovered_at", "DESC").addOrderBy("issue.create_time", "DESC").getMany();
  }

  async updateIssue(scope: TenantParkScope, actorId: string | null, id: string, input: UpdateEngineeringIssueInput): Promise<EngineeringIssueEntity> {
    const entity = await this.findById(scope, id);
    Object.assign(entity, {
      ...input,
      updateBy: actorId
    });
    return this.repository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actorId: string | null, id: string): Promise<{ id: string }> {
    const entity = await this.findById(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.repository.save(entity);
    return { id };
  }

  async existsByCode(scope: Pick<TenantParkScope, "tenantId">, issueCode: string): Promise<boolean> {
    return this.repository.exists({ where: { tenantId: scope.tenantId, issueCode, isDeleted: false } });
  }

  async countByStatus(scope: TenantParkScope): Promise<EngineeringIssueCountRow<EngineeringIssueStatus>[]> {
    const rows = await this.createScopedQueryBuilder(scope)
      .select("issue.issue_status", "key")
      .addSelect("COUNT(issue.id)", "count")
      .groupBy("issue.issue_status")
      .orderBy("issue.issue_status", "ASC")
      .getRawMany<{ key: EngineeringIssueStatus; count: string }>();
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }

  async countBySeverity(scope: TenantParkScope): Promise<EngineeringIssueCountRow<EngineeringIssueSeverity>[]> {
    const rows = await this.createScopedQueryBuilder(scope)
      .select("issue.severity", "key")
      .addSelect("COUNT(issue.id)", "count")
      .groupBy("issue.severity")
      .orderBy("issue.severity", "ASC")
      .getRawMany<{ key: EngineeringIssueSeverity; count: string }>();
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }

  async countOpenByInspectionId(scope: TenantParkScope, inspectionId: string): Promise<number> {
    return this.createScopedQueryBuilder(scope)
      .andWhere("issue.inspection_id = :inspectionId", { inspectionId })
      .andWhere("issue.issue_status <> :closed", { closed: EngineeringIssueStatus.CLOSED })
      .getCount();
  }

  async generateIssueCode(tenantId: string, date: Date = new Date()): Promise<string> {
    const prefix = buildEngineeringIssueCodePrefix(date);
    const row = await this.repository
      .createQueryBuilder("issue")
      .select("issue.issue_code", "issueCode")
      .where("issue.tenant_id = :tenantId", { tenantId })
      .andWhere("issue.issue_code LIKE :prefix", { prefix: `${prefix}%` })
      .andWhere("issue.is_deleted = false")
      .orderBy("issue.issue_code", "DESC")
      .limit(1)
      .getRawOne<{ issueCode?: string }>();
    return nextEngineeringIssueCode(date, row?.issueCode ?? null);
  }

  createScopedQueryBuilder(scope: TenantParkScope): SelectQueryBuilder<EngineeringIssueEntity> {
    return this.repository
      .createQueryBuilder("issue")
      .where("issue.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("issue.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("issue.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<EngineeringIssueEntity>, query: EngineeringIssueQuery): void {
    if (query.project_id) builder.andWhere("issue.project_id = :projectId", { projectId: query.project_id });
    if (query.inspection_id) builder.andWhere("issue.inspection_id = :inspectionId", { inspectionId: query.inspection_id });
    if (query.plan_id) builder.andWhere("issue.plan_id = :planId", { planId: query.plan_id });
    if (query.daily_report_id) builder.andWhere("issue.daily_report_id = :dailyReportId", { dailyReportId: query.daily_report_id });
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("issue.issue_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("issue.issue_title ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("issue.description ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.issue_type) builder.andWhere("issue.issue_type = :issueType", { issueType: query.issue_type });
    if (query.severity) builder.andWhere("issue.severity = :severity", { severity: query.severity });
    if (query.issue_status) builder.andWhere("issue.issue_status = :issueStatus", { issueStatus: query.issue_status });
    if (query.responsible_user_id) builder.andWhere("issue.responsible_user_id = :responsibleUserId", { responsibleUserId: query.responsible_user_id });
    if (query.responsible_org_id) builder.andWhere("issue.responsible_org_id = :responsibleOrgId", { responsibleOrgId: query.responsible_org_id });
    if (query.contractor_org_id) builder.andWhere("issue.contractor_org_id = :contractorOrgId", { contractorOrgId: query.contractor_org_id });
    if (query.supervisor_org_id) builder.andWhere("issue.supervisor_org_id = :supervisorOrgId", { supervisorOrgId: query.supervisor_org_id });
    if (query.deadline_from) builder.andWhere("issue.deadline >= :deadlineFrom", { deadlineFrom: query.deadline_from });
    if (query.deadline_to) builder.andWhere("issue.deadline <= :deadlineTo", { deadlineTo: query.deadline_to });
  }

  private applySort(builder: SelectQueryBuilder<EngineeringIssueEntity>, sort?: string): void {
    if (!sort) {
      builder.orderBy(DEFAULT_SORT_COLUMN, "DESC").addOrderBy("issue.create_time", "DESC");
      return;
    }
    const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
    builder.orderBy(SORT_COLUMN_MAP[field] ?? DEFAULT_SORT_COLUMN, direction as "ASC" | "DESC").addOrderBy("issue.create_time", "DESC");
  }
}
