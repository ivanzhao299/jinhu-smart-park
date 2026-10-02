import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseInterceptors
} from "@nestjs/common";
import type { Request } from "express";
import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { Public } from "../../shared/decorators/public.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import { CanteenOrderQueryService } from "./canteen-order-query.service";
import { CanteenWebhookService } from "./canteen-webhook.service";
import { CanteenPaymentRegistry } from "./payment/canteen-payment-registry";

@Controller("canteen")
export class CanteenPaymentController {
  constructor(
    private readonly orderQuery: CanteenOrderQueryService,
    private readonly webhooks: CanteenWebhookService,
    private readonly registry: CanteenPaymentRegistry
  ) {}

  /* ---------------- 支付查询（登录态） ---------------- */

  @Get("payments/:no")
  @RequirePermissions(CANTEEN_PERMISSIONS.PAYMENT_VIEW)
  detail(@CurrentScope() scope: TenantParkScope, @Param("no") no: string) {
    return this.orderQuery.paymentDetail(scope, no);
  }

  /** POS 轮询支付状态（api.md 指定 order:create）。 */
  @Get("payments/:no/status")
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_CREATE)
  status(@CurrentScope() scope: TenantParkScope, @Param("no") no: string) {
    return this.orderQuery.paymentStatus(scope, no);
  }

  /* ---------------- 真实渠道异步回调（公开 + 验签） ---------------- */

  @Public()
  @Post("webhooks/payments/:provider")
  async webhook(@Param("provider") provider: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const headers: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headers[k.toLowerCase()] = v;
    }
    const result = await this.webhooks.handle(provider, headers, body ?? {});
    // 渠道要求 200，否则重试。
    return { code: result.code };
  }

  /* ---------------- Mock 内部模拟回调（仅 MOCK 启用） ----------------
   * 供前端演示 / 测试触发：内部构造合法签名后走与真实 webhook 完全相同的应用服务。
   */

  @Post("internal/mock/payments/:no/settle")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_CREATE)
  async mockSettle(
    @Param("no") no: string,
    @Body() body: { buyer_payer_id?: string; trade_no?: string } = {}
  ) {
    this.assertMockEnabled();
    const payment = await this.orderQuery.paymentDetailNoScope(no);
    const signer = this.registry.mockSigner();
    const status = "TRADE_SUCCESS";
    const headers = { "x-canteen-mock-sign": signer.sign(no, status) };
    return this.webhooks.handle("mock", headers, {
      out_trade_no: no,
      trade_status: status,
      trade_no: body.trade_no ?? `MOCK_TXN_${no}`,
      total_amount: payment.amount,
      buyer_payer_id: body.buyer_payer_id
    });
  }

  @Post("internal/mock/payments/:no/close")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_CREATE)
  async mockClose(@Param("no") no: string) {
    this.assertMockEnabled();
    const payment = await this.orderQuery.paymentDetailNoScope(no);
    const signer = this.registry.mockSigner();
    const status = "TRADE_CLOSED";
    const headers = { "x-canteen-mock-sign": signer.sign(no, status) };
    return this.webhooks.handle("mock", headers, {
      out_trade_no: no,
      trade_status: status,
      trade_no: `MOCK_CLOSE_${no}`,
      total_amount: payment.amount
    });
  }

  private assertMockEnabled() {
    if (!this.registry.mockEnabled) {
      throw new BadRequestException("mock payment endpoints disabled (CANTEEN_PAYMENT_DRIVER!=mock)");
    }
  }
}
