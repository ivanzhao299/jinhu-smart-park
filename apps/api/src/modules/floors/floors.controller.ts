import { Body, Controller, Delete, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { type UploadedFilePayload } from "../files/files.service";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CreateFloorDto } from "./dto/create-floor.dto";
import { FloorQueryDto } from "./dto/floor-query.dto";
import { UpdateFloorDto } from "./dto/update-floor.dto";
import { FloorsService } from "./floors.service";

@Controller("floors")
@RequireModule("asset")
export class FloorsController {
  constructor(private readonly floorsService: FloorsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.FLOOR_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: FloorQueryDto) {
    return this.floorsService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.FLOOR_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.floorsService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.FLOOR_CREATE)
  @AuditLog({ module: "楼层管理", resource: "biz.floor", action: "新增", bizType: "biz_floor" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateFloorDto) {
    return this.floorsService.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.FLOOR_UPDATE)
  @AuditLog({ module: "楼层管理", resource: "biz.floor", action: "修改", bizType: "biz_floor", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateFloorDto
  ) {
    return this.floorsService.update(scope, user, id, dto);
  }

  @Post(":id/layout")
  @RequirePermissions(SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT)
  @AuditLog({ module: "楼层管理", resource: "biz.floor", action: "上传平面图", bizType: "biz_floor", bizIdParam: "id" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadLayout(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body("remark") remark: string | undefined,
    @UploadedFile() file?: UploadedFilePayload
  ) {
    return this.floorsService.uploadLayout(scope, user, id, file, remark);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.FLOOR_DELETE)
  @AuditLog({ module: "楼层管理", resource: "biz.floor", action: "删除", bizType: "biz_floor", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.floorsService.softDelete(scope, user, id);
  }
}
