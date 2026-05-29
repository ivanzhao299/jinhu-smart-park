import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import {
  CreateSceneInstanceDto,
  CreateSceneTemplateDto,
  SceneExecutionLogQueryDto,
  SceneQueryDto,
  TriggerSceneDto,
  UpdateSceneInstanceDto,
  UpdateSceneTemplateDto
} from "./dto/scene.dto";
import { SceneExecutionService } from "./scene-execution.service";
import { SceneInstancesService } from "./scene-instances.service";
import { SceneTemplatesService } from "./scene-templates.service";

@Controller("iot/scenes")
@RequireModule("iot")
export class IotScenesController {
  constructor(
    private readonly templatesService: SceneTemplatesService,
    private readonly instancesService: SceneInstancesService,
    private readonly executionService: SceneExecutionService
  ) {}

  @Get("templates")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_TEMPLATE_READ)
  listTemplates(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SceneQueryDto) {
    return this.templatesService.list(scope, query, user);
  }

  @Post("templates")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_TEMPLATE_MANAGE)
  @AuditLog({ module: "IoT 平台", action: "新增场景模板", resource: "biz.scene_template", bizType: "scene_template" })
  createTemplate(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateSceneTemplateDto) {
    return this.templatesService.create(scope, user, dto);
  }

  @Get("templates/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_TEMPLATE_READ)
  templateDetail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.templatesService.detail(scope, id, user);
  }

  @Put("templates/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_TEMPLATE_MANAGE)
  @AuditLog({ module: "IoT 平台", action: "修改场景模板", resource: "biz.scene_template", bizType: "scene_template", bizIdParam: "id" })
  updateTemplate(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSceneTemplateDto
  ) {
    return this.templatesService.update(scope, user, id, dto);
  }

  @Patch("templates/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_TEMPLATE_MANAGE)
  @AuditLog({ module: "IoT 平台", action: "修改场景模板", resource: "biz.scene_template", bizType: "scene_template", bizIdParam: "id" })
  patchTemplate(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSceneTemplateDto
  ) {
    return this.templatesService.update(scope, user, id, dto);
  }

  @Delete("templates/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_TEMPLATE_MANAGE)
  @AuditLog({ module: "IoT 平台", action: "删除场景模板", resource: "biz.scene_template", bizType: "scene_template", bizIdParam: "id" })
  deleteTemplate(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.templatesService.softDelete(scope, user, id);
  }

  @Get("instances")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_READ)
  listInstances(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SceneQueryDto) {
    return this.instancesService.list(scope, query, user);
  }

  @Post("instances")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_CREATE)
  @AuditLog({ module: "IoT 平台", action: "新增场景实例", resource: "biz.scene_instance", bizType: "scene_instance" })
  createInstance(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateSceneInstanceDto) {
    return this.instancesService.create(scope, user, dto);
  }

  @Get("instances/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_READ)
  instanceDetail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.instancesService.detail(scope, id, user);
  }

  @Put("instances/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_UPDATE)
  @AuditLog({ module: "IoT 平台", action: "修改场景实例", resource: "biz.scene_instance", bizType: "scene_instance", bizIdParam: "id" })
  updateInstance(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSceneInstanceDto
  ) {
    return this.instancesService.update(scope, user, id, dto);
  }

  @Patch("instances/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_UPDATE)
  @AuditLog({ module: "IoT 平台", action: "修改场景实例", resource: "biz.scene_instance", bizType: "scene_instance", bizIdParam: "id" })
  patchInstance(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSceneInstanceDto
  ) {
    return this.instancesService.update(scope, user, id, dto);
  }

  @Delete("instances/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_DELETE)
  @AuditLog({ module: "IoT 平台", action: "删除场景实例", resource: "biz.scene_instance", bizType: "scene_instance", bizIdParam: "id" })
  deleteInstance(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.instancesService.softDelete(scope, user, id);
  }

  @Post("instances/:id/enable")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_ENABLE)
  @AuditLog({ module: "IoT 平台", action: "启用场景", resource: "biz.scene_instance", bizType: "scene_instance", bizIdParam: "id" })
  enableInstance(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.instancesService.enable(scope, user, id);
  }

  @Post("instances/:id/disable")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_DISABLE)
  @AuditLog({ module: "IoT 平台", action: "停用场景", resource: "biz.scene_instance", bizType: "scene_instance", bizIdParam: "id" })
  disableInstance(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.instancesService.disable(scope, user, id);
  }

  @Post("instances/:id/trigger")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_TRIGGER)
  @AuditLog({ module: "IoT 平台", action: "手动触发场景", resource: "biz.scene_instance", bizType: "scene_instance", bizIdParam: "id" })
  triggerInstance(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: TriggerSceneDto) {
    return this.executionService.trigger(scope, user, id, dto);
  }

  @Get("instances/:id/execution-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.IOT_SCENE_LOG_READ)
  executionLogs(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Query() query: SceneExecutionLogQueryDto
  ) {
    return this.executionService.logs(scope, user, id, query);
  }
}
