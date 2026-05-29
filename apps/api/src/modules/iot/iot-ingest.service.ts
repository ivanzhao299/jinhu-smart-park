import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Brackets, DataSource, type EntityManager, type Repository } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { EnergyAlertEntity } from "../energy/entities/energy-alert.entity";
import { EnergyMeterEntity } from "../energy/entities/energy-meter.entity";
import { EnergyReadingEntity } from "../energy/entities/energy-reading.entity";
import { SaaSModulesService } from "../saas-modules/saas-modules.service";
import type { IotHttpIngestDto, IotMetricPayloadValue } from "./dto/iot-http-ingest.dto";
import { IotAlertLogEntity } from "./entities/iot-alert-log.entity";
import { IotAlertRuleEntity } from "./entities/iot-alert-rule.entity";
import { IotAlertEntity } from "./entities/iot-alert.entity";
import { IotDeviceDataEntity } from "./entities/iot-device-data.entity";
import { IotDeviceLatestEntity } from "./entities/iot-device-latest.entity";
import { IotDeviceEntity } from "./entities/iot-device.entity";
import { IotGatewayEntity } from "./entities/iot-gateway.entity";
import { IotPointEntity } from "./entities/iot-point.entity";
import { IotDeviceSecretService } from "./iot-device-secret.service";
import { IotRealtimeService } from "./iot-realtime.service";
import { IotRuleTriggerService } from "./iot-rule-trigger.service";

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;
const NONCE_TTL_MS = 5 * 60 * 1000;
const SYSTEM_OPERATOR_ID = "00000000-0000-0000-0000-000000000000";
const ACTIVE_ALERT_STATUSES = ["active", "acknowledged", "processing", "10", "20", "30"];
const ALLOWED_QUALITIES = new Set(["good", "bad", "stale", "simulated"]);
const ENERGY_READING_KEYS_BY_METER_TYPE: Record<string, string[]> = {
  ELECTRIC: ["energy", "electric_usage", "total_energy", "electric", "reading"],
  WATER: ["total_volume", "water_usage", "water", "flow_total", "reading"],
  GAS: ["gas_usage", "total_volume", "gas", "reading"],
  HEAT: ["heat_usage", "heat", "reading"],
  OTHER: ["reading", "value"]
};

interface IngestHeaders {
  deviceCode: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

interface MatchedMetric {
  key: string;
  value: IotMetricPayloadValue;
  point: IotPointEntity;
  valueType: string;
  valueNumber: string | null;
  valueText: string | null;
  valueBool: boolean | null;
  valueJson: unknown | null;
}

export interface IotTrustedIngestInput {
  device_code: string;
  gateway_code?: string;
  park_code?: string;
  reported_at?: string;
  metrics: Record<string, IotMetricPayloadValue>;
  quality?: string;
  raw_payload?: Record<string, unknown>;
  source_type?: "http" | "mqtt";
}

export interface IotIngestResult {
  device_id: string;
  device_code: string;
  report_time: string;
  accepted_count: number;
  alert_count: number;
  metrics: Array<{
    key: string;
    metric_code: string;
    point_id: string;
    value_type: string;
    value_number: string | null;
    value_text: string | null;
    value_bool: boolean | null;
    value_json: unknown | null;
  }>;
}

export type IotHttpIngestResult = IotIngestResult;

interface TriggeredAlert {
  alert: IotAlertEntity;
  created: boolean;
}

interface PersistIngestResult {
  alertCount: number;
  alerts: TriggeredAlert[];
}

@Injectable()
export class IotIngestService {
  private readonly logger = new Logger(IotIngestService.name);
  private readonly nonceCache = new Map<string, number>();

  constructor(
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    @InjectRepository(IotPointEntity)
    private readonly pointRepository: Repository<IotPointEntity>,
    private readonly dataSource: DataSource,
    private readonly codeRulesService: CodeRulesService,
    private readonly modulesService: SaaSModulesService,
    private readonly deviceSecretService: IotDeviceSecretService,
    private readonly realtimeService: IotRealtimeService,
    private readonly ruleTriggerService: IotRuleTriggerService
  ) {}

