import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AssignPermissionsDto } from "./dto/assign-permissions.dto";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { RolesService } from "./roles.service";

@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_LIST)
  list(@CurrentScope() scope: TenantParkScope, @Query() query: PaginationQueryDto) {
    return this.rolesService.list(scope, query);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_CREATE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "新增" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(scope, user.sub, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_DETAIL)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.rolesService.detail(scope, id);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_UPDATE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "修改", bizType: "role", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto
  ) {
    return this.rolesService.update(scope, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_DELETE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "删除", bizType: "role", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.rolesService.softDelete(scope, user.sub, id);
  }

  @Post(":id/permissions")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_ASSIGN_PERMISSIONS)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "权限变更", bizType: "role", bizIdParam: "id" })
  assignPermissions(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AssignPermissionsDto
  ) {
    return this.rolesService.assignPermissions(scope, user.sub, id, dto);
  }
}
