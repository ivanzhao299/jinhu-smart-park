import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CameraDeviceQueryDto } from "./dto/camera-device-query.dto";
import { CaptureSnapshotDto } from "./dto/capture-snapshot.dto";
import { CreateCameraInspectionIssueDto } from "./dto/create-camera-inspection-issue.dto";
import { CreateCameraDeviceDto } from "./dto/create-camera-device.dto";
import { UpdateCameraDeviceDto } from "./dto/update-camera-device.dto";
import { UpdateCameraStatusDto } from "./dto/update-camera-status.dto";
import { VideoPlaybackQueryDto } from "./dto/video-playback-query.dto";
import { VideoCamerasService } from "./video-cameras.service";
import { VideoEvidenceService } from "./video-evidence.service";
import { VideoStreamService } from "./video-stream.service";

@Controller("video-security/cameras")
@RequireModule("video")
export class VideoCamerasController {
  constructor(
    private readonly camerasService: VideoCamerasService,
    private readonly evidenceService: VideoEvidenceService,
    private readonly streamService: VideoStreamService
  ) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: CameraDeviceQueryDto) {
    return this.camerasService.list(scope, query, user);
  }

  @Get("map")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_READ)
  map(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: CameraDeviceQueryDto) {
    return this.camerasService.map(scope, query, user);
  }

  @Get("by-location")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_READ)
  byLocation(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: CameraDeviceQueryDto) {
    return this.camerasService.byLocation(scope, query, user);
  }

  @Get(":id/preview-url")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_PREVIEW)
  @AuditLog({
    module: "视频安防",
    action: "查看实时视频",
    resource: "biz.camera_device",
    bizType: "camera_device",
    bizIdParam: "id",
    captureBody: false
  })
  previewUrl(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.streamService.getPreviewUrl(scope, id, user);
  }

  @Get(":id/snapshot-url")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_PREVIEW)
  @AuditLog({
    module: "视频安防",
    action: "获取摄像头截图地址",
    resource: "biz.camera_device",
    bizType: "camera_device",
    bizIdParam: "id",
    captureBody: false
  })
  snapshotUrl(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.streamService.getSnapshotUrl(scope, id, user);
  }

  @Post(":id/capture-snapshot")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_CAPTURE_SNAPSHOT)
  @AuditLog({
    module: "视频安防",
    action: "摄像头截图取证",
    resource: "biz.video_evidence",
    bizType: "video_evidence",
    bizIdParam: "id",
    captureBody: false
  })
  captureSnapshot(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CaptureSnapshotDto
  ) {
    return this.evidenceService.captureSnapshot(scope, user, id, dto);
  }

  @Post(":id/create-inspection-issue")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_CREATE_INSPECTION_ISSUE)
  @AuditLog({
    module: "视频安防",
    action: "摄像头异常生成巡检问题",
    resource: "biz.safety_hazard",
    bizType: "safety_hazard",
    bizIdParam: "id",
    captureBody: false
  })
  createInspectionIssue(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CreateCameraInspectionIssueDto
  ) {
    return this.evidenceService.createInspectionIssue(scope, user, id, dto);
  }

  @Get(":id/playback-url")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_PLAYBACK)
  playbackUrl(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Query() query: VideoPlaybackQueryDto
  ) {
    return this.streamService.getPlaybackUrl(scope, id, query, user);
  }

  @Get(":id/status-check")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_STATUS_CHECK)
  statusCheck(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.streamService.checkDeviceStatus(scope, id, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.camerasService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_CREATE)
  @AuditLog({ module: "视频安防", action: "新增摄像头", resource: "biz.camera_device", bizType: "camera_device", captureBody: false })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateCameraDeviceDto) {
    return this.camerasService.create(scope, user, dto);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_UPDATE)
  @AuditLog({
    module: "视频安防",
    action: "编辑摄像头",
    resource: "biz.camera_device",
    bizType: "camera_device",
    bizIdParam: "id",
    captureBody: false
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateCameraDeviceDto
  ) {
    return this.camerasService.update(scope, user, id, dto);
  }

  @Patch(":id/status")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_STATUS)
  @AuditLog({
    module: "视频安防",
    action: "修改摄像头状态",
    resource: "biz.camera_device",
    bizType: "camera_device",
    bizIdParam: "id"
  })
  updateStatus(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateCameraStatusDto
  ) {
    return this.camerasService.updateStatus(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_CAMERA_DELETE)
  @AuditLog({
    module: "视频安防",
    action: "删除摄像头",
    resource: "biz.camera_device",
    bizType: "camera_device",
    bizIdParam: "id"
  })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.camerasService.softDelete(scope, user, id);
  }
}
