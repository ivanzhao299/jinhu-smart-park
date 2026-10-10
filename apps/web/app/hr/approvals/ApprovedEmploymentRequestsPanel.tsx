"use client";

import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { ApiError, createIdempotencyKey } from "../../../lib/api-client";
import { businessDate } from "../../../lib/business-date";
import { hrApi, type HrApprovedEmploymentDraft, type HrApprovedEmploymentRequest, type HrJobChangeOptions, type HrLinkedJobChangeApplication } from "../../../lib/hr-api";
import styles from "../hr-workbench.module.css";
import local from "./approved-employment.module.css";

type Props = { blocked?: boolean; onBlockedChange?: (blocked: boolean) => void };
type Attempt = { sourceId: string; body: HrApprovedEmploymentDraft; token: string; key: string };
const statuses: Record<string, string> = { draft: "办理草稿", submitted: "待岗位审批", returned: "退回补充", approved: "岗位审批通过，待生效", cancelled: "办理已取消", applied: "岗位变更已生效" };
const freshDraft = (): HrApprovedEmploymentDraft => ({ applicationName: "", employeeId: "", applicationDate: businessDate(), effectiveDate: businessDate(), changeType: "transfer", afterOrgId: "", reason: "", expectedApprovalVersion: 0 });

export function ApprovedEmploymentRequestsPanel(props: Props) {
 const user = useAuthUser();
 if (!hasPermission(user, H.HR_APPROVAL_PARK_REVIEW) || !hasPermission(user, H.HR_JOB_CHANGE_MANAGE)) return null;
 return <EmploymentContent {...props} key={JSON.stringify(user)}/>;
}

