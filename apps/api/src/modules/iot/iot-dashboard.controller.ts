import { Controller, Get } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { IotDashboardService } from "./iot-dashboard.service";

@Controller("iot/dashboard")
@RequireModule("iot")
export class IotDashboardController {
  constructor(private readonly dashboardService: IotDashboardService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DASHBOARD_READ)
  dashboard(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.dashboardService.dashboard(scope, user);
  }
}
