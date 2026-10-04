import { Injectable } from "@nestjs/common";

/**
 * Canteen 支付适配器端口（M0 脚手架）。
 * 基线：不内置真实商户号/密钥；dev 用 MockProvider，生产再接微信 Native / 支付宝当面付。
 */
export interface CanteenPaymentProvider {
  readonly provider: string;
  precreate(orderNo: string, amountCents: number): Promise<{ codeUrl: string; prepayId: string }>;
}

@Injectable()
export class CanteenPaymentProviderAdapter implements CanteenPaymentProvider {
  readonly provider = "mock";

  async precreate(_orderNo: string, _amountCents: number) {
    return { codeUrl: "", prepayId: "" };
  }
}
