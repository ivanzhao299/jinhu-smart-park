import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FloorEntity } from "../floors/entities/floor.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreateIotDeviceDto } from "./dto/create-iot-device.dto";
import type { IotDeviceHistoryQueryDto, IotDeviceTrendQueryDto } from "./dto/iot-device-data-query.dto";
import type { IotDeviceQueryDto } from "./dto/iot-device-query.dto";
import type { UpdateIotDeviceDto } from "./dto/update-iot-device.dto";
import { IotAlertEntity } from "./entities/iot-alert.entity";
import { IotDeviceDataEntity } from "./entities/iot-device-data.entity";
import { IotDeviceLatestEntity } from "./entities/iot-device-latest.entity";
import { IotDeviceEntity } from "./entities/iot-device.entity";
import { IotGatewayEntity } from "./entities/iot-gateway.entity";
import { IotDeviceSecretService } from "./iot-device-secret.service";

const DEVICE_ENTITY = "iot_device";
const DEVICE_DATA_ENTITY = "iot_device_data";
const DEFAULT_STATUS = "enabled";
const DEFAULT_ONLINE_STATUS = "offline";

interface LocationRefs {
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  roomId: string | null;
  parkTenantId: string | null;
}

export interface IotDeviceView {
  id: string;
  tenantId: string;
  parkId: string;
  code: string | null;
  deviceCode: string;
  deviceName: string;
  deviceType: string;
  deviceCategory: string | null;
  gatewayId: string | null;
  brand: string | null;
  model: string | null;
  manufacturer: string | null;
  vendorName: string | null;
  vendorDeviceId: string | null;
  platformType: string | null;
  platformDeviceId: string | null;
  protocolType: string | null;
  connectionType: string | null;
  ipAddress: string | null;
  port: number | null;
  macAddress: string | null;
  serialNumber: string | null;
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  roomId: string | null;
  areaId: string | null;
  parkTenantId: string | null;
  location: string | null;
  installLocation: string | null;
  gpsLng: string | null;
  gpsLat: string | null;
  longitude: string | null;
  latitude: string | null;
  installDate: string | null;
  warrantyEndDate: string | null;
  status: string;
  onlineStatus: string;
  isEnabled: boolean;
  lastOnlineTime: Date | null;
  lastOfflineTime: Date | null;
  lastDataTime: Date | null;
  lastHeartbeatAt: Date | null;
  statusPayload: Record<string, unknown>;
  remark: string | null;
  createBy: string | null;
  createTime: Date;
  updateBy: string | null;
  updateTime: Date;
  isDeleted: boolean;
  version: number;
}

export interface IotDeviceLatestView {
  id: string;
  deviceId: string;
  deviceCode: string;
  pointId: string | null;
  metricId: string | null;
  metricCode: string;
  valueType: string;
  valueNumber: string | null;
  valueText: string | null;
  valueBool: boolean | null;
  valueJson: unknown | null;
  quality: string;
  reportedAt: Date;
  receivedAt: Date;
  updateTime: Date;
}

export interface IotDeviceLatestStatusView extends IotDeviceView {
  latestMetrics: IotDeviceLatestView[];
}

export interface IotDeviceDataView {
  id: string;
  deviceId: string;
  deviceCode: string;
  pointId: string | null;
  metricId: string | null;
  metricCode: string;
  valueType: string;
  valueNumber: string | null;
  valueText: string | null;
  valueBool: boolean | null;
  valueJson: unknown | null;
  quality: string;
  reportedAt: Date;
  receivedAt: Date;
  rawPayload: Record<string, unknown>;
  createTime: Date;
}

export interface IotDeviceTrendView {
  interval: "minute" | "hour" | "day";
  metricCode: string;
  items: Array<{
    bucketTime: string;
    count: number;
    avgValue: string | null;
    minValue: string | null;
    maxValue: string | null;
  }>;
}

@Injectable()
export class IotDevicesService {
  constructor(
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    @InjectRepository(IotGatewayEntity)
    private readonly gatewayRepository: Repository<IotGatewayEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitRepository: Repository<UnitEntity>,
    @InjectRepository(BuildingEntity)
    private readonly buildingRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorRepository: Repository<FloorEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantRepository: Repository<ParkTenantEntity>,
    @InjectRepository(IotDeviceDataEntity)
    private readonly deviceDataRepository: Repository<IotDeviceDataEntity>,
    @InjectRepository(IotDeviceLatestEntity)
    private readonly deviceLatestRepository: Repository<IotDeviceLatestEntity>,
    @InjectRepository(IotAlertEntity)
    private readonly alertRepository: Repository<IotAlertEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly deviceSecretService: IotDeviceSecretService
  ) {}

