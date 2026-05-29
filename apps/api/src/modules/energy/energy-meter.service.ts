import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FloorEntity } from "../floors/entities/floor.entity";
import { IotDeviceEntity } from "../iot/entities/iot-device.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreateEnergyMeterDto } from "./dto/create-energy-meter.dto";
import type { EnergyMeterQueryDto } from "./dto/energy-meter-query.dto";
import type { UpdateEnergyMeterDto } from "./dto/update-energy-meter.dto";
import { EnergyAlertEntity } from "./entities/energy-alert.entity";
import { EnergyMeterEntity } from "./entities/energy-meter.entity";
import { EnergyReadingEntity } from "./entities/energy-reading.entity";

const METER_ENTITY = "energy_meter";
const METER_CODE_RULE = "ENERGY_METER_CODE";

export interface EnergyMeterView {
  id: string;
  tenantId: string;
  parkId: string;
  buildingId: string | null;
  floorId: string | null;
  roomId: string | null;
  areaId: string | null;
  iotDeviceId: string | null;
  meterCode: string;
  meterName: string;
  meterType: string;
  meterPurpose: string;
  relatedParkTenantId: string | null;
  multiplier: string;
  unit: string;
  initialReading: string;
  currentReading: string;
  lastReadingAt: Date | null;
  status: string;
  isEnabled: boolean;
  remark: string | null;
  createTime: Date;
  updateTime: Date;
}

