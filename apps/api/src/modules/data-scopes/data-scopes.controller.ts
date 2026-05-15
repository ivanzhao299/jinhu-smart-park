import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "./data-scope.service";
import { AssignRoleDataScopesDto } from "./dto/assign-role-data-scopes.dto";
import { CreateDataScopeRuleDto } from "./dto/create-data-scope-rule.dto";
import { UpdateDataScopeRuleDto } from "./dto/update-data-scope-rule.dto";

@Controller(["data-scopes", "data-scope-rules"])
export class DataScopesController {
  constructor(private readonly dataScopeService: DataScopeService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_READ)
  list(@CurrentScope() scope: TenantParkScope, @Query() query: PaginationQueryDto) {
    return this.dataScopeService.listRules(scope, query);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_CREATE)
  @AuditLog({ module: "数据权限", resource: "system.data-scope", action: "新增", captureBody: true })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateDataScopeRuleDto) {
    return this.dataScopeService.createRule(scope, user.sub, dto);
  }

  @Get("role-bindings/:roleId")
  @RequirePermissions(SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_READ)
  roleRules(@CurrentScope() scope: TenantParkScope, @Param("roleId") roleId: string) {
    return this.dataScopeService.listRoleRules(scope, roleId);
  }

  @Post("role-bindings/:roleId")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE)
  @AuditLog({ module: "数据权限", resource: "system.data-scope", action: "角色数据权限绑定", bizType: "role", bizIdParam: "roleId" })
  assignRoleRules(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("roleId") roleId: string,
    @Body() dto: AssignRoleDataScopesDto
  ) {
    return this.dataScopeService.assignRoleRules(scope, user.sub, roleId, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_READ)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.dataScopeService.detailRule(scope, id);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_UPDATE)
  @AuditLog({ module: "数据权限", resource: "system.data-scope", action: "修改", bizType: "data_scope_rule", bizIdParam: "id", captureBody: true })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateDataScopeRuleDto
  ) {
    return this.dataScopeService.updateRule(scope, user.sub, id, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_UPDATE)
  @AuditLog({ module: "数据权限", resource: "system.data-scope", action: "修改", bizType: "data_scope_rule", bizIdParam: "id", captureBody: true })
  replace(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateDataScopeRuleDto
  ) {
    return this.dataScopeService.updateRule(scope, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_DELETE)
  @AuditLog({ module: "数据权限", resource: "system.data-scope", action: "删除", bizType: "data_scope_rule", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.dataScopeService.softDeleteRule(scope, user.sub, id);
  }
}
