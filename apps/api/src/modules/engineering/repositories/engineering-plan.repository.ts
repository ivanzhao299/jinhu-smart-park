import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { EngineeringPlanQueryDto } from "../dto/engineering-plan.dto";
import { nextEngineeringPlanCode, buildEngineeringPlanCodePrefix } from "../domain/engineering-plan-code.policy";
import { EngineeringPlanLevel, EngineeringPlanStatus, EngineeringPlanType, EngineeringRiskLevel } from "../domain/engineering-project.enums";
import { EngineeringPlanEntity } from "../entities/engineering-plan.entity";

export interface CreateEngineeringPlanInput {
  orgId?: string | null;
  projectId: string;
  planCode?: string;
  planName: string;
  planType: EngineeringPlanType;
  parentPlanId?: string | null;
  planLevel?: EngineeringPlanLevel;
  description?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  plannedProgressPercent?: number;
  weight?: string | null;
  ownerUserId?: string | null;
  ownerOrgId?: string | null;
  contractorOrgId?: string | null;
  riskLevel?: EngineeringRiskLevel;
  sortOrder?: number;
  attachmentIds?: string[] | null;
  remark?: string | null;
}

export interface UpdateEngineeringPlanInput {
  planName?: string;
  planType?: EngineeringPlanType;
  parentPlanId?: string | null;
  planLevel?: EngineeringPlanLevel;
  description?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  plannedProgressPercent?: number;
  actualProgressPercent?: number;
  weight?: string | null;
  ownerUserId?: string | null;
  ownerOrgId?: string | null;
  contractorOrgId?: string | null;
  riskLevel?: EngineeringRiskLevel;
  sortOrder?: number;
  delayDays?: number;
  attachmentIds?: string[] | null;
  remark?: string | null;
}

export interface UpdateEngineeringPlanProgressInput {
  actualProgressPercent: number;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  status?: EngineeringPlanStatus;
  delayDays?: number;
}

export interface UpdateEngineeringPlanStatusInput {
  status: EngineeringPlanStatus;
  actualProgressPercent?: number;
  delayDays?: number;
}

export interface EngineeringPlanCountRow<T extends string> {
  key: T;
  count: number;
}

const DEFAULT_SORT_COLUMN = "plan.sort_order";
const SORT_COLUMN_MAP: Record<string, string> = {
  plan_code: "plan.plan_code",
  plan_name: "plan.plan_name",
  plan_type: "plan.plan_type",
  status: "plan.status",
  planned_start_date: "plan.planned_start_date",
  sort_order: "plan.sort_order",
  create_time: "plan.create_time",
  update_time: "plan.update_time"
};

@Injectable()
export class EngineeringPlanRepository {
  constructor(
    @InjectRepository(EngineeringPlanEntity)
    private readonly repository: Repository<EngineeringPlanEntity>
  ) {}

  async createPlan(scope: TenantParkScope, actorId: string | null, input: CreateEngineeringPlanInput): Promise<EngineeringPlanEntity> {
    const planCode = input.planCode ?? (await this.generatePlanCode(scope.tenantId));
    if (await this.existsByCode(scope, planCode)) {
      throw new ConflictException("Engineering plan code already exists");
    }
    const entity = this.repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      orgId: input.orgId ?? null,
      projectId: input.projectId,
      planCode,
      planName: input.planName,
      planType: input.planType,
      parentPlanId: input.parentPlanId ?? null,
      planLevel: input.planLevel ?? EngineeringPlanLevel.L1,
      description: input.description ?? null,
      plannedStartDate: input.plannedStartDate ?? null,
      plannedEndDate: input.plannedEndDate ?? null,
      actualStartDate: null,
      actualEndDate: null,
      plannedProgressPercent: input.plannedProgressPercent ?? 0,
      actualProgressPercent: 0,
      weight: input.weight ?? null,
      ownerUserId: input.ownerUserId ?? null,
      ownerOrgId: input.ownerOrgId ?? null,
      contractorOrgId: input.contractorOrgId ?? null,
      status: EngineeringPlanStatus.DRAFT,
      delayDays: 0,
      riskLevel: input.riskLevel ?? EngineeringRiskLevel.LOW,
      sortOrder: input.sortOrder ?? 0,
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
    applyScope?: (builder: SelectQueryBuilder<EngineeringPlanEntity>) => Promise<void> | void
  ): Promise<EngineeringPlanEntity> {
    const builder = this.createScopedQueryBuilder(scope).andWhere("plan.id = :id", { id });
    await applyScope?.(builder);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Engineering plan not found");
    return entity;
  }

  async findByCode(scope: Pick<TenantParkScope, "tenantId">, planCode: string): Promise<EngineeringPlanEntity | null> {
    return this.repository.findOne({ where: { tenantId: scope.tenantId, planCode, isDeleted: false } });
  }

  async paginatePlans(
    scope: TenantParkScope,
    query: EngineeringPlanQueryDto,
    applyScope?: (builder: SelectQueryBuilder<EngineeringPlanEntity>) => Promise<void> | void
  ): Promise<PaginatedResult<EngineeringPlanEntity>> {
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
    applyScope?: (builder: SelectQueryBuilder<EngineeringPlanEntity>) => Promise<void> | void
  ): Promise<EngineeringPlanEntity[]> {
    const builder = this.createScopedQueryBuilder(scope).andWhere("plan.project_id = :projectId", { projectId });
    await applyScope?.(builder);
    return builder.orderBy("plan.sort_order", "ASC").addOrderBy("plan.create_time", "ASC").getMany();
  }

