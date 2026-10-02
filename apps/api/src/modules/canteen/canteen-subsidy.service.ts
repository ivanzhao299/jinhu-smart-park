import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource, EntityManager, Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CheckoutSubsidyDto } from "./dto/canteen.dto";
import { CanteenCashierSessionEntity } from "./entities/canteen-cashier-session.entity";
import { CanteenDishEntity } from "./entities/canteen-dish.entity";
import { CanteenMealRecordEntity } from "./entities/canteen-meal-record.entity";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenOrderItemEntity } from "./entities/canteen-order-item.entity";
import { CanteenOutletEntity } from "./entities/canteen-outlet.entity";
import { CanteenPaymentEntity } from "./entities/canteen-payment.entity";
import { CanteenStatusLogEntity } from "./entities/canteen-status-log.entity";
import { CanteenSubsidyGrantEntity } from "./entities/canteen-subsidy-grant.entity";
import { CanteenWalletEntity } from "./entities/canteen-wallet.entity";
import { CanteenWalletTxnEntity } from "./entities/canteen-wallet-txn.entity";
import { CanteenNumberService } from "./canteen-number.service";
import { centsToYuan, multiplyYuan, yuanToCents } from "./canteen-money.util";
import { CanteenPaymentRegistry } from "./payment/canteen-payment-registry";
import { InsufficientSubsidyException } from "./canteen-subsidy.exception";
import { businessDateOf, maskName, mealPeriodOf, periodOf } from "./canteen-subsidy.util";

export interface LookupEmployeeResult {
  employee_user_id: string;
  employee_no: string;
  name_masked: string;
  period: string;
  period_grant: string;
  period_consumed: string;
  period_expired: string;
  period_balance: string;
  expire_date: string | null;
}

export interface SubsidyCheckoutResult {
  order_no: string;
  status: "paid" | "pending";
  channel: "subsidy" | "mixed";
  subsidy_amount: string;
  qr_pay_amount: string;
  balance_after: string;
  payment_no?: string;
  code_url?: string;
  provider?: string;
  expires_in?: number;
  pay_amount?: string;
}

interface ResolvedEmployee {
  user_id: string;
  display_name: string | null;
  employee_no: string;
}

interface BuiltOrder {
  outlet: CanteenOutletEntity;
  totalCents: number;
  totalAmount: string;
  businessDate: string;
  mealPeriod: string;
  openSession: CanteenCashierSessionEntity | null;
  itemRows: Array<{
    dishId: string;
    dishNameSnapshot: string;
    priceSnapshot: string;
    qty: number;
    amount: string;
    categorySnapshot: string | null;
  }>;
}

/**
 * 员工餐补：识别 / 虚拟结账（subsidy）/ 混合支付（mixed）/ 本人钱包查询。
 *
 * 严格分账：channel=subsidy 的虚拟部分不产生收款流水、不进公司真实账户；
 * channel=mixed 的补贴部分在二维码支付成功回调里才最终扣减并完成订单，
 * 二维码超时关单则不扣补贴（仅把预留的 meal_record 置 voided）。
 */
