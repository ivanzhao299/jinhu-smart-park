import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, type EntityManager, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { UnitEntity } from "../units/entities/unit.entity";
import {
  CreateEnergyBillingCycleDto,
  EnergyBillingCycleQueryDto,
  EnergyBillingItemQueryDto
} from "./dto/energy-billing.dto";
import { EnergyToReceivableAdapter } from "./energy-to-receivable.adapter";
import { EnergyAllocationRuleEntity } from "./entities/energy-allocation-rule.entity";
import { EnergyBillingCycleEntity } from "./entities/energy-billing-cycle.entity";
import { EnergyBillingItemEntity } from "./entities/energy-billing-item.entity";
import { EnergyMeterEntity } from "./entities/energy-meter.entity";
import { EnergyReadingEntity } from "./entities/energy-reading.entity";

const CYCLE_CODE_ENTITY_TYPE = "energy_billing_cycle";

interface ReadingAggregate {
  previous: number;
  current: number;
  consumption: number;
}

interface AllocationTarget {
  relatedParkTenantId: string;
  roomId: string | null;
  weight: number;
}

@Injectable()
export class EnergyBillingCycleService {
  constructor(
    @InjectRepository(EnergyBillingCycleEntity)
    private readonly cycleRepository: Repository<EnergyBillingCycleEntity>,
    @InjectRepository(EnergyBillingItemEntity)
    private readonly itemRepository: Repository<EnergyBillingItemEntity>,
    @InjectRepository(EnergyMeterEntity)
    private readonly meterRepository: Repository<EnergyMeterEntity>,
    @InjectRepository(EnergyAllocationRuleEntity)
    private readonly ruleRepository: Repository<EnergyAllocationRuleEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitRepository: Repository<UnitEntity>,
    private readonly dataSource: DataSource,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly receivableAdapter: EnergyToReceivableAdapter
  ) {}

