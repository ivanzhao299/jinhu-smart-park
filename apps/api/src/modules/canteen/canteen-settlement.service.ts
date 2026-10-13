import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenRefundEntity } from "./entities/canteen-refund.entity";
import { CanteenSettlementEntity } from "./entities/canteen-settlement.entity";
import { CanteenSettlementItemEntity } from "./entities/canteen-settlement-item.entity";
import { CanteenOutletEntity } from "./entities/canteen-outlet.entity";
import { CanteenStatusLogEntity } from "./entities/canteen-status-log.entity";
import { CanteenNumberService } from "./canteen-number.service";
import { centsToYuan, yuanToCents } from "./canteen-money.util";

/**
 * M3 承包方月度对账结算。
 * - 幂等生成：(tenant, outlet, period) 唯一键命中即返回已有单，不重复聚合。
 * - company_payable = subsidy_total − 餐补相关退款净额（公司就员工餐补消费净额划付承包方）。
 * - 状态机 draft→submitted→reconciling→approved→settled，差异 ↔ disputed；每次流转写 status_logs。
 * - 二维码进公司统一账户，结算时统一划付承包方；管理费默认不启用（settings 控制）。
 */
@Injectable()
export class CanteenSettlementService {
  constructor(
    @InjectRepository(CanteenSettlementEntity) private readonly repo: Repository<CanteenSettlementEntity>,
    @InjectRepository(CanteenSettlementItemEntity) private readonly itemRepo: Repository<CanteenSettlementItemEntity>,
    @InjectRepository(CanteenOrderEntity) private readonly orderRepo: Repository<CanteenOrderEntity>,
    @InjectRepository(CanteenRefundEntity) private readonly refundRepo: Repository<CanteenRefundEntity>,
    @InjectRepository(CanteenOutletEntity) private readonly outletRepo: Repository<CanteenOutletEntity>,
    private readonly ds: DataSource,
    private readonly numbers: CanteenNumberService
  ) {}

  private async writeLog(
    manager: EntityManager,
    e: CanteenSettlementEntity,
    before: string | null,
    after: string,
    action: string,
    operatorUserId?: string,
    operatorName?: string | null,
    reason?: string | null
  ) {
    await manager.save(
      manager.create(CanteenStatusLogEntity, {
        tenantId: e.tenantId,
        parkId: e.parkId,
        entityType: "settlement",
        entityId: e.id,
        beforeStatus: before,
        afterStatus: after,
        action,
        reason: reason ?? null,
        operatorUserId: operatorUserId ?? e.createBy ?? null,
        operatorName: operatorName ?? null,
        opTime: new Date()
      })
    );
  }

