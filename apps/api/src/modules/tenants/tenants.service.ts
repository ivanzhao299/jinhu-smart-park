import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { randomInt } from "node:crypto";
import type { DataSource, EntityManager, Repository } from "typeorm";
import { In } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { OrgEntity } from "../orgs/entities/org.entity";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { ParkEntity } from "../parks/entities/park.entity";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { RolePermissionEntity } from "../permissions/entities/role-permission.entity";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { PlanEntity } from "../saas-modules/entities/plan.entity";
import { SaaSModuleEntity } from "../saas-modules/entities/saas-module.entity";
import { TenantModuleEntity } from "../saas-modules/entities/tenant-module.entity";
import { UserEntity } from "../users/entities/user.entity";
import { UserParkEntity } from "../users/entities/user-park.entity";
import type { CreateTenantDto } from "./dto/create-tenant.dto";
import type { UpdateTenantModulesDto } from "./dto/update-tenant-modules.dto";
import type { UpdateTenantDto } from "./dto/update-tenant.dto";
import { TenantEntity } from "./entities/tenant.entity";

const DEFAULT_SOURCE_SCOPE: TenantParkScope = { tenantId: "10000001", parkId: "20000001" };
const TENANT_ADMIN_ROLE_CODE = "TENANT_ADMIN";

