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
 * 微信 Native（扫码支付）适配器骨架。
 *
 * 配置全部来自环境变量（.env 占位，不含真值）：
 *   CANTEEN_WECHAT_MCH_ID / CANTEEN_WECHAT_APPID / CANTEEN_WECHAT_API_V3_KEY /
 *   CANTEEN_WECHAT_SERIAL_NO / CANTEEN_WECHAT_PRIVATE_KEY_PATH / CANTEEN_WECHAT_NOTIFY_URL
 *
 * M1 只交付端口骨架：未配置完整商户凭证时，createCode/verifyCallback 一律抛
 * CanteenPaymentNotConfiguredError（502 语义），不影响 Mock 链路。
 * 严禁在此硬编码商户号/密钥/证书。
 */
@Injectable()
export class WechatNativeCanteenProvider implements CanteenPaymentProvider {
  readonly provider = "wechat";

  private readonly config: {
    mchId?: string;
    appId?: string;
    apiV3Key?: string;
    serialNo?: string;
    privateKeyPath?: string;
    notifyUrl?: string;
  };

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.config = {
      mchId: env.CANTEEN_WECHAT_MCH_ID,
      appId: env.CANTEEN_WECHAT_APPID,
      apiV3Key: env.CANTEEN_WECHAT_API_V3_KEY,
      serialNo: env.CANTEEN_WECHAT_SERIAL_NO,
      privateKeyPath: env.CANTEEN_WECHAT_PRIVATE_KEY_PATH,
      notifyUrl: env.CANTEEN_WECHAT_NOTIFY_URL
    };
  }

  private assertConfigured(): void {
    const { mchId, appId, apiV3Key, serialNo, privateKeyPath } = this.config;
    const missing: string[] = [];
    if (!mchId) missing.push("CANTEEN_WECHAT_MCH_ID");
    if (!appId) missing.push("CANTEEN_WECHAT_APPID");
    if (!apiV3Key) missing.push("CANTEEN_WECHAT_API_V3_KEY");
    if (!serialNo) missing.push("CANTEEN_WECHAT_SERIAL_NO");
    if (!privateKeyPath) missing.push("CANTEEN_WECHAT_PRIVATE_KEY_PATH");
    if (missing.length > 0) {
      throw new CanteenPaymentNotConfiguredError(this.provider, `missing env: ${missing.join(", ")}`);
    }
  }

  async createCode(_input: CanteenCreateCodeInput): Promise<CanteenCreateCodeResult> {
    // TODO(M3+): 调用微信 Native pay/unifiedorder，返回 code_url。
    this.assertConfigured();
    throw new CanteenPaymentNotConfiguredError(this.provider, "wechat native createCode not implemented");
  }

  async verifyCallback(
    _provider: string,
    _headers: Record<string, unknown>,
    _body: Record<string, unknown>
  ): Promise<CanteenVerifiedCallback> {
    // TODO(M3+): 验微信平台证书签名(AEAD)并解密 resource。
    this.assertConfigured();
    throw new CanteenPaymentNotConfiguredError(this.provider, "wechat callback verify not implemented");
  }

  async queryStatus(_paymentNo: string): Promise<CanteenQueryStatusResult> {
    this.assertConfigured();
    throw new CanteenPaymentNotConfiguredError(this.provider, "wechat queryStatus not implemented");
  }

  async refund(_input: CanteenRefundInput): Promise<CanteenRefundResult> {
    this.assertConfigured();
    throw new CanteenPaymentNotConfiguredError(this.provider, "wechat refund not implemented");
  }
}
