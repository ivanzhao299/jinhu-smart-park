import { Injectable } from "@nestjs/common";
import {
  SYSTEM_PERMISSIONS,
  type HousingDashboardResponse,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import {
  calculateHousingMoneyBalance,
  compareHousingMoney,
  formatHousingMoney
} from "./housing-finance.policy";

type LeaseCountRow = { status: string; count: number };
type FinanceSummaryRow = { receivable: string; paid: string; waived: string };
type PurchaseSummaryRow = { cost: string };
type DashboardScope = {
  params: unknown[];
  unitFilter: string;
  leaseUnitFilter: string;
  purchaseUnitFilter: string;
};

@Injectable()
export class HousingDashboardQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly unitAccessService: PropertyUnitAccessService
  ) {}

  async dashboard(
    scope: TenantParkScope,
    actor: JwtPrincipal
  ): Promise<HousingDashboardResponse> {
    const unitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    const queryScope = this.queryScope(scope, unitIds);
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ);
    const canReadPurchases = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ);
    const [leaseRows, financeRows, purchaseRows] = await Promise.all([
      this.leaseSummary(queryScope),
      this.financeSummary(queryScope, canReadFinance),
      this.purchaseSummary(queryScope, canReadPurchases)
    ]);
    return {
      ...this.leaseProjection(leaseRows),
      ...this.financeProjection(financeRows, canReadFinance),
      ...this.purchaseProjection(purchaseRows, canReadPurchases)
    };
  }

  private queryScope(scope: TenantParkScope, unitIds: string[] | null): DashboardScope {
    return {
      params: unitIds === null
        ? [scope.tenantId, scope.parkId]
        : [scope.tenantId, scope.parkId, unitIds],
      unitFilter: this.unitFilter("unit_id", unitIds),
      leaseUnitFilter: this.unitFilter("lease.unit_id", unitIds),
      purchaseUnitFilter: this.unitFilter("purchase.unit_id", unitIds)
    };
  }

  private unitFilter(column: string, unitIds: string[] | null) {
    if (unitIds === null) return "";
    return unitIds.length ? ` AND ${column} = ANY($3::uuid[])` : " AND false";
  }

  private leaseSummary(queryScope: DashboardScope): Promise<LeaseCountRow[]> {
    return this.dataSource.query(
      `SELECT status, count(*)::int AS count
       FROM biz_housing_lease
       WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false${queryScope.unitFilter}
       GROUP BY status`,
      queryScope.params
    ) as Promise<LeaseCountRow[]>;
  }

  private financeSummary(
    queryScope: DashboardScope,
    permitted: boolean
  ): Promise<FinanceSummaryRow[]> {
    if (!permitted) return Promise.resolve([]);
    return this.dataSource.query(
      `SELECT
         coalesce(sum(amount),0)::text AS receivable,
         coalesce(sum(paid_amount),0)::text AS paid,
         coalesce(sum(waived_amount),0)::text AS waived
       FROM biz_housing_receivable receivable
       JOIN biz_housing_lease lease
         ON lease.id=receivable.lease_id
        AND lease.tenant_id=receivable.tenant_id
        AND lease.park_id=receivable.park_id
        AND lease.is_deleted=false
       WHERE receivable.tenant_id=$1 AND receivable.park_id=$2
         AND receivable.is_deleted=false AND receivable.status <> 'void'${queryScope.leaseUnitFilter}`,
      queryScope.params
    ) as Promise<FinanceSummaryRow[]>;
  }

  private purchaseSummary(
    queryScope: DashboardScope,
    permitted: boolean
  ): Promise<PurchaseSummaryRow[]> {
    if (!permitted) return Promise.resolve([]);
    return this.dataSource.query(
      `SELECT coalesce(sum(total_amount),0)::text AS cost
       FROM biz_housing_purchase purchase
       WHERE purchase.tenant_id=$1 AND purchase.park_id=$2
         AND purchase.is_deleted=false AND purchase.approval_status='approved'
         AND purchase.payment_status <> 'refunded'${queryScope.purchaseUnitFilter}`,
      queryScope.params
    ) as Promise<PurchaseSummaryRow[]>;
  }

  private leaseProjection(leaseRows: LeaseCountRow[]) {
    const counts = Object.fromEntries(
      leaseRows.map((row) => [row.status, Number(row.count)])
    );
    return {
      draft_leases: counts.draft ?? 0,
      pending_approval: counts.pending_approval ?? 0,
      pending_signature: counts.pending_signature ?? 0,
      active_leases: (counts.active ?? 0) + (counts.expiring ?? 0),
      checkout_pending: counts.checkout_pending ?? 0
    };
  }

  private financeProjection(financeRows: FinanceSummaryRow[], permitted: boolean) {
    if (!permitted) return {};
    const finance = financeRows[0] ?? { receivable: "0", paid: "0", waived: "0" };
    const outstanding = calculateHousingMoneyBalance(
      [finance.receivable],
      [finance.paid, finance.waived]
    );
    return {
      receivable_amount: formatHousingMoney(finance.receivable),
      collected_amount: formatHousingMoney(finance.paid),
      outstanding_amount: compareHousingMoney(outstanding, "0.00") > 0
        ? outstanding
        : "0.00"
    };
  }

  private purchaseProjection(purchaseRows: PurchaseSummaryRow[], permitted: boolean) {
    if (!permitted) return {};
    return { approved_purchase_cost: formatHousingMoney(purchaseRows[0]?.cost ?? "0") };
  }

  private hasPermission(actor: JwtPrincipal, permission: string) {
    return Boolean(
      actor.isSuper
      || actor.permissions.includes("*")
      || actor.permissions.includes(permission)
    );
  }
}
