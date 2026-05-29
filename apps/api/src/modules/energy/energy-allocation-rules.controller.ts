import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateEnergyAllocationRuleDto, EnergyAllocationRuleQueryDto, UpdateEnergyAllocationRuleDto } from "./dto/energy-billing.dto";
import { EnergyAllocationRuleService } from "./energy-allocation-rule.service";

@Controller("energy/allocation-rules")
@RequireModule("energy")
export class EnergyAllocationRulesController {
  constructor(private readonly allocationRuleService: EnergyAllocationRuleService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_VIEW)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: EnergyAllocationRuleQueryDto) {
    return this.allocationRuleService.list(scope, query, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_CREATE)
  @AuditLog({ module: "能源管理", action: "新增能耗分摊规则", resource: "energy.allocation_rule", bizType: "energy_allocation_rule" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateEnergyAllocationRuleDto) {
    return this.allocationRuleService.create(scope, user, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_VIEW)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.allocationRuleService.detail(scope, id, user);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_UPDATE)
  @AuditLog({ module: "能源管理", action: "编辑能耗分摊规则", resource: "energy.allocation_rule", bizType: "energy_allocation_rule", bizIdParam: "id" })
  update(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdateEnergyAllocationRuleDto) {
    return this.allocationRuleService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_DELETE)
  @AuditLog({ module: "能源管理", action: "删除能耗分摊规则", resource: "energy.allocation_rule", bizType: "energy_allocation_rule", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.allocationRuleService.softDelete(scope, user, id);
  }

  @Post(":id/enable")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_ENABLE)
  @AuditLog({ module: "能源管理", action: "启用能耗分摊规则", resource: "energy.allocation_rule", bizType: "energy_allocation_rule", bizIdParam: "id" })
  enable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.allocationRuleService.setStatus(scope, user, id, "ENABLED");
  }

  @Post(":id/disable")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_ENABLE)
  @AuditLog({ module: "能源管理", action: "停用能耗分摊规则", resource: "energy.allocation_rule", bizType: "energy_allocation_rule", bizIdParam: "id" })
  disable(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.allocationRuleService.setStatus(scope, user, id, "DISABLED");
  }
}
