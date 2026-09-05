"use client";

import {
  HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH,
  HR_PERMISSIONS,
  isHrPerformanceLegacyDepartmentPrefix,
  isHrPerformanceLegacyQueryText,
  normalizeHrPerformanceLegacyQueryText,
  type PaginatedResult,
} from "@jinhu/shared";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import {
  performanceLegacyAssessmentValueQuery,
  type HrPerformanceLegacyAssessmentValueFilters,
  type HrPerformanceLegacyAssessmentValueQueryRow,
} from "../../../lib/hr-performance-legacy-assessment-value-api";
import { hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./performance-legacy-person-summary.module.css";

const PAGE_SIZE = 20;
const EMPTY_PAGE: PaginatedResult<HrPerformanceLegacyAssessmentValueQueryRow> = {
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
  result: PaginatedResult<HrPerformanceLegacyAssessmentValueQueryRow>;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(result.total / result.page_size));
  if (result.total <= result.page_size) return null;
  return (
    <nav className={styles.pager} aria-label="玉舟 u_assessmentvalue 分页">
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

export function HrPerformanceLegacyAssessmentValuePanel() {
  const user = useAuthUser();
  const canRead =
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ);
  const [assSession, setAssSession] = useState("");
  const [departmentPrefix, setDepartmentPrefix] = useState("");
  const [submitted, setSubmitted] =
    useState<HrPerformanceLegacyAssessmentValueFilters | null>(null);
  const [queryVersion, setQueryVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(EMPTY_PAGE);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [loadError, setLoadError] = useState("");
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!canRead || submitted === null) return;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setLoadError("");
    void performanceLegacyAssessmentValueQuery(
      submitted,
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
          setLoadError(hrLoadErrorMessage(cause, "加载玉舟历史绩效评分失败"));
        }
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [canRead, page, queryVersion, submitted]);

  if (!canRead) return null;

  const resetSubmittedQuery = () => {
    generation.current += 1;
    request.current?.abort();
    setSubmitted(null);
    setPage(1);
    setResult(EMPTY_PAGE);
    setLoading(false);
    setValidationError("");
    setLoadError("");
  };

  const submitQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const filters = {
      assSession: normalizeHrPerformanceLegacyQueryText(assSession),
      departmentPrefix: normalizeHrPerformanceLegacyQueryText(departmentPrefix),
    };
    if (!isHrPerformanceLegacyQueryText(filters.assSession, HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH)) {
      setValidationError("考核期间不能为空、不能包含控制字符，且最多 30 个字符。");
      return;
    }
    if (!isHrPerformanceLegacyDepartmentPrefix(filters.departmentPrefix)) {
      setValidationError("部门前缀最多 30 个字符，且不能包含通配符、控制字符或反斜线。");
      return;
    }
    setAssSession(filters.assSession);
    setDepartmentPrefix(filters.departmentPrefix);
    setValidationError("");
    setLoadError("");
    setSubmitted(filters);
    setPage(1);
    setResult(EMPTY_PAGE);
    setQueryVersion(version => version + 1);
  };

  const goToPage = (nextPage: number) => {
    setResult({ ...EMPTY_PAGE, page: nextPage });
    setPage(nextPage);
  };

  return (
    <section className={`ds-panel ${styles.panel}`} aria-labelledby="legacy-assessment-value-heading">
      <div className={styles.heading}>
        <div>
          <span className="ds-eyebrow">玉舟 V10 查询过程</span>
          <h2 id="legacy-assessment-value-heading">部门历史绩效评分</h2>
        </div>
        <span className={styles.count} aria-live="polite">
          {loading ? "查询中…" : submitted === null ? "等待查询" : `${result.total} 条`}
        </span>
      </div>
      <p className={styles.note}>
        对应旧过程 u_assessmentvalue。最后评定分严格按项目总分、考勤加减分、奖惩加减分相加；
        主管附加分仅展示、不计入该旧公式。旧 grade 字段尚无目录证据，因此不以 assgrade 猜测替代。
        当前姓名与部门前缀来自 T0 精确解析后的当前员工和主组织，对应旧过程运行时关联当前 person
        记录的语义；它们不是冻结的历史姓名或部门快照。
      </p>
      <form className={styles.search} onSubmit={submitQuery} noValidate>
        <label className="form-field">
          <span>考核期间</span>
          <input
            type="text"
            value={assSession}
            maxLength={HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH}
            autoComplete="off"
            onChange={event => {
              setAssSession(event.target.value);
              resetSubmittedQuery();
            }}
          />
        </label>
        <label className="form-field">
          <span>部门编码前缀</span>
          <input
            type="text"
            value={departmentPrefix}
            maxLength={HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            onChange={event => {
              setDepartmentPrefix(event.target.value);
              resetSubmittedQuery();
            }}
          />
        </label>
        <button className="ds-button ds-button-primary" type="submit" disabled={loading}>
          查询历史评分
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
      {submitted === null && !validationError ? (
        <p className={styles.state}>尚未查询。部门条件按安全的文字前缀匹配。</p>
      ) : null}
      {submitted !== null && loading && !result.items.length ? (
        <p className={styles.state} aria-busy="true">正在查询部门历史绩效评分…</p>
      ) : null}
      {submitted !== null && !loading && !loadError && !result.items.length ? (
        <p className={styles.state}>当前权限和查询条件内没有历史评分。</p>
      ) : null}
      <div className={styles.cards} aria-busy={loading}>
        {result.items.map((item, index) => (
          <article className={styles.card} key={`${valueText(item.sourcePersonCode)}-${index}`}>
            <header><strong>{valueText(item.employeeDisplayName)}</strong></header>
            <dl className={styles.fieldGrid}>
              <div><dt>旧人员编码</dt><dd>{valueText(item.sourcePersonCode)}</dd></div>
              <div><dt>姓名</dt><dd>{valueText(item.employeeDisplayName)}</dd></div>
              <div><dt>旧 grade</dt><dd>源清单未证明</dd></div>
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
