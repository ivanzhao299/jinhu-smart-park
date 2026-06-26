import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { EngineeringAcceptanceQueryDto } from "../dto/engineering-acceptance.dto";
import { buildEngineeringAcceptanceCodePrefix, nextEngineeringAcceptanceCode } from "../domain/engineering-acceptance-code.policy";
import { EngineeringAcceptanceStatus, EngineeringAcceptanceType, EngineeringRiskLevel } from "../domain/engineering-project.enums";
import { EngineeringAcceptanceEntity } from "../entities/engineering-acceptance.entity";

export interface CreateEngineeringAcceptanceInput {
  orgId?: string | null;
  projectId: string;
  planId?: string | null;
  acceptanceCode?: string;
  acceptanceName: string;
  acceptanceType: EngineeringAcceptanceType;
  riskLevel?: EngineeringRiskLevel;
  plannedAcceptanceDate: string;
  description?: string | null;
  acceptanceScope?: string | null;
  acceptanceCriteria?: string | null;
  responsibleUserId?: string | null;
  acceptanceOrgId?: string | null;
  contractorOrgId?: string | null;
  supervisorOrgId?: string | null;
  locationText?: string | null;
  buildingId?: string | null;
  floorId?: string | null;
  spaceId?: string | null;
  workflowInstanceId?: string | null;
  attachmentIds?: string[] | null;
}

export interface UpdateEngineeringAcceptanceInput {
  planId?: string | null;
  acceptanceName?: string;
  acceptanceType?: EngineeringAcceptanceType;
  riskLevel?: EngineeringRiskLevel;
  plannedAcceptanceDate?: string;
  actualAcceptanceDate?: string | null;
  description?: string | null;
  acceptanceScope?: string | null;
  acceptanceCriteria?: string | null;
  resultSummary?: string | null;
  responsibleUserId?: string | null;
  acceptanceOrgId?: string | null;
  contractorOrgId?: string | null;
  supervisorOrgId?: string | null;
  locationText?: string | null;
  buildingId?: string | null;
  floorId?: string | null;
  spaceId?: string | null;
  attachmentIds?: string[] | null;
}

export interface UpdateEngineeringAcceptanceStatusInput {
  acceptanceStatus: EngineeringAcceptanceStatus;
  actualAcceptanceDate?: string | null;
  submittedAt?: Date | null;
  submittedBy?: string | null;
  reviewedAt?: Date | null;
  reviewedBy?: string | null;
  reviewComment?: string | null;
  resultSummary?: string | null;
  closedAt?: Date | null;
  closedBy?: string | null;
}

export interface EngineeringAcceptanceCountRow<T extends string> {
  key: T;
  count: number;
}

const DEFAULT_SORT_COLUMN = "acceptance.planned_acceptance_date";
const SORT_COLUMN_MAP: Record<string, string> = {
  acceptance_code: "acceptance.acceptance_code",
  planned_acceptance_date: "acceptance.planned_acceptance_date",
  actual_acceptance_date: "acceptance.actual_acceptance_date",
  acceptance_status: "acceptance.acceptance_status",
  acceptance_type: "acceptance.acceptance_type",
  create_time: "acceptance.create_time",
  update_time: "acceptance.update_time"
};

@Injectable()
export class EngineeringAcceptanceRepository {
  constructor(
    @InjectRepository(EngineeringAcceptanceEntity)
    private readonly repository: Repository<EngineeringAcceptanceEntity>
  ) {}

