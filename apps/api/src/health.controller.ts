import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { DataSource } from "typeorm";
import { Public } from "./shared/decorators/public.decorator";
import { SkipResponseWrap } from "./shared/decorators/skip-response-wrap.decorator";

type ReadinessState = "ok" | "fail";

interface ReadinessChecks {
  database: ReadinessState;
  defaultTenant: ReadinessState;
  defaultPark: ReadinessState;
  tenantModuleAuthorization: ReadinessState;
  bootstrapAdmin: ReadinessState;
  workorderReleaseDicts: ReadinessState;
}

interface ReadinessPayload {
  status: "ready" | "not_ready";
  service: string;
  timestamp: string;
  checks: ReadinessChecks;
  reasons?: Partial<Record<keyof ReadinessChecks, string>>;
}

const REQUIRED_BUSINESS_DICT_CODES = [
  "energy_alert_level",
  "energy_alert_process_status",
  "energy_alert_type",
  "energy_allocation_method",
  "energy_allocation_rule_status",
  "energy_allocation_scope",
  "energy_billing_adjustment_status",
  "energy_billing_adjustment_type",
  "energy_billing_cycle_status",
  "energy_billing_item_status",
  "energy_billing_method",
  "energy_meter_purpose",
  "energy_meter_status",
  "energy_meter_type",
  "energy_reading_confirmation_status",
  "energy_reading_source",
  "industry_code",
  "iot_alert_level",
  "iot_alert_rule_operator",
  "iot_alert_status",
  "iot_data_quality",
  "iot_device_status",
  "iot_device_type",
  "iot_gateway_type",
  "iot_metric_value_type",
  "iot_point_type",
  "iot_protocol_type",
  "iot_rule_execution_status",
  "iot_rule_status",
  "iot_rule_trigger_scope",
  "iot_rule_type",
  "iot_scene_execution_status",
  "iot_scene_status",
  "iot_scene_trigger_mode",
  "iot_scene_type",
  "leasing_checkout_status",
  "leasing_checkout_type",
  "leasing_contract_change_status",
  "leasing_contract_change_type",
  "leasing_contract_source_type",
  "leasing_contract_status",
  "leasing_contract_type",
  "leasing_fee_type",
  "leasing_follow_type",
  "leasing_intention_level",
  "leasing_invoice_status",
  "leasing_invoice_type",
  "leasing_lead_lost_reason",
  "leasing_lead_source",
  "leasing_lead_status",
  "leasing_lost_reason",
  "leasing_payment_method",
  "leasing_payment_period",
  "leasing_payment_status",
  "leasing_quote_status",
  "leasing_receivable_adjust_policy",
  "leasing_receivable_status",
  "leasing_refund_method",
  "leasing_refund_status",
  "leasing_release_unit_status",
  "leasing_settlement_status",
  "leasing_waiver_status",
  "park_tenant_contact_role",
  "park_tenant_qualification_type",
  "park_tenant_risk_level",
  "park_tenant_source_type",
  "park_tenant_status",
  "park_tenant_type",
  "safety_check_method",
  "safety_emergency_contact_role",
  "safety_emergency_contact_status",
  "safety_emergency_duty_type",
  "safety_emergency_incident_type",
  "safety_emergency_plan_status",
  "safety_emergency_response_level",
  "safety_emergency_severity",
  "safety_emergency_source_type",
  "safety_emergency_status",
  "safety_hazard_source_type",
  "safety_hazard_status",
  "safety_hazard_type",
  "safety_inspect_frequency",
  "safety_inspect_item_result",
  "safety_inspect_item_type",
  "safety_inspect_plan_status",
  "safety_inspect_point_status",
  "safety_inspect_point_type",
  "safety_inspect_result",
  "safety_inspect_task_status",
  "safety_inspect_template_status",
  "safety_inspect_template_type",
  "safety_risk_level",
  "safety_work_permit_apply_type",
  "safety_work_permit_status",
  "safety_work_permit_type",
  "unit_fitting_status",
  "unit_rental_status",
  "unit_usage_type",
  "video_alert_level",
  "video_alert_process_status",
  "video_alert_source",
  "video_alert_type",
  "video_camera_status",
  "video_camera_type",
  "video_camera_usage",
  "video_platform_status",
  "video_platform_type",
  "workorder_priority",
  "workorder_source_type",
  "workorder_status",
  "workorder_type",
  "workorder_urgency"
] as const;

