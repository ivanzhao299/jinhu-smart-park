"use client";

import type {
  HousingBillingListItem, HousingFinanceListItem, HousingPurchaseListItem, HousingRepairListItem
} from "@jinhu/shared";
import { useMemo, useState } from "react";
import {
  displayEntityName,
  projectPropertyCapabilities,
  housingPurchaseApprovalStatusOptions,
  propertyLabels,
  workOrderStatusLabel,
  workOrderStatusLabels
} from "../../../features/property-shared";
import { useAuthUser } from "../../../lib/auth-context";
import { HousingCollectionPage } from "./HousingCollectionPage";
import { HousingBillingActions } from "./HousingBillingActions";
import { HousingFinanceActions } from "./HousingFinanceActions";
import { HousingPurchaseCreatePanel } from "./HousingPurchaseCreatePanel";
import { HousingRepairCreatePanel } from "./HousingRepairCreatePanel";
import {
  displayHousingValue, housingFields, housingLeaseStatusOptions, housingMoney,
  housingOrderFilter, housingSortFilter
} from "./HousingSurfacePrimitives";
import { detailUrlObject } from "./housing-route-types";

export function HousingBillingClient() {
  return <HousingCollectionPage<HousingBillingListItem>
    description="展示住房子账的费用计划和应收，不与招商租赁应收混写。"
    endpoint="/housing/billing" featureId="housing.billing" route="/housing/billing"
    fields={housingFields<HousingBillingListItem>(
      { key: "tenant", label: "租客", render: (item) => displayHousingValue(item.lease.tenantDisplayName) },
      { key: "unit", label: "房源", render: (item) => displayHousingValue(item.lease.unitCode ?? item.lease.unitName) },
      { key: "plans", label: "费用计划", render: (item) => `${item.charge_plans.length} 项` },
      { key: "receivables", label: "应收", render: (item) => `${item.receivables.length} 笔` },
      { key: "status", label: "租约状态", render: (item) => propertyLabels.leaseStatus(item.lease.status) }
    )}
    filters={[{ key: "status", label: "租约状态", options: housingLeaseStatusOptions },
      housingSortFilter([
        { label: "开始日期", value: "startDate" }, { label: "状态", value: "status" },
        { label: "租约编号", value: "leaseCode" }
      ]), housingOrderFilter]}
    getKey={(item) => item.lease.id} getTitle={(item) => item.lease.leaseCode
    } readActionId="housing.billing.list"
    renderItemActions={(item, capabilities, reload) =>
      <HousingBillingActions capabilities={capabilities} item={item} reload={reload} />}
    title="周期账单"
  />;
}

export function HousingFinanceClient() {
  return <HousingCollectionPage<HousingFinanceListItem>
    description="仅显示住房子账汇总；退款、减免与押金退还在 Track B 审批接入前不可执行。"
    endpoint="/housing/finance" featureId="housing.finance" route="/housing/finance"
    fields={housingFields<HousingFinanceListItem>(
      { key: "tenant", label: "租客", render: (item) => displayHousingValue(item.lease.tenantDisplayName) },
      { key: "receivable", label: "应收", render: (item) => housingMoney(item.summary.receivable) },
      { key: "paid", label: "已收", render: (item) => housingMoney(item.summary.paid) },
      { key: "outstanding", label: "未收", render: (item) => housingMoney(item.summary.outstanding) },
      { key: "deposit", label: "押金余额", render: (item) => housingMoney(item.summary.deposit_balance) }
    )}
    filters={[{ key: "status", label: "租约状态", options: housingLeaseStatusOptions },
      housingSortFilter([
        { label: "开始日期", value: "startDate" }, { label: "状态", value: "status" },
        { label: "租约编号", value: "leaseCode" }
      ]), housingOrderFilter]}
    getKey={(item) => item.lease.id} getTitle={(item) => item.lease.leaseCode
    } readActionId="housing.finance.list"
    renderItemActions={(item, capabilities, reload) =>
      <HousingFinanceActions capabilities={capabilities} item={item} reload={reload} />}
    title="财务子账"
  />;
}

