import { Controller, Get } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireAnyPermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { EngineeringReferencesService } from "./engineering-references.service";

@Controller("engineering/references")
export class EngineeringReferencesController {
  constructor(private readonly engineeringReferencesService: EngineeringReferencesService) {}

  @Get()
  @RequireAnyPermissions(
    "ENGINEERING_PROJECT_VIEW",
    "ENGINEERING_PROJECT_CREATE",
    "ENGINEERING_PROJECT_UPDATE",
    "ENGINEERING_PLAN_VIEW",
    "ENGINEERING_PLAN_CREATE",
    "ENGINEERING_PLAN_UPDATE",
    "ENGINEERING_DAILY_REPORT_VIEW",
    "ENGINEERING_DAILY_REPORT_CREATE",
    "ENGINEERING_DAILY_REPORT_UPDATE",
    "ENGINEERING_INSPECTION_VIEW",
    "ENGINEERING_INSPECTION_CREATE",
    "ENGINEERING_INSPECTION_UPDATE",
    "ENGINEERING_RECTIFICATION_VIEW",
    "ENGINEERING_RECTIFICATION_ASSIGN",
    "ENGINEERING_RECTIFICATION_UPDATE",
    "ENGINEERING_ACCEPTANCE_VIEW",
    "ENGINEERING_ACCEPTANCE_CREATE",
    "ENGINEERING_ACCEPTANCE_UPDATE"
  )
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.engineeringReferencesService.getReferences(scope, user);
  }
}
