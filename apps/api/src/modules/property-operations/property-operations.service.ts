import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PropertyOperatingMode, TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AssetUnitEntity } from "../assets/entities/asset-unit.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import type { ConfigurePropertyUnitDto } from "./dto/configure-property-unit.dto";
import type { TransitionOperatingModeDto } from "./dto/transition-operating-mode.dto";
import { PropertyModeTransitionLogEntity } from "./entities/property-mode-transition-log.entity";
import { PropertyOccupancyEntity } from "./entities/property-occupancy.entity";
import { PropertyOperationConfigEntity } from "./entities/property-operation-config.entity";
import { PropertyUnitAccessService } from "./property-unit-access.service";

interface ModeTransitionCheckSnapshot {
  [key: string]: unknown;
  checked_at: string;
  active_occupancy_count: number;
  incompatible_occupancy_count: number;
  maintenance_or_operations_count: number;
  commercial_contract_count: number;
  pending_checkout_count: number;
  open_workorder_count: number;
  unsettled_receivable_count: number;
  blocking_reasons: string[];
}

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
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource
  ) {}

  async detail(scope: TenantParkScope, actor: JwtPrincipal, unitId: string) {
    const unit = await this.unitAccessService.assertAccess(scope, actor, unitId);
    const config = await this.configsRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false }
    });
    return {
      unit_id: unit.id,
      unit_code: unit.unitCode,
      unit_name: unit.unitName,
      asset_unit_id: unit.assetUnitId,
      operating_mode: config?.operatingMode ?? "none",
      operating_status: config?.operatingStatus ?? "enabled",
      effective_time: config?.effectiveTime ?? null,
      suspend_reason: config?.suspendReason ?? null,
      version: config?.version ?? 0
    };
  }

  async configure(scope: TenantParkScope, actor: JwtPrincipal, unitId: string, dto: ConfigurePropertyUnitDto) {
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

  async transitionMode(scope: TenantParkScope, actor: JwtPrincipal, unitId: string, dto: TransitionOperatingModeDto) {
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

      const fromMode = config.operatingMode;
      config.operatingMode = dto.target_mode;
      config.effectiveTime = new Date();
      config.updateBy = actor.sub;
      const savedConfig = await repository.save(config);
      const transition = await manager.getRepository(PropertyModeTransitionLogEntity).save(
        manager.getRepository(PropertyModeTransitionLogEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          unitId,
          fromMode,
          toMode: dto.target_mode,
          reason: dto.reason.trim(),
          checkSnapshot: snapshot,
          operatorId: actor.sub,
          operatorName: actor.realName ?? actor.username,
          transitionTime: new Date(),
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: null
        })
      );
      return { config: savedConfig, transition, unchanged: false };
    });
  }

  async transitionLogs(scope: TenantParkScope, actor: JwtPrincipal, unitId: string) {
    await this.unitAccessService.assertAccess(scope, actor, unitId);
    return this.transitionLogsRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false },
      order: { transitionTime: "DESC" },
      take: 100
    });
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
           count(*) FILTER (WHERE source_domain IN ('maintenance', 'operations'))::int AS maintenance_or_operations_count
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
           AND (relation.end_date + interval '1 day') > current_date
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
       SELECT * FROM occupancy CROSS JOIN contracts CROSS JOIN checkouts CROSS JOIN workorders CROSS JOIN receivables`,
      [scope.tenantId, scope.parkId, unitId, targetMode]
    ) as Array<Omit<ModeTransitionCheckSnapshot, "checked_at" | "blocking_reasons">>;
    const counts = rows[0] ?? {
      active_occupancy_count: 0,
      incompatible_occupancy_count: 0,
      maintenance_or_operations_count: 0,
      commercial_contract_count: 0,
      pending_checkout_count: 0,
      open_workorder_count: 0,
      unsettled_receivable_count: 0
    };
    const reasons: string[] = [];
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
      pending_checkout_count: Number(counts.pending_checkout_count),
      open_workorder_count: Number(counts.open_workorder_count),
      unsettled_receivable_count: Number(counts.unsettled_receivable_count),
      blocking_reasons: reasons
    };
  }

}
