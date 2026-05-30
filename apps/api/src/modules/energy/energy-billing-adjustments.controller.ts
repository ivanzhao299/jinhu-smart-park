import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateEnergyBillingAdjustmentDto, EnergyBillingAdjustmentQueryDto } from "./dto/energy-billing.dto";
import { EnergyBillingAdjustmentService } from "./energy-billing-adjustment.service";

@Controller("energy/billing-adjustments")
@RequireModule("energy")
export class EnergyBillingAdjustmentsController {
  constructor(private readonly adjustmentService: EnergyBillingAdjustmentService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_VIEW)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: EnergyBillingAdjustmentQueryDto) {
    return this.adjustmentService.list(scope, query, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_CREATE)
  @AuditLog({ module: "能源管理", action: "新增能源调整红冲单", resource: "energy.billing_adjustment", bizType: "energy_billing_adjustment" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateEnergyBillingAdjustmentDto) {
    return this.adjustmentService.create(scope, user, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_VIEW)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.adjustmentService.detail(scope, id, user);
  }

  @Post(":id/approve")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_APPROVE)
  @AuditLog({ module: "能源管理", action: "审批能源调整红冲单", resource: "energy.billing_adjustment", bizType: "energy_billing_adjustment", bizIdParam: "id" })
  approve(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.adjustmentService.approve(scope, user, id);
  }

  @Post(":id/post")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_POST)
  @AuditLog({ module: "能源管理", action: "发布能源调整红冲单", resource: "energy.billing_adjustment", bizType: "energy_billing_adjustment", bizIdParam: "id" })
  post(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.adjustmentService.post(scope, user, id);
  }

  @Post(":id/cancel")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_CANCEL)
  @AuditLog({ module: "能源管理", action: "取消能源调整红冲单", resource: "energy.billing_adjustment", bizType: "energy_billing_adjustment", bizIdParam: "id" })
  cancel(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.adjustmentService.cancel(scope, user, id);
  }
}
