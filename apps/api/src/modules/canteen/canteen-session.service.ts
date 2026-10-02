import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource, Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { OpenSessionDto, SessionListQueryDto } from "./dto/canteen.dto";
import { CanteenCashierSessionEntity } from "./entities/canteen-cashier-session.entity";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
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
    private readonly orderRepo: Repository<CanteenOrderEntity>
  ) {}

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
      return manager.save(session);
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
    return { list, total, page, pageSize };
  }

  async close(scope: TenantParkScope, actor: JwtPrincipal, id: string, remark?: string) {
    return this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(CanteenCashierSessionEntity, {
        where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!session) throw new NotFoundException("session not found");
      if (session.status === "closed") throw new BadRequestException("session already closed");

      // 聚合本班订单。
      const agg = await manager
        .createQueryBuilder(CanteenOrderEntity, "o")
        .select("count(*)", "orderCount")
        .addSelect("COALESCE(sum(o.qr_pay_amount),0)", "qrPayTotal")
        .addSelect("COALESCE(sum(o.subsidy_amount),0)", "subsidyTotal")
        .where("o.tenant_id = :t AND o.park_id = :p AND o.cashier_session_id = :sid AND o.is_deleted = false", {
          t: scope.tenantId,
          p: scope.parkId,
          sid: session.id
        })
        .andWhere("o.status IN (:...st)", { st: ["paid", "completed"] })
        .getRawOne<{ orderCount: string; qrPayTotal: string; subsidyTotal: string }>();

      const orderCount = Number(agg?.orderCount ?? 0);
      const qrPayTotal = Number(agg?.qrPayTotal ?? 0).toFixed(2);
      const subsidyTotal = Number(agg?.subsidyTotal ?? 0).toFixed(2);

      session.closeTime = new Date();
      session.qrPayTotal = qrPayTotal;
      session.subsidyTotal = subsidyTotal;
      session.orderCount = orderCount;
      session.refundTotal = "0.00";
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
      return manager.save(session);
    });
  }
}
