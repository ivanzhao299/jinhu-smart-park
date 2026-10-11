"use client";
import { useEffect, useRef, useState } from "react";
import { hrApi, type HrAttendanceRequest, type HrBusinessTripDeclaredDaysHistory } from "../../../lib/hr-api";
import { getAccessToken } from "../../../lib/authz";
import { ApiError } from "../../../lib/api-client";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";
import local from "./request-workflow.module.css";

type Receipt = { id: string; declaredDays: number | null; amendVersion: number };
type Draft = { version: number; days: string; reason: string; token: string | undefined };
type Attempt = { body: { declaredDays: number | null; expectedVersion: number; reason: string }; key: string; token: string | undefined };
const daysLabel = (days: number | null) => days === null ? "未申报" : `${days} 天`;

export function BusinessTripDeclaredDaysPanel({ row, busy, onBusyChange, onSaved }: {
  row: HrAttendanceRequest;
  busy: boolean;
  onBusyChange: (value: boolean) => void;
  onSaved: (receipt: Receipt) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [writing, setWriting] = useState(false), [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [history, setHistory] = useState<HrBusinessTripDeclaredDaysHistory[] | null>(null);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [reading, setReading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const mounted = useRef(true), flight = useRef(false), ownsBusy = useRef(false);
  const attempt = useRef<Attempt | null>(null), readGeneration = useRef(0), controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readGeneration.current++;
      controller.current?.abort();
      if (ownsBusy.current) { ownsBusy.current = false; onBusyChange(false); }
    };
  }, [onBusyChange]);

  const readHistory = async (nextPage: number) => {
    controller.current?.abort();
    const request = new AbortController(), owner = ++readGeneration.current, token = getAccessToken();
    controller.current = request;
    setReading(true); setHistory(null); setHistoryError("");
    try {
      const result = await hrApi.businessTripDeclaredDaysHistory(row.id, token, nextPage, 20, request.signal);
      if (!mounted.current || request.signal.aborted || owner !== readGeneration.current || token !== getAccessToken()) return;
      if (!Number.isSafeInteger(result.total) || result.total < 0 || result.page !== nextPage || result.page_size !== 20 || !Array.isArray(result.items) || result.items.length > 20 || result.items.some(item => !item || typeof item.id !== "string" || !Number.isInteger(item.requestVersion) || item.requestVersion < 2 || (item.declaredDays !== null && !Number.isInteger(item.declaredDays)) || (item.beforeDeclaredDays !== null && !Number.isInteger(item.beforeDeclaredDays)) || typeof item.reason !== "string" || !Number.isFinite(Date.parse(item.createdAt)))) throw new Error("出差更正历史返回不完整，请重试。");
      setPage(nextPage); setTotal(result.total); setHistory(result.items);
    } catch (cause) {
      if (mounted.current && !request.signal.aborted && owner === readGeneration.current && token === getAccessToken()) setHistoryError(hrLoadErrorMessage(cause, "读取更正历史失败"));
    } finally { if (mounted.current && owner === readGeneration.current) setReading(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || flight.current || !draft) return;
    if (draft.token !== getAccessToken() || draft.version !== row.amendVersion) { setError("当前身份或出差版本已变化，请刷新申请后重新核对。"); return; }
    const value = draft.days.trim() === "" ? null : Number(draft.days);
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)) { setError("申报天数应为非负整数，留空表示未申报。"); return; }
    if (!draft.reason.trim()) { setError("请填写更正原因。"); return; }
    const current = attempt.current ?? { body: { declaredDays: value, expectedVersion: draft.version, reason: draft.reason.trim() }, key: crypto.randomUUID(), token: draft.token };
    attempt.current = current;
    flight.current = true; ownsBusy.current = true; onBusyChange(true); setWriting(true); setError(""); setMessage("");
    try {
      const receipt = await hrApi.amendBusinessTripDeclaredDays(row.id, current.body, current.token, current.key);
      if (!mounted.current) return;
      if (current.token !== getAccessToken()) { setUncertain(true); setError("身份范围已变化，请回到原范围核对办理结果。"); return; }
      if (receipt.id !== row.id || receipt.amendVersion !== current.body.expectedVersion + 1 || receipt.declaredDays !== current.body.declaredDays) throw new Error("更正回执不匹配，请使用原请求重试核对。");
      attempt.current = null; setUncertain(false); setDraft(null);
      setHistory(null); setReading(false); controller.current?.abort(); readGeneration.current++;
      setMessage("出差申报天数已更正。请重算涉及日期，再核对月结；已封账月份通过更正批次接续。");
      try { await onSaved(receipt); } catch (cause) {
        if (mounted.current && current.token === getAccessToken()) setError(hrLoadErrorMessage(cause, "刷新期间失败；更正已保存，请勿重复办理。"));
      }
    } catch (cause) {
      if (!mounted.current) return;
      if (current.token !== getAccessToken()) { setUncertain(true); setError("身份范围已变化，请回到原范围核对办理结果。"); return; }
      const definite = cause instanceof ApiError && [400, 403, 404, 422].includes(cause.status);
      if (definite) attempt.current = null;
      setUncertain(!definite);
      setError(hrLoadErrorMessage(cause, "更正结果尚未确认，请保留原内容重试。"));
    } finally {
      flight.current = false;
      if (ownsBusy.current) { ownsBusy.current = false; onBusyChange(false); }
      if (mounted.current) setWriting(false);
    }
  };

  if (row.requestType !== "business_trip" || row.status !== "approved" || !Number.isSafeInteger(row.amendVersion) || Number(row.amendVersion) < 1) return null;
  const locked = busy || writing;
  return <section className={local.recalculation} aria-label={`出差 ${row.requestNo} 的申报天数维护`}>
    <div className={styles.actionRow}>
      <button type="button" className="ds-button ds-button-secondary" disabled={locked || Boolean(draft)} onClick={() => { attempt.current = null; setUncertain(false); setError(""); setDraft({ version: row.amendVersion!, days: row.declaredDays == null ? "" : String(row.declaredDays), reason: "", token: getAccessToken() }); }}>更正申报天数</button>
      <button type="button" className="ds-button ds-button-secondary" disabled={locked || reading} onClick={() => void readHistory(1)}>查看更正历史</button>
    </div>
    {draft ? <form className={`ds-panel ${local.recalculationPlan}`} aria-label="更正出差申报天数" onSubmit={event => void save(event)}>
      <strong>{row.requestNo} · 当前申报 {daysLabel(row.declaredDays ?? null)}</strong>
      <label className="form-field"><span>申报天数</span><input type="number" min="0" max="2147483647" step="1" inputMode="numeric" onFocus={event => event.currentTarget.select()} placeholder="留空表示未申报" disabled={locked || uncertain} value={draft.days} onChange={event => setDraft({ ...draft, days: event.target.value })} /></label>
      <label className="form-field"><span>更正原因</span><textarea required maxLength={1000} disabled={locked || uncertain} value={draft.reason} onChange={event => setDraft({ ...draft, reason: event.target.value })} /></label>
      {uncertain ? <p role="status">上次办理结果待确认，重试将沿用原内容和原请求编号。</p> : null}
      <div className={styles.actionRow}><button type="submit" className="ds-button ds-button-primary" disabled={locked}>{writing ? "正在保存…" : uncertain ? "重试核对更正" : "保存更正"}</button><button type="button" className="ds-button ds-button-secondary" disabled={locked || uncertain} onClick={() => { setDraft(null); setError(""); }}>取消更正</button></div>
    </form> : null}
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert" className="form-error">{error}</p> : null}
    {reading ? <p role="status">正在加载更正历史…</p> : null}
    {historyError ? <p role="alert" className="form-error">{historyError}</p> : null}
    {history !== null ? <div className={`ds-mobile-record-list ${local.records}`}>
      {history.length ? history.map(item => <article key={item.id} className="ds-mobile-record"><strong>更正版本 {item.requestVersion}</strong><span>{daysLabel(item.beforeDeclaredDays)} → {daysLabel(item.declaredDays)}</span><span>{item.reason}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></article>) : <p>暂无更正历史。</p>}
      <nav className={`${styles.actionRow} ${local.pagination}`} aria-label="出差更正历史分页"><button type="button" className="ds-button ds-button-secondary" disabled={locked || reading || page <= 1} onClick={() => void readHistory(page - 1)}>更正历史上一页</button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页 · 共 {total} 条</span><button type="button" className="ds-button ds-button-secondary" disabled={locked || reading || page * 20 >= total} onClick={() => void readHistory(page + 1)}>更正历史下一页</button></nav>
    </div> : null}
  </section>;
}
