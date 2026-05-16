import { Controller, Get, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { LeasingFunnelStatisticsQueryDto } from "./dto/leasing-funnel-statistics-query.dto";
import { LeasingLeadsService } from "./leasing-leads.service";

@Controller("leasing/statistics")
@RequireModule("leasing")
export class LeasingStatisticsController {
  constructor(private readonly leasingLeadsService: LeasingLeadsService) {}

  @Get("funnel")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_STATISTICS_FUNNEL, SYSTEM_PERMISSIONS.LEASING_LEAD_READ)
  funnel(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: LeasingFunnelStatisticsQueryDto) {
    return this.leasingLeadsService.funnelStatistics(scope, query, user);
  }
}
