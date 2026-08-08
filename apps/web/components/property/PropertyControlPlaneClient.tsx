"use client";

import type {
  ApprovalIncidentDetail,
  ApprovalIncidentListItem,
  IdentitySubmissionProjection,
  IncidentDetail,
  IncidentListItem,
  NotificationDetail,
  NotificationListItem,
  PropertyPaginatedResult
} from "@jinhu/shared";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";
import {
  PropertyPageSurface,
  PropertyPanelSurface
} from "../../features/property-shared";
import styles from "./PropertyControlPlane.module.css";
import { IdentityEvidenceList } from "./IdentityEvidenceList";
import {
  IDENTITY_STATUS_OPTIONS,
  identityMutationValidationMessage,
  safePropertyDeepLink
} from "./property-control-plane.logic";

export type PropertyControlPlaneSurface =
  | "identity"
  | "notifications"
  | "event-incidents"
  | "approval-incidents";

type ControlPlaneItem = IdentitySubmissionProjection | NotificationListItem
  | IncidentListItem | ApprovalIncidentListItem;
type ControlPlaneDetail = IdentitySubmissionProjection | NotificationDetail
  | IncidentDetail | ApprovalIncidentDetail;

const CONFIG = {
  identity: {
    title: "身份核验目录",
    description: "查看共享 Party 的核验提交、当前证据与分派状态。",
    api: "/property/identity-submissions",
    route: "/assets/identity-submissions",
    statusOptions: IDENTITY_STATUS_OPTIONS
  },
  notifications: {
    title: "房产通知",
    description: "查看审批、身份、任务和事件投递产生的个人通知。",
    api: "/property/notifications",
    route: "/property/notifications",
    statusOptions: ["unread", "read"]
  },
  "event-incidents": {
    title: "事件投递异常",
    description: "查看受保护的事件 DLQ，并仅在服务端允许时执行重放。",
    api: "/property/event-delivery-incidents",
    route: "/property/event-delivery-incidents",
    statusOptions: ["active", "quarantined", "replaying", "resolved"]
  },
  "approval-incidents": {
    title: "审批执行异常",
    description: "查看已耗尽基础设施重试的审批，并按冻结版本重新入队。",
    api: "/property/approval-incidents",
    route: "/property/approval-incidents",
    statusOptions: []
  }
} as const;

