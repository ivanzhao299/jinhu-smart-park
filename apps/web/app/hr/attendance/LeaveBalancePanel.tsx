"use client";
import { useEffect, useRef, useState } from "react";
import type { HrLeaveBalanceBlocker, HrLeaveBalanceEmployee, HrLeaveBalanceReport } from "@jinhu/shared";
import { leaveBalanceApi } from "../../../lib/hr-leave-balance-api";
import { getAccessToken } from "../../../lib/authz";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./leave-balance.module.css";

const labels: Record<HrLeaveBalanceBlocker, string> = {
 opening_unknown: "未登记本区间期初额度", schedule_coverage_incomplete: "部分日期的工作或休息安排待完善",
 source_coverage_incomplete: "来源尚未完整读取", approved_leave_undated: "有批准请假的时段尚未明确",
 leave_classification_incomplete: "有未分类的批准请假", leave_type_overlap: "不同假期类型的时段重叠，归属待核对",
};
const quantity = (value: number | null) => value === null ? "待完善" : `${value.toLocaleString()} 分钟`;
const pages = (total: number) => Math.max(1, Math.ceil(total / 20));
function defaultRange() {
 const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).formatToParts(new Date());
 const year = parts.find(part => part.type === "year")!.value, month = Number(parts.find(part => part.type === "month")!.value);
 return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: new Date(Date.UTC(Number(year), month, 1)).toISOString().slice(0, 10) };
}
export function LeaveBalancePanel() {
 const [open, setOpen] = useState(false), [employees, setEmployees] = useState<HrLeaveBalanceEmployee[]>([]), [employeeTotal, setEmployeeTotal] = useState(0);
 const [query, setQuery] = useState({ page: 1, keyword: "", retry: 0 }), [keyword, setKeyword] = useState(""), [employeeId, setEmployeeId] = useState("");
 const [employeeLoading, setEmployeeLoading] = useState(false), [employeeError, setEmployeeError] = useState("");
 const [range, setRange] = useState(defaultRange), [report, setReport] = useState<HrLeaveBalanceReport | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
 const employeeRead = useRef<AbortController | null>(null), reportRead = useRef<AbortController | null>(null), generation = useRef(0), mounted = useRef(true);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; employeeRead.current?.abort(); reportRead.current?.abort(); generation.current++; }; }, []);
 const clear = () => { reportRead.current?.abort(); generation.current++; setReport(null); setLoading(false); setError(""); };
 useEffect(() => {
  if (!open) return;
  const controller = new AbortController(), token = getAccessToken(); employeeRead.current?.abort(); employeeRead.current = controller;
  setEmployees([]); setEmployeeError(""); setEmployeeLoading(true);
  void leaveBalanceApi.employees(query.page, query.keyword, token, controller.signal).then(result => {
   if (controller.signal.aborted || !mounted.current || getAccessToken() !== token) return;
   if (result.page !== query.page || result.page_size !== 20) throw new Error("员工列表页码不一致，请重试。");
   setEmployeeTotal(result.total);
   if (query.page > pages(result.total)) { setQuery(current => ({ ...current, page: pages(result.total) })); return; }
   setEmployees(result.items); if (result.total === 1 && result.items[0]) setEmployeeId(current => current || result.items[0]!.id);
  }).catch(e => { if (!controller.signal.aborted && mounted.current && getAccessToken() === token) { setEmployeeTotal(0); setEmployeeError(hrLoadErrorMessage(e, "读取假期员工失败")); } })
   .finally(() => { if (!controller.signal.aborted && mounted.current) setEmployeeLoading(false); });
  return () => controller.abort();
 }, [open, query]);
 const selectPage = (page: number, search = query.keyword) => { employeeRead.current?.abort(); clear(); setEmployeeId(""); setEmployees([]); setQuery(current => ({ ...current, page, keyword: search })); };
 const load = async (page = 1) => {
  if (!employeeId || !range.from || !range.to || range.to <= range.from) { setError("请选择员工及有效区间，截止日不含当天。"); return; }
  reportRead.current?.abort(); const controller = new AbortController(), owner = ++generation.current, target = employeeId, dates = { ...range }, token = getAccessToken();
  reportRead.current = controller; setReport(null); setError(""); setLoading(true);
  try {
   const value = await leaveBalanceApi.report(target, dates.from, dates.to, page, token, controller.signal);
   if (controller.signal.aborted || owner !== generation.current || !mounted.current || getAccessToken() !== token) return;
   if (value.employee.id !== target || value.from !== dates.from || value.to !== dates.to || value.page !== page || value.page_size !== 20) throw new Error("余额归属或区间不一致，请重新读取。");
   if (page > pages(value.total)) { void load(pages(value.total)); return; } setReport(value);
  } catch (e) { if (!controller.signal.aborted && owner === generation.current && mounted.current && getAccessToken() === token) setError(hrLoadErrorMessage(e, "读取假期余额失败")); }
  finally { if (owner === generation.current && mounted.current) setLoading(false); }
 };
 return <section className={`ds-panel ${styles.panel}`} aria-label="员工假期余额">
  <button className="ds-button ds-button-secondary" type="button" aria-expanded={open} onClick={() => { if (open) { employeeRead.current?.abort(); clear(); } setOpen(!open); }}>员工假期余额</button>
  {open ? <>
   <p>按本系统已登记的排班、批准请假和销假核对额度。请选择额度起日与核对截止日，截止日不含当天。</p>
   <form className={styles.row} onSubmit={e => { e.preventDefault(); selectPage(1, keyword.trim()); }}>
    <label className="form-field"><span>搜索假期员工</span><input value={keyword} maxLength={100} placeholder="姓名或员工编号" onChange={e => setKeyword(e.target.value)} /></label>
    <button className="ds-button ds-button-secondary" type="submit" disabled={employeeLoading}>搜索员工</button>
   </form>
   {employeeError ? <p role="alert">{employeeError}</p> : null}
   <label className="form-field"><span>查看假期的员工</span><select disabled={employeeLoading || Boolean(employeeError)} value={employeeId} onChange={e => { clear(); setEmployeeId(e.target.value); }}><option value="">请选择员工</option>{employees.map(row => <option value={row.id} key={row.id}>{row.employeeName} · {row.employeeCode}{row.isSelf ? "（本人）" : ""}</option>)}</select></label>
   <nav className={styles.row} aria-label="假期员工分页"><button className="ds-button ds-button-secondary" disabled={employeeLoading || query.page <= 1} onClick={() => selectPage(query.page - 1)}>员工上一页</button><span>第 {query.page} / {pages(employeeTotal)} 页 · 共 {employeeTotal} 人</span><button className="ds-button ds-button-secondary" disabled={employeeLoading || query.page >= pages(employeeTotal)} onClick={() => selectPage(query.page + 1)}>员工下一页</button><button className="ds-button ds-button-secondary" disabled={employeeLoading} onClick={() => { clear(); setEmployeeId(""); setQuery(current => ({ ...current, retry: current.retry + 1 })); }}>刷新员工</button></nav>
   <form className={styles.row} onSubmit={e => { e.preventDefault(); void load(); }}>
    <label className="form-field"><span>额度起日</span><input type="date" required value={range.from} onChange={e => { clear(); setRange(current => ({ ...current, from: e.target.value })); }} /></label>
    <label className="form-field"><span>核对截止日（不含）</span><input type="date" required min={range.from} value={range.to} onChange={e => { clear(); setRange(current => ({ ...current, to: e.target.value })); }} /></label>
    <button className="ds-button ds-button-primary" disabled={!employeeId || employeeLoading || Boolean(employeeError) || loading} type="submit">读取余额</button>
   </form>
   {loading ? <p role="status">正在核对假期来源…</p> : null}{error ? <p role="alert">{error}</p> : null}
   {report ? <>
    <h3>{report.employee.employeeName} · 假期额度</h3><p>{report.from} 至 {report.to}（截止日不含） · 核对时间 {new Date(report.observedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
    <p>依据：{report.sources.schedules.length} 条排班、{report.sources.requests.length} 条批准请假、{report.sources.cancellations.length} 条批准销假、{report.sources.quotas.length} 条额度登记。</p>
    {report.missingScheduleDates.length ? <details><summary>{report.missingScheduleDates.length} 个日期的工作或休息安排待完善</summary><p>{report.missingScheduleDates.join("、")}</p></details> : null}
    {report.undatedApprovedRequestCount ? <p>{report.undatedApprovedRequestCount} 条批准请假的时段待核对。</p> : null}{report.unclassifiedMinutes ? <p>未分类的实际请假：{report.unclassifiedMinutes} 分钟。</p> : null}
    <div className={`ds-mobile-record-list ${styles.records}`}>{report.items.map(row => <article className="ds-mobile-record" key={row.leaveTypeId}>
     <strong>{row.typeName}{row.enabled ? "" : "（已停用）"}</strong><span>期初额度：{quantity(row.openingMinutes)}</span><span>额度调整：{quantity(row.adjustmentMinutes)}</span><span>已识别占用：{quantity(row.observedMinutes)}</span><span>核定占用：{quantity(row.consumedMinutes)}</span><strong>剩余额度：{quantity(row.balanceMinutes)}</strong>
     {row.blockers.map(code => <span key={code}>{labels[code]}</span>)}{row.quotaVersion !== null ? <span>额度登记版本 {row.quotaVersion}</span> : null}
    </article>)}</div>
    {!report.total ? <p>尚未配置假期类型，可由 HR 完善类型和员工额度。</p> : null}
    <nav className={styles.row} aria-label="假期余额分页"><button className="ds-button ds-button-secondary" disabled={loading || report.page <= 1} onClick={() => void load(report.page - 1)}>余额上一页</button><span>第 {report.page} / {pages(report.total)} 页 · 共 {report.total} 类</span><button className="ds-button ds-button-secondary" disabled={loading || report.page >= pages(report.total)} onClick={() => void load(report.page + 1)}>余额下一页</button></nav>
   </> : null}
  </> : null}
 </section>;
}
