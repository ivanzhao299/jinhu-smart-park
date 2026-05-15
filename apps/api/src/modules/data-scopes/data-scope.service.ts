import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { FindOptionsWhere, ObjectLiteral, Repository, SelectQueryBuilder } from "typeorm";
import { In } from "typeorm";
import type { PaginatedResult, TenantParkScope, UserDataScopeContext } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import type { AssignRoleDataScopesDto } from "./dto/assign-role-data-scopes.dto";
import type { CreateDataScopeRuleDto } from "./dto/create-data-scope-rule.dto";
import type { UpdateDataScopeRuleDto } from "./dto/update-data-scope-rule.dto";
import type { DataScopeConfig, DataScopeDimension } from "./entities/data-scope-rule.entity";
import { DataScopeRuleEntity } from "./entities/data-scope-rule.entity";
import { RoleDataScopeEntity } from "./entities/role-data-scope.entity";

export interface DataScopeColumnMapping {
  tenant?: string;
  park?: string;
  org?: string;
  building?: string;
  floor?: string;
  unit?: string;
  tenantCompany?: string;
  owner?: string;
  handler?: string;
}

export interface DataScopeFilter {
  dimension: DataScopeDimension;
  unrestricted: boolean;
  allowed_ids: string[];
  scope_types: string[];
}

@Injectable()
export class DataScopeService {
  constructor(
    @InjectRepository(DataScopeRuleEntity)
    private readonly rulesRepository: Repository<DataScopeRuleEntity>,
    @InjectRepository(RoleDataScopeEntity)
    private readonly roleDataScopeRepository: Repository<RoleDataScopeEntity>,
    @InjectRepository(RoleEntity)
    private readonly rolesRepository: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepository: Repository<UserRoleEntity>
  ) {}

