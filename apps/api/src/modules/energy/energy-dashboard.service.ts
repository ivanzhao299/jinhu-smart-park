import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { type ObjectLiteral, Repository, type SelectQueryBuilder } from "typeorm";
import { DataScopeService } from "../data-scopes/data-scope.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { EnergyAlertEntity } from "./entities/energy-alert.entity";
import { EnergyMeterEntity } from "./entities/energy-meter.entity";
import { EnergyReadingEntity } from "./entities/energy-reading.entity";

@Injectable()
export class EnergyDashboardService {
  constructor(
    @InjectRepository(EnergyMeterEntity)
    private readonly meterRepository: Repository<EnergyMeterEntity>,
    @InjectRepository(EnergyReadingEntity)
    private readonly readingRepository: Repository<EnergyReadingEntity>,
    @InjectRepository(EnergyAlertEntity)
    private readonly alertRepository: Repository<EnergyAlertEntity>,
    private readonly dataScopeService: DataScopeService
  ) {}

  async overview(scope: TenantParkScope, actor?: JwtPrincipal) {
    const meterBuilder = this.meterRepository
      .createQueryBuilder("meter")
      .where("meter.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("meter.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("meter.is_deleted = false");
    await this.applyMeterScope(meterBuilder, scope, actor);
    const meters = await meterBuilder.getMany();

    const meterIds = meters.map((meter) => meter.id);
    const [consumption, alerts] = await Promise.all([this.sumConsumption(scope, meterIds), this.activeAlerts(scope, meterIds)]);
    return {
      summary: {
        meter_count: meters.length,
        electric_meter_count: meters.filter((item) => item.meterType === "ELECTRIC").length,
        water_meter_count: meters.filter((item) => item.meterType === "WATER").length,
        gas_meter_count: meters.filter((item) => item.meterType === "GAS").length,
        confirmed_consumption: consumption,
        active_alert_count: alerts.length,
        disabled_meter_count: meters.filter((item) => !item.isEnabled || item.status === "DISABLED").length
      },
      recent_alerts: alerts.slice(0, 10)
    };
  }

  async trends(scope: TenantParkScope, query: { start_date?: string; end_date?: string; meter_type?: string }, actor?: JwtPrincipal) {
    const builder = this.readingRepository
      .createQueryBuilder("reading")
      .innerJoin(EnergyMeterEntity, "meter", "meter.id = reading.meter_id AND meter.tenant_id = reading.tenant_id AND meter.park_id = reading.park_id")
      .where("reading.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("reading.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("reading.confirmation_status = 'CONFIRMED'");
    await this.applyMeterScope(builder, scope, actor, "meter");
    if (query.meter_type) builder.andWhere("meter.meter_type = :meterType", { meterType: query.meter_type });
    if (query.start_date) builder.andWhere("reading.reading_time >= :startDate", { startDate: new Date(query.start_date) });
    if (query.end_date) builder.andWhere("reading.reading_time <= :endDate", { endDate: new Date(query.end_date) });
    const rows = await builder
      .select("date_trunc('day', reading.reading_time)", "date")
      .addSelect("meter.meter_type", "meter_type")
      .addSelect("SUM(reading.consumption_value)", "consumption")
      .groupBy("date")
      .addGroupBy("meter.meter_type")
      .orderBy("date", "ASC")
      .getRawMany();
    return { items: rows };
  }

  async byBuilding(scope: TenantParkScope, query: { start_date?: string; end_date?: string }, actor?: JwtPrincipal) {
    return this.groupConsumption(scope, "meter.building_id", "building_id", query, actor);
  }

  async byTenant(scope: TenantParkScope, query: { start_date?: string; end_date?: string }, actor?: JwtPrincipal) {
    return this.groupConsumption(scope, "meter.related_park_tenant_id", "park_tenant_id", query, actor);
  }

  async abnormal(scope: TenantParkScope, actor?: JwtPrincipal) {
    const meterBuilder = this.meterRepository
      .createQueryBuilder("meter")
      .where("meter.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("meter.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("meter.is_deleted = false");
    await this.applyMeterScope(meterBuilder, scope, actor);
    const meterIds = (await meterBuilder.select("meter.id", "id").getRawMany<{ id: string }>()).map((row) => row.id);
    if (meterIds.length === 0) return { items: [] };

    const items = await this.alertRepository
      .createQueryBuilder("alert")
      .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("alert.is_deleted = false")
      .andWhere("alert.meter_id IN (:...meterIds)", { meterIds })
      .andWhere("alert.process_status IN (:...statuses)", { statuses: ["PENDING", "ACKNOWLEDGED", "RESOLVED"] })
      .orderBy("alert.triggered_at", "DESC")
      .take(50)
      .getMany();
    return { items };
  }

  private async sumConsumption(scope: TenantParkScope, meterIds: string[]): Promise<string> {
    if (meterIds.length === 0) return "0.0000";
    const row = await this.readingRepository
      .createQueryBuilder("reading")
      .select("COALESCE(SUM(reading.consumption_value), 0)", "sum")
      .where("reading.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("reading.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("reading.meter_id IN (:...meterIds)", { meterIds })
      .andWhere("reading.confirmation_status = 'CONFIRMED'")
      .getRawOne<{ sum: string }>();
    return Number(row?.sum ?? 0).toFixed(4);
  }

  private async activeAlerts(scope: TenantParkScope, meterIds: string[]): Promise<EnergyAlertEntity[]> {
    if (meterIds.length === 0) return [];
    return this.alertRepository
      .createQueryBuilder("alert")
      .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("alert.is_deleted = false")
      .andWhere("alert.meter_id IN (:...meterIds)", { meterIds })
      .andWhere("alert.process_status IN (:...statuses)", { statuses: ["PENDING", "ACKNOWLEDGED", "RESOLVED"] })
      .orderBy("alert.triggered_at", "DESC")
      .getMany();
  }

  private async groupConsumption(scope: TenantParkScope, field: string, alias: string, query: { start_date?: string; end_date?: string }, actor?: JwtPrincipal) {
    const builder = this.readingRepository
      .createQueryBuilder("reading")
      .innerJoin(EnergyMeterEntity, "meter", "meter.id = reading.meter_id AND meter.tenant_id = reading.tenant_id AND meter.park_id = reading.park_id")
      .where("reading.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("reading.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("reading.confirmation_status = 'CONFIRMED'");
    await this.applyMeterScope(builder, scope, actor, "meter");
    if (query.start_date) builder.andWhere("reading.reading_time >= :startDate", { startDate: new Date(query.start_date) });
    if (query.end_date) builder.andWhere("reading.reading_time <= :endDate", { endDate: new Date(query.end_date) });
    const rows = await builder
      .select(field, alias)
      .addSelect("meter.meter_type", "meter_type")
      .addSelect("SUM(reading.consumption_value)", "consumption")
      .groupBy(field)
      .addGroupBy("meter.meter_type")
      .orderBy("consumption", "DESC")
      .getRawMany();
    return { items: rows };
  }

  private async applyMeterScope<T extends ObjectLiteral>(builder: SelectQueryBuilder<T>, scope: TenantParkScope, actor?: JwtPrincipal, alias = "meter"): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", alias);
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "building", alias);
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "unit", alias, { unit: "room_id" });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "tenant_company", alias, { tenantCompany: "related_park_tenant_id" });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", alias, { device: "iot_device_id" });
  }
}
