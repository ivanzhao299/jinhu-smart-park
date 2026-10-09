"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrRewardCaseDetail } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";
import local from "./reward-workflow.module.css";

type History = NonNullable<HrRewardCaseDetail["corrections"]>;
function checkedHistory(value: unknown): History | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(row => !row || !Number.isSafeInteger(row.sequenceNo) || row.sequenceNo < 1 || !["correction", "appeal"].includes(row.type) || typeof row.summary !== "string" || typeof row.createdAt !== "string") || new Set(value.map(row => row.sequenceNo)).size !== value.length)
    throw Error("更正记录响应无效，请重新读取。");
  return value;
}
export function RewardCorrections({ detail, canManage, busy, publish }: {
  detail: HrRewardCaseDetail; canManage: boolean; busy: boolean;
  publish: (job: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [summary, setSummary] = useState(""), [reason, setReason] = useState(""),
    [error, setError] = useState(""), [warning, setWarning] = useState(""),
    [saved, setSaved] = useState<number | null>(null), [reading, setReading] = useState(false),
    [history, setHistory] = useState<History | undefined>(), [historyError, setHistoryError] = useState("");
  const alive = useRef(true), writing = useRef(false), key = useRef(crypto.randomUUID()),
    pending = useRef<string | null>(null), controller = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { try { setHistory(checkedHistory(detail.corrections)); setHistoryError(""); } catch (e) { setHistory(undefined); setHistoryError((e as Error).message); } }, [detail.corrections]);
  const reload = async () => {
    controller.current?.abort();
    const c = new AbortController(); controller.current = c; setReading(true);
    try {
      const row = await hrApi.rewardCase(detail.id, getAccessToken(), c.signal);
      if (row?.id !== detail.id || row.status !== "approved") throw Error("事项详情响应不匹配，请重新打开详情核对。");
      const rows = checkedHistory(row.corrections);
      if (alive.current && !c.signal.aborted) { setHistory(rows); setHistoryError(""); setWarning(""); }
    } catch (e) { if (alive.current && !c.signal.aborted) setWarning(hrLoadErrorMessage(e, "读取更正记录失败，请重试读取。")); }
    finally { if (alive.current && controller.current === c) setReading(false); }
  };
  const submit = async () => {
    if (!canManage || detail.status !== "approved" || busy || writing.current || saved !== null) return;
    const body = { type: "correction" as const, summary: summary.trim(), reason: reason.trim() }, fingerprint = JSON.stringify(body);
    if (!body.summary || !body.reason || body.summary.length > 300 || body.reason.length > 1000) { setError("请填写更正摘要和更正原因，摘要不超过300字、原因不超过1000字。"); return; }
    if (pending.current !== null && pending.current !== fingerprint) { setError("上次保存结果尚未确认，请保持原内容重试，确认后再办理新的更正。"); return; }
    writing.current = true; setError("");
    try {
      await publish(async () => {
        pending.current = fingerprint;
        try {
          const result = await hrApi.appendRewardCorrection(detail.id, body, getAccessToken(), key.current);
          if (!result || typeof result.id !== "string" || !result.id || !Number.isSafeInteger(result.sequenceNo) || result.sequenceNo < 1) throw Error("保存响应未确认，请保持原内容重试。");
          if (alive.current) { setSaved(result.sequenceNo); setSummary(""); setReason(""); setError(""); await reload(); }
          return result;
        } catch (e) {
          if (alive.current) {
            if (e instanceof ApiError && [400, 403, 404, 422].includes(e.status)) { pending.current = null; key.current = crypto.randomUUID(); }
            setError(hrLoadErrorMessage(e, "追加更正失败"));
          }
          throw e;
        }
      });
    } finally { writing.current = false; }
  };
  if (detail.status !== "approved") return null;
  return <section className={local.corrections} aria-label="奖惩更正记录">
    <h3>更正与申诉记录</h3>
    {historyError ? <p role="alert">{historyError}</p> : null}
    {history ? history.length ? <div className={`ds-mobile-record-list ${local.records}`}>{history.map(row => <article className="ds-mobile-record" key={row.sequenceNo}><strong>第 {row.sequenceNo} 条 · {row.type === "appeal" ? "员工申诉" : "追加更正"}</strong><p>{row.summary}</p><span>{row.createdAt}</span></article>)}</div> : <p>暂无更正或申诉记录。</p> : <p>当前权限未返回更正历史。</p>}
    {saved !== null ? <div role="status"><p>第 {saved} 条更正已保存，原审批记录保留。</p>{canManage ? <button className="ds-button" disabled={busy || reading} onClick={() => { setSaved(null); pending.current = null; key.current = crypto.randomUUID(); }}>追加另一条更正</button> : null}</div> : canManage ? <form aria-label="追加奖惩更正" className={styles.formGrid} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <p className={local.wide}>更正作为新记录追加，原审批事实、制度版本和证据保留。</p>
      <label className={`form-field ${local.wide}`}><span>更正摘要</span><input required maxLength={300} disabled={busy} value={summary} onChange={event => setSummary(event.target.value)} /></label>
      <label className={`form-field ${local.wide}`}><span>更正原因</span><textarea required maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <button className="ds-button ds-button-primary" disabled={busy}>保存追加更正</button>
    </form> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {warning ? <p role="alert">{saved !== null ? "更正已保存，历史刷新失败：" : "历史读取失败："}{warning}</p> : null}
    <button type="button" className="ds-button" disabled={busy || reading} onClick={() => void reload()}>{reading ? "正在读取更正记录…" : "重新读取更正记录"}</button>
  </section>;
}
