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
    const unitFilter = unitIds === null
      ? ""
      : unitIds.length ? " AND unit_id = ANY($3::uuid[])" : " AND false";
    const leaseUnitFilter = unitIds === null
      ? ""
      : unitIds.length ? " AND lease.unit_id = ANY($3::uuid[])" : " AND false";
    const purchaseUnitFilter = unitIds === null
      ? ""
      : unitIds.length ? " AND purchase.unit_id = ANY($3::uuid[])" : " AND false";
    const params = unitIds === null
      ? [scope.tenantId, scope.parkId]
      : [scope.tenantId, scope.parkId, unitIds];
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ);
    const canReadPurchases = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ);
    const [leaseRows, financeRows, purchaseRows] = await Promise.all([
      this.dataSource.query(
        `SELECT status, count(*)::int AS count
         FROM biz_housing_lease
         WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false${unitFilter}
         GROUP BY status`,
        params
      ) as Promise<LeaseCountRow[]>,
      canReadFinance ? this.dataSource.query(
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
           AND receivable.is_deleted=false AND receivable.status <> 'void'${leaseUnitFilter}`,
        params
      ) as Promise<FinanceSummaryRow[]> : Promise.resolve([]),
      canReadPurchases ? this.dataSource.query(
        `SELECT coalesce(sum(total_amount),0)::text AS cost
         FROM biz_housing_purchase purchase
         WHERE purchase.tenant_id=$1 AND purchase.park_id=$2
           AND purchase.is_deleted=false AND purchase.approval_status='approved'
           AND purchase.payment_status <> 'refunded'${purchaseUnitFilter}`,
        params
      ) as Promise<PurchaseSummaryRow[]> : Promise.resolve([])
    ]);
    const counts = Object.fromEntries(
      leaseRows.map((row) => [row.status, Number(row.count)])
    );
    const finance = financeRows[0] ?? { receivable: "0", paid: "0", waived: "0" };
    const outstanding = calculateHousingMoneyBalance(
      [finance.receivable],
      [finance.paid, finance.waived]
    );
    return {
      draft_leases: counts.draft ?? 0,
      pending_approval: counts.pending_approval ?? 0,
      pending_signature: counts.pending_signature ?? 0,
      active_leases: (counts.active ?? 0) + (counts.expiring ?? 0),
      checkout_pending: counts.checkout_pending ?? 0,
      ...(canReadFinance ? {
        receivable_amount: formatHousingMoney(finance.receivable),
        collected_amount: formatHousingMoney(finance.paid),
        outstanding_amount: compareHousingMoney(outstanding, "0.00") > 0
          ? outstanding
          : "0.00"
      } : {}),
      ...(canReadPurchases ? {
        approved_purchase_cost: formatHousingMoney(purchaseRows[0]?.cost ?? "0")
      } : {})
    };
  }

  private hasPermission(actor: JwtPrincipal, permission: string) {
    return Boolean(
      actor.isSuper
      || actor.permissions.includes("*")
      || actor.permissions.includes(permission)
    );
  }
}
