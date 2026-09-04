"use client";

import {
  HR_LEGACY_PERSON_CODE_MAX_LENGTH,
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
  performanceLegacyPersonSummary,
  type HrPerformanceLegacyPersonSummary,
} from "../../../lib/hr-performance-legacy-person-summary-api";
import { hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./performance-legacy-person-summary.module.css";

const PAGE_SIZE = 20;
const EMPTY_PAGE: PaginatedResult<HrPerformanceLegacyPersonSummary> = {
  items: [],
  page: 1,
  page_size: PAGE_SIZE,
  total: 0,
};

function valueText(value: string | number | null) {
  return value === null || value === "" ? "—" : String(value);
}

function employeeNameText(value: string | null) {
  return value === null ? "未建立现代员工映射" : valueText(value);
}

function Pager({
  result,
  loading,
  onPage,
}: {
  result: PaginatedResult<HrPerformanceLegacyPersonSummary>;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(result.total / result.page_size));
  if (result.total <= result.page_size) return null;
  return (
    <nav className={styles.pager} aria-label="玉舟个人绩效汇总分页">
      <button
        className="ds-button"
        type="button"
        disabled={loading || result.page === 1}
        onClick={() => onPage(result.page - 1)}
      >
        上一页
      </button>
      <span>
        第 {result.page} / {pages} 页
      </span>
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

export function HrPerformanceLegacyPersonSummaryPanel() {
  const user = useAuthUser();
  const canRead =
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ);
  const [input, setInput] = useState("");
  const [queryCode, setQueryCode] = useState<string | null>(null);
  const [queryVersion, setQueryVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(EMPTY_PAGE);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [loadError, setLoadError] = useState("");
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!canRead || queryCode === null) return;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setLoadError("");
    void performanceLegacyPersonSummary(
      queryCode,
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
          setLoadError(hrLoadErrorMessage(cause, "加载玉舟个人绩效汇总失败"));
        }
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [canRead, page, queryCode, queryVersion]);

  if (!canRead) return null;

  const submitQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeHrLegacyPersonCode(input);
    if (!isHrLegacyPersonCode(normalized)) {
      generation.current += 1;
      request.current?.abort();
      setQueryCode(null);
      setResult(EMPTY_PAGE);
      setLoading(false);
      setLoadError("");
      setValidationError(`旧人员编码须为 1-${HR_LEGACY_PERSON_CODE_MAX_LENGTH} 位文字、数字、下划线或连字符。`);
      return;
    }
    setInput(normalized);
    setValidationError("");
    setLoadError("");
    setQueryCode(normalized);
    setPage(1);
    setResult(EMPTY_PAGE);
    setQueryVersion(version => version + 1);
  };

  const goToPage = (nextPage: number) => {
    setResult({ ...EMPTY_PAGE, page: nextPage });
    setPage(nextPage);
  };

  return (
    <section className={`ds-panel ${styles.panel}`} aria-labelledby="legacy-person-summary-heading">
      <div className={styles.heading}>
        <div>
          <span className="ds-eyebrow">玉舟 V10 查询报表</span>
          <h2 id="legacy-person-summary-heading">个人历史绩效汇总</h2>
        </div>
        <span className={styles.count} aria-live="polite">
          {loading ? "查询中…" : queryCode === null ? "等待查询" : `${result.total} 条`}
        </span>
      </div>
      <p className={styles.note}>
        输入完整旧人员编码查询当前权限范围内的历史汇总；结果严格限定为人员编码、现代员工姓名、等级与汇总分值。
      </p>
      <form className={styles.search} onSubmit={submitQuery} noValidate>
        <label className="form-field">
          <span>旧人员编码</span>
          <input
            type="text"
            value={input}
            minLength={1}
            maxLength={HR_LEGACY_PERSON_CODE_MAX_UTF16_LENGTH}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? "legacy-person-code-error" : undefined}
            onChange={event => setInput(event.target.value)}
          />
        </label>
        <button className="ds-button ds-button-primary" type="submit" disabled={loading}>
          查询历史绩效
        </button>
      </form>
      {validationError ? (
        <p className={styles.error} id="legacy-person-code-error" role="alert">
          {validationError}
        </p>
      ) : null}
      {loadError ? (
        <div className={styles.state} role="alert">
          <p>{loadError}</p>
          <button
            className="ds-button"
            type="button"
            onClick={() => setQueryVersion(version => version + 1)}
          >
            重新加载
          </button>
        </div>
      ) : null}
      {queryCode === null && !validationError ? (
        <p className={styles.state}>尚未查询。旧人员编码仅用于本次精确检索。</p>
      ) : null}
      {queryCode !== null && loading && !result.items.length ? (
        <p className={styles.state} aria-busy="true">正在查询个人历史绩效汇总…</p>
      ) : null}
      {queryCode !== null && !loading && !loadError && !result.items.length ? (
        <p className={styles.state}>当前权限范围内没有该旧人员编码的历史汇总。</p>
      ) : null}
      <div className={styles.cards} aria-busy={loading}>
        {result.items.map((row, index) => (
          <article
            className={styles.card}
            key={`${valueText(row.sourcePersonCode)}-${index}`}
          >
            <header>
              <strong>绩效汇总</strong>
            </header>
            <dl className={styles.fieldGrid}>
              <div>
                <dt>旧人员编码</dt>
                <dd>{valueText(row.sourcePersonCode)}</dd>
              </div>
              <div>
                <dt>现代员工姓名</dt>
                <dd>{employeeNameText(row.employeeDisplayName)}</dd>
              </div>
              <div>
                <dt>自评等级</dt>
                <dd>{valueText(row.sourceSelfGrade)}</dd>
              </div>
              <div>
                <dt>考核等级</dt>
                <dd>{valueText(row.sourceAssGrade)}</dd>
              </div>
              <div>
                <dt>项目汇总值</dt>
                <dd>{valueText(row.sourceItemValue)}</dd>
              </div>
              <div>
                <dt>旧系统总分</dt>
                <dd>{valueText(row.sourceTotalValue)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <Pager result={result} loading={loading} onPage={goToPage} />
    </section>
  );
}
