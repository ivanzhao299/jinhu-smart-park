import { Injectable, OnModuleInit, Optional } from "@nestjs/common";
import { CanteenPaymentNotConfiguredError, type CanteenPaymentProvider } from "./canteen-payment-provider.port";
import { MockCanteenPaymentProvider } from "./mock-canteen-payment.provider";
import { WechatNativeCanteenProvider } from "./wechat-native.provider";
import { AlipayFaceCanteenProvider } from "./alipay-face.provider";

/**
 * 支付适配器注册表。
 *
 * 驱动选择：env CANTEEN_PAYMENT_DRIVER ∈ mock | wechat | alipay，默认 mock。
 * - checkout 出码使用“默认渠道”（= driver）。
 * - webhook 按路径 :provider 路由到对应适配器验签。
 * - 真实渠道未配置时，其 createCode/verifyCallback 抛 NotConfigured，绝不影响 Mock。
 */
@Injectable()
export class CanteenPaymentRegistry implements OnModuleInit {
  readonly driver: string;
  readonly mockEnabled: boolean;
  private readonly providers = new Map<string, CanteenPaymentProvider>();

  constructor(@Optional() env: NodeJS.ProcessEnv = process.env) {
    this.driver = (env.CANTEEN_PAYMENT_DRIVER || "mock").toLowerCase();
    this.mockEnabled = this.driver === "mock" || env.CANTEEN_MOCK_PAYMENT_ENABLED === "true";
    const mock = new MockCanteenPaymentProvider(env.CANTEEN_MOCK_SIGN_SECRET || "dev-mock-secret");
    this.providers.set("mock", mock);
    this.providers.set("wechat", new WechatNativeCanteenProvider(env));
    this.providers.set("alipay", new AlipayFaceCanteenProvider(env));
  }

  onModuleInit(): void {
    // 启动期不抛错：真实渠道未配置仅在被调用时才报 NotConfigured。
  }

  /** 演示/测试用：取 mock 签名器。 */
  mockSigner(): MockCanteenPaymentProvider {
    return this.providers.get("mock") as MockCanteenPaymentProvider;
  }

  /** checkout 默认出码渠道。 */
  defaultProvider(): CanteenPaymentProvider {
    const provider = this.providers.get(this.driver);
    if (!provider) {
      throw new CanteenPaymentNotConfiguredError(this.driver, `unknown driver`);
    }
    return provider;
  }

  /** webhook 按 provider 路由。 */
  get(provider: string): CanteenPaymentProvider {
    const normalized = provider.toLowerCase();
    const impl = this.providers.get(normalized);
    if (!impl) {
      throw new CanteenPaymentNotConfiguredError(normalized, `unknown provider`);
    }
    return impl;
  }
}
