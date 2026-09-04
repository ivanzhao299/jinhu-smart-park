"use client";

import { HR_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import {
  hrPerformanceLegacyRelationsApi,
  type HrPerformanceLegacyPersonAssignmentRelation,
  type HrPerformanceLegacyScoreSourceRelation,
  type HrPerformanceLegacySessionRelation,
} from "../../../lib/hr-performance-legacy-relations-api";
import { hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./performance-legacy-relations.module.css";

type RelationKind = "sessions" | "scoreSources" | "personAssignments";
type RelationRow =
  | HrPerformanceLegacySessionRelation
  | HrPerformanceLegacyScoreSourceRelation
  | HrPerformanceLegacyPersonAssignmentRelation;
type RelationPage = PaginatedResult<RelationRow>;
type DisplayField = { label: string; value: unknown; relation?: boolean };

const PAGE_SIZE = 20;
const EMPTY_PAGE: RelationPage = {
  items: [],
  page: 1,
  page_size: PAGE_SIZE,
  total: 0,
};
const DEFINITION_KINDS: RelationKind[] = ["sessions"];
const PERSON_RELATION_KINDS: RelationKind[] = [
  "scoreSources",
  "personAssignments",
];
const LABELS: Record<RelationKind, string> = {
  sessions: "旧绩效周期",
  scoreSources: "评分来源",
  personAssignments: "评分人关系",
};

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function mappingText(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "未建立"
    : "已建立";
}

function cardData(row: RelationRow): {
  key: string;
  title: string;
  subtitle: string;
  fields: DisplayField[];
  personBearing: boolean;
} {
  if ("sourceSessionName" in row) {
    return {
      key: `session-${row.sourceSessionId}`,
      title: row.sourceSessionName || `旧周期 ${row.sourceSessionId}`,
      subtitle: `旧周期编号 ${row.sourceSessionId}`,
      personBearing: false,
      fields: [
        { label: "旧周期编号", value: row.sourceSessionId },
        { label: "旧周期名称", value: row.sourceSessionName },
        { label: "周期说明", value: row.sourceDescription },
        { label: "考核类型原值", value: row.sourceAssessmentType },
        { label: "年度", value: row.sourceYear },
        { label: "月份", value: row.sourceMonth },
        { label: "季度", value: row.sourceQuarter },
        { label: "旧排序", value: row.sourceMyOrder },
        {
          label: "现代绩效周期映射",
          value: mappingText(row.targetReviewCycleId),
          relation: true,
        },
      ],
    };
  }

  if ("sourceScoreId" in row) {
    return {
      key: `score-source-${row.sourceScoreId}`,
      title: `旧周期 ${valueText(row.sourceSessionId)} · 项目 ${valueText(row.sourceItemId)}`,
      subtitle: `评分记录 ${row.sourceScoreId}`,
      personBearing: true,
      fields: [
        { label: "旧评分记录编号", value: row.sourceScoreId },
        { label: "旧周期编号", value: row.sourceSessionId },
        { label: "被考核人旧编码", value: row.sourcePersonCode },
        { label: "旧考核项目编号", value: row.sourceItemId },
        { label: "旧关系类型代码", value: row.sourceRelationType },
        { label: "评分原值", value: row.sourceItemValue },
        { label: "等级原值", value: row.sourceAssGrade },
        { label: "评价说明原值", value: row.sourceAppraisal },
        {
          label: "兼容周期关系",
          value: mappingText(row.legacySessionId),
          relation: true,
        },
        {
          label: "兼容项目关系",
          value: mappingText(row.legacyDimensionProfileId),
          relation: true,
        },
      ],
    };
  }

  return {
    key: `person-assignment-${row.sourceAssignmentId}`,
    title: `旧周期 ${valueText(row.sourceSessionId)} · 评分人关系`,
    subtitle: `分配记录 ${row.sourceAssignmentId}`,
    personBearing: true,
    fields: [
      { label: "旧分配记录编号", value: row.sourceAssignmentId },
      { label: "旧周期编号", value: row.sourceSessionId },
      { label: "被考核人旧编码", value: row.sourcePersonCode },
      { label: "评分人旧编码", value: row.sourceAssessorCode },
      { label: "旧关系类型代码", value: row.sourceRelationType },
      {
        label: "兼容周期关系",
        value: mappingText(row.legacySessionId),
        relation: true,
      },
    ],
  };
}

function Pager({
  result,
  loading,
  onPage,
}: {
  result: RelationPage;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(result.total / result.page_size));
  if (result.total <= result.page_size) return null;
  return (
    <nav className={styles.pager} aria-label="玉舟历史绩效关系分页">
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

export function HrPerformanceLegacyRelationsPanel() {
  const user = useAuthUser();
  const canReadDefinitions =
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE);
  const canReadPersonRelations =
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_READ) ||
    hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_MANAGE);
  const available = useMemo(
    () => [
      ...(canReadDefinitions ? DEFINITION_KINDS : []),
      ...(canReadPersonRelations ? PERSON_RELATION_KINDS : []),
    ],
    [canReadDefinitions, canReadPersonRelations],
  );
  const [kind, setKind] = useState<RelationKind>(available[0] ?? "sessions");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<RelationPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionText, setSessionText] = useState("");
  const [sessionFilter, setSessionFilter] = useState<number | undefined>();
  const [filterError, setFilterError] = useState("");
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const activeKind = available.includes(kind) ? kind : available[0] ?? "sessions";
  const supportsSessionFilter = activeKind !== "sessions";

  const load = useCallback(async () => {
    if (!available.includes(activeKind)) return;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const token = getAccessToken();
      const response =
        activeKind === "sessions"
          ? await hrPerformanceLegacyRelationsApi.sessions(
              token,
              page,
              PAGE_SIZE,
              controller.signal,
            )
          : activeKind === "scoreSources"
            ? await hrPerformanceLegacyRelationsApi.scoreSources(
                token,
                page,
                PAGE_SIZE,
                sessionFilter,
                controller.signal,
              )
            : await hrPerformanceLegacyRelationsApi.personAssignments(
                token,
                page,
                PAGE_SIZE,
                sessionFilter,
                controller.signal,
              );
      if (current === generation.current) setResult(response);
    } catch (cause) {
      if (current === generation.current && !controller.signal.aborted) {
        setResult({ ...EMPTY_PAGE, page });
        setError(hrLoadErrorMessage(cause, "加载玉舟历史绩效关系失败"));
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [activeKind, available, page, sessionFilter]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
      request.current?.abort();
    };
  }, [load]);

  if (!available.length) return null;

  const selectKind = (next: RelationKind) => {
    setKind(next);
    setPage(1);
    setResult(EMPTY_PAGE);
    setError("");
    setFilterError("");
  };

  const applySessionFilter = () => {
    const normalized = sessionText.trim();
    if (!normalized) {
      setFilterError("");
      setSessionFilter(undefined);
      setPage(1);
      return;
    }
    if (!/^\d+$/u.test(normalized)) {
      setFilterError("旧周期编号必须是大于等于零的整数。");
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed)) {
      setFilterError("旧周期编号超出可查询范围。");
      return;
    }
    setFilterError("");
    setSessionFilter(parsed);
    setPage(1);
  };

  const clearSessionFilter = () => {
    setSessionText("");
    setSessionFilter(undefined);
    setFilterError("");
    setPage(1);
  };

  return (
    <section className={`ds-panel ${styles.panel}`} aria-labelledby="legacy-performance-relations-heading">
      <div className={styles.heading}>
        <div>
          <span className="ds-eyebrow">玉舟 V10 关系事实</span>
          <h2 id="legacy-performance-relations-heading">历史绩效关系核对</h2>
        </div>
        <span className={styles.count} aria-live="polite">
          {loading ? "加载中…" : `${result.total} 条`}
        </span>
      </div>
      <p className={styles.note}>
        只读展示已验证的旧绩效周期、评分来源和评分人关系。旧关系类型按原始代码保留，不推断人员姓名或关系含义。
      </p>
      <div className={styles.tabs} role="tablist" aria-label="历史绩效关系数据类型">
        {available.map(item => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={activeKind === item}
            className={activeKind === item ? styles.activeTab : styles.tab}
            onClick={() => selectKind(item)}
          >
            {LABELS[item]}
          </button>
        ))}
      </div>
      {supportsSessionFilter ? (
        <div className={styles.filterBlock}>
          <div className={styles.filters}>
            <label className="form-field">
              <span>旧周期编号（可选）</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={sessionText}
                onChange={event => setSessionText(event.target.value)}
              />
            </label>
            <button
              className="ds-button"
              type="button"
              disabled={loading}
              onClick={applySessionFilter}
            >
              查询
            </button>
            {sessionFilter !== undefined ? (
              <button
                className="ds-button"
                type="button"
                disabled={loading}
                onClick={clearSessionFilter}
              >
                清除
              </button>
            ) : null}
          </div>
          {filterError ? <p className={styles.filterError} role="alert">{filterError}</p> : null}
        </div>
      ) : null}
      {error ? (
        <div className={styles.state} role="alert">
          <p>{error}</p>
          <button className="ds-button" type="button" onClick={() => void load()}>
            重新加载
          </button>
        </div>
      ) : null}
      {!error && loading && !result.items.length ? (
        <p className={styles.state} aria-busy="true">正在加载历史绩效关系…</p>
      ) : null}
      {!error && !loading && !result.items.length ? (
        <p className={styles.state}>当前授权范围内没有已验证的生产迁移关系。</p>
      ) : null}
      <div className={styles.cards} aria-busy={loading}>
        {result.items.map(row => {
          const card = cardData(row);
          return (
            <article className={styles.card} key={card.key}>
              <header className={styles.cardHeader}>
                <strong>{card.title}</strong>
                <span>{card.subtitle}</span>
              </header>
              {card.personBearing ? (
                <p className={styles.mappingWarning} role="note">
                  现代员工映射：未建立；仅保留旧人员编码，不推断人员身份。
                </p>
              ) : null}
              <dl className={styles.fieldGrid}>
                {card.fields.map(field => (
                  <div className={field.relation ? styles.relationField : undefined} key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{valueText(field.value)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
      <Pager result={result} loading={loading} onPage={setPage} />
    </section>
  );
}
