"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HR_PERMISSIONS, type FormalPayrollCorrectionOption, type FormalPayrollCorrectionPreparation, type FormalPayrollPeriodLifecycle } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { createIdempotencyKey } from "../../../lib/api-client";
import { hrApi, type HrPayrollPeriod } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./payroll-modern.module.css";

type Props = { refresh?: number; onUseCorrection: (value: FormalPayrollCorrectionPreparation | null) => void };
export function PayrollPeriodOperations(props: Props) {
  const user = useAuthUser(); return <PeriodWorkspace key={JSON.stringify(user)} {...props}/>;
}
function PeriodWorkspace({ refresh = 0, onUseCorrection }: Props) {
  const user = useAuthUser(), canRead = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_READ);
  const canDetail = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ) && hasPermission(user, HR_PERMISSIONS.HR_EMPLOYEE_READ);
  const canManage = canDetail && hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_MANAGE), canConfirm = canDetail && hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_CONFIRM);
  const [periods, setPeriods] = useState<HrPayrollPeriod[]>([]), [periodId, setPeriodId] = useState("");
  const [context, setContext] = useState<FormalPayrollPeriodLifecycle | null>(null);
  const [contextFresh, setContextFresh] = useState(false);
  const [options, setOptions] = useState<FormalPayrollCorrectionOption[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(1), [selected, setSelected] = useState<FormalPayrollCorrectionOption | null>(null);
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false), [choicesLoading, setChoicesLoading] = useState(false), [busy, setBusy] = useState(false), [committed, setCommitted] = useState(false), [reload, setReload] = useState(0);
  const alive = useRef(true), lock = useRef(false), contextRequest = useRef<AbortController | null>(null);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; contextRequest.current?.abort(); }; }, []);
  useEffect(() => {
    if (!canRead) return;
    const abort = new AbortController();
    void hrApi.payrollPeriods(getAccessToken(), abort.signal).then(rows => { if (!abort.signal.aborted) setPeriods(rows); }).catch(cause => { if (!abort.signal.aborted) setError(hrLoadErrorMessage(cause, "加载工资期间失败")); });
    return () => abort.abort();
  }, [canRead, reload]);
  const loadContext = useCallback(async () => {
    if (!canRead || !periodId) return;
    const abort = new AbortController(); contextRequest.current?.abort(); contextRequest.current = abort; setLoading(true); setContextFresh(false); setError("");
    try {
      const result = await hrApi.payrollPeriodLifecycle(periodId, getAccessToken(), abort.signal);
      if (alive.current && !abort.signal.aborted) { setContext(result); setContextFresh(true); setCommitted(false); }
    } catch (cause) { if (alive.current && !abort.signal.aborted) { setError(hrLoadErrorMessage(cause, "加载关账与更正状态失败")); throw cause; } }
    finally { if (alive.current && contextRequest.current === abort) setLoading(false); }
  }, [canRead, periodId]);
  useEffect(() => { void loadContext().catch(() => undefined); return () => contextRequest.current?.abort(); }, [loadContext, refresh, reload]);
  useEffect(() => {
    setOptions([]); setTotal(0);
    if (!canManage || context?.status !== "closed" || context.correctionWindow || context.id !== periodId) return;
    const abort = new AbortController(); setChoicesLoading(true);
    void hrApi.payrollCorrectionOptions(periodId, { page, pageSize: 20 }, getAccessToken(), abort.signal).then(result => {
      if (!abort.signal.aborted) { setOptions(result.items); setTotal(result.total); }
    }).catch(cause => { if (!abort.signal.aborted) setError(hrLoadErrorMessage(cause, "加载可更正批次失败")); }).finally(() => { if (!abort.signal.aborted) setChoicesLoading(false); });
    return () => abort.abort();
  }, [canManage, context, page, periodId]);
  const write = async (action: "close" | "open" | "cancel" | "complete") => {
    if (!context || !contextFresh || lock.current || committed || loading || !reason.trim()) return;
    const window = context.correctionWindow;
    if (action === "open" ? !canManage || !selected || context.status !== "closed" || window || choicesLoading : !canConfirm) return;
    if (action === "close" && (context.status !== "open" || context.confirmedRunCount === 0 || context.pendingRunCount > 0)) return;
    if ((action === "cancel" || action === "complete") && (!window || (action === "complete" ? window.activeResult?.status !== "confirmed" : Boolean(window.activeResult)))) return;
    const id = action === "close" || action === "open" ? context.id : window!.id;
    const body = { expectedVersion: action === "close" || action === "open" ? context.version : window!.version, reason: reason.trim(),
      ...(action === "open" ? { originalRunId: selected!.id, expectedRunVersion: selected!.version } : {}),
      ...(action === "complete" ? { completedRunId: window!.activeResult!.id } : {}) };
    const signature = JSON.stringify({ id, action, body });
    if (retry.current?.signature !== signature) retry.current = { signature, key: createIdempotencyKey(`hr-payroll-period-${action}`) };
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (action === "close") {
        const result = await hrApi.closePayrollPeriod(id, body, getAccessToken(), retry.current.key);
        if (alive.current) setContext(value => value ? { ...value, status: result.status, version: result.version } : value);
      } else if (action === "open") await hrApi.openPayrollCorrection(id, { ...body, originalRunId: selected!.id, expectedRunVersion: selected!.version }, getAccessToken(), retry.current.key);
      else if (action === "complete") await hrApi.completePayrollCorrection(id, { ...body, completedRunId: window!.activeResult!.id }, getAccessToken(), retry.current.key);
      else await hrApi.cancelPayrollCorrection(id, body, getAccessToken(), retry.current.key);
      if (!alive.current) return;
      setCommitted(true); retry.current = null; setReason(""); setSelected(null);
      if (action === "complete" || action === "cancel") onUseCorrection(null);
      setNotice({ close: "期间已关账，后续修正请发起更正。", open: "更正窗口已建立，可继续准备更正输入。", cancel: "更正窗口已取消，原结果保留。", complete: "更正已完成，原批次和更正批次均保留。" }[action]);
      try { await loadContext(); } catch { if (alive.current) { setCommitted(true); setError("操作已提交，状态刷新失败；请刷新状态，勿重复提交。"); } }
    } catch (cause) { if (alive.current) setError(hrLoadErrorMessage(cause, "关账或更正操作失败")); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  if (!canRead) return null;
  const window = context?.correctionWindow, disabled = busy || committed || loading || !contextFresh;
  return <section className={`ds-panel ${styles.workspace}`} aria-labelledby="payroll-period-heading">
    <div className={styles.actions}><h2 id="payroll-period-heading">工资期间与关账</h2><button className="secondary-button" disabled={busy || loading} onClick={() => setReload(value => value + 1)}>刷新期间状态</button></div>
    <label className="form-field"><span>关账与更正期间</span><select value={periodId} disabled={busy} onChange={event => {
      if (lock.current) return; contextRequest.current?.abort(); setPeriodId(event.target.value); setContext(null); setContextFresh(false); setSelected(null); setPage(1); setReason(""); setNotice(""); setError(""); setCommitted(false); retry.current = null;
    }}><option value="">请选择工资期间</option>{periods.map(period => <option key={period.id} value={period.id}>{period.periodMonth.slice(0, 7)}</option>)}</select></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}{loading ? <p>正在读取期间及更正进度…</p> : null}
    {context ? <><p>{context.month} · {context.status === "closed" ? "已关账" : context.status === "open" ? "开放中" : "状态待核对"} · 已确认 {context.confirmedRunCount} 批 · 待处理 {context.pendingRunCount} 批</p>
      {context.status === "open" ? <><p>全部待处理批次确认或取消后方可关账。关账保留结果，后续通过更正批次延续。</p>{canConfirm ? <><label className="form-field"><span>关账理由</span><textarea required maxLength={500} value={reason} disabled={disabled} onChange={event => setReason(event.target.value)}/></label><button className="primary-button" disabled={disabled || !reason.trim() || context.confirmedRunCount === 0 || context.pendingRunCount > 0} onClick={() => void write("close")}>确认关账</button></> : null}</> : null}
      {context.status === "closed" && !window ? <><p>期间保持关闭。需要修正时，选择当前已确认批次建立更正窗口。</p>{canManage ? <>{choicesLoading ? <p>正在读取可更正批次…</p> : null}<div className={`ds-mobile-record-list ${styles.records}`}>{options.map(option => <article className="ds-mobile-record" key={option.id}><strong>第 {option.runNo} 批 · {option.ruleName}</strong><span>{option.employeeCount} 位员工</span><button className="secondary-button" disabled={disabled || choicesLoading} aria-pressed={selected?.id === option.id} onClick={() => setSelected(option)}>选择更正此批次</button></article>)}</div>
        <div className={styles.actions}><button className="secondary-button" disabled={disabled || choicesLoading || page <= 1} onClick={() => setPage(value => value - 1)}>更正候选上一页</button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页 · 共 {total} 批</span><button className="secondary-button" disabled={disabled || choicesLoading || page * 20 >= total} onClick={() => setPage(value => value + 1)}>更正候选下一页</button></div>
        {!choicesLoading && total === 0 ? <p>暂无可更正的确认批次，请先处理已有待确认批次。</p> : null}{selected ? <p>已选：第 {selected.runNo} 批 · {selected.ruleName}</p> : null}<label className="form-field"><span>发起更正原因</span><textarea required maxLength={500} value={reason} disabled={disabled} onChange={event => setReason(event.target.value)}/></label><button className="primary-button" disabled={disabled || choicesLoading || !selected || !reason.trim()} onClick={() => void write("open")}>发起关账后更正</button></> : null}</> : null}
      {window ? <><h3>进行中的更正 · 原第 {window.originalRunNo} 批</h3><p>{window.ruleName} · {window.activeResult ? `更正第 ${window.activeResult.runNo} 批 · ${window.activeResult.status === "confirmed" ? "已确认" : "待复核或确认"}` : "尚未生成更正结果"}</p>
        {canManage && !window.activeResult ? <button className="secondary-button" disabled={disabled} onClick={() => onUseCorrection({ periodId: context.id, month: context.month, windowId: window.id, ruleSetId: window.ruleSetId, ruleName: window.ruleName, originalRunId: window.originalRunId, originalRunNo: window.originalRunNo })}>继续准备更正输入及核算</button> : null}
        {window.activeResult && window.activeResult.status !== "confirmed" ? <p>请在下方工资核算结果中复核、确认，或取消尚未确认的更正批次。</p> : null}
        {canConfirm ? <><label className="form-field"><span>更正收口理由</span><textarea required maxLength={500} value={reason} disabled={disabled} onChange={event => setReason(event.target.value)}/></label><div className={styles.actions}>{window.activeResult?.status === "confirmed" ? <button className="primary-button" disabled={disabled || !reason.trim()} onClick={() => void write("complete")}>完成此次更正</button> : !window.activeResult ? <button className="secondary-button" disabled={disabled || !reason.trim()} onClick={() => void write("cancel")}>取消此次更正</button> : null}</div></> : null}
      </> : null}
    </> : null}
  </section>;
}
