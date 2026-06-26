import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { Request } from "express";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireAnyPermissions, RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  CreateEngineeringPlanDto,
  EngineeringPlanQueryDto,
  UpdateEngineeringPlanDto,
  UpdateEngineeringPlanProgressDto,
  UpdateEngineeringPlanStatusDto
} from "./dto/engineering-plan.dto";
import { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import { EngineeringPlanService } from "./engineering-plan.service";

@Controller("engineering")
export class EngineeringPlansController {
  constructor(private readonly engineeringPlanService: EngineeringPlanService) {}

  @Post("plans")
  @RequirePermissions("ENGINEERING_PLAN_CREATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.plan", action: "新增工程计划", bizType: "engineering_plan" })
  create(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Body() dto: CreateEngineeringPlanDto
  ) {
    return this.engineeringPlanService.createPlan(dto, this.context(scope, user, request));
  }

  @Get("plans")
  @RequirePermissions("ENGINEERING_PLAN_VIEW")
  list(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Query() query: EngineeringPlanQueryDto
  ) {
    return this.engineeringPlanService.paginatePlans(query, this.context(scope, user, request));
  }

  @Get("projects/:projectId/plans")
  @RequirePermissions("ENGINEERING_PLAN_VIEW")
  projectPlans(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("projectId") projectId: string
  ) {
    return this.engineeringPlanService.getProjectPlans(projectId, this.context(scope, user, request));
  }

  @Get("plans/:id")
  @RequirePermissions("ENGINEERING_PLAN_VIEW")
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringPlanService.getPlanDetail(id, this.context(scope, user, request));
  }

  @Patch("plans/:id")
  @RequirePermissions("ENGINEERING_PLAN_UPDATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.plan", action: "编辑工程计划", bizType: "engineering_plan", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: UpdateEngineeringPlanDto
  ) {
    return this.engineeringPlanService.updatePlan(id, dto, this.context(scope, user, request));
  }

  @Delete("plans/:id")
  @RequirePermissions("ENGINEERING_PLAN_UPDATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.plan", action: "删除工程计划", bizType: "engineering_plan", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringPlanService.deletePlan(id, this.context(scope, user, request));
  }

  @Patch("plans/:id/progress")
  @RequirePermissions("ENGINEERING_PLAN_UPDATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.plan", action: "更新工程计划进度", bizType: "engineering_plan", bizIdParam: "id" })
  updateProgress(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: UpdateEngineeringPlanProgressDto
  ) {
    return this.engineeringPlanService.updateProgress(id, dto, this.context(scope, user, request));
  }

  @Patch("plans/:id/status")
  @RequireAnyPermissions("ENGINEERING_PLAN_UPDATE", "ENGINEERING_PLAN_APPROVE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.plan", action: "更新工程计划状态", bizType: "engineering_plan", bizIdParam: "id" })
  updateStatus(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: UpdateEngineeringPlanStatusDto
  ) {
    return this.engineeringPlanService.updateStatus(id, dto, this.context(scope, user, request));
  }

  private context(scope: TenantParkScope, user: JwtPrincipal, request: Request): EngineeringProjectRuntimeContext {
    return {
      ...scope,
      actor: user,
      requestId: typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : null,
      ip: request.ip ?? null,
      userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null
    };
  }
}
