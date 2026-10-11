"use client";
import { useEffect, useRef, useState } from "react";
import { createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrRequisitionDetail, type HrRequisitionHistory, type HrRequisitionReference, type HrRequisitionReferenceKind, type SaveHrRequisitionInput } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import { rebaseRequisitionDraft, requisitionChanges, requisitionDraft, requisitionStatusChoices, requisitionStatusLabels, type RequisitionDraft } from "./requisition-draft";
import styles from "./recruitment.module.css";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const date = (value: unknown) => typeof value === "string" && value.slice(0, 4) !== "0000" && /^\d{4}-\d\d-\d\d$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function projectRequisition(value: unknown, id: string): HrRequisitionDetail {
  if (!record(value) || value.id !== id || !Number.isSafeInteger(value.version) || Number(value.version) < 1
    || !Number.isSafeInteger(value.headcount) || Number(value.headcount) < 1 || !Number.isSafeInteger(value.hiredCount)
    || Number(value.hiredCount) < 0 || Number(value.hiredCount) > Number(value.headcount)
    || !Object.hasOwn(requisitionStatusLabels, String(value.status))) throw Error("招聘需求响应无效，请重新读取。");
  for (const field of ["requisitionCode", "title", "orgId", "orgName", "ownerUserId"]) if (typeof value[field] !== "string" || !value[field]) throw Error("招聘需求缺少业务字段。");
  for (const field of ["positionId", "positionName", "ownerName", "approvalNote"]) if (value[field] !== null && typeof value[field] !== "string") throw Error("招聘需求字段无效。");
  if (value.plannedOnboardDate !== null && !date(value.plannedOnboardDate)) throw Error("招聘计划日期无效。");
  return { id, requisitionCode: value.requisitionCode as string, title: value.title as string, orgId: value.orgId as string,
    orgName: value.orgName as string, ownerUserId: value.ownerUserId as string, ownerName: value.ownerName as string | null,
    positionId: value.positionId as string | null, positionName: value.positionName as string | null,
    plannedOnboardDate: value.plannedOnboardDate as string | null, approvalNote: value.approvalNote as string | null,
    headcount: Number(value.headcount), hiredCount: Number(value.hiredCount), version: Number(value.version), status: value.status as HrRequisitionDetail["status"] };
}
function pageShape(value: unknown, page: number, size: number): asserts value is { items: unknown[]; total: number; page: number; page_size: number } {
  if (!record(value) || !Array.isArray(value.items) || value.page !== page || value.page_size !== size || !Number.isSafeInteger(value.total)
    || Number(value.total) < 0 || value.items.length > size || value.items.length > Number(value.total)) throw Error("招聘需求分页响应无效。");
}
function Snapshot({ row }: { row: HrRequisitionDetail }) {
  return <dl className={styles.requisitionSnapshot}>
    <dt>编号与标题</dt><dd>{row.requisitionCode} · {row.title}</dd>
    <dt>部门与岗位</dt><dd>{row.orgName} · {row.positionName ?? "未关联标准岗位"}</dd>
    <dt>负责人</dt><dd>{row.ownerName ?? "未显示姓名"}</dd>
    <dt>招聘人数</dt><dd>计划 {row.headcount} 人 · 已录用 {row.hiredCount} 人</dd>
    <dt>计划到岗</dt><dd>{row.plannedOnboardDate ?? "未指定"}</dd>
    <dt>状态</dt><dd>{requisitionStatusLabels[row.status]}</dd>
    <dt>说明</dt><dd>{row.approvalNote ?? "未填写"}</dd>
  </dl>;
}
function ReferencePicker({ id, kind, orgId, disabled, onChoose }: { id: string; kind: HrRequisitionReferenceKind; orgId?: string; disabled: boolean; onChoose: (row: HrRequisitionReference) => void }) {
  const label = { organization: "部门", position: "标准岗位", owner: "负责人" }[kind];
  const [keyword, setKeyword] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState<HrRequisitionReference[]>([]), [total, setTotal] = useState(0), [loading, setLoading] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setRows([]); setError("");
    void hrApi.recruitmentRequisitionReferences(id, kind, getAccessToken(), page, query, orgId, controller.signal).then(result => {
      if (controller.signal.aborted) return; pageShape(result, page, 20);
      const items = result.items.map(item => { if (!record(item) || typeof item.id !== "string" || !item.id || typeof item.label !== "string" || !item.label || (kind === "position" && item.orgId !== orgId)) throw Error("招聘选项无效。"); return { id: item.id, label: item.label, ...(typeof item.orgId === "string" ? { orgId: item.orgId } : {}) }; });
      if (new Set(items.map(item => item.id)).size !== items.length) throw Error("招聘选项重复，请重试。"); setRows(items); setTotal(result.total);
    }).catch(cause => { if (!controller.signal.aborted) setError(hrLoadErrorMessage(cause, `读取${label}选项失败`)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, kind, orgId, page, query, refresh, label]);
  return <section className={styles.requisitionWorkspace} aria-label={`${label}选择`}>
    <div className={styles.profileActions}><label className="form-field"><span>搜索{label}</span><input type="search" maxLength={100} value={keyword} disabled={disabled} onChange={event => setKeyword(event.target.value)} /></label><button className="ds-button" type="button" disabled={disabled || loading} onClick={() => { setQuery(keyword.trim()); setPage(1); setRefresh(value => value + 1); }}>查询{label}</button></div>
    {loading ? <p role="status">正在读取{label}…</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className={styles.historyRecords}>{rows.map(row => <button className="ds-button ds-button-secondary" type="button" disabled={disabled} key={row.id} onClick={() => onChoose(row)}>{row.label}</button>)}</div>
    {!loading && !error && !rows.length ? <p>没有匹配的{label}。</p> : null}
    <nav className={styles.profileActions} aria-label={`${label}选项分页`}><button className="ds-button" type="button" disabled={disabled || loading || page <= 1} onClick={() => setPage(value => value - 1)}>{label}上一页</button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页</span><button className="ds-button" type="button" disabled={disabled || loading || page * 20 >= total} onClick={() => setPage(value => value + 1)}>{label}下一页</button>{error ? <button className="ds-button" type="button" disabled={disabled} onClick={() => setRefresh(value => value + 1)}>重读{label}选项</button> : null}</nav>
  </section>;
}

export function RequisitionOperations({ requisitionId, canManage, disabled, onBusyChange, onSaved }: {
  requisitionId: string; canManage: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void; onSaved: (row: HrRequisitionDetail) => void;
}) {
  const [base, setBase] = useState<HrRequisitionDetail | null>(null), [draft, setDraft] = useState<RequisitionDraft | null>(null), [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState<HrRequisitionDetail | null>(null), [conflictPending, setConflictPending] = useState(false), [uncertain, setUncertain] = useState(false);
  const [picker, setPicker] = useState<HrRequisitionReferenceKind | null>(null), [chosen, setChosen] = useState<Partial<Record<HrRequisitionReferenceKind, HrRequisitionReference>>>({});
  const [history, setHistory] = useState<HrRequisitionHistory[]>([]), [historyPage, setHistoryPage] = useState(1), [historyTotal, setHistoryTotal] = useState(0), [historyError, setHistoryError] = useState(""), [historyLoading, setHistoryLoading] = useState(false);
  const alive = useRef(true), lock = useRef(false), reads = useRef<Partial<Record<"current" | "history" | "conflict", AbortController>>>({});
  const attempt = useRef<{ body: SaveHrRequisitionInput; key: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; Object.values(reads.current).forEach(controller => controller?.abort()); }; }, []);
  const begin = (kind: "current" | "history" | "conflict") => { reads.current[kind]?.abort(); const controller = new AbortController(); reads.current[kind] = controller; return controller; };
  const valid = (kind: "current" | "history" | "conflict", controller: AbortController) => alive.current && !controller.signal.aborted && reads.current[kind] === controller;
  async function readCurrent() {
    if (lock.current || uncertain) return; const controller = begin("current"); setLoading(true); setError("");
    try { const row = projectRequisition(await hrApi.recruitmentRequisition(requisitionId, getAccessToken(), controller.signal), requisitionId); if (valid("current", controller)) { setBase(row); setDraft(requisitionDraft(row)); } }
    catch (cause) { if (valid("current", controller)) setError(hrLoadErrorMessage(cause, "读取招聘需求失败")); }
    finally { if (valid("current", controller)) setLoading(false); }
  }
  useEffect(() => { void readCurrent(); return () => reads.current.current?.abort(); }, [requisitionId]);
  async function readHistory(page = 1) {
    const controller = begin("history"); setHistoryLoading(true); setHistoryError(""); setHistory([]);
    try {
      const result = await hrApi.recruitmentRequisitionHistory(requisitionId, getAccessToken(), page, controller.signal); if (!valid("history", controller)) return; pageShape(result, page, 10);
      const rows = result.items.map(item => { if (!record(item) || typeof item.id !== "string" || typeof item.changeReason !== "string" || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt)) || (item.actorName !== null && typeof item.actorName !== "string")) throw Error("招聘需求历史响应无效。"); const before = projectRequisition(item.before, requisitionId), after = projectRequisition(item.after, requisitionId); if (item.version !== after.version || after.version !== before.version + 1) throw Error("招聘需求历史版本无效。"); return { id: item.id, version: after.version, changeReason: item.changeReason, createdAt: item.createdAt, actorName: item.actorName as string | null, before, after }; });
      setHistory(rows); setHistoryTotal(result.total); setHistoryPage(page);
    } catch (cause) { if (valid("history", controller)) setHistoryError(hrLoadErrorMessage(cause, "读取招聘需求历史失败")); }
    finally { if (valid("history", controller)) setHistoryLoading(false); }
  }
  async function readConflict() {
    const controller = begin("conflict"); setConflict(null);
    try { const row = projectRequisition(await hrApi.recruitmentRequisition(requisitionId, getAccessToken(), controller.signal), requisitionId); if (valid("conflict", controller)) setConflict(row); }
    catch (cause) { if (valid("conflict", controller)) setError(hrLoadErrorMessage(cause, "读取最新需求失败，草稿已保留。")); }
  }
  async function save() {
    if (lock.current || disabled || !canManage || !base || !draft || conflictPending) return;
    let body: SaveHrRequisitionInput;
    try { const changes = requisitionChanges(base, draft); if (!reason.trim()) throw Error("请填写变更理由。"); if (!Object.keys(changes).length) throw Error("请先修改需要办理的资料或状态。"); body = { expectedVersion: base.version, changeReason: reason.trim(), ...changes }; }
    catch (cause) { setError(hrLoadErrorMessage(cause, "请核对需求输入。")); return; }
    if (!attempt.current) attempt.current = { body, key: createIdempotencyKey("hr-requisition-maintain") };
    const current = attempt.current; lock.current = true; setSaving(true); onBusyChange(true); setError(""); setNotice(""); let keepLocked = false;
    try {
      const row = projectRequisition(await hrApi.saveRecruitmentRequisition(requisitionId, current.body, getAccessToken(), current.key), requisitionId);
      if (!alive.current) return;
      if (row.version !== current.body.expectedVersion + 1 || row.hiredCount !== base.hiredCount) throw Error("需求保存回执版本或录用人数不一致，请使用原请求重试。");
      for (const [field, value] of Object.entries(requisitionChanges(base, draft))) if (row[field as keyof HrRequisitionDetail] !== value) throw Error("需求保存回执与提交资料不一致。");
      reads.current.current?.abort(); reads.current.history?.abort(); setHistory([]); setHistoryTotal(0); onSaved(row); setBase(row); setDraft(requisitionDraft(row)); setReason(""); setEditing(false); setPicker(null); setChosen({}); attempt.current = null; setUncertain(false); setNotice(`招聘需求已保存，版本 ${row.version}。`);
    } catch (cause) {
      if (!alive.current) return; setError(hrLoadErrorMessage(cause, "保存失败或回执未知，草稿和原请求已保留。"));
      const status = record(cause) ? cause.status ?? cause.statusCode : undefined;
      if (status === 409 && record(cause) && cause.message === "HR_REQUISITION_VERSION_CONFLICT") { attempt.current = null; setUncertain(false); setConflictPending(true); await readConflict(); }
      else if (status === 409 && record(cause) && cause.message === "HR_REQUISITION_CODE_CONFLICT") { attempt.current = null; setUncertain(false); setError("需求编号已被使用，请更换编号后保存。"); }
      else if (status === 409 && record(cause) && ["HR_REQUISITION_STATE_CONFLICT", "HR_REQUISITION_HEADCOUNT_CONFLICT", "HR_REQUISITION_HIRED_REFERENCE_CONFLICT"].includes(String(cause.message))) { attempt.current = null; setUncertain(false); setError("当前状态、已录用人数或部门岗位关系不允许此项变更，请调整草稿后保存。"); }
      else if ([400, 403, 404, 422].includes(Number(status))) { attempt.current = null; setUncertain(false); }
      else { keepLocked = true; setUncertain(true); }
    } finally { lock.current = false; if (alive.current) { setSaving(false); onBusyChange(keepLocked); } }
  }
  const locked = disabled || saving, fieldsLocked = locked || uncertain || conflictPending;
  const choose = (kind: HrRequisitionReferenceKind, row: HrRequisitionReference) => { if (fieldsLocked) return; setDraft(value => {
    if (!value) return value;
    if (kind === "organization") return { ...value, orgId: row.id, ...(value.orgId === row.id ? {} : { positionId: "" }) };
    return { ...value, [kind === "position" ? "positionId" : "ownerUserId"]: row.id };
  }); setChosen(value => kind === "organization" && draft?.orgId !== row.id ? { ...value, organization: row, position: undefined } : { ...value, [kind]: row }); setPicker(null); };
  return <section className={`ds-panel ${styles.requisitionWorkspace}`} aria-label="招聘需求办理">
    <h2>招聘需求办理</h2>{loading ? <p role="status">正在读取需求…</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {!base && !loading ? <button className="ds-button" type="button" disabled={locked} onClick={() => void readCurrent()}>重读招聘需求</button> : null}
    {base && draft ? <><p>版本 {base.version} · 已录用 {base.hiredCount} 人</p><Snapshot row={base} />
      {canManage && base.status !== "cancelled" && !editing ? <button className="ds-button" type="button" disabled={locked} onClick={() => setEditing(true)}>修改需求或办理状态</button> : null}
      {editing ? <form aria-label="修改招聘需求" className={styles.profileForm} onSubmit={event => { event.preventDefault(); void save(); }}>
        {([ ["requisitionCode", "需求编号", 64], ["title", "需求标题", 160] ] as const).map(([field, label, max]) => <label className="form-field" key={field}><span>{label}</span><input required maxLength={max} disabled={fieldsLocked} value={draft[field]} onChange={event => setDraft(value => value ? { ...value, [field]: event.target.value } : value)} /></label>)}
        <label className="form-field"><span>计划招聘人数</span><input type="number" min={Math.max(1, base.hiredCount)} max="1000" step="1" required disabled={fieldsLocked} value={draft.headcount} onFocus={event => event.target.select()} onChange={event => setDraft(value => value ? { ...value, headcount: event.target.value } : value)} /></label>
        <label className="form-field"><span>计划到岗日</span><input type="date" min="1900-01-01" max="2100-12-31" disabled={fieldsLocked} value={draft.plannedOnboardDate} onChange={event => setDraft(value => value ? { ...value, plannedOnboardDate: event.target.value } : value)} /></label>
        <label className="form-field"><span>办理后状态</span><select disabled={fieldsLocked} value={draft.status} onChange={event => setDraft(value => value ? { ...value, status: event.target.value as RequisitionDraft["status"] } : value)}>{requisitionStatusChoices(base.status, base.hiredCount, Number(draft.headcount)).map(status => <option key={status} value={status}>{requisitionStatusLabels[status]}</option>)}</select></label>
        <label className="form-field"><span>需求说明</span><textarea maxLength={1000} disabled={fieldsLocked} value={draft.approvalNote} onChange={event => setDraft(value => value ? { ...value, approvalNote: event.target.value } : value)} /></label>
        <div className={`${styles.profileActions} ${styles.requisitionFullRow}`}>{(["organization", "position", "owner"] as const).map(kind => <div className={styles.requisitionReference} key={kind}><span>{kind === "organization" ? "部门" : kind === "position" ? "标准岗位" : "负责人"}：{chosen[kind]?.label ?? (kind === "organization" ? base.orgName : kind === "position" ? (draft.positionId ? base.positionName ?? "未显示名称" : "不关联") : base.ownerName ?? "未显示姓名")}</span><button className="ds-button" type="button" disabled={fieldsLocked || (kind !== "owner" && base.hiredCount > 0)} onClick={() => setPicker(value => value === kind ? null : kind)}>更换{kind === "organization" ? "部门" : kind === "position" ? "标准岗位" : "负责人"}</button>{kind === "position" ? <button className="ds-button" type="button" disabled={fieldsLocked || base.hiredCount > 0} onClick={() => { setDraft(value => value ? { ...value, positionId: "" } : value); setChosen(value => ({ ...value, position: undefined })); }}>取消岗位关联</button> : null}</div>)}</div>
        {base.hiredCount > 0 ? <p>已有录用事实，保留部门和岗位关联；计划人数不能低于已录用人数。</p> : null}
        {picker ? <div className={styles.requisitionFullRow}><ReferencePicker key={`${picker}:${picker === "position" ? draft.orgId : ""}`} id={requisitionId} kind={picker} orgId={picker === "position" ? draft.orgId : undefined} disabled={fieldsLocked} onChoose={row => choose(picker, row)} /></div> : null}
        <label className={`form-field ${styles.requisitionFullRow}`}><span>变更理由</span><textarea maxLength={1000} required value={reason} disabled={fieldsLocked} onChange={event => setReason(event.target.value)} /></label>
        <div className={styles.profileActions}><button className="ds-button ds-button-primary" disabled={locked || conflictPending || !reason.trim()}>{uncertain ? "使用原请求重试保存" : "保存需求变更"}</button><button className="ds-button" type="button" disabled={fieldsLocked} onClick={() => { setDraft(requisitionDraft(base)); setReason(""); setChosen({}); setPicker(null); setEditing(false); attempt.current = null; }}>取消编辑</button></div>
      </form> : null}
      {conflictPending ? <section className={styles.requisitionWorkspace} aria-label="需求冲突比较"><h3>需求已被其他操作更新，草稿已保留</h3>{conflict ? <><p>服务器版本 {conflict.version}</p><Snapshot row={conflict} /><p>本地草稿：{draft.title} · 计划 {draft.headcount} 人 · {requisitionStatusLabels[draft.status]}</p><button className="ds-button" type="button" disabled={locked || conflict.status === "cancelled"} onClick={() => { try { setDraft(rebaseRequisitionDraft(base, draft, conflict)); setBase(conflict); setConflict(null); setConflictPending(false); setChosen({}); setPicker(null); setError(""); } catch (cause) { setError(hrLoadErrorMessage(cause, "请核对草稿。")); } }}>确认以草稿更新</button></> : null}<button className="ds-button" type="button" disabled={locked} onClick={() => void readConflict()}>重读冲突需求</button></section> : null}
    </> : null}
    <section className={styles.requisitionWorkspace} aria-label="招聘需求变更历史"><h3>需求变更历史</h3><button className="ds-button" type="button" disabled={locked || historyLoading} onClick={() => void readHistory(1)}>读取需求历史</button>{historyError ? <p className="form-error" role="alert">{historyError}</p> : null}{historyLoading ? <p role="status">正在读取历史…</p> : null}
      <div className={styles.historyRecords}>{history.map(row => <article className="ds-mobile-record" key={row.id}><strong>版本 {row.before.version} → {row.version}</strong><p>{row.actorName ?? "办理人姓名未返回"} · {row.createdAt} · {row.changeReason}</p><details><summary>查看变更前后资料</summary><h4>变更前</h4><Snapshot row={row.before} /><h4>变更后</h4><Snapshot row={row.after} /></details></article>)}</div>
      {historyTotal > 10 ? <nav className={styles.profileActions} aria-label="招聘需求历史分页"><button className="ds-button" type="button" disabled={locked || historyLoading || historyPage <= 1} onClick={() => void readHistory(historyPage - 1)}>需求历史上一页</button><span>第 {historyPage} / {Math.ceil(historyTotal / 10)} 页</span><button className="ds-button" type="button" disabled={locked || historyLoading || historyPage * 10 >= historyTotal} onClick={() => void readHistory(historyPage + 1)}>需求历史下一页</button></nav> : null}
    </section>
  </section>;
}