function EmploymentContent({ blocked = false, onBlockedChange }: Props) {
 const [rows, setRows] = useState<HrApprovedEmploymentRequest[]>([]), [page, setPage] = useState(1), [total, setTotal] = useState(0);
 const [search, setSearch] = useState(""), [keyword, setKeyword] = useState(""), [loading, setLoading] = useState(false), [error, setError] = useState("");
 const [selected, setSelected] = useState<HrApprovedEmploymentRequest | null>(null), [draft, setDraft] = useState(freshDraft);
 const [options, setOptions] = useState<HrJobChangeOptions | null>(null), [optionsError, setOptionsError] = useState(""), [optionsRevision, setOptionsRevision] = useState(0);
 const [busy, setBusy] = useState(false), [retry, setRetry] = useState<Attempt | null>(null), [writeError, setWriteError] = useState("");
 const [receipt, setReceipt] = useState<HrLinkedJobChangeApplication | null>(null);
 const alive = useRef(true), lock = useRef(false), unresolved = useRef<Attempt | null>(null), queueRead = useRef<AbortController | null>(null), optionRead = useRef<AbortController | null>(null);
 const frozen = blocked || busy || !!retry;
 useEffect(() => { alive.current = true; return () => { alive.current = false; queueRead.current?.abort(); optionRead.current?.abort(); }; }, []);
 useEffect(() => { onBlockedChange?.(busy || !!retry || !!selected); return () => onBlockedChange?.(false); }, [busy, retry, selected, onBlockedChange]);
 const load = useCallback(async () => {
  const c = new AbortController(); queueRead.current?.abort(); queueRead.current = c; setLoading(true); setError("");
  try {
   const result = await hrApi.approvedEmploymentRequests(getAccessToken(), page, 20, keyword, c.signal);
   if (c.signal.aborted || !alive.current) return;
   if (result.page !== page || result.page_size !== 20 || !Number.isSafeInteger(result.total) || result.total < 0 || !Array.isArray(result.items)) throw new Error("办理队列读取结果无法核对，请重试。");
   if (page > Math.max(1, Math.ceil(result.total / 20))) { setPage(1); return; }
   setRows(result.items.map(row => receipt?.sourceApprovalId === row.id && !row.jobChange ? { ...row, jobChange: { id: receipt.id, applicationNo: receipt.applicationNo, status: receipt.status } } : row)); setTotal(result.total);
  } catch (reason) { if (!c.signal.aborted && alive.current) setError(reason instanceof Error ? reason.message : "读取办理队列失败。"); }
  finally { if (!c.signal.aborted && alive.current) setLoading(false); }
 }, [page, keyword, receipt]);
 useEffect(() => { void load(); return () => queueRead.current?.abort(); }, [load]);
 useEffect(() => {
  if (!selected) return;
  const c = new AbortController(); optionRead.current?.abort(); optionRead.current = c; setOptions(null); setOptionsError("");
  void hrApi.jobChangeOptions(getAccessToken(), c.signal, false).then(value => { if (!c.signal.aborted && alive.current) setOptions(value); }).catch(reason => { if (!c.signal.aborted && alive.current) setOptionsError(reason instanceof Error ? reason.message : "读取组织岗位失败。"); });
  return () => c.abort();
 }, [selected, optionsRevision]);
 const positions = useMemo(() => options?.positions.filter(item => item.orgId === draft.afterOrgId) ?? [], [options, draft.afterOrgId]);
 const choose = (row: HrApprovedEmploymentRequest) => {
  if (frozen || selected || row.jobChange) return;
  setSelected(row); setDraft({ ...freshDraft(), employeeId: row.subjectEmployeeId, expectedApprovalVersion: row.version }); setWriteError("");
 };
 const execute = async (attempt: Attempt) => {
  if (!alive.current || lock.current || blocked || unresolved.current && unresolved.current !== attempt) return;
  lock.current = true; setBusy(true); setWriteError("");
  try {
   const result = await hrApi.createJobChangeFromApproval(attempt.sourceId, attempt.body, attempt.token, attempt.key);
   if (!alive.current) return;
   if (typeof result?.id !== "string" || !result.id.trim() || typeof result.applicationNo !== "string" || !result.applicationNo.trim() || !Number.isSafeInteger(result.version) || (result.version ?? 0) < 1 || result.status !== "draft" || result.sourceApprovalId !== attempt.sourceId || result.sourceApprovalVersion !== attempt.body.expectedApprovalVersion || result.employeeId !== attempt.body.employeeId || result.applicationName !== attempt.body.applicationName || result.applicationDate !== attempt.body.applicationDate || result.effectiveDate !== attempt.body.effectiveDate || result.changeType !== attempt.body.changeType || result.afterOrgId !== attempt.body.afterOrgId || (result.afterPositionId ?? undefined) !== attempt.body.afterPositionId || result.reason !== attempt.body.reason) throw new Error("办理回执无法核对，请按原请求重试。");
   queueRead.current?.abort(); setLoading(false); setReceipt(result); setRows(current => current.map(row => row.id === attempt.sourceId ? { ...row, jobChange: { id: result.id, applicationNo: result.applicationNo, status: result.status } } : row));
   unresolved.current = null; setRetry(null); setSelected(null); setDraft(freshDraft());
  } catch (reason) {
   if (!alive.current) return;
   setWriteError(reason instanceof Error ? reason.message : "创建办理单失败。");
   if (!(reason instanceof ApiError) || reason.status >= 500) { unresolved.current = attempt; setRetry(attempt); }
   else { unresolved.current = null; setRetry(null); }
  } finally { if (alive.current) { lock.current = false; setBusy(false); } }
 };
 const submit = (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault(); if (frozen || !selected || !options || !draft.afterOrgId || !draft.applicationName.trim() || !draft.reason.trim()) return;
  const body = { ...draft, applicationName: draft.applicationName.trim(), reason: draft.reason.trim() };
  void execute({ sourceId: selected.id, body, token: getAccessToken(), key: createIdempotencyKey("hr-approved-employment-draft") });
 };
 return <section className={`ds-panel ${local.panel}`} aria-label="已批准任职申请办理">
  <div className={styles.sectionHeading}><div><span className="ds-eyebrow">正式办理</span><h2>已批准任职申请</h2></div><button type="button" className="ds-button ds-button-secondary" disabled={frozen || !!selected || loading} onClick={() => void load()}>刷新办理队列</button></div>
  <p>审批通过后，由 HR 明确填写部门、岗位和日期，建立岗位变更办理单；完成岗位审批及生效后，员工任职才会更新。</p>
  {receipt ? <section className="ds-mobile-record" aria-label="任职办理回执"><strong>已建立办理单 {receipt.applicationNo}</strong><span>{statuses[receipt.status] ?? receipt.status} · 本次仅建立草稿，未执行任职变更</span><a className="ds-button ds-button-secondary" href="/hr/lifecycle#job-change-applications">继续岗位变更审批与生效</a></section> : null}
  <form className={styles.toolbar} onSubmit={event => { event.preventDefault(); if (frozen || selected) return; setPage(1); setKeyword(search.trim()); }}><label className="form-field"><span>查找已批准任职申请</span><input value={search} maxLength={100} disabled={frozen || !!selected} onChange={event => setSearch(event.target.value)} placeholder="申请编号、标题、姓名或员工编号"/></label><button className="ds-button ds-button-secondary" disabled={frozen || !!selected}>查询</button></form>
  {error ? <p role="alert">{error}</p> : null}{loading ? <p role="status">正在读取办理队列…</p> : null}
  <div className={styles.employeeRecordList}>{rows.map(row => <article className="ds-mobile-record" key={row.id}><strong>{row.title}</strong><span>{row.requestNo} · {row.employeeName}（{row.employeeCode}）</span><p>{row.description}</p>{row.jobChange ? <><span>办理单 {row.jobChange.applicationNo} · {statuses[row.jobChange.status] ?? row.jobChange.status}</span><a className="ds-button ds-button-secondary" href="/hr/lifecycle#job-change-applications">查看岗位变更</a></> : <button type="button" className="ds-button ds-button-primary" disabled={frozen || !!selected} onClick={() => choose(row)}>建立岗位变更办理单</button>}</article>)}</div>
  {!loading && !error && !rows.length ? <p>暂无已批准任职申请。</p> : null}
  <div className={styles.recordActions}><button type="button" className="ds-button" disabled={frozen || !!selected || loading || page === 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页 · 共 {total} 项</span><button type="button" className="ds-button" disabled={frozen || !!selected || loading || page * 20 >= total} onClick={() => setPage(value => value + 1)}>下一页</button></div>
  {selected ? <form onSubmit={submit}><fieldset disabled={frozen} className={`${styles.formGrid} ${local.fields}`}><legend>为 {selected.requestNo} 建立岗位变更</legend><p className={styles.sectionHeading}>员工：{selected.employeeName}（{selected.employeeCode}） · 原申请审批通过</p>
   {optionsError ? <><p role="alert">{optionsError}</p><button type="button" className="ds-button ds-button-secondary" onClick={() => setOptionsRevision(value => value + 1)}>重试读取组织岗位</button></> : !options ? <p role="status">正在读取组织岗位…</p> : null}
   <label className="form-field"><span>办理名称</span><input required maxLength={128} value={draft.applicationName} onChange={event => setDraft(value => ({ ...value, applicationName: event.target.value }))}/></label>
   <label className="form-field"><span>办理日期</span><input type="date" required value={draft.applicationDate} onChange={event => setDraft(value => ({ ...value, applicationDate: event.target.value }))}/></label>
   <label className="form-field"><span>生效日期</span><input type="date" required min={draft.applicationDate} value={draft.effectiveDate} onChange={event => setDraft(value => ({ ...value, effectiveDate: event.target.value }))}/></label>
   <label className="form-field"><span>变更类型</span><select value={draft.changeType} onChange={event => setDraft(value => ({ ...value, changeType: event.target.value }))}><option value="transfer">调动</option><option value="promotion">晋升</option><option value="demotion">降职</option><option value="rotation">轮岗</option><option value="organization_change">组织调整</option></select></label>
   <label className="form-field"><span>调整后组织</span><select required disabled={!options} value={draft.afterOrgId} onChange={event => setDraft(value => ({ ...value, afterOrgId: event.target.value, afterPositionId: undefined }))}><option value="">请选择组织</option>{options?.orgs.map(org => <option key={org.id} value={org.id}>{org.orgName}</option>)}</select></label>
   <label className="form-field"><span>调整后岗位</span><select disabled={!options || !draft.afterOrgId} value={draft.afterPositionId ?? ""} onChange={event => setDraft(value => ({ ...value, afterPositionId: event.target.value || undefined }))}><option value="">暂不分配岗位</option>{positions.map(position => <option key={position.id} value={position.id}>{position.positionName}（{position.positionCode}）</option>)}</select></label>
   <label className="form-field"><span>变更原因</span><textarea required maxLength={2000} value={draft.reason} onChange={event => setDraft(value => ({ ...value, reason: event.target.value }))}/></label>
   <div className={styles.formActions}><button className="ds-button ds-button-primary" disabled={!options || !!optionsError}>保存关联办理草稿</button><button type="button" className="ds-button" onClick={() => { setSelected(null); setWriteError(""); }}>取消办理</button></div>
  </fieldset></form> : null}
  {writeError ? <p role="alert">{writeError}</p> : null}{retry ? <button type="button" className="ds-button ds-button-secondary" disabled={busy || blocked} onClick={() => void execute(retry)}>按原请求重试建立办理单</button> : null}
 </section>;
}
