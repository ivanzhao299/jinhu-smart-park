"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HR_PERMISSIONS, type FormalPayrollEmployeeInput, type FormalPayrollInputDetail, type FormalPayrollInputListItem } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { createIdempotencyKey } from "../../../lib/api-client";
import { hrApi, type HrPayrollPeriod } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./payroll-modern.module.css";

type Employee = FormalPayrollInputDetail["employees"][number];
export function PayrollInputOperations() {
  const user = useAuthUser(); return <InputWorkspace key={JSON.stringify(user)}/>;
}
function InputWorkspace() {
  const user = useAuthUser(), canRead = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_READ);
  const canDetail = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ) && hasPermission(user, HR_PERMISSIONS.HR_EMPLOYEE_READ);
  const canManage = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_MANAGE), canConfirm = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_REVIEW);
  const [periods, setPeriods] = useState<HrPayrollPeriod[]>([]), [periodId, setPeriodId] = useState(""), [page, setPage] = useState(1), [rows, setRows] = useState<FormalPayrollInputListItem[]>([]), [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState(""), [detailPage, setDetailPage] = useState(1), [detail, setDetail] = useState<FormalPayrollInputDetail | null>(null);
  const [edit, setEdit] = useState<Employee[] | null>(null), [editPage, setEditPage] = useState(1), [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false), [detailLoading, setDetailLoading] = useState(false), [busy, setBusy] = useState(false), [committed, setCommitted] = useState(false), [error, setError] = useState(""), [detailError, setDetailError] = useState(""), [notice, setNotice] = useState("");
  const alive = useRef(true), lock = useRef(false), listAbort = useRef<AbortController | null>(null), detailAbort = useRef<AbortController | null>(null), editAbort = useRef<AbortController | null>(null), retry = useRef<{signature:string;key:string}|null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; listAbort.current?.abort(); detailAbort.current?.abort(); editAbort.current?.abort(); }; }, []);
  useEffect(() => {
    if (!canRead) return;
    const abort = new AbortController();
    void hrApi.payrollPeriods(getAccessToken(), abort.signal).then(result => { if (!abort.signal.aborted) setPeriods(result); }).catch(cause => { if (!abort.signal.aborted) setError(hrLoadErrorMessage(cause, "加载工资期间失败")); });
    return () => abort.abort();
  }, [canRead]);
  const loadList = useCallback(async () => {
    if (!canRead || !periodId) return;
    const abort = new AbortController(); listAbort.current?.abort(); listAbort.current = abort; setLoading(true); setError("");
    try {
      const result = await hrApi.payrollInputs({ periodId, page, pageSize: 20 }, getAccessToken(), abort.signal);
      if (alive.current && !abort.signal.aborted) { setRows(result.items); setTotal(result.total); }
    } catch (cause) { if (alive.current && !abort.signal.aborted) { setError(hrLoadErrorMessage(cause, "加载输入批次失败")); throw cause; } }
    finally { if (alive.current && listAbort.current === abort) setLoading(false); }
  }, [canRead, periodId, page]);
  useEffect(() => { setRows([]); setSelectedId(""); setDetail(null); setEdit(null); setReason(""); setNotice(""); setCommitted(false); detailAbort.current?.abort(); editAbort.current?.abort(); void loadList().catch(() => undefined); return () => listAbort.current?.abort(); }, [loadList]);
  const loadDetail = useCallback(async () => {
    if (!canDetail || !selectedId) return;
    const abort = new AbortController(); detailAbort.current?.abort(); detailAbort.current = abort; setDetailLoading(true); setDetailError("");
    try {
      const result = await hrApi.payrollInput(selectedId, { page: detailPage, pageSize: 20 }, getAccessToken(), abort.signal);
      if (alive.current && !abort.signal.aborted) { setDetail(result); setCommitted(false); }
    } catch (cause) { if (alive.current && !abort.signal.aborted) { setDetailError(hrLoadErrorMessage(cause, "加载输入明细失败")); throw cause; } }
    finally { if (alive.current && detailAbort.current === abort) setDetailLoading(false); }
  }, [canDetail, selectedId, detailPage]);
  useEffect(() => { setDetail(null); setEdit(null); setReason(""); void loadDetail().catch(() => undefined); return () => detailAbort.current?.abort(); }, [loadDetail]);
  const beginEdit = async () => {
    if (!detail || !detail.canEdit || !canManage || lock.current || committed || detailLoading) return;
    lock.current = true; setBusy(true); setDetailError(""); const abort = new AbortController(); editAbort.current?.abort(); editAbort.current = abort;
    try {
      const employees: Employee[] = [], expected = detail;
      if (!Number.isSafeInteger(expected.total) || expected.total < 1 || expected.total > 2000) throw new Error("员工数量不可编辑，请刷新核对。");
      for (let part = 1; part <= Math.ceil(expected.total / 100); part++) {
        const result = await hrApi.payrollInput(expected.id, { page: part, pageSize: 100 }, getAccessToken(), abort.signal);
        if (abort.signal.aborted || !alive.current) return;
        if (result.id !== expected.id || result.version !== expected.version || result.status !== "draft" || !result.canEdit || result.total !== expected.total || result.periodId !== expected.periodId || result.ruleVersionId !== expected.ruleVersionId || result.page !== part || result.page_size !== 100 || result.employees.length !== Math.min(100, expected.total - (part - 1) * 100)) throw new Error("读取期间输入已变化，请刷新后重新编辑。");
        employees.push(...result.employees);
      }
      if (employees.length !== expected.total || new Set(employees.map(row => row.employeeId)).size !== employees.length) throw new Error("员工名单不完整，请刷新后重新编辑。");
      setEdit(employees); setEditPage(1); setReason(expected.reason); setNotice("已读取完整员工名单；保存会提交整批员工，不只提交当前页。");
    } catch (cause) { if (alive.current && !abort.signal.aborted) setDetailError(hrLoadErrorMessage(cause, "读取完整名单失败")); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const transition = async (action: "save" | "confirm") => {
    if (!detail || lock.current || committed || detailLoading || (action === "save" ? !canManage || !detail.canEdit || !edit : !canConfirm || !detail.canConfirm || edit !== null)) return;
    const employees: FormalPayrollEmployeeInput[] = (edit ?? []).map(({ employeeId, expectedEmployeeVersion, directItems, settlementStart, settlementEnd, eligibilityReason }) => ({ employeeId, expectedEmployeeVersion, directItems, ...(settlementStart || settlementEnd || eligibilityReason?.trim() ? { settlementStart, settlementEnd, eligibilityReason: eligibilityReason?.trim() } : {}) }));
    if (action === "save" && (!reason.trim() || employees.some(employee => Object.values(employee.directItems).some(value => !/^-?\d{1,16}(?:\.\d{1,4})?$/u.test(value))))) { setDetailError("请完整填写准备说明和所有员工项目，零值也需明确填写。"); return; }
    const period = periods.find(row => row.id === detail.periodId);
    if (action === "save" && employees.some(employee => (employee.settlementStart || employee.settlementEnd || employee.eligibilityReason) && (!employee.settlementStart || !employee.settlementEnd || !employee.eligibilityReason || employee.settlementStart > employee.settlementEnd || !period || employee.settlementStart < period.startDate || employee.settlementEnd > period.endDate))) { setDetailError("补结算需要期间内的完整日期和理由。"); return; }
    const body = action === "save" ? { expectedVersion: detail.version, employees, reason: reason.trim() } : { expectedVersion: detail.version }, signature = JSON.stringify({ id: detail.id, action, body });
    if (retry.current?.signature !== signature) retry.current = { signature, key: createIdempotencyKey(`hr-payroll-input-${action}`) };
    lock.current = true; setBusy(true); setDetailError(""); setNotice("");
    try {
      const result = await (action === "save" ? hrApi.updatePayrollInput(detail.id, body as {expectedVersion:number;employees:FormalPayrollEmployeeInput[];reason:string}, getAccessToken(), retry.current.key) : hrApi.confirmPayrollInput(detail.id, {expectedVersion:detail.version}, getAccessToken(), retry.current.key));
      if (!alive.current) return;
      setCommitted(true); setEdit(null); setReason(""); retry.current = null;
      setDetail(current => current ? {...current,version:result.version,status:result.status,canEdit:false,canConfirm:false} : current);
      setNotice(action === "save" ? "整批输入草稿已更新。" : "整批工资输入已确认，可用于正式核算。");
      try { await Promise.all([loadList(), loadDetail()]); } catch { if (alive.current) { setCommitted(true); setDetailError("操作已提交，刷新失败；请刷新最新状态，勿重复提交。"); } }
    } catch (cause) { if (alive.current) setDetailError(hrLoadErrorMessage(cause, "工资输入操作失败")); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  if (!canRead) return null;
  return <section className={`ds-panel ${styles.workspace}`} aria-labelledby="payroll-input-operations-heading"><h2 id="payroll-input-operations-heading">工资输入批次</h2><p>草稿可按权限修改，由其他有权限的人员确认。已确认输入保持原记录，后续调整保存新版本。</p>
    <label className="form-field"><span>查看输入期间</span><select value={periodId} disabled={busy || edit !== null} onChange={event => { if (!lock.current) { setPeriodId(event.target.value); setPage(1); } }}><option value="">请选择期间</option>{periods.map(row => <option value={row.id} key={row.id}>{row.periodMonth.slice(0, 7)}{row.status === "open" ? "" : " · 已关闭"}</option>)}</select></label>
    <button className="secondary-button" disabled={busy || loading || edit !== null || !periodId} onClick={() => void loadList().catch(() => undefined)}>刷新输入批次</button>{error ? <p className="form-error" role="alert">{error}</p> : null}{loading ? <p>正在读取输入批次…</p> : null}
    <div className={`ds-mobile-record-list ${styles.records}`}>{rows.map(row => <article className="ds-mobile-record" key={row.id}><strong>{row.displayName} · 第 {row.revisionNo} 版</strong><span>{row.status === "confirmed" ? "已确认" : "草稿"} · {row.employeeCount} 位员工</span>{canDetail ? <button className="secondary-button" disabled={busy || edit !== null} onClick={() => { if (!lock.current) { setSelectedId(row.id); setDetailPage(1); setDetail(null); setNotice(""); setCommitted(false); if (selectedId === row.id && detailPage === 1) void loadDetail().catch(() => undefined); } }}>查看输入明细</button> : <span>当前权限可查看批次概要。</span>}</article>)}</div>
    <div className={styles.actions}><button className="secondary-button" disabled={busy || loading || edit !== null || page <= 1} onClick={() => setPage(value => value - 1)}>输入上一页</button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页 · 共 {total} 版</span><button className="secondary-button" disabled={busy || loading || edit !== null || page * 20 >= total} onClick={() => setPage(value => value + 1)}>输入下一页</button></div>
    {detailLoading ? <p>正在读取员工输入…</p> : null}{detailError ? <p className="form-error" role="alert">{detailError}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {detail ? <section className={styles.workspace} aria-label="工资输入明细"><h3>第 {detail.revisionNo} 版 · {detail.status === "confirmed" ? "已确认" : "草稿"} · {detail.total} 位员工</h3><p>{detail.reason}</p>
      {!edit ? <><div className={`ds-mobile-record-list ${styles.records}`}>{detail.employees.map(employee => <article className="ds-mobile-record" key={employee.employeeId}><strong>{employee.fullName ?? "员工信息暂不可用"} · {employee.employeeCode ?? "编号暂不可用"}</strong><dl className={styles.amounts}>{Object.entries(employee.directItems).map(([code,value]) => <div className={styles.amountRow} key={code}><dt>{code}</dt><dd>{value}</dd></div>)}</dl>{employee.settlementStart ? <p>补结算 {employee.settlementStart} 至 {employee.settlementEnd} · {employee.eligibilityReason}</p> : null}</article>)}</div><div className={styles.actions}><button className="secondary-button" disabled={busy || detailLoading || detailPage <= 1} onClick={() => setDetailPage(value => value - 1)}>明细上一页</button><span>第 {detail.page} / {Math.max(1, Math.ceil(detail.total / 20))} 页</span><button className="secondary-button" disabled={busy || detailLoading || detailPage * 20 >= detail.total} onClick={() => setDetailPage(value => value + 1)}>明细下一页</button></div><div className={styles.actions}><button className="secondary-button" disabled={busy || detailLoading} onClick={() => void loadDetail().catch(() => undefined)}>刷新输入明细</button>{canManage && detail.canEdit ? <button className="secondary-button" disabled={busy || detailLoading || committed} onClick={() => void beginEdit()}>修改整批草稿</button> : null}{canConfirm && detail.canConfirm ? <button className="primary-button" disabled={busy || detailLoading || committed} onClick={() => void transition("confirm")}>确认整批工资输入</button> : null}</div></> : <><div className={`ds-mobile-record-list ${styles.records}`}>{edit.slice((editPage - 1) * 20, editPage * 20).map(employee => <article className="ds-mobile-record" key={employee.employeeId}><strong>{employee.fullName ?? "员工信息暂不可用"} · {employee.employeeCode ?? "编号暂不可用"}</strong><div className={styles.fields}>{Object.entries(employee.directItems).map(([code,value]) => <label className="form-field" key={code}><span>{employee.fullName ?? "员工"} · {code}</span><input type="number" min="-9999999999999999.9999" max="9999999999999999.9999" step="0.0001" required disabled={busy} value={value} onFocus={event => event.target.select()} onChange={event => { const next=event.target.value;if(!lock.current)setEdit(values => values!.map(row => row.employeeId===employee.employeeId ? {...row,directItems:{...row.directItems,[code]:next}} : row)); }}/></label>)}</div><p>补结算时请同时填写完整日期与理由；不修改员工入离职日期。</p><div className={styles.fields}>{([{field:"settlementStart",label:"结算开始"},{field:"settlementEnd",label:"结算结束"}] as const).map(item => <label className="form-field" key={item.field}><span>{employee.fullName ?? "员工"} · {item.label}</span><input type="date" min={periods.find(row => row.id===periodId)?.startDate} max={periods.find(row => row.id===periodId)?.endDate} value={employee[item.field] ?? ""} disabled={busy} onChange={event => {const next=event.target.value;if(!lock.current)setEdit(values => values!.map(row => row.employeeId===employee.employeeId ? {...row,[item.field]:next} : row)); }}/></label>)}<label className="form-field"><span>{employee.fullName ?? "员工"} · 补结算理由</span><textarea maxLength={500} disabled={busy} value={employee.eligibilityReason ?? ""} onChange={event => {const next=event.target.value;if(!lock.current)setEdit(values => values!.map(row => row.employeeId===employee.employeeId ? {...row,eligibilityReason:next} : row)); }}/></label></div></article>)}</div><div className={styles.actions}><button className="secondary-button" disabled={busy || editPage<=1} onClick={() => setEditPage(value => value-1)}>编辑上一页</button><span>编辑第 {editPage} / {Math.max(1,Math.ceil(edit.length/20))} 页 · 保存全部 {edit.length} 人</span><button className="secondary-button" disabled={busy || editPage*20>=edit.length} onClick={() => setEditPage(value => value+1)}>编辑下一页</button></div><label className="form-field"><span>修改准备说明</span><textarea required maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)}/></label><div className={styles.actions}><button className="primary-button" disabled={busy || !reason.trim()} onClick={() => void transition("save")}>保存整批修改</button><button className="secondary-button" disabled={busy} onClick={() => { if(!lock.current){setEdit(null);setReason("");setNotice("");} }}>取消修改</button></div></>}
    </section> : null}
  </section>;
}
