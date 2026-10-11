"use client";

import { useState } from "react";
import styles from "./recruitment.module.css";

export type RecruitmentLedgerFilter = { keyword: string; status: string };

export function RecruitmentLedgerFilters({ kind, statuses, disabled, onApply }: {
  kind: "requisition" | "candidate";
  statuses: Record<string, string>;
  disabled: boolean;
  onApply: (filters: RecruitmentLedgerFilter) => boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const title = kind === "requisition" ? "招聘需求" : "候选人";
  return <form aria-label={`${title}筛选`} className={styles.ledgerFilters} onSubmit={event => {
    event.preventDefault();
    if (!disabled) onApply({ keyword: keyword.trim(), status });
  }}>
    <label className="form-field"><span>{title}关键词</span><input type="search" maxLength={100} value={keyword} disabled={disabled}
      placeholder={kind === "requisition" ? "需求编号或岗位名称" : "候选人编号或姓名"} onChange={event => setKeyword(event.target.value)} /></label>
    <label className="form-field"><span>{kind === "requisition" ? "招聘需求状态" : "候选人阶段"}</span><select value={status} disabled={disabled} onChange={event => setStatus(event.target.value)}>
      <option value="">全部{kind === "requisition" ? "状态" : "阶段"}</option>
      {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <div className={styles.ledgerFilterActions}>
      <button className="ds-button ds-button-primary" disabled={disabled}>搜索{title}</button>
      <button type="button" className="ds-button" disabled={disabled} onClick={() => {
        if (!disabled && onApply({ keyword: "", status: "" })) { setKeyword(""); setStatus(""); }
      }}>重置{title}筛选</button>
    </div>
  </form>;
}