  async createAcceptance(
    scope: TenantParkScope,
    actorId: string | null,
    input: CreateEngineeringAcceptanceInput
  ): Promise<EngineeringAcceptanceEntity> {
    const acceptanceCode = input.acceptanceCode ?? (await this.generateAcceptanceCode(scope.tenantId));
    if (await this.existsByCode(scope, acceptanceCode)) {
      throw new ConflictException("Engineering acceptance code already exists");
    }
    const entity = this.repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      orgId: input.orgId ?? null,
      projectId: input.projectId,
      planId: input.planId ?? null,
      acceptanceCode,
      acceptanceName: input.acceptanceName,
      acceptanceType: input.acceptanceType,
      acceptanceStatus: EngineeringAcceptanceStatus.DRAFT,
      riskLevel: input.riskLevel ?? EngineeringRiskLevel.MEDIUM,
      plannedAcceptanceDate: input.plannedAcceptanceDate,
      actualAcceptanceDate: null,
      description: input.description ?? null,
      acceptanceScope: input.acceptanceScope ?? null,
      acceptanceCriteria: input.acceptanceCriteria ?? null,
      resultSummary: null,
      reviewComment: null,
      responsibleUserId: input.responsibleUserId ?? null,
      acceptanceOrgId: input.acceptanceOrgId ?? null,
      contractorOrgId: input.contractorOrgId ?? null,
      supervisorOrgId: input.supervisorOrgId ?? null,
      locationText: input.locationText ?? null,
      buildingId: input.buildingId ?? null,
      floorId: input.floorId ?? null,
      spaceId: input.spaceId ?? null,
      submittedAt: null,
      submittedBy: null,
      reviewedAt: null,
      reviewedBy: null,
      closedAt: null,
      closedBy: null,
      workflowInstanceId: input.workflowInstanceId ?? null,
      attachmentIds: input.attachmentIds ?? null,
      createBy: actorId,
      updateBy: actorId
    });
    return this.repository.save(entity);
  }

  async findById(
    scope: TenantParkScope,
    id: string,
    applyScope?: (builder: SelectQueryBuilder<EngineeringAcceptanceEntity>) => Promise<void> | void
  ): Promise<EngineeringAcceptanceEntity> {
    const builder = this.createScopedQueryBuilder(scope).andWhere("acceptance.id = :id", { id });
    await applyScope?.(builder);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Engineering acceptance not found");
    return entity;
  }

  async findByCode(scope: Pick<TenantParkScope, "tenantId">, acceptanceCode: string): Promise<EngineeringAcceptanceEntity | null> {
    return this.repository.findOne({ where: { tenantId: scope.tenantId, acceptanceCode, isDeleted: false } });
  }

  async paginateAcceptances(
    scope: TenantParkScope,
    query: EngineeringAcceptanceQueryDto,
    applyScope?: (builder: SelectQueryBuilder<EngineeringAcceptanceEntity>) => Promise<void> | void
  ): Promise<PaginatedResult<EngineeringAcceptanceEntity>> {
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
    query: Pick<EngineeringAcceptanceQueryDto, "acceptance_status" | "acceptance_type"> = {},
    applyScope?: (builder: SelectQueryBuilder<EngineeringAcceptanceEntity>) => Promise<void> | void
  ): Promise<EngineeringAcceptanceEntity[]> {
    const builder = this.createScopedQueryBuilder(scope).andWhere("acceptance.project_id = :projectId", { projectId });
    if (query.acceptance_status) builder.andWhere("acceptance.acceptance_status = :status", { status: query.acceptance_status });
    if (query.acceptance_type) builder.andWhere("acceptance.acceptance_type = :type", { type: query.acceptance_type });
    await applyScope?.(builder);
    return builder.orderBy("acceptance.planned_acceptance_date", "DESC").addOrderBy("acceptance.create_time", "DESC").getMany();
  }

  async updateAcceptance(
    scope: TenantParkScope,
    actorId: string | null,
    id: string,
    input: UpdateEngineeringAcceptanceInput
  ): Promise<EngineeringAcceptanceEntity> {
    const entity = await this.findById(scope, id);
    Object.assign(entity, { ...input, updateBy: actorId });
    return this.repository.save(entity);
  }

  async updateStatus(
    scope: TenantParkScope,
    actorId: string | null,
    id: string,
    input: UpdateEngineeringAcceptanceStatusInput
  ): Promise<EngineeringAcceptanceEntity> {
    const entity = await this.findById(scope, id);
    Object.assign(entity, { ...input, updateBy: actorId });
    return this.repository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actorId: string | null, id: string): Promise<{ id: string }> {
    const entity = await this.findById(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.repository.save(entity);
    return { id };
  }

  async existsByCode(scope: Pick<TenantParkScope, "tenantId">, acceptanceCode: string): Promise<boolean> {
    return this.repository.exists({ where: { tenantId: scope.tenantId, acceptanceCode, isDeleted: false } });
  }

  async countByStatus(scope: TenantParkScope): Promise<EngineeringAcceptanceCountRow<EngineeringAcceptanceStatus>[]> {
    const rows = await this.createScopedQueryBuilder(scope)
      .select("acceptance.acceptance_status", "key")
      .addSelect("COUNT(acceptance.id)", "count")
      .groupBy("acceptance.acceptance_status")
      .orderBy("acceptance.acceptance_status", "ASC")
      .getRawMany<{ key: EngineeringAcceptanceStatus; count: string }>();
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }

  async countByProjectId(scope: TenantParkScope, projectId: string): Promise<number> {
    return this.createScopedQueryBuilder(scope).andWhere("acceptance.project_id = :projectId", { projectId }).getCount();
  }

  async generateAcceptanceCode(tenantId: string, date: Date = new Date()): Promise<string> {
    const prefix = buildEngineeringAcceptanceCodePrefix(date);
    const row = await this.repository
      .createQueryBuilder("acceptance")
      .select("acceptance.acceptance_code", "acceptanceCode")
      .where("acceptance.tenant_id = :tenantId", { tenantId })
      .andWhere("acceptance.acceptance_code LIKE :prefix", { prefix: `${prefix}%` })
      .andWhere("acceptance.is_deleted = false")
      .orderBy("acceptance.acceptance_code", "DESC")
      .limit(1)
      .getRawOne<{ acceptanceCode?: string }>();
    return nextEngineeringAcceptanceCode(date, row?.acceptanceCode ?? null);
  }

  createScopedQueryBuilder(scope: TenantParkScope): SelectQueryBuilder<EngineeringAcceptanceEntity> {
    return this.repository
      .createQueryBuilder("acceptance")
      .where("acceptance.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("acceptance.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("acceptance.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<EngineeringAcceptanceEntity>, query: EngineeringAcceptanceQueryDto): void {
    if (query.project_id) builder.andWhere("acceptance.project_id = :projectId", { projectId: query.project_id });
    if (query.plan_id) builder.andWhere("acceptance.plan_id = :planId", { planId: query.plan_id });
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("acceptance.acceptance_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("acceptance.acceptance_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("acceptance.description ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.acceptance_type) builder.andWhere("acceptance.acceptance_type = :type", { type: query.acceptance_type });
    if (query.acceptance_status) builder.andWhere("acceptance.acceptance_status = :status", { status: query.acceptance_status });
    if (query.risk_level) builder.andWhere("acceptance.risk_level = :riskLevel", { riskLevel: query.risk_level });
    if (query.responsible_user_id) builder.andWhere("acceptance.responsible_user_id = :responsibleUserId", { responsibleUserId: query.responsible_user_id });
    if (query.acceptance_org_id) builder.andWhere("acceptance.acceptance_org_id = :acceptanceOrgId", { acceptanceOrgId: query.acceptance_org_id });
    if (query.contractor_org_id) builder.andWhere("acceptance.contractor_org_id = :contractorOrgId", { contractorOrgId: query.contractor_org_id });
    if (query.planned_date_from) builder.andWhere("acceptance.planned_acceptance_date >= :plannedDateFrom", { plannedDateFrom: query.planned_date_from });
    if (query.planned_date_to) builder.andWhere("acceptance.planned_acceptance_date <= :plannedDateTo", { plannedDateTo: query.planned_date_to });
  }

  private applySort(builder: SelectQueryBuilder<EngineeringAcceptanceEntity>, sort?: string): void {
    if (!sort) {
      builder.orderBy(DEFAULT_SORT_COLUMN, "DESC").addOrderBy("acceptance.create_time", "DESC");
      return;
    }
    const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
    builder.orderBy(SORT_COLUMN_MAP[field] ?? DEFAULT_SORT_COLUMN, direction as "ASC" | "DESC").addOrderBy("acceptance.create_time", "DESC");
  }
}
