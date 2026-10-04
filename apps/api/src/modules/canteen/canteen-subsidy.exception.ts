import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * 补贴余额不足（HTTP 422 业务校验失败）。
 * api.md：余额不足时返回 422 { code: INSUFFICIENT_SUBSIDY, balance, need, suggest:"mixed" }。
 */
export class InsufficientSubsidyException extends HttpException {
  constructor(balance: string, need: string, suggest: "mixed" | "qr_pay" = "mixed") {
    super(
      {
        code: "INSUFFICIENT_SUBSIDY",
        message: "subsidy balance is not enough",
        balance,
        need,
        suggest
      },
      HttpStatus.UNPROCESSABLE_ENTITY
    );
  }
}
