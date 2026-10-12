import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { HrPayrollFormalRunOptionsQueryDto } from "./dto/hr-payroll-formal-run.dto";
import { PayrollTrialDto, PayrollTrialOptionsDto } from "./dto/hr-payroll-trial.dto";
import { HrPayrollTrialService } from "./hr-payroll-trial.service";
@Controller("hr/payroll/trial-comparisons")
@RequireModule("hr")
@RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_PAYROLL_RULE_READ, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE)
@AuditLog({ module: "人力资源管理", resource: "hr.payroll_trial", action: "正式工资只算不发核对", captureBody: false })
export class HrPayrollTrialController {
  constructor(private readonly service: HrPayrollTrialService) {}
  @Get("options") options(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: PayrollTrialOptionsDto) { return this.service.options(scope, actor, query); }
  @Get("source-options") sourceOptions(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: HrPayrollFormalRunOptionsQueryDto) { return this.service.sourceOptions(scope, actor, query); }
  // Deliberately no persisted replay payload: this read calculation returns one audited, transient snapshot.
  @Post() calculate(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() body: PayrollTrialDto) { return this.service.calculate(scope, actor, body); }
}
