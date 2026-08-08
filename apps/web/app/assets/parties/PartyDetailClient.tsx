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
      {party ? <PartyDetailContent canReadIdentity={canReadIdentity} canReadSensitive={canReadSensitive}
        canUpdate={canUpdate} onUpdated={load} party={party} /> : null}
    </CanonicalDetailShell>
  );
}

function returnUrl(href: string): UrlObject {
  const url = new URL(href, "https://workbench.local");
  return { pathname: url.pathname, query: Object.fromEntries(url.searchParams), hash: url.hash };
}

function PartyDetailContent({ canReadIdentity, canReadSensitive, canUpdate, onUpdated, party }: {
  canReadIdentity: boolean; canReadSensitive: boolean; canUpdate: boolean;
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
        <label>授权状态<select defaultValue={party.consentStatus} name="consent_status"><option value="pending">待确认</option><option value="granted">已授权</option><option value="withdrawn">已撤回</option></select></label>
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
    consent_status: String(form.get("consent_status") ?? "pending"),
    remark: String(form.get("remark") ?? "") || null
  };
  return sensitive ? {
    ...base,
    mobile: String(form.get("mobile") ?? "") || null,
    email: String(form.get("email") ?? "") || null
  } : base;
}
