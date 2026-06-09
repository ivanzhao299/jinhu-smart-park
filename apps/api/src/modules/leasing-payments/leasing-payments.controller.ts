import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseInterceptors } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { ApplyLeasingPaymentDto } from "./dto/apply-leasing-payment.dto";
import { CreateLeasingPaymentDto } from "./dto/create-leasing-payment.dto";
import { LeasingPaymentQueryDto } from "./dto/leasing-payment-query.dto";
import { UpdateLeasingPaymentDto } from "./dto/update-leasing-payment.dto";
import { LeasingPaymentsService } from "./leasing-payments.service";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";

@Controller("leasing/payments")
@RequireModule("leasing")
export class LeasingPaymentsController {
  constructor(private readonly leasingPaymentsService: LeasingPaymentsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_PAYMENT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: LeasingPaymentQueryDto) {
    return this.leasingPaymentsService.list(scope, query, user);
  }

  @Get(":id/applications")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_PAYMENT_READ)
  applications(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingPaymentsService.listApplications(scope, id, user);
  }

  @Post(":id/apply")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_PAYMENT_APPLY)
  @AuditLog({ module: "租赁收款", resource: "biz.leasing_payment", action: "核销", bizType: "biz_leasing_payment", bizIdParam: "id" })
  apply(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ApplyLeasingPaymentDto
  ) {
    return this.leasingPaymentsService.apply(scope, user, id, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_PAYMENT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingPaymentsService.detail(scope, id, user);
  }

  @Post()
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_PAYMENT_CREATE)
  @AuditLog({ module: "租赁收款", resource: "biz.leasing_payment", action: "新增", bizType: "biz_leasing_payment" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateLeasingPaymentDto) {
    return this.leasingPaymentsService.create(scope, user, dto);
  }

  @Put(":id")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_PAYMENT_UPDATE)
  @AuditLog({ module: "租赁收款", resource: "biz.leasing_payment", action: "修改", bizType: "biz_leasing_payment", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateLeasingPaymentDto
  ) {
    return this.leasingPaymentsService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_PAYMENT_DELETE)
  @AuditLog({ module: "租赁收款", resource: "biz.leasing_payment", action: "删除", bizType: "biz_leasing_payment", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingPaymentsService.softDelete(scope, user, id);
  }
}
