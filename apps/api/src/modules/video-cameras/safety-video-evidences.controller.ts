import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { LinkVideoEvidenceDto } from "./dto/link-video-evidence.dto";
import { VideoEvidenceService } from "./video-evidence.service";

@Controller("safety")
@RequireModule("safety", "video")
export class SafetyVideoEvidencesController {
  constructor(private readonly evidenceService: VideoEvidenceService) {}

  @Get("inspections/:id/video-evidences")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_READ)
  listInspectionEvidences(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.evidenceService.sourceList(scope, "INSPECTION", id, user);
  }

  @Post("inspections/:id/video-evidences")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_CREATE)
  @AuditLog({
    module: "视频安防",
    action: "巡检关联视频证据",
    resource: "biz.video_evidence",
    bizType: "video_evidence",
    captureBody: false
  })
  createInspectionEvidence(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: LinkVideoEvidenceDto
  ) {
    return this.evidenceService.createForSource(scope, user, "INSPECTION", id, dto);
  }

  @Get("inspect-tasks/:id/video-evidences")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_READ)
  listInspectTaskEvidences(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.evidenceService.sourceList(scope, "INSPECTION", id, user);
  }

  @Post("inspect-tasks/:id/video-evidences")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_CREATE)
  @AuditLog({
    module: "视频安防",
    action: "巡检任务关联视频证据",
    resource: "biz.video_evidence",
    bizType: "video_evidence",
    captureBody: false
  })
  createInspectTaskEvidence(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: LinkVideoEvidenceDto
  ) {
    return this.evidenceService.createForSource(scope, user, "INSPECTION", id, dto);
  }

  @Get("hazards/:id/video-evidences")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_READ)
  @AuditLog({
    module: "视频安防",
    action: "查看隐患视频证据",
    resource: "biz.video_evidence",
    bizType: "video_evidence",
    bizIdParam: "id",
    captureBody: false
  })
  listHazardEvidences(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.evidenceService.sourceList(scope, "HAZARD", id, user);
  }

  @Post("hazards/:id/video-evidences")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_CREATE)
  @AuditLog({
    module: "视频安防",
    action: "隐患关联视频证据",
    resource: "biz.video_evidence",
    bizType: "video_evidence",
    captureBody: false
  })
  createHazardEvidence(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: LinkVideoEvidenceDto
  ) {
    return this.evidenceService.createForSource(scope, user, "HAZARD", id, dto);
  }
}
