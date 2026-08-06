import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  SYSTEM_PERMISSIONS,
  type PropertyApprovalCommandPort,
  type PropertyOperatingMode,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { AssetUnitEntity } from "../assets/entities/asset-unit.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import type { ConfigurePropertyUnitDto } from "./dto/configure-property-unit.dto";
import type {
  PropertyModeTransitionListQueryDto,
  PropertyOperationListQueryDto
} from "./dto/property-control.dto";
import type { TransitionOperatingModeDto } from "./dto/transition-operating-mode.dto";
import { PropertyModeTransitionLogEntity } from "./entities/property-mode-transition-log.entity";
import { PropertyOccupancyEntity } from "./entities/property-occupancy.entity";
import { PropertyOperationConfigEntity } from "./entities/property-operation-config.entity";
import { PropertyUnitAccessService } from "./property-unit-access.service";
import { propertyApprovalCanonicalHash } from "../property-approvals/property-approval.service";

type ModeTransitionCheckSnapshot = {
  checked_at: string;
  active_occupancy_count: number;
  incompatible_occupancy_count: number;
  maintenance_or_operations_count: number;
  commercial_contract_count: number;
  housing_lease_count: number;
  homestay_booking_count: number;
  pending_checkout_count: number;
  open_workorder_count: number;
  unsettled_receivable_count: number;
  blocking_reasons: string[];
};

@Injectable()
export class PropertyOperationsService {
  constructor(
    @InjectRepository(PropertyOperationConfigEntity)
    private readonly configsRepository: Repository<PropertyOperationConfigEntity>,
    @InjectRepository(PropertyModeTransitionLogEntity)
    private readonly transitionLogsRepository: Repository<PropertyModeTransitionLogEntity>,
    @InjectRepository(PropertyOccupancyEntity)
    private readonly occupanciesRepository: Repository<PropertyOccupancyEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(AssetUnitEntity)
    private readonly assetUnitsRepository: Repository<AssetUnitEntity>,
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands: PropertyApprovalCommandPort,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource
  ) {}

  async list(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: PropertyOperationListQueryDto
  ) {
    this.assertExactPageAndAction(
      actor,
      SYSTEM_PERMISSIONS.PROPERTY_OPERATIONS_PAGE,
      SYSTEM_PERMISSIONS.PROPERTY_OPERATION_READ
    );
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds?.length === 0) {
      return {
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        allowedActions: this.operationAllowedActions(actor)
      };
    }

    const builder = this.unitsRepository
      .createQueryBuilder("unit")
      .leftJoin(
        PropertyOperationConfigEntity,
        "config",
        "config.tenant_id = unit.tenant_id AND config.park_id = unit.park_id AND config.unit_id = unit.id AND config.is_deleted = false"
      )
      .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("unit.is_deleted = false");
    if (allowedUnitIds !== null) {
      builder.andWhere("unit.id IN (:...allowedUnitIds)", { allowedUnitIds });
    }
    if (query.keyword) {
      builder.andWhere(
        "(unit.unit_code ILIKE :keyword OR unit.unit_name ILIKE :keyword)",
        { keyword: `%${query.keyword}%` }
      );
    }
    if (query.buildingId) {
      builder.andWhere("unit.building_id = :buildingId", {
        buildingId: query.buildingId
      });
    }
    if (query.configuredMode) {
      builder.andWhere("COALESCE(config.operating_mode, 'none') = :configuredMode", {
        configuredMode: query.configuredMode
      });
    }
    if (query.operationStatus) {
      builder.andWhere(
        "COALESCE(config.operating_status, 'enabled') = :operationStatus",
        { operationStatus: query.operationStatus }
      );
    }
    if (query.blockerCode) {
      this.applyBlockerFilter(builder, query.blockerCode);
    }

