/**
 * Canteen 支付适配器端口（与冻结基线 §6.1 对齐）。
 *
 * 不内置任何真实商户号/密钥：微信 Native / 支付宝当面付的商户配置一律从
 * env / 密钥管理注入；dev/test 默认使用 MockCanteenPaymentProvider。
 *
 * 本端口只抽象“真实扫码收款”能力；补贴虚拟核销不经过本端口。
 */

/** createCode 入参：一笔待支付订单与对应的支付流水。 */
export interface CanteenCreateCodeInput {
  orderNo: string;
  paymentNo: string;
  outletId: string;
  /** 应付金额，单位元（字符串，numeric(12,2)）。 */
  amount: string;
  subject: string;
  /** 支付单超时秒数（二维码有效期）。 */
  ttlSeconds: number;
  /** 幂等键（来自前端 Idempotency-Key 或后端生成）。 */
  idempotencyKey: string;
}

export interface CanteenCreateCodeResult {
  /** 支付渠道标识：wechat / alipay / mock。 */
  provider: string;
  /** 预下单/交易 prepay id（渠道侧）。 */
  prepayId: string;
  /** 二维码串/code_url（微信 weixin:// 或支付宝 https://qr.alipay.com/...）。 */
  codeUrl: string;
  /** 实际超时秒数。 */
  expiresInSeconds: number;
  /** 渠道侧透传的备用字段。 */
  raw?: Record<string, unknown>;
}

/** 回调验签 + 解析后的标准化结果。 */
export interface CanteenVerifiedCallback {
  /** 商户单号（payment_no）。 */
  paymentNo: string;
  /** 渠道交易号。 */
  providerTransactionId: string;
  /** 标准化后的交易终态。 */
  tradeStatus: "success" | "closed" | "refunded" | "waiting";
  /** 金额（元，字符串），用于与库内金额对账。 */
  amount: string;
  buyerPayerId: string | null;
  /** 原始报文，落 callback_payload。 */
  payload: Record<string, unknown>;
}

export interface CanteenQueryStatusResult {
  tradeStatus: "success" | "closed" | "refunded" | "waiting";
  providerTransactionId: string | null;
  amount: string;
}

export interface CanteenRefundInput {
  paymentNo: string;
  providerTransactionId: string;
  refundNo: string;
  /** 退款金额（元，字符串）。 */
  amount: string;
  reason: string;
}

export interface CanteenRefundResult {
  refundId: string;
  status: "success" | "pending" | "failed";
  raw?: Record<string, unknown>;
}

/** 支付适配器端口。 */
export interface CanteenPaymentProvider {
  /** 渠道名：wechat / alipay / mock。 */
  readonly provider: string;

  /** 预下单：生成收款码。 */
  createCode(input: CanteenCreateCodeInput): Promise<CanteenCreateCodeResult>;

  /**
   * 验签并解析回调报文。验签失败必须抛 UnauthorizedException 语义错误。
   * @param headers 原始请求头（签名/时间戳等）。
   * @param body 原始报文。
   */
  verifyCallback(
    provider: string,
    headers: Record<string, unknown>,
    body: Record<string, unknown>
  ): Promise<CanteenVerifiedCallback>;

  /** 主动查询单笔支付状态（对账/兜底）。 */
  queryStatus(paymentNo: string): Promise<CanteenQueryStatusResult>;

  /** 原路退款。M1 仅实现骨架/默认实现。 */
  refund(input: CanteenRefundInput): Promise<CanteenRefundResult>;
}

/** 真实渠道未配置时抛出的业务错误（502 支付渠道异常语义）。 */
export class CanteenPaymentNotConfiguredError extends Error {
  readonly code = "PAYMENT_PROVIDER_NOT_CONFIGURED";
  constructor(public readonly provider: string, message: string) {
    super(`[${provider}] payment provider not configured: ${message}`);
    this.name = "CanteenPaymentNotConfiguredError";
  }
}
