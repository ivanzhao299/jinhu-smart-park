import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { Request } from "express";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  CreateEngineeringDailyReportDto,
  EngineeringDailyReportQueryDto,
  ReviewEngineeringDailyReportDto,
  UpdateEngineeringDailyReportDto
} from "./dto/engineering-daily-report.dto";
import { EngineeringDailyReportService } from "./engineering-daily-report.service";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";

@Controller("engineering")
export class EngineeringDailyReportsController {
  constructor(private readonly engineeringDailyReportService: EngineeringDailyReportService) {}

  @Post("daily-reports")
  @RequirePermissions("ENGINEERING_DAILY_REPORT_CREATE")
  @AuditLog({ module: "工程项目交付", resource: "engineering.daily_report", action: "新增施工日报", bizType: "engineering_daily_report" })
  create(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Body() dto: CreateEngineeringDailyReportDto
  ) {
    return this.engineeringDailyReportService.createDailyReport(dto, this.context(scope, user, request));
  }

  @Get("daily-reports")
  @RequirePermissions("ENGINEERING_DAILY_REPORT_VIEW")
  list(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Query() query: EngineeringDailyReportQueryDto
  ) {
    return this.engineeringDailyReportService.paginateDailyReports(query, this.context(scope, user, request));
  }

  @Get("projects/:projectId/daily-reports")
  @RequirePermissions("ENGINEERING_DAILY_REPORT_VIEW")
  projectDailyReports(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("projectId") projectId: string,
    @Query() query: EngineeringDailyReportQueryDto
  ) {
    return this.engineeringDailyReportService.getProjectDailyReports(projectId, query, this.context(scope, user, request));
  }

  @Get("daily-reports/:id")
  @RequirePermissions("ENGINEERING_DAILY_REPORT_VIEW")
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringDailyReportService.getDailyReportDetail(id, this.context(scope, user, request));
  }

  @Patch("daily-reports/:id")
  @RequirePermissions("ENGINEERING_DAILY_REPORT_UPDATE")
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.daily_report",
    action: "编辑施工日报",
    bizType: "engineering_daily_report",
    bizIdParam: "id"
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: UpdateEngineeringDailyReportDto
  ) {
    return this.engineeringDailyReportService.updateDailyReport(id, dto, this.context(scope, user, request));
  }

  @Delete("daily-reports/:id")
  @RequirePermissions("ENGINEERING_DAILY_REPORT_UPDATE")
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.daily_report",
    action: "删除施工日报",
    bizType: "engineering_daily_report",
    bizIdParam: "id"
  })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringDailyReportService.deleteDailyReport(id, this.context(scope, user, request));
  }

  @Post("daily-reports/:id/submit")
  @RequirePermissions("ENGINEERING_DAILY_REPORT_SUBMIT")
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.daily_report",
    action: "提交施工日报",
    bizType: "engineering_daily_report",
    bizIdParam: "id"
  })
  submit(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Req() request: Request, @Param("id") id: string) {
    return this.engineeringDailyReportService.submitDailyReport(id, this.context(scope, user, request));
  }

  @Post("daily-reports/:id/review")
  @RequirePermissions("ENGINEERING_DAILY_REPORT_REVIEW")
  @AuditLog({
    module: "工程项目交付",
    resource: "engineering.daily_report",
    action: "审核施工日报",
    bizType: "engineering_daily_report",
    bizIdParam: "id"
  })
  review(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Req() request: Request,
    @Param("id") id: string,
    @Body() dto: ReviewEngineeringDailyReportDto
  ) {
    return this.engineeringDailyReportService.reviewDailyReport(id, dto, this.context(scope, user, request));
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
