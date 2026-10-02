import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource, EntityManager, Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CheckoutQrDto } from "./dto/canteen.dto";
import { CanteenCashierSessionEntity } from "./entities/canteen-cashier-session.entity";
import { CanteenDishEntity } from "./entities/canteen-dish.entity";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenOrderItemEntity } from "./entities/canteen-order-item.entity";
import { CanteenOutletEntity } from "./entities/canteen-outlet.entity";
import { CanteenPaymentEntity } from "./entities/canteen-payment.entity";
import { CanteenStatusLogEntity } from "./entities/canteen-status-log.entity";
import { CanteenNumberService } from "./canteen-number.service";
import { addYuan, multiplyYuan, yuanToCents } from "./canteen-money.util";
import { CanteenPaymentRegistry } from "./payment/canteen-payment-registry";

export interface QrCheckoutResult {
  order_no: string;
  payment_no: string;
  status: "pending";
  code_url: string;
  provider: string;
  expires_in: number;
  pay_amount: string;
}

/**
 * POS 二维码真实收款下单（冻结流程 §6.1）。
 * 事务内：建 order(pending,channel=qr_pay) + order_items + payment(pending)，
 * 调支付适配器出码，返回 order_no/payment_no/code_url/超时秒数。
 */
@Injectable()
export class CanteenCheckoutService {
  readonly ttlSeconds: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly numbers: CanteenNumberService,
    private readonly registry: CanteenPaymentRegistry,
    @InjectRepository(CanteenDishEntity) dishRepo: Repository<CanteenDishEntity>,
    @InjectRepository(CanteenOutletEntity) outletRepo: Repository<CanteenOutletEntity>,
    @InjectRepository(CanteenOrderEntity) orderRepo: Repository<CanteenOrderEntity>,
    @InjectRepository(CanteenPaymentEntity) paymentRepo: Repository<CanteenPaymentEntity>,
    @InjectRepository(CanteenCashierSessionEntity) sessionRepo: Repository<CanteenCashierSessionEntity>
  ) {
    this.ttlSeconds = Number(process.env.CANTEEN_PAYMENT_TTL_SECONDS ?? 120);
  }

  async checkoutQr(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CheckoutQrDto,
    idempotencyKey: string
  ): Promise<QrCheckoutResult> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException("items must not be empty");
    }

    return this.dataSource.transaction(async (manager) => {
      const outlet = await manager.findOne(CanteenOutletEntity, {
        where: { id: dto.outlet_id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!outlet) throw new NotFoundException("outlet not found");
      if (outlet.status !== "open") throw new BadRequestException("outlet is not open");

      // 取餐品并按快照计价（where in）。
      const dishIds = dto.items.map((i) => i.dish_id);
      const dishesLoaded = await manager
        .createQueryBuilder(CanteenDishEntity, "d")
        .where("d.tenant_id = :tenantId AND d.park_id = :parkId AND d.is_deleted = false AND d.outlet_id = :outletId", {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          outletId: dto.outlet_id
        })
        .andWhere("d.id IN (:...ids)", { ids: dishIds })
        .getMany();

      const dishMap = new Map(dishesLoaded.map((d) => [d.id, d]));
      let totalCents = 0;
      const itemRows: Array<Partial<CanteenOrderItemEntity>> = [];

      for (const line of dto.items) {
        const dish = dishMap.get(line.dish_id);
        if (!dish) throw new BadRequestException(`dish ${line.dish_id} not found in outlet`);
        if (dish.status !== "on_shelf") throw new BadRequestException(`dish ${dish.name} is off_shelf`);
        // 库存校验（daily_stock 非 null 时）。
        if (dish.dailyStock !== null && dish.dailyStock - dish.soldCount < line.qty) {
          throw new BadRequestException(`dish ${dish.name} out of stock`);
        }
        const lineAmount = multiplyYuan(dish.price, line.qty);
        totalCents += yuanToCents(lineAmount);
        itemRows.push({
          dishId: dish.id,
          dishNameSnapshot: dish.name,
          priceSnapshot: dish.price,
          qty: line.qty,
          amount: lineAmount,
          categorySnapshot: null
        });
      }

      const totalAmount = (totalCents / 100).toFixed(2);
      const payAmount = totalAmount;

      // 关联当前开班班次（若存在）。
      const openSession = await manager.findOne(CanteenCashierSessionEntity, {
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          outletId: dto.outlet_id,
          cashierUserId: actor.sub,
          status: "open",
          isDeleted: false
        }
      });

      const orderNo = await this.numbers.orderNo(manager, scope.tenantId);
      const paymentNo = await this.numbers.paymentNo(manager, scope.tenantId);

      // 业务日期 = 本地今天；餐段按小时粗分。
      const now = new Date();
      const businessDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const hour = now.getHours();
      const mealPeriod = hour < 10 ? "breakfast" : hour < 15 ? "lunch" : "dinner";

      const order = manager.create(CanteenOrderEntity, {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        orderNo,
        outletId: outlet.id,
        contractorId: outlet.contractorId,
        businessDate,
        mealPeriod,
        cashierUserId: actor.sub,
        cashierSessionId: openSession?.id ?? null,
        channel: "qr_pay",
        totalAmount,
        discountAmount: "0.00",
        payAmount,
        // qr_pay 通道整单预期走真实收款，建单即按应付预占 qr_pay_amount，
        // 以满足 DB CHECK：subsidy_amount + qr_pay_amount = pay_amount。
        qrPayAmount: payAmount,
        subsidyAmount: "0.00",
        status: "pending",
        paidTime: null,
        voidTime: null,
        voidReason: null,
        refundStatus: null,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const savedOrder = await manager.save(order);

      for (const row of itemRows) {
        await manager.save(
          manager.create(CanteenOrderItemEntity, {
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            orderId: savedOrder.id,
            dishId: row.dishId!,
            dishNameSnapshot: row.dishNameSnapshot!,
            priceSnapshot: row.priceSnapshot!,
            qty: row.qty!,
            amount: row.amount!,
            categorySnapshot: row.categorySnapshot ?? null,
            createBy: actor.sub
          })
        );
        // 占用库存（sold_count + qty）。
        const dish = dishMap.get(row.dishId!)!;
        dish.soldCount += row.qty!;
        await manager.save(dish);
      }

      // 调适配器出码（未配置真实渠道会抛 NotConfigured → 502）。
      const provider = this.registry.defaultProvider();
      const code = await provider.createCode({
        orderNo,
        paymentNo,
        outletId: outlet.id,
        amount: payAmount,
        subject: `餐费 ${orderNo}`,
        ttlSeconds: this.ttlSeconds,
        idempotencyKey
      });

      const payment = manager.create(CanteenPaymentEntity, {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        paymentNo,
        orderId: savedOrder.id,
        outletId: outlet.id,
        provider: code.provider,
        tradeType: "native",
        codeUrl: code.codeUrl,
        qrCodeId: null,
        amount: payAmount,
        currency: "CNY",
        status: "pending",
        providerTransactionId: null,
        buyerPayerId: null,
        paidTime: null,
        callbackTime: null,
        callbackPayload: null,
        idempotencyKey,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      await manager.save(payment);

      await manager.save(
        manager.create(CanteenStatusLogEntity, {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          entityType: "order",
          entityId: savedOrder.id,
          beforeStatus: null,
          afterStatus: "pending",
          action: "order_created",
          reason: null,
          operatorUserId: actor.sub,
          operatorName: actor.realName ?? actor.username,
          opTime: new Date()
        })
      );

      return {
        order_no: orderNo,
        payment_no: paymentNo,
        status: "pending",
        code_url: code.codeUrl,
        provider: code.provider,
        expires_in: code.expiresInSeconds,
        pay_amount: payAmount
      };
    });
  }
}
