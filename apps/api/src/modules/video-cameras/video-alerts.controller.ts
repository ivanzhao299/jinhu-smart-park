import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateVideoAlertDto } from "./dto/create-video-alert.dto";
import { UpdateVideoAlertDto } from "./dto/update-video-alert.dto";
import { AssignVideoAlertDto, CreateVideoAlertHazardDto, CreateVideoAlertInspectionDto, VideoAlertActionDto } from "./dto/video-alert-action.dto";
import { VideoAlertQueryDto } from "./dto/video-alert-query.dto";
import { VideoAlertService } from "./video-alert.service";

@Controller("video-security/alerts")
@RequireModule("video")
export class VideoAlertsController {
  constructor(private readonly videoAlertService: VideoAlertService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: VideoAlertQueryDto) {
    return this.videoAlertService.list(scope, query, user);
  }

  @Post("detect-offline")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_PROCESS)
  @AuditLog({ module: "视频安防", action: "视频离线告警检测", resource: "biz.video_alert", bizType: "video_alert", captureBody: false })
  detectOffline(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.videoAlertService.detectOffline(scope, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_CREATE)
  @AuditLog({ module: "视频安防", action: "创建视频告警", resource: "biz.video_alert", bizType: "video_alert", captureBody: false })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateVideoAlertDto) {
    return this.videoAlertService.create(scope, user, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.videoAlertService.detail(scope, id, user);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_UPDATE)
  @AuditLog({
    module: "视频安防",
    action: "更新视频告警",
    resource: "biz.video_alert",
    bizType: "video_alert",
    bizIdParam: "id",
    captureBody: false
  })
  update(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdateVideoAlertDto) {
    return this.videoAlertService.update(scope, user, id, dto);
  }

  @Post(":id/acknowledge")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_PROCESS)
  @AuditLog({
    module: "视频安防",
    action: "确认视频告警",
    resource: "biz.video_alert",
    bizType: "video_alert",
    bizIdParam: "id",
    captureBody: false
  })
  acknowledge(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: VideoAlertActionDto) {
    return this.videoAlertService.acknowledge(scope, user, id, dto);
  }

  @Post(":id/assign")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_PROCESS)
  @AuditLog({
    module: "视频安防",
    action: "指派视频告警",
    resource: "biz.video_alert",
    bizType: "video_alert",
    bizIdParam: "id",
    captureBody: false
  })
  assign(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: AssignVideoAlertDto) {
    return this.videoAlertService.assign(scope, user, id, dto);
  }

  @Post(":id/resolve")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_PROCESS)
  @AuditLog({
    module: "视频安防",
    action: "处理视频告警",
    resource: "biz.video_alert",
    bizType: "video_alert",
    bizIdParam: "id",
    captureBody: false
  })
  resolve(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: VideoAlertActionDto) {
    return this.videoAlertService.resolve(scope, user, id, dto);
  }

  @Post(":id/close")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_CLOSE)
  @AuditLog({
    module: "视频安防",
    action: "关闭视频告警",
    resource: "biz.video_alert",
    bizType: "video_alert",
    bizIdParam: "id",
    captureBody: false
  })
  close(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: VideoAlertActionDto) {
    return this.videoAlertService.close(scope, user, id, dto);
  }

  @Post(":id/create-inspection")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_CREATE_INSPECTION)
  @AuditLog({
    module: "视频安防",
    action: "视频告警生成巡检任务",
    resource: "biz.safety_inspect_task",
    bizType: "safety_inspect_task",
    bizIdParam: "id",
    captureBody: false
  })
  createInspection(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CreateVideoAlertInspectionDto
  ) {
    return this.videoAlertService.createInspection(scope, user, id, dto);
  }

  @Post(":id/create-hazard")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_CREATE_HAZARD)
  @AuditLog({
    module: "视频安防",
    action: "视频告警生成隐患整改",
    resource: "biz.safety_hazard",
    bizType: "safety_hazard",
    bizIdParam: "id",
    captureBody: false
  })
  createHazard(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CreateVideoAlertHazardDto
  ) {
    return this.videoAlertService.createHazard(scope, user, id, dto);
  }

  @Get(":id/logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_ALERT_LOG_READ)
  logs(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.videoAlertService.logs(scope, id, user);
  }
}