  async ingestHttp(headers: IngestHeaders, dto: IotHttpIngestDto): Promise<IotIngestResult> {
    this.assertRequired(headers.deviceCode, "X-Device-Code is required");
    this.assertRequired(headers.timestamp, "X-Timestamp is required");
    this.assertRequired(headers.nonce, "X-Nonce is required");
    this.assertRequired(headers.signature, "X-Signature is required");
    this.assertRequired(dto.device_code, "device_code is required");
    if (dto.device_code !== headers.deviceCode) {
      throw new BadRequestException("device_code does not match X-Device-Code");
    }
    if (!dto.metrics || Object.keys(dto.metrics).length === 0) {
      throw new BadRequestException("metrics is required");
    }
    const timestamp = this.parseTimestamp(headers.timestamp);
    this.assertTimestampFresh(timestamp);

    const device = await this.resolveDevice(dto.device_code, dto.gateway_code);
    this.assertDeviceEnabled(device);
    await this.assertIotModuleEnabled(device.tenantId, device.parkId);
    this.verifySignature(device, headers, dto);
    this.assertNonceNotReplayed(device, headers.nonce, timestamp);

    return this.ingestResolvedDevice(device, { ...dto, reported_at: dto.reported_at ?? timestamp.toISOString(), source_type: "http" });
  }

  async ingestTrusted(input: IotTrustedIngestInput): Promise<IotIngestResult> {
    this.assertRequired(input.device_code, "device_code is required");
    if (!input.metrics || Object.keys(input.metrics).length === 0) {
      throw new BadRequestException("metrics is required");
    }
    const device = await this.resolveDevice(input.device_code, input.gateway_code, input.park_code);
    this.assertDeviceEnabled(device);
    await this.assertIotModuleEnabled(device.tenantId, device.parkId);
    return this.ingestResolvedDevice(device, { ...input, source_type: input.source_type ?? "mqtt" });
  }

  private async ingestResolvedDevice(device: IotDeviceEntity, input: IotTrustedIngestInput): Promise<IotIngestResult> {
    const quality = input.quality ?? "good";
    if (!ALLOWED_QUALITIES.has(quality)) {
      throw new BadRequestException("quality is invalid");
    }
    const reportTime = input.reported_at ? new Date(input.reported_at) : new Date();
    if (Number.isNaN(reportTime.getTime())) {
      throw new BadRequestException("reported_at is invalid");
    }

    const points = await this.pointRepository.find({
      where: { tenantId: device.tenantId, parkId: device.parkId, deviceId: device.id, status: "enabled", isDeleted: false }
    });
    const matched = this.matchMetrics(input.metrics, points);
    const persistResult = await this.persistIngest(device, matched, reportTime, quality, input);
    const result: IotIngestResult = {
      device_id: device.id,
      device_code: device.deviceCode,
      report_time: reportTime.toISOString(),
      accepted_count: matched.length,
      alert_count: persistResult.alertCount,
      metrics: matched.map((item) => ({
        key: item.key,
        metric_code: item.point.metricCode ?? item.point.pointCode,
        point_id: item.point.id,
        value_type: item.valueType,
        value_number: item.valueNumber,
        value_text: item.valueText,
        value_bool: item.valueBool,
        value_json: item.valueJson
      }))
    };
    this.logger.log(`Accepted ${matched.length} IoT metrics from ${device.deviceCode}`);
    this.realtimeService.publishDeviceLatest({
      tenantId: device.tenantId,
      parkId: device.parkId,
      deviceId: device.id,
      deviceCode: device.deviceCode,
      reportTime: result.report_time,
      acceptedCount: result.accepted_count,
      alertCount: result.alert_count,
      quality,
      metrics: result.metrics
    });
    this.realtimeService.publishDeviceStatus({
      tenantId: device.tenantId,
      parkId: device.parkId,
      deviceId: device.id,
      deviceCode: device.deviceCode,
      onlineStatus: "online",
      lastDataTime: result.report_time
    });
    const scope = { tenantId: device.tenantId, parkId: device.parkId };
    await this.ruleTriggerService.handleMetricReported(scope, device, input.metrics, undefined, {
      quality,
      reported_at: result.report_time,
      source_type: input.source_type ?? null,
      raw_payload: input.raw_payload ?? {}
    });
    for (const item of persistResult.alerts) {
      if (item.created) {
        this.realtimeService.publishAlertCreated(item.alert);
      } else {
        this.realtimeService.publishAlertUpdated(item.alert);
      }
      await this.ruleTriggerService.handleAlertCreatedOrUpdated(scope, item.alert);
    }
    return result;
  }

