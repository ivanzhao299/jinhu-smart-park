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
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import { DEFAULT_PLATFORM_SCOPE } from "../../shared/constants/platform-scope";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  assetScopeLockKey,
  ensureAssetScopeProvisioned,
  hasCanonicalActiveAssetParkSource,
  lockAssetScope
} from "../assets/asset-scope-provisioning";
import { OrgEntity } from "../orgs/entities/org.entity";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { ParkEntity } from "../parks/entities/park.entity";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { RolePermissionEntity } from "../permissions/entities/role-permission.entity";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { PlanEntity } from "../saas-modules/entities/plan.entity";
import { SaaSModuleEntity } from "../saas-modules/entities/saas-module.entity";
import {
  PARK_RECOVERY_SYSTEM_FEATURE,
  PARK_RECOVERY_SYSTEM_SNAPSHOT_FEATURE,
  PARK_STATUS_SUSPENDED_FEATURE,
  TenantModuleEntity
} from "../saas-modules/entities/tenant-module.entity";
import { UserEntity } from "../users/entities/user.entity";
import { UserParkEntity } from "../users/entities/user-park.entity";
import {
  FilesService,
  TENANT_BRAND_LOGO_BIZ_TYPE,
  type UploadedFilePayload
} from "../files/files.service";
import type { MultipartFileMetadataDto } from "../files/dto/upload-file.dto";
import type { CreateTenantDto } from "./dto/create-tenant.dto";
import type { CreateParkDto } from "../parks/dto/create-park.dto";
import { ensureCodeRuleScopeProvisioned } from "../code-rules/code-rule-scope-provisioning";
import { DictTypeEntity } from "../dicts/entities/dict-type.entity";
import type { UpdateTenantBrandingDto } from "./dto/update-tenant-branding.dto";
import type { UpdateTenantLoginSettingsDto } from "./dto/update-tenant-login-settings.dto";
import type { UpdateTenantModulesDto } from "./dto/update-tenant-modules.dto";
import type { UpdateTenantDto } from "./dto/update-tenant.dto";
import { TenantEntity } from "./entities/tenant.entity";
import {
  normalizeTenantBranding,
  tenantMatchesBrandingHost,
  type TenantBrandingView
} from "./tenant-branding";

const DEFAULT_TENANT_CODE = "JH_DEFAULT";
const TENANT_ADMIN_ROLE_CODE = "TENANT_ADMIN";

