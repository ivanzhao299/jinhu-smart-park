import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AssignRoleDataScopesDto } from "../data-scopes/dto/assign-role-data-scopes.dto";
import { AssignRoleFieldPoliciesDto } from "../field-policies/dto/assign-role-field-policies.dto";
import { AssignFieldPermissionsDto } from "./dto/assign-field-permissions.dto";
import { AssignPermissionsDto } from "./dto/assign-permissions.dto";
import { CopyRoleDto } from "./dto/copy-role.dto";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { RolesService } from "./roles.service";

@Controller("roles")
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_READ)
  list(@CurrentScope() scope: TenantParkScope, @Query() query: PaginationQueryDto) {
    return this.rolesService.list(scope, query);
  }

  @Get("tree")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_READ)
  tree(@CurrentScope() scope: TenantParkScope) {
    return this.rolesService.tree(scope);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_OPEN_CREATE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "新增" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(scope, user.sub, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.rolesService.detail(scope, id);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_OPEN_UPDATE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "修改", bizType: "role", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto
  ) {
    return this.rolesService.update(scope, user.sub, id, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_OPEN_UPDATE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "修改", bizType: "role", bizIdParam: "id" })
  replace(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto
  ) {
    return this.rolesService.update(scope, user.sub, id, dto);
  }

  @Post(":id/enable")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_DISABLE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "启用", bizType: "role", bizIdParam: "id" })
  enable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.rolesService.enable(scope, user.sub, id);
  }

  @Post(":id/disable")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_DISABLE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "停用", bizType: "role", bizIdParam: "id" })
  disable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.rolesService.disable(scope, user.sub, id);
  }

  @Post(":id/copy")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_COPY)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "复制", bizType: "role", bizIdParam: "id" })
  copy(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: CopyRoleDto) {
    return this.rolesService.copy(scope, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_OPEN_DELETE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "删除", bizType: "role", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.rolesService.softDelete(scope, user.sub, id);
  }

  @Post(":id/permissions")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_OPEN_UPDATE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "权限变更", bizType: "role", bizIdParam: "id" })
  assignPermissions(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AssignPermissionsDto
  ) {
    return this.rolesService.assignPermissions(scope, user.sub, id, dto);
  }

  @Get(":id/field-permissions")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_READ)
  fieldPermissions(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.rolesService.listFieldPermissions(scope, id);
  }

  @Post(":id/field-permissions")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_OPEN_UPDATE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "字段权限变更", bizType: "role", bizIdParam: "id" })
  assignFieldPermissions(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AssignFieldPermissionsDto
  ) {
    return this.rolesService.assignFieldPermissions(scope, user.sub, id, dto);
  }

  @Post(":id/data-scopes")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "数据权限变更", bizType: "role", bizIdParam: "id" })
  assignDataScopes(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AssignRoleDataScopesDto
  ) {
    return this.dataScopeService.assignRoleRules(scope, user.sub, id, dto);
  }

  @Post(":id/field-policies")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_ASSIGN_FIELD_POLICY)
  @AuditLog({ module: "角色管理", resource: "system.role", action: "字段策略变更", bizType: "role", bizIdParam: "id" })
  assignRoleFieldPolicies(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AssignRoleFieldPoliciesDto
  ) {
    return this.fieldPolicyService.assignRolePolicies(scope, user.sub, id, dto);
  }
}