@Injectable()
export class EnergyMeterService {
  constructor(
    @InjectRepository(EnergyMeterEntity)
    private readonly meterRepository: Repository<EnergyMeterEntity>,
    @InjectRepository(EnergyReadingEntity)
    private readonly readingRepository: Repository<EnergyReadingEntity>,
    @InjectRepository(EnergyAlertEntity)
    private readonly alertRepository: Repository<EnergyAlertEntity>,
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitRepository: Repository<UnitEntity>,
    @InjectRepository(BuildingEntity)
    private readonly buildingRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorRepository: Repository<FloorEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantRepository: Repository<ParkTenantEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: EnergyMeterQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<EnergyMeterView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "energy", METER_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<EnergyMeterView> {
    const entity = await this.findMeter(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "energy", METER_ENTITY, this.toView(entity));
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateEnergyMeterDto): Promise<EnergyMeterView> {
    await this.validateRefs(scope, dto);
    this.validateTenantMeter(dto.meter_purpose, dto.related_park_tenant_id);
    const meterCode = dto.meter_code ?? (await this.codeRulesService.generateNext(scope, actor.sub, METER_CODE_RULE)).code;
    await this.assertMeterCodeAvailable(scope, meterCode);
    const initial = this.toDecimal(dto.initial_reading ?? 0);
    const entity = this.meterRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      buildingId: dto.building_id ?? null,
      floorId: dto.floor_id ?? null,
      roomId: dto.room_id ?? null,
      areaId: dto.area_id ?? null,
      iotDeviceId: dto.iot_device_id ?? null,
      meterCode,
      meterName: dto.meter_name,
      meterType: dto.meter_type,
      meterPurpose: dto.meter_purpose ?? "PUBLIC",
      relatedParkTenantId: dto.related_park_tenant_id ?? null,
      multiplier: this.toDecimal(dto.multiplier ?? 1, 6),
      unit: dto.unit ?? this.defaultUnit(dto.meter_type),
      initialReading: initial,
      currentReading: initial,
      lastReadingAt: dto.last_reading_at ? new Date(dto.last_reading_at) : null,
      status: dto.status ?? "UNKNOWN",
      isEnabled: dto.is_enabled ?? true,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    return this.toView(await this.meterRepository.save(entity));
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateEnergyMeterDto): Promise<EnergyMeterView> {
    const entity = await this.findMeter(scope, id, actor);
    await this.validateRefs(scope, dto);
    this.validateTenantMeter(dto.meter_purpose ?? entity.meterPurpose, dto.related_park_tenant_id ?? entity.relatedParkTenantId ?? undefined);
    if (dto.meter_code && dto.meter_code !== entity.meterCode) {
      await this.assertMeterCodeAvailable(scope, dto.meter_code);
      entity.meterCode = dto.meter_code;
    }
    Object.assign(entity, {
      buildingId: dto.building_id ?? entity.buildingId,
      floorId: dto.floor_id ?? entity.floorId,
      roomId: dto.room_id ?? entity.roomId,
      areaId: dto.area_id ?? entity.areaId,
      iotDeviceId: dto.iot_device_id ?? entity.iotDeviceId,
      meterName: dto.meter_name ?? entity.meterName,
      meterType: dto.meter_type ?? entity.meterType,
      meterPurpose: dto.meter_purpose ?? entity.meterPurpose,
      relatedParkTenantId: dto.related_park_tenant_id ?? entity.relatedParkTenantId,
      multiplier: dto.multiplier === undefined ? entity.multiplier : this.toDecimal(dto.multiplier, 6),
      unit: dto.unit ?? entity.unit,
      status: dto.status ?? entity.status,
      isEnabled: dto.is_enabled ?? entity.isEnabled,
      remark: dto.remark === undefined ? entity.remark : dto.remark,
      updateBy: actor.sub
    });
    return this.toView(await this.meterRepository.save(entity));
  }

  async updateStatus(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: Pick<UpdateEnergyMeterDto, "status" | "is_enabled">): Promise<EnergyMeterView> {
    const entity = await this.findMeter(scope, id, actor);
    entity.status = dto.status ?? entity.status;
    entity.isEnabled = dto.is_enabled ?? entity.isEnabled;
    entity.updateBy = actor.sub;
    return this.toView(await this.meterRepository.save(entity));
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findMeter(scope, id, actor);
    const readingCount = await this.readingRepository.count({ where: { tenantId: scope.tenantId, parkId: scope.parkId, meterId: id } });
    const alertCount = await this.alertRepository.count({ where: { tenantId: scope.tenantId, parkId: scope.parkId, meterId: id, isDeleted: false } });
    if (readingCount > 0 || alertCount > 0) {
      throw new BadRequestException("Meter has readings or alerts and cannot be deleted");
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.meterRepository.save(entity);
    return { id };
  }

  async findMeter(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<EnergyMeterEntity> {
    const builder = this.scopedBuilder(scope).andWhere("meter.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Energy meter not found");
    return entity;
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<EnergyMeterEntity> {
    return this.meterRepository
      .createQueryBuilder("meter")
      .where("meter.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("meter.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("meter.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<EnergyMeterEntity>, query: EnergyMeterQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("meter.meter_code ILIKE :keyword", { keyword: `%${query.keyword}%` }).orWhere("meter.meter_name ILIKE :keyword", {
            keyword: `%${query.keyword}%`
          });
        })
      );
    }
    if (query.meter_type) builder.andWhere("meter.meter_type = :meterType", { meterType: query.meter_type });
    if (query.meter_purpose) builder.andWhere("meter.meter_purpose = :meterPurpose", { meterPurpose: query.meter_purpose });
    if (query.status) builder.andWhere("meter.status = :status", { status: query.status });
    if (query.building_id) builder.andWhere("meter.building_id = :buildingId", { buildingId: query.building_id });
    if (query.floor_id) builder.andWhere("meter.floor_id = :floorId", { floorId: query.floor_id });
    if (query.room_id) builder.andWhere("meter.room_id = :roomId", { roomId: query.room_id });
    if (query.related_park_tenant_id) builder.andWhere("meter.related_park_tenant_id = :parkTenantId", { parkTenantId: query.related_park_tenant_id });
    if (query.iot_device_id) builder.andWhere("meter.iot_device_id = :iotDeviceId", { iotDeviceId: query.iot_device_id });
  }

