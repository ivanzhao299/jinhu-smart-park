import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from "@nestjs/common";
import { HR_INSURANCE_POLICY_PERMISSIONS, HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateHrInsurancePolicyVersionDto } from "./dto/hr-insurance-policy-version.dto";
import { HrInsurancePolicyQueryDto } from "./dto/hr-insurance-preview.dto";
import { HrInsurancePolicyVersionService } from "./hr-insurance-policy-version.service";

@Controller("hr/insurance/policy-versions")
@RequireModule("hr")
@AuditLog({ module: "人力资源管理", resource: "hr.insurance_policy_version", action: "社保政策版本", captureBody: false })
export class HrInsurancePolicyVersionController {
  constructor(private readonly service: HrInsurancePolicyVersionService) {}
  @Post()
  @RequirePermissions(HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE)
  @UseInterceptors(new IdempotencyInterceptor())
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: CreateHrInsurancePolicyVersionDto) { return this.service.create(scope, actor, dto); }
  @Get()
  @RequirePermissions(HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: HrInsurancePolicyQueryDto) { return this.service.list(scope, actor, query); }
  @Get(":id")
  @RequirePermissions(HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id",new ParseUUIDPipe()) id: string) { return this.service.detail(scope, actor, id); }
}
