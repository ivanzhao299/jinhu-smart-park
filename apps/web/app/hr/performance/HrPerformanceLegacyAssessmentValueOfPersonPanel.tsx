"use client";

import {
  HR_LEGACY_PERSON_CODE_MAX_UTF16_LENGTH,
  HR_PERMISSIONS,
  isHrLegacyPersonCode,
  normalizeHrLegacyPersonCode,
  type PaginatedResult,
} from "@jinhu/shared";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import {
  performanceLegacyAssessmentValueOfPersonQuery,
  type HrPerformanceLegacyAssessmentValueOfPersonRow,
} from "../../../lib/hr-performance-legacy-assessment-value-of-person-api";
import { hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./performance-legacy-person-summary.module.css";

const PAGE_SIZE = 20;
const EMPTY_PAGE: PaginatedResult<HrPerformanceLegacyAssessmentValueOfPersonRow> = {
  items: [],
  page: 1,
  page_size: PAGE_SIZE,
  total: 0,
};

function valueText(value: string | number | null) {
  return value === null || value === "" ? "—" : String(value);
}

function Pager({
  result,
  loading,
  onPage,
}: {
  result: PaginatedResult<HrPerformanceLegacyAssessmentValueOfPersonRow>;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(result.total / result.page_size));
  if (result.total <= result.page_size) return null;
  return (
    <nav className={styles.pager} aria-label="玉舟 u_assessmentvalueofperson 分页">
      <button
        className="ds-button"
        type="button"
        disabled={loading || result.page === 1}
        onClick={() => onPage(result.page - 1)}
      >
        上一页
      </button>
      <span>第 {result.page} / {pages} 页</span>
      <button
        className="ds-button"
        type="button"
        disabled={loading || result.page >= pages}
        onClick={() => onPage(result.page + 1)}
      >
        下一页
      </button>
    </nav>
  );
}

export function HrPerformanceLegacyAssessmentValueOfPersonPanel() {
  const user = useAuthUser();
  const canRead =
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ);
  const [personCode, setPersonCode] = useState("");
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [queryVersion, setQueryVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(EMPTY_PAGE);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [loadError, setLoadError] = useState("");
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!canRead || submittedCode === null) return;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setLoadError("");
    void performanceLegacyAssessmentValueOfPersonQuery(
      submittedCode,
      getAccessToken(),
      page,
      PAGE_SIZE,
      controller.signal,
    )
      .then(response => {
        if (current === generation.current) setResult(response);
      })
      .catch(cause => {
        if (current === generation.current && !controller.signal.aborted) {
          setResult({ ...EMPTY_PAGE, page });
          setLoadError(hrLoadErrorMessage(cause, "加载玉舟个人历史绩效评分失败"));
        }
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [canRead, page, queryVersion, submittedCode]);

  if (!canRead) return null;

  const resetSubmittedQuery = () => {
    generation.current += 1;
    request.current?.abort();
    setSubmittedCode(null);
    setPage(1);
    setResult(EMPTY_PAGE);
    setLoading(false);
    setValidationError("");
    setLoadError("");
  };

  const submitQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeHrLegacyPersonCode(personCode);
    if (!isHrLegacyPersonCode(normalized)) {
      setValidationError("旧人员编码须为 1-10 位文字、数字、下划线或连字符。");
      return;
    }
    setPersonCode(normalized);
    setValidationError("");
    setLoadError("");
    setSubmittedCode(normalized);
    setPage(1);
    setResult(EMPTY_PAGE);
    setQueryVersion(version => version + 1);
  };

  const goToPage = (nextPage: number) => {
    setResult({ ...EMPTY_PAGE, page: nextPage });
    setPage(nextPage);
  };

  return (
    <section className={`ds-panel ${styles.panel}`} aria-labelledby="legacy-assessment-value-person-heading">
      <div className={styles.heading}>
        <div>
          <span className="ds-eyebrow">玉舟 V10 查询过程</span>
          <h2 id="legacy-assessment-value-person-heading">个人历史绩效评分</h2>
        </div>
        <span className={styles.count} aria-live="polite">
          {loading ? "查询中…" : submittedCode === null ? "等待查询" : `${result.total} 条`}
        </span>
      </div>
      <p className={styles.note}>
        对应旧过程 u_assessmentvalueofperson。周期名称只显示已验证的同批次关系投影；
        旧 grade 仍保持未解析。最后评定分不含单独展示的主管附加分。
      </p>
      <form className={styles.search} onSubmit={submitQuery} noValidate>
        <label className="form-field">
          <span>旧人员编码</span>
          <input
            type="text"
            value={personCode}
            maxLength={HR_LEGACY_PERSON_CODE_MAX_UTF16_LENGTH}
            autoComplete="off"
            spellCheck={false}
            onChange={event => {
              setPersonCode(event.target.value);
              resetSubmittedQuery();
            }}
          />
        </label>
        <button className="ds-button ds-button-primary" type="submit" disabled={loading}>
          查询个人历史
        </button>
      </form>
      {validationError ? <p className={styles.error} role="alert">{validationError}</p> : null}
      {loadError ? (
        <div className={styles.state} role="alert">
          <p>{loadError}</p>
          <button className="ds-button" type="button" onClick={() => setQueryVersion(version => version + 1)}>
            重新加载
          </button>
        </div>
      ) : null}
      {submittedCode === null && !validationError ? (
        <p className={styles.state}>尚未查询。人员编码只作精确匹配，不能作为授权边界。</p>
      ) : null}
      {submittedCode !== null && loading && !result.items.length ? (
        <p className={styles.state} aria-busy="true">正在查询个人历史绩效评分…</p>
      ) : null}
      {submittedCode !== null && !loading && !loadError && !result.items.length ? (
        <p className={styles.state}>当前权限和人员编码内没有历史评分。</p>
      ) : null}
      <div className={styles.cards} aria-busy={loading}>
        {result.items.map((item, index) => (
          <article className={styles.card} key={`${valueText(item.compatibleLegacySessionText)}-${index}`}>
            <header><strong>{valueText(item.compatibleLegacySessionText)}</strong></header>
            <dl className={styles.fieldGrid}>
              <div><dt>考核期间（关系投影）</dt><dd>{valueText(item.compatibleLegacySessionText)}</dd></div>
              <div>
                <dt>旧 grade</dt>
                <dd>{item.unresolvedLegacyGrade === null
                  ? "源清单未证明"
                  : valueText(item.unresolvedLegacyGrade)}</dd>
              </div>
              <div><dt>项目总分</dt><dd>{valueText(item.sourceItemValue)}</dd></div>
              <div><dt>主管附加分（仅展示）</dt><dd>{valueText(item.sourceMasterValue)}</dd></div>
              <div><dt>考勤加减分</dt><dd>{valueText(item.sourceTimekeepValue)}</dd></div>
              <div><dt>奖惩加减分</dt><dd>{valueText(item.sourceBonusValue)}</dd></div>
              <div><dt>最后评定分（不含主管附加分）</dt><dd>{valueText(item.legacyLastValueWithoutMaster)}</dd></div>
              <div><dt>评定</dt><dd>{valueText(item.sourceAppraisal)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <Pager result={result} loading={loading} onPage={goToPage} />
    </section>
  );
}
