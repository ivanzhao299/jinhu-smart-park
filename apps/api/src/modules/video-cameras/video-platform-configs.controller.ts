import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateVideoPlatformConfigDto } from "./dto/create-video-platform-config.dto";
import { UpdateVideoPlatformConfigDto } from "./dto/update-video-platform-config.dto";
import { VideoPlatformConfigQueryDto } from "./dto/video-platform-config-query.dto";
import { VideoPlatformService } from "./video-platform.service";

@Controller("video-security/platform-configs")
@RequireModule("video")
export class VideoPlatformConfigsController {
  constructor(private readonly platformService: VideoPlatformService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_PLATFORM_CONFIG_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: VideoPlatformConfigQueryDto) {
    return this.platformService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_PLATFORM_CONFIG_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.platformService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_PLATFORM_CONFIG_CREATE)
  @AuditLog({ module: "视频安防", action: "新增视频平台配置", resource: "biz.video_platform_config", bizType: "video_platform_config", captureBody: false })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateVideoPlatformConfigDto) {
    return this.platformService.create(scope, user, dto);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_PLATFORM_CONFIG_UPDATE)
  @AuditLog({
    module: "视频安防",
    action: "编辑视频平台配置",
    resource: "biz.video_platform_config",
    bizType: "video_platform_config",
    bizIdParam: "id",
    captureBody: false
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateVideoPlatformConfigDto
  ) {
    return this.platformService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.VIDEO_PLATFORM_CONFIG_DELETE)
  @AuditLog({
    module: "视频安防",
    action: "删除视频平台配置",
    resource: "biz.video_platform_config",
    bizType: "video_platform_config",
    bizIdParam: "id"
  })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.platformService.softDelete(scope, user, id);
  }
}
