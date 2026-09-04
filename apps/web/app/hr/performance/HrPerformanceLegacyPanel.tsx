"use client";

import { HR_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import {
  hrApi,
  type HrPerformanceLegacyRubric,
  type HrPerformanceLegacyDimension,
  type HrPerformanceLegacyGuide,
  type HrPerformanceLegacyLevel,
  type HrPerformanceLegacyMaster,
  type HrPerformanceLegacyResult,
  type HrPerformanceLegacyTemplate,
} from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./performance-legacy.module.css";

type LegacyKind = "templates" | "levels" | "dimensions" | "guides" | "results" | "masters";
type LegacyRow =
  | HrPerformanceLegacyTemplate
  | HrPerformanceLegacyLevel
  | HrPerformanceLegacyDimension
  | HrPerformanceLegacyGuide
  | HrPerformanceLegacyResult
  | HrPerformanceLegacyMaster;
type LegacyPage = PaginatedResult<LegacyRow>;
type Field = { key: string; label: string; relation?: boolean };

const EMPTY_PAGE: LegacyPage = { items: [], page: 1, page_size: 20, total: 0 };
const definitionKinds: LegacyKind[] = ["templates", "levels", "dimensions", "guides"];
const labels: Record<LegacyKind, string> = {
  templates: "模板参数",
  levels: "等级规则",
  dimensions: "考核项目",
  guides: "评分说明",
  results: "历史结果",
  masters: "汇总与总分",
};
const fields: Record<LegacyKind, Field[]> = {
  templates: [
    { key: "sourceAssessment", label: "旧模板编号" },
    { key: "sourceAssessmentName", label: "旧模板名称" },
    { key: "sourceDepartment", label: "适用部门" },
    { key: "sourceMPercent", label: "主管权重" },
    { key: "sourceTPercent", label: "时间权重" },
    { key: "sourceXPercent", label: "协作权重" },
    { key: "sourceCPercent", label: "公司权重" },
    { key: "sourceSPercent", label: "自评权重" },
    { key: "sourceTimekeep", label: "计入考勤" },
    { key: "sourceBonus", label: "计入奖惩" },
    { key: "sourceMaster", label: "主考核" },
    { key: "targetTemplateId", label: "现代模板", relation: true },
    { key: "targetTemplateVersionId", label: "现代模板版本", relation: true },
  ],
  levels: [
    { key: "sourceAssGrade", label: "旧等级" },
    { key: "sourceDescription", label: "等级说明" },
    { key: "sourceMyOrder", label: "旧排序" },
    { key: "sourceAssessmentId", label: "旧模板编号" },
    { key: "sourceMinValue", label: "最低分" },
    { key: "sourceMaxValue", label: "最高分" },
    { key: "legacyTemplateProfileId", label: "兼容模板关系", relation: true },
    { key: "targetTemplateVersionId", label: "现代模板版本", relation: true },
    { key: "targetLevelId", label: "现代等级", relation: true },
  ],
  dimensions: [
    { key: "sourceItemId", label: "旧项目编号" },
    { key: "sourceAssessmentId", label: "旧模板编号" },
    { key: "sourceItemName", label: "项目名称" },
    { key: "sourceFullValue", label: "项目满分" },
    { key: "sourceMyOrder", label: "旧排序" },
    { key: "legacyTemplateProfileId", label: "兼容模板关系", relation: true },
    { key: "targetTemplateVersionId", label: "现代模板版本", relation: true },
    { key: "targetDimensionId", label: "现代评价维度", relation: true },
  ],
  guides: [
    { key: "sourceGuideId", label: "旧说明编号" },
    { key: "sourceItemId", label: "旧项目编号" },
    { key: "sourceGrade", label: "旧等级" },
    { key: "sourceDescription", label: "评分说明" },
    { key: "sourceMinValue", label: "最低分" },
    { key: "sourceMaxValue", label: "最高分" },
    { key: "sourceMyOrder", label: "旧排序" },
    { key: "legacyDimensionProfileId", label: "兼容项目关系", relation: true },
    { key: "legacyLevelRuleId", label: "兼容等级关系", relation: true },
    { key: "targetTemplateVersionId", label: "现代模板版本", relation: true },
    { key: "targetDimensionId", label: "现代评价维度", relation: true },
    { key: "targetLevelId", label: "现代等级", relation: true },
  ],
  results: [
    { key: "sourceDetailId", label: "旧明细编号" },
    { key: "sourceSessionId", label: "旧考核批次" },
    { key: "sourcePersonCode", label: "旧人员编码" },
    { key: "sourceItemId", label: "旧项目编号" },
    { key: "sourceSelfValue", label: "自评分值" },
    { key: "sourceMItemValue", label: "主管分值" },
    { key: "sourceItemValue", label: "最终分值" },
    { key: "sourceXItemValue", label: "协作分值" },
    { key: "sourceCItemValue", label: "公司分值" },
    { key: "sourceSelfGrade", label: "自评等级" },
    { key: "sourceAssGrade", label: "考核等级" },
    { key: "sourceAppraisal", label: "评价说明" },
    { key: "legacyDimensionProfileId", label: "兼容项目关系", relation: true },
    { key: "targetCycleEmployeeId", label: "现代员工周期", relation: true },
    { key: "targetTemplateVersionId", label: "现代模板版本", relation: true },
    { key: "targetDimensionId", label: "现代评价维度", relation: true },
  ],
  masters: [
    { key: "sourceMasterId", label: "旧汇总编号" },
    { key: "sourceSessionId", label: "旧考核批次" },
    { key: "sourcePersonCode", label: "旧人员编码" },
    { key: "sourceSelfGrade", label: "自评等级" },
    { key: "sourceAssGrade", label: "考核等级" },
    { key: "sourceSelfValue", label: "自评汇总" },
    { key: "sourceItemValue", label: "项目汇总" },
    { key: "sourceMItemValue", label: "主管汇总" },
    { key: "sourceXItemValue", label: "协作汇总" },
    { key: "sourceCItemValue", label: "公司汇总" },
    { key: "sourceMasterValue", label: "主考核调整" },
    { key: "sourceTimekeepValue", label: "考勤调整" },
    { key: "sourceBonusValue", label: "奖惩调整" },
    { key: "sourceTotalValue", label: "旧系统总分" },
    { key: "sourceSelfAppraisal", label: "自我评价" },
    { key: "sourceAppraisal", label: "考核评价" },
    { key: "sourcePay", label: "绩效金额（按工资权限）" },
    { key: "sourceAssessmentPerson", label: "考核人" },
    { key: "sourceRecordedAt", label: "记录时间" },
    { key: "sourceOperatorCode", label: "操作员编码" },
    { key: "sourceDescription", label: "备注" },
    { key: "calculatedTotal", label: "兼容计算总分" },
    { key: "expectedAssGrade", label: "兼容计算等级" },
    { key: "winningMinValue", label: "命中最低分阈值" },
    { key: "winningCandidateCount", label: "同阈值候选数" },
    { key: "parityStatus", label: "复算一致性" },
    { key: "legacyTemplateProfileId", label: "兼容模板关系", relation: true },
    { key: "targetCycleEmployeeId", label: "现代员工周期", relation: true },
    { key: "targetTemplateVersionId", label: "现代模板版本", relation: true },
  ],
};

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function relationText(value: unknown) {
  return value === null || value === undefined || value === "" ? "未建立映射" : String(value);
}

function rowTitle(kind: LegacyKind, row: LegacyRow) {
  const values = row as unknown as Record<string, unknown>;
  if (kind === "templates") return valueText(values.sourceAssessmentName || values.sourceAssessment);
  if (kind === "levels") return `等级 ${valueText(values.sourceAssGrade)}`;
  if (kind === "dimensions") return valueText(values.sourceItemName || values.sourceItemId);
  if (kind === "guides") return `${valueText(values.sourceGrade)} · 项目 ${valueText(values.sourceItemId)}`;
  if (kind === "masters") return `批次 ${valueText(values.sourceSessionId)} · 人员 ${valueText(values.sourcePersonCode)}`;
  return `批次 ${valueText(values.sourceSessionId)} · 项目 ${valueText(values.sourceItemId)}`;
}

function Pager({ result, loading, onPage }: { result: LegacyPage; loading: boolean; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(result.total / result.page_size));
  if (result.total <= result.page_size) return null;
  return <nav className={styles.pager} aria-label="玉舟历史绩效分页">
    <button className="ds-button" type="button" disabled={loading || result.page === 1} onClick={() => onPage(result.page - 1)}>上一页</button>
    <span>第 {result.page} / {pages} 页</span>
    <button className="ds-button" type="button" disabled={loading || result.page >= pages} onClick={() => onPage(result.page + 1)}>下一页</button>
  </nav>;
}

export function HrPerformanceLegacyPanel() {
  const user = useAuthUser();
  const canDefinitions = hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ) || hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE);
  const canResults = [HR_PERMISSIONS.HR_PERFORMANCE_READ, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ].some(permission => hasPermission(user, permission));
  const available = useMemo(() => [...(canDefinitions ? definitionKinds : []), ...(canResults ? ["results" as const, "masters" as const] : [])], [canDefinitions, canResults]);
  const [kind, setKind] = useState<LegacyKind>(available[0] ?? "results");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<LegacyPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionText, setSessionText] = useState("");
  const [sessionFilter, setSessionFilter] = useState<number | undefined>();
  const [sessionError, setSessionError] = useState("");
  const [rubricAssessmentText, setRubricAssessmentText] = useState("");
  const [rubric, setRubric] = useState<HrPerformanceLegacyRubric | null>(null);
  const [rubricLoading, setRubricLoading] = useState(false);
  const [rubricError, setRubricError] = useState("");
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const rubricGeneration = useRef(0);
  const rubricRequest = useRef<AbortController | null>(null);
  const activeKind = available.includes(kind) ? kind : available[0] ?? "results";

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
      const response = activeKind === "templates" ? await hrApi.performanceLegacyTemplates(token, page, 20, controller.signal)
        : activeKind === "levels" ? await hrApi.performanceLegacyLevels(token, page, 20, controller.signal)
        : activeKind === "dimensions" ? await hrApi.performanceLegacyDimensions(token, page, 20, controller.signal)
        : activeKind === "guides" ? await hrApi.performanceLegacyGuides(token, page, 20, controller.signal)
        : activeKind === "masters" ? await hrApi.performanceLegacyMasters(token, page, 20, sessionFilter, controller.signal)
        : await hrApi.performanceLegacyResults(token, page, 20, sessionFilter, controller.signal);
      if (current === generation.current) setResult(response);
    } catch (cause) {
      if (current === generation.current && !controller.signal.aborted) {
        setResult({ ...EMPTY_PAGE, page });
        setError(hrLoadErrorMessage(cause, "加载玉舟历史绩效失败"));
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [activeKind, available, page, sessionFilter]);

  useEffect(() => {
    void load();
    return () => { generation.current++; request.current?.abort(); };
  }, [load]);

  useEffect(() => () => {
    rubricGeneration.current++;
    rubricRequest.current?.abort();
  }, []);

  if (!available.length) return null;
  const selectKind = (next: LegacyKind) => { setKind(next); setPage(1); setResult(EMPTY_PAGE); };
  const applySession = () => {
    const normalized = sessionText.trim();
    if (!normalized) {
      setSessionError("");
      setSessionFilter(undefined);
      setPage(1);
      return;
    }
    const sourceSessionId = Number(normalized);
    if (!/^\d+$/u.test(normalized) || !Number.isSafeInteger(sourceSessionId)) {
      setSessionError("请输入有效的旧考核批次编号。");
      return;
    }
    setSessionError("");
    setSessionFilter(sourceSessionId);
    setPage(1);
  };
  const loadRubric = async () => {
    const normalized = rubricAssessmentText.trim();
    const sourceAssessmentId = Number(normalized);
    if (!/^\d+$/u.test(normalized) || !Number.isSafeInteger(sourceAssessmentId)) {
      setRubric(null);
      setRubricError("请输入有效的旧考核表编号。");
      return;
    }
    const current = ++rubricGeneration.current;
    rubricRequest.current?.abort();
    const controller = new AbortController();
    rubricRequest.current = controller;
    setRubricLoading(true);
    setRubric(null);
    setRubricError("");
    try {
      const response = await hrApi.performanceLegacyRubric(sourceAssessmentId, getAccessToken(), controller.signal);
      if (current === rubricGeneration.current) setRubric(response);
    } catch (cause) {
      if (current === rubricGeneration.current && !controller.signal.aborted) {
        setRubricError(hrLoadErrorMessage(cause, "加载旧版动态评分表失败"));
      }
    } finally {
      if (current === rubricGeneration.current) setRubricLoading(false);
    }
  };

  return <section className="ds-panel" aria-labelledby="legacy-performance-heading">
    <div className={styles.heading}>
      <div><span className="ds-eyebrow">玉舟 V10 兼容层</span><h2 id="legacy-performance-heading">历史绩效与字段映射</h2></div>
      <span className={styles.count}>{loading ? "加载中…" : `${result.total} 条`}</span>
    </div>
    <p className={styles.note}>只读展示旧系统 29 个定义字段、12 个明细结果字段和 21 个汇总字段；同时显示旧公式复算总分、等级及一致性状态。</p>
    <div className={styles.tabs} role="tablist" aria-label="历史绩效数据类型">
      {available.map(item => <button key={item} type="button" role="tab" aria-selected={activeKind === item} className={activeKind === item ? styles.activeTab : styles.tab} onClick={() => selectKind(item)}>{labels[item]}</button>)}
    </div>
    {activeKind === "results" || activeKind === "masters" ? <div className={styles.filters}>
      <label className="form-field"><span>旧考核批次（可选）</span><input type="number" min="0" step="1" inputMode="numeric" value={sessionText} onChange={event => setSessionText(event.target.value)} /></label>
      <button className="ds-button" type="button" onClick={applySession} disabled={loading}>查询</button>
      {sessionFilter !== undefined ? <button className="ds-button" type="button" onClick={() => { setSessionText(""); setSessionError(""); setSessionFilter(undefined); setPage(1); }}>清除</button> : null}
      {sessionError ? <p className={styles.state} role="alert">{sessionError}</p> : null}
    </div> : null}
    {error ? <div className={styles.state} role="alert"><p>{error}</p><button className="ds-button" type="button" onClick={() => void load()}>重新加载</button></div> : null}
    {!error && loading && !result.items.length ? <p className={styles.state} aria-busy="true">正在加载历史绩效…</p> : null}
    {!error && !loading && !result.items.length ? <p className={styles.state}>当前授权范围内没有已验证的生产迁移记录。</p> : null}
    <div className={styles.records}>
      {result.items.map(row => {
        const values = row as unknown as Record<string, unknown>;
        return <details className={styles.record} key={row.id}>
          <summary><strong>{rowTitle(activeKind, row)}</strong><span>展开全部字段</span></summary>
          <dl className={styles.fieldGrid}>
            {fields[activeKind].map(field => <div className={field.relation ? styles.relationField : undefined} key={field.key}><dt>{field.label}{field.relation ? "（现代关系）" : ""}</dt><dd>{field.relation ? relationText(values[field.key]) : valueText(values[field.key])}</dd></div>)}
            <div className={styles.relationField}><dt>兼容记录 ID（现代关系）</dt><dd>{row.id}</dd></div>
          </dl>
        </details>;
      })}
    </div>
    <Pager result={result} loading={loading} onPage={setPage} />
    {canDefinitions ? <section className={styles.rubric} aria-labelledby="legacy-rubric-heading">
      <div className={styles.heading}><div><span className="ds-eyebrow">旧过程 u_printassessment</span><h3 id="legacy-rubric-heading">旧版动态评分表</h3></div></div>
      <p className={styles.note}>按旧考核表编号读取项目，并按旧等级顺序横向展开评分说明；源等级定义缺失时仍保留项目，不补造等级。</p>
      <div className={styles.filters}>
        <label className="form-field"><span>旧考核表编号</span><input type="number" min="0" step="1" inputMode="numeric" value={rubricAssessmentText} onChange={event => setRubricAssessmentText(event.target.value)} /></label>
        <button className="ds-button ds-button-primary" type="button" disabled={rubricLoading} onClick={() => void loadRubric()}>{rubricLoading ? "加载中…" : "生成评分表"}</button>
      </div>
      {rubricError ? <p className={styles.state} role="alert">{rubricError}</p> : null}
      {rubric && !rubric.items.length ? <p className={styles.state}>该旧考核表没有可见项目。</p> : null}
      {rubric?.items.length ? <>
        <p className={styles.note}>考核表 #{rubric.sourceAssessmentId}</p>
        {!rubric.levels.length ? <p className={styles.warning} role="note">源库没有该考核表的等级定义；以下项目按原值保留，未伪造评分等级。</p> : null}
        <div className={`ds-table-shell ${styles.rubricTable}`}><table><thead><tr><th>考核项目</th><th>满分</th>{rubric.levels.map(level => <th key={level.sourceAssGrade}>{level.sourceAssGrade}</th>)}</tr></thead><tbody>{rubric.items.map(item => <tr key={item.sourceItemId}><td>{valueText(item.sourceItemName || item.sourceItemId)}</td><td>{valueText(item.sourceFullValue)}</td>{rubric.levels.map(level => <td key={level.sourceAssGrade}>{valueText(item.descriptions[level.sourceAssGrade])}</td>)}</tr>)}</tbody></table></div>
        <div className={`ds-mobile-record-list ${styles.rubricMobile}`}>{rubric.items.map(item => <article className="ds-mobile-record" key={item.sourceItemId}><strong>{valueText(item.sourceItemName || item.sourceItemId)}</strong><span>满分 {valueText(item.sourceFullValue)}</span>{rubric.levels.map(level => <span key={level.sourceAssGrade}>{level.sourceAssGrade}：{valueText(item.descriptions[level.sourceAssGrade])}</span>)}</article>)}</div>
      </> : null}
    </section> : null}
  </section>;
}