export function PropertyControlPlaneListClient({ surface }: { surface: PropertyControlPlaneSurface }) {
  const config = CONFIG[surface];
  const searchParams = useSearchParams();
  const partyId = surface === "identity" ? searchParams.get("partyId") : null;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [data, setData] = useState<PropertyPaginatedResult<ControlPlaneItem, never> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) {
      params.set(surface === "notifications" ? "readStatus" : "status", status);
    }
    if (partyId) params.set("partyId", partyId);
    return params.toString();
  }, [page, partyId, status, surface]);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<PropertyPaginatedResult<ControlPlaneItem, never>>(
        `${config.api}?${query}`,
        { token: getAccessToken() ?? undefined }
      );
      if (sequence === requestSequence.current) setData(response.data);
    } catch (cause) {
      if (sequence === requestSequence.current) {
        setError(cause instanceof Error ? cause.message : "数据加载失败");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [config.api, query]);

  useEffect(() => void load(), [load]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  return <PropertyPageSurface className={styles.stack}>
    <header className="ds-hero">
      <div className="ds-hero-copy">
      <p className="ds-kicker">共享房产控制面</p>
      <h1>{config.title}</h1>
      <p>{config.description}</p>
      </div>
    </header>
    <PropertyPanelSurface>
      <div className={styles.toolbar}>
        {config.statusOptions.length ? <label>状态
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">全部</option>
            {config.statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label> : null}
        <button className="ds-button" onClick={() => void load()} type="button">刷新</button>
      </div>
    </PropertyPanelSurface>
    {error ? <PropertyPanelSurface aria-live="polite"><p>{error}</p></PropertyPanelSurface> : null}
    {loading ? <PropertyPanelSurface aria-live="polite"><p>正在加载…</p></PropertyPanelSurface> : null}
    {!loading && !error ? <ControlPlaneRecords config={config} items={data?.items ?? []} surface={surface} /> : null}
    <nav aria-label="分页" className={`ds-panel ds-section-panel ${styles.pager}`}>
      <button className="ds-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">上一页</button>
      <span>第 {page} / {pages} 页，共 {data?.total ?? 0} 条</span>
      <button className="ds-button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} type="button">下一页</button>
    </nav>
  </PropertyPageSurface>;
}

function ControlPlaneRecords({ config, items, surface }: {
  config: (typeof CONFIG)[PropertyControlPlaneSurface];
  items: ControlPlaneItem[];
  surface: PropertyControlPlaneSurface;
}) {
  if (!items.length) return <PropertyPanelSurface><p>当前筛选条件下暂无记录。</p></PropertyPanelSurface>;
  return <>
    <section className={`ds-table-shell ${styles.desktopOnly}`}>
      <table aria-label={`${config.title}桌面列表`}><thead><tr><th>记录</th><th>状态</th><th>来源</th><th>更新时间</th></tr></thead>
        <tbody>{items.map((item) => {
          const row = normalize(item, surface);
          return <tr key={row.id}><td><Link className={styles.tableLink} href={`${config.route}/${row.id}`}>{row.title}</Link></td>
            <td>{row.status}</td><td>{row.source}</td><td>{formatTime(row.updatedAt)}</td></tr>;
        })}</tbody></table>
    </section>
    <section aria-label={`${config.title}移动列表`} className={`ds-mobile-record-list ${styles.mobileOnly}`}>
      {items.map((item) => {
        const row = normalize(item, surface);
        return <article className="ds-mobile-record" key={row.id}>
          <Link className={styles.tableLink} href={`${config.route}/${row.id}`}>{row.title}</Link>
          <div className={styles.recordMeta}><span>状态：{row.status}</span><span>来源：{row.source}</span>
            <span>更新时间：{formatTime(row.updatedAt)}</span></div>
        </article>;
      })}
    </section>
  </>;
}

export function PropertyControlPlaneDetailClient({ id, surface }: {
  id: string;
  surface: PropertyControlPlaneSurface;
}) {
  const config = CONFIG[surface];
  const [detail, setDetail] = useState<ControlPlaneDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [reason, setReason] = useState("");
  const [assignedVerifierId, setAssignedVerifierId] = useState("");
  const [identityDecision, setIdentityDecision] = useState<"verified" | "rejected">("verified");
  const [mutating, setMutating] = useState(false);
  const mutationLock = useRef(false);
  const mutationKeys = useRef(new Map<string, string>());
  const action = surface === "identity" ? null : expectedAction(surface);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await apiRequest<ControlPlaneDetail>(
        `${config.api}/${encodeURIComponent(id)}`,
        { token: getAccessToken() ?? undefined }
      );
      setDetail(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "详情加载失败");
    } finally { setLoading(false); }
  }, [config.api, id]);

  useEffect(() => void load(), [load]);

  async function mutate(identityAction?: string) {
    if (!detail || mutationLock.current) return;
    const selectedAction = surface === "identity" ? identityAction ?? null : action;
    if (!selectedAction || !allowedActions(detail).includes(selectedAction)) return;
    if (surface === "identity") {
      const validationMessage = identityMutationValidationMessage(selectedAction, identityDecision, reason);
      if (validationMessage) { setFeedback(validationMessage); return; }
    }
    if (selectedAction !== "property.notification.mark-read"
      && selectedAction !== "party.identity.claim"
      && selectedAction !== "party.identity.submit"
      && selectedAction !== "party.identity.verify"
      && !reason.trim()) {
      setFeedback("请填写操作原因。"); return;
    }
    mutationLock.current = true; setMutating(true); setFeedback("");
    const mutationId = `${surface}:${id}:${selectedAction}`;
    const clientKey = mutationKeys.current.get(mutationId) ?? createIdempotencyKey(selectedAction);
    mutationKeys.current.set(mutationId, clientKey);
    try {
      const mutation = surface === "identity"
        ? identityMutationFor(
            detail as IdentitySubmissionProjection,
            selectedAction,
            reason,
            assignedVerifierId,
            identityDecision,
            clientKey
          )
        : mutationFor(surface, detail, reason, clientKey);
      await apiRequest(mutation.path, {
        method: "POST", token: getAccessToken() ?? undefined,
        idempotencyKey: clientKey, body: mutation.body
      });
      mutationKeys.current.delete(mutationId);
      setFeedback("操作已提交。"); setReason(""); setAssignedVerifierId(""); await load();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "操作失败");
    } finally { mutationLock.current = false; setMutating(false); }
  }

  return <PropertyPageSurface className={styles.stack}>
    <header className="ds-hero"><div className="ds-hero-copy"><p className="ds-kicker">共享房产控制面</p><h1>{config.title}详情</h1>
      <p><Link href={config.route}>返回列表</Link></p></div></header>
    {loading ? <PropertyPanelSurface><p>正在加载…</p></PropertyPanelSurface> : null}
    {error ? <PropertyPanelSurface aria-live="polite"><p>{error}</p><button className="ds-button" onClick={() => void load()} type="button">重试</button></PropertyPanelSurface> : null}
    {detail ? <>
      <PropertyPanelSurface><dl className={styles.detailGrid}>
        {detailFields(detail, surface).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl></PropertyPanelSurface>
      {surface === "identity" && "partyId" in detail ? <PropertyPanelSurface title="Party 身份档案">
        <p><Link href={`/assets/parties/${encodeURIComponent(detail.partyId)}?tab=identity#identity`}>打开 Party 身份页签</Link></p></PropertyPanelSurface> : null}
      {surface === "identity" && "evidence" in detail ? <PropertyPanelSurface title="身份核验证据">
        <IdentityEvidenceList files={detail.evidence.files} />
      </PropertyPanelSurface> : null}
      {surface === "notifications" && "deepLink" in detail && safePropertyDeepLink(detail.deepLink)
        ? <PropertyPanelSurface title="通知来源">
          <p><Link href={safePropertyDeepLink(detail.deepLink)! as Route}>打开关联业务记录</Link></p>
        </PropertyPanelSurface>
        : null}
      {safeDetails(detail).length ? <PropertyPanelSurface title="安全详情">
        <pre className={styles.safeDetails}>{JSON.stringify(safeDetailsObject(detail), null, 2)}</pre></PropertyPanelSurface> : null}
      {surface !== "identity" && action && allowedActions(detail).includes(action) ? <PropertyPanelSurface title="允许操作">
        <div className={styles.actionForm}>
          {surface === "notifications" ? null : <label>原因<textarea maxLength={1000} onChange={(event) => setReason(event.target.value)} value={reason} /></label>}
          <button aria-busy={mutating} className="ds-button ds-button-primary" disabled={mutating}
            onClick={() => void mutate()} type="button">{mutating ? "正在提交…" : actionLabel(surface)}</button>
          {feedback ? <p aria-live="polite">{feedback}</p> : null}
        </div></PropertyPanelSurface> : null}
      {surface === "identity" && allowedActions(detail).length ? <PropertyPanelSurface title="身份核验操作">
        <div className={styles.actionForm}>
          {allowedActions(detail).includes("party.identity.verify") ? <label>核验决定
            <select value={identityDecision} onChange={(event) => setIdentityDecision(
              event.target.value as "verified" | "rejected"
            )}><option value="verified">通过</option><option value="rejected">拒绝</option></select>
          </label> : null}
          {allowedActions(detail).includes("party.identity.reassign") ? <label>新核验人 ID（留空即解除分派）
            <input value={assignedVerifierId} onChange={(event) => setAssignedVerifierId(event.target.value)} />
          </label> : null}
          {allowedActions(detail).some((value) => [
            "party.identity.reassign", "party.identity.verify", "party.identity.withdraw"
          ].includes(value)) ? <label>原因<textarea maxLength={500}
            onChange={(event) => setReason(event.target.value)} value={reason} /></label> : null}
          <div className={styles.toolbar}>{allowedActions(detail).map((identityAction) =>
            <button aria-busy={mutating} className="ds-button ds-button-primary" disabled={mutating}
              key={identityAction} onClick={() => void mutate(identityAction)} type="button">
              {identityActionLabel(identityAction)}
            </button>)}</div>
          {feedback ? <p aria-live="polite">{feedback}</p> : null}
        </div>
      </PropertyPanelSurface> : null}
    </> : null}
  </PropertyPageSurface>;
}

