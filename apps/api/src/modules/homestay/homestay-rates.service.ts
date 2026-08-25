import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type HomestayRateCalendarResponse, type TenantParkScope } from "@jinhu/shared";
import { DataSource, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import type {
  UpsertHomestayRateDto,
  UpsertHomestayRateOverrideDto
} from "./dto/homestay.dto";
import {
  HomestayRateConfigEntity,
  HomestayRateOverrideEntity
} from "./entities/homestay.entities";
import {
  assertBusinessDate,
  formatHomestayMoney,
  toMoneyCents
} from "./homestay-booking.policy";

const HOMESTAY_TIME_ZONE_OFFSET = "+08:00";

@Injectable()
export class HomestayRatesService {
  constructor(
    @InjectRepository(HomestayRateConfigEntity)
    private readonly ratesRepository: Repository<HomestayRateConfigEntity>,
    @InjectRepository(HomestayRateOverrideEntity)
    private readonly overridesRepository: Repository<HomestayRateOverrideEntity>,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource
  ) {}

  async getRateCalendar(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string,
    dateFrom: string,
    dateTo: string,
    allowUnconfiguredResponse = false
  ): Promise<HomestayRateCalendarResponse> {
    if (!dateFrom || !dateTo) {
      throw new BadRequestException("date_from and date_to are required");
    }
    assertBusinessDate(dateFrom, "date_from");
    assertBusinessDate(dateTo, "date_to");
    await this.assertUnitReadAccess(scope, actor, unitId);
    const dates = this.businessDates(dateFrom, dateTo);
    const config = await this.findRate(scope, unitId);
    if (!config) {
      if (allowUnconfiguredResponse) return { configured: false, unit_id: unitId };
      throw new NotFoundException("Homestay rate configuration not found");
    }
    const overrides = await this.loadOverrides(scope, unitId, dateFrom, dateTo);
    const byDate = new Map(overrides.map((item) => [item.businessDate, item]));
    return {
      configured: true,
      unit_id: unitId,
      currency: config.currency,
      base_daily_rate: config.baseDailyRate,
      checkout_requires_inspection: config.checkoutRequiresInspection,
      cancellation_policy: this.cancellationSnapshot(config),
      days: dates.map((date) => this.projectRateDay(date, config, byDate.get(date)))
    };
  }

  async upsertRate(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string,
    dto: UpsertHomestayRateDto
  ): Promise<HomestayRateConfigEntity> {
    await this.unitAccessService.assertAccess(scope, actor, unitId);
    if (
      dto.late_cancel_fee_type === "percentage"
      && toMoneyCents(dto.late_cancel_fee_value) > 10_000n
    ) {
      throw new BadRequestException("Percentage cancellation fee cannot exceed 100");
    }
    await this.dataSource.query(this.rateUpsertSql(), [
      scope.tenantId,
      scope.parkId,
      unitId,
      formatHomestayMoney(dto.base_daily_rate),
      dto.free_cancel_before_hours,
      dto.late_cancel_fee_type,
      formatHomestayMoney(dto.late_cancel_fee_value),
      dto.checkout_requires_inspection,
      actor.sub
    ]);
    return this.mustFindRate(scope, unitId);
  }

  async upsertRateOverride(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string,
    dto: UpsertHomestayRateOverrideDto
  ): Promise<HomestayRateOverrideEntity> {
    await this.unitAccessService.assertAccess(scope, actor, unitId);
    await this.mustFindRate(scope, unitId);
    const businessDate = dto.business_date.slice(0, 10);
    await this.dataSource.query(this.overrideUpsertSql(), [
      scope.tenantId,
      scope.parkId,
      unitId,
      businessDate,
      formatHomestayMoney(dto.daily_rate),
      dto.reason.trim(),
      actor.sub
    ]);
    const entity = await this.overridesRepository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        unitId,
        businessDate,
        isDeleted: false
      }
    });
    if (!entity) throw new NotFoundException("Homestay rate override not found after upsert");
    return entity;
  }

  private async loadOverrides(
    scope: TenantParkScope,
    unitId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<HomestayRateOverrideEntity[]> {
    return this.overridesRepository.createQueryBuilder("rate")
      .where("rate.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rate.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rate.unit_id = :unitId", { unitId })
      .andWhere("rate.is_deleted = false")
      .andWhere("rate.business_date >= :dateFrom", { dateFrom })
      .andWhere("rate.business_date < :dateTo", { dateTo })
      .getMany();
  }

  private projectRateDay(
    businessDate: string,
    config: HomestayRateConfigEntity,
    override?: HomestayRateOverrideEntity
  ) {
    return {
      business_date: businessDate,
      base_rate: config.baseDailyRate,
      override_rate: override?.dailyRate ?? null,
      final_rate: override?.dailyRate ?? config.baseDailyRate,
      price_source: override ? "date_override" as const : "base" as const
    };
  }

  private businessDates(startValue: string, endValue: string): string[] {
    assertBusinessDate(startValue, "arrival_date");
    assertBusinessDate(endValue, "departure_date");
    const start = this.businessDateStart(startValue);
    const end = this.businessDateStart(endValue);
    if (start >= end) {
      throw new BadRequestException("arrival_date must be before departure_date");
    }
    const result: string[] = [];
    for (let cursor = start.getTime(); cursor < end.getTime(); cursor += 86_400_000) {
      if (result.length >= 366) throw new BadRequestException("A booking cannot exceed 366 nights");
      result.push(new Date(cursor).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }));
    }
    return result;
  }

  private businessDateStart(value: string): Date {
    return new Date(`${value.slice(0, 10)}T00:00:00${HOMESTAY_TIME_ZONE_OFFSET}`);
  }

  private cancellationSnapshot(config: HomestayRateConfigEntity) {
    return {
      free_cancel_before_hours: config.freeCancelBeforeHours,
      late_cancel_fee_type: config.lateCancelFeeType,
      late_cancel_fee_value: config.lateCancelFeeValue,
      captured_at: new Date().toISOString()
    };
  }

  private async mustFindRate(
    scope: TenantParkScope,
    unitId: string
  ): Promise<HomestayRateConfigEntity> {
    const config = await this.findRate(scope, unitId);
    if (!config) throw new NotFoundException("Homestay rate configuration not found");
    return config;
  }

  private findRate(
    scope: TenantParkScope,
    unitId: string
  ): Promise<HomestayRateConfigEntity | null> {
    return this.ratesRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false }
    });
  }

  private async assertUnitReadAccess(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string
  ): Promise<void> {
    try {
      await this.unitAccessService.assertAccess(scope, actor, unitId);
    } catch (error) {
      if (
        error instanceof ForbiddenException
        && error.message === "Unit is outside current data scope"
      ) {
        throw new NotFoundException("Unit not found");
      }
      throw error;
    }
  }

  private rateUpsertSql(): string {
    return `INSERT INTO biz_homestay_rate_config (
      tenant_id, park_id, unit_id, base_daily_rate, currency,
      free_cancel_before_hours, late_cancel_fee_type, late_cancel_fee_value,
      checkout_requires_inspection, create_by, update_by
    ) VALUES ($1, $2, $3, $4, 'CNY', $5, $6, $7, $8, $9, $9)
    ON CONFLICT (tenant_id, park_id, unit_id) WHERE is_deleted = false
    DO UPDATE SET
      base_daily_rate = EXCLUDED.base_daily_rate,
      currency = EXCLUDED.currency,
      free_cancel_before_hours = EXCLUDED.free_cancel_before_hours,
      late_cancel_fee_type = EXCLUDED.late_cancel_fee_type,
      late_cancel_fee_value = EXCLUDED.late_cancel_fee_value,
      checkout_requires_inspection = EXCLUDED.checkout_requires_inspection,
      update_by = EXCLUDED.update_by,
      update_time = now(),
      version = biz_homestay_rate_config.version + 1`;
  }

  private overrideUpsertSql(): string {
    return `INSERT INTO biz_homestay_rate_override (
      tenant_id, park_id, unit_id, business_date, daily_rate, reason,
      create_by, update_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
    ON CONFLICT (tenant_id, park_id, unit_id, business_date) WHERE is_deleted = false
    DO UPDATE SET
      daily_rate = EXCLUDED.daily_rate,
      reason = EXCLUDED.reason,
      update_by = EXCLUDED.update_by,
      update_time = now(),
      version = biz_homestay_rate_override.version + 1`;
  }
}
