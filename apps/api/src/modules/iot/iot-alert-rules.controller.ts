import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateIotAlertRuleDto } from "./dto/create-iot-alert-rule.dto";
import { IotAlertRuleQueryDto } from "./dto/iot-alert-rule-query.dto";
import { UpdateIotAlertRuleDto } from "./dto/update-iot-alert-rule.dto";
import { IotAlertRulesService } from "./iot-alert-rules.service";

@Controller("iot/alert-rules")
@RequireModule("iot")
export class IotAlertRulesController {
  constructor(private readonly alertRulesService: IotAlertRulesService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_RULE_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: IotAlertRuleQueryDto) {
    return this.alertRulesService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_RULE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.alertRulesService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_RULE_CREATE)
  @AuditLog({ module: "IoT 平台", action: "新增", resource: "biz.iot_alert_rule", bizType: "biz_iot_alert_rule" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateIotAlertRuleDto) {
    return this.alertRulesService.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_RULE_UPDATE)
  @AuditLog({
    module: "IoT 平台",
    action: "修改",
    resource: "biz.iot_alert_rule",
    bizType: "biz_iot_alert_rule",
    bizIdParam: "id"
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateIotAlertRuleDto
  ) {
    return this.alertRulesService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_RULE_DELETE)
  @AuditLog({
    module: "IoT 平台",
    action: "删除",
    resource: "biz.iot_alert_rule",
    bizType: "biz_iot_alert_rule",
    bizIdParam: "id"
  })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.alertRulesService.softDelete(scope, user, id);
  }

  @Post(":id/enable")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_RULE_ENABLE)
  @AuditLog({
    module: "IoT 平台",
    action: "启用",
    resource: "biz.iot_alert_rule",
    bizType: "biz_iot_alert_rule",
    bizIdParam: "id"
  })
  enable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.alertRulesService.enable(scope, user, id);
  }

  @Post(":id/disable")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_RULE_DISABLE)
  @AuditLog({
    module: "IoT 平台",
    action: "停用",
    resource: "biz.iot_alert_rule",
    bizType: "biz_iot_alert_rule",
    bizIdParam: "id"
  })
  disable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.alertRulesService.disable(scope, user, id);
  }
}
