import { Injectable } from "@nestjs/common";
import {
  CanteenPaymentNotConfiguredError,
  type CanteenCreateCodeInput,
  type CanteenCreateCodeResult,
  type CanteenPaymentProvider,
  type CanteenQueryStatusResult,
  type CanteenRefundInput,
  type CanteenRefundResult,
  type CanteenVerifiedCallback
} from "./canteen-payment-provider.port";

/**
 * 支付宝当面付（precreate）适配器骨架。
 *
 * 配置全部来自环境变量（.env 占位，不含真值）：
 *   CANTEEN_ALIPAY_APP_ID / CANTEEN_ALIPAY_PRIVATE_KEY / CANTEEN_ALIPAY_PUBLIC_KEY /
 *   CANTEEN_ALIPAY_GATEWAY / CANTEEN_ALIPAY_NOTIFY_URL
 *
 * M1 只交付端口骨架：未配置时抛 CanteenPaymentNotConfiguredError，不影响 Mock。
 * 严禁硬编码 app_id / 商户私钥 / 支付宝公钥。
 */
@Injectable()
export class AlipayFaceCanteenProvider implements CanteenPaymentProvider {
  readonly provider = "alipay";

  private readonly config: {
    appId?: string;
    privateKey?: string;
    publicKey?: string;
    gateway?: string;
    notifyUrl?: string;
  };

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.config = {
      appId: env.CANTEEN_ALIPAY_APP_ID,
      privateKey: env.CANTEEN_ALIPAY_PRIVATE_KEY,
      publicKey: env.CANTEEN_ALIPAY_PUBLIC_KEY,
      gateway: env.CANTEEN_ALIPAY_GATEWAY,
      notifyUrl: env.CANTEEN_ALIPAY_NOTIFY_URL
    };
  }

  private assertConfigured(): void {
    const { appId, privateKey, publicKey } = this.config;
    const missing: string[] = [];
    if (!appId) missing.push("CANTEEN_ALIPAY_APP_ID");
    if (!privateKey) missing.push("CANTEEN_ALIPAY_PRIVATE_KEY");
    if (!publicKey) missing.push("CANTEEN_ALIPAY_PUBLIC_KEY");
    if (missing.length > 0) {
      throw new CanteenPaymentNotConfiguredError(this.provider, `missing env: ${missing.join(", ")}`);
    }
  }

  async createCode(_input: CanteenCreateCodeInput): Promise<CanteenCreateCodeResult> {
    // TODO(M3+): alipay.trade.precreate → qr_code。
    this.assertConfigured();
    throw new CanteenPaymentNotConfiguredError(this.provider, "alipay precreate not implemented");
  }

  async verifyCallback(
    _provider: string,
    _headers: Record<string, unknown>,
    _body: Record<string, unknown>
  ): Promise<CanteenVerifiedCallback> {
    // TODO(M3+): RSA2 验签 trade_status/out_trade_no/total_amount。
    this.assertConfigured();
    throw new CanteenPaymentNotConfiguredError(this.provider, "alipay callback verify not implemented");
  }

  async queryStatus(_paymentNo: string): Promise<CanteenQueryStatusResult> {
    this.assertConfigured();
    throw new CanteenPaymentNotConfiguredError(this.provider, "alipay queryStatus not implemented");
  }

  async refund(_input: CanteenRefundInput): Promise<CanteenRefundResult> {
    this.assertConfigured();
    throw new CanteenPaymentNotConfiguredError(this.provider, "alipay refund not implemented");
  }
}
