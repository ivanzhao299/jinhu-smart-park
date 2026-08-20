"use client";

import {
  HOUSING_REPAIR_WORK_ORDER_DETAIL_ROUTE,
  SYSTEM_PERMISSIONS,
  type HousingHandoverDetailResponse,
  type HousingPurchaseDetailResponse,
  type HousingRepairDetailResponse
} from "@jinhu/shared";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  ConsequenceDialog,
  PropertyPanelSurface,
  RemoteEntityPicker,
  type PropertyCapabilityProjection,
  type RemoteEntityOption
} from "../../../features/property-shared";
import { useAuthUser } from "../../../lib/auth-context";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { hasAccess } from "../../../lib/permissions";
import { HousingEvidenceList } from "./HousingEvidenceList";
import { BlockedHighRiskActions, DetailGrid, DetailPage, money } from "./HousingDetailShell";
import styles from "./HousingWorkbench.module.css";
import { useStableIdempotency } from "./use-stable-idempotency";
import { detailUrlObject } from "./housing-route-types";
import { loadHousingLeases } from "./housing-picker-loaders";

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

function PurchaseDetail({ capabilities, data, reload }: {
  capabilities: PropertyCapabilityProjection; data: HousingPurchaseDetailResponse; reload(): Promise<void>;
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
    <PurchaseHighRiskActions capabilities={capabilities} data={data} reload={reload} />
  </div>;
}

function PurchaseHighRiskActions({ capabilities, data, reload }: {
  capabilities: PropertyCapabilityProjection; data: HousingPurchaseDetailResponse; reload(): Promise<void>;
}) {
  const [lease, setLease] = useState<RemoteEntityOption | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingLifecycle, setPendingLifecycle] = useState<{
    action: string; label: string;
  } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const lock = useRef(false);
  const idempotency = useStableIdempotency();
  const purchase = data.purchase;
  const hasTransferredItem = data.items.some((item) => Boolean(item.transferredReceivableId));
  const actions = ([
    ["approve", "提交审批", purchase.approvalStatus === "draft"],
    ["reject", "驳回采购", purchase.approvalStatus === "draft"],
    ["pay", "提交付款审批", purchase.approvalStatus === "approved" && purchase.paymentStatus === "unpaid"],
    ["refund", "提交退款审批", purchase.paymentStatus === "paid" && !hasTransferredItem],
    ["void", "提交作废审批", purchase.paymentStatus === "unpaid"
      && !hasTransferredItem && ["draft", "approved", "rejected"].includes(purchase.approvalStatus)]
  ] as const).filter(([_action, _label, allowed]) => allowed);
  const lifecycleAllowed = capabilities.actionAllowed("housing.purchases.lifecycle");
  const transferAllowed = capabilities.actionAllowed("housing.purchases.transfer")
    && purchase.approvalStatus === "approved"
    && purchase.paymentStatus !== "refunded"
    && data.items.some((item) => !item.transferredReceivableId);
  async function submit(operation: string, endpoint: string, body: object) {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setMessage("");
    try {
      const response = await apiRequest(endpoint, { method: "POST", token: getAccessToken(), body,
        idempotencyKey: idempotency.keyFor(operation, body) });
      idempotency.complete(operation);
      const request = (response.data as { request?: { requestId?: string; decisionStatus?: string; executionStatus?: string } }).request;
      setMessage(request?.requestId ? `审批申请已提交（${request.requestId}；决策 ${request.decisionStatus}；执行 ${request.executionStatus}）。` : "申请已提交。");
      await reload();
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "提交失败"); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  if (!lifecycleAllowed && !transferAllowed) return null;
  return <PropertyPanelSurface title="采购高风险操作" description="提交后进入审批，不会直接改变付款或收费状态。">
    <div className={styles.stack}>
      {lifecycleAllowed ? <div className="ds-action-bar">{actions.map(([action, label]) => <button className="ds-button" disabled={busy}
        key={action} onClick={() => setPendingLifecycle({ action, label })} type="button">{label}</button>)}</div> : null}
      {transferAllowed ? <div className={styles.formGrid}>
        <fieldset><legend>选择转收费明细</legend>{data.items.filter((item) => !item.transferredReceivableId).map((item) =>
          <label key={item.id}><input checked={selectedItemIds.includes(item.id)} onChange={(event) => setSelectedItemIds((current) =>
            event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} type="checkbox" /> {item.itemName} · {money(item.amount)}</label>)}</fieldset>
        <RemoteEntityPicker authorized contextValid={capabilities.moduleAvailable}
          helperText="可检索住房租约；提交时服务端会再次校验租约状态、房源和币种。"
          invalidationKey={capabilities.invalidationKey} label="目标租约"
          loadOptions={loadHousingLeases} onChange={setLease} required value={lease} />
        <label>应收日期<input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
        <button className="ds-button" disabled={busy || !lease || !dueDate || !selectedItemIds.length}
          onClick={() => setTransferOpen(true)} type="button">核对并提交转收费审批</button>
      </div> : null}
      <p aria-live="polite">{message}</p>
    </div>
    <ConsequenceDialog actionLabel={pendingLifecycle?.label ?? "确认提交"} busy={busy}
      consequences={["本次操作只提交审批申请，不会立即改变采购、付款或退款状态。", "审批执行前会重新校验采购状态与版本，原因将写入审计记录。"]}
      onConfirm={(reason) => {
        if (!pendingLifecycle) return;
        return submit(
          `housing-purchase-${pendingLifecycle.action}`,
          `/housing/purchases/${encodeURIComponent(purchase.id)}/actions`,
          { action: pendingLifecycle.action, reason }
        );
      }}
      onOpenChange={(open) => { if (!open) setPendingLifecycle(null); }}
      open={pendingLifecycle !== null}
      reasonPolicy={{ kind: "required", label: "操作原因", minLength: 1, maxLength: 500 }}
      resultingState="审批申请待处理"
      target={{ id: purchase.id, label: purchase.purchaseCode }}
      title={pendingLifecycle ? `确认${pendingLifecycle.label}` : "确认采购操作"}
    />
    <ConsequenceDialog actionLabel="确认提交转收费审批" busy={busy}
      consequences={[
        `将提交 ${selectedItemIds.length} 条采购明细的转收费审批，不会立即生成租客应收。`,
        `目标租约为 ${lease?.label ?? "未选择"}，审批执行前会重新校验租约状态、房源、币种及采购版本。`
      ]}
      onConfirm={(reason) => submit(
        "housing-purchase-transfer",
        `/housing/purchases/${encodeURIComponent(purchase.id)}/transfer`,
        { lease_id: lease?.id, due_date: dueDate, reason, item_ids: selectedItemIds }
      )}
      onOpenChange={setTransferOpen}
      open={transferOpen && lease !== null && dueDate !== "" && selectedItemIds.length > 0}
      reasonPolicy={{ kind: "required", label: "转收费原因", minLength: 1, maxLength: 500 }}
      resultingState="转收费审批申请待处理"
      target={{ id: purchase.id, label: purchase.purchaseCode }}
      title="确认采购成本转租客收费"
    />
  </PropertyPanelSurface>;
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
    render: (data, capabilities, reload) => <PurchaseDetail capabilities={capabilities} data={data} reload={reload} />
  }} />;
}
