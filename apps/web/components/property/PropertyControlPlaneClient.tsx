"use client";

import {
  PROPERTY_BUSINESS_PERMISSIONS,
  SYSTEM_PERMISSIONS
} from "@jinhu/shared";
import type {
  ApprovalIncidentDetail,
  ApprovalIncidentListItem,
  FileRecord,
  IdentityAuditListResponse,
  IdentitySubmissionProjection,
  IdentityTerminalCasProjection,
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
import { useAuthUser } from "../../lib/auth-context";
import { getAccessToken } from "../../lib/authz";
import { hasPermission } from "../../lib/permissions";
import {
  PropertyPageSurface,
  PropertyPanelSurface
} from "../../features/property-shared";
import { PermissionGuard } from "../auth/PermissionGuard";
import { FileUploader } from "../files/FileUploader";
import { PendingAttachmentList } from "../files/PendingAttachmentList";
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
interface IdentityDraftEditState {
  dirty: boolean;
  busy: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONFIG = {
  identity: {
    title: "身份核验工作台",
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
          <select name={`${surface}-status`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">全部</option>
            {config.statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label> : null}
        <button className="ds-button" onClick={() => void load()} type="button">刷新</button>
      </div>
    </PropertyPanelSurface>
    {surface === "identity" ? <IdentityDraftCreatePanel
      identityRows={(data?.items ?? []) as IdentitySubmissionProjection[]}
      partyId={partyId}
      onCreated={() => void load()}
    /> : null}
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
  const [auditData, setAuditData] = useState<IdentityAuditListResponse | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [mutating, setMutating] = useState(false);
  const [identityDraftEditState, setIdentityDraftEditState] = useState<IdentityDraftEditState>({
    dirty: false,
    busy: false
  });
  const authUser = useAuthUser();
  const mutationLock = useRef(false);
  const mutationKeys = useRef(new Map<string, string>());
  const action = surface === "identity" ? null : expectedAction(surface);
  const canReadIdentityAudit = surface === "identity"
    && hasPermission(authUser, PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ)
    && hasPermission(authUser, SYSTEM_PERMISSIONS.AUDIT_READ);
  const identityDetailVersion = surface === "identity" && detail && "version" in detail
    ? detail.version
    : null;

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
  useEffect(() => {
    setIdentityDraftEditState({ dirty: false, busy: false });
  }, [id, identityDetailVersion, surface]);

  const loadAudit = useCallback(async (nextPage: number) => {
    if (surface !== "identity") return;
    if (!canReadIdentityAudit) {
      setAuditData(null);
      setAuditError("");
      setAuditLoading(false);
      return;
    }
    setAuditLoading(true);
    setAuditError("");
    try {
      const response = await apiRequest<IdentityAuditListResponse>(
        `${config.api}/${encodeURIComponent(id)}/audit?page=${nextPage}&pageSize=20&sort=occurredAt&order=desc`,
        { token: getAccessToken() ?? undefined }
      );
      setAuditPage(nextPage);
      setAuditData(response.data);
    } catch (cause) {
      setAuditError(cause instanceof Error ? cause.message : "审计时间线加载失败");
    } finally {
      setAuditLoading(false);
    }
  }, [canReadIdentityAudit, config.api, id, surface]);

  useEffect(() => {
    if (surface === "identity" && detail) void loadAudit(1);
  }, [canReadIdentityAudit, detail, loadAudit, surface]);

  async function mutate(identityAction?: string) {
    if (!detail || mutationLock.current) return;
    const selectedAction = surface === "identity" ? identityAction ?? null : action;
    if (!selectedAction || !allowedActions(detail).includes(selectedAction)) return;
    if (surface === "identity" && selectedAction === "party.identity.submit" && (
      identityDraftEditState.dirty || identityDraftEditState.busy
    )) {
      setFeedback(identityDraftEditState.busy
        ? "身份核验草稿正在保存或上传，请完成后再提交核验。"
        : "身份核验草稿有未保存修改，请先保存草稿再提交核验。");
      return;
    }
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
      {surface === "identity" && "evidence" in detail && detail.status === "draft"
      && allowedActions(detail).includes("party.identity.submit") ? <IdentityDraftEditPanel
        detail={detail as IdentitySubmissionProjection}
        onDraftStateChange={setIdentityDraftEditState}
        onUpdated={load}
      /> : null}
      {surface === "identity" ? <IdentityAuditPanel
        data={auditData}
        error={auditError}
        loading={auditLoading}
        onPageChange={loadAudit}
        onReload={() => loadAudit(auditPage)}
      /> : null}
      {surface === "notifications" && "deepLink" in detail && safePropertyDeepLink(detail.deepLink)
        ? <PropertyPanelSurface title="通知来源">
          <p><Link href={safePropertyDeepLink(detail.deepLink)! as Route}>打开关联业务记录</Link></p>
        </PropertyPanelSurface>
        : null}
      {safeDetails(detail).length ? <PropertyPanelSurface title="安全详情">
        <pre className={styles.safeDetails}>{JSON.stringify(safeDetailsObject(detail), null, 2)}</pre></PropertyPanelSurface> : null}
      {surface !== "identity" && action && allowedActions(detail).includes(action) ? <PropertyPanelSurface title="允许操作">
        <div className={styles.actionForm}>
          {surface === "notifications" ? null : <label>原因<textarea maxLength={1000} name={`${surface}-reason`} onChange={(event) => setReason(event.target.value)} value={reason} /></label>}
          <button aria-busy={mutating} className="ds-button ds-button-primary" disabled={mutating}
            onClick={() => void mutate()} type="button">{mutating ? "正在提交…" : actionLabel(surface)}</button>
          {feedback ? <p aria-live="polite">{feedback}</p> : null}
        </div></PropertyPanelSurface> : null}
      {surface === "identity" && allowedActions(detail).length ? <PropertyPanelSurface title="身份核验操作">
        <div className={styles.actionForm}>
          {allowedActions(detail).includes("party.identity.verify") ? <label>核验决定
            <select name="identity_decision" value={identityDecision} onChange={(event) => setIdentityDecision(
              event.target.value as "verified" | "rejected"
            )}><option value="verified">通过</option><option value="rejected">拒绝</option></select>
          </label> : null}
          {allowedActions(detail).includes("party.identity.reassign") ? <label>新核验人 ID（留空即解除分派）
            <input name="assigned_verifier_id" value={assignedVerifierId} onChange={(event) => setAssignedVerifierId(event.target.value)} />
          </label> : null}
          {allowedActions(detail).some((value) => [
            "party.identity.reassign", "party.identity.verify", "party.identity.withdraw"
          ].includes(value)) ? <label>原因<textarea maxLength={500} name="identity_action_reason"
            onChange={(event) => setReason(event.target.value)} value={reason} /></label> : null}
          <div className={styles.toolbar}>{allowedActions(detail).map((identityAction) =>
            <button aria-busy={mutating} className="ds-button ds-button-primary"
              disabled={mutating || (identityAction === "party.identity.submit" && (
                identityDraftEditState.dirty || identityDraftEditState.busy
              ))}
              key={identityAction} onClick={() => void mutate(identityAction)} type="button">
              {identityActionLabel(identityAction)}
            </button>)}</div>
          {feedback ? <p aria-live="polite">{feedback}</p> : null}
        </div>
      </PropertyPanelSurface> : null}
    </> : null}
  </PropertyPageSurface>;
}

function IdentityDraftCreatePanel({ identityRows, partyId, onCreated }: {
  partyId: string | null;
  identityRows: IdentitySubmissionProjection[];
  onCreated: () => void;
}) {
  const [draftPartyId, setDraftPartyId] = useState(partyId ?? "");
  const [expectedIdentityVersion, setExpectedIdentityVersion] = useState(0);
  const [supersedesSubmissionId, setSupersedesSubmissionId] = useState("");
  const [expectedSupersededStatus, setExpectedSupersededStatus] = useState<"rejected" | "withdrawn" | "verified" | "">("");
  const [expectedSupersededVersion, setExpectedSupersededVersion] = useState(0);
  const [terminalCasState, setTerminalCasState] = useState<{
    data: IdentityTerminalCasProjection | null;
    error: boolean;
    loading: boolean;
    partyId: string;
  }>({ data: null, error: false, loading: false, partyId: "" });
  const autoSupersedesId = useRef<string | null>(null);
  const effectivePartyId = draftPartyId.trim() || partyId || "";
  const hasValidPartyId = UUID_PATTERN.test(effectivePartyId);
  const terminalCasMatchesParty = terminalCasState.partyId === effectivePartyId;
  const terminalCasPending = hasValidPartyId && (!terminalCasMatchesParty || terminalCasState.loading);
  const terminalCasUnavailable = hasValidPartyId && terminalCasMatchesParty && terminalCasState.error;
  const terminalCas = hasValidPartyId && terminalCasMatchesParty ? terminalCasState.data : null;
  const terminalCasActiveSubmission = Boolean(
    terminalCas && terminalCas.identityVersion > 0 && !terminalCas.terminalSubmission
  );
  const terminalCasBlocked = terminalCasPending || terminalCasUnavailable || terminalCasActiveSubmission;
  const terminalSubmission = useMemo(
    () => terminalCas?.terminalSubmission
      ?? (!hasValidPartyId ? latestTerminalIdentitySubmission(identityRows, effectivePartyId) : null),
    [effectivePartyId, hasValidPartyId, identityRows, terminalCas]
  );
	  const [feedback, setFeedback] = useState("");
	  const [busy, setBusy] = useState(false);
	  const [terminalCasRefreshKey, setTerminalCasRefreshKey] = useState(0);
	  const createKey = useRef<string | null>(null);

  useEffect(() => setDraftPartyId(partyId ?? ""), [partyId]);
  useEffect(() => {
    if (!hasValidPartyId) {
      setTerminalCasState({ data: null, error: false, loading: false, partyId: "" });
      return;
    }
    let cancelled = false;
    setTerminalCasState({ data: null, error: false, loading: true, partyId: effectivePartyId });
    apiRequest<IdentityTerminalCasProjection>(
      `/property/identity-submissions/parties/${encodeURIComponent(effectivePartyId)}/terminal-cas`,
      { token: getAccessToken() ?? undefined }
    ).then((result) => {
      if (!cancelled) setTerminalCasState({ data: result.data, error: false, loading: false, partyId: effectivePartyId });
    }).catch(() => {
      if (!cancelled) setTerminalCasState({ data: null, error: true, loading: false, partyId: effectivePartyId });
    });
    return () => {
      cancelled = true;
    };
	  }, [effectivePartyId, hasValidPartyId, terminalCasRefreshKey]);
  useEffect(() => {
    if (!terminalSubmission) return;
    setSupersedesSubmissionId(terminalSubmission.id);
    setExpectedSupersededStatus(terminalSubmission.status as "rejected" | "withdrawn" | "verified");
    setExpectedSupersededVersion(terminalSubmission.version);
    setExpectedIdentityVersion(terminalSubmission.identityVersion);
    autoSupersedesId.current = terminalSubmission.id;
  }, [terminalSubmission]);
  useEffect(() => {
    if (terminalSubmission || !autoSupersedesId.current) return;
    setSupersedesSubmissionId((current) => current === autoSupersedesId.current ? "" : current);
    setExpectedSupersededStatus((current) => supersedesSubmissionId === autoSupersedesId.current ? "" : current);
    setExpectedSupersededVersion((current) => supersedesSubmissionId === autoSupersedesId.current ? 0 : current);
    setExpectedIdentityVersion((current) => supersedesSubmissionId === autoSupersedesId.current ? 0 : current);
    autoSupersedesId.current = null;
  }, [supersedesSubmissionId, terminalSubmission]);

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!draftPartyId.trim()) {
      setFeedback("请填写 Party ID。");
      return;
    }
    if (!UUID_PATTERN.test(draftPartyId.trim())) {
      setFeedback("Party ID 需为有效 UUID。");
      return;
    }
    if (terminalCasPending) {
      setFeedback("正在核对 Party 当前身份版本，请稍后再创建草稿。");
      return;
    }
    if (terminalCasUnavailable) {
      setFeedback("Party 当前身份版本核对失败，请重试后再创建草稿。");
      return;
    }
    if (terminalCasActiveSubmission) {
      setFeedback("Party 当前存在草稿或待核验提交，请先处理完成后再创建草稿。");
      return;
    }
    const supersessionValues = [
      supersedesSubmissionId.trim(),
      expectedSupersededStatus,
      expectedSupersededVersion > 0 ? String(expectedSupersededVersion) : ""
    ];
    if (supersessionValues.some(Boolean) && !supersessionValues.every(Boolean)) {
      setFeedback("复核原提交 ID、状态和版本需要同时填写。");
      return;
    }
    setBusy(true);
    setFeedback("");
    createKey.current ??= createIdempotencyKey("party-identity-draft-create");
    try {
      await apiRequest("/property/identity-submissions", {
        method: "POST",
        token: getAccessToken() ?? undefined,
        idempotencyKey: createKey.current,
        body: {
          clientKey: createKey.current,
          partyId: draftPartyId.trim(),
          expectedIdentityVersion,
          ...(supersedesSubmissionId.trim() && expectedSupersededStatus ? {
            supersedesSubmissionId: supersedesSubmissionId.trim(),
            expectedSupersededStatus,
            expectedSupersededVersion
          } : {})
        }
      });
	      createKey.current = null;
	      setFeedback("身份核验草稿已创建。");
	      setTerminalCasRefreshKey((current) => current + 1);
	      onCreated();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "身份核验草稿创建失败");
    } finally {
      setBusy(false);
    }
  }

  return <PermissionGuard module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE}>
    <PropertyPanelSurface title="创建身份核验草稿">
      <form className={styles.actionForm} onSubmit={(event) => void createDraft(event)}>
        <div className={styles.formGrid}>
          <label>Party ID
            <input name="party_id" required value={draftPartyId} onChange={(event) => {
              createKey.current = null;
              setDraftPartyId(event.target.value);
            }} />
          </label>
          <label>预期身份版本
            <input min={0} name="expected_identity_version" onFocus={(event) => event.target.select()} step={1} type="number" value={expectedIdentityVersion}
              onChange={(event) => {
                createKey.current = null;
                setExpectedIdentityVersion(Number(event.target.value || 0));
              }} />
          </label>
        </div>
        {terminalSubmission ? <p>
          将基于终态提交 {terminalSubmission.id}（{terminalSubmission.status}，版本 {terminalSubmission.version}）创建复核草稿。
        </p> : null}
        <div className={styles.formGrid}>
          <label>复核原提交 ID
            <input name="supersedes_submission_id" value={supersedesSubmissionId} onChange={(event) => {
              createKey.current = null;
              setSupersedesSubmissionId(event.target.value);
            }} />
          </label>
          <label>复核原提交状态
            <select name="expected_superseded_status" value={expectedSupersededStatus} onChange={(event) => {
              createKey.current = null;
              setExpectedSupersededStatus(event.target.value as "rejected" | "withdrawn" | "verified" | "");
            }}>
              <option value="">首次核验</option>
              <option value="rejected">rejected</option>
              <option value="withdrawn">withdrawn</option>
              <option value="verified">verified</option>
            </select>
          </label>
          <label>复核原提交版本
            <input min={0} name="expected_superseded_version" onFocus={(event) => event.target.select()} step={1} type="number" value={expectedSupersededVersion}
              onChange={(event) => {
                createKey.current = null;
                setExpectedSupersededVersion(Number(event.target.value || 0));
              }} />
          </label>
        </div>
        <div className={styles.toolbar}>
          <button className="ds-button ds-button-primary" disabled={busy || terminalCasBlocked} type="submit">
            {busy ? "正在创建…" : terminalCasPending ? "正在核对…" : terminalCasUnavailable ? "核对失败" : terminalCasActiveSubmission ? "存在进行中提交" : "创建草稿"}
          </button>
          {partyId ? <Link className="ds-button" href={`/assets/parties/${encodeURIComponent(partyId)}?tab=identity#identity`}>
            打开 Party 身份页签
          </Link> : null}
        </div>
        {feedback ? <p aria-live="polite">{feedback}</p> : null}
      </form>
    </PropertyPanelSurface>
  </PermissionGuard>;
}

