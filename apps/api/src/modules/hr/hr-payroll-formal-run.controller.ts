import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateHrPayrollFormalRunDto, HrPayrollFormalRunQueryDto, HrPayrollFormalRunOptionsQueryDto, TransitionHrPayrollFormalRunDto } from "./dto/hr-payroll-formal-run.dto";
import { HrPayrollFormalRunService } from "./hr-payroll-formal-run.service";
import { HrPayrollFormalInputDetailQueryDto } from "./dto/hr-payroll-formal-input.dto";

@Controller("hr/payroll/formal-runs")
@RequireModule("hr")
@AuditLog({ module: "人力资源管理", resource: "hr.payroll_run", action: "正式工资核算", captureBody: false })
export class HrPayrollFormalRunController {
  constructor(private readonly service: HrPayrollFormalRunService) {}
  @Get() @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: HrPayrollFormalRunQueryDto) { return this.service.list(scope, actor, query); }
  @Get("options") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  options(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: HrPayrollFormalRunOptionsQueryDto) { return this.service.options(scope, actor, query); }
  @Get(":id") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Query() query: HrPayrollFormalInputDetailQueryDto) { return this.service.detail(scope, actor, id, query); }
  @Post() @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  @UseInterceptors(new IdempotencyInterceptor())
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: CreateHrPayrollFormalRunDto) { return this.service.create(scope, actor, dto); }
  @Post(":id/review") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_REVIEW, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  @UseInterceptors(new IdempotencyInterceptor())
  review(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: TransitionHrPayrollFormalRunDto) { return this.service.transition(scope, actor, id, "review", dto); }
  @Post(":id/confirm") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_CONFIRM, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  @UseInterceptors(new IdempotencyInterceptor())
  confirm(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: TransitionHrPayrollFormalRunDto) { return this.service.transition(scope, actor, id, "confirm", dto); }
  @Post(":id/cancel") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  @UseInterceptors(new IdempotencyInterceptor())
  cancel(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: TransitionHrPayrollFormalRunDto) { return this.service.transition(scope, actor, id, "cancel", dto); }
}
