import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { Request } from "express";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  CreateEngineeringAcceptanceDto,
  EngineeringAcceptanceQueryDto,
  ReviewEngineeringAcceptanceDto,
  UpdateEngineeringAcceptanceDto
} from "./dto/engineering-acceptance.dto";
import { EngineeringAcceptanceService } from "./engineering-acceptance.service";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";

@Controller("engineering")
export class EngineeringAcceptancesController {
  constructor(private readonly engineeringAcceptanceService: EngineeringAcceptanceService) {}

  @Post("acceptances")
  @RequirePermissions("ENGINEERING_ACCEPTANCE_CREATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.acceptance", action: "新增工程验收", bizType: "engineering_acceptance" })
  create(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Body() dto: CreateEngineeringAcceptanceDto
  ) {
    return this.engineeringAcceptanceService.createAcceptance(dto, this.context(scope, user, request));
  }

  @Get("acceptances")
  @RequirePermissions("ENGINEERING_ACCEPTANCE_VIEW")
  list(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Query() query: EngineeringAcceptanceQueryDto
  ) {
    return this.engineeringAcceptanceService.paginateAcceptances(query, this.context(scope, user, request));
  }

  @Get("projects/:projectId/acceptances")
  @RequirePermissions("ENGINEERING_ACCEPTANCE_VIEW")
  projectAcceptances(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("projectId") projectId: string
  ) {
    return this.engineeringAcceptanceService.getProjectAcceptances(projectId, this.context(scope, user, request));
  }

  @Get("acceptances/:id")
  @RequirePermissions("ENGINEERING_ACCEPTANCE_VIEW")
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringAcceptanceService.getAcceptanceDetail(id, this.context(scope, user, request));
  }

  @Patch("acceptances/:id")
  @RequirePermissions("ENGINEERING_ACCEPTANCE_UPDATE")
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.acceptance",
    action: "编辑工程验收",
    bizType: "engineering_acceptance",
    bizIdParam: "id"
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: UpdateEngineeringAcceptanceDto
  ) {
    return this.engineeringAcceptanceService.updateAcceptance(id, dto, this.context(scope, user, request));
  }

  @Delete("acceptances/:id")
  @RequirePermissions("ENGINEERING_ACCEPTANCE_UPDATE")
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.acceptance",
    action: "删除工程验收",
    bizType: "engineering_acceptance",
    bizIdParam: "id"
  })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringAcceptanceService.deleteAcceptance(id, this.context(scope, user, request));
  }

  @Post("acceptances/:id/submit")
  @RequirePermissions("ENGINEERING_ACCEPTANCE_SUBMIT")
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.acceptance",
    action: "提交工程验收",
    bizType: "engineering_acceptance",
    bizIdParam: "id"
  })
  submit(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringAcceptanceService.submitAcceptance(id, this.context(scope, user, request));
  }

  @Post("acceptances/:id/review")
  @RequirePermissions("ENGINEERING_ACCEPTANCE_REVIEW")
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.acceptance",
    action: "评审工程验收",
    bizType: "engineering_acceptance",
    bizIdParam: "id"
  })
  review(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: ReviewEngineeringAcceptanceDto
  ) {
    return this.engineeringAcceptanceService.reviewAcceptance(id, dto, this.context(scope, user, request));
  }

  @Post("acceptances/:id/close")
  @RequirePermissions("ENGINEERING_ACCEPTANCE_CLOSE")
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.acceptance",
    action: "关闭工程验收",
    bizType: "engineering_acceptance",
    bizIdParam: "id"
  })
  close(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringAcceptanceService.closeAcceptance(id, this.context(scope, user, request));
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