@Injectable()
export class CanteenSubsidyService {
  readonly ttlSeconds: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly numbers: CanteenNumberService,
    private readonly registry: CanteenPaymentRegistry,
    @InjectRepository(CanteenDishEntity) dishRepo: Repository<CanteenDishEntity>,
    @InjectRepository(CanteenOutletEntity) outletRepo: Repository<CanteenOutletEntity>,
    @InjectRepository(CanteenOrderEntity) orderRepo: Repository<CanteenOrderEntity>,
    @InjectRepository(CanteenPaymentEntity) paymentRepo: Repository<CanteenPaymentEntity>,
    @InjectRepository(CanteenCashierSessionEntity) sessionRepo: Repository<CanteenCashierSessionEntity>,
    @InjectRepository(CanteenWalletEntity) private readonly walletRepo: Repository<CanteenWalletEntity>,
    @InjectRepository(CanteenSubsidyGrantEntity) grantRepo: Repository<CanteenSubsidyGrantEntity>,
    @InjectRepository(CanteenWalletTxnEntity) private readonly txnRepo: Repository<CanteenWalletTxnEntity>,
    @InjectRepository(CanteenMealRecordEntity) mealRepo: Repository<CanteenMealRecordEntity>
  ) {
    this.ttlSeconds = Number(process.env.CANTEEN_PAYMENT_TTL_SECONDS ?? 120);
  }

  /* --------------------------- 员工识别 --------------------------- */

  async lookupEmployee(scope: TenantParkScope, code: string): Promise<LookupEmployeeResult> {
    const emp = await this.resolveEmployee(scope, code);
    const period = periodOf();
    const wallet = await this.walletRepo.findOne({
      where: { tenantId: scope.tenantId, employeeUserId: emp.user_id, isDeleted: false }
    });

    return {
      employee_user_id: emp.user_id,
      employee_no: emp.employee_no,
      name_masked: maskName(emp.display_name),
      period,
      period_grant: wallet?.periodGrant ?? "0.00",
      period_consumed: wallet?.periodConsumed ?? "0.00",
      period_expired: wallet?.periodExpired ?? "0.00",
      period_balance: wallet && wallet.period === period ? wallet.periodBalance : "0.00",
      expire_date: this.expireDate(wallet?.period ?? period)
    };
  }

  /* --------------------------- 虚拟结账 --------------------------- */

  async checkout(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CheckoutSubsidyDto,
    idempotencyKey: string
  ): Promise<SubsidyCheckoutResult> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException("items must not be empty");
    }
    const channel = dto.channel === "mixed" ? "mixed" : "subsidy";

    return this.dataSource.transaction(async (manager) => {
      const built = await this.buildOrder(manager, scope, actor, dto);
      const emp = await this.resolveEmployee(scope, dto.employee_code, manager);

      // 行锁读钱包（当前账期）。
      const wallet = await manager.findOne(CanteenWalletEntity, {
        where: {
          tenantId: scope.tenantId,
          employeeUserId: emp.user_id,
          isDeleted: false
        },
        lock: { mode: "pessimistic_write" }
      });

      const currentPeriod = periodOf();
      const walletBalanceCents =
        wallet && wallet.period === currentPeriod ? yuanToCents(wallet.periodBalance) : 0;
      const payCents = built.totalCents;

      if (channel === "subsidy") {
        // 纯虚拟结账：要求余额足额，当场扣减。
        if (!wallet || wallet.status !== "active" || walletBalanceCents < payCents) {
          throw new InsufficientSubsidyException(
            centsToYuan(walletBalanceCents),
            centsToYuan(payCents),
            "mixed"
          );
        }
        return this.settlePureSubsidy(manager, scope, actor, built, emp, wallet!, payCents, idempotencyKey);
      }

      // 混合支付：补贴扣满、差额走二维码真实收款；补贴在支付成功回调里才最终扣减。
      const subsidyCents = Math.min(walletBalanceCents, payCents);
      if (subsidyCents <= 0) {
        throw new InsufficientSubsidyException("0.00", centsToYuan(payCents), "qr_pay");
      }
      return this.createMixedOrder(manager, scope, actor, built, emp, subsidyCents, payCents, idempotencyKey);
    });
  }

  /** 纯补贴：事务内当场扣减钱包、写 consume 流水 + meal_record、订单 paid/completed，无真实 payment。 */
  private async settlePureSubsidy(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    built: BuiltOrder,
    emp: ResolvedEmployee,
    wallet: CanteenWalletEntity,
    payCents: number,
    _idempotencyKey: string
  ): Promise<SubsidyCheckoutResult> {
    const now = new Date();
    const period = periodOf();

    const newBalanceCents = yuanToCents(wallet.periodBalance) - payCents;
    wallet.periodConsumed = centsToYuan(yuanToCents(wallet.periodConsumed) + payCents);
    wallet.periodBalance = centsToYuan(newBalanceCents);
    wallet.updateBy = actor.sub;
    await manager.save(wallet);

    const orderNo = await this.numbers.orderNo(manager, scope.tenantId);
    const payAmount = centsToYuan(payCents);
    const order = manager.create(CanteenOrderEntity, {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      orderNo,
      outletId: built.outlet.id,
      contractorId: built.outlet.contractorId,
      businessDate: built.businessDate,
      mealPeriod: built.mealPeriod,
      cashierUserId: actor.sub,
      cashierSessionId: built.openSession?.id ?? null,
      channel: "subsidy",
      totalAmount: built.totalAmount,
      discountAmount: "0.00",
      payAmount,
      qrPayAmount: "0.00",
      subsidyAmount: payAmount,
      status: "paid",
      paidTime: now,
      voidTime: null,
      voidReason: null,
      refundStatus: null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const savedOrder = await manager.save(order);
    await this.writeOrderItems(manager, scope, actor, savedOrder.id, built);

    const recordNo = await this.numbers.mealRecordNo(manager, scope.tenantId);
    const meal = manager.create(CanteenMealRecordEntity, {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      recordNo,
      period,
      businessDate: built.businessDate,
      mealPeriod: built.mealPeriod,
      outletId: built.outlet.id,
      employeeUserId: emp.user_id,
      orderId: savedOrder.id,
      totalAmount: built.totalAmount,
      subsidyUsed: payAmount,
      qrPayAmount: "0.00",
      status: "normal",
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const savedMeal = await manager.save(meal);

    const grant = await manager.findOne(CanteenSubsidyGrantEntity, {
      where: { tenantId: scope.tenantId, employeeUserId: emp.user_id, period, isDeleted: false }
    });
    const txnNo = await this.numbers.walletTxnNo(manager, scope.tenantId);
    await manager.save(
      manager.create(CanteenWalletTxnEntity, {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        txnNo,
        walletId: wallet.id,
        grantId: grant?.id ?? null,
        period,
        employeeUserId: emp.user_id,
        type: "consume",
        amount: centsToYuan(-payCents),
        balanceAfter: centsToYuan(newBalanceCents),
        orderId: savedOrder.id,
        mealRecordId: savedMeal.id,
        operatorUserId: actor.sub,
        txnTime: now
      })
    );

    if (grant) {
      grant.status = newBalanceCents <= 0 ? "consumed" : "partially_consumed";
      grant.updateBy = actor.sub;
      await manager.save(grant);
    }

    await this.writeOrderLog(manager, savedOrder, null, "paid", "subsidy_checkout", actor);

    return {
      order_no: orderNo,
      status: "paid",
      channel: "subsidy",
      subsidy_amount: payAmount,
      qr_pay_amount: "0.00",
      balance_after: centsToYuan(newBalanceCents),
      pay_amount: payAmount
    };
  }

  /** 混合下单：建 pending mixed order + payment(差额) + 预留 meal_record；不扣钱包。 */
  private async createMixedOrder(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    built: BuiltOrder,
    emp: ResolvedEmployee,
    subsidyCents: number,
    payCents: number,
    idempotencyKey: string
  ): Promise<SubsidyCheckoutResult> {
    const now = new Date();
    const period = periodOf();
    const qrCents = payCents - subsidyCents;
    const subsidyAmount = centsToYuan(subsidyCents);
    const qrAmount = centsToYuan(qrCents);
    const payAmount = centsToYuan(payCents);

    const orderNo = await this.numbers.orderNo(manager, scope.tenantId);
    const order = manager.create(CanteenOrderEntity, {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      orderNo,
      outletId: built.outlet.id,
      contractorId: built.outlet.contractorId,
      businessDate: built.businessDate,
      mealPeriod: built.mealPeriod,
      cashierUserId: actor.sub,
      cashierSessionId: built.openSession?.id ?? null,
      channel: "mixed",
      totalAmount: built.totalAmount,
      discountAmount: "0.00",
      payAmount,
      qrPayAmount: qrAmount,
      subsidyAmount,
      status: "pending",
      paidTime: null,
      voidTime: null,
      voidReason: null,
      refundStatus: null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const savedOrder = await manager.save(order);
    await this.writeOrderItems(manager, scope, actor, savedOrder.id, built);

    // 预留用餐记录（关联员工）：成功回调据此扣补贴；关单则置 voided。
    const recordNo = await this.numbers.mealRecordNo(manager, scope.tenantId);
    const meal = manager.create(CanteenMealRecordEntity, {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      recordNo,
      period,
      businessDate: built.businessDate,
      mealPeriod: built.mealPeriod,
      outletId: built.outlet.id,
      employeeUserId: emp.user_id,
      orderId: savedOrder.id,
      totalAmount: built.totalAmount,
      subsidyUsed: subsidyAmount,
      qrPayAmount: qrAmount,
      status: "normal",
      createBy: actor.sub,
      updateBy: actor.sub
    });
    await manager.save(meal);

    // 差额出二维码（真实收款）。
    const paymentNo = await this.numbers.paymentNo(manager, scope.tenantId);
    const provider = this.registry.defaultProvider();
    const code = await provider.createCode({
      orderNo,
      paymentNo,
      outletId: built.outlet.id,
      amount: qrAmount,
      subject: `餐费(混合) ${orderNo}`,
      ttlSeconds: this.ttlSeconds,
      idempotencyKey
    });
    const payment = manager.create(CanteenPaymentEntity, {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      paymentNo,
      orderId: savedOrder.id,
      outletId: built.outlet.id,
      provider: code.provider,
      tradeType: "native",
      codeUrl: code.codeUrl,
      qrCodeId: null,
      amount: qrAmount,
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

    await this.writeOrderLog(manager, savedOrder, null, "pending", "mixed_order_created", actor);

    return {
      order_no: orderNo,
      status: "pending",
      channel: "mixed",
      subsidy_amount: subsidyAmount,
      qr_pay_amount: qrAmount,
      balance_after: centsToYuan(subsidyCents), // 占位：实际未扣，成功回调后才变更
      payment_no: paymentNo,
      code_url: code.codeUrl,
      provider: code.provider,
      expires_in: code.expiresInSeconds,
      pay_amount: payAmount
    };
  }

  /* ---------- 混合支付：成功回调里最终扣补贴 / 关单不扣补贴 ---------- */

  /**
   * 二维码支付成功后，对 channel=mixed 的订单最终扣减补贴并完成订单。
   * 由 CanteenPaymentAppService 在同一事务、订单 pending→completed 分支内调用。
   */
  async settleMixedOnPaymentSuccess(
    manager: EntityManager,
    order: CanteenOrderEntity,
    now: Date
  ): Promise<void> {
    const meal = await manager.findOne(CanteenMealRecordEntity, {
      where: { orderId: order.id, tenantId: order.tenantId, isDeleted: false }
    });
    if (!meal) return; // 防御：预留记录应存在

    const subsidyCents = yuanToCents(meal.subsidyUsed);
    if (subsidyCents <= 0) return;

    const wallet = await manager.findOne(CanteenWalletEntity, {
      where: { tenantId: order.tenantId, employeeUserId: meal.employeeUserId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!wallet) {
      throw new BadRequestException(`wallet not found for employee ${meal.employeeUserId}`);
    }

    const balanceCents = yuanToCents(wallet.periodBalance);
    const finalCents = Math.max(0, balanceCents - subsidyCents);
    wallet.periodConsumed = centsToYuan(yuanToCents(wallet.periodConsumed) + subsidyCents);
    wallet.periodBalance = centsToYuan(finalCents);
    await manager.save(wallet);

    const period = meal.period;
    const grant = await manager.findOne(CanteenSubsidyGrantEntity, {
      where: { tenantId: order.tenantId, employeeUserId: meal.employeeUserId, period, isDeleted: false }
    });
    const txnNo = await this.numbers.walletTxnNo(manager, order.tenantId);
    await manager.save(
      manager.create(CanteenWalletTxnEntity, {
        tenantId: order.tenantId,
        parkId: order.parkId,
        txnNo,
        walletId: wallet.id,
        grantId: grant?.id ?? null,
        period,
        employeeUserId: meal.employeeUserId,
        type: "consume",
        amount: centsToYuan(-subsidyCents),
        balanceAfter: centsToYuan(finalCents),
        orderId: order.id,
        mealRecordId: meal.id,
        operatorUserId: null,
        txnTime: now
      })
    );

    if (grant) {
      grant.status = finalCents <= 0 ? "consumed" : "partially_consumed";
      await manager.save(grant);
    }
  }

  /** 二维码超时关单：混合订单从未扣补贴，仅把预留 meal_record 置 voided。 */
  async reverseMixedOnClose(
    manager: EntityManager,
    order: CanteenOrderEntity
  ): Promise<void> {
    const meal = await manager.findOne(CanteenMealRecordEntity, {
      where: { orderId: order.id, tenantId: order.tenantId, isDeleted: false }
    });
    if (meal && meal.status === "normal") {
      meal.status = "voided";
      await manager.save(meal);
    }
    // 不触碰钱包/补贴流水（成功回调才扣补贴，关单即不扣）。
  }

  /* --------------------------- 本人钱包 --------------------------- */

  async walletMe(scope: TenantParkScope, userId: string) {
    const period = periodOf();
    const wallet = await this.walletRepo.findOne({
      where: { tenantId: scope.tenantId, employeeUserId: userId, isDeleted: false }
    });
    return {
      period,
      period_grant: wallet?.periodGrant ?? "0.00",
      period_consumed: wallet?.periodConsumed ?? "0.00",
      period_expired: wallet?.periodExpired ?? "0.00",
      period_balance: wallet && wallet.period === period ? wallet.periodBalance : "0.00",
      expire_date: this.expireDate(wallet?.period ?? period)
    };
  }

  async walletMeTxns(scope: TenantParkScope, userId: string, page = 1, pageSize = 20) {
    const [list, total] = await this.txnRepo.findAndCount({
      where: { tenantId: scope.tenantId, employeeUserId: userId, isDeleted: false },
      order: { txnTime: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { list, total, page, pageSize };
  }

  /** 出示个人码：POS 扫码后作为 employee_code 回传，按 user_id 识别到本人。 */
  async walletMeCode(scope: TenantParkScope, userId: string) {
    return {
      code: userId,
      employee_user_id: userId,
      payload: JSON.stringify({ type: "canteen-subsidy", user_id: userId })
    };
  }

  /* --------------------------- helpers --------------------------- */

  private expireDate(period: string): string {
    // 月末到期（expiry_time=23:59）。
    const parts = period.split("-");
    const y = Number(parts[0] ?? 1970);
    const m = Number(parts[1] ?? 1);
    const last = new Date(y, m, 0).getDate();
    return `${period}-${String(last).padStart(2, "0")}`;
  }

  /** 解析员工：支持 user_id / 工号 / 手机号 / 个人码。可选传入事务 manager。 */
  private async resolveEmployee(
    scope: TenantParkScope,
    code: string,
    manager?: EntityManager
  ): Promise<ResolvedEmployee> {
    const runner: EntityManager | DataSource = manager ?? this.dataSource;
    const rows = (await runner.query(
      `SELECT u.id AS user_id, u.display_name,
              COALESCE(e.employee_code, u.username) AS employee_no
         FROM sys_user u
         LEFT JOIN hr_employee e ON e.user_id = u.id AND e.is_deleted = false
        WHERE u.is_deleted = false AND u.tenant_id = $1 AND u.park_id = $2
          AND ( u.id::text = $3 OR u.username = $3 OR u.mobile = $3 OR e.employee_code = $3 )
        LIMIT 1`,
      [scope.tenantId, scope.parkId, code]
    )) as Array<ResolvedEmployee>;
    const row = rows[0];
    if (!row) throw new NotFoundException(`employee not found: ${code}`);
    return row;
  }

  private async buildOrder(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CheckoutSubsidyDto
  ): Promise<BuiltOrder> {
    const outlet = await manager.findOne(CanteenOutletEntity, {
      where: { id: dto.outlet_id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!outlet) throw new NotFoundException("outlet not found");
    if (outlet.status !== "open") throw new BadRequestException("outlet is not open");

    const dishIds = dto.items.map((i) => i.dish_id);
    const dishes = await manager
      .createQueryBuilder(CanteenDishEntity, "d")
      .where("d.tenant_id = :t AND d.park_id = :p AND d.is_deleted = false AND d.outlet_id = :o", {
        t: scope.tenantId,
        p: scope.parkId,
        o: dto.outlet_id
      })
      .andWhere("d.id IN (:...ids)", { ids: dishIds })
      .getMany();
    const dishMap = new Map(dishes.map((d) => [d.id, d]));

    let totalCents = 0;
    const itemRows: BuiltOrder["itemRows"] = [];
    for (const line of dto.items) {
      const dish = dishMap.get(line.dish_id);
      if (!dish) throw new BadRequestException(`dish ${line.dish_id} not found in outlet`);
      if (dish.status !== "on_shelf") throw new BadRequestException(`dish ${dish.name} is off_shelf`);
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

    return {
      outlet,
      totalCents,
      totalAmount: centsToYuan(totalCents),
      businessDate: businessDateOf(),
      mealPeriod: mealPeriodOf(),
      openSession,
      itemRows
    };
  }

  private async writeOrderItems(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    orderId: string,
    built: BuiltOrder
  ): Promise<void> {
    for (const row of built.itemRows) {
      await manager.save(
        manager.create(CanteenOrderItemEntity, {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          orderId,
          dishId: row.dishId,
          dishNameSnapshot: row.dishNameSnapshot,
          priceSnapshot: row.priceSnapshot,
          qty: row.qty,
          amount: row.amount,
          categorySnapshot: row.categorySnapshot,
          createBy: actor.sub
        })
      );
      // 占用库存。
      const dish = await manager.findOne(CanteenDishEntity, { where: { id: row.dishId } });
      if (dish) {
        dish.soldCount += row.qty;
        await manager.save(dish);
      }
    }
  }

  private async writeOrderLog(
    manager: EntityManager,
    order: CanteenOrderEntity,
    before: string | null,
    after: string,
    action: string,
    actor: JwtPrincipal
  ): Promise<void> {
    await manager.save(
      manager.create(CanteenStatusLogEntity, {
        tenantId: order.tenantId,
        parkId: order.parkId,
        entityType: "order",
        entityId: order.id,
        beforeStatus: before,
        afterStatus: after,
        action,
        reason: null,
        operatorUserId: actor.sub,
        operatorName: actor.realName ?? actor.username,
        opTime: new Date()
      })
    );
  }
}
