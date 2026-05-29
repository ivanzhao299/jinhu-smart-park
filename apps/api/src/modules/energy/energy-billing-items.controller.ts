import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { AdjustEnergyBillingItemDto, DisputeEnergyBillingItemDto, EnergyBillingItemQueryDto } from "./dto/energy-billing.dto";
import { EnergyBillingItemService } from "./energy-billing-item.service";

@Controller("energy/billing-items")
@RequireModule("energy")
export class EnergyBillingItemsController {
  constructor(private readonly billingItemService: EnergyBillingItemService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_ITEM_VIEW)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: EnergyBillingItemQueryDto) {
    return this.billingItemService.list(scope, query, user);
  }

  @Patch(":id/adjust")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_ITEM_ADJUST)
  @AuditLog({ module: "能源管理", action: "调整能源账单项", resource: "energy.billing_item", bizType: "energy_billing_item", bizIdParam: "id" })
  adjust(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: AdjustEnergyBillingItemDto) {
    return this.billingItemService.adjust(scope, user, id, dto);
  }

  @Post(":id/confirm")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_ITEM_CONFIRM)
  @AuditLog({ module: "能源管理", action: "确认能源账单项", resource: "energy.billing_item", bizType: "energy_billing_item", bizIdParam: "id" })
  confirm(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.billingItemService.confirm(scope, user, id);
  }

  @Post(":id/dispute")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_ITEM_DISPUTE)
  @AuditLog({ module: "能源管理", action: "争议能源账单项", resource: "energy.billing_item", bizType: "energy_billing_item", bizIdParam: "id" })
  dispute(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: DisputeEnergyBillingItemDto) {
    return this.billingItemService.dispute(scope, user, id, dto);
  }
}