  /** 按账期聚合某档口订单（毛口径：含已退款订单；cancelled/pending 不计）。 */
  private async aggregate(manager: EntityManager, scope: TenantParkScope, outletId: string, period: string) {
    const rows = (await manager.query(
      `SELECT to_char(business_date,'YYYY-MM-DD') AS business_date,
              COUNT(*)::int AS order_count,
              COALESCE(SUM(pay_amount),0)::numeric AS sales_total,
              COALESCE(SUM(qr_pay_amount),0)::numeric AS qr_pay_total,
              COALESCE(SUM(subsidy_amount),0)::numeric AS subsidy_total
         FROM biz_canteen_orders
        WHERE tenant_id=$1 AND park_id=$2 AND outlet_id=$3 AND is_deleted=false
          AND status IN ('paid','completed','refunded') AND to_char(business_date,'YYYY-MM') = $4
        GROUP BY business_date ORDER BY business_date`,
      [scope.tenantId, scope.parkId, outletId, period]
    )) as Array<{
      business_date: string;
      order_count: number;
      sales_total: string;
      qr_pay_total: string;
      subsidy_total: string;
    }>;

    const refundRows = (await manager.query(
      `SELECT COALESCE(SUM(r.amount),0)::numeric AS refund_total,
              COALESCE(SUM(CASE WHEN r.refund_channel='subsidy' THEN r.amount ELSE 0 END),0)::numeric AS subsidy_refund,
              COALESCE(SUM(CASE WHEN r.refund_channel='original_qr' THEN r.amount ELSE 0 END),0)::numeric AS qr_refund
         FROM biz_canteen_refunds r
         JOIN biz_canteen_orders o ON o.id = r.order_id
        WHERE r.tenant_id=$1 AND r.is_deleted=false AND r.status='succeeded'
          AND o.outlet_id=$2 AND to_char(o.business_date,'YYYY-MM')=$3`,
      [scope.tenantId, outletId, period]
    )) as Array<{ refund_total: string; subsidy_refund: string; qr_refund: string }>;

    /* 分日退款：用于明细行 refund_amount 与按日净营业额。 */
    const refundDayRows = (await manager.query(
      `SELECT to_char(o.business_date,'YYYY-MM-DD') AS business_date,
              COALESCE(SUM(r.amount),0)::numeric AS refund_total
         FROM biz_canteen_refunds r
         JOIN biz_canteen_orders o ON o.id = r.order_id
        WHERE r.tenant_id=$1 AND r.is_deleted=false AND r.status='succeeded'
          AND o.outlet_id=$2 AND to_char(o.business_date,'YYYY-MM')=$3
        GROUP BY o.business_date ORDER BY o.business_date`,
      [scope.tenantId, outletId, period]
    )) as Array<{ business_date: string; refund_total: string }>;
    const refundByDay = new Map(refundDayRows.map((r) => [r.business_date, yuanToCents(r.refund_total)]));
    const detailRows = rows.map((r) => {
      const dayRefund = refundByDay.get(String(r.business_date)) ?? 0;
      return {
        business_date: r.business_date,
        order_count: r.order_count,
        /* 当日净营业额 = 扫码 + 餐补 − 退款（与结算单头部口径一致） */
        sales_total: centsToYuan(yuanToCents(r.qr_pay_total) + yuanToCents(r.subsidy_total) - dayRefund),
        qr_pay_total: r.qr_pay_total,
        subsidy_total: r.subsidy_total,
        refund_total: centsToYuan(dayRefund)
      };
    });

    /* 二维码收款资金归属：true=公司统一账户（结算时划付承包方）；false=承包方自有码（单列不重复付）。 */
    const settingsRows = (await manager.query(
      `SELECT funds_company_account FROM biz_canteen_settings
        WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false LIMIT 1`,
      [scope.tenantId, scope.parkId]
    )) as Array<{ funds_company_account: boolean }>;
    const fundsCompanyAccount = settingsRows[0] ? settingsRows[0].funds_company_account !== false : true;

    const sum = rows.reduce(
      (acc, r) => ({
        sales: acc.sales + yuanToCents(r.sales_total),
        qr: acc.qr + yuanToCents(r.qr_pay_total),
        subsidy: acc.subsidy + yuanToCents(r.subsidy_total),
        count: acc.count + r.order_count
      }),
      { sales: 0, qr: 0, subsidy: 0, count: 0 }
    );
    const refundTotal = yuanToCents(refundRows[0]?.refund_total ?? "0");
    const subsidyRefund = yuanToCents(refundRows[0]?.subsidy_refund ?? "0");
    const qrRefund = yuanToCents(refundRows[0]?.qr_refund ?? "0");
    // company_payable = 餐补净消费 + 扫码净收款（仅公司统一收款时；管理费规则另配，默认不启用）。
    const companyPayable =
      sum.subsidy - subsidyRefund + (fundsCompanyAccount ? sum.qr - qrRefund : 0);
    /* 营业额为净口径（与经营报表一致）：扫码 + 餐补 − 退款。 */
    const salesTotal = sum.qr + sum.subsidy - refundTotal;

    return {
      rows: detailRows,
      totals: {
        sales_total: centsToYuan(salesTotal < 0 ? 0 : salesTotal),
        qr_pay_total: centsToYuan(sum.qr),
        subsidy_total: centsToYuan(sum.subsidy),
        refund_total: centsToYuan(refundTotal),
        company_payable: centsToYuan(companyPayable < 0 ? 0 : companyPayable),
        order_count: sum.count
      }
    };
  }