  private applySort(builder: SelectQueryBuilder<EnergyMeterEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      meter_code: "meter.meterCode",
      meter_name: "meter.meterName",
      meter_type: "meter.meterType",
      update_time: "meter.updateTime",
      create_time: "meter.createTime"
    };
    if (sort) {
      const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
      builder.orderBy(sortMap[field] ?? "meter.updateTime", direction as "ASC" | "DESC").addOrderBy("meter.createTime", "DESC");
      return;
    }
    builder.orderBy("meter.updateTime", "DESC").addOrderBy("meter.createTime", "DESC");
  }

  private async applyDataScope(builder: SelectQueryBuilder<EnergyMeterEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "meter");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "building", "meter");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "floor", "meter");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "unit", "meter", { unit: "room_id" });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "tenant_company", "meter", { tenantCompany: "related_park_tenant_id" });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "meter", { device: "iot_device_id" });
  }

  private async validateRefs(scope: TenantParkScope, dto: Partial<CreateEnergyMeterDto>): Promise<void> {
    if (dto.room_id) {
      const unit = await this.unitRepository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id: dto.room_id, isDeleted: false } });
      if (!unit) throw new BadRequestException("room_id does not belong to current tenant and park");
    }
    if (dto.building_id) {
      const building = await this.buildingRepository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id: dto.building_id, isDeleted: false } });
      if (!building) throw new BadRequestException("building_id does not belong to current tenant and park");
    }
    if (dto.floor_id) {
      const floor = await this.floorRepository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id: dto.floor_id, isDeleted: false } });
      if (!floor) throw new BadRequestException("floor_id does not belong to current tenant and park");
    }
    if (dto.related_park_tenant_id) {
      const tenant = await this.parkTenantRepository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, id: dto.related_park_tenant_id, isDeleted: false }
      });
      if (!tenant) throw new BadRequestException("related_park_tenant_id does not belong to current tenant and park");
    }
    if (dto.iot_device_id) {
      const device = await this.deviceRepository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id: dto.iot_device_id, isDeleted: false } });
      if (!device) throw new BadRequestException("iot_device_id does not belong to current tenant and park");
    }
  }

  private validateTenantMeter(meterPurpose?: string, relatedParkTenantId?: string): void {
    if (meterPurpose === "TENANT" && !relatedParkTenantId) {
      throw new BadRequestException("Tenant meter must bind related_park_tenant_id");
    }
  }

  private async assertMeterCodeAvailable(scope: TenantParkScope, meterCode: string): Promise<void> {
    const exists = await this.meterRepository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, meterCode, isDeleted: false } });
    if (exists) throw new ConflictException("meter_code already exists");
  }

  private defaultUnit(meterType: string): string {
    if (meterType === "ELECTRIC") return "kWh";
    if (meterType === "WATER") return "m3";
    if (meterType === "GAS") return "m3";
    if (meterType === "HEAT") return "GJ";
    return "unit";
  }

  private toDecimal(value: number, digits = 4): string {
    return Number(value).toFixed(digits);
  }

  private toView(entity: EnergyMeterEntity): EnergyMeterView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      buildingId: entity.buildingId,
      floorId: entity.floorId,
      roomId: entity.roomId,
      areaId: entity.areaId,
      iotDeviceId: entity.iotDeviceId,
      meterCode: entity.meterCode,
      meterName: entity.meterName,
      meterType: entity.meterType,
      meterPurpose: entity.meterPurpose,
      relatedParkTenantId: entity.relatedParkTenantId,
      multiplier: entity.multiplier,
      unit: entity.unit,
      initialReading: entity.initialReading,
      currentReading: entity.currentReading,
      lastReadingAt: entity.lastReadingAt,
      status: entity.status,
      isEnabled: entity.isEnabled,
      remark: entity.remark,
      createTime: entity.createTime,
      updateTime: entity.updateTime
    };
  }
}
