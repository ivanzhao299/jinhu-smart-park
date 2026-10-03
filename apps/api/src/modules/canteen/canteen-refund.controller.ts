import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import { UseInterceptors } from "@nestjs/common";
import { CreateRefundDto } from "./dto/canteen.dto";
import { CanteenRefundService } from "./canteen-refund.service";

@Controller("canteen/refunds")
export class CanteenRefundController {
  constructor(private readonly svc: CanteenRefundService) {}

  @Get()
  @RequirePermissions(CANTEEN_PERMISSIONS.REFUND_VIEW)
  list(@CurrentScope() scope: TenantParkScope, @Query("page") page = 1, @Query("page_size") pageSize = 20) {
    return this.svc.list(scope, { page: Number(page) || 1, page_size: Number(pageSize) || 20 });
  }

  // 发起退款（转审核）。对应 api.md POST /orders/{id}/refunds。
  @Post()
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_REFUND)
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() body: CreateRefundDto) {
    return this.svc.create(scope, actor, body.order_id, body.reason, body.amount);
  }

  @Get(":id")
  @RequirePermissions(CANTEEN_PERMISSIONS.REFUND_VIEW)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.svc.detail(scope, id);
  }

  @Post(":id/approve")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_REFUND)
  approve(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.svc.approve(scope, actor, id);
  }

  @Post(":id/reject")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_REFUND)
  reject(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.svc.reject(scope, actor, id);
  }
}