function IdentityDraftEditPanel({ detail, onDraftStateChange, onUpdated }: {
  detail: IdentitySubmissionProjection;
  onDraftStateChange: (state: IdentityDraftEditState) => void;
  onUpdated: () => Promise<void>;
}) {
  const [documentType, setDocumentType] = useState<"id_card" | "passport" | "">(
    detail.evidence.documentType ?? ""
  );
  const [identityNumber, setIdentityNumber] = useState("");
  const [pendingFiles, setPendingFiles] = useState<FileRecord[]>([]);
  const [removedInitialFileIds, setRemovedInitialFileIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const updateKey = useRef<string | null>(null);
  const deleteKeys = useRef(new Map<string, string>());
  const deletedEvidenceFileIds = useRef<Set<string>>(new Set());
  const initialFileIds = useRef<Set<string>>(new Set());
  const trimmedIdentityNumber = identityNumber.trim();
  const fileIds = pendingFiles.map((file) => file.id);
  const hasNewEvidenceFiles = fileIds.some((fileId) => !initialFileIds.current.has(fileId));
  const preservesExistingIdentity =
    !hasNewEvidenceFiles
    && trimmedIdentityNumber === ""
    && documentType !== ""
    && documentType === detail.evidence.documentType;
  const identityNumberRequired = documentType !== "" && !preservesExistingIdentity;
  const draftDirty =
    documentType !== (detail.evidence.documentType ?? "")
    || trimmedIdentityNumber !== ""
    || fileIds.length !== initialFileIds.current.size
    || fileIds.some((fileId) => !initialFileIds.current.has(fileId));
  const draftBusy = busy || uploading;

  useEffect(() => {
    const files = detail.evidence.files.map(toPendingFileRecord);
    setDocumentType(detail.evidence.documentType ?? "");
    setIdentityNumber("");
    setPendingFiles(files);
    setRemovedInitialFileIds(new Set());
    deleteKeys.current.clear();
    deletedEvidenceFileIds.current.clear();
    initialFileIds.current = new Set(files.map((file) => file.id));
    updateKey.current = null;
  }, [detail]);

  function identityEvidenceDeleteKey(fileId: string) {
    const existing = deleteKeys.current.get(fileId);
    if (existing) return existing;
    const next = createIdempotencyKey(`party-identity-evidence-delete-${fileId}`);
    deleteKeys.current.set(fileId, next);
    return next;
  }
  useEffect(() => {
    onDraftStateChange({ dirty: draftDirty, busy: draftBusy });
  }, [draftBusy, draftDirty, onDraftStateChange]);

  async function updateDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (hasNewEvidenceFiles && (!documentType || !trimmedIdentityNumber)) {
      setFeedback("上传证据文件前请先填写证件类型和证件号码。");
      return;
    }
    if (!preservesExistingIdentity && (documentType === "") !== (trimmedIdentityNumber === "")) {
      setFeedback("证件类型和证件号码需要同时填写或同时留空。");
      return;
    }
    if (trimmedIdentityNumber && documentType === "id_card" && !/^\d{17}[\dXx]$/.test(trimmedIdentityNumber)) {
      setFeedback("身份证号码需为 18 位，末位可为 X。");
      return;
    }
    if (trimmedIdentityNumber && documentType === "passport" && !/^[A-Za-z0-9]{5,20}$/.test(trimmedIdentityNumber)) {
      setFeedback("护照号码需为 5-20 位字母或数字。");
      return;
    }
    setBusy(true);
    setFeedback("");
    updateKey.current ??= createIdempotencyKey("party-identity-draft-update");
    try {
      await apiRequest(`/property/identity-submissions/${encodeURIComponent(detail.id)}`, {
        method: "PUT",
        token: getAccessToken() ?? undefined,
        idempotencyKey: updateKey.current,
        body: {
          clientKey: updateKey.current,
          expectedVersion: detail.version,
          documentType: documentType || null,
          identityNumber: trimmedIdentityNumber || null,
          pendingFileIds: fileIds
        }
      });
      for (const fileId of removedInitialFileIds) {
        if (deletedEvidenceFileIds.current.has(fileId)) continue;
        try {
          await apiRequest(`/files/${encodeURIComponent(fileId)}`, {
            method: "DELETE",
            token: getAccessToken() ?? undefined,
            idempotencyKey: identityEvidenceDeleteKey(fileId)
          });
          deletedEvidenceFileIds.current.add(fileId);
        } catch (cause) {
          if (cause instanceof Error && /not found/i.test(cause.message)) {
            deletedEvidenceFileIds.current.add(fileId);
            continue;
          }
          throw cause;
        }
      }
      updateKey.current = null;
      setRemovedInitialFileIds(new Set());
      setFeedback("身份核验草稿已保存。");
      await onUpdated();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "身份核验草稿保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function removePendingIdentityEvidence(fileId: string) {
    updateKey.current = null;
    if (initialFileIds.current.has(fileId)) {
      setPendingFiles((current) => current.filter((item) => item.id !== fileId));
      setRemovedInitialFileIds((current) => {
        const next = new Set(current);
        next.add(fileId);
        return next;
      });
      return;
    }
    setUploading(true);
    setFeedback("");
    try {
      await apiRequest(`/files/${encodeURIComponent(fileId)}`, {
        method: "DELETE",
        token: getAccessToken() ?? undefined,
        idempotencyKey: identityEvidenceDeleteKey(fileId)
      });
      deletedEvidenceFileIds.current.add(fileId);
      setPendingFiles((current) => current.filter((item) => item.id !== fileId));
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "身份核验证据文件删除失败");
    } finally {
      setUploading(false);
    }
  }

  return <PermissionGuard module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE}>
    <PropertyPanelSurface title="编辑身份核验草稿">
      <form className={styles.actionForm} onSubmit={(event) => void updateDraft(event)}>
        <div className={styles.formGrid}>
          <label>证件类型
            <select name="document_type" value={documentType} onChange={(event) => {
              updateKey.current = null;
              setDocumentType(event.target.value as "id_card" | "passport" | "");
            }}>
              <option value="">未填写</option>
              <option value="id_card">身份证</option>
              <option value="passport">护照</option>
            </select>
          </label>
          <label>证件号码
            <input aria-required={identityNumberRequired} maxLength={128} name="identity_number" required={identityNumberRequired}
              value={identityNumber} onChange={(event) => {
              updateKey.current = null;
              setIdentityNumber(event.target.value);
            }} />
          </label>
        </div>
        <FileUploader
          bizId={detail.id}
          bizType="party_identity_evidence"
          disabled={busy}
          label="上传身份核验证据"
          onUploaded={(file) => {
            updateKey.current = null;
            setPendingFiles((current) => appendPendingFile(current, file));
          }}
          onUploadingChange={setUploading}
        />
        {pendingFiles.length ? <PendingAttachmentList
          files={pendingFiles}
          mutationDisabled={busy || uploading}
          onRemove={(fileId) => void removePendingIdentityEvidence(fileId)}
        /> : <p>暂无待保存证据文件。</p>}
        <button className="ds-button ds-button-primary" disabled={busy || uploading} type="submit">
          {busy ? "正在保存…" : "保存草稿"}
        </button>
        {feedback ? <p aria-live="polite">{feedback}</p> : null}
      </form>
    </PropertyPanelSurface>
  </PermissionGuard>;
}

