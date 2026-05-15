import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AssignRoleFieldPoliciesDto } from "./dto/assign-role-field-policies.dto";
import { CreateFieldPolicyDto } from "./dto/create-field-policy.dto";
import { UpdateFieldPolicyDto } from "./dto/update-field-policy.dto";
import { FieldPolicyService } from "./field-policy.service";

@Controller("field-policies")
export class FieldPoliciesController {
  constructor(private readonly fieldPolicyService: FieldPolicyService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_READ)
  list(@CurrentScope() scope: TenantParkScope, @Query() query: PaginationQueryDto) {
    return this.fieldPolicyService.list(scope, query);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_CREATE)
  @AuditLog({ module: "字段权限", resource: "system.field-policy", action: "新增", captureBody: true })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateFieldPolicyDto) {
    return this.fieldPolicyService.create(scope, user.sub, dto);
  }

  @Get("role-bindings/:roleId")
  @RequirePermissions(SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_READ)
  rolePolicies(@CurrentScope() scope: TenantParkScope, @Param("roleId") roleId: string) {
    return this.fieldPolicyService.listRolePolicies(scope, roleId);
  }

  @Post("role-bindings/:roleId")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLE_ASSIGN_FIELD_POLICY)
  @AuditLog({ module: "字段权限", resource: "system.field-policy", action: "角色字段策略绑定", bizType: "role", bizIdParam: "roleId" })
  assignRolePolicies(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("roleId") roleId: string,
    @Body() dto: AssignRoleFieldPoliciesDto
  ) {
    return this.fieldPolicyService.assignRolePolicies(scope, user.sub, roleId, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_READ)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.fieldPolicyService.detail(scope, id);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_UPDATE)
  @AuditLog({ module: "字段权限", resource: "system.field-policy", action: "修改", bizType: "field_policy", bizIdParam: "id", captureBody: true })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateFieldPolicyDto
  ) {
    return this.fieldPolicyService.update(scope, user.sub, id, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_UPDATE)
  @AuditLog({ module: "字段权限", resource: "system.field-policy", action: "修改", bizType: "field_policy", bizIdParam: "id", captureBody: true })
  replace(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateFieldPolicyDto
  ) {
    return this.fieldPolicyService.update(scope, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_DELETE)
  @AuditLog({ module: "字段权限", resource: "system.field-policy", action: "删除", bizType: "field_policy", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.fieldPolicyService.softDelete(scope, user.sub, id);
  }
}
