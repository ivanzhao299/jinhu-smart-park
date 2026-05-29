import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { EnergyAlertActionDto } from "./dto/energy-alert-action.dto";
import { EnergyAlertQueryDto } from "./dto/energy-alert-query.dto";
import { EnergyAlertService } from "./energy-alert.service";

@Controller("energy/alerts")
@RequireModule("energy")
export class EnergyAlertsController {
  constructor(private readonly alertService: EnergyAlertService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALERT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: EnergyAlertQueryDto) {
    return this.alertService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALERT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.alertService.detail(scope, id, user);
  }

  @Post(":id/acknowledge")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALERT_PROCESS)
  @AuditLog({ module: "能源管理", action: "确认能源告警", resource: "energy.alert", bizType: "energy_alert", bizIdParam: "id" })
  acknowledge(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.alertService.acknowledge(scope, user, id);
  }

  @Post(":id/resolve")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALERT_PROCESS)
  @AuditLog({ module: "能源管理", action: "处理能源告警", resource: "energy.alert", bizType: "energy_alert", bizIdParam: "id" })
  resolve(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.alertService.resolve(scope, user, id);
  }

  @Post(":id/close")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALERT_PROCESS)
  @AuditLog({ module: "能源管理", action: "关闭能源告警", resource: "energy.alert", bizType: "energy_alert", bizIdParam: "id" })
  close(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: EnergyAlertActionDto) {
    return this.alertService.close(scope, user, id, dto);
  }
}