  async listRules(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<DataScopeRuleEntity>> {
    const where = {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      isDeleted: false,
      ...(query.status ? { status: query.status } : {})
    };
    const [items, total] = await this.rulesRepository.findAndCount({
      where,
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async createRule(scope: TenantParkScope, actorId: string, dto: CreateDataScopeRuleDto): Promise<DataScopeRuleEntity> {
    await this.assertRuleCodeAvailable(scope, dto.ruleCode);
    const scopeConfig = this.normalizeScopeConfig(dto.scopeConfig);
    const entity = this.rulesRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      ruleCode: dto.ruleCode,
      ruleName: dto.ruleName,
      dimension: dto.dimension,
      scopeType: dto.scopeType,
      scopeConfig,
      status: dto.status ?? "enabled",
      remark: dto.remark ?? null,
      createBy: actorId,
      updateBy: actorId
    });
    return this.rulesRepository.save(entity);
  }

  async updateRule(scope: TenantParkScope, actorId: string, id: string, dto: UpdateDataScopeRuleDto): Promise<DataScopeRuleEntity> {
    const entity = await this.detailRule(scope, id);
    if (dto.ruleCode && dto.ruleCode !== entity.ruleCode) {
      await this.assertRuleCodeAvailable(scope, dto.ruleCode);
    }
    Object.assign(entity, {
      ruleCode: dto.ruleCode ?? entity.ruleCode,
      ruleName: dto.ruleName ?? entity.ruleName,
      dimension: dto.dimension ?? entity.dimension,
      scopeType: dto.scopeType ?? entity.scopeType,
      scopeConfig: dto.scopeConfig === undefined ? entity.scopeConfig : this.normalizeScopeConfig(dto.scopeConfig),
      status: dto.status ?? entity.status,
      remark: dto.remark ?? entity.remark,
      updateBy: actorId
    });
    return this.rulesRepository.save(entity);
  }

  async detailRule(scope: TenantParkScope, id: string): Promise<DataScopeRuleEntity> {
    const entity = await this.rulesRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!entity) {
      throw new NotFoundException("Data scope rule not found");
    }
    return entity;
  }

  async softDeleteRule(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const entity = await this.detailRule(scope, id);
    const boundRoles = await this.roleDataScopeRepository.count({
      where: { tenantId: scope.tenantId, ruleId: id, isDeleted: false }
    });
    if (boundRoles > 0) {
      throw new BadRequestException("Data scope rule has bound roles and cannot be deleted");
    }
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.rulesRepository.save(entity);
    return { id };
  }

  async listRoleRules(scope: TenantParkScope, roleId: string): Promise<DataScopeRuleEntity[]> {
    await this.mustFindRole(scope, roleId);
    const links = await this.roleDataScopeRepository.find({
      where: { tenantId: scope.tenantId, roleId, isDeleted: false },
      relations: { rule: true },
      order: { createTime: "ASC" }
    });
    return links.map((link) => link.rule).filter((rule) => rule && !rule.isDeleted);
  }

  async getUserDataScopes(userId: string): Promise<UserDataScopeContext[]>;
  async getUserDataScopes(scope: TenantParkScope, user: JwtPrincipal): Promise<UserDataScopeContext[]>;
  async getUserDataScopes(scopeOrUserId: TenantParkScope | string, user?: JwtPrincipal): Promise<UserDataScopeContext[]> {
    if (typeof scopeOrUserId === "string") {
      return this.getUserDataScopesByUserId(scopeOrUserId);
    }
    if (!user) {
      return [];
    }
    const scope = scopeOrUserId;
    if (user.isSuper || user.permissions.includes("*")) {
      return [{ dimension: "tenant", scope_type: "all", scope_config: {} }];
    }
    const roleIds = await this.resolveUserRoleIds(scope, user);
    if (roleIds.length === 0) {
      return [{ dimension: "tenant", scope_type: user.dataScope ?? "tenant", scope_config: {} }];
    }
    const scopes = await this.getDataScopesForRoleIds(scope.tenantId, roleIds);
    return scopes.length > 0 ? scopes : [{ dimension: "tenant", scope_type: user.dataScope ?? "tenant", scope_config: {} }];
  }

  async buildScopeFilter(user: JwtPrincipal, dimension: DataScopeDimension): Promise<DataScopeFilter> {
    if (user.isSuper || user.permissions.includes("*")) {
      return { dimension, unrestricted: true, allowed_ids: [], scope_types: ["all"] };
    }
    const scope = { tenantId: user.tenantId, parkId: user.parkId };
    const scopes = await this.getUserDataScopes(scope, user);
    const ids = await this.resolveAllowedIds(scope, user, dimension);
    return {
      dimension,
      unrestricted: ids === null,
      allowed_ids: ids ?? [],
      scope_types: [...new Set(scopes.filter((item) => item.dimension === dimension || item.dimension === "tenant" || item.dimension === "park").map((item) => item.scope_type))]
    };
  }

  async assignRoleRules(scope: TenantParkScope, actorId: string, roleId: string, dto: AssignRoleDataScopesDto): Promise<{ roleId: string; ruleIds: string[] }> {
    await this.mustFindRole(scope, roleId);
    const rules = await this.rulesRepository.find({
      where: { id: In(dto.ruleIds), tenantId: scope.tenantId, isDeleted: false, status: "enabled" }
    });
    if (rules.length !== dto.ruleIds.length) {
      throw new NotFoundException("Data scope rule not found in current tenant");
    }
    await this.roleDataScopeRepository.update(
      { tenantId: scope.tenantId, roleId, isDeleted: false },
      { isDeleted: true, updateBy: actorId }
    );
    if (dto.ruleIds.length === 0) {
      return { roleId, ruleIds: [] };
    }
    await this.roleDataScopeRepository.save(
      dto.ruleIds.map((ruleId) =>
        this.roleDataScopeRepository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          roleId,
          ruleId,
          createBy: actorId,
          updateBy: actorId
        })
      )
    );
    return { roleId, ruleIds: dto.ruleIds };
  }

  createBaseWhere<T extends ObjectLiteral>(scope: TenantParkScope): FindOptionsWhere<T> {
    return { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } as unknown as FindOptionsWhere<T>;
  }

  async buildFindWhere<T extends ObjectLiteral>(
    scope: TenantParkScope,
    user: JwtPrincipal | undefined,
    dimension: DataScopeDimension,
    baseWhere: FindOptionsWhere<T>,
    mapping: DataScopeColumnMapping = {}
  ): Promise<FindOptionsWhere<T>> {
    if (!user || user.isSuper || user.permissions.includes("*")) {
      return baseWhere;
    }
    const ids = await this.resolveAllowedIds(scope, user, dimension);
    const column = this.resolveFindColumn(dimension, mapping);
    if (!ids || ids.length === 0 || !column) {
      return baseWhere;
    }
    return { ...baseWhere, [column]: In(ids) } as FindOptionsWhere<T>;
  }

  async applyToQueryBuilder<T extends ObjectLiteral>(
    builder: SelectQueryBuilder<T>,
    scope: TenantParkScope,
    user: JwtPrincipal | undefined,
    dimension: DataScopeDimension,
    alias: string,
    mapping: DataScopeColumnMapping = {}
  ): Promise<SelectQueryBuilder<T>> {
    if (!user || user.isSuper || user.permissions.includes("*")) {
      return builder;
    }
    const ids = await this.resolveAllowedIds(scope, user, dimension);
    const column = this.resolveDatabaseColumn(dimension, mapping);
    if (!ids || ids.length === 0 || !column) {
      return builder;
    }
    return builder.andWhere(`${alias}.${column} IN (:...dataScopeIds)`, { dataScopeIds: ids });
  }

  private async resolveAllowedIds(scope: TenantParkScope, user: JwtPrincipal, dimension: DataScopeDimension): Promise<string[] | null> {
    const roleIds = await this.resolveUserRoleIds(scope, user);
    if (roleIds.length === 0) {
      return [];
    }
    const links = await this.roleDataScopeRepository.find({
      where: { tenantId: scope.tenantId, roleId: In(roleIds), isDeleted: false },
      relations: { rule: true }
    });
    const rules = links
      .map((link) => link.rule)
      .filter((rule) => rule && !rule.isDeleted && rule.status === "enabled" && (rule.dimension === dimension || rule.dimension === "tenant" || rule.dimension === "park"));
    if (rules.some((rule) => rule.scopeType === "all" || rule.scopeType === "tenant" || rule.scopeType === "park")) {
      return null;
    }
    const ids = new Set<string>();
    for (const rule of rules) {
      if (rule.scopeType === "self") {
        ids.add(user.sub);
      }
      for (const id of this.idsForDimension(dimension, rule.scopeConfig)) {
        ids.add(id);
      }
    }
    return [...ids];
  }

  private async resolveUserRoleIds(scope: TenantParkScope, user: JwtPrincipal): Promise<string[]> {
    const roleLinks = await this.userRoleRepository.find({
      where: { tenantId: scope.tenantId, userId: user.sub, isDeleted: false },
      relations: { role: true }
    });
    return roleLinks.filter((link) => link.role && !link.role.isDeleted && link.role.isEnabled).map((link) => link.roleId);
  }

  private async getUserDataScopesByUserId(userId: string): Promise<UserDataScopeContext[]> {
    const roleLinks = await this.userRoleRepository.find({
      where: { userId, isDeleted: false },
      relations: { role: true }
    });
    const activeLinks = roleLinks.filter((link) => link.role && !link.role.isDeleted && link.role.isEnabled);
    if (activeLinks.some((link) => link.role.isSuper)) {
      return [{ dimension: "tenant", scope_type: "all", scope_config: {} }];
    }
    const roleIds = activeLinks.map((link) => link.roleId);
    if (roleIds.length === 0) {
      return [];
    }
    const firstLink = activeLinks[0];
    if (!firstLink) {
      return [];
    }
    const tenantId = firstLink.tenantId;
    const scopes = await this.getDataScopesForRoleIds(tenantId, roleIds);
    return scopes.length > 0 ? scopes : [{ dimension: "tenant", scope_type: this.resolveRoleFallbackScope(activeLinks.map((link) => link.role.dataScope)), scope_config: {} }];
  }

  private async getDataScopesForRoleIds(tenantId: string, roleIds: string[]): Promise<UserDataScopeContext[]> {
    if (roleIds.length === 0) {
      return [];
    }
    const links = await this.roleDataScopeRepository.find({
      where: { tenantId, roleId: In(roleIds), isDeleted: false },
      relations: { rule: true },
      order: { createTime: "ASC" }
    });
    return links
      .map((link) => link.rule)
      .filter((rule) => rule && !rule.isDeleted && rule.status === "enabled")
      .map((rule) => ({
        rule_code: rule.ruleCode,
        rule_name: rule.ruleName,
        dimension: rule.dimension,
        scope_type: rule.scopeType,
        scope_config: { ...(rule.scopeConfig as Record<string, unknown>) }
      }));
  }

  private resolveRoleFallbackScope(scopes: string[]): string {
    const normalize = (scope: string): string =>
      ({ "10": "self", "20": "org", "30": "org_and_children", "40": "park", "50": "tenant", "60": "custom" })[scope] ?? scope;
    const rank: Record<string, number> = { self: 1, org: 2, org_and_children: 3, park: 4, tenant: 5, custom: 6, all: 7 };
    return scopes.map(normalize).reduce((current, scope) => ((rank[scope] ?? 0) > (rank[current] ?? 0) ? scope : current), "tenant");
  }

  private idsForDimension(dimension: DataScopeDimension, config: DataScopeConfig): string[] {
    const byDimension: Record<DataScopeDimension, string[] | undefined> = {
      tenant: config.ids,
      park: config.ids,
      org: config.orgIds ?? config.ids,
      building: config.buildingIds ?? config.ids,
      floor: config.floorIds ?? config.ids,
      unit: config.unitIds ?? config.ids,
      tenant_company: config.tenantCompanyIds ?? config.ids,
      customer_owner: config.userIds ?? config.ids,
      contract_owner: config.userIds ?? config.ids,
      workorder_handler: config.userIds ?? config.ids
    };
    return byDimension[dimension] ?? [];
  }

  private resolveFindColumn(dimension: DataScopeDimension, mapping: DataScopeColumnMapping): string | null {
    const columns: Record<DataScopeDimension, string | undefined> = {
      tenant: mapping.tenant ?? "tenantId",
      park: mapping.park ?? "parkId",
      org: mapping.org ?? "orgId",
      building: mapping.building ?? "buildingId",
      floor: mapping.floor ?? "floorId",
      unit: mapping.unit ?? "unitId",
      tenant_company: mapping.tenantCompany,
      customer_owner: mapping.owner,
      contract_owner: mapping.owner,
      workorder_handler: mapping.handler
    };
    return columns[dimension] ?? null;
  }

  private resolveDatabaseColumn(dimension: DataScopeDimension, mapping: DataScopeColumnMapping): string | null {
    const columns: Record<DataScopeDimension, string | undefined> = {
      tenant: mapping.tenant ?? "tenant_id",
      park: mapping.park ?? "park_id",
      org: mapping.org ?? "org_id",
      building: mapping.building ?? "building_id",
      floor: mapping.floor ?? "floor_id",
      unit: mapping.unit ?? "unit_id",
      tenant_company: mapping.tenantCompany,
      customer_owner: mapping.owner,
      contract_owner: mapping.owner,
      workorder_handler: mapping.handler
    };
    return columns[dimension] ?? null;
  }

  private normalizeScopeConfig(config: DataScopeConfig | undefined): DataScopeConfig {
    const source = config ?? {};
    const normalized: DataScopeConfig = {};
    const keys: Array<keyof DataScopeConfig> = ["ids", "orgIds", "buildingIds", "floorIds", "unitIds", "tenantCompanyIds", "userIds"];
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined) {
        if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
          throw new BadRequestException("scope_config must use structured string array fields only");
        }
        normalized[key] = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
      }
    }
    return normalized;
  }

  private async assertRuleCodeAvailable(scope: TenantParkScope, ruleCode: string): Promise<void> {
    const exists = await this.rulesRepository.exists({
      where: { tenantId: scope.tenantId, ruleCode, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Data scope rule code already exists");
    }
  }

  private async mustFindRole(scope: TenantParkScope, roleId: string): Promise<RoleEntity> {
    const role = await this.rolesRepository.findOne({
      where: { id: roleId, tenantId: scope.tenantId, isDeleted: false }
    });
    if (!role) {
      throw new NotFoundException("Role not found in current tenant");
    }
    return role;
  }
}
