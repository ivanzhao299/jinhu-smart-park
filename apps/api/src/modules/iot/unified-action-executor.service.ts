import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { IotAlertLogEntity } from "./entities/iot-alert-log.entity";
import { IotAlertEntity } from "./entities/iot-alert.entity";
import { IotDeviceEntity } from "./entities/iot-device.entity";
import { IotRealtimeService } from "./iot-realtime.service";
import {
  UNIFIED_ACTION_TYPES,
  type UnifiedActionExecutionInput,
  type UnifiedActionExecutionResult,
  type UnifiedActionExecutionStatus,
  type UnifiedActionType
} from "./unified-action-executor.types";

const SYSTEM_OPERATOR_ID = "00000000-0000-0000-0000-000000000000";
const ACTIVE_ALERT_STATUSES = ["active", "acknowledged", "processing", "10", "20", "30"];
const ALLOWED_ACTION_TYPES = new Set<string>(UNIFIED_ACTION_TYPES);
const SIMULATED_ACTION_TYPES = new Set<string>([
  "CREATE_VIDEO_ALERT",
  "CREATE_ENERGY_ALERT",
  "CREATE_SAFETY_HAZARD",
  "CREATE_INSPECTION_TASK",
  "SEND_NOTIFICATION",
  "CONTROL_DEVICE",
  "TRIGGER_BROADCAST",
  "TRIGGER_LED_SCREEN",
  "TRIGGER_ACCESS_CONTROL",
  "TRIGGER_DOOR_OPEN",
  "TRIGGER_DOOR_CLOSE",
  "TRIGGER_DEVICE_STOP",
  "TRIGGER_DEVICE_START",
  "CALL_WEBHOOK",
  "NOOP_SIMULATION"
]);

@Injectable()
export class UnifiedActionExecutorService {
  private readonly logger = new Logger(UnifiedActionExecutorService.name);

  constructor(
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    @InjectRepository(IotAlertEntity)
    private readonly alertRepository: Repository<IotAlertEntity>,
    @InjectRepository(IotAlertLogEntity)
    private readonly alertLogRepository: Repository<IotAlertLogEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly realtimeService: IotRealtimeService,
    private readonly workOrdersService: WorkOrdersService
  ) {}

