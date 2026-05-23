import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreateIotMetricDto } from "./dto/create-iot-metric.dto";
import type { CreateIotPointDto } from "./dto/create-iot-point.dto";
import type { IotMetricQueryDto } from "./dto/iot-metric-query.dto";
import type { UpdateIotMetricDto } from "./dto/update-iot-metric.dto";
import type { UpdateIotPointDto } from "./dto/update-iot-point.dto";
import { IotDeviceDataEntity } from "./entities/iot-device-data.entity";
import { IotDeviceLatestEntity } from "./entities/iot-device-latest.entity";
import { IotDeviceEntity } from "./entities/iot-device.entity";
import { IotMetricEntity } from "./entities/iot-metric.entity";
import { IotPointEntity } from "./entities/iot-point.entity";

const METRIC_ENTITY = "iot_metric";
const POINT_ENTITY = "iot_point";
const DEFAULT_STATUS = "enabled";
const DEFAULT_POINT_TYPE = "telemetry";

export interface IotMetricView {
  id: string;
  tenantId: string;
  parkId: string;
  code: string | null;
  metricCode: string;
  metricName: string;
  deviceType: string | null;
  valueType: string;
  unit: string | null;
  precisionDigits: number | null;
  enumMap: Record<string, unknown>;
  status: string;
  remark: string | null;
  createTime: Date;
  updateTime: Date;
}

export interface IotPointView {
  id: string;
  tenantId: string;
  parkId: string;
  code: string | null;
  pointCode: string;
  deviceId: string;
  metricId: string | null;
  metricCode: string | null;
  pointName: string;
  pointType: string;
  valueType: string;
  unit: string | null;
  reportTopic: string | null;
  reportKey: string | null;
  minValue: string | null;
  maxValue: string | null;
  lastValue: string | null;
  lastValueText: string | null;
  lastReportTime: Date | null;
  status: string;
  remark: string | null;
  createTime: Date;
  updateTime: Date;
}

