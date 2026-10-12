"use client";
import { useEffect, useRef, useState } from "react";
import { hrApi, type HrAttendanceRequest, type HrBusinessTripDatesHistory, type HrBusinessTripDatesReceipt } from "../../../lib/hr-api";
import { getAccessToken } from "../../../lib/authz";
import { ApiError } from "../../../lib/api-client";
import { hrLoadErrorMessage } from "../hr-errors";
import { tripDateInput, tripDateInstant, tripDateLabel, tripDateWindow, tripEndBound } from "./business-trip-date-input";
import styles from "../hr-workbench.module.css";
import local from "./request-workflow.module.css";

type Draft = { version: number; start: string; end: string; reason: string; token: string | undefined };
type Attempt = { body: { startAt: string; endAt: string; expectedVersion: number; reason: string }; key: string; token: string | undefined };
const validHistory = (item: HrBusinessTripDatesHistory) => item && typeof item.id === "string" && Number.isSafeInteger(item.requestVersion) && item.requestVersion >= 2
  && [item.beforeStartAt, item.beforeEndAt].every(value => value === null || typeof value === "string" && Number.isFinite(Date.parse(value)))
  && Boolean(tripDateWindow(tripDateInput(item.startAt), tripDateInput(item.endAt))) && typeof item.reason === "string" && Number.isFinite(Date.parse(item.createdAt));