export function HousingRepairsClient() {
  const user = useAuthUser();
  const capabilities = useMemo(() => projectPropertyCapabilities(user, "housing.repairs"), [user]);
  const [refreshKey, setRefreshKey] = useState(0);
  return <HousingCollectionPage<HousingRepairListItem>
    description="按房源和处理人范围展示租客报修，详情保留工单状态与授权证据。"
    detailHref={(item) => detailUrlObject(`/housing/repairs/${encodeURIComponent(item.id)}`)}
    endpoint="/housing/repairs" featureId="housing.repairs" route="/housing/repairs"
    fields={housingFields<HousingRepairListItem>(
      { key: "unit", label: "房源", render: (item) => displayHousingValue(item.unitCode ?? item.unitName) },
      { key: "priority", label: "优先级", render: (item) => propertyLabels.repairPriority(item.priority) },
      { key: "status", label: "状态", render: (item) => workOrderStatusLabel(item.status) },
      { key: "assignee", label: "处理人", render: (item) => displayHousingValue(item.assigneeName) },
      { key: "overdue", label: "时效", render: (item) => item.overdueFlag ? "已超时" : "正常" }
    )}
    filters={[{ key: "status", label: "工单状态", options: Object.entries(workOrderStatusLabels)
      .map(([value, label]) => ({ label, value })) },
      housingSortFilter([
        { label: "创建时间", value: "createTime" }, { label: "状态", value: "status" },
        { label: "工单编号", value: "code" }
      ]), housingOrderFilter]}
    getKey={(item) => item.id} getTitle={(item) => `${item.woCode} · ${item.title}`}
    readActionId="housing.repairs.list" refreshKey={refreshKey} title="租客报修"
    toolbar={capabilities.actionAllowed("housing.repairs.create") ? <details>
      <summary className="ds-button ds-button-primary">代录报修</summary>
      <HousingRepairCreatePanel capabilities={capabilities} onCreated={() => setRefreshKey((value) => value + 1)} />
    </details> : null}
  />;
}

export function HousingPurchasesClient() {
  const user = useAuthUser();
  const capabilities = useMemo(() => projectPropertyCapabilities(user, "housing.purchases"), [user]);
  const [refreshKey, setRefreshKey] = useState(0);
  return <HousingCollectionPage<HousingPurchaseListItem>
    description="内部采购与租客收费保持分账；审批、付款、退款、作废和转收费在 Track B 前不可执行。"
    detailHref={(item) => detailUrlObject(`/housing/purchases/${encodeURIComponent(item.id)}`)}
    endpoint="/housing/purchases" featureId="housing.purchases" route="/housing/purchases"
    fields={housingFields<HousingPurchaseListItem>(
      { key: "vendor", label: "供应商", render: (item) => item.vendorName },
      { key: "unit", label: "房源", render: (item) => displayEntityName(item.unitName, item.unitCode, "未关联房源") },
      { key: "date", label: "采购日期", render: (item) => item.purchaseDate },
      { key: "amount", label: "金额", render: (item) => housingMoney(item.totalAmount) },
      { key: "approval", label: "审批", render: (item) => propertyLabels.purchaseApproval(item.approvalStatus) },
      { key: "payment", label: "付款", render: (item) => propertyLabels.purchasePayment(item.paymentStatus) }
    )}
    filters={[{ key: "approval_status", label: "审批状态", options: housingPurchaseApprovalStatusOptions },
      housingSortFilter([
        { label: "采购日期", value: "purchaseDate" }, { label: "状态", value: "status" },
        { label: "采购编号", value: "code" }
      ]), housingOrderFilter]}
    getKey={(item) => item.id} getTitle={(item) => item.purchaseCode}
    readActionId="housing.purchases.list" refreshKey={refreshKey} title="采购成本"
    toolbar={capabilities.actionAllowed("housing.purchases.create") ? <details>
      <summary className="ds-button ds-button-primary">创建采购草稿</summary>
      <HousingPurchaseCreatePanel capabilities={capabilities} onCreated={() => setRefreshKey((value) => value + 1)} />
    </details> : null}
  />;
}
