"use client";

import { PROPERTY_BUSINESS_PERMISSIONS, type HousingLeaseDetailResponse } from "@jinhu/shared";
import Link from "next/link";
import { useRef, useState } from "react";
import { PropertyPanelSurface, type PropertyCapabilityProjection } from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { HousingEvidenceList } from "./HousingEvidenceList";
import { HousingHandoverForm } from "./HousingHandoverForm";
import { HousingLeaseSecondaryActions } from "./HousingLeaseSecondaryActions";
import { BlockedHighRiskActions, DetailGrid, DetailPage, money } from "./HousingDetailShell";
import styles from "./HousingWorkbench.module.css";
import { useStableIdempotency } from "./use-stable-idempotency";

interface LeaseContextProps {
  capabilities: PropertyCapabilityProjection;
  data: HousingLeaseDetailResponse;
  reload(): Promise<void>;
}

function LeasePrimary({ capabilities, data, reload }: LeaseContextProps) {
  const [feedback, setFeedback] = useState("");
  const lock = useRef(false);
  const idempotency = useStableIdempotency();
  async function run(action: "submit" | "activate") {
    const operation = `housing-lease-${action}`;
    if (lock.current || !capabilities.actionAllowed(`housing.leases.${action}`)) return;
    lock.current = true; setFeedback("");
    try {
      await apiRequest(`/housing/leases/${encodeURIComponent(data.lease.id)}/${action}`, {
        method: "POST", token: getAccessToken(),
        idempotencyKey: idempotency.keyFor(operation, { action, leaseId: data.lease.id })
      });
      idempotency.complete(operation); setFeedback(action === "submit" ? "租约已提交。" : "租约已生效。");
      await reload();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "操作失败");
    } finally {
      lock.current = false;
    }
  }
  const submitAllowed = data.lease.status === "draft" && capabilities.actionAllowed("housing.leases.submit");
  const eligible = data.lease.eligibility?.eligible !== false;
  const canActivate = data.lease.status === "pending_signature" && Boolean(data.lease.signatureFileId)
    && capabilities.actionAllowed("housing.leases.activate");
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
        {submitAllowed ? <button className="ds-button ds-button-primary" disabled={!eligible}
          onClick={() => void run("submit")} type="button">提交租约</button> : null}
        {canActivate ? <button className="ds-button ds-button-primary" onClick={() => void run("activate")} type="button">生效租约</button> : null}
      </div>
      {feedback ? <p aria-live="polite">{feedback}</p> : null}
    </PropertyPanelSurface>
  );
}

function eligibilityReasonLabels(reasonCodes: string[]): string[] {
  const labels: Record<string, string> = {
    UNIT_INACTIVE: "房源已停用或不存在",
    OPERATION_CONFIG_MISSING: "尚未配置经营模式",
    OPERATION_MODE_NOT_LONG_RENT: "经营模式不是长租",
    OPERATION_STATUS_NOT_ENABLED: "经营状态不是启用",
    LEASE_PERIOD_OCCUPIED: "拟定租期与现有占用、商业合同或未完成清洁/周转任务冲突"
  };
  return reasonCodes.map((code) => labels[code] ?? code);
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
  return (
    <div className={styles.stack}>
      <LeasePrimary {...props} />
      <LeaseRelated {...props} />
      <HousingLeaseSecondaryActions capabilities={props.capabilities} data={props.data} reload={props.reload} />
      <HousingHandoverForm capabilities={props.capabilities} leaseId={props.data.lease.id} leaseStatus={props.data.lease.status} onCompleted={props.reload} />
      <BlockedHighRiskActions labels={["租约审批", "作废", "提前退租或结清"]} />
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