  async findChildren(scope: TenantParkScope, parentPlanId: string): Promise<EngineeringPlanEntity[]> {
    return this.createScopedQueryBuilder(scope)
      .andWhere("plan.parent_plan_id = :parentPlanId", { parentPlanId })
      .orderBy("plan.sort_order", "ASC")
      .addOrderBy("plan.create_time", "ASC")
      .getMany();
  }

  async updatePlan(scope: TenantParkScope, actorId: string | null, id: string, input: UpdateEngineeringPlanInput): Promise<EngineeringPlanEntity> {
    const entity = await this.findById(scope, id);
    Object.assign(entity, {
      ...input,
      updateBy: actorId
    });
    return this.repository.save(entity);
  }

  async updateProgress(
    scope: TenantParkScope,
    actorId: string | null,
    id: string,
    input: UpdateEngineeringPlanProgressInput
  ): Promise<EngineeringPlanEntity> {
    const entity = await this.findById(scope, id);
    entity.actualProgressPercent = input.actualProgressPercent;
    if (input.actualStartDate !== undefined) entity.actualStartDate = input.actualStartDate;
    if (input.actualEndDate !== undefined) entity.actualEndDate = input.actualEndDate;
    if (input.status !== undefined) entity.status = input.status;
    if (input.delayDays !== undefined) entity.delayDays = input.delayDays;
    entity.updateBy = actorId;
    return this.repository.save(entity);
  }

  async updateStatus(
    scope: TenantParkScope,
    actorId: string | null,
    id: string,
    input: UpdateEngineeringPlanStatusInput
  ): Promise<EngineeringPlanEntity> {
    const entity = await this.findById(scope, id);
    entity.status = input.status;
    if (input.actualProgressPercent !== undefined) entity.actualProgressPercent = input.actualProgressPercent;
    if (input.delayDays !== undefined) entity.delayDays = input.delayDays;
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

  async existsByCode(scope: Pick<TenantParkScope, "tenantId">, planCode: string): Promise<boolean> {
    return this.repository.exists({ where: { tenantId: scope.tenantId, planCode, isDeleted: false } });
  }

  async countByStatus(scope: TenantParkScope): Promise<EngineeringPlanCountRow<EngineeringPlanStatus>[]> {
    const rows = await this.createScopedQueryBuilder(scope)
      .select("plan.status", "key")
      .addSelect("COUNT(plan.id)", "count")
      .groupBy("plan.status")
      .orderBy("plan.status", "ASC")
      .getRawMany<{ key: EngineeringPlanStatus; count: string }>();
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }

  async countByProjectId(scope: TenantParkScope, projectId: string): Promise<number> {
    return this.createScopedQueryBuilder(scope).andWhere("plan.project_id = :projectId", { projectId }).getCount();
  }

  async generatePlanCode(tenantId: string, date: Date = new Date()): Promise<string> {
    const prefix = buildEngineeringPlanCodePrefix(date);
    const row = await this.repository
      .createQueryBuilder("plan")
      .select("plan.plan_code", "planCode")
      .where("plan.tenant_id = :tenantId", { tenantId })
      .andWhere("plan.plan_code LIKE :prefix", { prefix: `${prefix}%` })
      .andWhere("plan.is_deleted = false")
      .orderBy("plan.plan_code", "DESC")
      .limit(1)
      .getRawOne<{ planCode?: string }>();
    return nextEngineeringPlanCode(date, row?.planCode ?? null);
  }

  createScopedQueryBuilder(scope: TenantParkScope): SelectQueryBuilder<EngineeringPlanEntity> {
    return this.repository
      .createQueryBuilder("plan")
      .where("plan.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("plan.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("plan.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<EngineeringPlanEntity>, query: EngineeringPlanQueryDto): void {
    if (query.project_id) builder.andWhere("plan.project_id = :projectId", { projectId: query.project_id });
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("plan.plan_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("plan.plan_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("plan.description ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.plan_type) builder.andWhere("plan.plan_type = :planType", { planType: query.plan_type });
    if (query.status) builder.andWhere("plan.status = :status", { status: query.status });
    if (query.plan_level) builder.andWhere("plan.plan_level = :planLevel", { planLevel: query.plan_level });
    if (query.owner_user_id) builder.andWhere("plan.owner_user_id = :ownerUserId", { ownerUserId: query.owner_user_id });
    if (query.owner_org_id) builder.andWhere("plan.owner_org_id = :ownerOrgId", { ownerOrgId: query.owner_org_id });
    if (query.contractor_org_id) builder.andWhere("plan.contractor_org_id = :contractorOrgId", { contractorOrgId: query.contractor_org_id });
    if (query.planned_start_from) builder.andWhere("plan.planned_start_date >= :plannedStartFrom", { plannedStartFrom: query.planned_start_from });
    if (query.planned_start_to) builder.andWhere("plan.planned_start_date <= :plannedStartTo", { plannedStartTo: query.planned_start_to });
  }

  private applySort(builder: SelectQueryBuilder<EngineeringPlanEntity>, sort?: string): void {
    if (!sort) {
      builder.orderBy(DEFAULT_SORT_COLUMN, "ASC").addOrderBy("plan.create_time", "ASC");
      return;
    }
    const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
    builder.orderBy(SORT_COLUMN_MAP[field] ?? DEFAULT_SORT_COLUMN, direction as "ASC" | "DESC").addOrderBy("plan.create_time", "ASC");
  }
}
