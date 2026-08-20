"use client";

import { PROPERTY_BUSINESS_PERMISSIONS, type HousingLeaseDetailResponse } from "@jinhu/shared";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  ConsequenceDialog,
  PropertyPanelSurface,
  projectPropertyCapabilities,
  type PropertyCapabilityProjection
} from "../../../features/property-shared";
import { useAuthUser } from "../../../lib/auth-context";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { HousingEvidenceList } from "./HousingEvidenceList";
import { HousingHandoverForm } from "./HousingHandoverForm";
import { HousingLeaseSecondaryActions } from "./HousingLeaseSecondaryActions";
import { DetailGrid, DetailPage, money } from "./HousingDetailShell";
import styles from "./HousingWorkbench.module.css";
import { useStableIdempotency } from "./use-stable-idempotency";

interface LeaseContextProps {
  capabilities: PropertyCapabilityProjection;
  data: HousingLeaseDetailResponse;
  reload(): Promise<void>;
}

function LeasePrimary({ capabilities, data, reload }: LeaseContextProps) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingHighRisk, setPendingHighRisk] = useState<{
    action: "approve" | "void" | "checkout"; label: string;
  } | null>(null);
  const lock = useRef(false);
  const idempotency = useStableIdempotency();
  async function run(action: "submit" | "activate" | "approve" | "void" | "checkout", reason?: string) {
    const operation = `housing-lease-${action}`;
    if (lock.current || !capabilities.actionAllowed(`housing.leases.${action}`)) return;
    lock.current = true; setBusy(true); setFeedback("");
    try {
      const body = action === "approve"
        ? { approval_note: reason?.trim() || undefined }
        : ["void", "checkout"].includes(action) ? { reason: reason?.trim() } : undefined;
      const response = await apiRequest(`/housing/leases/${encodeURIComponent(data.lease.id)}/${action}`, {
        method: "POST", token: getAccessToken(),
        idempotencyKey: idempotency.keyFor(operation, { action, leaseId: data.lease.id, body }),
        ...(body ? { body } : {})
      });
      idempotency.complete(operation);
      const request = (response.data as { request?: { requestId?: string; decisionStatus?: string; executionStatus?: string } }).request;
      setFeedback(request?.requestId ? `审批申请已提交（${request.requestId}；决策 ${request.decisionStatus}；执行 ${request.executionStatus}）。`
        : action === "submit" ? "租约已提交。" : "租约已生效。");
      await reload();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "操作失败");
    } finally {
      lock.current = false; setBusy(false);
    }
  }
  const submitAllowed = data.lease.status === "draft" && capabilities.actionAllowed("housing.leases.submit");
  const eligible = data.lease.eligibility?.eligible !== false;
  const canActivate = data.lease.status === "pending_signature" && Boolean(data.lease.signatureFileId)
    && capabilities.actionAllowed("housing.leases.activate");
  const checkoutFinanciallyReady = Boolean(data.finance_summary)
    && !isPositiveMoney(data.finance_summary?.outstanding ?? "0")
    && !isPositiveMoney(data.finance_summary?.deposit_balance ?? "0");
  const highRiskActions = ([
    ["approve", "审批租约", data.lease.status === "pending_approval" && eligible],
    ["void", "作废租约", ["draft", "pending_approval", "pending_signature"].includes(data.lease.status)],
    ["checkout", "提交退租结清", data.lease.status === "checkout_pending" && checkoutFinanciallyReady]
  ] as const).filter(([action, _label, stateAllowed]) => stateAllowed
    && capabilities.actionAllowed(`housing.leases.${action}`));
  return (
    <PropertyPanelSurface>
      <DetailGrid rows={[
        ["租约编号", data.lease.leaseCode], ["状态", data.lease.status],
        ["租期", `${data.lease.startDate} 至 ${data.lease.endDate}`],
        ["月租", money(data.lease.monthlyRent)], ["押金", money(data.lease.depositAmount)],
        ["租客", data.tenant?.displayName ?? data.lease.tenantPartyId]
      ]} />
      {data.lease.status === "draft" && !eligible ? <div className="ds-alert" role="alert">
        <strong>该历史草稿当前不符合长租房源资格，暂不能提交。</strong>
        <p>{eligibilityReasonLabels(data.lease.eligibility?.reasonCodes ?? []).join("；")}</p>
        <PermissionGuard module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATIONS_PAGE}>
          <PermissionGuard module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATION_READ}>
            <Link className="ds-button" href={`/assets/property-operations/${encodeURIComponent(data.lease.unitId)}`}>检查房源经营配置</Link>
          </PermissionGuard>
        </PermissionGuard>
      </div> : null}
      <div className={styles.actionBar}>
        {submitAllowed ? <button className="ds-button ds-button-primary" disabled={busy || !eligible}
          onClick={() => void run("submit")} type="button">提交租约</button> : null}
        {canActivate ? <button className="ds-button ds-button-primary" disabled={busy} onClick={() => void run("activate")} type="button">生效租约</button> : null}
      </div>
      {highRiskActions.length ? <div className={styles.actionBar}>{highRiskActions.map(([action, label]) =>
        <button className="ds-button" disabled={busy} key={action}
          onClick={() => setPendingHighRisk({ action, label })} type="button">{label}</button>)}</div> : null}
      <ConsequenceDialog actionLabel={pendingHighRisk?.label ?? "确认提交"} busy={busy}
        consequences={["本次操作只提交审批申请，不会立即改变租约或财务状态。", "审批执行前会重新校验租约版本、资格和结清条件，原因将写入审计记录。"]}
        onConfirm={(reason) => pendingHighRisk ? run(pendingHighRisk.action, reason) : undefined}
        onOpenChange={(open) => { if (!open) setPendingHighRisk(null); }}
        open={pendingHighRisk !== null}
        reasonPolicy={{ kind: "required", label: "审批说明 / 原因", minLength: 1, maxLength: 500 }}
        resultingState="审批申请待处理"
        target={{ id: data.lease.id, label: data.lease.leaseCode }}
        title={pendingHighRisk ? `确认${pendingHighRisk.label}` : "确认租约操作"}
      />
      {feedback ? <p aria-live="polite">{feedback}</p> : null}
    </PropertyPanelSurface>
  );
}