  async list(scope: TenantParkScope, query: EnergyBillingCycleQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<EnergyBillingCycleEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedCycleBuilder(scope);
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "cycle");
    if (query.keyword) {
      builder.andWhere("(cycle.cycle_name ILIKE :keyword OR cycle.cycle_code ILIKE :keyword)", { keyword: `%${query.keyword}%` });
    }
    if (query.meter_type) builder.andWhere("cycle.meter_type = :meterType", { meterType: query.meter_type });
    if (query.status) builder.andWhere("cycle.status = :status", { status: query.status });
    if (query.start_date) builder.andWhere("cycle.start_date >= :startDate", { startDate: query.start_date });
    if (query.end_date) builder.andWhere("cycle.end_date <= :endDate", { endDate: query.end_date });
    builder.orderBy("cycle.start_date", "DESC").addOrderBy("cycle.create_time", "DESC");
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<EnergyBillingCycleEntity> {
    const cycle = await this.findCycle(scope, id, actor);
    return cycle;
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateEnergyBillingCycleDto): Promise<EnergyBillingCycleEntity> {
    const start = this.toDateOnly(dto.start_date);
    const end = this.toDateOnly(dto.end_date);
    if (start > end) throw new BadRequestException("Billing cycle start_date must be before end_date");
    const existed = await this.cycleRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, meterType: dto.meter_type, startDate: start, endDate: end, isDeleted: false }
    });
    if (existed) throw new BadRequestException("Billing cycle already exists for the meter type and period");
    const generatedCode = dto.cycle_code ?? (await this.codeRulesService.generateCode(CYCLE_CODE_ENTITY_TYPE, scope.tenantId, scope.parkId, actor.sub)).code;
    const cycle = this.cycleRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: generatedCode,
      cycleCode: generatedCode,
      cycleName: dto.cycle_name,
      meterType: dto.meter_type,
      startDate: start,
      endDate: end,
      status: "DRAFT",
      createBy: actor.sub,
      updateBy: actor.sub,
      remark: dto.remark ?? null
    });
    return this.cycleRepository.save(cycle);
  }

  async calculate(scope: TenantParkScope, actor: JwtPrincipal, id: string, payload: { unit_prices?: Record<string, number> } = {}) {
    return this.dataSource.transaction(async (manager) => {
      const cycle = await this.findCycleForUpdate(scope, id, manager);
      if (cycle.status === "POSTED") throw new BadRequestException("Posted billing cycle cannot be recalculated");
      if (cycle.status === "CONFIRMED") throw new BadRequestException("Confirmed billing cycle cannot be recalculated");
      if (cycle.status === "CANCELLED") throw new BadRequestException("Cancelled billing cycle cannot be calculated");
      await manager.update(EnergyBillingItemEntity, { tenantId: scope.tenantId, parkId: scope.parkId, cycleId: cycle.id, isDeleted: false }, {
        isDeleted: true,
        updateBy: actor.sub
      });
      const unitPrice = this.unitPriceFor(cycle.meterType, payload.unit_prices);
      const directItems = await this.buildDirectItems(scope, actor, manager, cycle, unitPrice);
      const allocationItems = await this.buildAllocationItems(scope, actor, manager, cycle, payload.unit_prices);
      const saved = await manager.save(EnergyBillingItemEntity, [...directItems, ...allocationItems]);
      cycle.status = "CALCULATED";
      cycle.calculatedAt = new Date();
      cycle.updateBy = actor.sub;
      await manager.save(EnergyBillingCycleEntity, cycle);
      return { cycle, generated_count: saved.length, direct_count: directItems.length, allocation_count: allocationItems.length, items: saved };
    });
  }

  async confirm(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<EnergyBillingCycleEntity> {
    const cycle = await this.findCycle(scope, id, actor);
    if (cycle.status !== "CALCULATED") throw new BadRequestException("Only calculated billing cycle can be confirmed");
    const notConfirmed = await this.itemRepository.count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, cycleId: id, isDeleted: false, confirmationStatus: "PENDING" }
    });
    const disputed = await this.itemRepository.count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, cycleId: id, isDeleted: false, confirmationStatus: "DISPUTED" }
    });
    if (notConfirmed > 0 || disputed > 0) throw new BadRequestException("All billing items must be confirmed before confirming cycle");
    cycle.status = "CONFIRMED";
    cycle.confirmedAt = new Date();
    cycle.updateBy = actor.sub;
    return this.cycleRepository.save(cycle);
  }

  async post(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const cycle = await this.findCycleForUpdate(scope, id, manager);
      if (cycle.status === "POSTED") {
        const postedItems = await manager.count(EnergyBillingItemEntity, { where: { tenantId: scope.tenantId, parkId: scope.parkId, cycleId: id, isDeleted: false } });
        return { posted: false, skipped: true, item_count: postedItems, reason: "Billing cycle already posted" };
      }
      if (cycle.status !== "CONFIRMED") throw new BadRequestException("Only confirmed billing cycle can be posted");
      const items = await manager.find(EnergyBillingItemEntity, { where: { tenantId: scope.tenantId, parkId: scope.parkId, cycleId: id, isDeleted: false } });
      if (items.length === 0) throw new BadRequestException("No billing items to post");
      if (items.some((item) => item.confirmationStatus !== "CONFIRMED")) throw new BadRequestException("Only confirmed billing items can be posted");
      const postedAt = new Date();
      const results = [];
      for (const item of items) {
        const result = await this.receivableAdapter.postItem(scope, actor, item, cycle.startDate, cycle.endDate, manager);
        item.receivableId = result.receivable_id;
        item.postedAt = postedAt;
        item.updateBy = actor.sub;
        await manager.save(EnergyBillingItemEntity, item);
        results.push(result);
      }
      cycle.status = "POSTED";
      cycle.postedAt = postedAt;
      cycle.updateBy = actor.sub;
      await manager.save(EnergyBillingCycleEntity, cycle);
      return { posted: true, item_count: items.length, results };
    });
  }

  async cancel(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<EnergyBillingCycleEntity> {
    const cycle = await this.findCycle(scope, id, actor);
    if (cycle.status === "POSTED") throw new BadRequestException("Posted billing cycle cannot be cancelled");
    cycle.status = "CANCELLED";
    cycle.updateBy = actor.sub;
    return this.cycleRepository.save(cycle);
  }

  async listItems(scope: TenantParkScope, cycleId: string, query: EnergyBillingItemQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<EnergyBillingItemEntity>> {
    await this.findCycle(scope, cycleId, actor);
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 50;
    const builder = this.itemRepository
      .createQueryBuilder("item")
      .where("item.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("item.is_deleted = false")
      .andWhere("item.cycle_id = :cycleId", { cycleId });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "item");
    if (query.related_park_tenant_id) builder.andWhere("item.related_park_tenant_id = :parkTenantId", { parkTenantId: query.related_park_tenant_id });
    if (query.billing_method) builder.andWhere("item.billing_method = :method", { method: query.billing_method });
    if (query.confirmation_status) builder.andWhere("item.confirmation_status = :status", { status: query.confirmation_status });
    const [items, total] = await builder.orderBy("item.create_time", "DESC").skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, page_size: pageSize };
  }

  private async buildDirectItems(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    manager: EntityManager,
    cycle: EnergyBillingCycleEntity,
    unitPrice: number
  ): Promise<EnergyBillingItemEntity[]> {
    const meters = await manager.find(EnergyMeterEntity, {
      where: { tenantId: scope.tenantId, parkId: scope.parkId, meterType: cycle.meterType, meterPurpose: "TENANT", isEnabled: true, isDeleted: false }
    });
    const items: EnergyBillingItemEntity[] = [];
    for (const meter of meters.filter((item) => item.relatedParkTenantId)) {
      const aggregate = await this.confirmedAggregate(manager, scope, meter.id, cycle.startDate, cycle.endDate);
      if (!aggregate || aggregate.consumption <= 0) continue;
      const amount = aggregate.consumption * unitPrice;
      items.push(
        manager.create(EnergyBillingItemEntity, {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          cycleId: cycle.id,
          relatedParkTenantId: meter.relatedParkTenantId!,
          roomId: meter.roomId,
          meterId: meter.id,
          meterType: cycle.meterType,
          billingMethod: "DIRECT_METER",
          previousReading: aggregate.previous.toFixed(4),
          currentReading: aggregate.current.toFixed(4),
          consumptionValue: aggregate.consumption.toFixed(4),
          unitPrice: unitPrice.toFixed(4),
          amount: amount.toFixed(2),
          adjustmentAmount: "0.00",
          finalAmount: amount.toFixed(2),
          confirmationStatus: "PENDING",
          ruleSnapshot: {},
          createBy: actor.sub,
          updateBy: actor.sub
        })
      );
    }
    return items;
  }

  private async buildAllocationItems(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    manager: EntityManager,
    cycle: EnergyBillingCycleEntity,
    unitPrices?: Record<string, number>
  ): Promise<EnergyBillingItemEntity[]> {
    const rules = await manager.find(EnergyAllocationRuleEntity, {
      where: { tenantId: scope.tenantId, parkId: scope.parkId, meterType: cycle.meterType, status: "ENABLED", isDeleted: false }
    });
    const items: EnergyBillingItemEntity[] = [];
    for (const rule of rules) {
      const aggregate = await this.confirmedAggregate(manager, scope, rule.publicMeterId, cycle.startDate, cycle.endDate);
      if (!aggregate || aggregate.consumption <= 0) continue;
      const targets = await this.resolveAllocationTargets(scope, manager, rule);
      const totalWeight = targets.reduce((sum, target) => sum + target.weight, 0);
      if (totalWeight <= 0) continue;
      const unitPrice = this.unitPriceFor(cycle.meterType, unitPrices, rule.ruleConfigJson);
      for (const target of targets) {
        const consumption = (aggregate.consumption * target.weight) / totalWeight;
        const amount = consumption * unitPrice;
        items.push(
          manager.create(EnergyBillingItemEntity, {
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            cycleId: cycle.id,
            relatedParkTenantId: target.relatedParkTenantId,
            roomId: target.roomId,
            meterId: rule.publicMeterId,
            meterType: cycle.meterType,
            billingMethod: "PUBLIC_ALLOCATION",
            previousReading: aggregate.previous.toFixed(4),
            currentReading: aggregate.current.toFixed(4),
            consumptionValue: consumption.toFixed(4),
            unitPrice: unitPrice.toFixed(4),
            amount: amount.toFixed(2),
            adjustmentAmount: "0.00",
            finalAmount: amount.toFixed(2),
            confirmationStatus: "PENDING",
            ruleSnapshot: {
              rule_id: rule.id,
              rule_name: rule.ruleName,
              allocation_scope: rule.allocationScope,
              allocation_method: rule.allocationMethod,
              rule_config_json: rule.ruleConfigJson,
              weight: target.weight,
              total_weight: totalWeight
            },
            createBy: actor.sub,
            updateBy: actor.sub
          })
        );
      }
    }
    return items;
  }

  private async resolveAllocationTargets(scope: TenantParkScope, manager: EntityManager, rule: EnergyAllocationRuleEntity): Promise<AllocationTarget[]> {
    const manualRatios = rule.ruleConfigJson?.ratios;
    if (manualRatios && typeof manualRatios === "object" && !Array.isArray(manualRatios)) {
      return Object.entries(manualRatios as Record<string, unknown>)
        .map(([relatedParkTenantId, value]) => ({ relatedParkTenantId, roomId: null, weight: Number(value) }))
        .filter((target) => target.relatedParkTenantId && Number.isFinite(target.weight) && target.weight > 0);
    }
    const meterBuilder = manager
      .createQueryBuilder(EnergyMeterEntity, "meter")
      .where("meter.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("meter.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("meter.is_deleted = false")
      .andWhere("meter.meter_type = :meterType", { meterType: rule.meterType })
      .andWhere("meter.meter_purpose = 'TENANT'")
      .andWhere("meter.related_park_tenant_id IS NOT NULL");
    if (rule.allocationScope === "BUILDING" && rule.scopeId) meterBuilder.andWhere("meter.building_id = :scopeId", { scopeId: rule.scopeId });
    if (rule.allocationScope === "FLOOR" && rule.scopeId) meterBuilder.andWhere("meter.floor_id = :scopeId", { scopeId: rule.scopeId });
    if (rule.allocationScope === "AREA" && rule.scopeId) meterBuilder.andWhere("meter.area_id = :scopeId", { scopeId: rule.scopeId });
    const meters = await meterBuilder.getMany();
    const targets = new Map<string, AllocationTarget>();
    for (const meter of meters) {
      const key = `${meter.relatedParkTenantId}:${meter.roomId ?? ""}`;
      const area = meter.roomId && rule.allocationMethod === "AREA_RATIO" ? await this.unitArea(scope, manager, meter.roomId) : 1;
      const previous = targets.get(key);
      const weight = rule.allocationMethod === "TENANT_COUNT" || rule.allocationMethod === "ROOM_COUNT" ? 1 : area;
      targets.set(key, { relatedParkTenantId: meter.relatedParkTenantId!, roomId: meter.roomId, weight: (previous?.weight ?? 0) + weight });
    }
    return Array.from(targets.values()).filter((target) => target.weight > 0);
  }

  private async unitArea(scope: TenantParkScope, manager: EntityManager, roomId: string): Promise<number> {
    const unit = await manager.findOne(UnitEntity, { where: { tenantId: scope.tenantId, parkId: scope.parkId, id: roomId, isDeleted: false } });
    return Math.max(Number(unit?.unitArea ?? unit?.useArea ?? 1), 1);
  }

  private async confirmedAggregate(manager: EntityManager, scope: TenantParkScope, meterId: string, startDate: string, endDate: string): Promise<ReadingAggregate | null> {
    const rows = await manager
      .createQueryBuilder(EnergyReadingEntity, "reading")
      .where("reading.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("reading.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("reading.meter_id = :meterId", { meterId })
      .andWhere("reading.confirmation_status = 'CONFIRMED'")
      .andWhere("reading.reading_time >= :startTime", { startTime: new Date(`${startDate}T00:00:00.000Z`) })
      .andWhere("reading.reading_time <= :endTime", { endTime: new Date(`${endDate}T23:59:59.999Z`) })
      .orderBy("reading.reading_time", "ASC")
      .getMany();
    if (rows.length === 0) return null;
    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    const consumption = rows.reduce((sum, row) => sum + Number(row.consumptionValue ?? 0), 0);
    return {
      previous: Number(first.previousReadingValue ?? 0),
      current: Number(last.readingValue ?? 0),
      consumption
    };
  }

  private async findCycle(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<EnergyBillingCycleEntity> {
    const builder = this.scopedCycleBuilder(scope).andWhere("cycle.id = :id", { id });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "cycle");
    const cycle = await builder.getOne();
    if (!cycle) throw new NotFoundException("Energy billing cycle not found");
    return cycle;
  }

  private async findCycleForUpdate(scope: TenantParkScope, id: string, manager: EntityManager): Promise<EnergyBillingCycleEntity> {
    const cycle = await manager.findOne(EnergyBillingCycleEntity, { where: { tenantId: scope.tenantId, parkId: scope.parkId, id, isDeleted: false } });
    if (!cycle) throw new NotFoundException("Energy billing cycle not found");
    return cycle;
  }

  private scopedCycleBuilder(scope: TenantParkScope): SelectQueryBuilder<EnergyBillingCycleEntity> {
    return this.cycleRepository
      .createQueryBuilder("cycle")
      .where("cycle.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("cycle.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("cycle.is_deleted = false");
  }

  private unitPriceFor(meterType: string, unitPrices?: Record<string, number>, snapshot?: Record<string, unknown>): number {
    const configured = snapshot?.unit_price ?? unitPrices?.[meterType] ?? unitPrices?.default ?? 1;
    const value = Number(configured);
    return Number.isFinite(value) && value >= 0 ? value : 1;
  }

  private toDateOnly(value: string): string {
    return value.slice(0, 10);
  }
}
