"use client";

import {
  SYSTEM_PERMISSIONS,
  type PartyDetailResponse,
  type PartyListItemResponse
} from "@jinhu/shared";
import Link from "next/link";
import type { UrlObject } from "node:url";
import { useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  CanonicalDetailShell,
  PropertyPanelSurface,
  resolveReturnHref,
  type CanonicalDetailState
} from "../../../features/property-shared";
import { ApiError, apiRequest } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasAccess, hasPermission } from "../../../lib/permissions";
import styles from "./PartyWorkbench.module.css";
import {
  PARTY_RETURN_POLICY,
  partyDetailFailureState
} from "./party-detail-logic";
import { usePartyIdempotency } from "./use-party-idempotency";

export function PartyDetailClient({ partyId }: { partyId: string }) {
  const user = useAuthUser();
  const searchParams = useSearchParams();
  const pageAllowed = hasAccess(user, SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE, "asset");
  const canRead = pageAllowed && hasPermission(user, SYSTEM_PERMISSIONS.PARTY_READ);
  const canUpdate = pageAllowed && hasPermission(user, SYSTEM_PERMISSIONS.PARTY_UPDATE);
  const canManageConsent = pageAllowed && hasPermission(user, SYSTEM_PERMISSIONS.PARTY_CONSENT_MANAGE);
  const canReadSensitive = hasPermission(user, SYSTEM_PERMISSIONS.PARTY_SENSITIVE_READ);
  const canReadIdentity = hasAccess(
    user,
    SYSTEM_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    "asset"
  );
  const identityRequested = searchParams.get("tab") === "identity";
  const [party, setParty] = useState<PartyDetailResponse | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [state, setState] = useState<CanonicalDetailState>({ kind: "loading" });

  async function load() {
    if (!canRead) {
      setState({ kind: "forbidden" });
      return;
    }
    try {
      const response = await apiRequest<PartyDetailResponse>(
        `/property/parties/${encodeURIComponent(partyId)}`,
        { token: getAccessToken() }
      );
      setParty(response.data);
      setLastLoadedAt(new Date());
      setState({ kind: "ready" });
    } catch (error) {
      setState(partyDetailFailureState({
        cached: party !== null,
        message: error instanceof Error ? error.message : "档案加载失败",
        offline: typeof navigator !== "undefined" && !navigator.onLine,
        status: error instanceof ApiError ? error.status : undefined
      }));
    }
  }

  useEffect(() => {
    void load();
  }, [canRead, partyId]);

  useEffect(() => {
    if (!party || !identityRequested) return;
    const target = document.getElementById("identity");
    if (!target) return;
    target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
  }, [identityRequested, party]);

  return (
    <CanonicalDetailShell
      entityKey={partyId}
      presentation="full"
      returnControl={<Link href={returnUrl(resolveReturnHref(
        searchParams.get("returnTo"), PARTY_RETURN_POLICY
      ))}>返回列表</Link>}
      staleSlot={<section aria-live="polite" role="status">
        <p>当前显示最近一次成功加载的缓存内容。</p>
        <p>最近更新：{lastLoadedAt?.toLocaleString("zh-CN") ?? "未知"}</p>
        <button className="ds-button" onClick={() => void load()} type="button">重新加载</button>
      </section>}
      state={state}
      title={party?.displayName ?? "业务相对方详情"}
    >
      {party ? <PartyDetailContent canManageConsent={canManageConsent} canReadIdentity={canReadIdentity} canReadSensitive={canReadSensitive}
        canUpdate={canUpdate} onUpdated={load} party={party} /> : null}
    </CanonicalDetailShell>
  );
}

function returnUrl(href: string): UrlObject {
  const url = new URL(href, "https://workbench.local");
  return { pathname: url.pathname, query: Object.fromEntries(url.searchParams), hash: url.hash };
}

