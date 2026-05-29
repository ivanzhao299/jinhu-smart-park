import { Body, Controller, Param, Post } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { EnergyReadingService } from "./energy-reading.service";

@Controller("energy/readings")
@RequireModule("energy")
export class EnergyReadingsController {
  constructor(private readonly readingService: EnergyReadingService) {}

  @Post("import")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_READING_IMPORT)
  @AuditLog({ module: "能源管理", action: "导入读数", resource: "energy.reading", bizType: "energy_reading" })
  import(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: { readings?: Array<{ meter_id: string; reading_value: number; reading_time?: string }> }) {
    return this.readingService.importReadings(scope, user, dto);
  }

  @Post(":id/confirm")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_READING_CONFIRM)
  @AuditLog({ module: "能源管理", action: "确认读数", resource: "energy.reading", bizType: "energy_reading", bizIdParam: "id" })
  confirm(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.readingService.confirm(scope, user, id);
  }

  @Post(":id/reject")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_READING_CONFIRM)
  @AuditLog({ module: "能源管理", action: "驳回读数", resource: "energy.reading", bizType: "energy_reading", bizIdParam: "id" })
  reject(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.readingService.reject(scope, user, id);
  }
}
