import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import type { EnabledModuleContext, PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { AssignTenantModuleDto } from "./dto/assign-tenant-module.dto";
import type { CreateModuleDto } from "./dto/create-module.dto";
import type { CreatePlanDto } from "./dto/create-plan.dto";
import type { UpdateModuleDto } from "./dto/update-module.dto";
import type { UpdatePlanDto } from "./dto/update-plan.dto";
import { ModuleRegistryEntity } from "./entities/module-registry.entity";
import { PlanEntity } from "./entities/plan.entity";
import { SaaSModuleEntity } from "./entities/saas-module.entity";
import { TenantModuleEntity } from "./entities/tenant-module.entity";

@Injectable()
export class SaaSModulesService {
  constructor(
    @InjectRepository(ModuleRegistryEntity)
    private readonly moduleRepository: Repository<ModuleRegistryEntity>,
    @InjectRepository(SaaSModuleEntity)
    private readonly standardModuleRepository: Repository<SaaSModuleEntity>,
    @InjectRepository(PlanEntity)
    private readonly planRepository: Repository<PlanEntity>,
    @InjectRepository(TenantModuleEntity)
    private readonly tenantModuleRepository: Repository<TenantModuleEntity>
  ) {}

  async listModules(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<ModuleRegistryEntity>> {
    const builder = this.moduleRepository
      .createQueryBuilder("module")
      .where("module.tenantId = :tenantId", { tenantId: scope.tenantId })
      .andWhere("module.parkId = :parkId", { parkId: scope.parkId })
      .andWhere("module.isDeleted = false");
    if (query.status) builder.andWhere("module.status = :status", { status: query.status });
    if (query.keyword) {
      builder.andWhere("(module.moduleCode ILIKE :keyword OR module.moduleName ILIKE :keyword)", { keyword: `%${query.keyword}%` });
    }
    const [items, total] = await builder
      .orderBy("module.moduleGroup", "ASC")
      .addOrderBy("module.sortNo", "ASC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async listStandardModules(query: PaginationQueryDto): Promise<PaginatedResult<SaaSModuleEntity>> {
    const builder = this.standardModuleRepository
      .createQueryBuilder("module")
      .where("module.isDeleted = false");
    if (query.status) {
      const status = query.status === "enabled" || query.status === "1" ? 1 : query.status === "disabled" || query.status === "0" ? 0 : null;
      if (status !== null) builder.andWhere("module.status = :status", { status });
    }
    if (query.keyword) {
      builder.andWhere("(module.moduleCode ILIKE :keyword OR module.moduleName ILIKE :keyword)", { keyword: `%${query.keyword}%` });
    }
    const [items, total] = await builder
      .orderBy("module.moduleGroup", "ASC")
      .addOrderBy("module.sortNo", "ASC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async createModule(scope: TenantParkScope, actorId: string, dto: CreateModuleDto): Promise<ModuleRegistryEntity> {
    await this.assertModuleCodeAvailable(scope, dto.moduleCode);
    return this.moduleRepository.save(
      this.moduleRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        moduleCode: dto.moduleCode,
        moduleName: dto.moduleName,
        moduleGroup: dto.moduleGroup,
        moduleVersion: dto.moduleVersion ?? "1.0.0",
        routePath: dto.routePath ?? null,
        permissionCode: dto.permissionCode ?? null,
        iconKey: dto.iconKey ?? null,
        sortNo: dto.sortNo ?? 0,
        isBuiltin: false,
        status: dto.status ?? "enabled",
        remark: dto.remark ?? null,
        createBy: actorId,
        updateBy: actorId
      })
    );
  }

  async updateModule(scope: TenantParkScope, actorId: string, id: string, dto: UpdateModuleDto): Promise<ModuleRegistryEntity> {
    const entity = await this.getModule(scope, id);
    if (dto.moduleCode && dto.moduleCode !== entity.moduleCode) {
      await this.assertModuleCodeAvailable(scope, dto.moduleCode);
    }
    Object.assign(entity, {
      moduleCode: dto.moduleCode ?? entity.moduleCode,
      moduleName: dto.moduleName ?? entity.moduleName,
      moduleGroup: dto.moduleGroup ?? entity.moduleGroup,
      moduleVersion: dto.moduleVersion ?? entity.moduleVersion,
      routePath: dto.routePath === undefined ? entity.routePath : dto.routePath,
      permissionCode: dto.permissionCode === undefined ? entity.permissionCode : dto.permissionCode,
      iconKey: dto.iconKey === undefined ? entity.iconKey : dto.iconKey,
      sortNo: dto.sortNo ?? entity.sortNo,
      status: dto.status ?? entity.status,
      remark: dto.remark === undefined ? entity.remark : dto.remark,
      updateBy: actorId
    });
    return this.moduleRepository.save(entity);
  }

  async listPlans(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<PlanEntity>> {
    const builder = this.planRepository
      .createQueryBuilder("plan")
      .where("plan.tenantId = :tenantId", { tenantId: scope.tenantId })
      .andWhere("plan.parkId = :parkId", { parkId: scope.parkId })
      .andWhere("plan.isDeleted = false");
    if (query.status) builder.andWhere("plan.status = :status", { status: query.status });
    if (query.keyword) {
      builder.andWhere("(plan.planCode ILIKE :keyword OR plan.planName ILIKE :keyword)", { keyword: `%${query.keyword}%` });
    }
    const [items, total] = await builder
      .orderBy("plan.createTime", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async createPlan(scope: TenantParkScope, actorId: string, dto: CreatePlanDto): Promise<PlanEntity> {
    await this.assertPlanCodeAvailable(scope, dto.planCode);
    return this.planRepository.save(
      this.planRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        planCode: dto.planCode,
        planName: dto.planName,
        planType: dto.planType ?? "standard",
        moduleCodes: dto.moduleCodes ?? [],
      maxUsers: dto.maxUsers ?? 0,
      maxParks: dto.maxParks ?? 0,
      description: dto.description ?? null,
      sortNo: dto.sortNo ?? 0,
      status: dto.status ?? "enabled",
      remark: dto.remark ?? null,
        createBy: actorId,
        updateBy: actorId
      })
    );
  }

  async updatePlan(scope: TenantParkScope, actorId: string, id: string, dto: UpdatePlanDto): Promise<PlanEntity> {
    const entity = await this.getPlan(scope, id);
    if (dto.planCode && dto.planCode !== entity.planCode) {
      await this.assertPlanCodeAvailable(scope, dto.planCode);
    }
    Object.assign(entity, {
      planCode: dto.planCode ?? entity.planCode,
      planName: dto.planName ?? entity.planName,
      planType: dto.planType ?? entity.planType,
      moduleCodes: dto.moduleCodes ?? entity.moduleCodes,
      maxUsers: dto.maxUsers ?? entity.maxUsers,
      maxParks: dto.maxParks ?? entity.maxParks,
      description: dto.description === undefined ? entity.description : dto.description,
      sortNo: dto.sortNo ?? entity.sortNo,
      status: dto.status ?? entity.status,
      remark: dto.remark === undefined ? entity.remark : dto.remark,
      updateBy: actorId
    });
    return this.planRepository.save(entity);
  }

  async listTenantModules(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<TenantModuleEntity>> {
    const builder = this.tenantModuleRepository
      .createQueryBuilder("tenantModule")
      .leftJoinAndSelect("tenantModule.module", "module")
      .leftJoinAndSelect("tenantModule.plan", "plan")
      .where("tenantModule.tenantId = :tenantId", { tenantId: scope.tenantId })
      .andWhere("tenantModule.parkId = :parkId", { parkId: scope.parkId })
      .andWhere("tenantModule.isDeleted = false")
      .andWhere("module.id IS NOT NULL");
    if (query.status) builder.andWhere("tenantModule.status = :status", { status: query.status });
    if (query.keyword) {
      builder.andWhere("(module.moduleCode ILIKE :keyword OR module.moduleName ILIKE :keyword)", { keyword: `%${query.keyword}%` });
    }
    const [items, total] = await builder
      .orderBy("module.moduleGroup", "ASC")
      .addOrderBy("module.sortNo", "ASC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async assignTenantModule(scope: TenantParkScope, actorId: string, dto: AssignTenantModuleDto): Promise<TenantModuleEntity> {
    await this.getStandardModule(dto.moduleId);
    if (dto.planId) await this.getPlan(scope, dto.planId);
    const existing = await this.tenantModuleRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, moduleId: dto.moduleId, isDeleted: false }
    });
    const entity =
      existing ??
      this.tenantModuleRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        moduleId: dto.moduleId,
        createBy: actorId
      });
    Object.assign(entity, {
      tenantCode: dto.tenantCode ?? entity.tenantCode ?? null,
      planId: dto.planId === undefined ? entity.planId ?? null : dto.planId,
      startTime: dto.startTime ? new Date(dto.startTime) : entity.startTime ?? null,
      expireTime: dto.expireTime ? new Date(dto.expireTime) : entity.expireTime ?? null,
      enabled: dto.status === "disabled" ? false : entity.enabled ?? true,
      featureConfig: dto.featureConfig ?? entity.featureConfig ?? {},
      status: dto.status ?? entity.status ?? "enabled",
      remark: dto.remark === undefined ? entity.remark ?? null : dto.remark,
      updateBy: actorId
    });
    return this.tenantModuleRepository.save(entity);
  }

  async enableTenantModule(scope: TenantParkScope, actorId: string, moduleId: string): Promise<TenantModuleEntity> {
    await this.getStandardModule(moduleId);
    const existing = await this.tenantModuleRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, moduleId, isDeleted: false }
    });
    const entity =
      existing ??
      this.tenantModuleRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        tenantCode: "JH_DEFAULT",
        moduleId,
        createBy: actorId
      });
    Object.assign(entity, {
      enabled: true,
      status: "enabled",
      updateBy: actorId
    });
    return this.tenantModuleRepository.save(entity);
  }

  async disableTenantModule(scope: TenantParkScope, actorId: string, moduleId: string): Promise<TenantModuleEntity> {
    await this.getStandardModule(moduleId);
    const entity = await this.tenantModuleRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, moduleId, isDeleted: false }
    });
    if (!entity) throw new NotFoundException("Tenant module authorization not found");
    entity.enabled = false;
    entity.status = "disabled";
    entity.updateBy = actorId;
    return this.tenantModuleRepository.save(entity);
  }

  async listEnabledModulesForTenant(tenantId: string, parkId: string): Promise<EnabledModuleContext[]> {
    const items = await this.tenantModuleRepository
      .createQueryBuilder("tenantModule")
      .innerJoinAndSelect("tenantModule.module", "module")
      .where("tenantModule.tenantId = :tenantId", { tenantId })
      .andWhere("tenantModule.parkId = :parkId", { parkId })
      .andWhere("tenantModule.isDeleted = false")
      .andWhere("tenantModule.enabled = true")
      .andWhere("tenantModule.status = :status", { status: "enabled" })
      .andWhere("module.isDeleted = false")
      .andWhere("module.status = 1")
      .andWhere("(tenantModule.expireTime IS NULL OR tenantModule.expireTime > now())")
      .orderBy("module.moduleGroup", "ASC")
      .addOrderBy("module.sortNo", "ASC")
      .getMany();
    return items
      .filter((item) => item.module)
      .map((item) => ({
        module_code: item.module!.moduleCode,
        module_name: item.module!.moduleName,
        module_group: item.module!.moduleGroup,
        route_prefix: item.module!.routePrefix,
        icon: item.module!.icon,
        enabled: item.enabled,
        expire_time: item.expireTime?.toISOString() ?? null
      }));
  }

  private async getModule(scope: TenantParkScope, id: string): Promise<ModuleRegistryEntity> {
    const entity = await this.moduleRepository.findOne({ where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    if (!entity) throw new NotFoundException("Module not found");
    return entity;
  }

  private async getStandardModule(id: string): Promise<SaaSModuleEntity> {
    const entity = await this.standardModuleRepository.findOne({ where: { id, isDeleted: false } });
    if (!entity) throw new NotFoundException("Module not found");
    return entity;
  }

  private async getPlan(scope: TenantParkScope, id: string): Promise<PlanEntity> {
    const entity = await this.planRepository.findOne({ where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    if (!entity) throw new NotFoundException("Plan not found");
    return entity;
  }

  private async assertModuleCodeAvailable(scope: TenantParkScope, moduleCode: string): Promise<void> {
    const exists = await this.moduleRepository.exists({ where: { tenantId: scope.tenantId, parkId: scope.parkId, moduleCode, isDeleted: false } });
    if (exists) throw new ConflictException("Module code already exists");
  }

  private async assertPlanCodeAvailable(scope: TenantParkScope, planCode: string): Promise<void> {
    const exists = await this.planRepository.exists({ where: { tenantId: scope.tenantId, parkId: scope.parkId, planCode, isDeleted: false } });
    if (exists) throw new ConflictException("Plan code already exists");
  }
}
