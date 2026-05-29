import { Injectable, Logger } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { IotAlertEntity } from "./entities/iot-alert.entity";
import type { IotDeviceEntity } from "./entities/iot-device.entity";
import { IotRuleEngineService, type IotRuleTriggerPayload } from "./iot-rule-engine.service";
import { SceneExecutionService } from "./scene-execution.service";

@Injectable()
export class IotRuleTriggerService {
  private readonly logger = new Logger(IotRuleTriggerService.name);

  constructor(
    private readonly ruleEngineService: IotRuleEngineService,
    private readonly sceneExecutionService: SceneExecutionService
  ) {}

  async handleMetricReported(
    scope: TenantParkScope,
    device: IotDeviceEntity,
    metrics: Record<string, unknown>,
    actor?: JwtPrincipal,
    extraPayload: Record<string, unknown> = {}
  ): Promise<void> {
    await this.safeTrigger(scope, "METRIC", this.baseDevicePayload(device, { metrics, ...extraPayload }), actor);
  }

  async handleStatusChanged(
    scope: TenantParkScope,
    device: IotDeviceEntity,
    status: string,
    actor?: JwtPrincipal,
    extraPayload: Record<string, unknown> = {}
  ): Promise<void> {
    await this.safeTrigger(scope, "STATUS", this.baseDevicePayload(device, { status, ...extraPayload }), actor);
  }

  async handleAlertCreatedOrUpdated(scope: TenantParkScope, alert: IotAlertEntity, actor?: JwtPrincipal): Promise<void> {
    await this.safeTrigger(
      scope,
      "ALERT",
      {
        device_id: alert.deviceId,
        device_code: alert.deviceCode,
        building_id: alert.buildingId ?? undefined,
        floor_id: alert.floorId ?? undefined,
        unit_id: alert.unitId ?? undefined,
        park_tenant_id: alert.parkTenantId ?? undefined,
        alert_id: alert.id,
        alert_code: alert.alertCode,
        alert_level: alert.alertLevel,
        alert_status: alert.status,
        metric_code: alert.metricCode,
        value: alert.triggerValue ?? undefined,
        trigger_payload: alert.triggerPayload ?? alert.payload ?? {}
      },
      actor
    );
  }

  async scanScheduleRules(): Promise<{ scanned_count: number; executed_count: number }> {
    return this.ruleEngineService.scanScheduleRules();
  }

  private async safeTrigger(
    scope: TenantParkScope,
    triggerType: "METRIC" | "STATUS" | "ALERT",
    payload: IotRuleTriggerPayload,
    actor?: JwtPrincipal
  ): Promise<void> {
    try {
      const ruleLogs = await this.ruleEngineService.triggerRules(scope, triggerType, payload, actor);
      await this.sceneExecutionService.triggerAutomationsForRuleLogs(scope, ruleLogs, triggerType, payload, actor);
    } catch (error) {
      this.logger.warn(`IoT rule trigger ${triggerType} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private baseDevicePayload(device: IotDeviceEntity, extra: Record<string, unknown>): IotRuleTriggerPayload {
    return {
      device_id: device.id,
      device_code: device.deviceCode,
      device_type: device.deviceType,
      building_id: device.buildingId ?? undefined,
      floor_id: device.floorId ?? undefined,
      unit_id: device.unitId ?? undefined,
      park_tenant_id: device.parkTenantId ?? undefined,
      area_id: device.areaId ?? undefined,
      ...extra
    };
  }
}