  /** 生成结算单：草稿可重算（regenerate），非草稿状态拒绝；首生成走聚合建单。 */
  async generate(scope: TenantParkScope, actor: JwtPrincipal, outletId: string, period: string) {
    const outlet = await this.outletRepo.findOne({
      where: { id: outletId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!outlet) throw new NotFoundException("outlet not found");

    const existing = await this.repo.findOne({
      where: { tenantId: scope.tenantId, outletId, period, isDeleted: false }
    });
    if (existing && existing.status !== "draft") {
      throw new BadRequestException(
        `settlement ${existing.settlementNo} is ${existing.status}; only draft settlements can be regenerated`
      );
    }

    return this.ds.transaction(async (manager) => {
      const agg = await this.aggregate(manager, scope, outletId, period);
      let settlement: CanteenSettlementEntity;

      if (existing) {
        /* 草稿重算：按最新订单/退款数据刷新头部金额并重建明细行。 */
        existing.salesTotal = agg.totals.sales_total;
        existing.qrPayTotal = agg.totals.qr_pay_total;
        existing.subsidyTotal = agg.totals.subsidy_total;
        existing.refundTotal = agg.totals.refund_total;
        existing.companyPayable = agg.totals.company_payable;
        existing.generatedTime = new Date();
        existing.updateBy = actor.sub;
        settlement = await manager.save(existing);
        await manager.delete(CanteenSettlementItemEntity, { settlementId: settlement.id });
        await this.writeLog(manager, settlement, "draft", "draft", "regenerate", actor.sub, actor.username);
      } else {
        const no = await this.numbers.settlementNo(manager, scope.tenantId);
        settlement = await manager.save(
          manager.create(CanteenSettlementEntity, {
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            settlementNo: no,
            period,
            outletId,
            contractorId: outlet.contractorId,
            salesTotal: agg.totals.sales_total,
            qrPayTotal: agg.totals.qr_pay_total,
            subsidyTotal: agg.totals.subsidy_total,
            refundTotal: agg.totals.refund_total,
            companyPayable: agg.totals.company_payable,
            status: "draft",
            generatedTime: new Date(),
            createBy: actor.sub,
            updateBy: actor.sub
          })
        );
        await this.writeLog(manager, settlement, null, "draft", "generate", actor.sub, actor.username);
      }

      for (const r of agg.rows) {
        await manager.save(
          manager.create(CanteenSettlementItemEntity, {
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            settlementId: settlement.id,
            bizDate: r.business_date,
            mealPeriod: null,
            orderCount: r.order_count,
            qrPayAmount: r.qr_pay_total,
            subsidyAmount: r.subsidy_total,
            refundAmount: r.refund_total,
            type: "order",
            diffAmount: "0.00",
            diffReason: null,
            createBy: actor.sub,
            updateBy: actor.sub
          })
        );
      }
      return settlement;
    });
  }

  async list(scope: TenantParkScope, q: { outlet_id?: string; period?: string; contractor_id?: string; status?: string; page: number; page_size: number }) {
    const qb = this.repo
      .createQueryBuilder("s")
      .where("s.tenant_id = :t AND s.park_id = :p AND s.is_deleted = false", { t: scope.tenantId, p: scope.parkId });
    if (q.outlet_id) qb.andWhere("s.outlet_id = :oid", { oid: q.outlet_id });
    if (q.period) qb.andWhere("s.period = :period", { period: q.period });
    if (q.contractor_id) qb.andWhere("s.contractor_id = :cid", { cid: q.contractor_id });
    if (q.status) qb.andWhere("s.status = :status", { status: q.status });
    qb.orderBy("s.createTime", "DESC").skip((q.page - 1) * q.page_size).take(q.page_size);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page: q.page, pageSize: q.page_size };
  }

  private async load(scope: TenantParkScope, id: string) {
    const s = await this.repo.findOne({ where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    if (!s) throw new NotFoundException("settlement not found");
    return s;
  }

  async detail(scope: TenantParkScope, id: string) {
    const s = await this.load(scope, id);
    return s;
  }

  async items(scope: TenantParkScope, id: string) {
    await this.load(scope, id);
    return this.itemRepo.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, settlementId: id, isDeleted: false },
      order: { bizDate: "ASC" }
    });
  }

  private transition(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    from: string[],
    to: string,
    action: string,
    patch?: (s: CanteenSettlementEntity) => void,
    reason?: string | null
  ) {
    return this.ds.transaction(async (manager) => {
      const s = await manager.findOne(CanteenSettlementEntity, {
        where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!s) throw new NotFoundException("settlement not found");
      if (!from.includes(s.status)) {
        throw new BadRequestException(`cannot ${action} from status ${s.status}`);
      }
      const before = s.status;
      s.status = to;
      s.updateBy = actor.sub;
      if (to === "submitted") s.submittedTime = new Date();
      if (to === "reconciling") s.reconciledTime = new Date();
      if (to === "approved") {
        s.approvedTime = new Date();
        s.financeUserId = actor.sub;
      }
      if (to === "settled") s.settledTime = new Date();
      patch?.(s);
      await manager.save(s);
      await this.writeLog(manager, s, before, to, action, actor.sub, actor.username, reason);
      return s;
    });
  }

  submit(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.transition(scope, actor, id, ["draft"], "submitted", "submit");
  }
  reconcile(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.transition(scope, actor, id, ["submitted"], "reconciling", "reconcile");
  }
  dispute(scope: TenantParkScope, actor: JwtPrincipal, id: string, diffAmount?: number, diffReason?: string) {
    return this.transition(scope, actor, id, ["reconciling"], "disputed", "dispute", undefined, diffReason ?? null);
  }
  approve(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.transition(scope, actor, id, ["reconciling", "disputed"], "approved", "approve");
  }
  settle(scope: TenantParkScope, actor: JwtPrincipal, id: string, evidenceFileId?: string, remark?: string) {
    return this.transition(scope, actor, id, ["approved"], "settled", "settle", (s) => {
      if (evidenceFileId) s.settleEvidenceFileId = evidenceFileId;
    }, remark ?? null);
  }
}
