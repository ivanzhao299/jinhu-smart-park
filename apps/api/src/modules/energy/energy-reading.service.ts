import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreateEnergyReadingDto } from "./dto/create-energy-reading.dto";
import type { EnergyReadingQueryDto } from "./dto/energy-reading-query.dto";
import { EnergyAlertService } from "./energy-alert.service";
import { EnergyMeterEntity } from "./entities/energy-meter.entity";
import { EnergyReadingEntity } from "./entities/energy-reading.entity";

const READING_ENTITY = "energy_reading";

export interface EnergyReadingView {
  id: string;
  meterId: string;
  iotDeviceId: string | null;
  readingValue: string;
  previousReadingValue: string;
  consumptionValue: string;
  readingTime: Date;
  readingSource: string;
  confirmationStatus: string;
  rawPayload: Record<string, unknown>;
  createdBy: string | null;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class EnergyReadingService {
  constructor(
    @InjectRepository(EnergyReadingEntity)
    private readonly readingRepository: Repository<EnergyReadingEntity>,
    @InjectRepository(EnergyMeterEntity)
    private readonly meterRepository: Repository<EnergyMeterEntity>,
    private readonly dataSource: DataSource,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly alertService: EnergyAlertService
  ) {}

  async list(scope: TenantParkScope, meterId: string, query: EnergyReadingQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<EnergyReadingView>> {
    await this.findMeter(scope, meterId, actor);
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 50;
    const builder = this.scopedBuilder(scope).andWhere("reading.meter_id = :meterId", { meterId });
    this.applyQuery(builder, query);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "energy", READING_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, meterId: string, dto: CreateEnergyReadingDto): Promise<EnergyReadingView> {
    const meter = await this.findMeter(scope, meterId, actor);
    if (!meter.isEnabled || meter.status === "DISABLED") throw new BadRequestException("Disabled meter cannot receive readings");
    const previous = Number(meter.currentReading ?? meter.initialReading ?? 0);
    const current = Number(dto.reading_value);
    const multiplier = Number(meter.multiplier ?? 1);
    const consumption = (current - previous) * multiplier;
    const abnormal = current < previous;
    const entity = this.readingRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      meterId: meter.id,
      iotDeviceId: meter.iotDeviceId,
      readingValue: current.toFixed(4),
      previousReadingValue: previous.toFixed(4),
      consumptionValue: abnormal ? "0.0000" : consumption.toFixed(4),
      readingTime: dto.reading_time ? new Date(dto.reading_time) : new Date(),
      readingSource: dto.reading_source ?? "MANUAL",
      confirmationStatus: abnormal ? "ABNORMAL" : "PENDING",
      rawPayload: dto.raw_payload ?? {},
      createdBy: actor.sub
    });
    const saved = await this.readingRepository.save(entity);
    if (abnormal) {
      await this.alertService.createSystemAlert(scope, actor.sub, {
        meterId: meter.id,
        alertType: "REVERSE_READING",
        alertLevel: "HIGH",
        title: `${meter.meterName} 读数倒挂`,
        description: `当前读数 ${current} 小于上一期读数 ${previous}，已进入异常口径，不参与确认统计。`
      });
    }
    return this.toView(saved);
  }

  async importReadings(scope: TenantParkScope, actor: JwtPrincipal, payload: { readings?: Array<{ meter_id: string; reading_value: number; reading_time?: string }> }) {
    const readings = payload.readings ?? [];
    const items: EnergyReadingView[] = [];
    for (const row of readings) {
      items.push(await this.create(scope, actor, row.meter_id, { reading_value: row.reading_value, reading_time: row.reading_time, reading_source: "IMPORT" }));
    }
    return { imported_count: items.length, items };
  }

  async confirm(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<EnergyReadingView> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EnergyReadingEntity);
      const meterRepo = manager.getRepository(EnergyMeterEntity);
      const reading = await repo.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id } });
      if (!reading) throw new NotFoundException("Energy reading not found");
      if (reading.confirmationStatus === "ABNORMAL") throw new BadRequestException("Abnormal reading cannot be confirmed");
      if (reading.confirmationStatus === "REJECTED") throw new BadRequestException("Rejected reading cannot be confirmed");
      const meter = await meterRepo.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id: reading.meterId, isDeleted: false } });
      if (!meter) throw new NotFoundException("Energy meter not found");
      reading.confirmationStatus = "CONFIRMED";
      reading.confirmedBy = actor.sub;
      reading.confirmedAt = new Date();
      meter.currentReading = reading.readingValue;
      meter.lastReadingAt = reading.readingTime;
      meter.status = "ONLINE";
      meter.updateBy = actor.sub;
      await meterRepo.save(meter);
      return this.toView(await repo.save(reading));
    });
  }

  async reject(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<EnergyReadingView> {
    const reading = await this.readingRepository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id } });
    if (!reading) throw new NotFoundException("Energy reading not found");
    if (reading.confirmationStatus === "CONFIRMED") throw new BadRequestException("Confirmed reading cannot be rejected");
    reading.confirmationStatus = "REJECTED";
    reading.confirmedBy = actor.sub;
    reading.confirmedAt = new Date();
    return this.toView(await this.readingRepository.save(reading));
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<EnergyReadingEntity> {
    return this.readingRepository
      .createQueryBuilder("reading")
      .where("reading.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("reading.park_id = :parkId", { parkId: scope.parkId })
      .orderBy("reading.reading_time", "DESC")
      .addOrderBy("reading.created_at", "DESC");
  }

  private applyQuery(builder: SelectQueryBuilder<EnergyReadingEntity>, query: EnergyReadingQueryDto): void {
    if (query.confirmation_status) builder.andWhere("reading.confirmation_status = :status", { status: query.confirmation_status });
    if (query.reading_source) builder.andWhere("reading.reading_source = :source", { source: query.reading_source });
    if (query.start_time) builder.andWhere("reading.reading_time >= :startTime", { startTime: new Date(query.start_time) });
    if (query.end_time) builder.andWhere("reading.reading_time <= :endTime", { endTime: new Date(query.end_time) });
  }

  private async findMeter(scope: TenantParkScope, meterId: string, actor?: JwtPrincipal): Promise<EnergyMeterEntity> {
    const builder = this.meterRepository
      .createQueryBuilder("meter")
      .where("meter.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("meter.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("meter.is_deleted = false")
      .andWhere("meter.id = :meterId", { meterId });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "meter");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "building", "meter");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "unit", "meter", { unit: "room_id" });
    const meter = await builder.getOne();
    if (!meter) throw new NotFoundException("Energy meter not found");
    return meter;
  }

  private toView(entity: EnergyReadingEntity): EnergyReadingView {
    return {
      id: entity.id,
      meterId: entity.meterId,
      iotDeviceId: entity.iotDeviceId,
      readingValue: entity.readingValue,
      previousReadingValue: entity.previousReadingValue,
      consumptionValue: entity.consumptionValue,
      readingTime: entity.readingTime,
      readingSource: entity.readingSource,
      confirmationStatus: entity.confirmationStatus,
      rawPayload: entity.rawPayload,
      createdBy: entity.createdBy,
      confirmedBy: entity.confirmedBy,
      confirmedAt: entity.confirmedAt,
      createdAt: entity.createdAt
    };
  }
}
