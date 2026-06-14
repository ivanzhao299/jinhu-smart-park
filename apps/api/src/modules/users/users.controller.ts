import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AssignRolesDto } from "./dto/assign-roles.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_LIST)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: PaginationQueryDto) {
    return this.usersService.list(scope, query, user);
  }

  @Post()
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_CREATE)
  @AuditLog({ module: "用户管理", resource: "system.user", action: "新增", captureBody: true })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateUserDto) {
    return this.usersService.create(scope, user, dto);
  }

  @Get("me")
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_ME)
  me(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.usersService.getCurrentUserContext(scope, user.sub);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_DETAIL)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.usersService.detail(scope, id, user);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_UPDATE)
  @AuditLog({ module: "用户管理", resource: "system.user", action: "修改", bizType: "user", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateUserDto
  ) {
    return this.usersService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_DELETE)
  @AuditLog({ module: "用户管理", resource: "system.user", action: "删除", bizType: "user", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.usersService.softDelete(scope, user.sub, id);
  }

  @Post(":id/reset-password")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_RESET_PASSWORD)
  @AuditLog({ module: "用户管理", resource: "system.user", action: "重置密码", bizType: "user", bizIdParam: "id", captureBody: false })
  resetPassword(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ResetPasswordDto
  ) {
    return this.usersService.resetPassword(scope, user.sub, id, dto);
  }

  @Post(":id/roles")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_ASSIGN_ROLES)
  @AuditLog({ module: "用户管理", resource: "system.user", action: "角色变更", bizType: "user", bizIdParam: "id" })
  assignRoles(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AssignRolesDto
  ) {
    return this.usersService.assignRoles(scope, user.sub, id, dto);
  }
}