function IdentityAuditPanel({ data, error, loading, onPageChange, onReload }: {
  data: IdentityAuditListResponse | null;
  error: string;
  loading: boolean;
  onPageChange: (page: number) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const page = data?.page ?? 1;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  return <PermissionGuard module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ}>
    <PermissionGuard permission={SYSTEM_PERMISSIONS.AUDIT_READ}>
      <PropertyPanelSurface title="身份核验审计时间线">
        <div className={styles.toolbar}>
          <button className="ds-button" disabled={loading} onClick={() => void onReload()} type="button">
            {loading ? "正在加载…" : "刷新时间线"}
          </button>
        </div>
        {error ? <p aria-live="polite" role="alert">{error}</p> : null}
        {!error && !loading && !data?.items.length ? <p>暂无审计事件。</p> : null}
        {data?.items.length ? <ol className={styles.timeline}>
          {data.items.map((item) => <li key={item.id}>
            <strong>{identityAuditEventLabel(item.eventType)}</strong>
            <span>{formatTime(item.occurredAt)}</span>
            <span>{item.actor.displayName}</span>
            {item.reason ? <p>{item.reason}</p> : null}
            {item.evidence ? <small>
              证件：{item.evidence.documentType ?? "—"} · 文件 {item.evidence.fileCount}
            </small> : null}
          </li>)}
        </ol> : null}
        {data ? <nav aria-label="身份核验审计分页" className={styles.pager}>
          <button className="ds-button" disabled={loading || page <= 1}
            onClick={() => void onPageChange(page - 1)} type="button">上一页</button>
          <span>第 {page} / {totalPages} 页，共 {data.total} 条</span>
          <button className="ds-button" disabled={loading || page >= totalPages}
            onClick={() => void onPageChange(page + 1)} type="button">下一页</button>
        </nav> : null}
      </PropertyPanelSurface>
    </PermissionGuard>
  </PermissionGuard>;
}

