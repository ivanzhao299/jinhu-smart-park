import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  type CanteenCreateCodeInput,
  type CanteenCreateCodeResult,
  type CanteenPaymentProvider,
  type CanteenQueryStatusResult,
  type CanteenRefundInput,
  type CanteenRefundResult,
  type CanteenVerifiedCallback
} from "./canteen-payment-provider.port";

/**
 * Mock 支付适配器（仅 dev/test/演示用）。
 *
 * - createCode：生成确定性伪 code_url（同一 payment_no 恒定），便于前端演示与测试断言。
 * - verifyCallback：用开发头 `x-canteen-mock-sign` 做“验签占位”，值为
 *   sha256(paymentNo + ":" + tradeStatus + ":" + MOCK_SIGN_SECRET)，缺失/不符一律 401 语义。
 * - 真实 webhook 与内部 /internal/mock/payments/{no}/settle 走完全相同的应用服务。
 */
@Injectable()
export class MockCanteenPaymentProvider implements CanteenPaymentProvider {
  readonly provider = "mock";

  /** 与 canteen-payment.module 的 token 对齐：mock 签名密钥。 */
  constructor(private readonly signSecret: string = "dev-mock-secret") {}

  async createCode(input: CanteenCreateCodeInput): Promise<CanteenCreateCodeResult> {
    const token = createHash("sha256")
      .update(`${input.paymentNo}:${input.amount}:mock`)
      .digest("hex")
      .slice(0, 24);
    return {
      provider: this.provider,
      prepayId: `mock_prepay_${token}`,
      codeUrl: `https://mock-pay.local/canteen?prepay_id=mock_prepay_${token}&amount=${encodeURIComponent(input.amount)}`,
      expiresInSeconds: input.ttlSeconds,
      raw: { deterministic: true }
    };
  }

  /** 生成供演示/测试调用的“合法 mock 签名”。 */
  sign(paymentNo: string, tradeStatus: string): string {
    return createHash("sha256")
      .update(`${paymentNo}:${tradeStatus}:${this.signSecret}`)
      .digest("hex");
  }

  async verifyCallback(
    provider: string,
    headers: Record<string, unknown>,
    body: Record<string, unknown>
  ): Promise<CanteenVerifiedCallback> {
    const paymentNo = typeof body.out_trade_no === "string" ? body.out_trade_no : "";
    const tradeStatusRaw = typeof body.trade_status === "string" ? body.trade_status : "";
    const tradeStatus = normalizeMockStatus(tradeStatusRaw);
    const expected = this.sign(paymentNo, tradeStatusRaw);
    const provided = headers["x-canteen-mock-sign"];
    if (typeof provided !== "string" || provided !== expected) {
      throw new Error("MOCK_CALLBACK_SIGN_INVALID");
    }
    if (!paymentNo || tradeStatus === "waiting") {
      throw new Error("MOCK_CALLBACK_PAYLOAD_INVALID");
    }
    return {
      paymentNo,
      providerTransactionId:
        typeof body.trade_no === "string" && body.trade_no ? body.trade_no : `MOCK_TXN_${paymentNo}`,
      tradeStatus,
      amount: typeof body.total_amount === "string" ? body.total_amount : String(body.total_amount ?? ""),
      buyerPayerId:
        typeof body.buyer_payer_id === "string" ? body.buyer_payer_id : `mock_user_${paymentNo.slice(-6)}`,
      payload: body
    };
  }

  async queryStatus(_paymentNo: string): Promise<CanteenQueryStatusResult> {
    // Mock 无渠道侧状态机，由库内状态为准。
    return { tradeStatus: "waiting", providerTransactionId: null, amount: "0.00" };
  }

  async refund(_input: CanteenRefundInput): Promise<CanteenRefundResult> {
    return { refundId: `mock_refund_${Date.now()}`, status: "success" };
  }
}

function normalizeMockStatus(raw: string): CanteenVerifiedCallback["tradeStatus"] {
  if (raw === "TRADE_SUCCESS" || raw === "SUCCESS") return "success";
  if (raw === "TRADE_CLOSED" || raw === "CLOSED") return "closed";
  if (raw === "TRADE_FINISHED" || raw === "REFUND") return "refunded";
  return "waiting";
}