function normalize(item: ControlPlaneItem, surface: PropertyControlPlaneSurface) {
  if (surface === "identity") {
    const row = item as IdentitySubmissionProjection;
    return { id: row.id, title: row.partyDisplayName, status: row.status,
      source: row.verificationQueueName ?? "未分派", updatedAt: row.updateTime };
  }
  if (surface === "notifications") {
    const row = item as NotificationListItem;
    return { id: row.id, title: row.title, status: row.readAt ? "已读" : "未读",
      source: row.sourceType, updatedAt: row.readAt ?? row.createdAt };
  }
  if (surface === "event-incidents") {
    const row = item as IncidentListItem;
    return { id: row.dlqId, title: `${row.consumerName} · ${row.errorCode}`, status: row.status,
      source: row.failureSide, updatedAt: row.lastFailedAt };
  }
  const row = item as ApprovalIncidentListItem;
  return { id: row.requestId, title: row.title, status: row.executionStatus,
    source: `${row.sourceType} · ${row.sourceId}`, updatedAt: row.updatedAt };
}

function detailFields(detail: ControlPlaneDetail, surface: PropertyControlPlaneSurface): [string, string][] {
  const row = normalize(detail as ControlPlaneItem, surface);
  const fields: [string, string][] = [["记录 ID", row.id], ["标题", row.title], ["状态", row.status],
    ["来源", row.source], ["更新时间", formatTime(row.updatedAt)]];
  if (surface === "identity") {
    const identity = detail as IdentitySubmissionProjection;
    fields.push(["Party ID", identity.partyId], ["证件类型", identity.evidence.documentType ?? "—"],
      ["证件号码", identity.evidence.identityNumberMasked ?? "—"], ["证据文件", String(identity.evidence.fileCount)]);
  } else if (surface === "event-incidents") {
    const incident = detail as IncidentDetail;
    fields.push(["事件 ID", incident.eventId], ["异常 ID", incident.incidentId],
      ["尝试次数", String(incident.attemptCount)], ["版本", String(incident.version)]);
  } else if (surface === "approval-incidents") {
    const incident = detail as ApprovalIncidentDetail;
    fields.push(["异常 ID", incident.incidentId], ["动作", incident.actionId],
      ["错误码", incident.errorCode], ["执行版本", String(incident.executionVersion)]);
  }
  return fields;
}