function PartyDetailContent({ canManageConsent, canReadIdentity, canReadSensitive, canUpdate, onUpdated, party }: {
  canManageConsent: boolean; canReadIdentity: boolean; canReadSensitive: boolean; canUpdate: boolean;
  onUpdated(): Promise<void>; party: PartyDetailResponse;
}) {
  return (
    <div className={styles.stack}>
      <PropertyPanelSurface><dl className={styles.detailGrid}>
        <DetailRow label="类型" value={party.partyType === "person" ? "个人" : "组织"} />
        <DetailRow label="来源" value={party.sourceDomain ?? "共享房产底座"} />
        <DetailRow label="核验状态" value={party.verificationStatus} />
        <DetailRow label="授权状态" value={party.consentStatus} />
        <DetailRow label="备注" value={party.remark ?? "—"} />
        {canReadSensitive ? <SensitiveRows party={party} /> : null}
      </dl></PropertyPanelSurface>
      <PropertyPanelSurface title="业务角色">
        {party.roles.map((role) => <p key={role.id}>{role.roleType} · {role.sourceType ?? "通用"} · {role.status}</p>)}
        {!party.roles.length ? <p>暂无业务角色。</p> : null}
      </PropertyPanelSurface>
      {canReadIdentity ? <PropertyPanelSurface aria-label="身份核验" id="identity" tabIndex={-1} title="身份核验">
        <p>查看此 Party 的核验提交、证据快照和当前处理状态。</p>
        <Link href={`/assets/identity-submissions?partyId=${encodeURIComponent(party.id)}`}>
          打开身份核验目录
        </Link>
      </PropertyPanelSurface> : null}
      {canManageConsent ? <PartyConsentActions onUpdated={onUpdated} party={party} /> : null}
      {canUpdate ? <PartyUpdateForm canReadSensitive={canReadSensitive} onUpdated={onUpdated} party={party} /> : null}
    </div>
  );
}

