"use client";

import {
  PARTY_LIST_SORTS,
  SYSTEM_PERMISSIONS,
  type HousingSortOrder,
  type PartyListSort,
  type PartyListItemResponse,
  type PartyListResponse,
  type UserDataScopeContext
} from "@jinhu/shared";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PropertyPanelSurface,
  type PropertyPageState
} from "../../../features/property-shared";
import { ApiError, apiRequest, isForbiddenError } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasAccess, hasPermission } from "../../../lib/permissions";
import styles from "./PartyWorkbench.module.css";
import { PartyWorkbenchView } from "./PartyWorkbenchView";
import { usePartyIdempotency } from "./use-party-idempotency";

const PAGE_SIZE = 20;

export function PartyWorkbenchClient() {
  const user = useAuthUser();
  const pageAllowed = hasAccess(user, SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE, "asset");
  const canRead = pageAllowed && hasPermission(user, SYSTEM_PERMISSIONS.PARTY_READ);
  const canCreate = pageAllowed && hasPermission(user, SYSTEM_PERMISSIONS.PARTY_CREATE);
  const canReadSensitive = hasPermission(user, SYSTEM_PERMISSIONS.PARTY_SENSITIVE_READ);
  const [refreshKey, setRefreshKey] = useState(0);
  const query = usePartyQuery();
  const data = usePartyList(
    canRead, query.page, query.keyword, query.partyType, query.sort, query.order, refreshKey,
    user?.data_scopes, user?.is_super === true
  );
  const fields = useMemo(() => partyFields(canReadSensitive), [canReadSensitive]);
  return <PartyWorkbenchView
    canCreate={canCreate} canReadSensitive={canReadSensitive}
    createAction={<PartyCreateForm onCreated={() => setRefreshKey((current) => current + 1)} />}
    draftKeyword={query.draftKeyword} draftOrder={query.draftOrder}
    draftSort={query.draftSort} draftType={query.draftType} fields={fields}
    onDraftKeyword={query.setDraftKeyword}
    onDraftOrder={(value) => query.setDraftOrder(partyOrder(value))}
    onDraftSort={(value) => query.setDraftSort(partySort(value))}
    onDraftType={query.setDraftType}
    onReload={data.load} onUpdateQuery={query.update} page={query.page}
    query={query.snapshot} result={data.result} state={data.state}
  />;
}

function usePartyQuery() {
  const router = useRouter(); const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const keyword = searchParams.get("keyword") ?? ""; const partyType = searchParams.get("party_type") ?? "";
  const sort = partySort(searchParams.get("sort")); const order = partyOrder(searchParams.get("order"));
  const [draftKeyword, setDraftKeyword] = useState(keyword); const [draftType, setDraftType] = useState(partyType);
  const [draftSort, setDraftSort] = useState(sort); const [draftOrder, setDraftOrder] = useState(order);
  function update(
    nextPage: number, nextKeyword = keyword, nextType = partyType,
    nextSort = sort, nextOrder = order
  ) {
    const query = new URLSearchParams();
    if (nextPage > 1) query.set("page", String(nextPage));
    if (nextKeyword) query.set("keyword", nextKeyword);
    if (nextType) query.set("party_type", nextType);
    if (nextSort) query.set("sort", nextSort);
    if (nextOrder) query.set("order", nextOrder);
    const target: "/assets/parties" | `/assets/parties?${string}` =
      query.size ? `/assets/parties?${query.toString()}` : "/assets/parties";
    router.push(target);
  }
  return { draftKeyword, draftOrder, draftSort, draftType, keyword, order, page, partyType,
    setDraftKeyword, setDraftOrder, setDraftSort, setDraftType, sort,
    snapshot: Object.fromEntries(searchParams.entries()), update };
}

function usePartyList(
  canRead: boolean, page: number, keyword: string, partyType: string,
  sort: PartyListSort | "", order: HousingSortOrder | "", refreshKey: number,
  scopes: readonly UserDataScopeContext[] | undefined, isSuper: boolean
) {
  const [result, setResult] = useState<PartyListResponse | null>(null);
  const [state, setState] = useState<PropertyPageState>({ kind: "initial-loading" });
  const load = useCallback(async () => {
    if (!canRead) { setResult(null); setState({ kind: "forbidden-full" }); return; }
    const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (keyword) query.set("keyword", keyword);
    if (partyType) query.set("party_type", partyType);
    if (sort) query.set("sort", sort);
    if (order) query.set("order", order);
    try {
      const response = await apiRequest<PartyListResponse>(`/property/parties?${query}`, { token: getAccessToken() });
      setResult(response.data);
      setState(response.data.items.length ? { kind: "ready" }
        : keyword || partyType ? { kind: "empty-filtered" }
          : hasAuthoritativeEmptyPartyScope(scopes, isSuper) ? { kind: "empty-scope" }
            : { kind: "empty-initial" });
    } catch (error) {
      setState(partyFailureState(error, Boolean(result)));
    }
  }, [canRead, isSuper, keyword, order, page, partyType, result, scopes, sort]);
  useEffect(() => { void load(); }, [canRead, keyword, order, page, partyType, refreshKey, sort]);
  return { load, result, state };
}

