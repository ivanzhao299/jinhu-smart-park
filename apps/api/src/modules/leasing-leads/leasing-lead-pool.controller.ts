import { Controller, Get, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { LeasingLeadQueryDto } from "./dto/leasing-lead-query.dto";
import { LeasingLeadsService } from "./leasing-leads.service";

@Controller("leasing/lead-pool")
@RequireModule("leasing")
export class LeasingLeadPoolController {
  constructor(private readonly leasingLeadsService: LeasingLeadsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_POOL_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: LeasingLeadQueryDto) {
    return this.leasingLeadsService.listPool(scope, query, user);
  }
}