  async executeAction(input: UnifiedActionExecutionInput, actor?: JwtPrincipal): Promise<UnifiedActionExecutionResult> {
    const actionType = this.normalizeActionType(input.action_type);
    const actionPayload = this.redactPayload(input.action_payload ?? {});
    const contextPayload = this.redactPayload(input.context_payload ?? {});
    const executedAt = new Date().toISOString();
    try {
      if (!ALLOWED_ACTION_TYPES.has(actionType)) {
        throw new BadRequestException(`Unsupported action_type: ${actionType}`);
      }
      const simulatedStatus = this.readString(actionPayload, "simulate_status")?.toUpperCase() ?? this.readString(actionPayload, "simulateStatus")?.toUpperCase();
      if (simulatedStatus === "FAILED") {
        return this.result(actionType, "FAILED", {}, this.readString(actionPayload, "error_message") ?? "Simulated action failure", executedAt);
      }
      if (actionType === "CREATE_IOT_ALERT") {
        const alert = await this.createIotAlert(input, actionPayload, contextPayload, actor);
        return this.result(actionType, "SUCCESS", { alert_id: alert.id, alert_code: alert.alertCode, status: alert.status }, null, executedAt);
      }
      if (actionType === "CREATE_WORK_ORDER") {
        const workOrder = await this.createWorkOrder(input, actionPayload, contextPayload, actor);
        return this.result(actionType, "SUCCESS", { work_order_id: workOrder.id, wo_code: workOrder.woCode }, null, executedAt);
      }
      if (this.isDeviceControlAction(actionType)) {
        await this.assertTargetDeviceInScope(input, actionPayload, contextPayload);
      }
      if (actionType === "CALL_WEBHOOK") this.assertWebhookAllowed(actionPayload);
      if (SIMULATED_ACTION_TYPES.has(actionType)) {
        return this.result(
          actionType,
          actionType === "NOOP_SIMULATION" ? "SUCCESS" : "SIMULATED",
          {
            simulated: actionType !== "NOOP_SIMULATION",
            source_type: input.source_type,
            source_id: input.source_id ?? null,
            message: this.simulatedMessage(actionType)
          },
          null,
          executedAt
        );
      }
      return this.result(actionType, "SKIPPED", { reason: "No executor matched action_type" }, null, executedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Unified action ${actionType} failed: ${message}`);
      return this.result(actionType, "FAILED", {}, message, executedAt);
    }
  }

  toLegacyActionResult(result: UnifiedActionExecutionResult): Record<string, unknown> {
    return {
      type: result.action_type,
      status: result.execution_status.toLowerCase(),
      execution_status: result.execution_status,
      result_payload: result.result_payload,
      error_message: result.error_message,
      executed_at: result.executed_at
    };
  }

  resolveAggregateStatus(results: Array<Record<string, unknown> | UnifiedActionExecutionResult>): UnifiedActionExecutionStatus {
    if (results.length === 0) return "SKIPPED";
    let successCount = 0;
    let failedCount = 0;
    for (const result of results) {
      const status = String("execution_status" in result ? result.execution_status : result.status ?? "").toUpperCase();
      if (["SUCCESS", "CREATED", "SIMULATED"].includes(status)) successCount += 1;
      else if (status === "FAILED") failedCount += 1;
    }
    if (failedCount > 0 && successCount > 0) return "PARTIAL_SUCCESS";
    if (failedCount > 0) return "FAILED";
    if (successCount === 0) return "SKIPPED";
    return "SUCCESS";
  }

  normalizeActionType(value: unknown): UnifiedActionType {
    const text = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (!text) throw new BadRequestException("action_type is required");
    return text as UnifiedActionType;
  }

  private async createIotAlert(
    input: UnifiedActionExecutionInput,
    action: Record<string, unknown>,
    context: Record<string, unknown>,
    actor?: JwtPrincipal
  ): Promise<IotAlertEntity> {
    const scope = this.scope(input);
    const device = await this.resolveDevice(input, action, context);
    if (!device) throw new BadRequestException("CREATE_IOT_ALERT requires a device context");
    const ruleId = input.source_type === "IOT_RULE" ? input.source_id ?? null : this.readString(action, "rule_id") ?? null;
    const metricCode = this.readString(action, "metric_code") ?? this.readString(context, "metric_code") ?? "unified_action";
    const alertLevel = this.readString(action, "alert_level") ?? this.readString(action, "level") ?? this.readString(context, "alert_level") ?? "warning";
    const triggerValue = this.payloadValueText(context);
    const existingBuilder = this.alertRepository
      .createQueryBuilder("alert")
      .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("alert.is_deleted = false")
      .andWhere("alert.device_id = :deviceId", { deviceId: device.id })
      .andWhere("alert.metric_code = :metricCode", { metricCode })
      .andWhere("alert.status IN (:...statuses)", { statuses: ACTIVE_ALERT_STATUSES });
    if (ruleId) existingBuilder.andWhere("alert.rule_id IS NOT DISTINCT FROM :ruleId", { ruleId });
    const existing = await existingBuilder.getOne();
    if (existing) {
      existing.lastTriggerTime = new Date();
      existing.triggerValue = triggerValue;
      existing.triggerPayload = context;
      existing.payload = context;
      existing.updateBy = actor?.sub ?? input.actor_user_id ?? null;
      await this.alertRepository.save(existing);
      await this.writeAlertLog(existing, "trigger", existing.status, existing.status, "统一动作执行器再次触发 IoT 告警", actor);
      this.realtimeService.publishAlertUpdated(existing);
      return existing;
    }
    const generated = await this.codeRulesService.generateNext(scope, actor?.sub ?? input.actor_user_id ?? SYSTEM_OPERATOR_ID, "IOT_ALERT_CODE");
    const title = this.readString(action, "title") ?? this.readString(context, "rule_name") ?? "IoT 自动化告警";
    const content = this.readString(action, "content") ?? this.readString(action, "description") ?? `统一动作执行器触发告警，当前值 ${triggerValue}`;
    const alertEntity = this.alertRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: generated.code,
      alertCode: generated.code,
      ruleId,
      deviceId: device.id,
      deviceCode: device.deviceCode,
      deviceName: device.deviceName,
      pointId: this.readString(action, "point_id") ?? null,
      metricCode,
      alertLevel,
      alertTitle: title,
      alertContent: content,
      triggerValue,
      status: "active",
      payload: context,
      triggerPayload: context,
      firstTriggerTime: new Date(),
      lastTriggerTime: new Date(),
      buildingId: device.buildingId ?? this.readString(context, "building_id") ?? null,
      floorId: device.floorId ?? this.readString(context, "floor_id") ?? null,
      unitId: device.unitId ?? this.readString(context, "unit_id") ?? null,
      parkTenantId: device.parkTenantId ?? this.readString(context, "park_tenant_id") ?? null,
      createBy: actor?.sub ?? input.actor_user_id ?? null,
      updateBy: actor?.sub ?? input.actor_user_id ?? null
    });
    const alert = await this.alertRepository.save(alertEntity);
    await this.writeAlertLog(alert, "create", null, alert.status, "统一动作执行器创建 IoT 告警", actor);
    this.realtimeService.publishAlertCreated(alert);
    return alert;
  }

  private async createWorkOrder(input: UnifiedActionExecutionInput, action: Record<string, unknown>, context: Record<string, unknown>, actor?: JwtPrincipal) {
    const scope = this.scope(input);
    const device = await this.resolveDevice(input, action, context);
    const principal = actor ?? this.systemActor(scope, input.source_type);
    return this.workOrdersService.create(scope, principal, {
      title: this.readString(action, "title") ?? `${this.sourceName(input.source_type)}联动工单`,
      wo_type: this.readString(action, "wo_type") ?? "repair",
      priority: this.readString(action, "priority") ?? "high",
      urgency: this.readString(action, "urgency") ?? "urgent",
      source_type: "system",
      source_id: input.source_id ?? this.readString(context, "source_id") ?? undefined,
      park_tenant_id: device?.parkTenantId ?? this.readString(context, "park_tenant_id") ?? undefined,
      unit_id: device?.unitId ?? this.readString(context, "unit_id") ?? undefined,
      building_id: device?.buildingId ?? this.readString(context, "building_id") ?? undefined,
      floor_id: device?.floorId ?? this.readString(context, "floor_id") ?? undefined,
      location: device?.location ?? this.readString(context, "location") ?? undefined,
      assignee_id: this.readString(action, "assignee_id"),
      description:
        this.readString(action, "description") ??
        `${this.sourceName(input.source_type)}触发统一动作执行器创建工单。上下文：${safeStringify(this.redactPayload(context))}`,
      device_id: device?.id ?? this.readString(context, "device_id") ?? undefined,
      remark: `Unified action ${input.source_type}:${input.source_id ?? "-"}`
    });
  }

  private async resolveDevice(
    input: UnifiedActionExecutionInput,
    action: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<IotDeviceEntity | null> {
    const scope = this.scope(input);
    const deviceId = this.readString(action, "device_id") ?? this.readString(context, "device_id");
    if (deviceId) {
      const device = await this.deviceRepository.findOne({ where: { id: deviceId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
      if (!device) throw new BadRequestException("target device is invalid");
      return device;
    }
    const deviceCode = this.readString(action, "device_code") ?? this.readString(context, "device_code");
    if (!deviceCode) return null;
    return this.deviceRepository.findOne({ where: { deviceCode, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
  }

  private async assertTargetDeviceInScope(
    input: UnifiedActionExecutionInput,
    action: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<void> {
    const target = this.readString(action, "device_id") ?? this.readString(context, "device_id");
    if (!target) return;
    await this.resolveDevice(input, { device_id: target }, context);
  }

  private assertWebhookAllowed(action: Record<string, unknown>): void {
    const url = this.readString(action, "url") ?? this.readString(action, "webhook_url");
    if (!url) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException("CALL_WEBHOOK url is invalid");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) throw new BadRequestException("CALL_WEBHOOK url protocol is not allowed");
    const allowedHosts = (process.env.IOT_RULE_WEBHOOK_ALLOWLIST ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (allowedHosts.length === 0 || !allowedHosts.includes(parsed.hostname.toLowerCase())) {
      throw new BadRequestException("CALL_WEBHOOK url is not in allowlist");
    }
  }

  private async writeAlertLog(
    alert: IotAlertEntity,
    action: string,
    beforeStatus: string | null,
    afterStatus: string | null,
    content: string,
    actor?: JwtPrincipal
  ): Promise<void> {
    await this.alertLogRepository.save(
      this.alertLogRepository.create({
        tenantId: alert.tenantId,
        parkId: alert.parkId,
        alertId: alert.id,
        action,
        beforeStatus,
        afterStatus,
        operatorId: actor?.sub ?? null,
        operatorName: actor ? this.actorName(actor) : "统一动作执行器",
        content,
        reason: null,
        opTime: new Date(),
        createBy: actor?.sub ?? null,
        updateBy: actor?.sub ?? null
      })
    );
  }

  private result(
    actionType: string,
    executionStatus: UnifiedActionExecutionStatus,
    resultPayload: Record<string, unknown>,
    errorMessage: string | null,
    executedAt: string
  ): UnifiedActionExecutionResult {
    return {
      action_type: actionType,
      execution_status: executionStatus,
      result_payload: this.redactPayload(resultPayload),
      error_message: errorMessage,
      executed_at: executedAt
    };
  }

  private scope(input: UnifiedActionExecutionInput): TenantParkScope {
    return { tenantId: input.tenant_id, parkId: input.park_id };
  }

  private isDeviceControlAction(actionType: string): boolean {
    return ["CONTROL_DEVICE", "TRIGGER_ACCESS_CONTROL", "TRIGGER_DOOR_OPEN", "TRIGGER_DOOR_CLOSE", "TRIGGER_DEVICE_STOP", "TRIGGER_DEVICE_START"].includes(actionType);
  }

  private simulatedMessage(actionType: string): string {
    if (actionType === "CALL_WEBHOOK") return "Webhook 动作已通过白名单校验，当前阶段不进行真实外部调用";
    if (this.isDeviceControlAction(actionType)) return "设备控制动作已校验租户范围，当前阶段安全模拟执行";
    if (actionType === "NOOP_SIMULATION") return "空操作模拟执行成功";
    return "动作已由统一动作执行器记录，真实跨模块执行链路后续接入";
  }

  private payloadValueText(payload: Record<string, unknown>): string {
    const value = payload.value ?? (payload.metrics ? safeStringify(payload.metrics) : payload.status ?? payload.alert_level ?? "");
    return typeof value === "string" ? value : safeStringify(value);
  }

  private readString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    return text.length > 0 ? text : undefined;
  }

  private redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const clone: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (/secret|password|token|access_key|raw_payload|device_secret|authorization/i.test(key)) {
        clone[key] = "***";
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        clone[key] = this.redactPayload(value as Record<string, unknown>);
      } else {
        clone[key] = value;
      }
    }
    return clone;
  }

  private systemActor(scope: TenantParkScope, sourceType: string): JwtPrincipal {
    return {
      sub: SYSTEM_OPERATOR_ID,
      username: "unified_action_executor",
      realName: `统一动作执行器(${sourceType})`,
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      roles: [],
      permissions: [],
      isSuper: true
    };
  }

  private actorName(actor: JwtPrincipal): string {
    return actor.realName ?? actor.username ?? actor.sub;
  }

  private sourceName(sourceType: string): string {
    const names: Record<string, string> = {
      IOT_RULE: "IoT 规则",
      IOT_SCENE: "场景联动",
      IOT_ALERT: "IoT 告警",
      VIDEO_ALERT: "视频告警",
      ENERGY_ALERT: "能耗告警",
      SAFETY: "安全事件",
      MANUAL: "手动触发"
    };
    return names[sourceType] ?? sourceType;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
