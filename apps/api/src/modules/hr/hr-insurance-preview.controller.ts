import { Body, Controller, Post } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CreateHrInsuranceReferencePreviewDto } from "./dto/hr-insurance-preview.dto";
import { HrInsurancePreviewService } from "./hr-insurance-preview.service";

@Controller("hr/insurance")
@RequireModule("hr")
export class HrInsurancePreviewController {
  constructor(private readonly service: HrInsurancePreviewService) {}

  @Post("reference-preview")
  @RequirePermissions(HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ)
  referencePreview(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: CreateHrInsuranceReferencePreviewDto) {
    return this.service.referencePreview(scope, actor, dto);
  }
}
