"use client";

import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { ApiError, createIdempotencyKey } from "../../../lib/api-client";
import { hrApi, type HrApprovedProfileBody, type HrApprovedProfileReceipt, type HrApprovedProfileRequest, type HrEmployeeProfile } from "../../../lib/hr-api";
import { buildProfileSaveBody, YuzhouBasicProfileFields } from "../employees/components/HrFixedProfileFields";
import styles from "../hr-workbench.module.css";
import local from "./approved-employment.module.css";

type Props = { blocked?: boolean; onBlockedChange?: (blocked: boolean) => void };
type Attempt = { sourceId: string; body: HrApprovedProfileBody; token: string; key: string };
function validProfile(value: HrEmployeeProfile | null, employeeId: string) {
 return value === null || typeof value.id === "string" && !!value.id && value.employeeId === employeeId && value.masked === false && Number.isInteger(value.version) && value.version >= 1;
}
function validReceipt(value: HrApprovedProfileReceipt, attempt: Attempt) {
 return !!value && value.sourceApprovalId === attempt.sourceId && value.sourceApprovalVersion === attempt.body.expectedApprovalVersion && value.employeeId === attempt.body.employeeId && value.beforeVersion === attempt.body.expectedVersion && value.afterVersion === attempt.body.expectedVersion + 1 && Array.isArray(value.fieldNames) && value.fieldNames.every(field => typeof field === "string") && value.profile !== null && validProfile(value.profile, attempt.body.employeeId) && value.profile.id === value.profileId && value.profile.version === value.afterVersion;
}

export function ApprovedProfileRequestsPanel(props: Props) {
 const user = useAuthUser();
 if (!hasPermission(user, H.HR_APPROVAL_PARK_REVIEW) || !hasPermission(user, H.HR_EMPLOYEE_PROFILE_MANAGE)) return null;
 return <ProfileContent {...props} key={JSON.stringify(user)}/>;
}