@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService
  ) {}

  @Public()
  @Get("health")
  getHealth() {
    return {
      status: "ok",
      service: "jinhu-smart-park-api",
      timestamp: new Date().toISOString()
    };
  }

  @Public()
  @SkipResponseWrap()
  @Get("ready")
  async getReadiness(@Res() response: Response): Promise<void> {
    const service = "jinhu-smart-park-api";
    const tenantId = this.resolveConfigValue("DEFAULT_TENANT_ID", "TENANT_ID", "10000001");
    const parkId = this.resolveConfigValue("DEFAULT_PARK_ID", "PARK_ID", "20000001");
    const checks: ReadinessChecks = {
      database: "fail",
      defaultTenant: "fail",
      defaultPark: "fail",
      tenantModuleAuthorization: "fail",
      bootstrapAdmin: "fail",
      workorderReleaseDicts: "fail"
    };
    const reasons: Partial<Record<keyof ReadinessChecks, string>> = {};

    try {
      await this.dataSource.query("SELECT 1");
      checks.database = "ok";
    } catch {
      reasons.database = "database query failed";
      return this.respondReadiness(response, service, checks, reasons);
    }

    const tenantCount = await this.countRecords(
      `
        SELECT COUNT(*)::int AS count
        FROM sys_tenant
        WHERE tenant_id = $1
          AND status = 1
          AND (expire_time IS NULL OR expire_time > now())
          AND is_deleted = false
      `,
      [tenantId]
    );
    if (tenantCount > 0) {
      checks.defaultTenant = "ok";
    } else {
      reasons.defaultTenant = "default tenant missing";
    }

    const parkCount = await this.countRecords(
      `
        SELECT COUNT(*)::int AS count
        FROM biz_park park
        JOIN sys_tenant tenant
          ON tenant.tenant_id = park.tenant_id
         AND tenant.status = 1
         AND tenant.is_deleted = false
         AND (tenant.expire_time IS NULL OR tenant.expire_time > now())
        WHERE park.tenant_id = $1
          AND park.park_id = $2
          AND park.status = 1
          AND park.is_deleted = false
      `,
      [tenantId, parkId]
    );
    if (parkCount > 0) {
      checks.defaultPark = "ok";
    } else {
      reasons.defaultPark = "default park missing";
    }

    const tenantModuleCount = await this.countRecords(
      `
        SELECT COUNT(*)::int AS count
        FROM rel_tenant_module
        WHERE tenant_id = $1
          AND park_id = $2
          AND enabled = true
          AND status = 'enabled'
          AND is_deleted = false
      `,
      [tenantId, parkId]
    );
    if (tenantModuleCount > 0) {
      checks.tenantModuleAuthorization = "ok";
    } else {
      reasons.tenantModuleAuthorization = "tenant module authorization missing";
    }

    const bootstrapAdminCount = await this.countRecords(
      `
        SELECT COUNT(*)::int AS count
        FROM sys_user u
        JOIN rel_user_role rur ON rur.user_id = u.id
        JOIN sys_role r ON r.id = rur.role_id
        WHERE u.tenant_id = $1
          AND u.park_id = $2
          AND u.is_deleted = false
          AND u.is_enabled = true
          AND rur.is_deleted = false
          AND r.is_deleted = false
          AND r.code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN', 'TENANT_ADMIN')
      `,
      [tenantId, parkId]
    );
    if (bootstrapAdminCount > 0) {
      checks.bootstrapAdmin = "ok";
    } else {
      reasons.bootstrapAdmin = "bootstrap admin missing";
    }

    const requiredDictionaryCount = await this.countRecords(
      `
        SELECT COUNT(DISTINCT dict_type.dict_code)::int AS count
        FROM sys_dict_type dict_type
        JOIN sys_dict_item dict_item
          ON dict_item.dict_type_id = dict_type.id
         AND dict_item.tenant_id = dict_type.tenant_id
         AND dict_item.park_id = dict_type.park_id
         AND dict_item.status = 'enabled'
         AND dict_item.is_deleted = false
        WHERE dict_type.tenant_id = $1
          AND dict_type.park_id = $2
          AND dict_type.dict_code = ANY($3::varchar[])
          AND dict_type.is_deleted = false
          AND dict_type.status = 'enabled'
      `,
      [tenantId, parkId, REQUIRED_BUSINESS_DICT_CODES]
    );
    if (requiredDictionaryCount >= REQUIRED_BUSINESS_DICT_CODES.length) {
      checks.workorderReleaseDicts = "ok";
    } else {
      reasons.workorderReleaseDicts = "required business dictionaries incomplete";
    }

    const missingDictionaryScopeCount = await this.countRecords(
      `
        WITH required(dict_code) AS (
          SELECT unnest($1::varchar[])
        ),
        active_scopes AS (
          SELECT DISTINCT park.tenant_id, park.park_id
          FROM biz_park park
          JOIN sys_tenant tenant
            ON tenant.tenant_id = park.tenant_id
           AND tenant.status = 1
           AND tenant.is_deleted = false
           AND (tenant.expire_time IS NULL OR tenant.expire_time > now())
          WHERE park.status = 1
            AND park.is_deleted = false
        )
        SELECT COUNT(*)::int AS count
        FROM active_scopes scope
        WHERE EXISTS (
          SELECT 1
          FROM required
          WHERE NOT EXISTS (
            SELECT 1
            WHERE (
              EXISTS (
                SELECT 1
                FROM sys_dict_type live_type
                WHERE live_type.dict_code = required.dict_code
                  AND live_type.tenant_id = scope.tenant_id
                  AND live_type.park_id = scope.park_id
                  AND live_type.status = 'enabled'
                  AND live_type.is_deleted = false
                  AND EXISTS (
                    SELECT 1
                    FROM sys_dict_item dict_item
                    WHERE dict_item.dict_type_id = live_type.id
                      AND dict_item.tenant_id = live_type.tenant_id
                      AND dict_item.park_id = live_type.park_id
                  )
              )
              OR (
                NOT EXISTS (
                  SELECT 1
                  FROM sys_dict_type live_type
                  WHERE live_type.dict_code = required.dict_code
                    AND live_type.tenant_id = scope.tenant_id
                    AND live_type.park_id = scope.park_id
                    AND live_type.status = 'enabled'
                    AND live_type.is_deleted = false
                )
                AND EXISTS (
                  SELECT 1
                  FROM sys_dict_type history_type
                  WHERE history_type.dict_code = required.dict_code
                    AND history_type.tenant_id = scope.tenant_id
                    AND history_type.park_id = scope.park_id
                )
              )
            )
          )
        )
      `,
      [REQUIRED_BUSINESS_DICT_CODES]
    );
    if (missingDictionaryScopeCount > 0) {
      checks.workorderReleaseDicts = "fail";
      reasons.workorderReleaseDicts = "required business dictionary initialization history incomplete in active park scopes";
    }

    return this.respondReadiness(response, service, checks, reasons);
  }

  private resolveConfigValue(primaryKey: string, fallbackKey: string, defaultValue: string): string {
    return (
      this.configService.get<string>(primaryKey) ??
      this.configService.get<string>(fallbackKey) ??
      defaultValue
    );
  }

  private async countRecords(sql: string, parameters: unknown[]): Promise<number> {
    const result = (await this.dataSource.query(sql, parameters)) as Array<{ count: number | string }>;
    const rawCount = result[0]?.count ?? 0;
    return Number(rawCount);
  }

  private respondReadiness(
    response: Response,
    service: string,
    checks: ReadinessChecks,
    reasons: Partial<Record<keyof ReadinessChecks, string>>
  ): void {
    const isReady = Object.values(checks).every((value) => value === "ok");
    const payload: ReadinessPayload = {
      status: isReady ? "ready" : "not_ready",
      service,
      timestamp: new Date().toISOString(),
      checks
    };

    if (!isReady) {
      payload.reasons = reasons;
    }

    response.status(isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(payload);
  }
}
