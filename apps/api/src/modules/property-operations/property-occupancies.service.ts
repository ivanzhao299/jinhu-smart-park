import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  isPropertyManagedOccupancyDomain,
  SYSTEM_PERMISSIONS,
  type PropertyApprovalCommandPort,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { UnitEntity } from "../units/entities/unit.entity";
import type {
  CheckPropertyAvailabilityDto,
  CreatePropertyOccupancyDto,
  PropertyOccupancyQueryDto,
  ReleasePropertyOccupancyDto
} from "./dto/property-occupancy.dto";
import { PropertyOccupancyEntity } from "./entities/property-occupancy.entity";
import { PropertyOperationConfigEntity } from "./entities/property-operation-config.entity";
import {
  assertPropertyOccupancyReplaceable,
  normalizePropertyPeriod,
  occupancyDomainMatchesMode
} from "./property-period.policy";
import type { OccupancyReplacementInput } from "./property-occupancy.port";
import { PropertyUnitAccessService } from "./property-unit-access.service";

export interface AvailabilityConflict {
  conflict_type: "occupancy" | "commercial_contract" | "operations_task";
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
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands: PropertyApprovalCommandPort,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource
  ) {}

  async list(scope: TenantParkScope, actor: JwtPrincipal, query: PropertyOccupancyQueryDto) {
    this.assertExactPageAndAction(
      actor,
      SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
      SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_READ
    );
    const startFrom = query.startFrom ? new Date(query.startFrom) : null;
    const endTo = query.endTo ? new Date(query.endTo) : null;
    if (startFrom && endTo && startFrom.getTime() > endTo.getTime()) {
      throw new BadRequestException({
        message: "startFrom must not be later than endTo",
        errorCode: "property-validation-failed"
      });
    }
    const builder = this.occupanciesRepository.createQueryBuilder("occupancy")
      .leftJoinAndMapOne(
        "occupancy.unit",
        UnitEntity,
        "unit",
        `unit.id = occupancy.unit_id
          AND unit.tenant_id = occupancy.tenant_id
          AND unit.park_id = occupancy.park_id
          AND unit.is_deleted = false`
      )
      .where("occupancy.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("occupancy.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("occupancy.is_deleted = false");
    if (query.unitId) builder.andWhere("occupancy.unit_id = :unitId", { unitId: query.unitId });
    if (query.sourceDomain) builder.andWhere("occupancy.source_domain = :sourceDomain", { sourceDomain: query.sourceDomain });
    if (query.sourceType) builder.andWhere("occupancy.source_type = :sourceType", { sourceType: query.sourceType });
    if (query.status) builder.andWhere("occupancy.status = :status", { status: query.status });
    if (startFrom) builder.andWhere("occupancy.end_at >= :startFrom", { startFrom });
    if (endTo) builder.andWhere("occupancy.start_at <= :endTo", { endTo });
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null) {
      if (allowedUnitIds.length === 0) {
        return {
          items: [],
          total: 0,
          page: query.page,
          pageSize: query.pageSize,
          allowedActions: []
        };
      }
      builder.andWhere("occupancy.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    }
    const sortColumns = {
      startAt: "occupancy.startAt",
      endAt: "occupancy.endAt",
      updateTime: "occupancy.updateTime"
    } as const;
    const [items, total] = await builder
      .orderBy(sortColumns[query.sort], query.order === "asc" ? "ASC" : "DESC")
      .addOrderBy("occupancy.id", "ASC")
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    return {
      items: items.map((item) => this.projectOccupancy(actor, item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      allowedActions: []
    };
  }

  async detail(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    this.assertExactPageAndAction(
      actor,
      SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
      SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_READ
    );
    const entity = await this.mustFindOccupancy(scope, id);
    await this.unitAccessService.assertAccess(scope, actor, entity.unitId);
    return this.projectOccupancy(actor, entity);
  }

  async checkAvailability(scope: TenantParkScope, actor: JwtPrincipal, dto: CheckPropertyAvailabilityDto) {
    this.assertExactPageAndAction(
      actor,
      SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
      SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_READ
    );
    if (Boolean(dto.excludeSourceType) !== Boolean(dto.excludeSourceId)) {
      throw new BadRequestException({
        message: "excludeSourceType and excludeSourceId must be supplied together",
        errorCode: "property-validation-failed"
      });
    }
    const period = normalizePropertyPeriod(dto.startAt, dto.endAt);
    await this.unitAccessService.assertAccess(scope, actor, dto.unitId);
    const conflicts = await this.findConflicts(this.dataSource.manager, scope, dto.unitId, period.startAt, period.endAt, {
      sourceType: dto.excludeSourceType,
      sourceId: dto.excludeSourceId
    });
    return {
      available: conflicts.length === 0,
      period: {
        startAt: period.startAt.toISOString(),
        endAt: period.endAt.toISOString()
      },
      conflicts: conflicts.map((conflict) => this.projectConflict(actor, conflict)),
      allowedActions: []
    };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreatePropertyOccupancyDto, idempotencyKey?: string) {
    await this.unitAccessService.assertAccess(scope, actor, dto.unit_id);
    if (isPropertyManagedOccupancyDomain(dto.source_domain)) {
      throw new ForbiddenException("Business-owned occupancies must be created by their owning domain workflow");
    }
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
    idempotencyKey?: string,
    exclude?: { sourceType?: string; sourceId?: string }
  ): Promise<PropertyOccupancyEntity> {
    const period = normalizePropertyPeriod(dto.start_at, dto.end_at);
    if (dto.status === "held") {
      const expiresAt = dto.hold_expires_at ? new Date(dto.hold_expires_at) : null;
      if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException("held occupancy requires hold_expires_at in the future");
      }
    }
    await manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [scope.tenantId, scope.parkId, dto.unit_id]);
    const unit = await manager.getRepository(UnitEntity).findOne({
      where: { id: dto.unit_id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!unit) throw new NotFoundException("Unit not found");
    if (
      isPropertyManagedOccupancyDomain(dto.source_domain)
      && unit.status !== 1
    ) {
      throw new ConflictException("Business occupancy requires an active unit");
    }
    await this.releaseExpiredHolds(manager, scope, actor, dto.unit_id);
    const config = await manager.getRepository(PropertyOperationConfigEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId: dto.unit_id, isDeleted: false }
    });
    const mode = config?.operatingMode ?? "none";
    if (!occupancyDomainMatchesMode(dto.source_domain, mode)) {
      throw new ConflictException(`Occupancy source domain ${dto.source_domain} is incompatible with operating mode ${mode}`);
    }
    if (
      isPropertyManagedOccupancyDomain(dto.source_domain)
      && config?.operatingStatus !== "enabled"
    ) {
      throw new ConflictException("Business occupancy requires an enabled operating unit");
    }
    const conflicts = await this.findConflicts(
      manager,
      scope,
      dto.unit_id,
      period.startAt,
      period.endAt,
      exclude
    );
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
    const candidate = await repository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!candidate) throw new NotFoundException("Property occupancy not found");
    await manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [
      scope.tenantId,
      scope.parkId,
      candidate.unitId
    ]);
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
    const candidate = await repository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!candidate) throw new NotFoundException("Property occupancy not found");
    await manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [
      scope.tenantId,
      scope.parkId,
      candidate.unitId
    ]);
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
    if (
      isPropertyManagedOccupancyDomain(entity.sourceDomain)
      && unit.status !== 1
    ) {
      throw new ConflictException("Business occupancy requires an active unit");
    }
    const config = await manager.getRepository(PropertyOperationConfigEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId: entity.unitId, isDeleted: false },
      lock: { mode: "pessimistic_read" }
    });
    const mode = config?.operatingMode ?? "none";
    if (!occupancyDomainMatchesMode(entity.sourceDomain, mode)) {
      throw new ConflictException(`Occupancy source domain ${entity.sourceDomain} is incompatible with operating mode ${mode}`);
    }
    if (
      isPropertyManagedOccupancyDomain(entity.sourceDomain)
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
    expected: OccupancyReplacementInput,
    startAtValue: string,
    endAtValue: string,
    holdExpiresAtValue?: string
  ): Promise<PropertyOccupancyEntity> {
    const period = normalizePropertyPeriod(startAtValue, endAtValue);
    const expectedPeriod = normalizePropertyPeriod(expected.startAt, expected.endAt);
    const repository = manager.getRepository(PropertyOccupancyEntity);
    const candidate = await repository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!candidate) throw new NotFoundException("Property occupancy not found");
    await manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [scope.tenantId, scope.parkId, candidate.unitId]);
    const entity = await repository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!entity) throw new NotFoundException("Property occupancy not found");
    assertPropertyOccupancyReplaceable(entity, {
      ...expected,
      startAt: expectedPeriod.startAt,
      endAt: expectedPeriod.endAt
    });
    const unit = await manager.getRepository(UnitEntity).findOne({
      where: { id: entity.unitId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!unit) throw new NotFoundException("Unit not found");
    if (
      isPropertyManagedOccupancyDomain(entity.sourceDomain)
      && unit.status !== 1
    ) {
      throw new ConflictException("Business occupancy requires an active unit");
    }
    await this.releaseExpiredHolds(manager, scope, actor, entity.unitId);
    const config = await manager.getRepository(PropertyOperationConfigEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId: entity.unitId, isDeleted: false }
    });
    const mode = config?.operatingMode ?? "none";
    if (!occupancyDomainMatchesMode(entity.sourceDomain, mode)) {
      throw new ConflictException(`Occupancy source domain ${entity.sourceDomain} is incompatible with operating mode ${mode}`);
    }
    if (
      isPropertyManagedOccupancyDomain(entity.sourceDomain)
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
    if (entity.status === "held" && (!holdExpiresAt || holdExpiresAt.getTime() <= Date.now())) {
      throw new BadRequestException("held occupancy requires hold_expires_at in the future");
    }
    entity.startAt = period.startAt;
    entity.endAt = period.endAt;
    entity.holdExpiresAt = entity.status === "held" ? holdExpiresAt : null;
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
    if (isPropertyManagedOccupancyDomain(entity.sourceDomain)) {
      throw new ForbiddenException("Business-owned occupancies must be activated by their owning domain workflow");
    }
    return this.dataSource.transaction((manager) =>
      this.activateInTransaction(manager, scope, actor, id)
    );
  }

  async release(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: ReleasePropertyOccupancyDto,
    clientKey: string
  ) {
    if (dto.force) {
      this.assertActionPermission(actor, SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_FORCE_RELEASE);
      this.assertActionPermission(actor, SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE);
      const existing = await this.mustFindOccupancy(scope, id);
      await this.unitAccessService.assertAccess(scope, actor, existing.unitId);
      if (["released", "completed", "cancelled"].includes(existing.status)) return existing;
      return this.dataSource.transaction(async (manager) => {
        const entity = await manager.getRepository(PropertyOccupancyEntity).findOne({
          where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
          lock: { mode: "pessimistic_write" }
        });
        if (!entity) throw new NotFoundException("Property occupancy not found");
        return this.approvalCommands.createPendingRequest(
          { transactionContext: manager },
          {
            contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
            scope,
            actionId: "property.occupancy.force-release.request",
            sourceType: "property-occupancy",
            sourceId: entity.id,
            sourceExpectedVersion: entity.version,
            requesterId: actor.sub,
            submitterId: actor.sub,
            actorId: actor.sub,
            clientKey,
            businessIntentKey: `property-occupancy-release:${entity.id}:${entity.version}`,
            canonicalPayload: {
              occupancyId: entity.id,
              unitId: entity.unitId,
              sourceDomain: entity.sourceDomain,
              sourceType: entity.sourceType,
              sourceId: entity.sourceId,
              fromStatus: entity.status,
              toStatus: "released",
              reason: dto.reason.trim()
            },
            payloadSchemaVersion: 1,
            amount: null,
            currency: null
          }
        );
      });
    }

    this.assertActionPermission(actor, SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_RELEASE);
    const entity = await this.mustFindOccupancy(scope, id);
    await this.unitAccessService.assertAccess(scope, actor, entity.unitId);
    if (["released", "completed", "cancelled"].includes(entity.status)) return entity;
    if (!dto.force && isPropertyManagedOccupancyDomain(entity.sourceDomain)) {
      throw new ConflictException("Business-owned occupancy must be released by its source workflow or force released");
    }
    return this.dataSource.transaction((manager) =>
      this.releaseInTransaction(manager, scope, actor, id, dto.reason)
    );
  }

  async executeApprovedForceRelease(input: {
    manager: EntityManager;
    requestId: string;
    executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>;
    sourceExpectedVersion: number;
    request: {
      tenantId: string;
      parkId: string;
      sourceId: string;
      sourceExpectedVersion: number;
    };
  }): Promise<void> {
    const payload = input.canonicalPayload;
    const occupancyId = this.requiredUuidPayload(payload, "occupancyId");
    const unitId = this.requiredUuidPayload(payload, "unitId");
    const reason = String(payload.reason ?? "").trim();
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    if (
      !reason
      || occupancyId !== input.request.sourceId
      || input.sourceExpectedVersion !== input.request.sourceExpectedVersion
    ) throw new ConflictException("Approval source changed");
    await input.manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [
      scope.tenantId, scope.parkId, unitId
    ]);
    const rows = await input.manager.query(
      `SELECT id::text AS id, unit_id::text AS "unitId", source_domain AS "sourceDomain",
              source_type AS "sourceType", source_id AS "sourceId", status, version
         FROM biz_property_occupancy
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, occupancyId]
    ) as Array<{
      id: string; unitId: string; sourceDomain: string; sourceType: string;
      sourceId: string; status: string; version: number;
    }>;
    const occupancy = rows[0];
    if (
      !occupancy
      || occupancy.unitId !== unitId
      || occupancy.sourceDomain !== payload.sourceDomain
      || occupancy.sourceType !== payload.sourceType
      || occupancy.sourceId !== payload.sourceId
      || occupancy.status !== payload.fromStatus
      || payload.toStatus !== "released"
      || occupancy.version !== input.sourceExpectedVersion
      || !["held", "active"].includes(occupancy.status)
    ) throw new ConflictException("Approval source changed");
    const manifests = await input.manager.query(
      `SELECT invariant_hash AS "effectHash", effect_line_key AS "effectLineKey"
         FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3
          AND effect_kind='property.occupancy.force.release'`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ effectHash: string; effectLineKey: string }>;
    const manifest = manifests[0];
    if (!manifest) throw new ConflictException("Approval effect manifest missing");
    const updated = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_property_occupancy
          SET status='released', release_reason=$5, released_at=clock_timestamp(),
              update_time=clock_timestamp(),
              update_by=(SELECT requester_id FROM biz_property_approval_request
                          WHERE tenant_id=$1 AND park_id=$2 AND id=$6),
              version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
        RETURNING version`,
      [
        scope.tenantId,
        scope.parkId,
        occupancyId,
        input.sourceExpectedVersion,
        reason,
        input.requestId
      ]
    ));
    if (updated.length !== 1 || updated[0]!.version !== input.sourceExpectedVersion + 1) {
      throw new ConflictException("Approval source changed");
    }
    const inserted = typeormQueryRows<{ id: string }>(await input.manager.query(
      `INSERT INTO biz_property_occupancy_release_audit(
         tenant_id,park_id,occupancy_id,reason,released_by,released_at,
         source_domain,source_type,source_id,from_status,to_status,
         source_expected_version,resulting_version,approval_execution_key,
         approval_effect_kind,approval_effect_line_key,approval_effect_hash)
       SELECT $1,$2,$3,$4,request.requester_id,clock_timestamp(),$5,$6,$7,$8,'released',
              $9,$10,$11,'property.occupancy.force.release',$12,$13
         FROM biz_property_approval_request request
        WHERE request.tenant_id=$1 AND request.park_id=$2 AND request.id=$14
       RETURNING id::text AS id`,
      [
        scope.tenantId, scope.parkId, occupancyId, reason, occupancy.sourceDomain,
        occupancy.sourceType, occupancy.sourceId, occupancy.status,
        input.sourceExpectedVersion, input.sourceExpectedVersion + 1,
        input.executionIdempotencyKey, manifest.effectLineKey, manifest.effectHash,
        input.requestId
      ]
    ));
    if (inserted.length !== 1) {
      throw new ConflictException("Approval effect cardinality mismatch");
    }
  }

  private requiredUuidPayload(payload: Readonly<Record<string, unknown>>, field: string): string {
    const value = payload[field];
    if (
      typeof value !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ) throw new ConflictException("Approval payload is invalid");
    return value;
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
          AND NOT (
            $6::text IS NOT NULL AND $7::text IS NOT NULL
            AND $6::text = 'leasing_contract' AND contract.id::text = $7::text
          )
       UNION ALL
       SELECT 'operations_task'::text AS conflict_type,
              'operations'::text AS source_domain,
              'homestay_turnover'::text AS source_type,
              task.id::text AS source_id,
              task.create_time::text AS start_at,
              'infinity'::timestamptz::text AS end_at,
              task.status
       FROM biz_homestay_turnover_task task
       WHERE task.tenant_id = $1 AND task.park_id = $2 AND task.unit_id = $3
         AND task.is_deleted = false AND task.status <> 'completed'
         AND NOT (
           $6::text IS NOT NULL AND $7::text IS NOT NULL
           AND $6::text = 'homestay_turnover' AND task.id::text = $7::text
         )
       ORDER BY start_at`,
      [scope.tenantId, scope.parkId, unitId, startAt.toISOString(), endAt.toISOString(), exclude?.sourceType ?? null, exclude?.sourceId ?? null]
    ) as Promise<AvailabilityConflict[]>;
  }

  private async mustFindOccupancy(scope: TenantParkScope, id: string): Promise<PropertyOccupancyEntity> {
    const entity = await this.occupanciesRepository.createQueryBuilder("occupancy")
      .leftJoinAndMapOne(
        "occupancy.unit",
        UnitEntity,
        "unit",
        `unit.id = occupancy.unit_id
          AND unit.tenant_id = occupancy.tenant_id
          AND unit.park_id = occupancy.park_id
          AND unit.is_deleted = false`
      )
      .where("occupancy.id = :id", { id })
      .andWhere("occupancy.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("occupancy.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("occupancy.is_deleted = false")
      .getOne();
    if (!entity) throw new NotFoundException("Property occupancy not found");
    return entity;
  }

  private projectOccupancy(
    actor: JwtPrincipal,
    entity: PropertyOccupancyEntity
  ) {
    const source = this.projectSource(actor, entity.sourceDomain, entity.sourceId);
    return {
      id: entity.id,
      unitId: entity.unitId,
      unitCode: entity.unit?.unitCode ?? entity.unitId,
      unitName: entity.unit?.unitName ?? entity.unitId,
      sourceDomain: entity.sourceDomain,
      sourceType: entity.sourceType,
      sourceLabel: this.sourceLabel(entity.sourceDomain, entity.sourceType),
      ...source,
      startAt: entity.startAt.toISOString(),
      endAt: entity.endAt.toISOString(),
      status: entity.status,
      holdExpiresAt: entity.holdExpiresAt?.toISOString() ?? null,
      releaseReason: entity.releaseReason,
      releasedAt: entity.releasedAt?.toISOString() ?? null,
      version: entity.version,
      updateTime: entity.updateTime.toISOString(),
      canRequestForceRelease: false,
      approval: null,
      approvalAvailable: false,
      allowedActions: []
    };
  }

  private projectConflict(actor: JwtPrincipal, conflict: AvailabilityConflict) {
    const source = this.projectSource(
      actor,
      conflict.source_domain,
      conflict.source_id
    );
    return {
      conflictType: conflict.conflict_type,
      sourceDomain: conflict.source_domain,
      sourceType: conflict.source_type,
      sourceLabel: this.sourceLabel(conflict.source_domain, conflict.source_type),
      ...source,
      startAt: conflict.start_at,
      endAt: conflict.end_at,
      status: conflict.status
    };
  }

  private projectSource(
    actor: JwtPrincipal,
    sourceDomain: string,
    sourceId: string
  ): { sourceId?: string; deepLink?: string } {
    const rules: Record<string, {
      permissions: readonly string[];
      build: (id: string) => string;
    }> = {
      homestay: {
        permissions: [
          SYSTEM_PERMISSIONS.HOMESTAY_BOOKINGS_PAGE,
          SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ
        ],
        build: (id) => `/homestay/bookings/${encodeURIComponent(id)}`
      },
      housing_rental: {
        permissions: [
          SYSTEM_PERMISSIONS.HOUSING_LEASES_PAGE,
          SYSTEM_PERMISSIONS.HOUSING_LEASE_READ
        ],
        build: (id) => `/housing/leases/${encodeURIComponent(id)}`
      }
    };
    const rule = rules[sourceDomain];
    if (sourceDomain === "maintenance" || sourceDomain === "operations") {
      return { sourceId };
    }
    const hasGlobalPermission = actor.isSuper === true || actor.permissions.includes("*");
    if (!rule || (!hasGlobalPermission && !rule.permissions.every((permission) =>
      actor.permissions.includes(permission)
    ))) {
      return {};
    }
    return { sourceId, deepLink: rule.build(sourceId) };
  }

  private sourceLabel(sourceDomain: string, sourceType: string): string {
    const labels: Record<string, string> = {
      commercial_leasing: "商业租赁",
      homestay: "民宿",
      housing_rental: "住房出租",
      maintenance: "维修",
      operations: "运营"
    };
    return labels[sourceDomain] ?? sourceType;
  }

  private assertExactPageAndAction(
    actor: JwtPrincipal,
    pagePermission: string,
    actionPermission: string
  ): void {
    if (!this.hasPermission(actor, pagePermission)) {
      throw new ForbiddenException({
        message: "Property page access is forbidden",
        errorCode: "property-action-forbidden"
      });
    }
    this.assertActionPermission(actor, actionPermission);
  }

  private assertActionPermission(actor: JwtPrincipal, permission: string): void {
    if (!this.hasPermission(actor, permission)) {
      throw new ForbiddenException({
        message: "Property action is forbidden",
        errorCode: "property-action-forbidden"
      });
    }
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
