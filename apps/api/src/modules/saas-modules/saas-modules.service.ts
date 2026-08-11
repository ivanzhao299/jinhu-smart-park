import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, type EntityManager, type Repository } from "typeorm";
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
import { buildAvailablePlanCatalogQuery } from "./plan-catalog.logic";

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
    private readonly tenantModuleRepository: Repository<TenantModuleEntity>,
    @Optional()
    private readonly dataSource?: DataSource
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
      .addOrderBy("module.moduleCode", "ASC")
      .addOrderBy("module.id", "ASC")
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
      .addOrderBy("module.moduleCode", "ASC")
      .addOrderBy("module.id", "ASC")
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

  async listAvailablePlans(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<PlanEntity>> {
    const catalogQuery = buildAvailablePlanCatalogQuery(scope, query);
    const rows = await this.planRepository.query(catalogQuery.sql, catalogQuery.parameters) as Array<{
      id: string | null;
      total: number | string;
    }>;
    const ids = rows.map((row) => row.id).filter((id): id is string => Boolean(id));
    const entities = ids.length > 0 ? await this.planRepository.findBy({ id: In(ids) }) : [];
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    return {
      items: ids.map((id) => byId.get(id)).filter((entity): entity is PlanEntity => Boolean(entity)),
      total: Number(rows[0]?.total ?? 0),
      page: query.page,
      page_size: query.page_size
    };
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
        permissionCodes: dto.permissionCodes ?? [],
        maxUsers: dto.maxUsers ?? 0,
        maxParks: dto.maxParks ?? 0,
        description: dto.description ?? null,
        sortNo: dto.sortNo ?? 0,
        status: dto.status ?? "enabled",
        featureConfig: dto.featureConfig ?? {},
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
      permissionCodes: dto.permissionCodes ?? entity.permissionCodes,
      maxUsers: dto.maxUsers ?? entity.maxUsers,
      maxParks: dto.maxParks ?? entity.maxParks,
      description: dto.description === undefined ? entity.description : dto.description,
      sortNo: dto.sortNo ?? entity.sortNo,
      status: dto.status ?? entity.status,
      featureConfig: dto.featureConfig ?? entity.featureConfig,
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
    return this.writeDataSource().transaction(async (manager) => {
      await this.lockModuleDependencyGraph(manager, scope);
      const module = await this.getActiveStandardModule(manager, dto.moduleId);
      if (dto.planId) await this.getPlanWithManager(manager, scope, dto.planId);
      const repository = manager.getRepository(TenantModuleEntity);
      const existing = await repository.findOne({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          moduleId: dto.moduleId,
          isDeleted: false
        }
      });
      const entity =
        existing ??
        repository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          moduleId: dto.moduleId,
          createBy: actorId
        });
      const enabling = (dto.status ?? entity.status ?? "enabled") === "enabled";
      if (enabling) {
        await this.assertDependenciesActive(manager, scope, module.moduleCode);
      }
      Object.assign(entity, {
        tenantCode: dto.tenantCode ?? entity.tenantCode ?? null,
        planId: dto.planId === undefined ? entity.planId ?? null : dto.planId,
        startTime: dto.startTime === undefined
          ? entity.startTime ?? null
          : dto.startTime === null ? null : new Date(dto.startTime),
        expireTime: dto.expireTime === undefined
          ? entity.expireTime ?? null
          : dto.expireTime === null ? null : new Date(dto.expireTime),
        enabled: enabling,
        featureConfig: dto.featureConfig ?? entity.featureConfig ?? {},
        status: enabling ? "enabled" : "disabled",
        remark: dto.remark === undefined ? entity.remark ?? null : dto.remark,
        updateBy: actorId
      });
      this.assertAssignmentWindow(entity.startTime, entity.expireTime);
      await this.assertProspectiveAssignmentSupportsDependents(
        manager,
        scope,
        module.moduleCode,
        entity.enabled,
        entity.startTime,
        entity.expireTime
      );
      return repository.save(entity);
    });
  }

  async enableTenantModule(scope: TenantParkScope, actorId: string, moduleId: string): Promise<TenantModuleEntity> {
    return this.writeDataSource().transaction(async (manager) => {
      await this.lockModuleDependencyGraph(manager, scope);
      const module = await this.getActiveStandardModule(manager, moduleId);
      await this.assertDependenciesActive(manager, scope, module.moduleCode);
      const repository = manager.getRepository(TenantModuleEntity);
      const existing = await repository.findOne({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          moduleId,
          isDeleted: false
        }
      });
      const entity =
        existing ??
        repository.create({
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
      this.assertAssignmentWindow(entity.startTime, entity.expireTime);
      await this.assertProspectiveAssignmentSupportsDependents(
        manager,
        scope,
        module.moduleCode,
        entity.enabled,
        entity.startTime,
        entity.expireTime
      );
      return repository.save(entity);
    });
  }

  async disableTenantModule(scope: TenantParkScope, actorId: string, moduleId: string): Promise<TenantModuleEntity> {
    return this.writeDataSource().transaction(async (manager) => {
      await this.lockModuleDependencyGraph(manager, scope);
      const module = await this.getActiveStandardModule(manager, moduleId);
      await this.assertNoActiveDependents(manager, scope, module.moduleCode);
      const repository = manager.getRepository(TenantModuleEntity);
      const entity = await repository.findOne({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          moduleId,
          isDeleted: false
        }
      });
      if (!entity) {
        throw new NotFoundException("Tenant module authorization not found");
      }
      entity.enabled = false;
      entity.status = "disabled";
      entity.updateBy = actorId;
      return repository.save(entity);
    });
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
      .andWhere("(tenantModule.startTime IS NULL OR tenantModule.startTime <= now())")
      .andWhere("module.isDeleted = false")
      .andWhere("module.status = 1")
      .andWhere("(tenantModule.expireTime IS NULL OR tenantModule.expireTime > now())")
      .andWhere(
        `NOT EXISTS (
          SELECT 1
          FROM sys_module_dependency dependency
          JOIN sys_module required_module
            ON required_module.id = dependency.required_module_id
          LEFT JOIN rel_tenant_module required_assignment
            ON required_assignment.tenant_id = "tenantModule".tenant_id
           AND required_assignment.park_id = "tenantModule".park_id
           AND required_assignment.module_id = dependency.required_module_id
           AND required_assignment.enabled = true
           AND required_assignment.status = 'enabled'
           AND required_assignment.is_deleted = false
           AND (required_assignment.start_time IS NULL OR required_assignment.start_time <= now())
           AND (required_assignment.expire_time IS NULL OR required_assignment.expire_time > now())
          WHERE dependency.module_id = module.id
            AND dependency.dependency_kind = 'hard'
            AND dependency.is_enabled = true
            AND dependency.is_deleted = false
            AND (
              required_module.status <> 1
              OR required_module.is_deleted = true
              OR required_assignment.id IS NULL
            )
        )`
      )
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

  private async getActiveStandardModule(
    manager: EntityManager,
    id: string
  ): Promise<SaaSModuleEntity> {
    const entity = await manager.getRepository(SaaSModuleEntity).findOne({
      where: { id, isDeleted: false, status: 1 }
    });
    if (!entity) throw new NotFoundException("Active module not found");
    return entity;
  }

  private async getPlanWithManager(
    manager: EntityManager,
    scope: TenantParkScope,
    id: string
  ): Promise<PlanEntity> {
    const entity = await manager.getRepository(PlanEntity).findOne({
      where: {
        id,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      }
    });
    if (!entity) throw new NotFoundException("Plan not found");
    return entity;
  }

  private async lockModuleDependencyGraph(
    manager: EntityManager,
    scope: TenantParkScope
  ): Promise<void> {
    const lockKey = `tenant-module-dependency:${scope.tenantId}:${scope.parkId}`;
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [lockKey]
    );
    await manager.query(
      `SELECT id
       FROM sys_module
       ORDER BY module_code COLLATE "C"
       FOR UPDATE`
    );
    await manager.query(
      `SELECT assignment.id
       FROM rel_tenant_module assignment
       JOIN sys_module module ON module.id = assignment.module_id
       WHERE assignment.tenant_id = $1
         AND assignment.park_id = $2
         AND assignment.is_deleted = false
       ORDER BY module.module_code COLLATE "C"
       FOR UPDATE OF assignment`,
      [scope.tenantId, scope.parkId]
    );
  }

  private async assertDependenciesActive(
    manager: EntityManager,
    scope: TenantParkScope,
    moduleCode: string
  ): Promise<void> {
    const missing = await manager.query(
      `SELECT required.module_code AS "requiredModuleCode"
       FROM sys_module module
       JOIN sys_module_dependency dependency
         ON dependency.module_id = module.id
        AND dependency.dependency_kind = 'hard'
        AND dependency.is_enabled = true
        AND dependency.is_deleted = false
       JOIN sys_module required
         ON required.id = dependency.required_module_id
       LEFT JOIN rel_tenant_module assignment
         ON assignment.tenant_id = $1
        AND assignment.park_id = $2
        AND assignment.module_id = required.id
        AND assignment.enabled = true
        AND assignment.status = 'enabled'
        AND assignment.is_deleted = false
        AND (assignment.start_time IS NULL OR assignment.start_time <= now())
        AND (assignment.expire_time IS NULL OR assignment.expire_time > now())
       WHERE module.module_code = $3
         AND module.status = 1
         AND module.is_deleted = false
         AND (
           required.status <> 1
           OR required.is_deleted = true
           OR assignment.id IS NULL
         )
       ORDER BY required.module_code COLLATE "C"`,
      [scope.tenantId, scope.parkId, moduleCode]
    ) as Array<{ requiredModuleCode: string }>;
    if (missing.length > 0) {
      throw new ConflictException({
        message: "Required module is not active",
        errorCode: "module-dependency-conflict",
        requiredModules: missing.map((item) => item.requiredModuleCode)
      });
    }
  }

  private async assertNoActiveDependents(
    manager: EntityManager,
    scope: TenantParkScope,
    moduleCode: string
  ): Promise<void> {
    const dependents = await manager.query(
      `SELECT dependent.module_code AS "moduleCode"
       FROM sys_module required
       JOIN sys_module_dependency dependency
         ON dependency.required_module_id = required.id
        AND dependency.dependency_kind = 'hard'
        AND dependency.is_enabled = true
        AND dependency.is_deleted = false
       JOIN sys_module dependent
         ON dependent.id = dependency.module_id
        AND dependent.status = 1
        AND dependent.is_deleted = false
       JOIN rel_tenant_module assignment
         ON assignment.tenant_id = $1
        AND assignment.park_id = $2
        AND assignment.module_id = dependent.id
        AND assignment.enabled = true
        AND assignment.status = 'enabled'
        AND assignment.is_deleted = false
        AND (assignment.start_time IS NULL OR assignment.start_time <= now())
        AND (assignment.expire_time IS NULL OR assignment.expire_time > now())
       WHERE required.module_code = $3
         AND required.status = 1
         AND required.is_deleted = false
       ORDER BY dependent.module_code COLLATE "C"`,
      [scope.tenantId, scope.parkId, moduleCode]
    ) as Array<{ moduleCode: string }>;
    if (dependents.length > 0) {
      throw new ConflictException({
        message: "Active dependent modules must be disabled first",
        errorCode: "module-dependency-conflict",
        dependentModules: dependents.map((item) => item.moduleCode)
      });
    }
  }

  private async assertProspectiveAssignmentSupportsDependents(
    manager: EntityManager,
    scope: TenantParkScope,
    moduleCode: string,
    enabled: boolean,
    startTime: Date | null | undefined,
    expireTime: Date | null | undefined
  ): Promise<void> {
    const rows = await manager.query(
      `SELECT (
         $1::boolean
         AND ($2::timestamptz IS NULL OR $2::timestamptz <= now())
         AND ($3::timestamptz IS NULL OR $3::timestamptz > now())
       ) AS active`,
      [enabled, startTime ?? null, expireTime ?? null]
    ) as Array<{ active: boolean }>;
    if (rows[0]?.active !== true) {
      await this.assertNoActiveDependents(manager, scope, moduleCode);
    }
  }

  private assertAssignmentWindow(
    startTime: Date | null | undefined,
    expireTime: Date | null | undefined
  ): void {
    if (startTime && expireTime && startTime.getTime() >= expireTime.getTime()) {
      throw new ConflictException({
        message: "Module assignment expireTime must be later than startTime",
        errorCode: "module-dependency-conflict"
      });
    }
  }

  private writeDataSource(): DataSource {
    if (!this.dataSource) {
      throw new Error("SaaSModulesService DataSource is required for module writes");
    }
    return this.dataSource;
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
