import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { ConfirmHrPayrollFormalInputDto, CreateHrPayrollFormalInputDto, HrPayrollFormalInputDetailQueryDto, HrPayrollFormalInputQueryDto, HrPayrollFormalPreparationQueryDto, UpdateHrPayrollFormalInputDto } from "./dto/hr-payroll-formal-input.dto";
import { HrPayrollFormalInputService } from "./hr-payroll-formal-input.service";

@Controller("hr/payroll/inputs")
@RequireModule("hr")
@AuditLog({ module: "人力资源管理", resource: "hr.payroll_input", action: "维护工资项目输入", captureBody: false })
export class HrPayrollFormalInputController {
  constructor(private readonly service: HrPayrollFormalInputService) {}
  @Get() @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: HrPayrollFormalInputQueryDto) { return this.service.list(scope, actor, query); }
  @Get("preparation") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  preparation(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: HrPayrollFormalPreparationQueryDto) { return this.service.preparation(scope, actor, query); }
  @Get(":id") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Query() query: HrPayrollFormalInputDetailQueryDto) { return this.service.detail(scope, actor, id, query); }
  @Post() @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ) @UseInterceptors(new IdempotencyInterceptor())
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: CreateHrPayrollFormalInputDto) { return this.service.create(scope, actor, dto); }
  @Put(":id") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ) @UseInterceptors(new IdempotencyInterceptor())
  update(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: UpdateHrPayrollFormalInputDto) { return this.service.update(scope, actor, id, dto); }
  @Post(":id/confirm") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_REVIEW, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ) @UseInterceptors(new IdempotencyInterceptor())
  confirm(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: ConfirmHrPayrollFormalInputDto) { return this.service.confirm(scope, actor, id, dto); }
}
