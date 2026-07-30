import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query, UseInterceptors } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { PropertyHighRiskAction } from "../../shared/decorators/property-high-risk-action.decorator";
import { RequireAnyPermissions, RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreatePartyDto, PartyQueryDto } from "../property-operations/dto/party.dto";
import {
  AddHousingOccupantDto,
  ApproveHousingLeaseDto,
  CompleteHousingHandoverDto,
  CreateHousingRepairDto,
  CreateHousingLeaseDto,
  CreateHousingPurchaseDto,
  GenerateHousingBillsDto,
  HousingBillingQueryDto,
  HousingFinanceQueryDto,
  HousingHandoverQueryDto,
  HousingLeaseQueryDto,
  HousingPurchaseActionDto,
  HousingPurchaseQueryDto,
  HousingRepairQueryDto,
  HousingReasonDto,
  HousingTaskQueryDto,
  RegisterHousingLedgerEntryDto,
  SignHousingLeaseDto,
  TransferHousingPurchaseDto,
  UpsertHousingChargePlanDto
} from "./dto/housing.dto";
import { HousingService } from "./housing.service";
import { HousingWorkbenchQueryService } from "./housing-workbench-query.service";

@Controller("housing")
@RequireModule("housing_rental")
export class HousingController {
  constructor(
    private readonly service: HousingService,
    private readonly workbenchQuery: HousingWorkbenchQueryService
  ) {}