function eligibilityReasonLabels(reasonCodes: string[]): string[] {
  const labels: Record<string, string> = {
    UNIT_INACTIVE: "房源已停用或不存在",
    UNIT_USAGE_NOT_HOUSING: "房源用途不是住房",
    OPERATION_CONFIG_MISSING: "尚未配置经营模式",
    OPERATION_MODE_NOT_LONG_RENT: "经营模式不是长租",
    OPERATION_STATUS_NOT_ENABLED: "经营状态不是启用",
    LEASE_PERIOD_OCCUPIED: "拟定租期与现有占用、商业合同或未完成清洁/周转任务冲突"
  };
  return reasonCodes.map((code) => labels[code] ?? code);
}

function isPositiveMoney(value: string) {
  return /^(?:0\.(?:0*[1-9]\d*)|[1-9]\d*(?:\.\d+)?)$/.test(value);
}

function LeaseRelated({ capabilities, data }: LeaseContextProps) {
  const fileCapability = capabilities.fileCapability("housing_handover");
  return (
    <>
      {data.occupants ? <PropertyPanelSurface title="入住人员">
        {data.occupants.map((item) => <p key={item.id}>{item.partyDisplayName ?? item.partyId} · {item.occupantRole}</p>)}
        {!data.occupants.length ? <p>暂无入住人员。</p> : null}
      </PropertyPanelSurface> : null}
      {data.finance_summary ? <PropertyPanelSurface title="住房子账"><DetailGrid rows={[
        ["应收", money(data.finance_summary.receivable)], ["已收", money(data.finance_summary.paid)],
        ["减免", money(data.finance_summary.waived)], ["未收", money(data.finance_summary.outstanding)],
        ["押金余额", money(data.finance_summary.deposit_balance)]
      ]} /></PropertyPanelSurface> : null}
      {data.handovers ? <PropertyPanelSurface title="交割记录">
        {data.handovers.map((item) => <article className="ds-mobile-record" key={item.id}>
          <strong>{item.handoverType === "move_in" ? "入住" : "退租"} · {item.status}</strong>
          {item.photo_files ? <HousingEvidenceList canDownload={fileCapability.canDownload} canRead={fileCapability.canRead} files={item.photo_files} label="租约交割证据" /> : null}
        </article>)}
      </PropertyPanelSurface> : null}
    </>
  );
}

function LeaseDetail(props: LeaseContextProps) {
  const user = useAuthUser();
  const handoverCapabilities = projectPropertyCapabilities(user, "housing.handovers");
  return (
    <div className={styles.stack}>
      <LeasePrimary {...props} />
      <LeaseRelated {...props} />
      <HousingLeaseSecondaryActions capabilities={props.capabilities} data={props.data} reload={props.reload} />
      <HousingHandoverForm capabilities={handoverCapabilities} leaseId={props.data.lease.id} leaseStatus={props.data.lease.status} onCompleted={props.reload} />
    </div>
  );
}

export function HousingLeaseDetailClient({ leaseId }: { leaseId: string }) {
  return <DetailPage definition={{
    endpoint: `/housing/leases/${encodeURIComponent(leaseId)}`, fallbackTitle: "租约详情",
    featureId: "housing.leases", listRoute: "/housing/leases", readActionId: "housing.leases.detail",
    title: (data: HousingLeaseDetailResponse) => data.lease.leaseCode,
    render: (data, capabilities, reload) => <LeaseDetail capabilities={capabilities} data={data} reload={reload} />
  }} />;
}
