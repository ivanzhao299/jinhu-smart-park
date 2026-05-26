import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateVideoEvidenceDto } from "./dto/create-video-evidence.dto";
import { VideoEvidenceQueryDto } from "./dto/video-evidence-query.dto";
import { VideoEvidenceService } from "./video-evidence.service";

@Controller("video-security/evidences")
@RequireModule("video")
export class VideoEvidencesController {
  constructor(private readonly evidenceService: VideoEvidenceService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: VideoEvidenceQueryDto) {
    return this.evidenceService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.evidenceService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_CREATE)
  @AuditLog({
    module: "视频安防",
    action: "创建视频证据",
    resource: "biz.video_evidence",
    bizType: "video_evidence",
    captureBody: false
  })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateVideoEvidenceDto) {
    return this.evidenceService.create(scope, user, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_DELETE)
  @AuditLog({
    module: "视频安防",
    action: "删除视频证据",
    resource: "biz.video_evidence",
    bizType: "video_evidence",
    bizIdParam: "id"
  })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.evidenceService.softDelete(scope, user, id);
  }
}