  private async resolveDevice(deviceCode: string, gatewayCode?: string, parkCode?: string): Promise<IotDeviceEntity> {
    const builder = this.deviceRepository
      .createQueryBuilder("device")
      .leftJoin(IotGatewayEntity, "gateway", "gateway.id = device.gateway_id AND gateway.is_deleted = false")
      .leftJoin("biz_park", "park", "park.tenant_id = device.tenant_id AND park.park_id = device.park_id AND park.is_deleted = false")
      .where("device.device_code = :deviceCode", { deviceCode })
      .andWhere("device.is_deleted = false");
    if (gatewayCode) {
      builder.andWhere("gateway.gateway_code = :gatewayCode", { gatewayCode });
    }
    if (parkCode) {
      builder.andWhere("park.park_code = :parkCode", { parkCode });
    }
    const devices = await builder.take(2).getMany();
    if (devices.length === 0) {
      throw new UnauthorizedException("IoT device not found");
    }
    if (devices.length > 1) {
      throw new BadRequestException("device_code is ambiguous; gateway_code is required");
    }
    return devices[0]!;
  }

  private assertDeviceEnabled(device: IotDeviceEntity): void {
    if (device.status !== "enabled") {
      throw new ForbiddenException("IoT device is not enabled");
    }
  }

  private async assertIotModuleEnabled(tenantId: string, parkId: string): Promise<void> {
    const enabledModules = await this.modulesService.listEnabledModulesForTenant(tenantId, parkId);
    if (!enabledModules.some((module) => module.module_code === "iot")) {
      throw new ForbiddenException("Tenant module is not authorized");
    }
  }

  private verifySignature(device: IotDeviceEntity, headers: IngestHeaders, dto: IotHttpIngestDto): void {
    const secret = this.deviceSecretService.decryptSecret(device.deviceSecret);
    if (!secret) {
      throw new UnauthorizedException("IoT device secret is not initialized; reset device secret first");
    }
    const signaturePayload = [headers.timestamp, headers.nonce, headers.deviceCode, stableStringify(dto)].join("\n");
    const expected = createHmac("sha256", secret).update(signaturePayload).digest("hex");
    if (!this.signatureEquals(expected, headers.signature)) {
      throw new UnauthorizedException("Invalid IoT device signature");
    }
  }

  private signatureEquals(expected: string, actual: string): boolean {
    const normalized = actual.trim().replace(/^sha256=/i, "").toLowerCase();
    const expectedBuffer = Buffer.from(expected, "hex");
    const actualBuffer = Buffer.from(normalized, "hex");
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }

  private assertNonceNotReplayed(device: IotDeviceEntity, nonce: string, timestamp: Date): void {
    this.cleanupNonceCache();
    const key = `${device.tenantId}:${device.parkId}:${device.deviceCode}:${nonce}`;
    if (this.nonceCache.has(key)) {
      throw new UnauthorizedException("Replay IoT device nonce");
    }
    this.nonceCache.set(key, timestamp.getTime() + NONCE_TTL_MS);
  }

  private cleanupNonceCache(): void {
    const now = Date.now();
    for (const [key, expireAt] of this.nonceCache.entries()) {
      if (expireAt <= now) {
        this.nonceCache.delete(key);
      }
    }
  }

