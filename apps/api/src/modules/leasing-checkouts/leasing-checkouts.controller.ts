import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CheckoutSettlementDto } from "./dto/checkout-settlement.dto";
import { CreateLeasingCheckoutDto } from "./dto/create-leasing-checkout.dto";
import { CreateLeasingRefundDto } from "./dto/create-leasing-refund.dto";
import { EffectiveLeasingCheckoutDto } from "./dto/effective-leasing-checkout.dto";
import { LeasingCheckoutActionDto, RejectLeasingCheckoutDto } from "./dto/leasing-checkout-action.dto";
import { LeasingCheckoutQueryDto } from "./dto/leasing-checkout-query.dto";
import { LeasingRefundQueryDto } from "./dto/leasing-refund-query.dto";
import { UpdateLeasingCheckoutDto } from "./dto/update-leasing-checkout.dto";
import { LeasingCheckoutsService } from "./leasing-checkouts.service";

@Controller("leasing/checkouts")
@RequireModule("leasing")
export class LeasingCheckoutsController {
  constructor(private readonly leasingCheckoutsService: LeasingCheckoutsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CHECKOUT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: LeasingCheckoutQueryDto) {
    return this.leasingCheckoutsService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CHECKOUT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingCheckoutsService.detail(scope, id, user);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CHECKOUT_UPDATE)
  @AuditLog({ module: "退租管理", resource: "biz.leasing_checkout", action: "修改", bizType: "biz_leasing_checkout", bizIdParam: "id" })
  update(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdateLeasingCheckoutDto) {
    return this.leasingCheckoutsService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CHECKOUT_DELETE)
  @AuditLog({ module: "退租管理", resource: "biz.leasing_checkout", action: "删除", bizType: "biz_leasing_checkout", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingCheckoutsService.softDelete(scope, user, id);
  }

  @Post(":id/submit")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CHECKOUT_SUBMIT)
  @AuditLog({ module: "退租管理", resource: "biz.leasing_checkout", action: "提交审批", bizType: "biz_leasing_checkout", bizIdParam: "id" })
  submit(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: LeasingCheckoutActionDto) {
    return this.leasingCheckoutsService.submit(scope, user, id, dto);
  }

  @Post(":id/approve")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CHECKOUT_APPROVE)
  @AuditLog({ module: "退租管理", resource: "biz.leasing_checkout", action: "审批通过", bizType: "biz_leasing_checkout", bizIdParam: "id" })
  approve(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: LeasingCheckoutActionDto) {
    return this.leasingCheckoutsService.approve(scope, user, id, dto);
  }

  @Post(":id/reject")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CHECKOUT_REJECT)
  @AuditLog({ module: "退租管理", resource: "biz.leasing_checkout", action: "审批驳回", bizType: "biz_leasing_checkout", bizIdParam: "id" })
  reject(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: RejectLeasingCheckoutDto) {
    return this.leasingCheckoutsService.reject(scope, user, id, dto);
  }

  @Post(":id/preview-settlement")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CHECKOUT_PREVIEW_SETTLEMENT)
  @AuditLog({ module: "退租管理", resource: "biz.leasing_checkout", action: "结算预览", bizType: "biz_leasing_checkout", bizIdParam: "id" })
  previewSettlement(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: CheckoutSettlementDto) {
    return this.leasingCheckoutsService.previewSettlement(scope, user, id, dto);
  }

  @Post(":id/confirm-settlement")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CHECKOUT_CONFIRM_SETTLEMENT)
  @AuditLog({ module: "退租管理", resource: "biz.leasing_checkout", action: "确认结算", bizType: "biz_leasing_checkout", bizIdParam: "id" })
  confirmSettlement(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: CheckoutSettlementDto) {
    return this.leasingCheckoutsService.confirmSettlement(scope, user, id, dto);
  }

  @Post(":id/effective")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CHECKOUT_EFFECTIVE)
  @AuditLog({ module: "退租管理", resource: "biz.leasing_checkout", action: "退租生效", bizType: "biz_leasing_checkout", bizIdParam: "id" })
  effective(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: EffectiveLeasingCheckoutDto) {
    return this.leasingCheckoutsService.effective(scope, user, id, dto);
  }

  @Post(":id/refunds")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_REFUND_CREATE)
  @AuditLog({ module: "退租退款", resource: "biz.leasing_refund", action: "新增", bizType: "biz_leasing_refund", bizIdParam: "id" })
  createRefund(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: CreateLeasingRefundDto) {
    return this.leasingCheckoutsService.createRefund(scope, user, id, dto);
  }

  @Get(":id/refunds")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_REFUND_READ)
  listCheckoutRefunds(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingCheckoutsService.listCheckoutRefunds(scope, user, id);
  }
}

@Controller("leasing/contracts")
@RequireModule("leasing")
export class LeasingContractNestedCheckoutsController {
  constructor(private readonly leasingCheckoutsService: LeasingCheckoutsService) {}

  @Post(":contractId/checkouts")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CHECKOUT_CREATE)
  @AuditLog({ module: "退租管理", resource: "biz.leasing_checkout", action: "新增", bizType: "biz_leasing_checkout", bizIdParam: "contractId" })
  create(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("contractId") contractId: string,
    @Body() dto: CreateLeasingCheckoutDto
  ) {
    return this.leasingCheckoutsService.create(scope, user, contractId, dto);
  }
}

@Controller("leasing/refunds")
@RequireModule("leasing")
export class LeasingRefundsController {
  constructor(private readonly leasingCheckoutsService: LeasingCheckoutsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_REFUND_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: LeasingRefundQueryDto) {
    return this.leasingCheckoutsService.listRefunds(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_REFUND_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingCheckoutsService.refundDetail(scope, id, user);
  }
}
