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
    const builder = this.scopedBuilder(scope);
    await this.applyParkDataScope(builder, actor);

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
    const builder = this.scopedBuilder(scope).andWhere("park.id = :id", { id });
    await this.applyParkDataScope(builder, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Park not found");
    }
    return entity;
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateParkDto): Promise<ParkEntity> {
    return this.dataSource.transaction(async (manager) => {
    const parkCode = dto.parkCode.trim();
    await this.lockMutationScopes(manager, scope, true);
    await this.assertTenantParkLimit(scope, manager);
    await this.assertParkCodeAvailable(parkCode, undefined, manager);
    const protectedScope = await this.hasCanonicalProjectionContract(manager, scope);
    const defaultScopeProtected = parkCode === "JH" && await this.hasCanonicalProjectionContract(manager, DEFAULT_PLATFORM_SCOPE);
    const activeSources = await manager.getRepository(ParkEntity).count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, status: 1, isDeleted: false }
    });
    const nextActiveSources = activeSources + ((dto.status ?? 1) === 1 ? 1 : 0);
    const defaultFallbackSurvives = nextActiveSources === 0
      && scope.tenantId === DEFAULT_PLATFORM_SCOPE.tenantId
      && scope.parkId === DEFAULT_PLATFORM_SCOPE.parkId
      && await manager.getRepository(ParkEntity).count({
        where: { parkCode: "JH", status: 1, isDeleted: false }
      }) === 1;
    if (protectedScope && nextActiveSources !== 1 && !defaultFallbackSurvives) {
      throw new ConflictException("Asset scope requires one active canonical park");
    }
    const repository = manager.getRepository(ParkEntity);
    const entity = repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      parkCode,
      parkName: dto.parkName.trim(),
      address: this.emptyToNull(dto.address),
      province: this.emptyToNull(dto.province),
      city: this.emptyToNull(dto.city),
      district: this.emptyToNull(dto.district),
      lng: this.numberToDecimal(dto.lng),
      lat: this.numberToDecimal(dto.lat),
      totalArea: this.numberToDecimal(dto.totalArea) ?? "0",
      landArea: this.numberToDecimal(dto.landArea) ?? "0",
      status: dto.status ?? 1,
      remark: this.emptyToNull(dto.remark),
      createBy: actorId,
      updateBy: actorId
    });
    const saved = await repository.save(entity);
    if (protectedScope && saved.status === 1) await this.syncCanonicalAssetProjection(manager, scope, actorId);
    if (defaultScopeProtected && saved.status === 1) {
      await this.syncCanonicalAssetProjection(manager, DEFAULT_PLATFORM_SCOPE, actorId);
    }
    return saved;
    });
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateParkDto): Promise<ParkEntity> {
    await this.detail(scope, id, actor);
    return this.dataSource.transaction(async (manager) => {
    await this.lockMutationScopes(manager, scope, true);
    const repository = manager.getRepository(ParkEntity);
    const entity = await repository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!entity) throw new NotFoundException("Park not found");
    const wasActive = entity.status === 1;
    const nextCode = dto.parkCode?.trim();
    const touchesDefaultFallback = entity.parkCode === "JH" || nextCode === "JH";
    const protectedScope = await this.hasCanonicalProjectionContract(manager, scope);
    const defaultScopeProtected = touchesDefaultFallback && await this.hasCanonicalProjectionContract(manager, DEFAULT_PLATFORM_SCOPE);
    if (protectedScope && entity.status === 1 && dto.status !== undefined && dto.status !== 1) {
      await this.assertCanonicalSourceSurvives(manager, scope, entity);
    }
    const removesDefaultSource = dto.status !== undefined && dto.status !== 1;
    const renamesCrossScopeDefaultSource = nextCode !== undefined
      && nextCode !== "JH"
      && (entity.tenantId !== DEFAULT_PLATFORM_SCOPE.tenantId || entity.parkId !== DEFAULT_PLATFORM_SCOPE.parkId);
    if (defaultScopeProtected && entity.parkCode === "JH"
      && (removesDefaultSource || renamesCrossScopeDefaultSource)) {
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
    if (protectedScope) await this.syncCanonicalAssetProjection(manager, scope, actor.sub);
    if (defaultScopeProtected) {
      await this.syncCanonicalAssetProjection(manager, DEFAULT_PLATFORM_SCOPE, actor.sub);
    }
    const scopeRemainsActive = saved.status !== 1
      && await this.hasActiveCanonicalParkSource(manager, scope);
    if (wasActive && saved.status !== 1 && !scopeRemainsActive) {
      await this.tenantsService.reconcileDeactivatedParkAuthorization(manager, scope, actor.sub);
    }
    if (!wasActive && saved.status === 1) {
      await this.tenantsService.reconcileReactivatedParkAuthorization(manager, scope, actor.sub);
    }
    return saved;
    });
  }

  private async assertParkModuleAccess(scope: TenantParkScope): Promise<void> {
    const rows = await this.dataSource.query(
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
    const inactiveScopeSystem = systemEnabled
      && !await hasCanonicalActiveAssetParkSource(this.dataSource.manager, scope);
    if (!assetEnabled && !inactiveScopeSystem) {
      throw new ForbiddenException("Tenant module is not authorized");
    }
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    await this.detail(scope, id, actor);
    return this.dataSource.transaction(async (manager) => {
    await this.lockMutationScopes(manager, scope, true);
    const repository = manager.getRepository(ParkEntity);
    const entity = await repository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!entity) throw new NotFoundException("Park not found");
    const protectedDefault = entity.parkCode === "JH" && await this.hasCanonicalProjectionContract(manager, DEFAULT_PLATFORM_SCOPE);
    const protectedScope = await this.hasCanonicalProjectionContract(manager, scope);
    if (protectedScope) {
      await this.assertCanonicalSourceSurvives(manager, scope, entity);
    }
    if (protectedDefault) {
      await this.assertCanonicalSourceSurvives(manager, DEFAULT_PLATFORM_SCOPE, entity);
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await repository.save(entity);
    if (protectedScope) {
      await this.syncCanonicalAssetProjection(manager, scope, actor.sub);
    }
    if (protectedDefault) {
      await this.syncCanonicalAssetProjection(manager, DEFAULT_PLATFORM_SCOPE, actor.sub);
    }
    return { id };
    });
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<ParkEntity> {
    return this.parksRepository
      .createQueryBuilder("park")
      .where("park.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("park.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("park.is_deleted = false");
  }

  private async hasActiveCanonicalParkSource(
    manager: EntityManager,
    scope: TenantParkScope
  ): Promise<boolean> {
    return hasCanonicalActiveAssetParkSource(manager, scope);
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
