import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from "@nestjs/common";
import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import { OrderQueryDto } from "./dto/canteen.dto";
import { CanteenOrderQueryService } from "./canteen-order-query.service";

@Controller("canteen/orders")
export class CanteenOrderController {
  constructor(private readonly orderQuery: CanteenOrderQueryService) {}

  @Get()
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_VIEW)
  list(@CurrentScope() scope: TenantParkScope, @Query() query: OrderQueryDto) {
    return this.orderQuery.list(scope, query);
  }

  @Get(":id")
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_VIEW)
  detail(
    @CurrentScope() scope: TenantParkScope,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ) {
    return this.orderQuery.detail(scope, id);
  }

  @Get(":id/items")
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_VIEW)
  items(
    @CurrentScope() scope: TenantParkScope,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ) {
    return this.orderQuery.items(scope, id);
  }

  // M1 不实现 cancel/refund（M4 退款撤单硬化）；保留占位以免路由歧义。
  @Post(":id/cancel")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_CANCEL)
  cancelPlaceholder() {
    // M1 仅 pending 撤单可在超时关单中自然覆盖；主动撤单留待 M4。
    return { note: "cancel lands in M4; use timeout close for un-paid orders" };
  }
}
