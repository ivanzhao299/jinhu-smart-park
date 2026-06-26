import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { Request } from "express";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  CreateEngineeringProjectDto,
  EngineeringProjectActionDto,
  EngineeringProjectQueryDto,
  UpdateEngineeringProjectDto
} from "./dto/engineering-project.dto";
import { EngineeringProjectRuntimeContext, EngineeringProjectService } from "./engineering-project.service";

@Controller("engineering/projects")
export class EngineeringProjectsController {
  constructor(private readonly engineeringProjectService: EngineeringProjectService) {}

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  @AuditLog({ module: "工程项目交付", resource: "engineering.project", action: "新增工程项目", bizType: "engineering_project" })
  create(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Body() dto: CreateEngineeringProjectDto
  ) {
    return this.engineeringProjectService.createProject(dto, this.context(scope, user, request));
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  list(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Query() query: EngineeringProjectQueryDto
  ) {
    return this.engineeringProjectService.paginateProjects(query, this.context(scope, user, request));
  }

  @Get(":id/actions")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  actions(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringProjectService.getAvailableActions(id, this.context(scope, user, request));
  }

  @Get(":id/status-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  statusLogs(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringProjectService.getStatusLogs(id, this.context(scope, user, request));
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringProjectService.getProjectDetail(id, this.context(scope, user, request));
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  @AuditLog({ module: "工程项目交付", resource: "engineering.project", action: "编辑工程项目", bizType: "engineering_project", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: UpdateEngineeringProjectDto
  ) {
    return this.engineeringProjectService.updateProject(id, dto, this.context(scope, user, request));
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  @AuditLog({ module: "工程项目交付", resource: "engineering.project", action: "删除工程项目", bizType: "engineering_project", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringProjectService.deleteProject(id, this.context(scope, user, request));
  }

  @Post(":id/actions/:action")
  @RequirePermissions(SYSTEM_PERMISSIONS.MODULE_OPEN_READ)
  @AuditLog({ module: "工程项目交付", resource: "engineering.project", action: "执行工程项目状态动作", bizType: "engineering_project", bizIdParam: "id" })
  executeAction(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() dto: EngineeringProjectActionDto
  ) {
    return this.engineeringProjectService.executeProjectAction(id, action, dto, this.context(scope, user, request));
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