function partySort(value: string | null): PartyListSort | "" {
  return isPartyListSort(value) ? value : "";
}

function partyOrder(value: string | null): HousingSortOrder | "" {
  return value === "asc" || value === "desc" ? value : "";
}

function isPartyListSort(value: string | null): value is PartyListSort {
  return value !== null && PARTY_LIST_SORTS.some((option) => option === value);
}

function hasAuthoritativeEmptyPartyScope(
  scopes: readonly UserDataScopeContext[] | undefined,
  isSuper: boolean
): boolean {
  if (isSuper || !scopes?.length) return false;
  const relevant = scopes.filter((scope) =>
    scope.dimension === "tenant" || scope.dimension === "park"
  );
  if (!relevant.length || relevant.some((scope) =>
    ["all", "tenant", "park", "40", "50"].includes(scope.scope_type)
  )) return false;
  const restricted = relevant.filter((scope) =>
    ["custom", "assigned", "60"].includes(scope.scope_type)
  );
  return restricted.length > 0 && restricted.every((scope) => {
    const ids = scope.scope_config?.ids;
    return Array.isArray(ids) && ids.length === 0;
  });
}

function partyFailureState(error: unknown, cached: boolean): PropertyPageState {
  const message = error instanceof Error ? error.message : "档案加载失败";
  if (isForbiddenError(error)) {
    return cached ? { kind: "forbidden-partial", message } : { kind: "forbidden-full" };
  }
  if (error instanceof ApiError && error.status === 409) return { kind: "conflict", message };
  if (typeof navigator !== "undefined" && !navigator.onLine && cached) return { kind: "offline-stale", message };
  return cached ? { kind: "refresh-failure", message } : { kind: "initial-failure", message };
}

function partyFields(sensitive: boolean) {
  const fields = [
    { key: "type", label: "类型", render: (item: PartyListItemResponse) => item.partyType === "person" ? "个人" : "组织" },
    { key: "source", label: "来源", render: (item: PartyListItemResponse) => item.sourceDomain ?? "共享房产底座" },
    { key: "verification", label: "核验", render: (item: PartyListItemResponse) => item.verificationStatus },
    { key: "updated", label: "更新时间", render: (item: PartyListItemResponse) => new Date(item.updateTime).toLocaleString("zh-CN") }
  ];
  return sensitive ? [...fields,
    { key: "mobile", label: "手机号", render: (item: PartyListItemResponse) => item.mobile ?? "—" },
    { key: "identity", label: "证件", render: (item: PartyListItemResponse) => item.identityNumberMasked ?? "—" }
  ] : fields;
}

function PartyCreateForm({ onCreated }: { onCreated(): void }) {
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const lock = useRef(false);
  const idempotency = usePartyIdempotency();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    lock.current = true;
    setSubmitting(true);
    setFeedback("");
    const body = {
      party_type: String(form.get("party_type") ?? "person"),
      display_name: String(form.get("display_name") ?? ""),
      mobile: String(form.get("mobile") ?? "") || undefined,
      email: String(form.get("email") ?? "") || undefined,
      consent_status: String(form.get("consent_status") ?? "pending"),
      remark: String(form.get("remark") ?? "") || undefined
    };
    try {
      await apiRequest<PartyListItemResponse>("/property/parties", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: idempotency.keyFor("party-create", body), body
      });
      idempotency.complete();
      formElement.reset();
      setFeedback("业务相对方已创建。");
      onCreated();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "创建失败");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <details>
      <summary className="ds-button ds-button-primary">新增业务相对方</summary>
      <PropertyPanelSurface>
        <form className={styles.formGrid} onSubmit={submit}>
          <label>类型<select name="party_type"><option value="person">个人</option><option value="organization">组织</option></select></label>
          <label>名称<input maxLength={200} name="display_name" required /></label>
          <label>手机号<input autoComplete="tel" maxLength={32} name="mobile" /></label>
          <label>邮箱<input autoComplete="email" maxLength={200} name="email" type="email" /></label>
          <label>授权状态<select name="consent_status"><option value="pending">待确认</option><option value="granted">已授权</option><option value="withdrawn">已撤回</option></select></label>
          <label>备注<textarea maxLength={500} name="remark" /></label>
          <button className="ds-button ds-button-primary" disabled={submitting} type="submit">
            {submitting ? "创建中…" : "保存档案"}
          </button>
        </form>
        {feedback ? <p aria-live="polite">{feedback}</p> : null}
      </PropertyPanelSurface>
    </details>
  );
}