export function preferActiveTenantParkRows(parks: ParkEntity[]): ParkEntity[] {
  const byParkId = new Map<string, ParkEntity>();
  for (const park of parks) {
    const existing = byParkId.get(park.parkId);
    if (!existing || (existing.status !== 1 && park.status === 1)) {
      byParkId.set(park.parkId, park);
    }
  }
  return [...byParkId.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
  defaultParkId: string | null;
  expireWarning: string | null;
  featureConfig: Record<string, unknown>;
  userCount: number;
  parkCount: number;
  enabledModuleCount: number;
  createTime: Date;
  updateTime: Date;
  remark: string | null;
}

export interface TenantParkOption {
  id: string;
  tenantId: string;
  parkId: string;
  parkCode: string;
  parkName: string;
  status: number;
}

export interface TenantLoginSettingsView {
  tenant: TenantView;
  parks: TenantParkOption[];
  enabledModuleCodes: string[];
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepository: Repository<TenantEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly filesService: FilesService
  ) {}

  async current(scope: TenantParkScope): Promise<TenantView> {
    const tenant =
      (await this.tenantRepository.findOne({ where: { tenantId: scope.tenantId, isDeleted: false } })) ??
      (await this.tenantRepository.findOne({ where: { tenantCode: DEFAULT_TENANT_CODE, isDeleted: false } }));
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    return this.toView(tenant);
  }

  async publicBranding(host?: string): Promise<TenantBrandingView> {
    const tenants = await this.tenantRepository.find({
      where: { isDeleted: false, status: 1 },
      order: { createTime: "ASC" }
    });
    const tenant =
      tenants.find((item) => tenantMatchesBrandingHost(host ?? "", item.domains, item.websites)) ??
      tenants.find((item) => item.tenantId === DEFAULT_PLATFORM_SCOPE.tenantId) ??
      tenants.find((item) => item.tenantCode === DEFAULT_TENANT_CODE) ??
      tenants[0];
    return normalizeTenantBranding(tenant?.featureConfig?.branding);
  }

  async currentBranding(scope: TenantParkScope): Promise<TenantBrandingView> {
    const tenant = await this.getTenantByScope(scope);
    return normalizeTenantBranding(tenant.featureConfig?.branding);
  }

  async updateBranding(
    scope: TenantParkScope,
    actorId: string,
    dto: UpdateTenantBrandingDto
  ): Promise<TenantBrandingView> {
    const tenant = await this.getTenantByScope(scope);
    const branding = normalizeTenantBranding({
      ...(isRecord(tenant.featureConfig?.branding) ? tenant.featureConfig.branding : {}),
      ...dto
    });
    if (branding.logoFileId) {
      await this.filesService.assertBrandLogoReference(scope, branding.logoFileId);
    }
    tenant.featureConfig = {
      ...(tenant.featureConfig ?? {}),
      branding: {
        systemName: branding.systemName,
        shortName: branding.shortName,
        logoAlt: branding.logoAlt,
        logoFileId: branding.logoFileId
      }
    };
    tenant.updateBy = actorId;
    await this.tenantRepository.save(tenant);
    return branding;
  }

  uploadBrandLogo(
    scope: TenantParkScope,
    actorId: string,
    file?: UploadedFilePayload,
    metadata: MultipartFileMetadataDto = {}
  ) {
    return this.filesService.upload(
      scope,
      actorId,
      { biz_type: TENANT_BRAND_LOGO_BIZ_TYPE, ...metadata },
      file
    );
  }

  async assertTenantActive(tenantId: string): Promise<TenantEntity> {
    const tenant = await this.tenantRepository.findOne({ where: { tenantId, isDeleted: false } });
    if (!tenant) {
      throw new UnauthorizedException("账号所属租户不存在，请联系管理员");
    }
    if (tenant.status === 0) {
      throw new UnauthorizedException("账号所属租户已停用，请联系管理员");
    }
    if (tenant.status === 2 || (tenant.expireTime && tenant.expireTime.getTime() <= Date.now())) {
      throw new UnauthorizedException("账号所属租户已过期，请联系管理员续费");
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

  async loginSettings(actor: JwtPrincipal, id: string): Promise<TenantLoginSettingsView> {
    this.assertSuper(actor);
    const tenant = await this.getTenantById(id);
    return this.toLoginSettingsView(this.dataSource.manager, tenant);
  }

  private async toLoginSettingsView(manager: EntityManager, tenant: TenantEntity): Promise<TenantLoginSettingsView> {
    const [parks, modules] = await Promise.all([
      manager.getRepository(ParkEntity).find({
        where: { tenantId: tenant.tenantId, isDeleted: false },
        order: { createTime: "ASC" }
      }),
      manager.getRepository(TenantModuleEntity).find({
        where: { tenantId: tenant.tenantId, isDeleted: false },
        relations: { module: true },
        order: { createTime: "ASC" }
      })
    ]);
    return {
      tenant: await this.toView(tenant, manager),
      parks: parks.map((park) => ({
        id: park.id,
        tenantId: park.tenantId,
        parkId: park.parkId,
        parkCode: park.parkCode,
        parkName: park.parkName,
        status: park.status
      })),
      enabledModuleCodes: this.resolveSelectedModuleCodes(modules)
    };
  }

  private resolveSelectedModuleCodes(modules: TenantModuleEntity[]): string[] {
    return [...new Set(modules.flatMap((item) => {
      const code = item.module?.moduleCode;
      if (!code) return [];
      const explicitlyEnabled = item.enabled
        && item.status === "enabled"
        && item.featureConfig?.[PARK_RECOVERY_SYSTEM_FEATURE] !== true;
      const suspendedSelection = code === "asset"
        && item.featureConfig?.[PARK_STATUS_SUSPENDED_FEATURE] === true
        && this.isTenantModuleWindowRecoverable(item);
      const recoverySnapshot = item.featureConfig?.[PARK_RECOVERY_SYSTEM_SNAPSHOT_FEATURE] !== undefined
        ? this.resolveRecoverySystemSnapshot(item.featureConfig)
        : null;
      const scheduledRecoverySelection = code === "system"
        && item.featureConfig?.[PARK_RECOVERY_SYSTEM_FEATURE] === true
        && recoverySnapshot?.enabled === true
        && recoverySnapshot.status === "enabled";
      return explicitlyEnabled || suspendedSelection || scheduledRecoverySelection ? [code] : [];
    }))];
  }

  async create(actorScope: TenantParkScope, actorId: string, actor: JwtPrincipal, dto: CreateTenantDto): Promise<TenantView> {
    this.assertSuper(actor);
    return this.dataSource.transaction(async (manager) => {
      const tenantRepository = manager.getRepository(TenantEntity);
      const tenantCode = dto.tenantCode.trim();
      await this.assertTenantCodeAvailable(tenantRepository, tenantCode);

      const tenantId = dto.tenantId?.trim() || (await this.generateScopeId(tenantRepository, "1", "tenantId"));
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["biz-park-scope-id-allocation"]);
      const parkId = dto.parkId?.trim() || (await this.generateScopeId(tenantRepository, "2", "parkId"));
      await this.assertTenantIdAvailable(tenantRepository, tenantId);
      await this.assertParkIdAvailable(manager.getRepository(ParkEntity), parkId);

      const plan = await this.resolvePlan(manager, actorScope, dto.planCode ?? null);
      const moduleCodes = this.normalizeCodes(dto.moduleCodes?.length ? dto.moduleCodes : plan?.moduleCodes ?? []);
      if (moduleCodes.length === 0) {
        throw new BadRequestException("Plan code or module codes are required");
      }
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
      await this.ensureTenantDictionaries(manager, actorScope, { tenantId, parkId: park.parkId }, actorId);
      const permissions = await this.ensureTenantPermissions(manager, actorScope, { tenantId, parkId: park.parkId }, actorId);
      const modules = await this.resolveStandardModules(manager, moduleCodes);
      await this.upsertTenantModules(manager, tenant, park.parkId, modules, plan, actorId, expireTime, dto.featureConfig ?? {});
      await ensureCodeRuleScopeProvisioned(manager, { tenantId, parkId: park.parkId }, actorId);
      await this.ensureAssetScopeProvisioning(manager, { tenantId, parkId: park.parkId }, moduleCodes, actorId);
      const role = await this.createTenantAdminRole(manager, tenant, park.parkId, actorId);
      await this.applyTenantAdminPermissions(
        manager,
        { tenantId, parkId: park.parkId },
        role,
        permissions,
        moduleCodes,
        this.permissionCodesForModules(
          dto.permissionCodes?.length ? dto.permissionCodes : plan?.permissionCodes ?? [],
          moduleCodes
        ),
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

  async provisionAdditionalPark(
    manager: EntityManager,
    sourceScope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateParkDto
  ): Promise<ParkEntity> {
    if (actor.tenantId !== sourceScope.tenantId) {
      throw new ForbiddenException("Cannot create a park outside the current tenant");
    }
    const tenant = await manager.getRepository(TenantEntity).findOne({
      where: { tenantId: sourceScope.tenantId, isDeleted: false }
    });
    if (!tenant) throw new NotFoundException("Tenant not found");

    const actorRoleCodes = new Set(actor.roles);
    if (!actor.isSuper && !actor.permissions.includes("*") && !actorRoleCodes.has(TENANT_ADMIN_ROLE_CODE)) {
      throw new ForbiddenException("Only tenant administrator can create a new park scope");
    }
    if ((dto.status ?? 1) !== 1) {
      throw new BadRequestException("Additional park must be active when created");
    }

    const parkRepository = manager.getRepository(ParkEntity);
    await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["biz-park-scope-id-allocation"]);
    const parkId = await this.generateParkScopeId(parkRepository);
    const targetScope = { tenantId: tenant.tenantId, parkId };
    await lockAssetScope(manager, targetScope);
    const park = await parkRepository.save(parkRepository.create({
      tenantId: sourceScope.tenantId,
      parkId,
      parkCode: dto.parkCode.trim(),
      parkName: dto.parkName.trim(),
      address: this.emptyToNull(dto.address),
      province: this.emptyToNull(dto.province),
      city: this.emptyToNull(dto.city),
      district: this.emptyToNull(dto.district),
      lng: dto.lng === undefined ? null : String(dto.lng),
      lat: dto.lat === undefined ? null : String(dto.lat),
      totalArea: dto.totalArea === undefined ? "0" : String(dto.totalArea),
      landArea: dto.landArea === undefined ? "0" : String(dto.landArea),
      status: dto.status ?? 1,
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    }));

    const rootOrg = await this.createRootOrg(manager, tenant, parkId, actor.sub, {
      parkName: dto.parkName
    } as CreateTenantDto);
    const sourceAssignments = await manager.getRepository(TenantModuleEntity).find({
      where: { tenantId: sourceScope.tenantId, parkId: sourceScope.parkId, isDeleted: false },
      relations: { module: true, plan: true }
    });
    const moduleCodes = this.resolveSelectedModuleCodes(sourceAssignments);
    if (moduleCodes.length === 0) {
      throw new BadRequestException("Current park has no modules available for provisioning");
    }
    const modules = await this.resolveStandardModules(manager, moduleCodes);
    await this.cloneTenantParkModules(manager, tenant, parkId, sourceAssignments, modules, actor.sub);

    await this.ensureTenantDictionaries(manager, sourceScope, targetScope, actor.sub);
    await ensureCodeRuleScopeProvisioned(manager, targetScope, actor.sub);
    await this.ensureAssetScopeProvisioning(manager, targetScope, moduleCodes, actor.sub);
    const permissions = await this.ensureTenantPermissions(manager, sourceScope, targetScope, actor.sub);
    const role = await this.getOrCreateTenantAdminRole(manager, tenant, parkId, actor.sub);
    await this.applyTenantAdminPermissions(
      manager,
      targetScope,
      role,
      permissions,
      moduleCodes,
      this.permissionCodesForModules([], moduleCodes),
      actor.sub
    );

    const sourceUser = await manager.getRepository(UserEntity).findOne({
      where: { id: actor.sub, tenantId: tenant.tenantId, isDeleted: false }
    });
    if (!sourceUser) throw new ForbiddenException("Tenant administrator identity not found in current park");
    const sourceAccess = await manager.getRepository(UserParkEntity).exists({
      where: { userId: actor.sub, tenantId: tenant.tenantId, parkId: sourceScope.parkId, status: "enabled", isDeleted: false }
    });
    if (sourceUser.parkId !== sourceScope.parkId && !sourceAccess) {
      throw new ForbiddenException("Tenant administrator identity not found in current park");
    }
    await this.bindAdditionalTenantAdmin(manager, tenant, parkId, rootOrg.id, role.id, sourceUser.id, actor.sub);
    return park;
  }

  async update(actor: JwtPrincipal, actorId: string, id: string, dto: UpdateTenantDto): Promise<TenantView> {
    this.assertSuper(actor);
    return this.dataSource.transaction(async (manager) => {
      const tenantRepository = manager.getRepository(TenantEntity);
      const tenant = await tenantRepository.findOne({ where: { id, isDeleted: false } });
      if (!tenant) {
        throw new NotFoundException("Tenant not found");
      }
      const wasRuntimeActive = this.isTenantRuntimeActive(tenant);
      if (dto.tenantCode && dto.tenantCode !== tenant.tenantCode) {
        await this.assertTenantCodeAvailable(tenantRepository, dto.tenantCode, id);
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
      const reactivatingRuntime = !wasRuntimeActive && this.isTenantRuntimeActive(tenant);
      if (dto.expireTime !== undefined || reactivatingRuntime) {
        await this.lockTenantModuleScopes(manager, tenant.tenantId);
      }
      await tenantRepository.save(tenant);
      if (dto.expireTime !== undefined) {
        await manager.getRepository(TenantModuleEntity).update(
          { tenantId: tenant.tenantId, isDeleted: false },
          { expireTime: tenant.expireTime, updateBy: actorId }
        );
        await this.synchronizeRecoverySnapshotExpiry(manager, tenant.tenantId, tenant.expireTime, actorId);
      }
      if (reactivatingRuntime) {
        await this.reconcileActiveTenantAssetScopes(manager, tenant, actorId);
      }
      return this.toView(tenant, manager);
    });
  }

  async updateLoginSettings(
    actorScope: TenantParkScope,
    actorId: string,
    actor: JwtPrincipal,
    id: string,
    dto: UpdateTenantLoginSettingsDto
  ): Promise<TenantLoginSettingsView> {
    this.assertSuper(actor);
    return this.dataSource.transaction(async (manager) => {
      const tenantRepository = manager.getRepository(TenantEntity);
      const tenant = await tenantRepository.findOne({ where: { id, isDeleted: false } });
      if (!tenant) {
        throw new NotFoundException("Tenant not found");
      }
      const wasRuntimeActive = this.isTenantRuntimeActive(tenant);
      const configuredDefaultParkId = typeof tenant.featureConfig?.defaultParkId === "string"
        ? tenant.featureConfig.defaultParkId
        : null;
      const defaultParkId = dto.defaultParkId === undefined
        ? configuredDefaultParkId
        : dto.defaultParkId?.trim() || null;
      if (dto.defaultParkId !== undefined && defaultParkId) {
        await this.assertParkBelongsToTenant(manager, tenant.tenantId, defaultParkId);
      }
      if (dto.status !== undefined) {
        tenant.status = this.toStatusNumber(dto.status);
      }
      if (dto.expireTime !== undefined) {
        tenant.expireTime = dto.expireTime ? new Date(dto.expireTime) : null;
      }
      tenant.featureConfig = {
        ...(tenant.featureConfig ?? {}),
        ...(dto.featureConfig ?? {}),
        defaultParkId
      };
      tenant.updateBy = actorId;
      const reactivatingRuntime = !wasRuntimeActive && this.isTenantRuntimeActive(tenant);
      const authorizationChanged = dto.planCode !== undefined || dto.moduleCodes !== undefined;
      const tenantParks = authorizationChanged
        ? await manager.getRepository(ParkEntity).find({
          where: { tenantId: tenant.tenantId, isDeleted: false },
          order: { createTime: "ASC" }
        })
        : [];
      const assignmentRows = dto.expireTime !== undefined || reactivatingRuntime
        ? await manager.getRepository(TenantModuleEntity).find({
          where: { tenantId: tenant.tenantId, isDeleted: false },
          select: { parkId: true }
        })
        : [];
      const lockParkIds = new Set([
        ...tenantParks.map((park) => park.parkId),
        ...assignmentRows.map((assignment) => assignment.parkId)
      ]);
      const lockedScopes = [...lockParkIds]
        .map((parkId) => ({ tenantId: tenant.tenantId, parkId }))
        .sort((left, right) => assetScopeLockKey(left).localeCompare(assetScopeLockKey(right)));
      for (const scope of lockedScopes) {
        await lockAssetScope(manager, scope);
      }
      if (authorizationChanged) {
        const requestedPlanCode = dto.planCode === undefined ? tenant.planCode : dto.planCode;
        const plan = dto.planCode === undefined ? null : await this.resolvePlan(manager, actorScope, requestedPlanCode);
        const moduleCodes = this.normalizeCodes(dto.moduleCodes === undefined ? plan?.moduleCodes ?? [] : dto.moduleCodes);
        if (moduleCodes.length === 0) {
          throw new BadRequestException("Plan code or module codes are required");
        }
        const uniqueTenantParks = preferActiveTenantParkRows(tenantParks);
        const orderedTenantParks = [...uniqueTenantParks].sort((left, right) =>
          assetScopeLockKey({ tenantId: tenant.tenantId, parkId: left.parkId })
            .localeCompare(assetScopeLockKey({ tenantId: tenant.tenantId, parkId: right.parkId }))
        );
        const activeParkIds = new Set<string>();
        for (const park of orderedTenantParks) {
          const scope = { tenantId: tenant.tenantId, parkId: park.parkId };
          if (await hasCanonicalActiveAssetParkSource(manager, scope)) {
            activeParkIds.add(park.parkId);
          }
        }
        const activeTenantParks = uniqueTenantParks.filter((park) => activeParkIds.has(park.parkId));
        const firstAuthorizationPark = activeTenantParks[0] ?? uniqueTenantParks[0];
        if (!firstAuthorizationPark) {
          throw new NotFoundException("Tenant park not found");
        }
        const resolvedModuleCodes = activeTenantParks.length === uniqueTenantParks.length
          ? moduleCodes
          : this.normalizeCodes([...moduleCodes, "system"]);
        const modules = await this.resolveStandardModules(manager, resolvedModuleCodes);
        const retainedDefaultParkIsActive = activeTenantParks.some((park) => park.parkId === configuredDefaultParkId);
        const authorizationParkId = dto.defaultParkId === undefined && !retainedDefaultParkIsActive
          ? firstAuthorizationPark.parkId
          : defaultParkId ?? firstAuthorizationPark.parkId;
        const authorizationScope = { tenantId: tenant.tenantId, parkId: authorizationParkId };
        const permissions = await this.ensureTenantPermissions(manager, actorScope, authorizationScope, actorId);
        const role = await this.getOrCreateTenantAdminRole(manager, tenant, authorizationParkId, actorId);
        for (const park of orderedTenantParks) {
          const targetScope = { tenantId: tenant.tenantId, parkId: park.parkId };
          const parkActive = activeParkIds.has(park.parkId);
          const parkModuleCodes = parkActive
            ? moduleCodes
            : this.normalizeCodes([...moduleCodes.filter((code) => code !== "asset"), "system"]);
          const authorizationModuleCodes = !parkActive && !moduleCodes.includes("system")
            ? parkModuleCodes.filter((code) => code !== "system")
            : parkModuleCodes;
          const parkModules = parkActive
            ? modules.filter((module) => moduleCodes.includes(module.moduleCode))
            : modules.filter((module) => module.moduleCode !== "asset" || moduleCodes.includes("asset"));
          const parkPermissionCodes = this.permissionCodesForModules(plan?.permissionCodes ?? [], authorizationModuleCodes);
          if (!parkActive) {
            parkPermissionCodes.push(SYSTEM_PERMISSIONS.PARK_READ, SYSTEM_PERMISSIONS.PARK_UPDATE);
          }
          await this.upsertTenantModules(
            manager,
            tenant,
            park.parkId,
            parkModules,
            plan,
            actorId,
            tenant.expireTime,
            tenant.featureConfig ?? {},
            parkActive ? new Set<string>() : new Set(["asset"]),
            !parkActive && !moduleCodes.includes("system") ? new Set(["system"]) : new Set<string>()
          );
          await ensureCodeRuleScopeProvisioned(manager, targetScope, actorId);
          if (parkActive) {
            await this.ensureAssetScopeProvisioning(manager, targetScope, moduleCodes, actorId);
          }
          await this.applyTenantAdminPermissions(
            manager,
            targetScope,
            role,
            permissions,
            authorizationModuleCodes,
            parkPermissionCodes,
            actorId
          );
        }
        if (dto.planCode !== undefined) {
          tenant.planCode = plan?.planCode ?? requestedPlanCode ?? null;
          tenant.maxUsers = plan?.maxUsers ?? tenant.maxUsers;
          tenant.maxParks = plan?.maxParks ?? tenant.maxParks;
        }
      }
      if (dto.expireTime !== undefined) {
        await manager.getRepository(TenantModuleEntity).update(
          { tenantId: tenant.tenantId, isDeleted: false },
          { expireTime: tenant.expireTime, updateBy: actorId }
        );
        await this.synchronizeRecoverySnapshotExpiry(manager, tenant.tenantId, tenant.expireTime, actorId);
      }

      await tenantRepository.save(tenant);
      if (reactivatingRuntime) {
        await this.reconcileActiveTenantAssetScopes(manager, tenant, actorId);
      }

      return this.toLoginSettingsView(manager, tenant);
    });
  }

  async enable(actor: JwtPrincipal, actorId: string, id: string): Promise<TenantView> {
    this.assertSuper(actor);
    return this.dataSource.transaction(async (manager) => {
      const tenantRepository = manager.getRepository(TenantEntity);
      const tenant = await tenantRepository.findOne({ where: { id, isDeleted: false } });
      if (!tenant) {
        throw new NotFoundException("Tenant not found");
      }
      await this.lockTenantModuleScopes(manager, tenant.tenantId);
      tenant.status = 1;
      tenant.updateBy = actorId;
      await tenantRepository.save(tenant);
      if (this.isTenantRuntimeActive(tenant)) {
        await this.reconcileActiveTenantAssetScopes(manager, tenant, actorId);
      }
      return this.toView(tenant, manager);
    });
  }

  private isTenantRuntimeActive(tenant: TenantEntity, now = Date.now()): boolean {
    return tenant.status === 1 && (!tenant.expireTime || tenant.expireTime.getTime() > now);
  }

  private async lockTenantModuleScopes(manager: EntityManager, tenantId: string): Promise<void> {
    const assignmentRows = await manager.getRepository(TenantModuleEntity).find({
      where: { tenantId, isDeleted: false },
      select: { parkId: true }
    });
    const scopes = [...new Set(assignmentRows.map((assignment) => assignment.parkId))]
      .map((parkId) => ({ tenantId, parkId }))
      .sort((left, right) => assetScopeLockKey(left).localeCompare(assetScopeLockKey(right)));
    for (const scope of scopes) {
      await lockAssetScope(manager, scope);
    }
  }

  private async reconcileActiveTenantAssetScopes(
    manager: EntityManager,
    tenant: TenantEntity,
    actorId: string
  ): Promise<void> {
    const assignmentRepository = manager.getRepository(TenantModuleEntity);
    const assignments = await assignmentRepository.find({
      where: { tenantId: tenant.tenantId, isDeleted: false },
      relations: { module: true }
    });
    const scopes = [...new Set(assignments.map((assignment) => assignment.parkId))]
      .map((parkId) => ({ tenantId: tenant.tenantId, parkId }))
      .sort((left, right) => assetScopeLockKey(left).localeCompare(assetScopeLockKey(right)));
    for (const scope of scopes) {
      await lockAssetScope(manager, scope);
    }
    for (const scope of scopes) {
      try {
        if (!await hasCanonicalActiveAssetParkSource(manager, scope)) continue;
      } catch (error) {
        if (error instanceof NotFoundException) {
          const retiredParkExists = await manager.getRepository(ParkEntity).exists({
            where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: true }
          });
          if (retiredParkExists) continue;
        }
        throw error;
      }
      await this.reconcileReactivatedParkAuthorization(manager, scope, actorId);
      await ensureCodeRuleScopeProvisioned(manager, scope, actorId);
      const refreshedAssignments = await assignmentRepository.find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        relations: { module: true }
      });
      const recoverableAsset = refreshedAssignments.find((assignment) =>
        assignment.module?.moduleCode === "asset"
        && assignment.module.status === 1
        && !assignment.module.isDeleted
        && assignment.enabled
        && assignment.status === "enabled"
        && this.isTenantModuleWindowRecoverable(assignment)
      );
      if (recoverableAsset) {
        await ensureAssetScopeProvisioned(manager, scope, actorId);
      }
    }
  }

  async reconcileReactivatedParkAuthorization(
    manager: EntityManager,
    scope: TenantParkScope,
    actorId: string
  ): Promise<void> {
    const tenant = await manager.getRepository(TenantEntity).findOne({
      where: { tenantId: scope.tenantId, isDeleted: false }
    });
    if (!tenant || !this.isTenantRuntimeActive(tenant)) {
      return;
    }
    const assignments = await manager.getRepository(TenantModuleEntity).find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      relations: { module: true, plan: true }
    });
    const suspendedAsset = assignments.find((assignment) =>
      assignment.module?.moduleCode === "asset"
      && assignment.module.status === 1
      && !assignment.module.isDeleted
      && this.isTenantModuleWindowRecoverable(assignment)
      && assignment.featureConfig?.[PARK_STATUS_SUSPENDED_FEATURE] === true
    );
    const recoverySystem = assignments.find((assignment) =>
      assignment.module?.moduleCode === "system"
      && assignment.module.status === 1
      && !assignment.module.isDeleted
      && assignment.featureConfig?.[PARK_RECOVERY_SYSTEM_FEATURE] === true
    );
    const assignmentRepository = manager.getRepository(TenantModuleEntity);
    if (suspendedAsset) {
      suspendedAsset.enabled = true;
      suspendedAsset.status = "enabled";
      suspendedAsset.featureConfig = this.withParkStatusSuspension(suspendedAsset.featureConfig, false);
      suspendedAsset.updateBy = actorId;
      await assignmentRepository.save(suspendedAsset);
    }
    if (recoverySystem) {
      const snapshot = this.resolveRecoverySystemSnapshot(recoverySystem.featureConfig);
      recoverySystem.enabled = snapshot?.enabled ?? false;
      recoverySystem.status = snapshot?.status ?? "disabled";
      recoverySystem.startTime = snapshot ? this.restoreSnapshotDate(snapshot.startTime) : recoverySystem.startTime;
      recoverySystem.expireTime = snapshot ? this.restoreSnapshotDate(snapshot.expireTime) : recoverySystem.expireTime;
      recoverySystem.featureConfig = this.withRecoverySystemMarker(recoverySystem.featureConfig, false);
      recoverySystem.updateBy = actorId;
      await assignmentRepository.save(recoverySystem);
    }

    await this.reconcileCurrentTenantAdminPermissions(manager, scope, actorId);
  }

  async reconcileCurrentTenantAdminPermissions(
    manager: EntityManager,
    scope: TenantParkScope,
    actorId: string,
    preserveParkRecoveryGrants = false
  ): Promise<void> {
    const tenant = await manager.getRepository(TenantEntity).findOne({
      where: { tenantId: scope.tenantId, isDeleted: false }
    });
    if (!tenant || !this.isTenantRuntimeActive(tenant)) return;
    const assignments = await manager.getRepository(TenantModuleEntity).find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      relations: { module: true, plan: true }
    });
    const selectedAssignments = assignments.filter((assignment) =>
      assignment.module
      && assignment.module.status === 1
      && !assignment.module.isDeleted
      && this.isTenantModuleWindowActive(assignment)
      && assignment.enabled
      && assignment.status === "enabled"
      && assignment.featureConfig?.[PARK_RECOVERY_SYSTEM_FEATURE] !== true
    );
    const moduleCodes = this.normalizeCodes(selectedAssignments.map((assignment) => assignment.module!.moduleCode));

    const permissions = await manager.getRepository(PermissionEntity).find({
      where: { tenantId: scope.tenantId, isDeleted: false },
      order: { level: "ASC", sortNo: "ASC", createTime: "ASC" }
    });
    if (permissions.length === 0) {
      throw new BadRequestException("Permission seed source is empty");
    }
    const role = await this.getOrCreateTenantAdminRole(manager, tenant, scope.parkId, actorId);
    const permissionCodes = this.permissionCodesForModules(
      this.assignmentPermissionPatterns(selectedAssignments),
      moduleCodes
    );
    if (preserveParkRecoveryGrants) {
      permissionCodes.push(SYSTEM_PERMISSIONS.PARK_READ, SYSTEM_PERMISSIONS.PARK_UPDATE);
    }
    await this.applyTenantAdminPermissions(
      manager,
      scope,
      role,
      permissions,
      moduleCodes,
      permissionCodes,
      actorId
    );
    await this.ensureAssetScopeProvisioning(manager, scope, moduleCodes, actorId);
  }

  async reconcileDeactivatedParkAuthorization(
    manager: EntityManager,
    scope: TenantParkScope,
    actorId: string
  ): Promise<void> {
    const tenant = await manager.getRepository(TenantEntity).findOne({
      where: { tenantId: scope.tenantId, isDeleted: false }
    });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    const assignmentRepository = manager.getRepository(TenantModuleEntity);
    const assignments = await assignmentRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      relations: { module: true, plan: true }
    });
    const assetAssignment = assignments.find((assignment) =>
      assignment.module?.moduleCode === "asset" && assignment.enabled && assignment.status === "enabled"
    );
    if (assetAssignment) {
      assetAssignment.enabled = false;
      assetAssignment.status = "disabled";
      assetAssignment.featureConfig = this.withParkStatusSuspension(assetAssignment.featureConfig, true);
      assetAssignment.updateBy = actorId;
      await assignmentRepository.save(assetAssignment);
    }
    const systemModule = await manager.getRepository(SaaSModuleEntity).findOne({
      where: { moduleCode: "system", status: 1, isDeleted: false }
    });
    if (!systemModule) {
      throw new NotFoundException("Module not found: system");
    }
    let systemAssignment = assignments.find((assignment) => assignment.moduleId === systemModule.id);
    const systemWasSelected = Boolean(
      systemAssignment?.enabled
      && systemAssignment.status === "enabled"
      && this.isTenantModuleWindowActive(systemAssignment)
      && systemAssignment.featureConfig?.[PARK_RECOVERY_SYSTEM_FEATURE] !== true
    );
    if (!systemAssignment) {
      systemAssignment = assignmentRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        tenantCode: tenant.tenantCode,
        moduleId: systemModule.id,
        planId: assetAssignment?.planId ?? null,
        startTime: new Date(),
        expireTime: tenant.expireTime,
        enabled: true,
        status: "enabled",
        featureConfig: { [PARK_RECOVERY_SYSTEM_FEATURE]: true },
        remark: "Inactive park recovery authorization",
        createBy: actorId,
        updateBy: actorId
      });
      systemAssignment.module = systemModule;
      systemAssignment.plan = assetAssignment?.plan ?? null;
      assignments.push(systemAssignment);
    } else {
      const needsRecoverySnapshot = !systemWasSelected
        && systemAssignment.featureConfig?.[PARK_RECOVERY_SYSTEM_FEATURE] !== true;
      if (needsRecoverySnapshot) {
        systemAssignment.featureConfig = this.withRecoverySystemSnapshot(systemAssignment.featureConfig, systemAssignment);
      }
      systemAssignment.enabled = true;
      systemAssignment.status = "enabled";
      systemAssignment.startTime = !systemAssignment.startTime || systemAssignment.startTime.getTime() <= Date.now()
        ? systemAssignment.startTime
        : new Date();
      systemAssignment.expireTime = tenant.expireTime;
      systemAssignment.featureConfig = this.withRecoverySystemMarker(
        this.withParkStatusSuspension(systemAssignment.featureConfig, false),
        !systemWasSelected
      );
      systemAssignment.updateBy = actorId;
    }
    await assignmentRepository.save(systemAssignment);

    const selectedAssignments = assignments.filter((assignment) =>
      assignment.module
      && assignment.module.status === 1
      && !assignment.module.isDeleted
      && assignment.enabled
      && assignment.status === "enabled"
      && this.isTenantModuleWindowActive(assignment)
      && assignment.featureConfig?.[PARK_RECOVERY_SYSTEM_FEATURE] !== true
      && assignment.module.moduleCode !== "asset"
    );
    const moduleCodes = this.normalizeCodes(selectedAssignments.map((assignment) => assignment.module!.moduleCode));
    const permissions = await manager.getRepository(PermissionEntity).find({
      where: { tenantId: scope.tenantId, isDeleted: false },
      order: { level: "ASC", sortNo: "ASC", createTime: "ASC" }
    });
    if (permissions.length === 0) {
      throw new BadRequestException("Permission seed source is empty");
    }
    const role = await this.getOrCreateTenantAdminRole(manager, tenant, scope.parkId, actorId);
    const permissionCodes = this.permissionCodesForModules(
      this.assignmentPermissionPatterns(selectedAssignments),
      moduleCodes
    );
    permissionCodes.push(SYSTEM_PERMISSIONS.PARK_READ, SYSTEM_PERMISSIONS.PARK_UPDATE);
    await this.applyTenantAdminPermissions(
      manager,
      scope,
      role,
      permissions,
      moduleCodes,
      permissionCodes,
      actorId
    );
  }

  private isTenantModuleWindowActive(assignment: TenantModuleEntity, now = Date.now()): boolean {
    return (!assignment.startTime || assignment.startTime.getTime() <= now)
      && (!assignment.expireTime || assignment.expireTime.getTime() > now);
  }

  private isTenantModuleWindowRecoverable(assignment: TenantModuleEntity, now = Date.now()): boolean {
    return !assignment.expireTime || assignment.expireTime.getTime() > now;
  }

  private assignmentPermissionPatterns(assignments: TenantModuleEntity[]): string[] {
    return this.normalizeCodes(assignments.flatMap((assignment) => assignment.plan?.permissionCodes ?? []));
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
      await lockAssetScope(manager, targetScope);
      const parkActive = await hasCanonicalActiveAssetParkSource(manager, targetScope);
      const selectedModuleCodes = parkActive
        ? moduleCodes
        : this.normalizeCodes([...moduleCodes, "system"]);
      const authorizationModuleCodes = parkActive
        ? moduleCodes
        : moduleCodes.filter((code) => code !== "asset");
      const permissions = await this.ensureTenantPermissions(manager, actorScope, targetScope, actorId);
      const modules = await this.resolveStandardModules(manager, selectedModuleCodes);
      const expireTime = dto.expireTime ? new Date(dto.expireTime) : null;
      await this.upsertTenantModules(
        manager,
        tenant,
        parkId,
        modules,
        plan,
        actorId,
        expireTime,
        dto.featureConfig ?? tenant.featureConfig,
        parkActive ? new Set<string>() : new Set(["asset"]),
        !parkActive && !moduleCodes.includes("system") ? new Set(["system"]) : new Set<string>()
      );
      await ensureCodeRuleScopeProvisioned(manager, targetScope, actorId);
      if (parkActive) {
        await this.ensureAssetScopeProvisioning(manager, targetScope, moduleCodes, actorId);
      }
      const role = await this.getOrCreateTenantAdminRole(manager, tenant, parkId, actorId);
      const permissionCodes = this.permissionCodesForModules(
        dto.permissionCodes?.length ? dto.permissionCodes : plan?.permissionCodes ?? [],
        authorizationModuleCodes
      );
      if (!parkActive) {
        permissionCodes.push(SYSTEM_PERMISSIONS.PARK_READ, SYSTEM_PERMISSIONS.PARK_UPDATE);
      }
      await this.applyTenantAdminPermissions(
        manager,
        targetScope,
        role,
        permissions,
        authorizationModuleCodes,
        permissionCodes,
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

  private async getTenantByScope(scope: TenantParkScope): Promise<TenantEntity> {
    const tenant = await this.tenantRepository.findOne({
      where: { tenantId: scope.tenantId, isDeleted: false }
    });
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

  private async ensureAssetScopeProvisioning(
    manager: EntityManager,
    scope: TenantParkScope,
    moduleCodes: string[],
    actorId: string
  ): Promise<void> {
    if (!moduleCodes.includes("asset")) return;
    await ensureAssetScopeProvisioned(manager, scope, actorId);
  }

  private async ensureTenantDictionaries(
    manager: EntityManager,
    sourceScope: TenantParkScope,
    targetScope: TenantParkScope,
    actorId: string
  ): Promise<void> {
    const defaultTypeCount = await manager.getRepository(DictTypeEntity).count({
      where: { tenantId: DEFAULT_PLATFORM_SCOPE.tenantId, parkId: DEFAULT_PLATFORM_SCOPE.parkId, isDeleted: false }
    });
    if (defaultTypeCount === 0) {
      throw new BadRequestException("Dictionary seed source is empty");
    }

    const sourceScopes = [
      sourceScope,
      DEFAULT_PLATFORM_SCOPE
    ].filter((scope, index, scopes) => (
      !(scope.tenantId === targetScope.tenantId && scope.parkId === targetScope.parkId)
      && scopes.findIndex((item) => item.tenantId === scope.tenantId && item.parkId === scope.parkId) === index
    ));

    for (const source of sourceScopes) {
      await this.copyMissingTenantDictionaries(
        manager,
        source,
        targetScope,
        actorId,
        source.tenantId === DEFAULT_PLATFORM_SCOPE.tenantId && source.parkId === DEFAULT_PLATFORM_SCOPE.parkId
          && !(sourceScope.tenantId === DEFAULT_PLATFORM_SCOPE.tenantId && sourceScope.parkId === DEFAULT_PLATFORM_SCOPE.parkId)
          ? sourceScope
          : undefined
      );
    }
  }

  private async copyMissingTenantDictionaries(
    manager: EntityManager,
    source: TenantParkScope,
    targetScope: TenantParkScope,
    actorId: string,
    customizationScope?: TenantParkScope
  ): Promise<void> {
    await manager.query(
      `
        INSERT INTO sys_dict_type (
          tenant_id,
          park_id,
          dict_code,
          dict_name,
          status,
          create_by,
          update_by,
          is_deleted,
          remark
        )
        SELECT
          $3,
          $4,
          source_type.dict_code,
          source_type.dict_name,
          source_type.status,
          $5,
          $5,
          false,
          source_type.remark
        FROM sys_dict_type source_type
        WHERE source_type.tenant_id = $1
          AND source_type.park_id = $2
          AND source_type.is_deleted = false
          AND NOT EXISTS (
            SELECT 1
            FROM sys_dict_type target_type
            WHERE target_type.tenant_id = $3
              AND target_type.park_id = $4
              AND target_type.dict_code = source_type.dict_code
          )
          AND (
            $6::varchar IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM sys_dict_type custom_type
              WHERE custom_type.tenant_id = $6
                AND custom_type.park_id = $7
                AND custom_type.dict_code = source_type.dict_code
            )
          )
      `,
      [
        source.tenantId,
        source.parkId,
        targetScope.tenantId,
        targetScope.parkId,
        actorId,
        customizationScope?.tenantId ?? null,
        customizationScope?.parkId ?? null
      ]
    );

    await manager.query(
      `
        WITH source_items AS (
          SELECT
            source_type.dict_code,
            source_item.item_label,
            source_item.item_value,
            source_item.sort_order,
            source_item.status,
            source_item.tag_type,
            source_item.remark,
            row_number() OVER (
              PARTITION BY source_type.dict_code, source_item.item_value
              ORDER BY source_item.sort_order ASC, source_item.create_time ASC, source_item.id ASC
            ) AS row_number
          FROM sys_dict_type source_type
          JOIN sys_dict_item source_item
            ON source_item.dict_type_id = source_type.id
           AND source_item.tenant_id = source_type.tenant_id
           AND source_item.park_id = source_type.park_id
           AND source_item.is_deleted = false
          WHERE source_type.tenant_id = $1
            AND source_type.park_id = $2
            AND source_type.is_deleted = false
        )
        INSERT INTO sys_dict_item (
          tenant_id,
          park_id,
          dict_type_id,
          item_label,
          item_value,
          sort_order,
          status,
          tag_type,
          create_by,
          update_by,
          is_deleted,
          remark
        )
        SELECT
          $3,
          $4,
          target_type.id,
          source_items.item_label,
          source_items.item_value,
          source_items.sort_order,
          source_items.status,
          source_items.tag_type,
          $5,
          $5,
          false,
          source_items.remark
        FROM source_items
        JOIN sys_dict_type target_type
          ON target_type.tenant_id = $3
         AND target_type.park_id = $4
         AND target_type.dict_code = source_items.dict_code
         AND target_type.is_deleted = false
        WHERE source_items.row_number = 1
          AND NOT EXISTS (
            SELECT 1
            FROM sys_dict_item target_item
            WHERE target_item.tenant_id = $3
              AND target_item.park_id = $4
              AND target_item.dict_type_id = target_type.id
              AND target_item.item_value = source_items.item_value
          )
          AND (
            $6::varchar IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM sys_dict_type custom_type
              JOIN sys_dict_item custom_item
                ON custom_item.dict_type_id = custom_type.id
               AND custom_item.tenant_id = custom_type.tenant_id
               AND custom_item.park_id = custom_type.park_id
              WHERE custom_type.tenant_id = $6
                AND custom_type.park_id = $7
                AND custom_type.dict_code = source_items.dict_code
                AND custom_item.item_value = source_items.item_value
            )
          )
      `,
      [
        source.tenantId,
        source.parkId,
        targetScope.tenantId,
        targetScope.parkId,
        actorId,
        customizationScope?.tenantId ?? null,
        customizationScope?.parkId ?? null
      ]
    );
  }

  private async cloneTenantParkModules(
    manager: EntityManager,
    tenant: TenantEntity,
    parkId: string,
    sourceAssignments: TenantModuleEntity[],
    modules: SaaSModuleEntity[],
    actorId: string
  ): Promise<void> {
    const repository = manager.getRepository(TenantModuleEntity);
    const sourceByModuleId = new Map(sourceAssignments.map((item) => [item.moduleId, item]));
    for (const module of modules) {
      const source = sourceByModuleId.get(module.id);
      if (!source) throw new BadRequestException(`Current park module assignment not found: ${module.moduleCode}`);
      await repository.save(repository.create({
        tenantId: tenant.tenantId,
        parkId,
        tenantCode: tenant.tenantCode,
        moduleId: source.moduleId,
        planId: source.planId,
        startTime: source.startTime,
        expireTime: source.expireTime,
        enabled: source.enabled,
        featureConfig: { ...(source.featureConfig ?? {}) },
        status: source.status,
        createBy: actorId,
        updateBy: actorId,
        remark: "Copied from source park module authorization"
      }));
    }
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
      where: { tenantId: tenant.tenantId, code: TENANT_ADMIN_ROLE_CODE, isDeleted: false }
    });
    if (existing && existing.roleScope !== "tenant") {
      throw new ConflictException("Tenant administrator role must be a tenant-scoped built-in role");
    }
    if (!existing) return this.createTenantAdminRole(manager, tenant, parkId, actorId);
    const needsRepair =
      !existing.isBuiltin
      || !existing.isSystem
      || existing.isDeletable
      || existing.roleType !== "tenant"
      || existing.dataScope !== "tenant"
      || existing.rolePath !== TENANT_ADMIN_ROLE_CODE;
    if (needsRepair) {
      if (!this.isRepairableLegacyTenantAdminRole(existing)) {
        throw new ConflictException("Tenant administrator role must be a tenant-scoped built-in role");
      }
      existing.roleType = "tenant";
      existing.rolePath = TENANT_ADMIN_ROLE_CODE;
      existing.roleLevel = 1;
      existing.level = 1;
      existing.dataScope = "tenant";
      existing.dataScopeConfig = {};
      existing.isBuiltin = true;
      existing.isSystem = true;
      existing.isDeletable = false;
      existing.updateBy = actorId;
      return roleRepository.save(existing);
    }
    return existing;
  }

  private isRepairableLegacyTenantAdminRole(role: RoleEntity): boolean {
    const legacyRemark = typeof role.remark === "string"
      && role.remark.includes("Phase-1 tenant portal role template");
    return role.roleScope === "tenant"
      && role.roleType === "tenant"
      && role.rolePath === TENANT_ADMIN_ROLE_CODE
      && role.roleLevel === 1
      && role.level === 1
      && role.dataScope === "10"
      && JSON.stringify(role.dataScopeConfig ?? {}) === "{}"
      && role.isTemplate === true
      && role.isSystem === false
      && role.isBuiltin === false
      && role.isDeletable === true
      && legacyRemark;
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

  private async bindAdditionalTenantAdmin(
    manager: EntityManager,
    tenant: TenantEntity,
    parkId: string,
    orgId: string,
    roleId: string,
    userId: string,
    actorId: string
  ): Promise<void> {
    await manager.getRepository(UserRoleEntity).save(manager.getRepository(UserRoleEntity).create({
      tenantId: tenant.tenantId, parkId, userId, roleId, createBy: actorId, updateBy: actorId,
      remark: "Additional park tenant administrator role binding"
    }));
    await manager.getRepository(UserParkEntity).save(manager.getRepository(UserParkEntity).create({
      tenantId: tenant.tenantId, parkId, userId, isDefault: false, status: "enabled", createBy: actorId, updateBy: actorId,
      remark: "Additional park access binding"
    }));
    await manager.getRepository(UserOrgEntity).save(manager.getRepository(UserOrgEntity).create({
      tenantId: tenant.tenantId, parkId, userId, orgId, postId: null, isPrimary: true, createBy: actorId, updateBy: actorId,
      remark: "Additional park organization binding"
    }));
  }

  private async ensureTenantPermissions(
    manager: EntityManager,
    sourceScope: TenantParkScope,
    targetScope: TenantParkScope,
    actorId: string
  ): Promise<PermissionEntity[]> {
    const permissionRepository = manager.getRepository(PermissionEntity);
    const existing = await permissionRepository.find({
      where: { tenantId: targetScope.tenantId, isDeleted: false },
      order: { level: "ASC", sortNo: "ASC", createTime: "ASC" }
    });
    if (existing.length > 0) {
      return existing;
    }

    const source = await this.resolvePermissionSourceScope(manager, sourceScope);
    const sourcePermissions = await permissionRepository.find({
      where: { tenantId: source.tenantId, isDeleted: false },
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
      where: { tenantId: scope.tenantId, isDeleted: false }
    });
    if (scopedCount > 0) {
      return scope;
    }
    return DEFAULT_PLATFORM_SCOPE;
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

  private permissionCodesForModules(permissionCodes: string[], moduleCodes: string[]): string[] {
    const enabledModules = new Set(this.normalizeCodes(moduleCodes));
    return this.normalizeCodes(permissionCodes).filter((code) => {
      if (code.startsWith("module:")) {
        return enabledModules.has(code.replace(/^module:/, ""));
      }
      return this.derivePermissionCodes([...enabledModules], [{ code } as PermissionEntity]).length > 0;
    });
  }

  private derivePermissionCodes(moduleCodes: string[], permissions: PermissionEntity[]): string[] {
    const modules = new Set(this.normalizeCodes(moduleCodes));
    return permissions
      .filter((permission) => {
        const code = permission.code;
        if (modules.has("system") && this.isSystemFoundationPermission(code)) return true;
        if (modules.has("asset") && this.isAssetPermission(code)) return true;
        if (modules.has("homestay") && (code === "homestay" || code.startsWith("homestay:"))) return true;
        if (modules.has("housing_rental") && (code === "housing_rental" || code.startsWith("housing_rental:") || code.startsWith("housing:"))) return true;
        if (modules.has("leasing") && this.isLeasingPermission(code)) return true;
        if (
          modules.has("workorder") &&
          (code === "workorder" ||
            code === "workorder:center" ||
            code === "wo:read" ||
            code.startsWith("workorder:") ||
            code.startsWith("workorder_sla:") ||
            code.startsWith("workorder_log:"))
        ) return true;
        if (modules.has("safety") && (code === "safety" || code.startsWith("safety:") || code.startsWith("safety_"))) return true;
        if (modules.has("engineering") && this.isEngineeringPermission(code)) return true;
        if (modules.has("iot") && (code === "iot" || code.startsWith("iot:") || code.startsWith("iot_"))) return true;
        if (modules.has("energy") && (code === "energy" || code.startsWith("energy:") || code.startsWith("energy_"))) return true;
        if (modules.has("robot") && (code === "robot" || code.startsWith("robot:") || code.startsWith("robot_"))) return true;
        if (
          modules.has("video") &&
          (code === "video" ||
            code === "video:overview" ||
            code === "video:read" ||
            code.startsWith("video_camera:") ||
            code.startsWith("video_platform_config:") ||
            code.startsWith("video_evidence:") ||
            code.startsWith("video_alert:") ||
            code.startsWith("video_alert_log:") ||
            code.startsWith("video_security_dashboard:") ||
            code.startsWith("VIDEO_CAMERA") ||
            code.startsWith("VIDEO_PLATFORM_CONFIG") ||
            code.startsWith("VIDEO_EVIDENCE") ||
            code.startsWith("VIDEO_ALERT") ||
            code.startsWith("VIDEO_SECURITY_DASHBOARD") ||
            code.startsWith("MENU_VIDEO"))
        ) return true;
        if (modules.has("bim") && (code === "bim" || code.startsWith("bim:") || code.startsWith("bim_"))) return true;
        if (modules.has("ai") && (code === "ai" || code.startsWith("ai:") || code.startsWith("ai_"))) return true;
        if (modules.has("cockpit") && (code === "cockpit" || code.startsWith("cockpit:") || code.startsWith("cockpit_"))) return true;
        if (modules.has("apartment") && this.isApartmentPermission(code)) return true;
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
      code.startsWith("unit:") ||
      code.startsWith("party:") ||
      code.startsWith("party_role:") ||
      code.startsWith("property:") ||
      code.startsWith("property_operation:") ||
      code.startsWith("property_occupancy:") ||
      code.startsWith("property_approval:") ||
      code.startsWith("property_event:") ||
      code.startsWith("property_task:") ||
      code.startsWith("property_notification:")
    );
  }

  private isApartmentPermission(code: string): boolean {
    return (
      code === "apartment" ||
      code.startsWith("apartment:") ||
      code === "unit:read" ||
      code === "party:read" ||
      code === "party:manage" ||
      code === "party:*" ||
      code === "file:read" ||
      code === "file:upload" ||
      code === "file:download" ||
      code === "file:*"
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

  private isEngineeringPermission(code: string): boolean {
    return code === "engineering" || code.startsWith("engineering:") || code.startsWith("ENGINEERING_");
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
    const globalPlan = await planRepository.findOne({
      where: {
        tenantId: DEFAULT_PLATFORM_SCOPE.tenantId,
        parkId: DEFAULT_PLATFORM_SCOPE.parkId,
        planCode,
        status: "enabled",
        isDeleted: false
      }
    });
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
    featureConfig: Record<string, unknown>,
    disabledModuleCodes: ReadonlySet<string> = new Set(),
    recoveryOnlyModuleCodes: ReadonlySet<string> = new Set()
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
        const featureConfig = this.withParkStatusSuspension(item.featureConfig, false);
        item.featureConfig = item.module?.moduleCode === "system"
          || featureConfig[PARK_RECOVERY_SYSTEM_FEATURE] === true
          ? this.withRecoverySystemMarker(featureConfig, false)
          : featureConfig;
        item.updateBy = actorId;
        await tenantModuleRepository.save(item);
      }
    }
    for (const module of modules) {
      const enabled = !disabledModuleCodes.has(module.moduleCode);
      const entity =
        existing.find((item) => item.moduleId === module.id) ??
        tenantModuleRepository.create({
          tenantId: tenant.tenantId,
          parkId,
          moduleId: module.id,
          createBy: actorId
        });
      const recoverySnapshot = module.moduleCode === "system"
        && entity.featureConfig?.[PARK_RECOVERY_SYSTEM_FEATURE] === true
        ? this.resolveRecoverySystemSnapshot(entity.featureConfig)
        : null;
      const restoreScheduledSystem = !recoveryOnlyModuleCodes.has("system")
        && recoverySnapshot?.enabled === true
        && recoverySnapshot.status === "enabled"
        && !disabledModuleCodes.has("asset");
      const retainScheduledRecovery = recoverySnapshot?.enabled === true
        && recoverySnapshot.status === "enabled"
        && disabledModuleCodes.has("asset");
      const moduleFeatureConfig = this.withParkStatusSuspension(
        { ...(entity.featureConfig ?? {}), ...featureConfig },
        !enabled && module.moduleCode === "asset"
      );
      Object.assign(entity, {
        tenantCode: tenant.tenantCode,
        planId: plan?.id ?? entity.planId ?? null,
        startTime: restoreScheduledSystem
          ? this.restoreSnapshotDate(recoverySnapshot!.startTime)
          : entity.startTime ?? new Date(),
        expireTime: restoreScheduledSystem
          ? this.restoreSnapshotDate(recoverySnapshot!.expireTime)
          : expireTime,
        enabled: restoreScheduledSystem ? recoverySnapshot!.enabled : enabled,
        featureConfig: module.moduleCode === "system"
          ? this.withRecoverySystemMarker(
            moduleFeatureConfig,
            recoveryOnlyModuleCodes.has("system") || retainScheduledRecovery
          )
          : moduleFeatureConfig,
        status: restoreScheduledSystem ? recoverySnapshot!.status : enabled ? "enabled" : "disabled",
        updateBy: actorId,
        remark: "Tenant package module authorization"
      });
      await tenantModuleRepository.save(entity);
    }
  }

  private withParkStatusSuspension(
    featureConfig: Record<string, unknown> | null | undefined,
    suspended: boolean
  ): Record<string, unknown> {
    const next = { ...(featureConfig ?? {}) };
    if (suspended) {
      next[PARK_STATUS_SUSPENDED_FEATURE] = true;
    } else {
      delete next[PARK_STATUS_SUSPENDED_FEATURE];
    }
    return next;
  }

  private withRecoverySystemMarker(
    featureConfig: Record<string, unknown> | null | undefined,
    recoveryOnly: boolean
  ): Record<string, unknown> {
    const next = { ...(featureConfig ?? {}) };
    if (recoveryOnly) {
      next[PARK_RECOVERY_SYSTEM_FEATURE] = true;
    } else {
      delete next[PARK_RECOVERY_SYSTEM_FEATURE];
      delete next[PARK_RECOVERY_SYSTEM_SNAPSHOT_FEATURE];
    }
    return next;
  }

  private withRecoverySystemSnapshot(
    featureConfig: Record<string, unknown> | null | undefined,
    assignment: TenantModuleEntity
  ): Record<string, unknown> {
    return {
      ...(featureConfig ?? {}),
      [PARK_RECOVERY_SYSTEM_SNAPSHOT_FEATURE]: {
        enabled: assignment.enabled,
        status: assignment.status,
        startTime: assignment.startTime?.toISOString() ?? null,
        expireTime: assignment.expireTime?.toISOString() ?? null
      }
    };
  }

  private resolveRecoverySystemSnapshot(featureConfig: Record<string, unknown> | null | undefined): {
    enabled: boolean;
    status: string;
    startTime: string | null;
    expireTime: string | null;
  } | null {
    const value = featureConfig?.[PARK_RECOVERY_SYSTEM_SNAPSHOT_FEATURE];
    if (value === undefined) return null;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ConflictException("Recovery system assignment snapshot is invalid");
    }
    const snapshot = value as Record<string, unknown>;
    const validStatus = snapshot.status === "enabled" || snapshot.status === "disabled";
    const validDateValue = (date: unknown): date is string | null => date === null
      || (typeof date === "string" && !Number.isNaN(new Date(date).getTime()));
    if (typeof snapshot.enabled !== "boolean"
      || !validStatus
      || !validDateValue(snapshot.startTime)
      || !validDateValue(snapshot.expireTime)) {
      throw new ConflictException("Recovery system assignment snapshot is invalid");
    }
    return {
      enabled: snapshot.enabled,
      status: snapshot.status as "enabled" | "disabled",
      startTime: snapshot.startTime,
      expireTime: snapshot.expireTime
    };
  }

  private restoreSnapshotDate(value: string | null): Date | null {
    return value === null ? null : new Date(value);
  }

  private async synchronizeRecoverySnapshotExpiry(
    manager: EntityManager,
    tenantId: string,
    expireTime: Date | null,
    actorId: string
  ): Promise<void> {
    const repository = manager.getRepository(TenantModuleEntity);
    const assignments = await repository.find({ where: { tenantId, isDeleted: false } });
    for (const assignment of assignments) {
      const snapshot = this.resolveRecoverySystemSnapshot(assignment.featureConfig);
      if (!snapshot) continue;
      assignment.featureConfig = {
        ...assignment.featureConfig,
        [PARK_RECOVERY_SYSTEM_SNAPSHOT_FEATURE]: {
          ...snapshot,
          expireTime: expireTime?.toISOString() ?? null
        }
      };
      assignment.updateBy = actorId;
      await repository.save(assignment);
    }
  }

  private async resolveDefaultParkId(manager: EntityManager, tenantId: string): Promise<string> {
    const tenant = await manager.getRepository(TenantEntity).findOne({ where: { tenantId, isDeleted: false } });
    const configuredParkId = this.resolveConfiguredDefaultParkId(tenant);
    if (configuredParkId) {
      const exists = await manager.getRepository(ParkEntity).exists({ where: { tenantId, parkId: configuredParkId, isDeleted: false } });
      if (exists) {
        return configuredParkId;
      }
    }
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
    const [userCount, parkCount, enabledModuleRows] = await Promise.all([
      entityManager.getRepository(UserEntity).count({ where: { tenantId: tenant.tenantId, isDeleted: false } }),
      entityManager.getRepository(ParkEntity).count({ where: { tenantId: tenant.tenantId, isDeleted: false } }),
      entityManager.getRepository(TenantModuleEntity).find({
        where: { tenantId: tenant.tenantId, isDeleted: false, enabled: true, status: "enabled" },
        select: { moduleId: true }
      })
    ]);
    const enabledModuleCount = new Set(enabledModuleRows.map((item) => item.moduleId)).size;
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
      defaultParkId: this.resolveConfiguredDefaultParkId(tenant),
      expireWarning: this.resolveExpireWarning(tenant),
      featureConfig: tenant.featureConfig ?? {},
      userCount,
      parkCount,
      enabledModuleCount,
      createTime: tenant.createTime,
      updateTime: tenant.updateTime,
      remark: tenant.remark
    };
  }

  private resolveConfiguredDefaultParkId(tenant: TenantEntity | null): string | null {
    const value = tenant?.featureConfig?.defaultParkId;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private resolveExpireWarning(tenant: TenantEntity): string | null {
    if (tenant.status === 2) {
      return "账号所属租户已过期，请联系管理员续费";
    }
    if (!tenant.expireTime) {
      return null;
    }
    const days = Math.ceil((tenant.expireTime.getTime() - Date.now()) / 86400000);
    if (days < 0) {
      return "账号所属租户已过期，请联系管理员续费";
    }
    if (days <= 30) {
      return `租户将在 ${days} 天后到期，请及时续费`;
    }
    return null;
  }

  private async assertParkBelongsToTenant(manager: EntityManager, tenantId: string, parkId: string): Promise<void> {
    const exists = await manager.getRepository(ParkEntity).exists({ where: { tenantId, parkId, isDeleted: false } });
    if (!exists) {
      throw new NotFoundException("Default park not found in target tenant");
    }
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

  private async generateParkScopeId(repository: Repository<ParkEntity>): Promise<string> {
    for (let index = 0; index < 10; index += 1) {
      const value = `2${randomInt(1000000, 9999999)}`;
      if (!await repository.createQueryBuilder("park").where("park.park_id = :parkId", { parkId: value }).getExists()) {
        return value;
      }
    }
    throw new ConflictException("Unable to generate unique park scope id");
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
