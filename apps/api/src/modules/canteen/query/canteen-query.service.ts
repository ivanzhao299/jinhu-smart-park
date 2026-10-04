import { Injectable } from "@nestjs/common";

/**
 * Canteen 读侧查询服务占位（M0 脚手架）。
 * M1+ 在此实现：订单/流水/报表/看板等只读聚合查询（注入 tenant/park/data-scope）。
 */
@Injectable()
export class CanteenQueryService {
  readonly module = "canteen";
  readonly layer = "query";
}
