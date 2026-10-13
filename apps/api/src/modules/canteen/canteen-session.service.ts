import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource, Repository } from "typeorm";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { OpenSessionDto, SessionListQueryDto } from "./dto/canteen.dto";
import { CanteenCashierSessionEntity } from "./entities/canteen-cashier-session.entity";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenRefundEntity } from "./entities/canteen-refund.entity";
import { CanteenStatusLogEntity } from "./entities/canteen-status-log.entity";
import { CanteenNumberService } from "./canteen-number.service";

/**
 * 收银班次 / 日结。
 * 结班时聚合本班订单：qr_pay_total / subsidy_total / order_count / refund_total，
 * 写 close_snapshot，status=closed。
 */
@Injectable()
export class CanteenSessionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly numbers: CanteenNumberService,
    @InjectRepository(CanteenCashierSessionEntity)
    private readonly sessionRepo: Repository<CanteenCashierSessionEntity>,
    @InjectRepository(CanteenOrderEntity)
    private readonly orderRepo: Repository<CanteenOrderEntity>,
    @InjectRepository(CanteenStatusLogEntity)
    private readonly statusLogRepo: Repository<CanteenStatusLogEntity>
  ) {}

  private async logSession(
    manager: EntityManager,
    s: CanteenCashierSessionEntity,
    action: string,
    actor: JwtPrincipal,
    reason?: string | null
  ) {
    await manager.save(
      manager.create(CanteenStatusLogEntity, {
        tenantId: s.tenantId,
        parkId: s.parkId,
        entityType: "session",
        entityId: s.id,
        beforeStatus: null,
        afterStatus: s.status,
        action,
        reason: reason ?? s.sessionNo,
        operatorUserId: actor.sub,
        operatorName: actor.username ?? null,
        opTime: new Date()
      })
    );
  }

  async open(scope: TenantParkScope, actor: JwtPrincipal, dto: OpenSessionDto) {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(CanteenCashierSessionEntity, {
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          outletId: dto.outlet_id,
          cashierUserId: actor.sub,
          status: "open",
          isDeleted: false
        }
      });
      if (existing) {
        throw new BadRequestException(`an open session ${existing.sessionNo} already exists`);
      }
      const sessionNo = await this.numbers.sessionNo(manager, scope.tenantId);
      const session = manager.create(CanteenCashierSessionEntity, {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        sessionNo,
        outletId: dto.outlet_id,
        cashierUserId: actor.sub,
        openTime: new Date(),
        closeTime: null,
        openingFloat: Number(dto.opening_float ?? 0).toFixed(2),
        qrPayTotal: "0.00",
        subsidyTotal: "0.00",
        orderCount: 0,
        refundTotal: "0.00",
        status: "open",
        closeSnapshot: null,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const saved = await manager.save(session);
      await this.logSession(manager, saved, "open", actor);
      return saved;
    });
  }

  async current(scope: TenantParkScope, actor: JwtPrincipal) {
    const session = await this.sessionRepo.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        cashierUserId: actor.sub,
        status: "open",
        isDeleted: false
      },
      order: { openTime: "DESC" }
    });
    return session ?? null;
  }

  /** 管理端班次/日结列表：分页 + outlet_id / business_date / status 筛选。 */
  async list(scope: TenantParkScope, query: SessionListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const qb = this.sessionRepo
      .createQueryBuilder("s")
      .where("s.tenant_id = :t AND s.park_id = :p AND s.is_deleted = false", {
        t: scope.tenantId,
        p: scope.parkId
      });
    if (query.outlet_id) qb.andWhere("s.outlet_id = :outletId", { outletId: query.outlet_id });
    if (query.status) qb.andWhere("s.status = :status", { status: query.status });
    if (query.business_date) {
      const dayStart = new Date(`${query.business_date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      if (!Number.isNaN(dayStart.getTime())) {
        qb.andWhere("s.open_time >= :dayStart AND s.open_time < :dayEnd", { dayStart, dayEnd });
      }
    }
    qb.orderBy("s.open_time", "DESC").skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    /* 进行中班次的存储汇总列恒为 0（结班才写），此处以实时聚合覆盖，管理端可见营业中数据。 */
    const withRealtime = await Promise.all(
      list.map(async (s) => {
        if (s.status !== "open") return s;
        const agg = await this.aggregateSession(this.dataSource.manager, scope, s.id);
        return Object.assign(s, {
          qrPayTotal: agg.qrPayTotal,
          subsidyTotal: agg.subsidyTotal,
          orderCount: agg.orderCount,
          refundTotal: agg.refundTotal
        });
      })
    );
    return { list: withRealtime, total, page, pageSize };
  }

  async close(scope: TenantParkScope, actor: JwtPrincipal, id: string, remark?: string) {
    return this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(CanteenCashierSessionEntity, {
        where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!session) throw new NotFoundException("session not found");
      if (session.status === "closed") throw new BadRequestException("session already closed");

      // 聚合本班订单（与预览口径完全一致）。
      const { orderCount, qrPayTotal, subsidyTotal, refundTotal } = await this.aggregateSession(
        manager,
        scope,
        session.id
      );

      session.closeTime = new Date();
      session.qrPayTotal = qrPayTotal;
      session.subsidyTotal = subsidyTotal;
      session.orderCount = orderCount;
      session.refundTotal = refundTotal;
      session.status = "closed";
      session.closeSnapshot = {
        closedAt: new Date().toISOString(),
        openingFloat: session.openingFloat,
        qrPayTotal,
        subsidyTotal,
        orderCount,
        refundTotal: session.refundTotal,
        remark: remark ?? null,
        closedBy: actor.sub
      };
      session.updateBy = actor.sub;
      const saved = await manager.save(session);
      await this.logSession(manager, saved, "close", actor, remark);
      return saved;
    });
  }

  /**
   * 结班/日结只读预览：open 班次不写库、不改状态，按与 close 完全相同的口径
   * 聚合当前班次订单。触摸屏点「结班/日结」时调用。
   */
  async previewCurrent(scope: TenantParkScope, actor: JwtPrincipal) {
    const session = await this.sessionRepo.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        cashierUserId: actor.sub,
        status: "open",
        isDeleted: false
      },
      order: { openTime: "DESC" }
    });
    if (!session) throw new NotFoundException("no open session");

    const agg = await this.aggregateSession(this.dataSource.manager, scope, session.id);
    return {
      session_no: session.sessionNo,
      status: session.status,
      open_time: session.openTime,
      close_time: session.closeTime,
      qr_pay_total: agg.qrPayTotal,
      subsidy_total: agg.subsidyTotal,
      order_count: agg.orderCount,
      refund_count: agg.refundCount,
      refund_total: agg.refundTotal
    };
  }

  /** 结班聚合口径：本班 status ∈ (paid, completed) 的订单，cancelled/refunded 不计。 */
  private async aggregateSession(
    manager: EntityManager,
    scope: TenantParkScope,
    sessionId: string
  ): Promise<{ orderCount: number; qrPayTotal: string; subsidyTotal: string; refundCount: number; refundTotal: string }> {
    const agg = await manager
      .createQueryBuilder(CanteenOrderEntity, "o")
      .select("count(*)", "orderCount")
      .addSelect("COALESCE(sum(o.qr_pay_amount),0)", "qrPayTotal")
      .addSelect("COALESCE(sum(o.subsidy_amount),0)", "subsidyTotal")
      .where("o.tenant_id = :t AND o.park_id = :p AND o.cashier_session_id = :sid AND o.is_deleted = false", {
        t: scope.tenantId,
        p: scope.parkId,
        sid: sessionId
      })
      /* 毛口径：本班真实收款动作（含已退款订单），退款在 refund 维度单独列示 */
      .andWhere("o.status IN (:...st)", { st: ["paid", "completed", "refunded"] })
      .getRawOne<{ orderCount: string; qrPayTotal: string; subsidyTotal: string }>();

    // 本班退款/撤单：挂在班次订单上的 succeeded 退款单（含退软前撤单 void_before_pay）。
    const refundAgg = await manager
      .createQueryBuilder(CanteenRefundEntity, "r")
      .select("count(*)", "refundCount")
      .addSelect("COALESCE(sum(r.amount),0)", "refundTotal")
      .innerJoin(CanteenOrderEntity, "o", "o.id = r.order_id")
      .where("r.tenant_id = :t AND r.park_id = :p AND r.is_deleted = false", {
        t: scope.tenantId,
        p: scope.parkId
      })
      .andWhere("r.status = :rst", { rst: "succeeded" })
      .andWhere("o.cashier_session_id = :sid AND o.is_deleted = false", {
        sid: sessionId
      })
      .getRawOne<{ refundCount: string; refundTotal: string }>();

    return {
      orderCount: Number(agg?.orderCount ?? 0),
      qrPayTotal: Number(agg?.qrPayTotal ?? 0).toFixed(2),
      subsidyTotal: Number(agg?.subsidyTotal ?? 0).toFixed(2),
      refundCount: Number(refundAgg?.refundCount ?? 0),
      refundTotal: Number(refundAgg?.refundTotal ?? 0).toFixed(2)
    };
  }
}
