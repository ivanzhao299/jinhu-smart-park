"use client";

import {
  HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_DEPARTMENT_MATCH_MODES,
  HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH,
  HR_PERMISSIONS,
  isHrPerformanceLegacyDepartmentPattern,
  isHrPerformanceLegacyQueryText,
  normalizeHrPerformanceLegacyQueryText,
  type HrPerformanceLegacyDepartmentMatchMode,
  type PaginatedResult,
} from "@jinhu/shared";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import {
  performanceLegacyAssessmentMasterQuery,
  type HrPerformanceLegacyAssessmentMasterFilters,
  type HrPerformanceLegacyAssessmentMasterQueryRow,
} from "../../../lib/hr-performance-legacy-assessment-master-api";
import { hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./performance-legacy-person-summary.module.css";

const PAGE_SIZE = 20;
const EMPTY_PAGE: PaginatedResult<HrPerformanceLegacyAssessmentMasterQueryRow> = {
  items: [],
  page: 1,
  page_size: PAGE_SIZE,
  total: 0,
};
const MATCH_MODE_LABELS: Record<HrPerformanceLegacyDepartmentMatchMode, string> = {
  exact: "精确部门编码",
  legacy_like: "旧版 LIKE（仅 % 和 _ 通配符）",
};

function valueText(value: string | number | null) {
  return value === null || value === "" ? "—" : String(value);
}

function Pager({
  result,
  loading,
  onPage,
}: {
  result: PaginatedResult<HrPerformanceLegacyAssessmentMasterQueryRow>;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(result.total / result.page_size));
  if (result.total <= result.page_size) return null;
  return (
    <nav className={styles.pager} aria-label="玉舟 u_assessmentmaster 分页">
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

export function HrPerformanceLegacyAssessmentMasterPanel() {
  const user = useAuthUser();
  const canRead =
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ);
  const [assSession, setAssSession] = useState("");
  const [assessmentType, setAssessmentType] = useState("");
  const [departmentLike, setDepartmentLike] = useState("");
  const [departmentMatchMode, setDepartmentMatchMode] =
    useState<HrPerformanceLegacyDepartmentMatchMode>("exact");
  const [submitted, setSubmitted] =
    useState<HrPerformanceLegacyAssessmentMasterFilters | null>(null);
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
    void performanceLegacyAssessmentMasterQuery(
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
          setLoadError(hrLoadErrorMessage(cause, "加载玉舟绩效汇总查询失败"));
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

  const submitQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const filters = {
      assSession: normalizeHrPerformanceLegacyQueryText(assSession),
      assessmentType: normalizeHrPerformanceLegacyQueryText(assessmentType),
      departmentLike: normalizeHrPerformanceLegacyQueryText(departmentLike),
      departmentMatchMode,
    };
    if (!isHrPerformanceLegacyQueryText(filters.assSession, HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH)) {
      setValidationError("考核期间不能为空、不能包含控制字符，且最多 30 个字符。");
      return;
    }
    if (!isHrPerformanceLegacyQueryText(filters.assessmentType, HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH)) {
      setValidationError("考核类型不能为空、不能包含控制字符，且最多 4 个字符。");
      return;
    }
    if (!isHrPerformanceLegacyDepartmentPattern(filters.departmentLike)) {
      setValidationError("部门条件最多 30 个字符；旧版 LIKE 仅允许文字、数字及 %、_、点、斜线和连字符。");
      return;
    }
    setAssSession(filters.assSession);
    setAssessmentType(filters.assessmentType);
    setDepartmentLike(filters.departmentLike);
    setValidationError("");
    setLoadError("");
    setSubmitted(filters);
    setPage(1);
    setResult(EMPTY_PAGE);
    setQueryVersion(version => version + 1);
  };

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

  const goToPage = (nextPage: number) => {
    setResult({ ...EMPTY_PAGE, page: nextPage });
    setPage(nextPage);
  };

  return (
    <section className={`ds-panel ${styles.panel}`} aria-labelledby="legacy-assessment-master-heading">
      <div className={styles.heading}>
        <div>
          <span className="ds-eyebrow">玉舟 V10 查询过程</span>
          <h2 id="legacy-assessment-master-heading">部门绩效汇总查询</h2>
        </div>
        <span className={styles.count} aria-live="polite">
          {loading ? "查询中…" : submitted === null ? "等待查询" : `${result.total} 条`}
        </span>
      </div>
      <p className={styles.note}>
        对应旧过程 u_assessmentmaster。考核期间和类型通过同批次周期事实精确绑定；
        旧 assid 在当前源清单中没有可证明字段，因此明确显示为未解析，不以当前 id 猜测替代。
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
          <span>考核类型</span>
          <input
            type="text"
            value={assessmentType}
            maxLength={HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH}
            autoComplete="off"
            onChange={event => {
              setAssessmentType(event.target.value);
              resetSubmittedQuery();
            }}
          />
        </label>
        <label className="form-field">
          <span>部门匹配方式</span>
          <select
            value={departmentMatchMode}
            onChange={event => {
              setDepartmentMatchMode(event.target.value as HrPerformanceLegacyDepartmentMatchMode);
              resetSubmittedQuery();
            }}
          >
            {HR_PERFORMANCE_LEGACY_DEPARTMENT_MATCH_MODES.map(mode => (
              <option key={mode} value={mode}>{MATCH_MODE_LABELS[mode]}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>部门编码或 LIKE 条件</span>
          <input
            type="text"
            value={departmentLike}
            maxLength={HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            onChange={event => {
              setDepartmentLike(event.target.value);
              resetSubmittedQuery();
            }}
          />
        </label>
        <button className="ds-button ds-button-primary" type="submit" disabled={loading}>
          查询历史汇总
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
        <p className={styles.state}>尚未查询。所有条件仅用于当前权限范围内的只读检索。</p>
      ) : null}
      {submitted !== null && loading && !result.items.length ? (
        <p className={styles.state} aria-busy="true">正在查询部门历史绩效汇总…</p>
      ) : null}
      {submitted !== null && !loading && !loadError && !result.items.length ? (
        <p className={styles.state}>当前权限和查询条件内没有历史汇总。</p>
      ) : null}
      <div className={styles.cards} aria-busy={loading}>
        {result.items.map((item, index) => (
          <article className={styles.card} key={`${valueText(item.sourcePersonCode)}-${index}`}>
            <header><strong>{valueText(item.employeeDisplayName)}</strong></header>
            <dl className={styles.fieldGrid}>
              <div><dt>旧 assid</dt><dd>源清单未证明</dd></div>
              <div><dt>旧人员编码</dt><dd>{valueText(item.sourcePersonCode)}</dd></div>
              <div><dt>姓名</dt><dd>{valueText(item.employeeDisplayName)}</dd></div>
              <div><dt>考核等级</dt><dd>{valueText(item.sourceAssGrade)}</dd></div>
              <div><dt>项目总分</dt><dd>{valueText(item.sourceItemValue)}</dd></div>
              <div><dt>主管附加分</dt><dd>{valueText(item.sourceMasterValue)}</dd></div>
              <div><dt>考勤加减分</dt><dd>{valueText(item.sourceTimekeepValue)}</dd></div>
              <div><dt>奖惩加减分</dt><dd>{valueText(item.sourceBonusValue)}</dd></div>
              <div><dt>评语</dt><dd>{valueText(item.sourceAppraisal)}</dd></div>
              <div><dt>考核人员</dt><dd>{valueText(item.sourceAssessmentPerson)}</dd></div>
              <div><dt>考核日期</dt><dd>{valueText(item.sourceRecordedAt)}</dd></div>
              <div><dt>维护员</dt><dd>{valueText(item.sourceOperatorCode)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <Pager result={result} loading={loading} onPage={goToPage} />
    </section>
  );
}
