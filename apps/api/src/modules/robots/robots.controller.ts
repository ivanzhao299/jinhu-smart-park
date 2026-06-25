import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { Public } from "../../shared/decorators/public.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { EzvizConfigDto } from "./dto/ezviz-config.dto";
import { EzvizDeviceAddDto, EzvizDeviceSyncDto } from "./dto/ezviz-device-sync.dto";
import {
  RobotCallbackDto,
  RobotCleanControlDto,
  RobotCleanModeDto,
  RobotCommandDryRunDto,
  RobotRegionCleanDto,
  RobotTempRegionCleanDto
} from "./dto/robot-control.dto";
import { RobotLocalRegisterDto } from "./dto/robot-local-register.dto";
import { RobotQueryDto } from "./dto/robot-query.dto";
import { RobotsService } from "./robots.service";

@Controller("robots")
@RequireModule("robot")
export class RobotsController {
  constructor(private readonly robotsService: RobotsService) {}

  @Get("cleaning")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_READ)
  listCleaningRobots(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: RobotQueryDto) {
    return this.robotsService.listCleaningRobots(scope, query, user);
  }

  @Get("cleaning/ezviz-configs")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_READ)
  listEzvizConfigs(@CurrentScope() scope: TenantParkScope) {
    return this.robotsService.listEzvizConfigs(scope);
  }

  @Post("cleaning/ezviz-configs")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE)
  @AuditLog({ module: "机器人运营", action: "保存萤石清洁机器人配置", resource: "biz.robot_config", bizType: "iot_protocol_config" })
  upsertEzvizConfig(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: EzvizConfigDto) {
    return this.robotsService.upsertEzvizConfig(scope, user, dto);
  }

  @Post("cleaning/ezviz-configs/:id/refresh-token")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE)
  @AuditLog({ module: "机器人运营", action: "刷新萤石 AccessToken", resource: "biz.robot_config", bizType: "iot_protocol_config", bizIdParam: "id" })
  refreshEzvizConfigToken(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.robotsService.refreshEzvizAccessToken(scope, id);
  }

  @Get("cleaning/ezviz-devices")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_READ)
  listEzvizPlatformDevices(@CurrentScope() scope: TenantParkScope) {
    return this.robotsService.listEzvizPlatformDevices(scope);
  }

  @Post("cleaning/ezviz-devices/sync")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE)
  @AuditLog({ module: "机器人运营", action: "同步萤石清洁机器人", resource: "biz.robot", bizType: "biz_iot_device" })
  syncEzvizDevice(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: EzvizDeviceSyncDto) {
    return this.robotsService.syncEzvizDevice(scope, user, dto);
  }

  @Post("cleaning/ezviz-devices/add")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE)
  @AuditLog({ module: "机器人运营", action: "添加并同步萤石清洁机器人", resource: "biz.robot", bizType: "biz_iot_device" })
  addEzvizDevice(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: EzvizDeviceAddDto) {
    return this.robotsService.addEzvizPlatformDevice(scope, user, dto);
  }

  @Post("cleaning/register-local")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE)
  @AuditLog({ module: "机器人运营", action: "登记本地清洁机器人", resource: "biz.robot", bizType: "biz_iot_device", captureBody: false })
  registerLocalRobot(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: RobotLocalRegisterDto) {
    return this.robotsService.registerLocalRobot(scope, user, dto);
  }

  @Get("cleaning/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.robotsService.detail(scope, id, user);
  }

  @Get("cleaning/:id/command-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_COMMAND_LOG_READ)
  commandLogs(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Query() query: RobotQueryDto) {
    return this.robotsService.listCommandLogs(scope, user, id, query);
  }

  @Post("cleaning/:id/query-task")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_CONTROL)
  @AuditLog({ module: "机器人运营", action: "查询清洁机器人任务", resource: "biz.robot", bizType: "biz_iot_device", bizIdParam: "id" })
  queryTask(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.robotsService.queryTask(scope, user, id);
  }

  @Post("cleaning/:id/command-dry-run")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_CONTROL)
  @AuditLog({ module: "机器人运营", action: "清洁机器人指令演练", resource: "biz.robot", bizType: "biz_iot_device", bizIdParam: "id", captureBody: false })
  commandDryRun(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RobotCommandDryRunDto
  ) {
    return this.robotsService.commandDryRun(scope, user, id, dto);
  }

  @Post("cleaning/:id/sync-info")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE)
  @AuditLog({ module: "机器人运营", action: "刷新清洁机器人详情", resource: "biz.robot", bizType: "biz_iot_device", bizIdParam: "id" })
  syncInfo(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.robotsService.refreshEzvizDeviceInfo(scope, user, id);
  }

  @Post("cleaning/:id/clean-control")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_CONTROL)
  @AuditLog({ module: "机器人运营", action: "控制清洁机器人", resource: "biz.robot", bizType: "biz_iot_device", bizIdParam: "id" })
  cleanControl(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RobotCleanControlDto
  ) {
    return this.robotsService.cleanControl(scope, user, id, dto);
  }

  @Post("cleaning/:id/set-clean-mode")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_CONTROL)
  @AuditLog({ module: "机器人运营", action: "设置清洁模式", resource: "biz.robot", bizType: "biz_iot_device", bizIdParam: "id" })
  setCleanMode(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RobotCleanModeDto
  ) {
    return this.robotsService.setCleanMode(scope, user, id, dto);
  }

  @Get("cleaning/:id/path")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_READ)
  queryPath(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Query("map_id") mapId: string) {
    return this.robotsService.queryPath(scope, user, id, mapId);
  }

  @Post("cleaning/:id/start-region-clean")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_CONTROL)
  @AuditLog({ module: "机器人运营", action: "开始区域清洁", resource: "biz.robot", bizType: "biz_iot_device", bizIdParam: "id" })
  startRegionClean(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RobotRegionCleanDto
  ) {
    return this.robotsService.startRegionClean(scope, user, id, dto);
  }

  @Post("cleaning/:id/start-temp-region-clean")
  @RequirePermissions(SYSTEM_PERMISSIONS.ROBOT_CONTROL)
  @AuditLog({ module: "机器人运营", action: "开始临时区域清洁", resource: "biz.robot", bizType: "biz_iot_device", bizIdParam: "id" })
  startTempRegionClean(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RobotTempRegionCleanDto
  ) {
    return this.robotsService.startTempRegionClean(scope, user, id, dto);
  }

  @Post("ezviz/callback")
  @Public()
  handleEzvizCallback(@Headers("x-ezviz-callback-token") token: string | undefined, @Body() dto: RobotCallbackDto) {
    return this.robotsService.handleEzvizCallback(token, dto);
  }
}