  async list(scope: TenantParkScope, query: IotDeviceQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<IotDeviceView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedDeviceBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyDeviceQuery(builder, query);
    this.applyDeviceSort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const safeItems = items.map((item) => this.toSafeView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", DEVICE_ENTITY, safeItems);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotDeviceView> {
    const entity = await this.findDevice(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "iot", DEVICE_ENTITY, this.toSafeView(entity));
  }

  async latest(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotDeviceLatestView[]> {
    const entity = await this.findDevice(scope, id, actor);
    const rows = await this.deviceLatestRepository
      .createQueryBuilder("latest")
      .where("latest.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("latest.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("latest.is_deleted = false")
      .andWhere("latest.device_id = :deviceId", { deviceId: entity.id })
      .orderBy("latest.reported_at", "DESC")
      .addOrderBy("latest.metric_code", "ASC")
      .getMany();
    return rows.map((row) => this.toLatestView(row));
  }

  async latestStatus(scope: TenantParkScope, query: IotDeviceQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<IotDeviceLatestStatusView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedDeviceBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyDeviceQuery(builder, query);
    this.applySort(builder, query.sort, {
      device_code: "device.deviceCode",
      device_name: "device.deviceName",
      device_type: "device.deviceType",
      online_status: "device.onlineStatus",
      last_data_time: "device.lastDataTime",
      update_time: "device.updateTime",
      create_time: "device.createTime"
    }, "device.lastDataTime", "device.updateTime", "DESC");
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const latestByDevice = await this.getLatestByDevice(scope, items.map((item) => item.id));
    const safeItems = items.map((item) => ({ ...this.toSafeView(item), latestMetrics: latestByDevice.get(item.id) ?? [] }));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", DEVICE_ENTITY, safeItems);
    return { items: securedItems as IotDeviceLatestStatusView[], total, page, page_size: pageSize };
  }

  async history(scope: TenantParkScope, id: string, query: IotDeviceHistoryQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<IotDeviceDataView>> {
    const entity = await this.findDevice(scope, id, actor);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.page_size ?? 100, 1000);
    const builder = this.scopedDeviceDataBuilder(scope, entity.id);
    this.applyDataTimeQuery(builder, query.metric_code, query.start_time, query.end_time);
    builder.orderBy("data.reportedAt", "DESC").addOrderBy("data.createTime", "DESC");
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const safeItems = items.map((item) => this.toDataView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", DEVICE_DATA_ENTITY, safeItems);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async trend(scope: TenantParkScope, id: string, query: IotDeviceTrendQueryDto, actor?: JwtPrincipal): Promise<IotDeviceTrendView> {
    const entity = await this.findDevice(scope, id, actor);
    const metricCode = query.metric_code?.trim();
    if (!metricCode) {
      throw new BadRequestException("metric_code is required");
    }
    const interval = query.interval ?? "hour";
    const bucket = { minute: "minute", hour: "hour", day: "day" }[interval];
    const builder = this.scopedDeviceDataBuilder(scope, entity.id);
    this.applyDataTimeQuery(builder, metricCode, query.start_time, query.end_time);
    const rows = await builder
      .andWhere("data.value_number IS NOT NULL")
      .select(`date_trunc('${bucket}', data.reported_at)`, "bucket_time")
      .addSelect("COUNT(*)", "count")
      .addSelect("AVG(data.value_number)", "avg_value")
      .addSelect("MIN(data.value_number)", "min_value")
      .addSelect("MAX(data.value_number)", "max_value")
      .groupBy("bucket_time")
      .orderBy("bucket_time", "ASC")
      .limit(500)
      .getRawMany<{
        bucket_time: Date | string;
        count: string;
        avg_value: string | null;
        min_value: string | null;
        max_value: string | null;
      }>();
    return {
      interval,
      metricCode,
      items: rows.map((row) => ({
        bucketTime: new Date(row.bucket_time).toISOString(),
        count: Number(row.count),
        avgValue: row.avg_value,
        minValue: row.min_value,
        maxValue: row.max_value
      }))
    };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateIotDeviceDto): Promise<IotDeviceView> {
    this.assertRequired(dto.device_name, "device_name is required");
    this.assertRequired(dto.device_type, "device_type is required");
    const generated = dto.device_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "IOT_DEVICE_CODE");
    const deviceCode = dto.device_code ?? generated?.code ?? "";
    await this.assertDeviceCodeAvailable(scope, deviceCode);
    const refs = await this.resolveLocationRefs(scope, dto);
    await this.assertGateway(scope, dto.gateway_id);
    const vendorDeviceId = dto.vendor_device_id ?? dto.platform_device_id ?? null;
    await this.assertVendorDeviceAvailable(scope, dto.gateway_id ?? null, vendorDeviceId);
    const secret = this.deviceSecretService.generatePlainSecret();
    const statusState = this.normalizeStatusState(dto.status, dto.online_status, dto.is_enabled);
    const longitude = this.formatNumber(dto.longitude ?? dto.gps_lng);
    const latitude = this.formatNumber(dto.latitude ?? dto.gps_lat);
    const entity = this.deviceRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: dto.code ?? deviceCode,
      deviceCode,
      deviceName: dto.device_name,
      deviceType: dto.device_type,
      deviceCategory: dto.device_category ?? null,
      gatewayId: dto.gateway_id ?? null,
      brand: dto.brand ?? null,
      model: dto.model ?? null,
      manufacturer: dto.manufacturer ?? dto.vendor_name ?? null,
      vendorName: dto.vendor_name ?? dto.manufacturer ?? null,
      vendorPlatform: dto.platform_type ?? dto.vendor_name ?? null,
      vendorDeviceId,
      platformType: dto.platform_type ?? null,
      platformDeviceId: dto.platform_device_id ?? vendorDeviceId,
      protocolType: dto.protocol_type ?? "http",
      connectionType: dto.connection_type ?? null,
      ipAddress: dto.ip_address ?? null,
      port: dto.port ?? null,
      macAddress: dto.mac_address ?? null,
      serialNumber: dto.serial_number ?? null,
      buildingId: refs.buildingId,
      floorId: refs.floorId,
      unitId: refs.unitId,
      roomId: refs.roomId,
      areaId: dto.area_id ?? null,
      parkTenantId: refs.parkTenantId,
      location: dto.location ?? null,
      installLocation: dto.install_location ?? dto.location ?? null,
      gpsLng: this.formatNumber(dto.gps_lng ?? dto.longitude),
      gpsLat: this.formatNumber(dto.gps_lat ?? dto.latitude),
      longitude,
      latitude,
      installDate: dto.install_date ?? null,
      warrantyEndDate: dto.warranty_end_date ?? null,
      status: statusState.status,
      onlineStatus: statusState.onlineStatus,
      isEnabled: statusState.isEnabled,
      lastHeartbeatAt: this.parseOptionalDate(dto.last_heartbeat_at, "last_heartbeat_at"),
      deviceSecret: this.deviceSecretService.encryptSecret(secret),
      deviceSecretHash: this.deviceSecretService.hashSecret(secret),
      statusPayload: this.normalizePayload(dto.status_payload),
      metadata: this.normalizePayload(dto.status_payload),
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.deviceRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateIotDeviceDto): Promise<IotDeviceView> {
    const entity = await this.findDevice(scope, id, actor);
    const nextDeviceCode = dto.device_code ?? entity.deviceCode;
    if (nextDeviceCode !== entity.deviceCode) {
      await this.assertDeviceCodeAvailable(scope, nextDeviceCode, entity.id);
    }
    const nextGatewayId = dto.gateway_id === undefined ? entity.gatewayId : dto.gateway_id ?? null;
    const nextVendorDeviceId =
      dto.vendor_device_id === undefined && dto.platform_device_id === undefined
        ? entity.vendorDeviceId
        : dto.vendor_device_id ?? dto.platform_device_id ?? null;
    await this.assertGateway(scope, nextGatewayId ?? undefined);
    await this.assertVendorDeviceAvailable(scope, nextGatewayId, nextVendorDeviceId, entity.id);
    const refs = await this.resolveLocationRefs(scope, {
      building_id: dto.building_id === undefined ? entity.buildingId ?? undefined : dto.building_id,
      floor_id: dto.floor_id === undefined ? entity.floorId ?? undefined : dto.floor_id,
      unit_id: dto.unit_id === undefined ? entity.unitId ?? undefined : dto.unit_id,
      room_id: dto.room_id === undefined ? entity.roomId ?? entity.unitId ?? undefined : dto.room_id,
      park_tenant_id: dto.park_tenant_id === undefined ? entity.parkTenantId ?? undefined : dto.park_tenant_id
    });
    const statusState = this.normalizeStatusState(dto.status, dto.online_status, dto.is_enabled, entity);
    Object.assign(entity, {
      code: dto.code === undefined ? entity.code : dto.code ?? null,
      deviceCode: nextDeviceCode,
      deviceName: dto.device_name ?? entity.deviceName,
      deviceType: dto.device_type ?? entity.deviceType,
      deviceCategory: dto.device_category === undefined ? entity.deviceCategory : dto.device_category ?? null,
      gatewayId: nextGatewayId,
      brand: dto.brand === undefined ? entity.brand : dto.brand ?? null,
      model: dto.model === undefined ? entity.model : dto.model ?? null,
      manufacturer: dto.manufacturer === undefined ? entity.manufacturer : dto.manufacturer ?? dto.vendor_name ?? null,
      vendorName: dto.vendor_name === undefined ? entity.vendorName : dto.vendor_name ?? dto.manufacturer ?? null,
      vendorPlatform: dto.platform_type === undefined ? entity.vendorPlatform : dto.platform_type ?? null,
      vendorDeviceId: nextVendorDeviceId,
      platformType: dto.platform_type === undefined ? entity.platformType : dto.platform_type ?? null,
      platformDeviceId: dto.platform_device_id === undefined ? entity.platformDeviceId : dto.platform_device_id ?? nextVendorDeviceId,
      protocolType: dto.protocol_type ?? entity.protocolType,
      connectionType: dto.connection_type === undefined ? entity.connectionType : dto.connection_type ?? null,
      ipAddress: dto.ip_address === undefined ? entity.ipAddress : dto.ip_address ?? null,
      port: dto.port === undefined ? entity.port : dto.port ?? null,
      macAddress: dto.mac_address === undefined ? entity.macAddress : dto.mac_address ?? null,
      serialNumber: dto.serial_number === undefined ? entity.serialNumber : dto.serial_number ?? null,
      buildingId: refs.buildingId,
      floorId: refs.floorId,
      unitId: refs.unitId,
      roomId: refs.roomId,
      areaId: dto.area_id === undefined ? entity.areaId : dto.area_id ?? null,
      parkTenantId: refs.parkTenantId,
      location: dto.location === undefined ? entity.location : dto.location ?? null,
      installLocation: dto.install_location === undefined ? entity.installLocation : dto.install_location ?? dto.location ?? null,
      gpsLng: dto.gps_lng === undefined && dto.longitude === undefined ? entity.gpsLng : this.formatNumber(dto.gps_lng ?? dto.longitude),
      gpsLat: dto.gps_lat === undefined && dto.latitude === undefined ? entity.gpsLat : this.formatNumber(dto.gps_lat ?? dto.latitude),
      longitude: dto.longitude === undefined && dto.gps_lng === undefined ? entity.longitude : this.formatNumber(dto.longitude ?? dto.gps_lng),
      latitude: dto.latitude === undefined && dto.gps_lat === undefined ? entity.latitude : this.formatNumber(dto.latitude ?? dto.gps_lat),
      installDate: dto.install_date === undefined ? entity.installDate : dto.install_date ?? null,
      warrantyEndDate: dto.warranty_end_date === undefined ? entity.warrantyEndDate : dto.warranty_end_date ?? null,
      status: statusState.status,
      onlineStatus: statusState.onlineStatus,
      isEnabled: statusState.isEnabled,
      lastHeartbeatAt: dto.last_heartbeat_at === undefined ? entity.lastHeartbeatAt : this.parseOptionalDate(dto.last_heartbeat_at, "last_heartbeat_at"),
      statusPayload: dto.status_payload === undefined ? entity.statusPayload : this.normalizePayload(dto.status_payload),
      metadata: dto.status_payload === undefined ? entity.metadata : this.normalizePayload(dto.status_payload),
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.deviceRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string; mode: "soft_delete"; retained_history: boolean }> {
    const entity = await this.findDevice(scope, id, actor);
    const [dataCount, latestCount, alertCount] = await Promise.all([
      this.deviceDataRepository.count({ where: { tenantId: scope.tenantId, parkId: scope.parkId, deviceId: id, isDeleted: false } }),
      this.deviceLatestRepository.count({ where: { tenantId: scope.tenantId, parkId: scope.parkId, deviceId: id, isDeleted: false } }),
      this.alertRepository.count({ where: { tenantId: scope.tenantId, parkId: scope.parkId, deviceId: id, isDeleted: false } })
    ]);
    entity.isDeleted = true;
    entity.status = "disabled";
    entity.updateBy = actor.sub;
    await this.deviceRepository.save(entity);
    return { id, mode: "soft_delete", retained_history: dataCount + latestCount + alertCount > 0 };
  }

  async enable(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<IotDeviceView> {
    const entity = await this.findDevice(scope, id, actor);
    entity.status = DEFAULT_STATUS;
    entity.isEnabled = true;
    entity.updateBy = actor.sub;
    await this.deviceRepository.save(entity);
    return this.detail(scope, id, actor);
  }

  async disable(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<IotDeviceView> {
    const entity = await this.findDevice(scope, id, actor);
    entity.status = "disabled";
    entity.onlineStatus = "disabled";
    entity.isEnabled = false;
    entity.updateBy = actor.sub;
    await this.deviceRepository.save(entity);
    return this.detail(scope, id, actor);
  }

  async setStatus(scope: TenantParkScope, actor: JwtPrincipal, id: string, status: string): Promise<IotDeviceView> {
    const entity = await this.findDevice(scope, id, actor);
    const normalized = this.normalizeStatusValue(status);
    const now = new Date();
    if (normalized === "disabled") {
      entity.status = "disabled";
      entity.onlineStatus = "disabled";
      entity.isEnabled = false;
      entity.lastOfflineTime = now;
    } else {
      entity.status = DEFAULT_STATUS;
      entity.onlineStatus = normalized;
      entity.isEnabled = true;
      if (normalized === "online") entity.lastOnlineTime = now;
      if (normalized === "offline") entity.lastOfflineTime = now;
    }
    entity.lastHeartbeatAt = now;
    entity.updateBy = actor.sub;
    await this.deviceRepository.save(entity);
    return this.detail(scope, id, actor);
  }

  async resetSecret(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string; device_secret: string }> {
    const entity = await this.findDevice(scope, id, actor);
    const plainSecret = this.deviceSecretService.generatePlainSecret();
    entity.deviceSecretHash = this.deviceSecretService.hashSecret(plainSecret);
    entity.deviceSecret = this.deviceSecretService.encryptSecret(plainSecret);
    entity.updateBy = actor.sub;
    await this.deviceRepository.save(entity);
    return { id, device_secret: plainSecret };
  }

  private scopedDeviceBuilder(scope: TenantParkScope): SelectQueryBuilder<IotDeviceEntity> {
    return this.deviceRepository
      .createQueryBuilder("device")
      .where("device.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("device.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("device.is_deleted = false");
  }

  private async findDevice(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotDeviceEntity> {
    const builder = this.scopedDeviceBuilder(scope).andWhere("device.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("IoT device not found");
    }
    return entity;
  }

  private scopedDeviceDataBuilder(scope: TenantParkScope, deviceId: string): SelectQueryBuilder<IotDeviceDataEntity> {
    return this.deviceDataRepository
      .createQueryBuilder("data")
      .where("data.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("data.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("data.device_id = :deviceId", { deviceId })
      .andWhere("data.is_deleted = false");
  }

  private applyDataTimeQuery(
    builder: SelectQueryBuilder<IotDeviceDataEntity>,
    metricCode?: string,
    startTime?: string,
    endTime?: string
  ): void {
    if (metricCode) {
      builder.andWhere("data.metric_code = :metricCode", { metricCode });
    }
    const start = this.parseOptionalDate(startTime, "start_time");
    if (start) {
      builder.andWhere("data.reported_at >= :startTime", { startTime: start });
    }
    const end = this.parseOptionalDate(endTime, "end_time");
    if (end) {
      builder.andWhere("data.reported_at <= :endTime", { endTime: end });
    }
  }

  private applyDeviceQuery(builder: SelectQueryBuilder<IotDeviceEntity>, query: IotDeviceQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("device.device_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("device.device_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("device.vendor_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("device.vendor_device_id ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("device.brand ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("device.model ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("device.ip_address ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("device.location ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.device_type) builder.andWhere("device.device_type = :deviceType", { deviceType: query.device_type });
    if (query.protocol_type) builder.andWhere("device.protocol_type = :protocolType", { protocolType: query.protocol_type });
    if (query.status) {
      const normalizedStatus = this.normalizeStatusValue(query.status);
      builder.andWhere("(device.status = :status OR device.online_status = :status)", { status: normalizedStatus });
    }
    if (query.online_status) builder.andWhere("device.online_status = :onlineStatus", { onlineStatus: query.online_status });
    if (query.gateway_id) builder.andWhere("device.gateway_id = :gatewayId", { gatewayId: query.gateway_id });
    if (query.building_id) builder.andWhere("device.building_id = :buildingId", { buildingId: query.building_id });
    if (query.floor_id) builder.andWhere("device.floor_id = :floorId", { floorId: query.floor_id });
    if (query.unit_id) builder.andWhere("device.unit_id = :unitId", { unitId: query.unit_id });
    if (query.room_id) builder.andWhere("(device.room_id = :roomId OR device.unit_id = :roomId)", { roomId: query.room_id });
    if (query.area_id) builder.andWhere("device.area_id = :areaId", { areaId: query.area_id });
    if (query.park_tenant_id) builder.andWhere("device.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
  }

  private applyDeviceSort(builder: SelectQueryBuilder<IotDeviceEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      device_code: "device.deviceCode",
      device_name: "device.deviceName",
      device_type: "device.deviceType",
      protocol_type: "device.protocolType",
      status: "device.status",
      online_status: "device.onlineStatus",
      last_heartbeat_at: "device.lastHeartbeatAt",
      last_online_time: "device.lastOnlineTime",
      last_data_time: "device.lastDataTime",
      update_time: "device.updateTime",
      create_time: "device.createTime"
    };
    this.applySort(builder, sort, sortMap, "device.updateTime", "device.createTime", "DESC");
  }

  private applySort<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    sort: string | undefined,
    sortMap: Record<string, string>,
    defaultField: string,
    tieBreaker: string,
    defaultDirection: "ASC" | "DESC" = "ASC"
  ): void {
    if (sort) {
      const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
      builder.orderBy(sortMap[field] ?? defaultField, direction as "ASC" | "DESC").addOrderBy(tieBreaker, "DESC");
      return;
    }
    builder.orderBy(defaultField, defaultDirection).addOrderBy(tieBreaker, "DESC");
  }

  private async applyDataScope(builder: SelectQueryBuilder<IotDeviceEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "device");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "device", { device: "id" });
  }

  private async getLatestByDevice(scope: TenantParkScope, deviceIds: string[]): Promise<Map<string, IotDeviceLatestView[]>> {
    const grouped = new Map<string, IotDeviceLatestView[]>();
    if (deviceIds.length === 0) return grouped;
    const rows = await this.deviceLatestRepository
      .createQueryBuilder("latest")
      .where("latest.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("latest.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("latest.is_deleted = false")
      .andWhere("latest.device_id IN (:...deviceIds)", { deviceIds })
      .orderBy("latest.device_id", "ASC")
      .addOrderBy("latest.reported_at", "DESC")
      .addOrderBy("latest.metric_code", "ASC")
      .getMany();
    for (const row of rows) {
      const items = grouped.get(row.deviceId) ?? [];
      if (items.length < 4) {
        items.push(this.toLatestView(row));
      }
      grouped.set(row.deviceId, items);
    }
    return grouped;
  }

  private async resolveLocationRefs(
    scope: TenantParkScope,
    dto: Pick<CreateIotDeviceDto, "building_id" | "floor_id" | "unit_id" | "room_id" | "park_tenant_id">
  ): Promise<LocationRefs> {
    let buildingId = dto.building_id ?? null;
    let floorId = dto.floor_id ?? null;
    const unitId = dto.unit_id ?? dto.room_id ?? null;
    const roomId = dto.room_id ?? unitId;
    const parkTenantId = dto.park_tenant_id ?? null;
    if (unitId) {
      const unit = await this.unitRepository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, id: unitId, isDeleted: false }
      });
      if (!unit) {
        throw new BadRequestException("unit_id does not belong to current tenant and park");
      }
      if (buildingId && buildingId !== unit.buildingId) {
        throw new BadRequestException("building_id does not match unit_id");
      }
      if (floorId && floorId !== unit.floorId) {
        throw new BadRequestException("floor_id does not match unit_id");
      }
      buildingId = unit.buildingId;
      floorId = unit.floorId;
    }
    if (buildingId) {
      const building = await this.buildingRepository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, id: buildingId, isDeleted: false }
      });
      if (!building) {
        throw new BadRequestException("building_id does not belong to current tenant and park");
      }
    }
    if (floorId) {
      const floor = await this.floorRepository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, id: floorId, isDeleted: false }
      });
      if (!floor) {
        throw new BadRequestException("floor_id does not belong to current tenant and park");
      }
      if (buildingId && floor.buildingId !== buildingId) {
        throw new BadRequestException("floor_id does not belong to building_id");
      }
      buildingId = buildingId ?? floor.buildingId;
    }
    if (parkTenantId) {
      const parkTenant = await this.parkTenantRepository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, id: parkTenantId, isDeleted: false }
      });
      if (!parkTenant) {
        throw new BadRequestException("park_tenant_id does not belong to current tenant and park");
      }
    }
    return { buildingId, floorId, unitId, roomId, parkTenantId };
  }

  private async assertGateway(scope: TenantParkScope, gatewayId?: string): Promise<void> {
    if (!gatewayId) return;
    const gateway = await this.gatewayRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, id: gatewayId, isDeleted: false }
    });
    if (!gateway) {
      throw new BadRequestException("gateway_id does not belong to current tenant and park");
    }
  }

  private async assertDeviceCodeAvailable(scope: TenantParkScope, deviceCode: string, excludeId?: string): Promise<void> {
    const builder = this.scopedDeviceBuilder(scope).andWhere("device.device_code = :deviceCode", { deviceCode });
    if (excludeId) {
      builder.andWhere("device.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("IoT device code already exists");
    }
  }

  private async assertVendorDeviceAvailable(scope: TenantParkScope, gatewayId: string | null, vendorDeviceId: string | null, excludeId?: string): Promise<void> {
    if (!gatewayId || !vendorDeviceId) return;
    const builder = this.scopedDeviceBuilder(scope)
      .andWhere("device.gateway_id = :gatewayId", { gatewayId })
      .andWhere("device.vendor_device_id = :vendorDeviceId", { vendorDeviceId });
    if (excludeId) {
      builder.andWhere("device.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("vendor_device_id already exists under this gateway");
    }
  }

  private assertRequired(value: unknown, message: string): void {
    if (value === null || value === undefined || String(value).trim() === "") {
      throw new BadRequestException(message);
    }
  }

  private formatNumber(value: number | undefined): string | null {
    return value === undefined ? null : String(value);
  }

  private normalizePayload(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private normalizeStatusValue(status: string | undefined): string {
    const value = String(status ?? DEFAULT_ONLINE_STATUS).trim();
    const upperMap: Record<string, string> = {
      ONLINE: "online",
      OFFLINE: "offline",
      UNKNOWN: "unknown",
      DISABLED: "disabled"
    };
    return upperMap[value.toUpperCase()] ?? value;
  }

  private normalizeStatusState(
    status: string | undefined,
    onlineStatus: string | undefined,
    isEnabled: boolean | undefined,
    current?: IotDeviceEntity
  ): { status: string; onlineStatus: string; isEnabled: boolean } {
    const normalizedStatus = status === undefined ? undefined : this.normalizeStatusValue(status);
    const normalizedOnlineStatus = onlineStatus === undefined ? undefined : this.normalizeStatusValue(onlineStatus);
    const disabled = normalizedStatus === "disabled" || isEnabled === false;
    if (disabled) {
      return { status: "disabled", onlineStatus: "disabled", isEnabled: false };
    }
    return {
      status: normalizedStatus && ["enabled", "disabled"].includes(normalizedStatus) ? normalizedStatus : current?.status ?? DEFAULT_STATUS,
      onlineStatus: normalizedOnlineStatus ?? (normalizedStatus && !["enabled", "disabled"].includes(normalizedStatus) ? normalizedStatus : current?.onlineStatus ?? DEFAULT_ONLINE_STATUS),
      isEnabled: isEnabled ?? current?.isEnabled ?? true
    };
  }

  private parseOptionalDate(value: string | undefined, fieldName: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }
    return parsed;
  }

  private toSafeView(entity: IotDeviceEntity): IotDeviceView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      code: entity.code,
      deviceCode: entity.deviceCode,
      deviceName: entity.deviceName,
      deviceType: entity.deviceType,
      deviceCategory: entity.deviceCategory,
      gatewayId: entity.gatewayId,
      brand: entity.brand,
      model: entity.model,
      manufacturer: entity.manufacturer,
      vendorName: entity.vendorName ?? entity.vendorPlatform,
      vendorDeviceId: entity.vendorDeviceId,
      platformType: entity.platformType ?? entity.vendorPlatform,
      platformDeviceId: entity.platformDeviceId ?? entity.vendorDeviceId,
      protocolType: entity.protocolType,
      connectionType: entity.connectionType,
      ipAddress: entity.ipAddress,
      port: entity.port,
      macAddress: entity.macAddress,
      serialNumber: entity.serialNumber,
      buildingId: entity.buildingId,
      floorId: entity.floorId,
      unitId: entity.unitId,
      roomId: entity.roomId ?? entity.unitId,
      areaId: entity.areaId,
      parkTenantId: entity.parkTenantId,
      location: entity.location,
      installLocation: entity.installLocation ?? entity.installPosition,
      gpsLng: entity.gpsLng,
      gpsLat: entity.gpsLat,
      longitude: entity.longitude ?? entity.gpsLng,
      latitude: entity.latitude ?? entity.gpsLat,
      installDate: entity.installDate,
      warrantyEndDate: entity.warrantyEndDate,
      status: entity.status,
      onlineStatus: entity.onlineStatus,
      isEnabled: entity.isEnabled,
      lastOnlineTime: entity.lastOnlineTime,
      lastOfflineTime: entity.lastOfflineTime,
      lastDataTime: entity.lastDataTime ?? entity.lastReportTime,
      lastHeartbeatAt: entity.lastHeartbeatAt,
      statusPayload: entity.statusPayload ?? entity.metadata ?? {},
      remark: entity.remark,
      createBy: entity.createBy,
      createTime: entity.createTime,
      updateBy: entity.updateBy,
      updateTime: entity.updateTime,
      isDeleted: entity.isDeleted,
      version: entity.version
    };
  }

  private toLatestView(entity: IotDeviceLatestEntity): IotDeviceLatestView {
    return {
      id: entity.id,
      deviceId: entity.deviceId,
      deviceCode: entity.deviceCode,
      pointId: entity.pointId,
      metricId: entity.metricId,
      metricCode: entity.metricCode,
      valueType: entity.valueType,
      valueNumber: entity.valueNumber,
      valueText: entity.valueText,
      valueBool: entity.valueBool,
      valueJson: entity.valueJson,
      quality: entity.quality,
      reportedAt: entity.reportedAt ?? entity.reportTime,
      receivedAt: entity.receivedAt ?? entity.updateTime,
      updateTime: entity.updateTime
    };
  }

  private toDataView(entity: IotDeviceDataEntity): IotDeviceDataView {
    return {
      id: entity.id,
      deviceId: entity.deviceId,
      deviceCode: entity.deviceCode,
      pointId: entity.pointId,
      metricId: entity.metricId,
      metricCode: entity.metricCode,
      valueType: entity.valueType,
      valueNumber: entity.valueNumber,
      valueText: entity.valueText,
      valueBool: entity.valueBool,
      valueJson: entity.valueJson,
      quality: entity.quality,
      reportedAt: entity.reportedAt ?? entity.reportTime,
      receivedAt: entity.receivedAt ?? entity.createTime,
      rawPayload: entity.rawPayload ?? {},
      createTime: entity.createTime
    };
  }
}
