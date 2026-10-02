import { Injectable, UnauthorizedException } from "@nestjs/common";
import { CanteenPaymentNotConfiguredError } from "./payment/canteen-payment-provider.port";
import { CanteenPaymentRegistry } from "./payment/canteen-payment-registry";
import { CanteenPaymentAppService } from "./canteen-payment-app.service";

export interface WebhookHandleResult {
  code: "OK" | "DUPLICATE" | "IGNORED";
  paymentStatus?: string;
  orderStatus?: string;
}

/**
 * 统一回调入口：POST /api/canteen/webhooks/payments/:provider。
 * 公开路由（不登录态）；先验签，再按 provider_transaction_id/幂等键幂等落账。
 * 真实微信/支付宝未配置时抛 NotConfigured（由过滤器映射 502）。
 */
@Injectable()
export class CanteenWebhookService {
  constructor(
    private readonly registry: CanteenPaymentRegistry,
    private readonly paymentApp: CanteenPaymentAppService
  ) {}

  async handle(provider: string, headers: Record<string, unknown>, body: Record<string, unknown>): Promise<WebhookHandleResult> {
    const impl = this.registry.get(provider);

    let verified;
    try {
      verified = await impl.verifyCallback(provider, headers, body);
    } catch (err) {
      if (err instanceof CanteenPaymentNotConfiguredError) throw err;
      // 验签失败一律 401 语义。
      throw new UnauthorizedException("callback signature invalid");
    }

    if (verified.tradeStatus === "waiting") {
      return { code: "IGNORED" };
    }

    if (verified.tradeStatus === "success") {
      const outcome = await this.paymentApp.runInTransaction((manager) =>
        this.paymentApp.applySuccess(manager, {
          paymentNo: verified.paymentNo,
          providerTransactionId: verified.providerTransactionId,
          amount: verified.amount,
          buyerPayerId: verified.buyerPayerId,
          payload: verified.payload
        })
      );
      return outcome.applied
        ? { code: "OK", paymentStatus: outcome.paymentStatus, orderStatus: outcome.orderStatus }
        : { code: "DUPLICATE", paymentStatus: outcome.paymentStatus, orderStatus: outcome.orderStatus };
    }

    // closed / refunded 都走关单落账（M1 退款走退款单，这里仅处理关闭）。
    const outcome = await this.paymentApp.runInTransaction((manager) =>
      this.paymentApp.applyClosed(manager, {
        paymentNo: verified.paymentNo,
        reason: `callback:${verified.tradeStatus}`,
        operatorName: "payment-platform"
      })
    );
    return outcome.applied
      ? { code: "OK", paymentStatus: outcome.paymentStatus, orderStatus: outcome.orderStatus }
      : { code: "DUPLICATE", paymentStatus: outcome.paymentStatus, orderStatus: outcome.orderStatus };
  }
}
