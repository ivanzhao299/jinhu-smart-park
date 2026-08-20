"use client";

import type { ApprovalSummary, PropertyPaginatedResult } from "@jinhu/shared";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";
import { PropertyPageSurface, PropertyPanelSurface } from "../../features/property-shared";
import styles from "./PropertyControlPlane.module.css";
import {
  propertyApprovalPageFromQuery,
  propertyApprovalListQuery,
  propertyApprovalPageCount
} from "./property-approval-list.logic";
import {
  propertyApprovalListDetailHref,
  propertyApprovalReturnHref
} from "./property-approval-return.logic";

interface ApprovalDetail {
  request: ApprovalSummary & {
    sourceType: string;
    sourceId: string;
    sourceExpectedVersion: number;
    decisionVersion: number;
    executionVersion: number;
    amount: string | null;
    currency: string | null;
  };
  stages: Array<{
    stageId: string;
    stageCode: string;
    stageStatus: string;
    version: number;
    requiredCount: number;
    approvedCount: number;
    rejectedCount: number;
  }>;
}

export function PropertyApprovalListClient() {
  const searchParams = useSearchParams();
  const queryPage = propertyApprovalPageFromQuery(searchParams.get("page"));
  const [page, setPage] = useState(queryPage);
  const [data, setData] = useState<PropertyPaginatedResult<ApprovalSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const response = await apiRequest<PropertyPaginatedResult<ApprovalSummary>>(
        `/property/approvals?${propertyApprovalListQuery(page)}`,
        { token: getAccessToken() ?? undefined }
      );
      if (sequence === requestSequence.current) {
        setData(response.data); setError("");
      }
    } catch (cause) {
      if (sequence === requestSequence.current) {
        setError(cause instanceof Error ? cause.message : "审批加载失败");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [page]);
  useEffect(() => void load(), [load]);
  useEffect(() => setPage(queryPage), [queryPage]);
  const pages = propertyApprovalPageCount(data?.total ?? 0);
  useEffect(() => {
    if (data && page > pages) setPage(pages);
  }, [data, page, pages]);
  return <PropertyPageSurface className={styles.stack}>
    <header className="ds-hero"><div className="ds-hero-copy"><p className="ds-kicker">共享房产控制面</p>
      <h1>房产业务审批</h1><p>查看审批决定与领域效果执行的独立状态。</p></div></header>
    {error ? <PropertyPanelSurface aria-live="polite"><p>{error}</p></PropertyPanelSurface> : null}
    {loading ? <PropertyPanelSurface aria-live="polite"><p>正在加载…</p></PropertyPanelSurface> : null}
    {!loading && !error ? <section aria-label="审批列表" className="ds-mobile-record-list">
      {(data?.items ?? []).map((item) => <article className="ds-mobile-record" key={item.requestId}>
        <Link href={propertyApprovalListDetailHref(item.requestId, page) as Route}>{item.actionId}</Link>
        <p>{item.decisionStatus} / {item.executionStatus}</p>
      </article>)}
      {data && !data.items.length ? <PropertyPanelSurface><p>暂无可见审批。</p></PropertyPanelSurface> : null}
    </section> : null}
    {!loading && !error ? <nav aria-label="分页" className={`ds-panel ds-section-panel ${styles.pager}`}>
      <button className="ds-button" disabled={page <= 1 || loading}
        onClick={() => setPage((value) => value - 1)} type="button">上一页</button>
      <span>第 {page} / {pages} 页，共 {data?.total ?? 0} 条</span>
      <button className="ds-button" disabled={page >= pages || loading}
        onClick={() => setPage((value) => value + 1)} type="button">下一页</button>
    </nav> : null}
  </PropertyPageSurface>;
}

export function PropertyApprovalDetailClient({ requestId }: { requestId: string }) {
  const searchParams = useSearchParams();
  const returnHref = propertyApprovalReturnHref(searchParams.get("returnTo")) as Route;
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [mutating, setMutating] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async () => {
    try {
      const response = await apiRequest<ApprovalDetail>(
        `/property/approvals/${encodeURIComponent(requestId)}`,
        { token: getAccessToken() ?? undefined }
      );
      setDetail(response.data); setFeedback("");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "审批详情加载失败");
    }
  }, [requestId]);
  useEffect(() => void load(), [load]);

  async function mutate(action: "approve" | "reject" | "withdraw") {
    if (!detail || lock.current) return;
    if ((action === "reject" || action === "withdraw") && !reason.trim()) {
      setFeedback("驳回或撤回前必须填写原因。"); return;
    }
    lock.current = true; setMutating(true); setFeedback("");
    const clientKey = createIdempotencyKey(`property.approval.${action}`);
    try {
      if (action === "withdraw") {
        await apiRequest(`/property/approvals/${requestId}/withdraw`, {
          method: "POST", token: getAccessToken() ?? undefined, idempotencyKey: clientKey,
          body: { clientKey, reason: reason.trim(),
            expectedDecisionVersion: detail.request.decisionVersion }
        });
      } else {
        const stage = detail.stages.find((item) => item.stageStatus === "pending");
        if (!stage) throw new Error("审批阶段已变化，请刷新后重试");
        await apiRequest(`/property/approvals/${requestId}/decisions`, {
          method: "POST", token: getAccessToken() ?? undefined, idempotencyKey: clientKey,
          body: { clientKey, decision: action, reason: reason.trim() || undefined,
            stageId: stage.stageId, expectedStageVersion: stage.version,
            expectedRequestVersion: detail.request.decisionVersion }
        });
      }
      setReason(""); await load();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "审批操作失败");
    } finally { lock.current = false; setMutating(false); }
  }

  return <PropertyPageSurface className={styles.stack}>
    <header className="ds-hero"><div className="ds-hero-copy"><p className="ds-kicker">共享房产控制面</p>
      <h1>房产业务审批详情</h1><p><Link href={returnHref}>返回来源页面</Link></p></div></header>
    {detail ? <>
      <PropertyPanelSurface><dl className={styles.detailGrid}>
        <div><dt>动作</dt><dd>{detail.request.actionId}</dd></div>
        <div><dt>来源</dt><dd>{detail.request.sourceType} · {detail.request.sourceId}</dd></div>
        <div><dt>决策状态</dt><dd>{detail.request.decisionStatus}</dd></div>
        <div><dt>执行状态</dt><dd>{detail.request.executionStatus}</dd></div>
        <div><dt>金额</dt><dd>{detail.request.amount ?? "—"} {detail.request.currency ?? ""}</dd></div>
      </dl></PropertyPanelSurface>
      {detail.request.allowedActions.length ? <PropertyPanelSurface title="允许操作">
        <div className={styles.actionForm}><label>原因<textarea maxLength={1000}
          onChange={(event) => setReason(event.target.value)} value={reason} /></label>
          <div className={styles.toolbar}>
            {detail.request.allowedActions.includes("property.approval.decide") ? <>
              <button className="ds-button ds-button-primary" disabled={mutating}
                onClick={() => void mutate("approve")} type="button">批准</button>
              <button className="ds-button" disabled={mutating}
                onClick={() => void mutate("reject")} type="button">驳回</button>
            </> : null}
            {detail.request.allowedActions.includes("property.approval.withdraw") ? <button
              className="ds-button" disabled={mutating}
              onClick={() => void mutate("withdraw")} type="button">撤回</button> : null}
          </div>
        </div>
      </PropertyPanelSurface> : null}
    </> : null}
    {feedback ? <PropertyPanelSurface aria-live="polite"><p>{feedback}</p></PropertyPanelSurface> : null}
  </PropertyPageSurface>;
}
