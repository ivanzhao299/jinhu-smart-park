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
        FROM biz_park
        WHERE tenant_id = $1
          AND park_id = $2
          AND is_deleted = false
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
          AND dict_type.dict_code IN (
            'park_tenant_status',
            'park_tenant_type',
            'park_tenant_risk_level',
            'industry_code',
            'park_tenant_source_type',
            'leasing_contract_change_type',
            'leasing_contract_change_status',
            'leasing_checkout_type',
            'leasing_checkout_status',
            'workorder_status',
            'workorder_priority',
            'workorder_type',
            'workorder_urgency',
            'workorder_source_type'
          )
          AND dict_type.is_deleted = false
          AND dict_type.status = 'enabled'
      `,
      [tenantId, parkId]
    );
    if (requiredDictionaryCount >= 14) {
      checks.workorderReleaseDicts = "ok";
    } else {
      reasons.workorderReleaseDicts = "required business dictionaries incomplete";
    }

    const missingDictionaryScopeCount = await this.countRecords(
      `
        WITH required(dict_code) AS (
          VALUES
            ('park_tenant_status'),
            ('park_tenant_type'),
            ('park_tenant_risk_level'),
            ('industry_code'),
            ('park_tenant_source_type'),
            ('leasing_contract_change_type'),
            ('leasing_contract_change_status'),
            ('leasing_checkout_type'),
            ('leasing_checkout_status'),
            ('workorder_status'),
            ('workorder_priority'),
            ('workorder_type'),
            ('workorder_urgency'),
            ('workorder_source_type')
        ),
        active_scopes AS (
          SELECT DISTINCT tenant_id, park_id
          FROM biz_park
          WHERE is_deleted = false
        )
        SELECT COUNT(*)::int AS count
        FROM active_scopes scope
        WHERE (
          SELECT COUNT(DISTINCT dict_type.dict_code)
          FROM required
          JOIN sys_dict_type dict_type
            ON dict_type.dict_code = required.dict_code
           AND dict_type.tenant_id = scope.tenant_id
           AND dict_type.park_id = scope.park_id
           AND dict_type.status = 'enabled'
           AND dict_type.is_deleted = false
          JOIN sys_dict_item dict_item
            ON dict_item.dict_type_id = dict_type.id
           AND dict_item.tenant_id = dict_type.tenant_id
           AND dict_item.park_id = dict_type.park_id
           AND dict_item.status = 'enabled'
           AND dict_item.is_deleted = false
        ) < 14
      `,
      []
    );
    if (missingDictionaryScopeCount > 0) {
      checks.workorderReleaseDicts = "fail";
      reasons.workorderReleaseDicts = "required business dictionaries incomplete in active park scopes";
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

  private async countRecords(sql: string, parameters: string[]): Promise<number> {
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