function latestTerminalIdentitySubmission(
  rows: IdentitySubmissionProjection[],
  partyId: string | null
): IdentitySubmissionProjection | null {
  if (!partyId) return null;
  const terminalStatuses = new Set(["rejected", "withdrawn", "verified"]);
  return rows
    .filter((row) => (!partyId || row.partyId === partyId) && terminalStatuses.has(row.status))
    .sort((left, right) => Date.parse(right.updateTime) - Date.parse(left.updateTime))[0] ?? null;
}

function toPendingFileRecord(file: IdentitySubmissionProjection["evidence"]["files"][number]): FileRecord {
  return {
    id: file.fileId,
    tenantId: "",
    parkId: "",
    fileCode: "",
    originalName: file.fileName,
    storedName: file.fileName,
    fileUrl: "",
    fileSize: String(file.fileSize),
    mimeType: file.mimeType,
    md5: "",
    bizType: "party_identity_evidence",
    bizId: null,
    storageType: "local",
    storageBucket: null,
    storagePath: "",
    isEncrypted: true,
    status: 1,
    remark: null,
    createTime: "",
    updateTime: ""
  };
}

function appendPendingFile(current: FileRecord[], file: FileRecord): FileRecord[] {
  if (current.some((item) => item.id === file.id)) return current;
  return [...current, file];
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

function identityAuditEventLabel(eventType: string): string {
  return ({
    "draft-created": "草稿创建",
    "draft-updated": "草稿更新",
    submitted: "提交核验",
    claimed: "领取核验",
    reassigned: "重新分派",
    revoked: "撤销分派",
    verified: "核验通过",
    rejected: "核验拒绝",
    withdrawn: "撤回提交",
    superseded: "被新提交取代",
    "legacy-imported": "历史导入"
  } as Record<string, string>)[eventType] ?? eventType;
}

function formatTime(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString("zh-CN");
}
