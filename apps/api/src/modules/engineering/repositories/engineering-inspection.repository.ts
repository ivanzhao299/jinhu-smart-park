import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { buildEngineeringInspectionCodePrefix, nextEngineeringInspectionCode } from "../domain/engineering-inspection-code.policy";
import { EngineeringInspectionStatus, EngineeringInspectionType } from "../domain/engineering-project.enums";
import { EngineeringInspectionEntity } from "../entities/engineering-inspection.entity";

export interface EngineeringInspectionQuery {
  project_id?: string;
  plan_id?: string;
  daily_report_id?: string;
  keyword?: string;
  inspection_type?: EngineeringInspectionType | "";
  inspection_status?: EngineeringInspectionStatus | "";
  inspector_user_id?: string;
  inspector_org_id?: string;
  contractor_org_id?: string;
  supervisor_org_id?: string;
  inspection_date_from?: string;
  inspection_date_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface CreateEngineeringInspectionInput {
  orgId?: string | null;
  projectId: string;
  planId?: string | null;
  dailyReportId?: string | null;
  inspectionCode?: string;
  inspectionTitle: string;
  inspectionType: EngineeringInspectionType;
  inspectionDate: string;
  inspectorUserId?: string | null;
  inspectorOrgId?: string | null;
  contractorOrgId?: string | null;
  supervisorOrgId?: string | null;
  locationText?: string | null;
  buildingId?: string | null;
  floorId?: string | null;
  spaceId?: string | null;
  summary?: string | null;
  overallResult?: string | null;
  issueCount?: number;
  criticalIssueCount?: number;
  attachmentIds?: string[] | null;
  remark?: string | null;
}

export interface UpdateEngineeringInspectionInput {
  planId?: string | null;
  dailyReportId?: string | null;
  inspectionTitle?: string;
  inspectionType?: EngineeringInspectionType;
  inspectionDate?: string;
  inspectorUserId?: string | null;
  inspectorOrgId?: string | null;
  contractorOrgId?: string | null;
  supervisorOrgId?: string | null;
  locationText?: string | null;
  buildingId?: string | null;
  floorId?: string | null;
  spaceId?: string | null;
  inspectionStatus?: EngineeringInspectionStatus;
  summary?: string | null;
  overallResult?: string | null;
  issueCount?: number;
  criticalIssueCount?: number;
  attachmentIds?: string[] | null;
  submittedAt?: Date | null;
  submittedBy?: string | null;
  remark?: string | null;
}

export interface EngineeringInspectionCountRow<T extends string> {
  key: T;
  count: number;
}

const DEFAULT_SORT_COLUMN = "inspection.inspection_date";
const SORT_COLUMN_MAP: Record<string, string> = {
  inspection_code: "inspection.inspection_code",
  inspection_date: "inspection.inspection_date",
  inspection_status: "inspection.inspection_status",
  inspection_type: "inspection.inspection_type",
  create_time: "inspection.create_time",
  update_time: "inspection.update_time"
};

@Injectable()
export class EngineeringInspectionRepository {
  constructor(
    @InjectRepository(EngineeringInspectionEntity)
    private readonly repository: Repository<EngineeringInspectionEntity>
  ) {}

