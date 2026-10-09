"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HR_PERMISSIONS, type FormalPayrollRunDetail, type FormalPayrollRunListItem } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { createIdempotencyKey } from "../../../lib/api-client";
import { hrApi } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./payroll-modern.module.css";

const statuses: Record<string, string> = { calculated: "待复核", reviewing: "待确认", confirmed: "已确认", cancelled: "已取消" };
const roles = { earning: "收入", deduction: "扣款", tax: "税额", gross: "应发汇总", net: "实发汇总", employer_contribution: "单位承担", informational: "参考数量" };
function money(value: string) {
  const match = /^(-?)(\d+)\.(\d{2})$/u.exec(value);
  return match ? `¥${match[1]}${match[2]!.replace(/\B(?=(\d{3})+(?!\d))/gu, ",")}.${match[3]}` : "金额暂不可用";
}
export function PayrollRunOperations() {
  const user = useAuthUser(); return <RunWorkspace key={JSON.stringify(user)} />;
}
function RunWorkspace() {
  const user = useAuthUser(), canRead = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_READ);
  const canDetail = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ) && hasPermission(user, HR_PERMISSIONS.HR_EMPLOYEE_READ);
  const canReview = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_REVIEW), canConfirm = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_CONFIRM);
  const [month, setMonth] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1);
  const [rows, setRows] = useState<FormalPayrollRunListItem[]>([]), [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<FormalPayrollRunListItem | null>(null), [detail, setDetail] = useState<FormalPayrollRunDetail | null>(null), [detailPage, setDetailPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set()), [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false), [detailLoading, setDetailLoading] = useState(false), [busy, setBusy] = useState(false), [committed, setCommitted] = useState(false);
  const [error, setError] = useState(""), [detailError, setDetailError] = useState(""), [notice, setNotice] = useState("");
  const alive = useRef(true), listRequest = useRef<AbortController | null>(null), detailRequest = useRef<AbortController | null>(null), lock = useRef(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; listRequest.current?.abort(); detailRequest.current?.abort(); }; }, []);
  const loadList = useCallback(async () => {
    if (!canRead) return;
    const controller = new AbortController(); listRequest.current?.abort(); listRequest.current = controller; setLoading(true); setError("");
    try {
      const data = await hrApi.formalPayrollRuns({ page, pageSize: 20, ...(month ? { month } : {}), ...(status ? { status } : {}) }, getAccessToken(), controller.signal);
      if (alive.current && !controller.signal.aborted) { setRows(data.items); setTotal(data.total); }
    } catch (cause) { if (alive.current && !controller.signal.aborted) { setError(hrLoadErrorMessage(cause, "加载工资批次失败")); throw cause; } }
    finally { if (alive.current && listRequest.current === controller) setLoading(false); }
  }, [canRead, month, status, page]);
  useEffect(() => {
    detailRequest.current?.abort(); setRows([]); setSelected(null); setDetail(null); setReason(""); setNotice(""); setDetailError(""); setCommitted(false);
    void loadList().catch(() => undefined); return () => listRequest.current?.abort();
  }, [loadList]);
  const loadDetail = useCallback(async () => {
    if (!canDetail || !selected) return;
    const controller = new AbortController(); detailRequest.current?.abort(); detailRequest.current = controller; setDetailLoading(true); setDetailError("");
    try {
      const data = await hrApi.formalPayrollRun(selected.id, { page: detailPage, pageSize: 20 }, getAccessToken(), controller.signal);
      if (alive.current && !controller.signal.aborted) { setDetail(data); setCommitted(false); }
    } catch (cause) { if (alive.current && !controller.signal.aborted) { setDetailError(hrLoadErrorMessage(cause, "加载工资分项失败")); throw cause; } }
    finally { if (alive.current && detailRequest.current === controller) setDetailLoading(false); }
  }, [canDetail, selected?.id, detailPage]);
  useEffect(() => { setExpanded(new Set()); void loadDetail().catch(() => undefined); return () => detailRequest.current?.abort(); }, [loadDetail]);
  const transition = async (action: "review" | "confirm") => {
    if (!detail || lock.current || committed || detailLoading || !reason.trim() || (action === "review" ? !canReview || !detail.canReview : !canConfirm || !detail.canConfirm)) return;
    lock.current = true; setBusy(true); setDetailError(""); setNotice("");
    const body = { expectedVersion: detail.version, reason: reason.trim() }, signature = JSON.stringify({ id: detail.id, action, body });
    if (retry.current?.signature !== signature) retry.current = { signature, key: createIdempotencyKey(`hr-payroll-${action}`) };
    try {
      const result = await (action === "review" ? hrApi.reviewFormalPayrollRun : hrApi.confirmFormalPayrollRun)(detail.id, body, getAccessToken(), retry.current.key);
      if (!alive.current) return;
      setCommitted(true); retry.current = null; setReason("");
      setDetail(value => value ? { ...value, status: result.status, version: result.version, canReview: false, canConfirm: false } : value);
      setNotice(action === "review" ? "批次已复核。" : "批次及工资条已确认。");
      try { await Promise.all([loadList(), loadDetail()]); }
      catch { if (alive.current) { setCommitted(true); setDetailError("操作已提交，刷新失败；请刷新查看最新状态，勿重复提交。"); } }
    } catch (cause) { if (alive.current) setDetailError(hrLoadErrorMessage(cause, "工资批次操作失败")); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  if (!canRead) return null;
  return <section className={`ds-panel ${styles.workspace}`} aria-labelledby="payroll-results-heading">
    <div className={styles.actions}><h2 id="payroll-results-heading">工资核算结果</h2><button className="secondary-button" type="button" disabled={busy || loading} onClick={() => void loadList().catch(() => undefined)}>刷新批次</button></div>
    <p>核对员工和工资分项后复核、确认。计算人不能批准自己的批次，已确认结果通过更正批次延续。</p>
    <div className={styles.fields}><label className="form-field"><span>核算月份</span><input type="month" min="1900-01" max="2100-12" value={month} disabled={busy} onChange={event => { if (!lock.current) { setMonth(event.target.value); setPage(1); } }} /></label><label className="form-field"><span>核算状态</span><select value={status} disabled={busy} onChange={event => { if (!lock.current) { setStatus(event.target.value); setPage(1); } }}><option value="">全部状态</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}{loading ? <p>正在加载工资批次…</p> : <div className={`ds-mobile-record-list ${styles.records}`}>{rows.map(row => <article className="ds-mobile-record" key={row.id}><strong>{row.month} · 第 {row.runNo} 批{row.isCorrection ? " · 更正" : ""}</strong><span>{row.ruleName} · {statuses[row.status] ?? row.status} · {row.employeeCount} 位员工</span>{canDetail ? <button className="secondary-button" type="button" disabled={busy} onClick={() => { if (lock.current) return; detailRequest.current?.abort(); setSelected(row); setDetail(null); setDetailPage(1); setReason(""); setNotice(""); setCommitted(false); if (selected?.id === row.id && detailPage === 1) void loadDetail().catch(() => undefined); }}>查看核算明细</button> : <span>当前权限可查看批次概要。</span>}</article>)}{!rows.length && !error ? <p>当前筛选下暂无工资批次。</p> : null}</div>}
    <div className={styles.actions}><button className="secondary-button" type="button" disabled={busy || loading || page <= 1} onClick={() => setPage(value => value - 1)}>批次上一页</button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页 · 共 {total} 批</span><button className="secondary-button" type="button" disabled={busy || loading || page * 20 >= total} onClick={() => setPage(value => value + 1)}>批次下一页</button></div>
    {detailLoading ? <p>正在加载员工工资分项…</p> : null}{detailError ? <p className="form-error" role="alert">{detailError}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {selected && detail ? <section className={styles.workspace} aria-label="批次工资明细">
      <div className={styles.actions}><h3>{selected.month} · 第 {detail.runNo} 批 · {statuses[detail.status] ?? detail.status}</h3><button className="secondary-button" type="button" disabled={busy || detailLoading} onClick={() => void loadDetail().catch(() => undefined)}>刷新明细</button></div>
      <div className="ds-kpi-grid">{([{ field: "grossAmount", label: "应发合计" }, { field: "deductionAmount", label: "扣款合计" }, { field: "personalTax", label: "税额合计" }, { field: "netAmount", label: "实发合计" }] as const).map(item => <article className="ds-kpi-card" key={item.field}><span>{item.label}</span><strong>{money(detail.totals[item.field])}</strong></article>)}</div>
      {!detailLoading ? <div className={`ds-mobile-record-list ${styles.records}`}>{detail.items.map(employee => <article className="ds-mobile-record" key={employee.employeeId}><strong>{employee.fullName ?? "员工信息暂不可用"} · {employee.employeeCode ?? "编号暂不可用"}</strong><span>应发 {money(employee.grossAmount)} · 扣款 {money(employee.deductionAmount)}</span><span>税额 {money(employee.personalTax)} · 实发 {money(employee.netAmount)}</span><button className="secondary-button" type="button" onClick={() => setExpanded(value => { const next = new Set(value); if (next.has(employee.employeeId)) next.delete(employee.employeeId); else next.add(employee.employeeId); return next; })}>{expanded.has(employee.employeeId) ? "收起工资分项" : `查看工资分项（${employee.items.length}项）`}</button>{expanded.has(employee.employeeId) ? <dl className={styles.amounts}>{employee.items.map(item => <div className={styles.amountRow} key={item.code}><dt>{item.code} · {roles[item.role]}</dt><dd>{item.amount === null ? item.decimalValue : money(item.amount)}</dd></div>)}</dl> : null}</article>)}{!detail.items.length ? <p>当前页暂无员工工资条。</p> : null}</div> : null}
      <div className={styles.actions}><button className="secondary-button" type="button" disabled={busy || detailLoading || detailPage <= 1} onClick={() => setDetailPage(value => value - 1)}>员工上一页</button><span>第 {detail.page} / {Math.max(1, Math.ceil(detail.total / 20))} 页 · 共 {detail.total} 位员工</span><button className="secondary-button" type="button" disabled={busy || detailLoading || detailPage * 20 >= detail.total} onClick={() => setDetailPage(value => value + 1)}>员工下一页</button></div>
      {(canReview && detail.canReview || canConfirm && detail.canConfirm) ? <><label className="form-field"><span>复核或确认理由</span><textarea required maxLength={500} value={reason} disabled={busy || committed || detailLoading} onChange={event => setReason(event.target.value)} /></label><div className={styles.actions}>{canReview && detail.canReview ? <button className="primary-button" type="button" disabled={busy || committed || detailLoading || !reason.trim()} onClick={() => void transition("review")}>复核此批次</button> : null}{canConfirm && detail.canConfirm ? <button className="primary-button" type="button" disabled={busy || committed || detailLoading || !reason.trim()} onClick={() => void transition("confirm")}>确认批次及工资条</button> : null}</div></> : null}
    </section> : null}
  </section>;
}
