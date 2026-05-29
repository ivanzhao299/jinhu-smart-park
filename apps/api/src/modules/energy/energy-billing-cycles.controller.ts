import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateEnergyBillingCycleDto, EnergyBillingCycleQueryDto, EnergyBillingItemQueryDto } from "./dto/energy-billing.dto";
import { EnergyBillingCycleService } from "./energy-billing-cycle.service";

@Controller("energy/billing-cycles")
@RequireModule("energy")
export class EnergyBillingCyclesController {
  constructor(private readonly billingCycleService: EnergyBillingCycleService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_VIEW)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: EnergyBillingCycleQueryDto) {
    return this.billingCycleService.list(scope, query, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_CREATE)
  @AuditLog({ module: "能源管理", action: "新增能源账期", resource: "energy.billing_cycle", bizType: "energy_billing_cycle" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateEnergyBillingCycleDto) {
    return this.billingCycleService.create(scope, user, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_VIEW)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.billingCycleService.detail(scope, id, user);
  }

  @Get(":id/items")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_ITEM_VIEW)
  items(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Query() query: EnergyBillingItemQueryDto) {
    return this.billingCycleService.listItems(scope, id, query, user);
  }

  @Post(":id/calculate")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_CALCULATE)
  @AuditLog({ module: "能源管理", action: "计算能源账期", resource: "energy.billing_cycle", bizType: "energy_billing_cycle", bizIdParam: "id" })
  calculate(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: { unit_prices?: Record<string, number> }) {
    return this.billingCycleService.calculate(scope, user, id, dto);
  }

  @Post(":id/confirm")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_CONFIRM)
  @AuditLog({ module: "能源管理", action: "确认能源账期", resource: "energy.billing_cycle", bizType: "energy_billing_cycle", bizIdParam: "id" })
  confirm(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.billingCycleService.confirm(scope, user, id);
  }

  @Post(":id/post")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_POST)
  @AuditLog({ module: "能源管理", action: "发布能源账期", resource: "energy.billing_cycle", bizType: "energy_billing_cycle", bizIdParam: "id" })
  post(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.billingCycleService.post(scope, user, id);
  }

  @Post(":id/cancel")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_CANCEL)
  @AuditLog({ module: "能源管理", action: "取消能源账期", resource: "energy.billing_cycle", bizType: "energy_billing_cycle", bizIdParam: "id" })
  cancel(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.billingCycleService.cancel(scope, user, id);
  }
}