export function BusinessTripDatesPanel({ row, busy, onBusyChange, onSaved }: {
  row: HrAttendanceRequest; busy: boolean; onBusyChange: (value: boolean) => void; onSaved: (receipt: HrBusinessTripDatesReceipt) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null), [writing, setWriting] = useState(false), [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [history, setHistory] = useState<HrBusinessTripDatesHistory[] | null>(null), [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const [reading, setReading] = useState(false), [historyError, setHistoryError] = useState("");
  const mounted = useRef(true), flight = useRef(false), ownsBusy = useRef(false), attempt = useRef<Attempt | null>(null);
  const readGeneration = useRef(0), controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; readGeneration.current++; controller.current?.abort(); if (ownsBusy.current) { ownsBusy.current = false; onBusyChange(false); } };
  }, [onBusyChange]);

  const readHistory = async (nextPage: number) => {
    controller.current?.abort();
    const request = new AbortController(), owner = ++readGeneration.current, token = getAccessToken();
    controller.current = request; setReading(true); setHistory(null); setHistoryError("");
    try {
      const result = await hrApi.businessTripDatesHistory(row.id, token, nextPage, 20, request.signal);
      if (!mounted.current || request.signal.aborted || owner !== readGeneration.current || token !== getAccessToken()) return;
      if (!Number.isSafeInteger(result.total) || result.total < 0 || result.page !== nextPage || result.page_size !== 20 || !Array.isArray(result.items) || result.items.length > 20 || !result.items.every(validHistory)) throw new Error("出差日期历史返回不完整，请重试。");
      setHistory(result.items); setTotal(result.total); setPage(nextPage);
    } catch (cause) {
      if (mounted.current && !request.signal.aborted && owner === readGeneration.current && token === getAccessToken()) setHistoryError(hrLoadErrorMessage(cause, "读取日期更正历史失败"));
    } finally { if (mounted.current && owner === readGeneration.current) setReading(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || flight.current || !draft) return;
    if (draft.token !== getAccessToken() || draft.version !== row.amendVersion) { setError("当前身份或出差版本已变化，请刷新申请后重新核对。"); return; }
    const window = tripDateWindow(draft.start, draft.end);
    if (!window) { setError("请填写有效上海时间，精确到分钟；结束须晚于开始，且时段不超过31天。"); return; }
    if (!draft.reason.trim()) { setError("请填写日期更正原因。"); return; }
    const current = attempt.current ?? { body: { startAt: window.startAt, endAt: window.endAt, expectedVersion: draft.version, reason: draft.reason.trim() }, key: crypto.randomUUID(), token: draft.token };
    attempt.current = current; flight.current = true; ownsBusy.current = true; onBusyChange(true); setWriting(true); setError(""); setMessage("");
    try {
      const receipt = await hrApi.amendBusinessTripDates(row.id, current.body, current.token, current.key);
      if (!mounted.current) return;
      if (current.token !== getAccessToken()) { setUncertain(true); setError("身份范围已变化，请回到原范围核对办理结果。"); return; }
      if (receipt.id !== row.id || receipt.amendVersion !== current.body.expectedVersion + 1 || receipt.startAt !== current.body.startAt || receipt.endAt !== current.body.endAt || receipt.durationMinutes !== (Date.parse(current.body.endAt) - Date.parse(current.body.startAt)) / 60000) throw new Error("日期更正回执不匹配，请使用原请求重试核对。");
      attempt.current = null; setUncertain(false); setDraft(null); setHistory(null); controller.current?.abort(); readGeneration.current++; setReading(false);
      setMessage("出差日期已更正。请重算原时段和新时段涉及日期，重新确认申报月份归属；已封账月份通过更正批次接续。");
      try { await onSaved(receipt); } catch (cause) { if (mounted.current && current.token === getAccessToken()) setError(hrLoadErrorMessage(cause, "刷新失败；日期更正已保存，请勿重复办理。")); }
    } catch (cause) {
      if (!mounted.current) return;
      if (current.token !== getAccessToken()) { setUncertain(true); setError("身份范围已变化，请回到原范围核对办理结果。"); return; }
      if (cause instanceof ApiError && cause.status === 409) { attempt.current = null; setDraft(null); setUncertain(false); setError("申请或考勤期间已变化，请刷新申请和期间后重新更正。"); return; }
      const definite = cause instanceof ApiError && [400, 403, 404, 422].includes(cause.status);
      if (definite) attempt.current = null;
      setUncertain(!definite); setError(hrLoadErrorMessage(cause, "更正结果尚未确认，请保留原内容重试。"));
    } finally { flight.current = false; if (ownsBusy.current) { ownsBusy.current = false; onBusyChange(false); } if (mounted.current) setWriting(false); }
  };

  if (row.requestType !== "business_trip" || row.status !== "approved" || !Number.isSafeInteger(row.amendVersion) || Number(row.amendVersion) < 1) return null;
  const locked = busy || writing;
  return <section className={local.recalculation} aria-label={`出差 ${row.requestNo} 的日期维护`}>
    <div className={styles.actionRow}>
      <button type="button" className="ds-button ds-button-secondary" disabled={locked || Boolean(draft)} onClick={() => { attempt.current = null; setUncertain(false); setError(""); setDraft({ version: row.amendVersion!, start: tripDateInput(row.startAt), end: tripDateInput(row.endAt), reason: "", token: getAccessToken() }); }}>更正出差日期</button>
      <button type="button" className="ds-button ds-button-secondary" disabled={locked || reading || Boolean(draft)} onClick={() => void readHistory(1)}>查看日期更正历史</button>
    </div>
    {draft ? <form className={`ds-panel ${local.recalculationPlan}`} aria-label="更正出差日期" onSubmit={event => void save(event)}>
      <strong>{row.requestNo} · 原时段 {tripDateLabel(row.startAt)} 至 {tripDateLabel(row.endAt)}</strong>
      <p>以下均为上海时间，精确到分钟。修改日期不会改变申报天数；月份归属需要重新确认。</p>
      <label className="form-field"><span>出差开始时间</span><input type="datetime-local" step="60" required disabled={locked || uncertain} value={draft.start} onChange={event => { const start = event.target.value, min = tripEndBound(start, 1), max = tripEndBound(start, 31 * 1440); setDraft({ ...draft, start, end: min && max && draft.end >= min && draft.end <= max ? draft.end : "" }); }} /></label>
      <label className="form-field"><span>出差结束时间</span><input type="datetime-local" step="60" required min={tripEndBound(draft.start, 1)} max={tripEndBound(draft.start, 31 * 1440)} disabled={locked || uncertain || !tripDateInstant(draft.start)} value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} /></label>
      <label className="form-field"><span>日期更正原因</span><textarea required maxLength={1000} disabled={locked || uncertain} value={draft.reason} onChange={event => setDraft({ ...draft, reason: event.target.value })} /></label>
      {uncertain ? <p role="status">上次办理结果待确认，重试将沿用原内容和原请求编号。</p> : null}
      <div className={styles.actionRow}><button type="submit" className="ds-button ds-button-primary" disabled={locked}>{writing ? "正在保存…" : uncertain ? "重试核对日期更正" : "保存日期更正"}</button><button type="button" className="ds-button ds-button-secondary" disabled={locked || uncertain} onClick={() => { setDraft(null); setError(""); }}>取消日期更正</button></div>
    </form> : null}
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert" className="form-error">{error}</p> : null}
    {reading ? <p role="status">正在加载日期更正历史…</p> : null}{historyError ? <p role="alert" className="form-error">{historyError}</p> : null}
    {history !== null ? <div className={`ds-mobile-record-list ${local.records}`}>
      {history.length ? history.map(item => <article key={item.id} className="ds-mobile-record"><strong>日期更正版本 {item.requestVersion}</strong><span>原时段：{tripDateLabel(item.beforeStartAt)} 至 {tripDateLabel(item.beforeEndAt)}</span><span>更正后：{tripDateLabel(item.startAt)} 至 {tripDateLabel(item.endAt)}</span><span>{item.reason}</span><time dateTime={item.createdAt}>{tripDateLabel(item.createdAt)}</time></article>) : <p>暂无日期更正历史。</p>}
      <nav className={`${styles.actionRow} ${local.pagination}`} aria-label="出差日期更正历史分页"><button type="button" className="ds-button ds-button-secondary" disabled={locked || reading || Boolean(draft) || page <= 1} onClick={() => void readHistory(page - 1)}>日期历史上一页</button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页 · 共 {total} 条</span><button type="button" className="ds-button ds-button-secondary" disabled={locked || reading || Boolean(draft) || page * 20 >= total} onClick={() => void readHistory(page + 1)}>日期历史下一页</button></nav>
    </div> : null}
  </section>;
}
