import { Controller, Get, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { VideoDashboardQueryDto } from "./dto/video-alert-query.dto";
import { VideoAlertService } from "./video-alert.service";

@Controller("video-security/dashboard")
@RequireModule("video")
export class VideoSecurityDashboardController {
  constructor(private readonly videoAlertService: VideoAlertService) {}

  @Get("overview")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_SECURITY_DASHBOARD_READ)
  @AuditLog({ module: "视频安防", action: "查看安防大屏概览", resource: "biz.video_alert", bizType: "video_dashboard", captureBody: false })
  overview(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: VideoDashboardQueryDto) {
    return this.videoAlertService.overview(scope, query, user);
  }

  @Get("alert-trends")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_SECURITY_DASHBOARD_READ)
  alertTrends(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: VideoDashboardQueryDto) {
    return this.videoAlertService.alertTrends(scope, query, user);
  }

  @Get("device-status")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_SECURITY_DASHBOARD_READ)
  deviceStatus(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.videoAlertService.deviceStatus(scope, user);
  }

  @Get("park-map")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_SECURITY_DASHBOARD_READ)
  parkMap(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.videoAlertService.parkMap(scope, user);
  }

  @Get("realtime-alerts")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_SECURITY_DASHBOARD_READ)
  @AuditLog({ module: "视频安防", action: "查看实时视频告警", resource: "biz.video_alert", bizType: "video_alert", captureBody: false })
  realtimeAlerts(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: VideoDashboardQueryDto) {
    return this.videoAlertService.realtimeAlerts(scope, query, user);
  }
}