@Injectable()
export class IotMetricsService {
  constructor(
    @InjectRepository(IotMetricEntity)
    private readonly metricRepository: Repository<IotMetricEntity>,
    @InjectRepository(IotPointEntity)
    private readonly pointRepository: Repository<IotPointEntity>,
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    @InjectRepository(IotDeviceDataEntity)
    private readonly dataRepository: Repository<IotDeviceDataEntity>,
    @InjectRepository(IotDeviceLatestEntity)
    private readonly latestRepository: Repository<IotDeviceLatestEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async listMetrics(scope: TenantParkScope, query: IotMetricQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<IotMetricView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedMetricBuilder(scope);
    await this.applyMetricDataScope(builder, scope, actor);
    this.applyMetricQuery(builder, query);
    this.applyMetricSort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const safeItems = items.map((item) => this.toMetricView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", METRIC_ENTITY, safeItems);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async createMetric(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateIotMetricDto): Promise<IotMetricView> {
    this.assertRequired(dto.metric_name, "metric_name is required");
    this.assertRequired(dto.value_type, "value_type is required");
    const generated = dto.metric_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "IOT_METRIC_CODE");
    const metricCode = dto.metric_code ?? generated?.code ?? "";
    this.assertRequired(metricCode, "metric_code is required");
    await this.assertMetricCodeAvailable(scope, metricCode);
    const entity = this.metricRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: dto.code ?? metricCode,
      metricCode,
      metricName: dto.metric_name,
      deviceType: dto.device_type ?? null,
      valueType: dto.value_type,
      unit: dto.unit ?? null,
      precisionDigits: dto.precision_digits ?? null,
      enumMap: this.normalizeJson(dto.enum_map),
      status: dto.status ?? DEFAULT_STATUS,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.metricRepository.save(entity);
    return this.metricDetail(scope, saved.id, actor);
  }

  async updateMetric(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateIotMetricDto): Promise<IotMetricView> {
    const entity = await this.findMetricById(scope, id, actor);
    const nextMetricCode = dto.metric_code ?? entity.metricCode;
    if (nextMetricCode !== entity.metricCode) {
      await this.assertMetricCodeAvailable(scope, nextMetricCode, entity.id);
    }
    Object.assign(entity, {
      code: dto.code === undefined ? entity.code : dto.code ?? null,
      metricCode: nextMetricCode,
      metricName: dto.metric_name ?? entity.metricName,
      deviceType: dto.device_type === undefined ? entity.deviceType : dto.device_type ?? null,
      valueType: dto.value_type ?? entity.valueType,
      unit: dto.unit === undefined ? entity.unit : dto.unit ?? null,
      precisionDigits: dto.precision_digits === undefined ? entity.precisionDigits : dto.precision_digits ?? null,
      enumMap: dto.enum_map === undefined ? entity.enumMap : this.normalizeJson(dto.enum_map),
      status: dto.status ?? entity.status,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.metricRepository.save(entity);
    return this.metricDetail(scope, saved.id, actor);
  }

  async deleteMetric(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findMetricById(scope, id, actor);
    const hasPoints = await this.pointRepository
      .createQueryBuilder("point")
      .where("point.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("point.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("point.metric_id = :metricId", { metricId: id })
      .andWhere("point.is_deleted = false")
      .getExists();
    if (hasPoints) {
      throw new BadRequestException("Metric is already bound by IoT points");
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.metricRepository.save(entity);
    return { id };
  }

  async listPoints(scope: TenantParkScope, actor: JwtPrincipal | undefined, deviceId: string): Promise<IotPointView[]> {
    await this.findDevice(scope, deviceId, actor);
    const builder = this.scopedPointBuilder(scope)
      .andWhere("point.device_id = :deviceId", { deviceId })
      .orderBy("point.pointCode", "ASC")
      .addOrderBy("point.createTime", "ASC");
    await this.applyPointDataScope(builder, scope, actor);
    const items = await builder.getMany();
    const safeItems = items.map((item) => this.toPointView(item));
    return this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", POINT_ENTITY, safeItems);
  }

  async createPoint(scope: TenantParkScope, actor: JwtPrincipal, deviceId: string, dto: CreateIotPointDto): Promise<IotPointView> {
    await this.findDevice(scope, deviceId, actor);
    this.assertRequired(dto.point_name, "point_name is required");
    this.assertRequired(dto.value_type, "value_type is required");
    const metric = await this.resolveMetric(scope, dto.metric_id, dto.metric_code);
    const generated = dto.point_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "IOT_POINT_CODE");
    const pointCode = dto.point_code ?? generated?.code ?? "";
    this.assertRequired(pointCode, "point_code is required");
    await this.assertPointCodeAvailable(scope, deviceId, pointCode);
    const metricCode = metric?.metricCode ?? dto.metric_code ?? pointCode;
    const entity = this.pointRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: dto.code ?? pointCode,
      pointCode,
      deviceId,
      metricId: metric?.id ?? null,
      metricCode,
      pointName: dto.point_name,
      pointType: dto.point_type ?? DEFAULT_POINT_TYPE,
      valueType: dto.value_type,
      unit: dto.unit ?? metric?.unit ?? null,
      reportTopic: dto.report_topic ?? null,
      reportKey: dto.report_key ?? metricCode,
      minValue: this.formatNumber(dto.min_value),
      maxValue: this.formatNumber(dto.max_value),
      status: dto.status ?? DEFAULT_STATUS,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.pointRepository.save(entity);
    return this.pointDetail(scope, actor, deviceId, saved.id);
  }

  async updatePoint(scope: TenantParkScope, actor: JwtPrincipal, deviceId: string, pointId: string, dto: UpdateIotPointDto): Promise<IotPointView> {
    await this.findDevice(scope, deviceId, actor);
    const entity = await this.findPoint(scope, deviceId, pointId, actor);
    const nextPointCode = dto.point_code ?? entity.pointCode;
    if (nextPointCode !== entity.pointCode) {
      await this.assertPointCodeAvailable(scope, deviceId, nextPointCode, entity.id);
    }
    const metric = await this.resolveMetric(scope, dto.metric_id === undefined ? entity.metricId ?? undefined : dto.metric_id, dto.metric_code);
    const nextMetricCode = metric?.metricCode ?? dto.metric_code ?? entity.metricCode ?? nextPointCode;
    Object.assign(entity, {
      code: dto.code === undefined ? entity.code : dto.code ?? null,
      pointCode: nextPointCode,
      metricId: dto.metric_id === undefined ? entity.metricId : metric?.id ?? null,
      metricCode: nextMetricCode,
      pointName: dto.point_name ?? entity.pointName,
      pointType: dto.point_type ?? entity.pointType,
      valueType: dto.value_type ?? entity.valueType,
      unit: dto.unit === undefined ? entity.unit : dto.unit ?? metric?.unit ?? null,
      reportTopic: dto.report_topic === undefined ? entity.reportTopic : dto.report_topic ?? null,
      reportKey: dto.report_key === undefined ? entity.reportKey : dto.report_key ?? nextMetricCode,
      minValue: dto.min_value === undefined ? entity.minValue : this.formatNumber(dto.min_value),
      maxValue: dto.max_value === undefined ? entity.maxValue : this.formatNumber(dto.max_value),
      status: dto.status ?? entity.status,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.pointRepository.save(entity);
    return this.pointDetail(scope, actor, deviceId, saved.id);
  }

  async deletePoint(scope: TenantParkScope, actor: JwtPrincipal, deviceId: string, pointId: string): Promise<{ id: string }> {
    await this.findDevice(scope, deviceId, actor);
    const entity = await this.findPoint(scope, deviceId, pointId, actor);
    if (await this.hasPointData(scope, entity)) {
      throw new BadRequestException("Point already has history data; disable it instead of deleting");
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.pointRepository.save(entity);
    return { id: pointId };
  }

  private async metricDetail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotMetricView> {
    const entity = await this.findMetricById(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "iot", METRIC_ENTITY, this.toMetricView(entity));
  }

  private async pointDetail(scope: TenantParkScope, actor: JwtPrincipal | undefined, deviceId: string, pointId: string): Promise<IotPointView> {
    const entity = await this.findPoint(scope, deviceId, pointId, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "iot", POINT_ENTITY, this.toPointView(entity));
  }

  private scopedMetricBuilder(scope: TenantParkScope): SelectQueryBuilder<IotMetricEntity> {
    return this.metricRepository
      .createQueryBuilder("metric")
      .where("metric.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("metric.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("metric.is_deleted = false");
  }

  private scopedPointBuilder(scope: TenantParkScope): SelectQueryBuilder<IotPointEntity> {
    return this.pointRepository
      .createQueryBuilder("point")
      .where("point.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("point.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("point.is_deleted = false");
  }

  private async findDevice(scope: TenantParkScope, deviceId: string, actor?: JwtPrincipal): Promise<IotDeviceEntity> {
    const builder = this.deviceRepository
      .createQueryBuilder("device")
      .where("device.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("device.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("device.id = :deviceId", { deviceId })
      .andWhere("device.is_deleted = false");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "device");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "device", { device: "id" });
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("IoT device not found");
    }
    return entity;
  }

  private async findMetricById(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotMetricEntity> {
    const builder = this.scopedMetricBuilder(scope).andWhere("metric.id = :id", { id });
    await this.applyMetricDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("IoT metric not found");
    }
    return entity;
  }

  private async findPoint(scope: TenantParkScope, deviceId: string, pointId: string, actor?: JwtPrincipal): Promise<IotPointEntity> {
    const builder = this.scopedPointBuilder(scope)
      .andWhere("point.device_id = :deviceId", { deviceId })
      .andWhere("point.id = :pointId", { pointId });
    await this.applyPointDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("IoT point not found");
    }
    return entity;
  }

  private async resolveMetric(scope: TenantParkScope, metricId?: string, metricCode?: string): Promise<IotMetricEntity | null> {
    if (!metricId && !metricCode) return null;
    const builder = this.scopedMetricBuilder(scope);
    if (metricId) {
      builder.andWhere("metric.id = :metricId", { metricId });
    } else {
      builder.andWhere("metric.metric_code = :metricCode", { metricCode });
    }
    const entity = await builder.getOne();
    if (metricId && !entity) {
      throw new BadRequestException("metric_id does not belong to current tenant and park");
    }
    return entity;
  }

  private applyMetricQuery(builder: SelectQueryBuilder<IotMetricEntity>, query: IotMetricQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("metric.metric_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("metric.metric_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("metric.unit ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.device_type) builder.andWhere("metric.device_type = :deviceType", { deviceType: query.device_type });
    if (query.value_type) builder.andWhere("metric.value_type = :valueType", { valueType: query.value_type });
    if (query.status) builder.andWhere("metric.status = :status", { status: query.status });
  }

  private applyMetricSort(builder: SelectQueryBuilder<IotMetricEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      metric_code: "metric.metricCode",
      metric_name: "metric.metricName",
      device_type: "metric.deviceType",
      value_type: "metric.valueType",
      update_time: "metric.updateTime",
      create_time: "metric.createTime"
    };
    this.applySort(builder, sort, sortMap, "metric.updateTime", "metric.createTime", "DESC");
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

  private async applyMetricDataScope(builder: SelectQueryBuilder<IotMetricEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "metric");
  }

  private async applyPointDataScope(builder: SelectQueryBuilder<IotPointEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "point");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "point");
  }

  private async assertMetricCodeAvailable(scope: TenantParkScope, metricCode: string, excludeId?: string): Promise<void> {
    const builder = this.scopedMetricBuilder(scope).andWhere("metric.metric_code = :metricCode", { metricCode });
    if (excludeId) {
      builder.andWhere("metric.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("IoT metric code already exists");
    }
  }

  private async assertPointCodeAvailable(scope: TenantParkScope, deviceId: string, pointCode: string, excludeId?: string): Promise<void> {
    const builder = this.scopedPointBuilder(scope)
      .andWhere("point.device_id = :deviceId", { deviceId })
      .andWhere("point.point_code = :pointCode", { pointCode });
    if (excludeId) {
      builder.andWhere("point.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("IoT point code already exists under this device");
    }
  }

  private async hasPointData(scope: TenantParkScope, point: IotPointEntity): Promise<boolean> {
    if (!point.metricCode) return false;
    const where = {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      deviceId: point.deviceId,
      metricCode: point.metricCode,
      isDeleted: false
    };
    const [dataCount, latestCount] = await Promise.all([
      this.dataRepository.count({ where }),
      this.latestRepository.count({ where })
    ]);
    return dataCount + latestCount > 0;
  }

  private assertRequired(value: unknown, message: string): void {
    if (value === null || value === undefined || String(value).trim() === "") {
      throw new BadRequestException(message);
    }
  }

  private normalizeJson(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private formatNumber(value: number | undefined): string | null {
    return value === undefined ? null : String(value);
  }

  private toMetricView(entity: IotMetricEntity): IotMetricView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      code: entity.code,
      metricCode: entity.metricCode,
      metricName: entity.metricName,
      deviceType: entity.deviceType,
      valueType: entity.valueType,
      unit: entity.unit,
      precisionDigits: entity.precisionDigits,
      enumMap: entity.enumMap ?? {},
      status: entity.status,
      remark: entity.remark,
      createTime: entity.createTime,
      updateTime: entity.updateTime
    };
  }

  private toPointView(entity: IotPointEntity): IotPointView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      code: entity.code,
      pointCode: entity.pointCode,
      deviceId: entity.deviceId,
      metricId: entity.metricId,
      metricCode: entity.metricCode,
      pointName: entity.pointName,
      pointType: entity.pointType,
      valueType: entity.valueType,
      unit: entity.unit,
      reportTopic: entity.reportTopic,
      reportKey: entity.reportKey,
      minValue: entity.minValue,
      maxValue: entity.maxValue,
      lastValue: entity.lastValue,
      lastValueText: entity.lastValueText,
      lastReportTime: entity.lastReportTime,
      status: entity.status,
      remark: entity.remark,
      createTime: entity.createTime,
      updateTime: entity.updateTime
    };
  }
}
