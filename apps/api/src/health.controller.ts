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

    const workorderDictCount = await this.countRecords(
      `
        SELECT COUNT(*)::int AS count
        FROM sys_dict_type
        WHERE tenant_id = $1
          AND park_id = $2
          AND dict_code IN (
            'workorder_status',
            'workorder_priority',
            'workorder_type',
            'workorder_urgency',
            'workorder_source_type'
          )
          AND is_deleted = false
      `,
      [tenantId, parkId]
    );
    if (workorderDictCount >= 5) {
      checks.workorderReleaseDicts = "ok";
    } else {
      reasons.workorderReleaseDicts = "workorder release dictionaries incomplete";
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