  @Get("dashboard")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_DASHBOARD_READ)
  dashboard(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal) {
    return this.service.dashboard(scope, actor);
  }

  @Get("tasks")
  @RequireModule("housing_rental", "asset")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_TASK_READ)
  listTasks(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HousingTaskQueryDto
  ) {
    return this.workbenchQuery.listTasks(scope, actor, query);
  }

  @Get("tenants")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_TENANT_READ)
  listTenants(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: PartyQueryDto
  ) {
    return this.service.listTenants(scope, actor, query);
  }

  @Get("handovers")
  @RequireModule("housing_rental", "asset")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ)
  listHandovers(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HousingHandoverQueryDto
  ) {
    return this.workbenchQuery.listHandovers(scope, actor, query);
  }

  @Get("handovers/:id")
  @RequireModule("housing_rental", "asset")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ)
  getHandover(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ) {
    return this.workbenchQuery.getHandover(scope, actor, id);
  }

  @Get("billing")
  @RequireModule("housing_rental", "asset")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_BILLING_READ)
  listBilling(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HousingBillingQueryDto
  ) {
    return this.workbenchQuery.listBilling(scope, actor, query);
  }

  @Get("finance")
  @RequireModule("housing_rental", "asset")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ)
  listFinance(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HousingFinanceQueryDto
  ) {
    return this.workbenchQuery.listFinance(scope, actor, query);
  }

  @Get("repairs")
  @RequireModule("housing_rental", "asset")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ)
  listRepairs(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HousingRepairQueryDto
  ) {
    return this.workbenchQuery.listRepairs(scope, actor, query);
  }

  @Get("repairs/:id")
  @RequireModule("housing_rental", "asset")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ)
  getRepair(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ) {
    return this.workbenchQuery.getRepair(scope, actor, id);
  }

  @Post("tenants")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE)
  @AuditLog({ module: "住房出租", resource: "biz.party", action: "建立住房租客档案", bizType: "biz_party", captureBody: false })
  createTenant(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CreatePartyDto
  ) {
    return this.service.createTenant(scope, actor, dto);
  }

  @Get("leases")
  @RequireAnyPermissions(
    SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
    SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE,
    SYSTEM_PERMISSIONS.HOUSING_LEASE_APPROVE,
    SYSTEM_PERMISSIONS.HOUSING_LEASE_SIGN,
    SYSTEM_PERMISSIONS.HOUSING_LEASE_ACTIVATE,
    SYSTEM_PERMISSIONS.HOUSING_LEASE_CHECKOUT,
    SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE,
    SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
    SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE,
    SYSTEM_PERMISSIONS.HOUSING_BILLING_GENERATE,
    SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ,
    SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER,
    SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE,
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_TRANSFER
  )
  listLeases(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HousingLeaseQueryDto
  ) {
    return this.service.listLeases(scope, actor, query);
  }

  @Get("leases/:id")
  @RequireAnyPermissions(
    SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
    SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE,
    SYSTEM_PERMISSIONS.HOUSING_LEASE_APPROVE,
    SYSTEM_PERMISSIONS.HOUSING_LEASE_SIGN,
    SYSTEM_PERMISSIONS.HOUSING_LEASE_ACTIVATE,
    SYSTEM_PERMISSIONS.HOUSING_LEASE_CHECKOUT,
    SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE,
    SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
    SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE,
    SYSTEM_PERMISSIONS.HOUSING_BILLING_GENERATE,
    SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ,
    SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER,
    SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE,
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_TRANSFER
  )
  getLease(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string
  ) {
    return this.service.getLease(scope, actor, id);
  }

  @Post("leases")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE,
    SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE,
    SYSTEM_PERMISSIONS.UNIT_READ
  )
  @AuditLog({ module: "住房出租", resource: "biz.housing_lease", action: "创建住房租约", bizType: "biz_housing_lease" })
  createLease(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CreateHousingLeaseDto
  ) {
    return this.service.createLease(scope, actor, dto);
  }

  @Post("leases/:id/submit")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE)
  @AuditLog({ module: "住房出租", resource: "biz.housing_lease", action: "提交租约审批", bizType: "biz_housing_lease", bizIdParam: "id" })
  submitLease(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id") id: string) {
    return this.service.submitLease(scope, actor, id);
  }

  @Post("leases/:id/approve")
  @PropertyHighRiskAction("housing.leases.approve")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_LEASE_APPROVE)
  @AuditLog({ module: "住房出租", resource: "biz.housing_lease", action: "审批住房租约", bizType: "biz_housing_lease", bizIdParam: "id" })
  approveLease(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ApproveHousingLeaseDto
  ) {
    return this.service.approveLease(scope, actor, id, dto);
  }

  @Post("leases/:id/sign")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_LEASE_SIGN)
  @AuditLog({ module: "住房出租", resource: "biz.housing_lease", action: "登记线下签署", bizType: "biz_housing_lease", bizIdParam: "id" })
  signLease(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: SignHousingLeaseDto
  ) {
    return this.service.signLease(scope, actor, id, dto);
  }

  @Post("leases/:id/activate")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_LEASE_ACTIVATE)
  @AuditLog({ module: "住房出租", resource: "biz.housing_lease", action: "生效住房租约", bizType: "biz_housing_lease", bizIdParam: "id" })
  activateLease(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Headers("x-idempotency-key") idempotencyKey?: string
  ) {
    return this.service.activateLease(scope, actor, id, idempotencyKey);
  }

  @Post("leases/:id/void")
  @PropertyHighRiskAction("housing.leases.void")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE)
  @AuditLog({ module: "住房出租", resource: "biz.housing_lease", action: "作废住房租约", bizType: "biz_housing_lease", bizIdParam: "id" })
  voidLease(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: HousingReasonDto
  ) {
    return this.service.voidLease(scope, actor, id, dto.reason);
  }

  @Post("leases/:id/occupants")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE)
  @AuditLog({ module: "住房出租", resource: "rel.housing_lease_occupant", action: "登记同住人", bizType: "rel_housing_lease_occupant", bizIdParam: "id" })
  addOccupant(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AddHousingOccupantDto
  ) {
    return this.service.addOccupant(scope, actor, id, dto);
  }

  @Put("leases/:id/charge-plans")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE)
  @AuditLog({ module: "住房出租", resource: "biz.housing_charge_plan", action: "配置周期费用", bizType: "biz_housing_charge_plan", bizIdParam: "id" })
  saveChargePlan(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpsertHousingChargePlanDto
  ) {
    return this.service.saveChargePlan(scope, actor, id, dto);
  }

  @Post("leases/:id/generate-bills")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_BILLING_GENERATE)
  @AuditLog({ module: "住房出租", resource: "biz.housing_receivable", action: "生成周期账单", bizType: "biz_housing_receivable", bizIdParam: "id" })
  generateBills(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: GenerateHousingBillsDto
  ) {
    return this.service.generateBills(scope, actor, id, dto);
  }

  @Post("leases/:id/ledger")
  @PropertyHighRiskAction("housing.finance.refund-waive-or-deposit-refund", {
    bodyField: "entry_type",
    highRiskValues: ["refund", "waiver", "deposit_refund"]
  })
  @UseInterceptors(new IdempotencyInterceptor())
  @RequireAnyPermissions(SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER, SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE)
  @AuditLog({ module: "住房出租", resource: "biz.housing_ledger", action: "登记住房财务流水", bizType: "biz_housing_ledger_entry", bizIdParam: "id" })
  registerLedger(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RegisterHousingLedgerEntryDto
  ) {
    return this.service.registerLedger(scope, actor, id, dto);
  }

  @Post("leases/:id/handovers")
  @PropertyHighRiskAction("housing.handovers.complete-move-out-financial", {
    variantPredicate: {
      allEquals: { handover_type: "move_out" },
      anyNonZero: ["damage_amount", "unsettled_amount", "deposit_deduction_amount"]
    }
  })
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE)
  @AuditLog({ module: "住房出租", resource: "biz.housing_handover", action: "完成住房交割", bizType: "biz_housing_handover", bizIdParam: "id" })
  completeHandover(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CompleteHousingHandoverDto
  ) {
    return this.service.completeHandover(scope, actor, id, dto);
  }

  @Post("leases/:id/repairs")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE)
  @AuditLog({ module: "住房出租", resource: "biz.work_order", action: "代录住房报修", bizType: "biz_work_order", bizIdParam: "id" })
  createRepair(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CreateHousingRepairDto
  ) {
    return this.service.createRepair(scope, actor, id, dto);
  }

  @Post("leases/:id/checkout")
  @PropertyHighRiskAction("housing.leases.checkout")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_LEASE_CHECKOUT)
  @AuditLog({ module: "住房出租", resource: "biz.housing_lease", action: "完成退租结算", bizType: "biz_housing_lease", bizIdParam: "id" })
  checkoutLease(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: HousingReasonDto
  ) {
    return this.service.checkoutLease(scope, actor, id, dto.reason);
  }

  @Get("purchases")
  @RequireAnyPermissions(
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ,
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_TRANSFER
  )
  listPurchases(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HousingPurchaseQueryDto
  ) {
    return this.service.listPurchases(scope, actor, query);
  }

  @Get("purchases/:id")
  @RequireAnyPermissions(
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ,
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_TRANSFER
  )
  getPurchase(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string
  ) {
    return this.service.getPurchase(scope, actor, id);
  }

  @Post("purchases")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
    SYSTEM_PERMISSIONS.UNIT_READ
  )
  @AuditLog({ module: "住房出租", resource: "biz.housing_purchase", action: "创建采购单", bizType: "biz_housing_purchase" })
  createPurchase(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CreateHousingPurchaseDto
  ) {
    return this.service.createPurchase(scope, actor, dto);
  }

  @Post("purchases/:id/actions")
  @PropertyHighRiskAction("housing.purchases.lifecycle")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE)
  @AuditLog({ module: "住房出租", resource: "biz.housing_purchase", action: "更新采购状态", bizType: "biz_housing_purchase", bizIdParam: "id" })
  purchaseAction(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: HousingPurchaseActionDto
  ) {
    return this.service.purchaseAction(scope, actor, id, dto);
  }

  @Post("purchases/:id/transfer")
  @PropertyHighRiskAction("housing.purchases.transfer")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOUSING_PURCHASE_TRANSFER)
  @AuditLog({ module: "住房出租", resource: "biz.housing_purchase", action: "采购成本转租客收费", bizType: "biz_housing_purchase", bizIdParam: "id" })
  transferPurchase(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: TransferHousingPurchaseDto
  ) {
    return this.service.transferPurchase(scope, actor, id, dto);
  }
}
