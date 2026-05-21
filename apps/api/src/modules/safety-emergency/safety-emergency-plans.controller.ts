import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateSafetyEmergencyPlanDto } from "./dto/create-safety-emergency-plan.dto";
import { SafetyEmergencyPlanQueryDto } from "./dto/safety-emergency-plan-query.dto";
import { UpdateSafetyEmergencyPlanDto } from "./dto/update-safety-emergency-plan.dto";
import { SafetyEmergencyService } from "./safety-emergency.service";

@Controller("safety/emergency-plans")
@RequireModule("safety")
export class SafetyEmergencyPlansController {
  constructor(private readonly service: SafetyEmergencyService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_PLAN_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyEmergencyPlanQueryDto) {
    return this.service.listPlans(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_PLAN_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.planDetail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_PLAN_CREATE)
  @AuditLog({ module: "安全应急", action: "新增", resource: "biz.safety_emergency_plan", bizType: "biz_safety_emergency_plan" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateSafetyEmergencyPlanDto) {
    return this.service.createPlan(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_PLAN_UPDATE)
  @AuditLog({
    module: "安全应急",
    action: "修改",
    resource: "biz.safety_emergency_plan",
    bizType: "biz_safety_emergency_plan",
    bizIdParam: "id"
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSafetyEmergencyPlanDto
  ) {
    return this.service.updatePlan(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_PLAN_DELETE)
  @AuditLog({
    module: "安全应急",
    action: "删除",
    resource: "biz.safety_emergency_plan",
    bizType: "biz_safety_emergency_plan",
    bizIdParam: "id"
  })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.softDeletePlan(scope, user, id);
  }
}
