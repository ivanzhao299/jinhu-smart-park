import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireAuthenticated, RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { AdminIssuesService } from "./admin-issues.service";
import { AdminIssueQueryDto, AdminIssueRunnerResultDto, ClaimAdminIssueDto, CreateAdminIssueDto, RenewAdminIssueLeaseDto, TriageAdminIssueDto } from "./dto/admin-issue.dto";

@Controller("admin-issues")
export class AdminIssuesController {
  constructor(private readonly service: AdminIssuesService) {}

  @Post()
  @RequireAuthenticated()
  @UseInterceptors(new IdempotencyInterceptor())
  @AuditLog({ module: "问题修复", resource: "ops.admin_issue", action: "提交问题", bizType: "admin_issue_report" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: CreateAdminIssueDto) {
    return this.service.create(scope, actor, dto);
  }

  @Get("mine")
  @RequireAuthenticated()
  mine(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: AdminIssueQueryDto) {
    return this.service.listMine(scope, actor, query);
  }

  @Get("runner/ready")
  @RequirePermissions(SYSTEM_PERMISSIONS.ADMIN_ISSUE_RUNNER)
  ready(@CurrentScope() scope: TenantParkScope, @Query("limit") limit?: string) {
    return this.service.ready(scope, Number(limit) || 10);
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ADMIN_ISSUE_READ)
  list(@CurrentScope() scope: TenantParkScope, @Query() query: AdminIssueQueryDto) {
    return this.service.list(scope, query);
  }

  @Get(":issueNo")
  @RequireAuthenticated()
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("issueNo") issueNo: string) {
    return this.service.detail(scope, issueNo, actor);
  }

  @Patch(":issueNo/triage")
  @RequirePermissions(SYSTEM_PERMISSIONS.ADMIN_ISSUE_MANAGE)
  @AuditLog({ module: "问题修复", resource: "ops.admin_issue", action: "审核问题", bizType: "admin_issue_report", bizIdParam: "issueNo" })
  triage(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("issueNo") issueNo: string, @Body() dto: TriageAdminIssueDto) {
    return this.service.triage(scope, actor, issueNo, dto);
  }

  @Post(":issueNo/runner/claim")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.ADMIN_ISSUE_RUNNER)
  claim(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("issueNo") issueNo: string, @Body() dto: ClaimAdminIssueDto) {
    return this.service.claim(scope, actor, issueNo, dto);
  }

  @Post(":issueNo/runner/renew")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.ADMIN_ISSUE_RUNNER)
  renew(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("issueNo") issueNo: string, @Body() dto: RenewAdminIssueLeaseDto) {
    return this.service.renew(scope, actor, issueNo, dto);
  }

  @Post(":issueNo/runner/result")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.ADMIN_ISSUE_RUNNER)
  @AuditLog({ module: "问题修复", resource: "ops.admin_issue", action: "Runner 结果回写", bizType: "admin_issue_report", bizIdParam: "issueNo" })
  result(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("issueNo") issueNo: string, @Body() dto: AdminIssueRunnerResultDto) {
    return this.service.recordResult(scope, actor, issueNo, dto);
  }
}
