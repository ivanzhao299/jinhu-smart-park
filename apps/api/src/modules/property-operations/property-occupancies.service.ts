import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { UnitEntity } from "../units/entities/unit.entity";
import type {
  CheckPropertyAvailabilityDto,
  CreatePropertyOccupancyDto,
  PropertyOccupancyQueryDto,
  ReleasePropertyOccupancyDto
} from "./dto/property-occupancy.dto";
import { PropertyOccupancyEntity } from "./entities/property-occupancy.entity";
import { PropertyOperationConfigEntity } from "./entities/property-operation-config.entity";
import { normalizePropertyPeriod, occupancyDomainMatchesMode } from "./property-period.policy";
import { PropertyUnitAccessService } from "./property-unit-access.service";

export interface AvailabilityConflict {
  conflict_type: "occupancy" | "commercial_contract";
  source_domain: string;
  source_type: string;
  source_id: string;
  start_at: string;
  end_at: string;
  status: string;
}

@Injectable()
export class PropertyOccupanciesService {
  constructor(
    @InjectRepository(PropertyOccupancyEntity)
    private readonly occupanciesRepository: Repository<PropertyOccupancyEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(PropertyOperationConfigEntity)
    private readonly configsRepository: Repository<PropertyOperationConfigEntity>,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource
  ) {}

