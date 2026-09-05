"use client";

import {
  HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH,
  HR_PERMISSIONS,
  isHrPerformanceLegacyDepartmentPattern,
  isHrPerformanceLegacyDepartmentPrefix,
  isHrPerformanceLegacyQueryText,
  normalizeHrPerformanceLegacyQueryText,
  type PaginatedResult,
} from "@jinhu/shared";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import {
  performanceLegacyWebAssQuery,
  type HrPerformanceLegacyWebAssQueryFilters,
  type HrPerformanceLegacyWebAssQueryRow,
} from "../../../lib/hr-performance-legacy-web-ass-query-api";
import { hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./performance-legacy-person-summary.module.css";

const PAGE_SIZE = 20;
const EMPTY_PAGE: PaginatedResult<HrPerformanceLegacyWebAssQueryRow> = {
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
  result: PaginatedResult<HrPerformanceLegacyWebAssQueryRow>;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(result.total / result.page_size));
  if (result.total <= result.page_size) return null;
  return (
    <nav className={styles.pager} aria-label="玉舟 web_assquery 分页">
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

export function HrPerformanceLegacyWebAssQueryPanel() {
  const user = useAuthUser();
  const canRead =
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ);
  const [assSession, setAssSession] = useState("");
  const [personLike, setPersonLike] = useState("");
  const [rightScopePrefix, setRightScopePrefix] = useState("");
  const [itemValueMin, setItemValueMin] = useState("");
  const [itemValueMax, setItemValueMax] = useState("");
  const [submitted, setSubmitted] =
    useState<HrPerformanceLegacyWebAssQueryFilters | null>(null);
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
    void performanceLegacyWebAssQuery(
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
          setLoadError(hrLoadErrorMessage(cause, "加载玉舟绩效区间查询失败"));
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
    const normalizedSession = normalizeHrPerformanceLegacyQueryText(assSession);
    const normalizedPerson = normalizeHrPerformanceLegacyQueryText(personLike);
    const normalizedRightScope = normalizeHrPerformanceLegacyQueryText(rightScopePrefix);
    const minimum = Number(itemValueMin);
    const maximum = Number(itemValueMax);
    if (!isHrPerformanceLegacyQueryText(
      normalizedSession,
      HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH,
    )) {
      setValidationError("考核期间不能为空、不能包含控制字符，且最多 30 个字符。");
      return;
    }
    if (normalizedPerson && !isHrPerformanceLegacyDepartmentPattern(normalizedPerson)) {
      setValidationError("人员条件最多 30 个字符；旧版 LIKE 仅允许安全字符及 %、_ 通配符。");
      return;
    }
    if (!isHrPerformanceLegacyDepartmentPrefix(normalizedRightScope)) {
      setValidationError("部门权限前缀最多 30 个字符，且不能包含通配符、控制字符或反斜线。");
      return;
    }
    if (
      itemValueMin.trim() === ""
      || itemValueMax.trim() === ""
      || !Number.isFinite(minimum)
      || !Number.isFinite(maximum)
      || minimum > maximum
    ) {
      setValidationError("总评定分上下限必须为有效数字，且下限不能大于上限。");
      return;
    }
    const filters: HrPerformanceLegacyWebAssQueryFilters = {
      assSession: normalizedSession,
      ...(normalizedPerson ? { personLike: normalizedPerson } : {}),
      rightScopePrefix: normalizedRightScope,
      itemValueMin: minimum,
      itemValueMax: maximum,
    };
    setAssSession(normalizedSession);
    setPersonLike(normalizedPerson);
    setRightScopePrefix(normalizedRightScope);
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
    <section className={`ds-panel ${styles.panel}`} aria-labelledby="legacy-web-ass-query-heading">
      <div className={styles.heading}>
        <div>
          <span className="ds-eyebrow">玉舟 V10 查询过程</span>
          <h2 id="legacy-web-ass-query-heading">绩效区间查询</h2>
        </div>
        <span className={styles.count} aria-live="polite">
          {loading ? "查询中…" : submitted === null ? "等待查询" : `${result.total} 条`}
        </span>
      </div>
      <p className={styles.note}>
        对应旧过程 web_assquery。旧过程会丢弃传入的考核期间；现代查询明确遵守所选期间，
        并在服务端权限范围内再应用人员、部门前缀和总评定分区间。
      </p>
      <form className={styles.search} onSubmit={submitQuery} noValidate>
        <label className="form-field">
          <span>考核期间</span>
          <input
            type="text"
            value={assSession}
            maxLength={HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH}
            autoComplete="off"
            required
            onChange={event => {
              setAssSession(event.target.value);
              resetSubmittedQuery();
            }}
          />
        </label>
        <label className="form-field">
          <span>人员编码 LIKE 条件（可空）</span>
          <input
            type="text"
            value={personLike}
            maxLength={HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            onChange={event => {
              setPersonLike(event.target.value);
              resetSubmittedQuery();
            }}
          />
        </label>
        <label className="form-field">
          <span>部门编码前缀</span>
          <input
            type="text"
            value={rightScopePrefix}
            maxLength={HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            required
            onChange={event => {
              setRightScopePrefix(event.target.value);
              resetSubmittedQuery();
            }}
          />
        </label>
        <label className="form-field">
          <span>总评定分下限</span>
          <input
            type="number"
            value={itemValueMin}
            step="any"
            required
            onFocus={event => event.currentTarget.select()}
            onChange={event => {
              setItemValueMin(event.target.value);
              resetSubmittedQuery();
            }}
          />
        </label>
        <label className="form-field">
          <span>总评定分上限</span>
          <input
            type="number"
            value={itemValueMax}
            step="any"
            required
            onFocus={event => event.currentTarget.select()}
            onChange={event => {
              setItemValueMax(event.target.value);
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
        <p className={styles.state}>尚未查询。所有条件只能收窄服务端确定的园区、团队或本人范围。</p>
      ) : null}
      {submitted !== null && loading && !result.items.length ? (
        <p className={styles.state} aria-busy="true">正在查询绩效区间…</p>
      ) : null}
      {submitted !== null && !loading && !loadError && !result.items.length ? (
        <p className={styles.state}>当前权限和查询条件内没有历史绩效汇总。</p>
      ) : null}
      <div className={styles.cards} aria-busy={loading}>
        {result.items.map((item, index) => (
          <article className={styles.card} key={`${valueText(item.sourcePersonCode)}-${index}`}>
            <header><strong>{valueText(item.employeeDisplayName)}</strong></header>
            <dl className={styles.fieldGrid}>
              <div><dt>员工编号</dt><dd>{valueText(item.sourcePersonCode)}</dd></div>
              <div><dt>姓名</dt><dd>{valueText(item.employeeDisplayName)}</dd></div>
              <div><dt>自评等级</dt><dd>{valueText(item.sourceSelfGrade)}</dd></div>
              <div><dt>考评等级</dt><dd>{valueText(item.sourceAssGrade)}</dd></div>
              <div><dt>考评测评分</dt><dd>{valueText(item.sourceItemValue)}</dd></div>
              <div><dt>总评定分</dt><dd>{valueText(item.sourceTotalValue)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <Pager result={result} loading={loading} onPage={goToPage} />
    </section>
  );
}