  async createInspection(scope: TenantParkScope, actorId: string | null, input: CreateEngineeringInspectionInput): Promise<EngineeringInspectionEntity> {
    const inspectionCode = input.inspectionCode ?? (await this.generateInspectionCode(scope.tenantId));
    if (await this.existsByCode(scope, inspectionCode)) {
      throw new ConflictException("Engineering inspection code already exists");
    }
    const entity = this.repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      orgId: input.orgId ?? null,
      projectId: input.projectId,
      planId: input.planId ?? null,
      dailyReportId: input.dailyReportId ?? null,
      inspectionCode,
      inspectionTitle: input.inspectionTitle,
      inspectionType: input.inspectionType,
      inspectionDate: input.inspectionDate,
      inspectorUserId: input.inspectorUserId ?? null,
      inspectorOrgId: input.inspectorOrgId ?? null,
      contractorOrgId: input.contractorOrgId ?? null,
      supervisorOrgId: input.supervisorOrgId ?? null,
      locationText: input.locationText ?? null,
      buildingId: input.buildingId ?? null,
      floorId: input.floorId ?? null,
      spaceId: input.spaceId ?? null,
      inspectionStatus: EngineeringInspectionStatus.DRAFT,
      summary: input.summary ?? null,
      overallResult: input.overallResult ?? null,
      issueCount: input.issueCount ?? 0,
      criticalIssueCount: input.criticalIssueCount ?? 0,
      attachmentIds: input.attachmentIds ?? null,
      submittedAt: null,
      submittedBy: null,
      remark: input.remark ?? null,
      createBy: actorId,
      updateBy: actorId
    });
    return this.repository.save(entity);
  }

  async findById(
    scope: TenantParkScope,
    id: string,
    applyScope?: (builder: SelectQueryBuilder<EngineeringInspectionEntity>) => Promise<void> | void
  ): Promise<EngineeringInspectionEntity> {
    const builder = this.createScopedQueryBuilder(scope).andWhere("inspection.id = :id", { id });
    await applyScope?.(builder);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Engineering inspection not found");
    return entity;
  }

  async findByCode(scope: Pick<TenantParkScope, "tenantId">, inspectionCode: string): Promise<EngineeringInspectionEntity | null> {
    return this.repository.findOne({ where: { tenantId: scope.tenantId, inspectionCode, isDeleted: false } });
  }

  async paginateInspections(
    scope: TenantParkScope,
    query: EngineeringInspectionQuery,
    applyScope?: (builder: SelectQueryBuilder<EngineeringInspectionEntity>) => Promise<void> | void
  ): Promise<PaginatedResult<EngineeringInspectionEntity>> {
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
    applyScope?: (builder: SelectQueryBuilder<EngineeringInspectionEntity>) => Promise<void> | void
  ): Promise<EngineeringInspectionEntity[]> {
    const builder = this.createScopedQueryBuilder(scope).andWhere("inspection.project_id = :projectId", { projectId });
    await applyScope?.(builder);
    return builder.orderBy("inspection.inspection_date", "DESC").addOrderBy("inspection.create_time", "DESC").getMany();
  }

  async updateInspection(
    scope: TenantParkScope,
    actorId: string | null,
    id: string,
    input: UpdateEngineeringInspectionInput
  ): Promise<EngineeringInspectionEntity> {
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

  async existsByCode(scope: Pick<TenantParkScope, "tenantId">, inspectionCode: string): Promise<boolean> {
    return this.repository.exists({ where: { tenantId: scope.tenantId, inspectionCode, isDeleted: false } });
  }

  async countByStatus(scope: TenantParkScope): Promise<EngineeringInspectionCountRow<EngineeringInspectionStatus>[]> {
    const rows = await this.createScopedQueryBuilder(scope)
      .select("inspection.inspection_status", "key")
      .addSelect("COUNT(inspection.id)", "count")
      .groupBy("inspection.inspection_status")
      .orderBy("inspection.inspection_status", "ASC")
      .getRawMany<{ key: EngineeringInspectionStatus; count: string }>();
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }

  async countByProjectId(scope: TenantParkScope, projectId: string): Promise<number> {
    return this.createScopedQueryBuilder(scope).andWhere("inspection.project_id = :projectId", { projectId }).getCount();
  }

  async generateInspectionCode(tenantId: string, date: Date = new Date()): Promise<string> {
    const prefix = buildEngineeringInspectionCodePrefix(date);
    const row = await this.repository
      .createQueryBuilder("inspection")
      .select("inspection.inspection_code", "inspectionCode")
      .where("inspection.tenant_id = :tenantId", { tenantId })
      .andWhere("inspection.inspection_code LIKE :prefix", { prefix: `${prefix}%` })
      .andWhere("inspection.is_deleted = false")
      .orderBy("inspection.inspection_code", "DESC")
      .limit(1)
      .getRawOne<{ inspectionCode?: string }>();
    return nextEngineeringInspectionCode(date, row?.inspectionCode ?? null);
  }

  createScopedQueryBuilder(scope: TenantParkScope): SelectQueryBuilder<EngineeringInspectionEntity> {
    return this.repository
      .createQueryBuilder("inspection")
      .where("inspection.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("inspection.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("inspection.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<EngineeringInspectionEntity>, query: EngineeringInspectionQuery): void {
    if (query.project_id) builder.andWhere("inspection.project_id = :projectId", { projectId: query.project_id });
    if (query.plan_id) builder.andWhere("inspection.plan_id = :planId", { planId: query.plan_id });
    if (query.daily_report_id) builder.andWhere("inspection.daily_report_id = :dailyReportId", { dailyReportId: query.daily_report_id });
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("inspection.inspection_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("inspection.inspection_title ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("inspection.summary ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.inspection_type) builder.andWhere("inspection.inspection_type = :inspectionType", { inspectionType: query.inspection_type });
    if (query.inspection_status) builder.andWhere("inspection.inspection_status = :inspectionStatus", { inspectionStatus: query.inspection_status });
    if (query.inspector_user_id) builder.andWhere("inspection.inspector_user_id = :inspectorUserId", { inspectorUserId: query.inspector_user_id });
    if (query.inspector_org_id) builder.andWhere("inspection.inspector_org_id = :inspectorOrgId", { inspectorOrgId: query.inspector_org_id });
    if (query.contractor_org_id) builder.andWhere("inspection.contractor_org_id = :contractorOrgId", { contractorOrgId: query.contractor_org_id });
    if (query.supervisor_org_id) builder.andWhere("inspection.supervisor_org_id = :supervisorOrgId", { supervisorOrgId: query.supervisor_org_id });
    if (query.inspection_date_from) builder.andWhere("inspection.inspection_date >= :inspectionDateFrom", { inspectionDateFrom: query.inspection_date_from });
    if (query.inspection_date_to) builder.andWhere("inspection.inspection_date <= :inspectionDateTo", { inspectionDateTo: query.inspection_date_to });
  }

  private applySort(builder: SelectQueryBuilder<EngineeringInspectionEntity>, sort?: string): void {
    if (!sort) {
      builder.orderBy(DEFAULT_SORT_COLUMN, "DESC").addOrderBy("inspection.create_time", "DESC");
      return;
    }
    const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
    builder.orderBy(SORT_COLUMN_MAP[field] ?? DEFAULT_SORT_COLUMN, direction as "ASC" | "DESC").addOrderBy("inspection.create_time", "DESC");
  }
}
