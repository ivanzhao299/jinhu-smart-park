import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenOrderItemEntity } from "./entities/canteen-order-item.entity";
import { CanteenSubsidyGrantEntity } from "./entities/canteen-subsidy-grant.entity";

/**
 * M3 经营报表。所有查询：
 * - 日期有界（start/end，调用方限 31 天窗口）；
 * - 走 (tenant_id, park_id, business_date) 索引 + SQL 分组聚合，不在应用层全表拉取；
 * - 仅统计已完成订单（paid/completed）。
 */
@Injectable()
export class CanteenReportService {
  constructor(
    @InjectRepository(CanteenOrderEntity) private readonly orderRepo: Repository<CanteenOrderEntity>,
    @InjectRepository(CanteenOrderItemEntity) private readonly itemRepo: Repository<CanteenOrderItemEntity>,
    @InjectRepository(CanteenSubsidyGrantEntity) private readonly grantRepo: Repository<CanteenSubsidyGrantEntity>
  ) {}

  private bounds(start_date: string, end_date: string) {
    // 简单有界校验：窗口 ≤ 31 天。
    const s = new Date(`${start_date}T00:00:00Z`);
    const e = new Date(`${end_date}T00:00:00Z`);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) throw new Error("invalid date range");
    if (e < s) throw new Error("end_date before start_date");
    if ((e.getTime() - s.getTime()) / 86400000 > 31) throw new Error("date window exceeds 31 days");
  }

  async sales(scope: TenantParkScope, q: { start_date: string; end_date: string; outlet_id?: string; meal_period?: string }) {
    this.bounds(q.start_date, q.end_date);
    const rows = (await this.orderRepo.query(
      `SELECT COUNT(*)::int AS order_count,
              COALESCE(SUM(pay_amount),0)::numeric AS sales_total,
              COALESCE(SUM(qr_pay_amount),0)::numeric AS qr_pay_total,
              COALESCE(SUM(subsidy_amount),0)::numeric AS subsidy_total
         FROM biz_canteen_orders
        WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false
          AND status IN ('paid','completed')
          AND business_date BETWEEN $3 AND $4
          AND ($5::uuid IS NULL OR outlet_id=$5)
          AND ($6::text IS NULL OR meal_period=$6)`,
      [scope.tenantId, scope.parkId, q.start_date, q.end_date, q.outlet_id ?? null, q.meal_period ?? null]
    )) as Array<Record<string, string | number>>;
    const r = rows[0] ?? { order_count: 0, sales_total: "0.00", qr_pay_total: "0.00", subsidy_total: "0.00" };
    const c = Number(r.order_count) || 0;
    return {
      start_date: q.start_date,
      end_date: q.end_date,
      order_count: c,
      sales_total: r.sales_total,
      qr_pay_total: r.qr_pay_total,
      subsidy_total: r.subsidy_total,
      avg_order_value: c > 0 ? (Number(r.sales_total) / c).toFixed(2) : "0.00"
    };
  }

  async daily(scope: TenantParkScope, q: { start_date: string; end_date: string; outlet_id?: string }) {
    this.bounds(q.start_date, q.end_date);
    return this.orderRepo.query(
      `SELECT business_date,
              COUNT(*)::int AS order_count,
              COALESCE(SUM(pay_amount),0)::numeric AS sales_total,
              COALESCE(SUM(qr_pay_amount),0)::numeric AS qr_pay_total,
              COALESCE(SUM(subsidy_amount),0)::numeric AS subsidy_total
         FROM biz_canteen_orders
        WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false
          AND status IN ('paid','completed')
          AND business_date BETWEEN $3 AND $4
          AND ($5::uuid IS NULL OR outlet_id=$5)
        GROUP BY business_date ORDER BY business_date`,
      [scope.tenantId, scope.parkId, q.start_date, q.end_date, q.outlet_id ?? null]
    );
  }

  async dishRanking(scope: TenantParkScope, q: { start_date: string; end_date: string; outlet_id?: string; category_id?: string }) {
    this.bounds(q.start_date, q.end_date);
    return this.itemRepo.query(
      `SELECT i.dish_id, d.name AS dish_name,
              SUM(i.qty)::int AS qty,
              COALESCE(SUM(i.subtotal),0)::numeric AS sales_amount
         FROM biz_canteen_order_items i
         JOIN biz_canteen_orders o ON o.id = i.order_id
         JOIN biz_canteen_dishes d ON d.id = i.dish_id
        WHERE i.tenant_id=$1 AND i.is_deleted=false
          AND o.status IN ('paid','completed')
          AND o.business_date BETWEEN $2 AND $3
          AND ($4::uuid IS NULL OR o.outlet_id=$4)
          AND ($5::uuid IS NULL OR d.category_id=$5)
        GROUP BY i.dish_id, d.name
        ORDER BY sales_amount DESC LIMIT 50`,
      [scope.tenantId, q.start_date, q.end_date, q.outlet_id ?? null, q.category_id ?? null]
    );
  }

  async subsidyUsage(scope: TenantParkScope, period: string) {
    const grants = await this.grantRepo.query(
      `SELECT period,
              COUNT(*)::int AS grant_count,
              COALESCE(SUM(amount),0)::numeric AS granted_total,
              COALESCE(SUM(consumed_amount),0)::numeric AS consumed_total
         FROM biz_canteen_subsidy_grants
        WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false AND period=$3
        GROUP BY period`,
      [scope.tenantId, scope.parkId, period]
    );
    return grants;
  }

  async dashboard(scope: TenantParkScope, q: { start_date: string; end_date: string; outlet_id?: string }) {
    const sales = await this.sales(scope, q);
    return { range: { start_date: q.start_date, end_date: q.end_date }, ...sales };
  }
}