  async list(scope: TenantParkScope, actor: JwtPrincipal, query: PropertyOccupancyQueryDto): Promise<PaginatedResult<PropertyOccupancyEntity>> {
    const builder = this.occupanciesRepository.createQueryBuilder("occupancy")
      .where("occupancy.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("occupancy.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("occupancy.is_deleted = false");
    if (query.unit_id) builder.andWhere("occupancy.unit_id = :unitId", { unitId: query.unit_id });
    if (query.source_domain) builder.andWhere("occupancy.source_domain = :sourceDomain", { sourceDomain: query.source_domain });
    if (query.status) builder.andWhere("occupancy.status = :status", { status: query.status });
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null) {
      if (allowedUnitIds.length === 0) {
        return { items: [], total: 0, page: query.page, page_size: query.page_size };
      }
      builder.andWhere("occupancy.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    }
    const [items, total] = await builder.orderBy("occupancy.start_at", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async checkAvailability(scope: TenantParkScope, actor: JwtPrincipal, dto: CheckPropertyAvailabilityDto) {
    const period = normalizePropertyPeriod(dto.start_at, dto.end_at);
    await this.unitAccessService.assertAccess(scope, actor, dto.unit_id);
    const conflicts = await this.findConflicts(this.dataSource.manager, scope, dto.unit_id, period.startAt, period.endAt, {
      sourceType: dto.exclude_source_type,
      sourceId: dto.exclude_source_id
    });
    return { available: conflicts.length === 0, period: { start_at: period.startAt, end_at: period.endAt }, conflicts };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreatePropertyOccupancyDto, idempotencyKey?: string) {
    await this.unitAccessService.assertAccess(scope, actor, dto.unit_id);
    try {
      return await this.dataSource.transaction((manager) =>
        this.createInTransaction(manager, scope, actor, dto, idempotencyKey)
      );
    } catch (error) {
      if (this.isPostgresConflict(error)) {
        throw new ConflictException("Property occupancy conflicts with an existing active occupancy or source record");
      }
      throw error;
    }
  }

  async createInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreatePropertyOccupancyDto,
    idempotencyKey?: string
  ): Promise<PropertyOccupancyEntity> {
    const period = normalizePropertyPeriod(dto.start_at, dto.end_at);
    if (dto.status === "held") {
      const expiresAt = dto.hold_expires_at ? new Date(dto.hold_expires_at) : null;
      if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException("held occupancy requires hold_expires_at in the future");
      }
    }
    const unit = await manager.getRepository(UnitEntity).findOne({
      where: { id: dto.unit_id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!unit) throw new NotFoundException("Unit not found");
    await manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [scope.tenantId, scope.parkId, dto.unit_id]);
    await this.releaseExpiredHolds(manager, scope, actor, dto.unit_id);
    const config = await manager.getRepository(PropertyOperationConfigEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId: dto.unit_id, isDeleted: false }
    });
    const mode = config?.operatingMode ?? "none";
    if (!occupancyDomainMatchesMode(dto.source_domain, mode)) {
      throw new ConflictException(`Occupancy source domain ${dto.source_domain} is incompatible with operating mode ${mode}`);
    }
    if (
      ["commercial_leasing", "housing_rental", "homestay"].includes(dto.source_domain)
      && config?.operatingStatus !== "enabled"
    ) {
      throw new ConflictException("Business occupancy requires an enabled operating unit");
    }
    const conflicts = await this.findConflicts(manager, scope, dto.unit_id, period.startAt, period.endAt);
    if (conflicts.length > 0) {
      throw new ConflictException({ message: "Property occupancy conflicts with an existing period", conflicts });
    }
    const repository = manager.getRepository(PropertyOccupancyEntity);
    return repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      unitId: dto.unit_id,
      sourceDomain: dto.source_domain,
      sourceType: dto.source_type,
      sourceId: dto.source_id,
      startAt: period.startAt,
      endAt: period.endAt,
      status: dto.status,
      holdExpiresAt: dto.hold_expires_at ? new Date(dto.hold_expires_at) : null,
      idempotencyKey: idempotencyKey?.trim() || null,
      releaseReason: null,
      releasedAt: null,
      createBy: actor.sub,
      updateBy: actor.sub,
      remark: dto.remark?.trim() ?? null
    }));
  }

  async releaseInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    reason: string,
    finalStatus: "released" | "completed" | "cancelled" = "released"
  ): Promise<PropertyOccupancyEntity> {
    const repository = manager.getRepository(PropertyOccupancyEntity);
    const entity = await repository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!entity) throw new NotFoundException("Property occupancy not found");
    if (["released", "completed", "cancelled"].includes(entity.status)) return entity;
    entity.status = finalStatus;
    entity.releaseReason = reason.trim();
    entity.releasedAt = new Date();
    entity.updateBy = actor.sub;
    return repository.save(entity);
  }

  async activateInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<PropertyOccupancyEntity> {
    const repository = manager.getRepository(PropertyOccupancyEntity);
    const entity = await repository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!entity) throw new NotFoundException("Property occupancy not found");
    if (entity.status === "active") return entity;
    if (entity.status !== "held") throw new ConflictException("Only held occupancy can be activated");
    if (!entity.holdExpiresAt || entity.holdExpiresAt.getTime() <= Date.now()) {
      throw new ConflictException("Occupancy hold has expired");
    }
    const unit = await manager.getRepository(UnitEntity).findOne({
      where: { id: entity.unitId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!unit) throw new NotFoundException("Unit not found");
    await manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [
      scope.tenantId,
      scope.parkId,
      entity.unitId
    ]);
    const config = await manager.getRepository(PropertyOperationConfigEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId: entity.unitId, isDeleted: false },
      lock: { mode: "pessimistic_read" }
    });
    const mode = config?.operatingMode ?? "none";
    if (!occupancyDomainMatchesMode(entity.sourceDomain, mode)) {
      throw new ConflictException(`Occupancy source domain ${entity.sourceDomain} is incompatible with operating mode ${mode}`);
    }
    if (
      ["commercial_leasing", "housing_rental", "homestay"].includes(entity.sourceDomain)
      && config?.operatingStatus !== "enabled"
    ) {
      throw new ConflictException("Business occupancy requires an enabled operating unit");
    }
    entity.status = "active";
    entity.updateBy = actor.sub;
    return repository.save(entity);
  }

  async replacePeriodInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    startAtValue: string,
    endAtValue: string,
    status: "held" | "active",
    holdExpiresAtValue?: string
  ): Promise<PropertyOccupancyEntity> {
    const period = normalizePropertyPeriod(startAtValue, endAtValue);
    const repository = manager.getRepository(PropertyOccupancyEntity);
    const entity = await repository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!entity) throw new NotFoundException("Property occupancy not found");
    await manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [scope.tenantId, scope.parkId, entity.unitId]);
    await this.releaseExpiredHolds(manager, scope, actor, entity.unitId);
    const config = await manager.getRepository(PropertyOperationConfigEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId: entity.unitId, isDeleted: false }
    });
    const mode = config?.operatingMode ?? "none";
    if (!occupancyDomainMatchesMode(entity.sourceDomain, mode)) {
      throw new ConflictException(`Occupancy source domain ${entity.sourceDomain} is incompatible with operating mode ${mode}`);
    }
    if (
      ["commercial_leasing", "housing_rental", "homestay"].includes(entity.sourceDomain)
      && config?.operatingStatus !== "enabled"
    ) {
      throw new ConflictException("Business occupancy requires an enabled operating unit");
    }
    const conflicts = await this.findConflicts(manager, scope, entity.unitId, period.startAt, period.endAt, {
      sourceType: entity.sourceType,
      sourceId: entity.sourceId
    });
    if (conflicts.length > 0) {
      throw new ConflictException({ message: "Property occupancy conflicts with an existing period", conflicts });
    }
    const holdExpiresAt = holdExpiresAtValue ? new Date(holdExpiresAtValue) : null;
    if (status === "held" && (!holdExpiresAt || holdExpiresAt.getTime() <= Date.now())) {
      throw new BadRequestException("held occupancy requires hold_expires_at in the future");
    }
    entity.startAt = period.startAt;
    entity.endAt = period.endAt;
    entity.status = status;
    entity.holdExpiresAt = holdExpiresAt;
    entity.releaseReason = null;
    entity.releasedAt = null;
    entity.updateBy = actor.sub;
    return repository.save(entity);
  }

  private async releaseExpiredHolds(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string
  ): Promise<void> {
    await manager.getRepository(PropertyOccupancyEntity)
      .createQueryBuilder()
      .update(PropertyOccupancyEntity)
      .set({
        status: "released",
        releaseReason: "hold_expired",
        releasedAt: new Date(),
        updateBy: actor.sub
      })
      .where("tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("park_id = :parkId", { parkId: scope.parkId })
      .andWhere("unit_id = :unitId", { unitId })
      .andWhere("is_deleted = false")
      .andWhere("status = 'held'")
      .andWhere("hold_expires_at <= now()")
      .execute();
  }

  async activate(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    const entity = await this.mustFindOccupancy(scope, id);
    await this.unitAccessService.assertAccess(scope, actor, entity.unitId);
    return this.dataSource.transaction((manager) =>
      this.activateInTransaction(manager, scope, actor, id)
    );
  }

  async release(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ReleasePropertyOccupancyDto) {
    if (dto.force && !this.hasPermission(actor, SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_FORCE_RELEASE)) {
      throw new ForbiddenException("property_occupancy:force_release permission is required");
    }
    const entity = await this.mustFindOccupancy(scope, id);
    await this.unitAccessService.assertAccess(scope, actor, entity.unitId);
    if (["released", "completed", "cancelled"].includes(entity.status)) return entity;
    if (!dto.force && ["commercial_leasing", "housing_rental", "homestay"].includes(entity.sourceDomain)) {
      throw new ConflictException("Business-owned occupancy must be released by its source workflow or force released");
    }
    entity.status = "released";
    entity.releaseReason = dto.reason.trim();
    entity.releasedAt = new Date();
    entity.updateBy = actor.sub;
    return this.occupanciesRepository.save(entity);
  }

  private async findConflicts(
    manager: EntityManager,
    scope: TenantParkScope,
    unitId: string,
    startAt: Date,
    endAt: Date,
    exclude?: { sourceType?: string; sourceId?: string }
  ): Promise<AvailabilityConflict[]> {
    return manager.query(
      `SELECT 'occupancy'::text AS conflict_type,
              source_domain, source_type, source_id,
              start_at::text, end_at::text, status
       FROM biz_property_occupancy
       WHERE tenant_id = $1 AND park_id = $2 AND unit_id = $3
         AND is_deleted = false
         AND (status = 'active' OR (status = 'held' AND (hold_expires_at IS NULL OR hold_expires_at > now())))
         AND start_at < $5::timestamptz AND end_at > $4::timestamptz
         AND NOT ($6::text IS NOT NULL AND $7::text IS NOT NULL AND source_type = $6 AND source_id = $7)
       UNION ALL
       SELECT 'commercial_contract'::text AS conflict_type,
              'commercial_leasing'::text AS source_domain,
              'leasing_contract'::text AS source_type,
              contract.id::text AS source_id,
              (relation.start_date::timestamp AT TIME ZONE 'Asia/Shanghai')::text AS start_at,
              ((relation.end_date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')::text AS end_at,
              contract.status
       FROM rel_leasing_contract_unit relation
       JOIN biz_leasing_contract contract ON contract.id = relation.contract_id
       WHERE relation.tenant_id = $1 AND relation.park_id = $2 AND relation.unit_id = $3
         AND relation.is_deleted = false AND relation.status = 1
         AND contract.is_deleted = false AND contract.status NOT IN ('90', '91')
         AND (relation.start_date::timestamp AT TIME ZONE 'Asia/Shanghai') < $5::timestamptz
         AND ((relation.end_date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai') > $4::timestamptz
         AND NOT ($6::text = 'leasing_contract' AND contract.id::text = $7::text)
       ORDER BY start_at`,
      [scope.tenantId, scope.parkId, unitId, startAt.toISOString(), endAt.toISOString(), exclude?.sourceType ?? null, exclude?.sourceId ?? null]
    ) as Promise<AvailabilityConflict[]>;
  }

  private async mustFindOccupancy(scope: TenantParkScope, id: string): Promise<PropertyOccupancyEntity> {
    const entity = await this.occupanciesRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!entity) throw new NotFoundException("Property occupancy not found");
    return entity;
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }

  private isPostgresConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const code = (error as { code?: unknown }).code;
    return code === "23P01" || code === "23505";
  }
}