  private matchMetrics(metrics: Record<string, IotMetricPayloadValue>, points: IotPointEntity[]): MatchedMetric[] {
    const byReportKey = new Map<string, IotPointEntity>();
    const byMetricCode = new Map<string, IotPointEntity>();
    for (const point of points) {
      if (point.reportKey) byReportKey.set(point.reportKey, point);
      if (point.metricCode) byMetricCode.set(point.metricCode, point);
    }
    return Object.entries(metrics).map(([key, value]) => {
      const point = byReportKey.get(key) ?? byMetricCode.get(key);
      if (!point) {
        throw new BadRequestException(`Metric key ${key} does not match any enabled IoT point`);
      }
      const normalized = this.normalizeMetricValue(point, value);
      return { key, value, point, ...normalized };
    });
  }

  private normalizeMetricValue(
    point: IotPointEntity,
    value: IotMetricPayloadValue
  ): { valueType: string; valueNumber: string | null; valueText: string | null; valueBool: boolean | null; valueJson: unknown | null } {
    const valueType = point.valueType || "string";
    if (valueType === "number") {
      const numeric = typeof value === "number" ? value : Number.parseFloat(String(value));
      if (!Number.isFinite(numeric)) {
        throw new BadRequestException(`Metric ${point.metricCode ?? point.pointCode} must be numeric`);
      }
      return { valueType, valueNumber: String(numeric), valueText: String(value), valueBool: null, valueJson: null };
    }
    if (valueType === "boolean") {
      const boolValue = this.parseBooleanMetric(point, value);
      return { valueType, valueNumber: null, valueText: String(boolValue), valueBool: boolValue, valueJson: null };
    }
    if (valueType === "json") {
      const jsonValue = this.parseJsonMetric(point, value);
      return { valueType, valueNumber: null, valueText: stableStringify(jsonValue), valueBool: null, valueJson: jsonValue };
    }
    if (typeof value === "object" && value !== null) {
      return { valueType, valueNumber: null, valueText: stableStringify(value), valueBool: null, valueJson: null };
    }
    return { valueType, valueNumber: null, valueText: value === null || value === undefined ? null : String(value), valueBool: null, valueJson: null };
  }

  private parseBooleanMetric(point: IotPointEntity, value: IotMetricPayloadValue): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    throw new BadRequestException(`Metric ${point.metricCode ?? point.pointCode} must be boolean`);
  }

