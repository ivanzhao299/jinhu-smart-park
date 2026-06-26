import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { EngineeringProjectQueryDto } from "../dto/engineering-project.dto";
import { buildEngineeringProjectCodePrefix, nextEngineeringProjectCode } from "../domain/engineering-project-code.policy";
import { EngineeringProjectStatus, type EngineeringProjectType } from "../domain/engineering-project.enums";
import { EngineeringProjectEntity } from "../entities/engineering-project.entity";

export interface CreateEngineeringProjectInput {
  orgId?: string | null;
  projectCode?: string;
  projectName: string;
  projectType: EngineeringProjectType;
  projectLevel?: EngineeringProjectEntity["projectLevel"];
  projectSource?: string | null;
  description?: string | null;
  locationText?: string | null;
  buildingId?: string | null;
  floorId?: string | null;
  spaceId?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  budgetAmount?: string | null;
  contractAmount?: string | null;
  settlementAmount?: string | null;
  projectManagerId?: string | null;
  engineeringDirectorId?: string | null;
  contractorOrgId?: string | null;
  supervisorOrgId?: string | null;
  riskLevel?: EngineeringProjectEntity["riskLevel"];
  remark?: string | null;
}

export type UpdateEngineeringProjectInput = Partial<
  Omit<CreateEngineeringProjectInput, "projectCode" | "projectName" | "projectType"> &
    Pick<CreateEngineeringProjectInput, "projectName" | "projectType"> & {
      progressPercent: number;
      qualityScore: string | null;
      safetyScore: string | null;
      workflowInstanceId: string | null;
      transferStatus: EngineeringProjectEntity["transferStatus"];
      financeStatus: EngineeringProjectEntity["financeStatus"];
      assetStatus: EngineeringProjectEntity["assetStatus"];
    }
>;

export interface EngineeringProjectCountRow<T extends string> {
  key: T;
  count: number;
}

const DEFAULT_SORT_COLUMN = "project.create_time";
const SORT_COLUMN_MAP: Record<string, string> = {
  project_code: "project.project_code",
  project_name: "project.project_name",
  project_type: "project.project_type",
  status: "project.status",
  planned_start_date: "project.planned_start_date",
  create_time: "project.create_time",
  update_time: "project.update_time"
};

@Injectable()
export class EngineeringProjectRepository {
  constructor(
    @InjectRepository(EngineeringProjectEntity)
    private readonly repository: Repository<EngineeringProjectEntity>
  ) {}