function SensitiveRows({ party }: { party: PartyDetailResponse }) {
  return <>
    <DetailRow label="手机号" value={party.mobile ?? "—"} />
    <DetailRow label="邮箱" value={party.email ?? "—"} />
    <DetailRow label="证件类型" value={party.identityDocumentType ?? "—"} />
    <DetailRow label="证件号码" value={party.identityNumber ?? party.identityNumberMasked ?? "—"} />
  </>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

type ConsentStatusResponse = {
  consent_status: string;
  fact_id: string | null;
  fact_status: string | null;
  lawful_basis: string | null;
  processing_purpose: string | null;
  notice_version: string | null;
  effective_at: string | null;
  provenance: string | null;
};

function PartyConsentActions({ party, onUpdated }: {
  party: PartyDetailResponse;
  onUpdated(): Promise<void>;
}) {
  const [status, setStatus] = useState<ConsentStatusResponse | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const idempotency = usePartyIdempotency();

  async function loadStatus() {
    try {
      const response = await apiRequest<ConsentStatusResponse>(
        `/property/party-data-governance/parties/${encodeURIComponent(party.id)}/status`,
        { token: getAccessToken() }
      );
      setStatus(response.data);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "同意事实加载失败");
    }
  }

  useEffect(() => { void loadStatus(); }, [party.id, party.currentConsentFactId]);

  async function submitGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = new FormData(event.currentTarget);
    const processingPurpose = String(form.get("processing_purpose") ?? "identity_verification");
    const lawfulBasis = processingPurpose === "legal_compliance" ? "legal_obligation" : "consent";
    const body = {
      lawful_basis: lawfulBasis,
      processing_purpose: processingPurpose,
      notice_version: lawfulBasis === "consent" ? String(form.get("notice_version") ?? "") : undefined,
      effective_at: new Date().toISOString(),
      channel: String(form.get("channel") ?? "in_person")
    };
    await runAction("party-consent-record", body,
      `/property/party-data-governance/parties/${encodeURIComponent(party.id)}/consent-facts`);
  }

  async function submitWithdraw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status?.fact_id || lock.current) return;
    const form = new FormData(event.currentTarget);
    const body = {
      revoked_at: new Date().toISOString(),
      reason_code: String(form.get("reason_code") ?? "")
    };
    await runAction("party-consent-withdraw", body,
      `/property/party-data-governance/parties/${encodeURIComponent(party.id)}/consent-facts/${encodeURIComponent(status.fact_id)}/withdraw`);
  }

  async function runAction(action: string, body: Record<string, unknown>, path: string) {
    lock.current = true;
    setSubmitting(true);
    setFeedback("");
    try {
      await apiRequest(path, {
        method: "POST", token: getAccessToken(),
        idempotencyKey: idempotency.keyFor(action, body), body
      });
      idempotency.complete();
      setFeedback("同意事实已更新。");
      await Promise.all([loadStatus(), onUpdated()]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "同意事实更新失败");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  const withdrawable = status?.fact_status === "granted" && status.provenance === "operator_recorded";
  return <PropertyPanelSurface title="同意证据">
    <p>当前状态：{status?.fact_status ?? party.consentStatus}；来源：{status?.provenance ?? "未加载"}</p>
    {status?.notice_version ? <p>告知版本：{status.notice_version}</p> : null}
    <form className={styles.formGrid} onSubmit={submitGrant}>
      <label>处理目的<select name="processing_purpose">
        <option value="identity_verification">身份核验</option>
        <option value="accommodation_checkin">民宿入住</option>
        <option value="housing_move_in">住房入住</option>
        <option value="legal_compliance">法定义务</option>
      </select></label>
      <label>告知文本版本<input maxLength={128} name="notice_version" required /></label>
      <label>取得渠道<select name="channel"><option value="in_person">现场</option><option value="web">网页</option><option value="mobile">移动端</option><option value="paper">纸质</option></select></label>
      <button className="ds-button ds-button-primary" disabled={submitting} type="submit">记录同意事实</button>
    </form>
    {withdrawable ? <form className={styles.formGrid} onSubmit={submitWithdraw}>
      <label>撤回原因代码<input maxLength={64} name="reason_code" required /></label>
      <button className="ds-button" disabled={submitting} type="submit">撤回当前同意</button>
    </form> : null}
    {feedback ? <p aria-live="polite">{feedback}</p> : null}
  </PropertyPanelSurface>;
}

function PartyUpdateForm({
  party,
  canReadSensitive,
  onUpdated
}: {
  party: PartyListItemResponse;
  canReadSensitive: boolean;
  onUpdated(): Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const lock = useRef(false);
  const idempotency = usePartyIdempotency();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = new FormData(event.currentTarget);
    lock.current = true;
    setSubmitting(true);
    setFeedback("");
    const body = partyUpdateBody(form, canReadSensitive);
    try {
      await apiRequest(`/property/parties/${encodeURIComponent(party.id)}`, {
        method: "PUT",
        token: getAccessToken(),
        idempotencyKey: idempotency.keyFor("party-update", body), body
      });
      idempotency.complete();
      setFeedback("档案已更新。");
      await onUpdated();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "更新失败");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <PropertyPanelSurface>
      <h2>维护档案</h2>
      <form className={styles.formGrid} onSubmit={submit}>
        <label>名称<input defaultValue={party.displayName} maxLength={200} name="display_name" required /></label>
        {canReadSensitive ? (
          <>
            <label>手机号<input defaultValue={party.mobile ?? ""} maxLength={32} name="mobile" /></label>
            <label>邮箱<input defaultValue={party.email ?? ""} maxLength={200} name="email" type="email" /></label>
          </>
        ) : null}
        <label>备注<textarea defaultValue={party.remark ?? ""} maxLength={500} name="remark" /></label>
        <button className="ds-button ds-button-primary" disabled={submitting} type="submit">
          {submitting ? "保存中…" : "保存修改"}
        </button>
      </form>
      {feedback ? <p aria-live="polite">{feedback}</p> : null}
    </PropertyPanelSurface>
  );
}

function partyUpdateBody(form: FormData, sensitive: boolean) {
  const base = {
    display_name: String(form.get("display_name") ?? ""),
    remark: String(form.get("remark") ?? "") || null
  };
  return sensitive ? {
    ...base,
    mobile: String(form.get("mobile") ?? "") || null,
    email: String(form.get("email") ?? "") || null
  } : base;
}
