import { Controller, Get, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { EnergyDashboardService } from "./energy-dashboard.service";

@Controller("energy/dashboard")
@RequireModule("energy")
export class EnergyDashboardController {
  constructor(private readonly dashboardService: EnergyDashboardService) {}

  @Get("overview")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_DASHBOARD_READ)
  overview(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.dashboardService.overview(scope, user);
  }

  @Get("trends")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_DASHBOARD_READ)
  trends(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: { start_date?: string; end_date?: string; meter_type?: string }) {
    return this.dashboardService.trends(scope, query, user);
  }

  @Get("by-building")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_DASHBOARD_READ)
  byBuilding(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: { start_date?: string; end_date?: string }) {
    return this.dashboardService.byBuilding(scope, query, user);
  }

  @Get("by-tenant")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_DASHBOARD_READ)
  byTenant(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: { start_date?: string; end_date?: string }) {
    return this.dashboardService.byTenant(scope, query, user);
  }

  @Get("abnormal")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_DASHBOARD_READ)
  abnormal(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.dashboardService.abnormal(scope, user);
  }
}
