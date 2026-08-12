import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
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
  device?: string;
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
      where: { id, tenantId: scope.tenantId, isDeleted: false }
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
      where: { tenantId: scope.tenantId, parkId: scope.parkId, roleId, isDeleted: false },
      relations: { rule: true },
      order: { createTime: "ASC" }
    });
    return links
      .map((link) => link.rule)
      .filter(
        (rule) =>
          rule &&
          rule.tenantId === scope.tenantId &&
          !rule.isDeleted
      );
  }

  async getUserDataScopes(scope: TenantParkScope, user: JwtPrincipal): Promise<UserDataScopeContext[]> {
    if (user.isSuper || user.permissions.includes("*")) {
      return [{ dimension: "tenant", scope_type: "all", scope_config: {} }];
    }
    const roleIds = await this.resolveUserRoleIds(scope, user);
    if (roleIds.length === 0) {
      return [{ dimension: "tenant", scope_type: user.dataScope ?? "tenant", scope_config: {} }];
    }
    const scopes = await this.getDataScopesForRoleIds(scope, roleIds);
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
    const ruleIds = [...new Set(dto.ruleIds)];
    if (ruleIds.length !== dto.ruleIds.length) {
      throw new BadRequestException("Data scope rule ids must be unique");
    }
    const rules = await this.rulesRepository.find({
      where: {
        id: In(ruleIds),
        tenantId: scope.tenantId,
        isDeleted: false,
        status: "enabled"
      }
    });
    if (rules.length !== ruleIds.length) {
      throw new NotFoundException("Data scope rule not found in current tenant");
    }
    await this.roleDataScopeRepository.manager.transaction(async (manager) => {
      const role = await manager.getRepository(RoleEntity).createQueryBuilder("role")
        .setLock("pessimistic_write")
        .where("role.id=:roleId", { roleId })
        .andWhere("role.tenant_id=:tenantId", { tenantId: scope.tenantId })
        .andWhere("(role.role_scope='tenant' OR (role.role_scope='park' AND role.park_id=:parkId))", { parkId: scope.parkId })
        .andWhere("role.is_deleted=false")
        .getOne();
      if (!role) throw new NotFoundException("Role not found in current tenant");
      if (role.isTemplate === true || role.isSystem === true || role.isBuiltin === true || role.editable === false || role.isEditable === false) {
        throw new ForbiddenException("Protected role bindings cannot be changed");
      }
      const linksRepository = manager.getRepository(RoleDataScopeEntity);
      await linksRepository.update(
        { tenantId: scope.tenantId, parkId: scope.parkId, roleId, isDeleted: false },
        { isDeleted: true, updateBy: actorId }
      );
      if (ruleIds.length > 0) {
        await linksRepository.save(
          ruleIds.map((ruleId) =>
            linksRepository.create({
              tenantId: scope.tenantId,
              parkId: scope.parkId,
              roleId,
              ruleId,
              createBy: actorId,
              updateBy: actorId
            })
          )
        );
      }
    });
    return { roleId, ruleIds };
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
    if (ids === null) {
      return baseWhere;
    }
    if (!column) return { ...baseWhere, id: In([]) } as FindOptionsWhere<T>;
    if (ids.length === 0) {
      return { ...baseWhere, [column]: In([]) } as FindOptionsWhere<T>;
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
    if (ids === null) {
      return builder;
    }
    if (!column) return builder.andWhere("1 = 0");
    if (ids.length === 0) {
      return builder.andWhere("1 = 0");
    }
    const parameterName = `dataScopeIds_${dimension}`;
    return builder.andWhere(`${alias}.${column} IN (:...${parameterName})`, { [parameterName]: ids });
  }

  private async resolveAllowedIds(scope: TenantParkScope, user: JwtPrincipal, dimension: DataScopeDimension): Promise<string[] | null> {
    const roleIds = await this.resolveUserRoleIds(scope, user);
    if (roleIds.length === 0) {
      return this.resolveFallbackAllowedIds(user, dimension);
    }
    const links = await this.roleDataScopeRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, roleId: In(roleIds), isDeleted: false },
      relations: { rule: true }
    });
    const enabledRules = links
      .map((link) => link.rule)
      .filter(
        (rule) =>
          rule &&
          rule.tenantId === scope.tenantId &&
          !rule.isDeleted &&
          rule.status === "enabled"
      );
    const rules = enabledRules.filter((rule) => rule.dimension === dimension || rule.dimension === "tenant" || rule.dimension === "park");
    if (rules.some((rule) => rule.scopeType === "all" || rule.scopeType === "tenant" || rule.scopeType === "park")) {
      return null;
    }
    if (rules.length === 0) return enabledRules.length > 0 ? null : this.resolveFallbackAllowedIds(user, dimension);
    const dimensionRules = rules.filter((rule) => rule.dimension === dimension || this.idsForDimension(dimension, rule.scopeConfig).length > 0 || rule.scopeType === "self");
    if (dimensionRules.length === 0) {
      return [];
    }
    const ids = new Set<string>();
    for (const rule of dimensionRules) {
      if (rule.scopeType === "self") {
        ids.add(user.sub);
      }
      if (dimension === "org" && this.normalizeScopeType(rule.scopeType) === "org_and_children") {
        const roots = this.idsForDimension("org", rule.scopeConfig);
        for (const id of await this.expandOrgDescendants(scope, roots)) ids.add(id);
        continue;
      }
      for (const id of this.idsForDimension(dimension, rule.scopeConfig)) {
        ids.add(id);
      }
    }
    return [...ids];
  }

  private async expandOrgDescendants(scope: TenantParkScope, roots: string[]): Promise<string[]> {
    if (roots.length === 0) return [];
    const rows = await this.rulesRepository.query<Array<{ id: string }>>(
      `WITH RECURSIVE org_tree AS (
         SELECT id FROM sys_org
          WHERE tenant_id = $1 AND park_id = $2 AND is_deleted = false AND status = 'enabled' AND id = ANY($3::uuid[])
         UNION
         SELECT child.id FROM sys_org child
         JOIN org_tree parent ON child.parent_id = parent.id
          WHERE child.tenant_id = $1 AND child.park_id = $2 AND child.is_deleted = false AND child.status = 'enabled'
       ) SELECT id FROM org_tree`,
      [scope.tenantId, scope.parkId, roots]
    );
    return rows.map((row) => row.id);
  }

  private resolveFallbackAllowedIds(user: JwtPrincipal, dimension: DataScopeDimension): string[] | null {
    const fallback = this.normalizeScopeType(user.dataScope ?? "tenant");
    if (fallback === "all" || fallback === "tenant" || fallback === "park") {
      return null;
    }
    if (fallback === "self" && ["customer_owner", "contract_owner", "workorder_handler"].includes(dimension)) {
      return [user.sub];
    }
    return [];
  }

  private async resolveUserRoleIds(scope: TenantParkScope, user: JwtPrincipal): Promise<string[]> {
    const roleLinks = await this.userRoleRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, userId: user.sub, isDeleted: false },
      relations: { role: true }
    });
    return roleLinks
      .filter(
        (link) =>
          link.role &&
          link.role.tenantId === scope.tenantId &&
          (link.role.roleScope === "tenant" || link.role.parkId === scope.parkId) &&
          !link.role.isDeleted &&
          link.role.isEnabled
      )
      .map((link) => link.roleId);
  }

  private async getDataScopesForRoleIds(scope: TenantParkScope, roleIds: string[]): Promise<UserDataScopeContext[]> {
    if (roleIds.length === 0) {
      return [];
    }
    const links = await this.roleDataScopeRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, roleId: In(roleIds), isDeleted: false },
      relations: { rule: true },
      order: { createTime: "ASC" }
    });
    return links
      .map((link) => link.rule)
      .filter(
        (rule) =>
          rule &&
          rule.tenantId === scope.tenantId &&
          !rule.isDeleted &&
          rule.status === "enabled"
      )
      .map((rule) => ({
        rule_code: rule.ruleCode,
        rule_name: rule.ruleName,
        dimension: rule.dimension,
        scope_type: rule.scopeType,
        scope_config: { ...(rule.scopeConfig as Record<string, unknown>) }
      }));
  }

  private normalizeScopeType(scope: string): string {
    return ({ "10": "self", "20": "org", "30": "org_and_children", "40": "park", "50": "tenant", "60": "custom" })[scope] ?? scope;
  }

  private idsForDimension(dimension: DataScopeDimension, config: DataScopeConfig): string[] {
    const byDimension: Record<DataScopeDimension, string[] | undefined> = {
      tenant: config.ids,
      park: config.ids,
      org: config.orgIds ?? config.ids,
      building: config.buildingIds ?? config.ids,
      floor: config.floorIds ?? config.ids,
      unit: config.unitIds ?? config.ids,
      device: config.deviceIds ?? config.ids,
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
      device: mapping.device ?? "deviceId",
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
      device: mapping.device ?? "device_id",
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
    const keys: Array<keyof DataScopeConfig> = [
      "ids",
      "orgIds",
      "buildingIds",
      "floorIds",
      "unitIds",
      "deviceIds",
      "tenantCompanyIds",
      "userIds"
    ];
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
      where: [
        { id: roleId, tenantId: scope.tenantId, roleScope: "tenant", isDeleted: false },
        { id: roleId, tenantId: scope.tenantId, parkId: scope.parkId, roleScope: "park", isDeleted: false }
      ]
    });
    if (!role) {
      throw new NotFoundException("Role not found in current tenant");
    }
    return role;
  }
}
