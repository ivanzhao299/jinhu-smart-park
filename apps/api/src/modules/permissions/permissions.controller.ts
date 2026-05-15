import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CreatePermissionDto } from "./dto/create-permission.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";
import { PermissionsService } from "./permissions.service";

@Controller("permissions")
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.PERMISSION_READ)
  list(@CurrentScope() scope: TenantParkScope, @Query() query: PaginationQueryDto) {
    return this.permissionsService.list(scope, query);
  }

  @Get("tree")
  @RequirePermissions(SYSTEM_PERMISSIONS.PERMISSION_READ)
  tree(@CurrentScope() scope: TenantParkScope) {
    return this.permissionsService.tree(scope);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.PERMISSION_OPEN_CREATE)
  @AuditLog({ module: "权限管理", resource: "system.permission", action: "新增" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(scope, user, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PERMISSION_READ)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.permissionsService.detail(scope, id);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PERMISSION_OPEN_UPDATE)
  @AuditLog({ module: "权限管理", resource: "system.permission", action: "修改", bizType: "permission", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdatePermissionDto
  ) {
    return this.permissionsService.update(scope, user, id, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PERMISSION_OPEN_UPDATE)
  @AuditLog({ module: "权限管理", resource: "system.permission", action: "修改", bizType: "permission", bizIdParam: "id" })
  replace(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdatePermissionDto
  ) {
    return this.permissionsService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PERMISSION_OPEN_DELETE)
  @AuditLog({ module: "权限管理", resource: "system.permission", action: "删除", bizType: "permission", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.permissionsService.softDelete(scope, user, id);
  }
}