  async createProject(scope: TenantParkScope, actorId: string | null, input: CreateEngineeringProjectInput): Promise<EngineeringProjectEntity> {
    const projectCode = input.projectCode ?? (await this.generateProjectCode(scope.tenantId));
    const entity = this.repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      orgId: input.orgId ?? null,
      projectCode,
      projectName: input.projectName,
      projectType: input.projectType,
      projectLevel: input.projectLevel,
      projectSource: input.projectSource ?? null,
      description: input.description ?? null,
      locationText: input.locationText ?? null,
      buildingId: input.buildingId ?? null,
      floorId: input.floorId ?? null,
      spaceId: input.spaceId ?? null,
      plannedStartDate: input.plannedStartDate ?? null,
      plannedEndDate: input.plannedEndDate ?? null,
      actualStartDate: input.actualStartDate ?? null,
      actualEndDate: input.actualEndDate ?? null,
      budgetAmount: input.budgetAmount ?? null,
      contractAmount: input.contractAmount ?? null,
      settlementAmount: input.settlementAmount ?? null,
      projectManagerId: input.projectManagerId ?? null,
      engineeringDirectorId: input.engineeringDirectorId ?? null,
      contractorOrgId: input.contractorOrgId ?? null,
      supervisorOrgId: input.supervisorOrgId ?? null,
      riskLevel: input.riskLevel,
      remark: input.remark ?? null,
      createBy: actorId,
      updateBy: actorId
    });
    return this.repository.save(entity);
  }

  async findById(scope: TenantParkScope, id: string): Promise<EngineeringProjectEntity> {
    const entity = await this.scopedBuilder(scope).andWhere("project.id = :id", { id }).getOne();
    if (!entity) throw new NotFoundException("Engineering project not found");
    return entity;
  }

  async findByCode(scope: Pick<TenantParkScope, "tenantId">, projectCode: string): Promise<EngineeringProjectEntity | null> {
    return this.repository.findOne({ where: { tenantId: scope.tenantId, projectCode, isDeleted: false } });
  }

  async paginateProjects(scope: TenantParkScope, query: EngineeringProjectQueryDto): Promise<PaginatedResult<EngineeringProjectEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedBuilder(scope);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, page_size: pageSize };
  }

  async updateProject(scope: TenantParkScope, actorId: string | null, id: string, input: UpdateEngineeringProjectInput): Promise<EngineeringProjectEntity> {
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
    status: EngineeringProjectStatus
  ): Promise<EngineeringProjectEntity> {
    const entity = await this.findById(scope, id);
    entity.status = status;
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

  async existsByCode(scope: Pick<TenantParkScope, "tenantId">, projectCode: string): Promise<boolean> {
    return this.repository.exists({ where: { tenantId: scope.tenantId, projectCode, isDeleted: false } });
  }

  async countByStatus(scope: TenantParkScope): Promise<EngineeringProjectCountRow<EngineeringProjectStatus>[]> {
    const rows = await this.scopedBuilder(scope)
      .select("project.status", "key")
      .addSelect("COUNT(project.id)", "count")
      .groupBy("project.status")
      .orderBy("project.status", "ASC")
      .getRawMany<{ key: EngineeringProjectStatus; count: string }>();
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }

  async countByType(scope: TenantParkScope): Promise<EngineeringProjectCountRow<EngineeringProjectType>[]> {
    const rows = await this.scopedBuilder(scope)
      .select("project.project_type", "key")
      .addSelect("COUNT(project.id)", "count")
      .groupBy("project.project_type")
      .orderBy("project.project_type", "ASC")
      .getRawMany<{ key: EngineeringProjectType; count: string }>();
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }

  async generateProjectCode(tenantId: string, date: Date = new Date()): Promise<string> {
    const prefix = buildEngineeringProjectCodePrefix(date);
    const row = await this.repository
      .createQueryBuilder("project")
      .select("project.project_code", "projectCode")
      .where("project.tenant_id = :tenantId", { tenantId })
      .andWhere("project.project_code LIKE :prefix", { prefix: `${prefix}%` })
      .andWhere("project.is_deleted = false")
      .orderBy("project.project_code", "DESC")
      .limit(1)
      .getRawOne<{ projectCode?: string }>();
    return nextEngineeringProjectCode(date, row?.projectCode ?? null);
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<EngineeringProjectEntity> {
    return this.repository
      .createQueryBuilder("project")
      .where("project.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("project.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("project.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<EngineeringProjectEntity>, query: EngineeringProjectQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("project.project_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("project.project_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("project.location_text ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.project_type) builder.andWhere("project.project_type = :projectType", { projectType: query.project_type });
    if (query.status) builder.andWhere("project.status = :status", { status: query.status });
    if (query.project_level) builder.andWhere("project.project_level = :projectLevel", { projectLevel: query.project_level });
    if (query.risk_level) builder.andWhere("project.risk_level = :riskLevel", { riskLevel: query.risk_level });
    if (query.org_id) builder.andWhere("project.org_id = :orgId", { orgId: query.org_id });
    if (query.project_manager_id) builder.andWhere("project.project_manager_id = :projectManagerId", { projectManagerId: query.project_manager_id });
    if (query.contractor_org_id) builder.andWhere("project.contractor_org_id = :contractorOrgId", { contractorOrgId: query.contractor_org_id });
    if (query.planned_start_from) builder.andWhere("project.planned_start_date >= :plannedStartFrom", { plannedStartFrom: query.planned_start_from });
    if (query.planned_start_to) builder.andWhere("project.planned_start_date <= :plannedStartTo", { plannedStartTo: query.planned_start_to });
  }

  private applySort(builder: SelectQueryBuilder<EngineeringProjectEntity>, sort?: string): void {
    if (!sort) {
      builder.orderBy(DEFAULT_SORT_COLUMN, "DESC");
      return;
    }
    const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
    builder.orderBy(SORT_COLUMN_MAP[field] ?? DEFAULT_SORT_COLUMN, direction as "ASC" | "DESC").addOrderBy("project.create_time", "DESC");
  }
}