export interface TenantView {
  id: string;
  tenantId: string;
  parkId: string;
  tenantCode: string;
  tenantName: string;
  tenantType: string;
  contactName: string | null;
  contactMobile: string | null;
  contactUserId: string | null;
  websites: string[];
  domains: string[];
  status: number;
  statusName: string;
  expireTime: Date | null;
  maxUsers: number;
  maxParks: number;
  planCode: string | null;
  featureConfig: Record<string, unknown>;
  userCount: number;
  parkCount: number;
  enabledModuleCount: number;
  createTime: Date;
  updateTime: Date;
  remark: string | null;
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepository: Repository<TenantEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService
  ) {}

  async current(scope: TenantParkScope): Promise<TenantView> {
    const tenant =
      (await this.tenantRepository.findOne({ where: { tenantId: scope.tenantId, isDeleted: false } })) ??
      (await this.tenantRepository.findOne({ where: { tenantCode: "JH_DEFAULT", isDeleted: false } }));
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    return this.toView(tenant);
  }

  async assertTenantActive(tenantId: string): Promise<TenantEntity> {
    const tenant = await this.tenantRepository.findOne({ where: { tenantId, isDeleted: false } });
    if (!tenant) {
      throw new UnauthorizedException("Tenant not found");
    }
    if (tenant.status === 0) {
      throw new UnauthorizedException("Tenant is disabled");
    }
    if (tenant.status === 2 || (tenant.expireTime && tenant.expireTime.getTime() <= Date.now())) {
      throw new UnauthorizedException("Tenant is expired");
    }
    return tenant;
  }

  async list(actor: JwtPrincipal, query: PaginationQueryDto): Promise<PaginatedResult<TenantView>> {
    this.assertSuper(actor);
    const builder = this.tenantRepository.createQueryBuilder("tenant").where("tenant.isDeleted = false");
    if (query.status) {
      builder.andWhere("tenant.status = :status", { status: this.toStatusNumber(query.status) });
    }
    if (query.keyword) {
      builder.andWhere(
        "(tenant.tenantCode ILIKE :keyword OR tenant.tenantName ILIKE :keyword OR tenant.contactName ILIKE :keyword)",
        { keyword: `%${query.keyword}%` }
      );
    }
    const [items, total] = await builder
      .orderBy("tenant.createTime", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const views = await Promise.all(items.map((item) => this.toView(item)));
    return { items: views, total, page: query.page, page_size: query.page_size };
  }

  async detail(actor: JwtPrincipal, id: string): Promise<TenantView> {
    this.assertSuper(actor);
    return this.toView(await this.getTenantById(id));
  }

  async create(actorScope: TenantParkScope, actorId: string, actor: JwtPrincipal, dto: CreateTenantDto): Promise<TenantView> {
    this.assertSuper(actor);
    return this.dataSource.transaction(async (manager) => {
      const tenantRepository = manager.getRepository(TenantEntity);
      const tenantCode = dto.tenantCode.trim();
      await this.assertTenantCodeAvailable(tenantRepository, tenantCode);

      const tenantId = dto.tenantId?.trim() || (await this.generateScopeId(tenantRepository, "1", "tenantId"));
      const parkId = dto.parkId?.trim() || (await this.generateScopeId(tenantRepository, "2", "parkId"));
      await this.assertTenantIdAvailable(tenantRepository, tenantId);
      await this.assertParkIdAvailable(manager.getRepository(ParkEntity), parkId);

      const plan = await this.resolvePlan(manager, actorScope, dto.planCode ?? null);
      const moduleCodes = this.normalizeCodes(dto.moduleCodes?.length ? dto.moduleCodes : plan?.moduleCodes ?? ["system"]);
      const maxUsers = dto.maxUsers ?? plan?.maxUsers ?? 0;
      const maxParks = dto.maxParks ?? plan?.maxParks ?? 0;
      const expireTime = dto.expireTime ? new Date(dto.expireTime) : null;

      const tenant = await tenantRepository.save(
        tenantRepository.create({
          tenantId,
          parkId: "0",
          tenantCode,
          tenantName: dto.tenantName.trim(),
          tenantType: dto.tenantType ?? "park_operator",
          contactName: this.emptyToNull(dto.contactName),
          contactMobile: this.emptyToNull(dto.contactMobile),
          websites: this.normalizeStringArray(dto.websites),
          domains: this.normalizeStringArray(dto.domains),
          status: this.toStatusNumber(dto.status ?? 1),
          expireTime,
          maxUsers,
          maxParks,
          planCode: plan?.planCode ?? dto.planCode ?? null,
          featureConfig: dto.featureConfig ?? plan?.featureConfig ?? {},
          remark: this.emptyToNull(dto.remark),
          createBy: actorId,
          updateBy: actorId
        })
      );

      const park = await this.createDefaultPark(manager, tenant, parkId, actorId, dto);
      const org = await this.createRootOrg(manager, tenant, park.parkId, actorId, dto);
      const permissions = await this.ensureTenantPermissions(manager, actorScope, { tenantId, parkId: park.parkId }, actorId);
      const modules = await this.resolveStandardModules(manager, moduleCodes);
      await this.upsertTenantModules(manager, tenant, park.parkId, modules, plan, actorId, expireTime, dto.featureConfig ?? {});
      const role = await this.createTenantAdminRole(manager, tenant, park.parkId, actorId);
      await this.applyTenantAdminPermissions(
        manager,
        { tenantId, parkId: park.parkId },
        role,
        permissions,
        moduleCodes,
        dto.permissionCodes?.length ? dto.permissionCodes : plan?.permissionCodes ?? [],
        actorId
      );
      const user = await this.createTenantAdminUser(manager, tenant, park.parkId, actorId, dto);
      await this.bindTenantAdmin(manager, tenant, park.parkId, org.id, role.id, user.id, actorId);
      tenant.contactUserId = user.id;
      if (!tenant.contactName) tenant.contactName = user.displayName;
      if (!tenant.contactMobile) tenant.contactMobile = user.mobile;
      await tenantRepository.save(tenant);

      return this.toView(tenant, manager);
    });
  }

  async update(actor: JwtPrincipal, actorId: string, id: string, dto: UpdateTenantDto): Promise<TenantView> {
    this.assertSuper(actor);
    const tenant = await this.getTenantById(id);
    if (dto.tenantCode && dto.tenantCode !== tenant.tenantCode) {
      await this.assertTenantCodeAvailable(this.tenantRepository, dto.tenantCode, id);
    }
    Object.assign(tenant, {
      tenantCode: dto.tenantCode ?? tenant.tenantCode,
      tenantName: dto.tenantName ?? tenant.tenantName,
      tenantType: dto.tenantType ?? tenant.tenantType,
      contactName: dto.contactName === undefined ? tenant.contactName : this.emptyToNull(dto.contactName),
      contactMobile: dto.contactMobile === undefined ? tenant.contactMobile : this.emptyToNull(dto.contactMobile),
      websites: dto.websites === undefined ? tenant.websites : this.normalizeStringArray(dto.websites),
      domains: dto.domains === undefined ? tenant.domains : this.normalizeStringArray(dto.domains),
      status: dto.status === undefined ? tenant.status : this.toStatusNumber(dto.status),
      expireTime: dto.expireTime === undefined ? tenant.expireTime : dto.expireTime ? new Date(dto.expireTime) : null,
      maxUsers: dto.maxUsers ?? tenant.maxUsers,
      maxParks: dto.maxParks ?? tenant.maxParks,
      planCode: dto.planCode === undefined ? tenant.planCode : dto.planCode,
      featureConfig: dto.featureConfig ?? tenant.featureConfig,
      remark: dto.remark === undefined ? tenant.remark : this.emptyToNull(dto.remark),
      updateBy: actorId
    });
    return this.toView(await this.tenantRepository.save(tenant));
  }

  async enable(actor: JwtPrincipal, actorId: string, id: string): Promise<TenantView> {
    this.assertSuper(actor);
    const tenant = await this.getTenantById(id);
    tenant.status = 1;
    tenant.updateBy = actorId;
    return this.toView(await this.tenantRepository.save(tenant));
  }

  async disable(actor: JwtPrincipal, actorId: string, id: string): Promise<TenantView> {
    this.assertSuper(actor);
    const tenant = await this.getTenantById(id);
    tenant.status = 0;
    tenant.updateBy = actorId;
    return this.toView(await this.tenantRepository.save(tenant));
  }

  async assignModules(
    actorScope: TenantParkScope,
    actorId: string,
    actor: JwtPrincipal,
    id: string,
    dto: UpdateTenantModulesDto
  ): Promise<TenantView> {
    this.assertSuper(actor);
    return this.dataSource.transaction(async (manager) => {
      const tenantRepository = manager.getRepository(TenantEntity);
      const tenant = await tenantRepository.findOne({ where: { id, isDeleted: false } });
      if (!tenant) {
        throw new NotFoundException("Tenant not found");
      }
      const plan = await this.resolvePlan(manager, actorScope, dto.planCode ?? tenant.planCode);
      const moduleCodes = this.normalizeCodes(dto.moduleCodes?.length ? dto.moduleCodes : plan?.moduleCodes ?? []);
      if (moduleCodes.length === 0) {
        throw new BadRequestException("Module codes are required");
      }
      const parkId = dto.parkId ?? (await this.resolveDefaultParkId(manager, tenant.tenantId));
      const targetScope = { tenantId: tenant.tenantId, parkId };
      const permissions = await this.ensureTenantPermissions(manager, actorScope, targetScope, actorId);
      const modules = await this.resolveStandardModules(manager, moduleCodes);
      const expireTime = dto.expireTime ? new Date(dto.expireTime) : null;
      await this.upsertTenantModules(manager, tenant, parkId, modules, plan, actorId, expireTime, dto.featureConfig ?? tenant.featureConfig);
      const role = await this.getOrCreateTenantAdminRole(manager, tenant, parkId, actorId);
      await this.applyTenantAdminPermissions(
        manager,
        targetScope,
        role,
        permissions,
        moduleCodes,
        dto.permissionCodes?.length ? dto.permissionCodes : plan?.permissionCodes ?? [],
        actorId
      );
      tenant.planCode = plan?.planCode ?? tenant.planCode;
      tenant.maxUsers = plan?.maxUsers ?? tenant.maxUsers;
      tenant.maxParks = plan?.maxParks ?? tenant.maxParks;
      tenant.featureConfig = dto.featureConfig ?? plan?.featureConfig ?? tenant.featureConfig;
      tenant.updateBy = actorId;
      await tenantRepository.save(tenant);
      return this.toView(tenant, manager);
    });
  }

  private async getTenantById(id: string): Promise<TenantEntity> {
    const tenant = await this.tenantRepository.findOne({ where: { id, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    return tenant;
  }

  private async createDefaultPark(
    manager: EntityManager,
    tenant: TenantEntity,
    parkId: string,
    actorId: string,
    dto: CreateTenantDto
  ): Promise<ParkEntity> {
    const parkRepository = manager.getRepository(ParkEntity);
    const parkCode = dto.parkCode?.trim() || `${tenant.tenantCode}_PARK`;
    const parkName = dto.parkName?.trim() || tenant.tenantName;
    await this.assertParkCodeAvailable(parkRepository, parkCode);
    return parkRepository.save(
      parkRepository.create({
        tenantId: tenant.tenantId,
        parkId,
        parkCode,
        parkName,
        status: 1,
        totalArea: "0",
        landArea: "0",
        createBy: actorId,
        updateBy: actorId,
        remark: "Tenant default park"
      })
    );
  }

  private async createRootOrg(
    manager: EntityManager,
    tenant: TenantEntity,
    parkId: string,
    actorId: string,
    dto: CreateTenantDto
  ): Promise<OrgEntity> {
    const orgRepository = manager.getRepository(OrgEntity);
    return orgRepository.save(
      orgRepository.create({
        tenantId: tenant.tenantId,
        parkId,
        orgCode: "TENANT_ROOT",
        orgName: dto.parkName?.trim() || tenant.tenantName,
        orgType: "park",
        parentId: null,
        leaderUserId: null,
        sortOrder: 0,
        status: "enabled",
        createBy: actorId,
        updateBy: actorId,
        remark: "Tenant default root organization"
      })
    );
  }

  private async createTenantAdminRole(
    manager: EntityManager,
    tenant: TenantEntity,
    parkId: string,
    actorId: string
  ): Promise<RoleEntity> {
    const roleRepository = manager.getRepository(RoleEntity);
    return roleRepository.save(
      roleRepository.create({
        tenantId: tenant.tenantId,
        parkId,
        code: TENANT_ADMIN_ROLE_CODE,
        name: "租户管理员",
        rolePath: TENANT_ADMIN_ROLE_CODE,
        roleLevel: 1,
        level: 1,
        sortNo: 10,
        roleType: "tenant",
        roleScope: "tenant",
        dataScope: "tenant",
        dataScopeConfig: {},
        isTemplate: false,
        isSystem: true,
        isBuiltin: true,
        isSuper: false,
        editable: true,
        isEditable: true,
        isDeletable: false,
        isEnabled: true,
        status: "enabled",
        createBy: actorId,
        updateBy: actorId,
        remark: "Tenant bootstrap administrator role"
      })
    );
  }

  private async getOrCreateTenantAdminRole(
    manager: EntityManager,
    tenant: TenantEntity,
    parkId: string,
    actorId: string
  ): Promise<RoleEntity> {
    const roleRepository = manager.getRepository(RoleEntity);
    const existing = await roleRepository.findOne({
      where: { tenantId: tenant.tenantId, parkId, code: TENANT_ADMIN_ROLE_CODE, isDeleted: false }
    });
    return existing ?? this.createTenantAdminRole(manager, tenant, parkId, actorId);
  }

  private async createTenantAdminUser(
    manager: EntityManager,
    tenant: TenantEntity,
    parkId: string,
    actorId: string,
    dto: CreateTenantDto
  ): Promise<UserEntity> {
    const userRepository = manager.getRepository(UserEntity);
    const exists = await userRepository.exists({
      where: { tenantId: tenant.tenantId, parkId, username: dto.adminUsername, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Admin username already exists in target tenant");
    }
    const saltRounds = Number(this.configService.get<string>("BCRYPT_SALT_ROUNDS", "12"));
    return userRepository.save(
      userRepository.create({
        tenantId: tenant.tenantId,
        parkId,
        username: dto.adminUsername.trim(),
        displayName: dto.adminDisplayName.trim(),
        passwordHash: await bcrypt.hash(dto.adminPassword, saltRounds),
        mobile: this.emptyToNull(dto.adminMobile),
        email: this.emptyToNull(dto.adminEmail),
        isEnabled: true,
        status: "enabled",
        createBy: actorId,
        updateBy: actorId,
        remark: "Tenant bootstrap administrator"
      })
    );
  }

  private async bindTenantAdmin(
    manager: EntityManager,
    tenant: TenantEntity,
    parkId: string,
    orgId: string,
    roleId: string,
    userId: string,
    actorId: string
  ): Promise<void> {
    const userRoleRepository = manager.getRepository(UserRoleEntity);
    const userParkRepository = manager.getRepository(UserParkEntity);
    const userOrgRepository = manager.getRepository(UserOrgEntity);
    await userRoleRepository.save(
      userRoleRepository.create({
        tenantId: tenant.tenantId,
        parkId,
        userId,
        roleId,
        createBy: actorId,
        updateBy: actorId,
        remark: "Tenant bootstrap administrator role binding"
      })
    );
    await userParkRepository.save(
      userParkRepository.create({
        tenantId: tenant.tenantId,
        parkId,
        userId,
        isDefault: true,
        status: "enabled",
        createBy: actorId,
        updateBy: actorId,
        remark: "Tenant bootstrap default park binding"
      })
    );
    await userOrgRepository.save(
      userOrgRepository.create({
        tenantId: tenant.tenantId,
        parkId,
        userId,
        orgId,
        postId: null,
        isPrimary: true,
        createBy: actorId,
        updateBy: actorId,
        remark: "Tenant bootstrap default org binding"
      })
    );
  }

  private async ensureTenantPermissions(
    manager: EntityManager,
    sourceScope: TenantParkScope,
    targetScope: TenantParkScope,
    actorId: string
  ): Promise<PermissionEntity[]> {
    const permissionRepository = manager.getRepository(PermissionEntity);
    const existing = await permissionRepository.find({
      where: { tenantId: targetScope.tenantId, parkId: targetScope.parkId, isDeleted: false },
      order: { level: "ASC", sortNo: "ASC", createTime: "ASC" }
    });
    if (existing.length > 0) {
      return existing;
    }

    const source = await this.resolvePermissionSourceScope(manager, sourceScope);
    const sourcePermissions = await permissionRepository.find({
      where: { tenantId: source.tenantId, parkId: source.parkId, isDeleted: false },
      order: { level: "ASC", sortNo: "ASC", createTime: "ASC" }
    });
    if (sourcePermissions.length === 0) {
      throw new BadRequestException("Permission seed source is empty");
    }

    const sourceById = new Map(sourcePermissions.map((permission) => [permission.id, permission]));
    const targetByCode = new Map<string, PermissionEntity>();
    for (const sourcePermission of sourcePermissions) {
      const parentSource = sourcePermission.parentId ? sourceById.get(sourcePermission.parentId) : null;
      const parent = parentSource ? targetByCode.get(parentSource.code) : null;
      const clone = await permissionRepository.save(
        permissionRepository.create({
          tenantId: targetScope.tenantId,
          parkId: targetScope.parkId,
          code: sourcePermission.code,
          name: sourcePermission.name,
          parentId: parent?.id ?? null,
          resource: sourcePermission.resource,
          action: sourcePermission.action,
          permissionPath: sourcePermission.permissionPath,
          permPath: sourcePermission.permPath,
          permissionLevel: sourcePermission.permissionLevel,
          level: sourcePermission.level,
          sortNo: sourcePermission.sortNo,
          permissionType: sourcePermission.permissionType,
          permType: sourcePermission.permType,
          apiMethod: sourcePermission.apiMethod,
          apiPath: sourcePermission.apiPath,
          frontendRoute: sourcePermission.frontendRoute,
          componentKey: sourcePermission.componentKey,
          icon: sourcePermission.icon,
          fieldKey: sourcePermission.fieldKey,
          dataDimension: sourcePermission.dataDimension,
          isSystem: sourcePermission.isSystem,
          isBuiltin: sourcePermission.isBuiltin,
          isTenantCustom: sourcePermission.isTenantCustom,
          visible: sourcePermission.visible,
          keepAlive: sourcePermission.keepAlive,
          alwaysShow: sourcePermission.alwaysShow,
          isEnabled: sourcePermission.isEnabled,
          status: sourcePermission.status,
          createBy: actorId,
          updateBy: actorId,
          remark: "Cloned from platform permission seed"
        })
      );
      targetByCode.set(clone.code, clone);
    }
    return [...targetByCode.values()].sort((left, right) => left.level - right.level || left.sortNo - right.sortNo);
  }

  private async resolvePermissionSourceScope(manager: EntityManager, scope: TenantParkScope): Promise<TenantParkScope> {
    const permissionRepository = manager.getRepository(PermissionEntity);
    const scopedCount = await permissionRepository.count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (scopedCount > 0) {
      return scope;
    }
    return DEFAULT_SOURCE_SCOPE;
  }

  private async applyTenantAdminPermissions(
    manager: EntityManager,
    scope: TenantParkScope,
    role: RoleEntity,
    permissions: PermissionEntity[],
    moduleCodes: string[],
    requestedPermissionCodes: string[],
    actorId: string
  ): Promise<void> {
    const rolePermissionRepository = manager.getRepository(RolePermissionEntity);
    const selectedPermissions = this.selectPermissions(permissions, moduleCodes, requestedPermissionCodes);
    if (selectedPermissions.length === 0) {
      throw new BadRequestException("No permissions resolved for tenant administrator");
    }
    await rolePermissionRepository.update(
      { tenantId: scope.tenantId, parkId: scope.parkId, roleId: role.id, isDeleted: false },
      { isDeleted: true, updateBy: actorId }
    );
    await rolePermissionRepository.save(
      selectedPermissions.map((permission) =>
        rolePermissionRepository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          roleId: role.id,
          permissionId: permission.id,
          createBy: actorId,
          updateBy: actorId,
          remark: "Tenant package default permission"
        })
      )
    );
  }

  private selectPermissions(
    permissions: PermissionEntity[],
    moduleCodes: string[],
    requestedPermissionCodes: string[]
  ): PermissionEntity[] {
    const requested = this.normalizeCodes(requestedPermissionCodes);
    const requestedModuleCodes = requested
      .filter((code) => code.startsWith("module:"))
      .map((code) => code.replace(/^module:/, ""));
    const explicitPatterns = requested.filter((code) => !code.startsWith("module:"));
    const derivedCodes = this.derivePermissionCodes([...moduleCodes, ...requestedModuleCodes], permissions);
    const selectedCodes = new Set<string>(derivedCodes);
    for (const permission of permissions) {
      if (this.matchesAnyPattern(permission.code, explicitPatterns)) {
        selectedCodes.add(permission.code);
      }
    }
    selectedCodes.add("system:user:me");
    selectedCodes.add("system");

    const byCode = new Map(permissions.map((permission) => [permission.code, permission]));
    const byId = new Map(permissions.map((permission) => [permission.id, permission]));
    for (const code of [...selectedCodes]) {
      let current = byCode.get(code);
      while (current?.parentId) {
        const parent = byId.get(current.parentId);
        if (!parent) break;
        selectedCodes.add(parent.code);
        current = parent;
      }
    }
    return permissions.filter((permission) => selectedCodes.has(permission.code) && permission.isEnabled && !permission.isDeleted);
  }

  private derivePermissionCodes(moduleCodes: string[], permissions: PermissionEntity[]): string[] {
    const modules = new Set(this.normalizeCodes(moduleCodes));
    return permissions
      .filter((permission) => {
        const code = permission.code;
        if (modules.has("system") && this.isSystemFoundationPermission(code)) return true;
        if (modules.has("asset") && this.isAssetPermission(code)) return true;
        if (modules.has("leasing") && this.isLeasingPermission(code)) return true;
        if (modules.has("workorder") && (code === "workorder" || code === "workorder:center" || code === "wo:read")) return true;
        if (modules.has("iot") && (code === "iot" || code === "iot:overview" || code === "iot:read")) return true;
        if (modules.has("energy") && (code === "energy" || code === "energy:overview" || code === "energy:read")) return true;
        if (modules.has("robot") && (code === "robot" || code === "robot:overview" || code === "robot:read")) return true;
        if (modules.has("video") && (code === "video" || code === "video:overview" || code === "video:read")) return true;
        if (modules.has("bim") && (code === "bim" || code === "bim:overview" || code === "bim:read")) return true;
        if (modules.has("ai") && (code === "ai" || code === "ai:assistant" || code === "ai:read")) return true;
        return false;
      })
      .map((permission) => permission.code);
  }

  private isSystemFoundationPermission(code: string): boolean {
    return (
      code === "system" ||
      code.startsWith("system:org") ||
      code.startsWith("system:user") ||
      code.startsWith("system:role") ||
      code.startsWith("system:permission") ||
      code.startsWith("system:data-scope") ||
      code.startsWith("system:field-policy") ||
      code.startsWith("system:code-rule") ||
      code.startsWith("system:dict") ||
      code.startsWith("system:attachment") ||
      code.startsWith("system:file") ||
      code.startsWith("system:audit") ||
      code.startsWith("role:") ||
      code.startsWith("permission:") ||
      code.startsWith("data_scope:") ||
      code.startsWith("field_policy:") ||
      code.startsWith("code_rule:") ||
      code.startsWith("dict:") ||
      code.startsWith("file:") ||
      code.startsWith("audit:")
    );
  }

  private isAssetPermission(code: string): boolean {
    return (
      code === "asset" ||
      code.startsWith("asset:") ||
      code.startsWith("park:") ||
      code.startsWith("building:") ||
      code.startsWith("floor:") ||
      code.startsWith("unit:")
    );
  }

  private isLeasingPermission(code: string): boolean {
    return (
      code === "leasing" ||
      code.startsWith("leasing:") ||
      code.startsWith("leasing_") ||
      code.startsWith("park_tenant:") ||
      code.startsWith("park_tenant_contact:") ||
      code.startsWith("park_tenant_qualification:") ||
      code === "invest:read" ||
      code === "ar:read"
    );
  }

  private matchesAnyPattern(code: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      if (pattern.endsWith(":*")) return code.startsWith(pattern.slice(0, -1));
      if (pattern.endsWith("*")) return code.startsWith(pattern.slice(0, -1));
      return code === pattern;
    });
  }

  private async resolvePlan(manager: EntityManager, scope: TenantParkScope, planCode: string | null): Promise<PlanEntity | null> {
    if (!planCode) {
      return null;
    }
    const planRepository = manager.getRepository(PlanEntity);
    const scopedPlan = await planRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, planCode, status: "enabled", isDeleted: false }
    });
    if (scopedPlan) {
      return scopedPlan;
    }
    const globalPlan = await planRepository
      .createQueryBuilder("plan")
      .where("plan.planCode = :planCode", { planCode })
      .andWhere("plan.status = :status", { status: "enabled" })
      .andWhere("plan.isDeleted = false")
      .orderBy("plan.createTime", "ASC")
      .getOne();
    if (!globalPlan) {
      throw new NotFoundException("Plan not found");
    }
    return globalPlan;
  }

  private async resolveStandardModules(manager: EntityManager, moduleCodes: string[]): Promise<SaaSModuleEntity[]> {
    const codes = this.normalizeCodes(moduleCodes);
    if (codes.length === 0) {
      return [];
    }
    const moduleRepository = manager.getRepository(SaaSModuleEntity);
    const modules = await moduleRepository.find({
      where: { moduleCode: In(codes), isDeleted: false, status: 1 }
    });
    const foundCodes = new Set(modules.map((module) => module.moduleCode));
    const missingCodes = codes.filter((code) => !foundCodes.has(code));
    if (missingCodes.length > 0) {
      throw new NotFoundException(`Module not found: ${missingCodes.join(", ")}`);
    }
    return modules;
  }

  private async upsertTenantModules(
    manager: EntityManager,
    tenant: TenantEntity,
    parkId: string,
    modules: SaaSModuleEntity[],
    plan: PlanEntity | null,
    actorId: string,
    expireTime: Date | null,
    featureConfig: Record<string, unknown>
  ): Promise<void> {
    const tenantModuleRepository = manager.getRepository(TenantModuleEntity);
    const selectedModuleIds = new Set(modules.map((module) => module.id));
    const existing = await tenantModuleRepository.find({
      where: { tenantId: tenant.tenantId, parkId, isDeleted: false }
    });
    for (const item of existing) {
      if (!selectedModuleIds.has(item.moduleId)) {
        item.enabled = false;
        item.status = "disabled";
        item.updateBy = actorId;
        await tenantModuleRepository.save(item);
      }
    }
    for (const module of modules) {
      const entity =
        existing.find((item) => item.moduleId === module.id) ??
        tenantModuleRepository.create({
          tenantId: tenant.tenantId,
          parkId,
          moduleId: module.id,
          createBy: actorId
        });
      Object.assign(entity, {
        tenantCode: tenant.tenantCode,
        planId: plan?.id ?? entity.planId ?? null,
        startTime: entity.startTime ?? new Date(),
        expireTime,
        enabled: true,
        featureConfig,
        status: "enabled",
        updateBy: actorId,
        remark: "Tenant package module authorization"
      });
      await tenantModuleRepository.save(entity);
    }
  }

  private async resolveDefaultParkId(manager: EntityManager, tenantId: string): Promise<string> {
    const park = await manager.getRepository(ParkEntity).findOne({
      where: { tenantId, isDeleted: false },
      order: { createTime: "ASC" }
    });
    if (!park) {
      throw new NotFoundException("Tenant default park not found");
    }
    return park.parkId;
  }

  private async toView(tenant: TenantEntity, manager?: EntityManager): Promise<TenantView> {
    const entityManager = manager ?? this.dataSource.manager;
    const [userCount, parkCount, enabledModuleCount] = await Promise.all([
      entityManager.getRepository(UserEntity).count({ where: { tenantId: tenant.tenantId, isDeleted: false } }),
      entityManager.getRepository(ParkEntity).count({ where: { tenantId: tenant.tenantId, isDeleted: false } }),
      entityManager.getRepository(TenantModuleEntity).count({
        where: { tenantId: tenant.tenantId, isDeleted: false, enabled: true, status: "enabled" }
      })
    ]);
    return {
      id: tenant.id,
      tenantId: tenant.tenantId,
      parkId: tenant.parkId,
      tenantCode: tenant.tenantCode,
      tenantName: tenant.tenantName,
      tenantType: tenant.tenantType,
      contactName: tenant.contactName,
      contactMobile: tenant.contactMobile,
      contactUserId: tenant.contactUserId,
      websites: tenant.websites ?? [],
      domains: tenant.domains ?? [],
      status: tenant.status,
      statusName: this.toStatusName(tenant),
      expireTime: tenant.expireTime,
      maxUsers: tenant.maxUsers,
      maxParks: tenant.maxParks,
      planCode: tenant.planCode,
      featureConfig: tenant.featureConfig ?? {},
      userCount,
      parkCount,
      enabledModuleCount,
      createTime: tenant.createTime,
      updateTime: tenant.updateTime,
      remark: tenant.remark
    };
  }

  private assertSuper(actor: JwtPrincipal): void {
    if (!actor.isSuper && !actor.permissions.includes("*")) {
      throw new ForbiddenException("Only super administrator can access tenant management");
    }
  }

  private async assertTenantCodeAvailable(repository: Repository<TenantEntity>, tenantCode: string, excludeId?: string): Promise<void> {
    const builder = repository
      .createQueryBuilder("tenant")
      .where("tenant.tenantCode = :tenantCode", { tenantCode })
      .andWhere("tenant.isDeleted = false");
    if (excludeId) builder.andWhere("tenant.id <> :excludeId", { excludeId });
    if (await builder.getExists()) {
      throw new ConflictException("Tenant code already exists");
    }
  }

  private async assertTenantIdAvailable(repository: Repository<TenantEntity>, tenantId: string): Promise<void> {
    if (await repository.exists({ where: { tenantId, isDeleted: false } })) {
      throw new ConflictException("Tenant id already exists");
    }
  }

  private async assertParkIdAvailable(repository: Repository<ParkEntity>, parkId: string): Promise<void> {
    if (await repository.exists({ where: { parkId, isDeleted: false } })) {
      throw new ConflictException("Park id already exists");
    }
  }

  private async assertParkCodeAvailable(repository: Repository<ParkEntity>, parkCode: string): Promise<void> {
    if (await repository.exists({ where: { parkCode, isDeleted: false } })) {
      throw new ConflictException("Park code already exists");
    }
  }

  private async generateScopeId(repository: Repository<TenantEntity>, prefix: string, field: "tenantId" | "parkId"): Promise<string> {
    for (let index = 0; index < 10; index += 1) {
      const value = `${prefix}${randomInt(1000000, 9999999)}`;
      const exists = await repository.exists({ where: { [field]: value, isDeleted: false } });
      if (!exists) return value;
    }
    throw new ConflictException("Unable to generate unique scope id");
  }

  private toStatusNumber(status: string | number): number {
    if (status === "enabled") return 1;
    if (status === "expired") return 2;
    if (status === "disabled") return 0;
    return Number(status);
  }

  private toStatusName(tenant: TenantEntity): string {
    if (tenant.status === 0) return "disabled";
    if (tenant.status === 2 || (tenant.expireTime && tenant.expireTime.getTime() <= Date.now())) return "expired";
    return "enabled";
  }

  private normalizeCodes(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private normalizeStringArray(values?: string[] | null): string[] {
    return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  }

  private emptyToNull(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
