"use client";

import {
  HOUSING_REPAIR_WORK_ORDER_DETAIL_ROUTE,
  SYSTEM_PERMISSIONS,
  type HousingHandoverDetailResponse,
  type HousingPurchaseDetailResponse,
  type HousingRepairDetailResponse
} from "@jinhu/shared";
import Link from "next/link";
import { PropertyPanelSurface, type PropertyCapabilityProjection } from "../../../features/property-shared";
import { useAuthUser } from "../../../lib/auth-context";
import { hasAccess } from "../../../lib/permissions";
import { HousingEvidenceList } from "./HousingEvidenceList";
import { BlockedHighRiskActions, DetailGrid, DetailPage, money } from "./HousingDetailShell";
import styles from "./HousingWorkbench.module.css";
import { detailUrlObject } from "./housing-route-types";

function HandoverDetail({ capabilities, data }: {
  capabilities: PropertyCapabilityProjection; data: HousingHandoverDetailResponse;
}) {
  const files = capabilities.fileCapability("housing_handover");
  return <div className={styles.stack}>
    <PropertyPanelSurface><DetailGrid rows={[
      ["租约", data.leaseCode], ["房源", data.unitCode ?? data.unitName],
      ["类型", data.handoverType === "move_in" ? "入住" : "退租"], ["状态", data.status],
      ["交割时间", data.handoverAt ? new Date(data.handoverAt).toLocaleString("zh-CN") : "—"],
      ["损坏金额", money(data.damageAmount)], ["未结费用", money(data.unsettledAmount)],
      ["押金抵扣", money(data.depositDeductionAmount)]
    ]} /></PropertyPanelSurface>
    {data.photo_files ? <PropertyPanelSurface title="现场证据">
      <HousingEvidenceList canDownload={files.canDownload} canRead={files.canRead} files={data.photo_files} label="交割现场证据" />
    </PropertyPanelSurface> : null}
    <BlockedHighRiskActions labels={["含财务金额的退租交割"]} />
  </div>;
}

function RepairDetail({ capabilities, data }: {
  capabilities: PropertyCapabilityProjection; data: HousingRepairDetailResponse;
}) {
  const user = useAuthUser();
  const workOrderAllowed = hasAccess(user, SYSTEM_PERMISSIONS.WORKORDER_READ, "workorder");
  const href = workOrderRoute(data.id);
  const files = capabilities.fileCapability("housing_repair");
  return <div className={styles.stack}>
    <PropertyPanelSurface>
      <DetailGrid rows={[
        ["房源", data.unitCode ?? data.unitName], ["状态", data.status], ["优先级", data.priority],
        ["紧急程度", data.urgency], ["处理人", data.assigneeName],
        ["创建时间", new Date(data.createTime).toLocaleString("zh-CN")], ["问题描述", data.description]
      ]} />
      {workOrderAllowed ? <Link className="ds-button" href={href}>进入工单详情</Link> : null}
    </PropertyPanelSurface>
    {data.evidence ? <PropertyPanelSurface title="报修证据">
      <HousingEvidenceList canDownload={files.canDownload} canRead={files.canRead} files={data.evidence} label="报修证据" />
    </PropertyPanelSurface> : null}
  </div>;
}

function workOrderRoute(id: string) {
  if (HOUSING_REPAIR_WORK_ORDER_DETAIL_ROUTE !== "/workorders/[id]") {
    throw new Error("Unsupported housing repair work-order route contract");
  }
  return detailUrlObject(`/workorders/${encodeURIComponent(id)}`);
}

function PurchaseDetail({ capabilities, data }: {
  capabilities: PropertyCapabilityProjection; data: HousingPurchaseDetailResponse;
}) {
  const files = capabilities.fileCapability("housing_purchase");
  return <div className={styles.stack}>
    <PropertyPanelSurface><DetailGrid rows={[
      ["供应商", data.purchase.vendorName], ["采购日期", data.purchase.purchaseDate],
      ["成本分类", data.purchase.costCategory], ["总金额", money(data.purchase.totalAmount)],
      ["审批状态", data.purchase.approvalStatus], ["付款状态", data.purchase.paymentStatus]
    ]} /></PropertyPanelSurface>
    <PropertyPanelSurface title="采购明细">
      {data.items.map((item) => <p key={item.id}>{item.itemName} · {item.quantity} {item.unit ?? ""} · {money(item.amount)}</p>)}
    </PropertyPanelSurface>
    {data.receiptFiles ? <PropertyPanelSurface title="采购票据">
      <HousingEvidenceList canDownload={files.canDownload} canRead={files.canRead} files={data.receiptFiles} label="采购票据" />
    </PropertyPanelSurface> : null}
    <BlockedHighRiskActions labels={["审批", "付款", "退款", "作废", "转租客收费"]} />
  </div>;
}

export function HousingHandoverDetailClient({ handoverId }: { handoverId: string }) {
  return <DetailPage definition={{
    endpoint: `/housing/handovers/${encodeURIComponent(handoverId)}`, fallbackTitle: "交割详情",
    featureId: "housing.handovers", listRoute: "/housing/handovers", readActionId: "housing.handovers.detail",
    title: (data: HousingHandoverDetailResponse) => `${data.leaseCode} · ${data.handoverType === "move_in" ? "入住" : "退租"}`,
    render: (data, capabilities) => <HandoverDetail capabilities={capabilities} data={data} />
  }} />;
}

export function HousingRepairDetailClient({ repairId }: { repairId: string }) {
  return <DetailPage definition={{
    endpoint: `/housing/repairs/${encodeURIComponent(repairId)}`, fallbackTitle: "报修详情",
    featureId: "housing.repairs", listRoute: "/housing/repairs", readActionId: "housing.repairs.detail",
    title: (data: HousingRepairDetailResponse) => `${data.woCode} · ${data.title}`,
    render: (data, capabilities) => <RepairDetail capabilities={capabilities} data={data} />
  }} />;
}

export function HousingPurchaseDetailClient({ purchaseId }: { purchaseId: string }) {
  return <DetailPage definition={{
    endpoint: `/housing/purchases/${encodeURIComponent(purchaseId)}`, fallbackTitle: "采购详情",
    featureId: "housing.purchases", listRoute: "/housing/purchases", readActionId: "housing.purchases.detail",
    title: (data: HousingPurchaseDetailResponse) => data.purchase.purchaseCode,
    render: (data, capabilities) => <PurchaseDetail capabilities={capabilities} data={data} />
  }} />;
}
