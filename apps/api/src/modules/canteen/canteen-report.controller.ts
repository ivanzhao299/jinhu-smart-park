import { Controller, Get, Query } from "@nestjs/common";
import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { ReportQueryDto } from "./dto/canteen.dto";
import { CanteenReportService } from "./canteen-report.service";

@Controller("canteen/reports")
export class CanteenReportController {
  constructor(private readonly svc: CanteenReportService) {}

  @Get("sales")
  @RequirePermissions(CANTEEN_PERMISSIONS.REPORT_VIEW)
  sales(@CurrentScope() scope: TenantParkScope, @Query() q: ReportQueryDto) {
    return this.svc.sales(scope, q);
  }

  @Get("daily")
  @RequirePermissions(CANTEEN_PERMISSIONS.REPORT_VIEW)
  daily(@CurrentScope() scope: TenantParkScope, @Query() q: ReportQueryDto) {
    return this.svc.daily(scope, q);
  }

  @Get("dish-ranking")
  @RequirePermissions(CANTEEN_PERMISSIONS.REPORT_VIEW)
  dishRanking(@CurrentScope() scope: TenantParkScope, @Query() q: ReportQueryDto) {
    return this.svc.dishRanking(scope, q);
  }

  @Get("subsidy-usage")
  @RequirePermissions(CANTEEN_PERMISSIONS.REPORT_VIEW)
  subsidyUsage(@CurrentScope() scope: TenantParkScope, @Query("period") period: string) {
    return this.svc.subsidyUsage(scope, period);
  }

  @Get("dashboard")
  @RequirePermissions(CANTEEN_PERMISSIONS.DASHBOARD_VIEW)
  dashboard(@CurrentScope() scope: TenantParkScope, @Query() q: ReportQueryDto) {
    return this.svc.dashboard(scope, q);
  }
}
