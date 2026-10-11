"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HrLeaveBalanceEmployee, HrLeaveQuota, HrLeaveType, PaginatedResult } from "@jinhu/shared";
import { leaveLedgerApi, type LeaveHistory } from "../../../lib/hr-leave-ledger-api";
import { leaveBalanceApi } from "../../../lib/hr-leave-balance-api";
import { createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./leave-balance.module.css";
const button = "ds-button ds-button-secondary";
const lastPage = (total: number) => Math.max(1, Math.ceil(total / 20));
function usePage<T>(enabled: boolean, fetcher: (page: number, token: string | undefined, signal: AbortSignal) => Promise<PaginatedResult<T>>) {
 const [page, setPage] = useState(1), [retry, setRetry] = useState(0), [data, setData] = useState<PaginatedResult<T> | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
 useEffect(() => {
  if (!enabled) return;
  const controller = new AbortController(), token = getAccessToken(); setData(null); setError(""); setLoading(true);
  void fetcher(page, token, controller.signal).then(value => {
   if (controller.signal.aborted || getAccessToken() !== token) return;
   if (value.page !== page || value.page_size !== 20) throw new Error("台账页码不一致，请重新读取。");
   if (page > lastPage(value.total)) { setPage(lastPage(value.total)); return; } setData(value);
  }).catch(e => { if (!controller.signal.aborted && getAccessToken() === token) setError(hrLoadErrorMessage(e, "读取假期台账失败")); })
   .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  return () => controller.abort();
 }, [enabled, fetcher, page, retry]);
 return { page, data, error, loading, setPage, refresh: () => setRetry(n => n + 1) };
}
function Pager({ name, read }: { name: string; read: { page: number; data: { total: number } | null; loading: boolean; setPage: (page: number) => void; refresh: () => void } }) {
 return <nav className={styles.row} aria-label={`${name}分页`}><button className={button} disabled={read.loading || read.page <= 1} onClick={() => read.setPage(read.page - 1)}>{name}上一页</button><span>第 {read.page} / {lastPage(read.data?.total ?? 0)} 页 · 共 {read.data?.total ?? "待读取"} 条</span><button className={button} disabled={read.loading || !read.data || read.page >= lastPage(read.data.total)} onClick={() => read.setPage(read.page + 1)}>{name}下一页</button><button className={button} disabled={read.loading} onClick={read.refresh}>刷新{name}</button></nav>;
}
function ReadState({ read }: { read: { loading: boolean; error: string } }) { return <>{read.loading ? <p role="status">正在读取台账…</p> : null}{read.error ? <p role="alert">{read.error}</p> : null}</>; }
type Edit = { kind: "type"; row: HrLeaveType | null } | { kind: "quota"; row: HrLeaveQuota | null };
type History = { kind: "type" | "quota"; id: string; title: string };
export function LeaveLedgerManagement() {
 const [open, setOpen] = useState(false), [working, setWorking] = useState(false);
 return <section className={`ds-panel ${styles.panel}`} aria-label="假期类型与额度管理"><h2>假期类型与额度管理</h2><p>登记假期类型和员工额度，修改保留原因及版本；额度调整不改写原请假审批和已封账工资。</p><button className={button} aria-expanded={open} disabled={working} onClick={() => setOpen(v => !v)}>{open ? "收起假期管理" : "打开假期管理"}</button>{open ? <LedgerContent onBusyChange={setWorking} /> : null}</section>;
}
function LedgerContent({ onBusyChange }: { onBusyChange: (value: boolean) => void }) {
 const [epoch, setEpoch] = useState(0), [edit, setEdit] = useState<Edit | null>(null), [history, setHistory] = useState<History | null>(null), [message, setMessage] = useState("");
 const typesFetch = useCallback((page: number, token: string | undefined, signal: AbortSignal) => { void epoch; return leaveLedgerApi.types(page, token, signal); }, [epoch]);
 const quotasFetch = useCallback((page: number, token: string | undefined, signal: AbortSignal) => { void epoch; return leaveLedgerApi.quotas(page, "", token, signal); }, [epoch]);
 const types = usePage(true, typesFetch), quotas = usePage(true, quotasFetch);
 if (edit) return <LedgerEditor key={`${edit.kind}:${edit.row?.id ?? "new"}`} edit={edit} onBusyChange={onBusyChange} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); setHistory(null); setMessage("已保存，正在重新读取台账；若读取失败，可刷新列表，不必再次保存。"); setEpoch(n => n + 1); }} />;
 return <>
  {message ? <p role="status">{message}</p> : null}
  <section aria-label="假期类型台账"><h3>假期类型</h3><button className={button} onClick={() => { setMessage(""); setEdit({ kind: "type", row: null }); }}>新增假期类型</button><ReadState read={types} />
   <div className={`ds-mobile-record-list ${styles.records}`}>{types.data?.items.map(row => <article className="ds-mobile-record" key={row.id}><strong>{row.typeName} · {row.typeCode}</strong><span>{row.enabled ? "启用" : "停用"} · 版本 {row.version}</span><div className={styles.row}><button className={button} onClick={() => { setMessage(""); setEdit({ kind: "type", row }); }}>修改类型 {row.typeCode}</button><button className={button} onClick={() => setHistory({ kind: "type", id: row.typeCode, title: row.typeName })}>类型历史 {row.typeCode}</button></div></article>)}</div>
   {types.data?.total === 0 ? <p>尚未登记假期类型。</p> : null}<Pager name="类型" read={types} />
  </section>
  <section aria-label="员工额度台账"><h3>员工额度</h3><button className={button} onClick={() => { setMessage(""); setEdit({ kind: "quota", row: null }); }}>登记员工额度</button><ReadState read={quotas} />
   <div className={`ds-mobile-record-list ${styles.records}`}>{quotas.data?.items.map(row => <article className="ds-mobile-record" key={row.id}><strong>{row.employeeName ?? row.employeeCode ?? "员工"} · {row.typeName ?? "假期"}</strong><span>{row.periodStart} 至 {row.periodEnd}（截止日不含）</span><span>期初 {row.openingMinutes} 分钟 · 调整 {row.adjustmentMinutes} 分钟 · 版本 {row.version}</span><div className={styles.row}><button className={button} onClick={() => { setMessage(""); setEdit({ kind: "quota", row }); }}>调整额度 {row.employeeCode ?? row.id}</button><button className={button} onClick={() => setHistory({ kind: "quota", id: row.id, title: `${row.employeeName ?? "员工"} · ${row.typeName ?? "假期"}` })}>额度历史 {row.employeeCode ?? row.id}</button></div></article>)}</div>
   {quotas.data?.total === 0 ? <p>尚未登记员工额度，未登记不代表零额度。</p> : null}<Pager name="额度" read={quotas} />
  </section>
  {history ? <LedgerHistory key={`${history.kind}:${history.id}`} selected={history} onClose={() => setHistory(null)} /> : null}
 </>;
}
function LedgerHistory({ selected, onClose }: { selected: History; onClose: () => void }) {
 const fetcher = useCallback((page: number, token: string | undefined, signal: AbortSignal) => leaveLedgerApi.history(selected.kind, selected.id, page, token, signal), [selected]);
 const read = usePage<LeaveHistory>(true, fetcher);
 return <section aria-label="假期变更历史"><h3>{selected.title} · 变更历史</h3><button className={button} onClick={onClose}>关闭变更历史</button><ReadState read={read} /><div className={`ds-mobile-record-list ${styles.records}`}>{read.data?.items.map(row => <article className="ds-mobile-record" key={row.id}><strong>版本 {row.version}</strong>{selected.kind === "type" ? <span>{row.typeName} · {row.enabled ? "启用" : "停用"}</span> : <span>期初 {row.openingMinutes} 分钟 · 调整 {row.adjustmentMinutes} 分钟</span>}<p>{row.reason}</p><span>{row.actorName} · {new Date(row.occurredAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span></article>)}</div>{read.data?.total === 0 ? <p>未读取到变更历史。</p> : null}<Pager name="历史" read={read} /></section>;
}
function LedgerEditor({ edit, onCancel, onSaved, onBusyChange }: { edit: Edit; onCancel: () => void; onSaved: () => void; onBusyChange: (value: boolean) => void }) {
 const typeRow = edit.kind === "type" ? edit.row : null, quotaRow = edit.kind === "quota" ? edit.row : null;
 const [form, setForm] = useState({ code: typeRow?.typeCode ?? "", name: typeRow?.typeName ?? "", enabled: typeRow?.enabled ?? true, from: quotaRow?.periodStart ?? "", to: quotaRow?.periodEnd ?? "", opening: String(quotaRow?.openingMinutes ?? 0), adjustment: String(quotaRow?.adjustmentMinutes ?? 0), reason: "" });
 const [employee, setEmployee] = useState<HrLeaveBalanceEmployee | null>(null), [leaveType, setLeaveType] = useState<HrLeaveType | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
 const flight = useRef(false), mounted = useRef(true), retry = useRef<{ signature: string; key: string } | null>(null);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
 const save = async () => {
  if (flight.current) return;
  if (!form.reason.trim()) { setError("请填写办理原因。"); return; }
  const opening = Number(form.opening), adjustment = Number(form.adjustment);
  if (edit.kind === "quota" && (!form.opening.trim() || !form.adjustment.trim() || !Number.isInteger(opening) || opening < 0 || opening > 2147483647 || !Number.isInteger(adjustment) || Math.abs(adjustment) > 2147483647)) { setError("额度须为整分钟，期初非负。"); return; }
  if (edit.kind === "quota" && !quotaRow && (!employee || !leaveType || !leaveType.enabled || !form.from || !form.to || form.to <= form.from || (Date.parse(form.to) - Date.parse(form.from)) / 86400000 > 366)) { setError("请选择员工、启用类型和有效额度区间，最多366天。"); return; }
  const normalizedName = form.name.replace(/\p{Default_Ignorable_Code_Point}/gu, "").trim();
  if (edit.kind === "type" && !/\p{L}/u.test(normalizedName)) { setError("请填写含有文字的假期名称。"); return; }
  const token = getAccessToken();
  const body = edit.kind === "type" ? { expectedVersion: typeRow?.version ?? 0, typeName: normalizedName, enabled: form.enabled, reason: form.reason.trim() } : { openingMinutes: opening, adjustmentMinutes: adjustment, reason: form.reason.trim(), ...(quotaRow ? { expectedVersion: quotaRow.version } : { employeeId: employee!.id, leaveTypeId: leaveType!.id, periodStart: form.from, periodEnd: form.to }) };
  const signature = JSON.stringify([token, edit.kind, edit.row?.id, form.code, body]);
  if (retry.current?.signature !== signature) retry.current = { signature, key: createIdempotencyKey("hr-leave-ledger") };
  flight.current = true; onBusyChange(true); setBusy(true); setError("");
  try {
   if (edit.kind === "type") await leaveLedgerApi.putType(form.code.trim(), { expectedVersion: typeRow?.version ?? 0, typeName: normalizedName, enabled: form.enabled, reason: form.reason.trim() }, token, retry.current.key);
   else if (quotaRow) await leaveLedgerApi.putQuota(quotaRow.id, { expectedVersion: quotaRow.version, openingMinutes: opening, adjustmentMinutes: adjustment, reason: form.reason.trim() }, token, retry.current.key);
   else await leaveLedgerApi.createQuota({ employeeId: employee!.id, leaveTypeId: leaveType!.id, periodStart: form.from, periodEnd: form.to, openingMinutes: opening, adjustmentMinutes: adjustment, reason: form.reason.trim() }, token, retry.current.key);
   if (mounted.current && getAccessToken() === token) { retry.current = null; onSaved(); }
  } catch (e) { if (mounted.current && getAccessToken() === token) setError(hrLoadErrorMessage(e, "保存假期台账失败，请核对或保持原表单重试")); }
  finally { flight.current = false; onBusyChange(false); if (mounted.current) setBusy(false); }
 };
 const change = (key: keyof typeof form, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
 return <section aria-label="假期台账编辑"><h3>{edit.kind === "type" ? typeRow ? "修改假期类型" : "新增假期类型" : quotaRow ? "调整员工额度" : "登记员工额度"}</h3>
  {edit.kind === "quota" && !quotaRow ? <QuotaTargets disabled={busy} onEmployee={setEmployee} onType={setLeaveType} /> : null}
  {quotaRow ? <p>{quotaRow.employeeName ?? "员工"} · {quotaRow.typeName ?? "假期"} · {quotaRow.periodStart} 至 {quotaRow.periodEnd}（截止日不含） · 版本 {quotaRow.version}</p> : null}
  <form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={busy} className={styles.editor}><legend>办理内容</legend>
   {edit.kind === "type" ? <><label className="form-field"><span>假期代码</span><input required readOnly={Boolean(typeRow)} pattern="[A-Z][A-Z0-9_]{0,31}" maxLength={32} value={form.code} onChange={e => change("code", e.target.value)} /></label><label className="form-field"><span>假期名称</span><input required maxLength={100} value={form.name} onChange={e => change("name", e.target.value)} /></label><label><input type="checkbox" checked={form.enabled} onChange={e => change("enabled", e.target.checked)} />启用此假期类型</label></> : <>
    {!quotaRow ? <div className={styles.row}><label className="form-field"><span>额度起日</span><input type="date" required min="1900-01-01" max="2199-12-31" value={form.from} onChange={e => change("from", e.target.value)} /></label><label className="form-field"><span>额度截止日（不含）</span><input type="date" required min={form.from || "1900-01-01"} max="2199-12-31" value={form.to} onChange={e => change("to", e.target.value)} /></label></div> : null}
    <div className={styles.row}><label className="form-field"><span>期初额度（分钟）</span><input required type="number" min={0} max={2147483647} step={1} value={form.opening} onFocus={e => e.currentTarget.select()} onChange={e => change("opening", e.target.value)} /></label><label className="form-field"><span>额度调整（分钟，可负）</span><input required type="number" min={-2147483647} max={2147483647} step={1} value={form.adjustment} onFocus={e => e.currentTarget.select()} onChange={e => change("adjustment", e.target.value)} /></label></div>
   </>}
   <label className="form-field"><span>办理原因</span><textarea required maxLength={500} value={form.reason} onChange={e => change("reason", e.target.value)} /></label>
   <div className={styles.row}><button className="ds-button ds-button-primary" type="submit">{busy ? "正在保存…" : "保存假期台账"}</button><button className={button} type="button" onClick={onCancel}>返回台账</button></div>
  </fieldset></form>{error ? <p role="alert">{error}</p> : null}</section>;
}
function QuotaTargets({ disabled, onEmployee, onType }: { disabled: boolean; onEmployee: (row: HrLeaveBalanceEmployee | null) => void; onType: (row: HrLeaveType | null) => void }) {
 const [keyword, setKeyword] = useState(""), [search, setSearch] = useState(""), [selectedEmployee, setSelectedEmployee] = useState<HrLeaveBalanceEmployee | null>(null), [selectedType, setSelectedType] = useState<HrLeaveType | null>(null);
 const employeesFetch = useCallback((page: number, token: string | undefined, signal: AbortSignal) => leaveBalanceApi.employees(page, search, token, signal), [search]);
 const typesFetch = useCallback((page: number, token: string | undefined, signal: AbortSignal) => leaveLedgerApi.types(page, token, signal), []);
 const employees = usePage(true, employeesFetch), types = usePage(true, typesFetch);
 return <fieldset disabled={disabled} className={styles.editor}><legend>额度归属</legend>
  <form className={styles.row} onSubmit={e => { e.preventDefault(); onEmployee(null); setSelectedEmployee(null); employees.setPage(1); setSearch(keyword.trim()); employees.refresh(); }}><label className="form-field"><span>搜索额度员工</span><input maxLength={100} value={keyword} onChange={e => setKeyword(e.target.value)} /></label><button className={button} type="submit">搜索额度员工</button></form><ReadState read={employees} />
  <label className="form-field"><span>额度员工</span><select disabled={employees.loading || Boolean(employees.error)} value={selectedEmployee?.id ?? ""} onChange={e => { const row = employees.data?.items.find(item => item.id === e.target.value) ?? null; setSelectedEmployee(row); onEmployee(row); }}><option value="">请选择员工</option>{selectedEmployee && !employees.data?.items.some(row => row.id === selectedEmployee.id) ? <option value={selectedEmployee.id}>{selectedEmployee.employeeName} · {selectedEmployee.employeeCode}</option> : null}{employees.data?.items.map(row => <option value={row.id} key={row.id}>{row.employeeName} · {row.employeeCode}</option>)}</select></label><Pager name="候选员工" read={employees} />
  <ReadState read={types} /><label className="form-field"><span>额度假期类型</span><select disabled={types.loading || Boolean(types.error)} value={selectedType?.id ?? ""} onChange={e => { const row = types.data?.items.find(item => item.id === e.target.value) ?? null; setSelectedType(row); onType(row); }}><option value="">请选择启用类型</option>{selectedType && !types.data?.items.some(row => row.id === selectedType.id) ? <option value={selectedType.id}>{selectedType.typeName}</option> : null}{types.data?.items.map(row => <option value={row.id} key={row.id} disabled={!row.enabled}>{row.typeName}{row.enabled ? "" : "（停用）"}</option>)}</select></label><Pager name="候选类型" read={types} />
 </fieldset>;
}
