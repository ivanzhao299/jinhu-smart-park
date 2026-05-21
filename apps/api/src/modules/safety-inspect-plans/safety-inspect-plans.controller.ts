import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateSafetyInspectPlanDto } from "./dto/create-safety-inspect-plan.dto";
import { SafetyInspectPlanQueryDto } from "./dto/safety-inspect-plan-query.dto";
import { UpdateSafetyInspectPlanDto } from "./dto/update-safety-inspect-plan.dto";
import { SafetyInspectPlansService } from "./safety-inspect-plans.service";

@Controller("safety/inspect-plans")
@RequireModule("safety")
export class SafetyInspectPlansController {
  constructor(private readonly service: SafetyInspectPlansService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyInspectPlanQueryDto) {
    return this.service.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_CREATE)
  @AuditLog({ module: "安全巡检", action: "新增巡检计划", resource: "biz.safety_inspect_plan", bizType: "biz_safety_inspect_plan" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateSafetyInspectPlanDto) {
    return this.service.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_UPDATE)
  @AuditLog({ module: "安全巡检", action: "修改巡检计划", resource: "biz.safety_inspect_plan", bizType: "biz_safety_inspect_plan", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSafetyInspectPlanDto
  ) {
    return this.service.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_DELETE)
  @AuditLog({ module: "安全巡检", action: "删除巡检计划", resource: "biz.safety_inspect_plan", bizType: "biz_safety_inspect_plan", bizIdParam: "id" })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.softDelete(scope, user, id);
  }

  @Post(":id/enable")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_ENABLE)
  @AuditLog({ module: "安全巡检", action: "启用巡检计划", resource: "biz.safety_inspect_plan", bizType: "biz_safety_inspect_plan", bizIdParam: "id" })
  enable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.enable(scope, user, id);
  }

  @Post(":id/disable")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_DISABLE)
  @AuditLog({ module: "安全巡检", action: "停用巡检计划", resource: "biz.safety_inspect_plan", bizType: "biz_safety_inspect_plan", bizIdParam: "id" })
  disable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.disable(scope, user, id);
  }
}
