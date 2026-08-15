import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { Brackets, type DataSource, type EntityManager, type SelectQueryBuilder, type Repository } from "typeorm";
import {
  ensureAssetParkProjection,
  ensureAssetScopeProvisioned,
  assetScopeLockKey,
  hasCanonicalActiveAssetParkSource,
  hasAssetParkProjection,
  hasProtectedAssetScope,
  lockAssetScope
} from "../assets/asset-scope-provisioning";
import { DEFAULT_PLATFORM_SCOPE } from "../../shared/constants/platform-scope";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { ensureCodeRuleScopeProvisioned } from "../code-rules/code-rule-scope-provisioning";
import { TenantEntity } from "../tenants/entities/tenant.entity";
import { TenantsService } from "../tenants/tenants.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreateParkDto } from "./dto/create-park.dto";
import type { ParkQueryDto } from "./dto/park-query.dto";
import type { UpdateParkDto } from "./dto/update-park.dto";
import { ParkEntity } from "./entities/park.entity";

const SORT_COLUMNS = new Set(["parkCode", "parkName", "status", "createTime", "updateTime"]);

@Injectable()
export class ParksService {
  constructor(
    @InjectRepository(ParkEntity)
    private readonly parksRepository: Repository<ParkEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantRepository: Repository<TenantEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly dataScopeService: DataScopeService,
    private readonly tenantsService: TenantsService
  ) {}

