import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseInterceptors } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireAnyPermissions, RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AssignRolesDto } from "./dto/assign-roles.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ReplaceUserOrgsDto } from "./dto/replace-user-orgs.dto";
import { UserOrgCandidatesQueryDto } from "./dto/user-org-candidates-query.dto";
import { UserRoleCandidatesQueryDto } from "./dto/user-role-candidates-query.dto";
import { UsersService } from "./users.service";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { AuditScopeRequest } from "../../shared/interceptors/audit-log.interceptor";

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

  @Get("org-candidates")
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_CREATE)
  createOrgCandidates(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Query() query: UserOrgCandidatesQueryDto
  ) {
    return this.usersService.getCreateOrgCandidates(scope, user, query.tenantId, query.parkId);
  }

  @Get("role-candidates")
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_ASSIGN_ROLES)
  roleCandidates(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Query() query: UserRoleCandidatesQueryDto
  ) {
    return this.usersService.getCreateRoleCandidates(scope, user, query);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_DETAIL)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.usersService.detail(scope, id, user);
  }

  @Get(":id/orgs")
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_UPDATE)
  listOrgs(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.usersService.listOrgAssignments(scope, user, id);
  }

  @Get(":id/org-candidates")
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_UPDATE)
  orgCandidates(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.usersService.getOrgCandidates(scope, user, id);
  }

  @Get(":id/roles")
  @RequireAnyPermissions(SYSTEM_PERMISSIONS.USER_DETAIL, SYSTEM_PERMISSIONS.USER_ASSIGN_ROLES)
  listRoles(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Query() query: UserRoleCandidatesQueryDto
  ) {
    return this.usersService.getUserRoleContext(scope, user, id, query);
  }

  @Post(":id/orgs")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_UPDATE)
  @AuditLog({ module: "用户管理", resource: "system.user_org", action: "组织岗位变更", bizType: "user", bizIdParam: "id" })
  async replaceOrgs(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ReplaceUserOrgsDto,
    @Req() request: AuditScopeRequest
  ) {
    return this.usersService.replaceOrgAssignments(scope, user, id, dto, (targetScope) => {
      request.auditScopeOverride = targetScope;
    });
  }

  @Patch(":id")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_UPDATE)
  @AuditLog({ module: "用户管理", resource: "system.user", action: "修改", bizType: "user", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuditScopeRequest
  ) {
    return this.usersService.update(scope, user, id, dto, (targetScope) => {
      request.auditScopeOverride = targetScope;
    });
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
    @Body() dto: AssignRolesDto,
    @Req() request: AuditScopeRequest
  ) {
    return this.usersService.assignRoles(scope, user, id, dto, (targetScope) => {
      request.auditScopeOverride = targetScope;
    });
  }
}
