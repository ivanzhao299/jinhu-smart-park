import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { Request } from "express";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  CreateEngineeringInspectionDto,
  CreateEngineeringIssueDto,
  EngineeringInspectionQueryDto,
  EngineeringIssueQueryDto,
  GenerateEngineeringRectificationDto,
  UpdateEngineeringInspectionDto,
  UpdateEngineeringIssueDto
} from "./dto/engineering-inspection.dto";
import { EngineeringInspectionService } from "./engineering-inspection.service";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";

@Controller("engineering")
export class EngineeringInspectionsController {
  constructor(private readonly engineeringInspectionService: EngineeringInspectionService) {}

  @Post("inspections")
  @RequirePermissions("ENGINEERING_INSPECTION_CREATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.inspection", action: "新增工程巡检", bizType: "engineering_inspection" })
  createInspection(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Body() dto: CreateEngineeringInspectionDto
  ) {
    return this.engineeringInspectionService.createInspection(dto, this.context(scope, user, request));
  }

  @Get("inspections")
  @RequirePermissions("ENGINEERING_INSPECTION_VIEW")
  listInspections(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Query() query: EngineeringInspectionQueryDto
  ) {
    return this.engineeringInspectionService.paginateInspections(query, this.context(scope, user, request));
  }

  @Get("projects/:projectId/inspections")
  @RequirePermissions("ENGINEERING_INSPECTION_VIEW")
  projectInspections(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("projectId") projectId: string
  ) {
    return this.engineeringInspectionService.getProjectInspections(projectId, this.context(scope, user, request));
  }

  @Get("inspections/:id")
  @RequirePermissions("ENGINEERING_INSPECTION_VIEW")
  inspectionDetail(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string
  ) {
    return this.engineeringInspectionService.getInspectionDetail(id, this.context(scope, user, request));
  }

  @Patch("inspections/:id")
  @RequirePermissions("ENGINEERING_INSPECTION_UPDATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.inspection", action: "编辑工程巡检", bizType: "engineering_inspection", bizIdParam: "id" })
  updateInspection(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: UpdateEngineeringInspectionDto
  ) {
    return this.engineeringInspectionService.updateInspection(id, dto, this.context(scope, user, request));
  }

  @Delete("inspections/:id")
  @RequirePermissions("ENGINEERING_INSPECTION_UPDATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.inspection", action: "删除工程巡检", bizType: "engineering_inspection", bizIdParam: "id" })
  removeInspection(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string
  ) {
    return this.engineeringInspectionService.deleteInspection(id, this.context(scope, user, request));
  }

  @Post("inspections/:id/submit")
  @RequirePermissions("ENGINEERING_INSPECTION_SUBMIT")
  @AuditLog({ module: "工程项目交付", resource: "engineering.inspection", action: "提交工程巡检", bizType: "engineering_inspection", bizIdParam: "id" })
  submitInspection(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string
  ) {
    return this.engineeringInspectionService.submitInspection(id, this.context(scope, user, request));
  }

  @Post("inspections/:id/issues")
  @RequirePermissions("ENGINEERING_INSPECTION_UPDATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.issue", action: "新增巡检问题", bizType: "engineering_issue" })
  createInspectionIssue(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: CreateEngineeringIssueDto
  ) {
    return this.engineeringInspectionService.createInspectionIssue(id, dto, this.context(scope, user, request));
  }

  @Get("inspections/:id/issues")
  @RequirePermissions("ENGINEERING_INSPECTION_VIEW")
  inspectionIssues(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string
  ) {
    return this.engineeringInspectionService.getInspectionIssues(id, this.context(scope, user, request));
  }

  @Post("issues")
  @RequirePermissions("ENGINEERING_INSPECTION_UPDATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.issue", action: "新增工程问题", bizType: "engineering_issue" })
  createIssue(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Body() dto: CreateEngineeringIssueDto
  ) {
    return this.engineeringInspectionService.createIssue(dto, this.context(scope, user, request));
  }

  @Get("issues")
  @RequirePermissions("ENGINEERING_INSPECTION_VIEW")
  listIssues(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Query() query: EngineeringIssueQueryDto
  ) {
    return this.engineeringInspectionService.paginateIssues(query, this.context(scope, user, request));
  }

  @Get("issues/:id")
  @RequirePermissions("ENGINEERING_INSPECTION_VIEW")
  issueDetail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringInspectionService.getIssueDetail(id, this.context(scope, user, request));
  }

  @Patch("issues/:id")
  @RequirePermissions("ENGINEERING_INSPECTION_UPDATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.issue", action: "编辑工程问题", bizType: "engineering_issue", bizIdParam: "id" })
  updateIssue(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: UpdateEngineeringIssueDto
  ) {
    return this.engineeringInspectionService.updateIssue(id, dto, this.context(scope, user, request));
  }

  @Post("issues/:id/generate-rectification")
  @RequirePermissions("ENGINEERING_RECTIFICATION_ASSIGN")
  @AuditLog({ module: "工程项目交付", resource: "engineering.issue", action: "生成整改任务", bizType: "engineering_issue", bizIdParam: "id" })
  generateRectificationFromIssue(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: GenerateEngineeringRectificationDto
  ) {
    return this.engineeringInspectionService.generateRectificationFromIssue(id, dto, this.context(scope, user, request));
  }

  @Delete("issues/:id")
  @RequirePermissions("ENGINEERING_INSPECTION_UPDATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.issue", action: "删除工程问题", bizType: "engineering_issue", bizIdParam: "id" })
  removeIssue(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringInspectionService.deleteIssue(id, this.context(scope, user, request));
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
