import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "./code-rules.service";
import { CreateCodeRuleDto } from "./dto/create-code-rule.dto";
import { UpdateCodeRuleDto } from "./dto/update-code-rule.dto";

@Controller("code-rules")
export class CodeRulesController {
  constructor(private readonly codeRulesService: CodeRulesService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.CODE_RULE_OPEN_READ)
  list(@CurrentScope() scope: TenantParkScope, @Query() query: PaginationQueryDto) {
    return this.codeRulesService.list(scope, query);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.CODE_RULE_OPEN_CREATE)
  @AuditLog({ module: "编码规则", resource: "system.code-rule", action: "新增", captureBody: true })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateCodeRuleDto) {
    return this.codeRulesService.create(scope, user.sub, dto);
  }

  @Get(":entityType/preview")
  @RequirePermissions(SYSTEM_PERMISSIONS.CODE_RULE_OPEN_READ)
  previewNext(@CurrentScope() scope: TenantParkScope, @Param("entityType") entityType: string) {
    return this.codeRulesService.previewNextCode(entityType, scope.tenantId, scope.parkId);
  }

  @Post(":entityType/generate")
  @RequirePermissions(SYSTEM_PERMISSIONS.CODE_RULE_OPEN_GENERATE)
  @AuditLog({ module: "编码规则", resource: "system.code-rule", action: "生成编码", bizType: "code_rule" })
  generate(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("entityType") entityType: string) {
    return this.codeRulesService.generateCode(entityType, scope.tenantId, scope.parkId, user.sub);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.CODE_RULE_OPEN_READ)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.codeRulesService.detail(scope, id);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.CODE_RULE_OPEN_UPDATE)
  @AuditLog({ module: "编码规则", resource: "system.code-rule", action: "修改", bizType: "code_rule", bizIdParam: "id", captureBody: true })
  update(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdateCodeRuleDto) {
    return this.codeRulesService.update(scope, user.sub, id, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.CODE_RULE_OPEN_UPDATE)
  @AuditLog({ module: "编码规则", resource: "system.code-rule", action: "修改", bizType: "code_rule", bizIdParam: "id", captureBody: true })
  replace(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdateCodeRuleDto) {
    return this.codeRulesService.update(scope, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.CODE_RULE_DELETE)
  @AuditLog({ module: "编码规则", resource: "system.code-rule", action: "删除", bizType: "code_rule", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.codeRulesService.softDelete(scope, user.sub, id);
  }

  @Post(":id/preview")
  @RequirePermissions(SYSTEM_PERMISSIONS.CODE_RULE_OPEN_READ)
  preview(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.codeRulesService.preview(scope, id);
  }

  @Post(":ruleCode/next")
  @RequirePermissions(SYSTEM_PERMISSIONS.CODE_RULE_OPEN_GENERATE)
  @AuditLog({ module: "编码规则", resource: "system.code-rule", action: "生成编码", bizType: "code_rule" })
  next(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("ruleCode") ruleCode: string) {
    return this.codeRulesService.generateNext(scope, user.sub, ruleCode);
  }
}
