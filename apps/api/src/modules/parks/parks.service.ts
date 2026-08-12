import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { Brackets, type DataSource, type EntityManager, type SelectQueryBuilder, type Repository } from "typeorm";
import {
  ensureAssetScopeProvisioned,
  hasAssetParkProjection,
  hasProtectedAssetScope,
  lockAssetScope
} from "../assets/asset-scope-provisioning";
import { DEFAULT_PLATFORM_SCOPE } from "../../shared/constants/platform-scope";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { TenantEntity } from "../tenants/entities/tenant.entity";
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
    private readonly dataScopeService: DataScopeService
  ) {}

  async list(scope: TenantParkScope, query: ParkQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<ParkEntity>> {
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
    await lockAssetScope(manager, scope);
    await this.assertTenantParkLimit(scope, manager);
    const parkCode = dto.parkCode.trim();
    if (parkCode === "JH") await lockAssetScope(manager, DEFAULT_PLATFORM_SCOPE);
    await this.assertParkCodeAvailable(parkCode, undefined, manager);
    const protectedScope = await this.hasCanonicalProjectionContract(manager, scope);
    const defaultScopeProtected = parkCode === "JH" && await this.hasCanonicalProjectionContract(manager, DEFAULT_PLATFORM_SCOPE);
    const activeSources = await manager.getRepository(ParkEntity).count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, status: 1, isDeleted: false }
    });
    if (protectedScope && (dto.status === 0 || activeSources > 0)) {
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
    if (protectedScope && saved.status === 1) await ensureAssetScopeProvisioned(manager, scope, actorId);
    if (defaultScopeProtected && saved.status === 1) {
      await ensureAssetScopeProvisioned(manager, DEFAULT_PLATFORM_SCOPE, actorId);
    }
    return saved;
    });
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateParkDto): Promise<ParkEntity> {
    await this.detail(scope, id, actor);
    return this.dataSource.transaction(async (manager) => {
    await lockAssetScope(manager, scope);
    const repository = manager.getRepository(ParkEntity);
    const entity = await repository.findOne({ where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    if (!entity) throw new NotFoundException("Park not found");
    const nextCode = dto.parkCode?.trim();
    const touchesDefaultFallback = entity.parkCode === "JH" || nextCode === "JH";
    if (touchesDefaultFallback) await lockAssetScope(manager, DEFAULT_PLATFORM_SCOPE);
    const protectedScope = await this.hasCanonicalProjectionContract(manager, scope);
    const defaultScopeProtected = touchesDefaultFallback && await this.hasCanonicalProjectionContract(manager, DEFAULT_PLATFORM_SCOPE);
    if ((protectedScope || defaultScopeProtected) && dto.status === 0) {
      throw new ConflictException("Asset scope requires one active canonical park");
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
    if (protectedScope && saved.status === 1) await ensureAssetScopeProvisioned(manager, scope, actor.sub);
    if (defaultScopeProtected && saved.status === 1) {
      await ensureAssetScopeProvisioned(manager, DEFAULT_PLATFORM_SCOPE, actor.sub);
    }
    return saved;
    });
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    await this.detail(scope, id, actor);
    return this.dataSource.transaction(async (manager) => {
    await lockAssetScope(manager, scope);
    const repository = manager.getRepository(ParkEntity);
    const entity = await repository.findOne({ where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    if (!entity) throw new NotFoundException("Park not found");
    if (entity.parkCode === "JH") await lockAssetScope(manager, DEFAULT_PLATFORM_SCOPE);
    const protectedDefault = entity.parkCode === "JH" && await this.hasCanonicalProjectionContract(manager, DEFAULT_PLATFORM_SCOPE);
    if (await this.hasCanonicalProjectionContract(manager, scope) || protectedDefault) {
      throw new ConflictException("Asset scope requires one active canonical park");
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await repository.save(entity);
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
