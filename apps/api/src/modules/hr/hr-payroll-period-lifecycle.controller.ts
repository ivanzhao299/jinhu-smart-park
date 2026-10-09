import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { HrPayrollFormalInputDetailQueryDto } from "./dto/hr-payroll-formal-input.dto";
import { CloseHrPayrollPeriodDto, CompleteHrPayrollCorrectionWindowDto, OpenHrPayrollCorrectionWindowDto } from "./dto/hr-payroll-period-lifecycle.dto";
import { HrPayrollPeriodLifecycleService } from "./hr-payroll-period-lifecycle.service";

@Controller("hr/payroll")
@RequireModule("hr")
@AuditLog({ module: "人力资源管理", resource: "hr.payroll_period", action: "工资关账与更正", captureBody: false })
export class HrPayrollPeriodLifecycleController {
  constructor(private readonly service: HrPayrollPeriodLifecycleService) {}
  @Get("periods/:id/lifecycle") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_READ)
  context(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string) { return this.service.context(scope, actor, id); }
  @Get("periods/:id/correction-options") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  options(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Query() query: HrPayrollFormalInputDetailQueryDto) { return this.service.correctionOptions(scope, actor, id, query); }
  @Post("periods/:id/close") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_CONFIRM, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  @UseInterceptors(new IdempotencyInterceptor())
  close(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: CloseHrPayrollPeriodDto) { return this.service.close(scope, actor, id, dto); }
  @Post("periods/:id/correction-windows") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  @UseInterceptors(new IdempotencyInterceptor())
  open(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: OpenHrPayrollCorrectionWindowDto) { return this.service.openCorrection(scope, actor, id, dto); }
  @Post("correction-windows/:id/cancel") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_CONFIRM, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  @UseInterceptors(new IdempotencyInterceptor())
  cancel(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: CloseHrPayrollPeriodDto) { return this.service.cancelCorrection(scope, actor, id, dto); }
  @Post("correction-windows/:id/complete") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_CONFIRM, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  @UseInterceptors(new IdempotencyInterceptor())
  complete(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: CompleteHrPayrollCorrectionWindowDto) { return this.service.completeCorrection(scope, actor, id, dto); }
}
