"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import {
  hrApi,
  type HrPayrollReconciliation,
  type HrPayrollReconciliationReviewAction,
} from "../../../lib/hr-api";
import workbenchStyles from "../hr-workbench.module.css";
import styles from "./payroll.module.css";

type HistoryState = "loading" | "ready" | "error";
type Target = { kind: "run" } | { kind: "person"; resultId: string } | { kind: "item"; resultId: string; itemDifferenceId: string };

const decisionLabel: Record<string, string> = {
  request_follow_up: "继续核查",
  accept_explanation: "接受差异说明",
  reject_explanation: "拒绝差异说明",
};

function targetLabel(action: HrPayrollReconciliationReviewAction) {
  if (!action.resultId && !action.itemDifferenceId) return "整批";
  const person = [action.employeeName, action.employeeCode].filter(Boolean).join(" · ") || "关联人员不可用";
  if (action.itemDifferenceId) return `${person} · ${action.itemName ?? "关联项目不可用"}`;
  return person;
}

export function PayrollReconciliationReview({
  reconciliation,
  canReview,
  contextKey,
  onWritten,
}: {
  reconciliation: HrPayrollReconciliation;
  canReview: boolean;
  contextKey: string;
  onWritten: () => Promise<void>;
}) {
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<HrPayrollReconciliationReviewAction[]>([]);
  const [total, setTotal] = useState(0);
  const [historyState, setHistoryState] = useState<HistoryState>("loading");
  const [target, setTarget] = useState<Target>({ kind: "run" });
  const [decision, setDecision] = useState("request_follow_up");
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const historyRead = useRef<AbortController | null>(null);
  const write = useRef<AbortController | null>(null);
  const submitLock = useRef(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const mountedContext = useRef(contextKey);
  mountedContext.current = contextKey;
  const loadHistory = useCallback(async (nextPage = page) => {
    historyRead.current?.abort();
    const current = ++generation.current;
    const controller = new AbortController();
    historyRead.current = controller;
    setHistoryState("loading");
    try {
      const result = await hrApi.payrollReconciliationReviewActions(reconciliation.id, getAccessToken(), nextPage, 20, controller.signal);
      if (current !== generation.current) return;
      setHistory(result.items);
      setTotal(result.total);
      setPage(result.page);
      setHistoryState("ready");
      return true;
    } catch (error) {
      if (current !== generation.current || (error instanceof DOMException && error.name === "AbortError")) return false;
      setHistoryState("error");
      return false;
    }
  }, [page, reconciliation.id]);
  useEffect(() => {
    generation.current += 1;
    historyRead.current?.abort();
    write.current?.abort();
    submitLock.current = false;
    attempt.current = null;
    setPage(1);
    setHistory([]);
    setTotal(0);
    setTarget({ kind: "run" });
    setDecision("request_follow_up");
    setComment("");
    setMessage("");
    setBusy(false);
    void loadHistory(1);
    return () => {
      generation.current += 1;
      historyRead.current?.abort();
      write.current?.abort();
      submitLock.current = false;
    };
  }, [contextKey, reconciliation.id]);
  const choose = (next: Target) => {
    attempt.current = null;
    setTarget(next);
    setMessage("");
  };
  const submit = async () => {
    const trimmed = comment.trim();
    if (!canReview || reconciliation.status !== "review" || !trimmed || submitLock.current) return;
    const body = { decision, comment: trimmed, ...(target.kind === "person" ? { resultId: target.resultId } : {}), ...(target.kind === "item" ? { itemDifferenceId: target.itemDifferenceId } : {}) };
    const signature = JSON.stringify(body);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: createIdempotencyKey("hr-payroll-reconciliation-review") };
    const currentContext = contextKey;
    const controller = new AbortController();
    write.current = controller;
    submitLock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const receipt = await hrApi.reviewPayrollReconciliation(reconciliation.id, body, getAccessToken(), attempt.current.key, controller.signal);
      if (controller.signal.aborted || mountedContext.current !== currentContext) return;
      if (!receipt?.id) {
        setMessage("复核请求结果不完整，可按原意见重试。");
        return;
      }
      attempt.current = null;
      setComment("");
      try {
        const [, historyReloaded] = await Promise.all([onWritten(), loadHistory(1)]);
        if (controller.signal.aborted || mountedContext.current !== currentContext) return;
        setMessage(historyReloaded ? "复核意见已记录。" : "复核意见已记录；读取最新记录失败，可单独重试读取。");
      } catch {
        if (!controller.signal.aborted && mountedContext.current === currentContext) setMessage("复核意见已记录；读取最新详情失败，可单独重试读取。");
      }
    } catch (error) {
      if (!controller.signal.aborted && mountedContext.current === currentContext) setMessage(error instanceof Error ? error.message : "复核失败");
    } finally {
      submitLock.current = false;
      if (mountedContext.current === currentContext) setBusy(false);
    }
  };
  const pages = Math.max(1, Math.ceil(total / 20));
  const terminal = reconciliation.status !== "review";
  return <section className="ds-panel" aria-label="双轨差异复核记录">
    <div className={workbenchStyles.sectionHeading}><div><h2>复核记录</h2><span>{terminal ? "本次模拟已终态，不可追加复核。" : "人员和项目复核仅追加证据；只有整批接受或拒绝会结束本次复核。"}</span></div></div>
    {historyState === "loading" ? <p>正在读取复核记录…</p> : historyState === "error" ? <p className="form-error">读取复核记录失败。<button className="ds-button" type="button" disabled={busy} onClick={() => void loadHistory()}>重试读取</button></p> : <div className="ds-mobile-record-list">{history.length ? history.map((action) => <article className="ds-mobile-record" key={action.id}><strong>#{action.sequenceNo} · {decisionLabel[action.decision] ?? "结论不可用"}</strong><span>{targetLabel(action)} · {new Date(action.createdAt).toLocaleString("zh-CN")}</span><small>{action.comment}</small></article>) : <p className={workbenchStyles.emptyState}>尚无复核记录。</p>}</div>}
    {total > 20 ? <nav className={styles.pager} aria-label="复核记录分页"><button className="ds-button" type="button" disabled={busy || page <= 1} onClick={() => void loadHistory(page - 1)}>上一页</button><span>第 {page} / {pages} 页</span><button className="ds-button" type="button" disabled={busy || page >= pages} onClick={() => void loadHistory(page + 1)}>下一页</button></nav> : null}
    {canReview && !terminal ? <div className={workbenchStyles.formGrid}>
      <label className="form-field"><span>复核目标</span><select disabled={busy} value={target.kind === "run" ? "run" : target.kind === "person" ? `person:${target.resultId}` : `item:${target.itemDifferenceId}`} onChange={(event) => { const value = event.target.value; if (value === "run") return choose({ kind: "run" }); const [kind, id] = value.split(":"); const person = reconciliation.results?.find((result) => kind === "person" ? result.resultId === id : result.differences.some((difference) => difference.id === id)); if (!person) return; choose(kind === "person" ? { kind: "person", resultId: person.resultId } : { kind: "item", resultId: person.resultId, itemDifferenceId: id! }); }}><option value="run">整批</option>{reconciliation.results?.flatMap((result) => [<option key={`person:${result.resultId}`} value={`person:${result.resultId}`}>{result.employeeName} · {result.employeeCode}</option>, ...result.differences.map((difference) => <option key={`item:${difference.id}`} value={`item:${difference.id}`}>{result.employeeName} · {difference.itemName}</option>)])}</select></label>
      <label className="form-field"><span>复核结论</span><select disabled={busy} value={decision} onChange={(event) => { attempt.current = null; setDecision(event.target.value); setMessage(""); }}><option value="request_follow_up">继续核查</option><option value="accept_explanation">接受差异说明</option><option value="reject_explanation">拒绝差异说明</option></select></label>
      <label className="form-field"><span>复核意见</span><textarea disabled={busy} required maxLength={1000} value={comment} onChange={(event) => { attempt.current = null; setComment(event.target.value); setMessage(""); }} /></label>
      {message ? <p className="form-error" role="status">{message}</p> : null}<button className="ds-button ds-button-primary" type="button" disabled={busy || !comment.trim()} onClick={() => void submit()}>记录复核</button>
    </div> : null}
  </section>;
}