  private parseJsonMetric(point: IotPointEntity, value: IotMetricPayloadValue): unknown {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        throw new BadRequestException(`Metric ${point.metricCode ?? point.pointCode} must be valid JSON`);
      }
    }
    return value ?? null;
  }

  private async persistIngest(
    device: IotDeviceEntity,
    matched: MatchedMetric[],
    reportTime: Date,
    quality: string,
    input: IotTrustedIngestInput
  ): Promise<PersistIngestResult> {
    return this.dataSource.transaction(async (manager) => {
      const scope: TenantParkScope = { tenantId: device.tenantId, parkId: device.parkId };
      const deviceRepository = manager.getRepository(IotDeviceEntity);
      const pointRepository = manager.getRepository(IotPointEntity);
      const dataRepository = manager.getRepository(IotDeviceDataEntity);
      const rawPayload = this.buildRawPayload(input, quality);

      for (const item of matched) {
        const metricCode = item.point.metricCode ?? item.point.pointCode;
        const receivedAt = new Date();
        await dataRepository.save(
          dataRepository.create({
            tenantId: device.tenantId,
            parkId: device.parkId,
            deviceId: device.id,
            deviceCode: device.deviceCode,
            pointId: item.point.id,
            metricId: item.point.metricId,
            metricCode,
            valueType: item.valueType,
            valueText: item.valueText,
            valueNumber: item.valueNumber,
            valueBool: item.valueBool,
            valueJson: item.valueJson,
            rawPayload,
            quality,
            reportedAt: reportTime,
            receivedAt,
            reportTime
          })
        );
        await this.upsertLatest(manager, device, item, rawPayload, quality, reportTime);
        await pointRepository.update(
          { id: item.point.id, tenantId: device.tenantId, parkId: device.parkId, isDeleted: false },
          {
            lastValue: item.valueNumber,
            lastValueText: item.valueText,
            lastReportTime: reportTime,
            updateBy: null
          }
        );
      }

      await this.syncEnergyReadings(manager, scope, device, matched, rawPayload, reportTime);

      await deviceRepository.update(
        { id: device.id, tenantId: device.tenantId, parkId: device.parkId, isDeleted: false },
        {
          lastDataTime: reportTime,
          lastReportTime: reportTime,
          lastOnlineTime: device.onlineStatus === "online" ? device.lastOnlineTime : reportTime,
          onlineStatus: "online",
          statusPayload: {
            metrics: input.metrics,
            quality,
            reported_at: reportTime.toISOString(),
            source_type: input.source_type ?? "mqtt",
            raw_payload: input.raw_payload ?? {}
          },
          updateBy: null
        }
      );

      const alerts = await this.evaluateAlertRules(manager, scope, device, matched, rawPayload, reportTime);
      return { alertCount: alerts.length, alerts };
    });
  }

  private async syncEnergyReadings(
    manager: EntityManager,
    scope: TenantParkScope,
    device: IotDeviceEntity,
    matched: MatchedMetric[],
    rawPayload: Record<string, unknown>,
    reportTime: Date
  ): Promise<void> {
    const meterRepository = manager.getRepository(EnergyMeterEntity);
    const readingRepository = manager.getRepository(EnergyReadingEntity);
    const meters = await meterRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        iotDeviceId: device.id,
        isDeleted: false,
        isEnabled: true
      }
    });
    if (meters.length === 0) return;

    for (const meter of meters) {
      if (meter.status === "DISABLED") continue;
      const readingMetric = this.resolveEnergyReadingMetric(meter, matched);
      if (!readingMetric?.valueNumber) continue;

      const previous = Number(meter.currentReading ?? meter.initialReading ?? 0);
      const current = Number(readingMetric.valueNumber);
      if (!Number.isFinite(current)) continue;
      const multiplier = Number(meter.multiplier ?? 1);
      const abnormal = current < previous;
      const consumption = abnormal ? 0 : (current - previous) * multiplier;
      const existing = await readingRepository.findOne({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          meterId: meter.id,
          iotDeviceId: device.id,
          readingSource: "IOT",
          readingTime: reportTime
        }
      });
      if (existing) continue;

      const reading = readingRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        meterId: meter.id,
        iotDeviceId: device.id,
        readingValue: current.toFixed(4),
        previousReadingValue: previous.toFixed(4),
        consumptionValue: consumption.toFixed(4),
        readingTime: reportTime,
        readingSource: "IOT",
        confirmationStatus: abnormal ? "ABNORMAL" : "PENDING",
        rawPayload: {
          ...rawPayload,
          matched_metric: {
            key: readingMetric.key,
            metric_code: readingMetric.point.metricCode ?? readingMetric.point.pointCode,
            point_id: readingMetric.point.id
          }
        },
        createdBy: null
      });
      await readingRepository.save(reading);

      if (abnormal) {
        const generated = await this.codeRulesService.generateNext(scope, SYSTEM_OPERATOR_ID, "ENERGY_ALERT_CODE");
        const alertRepository = manager.getRepository(EnergyAlertEntity);
        await alertRepository.save(
          alertRepository.create({
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            meterId: meter.id,
            alertCode: generated.code,
            alertType: "REVERSE_READING",
            alertLevel: "HIGH",
            title: `${meter.meterName} IoT 读数倒挂`,
            description: `IoT 上报读数 ${current} 小于上一期读数 ${previous}，已进入异常口径，不参与确认统计。`,
            triggeredAt: reportTime,
            processStatus: "PENDING",
            createBy: null,
            updateBy: null,
            remark: "S9-E IoT energy reading bridge"
          })
        );
      }
    }
  }

  private resolveEnergyReadingMetric(meter: EnergyMeterEntity, matched: MatchedMetric[]): MatchedMetric | null {
    const numericMatched = matched.filter((item) => item.valueNumber !== null);
    if (numericMatched.length === 0) return null;
    const candidates = ENERGY_READING_KEYS_BY_METER_TYPE[meter.meterType] ?? ENERGY_READING_KEYS_BY_METER_TYPE.OTHER ?? ["reading", "value"];
    for (const candidate of candidates) {
      const normalizedCandidate = candidate.toLowerCase();
      const found = numericMatched.find((item) => {
        const metricCode = item.point.metricCode?.toLowerCase();
        const pointCode = item.point.pointCode.toLowerCase();
        const reportKey = item.point.reportKey?.toLowerCase();
        const payloadKey = item.key.toLowerCase();
        return [metricCode, pointCode, reportKey, payloadKey].includes(normalizedCandidate);
      });
      if (found) return found;
    }
    return numericMatched.length === 1 ? numericMatched[0]! : null;
  }

  private async upsertLatest(
    manager: EntityManager,
    device: IotDeviceEntity,
    item: MatchedMetric,
    rawPayload: Record<string, unknown>,
    quality: string,
    reportTime: Date
  ): Promise<void> {
    const latestRepository = manager.getRepository(IotDeviceLatestEntity);
    const metricCode = item.point.metricCode ?? item.point.pointCode;
    const existing = await latestRepository.findOne({
      where: { tenantId: device.tenantId, parkId: device.parkId, deviceId: device.id, metricCode, isDeleted: false }
    });
    if (existing) {
      Object.assign(existing, {
        deviceCode: device.deviceCode,
        pointId: item.point.id,
        metricId: item.point.metricId,
        valueType: item.valueType,
        valueText: item.valueText,
        valueNumber: item.valueNumber,
        valueBool: item.valueBool,
        valueJson: item.valueJson,
        rawPayload,
        quality,
        reportedAt: reportTime,
        receivedAt: new Date(),
        reportTime,
        updateBy: null
      });
      await latestRepository.save(existing);
      return;
    }
    await latestRepository.save(
      latestRepository.create({
        tenantId: device.tenantId,
        parkId: device.parkId,
        deviceId: device.id,
        deviceCode: device.deviceCode,
        pointId: item.point.id,
        metricId: item.point.metricId,
        metricCode,
        valueType: item.valueType,
        valueText: item.valueText,
        valueNumber: item.valueNumber,
        valueBool: item.valueBool,
        valueJson: item.valueJson,
        rawPayload,
        quality,
        reportedAt: reportTime,
        receivedAt: new Date(),
        reportTime
      })
    );
  }

  private async evaluateAlertRules(
    manager: EntityManager,
    scope: TenantParkScope,
    device: IotDeviceEntity,
    matched: MatchedMetric[],
    rawPayload: Record<string, unknown>,
    reportTime: Date
  ): Promise<TriggeredAlert[]> {
    const ruleRepository = manager.getRepository(IotAlertRuleEntity);
    const alertRepository = manager.getRepository(IotAlertEntity);
    const logRepository = manager.getRepository(IotAlertLogEntity);
    const alerts: TriggeredAlert[] = [];
    for (const item of matched) {
      const metricCode = item.point.metricCode ?? item.point.pointCode;
      const rules = await ruleRepository
        .createQueryBuilder("rule")
        .where("rule.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("rule.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("rule.is_deleted = false")
        .andWhere("rule.status = :status", { status: "enabled" })
        .andWhere("rule.enabled = true")
        .andWhere("rule.metric_code = :metricCode", { metricCode })
        .andWhere(
          new Brackets((qb) => {
            qb.where("rule.device_id IS NULL").orWhere("rule.device_id = :deviceId", { deviceId: device.id });
          })
        )
        .andWhere(
          new Brackets((qb) => {
            qb.where("rule.device_type IS NULL").orWhere("rule.device_type = :deviceType", { deviceType: device.deviceType });
          })
        )
        .andWhere(
          new Brackets((qb) => {
            qb.where("rule.point_id IS NULL").orWhere("rule.point_id = :pointId", { pointId: item.point.id });
          })
        )
        .getMany();
      for (const rule of rules) {
        if (!this.isRuleTriggered(rule, item)) continue;
        const alert = await this.upsertAlert(alertRepository, logRepository, scope, device, item, rule, rawPayload, reportTime);
        if (alert) alerts.push(alert);
      }
    }
    return alerts;
  }

  private isRuleTriggered(rule: IotAlertRuleEntity, item: MatchedMetric): boolean {
    const valueText = this.metricValueToText(item);
    const valueNumber = item.valueNumber === null ? Number.NaN : Number(item.valueNumber);
    const threshold = rule.thresholdValue === null ? Number.NaN : Number(rule.thresholdValue);
    switch (rule.operator) {
      case "gt":
        return Number.isFinite(valueNumber) && Number.isFinite(threshold) && valueNumber > threshold;
      case "gte":
        return Number.isFinite(valueNumber) && Number.isFinite(threshold) && valueNumber >= threshold;
      case "lt":
        return Number.isFinite(valueNumber) && Number.isFinite(threshold) && valueNumber < threshold;
      case "lte":
        return Number.isFinite(valueNumber) && Number.isFinite(threshold) && valueNumber <= threshold;
      case "eq":
        if (Number.isFinite(valueNumber) && Number.isFinite(threshold)) return valueNumber === threshold;
        return valueText === (rule.thresholdText ?? "");
      case "neq":
        if (Number.isFinite(valueNumber) && Number.isFinite(threshold)) return valueNumber !== threshold;
        return valueText !== (rule.thresholdText ?? "");
      case "contains":
        return valueText.includes(rule.thresholdText ?? "");
      case "offline":
        return item.valueBool === false || item.valueNumber === "0" || ["offline", "false", "0", "down"].includes(valueText.toLowerCase());
      default:
        return false;
    }
  }

  private async upsertAlert(
    alertRepository: Repository<IotAlertEntity>,
    logRepository: Repository<IotAlertLogEntity>,
    scope: TenantParkScope,
    device: IotDeviceEntity,
    item: MatchedMetric,
    rule: IotAlertRuleEntity,
    rawPayload: Record<string, unknown>,
    reportTime: Date
  ): Promise<TriggeredAlert | null> {
    const metricCode = item.point.metricCode ?? item.point.pointCode;
    const triggerValue = this.metricValueToText(item);
    const thresholdValue = rule.thresholdValue ?? rule.thresholdText ?? null;
    const templateContext = {
      rule_name: rule.ruleName,
      device_code: device.deviceCode,
      device_name: device.deviceName,
      metric_code: metricCode,
      metric_name: item.point.pointName,
      operator: rule.operator,
      threshold: thresholdValue ?? "",
      value: triggerValue
    };
    const alertTitle = this.renderTemplate(rule.alertTitleTemplate, templateContext) ?? `${rule.ruleName}触发`;
    const alertContent =
      this.renderTemplate(rule.alertContentTemplate, templateContext) ??
      `${device.deviceName} ${metricCode} ${rule.operator} ${thresholdValue ?? ""}，当前值 ${triggerValue}`;
    const existing = await alertRepository
      .createQueryBuilder("alert")
      .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("alert.is_deleted = false")
      .andWhere("alert.rule_id = :ruleId", { ruleId: rule.id })
      .andWhere("alert.device_id = :deviceId", { deviceId: device.id })
      .andWhere("alert.metric_code = :metricCode", { metricCode })
      .andWhere("alert.status IN (:...statuses)", { statuses: ACTIVE_ALERT_STATUSES })
      .getOne();
    if (existing) {
      const cooldownSeconds = rule.cooldownSeconds ?? 0;
      if (cooldownSeconds > 0 && existing.lastTriggerTime) {
        const nextAllowedTime = existing.lastTriggerTime.getTime() + cooldownSeconds * 1000;
        if (reportTime.getTime() < nextAllowedTime) {
          return null;
        }
      }
      existing.lastTriggerTime = reportTime;
      existing.triggerValue = triggerValue;
      existing.payload = rawPayload;
      existing.triggerPayload = rawPayload;
      existing.pointId = item.point.id;
      existing.updateBy = null;
      await alertRepository.save(existing);
      await this.writeAlertLog(logRepository, existing, "trigger", existing.status, existing.status, "告警再次触发", reportTime);
      return { alert: existing, created: false };
    }
    const generated = await this.codeRulesService.generateNext(scope, SYSTEM_OPERATOR_ID, "IOT_ALERT_CODE");
    const alertCode = generated.code;
    const alert = await alertRepository.save(
      alertRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: alertCode,
        alertCode,
        ruleId: rule.id,
        deviceId: device.id,
        deviceCode: device.deviceCode,
        deviceName: device.deviceName,
        pointId: item.point.id,
        metricCode,
        metricName: item.point.pointName,
        alertLevel: rule.alertLevel,
        alertTitle,
        alertContent,
        triggerValue,
        thresholdValue,
        status: "active",
        payload: rawPayload,
        triggerPayload: rawPayload,
        firstTriggerTime: reportTime,
        lastTriggerTime: reportTime,
        buildingId: device.buildingId,
        floorId: device.floorId,
        unitId: device.unitId,
        parkTenantId: device.parkTenantId,
        createBy: null,
        updateBy: null
      })
    );
    await this.writeAlertLog(logRepository, alert, "create", null, alert.status, "设备上报触发告警", reportTime);
    return { alert, created: true };
  }

  private metricValueToText(item: MatchedMetric): string {
    if (item.valueNumber !== null) return item.valueNumber;
    if (item.valueBool !== null) return String(item.valueBool);
    if (item.valueText !== null) return item.valueText;
    if (item.valueJson !== null) return stableStringify(item.valueJson);
    return "";
  }

  private renderTemplate(template: string | null, context: Record<string, string>): string | null {
    if (!template) return null;
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => context[key] ?? "");
  }

  private async writeAlertLog(
    logRepository: Repository<IotAlertLogEntity>,
    alert: IotAlertEntity,
    action: string,
    beforeStatus: string | null,
    afterStatus: string | null,
    content: string,
    opTime: Date
  ): Promise<void> {
    await logRepository.save(
      logRepository.create({
        tenantId: alert.tenantId,
        parkId: alert.parkId,
        alertId: alert.id,
        action,
        beforeStatus,
        afterStatus,
        operatorId: null,
        operatorName: "设备上报",
        content,
        reason: null,
        opTime,
        createBy: null,
        updateBy: null
      })
    );
  }

  private buildRawPayload(input: IotTrustedIngestInput, quality: string): Record<string, unknown> {
    return {
      source_type: input.source_type ?? null,
      park_code: input.park_code ?? null,
      gateway_code: input.gateway_code ?? null,
      metrics: input.metrics,
      quality,
      raw_payload: input.raw_payload ?? {}
    };
  }

  private parseTimestamp(value: string): Date {
    const numeric = Number(value);
    const timestamp = Number.isFinite(numeric)
      ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
      : new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
      throw new UnauthorizedException("Invalid X-Timestamp");
    }
    return timestamp;
  }

  private assertTimestampFresh(timestamp: Date): void {
    if (Math.abs(Date.now() - timestamp.getTime()) > MAX_TIMESTAMP_DRIFT_MS) {
      throw new UnauthorizedException("Expired IoT device timestamp");
    }
  }

  private assertRequired(value: unknown, message: string): void {
    if (value === null || value === undefined || String(value).trim() === "") {
      throw new BadRequestException(message);
    }
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
