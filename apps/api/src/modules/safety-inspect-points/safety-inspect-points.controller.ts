import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { TenantParkScope } from "@jinhu/shared";
import { CreateSafetyInspectPointDto } from "./dto/create-safety-inspect-point.dto";
import { SafetyInspectPointQueryDto } from "./dto/safety-inspect-point-query.dto";
import { UpdateSafetyInspectPointDto } from "./dto/update-safety-inspect-point.dto";
import { SafetyInspectPointsService } from "./safety-inspect-points.service";

@Controller("safety/inspect-points")
@RequireModule("safety")
export class SafetyInspectPointsController {
  constructor(private readonly service: SafetyInspectPointsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_POINT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyInspectPointQueryDto) {
    return this.service.list(scope, query, user);
  }

  @Get(":id/qrcode")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_POINT_QRCODE)
  qrcode(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.qrcode(scope, id, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_POINT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_POINT_CREATE)
  @AuditLog({ module: "安全巡检", action: "新增", resource: "biz.safety_inspect_point", bizType: "biz_safety_inspect_point" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateSafetyInspectPointDto) {
    return this.service.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_POINT_UPDATE)
  @AuditLog({ module: "安全巡检", action: "修改", resource: "biz.safety_inspect_point", bizType: "biz_safety_inspect_point", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSafetyInspectPointDto
  ) {
    return this.service.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_POINT_DELETE)
  @AuditLog({ module: "安全巡检", action: "删除", resource: "biz.safety_inspect_point", bizType: "biz_safety_inspect_point", bizIdParam: "id" })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.softDelete(scope, user, id);
  }
}
