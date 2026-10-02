import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from "@nestjs/common";
import { HR_INSURANCE_OWNED_PERMISSIONS, HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CloseHrInsuranceOwnedPeriodDto, ConfirmHrInsuranceOwnedPeriodDto, CorrectHrInsuranceOwnedPeriodDto, CreateHrInsuranceOwnedPreviewDto } from "./dto/hr-insurance-owned-period.dto";
import { HrInsurancePolicyQueryDto } from "./dto/hr-insurance-preview.dto";
import { HrInsuranceOwnedPeriodService } from "./hr-insurance-owned-period.service";

@Controller("hr/insurance/owned-periods")
@RequireModule("hr")
@RequirePermissions(HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
@AuditLog({ module: "人力资源管理", resource: "hr.insurance_owned_period", action: "现代社保期间", captureBody: false })
export class HrInsuranceOwnedPeriodController {
  constructor(private readonly service: HrInsuranceOwnedPeriodService) {}

  @Post("preview")
  @RequirePermissions(HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_INSURANCE_OWNED_PERMISSIONS.PREVIEW_CREATE)
  @UseInterceptors(new IdempotencyInterceptor())
  preview(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: CreateHrInsuranceOwnedPreviewDto) { return this.service.preview(scope, actor, dto); }

  @Post("confirm")
  @RequirePermissions(HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_INSURANCE_OWNED_PERMISSIONS.CONFIRM)
  @UseInterceptors(new IdempotencyInterceptor())
  confirm(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: ConfirmHrInsuranceOwnedPeriodDto) { return this.service.confirm(scope, actor, dto); }

  @Post("close")
  @RequirePermissions(HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_INSURANCE_OWNED_PERMISSIONS.CLOSE)
  @UseInterceptors(new IdempotencyInterceptor())
  close(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: CloseHrInsuranceOwnedPeriodDto) { return this.service.close(scope, actor, dto); }

  @Post("correct")
  @RequirePermissions(HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_INSURANCE_OWNED_PERMISSIONS.CORRECT)
  @UseInterceptors(new IdempotencyInterceptor())
  correct(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: CorrectHrInsuranceOwnedPeriodDto) { return this.service.correct(scope, actor, dto); }

  @Get()
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: HrInsurancePolicyQueryDto) { return this.service.list(scope, actor, query); }

  @Get("employees")
  @RequirePermissions(HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_INSURANCE_OWNED_PERMISSIONS.PREVIEW_CREATE)
  employeeOptions(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: HrInsurancePolicyQueryDto) { return this.service.employeeOptions(scope, actor, query); }

  @Get(":id")
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string) { return this.service.detail(scope, actor, id); }
}
