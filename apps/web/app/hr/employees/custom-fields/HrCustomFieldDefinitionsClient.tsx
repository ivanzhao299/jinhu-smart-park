"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import {
  hrCustomFieldApi,
  type HrCustomFieldCoverageStatus,
  type HrCustomFieldDefinition,
  type HrCustomFieldDefinitionFilters,
  type HrCustomFieldReviewReasonCode,
  type HrCustomFieldReviewStatus,
  type HrCustomFieldRuleClassification
} from "../../../../lib/hr-custom-field-api";
import { hasPermission } from "../../../../lib/permissions";
import styles from "../../hr-workbench.module.css";

const classificationLabels: Record<HrCustomFieldRuleClassification, string> = { declarative: "声明式", inert: "惰性保留", review_required: "需人工复核" };
const reviewLabels: Record<HrCustomFieldReviewStatus, string> = { pending: "待复核", approved: "已确认", rejected: "已驳回" };
const coverageLabels: Record<HrCustomFieldCoverageStatus, string> = { unmapped: "未映射", mapped: "已映射", excluded: "已排除", blocked: "阻断" };
const reasonLabels: Record<HrCustomFieldReviewReasonCode, string> = {
  confirmed_declarative: "确认声明式元数据",
  confirmed_inert: "确认仅惰性保留",
  requires_remediation: "需要现代化整改",
  mapped_to_modern_field: "已映射现代字段",
  excluded_obsolete: "旧字段已废弃",
  insufficient_evidence: "现有证据不足"
};

function presenceLabel(value: boolean | null): string {
  return value === null ? "未取证" : value ? "存在（仅保留指纹）" : "不存在";
}

