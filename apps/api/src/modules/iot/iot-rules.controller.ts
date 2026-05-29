import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateIotRuleDto } from "./dto/create-iot-rule.dto";
import { IotRuleExecutionLogQueryDto, IotRuleQueryDto } from "./dto/iot-rule-query.dto";
import { TestIotRuleDto } from "./dto/test-iot-rule.dto";
import { UpdateIotRuleDto } from "./dto/update-iot-rule.dto";
import { IotRuleEngineService } from "./iot-rule-engine.service";

@Controller("iot/rules")
@RequireModule("iot")
export class IotRulesController {
  constructor(private readonly ruleEngineService: IotRuleEngineService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_RULE_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: IotRuleQueryDto) {
    return this.ruleEngineService.list(scope, query, user);
  }

  @Get("execution-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_RULE_LOG_READ)
  executionLogs(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: IotRuleExecutionLogQueryDto) {
    return this.ruleEngineService.executionLogs(scope, query, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_RULE_CREATE)
  @AuditLog({ module: "IoT 平台", action: "新增规则", resource: "biz.iot_rule", bizType: "iot_rule" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateIotRuleDto) {
    return this.ruleEngineService.create(scope, user, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_RULE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.ruleEngineService.detail(scope, id, user);
  }

  @Get(":id/execution-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_RULE_LOG_READ)
  ruleExecutionLogs(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Query() query: IotRuleExecutionLogQueryDto
  ) {
    return this.ruleEngineService.executionLogs(scope, query, user, id);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_RULE_UPDATE)
  @AuditLog({ module: "IoT 平台", action: "修改规则", resource: "biz.iot_rule", bizType: "iot_rule", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateIotRuleDto
  ) {
    return this.ruleEngineService.update(scope, user, id, dto);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_RULE_UPDATE)
  @AuditLog({ module: "IoT 平台", action: "修改规则", resource: "biz.iot_rule", bizType: "iot_rule", bizIdParam: "id" })
  patch(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateIotRuleDto
  ) {
    return this.ruleEngineService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_RULE_DELETE)
  @AuditLog({ module: "IoT 平台", action: "删除规则", resource: "biz.iot_rule", bizType: "iot_rule", bizIdParam: "id" })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.ruleEngineService.softDelete(scope, user, id);
  }

  @Post(":id/enable")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_RULE_ENABLE)
  @AuditLog({ module: "IoT 平台", action: "启用规则", resource: "biz.iot_rule", bizType: "iot_rule", bizIdParam: "id" })
  enable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.ruleEngineService.enable(scope, user, id);
  }

  @Post(":id/disable")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_RULE_DISABLE)
  @AuditLog({ module: "IoT 平台", action: "停用规则", resource: "biz.iot_rule", bizType: "iot_rule", bizIdParam: "id" })
  disable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.ruleEngineService.disable(scope, user, id);
  }

  @Post(":id/test")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_RULE_TEST)
  @AuditLog({ module: "IoT 平台", action: "测试规则", resource: "biz.iot_rule", bizType: "iot_rule", bizIdParam: "id" })
  test(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: TestIotRuleDto
  ) {
    return this.ruleEngineService.test(scope, user, id, dto);
  }
}
