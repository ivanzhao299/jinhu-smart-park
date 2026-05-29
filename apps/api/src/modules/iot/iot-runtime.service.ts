import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { IotDeviceHeartbeatDto, IotDeviceMetricsDto, IotRuntimeHistoryQueryDto, IotRuntimeMetricsQueryDto } from "./dto/iot-device-runtime.dto";
import { IotAlertLogEntity } from "./entities/iot-alert-log.entity";
import { IotAlertEntity } from "./entities/iot-alert.entity";
import { IotDeviceDataEntity } from "./entities/iot-device-data.entity";
import { IotDeviceHeartbeatEntity } from "./entities/iot-device-heartbeat.entity";
import { IotDeviceLatestEntity } from "./entities/iot-device-latest.entity";
import { IotDeviceEntity } from "./entities/iot-device.entity";
import { IotRealtimeService } from "./iot-realtime.service";
import { IotRuleTriggerService } from "./iot-rule-trigger.service";

const SYSTEM_OPERATOR_ID = "00000000-0000-0000-0000-000000000000";
const OFFLINE_METRIC_CODE = "heartbeat";
const ACTIVE_ALERT_STATUSES = ["active", "acknowledged", "processing", "10", "20", "30"];
const RESOLVABLE_OFFLINE_STATUSES = ["active", "acknowledged", "processing", "resolved", "10", "20", "30", "35"];
const DEVICE_DATA_ENTITY = "iot_device_data";
const DEVICE_HEARTBEAT_ENTITY = "iot_device_heartbeat";
const ALLOWED_QUALITIES = new Set(["good", "bad", "stale", "simulated"]);

interface RuntimeValue {
  valueType: string;
  valueNumber: string | null;
  valueText: string | null;
  valueBool: boolean | null;
  valueJson: unknown | null;
}

export interface IotHeartbeatView {
  id: string;
  tenantId: string;
  parkId: string;
  deviceId: string;
  deviceCode: string | null;
  heartbeatTime: Date;
  status: string;
  latencyMs: number | null;
  signalStrength: string | null;
  batteryLevel: string | null;
  firmwareVersion: string | null;
  rawPayload: Record<string, unknown>;
  createTime: Date;
}

export interface IotRuntimeMetricView {
  id: string;
  tenantId: string;
  parkId: string;
  deviceId: string;
  deviceCode: string;
  metricKey: string;
  metricType: string;
  metricValue: string | number | boolean | unknown | null;
  metricUnit: string | null;
  valueType: string;
  quality: string;
  collectedAt: Date;
  rawPayload: Record<string, unknown>;
  createTime: Date;
}

@Injectable()
export class IotRuntimeService {
  private readonly logger = new Logger(IotRuntimeService.name);

  constructor(
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    @InjectRepository(IotDeviceHeartbeatEntity)
    private readonly heartbeatRepository: Repository<IotDeviceHeartbeatEntity>,
    @InjectRepository(IotDeviceDataEntity)
    private readonly deviceDataRepository: Repository<IotDeviceDataEntity>,
    @InjectRepository(IotDeviceLatestEntity)
    private readonly latestRepository: Repository<IotDeviceLatestEntity>,
    @InjectRepository(IotAlertEntity)
    private readonly alertRepository: Repository<IotAlertEntity>,
    @InjectRepository(IotAlertLogEntity)
    private readonly alertLogRepository: Repository<IotAlertLogEntity>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly realtimeService: IotRealtimeService,
    private readonly ruleTriggerService: IotRuleTriggerService
  ) {}