function ReviewForm({ row, busy, onSubmit }: { row: HrCustomFieldDefinition; busy: boolean; onSubmit: (body: object) => Promise<void> }) {
  const [classification, setClassification] = useState(row.legacyRules.classification);
  const [reviewStatus, setReviewStatus] = useState(row.review.status);
  const [coverageStatus, setCoverageStatus] = useState(row.coverage.status);
  const changeReviewStatus = (next: HrCustomFieldReviewStatus) => {
    setReviewStatus(next);
    if (next === "pending") { setClassification("review_required"); setCoverageStatus("unmapped"); }
    if (next === "rejected") setCoverageStatus("blocked");
  };
  const submit = async (form: FormData) => {
    const completed = reviewStatus !== "pending";
    await onSubmit({
      classification,
      reviewStatus,
      coverageStatus,
      targetFieldKey: coverageStatus === "mapped" ? String(form.get("targetFieldKey") ?? "") : undefined,
      reviewReasonCode: completed ? String(form.get("reviewReasonCode") ?? "") : undefined,
      expectedVersion: row.review.version
    });
  };
  return <form className={styles.formGrid} action={submit}>
    <label className="form-field"><span>安全分类</span><select value={classification} onChange={(event) => setClassification(event.target.value as HrCustomFieldRuleClassification)}>{Object.entries(classificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="form-field"><span>复核状态</span><select value={reviewStatus} onChange={(event) => changeReviewStatus(event.target.value as HrCustomFieldReviewStatus)}>{Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="form-field"><span>覆盖状态</span><select value={coverageStatus} onChange={(event) => setCoverageStatus(event.target.value as HrCustomFieldCoverageStatus)}>{Object.entries(coverageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {coverageStatus === "mapped" ? <label className="form-field"><span>现代字段键</span><input name="targetFieldKey" pattern="[a-z][a-z0-9_.-]{0,127}" maxLength={128} defaultValue={row.coverage.targetFieldKey ?? ""} required /></label> : null}
    {reviewStatus !== "pending" ? <label className="form-field"><span>复核原因</span><select name="reviewReasonCode" defaultValue={row.review.reasonCode ?? "insufficient_evidence"} required>{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
    <button className="ds-button ds-button-primary" disabled={busy}>保存复核结果</button>
  </form>;
}

export function HrCustomFieldDefinitionsClient() {
  const user = useAuthUser();
  const canManage = hasPermission(user, HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE);
  const [rows, setRows] = useState<HrCustomFieldDefinition[]>([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, mapped: 0, blocked: 0, complete: 0 });
  const [filters, setFilters] = useState<HrCustomFieldDefinitionFilters>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async (targetPage = 1, append = false, signal?: AbortSignal) => {
    if (!canManage) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await hrCustomFieldApi.list(getAccessToken(), targetPage, 20, filters, signal);
      setRows((current) => append ? [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))] : result.items);
      setSummary(result.summary);
      setTotal(result.total);
      setPage(targetPage);
    } catch (error) {
      if ((error as Error).name !== "AbortError") setMessage(error instanceof Error ? error.message : "加载旧自定义字段元数据失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [canManage, filters]);

  useEffect(() => {
    const controller = new AbortController();
    void load(1, false, controller.signal);
    return () => controller.abort();
  }, [load]);

  const review = async (row: HrCustomFieldDefinition, body: object) => {
    setBusyId(row.id);
    setMessage("");
    try {
      await hrCustomFieldApi.review(row.id, body, getAccessToken());
      await load(1, false);
      setMessage(`已保存「${row.displayLabel}」的复核结果。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存复核结果失败");
    } finally {
      setBusyId(null);
    }
  };

  const forbidden = <main className={`content ds-page ${styles.page}`}><section className="ds-panel"><h1>无权访问旧自定义字段治理</h1><p>该页面仅向具备员工敏感档案管理权限的人力资源管理员开放。</p></section></main>;
  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE} fallback={forbidden}>
    <main className={`content ds-page ${styles.page}`}>
      <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">玉舟历史兼容</span><h1>旧自定义字段治理</h1><p>仅展示声明式元数据、旧逻辑存在性、安全分类和现代字段覆盖情况；旧 SQL 原文不会入库、执行或出站。</p></div><div><Link className="ds-button ds-button-secondary" href="/hr/employees">返回员工档案</Link></div></section>
      <section className="ds-kpi-grid">
        <article className="ds-kpi-card"><span>旧字段定义</span><strong>{summary.total}</strong></article>
        <article className="ds-kpi-card"><span>元数据完整</span><strong>{summary.complete}</strong></article>
        <article className="ds-kpi-card"><span>待人工复核</span><strong>{summary.pending}</strong></article>
        <article className="ds-kpi-card"><span>已映射 / 阻断</span><strong>{summary.mapped} / {summary.blocked}</strong></article>
      </section>
      <section className="ds-panel">
        <div className={styles.formGrid}>
          <label className="form-field"><span>字段搜索</span><input type="search" maxLength={100} value={filters.keyword ?? ""} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="字段编码、名称或旧定义编号" /></label>
          <label className="form-field"><span>安全分类</span><select value={filters.classification ?? ""} onChange={(event) => setFilters((current) => ({ ...current, classification: event.target.value as HrCustomFieldRuleClassification | "" }))}><option value="">全部</option>{Object.entries(classificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="form-field"><span>复核状态</span><select value={filters.reviewStatus ?? ""} onChange={(event) => setFilters((current) => ({ ...current, reviewStatus: event.target.value as HrCustomFieldReviewStatus | "" }))}><option value="">全部</option>{Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="form-field"><span>覆盖状态</span><select value={filters.coverageStatus ?? ""} onChange={(event) => setFilters((current) => ({ ...current, coverageStatus: event.target.value as HrCustomFieldCoverageStatus | "" }))}><option value="">全部</option>{Object.entries(coverageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      </section>
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      <section className="ds-panel">
        <div className="ds-mobile-record-list">{loading && rows.length === 0 ? <p>正在加载…</p> : rows.length ? rows.map((row) => <article className="ds-mobile-record" key={row.id}>
          <strong>{row.displayLabel} · {row.fieldCode}</strong>
          <span>旧定义：{row.legacyDefinitionId ?? "未取证"} · 源列：{row.sourceColumn ?? "未取证"}</span>
          <span>类型：{row.legacyDatatype ?? "未取证"} → {row.baseClassification ?? row.valueType} · 分组：{row.legacyGroupId ?? row.fieldGroup ?? "未分组"} · 顺序：{row.legacySortOrder ?? row.sortOrder}</span>
          <span>可空性：{row.legacyNullable === null ? "源无可证明字段" : row.legacyNullable ? "允许" : "不允许"} · description_d：{presenceLabel(row.descriptionD.present)}</span>
          <span>旧规则存在性：sqltext {presenceLabel(row.legacyRules.sqltextPresent)}；crosssql {presenceLabel(row.legacyRules.crosssqlPresent)}</span>
          <span>逻辑列安全取证：{row.logicCoverage.captured}/{row.logicCoverage.denominator} · 分类：{classificationLabels[row.legacyRules.classification]}</span>
          <span>复核：{reviewLabels[row.review.status]} · 覆盖：{coverageLabels[row.coverage.status]}{row.coverage.targetFieldKey ? ` → ${row.coverage.targetFieldKey}` : ""}</span>
          <details><summary>复核与覆盖管理</summary><ReviewForm row={row} busy={busyId === row.id} onSubmit={(body) => review(row, body)} /></details>
        </article>) : <p>当前筛选范围内没有旧自定义字段定义。</p>}</div>
        <div className="ds-table-shell">
          <table>
            <thead><tr><th>字段</th><th>类型与分组</th><th>旧规则安全摘要</th><th>覆盖状态</th><th>复核</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}>
              <td><strong>{row.displayLabel}</strong><br /><span>{row.fieldCode} · {row.sourceColumn ?? "未取证"}</span></td>
              <td>{row.legacyDatatype ?? "未取证"} → {row.baseClassification ?? row.valueType}<br /><span>{row.legacyGroupId ?? row.fieldGroup ?? "未分组"} · 顺序 {row.legacySortOrder ?? row.sortOrder}</span></td>
              <td>逻辑列 {row.logicCoverage.captured}/{row.logicCoverage.denominator}<br /><span>sqltext {presenceLabel(row.legacyRules.sqltextPresent)} · crosssql {presenceLabel(row.legacyRules.crosssqlPresent)}</span></td>
              <td>{coverageLabels[row.coverage.status]}{row.coverage.targetFieldKey ? <><br /><span>{row.coverage.targetFieldKey}</span></> : null}</td>
              <td><details><summary>{reviewLabels[row.review.status]}</summary><ReviewForm row={row} busy={busyId === row.id} onSubmit={(body) => review(row, body)} /></details></td>
            </tr>)}</tbody>
          </table>
          {!loading && rows.length === 0 ? <p>当前筛选范围内没有旧自定义字段定义。</p> : null}
        </div>
        {rows.length < total ? <button className="ds-button ds-button-secondary" type="button" disabled={loading} onClick={() => void load(page + 1, true)}>{loading ? "加载中…" : `加载更多（${rows.length}/${total}）`}</button> : null}
      </section>
    </main>
  </PermissionGuard>;
}
