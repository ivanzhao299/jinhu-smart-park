import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateIotAlertDto } from "./dto/create-iot-alert.dto";
import { IotAlertActionDto } from "./dto/iot-alert-action.dto";
import { IotAlertQueryDto } from "./dto/iot-alert-query.dto";
import { IotAlertWorkOrderDto } from "./dto/iot-alert-work-order.dto";
import { IotAlertsService } from "./iot-alerts.service";

@Controller("iot/alerts")
@RequireModule("iot")
export class IotAlertsController {
  constructor(private readonly alertsService: IotAlertsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: IotAlertQueryDto) {
    return this.alertsService.list(scope, query, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_CREATE)
  @AuditLog({ module: "IoT 平台", action: "新增告警", resource: "biz.iot_alert", bizType: "biz_iot_alert" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateIotAlertDto) {
    return this.alertsService.create(scope, user, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.alertsService.detail(scope, id, user);
  }

  @Post(":id/acknowledge")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_ACKNOWLEDGE)
  @AuditLog({
    module: "IoT 平台",
    action: "确认",
    resource: "biz.iot_alert",
    bizType: "biz_iot_alert",
    bizIdParam: "id"
  })
  acknowledge(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: IotAlertActionDto
  ) {
    return this.alertsService.acknowledge(scope, user, id, dto);
  }

  @Post(":id/process")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_PROCESS)
  @AuditLog({
    module: "IoT 平台",
    action: "处理",
    resource: "biz.iot_alert",
    bizType: "biz_iot_alert",
    bizIdParam: "id"
  })
  process(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: IotAlertActionDto
  ) {
    return this.alertsService.process(scope, user, id, dto);
  }

  @Post(":id/resolve")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_RESOLVE)
  @AuditLog({
    module: "IoT 平台",
    action: "解除",
    resource: "biz.iot_alert",
    bizType: "biz_iot_alert",
    bizIdParam: "id"
  })
  resolve(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: IotAlertActionDto
  ) {
    return this.alertsService.resolve(scope, user, id, dto);
  }

  @Post(":id/close")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_CLOSE)
  @AuditLog({
    module: "IoT 平台",
    action: "关闭",
    resource: "biz.iot_alert",
    bizType: "biz_iot_alert",
    bizIdParam: "id"
  })
  close(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: IotAlertActionDto
  ) {
    return this.alertsService.close(scope, user, id, dto);
  }

  @Post(":id/ignore")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_IGNORE)
  @AuditLog({
    module: "IoT 平台",
    action: "忽略",
    resource: "biz.iot_alert",
    bizType: "biz_iot_alert",
    bizIdParam: "id"
  })
  ignore(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: IotAlertActionDto
  ) {
    return this.alertsService.ignore(scope, user, id, dto);
  }

  @Post(":id/create-work-order")
  @RequireModule("iot", "workorder")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_CREATE_WORKORDER, SYSTEM_PERMISSIONS.WORKORDER_CREATE)
  @AuditLog({
    module: "IoT 平台",
    action: "告警转工单",
    resource: "biz.iot_alert",
    bizType: "biz_iot_alert",
    bizIdParam: "id"
  })
  createWorkOrder(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: IotAlertWorkOrderDto
  ) {
    return this.alertsService.createWorkOrder(scope, user, id, dto);
  }

  @Get(":id/logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_ALERT_LOG_READ)
  logs(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.alertsService.logs(scope, id, user);
  }
}
