import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateIotProtocolConfigDto } from "./dto/create-iot-protocol-config.dto";
import { IotProtocolConfigQueryDto } from "./dto/iot-protocol-config-query.dto";
import { UpdateIotProtocolConfigDto } from "./dto/update-iot-protocol-config.dto";
import { IotProtocolConfigsService } from "./iot-protocol-configs.service";

@Controller("iot/protocol-configs")
@RequireModule("iot")
export class IotProtocolConfigsController {
  constructor(private readonly protocolConfigsService: IotProtocolConfigsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_PROTOCOL_CONFIG_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: IotProtocolConfigQueryDto) {
    return this.protocolConfigsService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_PROTOCOL_CONFIG_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.protocolConfigsService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_PROTOCOL_CONFIG_CREATE)
  @AuditLog({ module: "IoT 平台", action: "新增协议配置", resource: "biz.iot_protocol_config", bizType: "iot_protocol_config", captureBody: false })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateIotProtocolConfigDto) {
    return this.protocolConfigsService.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_PROTOCOL_CONFIG_UPDATE)
  @AuditLog({
    module: "IoT 平台",
    action: "编辑协议配置",
    resource: "biz.iot_protocol_config",
    bizType: "iot_protocol_config",
    bizIdParam: "id",
    captureBody: false
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateIotProtocolConfigDto
  ) {
    return this.protocolConfigsService.update(scope, user, id, dto);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_PROTOCOL_CONFIG_UPDATE)
  @AuditLog({
    module: "IoT 平台",
    action: "编辑协议配置",
    resource: "biz.iot_protocol_config",
    bizType: "iot_protocol_config",
    bizIdParam: "id",
    captureBody: false
  })
  patch(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateIotProtocolConfigDto
  ) {
    return this.protocolConfigsService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_PROTOCOL_CONFIG_DELETE)
  @AuditLog({
    module: "IoT 平台",
    action: "删除协议配置",
    resource: "biz.iot_protocol_config",
    bizType: "iot_protocol_config",
    bizIdParam: "id",
    captureBody: false
  })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.protocolConfigsService.softDelete(scope, user, id);
  }
}
