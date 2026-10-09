import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import {
  CreateHrPayrollRuleSetDto, CreateHrPayrollRuleVersionDto, HrPayrollEffectiveRuleQueryDto,
  HrPayrollFormalRuleQueryDto, ReviewHrPayrollRuleVersionDto, SubmitHrPayrollRuleVersionDto,
  UpdateHrPayrollRuleVersionDto,
} from "./dto/hr-payroll-formal-rule.dto";
import { HrPayrollFormalRuleService } from "./hr-payroll-formal-rule.service";

@Controller("hr/payroll/rules")
@RequireModule("hr")
@AuditLog({ module: "人力资源管理", resource: "hr.payroll_rule", action: "维护工资业务规则", captureBody: false })
export class HrPayrollFormalRuleController {
  constructor(private readonly service: HrPayrollFormalRuleService) {}
  @Get() @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: HrPayrollFormalRuleQueryDto) { return this.service.listSets(scope, actor, query); }
  @Post() @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE) @UseInterceptors(new IdempotencyInterceptor())
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: CreateHrPayrollRuleSetDto) { return this.service.createSet(scope, actor, dto); }
  @Get(":id/versions") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  versions(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Query() query: HrPayrollFormalRuleQueryDto) { return this.service.listVersions(scope, actor, id, query); }
  @Get(":id/effective") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  effective(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Query() query: HrPayrollEffectiveRuleQueryDto) { return this.service.effective(scope, actor, id, query); }
  @Post(":id/versions") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE) @UseInterceptors(new IdempotencyInterceptor())
  createVersion(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: CreateHrPayrollRuleVersionDto) { return this.service.createVersion(scope, actor, id, dto); }
  @Put("versions/:id") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE) @UseInterceptors(new IdempotencyInterceptor())
  update(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: UpdateHrPayrollRuleVersionDto) { return this.service.updateVersion(scope, actor, id, dto); }
  @Post("versions/:id/submit") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE) @UseInterceptors(new IdempotencyInterceptor())
  submit(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: SubmitHrPayrollRuleVersionDto) { return this.service.submitVersion(scope, actor, id, dto); }
  @Post("versions/:id/review") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW) @UseInterceptors(new IdempotencyInterceptor())
  review(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: ReviewHrPayrollRuleVersionDto) { return this.service.reviewVersion(scope, actor, id, dto); }
}