function ProfileContent({ blocked = false, onBlockedChange }: Props) {
 const [rows, setRows] = useState<HrApprovedProfileRequest[]>([]), [page, setPage] = useState(1), [total, setTotal] = useState(0);
 const [search, setSearch] = useState(""), [keyword, setKeyword] = useState(""), [loading, setLoading] = useState(false), [error, setError] = useState("");
 const [selected, setSelected] = useState<HrApprovedProfileRequest | null>(null), [profile, setProfile] = useState<HrEmployeeProfile | null>(null);
 const [profileReady, setProfileReady] = useState(false), [profileLoading, setProfileLoading] = useState(false), [profileError, setProfileError] = useState("");
 const [busy, setBusy] = useState(false), [retry, setRetry] = useState<Attempt | null>(null), [writeError, setWriteError] = useState(""), [conflict, setConflict] = useState(false);
 const [receipt, setReceipt] = useState<HrApprovedProfileReceipt | null>(null);
 const alive = useRef(true), lock = useRef(false), unresolved = useRef<Attempt | null>(null), queueRead = useRef<AbortController | null>(null), profileRead = useRef<AbortController | null>(null);
 const frozen = blocked || busy || !!retry;
 useEffect(() => { alive.current = true; return () => { alive.current = false; queueRead.current?.abort(); profileRead.current?.abort(); }; }, []);
 useEffect(() => { onBlockedChange?.(busy || !!retry || !!selected); return () => onBlockedChange?.(false); }, [busy, retry, selected, onBlockedChange]);
 const load = useCallback(async () => {
  const controller = new AbortController(); queueRead.current?.abort(); queueRead.current = controller; setLoading(true); setError("");
  try {
   const result = await hrApi.approvedProfileRequests(getAccessToken(), page, 20, keyword, controller.signal);
   if (controller.signal.aborted || !alive.current) return;
   if (result.page !== page || result.page_size !== 20 || !Number.isSafeInteger(result.total) || result.total < 0 || !Array.isArray(result.items)) throw new Error("档案办理队列读取结果无法核对，请重试。");
   if (page > Math.max(1, Math.ceil(result.total / 20))) { setPage(1); return; }
   setRows(result.items.map(row => receipt?.sourceApprovalId === row.id && !row.fulfillment ? { ...row, fulfillment: { profileId: receipt.profileId, beforeVersion: receipt.beforeVersion, afterVersion: receipt.afterVersion, fieldNames: receipt.fieldNames, fulfilledAt: "" } } : row)); setTotal(result.total);
  } catch (reason) { if (!controller.signal.aborted && alive.current) setError(reason instanceof Error ? reason.message : "读取档案办理队列失败。"); }
  finally { if (!controller.signal.aborted && alive.current) setLoading(false); }
 }, [page, keyword, receipt]);
 useEffect(() => { void load(); return () => queueRead.current?.abort(); }, [load]);
 const readProfile = useCallback(async (source: HrApprovedProfileRequest) => {
  const controller = new AbortController(); profileRead.current?.abort(); profileRead.current = controller; setProfileLoading(true); setProfileReady(false); setProfileError("");
  try {
   const result = await hrApi.profile(source.subjectEmployeeId, getAccessToken(), controller.signal);
   if (controller.signal.aborted || !alive.current) return;
   if (!validProfile(result, source.subjectEmployeeId)) throw new Error("当前档案响应无法核对，请重新读取。");
   setProfile(result); setProfileReady(true); setConflict(false); setWriteError("");
  } catch (reason) { if (!controller.signal.aborted && alive.current) setProfileError(reason instanceof Error ? reason.message : "读取当前档案失败。"); }
  finally { if (!controller.signal.aborted && alive.current) setProfileLoading(false); }
 }, []);
 const choose = (row: HrApprovedProfileRequest) => {
  if (frozen || lock.current || unresolved.current || selected || row.fulfillment) return;
  setSelected(row); setProfile(null); setWriteError(""); setConflict(false); void readProfile(row);
 };
 const execute = async (attempt: Attempt) => {
  if (!alive.current || lock.current || blocked || unresolved.current && unresolved.current !== attempt) return;
  lock.current = true; unresolved.current = attempt; setBusy(true); setWriteError("");
  try {
   const result = await hrApi.fulfillProfileApproval(attempt.sourceId, attempt.body, attempt.token, attempt.key);
   if (!alive.current) return;
   if (!validReceipt(result, attempt)) throw new Error("档案办理回执无法核对，请按原请求重试。");
   queueRead.current?.abort(); setLoading(false); setReceipt(result); setRows(current => current.map(row => row.id === attempt.sourceId ? { ...row, fulfillment: { profileId: result.profileId, beforeVersion: result.beforeVersion, afterVersion: result.afterVersion, fieldNames: result.fieldNames, fulfilledAt: "" } } : row));
   unresolved.current = null; setRetry(null); setSelected(null); setProfile(null); setProfileReady(false); setConflict(false);
  } catch (reason) {
   if (!alive.current) return;
   const processing = reason instanceof ApiError && reason.status === 409 && reason.message === "The same idempotency key is still processing";
   setWriteError(reason instanceof Error ? reason.message : "办理档案变更失败。");
   if (!(reason instanceof ApiError) || processing || ![400, 403, 404, 409, 422].includes(reason.status)) { setRetry(attempt); }
   else { unresolved.current = null; setRetry(null); if (reason.status === 409) setConflict(true); }
  } finally { if (alive.current) { lock.current = false; setBusy(false); } }
 };
 const submit = (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault(); if (frozen || lock.current || unresolved.current || conflict || !selected || !profileReady || profileLoading) return;
  const body = { ...buildProfileSaveBody(new FormData(event.currentTarget), profile?.version ?? 0), employeeId: selected.subjectEmployeeId, expectedApprovalVersion: selected.version };
  void execute({ sourceId: selected.id, body, token: getAccessToken(), key: createIdempotencyKey("hr-approved-profile") });
 };
 return <section className={`ds-panel ${local.panel}`} aria-label="已批准档案申请办理">
  <div className={styles.sectionHeading}><div><span className="ds-eyebrow">正式办理</span><h2>已批准档案申请</h2></div><button type="button" className="ds-button ds-button-secondary" disabled={frozen || !!selected || loading} onClick={() => void load()}>刷新档案办理队列</button></div>
  <p>核对申请说明及当前档案，由 HR 明确填写需要维护的正式字段。保存后档案更新，并记录本次申请的办理结果。</p>
  {receipt ? <section className="ds-mobile-record" aria-label="档案办理回执"><strong>档案变更已办理</strong><span>申请已关联正式档案，档案版本 {receipt.beforeVersion} → {receipt.afterVersion}</span><a className="ds-button ds-button-secondary" href={`/hr/employees?employee_id=${encodeURIComponent(receipt.employeeId)}`}>查看正式员工档案</a></section> : null}
  <form className={styles.toolbar} onSubmit={event => { event.preventDefault(); if (frozen || selected || unresolved.current) return; setPage(1); setKeyword(search.trim()); }}><label className="form-field"><span>查找已批准档案申请</span><input value={search} maxLength={100} disabled={frozen || !!selected} onChange={event => setSearch(event.target.value)} placeholder="申请编号、标题、姓名或员工编号"/></label><button className="ds-button ds-button-secondary" disabled={frozen || !!selected}>查询档案申请</button></form>
  {error ? <p role="alert">{error}</p> : null}{loading ? <p role="status">正在读取档案办理队列…</p> : null}
  <div className={styles.employeeRecordList}>{rows.map(row => <article className="ds-mobile-record" key={row.id}><strong>{row.title}</strong><span>{row.requestNo} · {row.employeeName}（{row.employeeCode}）</span><p>{row.description}</p>{row.fulfillment ? <><span>档案变更已办理 · 正式档案版本 {row.fulfillment.afterVersion}</span><a className="ds-button ds-button-secondary" href={`/hr/employees?employee_id=${encodeURIComponent(row.subjectEmployeeId)}`}>查看员工档案</a></> : <button type="button" className="ds-button ds-button-primary" disabled={frozen || !!selected} onClick={() => choose(row)}>办理档案变更</button>}</article>)}</div>
  {!loading && !error && !rows.length ? <p>暂无已批准档案申请。</p> : null}
  <div className={styles.recordActions}><button type="button" className="ds-button" disabled={frozen || !!selected || loading || page === 1} onClick={() => setPage(value => value - 1)}>档案申请上一页</button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页 · 共 {total} 项</span><button type="button" className="ds-button" disabled={frozen || !!selected || loading || page * 20 >= total} onClick={() => setPage(value => value + 1)}>档案申请下一页</button></div>
  {selected ? <section aria-label="档案变更办理表单"><h3>{selected.employeeName} · {selected.requestNo}</h3><p>原申请说明：{selected.description}</p>
   {profileLoading ? <p role="status">正在读取当前正式档案…</p> : null}
   {profileError ? <><p role="alert">{profileError}</p><button type="button" className="ds-button" disabled={frozen || profileLoading} onClick={() => void readProfile(selected)}>重试读取当前档案</button></> : null}
   {profileReady ? <form key={`${selected.id}:${profile?.id ?? "new"}:${profile?.version ?? 0}`} onSubmit={submit}><p>请核对完整字段；清空字段会清除原值。</p><fieldset disabled={frozen} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, width: "100%" }}><legend>维护正式档案</legend><YuzhouBasicProfileFields profile={profile}/><div className={styles.formActions}><button className="ds-button ds-button-primary" disabled={conflict || profileLoading}>保存档案并完成办理</button><button type="button" className="ds-button" onClick={() => { profileRead.current?.abort(); setSelected(null); setProfile(null); setProfileReady(false); setWriteError(""); }}>取消档案办理</button></div></fieldset></form> : <button type="button" className="ds-button" disabled={frozen} onClick={() => { profileRead.current?.abort(); setSelected(null); setProfileLoading(false); setProfileError(""); }}>取消档案办理</button>}
   {conflict ? <><p role="alert">当前档案或申请已变化，编辑内容已保留。请先核对或复制修改内容，再重新读取最新档案；原申请版本变化时须取消并刷新队列。</p><button type="button" className="ds-button" disabled={frozen || profileLoading} onClick={() => void readProfile(selected)}>重新读取最新档案</button></> : null}
  </section> : null}
  {writeError ? <p role="alert">{writeError}</p> : null}{retry ? <button type="button" className="ds-button ds-button-secondary" disabled={busy || blocked} onClick={() => void execute(retry)}>按原请求重试档案办理</button> : null}
 </section>;
}
