import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AssignTenantModuleDto } from "./dto/assign-tenant-module.dto";
import { CreateModuleDto } from "./dto/create-module.dto";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { UpdateModuleDto } from "./dto/update-module.dto";
import { UpdatePlanDto } from "./dto/update-plan.dto";
import { SaaSModulesService } from "./saas-modules.service";

@Controller()
export class SaaSModulesController {
  constructor(private readonly modulesService: SaaSModulesService) {}

  @Get("modules")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  listStandardModules(@Query() query: PaginationQueryDto) {
    return this.modulesService.listStandardModules(query);
  }

  @Get("platform-modules")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  listModules(@CurrentScope() scope: TenantParkScope, @Query() query: PaginationQueryDto) {
    return this.modulesService.listModules(scope, query);
  }

  @Post("platform-modules")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_MANAGE)
  @AuditLog({ module: "模块授权", resource: "system.module", action: "新增模块", captureBody: true })
  createModule(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateModuleDto) {
    return this.modulesService.createModule(scope, user.sub, dto);
  }

  @Patch("platform-modules/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_MANAGE)
  @AuditLog({ module: "模块授权", resource: "system.module", action: "修改模块", bizType: "module", bizIdParam: "id", captureBody: true })
  updateModule(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdateModuleDto) {
    return this.modulesService.updateModule(scope, user.sub, id, dto);
  }

  @Get("plans")
  @RequirePermissions(SYSTEM_PERMISSIONS.PLAN_OPEN_READ)
  listPlans(@CurrentScope() scope: TenantParkScope, @Query() query: PaginationQueryDto) {
    return this.modulesService.listPlans(scope, query);
  }

  @Post("plans")
  @RequirePermissions(SYSTEM_PERMISSIONS.PLAN_MANAGE)
  @AuditLog({ module: "套餐管理", resource: "system.plan", action: "新增套餐", captureBody: true })
  createPlan(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreatePlanDto) {
    return this.modulesService.createPlan(scope, user.sub, dto);
  }

  @Patch("plans/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PLAN_MANAGE)
  @AuditLog({ module: "套餐管理", resource: "system.plan", action: "修改套餐", bizType: "plan", bizIdParam: "id", captureBody: true })
  updatePlan(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdatePlanDto) {
    return this.modulesService.updatePlan(scope, user.sub, id, dto);
  }

  @Get("tenant-modules")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MODULE_OPEN_READ)
  listTenantModules(@CurrentScope() scope: TenantParkScope, @Query() query: PaginationQueryDto) {
    return this.modulesService.listTenantModules(scope, query);
  }

  @Post("tenant-modules")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MODULE_MANAGE)
  @AuditLog({ module: "租户模块授权", resource: "system.tenant-module", action: "授权模块", captureBody: true })
  assignTenantModule(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: AssignTenantModuleDto) {
    return this.modulesService.assignTenantModule(scope, user.sub, dto);
  }

  @Post("tenant-modules/:moduleId/enable")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MODULE_MANAGE)
  @AuditLog({ module: "租户模块授权", resource: "system.tenant-module", action: "启用模块", bizType: "tenant_module", bizIdParam: "moduleId" })
  enableTenantModule(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("moduleId") moduleId: string) {
    return this.modulesService.enableTenantModule(scope, user.sub, moduleId);
  }

  @Post("tenant-modules/:moduleId/disable")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MODULE_MANAGE)
  @AuditLog({ module: "租户模块授权", resource: "system.tenant-module", action: "停用模块", bizType: "tenant_module", bizIdParam: "moduleId" })
  disableTenantModule(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("moduleId") moduleId: string) {
    return this.modulesService.disableTenantModule(scope, user.sub, moduleId);
  }
}
