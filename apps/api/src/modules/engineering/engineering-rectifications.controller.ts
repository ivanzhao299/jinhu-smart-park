import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { Request } from "express";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  CreateEngineeringRectificationDto,
  EngineeringRectificationActionDto,
  EngineeringRectificationOverdueScanDto,
  EngineeringRectificationQueryDto,
  UpdateEngineeringRectificationDto
} from "./dto/engineering-rectification.dto";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import { EngineeringRectificationService } from "./engineering-rectification.service";

@Controller("engineering")
export class EngineeringRectificationsController {
  constructor(private readonly engineeringRectificationService: EngineeringRectificationService) {}

  @Post("rectifications")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  @AuditLog({ module: "工程项目交付", resource: "engineering.rectification", action: "新增工程整改", bizType: "engineering_rectification" })
  createRectification(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Body() dto: CreateEngineeringRectificationDto
  ) {
    return this.engineeringRectificationService.createRectification(dto, this.context(scope, user, request));
  }

  @Get("rectifications")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  listRectifications(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Query() query: EngineeringRectificationQueryDto
  ) {
    return this.engineeringRectificationService.paginateRectifications(query, this.context(scope, user, request));
  }

  @Post("rectifications/overdue-scan")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  @AuditLog({ module: "工程项目交付", resource: "engineering.rectification", action: "扫描逾期整改", bizType: "engineering_rectification" })
  scanOverdueRectifications(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Body() dto: EngineeringRectificationOverdueScanDto
  ) {
    return this.engineeringRectificationService.scanOverdueRectifications(dto, this.context(scope, user, request));
  }

  @Get("projects/:projectId/rectifications")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  projectRectifications(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("projectId") projectId: string
  ) {
    return this.engineeringRectificationService.getProjectRectifications(projectId, this.context(scope, user, request));
  }

  @Get("rectifications/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  rectificationDetail(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string
  ) {
    return this.engineeringRectificationService.getRectificationDetail(id, this.context(scope, user, request));
  }

  @Patch("rectifications/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.rectification",
    action: "编辑工程整改",
    bizType: "engineering_rectification",
    bizIdParam: "id"
  })
  updateRectification(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: UpdateEngineeringRectificationDto
  ) {
    return this.engineeringRectificationService.updateRectification(id, dto, this.context(scope, user, request));
  }

  @Post("rectifications/:id/actions")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.rectification",
    action: "执行工程整改动作",
    bizType: "engineering_rectification",
    bizIdParam: "id"
  })
  executeRectificationAction(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: EngineeringRectificationActionDto
  ) {
    return this.engineeringRectificationService.executeRectificationAction(id, dto, this.context(scope, user, request));
  }

  @Delete("rectifications/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.rectification",
    action: "删除工程整改",
    bizType: "engineering_rectification",
    bizIdParam: "id"
  })
  removeRectification(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string
  ) {
    return this.engineeringRectificationService.deleteRectification(id, this.context(scope, user, request));
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
