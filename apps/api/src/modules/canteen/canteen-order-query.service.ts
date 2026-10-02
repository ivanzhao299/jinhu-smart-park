import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { Repository } from "typeorm";
import type { OrderQueryDto } from "./dto/canteen.dto";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenOrderItemEntity } from "./entities/canteen-order-item.entity";
import { CanteenPaymentEntity } from "./entities/canteen-payment.entity";

/** 订单读侧：分页列表 / 详情(含 items + payment)。 */
@Injectable()
export class CanteenOrderQueryService {
  constructor(
    @InjectRepository(CanteenOrderEntity)
    private readonly orderRepo: Repository<CanteenOrderEntity>,
    @InjectRepository(CanteenOrderItemEntity)
    private readonly orderItemRepo: Repository<CanteenOrderItemEntity>,
    @InjectRepository(CanteenPaymentEntity)
    private readonly paymentRepo: Repository<CanteenPaymentEntity>
  ) {}

  async list(scope: TenantParkScope, query: OrderQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const qb = this.orderRepo
      .createQueryBuilder("o")
      .where("o.tenant_id = :t AND o.park_id = :p AND o.is_deleted = false", {
        t: scope.tenantId,
        p: scope.parkId
      });
    if (query.outlet_id) qb.andWhere("o.outlet_id = :outletId", { outletId: query.outlet_id });
    if (query.business_date) qb.andWhere("o.business_date = :date", { date: query.business_date });
    if (query.status) qb.andWhere("o.status = :status", { status: query.status });
    if (query.channel) qb.andWhere("o.channel = :channel", { channel: query.channel });
    if (query.contractor_id) qb.andWhere("o.contractor_id = :cid", { cid: query.contractor_id });

    qb.orderBy("o.createTime", "DESC").skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async detail(scope: TenantParkScope, id: string) {
    const order = await this.orderRepo.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!order) throw new NotFoundException("order not found");
    const items = await this.orderItemRepo.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, orderId: id, isDeleted: false },
      order: { createTime: "ASC" }
    });
    const payments = await this.paymentRepo.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, orderId: id, isDeleted: false }
    });
    return { ...order, items, payments };
  }

  async items(scope: TenantParkScope, id: string) {
    await this.detail(scope, id);
    return this.orderItemRepo.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, orderId: id, isDeleted: false },
      order: { createTime: "ASC" }
    });
  }

  /** POS 轮询：按 payment_no 返回 payment 与 order 状态。 */
  async paymentStatus(scope: TenantParkScope, paymentNo: string) {
    const payment = await this.paymentRepo.findOne({
      where: { paymentNo, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!payment) throw new NotFoundException("payment not found");
    const order = await this.orderRepo.findOne({ where: { id: payment.orderId, isDeleted: false } });
    return {
      payment_no: payment.paymentNo,
      status: payment.status,
      paid_time: payment.paidTime,
      order_status: order?.status ?? null,
      amount: payment.amount
    };
  }

  async paymentDetail(scope: TenantParkScope, paymentNo: string) {
    const payment = await this.paymentRepo.findOne({
      where: { paymentNo, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!payment) throw new NotFoundException("payment not found");
    return payment;
  }

  /** 内部 mock 触发口按 payment_no 直查（仅限 mock 启用、已鉴权调用）。 */
  async paymentDetailNoScope(paymentNo: string) {
    const payment = await this.paymentRepo.findOne({
      where: { paymentNo, isDeleted: false }
    });
    if (!payment) throw new NotFoundException("payment not found");
    return payment;
  }
}
