import { Injectable } from "@nestjs/common";

/**
 * Canteen 顶层服务占位（M0 脚手架）。M1+ 在此编排 command/query/policy/adapter。
 */
@Injectable()
export class CanteenService {
  health() {
    return { module: "canteen", status: "ok", milestone: "M0" };
  }
}
