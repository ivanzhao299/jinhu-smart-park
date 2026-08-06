import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { EnergyMeterEntity } from "../energy/entities/energy-meter.entity";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import type {
  GenerateHousingBillsDto,
  UpsertHousingChargePlanDto
} from "./dto/housing.dto";
import {
  HousingChargePlanEntity,
  HousingLeaseEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import {
  assertHousingBillingPeriodWithinLease,
  calculateHousingMonthFractionRatio,
  parseHousingCalendarDate
} from "./housing-billing.policy";
import {
  calculateHousingMeterCharge,
  formatHousingMoney,
  multiplyHousingMoneyByRatio
} from "./housing-finance.policy";
import { HousingReceivableWriterService } from "./housing-receivable-writer.service";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";

@Injectable()
export class HousingBillingCommandService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly support: HousingTransactionSupportService,
    private readonly receivableWriter: HousingReceivableWriterService
  ) {}

  async saveChargePlan(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: UpsertHousingChargePlanDto
  ) {
    this.assertChargePlanInput(dto);
    try {
      return await this.dataSource.transaction((manager) =>
        this.saveChargePlanInTransaction(manager, scope, actor, leaseId, dto));
    } catch (error) {
      if (this.support.isUniqueViolation(error)) {
        throw new ConflictException("Charge plan already exists for this lease and charge type");
      }
      throw error;
    }
  }

  generateBills(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: GenerateHousingBillsDto
  ) {
    this.support.assertDatePeriod(dto.period_start, dto.period_end);
    return this.dataSource.transaction((manager) =>
      this.generateBillsInTransaction(manager, scope, actor, leaseId, dto));
  }

  private async saveChargePlanInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: UpsertHousingChargePlanDto
  ) {
    const lease = await this.support.lockLease(manager, scope, leaseId);
    await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
    if (["terminated", "void"].includes(lease.status)) {
      throw new ConflictException("Final housing leases cannot change charge plans");
    }
    await this.assertChargePlanMeter(manager, scope, lease, dto);
    const repository = manager.getRepository(HousingChargePlanEntity);
    const existing = await repository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId,
        chargeType: dto.charge_type,
        isDeleted: false
      }
    });
    const plan = existing ?? repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      leaseId,
      chargeType: dto.charge_type,
      createBy: actor.sub
    });
    this.applyChargePlan(plan, actor, dto);
    return repository.save(plan);
  }

  private async generateBillsInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: GenerateHousingBillsDto
  ) {
    const lease = await this.support.lockLease(manager, scope, leaseId);
    await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
    this.support.assertStatus(lease, ["active", "expiring", "checkout_pending"]);
    assertHousingBillingPeriodWithinLease(
      dto.period_start,
      dto.period_end,
      lease.startDate,
      lease.endDate
    );
    const plan = await this.enabledPlan(manager, scope, leaseId, dto.charge_plan_id);
    await this.assertNoOverlappingReceivable(manager, scope, leaseId, plan.id, dto);
    const meter = await this.billingMeter(manager, scope, lease, plan);
    const calculation = this.calculateBillAmount(plan, dto, lease.startDate, meter);
    const firstRentReceivable = await this.firstRentReceivable(manager, scope, leaseId, plan);
    const receivable = await this.receivableWriter.create(manager, scope, actor, lease, {
      chargePlanId: plan.id,
      sourceType: plan.billingSource,
      sourceId: plan.meterId,
      chargeType: plan.chargeType,
      periodStart: dto.period_start,
      periodEnd: dto.period_end,
      dueDate: plan.chargeType === "rent" && !firstRentReceivable
        ? lease.firstDueDate
        : this.dueDateForPeriod(dto.period_start, lease.billingDay),
      amount: calculation.amount,
      openingReading: dto.opening_reading,
      closingReading: dto.closing_reading,
      usageAmount: calculation.usageAmount,
      unitPrice: plan.unitPrice ?? undefined,
      remark: dto.reason
    });
    return [receivable];
  }

  private assertChargePlanInput(dto: UpsertHousingChargePlanDto) {
    if (dto.billing_source === "fixed" && dto.amount === undefined) {
      throw new BadRequestException("Fixed charge plan requires amount");
    }
    if (dto.billing_source === "energy_meter" && (!dto.meter_id || dto.unit_price === undefined)) {
      throw new BadRequestException("Energy meter charge plan requires meter_id and unit_price");
    }
  }

  private async assertChargePlanMeter(
    manager: EntityManager,
    scope: TenantParkScope,
    lease: HousingLeaseEntity,
    dto: UpsertHousingChargePlanDto
  ) {
    if (dto.billing_source !== "energy_meter") return;
    const meter = await this.findMeter(manager, scope, dto.meter_id!);
    this.assertMeterOnlineAndOwned(meter, lease.unitId);
  }

  private applyChargePlan(
    plan: HousingChargePlanEntity,
    actor: JwtPrincipal,
    dto: UpsertHousingChargePlanDto
  ) {
    plan.billingSource = dto.billing_source;
    plan.cycleMonths = dto.cycle_months;
    plan.amount = dto.billing_source === "fixed" ? formatHousingMoney(dto.amount!) : null;
    plan.unitPrice = dto.billing_source === "energy_meter" ? dto.unit_price! : null;
    plan.meterId = dto.billing_source === "energy_meter" ? dto.meter_id! : null;
    plan.enabled = dto.enabled;
    plan.updateBy = actor.sub;
    plan.remark = dto.remark ?? null;
  }

  private async enabledPlan(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    planId: string
  ) {
    const plan = await manager.getRepository(HousingChargePlanEntity).findOne({
      where: {
        id: planId,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId,
        enabled: true,
        isDeleted: false
      }
    });
    if (!plan) throw new NotFoundException("Enabled charge plan not found");
    return plan;
  }

  private async assertNoOverlappingReceivable(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    chargePlanId: string,
    dto: GenerateHousingBillsDto
  ) {
    const overlapping = await manager.getRepository(HousingReceivableEntity)
      .createQueryBuilder("receivable")
      .setLock("pessimistic_write")
      .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("receivable.lease_id = :leaseId", { leaseId })
      .andWhere("receivable.charge_plan_id = :chargePlanId", { chargePlanId })
      .andWhere("receivable.is_deleted = false")
      .andWhere("receivable.status <> 'void'")
      .andWhere("receivable.period_start < :periodEnd", { periodEnd: dto.period_end })
      .andWhere("receivable.period_end > :periodStart", { periodStart: dto.period_start })
      .getOne();
    if (overlapping) {
      throw new ConflictException(
        "Billing period overlaps an existing receivable for this charge plan"
      );
    }
  }

  private async billingMeter(
    manager: EntityManager,
    scope: TenantParkScope,
    lease: HousingLeaseEntity,
    plan: HousingChargePlanEntity
  ) {
    if (plan.billingSource !== "energy_meter") return null;
    const meter = await this.findMeter(manager, scope, plan.meterId!);
    this.assertMeterOnlineAndOwned(meter, lease.unitId);
    return meter;
  }

  private async findMeter(manager: EntityManager, scope: TenantParkScope, meterId: string) {
    const meter = await manager.getRepository(EnergyMeterEntity).findOne({
      where: {
        id: meterId,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      }
    });
    if (!meter) throw new NotFoundException("Energy meter not found");
    return meter;
  }

  private assertMeterOnlineAndOwned(meter: EnergyMeterEntity, unitId: string) {
    if (!meter.isEnabled || meter.status !== "ONLINE") {
      throw new ConflictException("Energy meter must be enabled and ONLINE");
    }
    if (meter.roomId !== unitId) {
      throw new BadRequestException("Energy meter must belong to the housing lease unit");
    }
  }

  private firstRentReceivable(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    plan: HousingChargePlanEntity
  ) {
    if (plan.chargeType !== "rent") return null;
    return manager.getRepository(HousingReceivableEntity).findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId,
        chargeType: "rent",
        isDeleted: false
      }
    });
  }

  private calculateBillAmount(
    plan: HousingChargePlanEntity,
    dto: GenerateHousingBillsDto,
    leaseStartDate: string,
    meter: EnergyMeterEntity | null
  ) {
    if (plan.billingSource === "manual") {
      if (dto.manual_amount === undefined) {
        throw new BadRequestException(`Manual amount is required for ${plan.chargeType}`);
      }
      return { amount: dto.manual_amount, usageAmount: undefined };
    }
    if (plan.billingSource === "energy_meter") {
      if (dto.opening_reading === undefined || dto.closing_reading === undefined) {
        throw new BadRequestException(`Meter readings are required for ${plan.chargeType}`);
      }
      return calculateHousingMeterCharge(
        dto.opening_reading,
        dto.closing_reading,
        meter?.multiplier ?? "0",
        plan.unitPrice ?? "0"
      );
    }
    const fraction = calculateHousingMonthFractionRatio(
      dto.period_start,
      dto.period_end,
      leaseStartDate
    );
    if (fraction.numerator > BigInt(plan.cycleMonths) * fraction.denominator) {
      throw new BadRequestException(
        `Billing period exceeds configured ${plan.cycleMonths}-month cycle for ${plan.chargeType}`
      );
    }
    return {
      amount: multiplyHousingMoneyByRatio(
        plan.amount ?? "0",
        fraction.numerator,
        fraction.denominator
      ),
      usageAmount: undefined
    };
  }

  private dueDateForPeriod(periodStart: string, billingDay: number) {
    const date = parseHousingCalendarDate(periodStart);
    date.setUTCDate(Math.min(billingDay, 28));
    return date.toISOString().slice(0, 10);
  }
}
