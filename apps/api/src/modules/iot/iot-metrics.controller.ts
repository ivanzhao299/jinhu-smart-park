import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateIotMetricDto } from "./dto/create-iot-metric.dto";
import { CreateIotPointDto } from "./dto/create-iot-point.dto";
import { IotMetricQueryDto } from "./dto/iot-metric-query.dto";
import { UpdateIotMetricDto } from "./dto/update-iot-metric.dto";
import { UpdateIotPointDto } from "./dto/update-iot-point.dto";
import { IotMetricsService } from "./iot-metrics.service";

@Controller()
@RequireModule("iot")
export class IotMetricsController {
  constructor(private readonly metricsService: IotMetricsService) {}

  @Get("iot/metrics")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_METRIC_READ)
  listMetrics(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: IotMetricQueryDto) {
    return this.metricsService.listMetrics(scope, query, user);
  }

  @Post("iot/metrics")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_METRIC_CREATE)
  @AuditLog({ module: "IoT 平台", action: "新增指标", resource: "biz.iot_metric", bizType: "biz_iot_metric" })
  createMetric(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateIotMetricDto) {
    return this.metricsService.createMetric(scope, user, dto);
  }

  @Put("iot/metrics/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_METRIC_UPDATE)
  @AuditLog({
    module: "IoT 平台",
    action: "编辑指标",
    resource: "biz.iot_metric",
    bizType: "biz_iot_metric",
    bizIdParam: "id"
  })
  updateMetric(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateIotMetricDto
  ) {
    return this.metricsService.updateMetric(scope, user, id, dto);
  }

  @Delete("iot/metrics/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_METRIC_DELETE)
  @AuditLog({
    module: "IoT 平台",
    action: "删除指标",
    resource: "biz.iot_metric",
    bizType: "biz_iot_metric",
    bizIdParam: "id"
  })
  deleteMetric(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.metricsService.deleteMetric(scope, user, id);
  }

  @Get("iot/devices/:deviceId/points")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_POINT_READ)
  listPoints(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("deviceId") deviceId: string) {
    return this.metricsService.listPoints(scope, user, deviceId);
  }

  @Post("iot/devices/:deviceId/points")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_POINT_CREATE)
  @AuditLog({ module: "IoT 平台", action: "新增点位", resource: "biz.iot_point", bizType: "biz_iot_point" })
  createPoint(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("deviceId") deviceId: string,
    @Body() dto: CreateIotPointDto
  ) {
    return this.metricsService.createPoint(scope, user, deviceId, dto);
  }

  @Put("iot/devices/:deviceId/points/:pointId")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_POINT_UPDATE)
  @AuditLog({
    module: "IoT 平台",
    action: "编辑点位",
    resource: "biz.iot_point",
    bizType: "biz_iot_point",
    bizIdParam: "pointId"
  })
  updatePoint(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("deviceId") deviceId: string,
    @Param("pointId") pointId: string,
    @Body() dto: UpdateIotPointDto
  ) {
    return this.metricsService.updatePoint(scope, user, deviceId, pointId, dto);
  }

  @Delete("iot/devices/:deviceId/points/:pointId")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_POINT_DELETE)
  @AuditLog({
    module: "IoT 平台",
    action: "删除点位",
    resource: "biz.iot_point",
    bizType: "biz_iot_point",
    bizIdParam: "pointId"
  })
  deletePoint(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("deviceId") deviceId: string,
    @Param("pointId") pointId: string
  ) {
    return this.metricsService.deletePoint(scope, user, deviceId, pointId);
  }
}
