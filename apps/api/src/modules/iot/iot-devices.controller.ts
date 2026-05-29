import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateIotDeviceDto } from "./dto/create-iot-device.dto";
import { IotDeviceHistoryQueryDto, IotDeviceTrendQueryDto } from "./dto/iot-device-data-query.dto";
import { IotDeviceQueryDto } from "./dto/iot-device-query.dto";
import { IotDeviceHeartbeatDto, IotDeviceMetricsDto, IotRuntimeHistoryQueryDto, IotRuntimeMetricsQueryDto } from "./dto/iot-device-runtime.dto";
import { UpdateIotDeviceDto } from "./dto/update-iot-device.dto";
import { UpdateIotDeviceStatusDto } from "./dto/update-iot-device-status.dto";
import { IotDevicesService } from "./iot-devices.service";
import { IotRuntimeService } from "./iot-runtime.service";

@Controller("iot/devices")
@RequireModule("iot")
export class IotDevicesController {
  constructor(
    private readonly devicesService: IotDevicesService,
    private readonly runtimeService: IotRuntimeService
  ) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: IotDeviceQueryDto) {
    return this.devicesService.list(scope, query, user);
  }

  @Get("latest-status")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_LATEST, SYSTEM_PERMISSIONS.IOT_DEVICE_READ)
  latestStatus(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: IotDeviceQueryDto) {
    return this.devicesService.latestStatus(scope, query, user);
  }

  @Get(":id/latest")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_LATEST, SYSTEM_PERMISSIONS.IOT_DEVICE_READ)
  latest(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.devicesService.latest(scope, id, user);
  }

  @Get(":id/history")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DATA_READ)
  history(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Query() query: IotDeviceHistoryQueryDto
  ) {
    return this.devicesService.history(scope, id, query, user);
  }

  @Get(":id/trend")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DATA_TREND)
  trend(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Query() query: IotDeviceTrendQueryDto
  ) {
    return this.devicesService.trend(scope, id, query, user);
  }

  @Post(":id/heartbeat")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_HEARTBEAT)
  heartbeat(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: IotDeviceHeartbeatDto
  ) {
    return this.runtimeService.recordHeartbeat(scope, user, id, dto);
  }

  @Get(":id/heartbeat-history")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_READ)
  heartbeatHistory(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Query() query: IotRuntimeHistoryQueryDto
  ) {
    return this.runtimeService.heartbeatHistory(scope, user, id, query);
  }

  @Post(":id/metrics")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_METRIC_REPORT)
  reportMetrics(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: IotDeviceMetricsDto
  ) {
    return this.runtimeService.reportMetrics(scope, user, id, dto);
  }

  @Get(":id/metrics")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DATA_READ)
  runtimeMetrics(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Query() query: IotRuntimeMetricsQueryDto
  ) {
    return this.runtimeService.metrics(scope, user, id, query);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.devicesService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_CREATE)
  @AuditLog({ module: "IoT 平台", action: "新增", resource: "biz.iot_device", bizType: "biz_iot_device" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateIotDeviceDto) {
    return this.devicesService.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_UPDATE)
  @AuditLog({
    module: "IoT 平台",
    action: "修改",
    resource: "biz.iot_device",
    bizType: "biz_iot_device",
    bizIdParam: "id"
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateIotDeviceDto
  ) {
    return this.devicesService.update(scope, user, id, dto);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_UPDATE)
  @AuditLog({
    module: "IoT 平台",
    action: "修改",
    resource: "biz.iot_device",
    bizType: "biz_iot_device",
    bizIdParam: "id"
  })
  patch(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateIotDeviceDto
  ) {
    return this.devicesService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_DELETE)
  @AuditLog({
    module: "IoT 平台",
    action: "删除",
    resource: "biz.iot_device",
    bizType: "biz_iot_device",
    bizIdParam: "id"
  })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.devicesService.softDelete(scope, user, id);
  }

  @Post(":id/enable")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_ENABLE)
  @AuditLog({
    module: "IoT 平台",
    action: "启用设备",
    resource: "biz.iot_device",
    bizType: "biz_iot_device",
    bizIdParam: "id"
  })
  enable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.devicesService.enable(scope, user, id);
  }

  @Post(":id/disable")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_DISABLE)
  @AuditLog({
    module: "IoT 平台",
    action: "停用设备",
    resource: "biz.iot_device",
    bizType: "biz_iot_device",
    bizIdParam: "id"
  })
  disable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.devicesService.disable(scope, user, id);
  }

  @Patch(":id/status")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_STATUS)
  @AuditLog({
    module: "IoT 平台",
    action: "修改设备状态",
    resource: "biz.iot_device",
    bizType: "biz_iot_device",
    bizIdParam: "id"
  })
  setStatus(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateIotDeviceStatusDto
  ) {
    return this.devicesService.setStatus(scope, user, id, dto.status);
  }

  @Post(":id/reset-secret")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_DEVICE_RESET_SECRET)
  @AuditLog({
    module: "IoT 平台",
    action: "重置设备密钥",
    resource: "biz.iot_device",
    bizType: "biz_iot_device",
    bizIdParam: "id",
    captureBody: false
  })
  resetSecret(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.devicesService.resetSecret(scope, user, id);
  }
}