function mutationFor(surface: PropertyControlPlaneSurface, detail: ControlPlaneDetail,
reason: string, clientKey: string) {
  if (surface === "notifications") {
    const row = detail as NotificationDetail;
    return { path: `/property/notifications/${row.id}/read`,
      body: { clientKey, expectedReadVersion: row.readVersion } };
  }
  if (surface === "event-incidents") {
    const row = detail as IncidentDetail;
    return { path: `/property/event-delivery-incidents/${row.dlqId}/replay`,
      body: { clientKey, incidentId: row.incidentId, reason: reason.trim(), expectedDlqVersion: row.version } };
  }
  const row = detail as ApprovalIncidentDetail;
  return { path: `/property/approvals/${row.requestId}/retry`,
    body: { clientKey, incidentId: row.incidentId, reason: reason.trim(),
      expectedExecutionVersion: row.executionVersion } };
}

function identityMutationFor(
  detail: IdentitySubmissionProjection,
  action: string,
  reason: string,
  assignedVerifierId: string,
  decision: "verified" | "rejected",
  clientKey: string
) {
  const common = { clientKey, expectedVersion: detail.version };
  if (action === "party.identity.submit") {
    return { path: `/property/identity-submissions/${detail.id}/submit`, body: common };
  }
  if (action === "party.identity.claim") {
    return { path: `/property/identity-submissions/${detail.id}/claim`,
      body: { ...common, expectedAssignmentVersion: detail.assignmentVersion } };
  }
  if (action === "party.identity.reassign") {
    return { path: `/property/identity-submissions/${detail.id}/reassign`, body: {
      ...common,
      expectedAssignmentVersion: detail.assignmentVersion,
      assignedVerifierId: assignedVerifierId.trim() || null,
      reason: reason.trim()
    } };
  }
  if (action === "party.identity.verify") {
    return { path: `/property/identity-submissions/${detail.id}/decisions`, body: {
      ...common,
      expectedAssignmentVersion: detail.assignmentVersion,
      decision,
      ...(reason.trim() ? { reason: reason.trim() } : {})
    } };
  }
  if (action === "party.identity.withdraw") {
    return { path: `/property/identity-submissions/${detail.id}/withdraw`,
      body: { ...common, reason: reason.trim() } };
  }
  throw new Error("身份核验操作已变化，请刷新后重试");
}

function allowedActions(detail: ControlPlaneDetail): readonly string[] {
  return Array.isArray(detail.allowedActions) ? detail.allowedActions : [];
}

function expectedAction(surface: PropertyControlPlaneSurface): string | null {
  return surface === "notifications" ? "property.notification.mark-read"
    : surface === "event-incidents" ? "property.event.replay"
      : surface === "approval-incidents" ? "property.approval.incident-retry" : null;
}

function safeDetailsObject(detail: ControlPlaneDetail): Record<string, unknown> {
  if ("safeDetails" in detail) return detail.safeDetails;
  if ("safeReconcileSummary" in detail) return {
    reconcile: detail.safeReconcileSummary,
    auditTimeline: detail.auditTimeline
  };
  return {};
}

function safeDetails(detail: ControlPlaneDetail): string[] {
  return Object.keys(safeDetailsObject(detail));
}

function actionLabel(surface: PropertyControlPlaneSurface): string {
  return surface === "notifications" ? "标为已读"
    : surface === "event-incidents" ? "重放事件" : "重试审批执行";
}

function identityActionLabel(action: string): string {
  return ({
    "party.identity.submit": "提交核验",
    "party.identity.claim": "领取核验",
    "party.identity.reassign": "重新分派",
    "party.identity.verify": "提交决定",
    "party.identity.withdraw": "撤回提交"
  } as Record<string, string>)[action] ?? action;
}

function formatTime(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString("zh-CN");
}
