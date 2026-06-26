import { Controller, Get, Req } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { Request } from "express";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { EngineeringDashboardService } from "./engineering-dashboard.service";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";

@Controller("engineering/dashboard")
export class EngineeringDashboardController {
  constructor(private readonly dashboardService: EngineeringDashboardService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  overview(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request) {
    return this.dashboardService.overview(this.context(scope, user, request));
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