  async list(scope: TenantParkScope, query: ParkQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<ParkEntity>> {
    await this.assertParkModuleAccess(scope);
    const builder = this.parkManagementBuilder(scope, actor);
    if (!actor || !this.canManageTenantParks(actor)) await this.applyParkDataScope(builder, actor);

    if (query.status !== undefined) {
      builder.andWhere("park.status = :status", { status: query.status });
    }

    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("park.park_code ILIKE :keyword", { keyword }).orWhere("park.park_name ILIKE :keyword", { keyword });
        })
      );
    }

    this.applySort(builder, query.sort);

    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();

    return { items, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<ParkEntity> {
    await this.assertParkModuleAccess(scope);
    const builder = this.parkManagementBuilder(scope, actor).andWhere("park.id = :id", { id });
    if (!actor || !this.canManageTenantParks(actor)) await this.applyParkDataScope(builder, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Park not found");
    }
    return entity;
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateParkDto, onTargetScope?: (scope: TenantParkScope) => void): Promise<ParkEntity> {
    this.assertTenantParkManager(scope, actor);
    return this.dataSource.transaction(async (manager) => {
    const parkCode = dto.parkCode.trim();
    this.assertDefaultFallbackMutationAllowed(scope, actor, parkCode === "JH");
    await this.lockMutationScopes(manager, scope, true);
    await this.assertTenantParkLimit(scope, manager);
    await this.assertParkCodeAvailable(parkCode, undefined, manager);
    const park = await this.tenantsService.provisionAdditionalPark(manager, scope, actor, dto);
    onTargetScope?.({ tenantId: park.tenantId, parkId: park.parkId });
    return park;
    });
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateParkDto, onTargetScope?: (scope: TenantParkScope) => void): Promise<ParkEntity> {
    const target = await this.detail(scope, id, actor);
    const targetScope = { tenantId: target.tenantId, parkId: target.parkId };
    onTargetScope?.(targetScope);
    return this.dataSource.transaction(async (manager) => {
    await this.lockMutationScopes(manager, targetScope, true);
    await this.assertParkModuleAccess(scope, manager);
    const repository = manager.getRepository(ParkEntity);
    const entity = await repository.findOne({
      where: { id, tenantId: targetScope.tenantId, parkId: targetScope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!entity) throw new NotFoundException("Park not found");
    const wasActive = entity.status === 1;
    const nextCode = dto.parkCode?.trim();
    const touchesDefaultFallback = entity.parkCode === "JH" || nextCode === "JH";
    this.assertDefaultFallbackMutationAllowed(targetScope, actor, touchesDefaultFallback);
    const protectedScope = await this.hasCanonicalProjectionContract(manager, targetScope);
    const authorizationProtectedScope = await hasProtectedAssetScope(manager, targetScope);
    const defaultScopeProtected = touchesDefaultFallback && await this.hasCanonicalProjectionContract(manager, DEFAULT_PLATFORM_SCOPE);
    const defaultAuthorizationProtectedScope = touchesDefaultFallback
      && await hasProtectedAssetScope(manager, DEFAULT_PLATFORM_SCOPE);
    const defaultScopeWasActive = defaultScopeProtected
      ? await this.hasValidCanonicalParkSourceBeforeMutation(manager, DEFAULT_PLATFORM_SCOPE)
      : false;
    const renamesCrossScopeDefaultSource = nextCode !== undefined
      && nextCode !== "JH"
      && (entity.tenantId !== DEFAULT_PLATFORM_SCOPE.tenantId || entity.parkId !== DEFAULT_PLATFORM_SCOPE.parkId);
    if (defaultScopeProtected && entity.parkCode === "JH" && renamesCrossScopeDefaultSource) {
      await this.assertCanonicalSourceSurvives(manager, DEFAULT_PLATFORM_SCOPE, entity);
    }
    if (nextCode && nextCode !== entity.parkCode) {
      await this.assertParkCodeAvailable(nextCode, id, manager);
      entity.parkCode = nextCode;
    }

    if (dto.parkName !== undefined) entity.parkName = dto.parkName.trim();
    if (dto.address !== undefined) entity.address = this.emptyToNull(dto.address);
    if (dto.province !== undefined) entity.province = this.emptyToNull(dto.province);
    if (dto.city !== undefined) entity.city = this.emptyToNull(dto.city);
    if (dto.district !== undefined) entity.district = this.emptyToNull(dto.district);
    if (dto.lng !== undefined) entity.lng = this.numberToDecimal(dto.lng);
    if (dto.lat !== undefined) entity.lat = this.numberToDecimal(dto.lat);
    if (dto.totalArea !== undefined) entity.totalArea = this.numberToDecimal(dto.totalArea) ?? "0";
    if (dto.landArea !== undefined) entity.landArea = this.numberToDecimal(dto.landArea) ?? "0";
    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actor.sub;

    const saved = await repository.save(entity);
    const scopeRemainsActive = await this.hasActiveCanonicalParkSource(manager, targetScope);
    const defaultScopeRemainsActive = defaultScopeProtected
      ? await this.hasActiveCanonicalParkSource(manager, DEFAULT_PLATFORM_SCOPE)
      : false;
    if (protectedScope && scopeRemainsActive) await this.syncCanonicalAssetProjection(manager, targetScope, actor.sub);
    if (defaultScopeProtected && defaultScopeRemainsActive) {
      await this.syncCanonicalAssetProjection(manager, DEFAULT_PLATFORM_SCOPE, actor.sub);
    }
    if (authorizationProtectedScope && wasActive && saved.status !== 1 && !scopeRemainsActive) {
      await this.tenantsService.reconcileDeactivatedParkAuthorization(manager, targetScope, actor.sub);
    }
    const defaultScopeIsSecondary = targetScope.tenantId !== DEFAULT_PLATFORM_SCOPE.tenantId
      || targetScope.parkId !== DEFAULT_PLATFORM_SCOPE.parkId;
    if (wasActive && saved.status !== 1 && defaultAuthorizationProtectedScope && !defaultScopeRemainsActive && defaultScopeIsSecondary) {
      await this.tenantsService.reconcileDeactivatedParkAuthorization(manager, DEFAULT_PLATFORM_SCOPE, actor.sub);
    }
    const targetScopeReactivated = !wasActive && saved.status === 1;
    if (authorizationProtectedScope && targetScopeReactivated) {
      await this.tenantsService.reconcileReactivatedParkAuthorization(manager, targetScope, actor.sub);
    }
    if (targetScopeReactivated) {
      await ensureCodeRuleScopeProvisioned(manager, targetScope, actor.sub);
    }
    const defaultScopeReactivated =
      defaultScopeProtected
      && !defaultScopeWasActive
      && defaultScopeRemainsActive
      && defaultScopeIsSecondary
      && saved.parkCode === "JH";
    if (defaultAuthorizationProtectedScope && defaultScopeReactivated) {
      await this.tenantsService.reconcileReactivatedParkAuthorization(manager, DEFAULT_PLATFORM_SCOPE, actor.sub);
    }
    if (defaultScopeReactivated) {
      await ensureCodeRuleScopeProvisioned(manager, DEFAULT_PLATFORM_SCOPE, actor.sub);
    }
    return saved;
    }).catch((error: unknown) => {
      const databaseError = error as { code?: unknown; driverError?: { code?: unknown; message?: unknown }; message?: unknown };
      const code = databaseError.code ?? databaseError.driverError?.code;
      const message = databaseError.driverError?.message ?? databaseError.message;
      if (code === "23503" && typeof message === "string" && message.includes("active park scope with buildings")) {
        throw new ConflictException("Park has active buildings and cannot be disabled");
      }
      if (code === "23505" && typeof message === "string" && message.includes("already has a canonical park")) {
        throw new ConflictException("Park scope already has an active canonical park");
      }
      throw error;
    });
  }

  private async assertParkModuleAccess(scope: TenantParkScope, manager: EntityManager = this.dataSource.manager): Promise<void> {
    const rows = await manager.query(
      `SELECT module.module_code AS "moduleCode"
         FROM rel_tenant_module assignment
         JOIN sys_module module
           ON module.id=assignment.module_id
          AND module.status=1
          AND module.is_deleted=false
        WHERE assignment.tenant_id=$1
          AND assignment.park_id=$2
          AND assignment.enabled=true
          AND assignment.status='enabled'
          AND assignment.is_deleted=false
          AND (assignment.start_time IS NULL OR assignment.start_time<=now())
          AND (assignment.expire_time IS NULL OR assignment.expire_time>now())
          AND (
            module.module_code='asset'
            OR module.module_code='system'
          )
        `,
      [scope.tenantId, scope.parkId]
    ) as Array<{ moduleCode: string }>;
    const assetEnabled = rows.some((row) => row.moduleCode === "asset");
    const systemEnabled = rows.some((row) => row.moduleCode === "system");
    const inactiveScopeSystem = !assetEnabled && systemEnabled
      && !await hasCanonicalActiveAssetParkSource(manager, scope);
    if (!assetEnabled && !inactiveScopeSystem) {
      throw new ForbiddenException("Tenant module is not authorized");
    }
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string, onTargetScope?: (scope: TenantParkScope) => void): Promise<{ id: string }> {
    const target = await this.detail(scope, id, actor);
    const targetScope = { tenantId: target.tenantId, parkId: target.parkId };
    onTargetScope?.(targetScope);
    return this.dataSource.transaction(async (manager) => {
    await this.lockMutationScopes(manager, targetScope, true);
    await this.assertParkModuleAccess(scope, manager);
    const repository = manager.getRepository(ParkEntity);
    const entity = await repository.findOne({
      where: { id, tenantId: targetScope.tenantId, parkId: targetScope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!entity) throw new NotFoundException("Park not found");
    this.assertDefaultFallbackMutationAllowed(targetScope, actor, entity.parkCode === "JH");
    const protectedDefault = entity.parkCode === "JH" && await this.hasCanonicalProjectionContract(manager, DEFAULT_PLATFORM_SCOPE);
    const protectedScope = await this.hasCanonicalProjectionContract(manager, targetScope);
    if (entity.status === 1 && targetScope.parkId !== scope.parkId) {
      throw new ConflictException("Park must be inactive before retirement");
    }
    const retiresIndependentScope = protectedScope
      && entity.status !== 1
      && targetScope.parkId !== scope.parkId;
    if (protectedScope && !retiresIndependentScope) {
      await this.assertCanonicalSourceSurvives(manager, targetScope, entity);
    }
    if (protectedDefault) {
      await this.assertCanonicalSourceSurvives(manager, DEFAULT_PLATFORM_SCOPE, entity);
    }
    if (retiresIndependentScope) {
      await this.retireIndependentAssetScope(manager, targetScope, actor.sub);
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await repository.save(entity);
    if (!retiresIndependentScope && protectedScope) {
      await this.syncCanonicalAssetProjection(manager, targetScope, actor.sub);
    }
    if (protectedDefault) {
      await this.syncCanonicalAssetProjection(manager, DEFAULT_PLATFORM_SCOPE, actor.sub);
    }
    return { id };
    });
  }

  private parkManagementBuilder(scope: TenantParkScope, actor?: JwtPrincipal): SelectQueryBuilder<ParkEntity> {
    const builder = this.parksRepository.createQueryBuilder("park")
      .where("park.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("park.is_deleted = false");
    if (!actor || !this.canManageTenantParks(actor)) {
      builder.andWhere("park.park_id = :parkId", { parkId: scope.parkId });
    }
    return builder;
  }

  private canManageTenantParks(actor: JwtPrincipal): boolean {
    return actor.isSuper || actor.permissions.includes("*") || actor.roles.includes("TENANT_ADMIN");
  }

  private assertTenantParkManager(scope: TenantParkScope, actor: JwtPrincipal): void {
    if (actor.tenantId !== scope.tenantId || !this.canManageTenantParks(actor)) {
      throw new ForbiddenException("Only tenant administrator can create a new park scope");
    }
  }

  private async retireIndependentAssetScope(manager: EntityManager, scope: TenantParkScope, actorId: string): Promise<void> {
    if (await hasCanonicalActiveAssetParkSource(manager, scope)) {
      throw new ConflictException("Park must be inactive before retirement");
    }
    const activeAssetAssignments = await manager.query(
      `SELECT 1 FROM rel_tenant_module assignment JOIN sys_module module ON module.id=assignment.module_id
        WHERE assignment.tenant_id=$1 AND assignment.park_id=$2 AND assignment.is_deleted=false
          AND assignment.enabled=true AND assignment.status='enabled' AND module.module_code='asset' LIMIT 1`,
      [scope.tenantId, scope.parkId]
    ) as unknown[];
    if (activeAssetAssignments.length > 0) throw new ConflictException("Asset module must be disabled before park retirement");
    await manager.query(
      `UPDATE asset_park SET is_deleted=true, status='disabled', update_by=$3, update_time=clock_timestamp(), version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false`,
      [scope.tenantId, scope.parkId, actorId]
    );
    await manager.query(
      `UPDATE rel_tenant_module SET is_deleted=true, enabled=false, status='disabled', update_by=$3, update_time=clock_timestamp(), version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false`,
      [scope.tenantId, scope.parkId, actorId]
    );
  }

  private async hasActiveCanonicalParkSource(
    manager: EntityManager,
    scope: TenantParkScope
  ): Promise<boolean> {
    return hasCanonicalActiveAssetParkSource(manager, scope);
  }

  private async hasValidCanonicalParkSourceBeforeMutation(
    manager: EntityManager,
    scope: TenantParkScope
  ): Promise<boolean> {
    try {
      return await this.hasActiveCanonicalParkSource(manager, scope);
    } catch (error) {
      if (error instanceof ConflictException) return false;
      throw error;
    }
  }

  private assertDefaultFallbackMutationAllowed(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    touchesDefaultFallback: boolean
  ): void {
    const isDefaultScope = scope.tenantId === DEFAULT_PLATFORM_SCOPE.tenantId
      && scope.parkId === DEFAULT_PLATFORM_SCOPE.parkId;
    if (touchesDefaultFallback && !isDefaultScope && !actor.isSuper && !actor.permissions.includes("*")) {
      throw new ForbiddenException("Only super administrator can change the default JH fallback");
    }
  }

  private async applyParkDataScope(builder: SelectQueryBuilder<ParkEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const filter = await this.dataScopeService.buildScopeFilter(actor, "park");
    if (filter.unrestricted) {
      return;
    }
    if (filter.allowed_ids.length === 0) {
      builder.andWhere("1 = 0");
      return;
    }
    builder.andWhere("park.park_id IN (:...parkDataScopeIds)", { parkDataScopeIds: filter.allowed_ids });
  }

  private applySort(builder: SelectQueryBuilder<ParkEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("park.create_time", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("park.create_time", "DESC");
      return;
    }
    builder.orderBy(`park.${this.toSnakeCase(field)}`, direction);
  }

  private async assertParkCodeAvailable(parkCode: string, excludeId?: string, manager?: EntityManager): Promise<void> {
    const builder = (manager?.getRepository(ParkEntity) ?? this.parksRepository)
      .createQueryBuilder("park")
      .where("park.park_code = :parkCode", { parkCode })
      .andWhere("park.is_deleted = false");
    if (excludeId) {
      builder.andWhere("park.id <> :excludeId", { excludeId });
    }
    const exists = await builder.getExists();
    if (exists) {
      throw new ConflictException("Park code already exists");
    }
  }

  private async hasCanonicalProjectionContract(manager: EntityManager, scope: TenantParkScope): Promise<boolean> {
    return await hasProtectedAssetScope(manager, scope) || await hasAssetParkProjection(manager, scope);
  }

  private async lockMutationScopes(
    manager: EntityManager,
    scope: TenantParkScope,
    includeDefaultScope: boolean
  ): Promise<void> {
    const scopes = includeDefaultScope
      ? [scope, DEFAULT_PLATFORM_SCOPE]
      : [scope];
    const uniqueScopes = [...new Map(scopes.map((item) => [assetScopeLockKey(item), item])).entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, item]) => item);
    for (const item of uniqueScopes) {
      await lockAssetScope(manager, item);
    }
  }

  private async syncCanonicalAssetProjection(
    manager: EntityManager,
    scope: TenantParkScope,
    actorId: string
  ): Promise<void> {
    if (await hasProtectedAssetScope(manager, scope)) {
      await ensureAssetScopeProvisioned(manager, scope, actorId);
      return;
    }
    await ensureAssetParkProjection(manager, scope, actorId);
  }

  private async assertCanonicalSourceSurvives(
    manager: EntityManager,
    protectedScope: TenantParkScope,
    removedPark: ParkEntity
  ): Promise<void> {
    const builder = manager.getRepository(ParkEntity)
      .createQueryBuilder("park")
      .where("park.tenant_id = :tenantId", { tenantId: protectedScope.tenantId })
      .andWhere("park.park_id = :parkId", { parkId: protectedScope.parkId })
      .andWhere("park.status = 1")
      .andWhere("park.is_deleted = false");
    if (removedPark.tenantId === protectedScope.tenantId && removedPark.parkId === protectedScope.parkId) {
      builder.andWhere("park.id <> :removedParkId", { removedParkId: removedPark.id });
    }
    const exactSourceCount = await builder.getCount();
    if (exactSourceCount === 1) {
      return;
    }
    if (protectedScope.tenantId === DEFAULT_PLATFORM_SCOPE.tenantId
      && protectedScope.parkId === DEFAULT_PLATFORM_SCOPE.parkId) {
      const fallbackBuilder = manager.getRepository(ParkEntity)
        .createQueryBuilder("park")
        .where("park.park_code = 'JH'")
        .andWhere("park.status = 1")
        .andWhere("park.is_deleted = false")
        .andWhere("park.id <> :removedParkId", { removedParkId: removedPark.id });
      if (await fallbackBuilder.getCount() === 1) {
        return;
      }
    }
    throw new ConflictException("Asset scope requires one active canonical park");
  }

  private async assertTenantParkLimit(scope: TenantParkScope, manager?: EntityManager): Promise<void> {
    const tenantRepository = manager?.getRepository(TenantEntity) ?? this.tenantRepository;
    const parkRepository = manager?.getRepository(ParkEntity) ?? this.parksRepository;
    const tenant = await tenantRepository.findOne({ where: { tenantId: scope.tenantId, isDeleted: false } });
    if (!tenant?.maxParks) {
      return;
    }
    const currentParks = await parkRepository.count({
      where: { tenantId: scope.tenantId, isDeleted: false }
    });
    if (currentParks >= tenant.maxParks) {
      throw new BadRequestException("Tenant park limit exceeded");
    }
  }

  private emptyToNull(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private numberToDecimal(value: number | undefined): string | null {
    return value === undefined ? null : String(value);
  }

  private toSnakeCase(value: string): string {
    return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
}
