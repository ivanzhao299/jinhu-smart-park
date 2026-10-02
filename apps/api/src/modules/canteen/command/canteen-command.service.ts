import { Injectable } from "@nestjs/common";

/**
 * Canteen 写侧命令服务占位（M0 脚手架）。
 * M1+ 在此实现：POS 下单、虚拟核销、退款红冲、补贴发放/清零、结算推进等写事务。
 */
@Injectable()
export class CanteenCommandService {
  readonly module = "canteen";
  readonly layer = "command";
}