  async recordHeartbeat(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: IotDeviceHeartbeatDto): Promise<{
    device: { id: string; deviceCode: string; onlineStatus: string; lastHeartbeatAt: Date | null };
    heartbeat: IotHeartbeatView;
  }> {
    const device = await this.findDevice(scope, id, actor);
    this.assertDeviceEnabled(device);
    const now = new Date();
    const heartbeatTime = this.parseDate(dto.heartbeat_time, "heartbeat_time") ?? now;
    const nextStatus = this.normalizeHeartbeatStatus(dto.status ?? "online");
    const rawPayload = dto.raw_payload ?? {};
    let savedHeartbeat!: IotDeviceHeartbeatEntity;
    const alertEvents: Array<{ alert: IotAlertEntity; created: boolean }> = [];

    await this.dataSource.transaction(async (manager) => {
      const deviceRepository = manager.getRepository(IotDeviceEntity);
      const heartbeatRepository = manager.getRepository(IotDeviceHeartbeatEntity);
      const alertRepository = manager.getRepository(IotAlertEntity);
      const alertLogRepository = manager.getRepository(IotAlertLogEntity);
      savedHeartbeat = await heartbeatRepository.save(
        heartbeatRepository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          deviceId: device.id,
          deviceCode: device.deviceCode,
          heartbeatTime,
          status: nextStatus,
          latencyMs: dto.latency_ms ?? null,
          signalStrength: dto.signal_strength === undefined ? null : String(dto.signal_strength),
          batteryLevel: dto.battery_level === undefined ? null : String(dto.battery_level),
          firmwareVersion: dto.firmware_version ?? null,
          rawPayload,
          createBy: actor.sub,
          updateBy: actor.sub
        })
      );
      device.lastHeartbeatAt = heartbeatTime;
      device.statusPayload = {
        ...(device.statusPayload ?? {}),
        heartbeat: {
          status: nextStatus,
          latency_ms: dto.latency_ms ?? null,
          signal_strength: dto.signal_strength ?? null,
          battery_level: dto.battery_level ?? null,
          firmware_version: dto.firmware_version ?? null,
          raw_payload: rawPayload,
          heartbeat_time: heartbeatTime.toISOString()
        }
      };
      if (nextStatus === "online") {
        device.onlineStatus = "online";
        device.status = device.status === "disabled" ? device.status : "enabled";
        device.lastOnlineTime = heartbeatTime;
      } else if (nextStatus === "offline" || nextStatus === "fault") {
        device.onlineStatus = nextStatus;
        device.lastOfflineTime = heartbeatTime;
      }
      device.updateBy = actor.sub;
      await deviceRepository.save(device);
      if (nextStatus === "online") {
        const closed = await this.closeOfflineAlerts(alertRepository, alertLogRepository, scope, device, heartbeatTime, "设备心跳恢复在线");
        alertEvents.push(...closed.map((alert) => ({ alert, created: false })));
      } else {
        const alert = await this.createOrUpdateOfflineAlert(alertRepository, alertLogRepository, scope, device, heartbeatTime, rawPayload, nextStatus);
        if (alert) alertEvents.push(alert);
      }
    });

    this.publishStatus(device);
    for (const event of alertEvents) {
      if (event.created) this.realtimeService.publishAlertCreated(event.alert);
      else this.realtimeService.publishAlertUpdated(event.alert);
      await this.ruleTriggerService.handleAlertCreatedOrUpdated(scope, event.alert, actor);
    }
    await this.ruleTriggerService.handleStatusChanged(scope, device, nextStatus, actor, {
      heartbeat_time: heartbeatTime.toISOString(),
      latency_ms: dto.latency_ms ?? null,
      signal_strength: dto.signal_strength ?? null,
      battery_level: dto.battery_level ?? null,
      raw_payload: rawPayload
    });

    return {
      device: {
        id: device.id,
        deviceCode: device.deviceCode,
        onlineStatus: device.onlineStatus,
        lastHeartbeatAt: device.lastHeartbeatAt
      },
      heartbeat: this.toHeartbeatView(savedHeartbeat)
    };
  }

  async reportMetrics(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: IotDeviceMetricsDto): Promise<{
    device_id: string;
    device_code: string;
    report_time: string;
    accepted_count: number;
    metrics: IotRuntimeMetricView[];
  }> {
    const device = await this.findDevice(scope, id, actor);
    this.assertDeviceEnabled(device);
    if (!dto.metrics || Object.keys(dto.metrics).length === 0) {
      throw new BadRequestException("metrics is required");
    }
    const quality = dto.quality ?? "good";
    if (!ALLOWED_QUALITIES.has(quality)) {
      throw new BadRequestException("quality is invalid");
    }
    const reportTime = this.parseDate(dto.reported_at, "reported_at") ?? new Date();
    const rawPayload = dto.raw_payload ?? { metrics: dto.metrics };
    const savedRows: IotDeviceDataEntity[] = [];

    await this.dataSource.transaction(async (manager) => {
      const dataRepository = manager.getRepository(IotDeviceDataEntity);
      const latestRepository = manager.getRepository(IotDeviceLatestEntity);
      const deviceRepository = manager.getRepository(IotDeviceEntity);
      for (const [key, value] of Object.entries(dto.metrics)) {
        const parsed = this.parseMetricValue(value);
        const row = await dataRepository.save(
          dataRepository.create({
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            deviceId: device.id,
            deviceCode: device.deviceCode,
            pointId: null,
            metricId: null,
            metricCode: key,
            valueType: parsed.valueType,
            valueNumber: parsed.valueNumber,
            valueText: parsed.valueText,
            valueBool: parsed.valueBool,
            valueJson: parsed.valueJson,
            rawPayload,
            quality,
            reportedAt: reportTime,
            receivedAt: new Date(),
            reportTime,
            createBy: actor.sub,
            updateBy: actor.sub
          })
        );
        savedRows.push(row);
        await this.upsertLatest(latestRepository, scope, device, key, parsed, quality, rawPayload, reportTime, actor.sub);
      }
      device.lastDataTime = reportTime;
      device.lastReportTime = reportTime;
      device.onlineStatus = "online";
      device.statusPayload = { ...(device.statusPayload ?? {}), runtime_metrics: { metrics: dto.metrics, quality, reported_at: reportTime.toISOString() } };
      device.updateBy = actor.sub;
      await deviceRepository.save(device);
    });

    const metricPayloads = savedRows.map((row) => ({
      key: row.metricCode,
      metric_code: row.metricCode,
      point_id: row.pointId ?? "",
      value_type: row.valueType,
      value_number: row.valueNumber,
      value_text: row.valueText,
      value_bool: row.valueBool,
      value_json: row.valueJson
    }));
    this.realtimeService.publishDeviceLatest({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      deviceId: device.id,
      deviceCode: device.deviceCode,
      reportTime: reportTime.toISOString(),
      acceptedCount: savedRows.length,
      alertCount: 0,
      quality,
      metrics: metricPayloads
    });
    this.publishStatus(device);
    this.realtimeService.publishMetricUpdated({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      deviceId: device.id,
      deviceCode: device.deviceCode,
      reportTime: reportTime.toISOString(),
      metrics: metricPayloads
    });
    await this.ruleTriggerService.handleMetricReported(scope, device, dto.metrics, actor, {
      quality,
      reported_at: reportTime.toISOString(),
      raw_payload: rawPayload
    });

    return {
      device_id: device.id,
      device_code: device.deviceCode,
      report_time: reportTime.toISOString(),
      accepted_count: savedRows.length,
      metrics: savedRows.map((row) => this.toMetricView(row))
    };
  }

  async heartbeatHistory(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    query: IotRuntimeHistoryQueryDto
  ): Promise<PaginatedResult<IotHeartbeatView>> {
    await this.findDevice(scope, id, actor);
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 50;
    const builder = this.heartbeatRepository
      .createQueryBuilder("heartbeat")
      .innerJoin(IotDeviceEntity, "device", "device.id = heartbeat.device_id AND device.tenant_id = heartbeat.tenant_id AND device.park_id = heartbeat.park_id")
      .where("heartbeat.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("heartbeat.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("heartbeat.is_deleted = false")
      .andWhere("heartbeat.device_id = :deviceId", { deviceId: id });
    await this.applyDeviceDataScope(builder, scope, actor);
    this.applyDateFilter(builder, "heartbeat.heartbeat_time", query.start_time, query.end_time);
    const [items, total] = await builder
      .orderBy("heartbeat.heartbeatTime", "DESC")
      .addOrderBy("heartbeat.createTime", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    const views = items.map((item) => this.toHeartbeatView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", DEVICE_HEARTBEAT_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async metrics(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    query: IotRuntimeMetricsQueryDto
  ): Promise<PaginatedResult<IotRuntimeMetricView>> {
    await this.findDevice(scope, id, actor);
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 100;
    const builder = this.deviceDataRepository
      .createQueryBuilder("data")
      .innerJoin(IotDeviceEntity, "device", "device.id = data.device_id AND device.tenant_id = data.tenant_id AND device.park_id = data.park_id")
      .where("data.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("data.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("data.is_deleted = false")
      .andWhere("data.device_id = :deviceId", { deviceId: id });
    await this.applyDeviceDataScope(builder, scope, actor);
    const metricCode = query.metric_code ?? query.metric_key ?? query.metric_type;
    if (metricCode) {
      builder.andWhere("data.metric_code = :metricCode", { metricCode });
    }
    this.applyDateFilter(builder, "data.reported_at", query.start_time, query.end_time);
    const [items, total] = await builder
      .orderBy("data.reportedAt", "DESC")
      .addOrderBy("data.createTime", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    const views = items.map((item) => this.toMetricView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", DEVICE_DATA_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async scanHeartbeatTimeouts(): Promise<{ scanned_count: number; offline_count: number; closed_count: number }> {
    const timeoutSeconds = Math.max(30, Number(this.configService.get<string>("IOT_HEARTBEAT_TIMEOUT_SECONDS") ?? "120"));
    const deadline = new Date(Date.now() - timeoutSeconds * 1000);
    const devices = await this.deviceRepository
      .createQueryBuilder("device")
      .where("device.is_deleted = false")
      .andWhere("device.is_enabled = true")
      .andWhere("device.last_heartbeat_at IS NOT NULL")
      .andWhere("device.last_heartbeat_at < :deadline", { deadline })
      .andWhere("device.online_status <> :offline", { offline: "offline" })
      .take(500)
      .getMany();
    let offlineCount = 0;
    for (const device of devices) {
      const alertEvents: Array<{ alert: IotAlertEntity; created: boolean }> = [];
      await this.dataSource.transaction(async (manager) => {
        const deviceRepository = manager.getRepository(IotDeviceEntity);
        const alertRepository = manager.getRepository(IotAlertEntity);
        const alertLogRepository = manager.getRepository(IotAlertLogEntity);
        device.onlineStatus = "offline";
        device.lastOfflineTime = new Date();
        device.updateBy = null;
        await deviceRepository.save(device);
        const alert = await this.createOrUpdateOfflineAlert(
          alertRepository,
          alertLogRepository,
          { tenantId: device.tenantId, parkId: device.parkId },
          device,
          new Date(),
          { timeout_seconds: timeoutSeconds, last_heartbeat_at: device.lastHeartbeatAt?.toISOString() ?? null },
          "offline"
        );
        if (alert) {
          alertEvents.push(alert);
          if (alert.created) this.realtimeService.publishAlertCreated(alert.alert);
          else this.realtimeService.publishAlertUpdated(alert.alert);
        }
      });
      this.publishStatus(device);
      const scope = { tenantId: device.tenantId, parkId: device.parkId };
      await this.ruleTriggerService.handleStatusChanged(scope, device, "offline", undefined, {
        timeout_scan: true,
        last_heartbeat_at: device.lastHeartbeatAt?.toISOString() ?? null
      });
      for (const alertEvent of alertEvents) {
        await this.ruleTriggerService.handleAlertCreatedOrUpdated(scope, alertEvent.alert);
      }
      offlineCount += 1;
    }
    return { scanned_count: devices.length, offline_count: offlineCount, closed_count: 0 };
  }

  private async findDevice(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotDeviceEntity> {
    const builder = this.deviceRepository
      .createQueryBuilder("device")
      .where("device.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("device.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("device.is_deleted = false")
      .andWhere("device.id = :id", { id });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "device");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "device", { device: "id" });
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("IoT device not found");
    return entity;
  }

  private assertDeviceEnabled(device: IotDeviceEntity): void {
    if (!device.isEnabled || device.status === "disabled" || device.onlineStatus === "disabled") {
      throw new BadRequestException("IoT device is disabled");
    }
  }

  private async applyDeviceDataScope(
    builder: SelectQueryBuilder<ObjectLiteral>,
    scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<void> {
    builder.andWhere("device.is_deleted = false");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "device");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "device", { device: "id" });
  }

  private applyDateFilter(
    builder: SelectQueryBuilder<ObjectLiteral>,
    field: string,
    start?: string,
    end?: string
  ): void {
    const startDate = this.parseDate(start, "start_time");
    const endDate = this.parseDate(end, "end_time");
    if (startDate) builder.andWhere(`${field} >= :startDate`, { startDate });
    if (endDate) builder.andWhere(`${field} <= :endDate`, { endDate });
  }

  private parseDate(value: string | undefined, field: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} is invalid`);
    }
    return parsed;
  }

  private normalizeHeartbeatStatus(status: string): string {
    const text = status.trim().toLowerCase();
    if (["online", "offline", "fault", "unknown"].includes(text)) return text;
    if (["ONLINE", "OFFLINE", "FAULT", "UNKNOWN"].includes(status.trim())) return text;
    throw new BadRequestException("status is invalid");
  }

  private parseMetricValue(value: unknown): RuntimeValue {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new BadRequestException("metric value is invalid");
      return { valueType: "number", valueNumber: String(value), valueText: null, valueBool: null, valueJson: null };
    }
    if (typeof value === "boolean") {
      return { valueType: "boolean", valueNumber: null, valueText: null, valueBool: value, valueJson: null };
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length <= 300) return { valueType: "string", valueNumber: null, valueText: trimmed, valueBool: null, valueJson: null };
      return { valueType: "json", valueNumber: null, valueText: null, valueBool: null, valueJson: value };
    }
    return { valueType: "json", valueNumber: null, valueText: null, valueBool: null, valueJson: value ?? null };
  }

  private async upsertLatest(
    repository: Repository<IotDeviceLatestEntity>,
    scope: TenantParkScope,
    device: IotDeviceEntity,
    metricCode: string,
    value: RuntimeValue,
    quality: string,
    rawPayload: Record<string, unknown>,
    reportTime: Date,
    actorId: string
  ): Promise<void> {
    let latest = await repository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        deviceId: device.id,
        metricCode,
        isDeleted: false
      }
    });
    if (!latest) {
      latest = repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        deviceId: device.id,
        deviceCode: device.deviceCode,
        metricCode,
        pointId: null,
        metricId: null,
        createBy: actorId
      });
    }
    latest.deviceCode = device.deviceCode;
    latest.valueType = value.valueType;
    latest.valueNumber = value.valueNumber;
    latest.valueText = value.valueText;
    latest.valueBool = value.valueBool;
    latest.valueJson = value.valueJson;
    latest.rawPayload = rawPayload;
    latest.quality = quality;
    latest.reportedAt = reportTime;
    latest.receivedAt = new Date();
    latest.reportTime = reportTime;
    latest.updateBy = actorId;
    await repository.save(latest);
  }

  private async createOrUpdateOfflineAlert(
    alertRepository: Repository<IotAlertEntity>,
    logRepository: Repository<IotAlertLogEntity>,
    scope: TenantParkScope,
    device: IotDeviceEntity,
    triggerTime: Date,
    payload: Record<string, unknown>,
    status: string
  ): Promise<{ alert: IotAlertEntity; created: boolean } | null> {
    const existing = await alertRepository
      .createQueryBuilder("alert")
      .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("alert.is_deleted = false")
      .andWhere("alert.rule_id IS NULL")
      .andWhere("alert.device_id = :deviceId", { deviceId: device.id })
      .andWhere("alert.metric_code = :metricCode", { metricCode: OFFLINE_METRIC_CODE })
      .andWhere("alert.status IN (:...statuses)", { statuses: ACTIVE_ALERT_STATUSES })
      .getOne();
    const content = `${device.deviceName} 心跳状态为 ${status}，请检查设备或网关连接。`;
    if (existing) {
      existing.lastTriggerTime = triggerTime;
      existing.triggerValue = status;
      existing.payload = payload;
      existing.triggerPayload = payload;
      existing.updateBy = null;
      await alertRepository.save(existing);
      await this.writeAlertLog(logRepository, existing, "heartbeat_timeout", existing.status, existing.status, content, triggerTime, null);
      return { alert: existing, created: false };
    }
    const generated = await this.codeRulesService.generateNext(scope, SYSTEM_OPERATOR_ID, "IOT_ALERT_CODE");
    const alert = await alertRepository.save(
      alertRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: generated.code,
        alertCode: generated.code,
        ruleId: null,
        deviceId: device.id,
        deviceCode: device.deviceCode,
        deviceName: device.deviceName,
        pointId: null,
        metricCode: OFFLINE_METRIC_CODE,
        metricName: "设备心跳",
        alertLevel: "warning",
        alertTitle: `${device.deviceName} 离线`,
        alertContent: content,
        triggerValue: status,
        thresholdValue: null,
        status: "active",
        payload,
        triggerPayload: payload,
        firstTriggerTime: triggerTime,
        lastTriggerTime: triggerTime,
        buildingId: device.buildingId,
        floorId: device.floorId,
        unitId: device.unitId,
        parkTenantId: device.parkTenantId,
        createBy: null,
        updateBy: null
      })
    );
    await this.writeAlertLog(logRepository, alert, "create", null, alert.status, content, triggerTime, null);
    return { alert, created: true };
  }

  private async closeOfflineAlerts(
    alertRepository: Repository<IotAlertEntity>,
    logRepository: Repository<IotAlertLogEntity>,
    scope: TenantParkScope,
    device: IotDeviceEntity,
    closeTime: Date,
    reason: string
  ): Promise<IotAlertEntity[]> {
    const alerts = await alertRepository
      .createQueryBuilder("alert")
      .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("alert.is_deleted = false")
      .andWhere("alert.rule_id IS NULL")
      .andWhere("alert.device_id = :deviceId", { deviceId: device.id })
      .andWhere("alert.metric_code = :metricCode", { metricCode: OFFLINE_METRIC_CODE })
      .andWhere("alert.status IN (:...statuses)", { statuses: RESOLVABLE_OFFLINE_STATUSES })
      .getMany();
    for (const alert of alerts) {
      const beforeStatus = alert.status;
      alert.status = "closed";
      alert.closeTime = closeTime;
      alert.closeBy = null;
      alert.closeByName = "system";
      alert.closeReason = reason;
      alert.updateBy = null;
      await alertRepository.save(alert);
      await this.writeAlertLog(logRepository, alert, "auto_close", beforeStatus, alert.status, reason, closeTime, reason);
    }
    return alerts;
  }

  private async writeAlertLog(
    repository: Repository<IotAlertLogEntity>,
    alert: IotAlertEntity,
    action: string,
    beforeStatus: string | null,
    afterStatus: string | null,
    content: string,
    opTime: Date,
    reason: string | null
  ): Promise<void> {
    await repository.save(
      repository.create({
        tenantId: alert.tenantId,
        parkId: alert.parkId,
        alertId: alert.id,
        action,
        beforeStatus,
        afterStatus,
        operatorId: null,
        operatorName: "system",
        content,
        reason,
        opTime,
        createBy: null,
        updateBy: null
      })
    );
  }

  private publishStatus(device: IotDeviceEntity): void {
    this.realtimeService.publishDeviceStatus({
      tenantId: device.tenantId,
      parkId: device.parkId,
      deviceId: device.id,
      deviceCode: device.deviceCode,
      onlineStatus: device.onlineStatus,
      lastDataTime: (device.lastDataTime ?? device.lastHeartbeatAt ?? device.updateTime ?? new Date()).toISOString()
    });
  }

  private toHeartbeatView(entity: IotDeviceHeartbeatEntity): IotHeartbeatView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      deviceId: entity.deviceId,
      deviceCode: entity.deviceCode,
      heartbeatTime: entity.heartbeatTime,
      status: entity.status,
      latencyMs: entity.latencyMs,
      signalStrength: entity.signalStrength,
      batteryLevel: entity.batteryLevel,
      firmwareVersion: entity.firmwareVersion,
      rawPayload: entity.rawPayload ?? {},
      createTime: entity.createTime
    };
  }

  private toMetricView(entity: IotDeviceDataEntity): IotRuntimeMetricView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      deviceId: entity.deviceId,
      deviceCode: entity.deviceCode,
      metricKey: entity.metricCode,
      metricType: entity.metricCode,
      metricValue: this.resolveMetricValue(entity),
      metricUnit: null,
      valueType: entity.valueType,
      quality: entity.quality,
      collectedAt: entity.reportedAt,
      rawPayload: entity.rawPayload ?? {},
      createTime: entity.createTime
    };
  }

  private resolveMetricValue(entity: IotDeviceDataEntity): string | number | boolean | unknown | null {
    if (entity.valueType === "number" && entity.valueNumber !== null) return Number(entity.valueNumber);
    if (entity.valueType === "boolean") return entity.valueBool;
    if (entity.valueType === "json") return entity.valueJson;
    return entity.valueText ?? entity.valueNumber ?? entity.valueBool ?? entity.valueJson ?? null;
  }
}