    const sortColumns = {
      unitCode: "unit.unit_code",
      configuredMode: "COALESCE(config.operating_mode, 'none')",
      updateTime: "COALESCE(config.update_time, unit.update_time)"
    } as const;
    const direction = query.order === "asc" ? "ASC" : "DESC";
    const total = await builder.getCount();
    const rows = await builder
      .select("unit.id", "unitId")
      .addSelect("unit.unit_code", "unitCode")
      .addSelect("unit.unit_name", "unitName")
      .addSelect("unit.building_id", "buildingId")
      .addSelect("unit.asset_unit_id", "assetUnitId")
      .addSelect("COALESCE(config.operating_mode, 'none')", "configuredMode")
      .addSelect("COALESCE(config.operating_status, 'enabled')", "operationStatus")
      .addSelect("config.effective_time", "effectiveTime")
      .addSelect("config.suspend_reason", "suspendReason")
      .addSelect("COALESCE(config.version, 0)", "version")
      .addSelect("COALESCE(config.update_time, unit.update_time)", "updateTime")
      .orderBy(sortColumns[query.sort], direction)
      .addOrderBy("unit.id", "ASC")
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getRawMany<Record<string, unknown>>();
    const items = await Promise.all(
      rows.map((row) => this.projectOperation(scope, actor, row))
    );
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      allowedActions: this.operationAllowedActions(actor)
    };
  }

  async detail(scope: TenantParkScope, actor: JwtPrincipal, unitId: string) {
    this.assertExactPageAndAction(
      actor,
      SYSTEM_PERMISSIONS.PROPERTY_OPERATIONS_PAGE,
      SYSTEM_PERMISSIONS.PROPERTY_OPERATION_READ
    );
    const unit = await this.unitAccessService.assertAccess(scope, actor, unitId);
    const config = await this.configsRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false }
    });
    return this.projectOperation(scope, actor, {
      unitId: unit.id,
      unitCode: unit.unitCode,
      unitName: unit.unitName,
      buildingId: unit.buildingId,
      assetUnitId: unit.assetUnitId,
      configuredMode: config?.operatingMode ?? "none",
      operationStatus: config?.operatingStatus ?? "enabled",
      effectiveTime: config?.effectiveTime ?? null,
      suspendReason: config?.suspendReason ?? null,
      version: config?.version ?? 0,
      updateTime: config?.updateTime ?? unit.updateTime
    });
  }

  async configure(scope: TenantParkScope, actor: JwtPrincipal, unitId: string, dto: ConfigurePropertyUnitDto) {
    this.assertActionPermission(actor, SYSTEM_PERMISSIONS.PROPERTY_OPERATION_UPDATE);
    await this.unitAccessService.assertAccess(scope, actor, unitId);
    return this.dataSource.transaction(async (manager) => {
      const unit = await manager.getRepository(UnitEntity).findOne({
        where: { id: unitId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!unit) throw new NotFoundException("Unit not found");

      if (dto.asset_unit_id) {
        const assetUnit = await manager.getRepository(AssetUnitEntity).findOne({
          where: { id: dto.asset_unit_id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
        });
        if (!assetUnit) throw new BadRequestException("asset_unit_id does not belong to current tenant and park");
        const mapped = await manager.getRepository(UnitEntity)
          .createQueryBuilder("unit")
          .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
          .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
          .andWhere("unit.asset_unit_id = :assetUnitId", { assetUnitId: dto.asset_unit_id })
          .andWhere("unit.id <> :unitId", { unitId })
          .andWhere("unit.is_deleted = false")
          .getExists();
        if (mapped) throw new ConflictException("Physical asset unit is already mapped to another operating unit");
        unit.assetUnitId = dto.asset_unit_id;
        unit.updateBy = actor.sub;
        await manager.getRepository(UnitEntity).save(unit);
      }

      let config = await manager.getRepository(PropertyOperationConfigEntity).findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!config) {
        config = manager.getRepository(PropertyOperationConfigEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          unitId,
          operatingMode: "none",
          operatingStatus: dto.operating_status,
          effectiveTime: null,
          suspendReason: dto.operating_status === "enabled" ? null : dto.suspend_reason?.trim() ?? null,
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: dto.remark?.trim() ?? null
        });
      } else {
        config.operatingStatus = dto.operating_status;
        config.suspendReason = dto.operating_status === "enabled" ? null : dto.suspend_reason?.trim() ?? null;
        config.updateBy = actor.sub;
        if (dto.remark !== undefined) config.remark = dto.remark.trim() || null;
      }
      return manager.getRepository(PropertyOperationConfigEntity).save(config);
    });
  }

  async transitionMode(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string,
    dto: TransitionOperatingModeDto,
    clientKey: string
  ) {
    this.assertActionPermission(actor, SYSTEM_PERMISSIONS.PROPERTY_OPERATION_TRANSITION_MODE);
    await this.unitAccessService.assertAccess(scope, actor, unitId);
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [scope.tenantId, scope.parkId, unitId]);
      const repository = manager.getRepository(PropertyOperationConfigEntity);
      let config = await repository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!config) {
        config = await repository.save(repository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          unitId,
          operatingMode: "none",
          operatingStatus: "enabled",
          effectiveTime: null,
          suspendReason: null,
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: null
        }));
      }
      if (config.operatingMode === dto.target_mode) {
        return { config, transition: null, unchanged: true };
      }
      if (config.operatingStatus !== "enabled" && dto.target_mode !== "none") {
        throw new ConflictException("Suspended or disabled unit cannot enter an operating mode");
      }

      const snapshot = await this.buildTransitionSnapshot(manager, scope, unitId, dto.target_mode);
      if (snapshot.blocking_reasons.length > 0) {
        throw new ConflictException({
          message: "Operating mode transition is blocked",
          blocking_reasons: snapshot.blocking_reasons,
          check_snapshot: snapshot
        });
      }
      const canonicalPayload = {
        unitId,
        configId: config.id,
        fromMode: config.operatingMode,
        targetMode: dto.target_mode,
        operatingStatus: config.operatingStatus,
        reason: dto.reason.trim(),
        actorName: actor.realName ?? actor.username,
        checkSnapshot: snapshot
      };
      return this.approvalCommands.createPendingRequest(
        { transactionContext: manager },
        {
          contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
          scope,
          actionId: "property.mode-transition.request",
          sourceType: "property-operation-config",
          sourceId: config.id,
          sourceExpectedVersion: config.version,
          requesterId: actor.sub,
          submitterId: actor.sub,
          actorId: actor.sub,
          clientKey,
          businessIntentKey: `property-mode:${config.id}:${config.version}:${dto.target_mode}`,
          canonicalPayload,
          payloadSchemaVersion: 1,
          amount: null,
          currency: null
        }
      );
    });
  }

  async executeApprovedModeTransition(input: {
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
    const unitId = this.requiredUuidPayload(payload, "unitId");
    const configId = this.requiredUuidPayload(payload, "configId");
    const fromMode = String(payload.fromMode ?? "") as PropertyOperatingMode;
    const targetMode = String(payload.targetMode ?? "") as PropertyOperatingMode;
    const reason = String(payload.reason ?? "").trim();
    const actorName = String(payload.actorName ?? "").trim();
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    if (
      configId !== input.request.sourceId
      || input.sourceExpectedVersion !== input.request.sourceExpectedVersion
      || !reason || !actorName
    ) throw new ConflictException("Approval source changed");
    await input.manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [
      scope.tenantId, scope.parkId, unitId
    ]);
    const rows = await input.manager.query(
      `SELECT id::text AS id, operating_mode AS "operatingMode",
              operating_status AS "operatingStatus", version
         FROM biz_property_operation_config
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND unit_id=$4
          AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, configId, unitId]
    ) as Array<{ id: string; operatingMode: PropertyOperatingMode; operatingStatus: string; version: number }>;
    const config = rows[0];
    if (
      !config
      || config.version !== input.sourceExpectedVersion
      || config.operatingMode !== fromMode
      || config.operatingStatus !== payload.operatingStatus
    ) throw new ConflictException("Approval source changed");
    const currentSnapshot = await this.buildTransitionSnapshot(
      input.manager, scope, unitId, targetMode
    );
    if (
      propertyApprovalCanonicalHash(this.snapshotComparable(currentSnapshot))
      !== propertyApprovalCanonicalHash(
        this.snapshotComparable(payload.checkSnapshot as ModeTransitionCheckSnapshot)
      )
      || currentSnapshot.blocking_reasons.length > 0
    ) throw new ConflictException("Approval source changed");
    const manifestRows = await input.manager.query(
      `SELECT invariant_hash AS "effectHash", effect_line_key AS "effectLineKey"
         FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3
          AND effect_kind='property.mode.transition'`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ effectHash: string; effectLineKey: string }>;
    const manifest = manifestRows[0];
    if (!manifest) throw new ConflictException("Approval effect manifest missing");
    const updated = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_property_operation_config
          SET operating_mode=$5, effective_time=clock_timestamp(), update_time=clock_timestamp(),
              update_by=(SELECT requester_id FROM biz_property_approval_request
                          WHERE tenant_id=$1 AND park_id=$2 AND id=$6),
              version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
        RETURNING version`,
      [
        scope.tenantId,
        scope.parkId,
        configId,
        input.sourceExpectedVersion,
        targetMode,
        input.requestId
      ]
    ));
    if (updated.length !== 1 || updated[0]!.version !== input.sourceExpectedVersion + 1) {
      throw new ConflictException("Approval source changed");
    }
    const inserted = typeormQueryRows<{ id: string }>(await input.manager.query(
      `INSERT INTO biz_property_mode_transition_log(
         tenant_id,park_id,unit_id,from_mode,to_mode,reason,check_snapshot,
         operator_id,operator_name,transition_time,create_by,update_by,
         approval_execution_key,approval_effect_kind,approval_effect_line_key,
         approval_effect_hash,source_config_id,source_expected_version)
       SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,request.requester_id,$8,clock_timestamp(),
              request.requester_id,request.requester_id,$9,'property.mode.transition',$10,$11,$12,$13
         FROM biz_property_approval_request request
        WHERE request.tenant_id=$1 AND request.park_id=$2 AND request.id=$14
       RETURNING id::text AS id`,
      [
        scope.tenantId, scope.parkId, unitId, fromMode, targetMode, reason,
        JSON.stringify(currentSnapshot), actorName, input.executionIdempotencyKey,
        manifest.effectLineKey, manifest.effectHash, configId, input.sourceExpectedVersion,
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

  private snapshotComparable(snapshot: ModeTransitionCheckSnapshot) {
    const comparable: Partial<ModeTransitionCheckSnapshot> = { ...snapshot };
    delete comparable.checked_at;
    return comparable;
  }

  async transitionLogs(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string,
    query: PropertyModeTransitionListQueryDto
  ) {
    this.assertExactPageAndAction(
      actor,
      SYSTEM_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE,
      SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ
    );
    await this.unitAccessService.assertAccess(scope, actor, unitId);
    if (
      (query.decisionStatus && query.decisionStatus !== "approved")
      || (query.executionStatus && query.executionStatus !== "executed")
    ) {
      return {
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        allowedActions: []
      };
    }
    const [logs, total] = await this.transitionLogsRepository.findAndCount({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false },
      order: query.order === "asc"
        ? { transitionTime: "ASC", id: "ASC" }
        : { transitionTime: "DESC", id: "ASC" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    });
    return {
      items: logs.map((log) => ({
        id: log.id,
        unitId: log.unitId,
        fromMode: log.fromMode,
        toMode: log.toMode,
        reason: log.reason,
        decisionStatus: "approved",
        executionStatus: "executed",
        createTime: log.createTime.toISOString(),
        decisionTime: log.transitionTime.toISOString(),
        executionTime: log.transitionTime.toISOString(),
        operatorId: log.operatorId,
        operatorName: log.operatorName,
        version: log.version,
        legacy: true,
        allowedActions: []
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      allowedActions: []
    };
  }

  private async projectOperation(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    row: Record<string, unknown>
  ) {
    const unitId = String(row.unitId);
    const configuredMode = String(row.configuredMode ?? "none") as PropertyOperatingMode;
    const snapshot = await this.buildTransitionSnapshot(
      this.dataSource.manager,
      scope,
      unitId,
      configuredMode
    );
    const blockers = this.snapshotBlockers(snapshot);
    const allowedActions = this.operationAllowedActions(actor);
    return {
      unitId,
      unitCode: String(row.unitCode),
      unitName: String(row.unitName),
      buildingId: String(row.buildingId),
      assetUnitId: row.assetUnitId ?? null,
      configuredMode,
      operationStatus: String(row.operationStatus ?? "enabled"),
      effectiveTime: this.isoOrNull(row.effectiveTime),
      suspendReason: row.suspendReason ?? null,
      version: Number(row.version ?? 0),
      updateTime: this.isoOrNull(row.updateTime),
      liveOwningAggregateCounts: {
        commercialContracts: snapshot.commercial_contract_count,
        housingLeases: snapshot.housing_lease_count,
        homestayBookings: snapshot.homestay_booking_count,
        pendingCheckouts: snapshot.pending_checkout_count,
        openWorkorders: snapshot.open_workorder_count,
        unsettledReceivables: snapshot.unsettled_receivable_count
      },
      sharedOccupancy: {
        activeCount: snapshot.active_occupancy_count,
        incompatibleCount: snapshot.incompatible_occupancy_count
      },
      blockers,
      canRequestTransition: false,
      approval: null,
      approvalAvailable: false,
      allowedActions
    };
  }

  private snapshotBlockers(snapshot: ModeTransitionCheckSnapshot) {
    const rows = [
      ["commercial-active", "存在未结束的商业租赁合同", snapshot.commercial_contract_count, "commercial_leasing", "leasing_contract"],
      ["housing-active", "存在仍有效的住房租约", snapshot.housing_lease_count, "housing_rental", "housing_lease"],
      ["homestay-active", "存在仍有效的民宿订单", snapshot.homestay_booking_count, "homestay", "homestay_booking"],
      ["occupancy-incompatible", "存在与经营模式冲突的占用", snapshot.incompatible_occupancy_count, "property", "property_occupancy"],
      ["operations-blocker", "存在维修、保洁或运营锁房", snapshot.maintenance_or_operations_count, "operations", "operations_task"],
      ["checkout-pending", "存在待退房或待结算记录", snapshot.pending_checkout_count, "commercial_leasing", "leasing_checkout"],
      ["workorder-open", "存在未关闭工单", snapshot.open_workorder_count, "operations", "workorder"],
      ["receivable-unsettled", "存在未结清财务事项", snapshot.unsettled_receivable_count, "property", "receivable"]
    ] as const;
    return rows
      .filter((row) => Number(row[2]) > 0)
      .map(([code, label, count, sourceDomain, sourceType]) => ({
        code,
        label,
        count: Number(count),
        sourceDomain,
        sourceType
      }));
  }

  private operationAllowedActions(actor: JwtPrincipal): string[] {
    if (!actor.permissions.includes(SYSTEM_PERMISSIONS.PROPERTY_OPERATIONS_PAGE)) {
      return [];
    }
    return this.hasActionPermission(
      actor,
      SYSTEM_PERMISSIONS.PROPERTY_OPERATION_UPDATE
    )
      ? ["property.operation.update"]
      : [];
  }

  private assertExactPageAndAction(
    actor: JwtPrincipal,
    pagePermission: string,
    actionPermission: string
  ): void {
    if (!actor.permissions.includes(pagePermission)) {
      throw new ForbiddenException({
        message: "Property page access is forbidden",
        errorCode: "property-action-forbidden"
      });
    }
    this.assertActionPermission(actor, actionPermission);
  }

  private assertActionPermission(actor: JwtPrincipal, permission: string): void {
    if (!this.hasActionPermission(actor, permission)) {
      throw new ForbiddenException({
        message: "Property action is forbidden",
        errorCode: "property-action-forbidden"
      });
    }
  }

  private hasActionPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(
      actor.isSuper
      || actor.permissions.includes("*")
      || actor.permissions.includes(permission)
    );
  }

  private applyBlockerFilter(
    builder: ReturnType<Repository<UnitEntity>["createQueryBuilder"]>,
    blockerCode: PropertyOperationListQueryDto["blockerCode"]
  ): void {
    const clauses: Record<NonNullable<PropertyOperationListQueryDto["blockerCode"]>, string> = {
      "commercial-active": `EXISTS (
        SELECT 1 FROM rel_leasing_contract_unit relation
        JOIN biz_leasing_contract contract ON contract.id = relation.contract_id
        WHERE relation.tenant_id=unit.tenant_id AND relation.park_id=unit.park_id
          AND relation.unit_id=unit.id AND relation.is_deleted=false AND relation.status=1
          AND contract.is_deleted=false AND contract.status NOT IN ('90','91')
      )`,
      "housing-active": `EXISTS (
        SELECT 1 FROM biz_housing_lease lease
        WHERE lease.tenant_id=unit.tenant_id AND lease.park_id=unit.park_id
          AND lease.unit_id=unit.id AND lease.is_deleted=false
          AND lease.status IN ('active','expiring','checkout_pending')
      )`,
      "homestay-active": `EXISTS (
        SELECT 1 FROM biz_homestay_booking booking
        WHERE booking.tenant_id=unit.tenant_id AND booking.park_id=unit.park_id
          AND booking.unit_id=unit.id AND booking.is_deleted=false
          AND booking.status IN ('confirmed','checked_in')
      )`,
      "occupancy-incompatible": `EXISTS (
        SELECT 1 FROM biz_property_occupancy occupancy
        WHERE occupancy.tenant_id=unit.tenant_id AND occupancy.park_id=unit.park_id
          AND occupancy.unit_id=unit.id AND occupancy.is_deleted=false
          AND occupancy.end_at>now()
          AND (occupancy.status='active' OR
            (occupancy.status='held' AND
              (occupancy.hold_expires_at IS NULL OR occupancy.hold_expires_at>now())))
          AND (
            COALESCE(config.operating_mode, 'none')='none'
            OR (
              COALESCE(config.operating_mode, 'none')='short_stay'
              AND occupancy.source_domain IN ('commercial_leasing','housing_rental')
            )
            OR (
              COALESCE(config.operating_mode, 'none')='long_rent'
              AND occupancy.source_domain='homestay'
            )
          )
      )`,
      "operations-blocker": `EXISTS (
        SELECT 1 FROM biz_homestay_turnover_task task
        WHERE task.tenant_id=unit.tenant_id AND task.park_id=unit.park_id
          AND task.unit_id=unit.id AND task.is_deleted=false AND task.status<>'completed'
      )`,
      "checkout-pending": `EXISTS (
        SELECT 1 FROM rel_leasing_contract_unit relation
        JOIN biz_leasing_checkout checkout ON checkout.contract_id=relation.contract_id
        WHERE relation.tenant_id=unit.tenant_id AND relation.park_id=unit.park_id
          AND relation.unit_id=unit.id AND relation.is_deleted=false AND relation.status=1
          AND checkout.is_deleted=false AND checkout.status IN ('30','40','60')
      )`,
      "workorder-open": `EXISTS (
        SELECT 1 FROM biz_work_order workorder
        WHERE workorder.tenant_id=unit.tenant_id AND workorder.park_id=unit.park_id
          AND workorder.unit_id=unit.id AND workorder.is_deleted=false
          AND workorder.status NOT IN ('60','70','90','100')
      )`,
      "receivable-unsettled": `(
        EXISTS (
          SELECT 1 FROM biz_housing_receivable receivable
          JOIN biz_housing_lease lease ON lease.id=receivable.lease_id
          WHERE receivable.tenant_id=unit.tenant_id AND receivable.park_id=unit.park_id
            AND lease.unit_id=unit.id AND lease.is_deleted=false
            AND receivable.is_deleted=false AND receivable.status<>'void'
            AND receivable.amount>receivable.paid_amount+receivable.waived_amount
        )
      )`
    };
    if (blockerCode) builder.andWhere(clauses[blockerCode]);
  }

  private isoOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private async buildTransitionSnapshot(
    manager: EntityManager,
    scope: TenantParkScope,
    unitId: string,
    targetMode: PropertyOperatingMode
  ): Promise<ModeTransitionCheckSnapshot> {
    const rows = await manager.query(
      `WITH occupancy AS (
         SELECT
           count(*)::int AS active_occupancy_count,
           count(*) FILTER (
             WHERE ($4 = 'none')
                OR ($4 = 'short_stay' AND source_domain IN ('commercial_leasing', 'housing_rental'))
                OR ($4 = 'long_rent' AND source_domain = 'homestay')
           )::int AS incompatible_occupancy_count,
            (
              count(*) FILTER (WHERE source_domain IN ('maintenance', 'operations'))
              + (
                SELECT count(*)
                FROM biz_homestay_turnover_task task
                WHERE task.tenant_id = $1 AND task.park_id = $2 AND task.unit_id = $3
                  AND task.is_deleted = false AND task.status <> 'completed'
              )
            )::int AS maintenance_or_operations_count
         FROM biz_property_occupancy
         WHERE tenant_id = $1 AND park_id = $2 AND unit_id = $3
           AND is_deleted = false AND end_at > now()
           AND (status = 'active' OR (status = 'held' AND (hold_expires_at IS NULL OR hold_expires_at > now())))
       ),
       contracts AS (
         SELECT count(DISTINCT contract.id)::int AS commercial_contract_count
         FROM rel_leasing_contract_unit relation
         JOIN biz_leasing_contract contract ON contract.id = relation.contract_id
         WHERE relation.tenant_id = $1 AND relation.park_id = $2 AND relation.unit_id = $3
           AND relation.is_deleted = false AND relation.status = 1
           AND contract.is_deleted = false AND contract.status NOT IN ('90', '91')
            AND (relation.end_date + interval '1 day') > (now() AT TIME ZONE 'Asia/Shanghai')::date
       ),
       housing_leases AS (
         SELECT count(*)::int AS housing_lease_count
         FROM biz_housing_lease lease
         WHERE lease.tenant_id = $1 AND lease.park_id = $2 AND lease.unit_id = $3
           AND lease.is_deleted = false
           AND lease.status IN ('active', 'expiring', 'checkout_pending')
       ),
       homestay_bookings AS (
         SELECT count(*)::int AS homestay_booking_count
         FROM biz_homestay_booking booking
         WHERE booking.tenant_id = $1 AND booking.park_id = $2 AND booking.unit_id = $3
           AND booking.is_deleted = false
           AND booking.status IN ('confirmed', 'checked_in')
       ),
       checkouts AS (
         SELECT count(DISTINCT checkout.id)::int AS pending_checkout_count
         FROM rel_leasing_contract_unit relation
         JOIN biz_leasing_checkout checkout ON checkout.contract_id = relation.contract_id
         WHERE relation.tenant_id = $1 AND relation.park_id = $2 AND relation.unit_id = $3
           AND relation.is_deleted = false AND relation.status = 1
           AND checkout.is_deleted = false AND checkout.status IN ('30', '40', '60')
       ),
       workorders AS (
         SELECT count(*)::int AS open_workorder_count
         FROM biz_work_order
         WHERE tenant_id = $1 AND park_id = $2 AND unit_id = $3
           AND is_deleted = false AND status NOT IN ('60', '70', '90', '100')
       ),
       financial_items AS (
         SELECT 'commercial:' || receivable.id::text AS item_id
         FROM rel_leasing_contract_unit relation
         JOIN biz_leasing_receivable receivable ON receivable.contract_id = relation.contract_id
         WHERE relation.tenant_id = $1 AND relation.park_id = $2 AND relation.unit_id = $3
           AND relation.is_deleted = false AND relation.status = 1
           AND receivable.is_deleted = false AND receivable.status <> '90' AND receivable.amount_remain > 0
         UNION ALL
         SELECT 'housing:' || receivable.id::text AS item_id
         FROM biz_housing_receivable receivable
         JOIN biz_housing_lease lease ON lease.id = receivable.lease_id
         WHERE receivable.tenant_id = $1 AND receivable.park_id = $2
           AND lease.unit_id = $3 AND lease.is_deleted = false
           AND receivable.is_deleted = false AND receivable.status <> 'void'
           AND receivable.amount > receivable.paid_amount + receivable.waived_amount
         UNION ALL
         SELECT 'homestay:' || booking.id::text AS item_id
         FROM biz_homestay_booking booking
         JOIN biz_homestay_ledger_entry entry ON entry.booking_id = booking.id
         WHERE booking.tenant_id = $1 AND booking.park_id = $2 AND booking.unit_id = $3
           AND booking.is_deleted = false AND entry.is_deleted = false AND entry.status = 'confirmed'
         GROUP BY booking.id
         HAVING sum(CASE
           WHEN entry.entry_type = 'charge' THEN entry.amount
           WHEN entry.entry_type IN ('payment', 'waiver') THEN -entry.amount
           WHEN entry.entry_type = 'refund' THEN entry.amount
           ELSE 0
         END) > 0
       ),
       receivables AS (
         SELECT count(*)::int AS unsettled_receivable_count
         FROM financial_items
       )
       SELECT *
       FROM occupancy
       CROSS JOIN contracts
       CROSS JOIN housing_leases
       CROSS JOIN homestay_bookings
       CROSS JOIN checkouts
       CROSS JOIN workorders
       CROSS JOIN receivables`,
      [scope.tenantId, scope.parkId, unitId, targetMode]
    ) as Array<Omit<ModeTransitionCheckSnapshot, "checked_at" | "blocking_reasons">>;
    const counts = rows[0] ?? {
      active_occupancy_count: 0,
      incompatible_occupancy_count: 0,
      maintenance_or_operations_count: 0,
      commercial_contract_count: 0,
      housing_lease_count: 0,
      homestay_booking_count: 0,
      pending_checkout_count: 0,
      open_workorder_count: 0,
      unsettled_receivable_count: 0
    };
    const reasons: string[] = [];
    if (Number(counts.housing_lease_count) > 0 && targetMode !== "long_rent") {
      reasons.push("存在仍有效的住房租约");
    }
    if (Number(counts.homestay_booking_count) > 0 && targetMode !== "short_stay") {
      reasons.push("存在仍有效的民宿订单");
    }
    if (Number(counts.incompatible_occupancy_count) > 0) reasons.push("存在与目标经营模式冲突的未来或当前占用");
    if (Number(counts.maintenance_or_operations_count) > 0) reasons.push("存在维修停用、保洁或运营锁房占用");
    if (Number(counts.commercial_contract_count) > 0 && targetMode !== "long_rent") reasons.push("存在未结束的商业租赁合同");
    if (Number(counts.pending_checkout_count) > 0) reasons.push("存在待退房或待结算记录");
    if (Number(counts.open_workorder_count) > 0) reasons.push("存在未关闭工单");
    if (Number(counts.unsettled_receivable_count) > 0) reasons.push("存在未结清财务事项");
    return {
      checked_at: new Date().toISOString(),
      active_occupancy_count: Number(counts.active_occupancy_count),
      incompatible_occupancy_count: Number(counts.incompatible_occupancy_count),
      maintenance_or_operations_count: Number(counts.maintenance_or_operations_count),
      commercial_contract_count: Number(counts.commercial_contract_count),
      housing_lease_count: Number(counts.housing_lease_count),
      homestay_booking_count: Number(counts.homestay_booking_count),
      pending_checkout_count: Number(counts.pending_checkout_count),
      open_workorder_count: Number(counts.open_workorder_count),
      unsettled_receivable_count: Number(counts.unsettled_receivable_count),
      blocking_reasons: reasons
    };
  }

}
