import { Controller, Get, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { SafetyStatisticsQueryDto } from "./dto/safety-statistics-query.dto";
import { SafetyStatisticsService } from "./safety-statistics.service";

@Controller("safety")
@RequireModule("safety")
export class SafetyStatisticsController {
  constructor(private readonly service: SafetyStatisticsService) {}

  @Get("statistics")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_STATISTICS_READ)
  statistics(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyStatisticsQueryDto) {
    return this.service.statistics(scope, user, query);
  }

  @Get("emergency-work-permit-statistics")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_STATISTICS_READ, SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_STATISTICS_READ)
  emergencyWorkPermitStatistics(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Query() query: SafetyStatisticsQueryDto
  ) {
    return this.service.emergencyWorkPermitStatistics(scope, user, query);
  }
}
