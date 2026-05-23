import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateIotGatewayDto } from "./dto/create-iot-gateway.dto";
import { IotGatewayQueryDto } from "./dto/iot-gateway-query.dto";
import { UpdateIotGatewayDto } from "./dto/update-iot-gateway.dto";
import { IotGatewaysService } from "./iot-gateways.service";

@Controller("iot/gateways")
@RequireModule("iot")
export class IotGatewaysController {
  constructor(private readonly gatewaysService: IotGatewaysService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_GATEWAY_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: IotGatewayQueryDto) {
    return this.gatewaysService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_GATEWAY_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.gatewaysService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_GATEWAY_CREATE)
  @AuditLog({ module: "IoT 平台", action: "新增", resource: "biz.iot_gateway", bizType: "biz_iot_gateway" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateIotGatewayDto) {
    return this.gatewaysService.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_GATEWAY_UPDATE)
  @AuditLog({
    module: "IoT 平台",
    action: "修改",
    resource: "biz.iot_gateway",
    bizType: "biz_iot_gateway",
    bizIdParam: "id"
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateIotGatewayDto
  ) {
    return this.gatewaysService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_GATEWAY_DELETE)
  @AuditLog({
    module: "IoT 平台",
    action: "删除",
    resource: "biz.iot_gateway",
    bizType: "biz_iot_gateway",
    bizIdParam: "id"
  })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.gatewaysService.softDelete(scope, user, id);
  }

  @Post(":id/test-connection")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_GATEWAY_TEST)
  @AuditLog({
    module: "IoT 平台",
    action: "测试连接",
    resource: "biz.iot_gateway",
    bizType: "biz_iot_gateway",
    bizIdParam: "id",
    captureBody: false
  })
  testConnection(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.gatewaysService.testConnection(scope, id, user);
  }
}
