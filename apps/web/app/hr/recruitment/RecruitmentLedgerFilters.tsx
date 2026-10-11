"use client";

import { useEffect, useRef, useState } from "react";
import { hrApi } from "../../../lib/hr-api";
import { getAccessToken } from "../../../lib/authz";
import { downloadCsv } from "../../../lib/scoped-csv-export";
import { hrLoadErrorMessage } from "../hr-errors";
import { recruitmentLedgerExportCsv } from "./recruitment-ledger-export";
import styles from "./recruitment.module.css";

export type RecruitmentLedgerFilter = { keyword: string; status: string };

export function RecruitmentLedgerFilters({ kind, statuses, disabled, onApply, applied, exportControllers, blocked, revision }: {
  kind: "requisition" | "candidate";
  statuses: Record<string, string>;
  disabled: boolean;
  onApply: (filters: RecruitmentLedgerFilter) => boolean;
  applied: RecruitmentLedgerFilter;
  exportControllers: Set<AbortController>;
  blocked: () => boolean;
  revision: number;
}) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const context = JSON.stringify([kind, applied, keyword, status, disabled, revision]);
  const currentContext = useRef(context); currentContext.current = context;
  const draftMatches = keyword.trim() === applied.keyword && status === applied.status;
  const title = kind === "requisition" ? "招聘需求" : "候选人";
  const cancel = () => { const old = controller.current; old?.abort(); if (old) exportControllers.delete(old); controller.current = null; setExporting(false); setNotice(""); setError(""); };
  useEffect(() => { setExporting(false); setNotice(""); setError(""); return () => { const old = controller.current; old?.abort(); if (old) exportControllers.delete(old); controller.current = null; }; }, [context, exportControllers]);
  const exportLedger = async () => {
    if (disabled || blocked() || !draftMatches || (controller.current && !controller.current.signal.aborted)) return;
    const request = new AbortController(); controller.current = request; exportControllers.add(request);
    request.signal.addEventListener("abort", () => { exportControllers.delete(request); if (controller.current === request) { controller.current = null; setExporting(false); setNotice(""); setError(""); } }, { once: true });
    setExporting(true); setNotice(""); setError("");
    const active = () => controller.current === request && !request.signal.aborted && currentContext.current === context && !blocked();
    try {
      const token = getAccessToken();
      const result = kind === "requisition" ? await hrApi.recruitmentRequisitionsExport(token, applied, request.signal) :
        await hrApi.recruitmentCandidatesExport(token, { keyword: applied.keyword, stage: applied.status }, request.signal);
      if (!active()) return;
      const output = recruitmentLedgerExportCsv(result, kind);
      downloadCsv(output.csv, `${title}台账.csv`); setNotice(`已导出 ${output.total} 条${title}记录。`);
    } catch (cause) { if (active()) setError(hrLoadErrorMessage(cause, "导出台账失败，请重试。")); }
    finally { exportControllers.delete(request); if (controller.current === request) { controller.current = null; setExporting(false); } }
  };
  return <form aria-label={`${title}筛选`} className={styles.ledgerFilters} onSubmit={event => {
    event.preventDefault();
    if (!disabled && !blocked()) { cancel(); onApply({ keyword: keyword.trim(), status }); }
  }}>
    <label className="form-field"><span>{title}关键词</span><input type="search" maxLength={100} value={keyword} disabled={disabled}
      placeholder={kind === "requisition" ? "需求编号或岗位名称" : "候选人编号或姓名"} onChange={event => { cancel(); setKeyword(event.target.value); }} /></label>
    <label className="form-field"><span>{kind === "requisition" ? "招聘需求状态" : "候选人阶段"}</span><select value={status} disabled={disabled} onChange={event => { cancel(); setStatus(event.target.value); }}>
      <option value="">全部{kind === "requisition" ? "状态" : "阶段"}</option>
      {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <div className={styles.ledgerFilterActions}>
      <button className="ds-button ds-button-primary" disabled={disabled}>搜索{title}</button>
      <button type="button" className="ds-button" disabled={disabled} onClick={() => {
        if (!disabled && !blocked() && onApply({ keyword: "", status: "" })) { cancel(); setKeyword(""); setStatus(""); }
      }}>重置{title}筛选</button>
      <button type="button" className="ds-button" disabled={disabled || exporting || !draftMatches} onClick={() => void exportLedger()}>导出全部筛选{title}</button>
    </div>
    <div className={styles.ledgerFilterActions}>
      <span>导出条件：{applied.keyword || "全部关键词"} · {statuses[applied.status] || "全部状态"}；最多 5000 条{kind === "candidate" ? "，联系资料脱敏" : ""}。</span>
      {!draftMatches ? <span>筛选条件已修改，请先搜索再导出。</span> : null}
      {exporting ? <span role="status">正在导出{title}…</span> : null}
      {notice ? <span role="status">{notice}</span> : null}
      {error ? <span className="form-error" role="alert">{error}</span> : null}
    </div>
  </form>;
}
