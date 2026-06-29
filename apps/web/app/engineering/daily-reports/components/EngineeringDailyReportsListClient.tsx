"use client";

import { Card, DataTable, DataTableActions } from "@jinhu/ui";
import { CheckCircle2, Edit3, Eye, Plus, Search, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringDailyReportsApi } from "../../../../lib/engineering-daily-reports-api";
import { engineeringDailyReportStatusOptions, engineeringWeatherTypeOptions } from "../../../../lib/engineering-daily-reports-display";
import { ENGINEERING_DAILY_REPORT_PERMISSIONS, hasEngineeringDailyReportPermission } from "../../../../lib/engineering-daily-reports-permissions";
import type {
  EngineeringDailyReport,
  EngineeringDailyReportPage,
  EngineeringDailyReportQuery,
  EngineeringDailyReportStatus,
  EngineeringWeatherType,
  ReviewEngineeringDailyReportInput
} from "../../../../lib/engineering-daily-reports-types";
import { isDailyReportEditable, isDailyReportReviewable, isDailyReportSubmittable } from "../../../../lib/engineering-daily-reports-utils";
import {
  DailyReportProgressBar,
  DailyReportReviewDrawer,
  DailyReportStatusPill,
  ForbiddenEngineeringDailyReport,
  MessageLine,
  WeatherPill,
  formatDate,
  formatDateTime
} from "./EngineeringDailyReportShared";
import styles from "../../projects/engineering-projects.module.css";

interface FilterState {
  keyword: string;
  projectId: string;
  planId: string;
  reportStatus: EngineeringDailyReportStatus | "";
  weather: EngineeringWeatherType | "";
  contractorOrgId: string;
  supervisorOrgId: string;
  reportDateFrom: string;
  reportDateTo: string;
}

const emptyPage: EngineeringDailyReportPage = { items: [], total: 0, page: 1, page_size: 20 };

export function EngineeringDailyReportsListClient() {
  const searchParams = useSearchParams();
  const authUser = useAuthUser();
  const canView = hasEngineeringDailyReportPermission(authUser, ENGINEERING_DAILY_REPORT_PERMISSIONS.VIEW);
  const canCreate = hasEngineeringDailyReportPermission(authUser, ENGINEERING_DAILY_REPORT_PERMISSIONS.CREATE);
  const canUpdate = hasEngineeringDailyReportPermission(authUser, ENGINEERING_DAILY_REPORT_PERMISSIONS.UPDATE);
  const canDelete = hasEngineeringDailyReportPermission(authUser, ENGINEERING_DAILY_REPORT_PERMISSIONS.DELETE);
  const canSubmit = hasEngineeringDailyReportPermission(authUser, ENGINEERING_DAILY_REPORT_PERMISSIONS.SUBMIT);
  const canReview = hasEngineeringDailyReportPermission(authUser, ENGINEERING_DAILY_REPORT_PERMISSIONS.REVIEW);
  const initialProjectId = searchParams.get("projectId") ?? searchParams.get("project_id") ?? "";
  const [filters, setFilters] = useState<FilterState>({
    keyword: "",
    projectId: initialProjectId,
    planId: "",
    reportStatus: "",
    weather: "",
    contractorOrgId: "",
    supervisorOrgId: "",
    reportDateFrom: "",
    reportDateTo: ""
  });
  const [pageData, setPageData] = useState<EngineeringDailyReportPage>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewReport, setReviewReport] = useState<EngineeringDailyReport | null>(null);
  const [operationSaving, setOperationSaving] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const summaryCards = useMemo(() => {
    const editableCount = pageData.items.filter((item) => item.reportStatus === "DRAFT" || item.reportStatus === "REJECTED").length;
    const submittedCount = pageData.items.filter((item) => item.reportStatus === "SUBMITTED").length;
    const reviewedCount = pageData.items.filter((item) => item.reportStatus === "REVIEWED").length;

    return [
      { label: "日报池", value: pageData.total, hint: "当前筛选条件下的施工日报总量。", tone: "primary" },
      { label: "待整理", value: editableCount, hint: "草稿或已驳回日报，需要继续补齐内容。", tone: "warning" },
      { label: "待审核", value: submittedCount, hint: "已提交但尚未形成审核结论的日报。", tone: "danger" },
      { label: "已审核", value: reviewedCount, hint: "可以沉淀为后续巡检、结算和归档依据。", tone: "success" }
    ] as const;
  }, [pageData]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setMessage("");
    try {
      const data = await engineeringDailyReportsApi.listDailyReports(toQuery(filters, page), getAccessToken());
      setPageData(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载施工日报失败");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!canView) return;
    void load(1);
  }, [canView, load]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load(1);
  }

  async function submit(row: EngineeringDailyReport) {
    if (!window.confirm(`确认提交施工日报「${row.reportCode}」？提交后需审核。`)) {
      return;
    }
    setMessage("");
    try {
      await engineeringDailyReportsApi.submitDailyReport(row.id, getAccessToken());
      setMessage("提交成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交施工日报失败");
    }
  }

  async function review(input: ReviewEngineeringDailyReportInput) {
    if (!reviewReport) return;
    setOperationSaving(true);
    setMessage("");
    try {
      await engineeringDailyReportsApi.reviewDailyReport(reviewReport.id, input, getAccessToken());
      setReviewReport(null);
      setMessage(input.approved ? "审核通过" : "已驳回");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "审核施工日报失败");
    } finally {
      setOperationSaving(false);
    }
  }

  async function remove(row: EngineeringDailyReport) {
    if (!window.confirm(`确认删除施工日报「${row.reportCode}」？此操作会执行软删除。`)) {
      return;
    }
    setMessage("");
    try {
      await engineeringDailyReportsApi.deleteDailyReport(row.id, getAccessToken());
      setMessage("删除成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除施工日报失败");
    }
  }

  if (!canView) {
    return <ForbiddenEngineeringDailyReport />;
  }

  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <header className="header">
        <div className="header-title">
          <strong>施工日报</strong>
          <span>记录每日施工内容、人员、机械、材料、质量安全和问题闭环资料</span>
        </div>
        {canCreate ? (
          <Link className="primary-button" href={filters.projectId ? `/engineering/daily-reports/new?projectId=${filters.projectId}` : "/engineering/daily-reports/new"}>
            <Plus size={16} />
            新建日报
          </Link>
        ) : null}
      </header>

      <section className={styles.summaryGrid} aria-label="施工日报摘要">
        {summaryCards.map((card) => (
          <article className={styles.summaryCard} data-tone={card.tone} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.hint}</small>
          </article>
        ))}
      </section>

      <Card className="ds-panel">
        <form className={styles.filters} onSubmit={(event) => void search(event)}>
          <TextFilter label="关键词" value={filters.keyword} placeholder="编号 / 内容 / 问题" onChange={(value) => setFilter("keyword", value)} />
          <TextFilter label="项目 ID" value={filters.projectId} onChange={(value) => setFilter("projectId", value)} />
          <TextFilter label="计划 ID" value={filters.planId} onChange={(value) => setFilter("planId", value)} />
          <SelectFilter label="日报状态" value={filters.reportStatus} options={engineeringDailyReportStatusOptions} onChange={(value) => setFilter("reportStatus", value as EngineeringDailyReportStatus | "")} />
          <SelectFilter label="天气" value={filters.weather} options={engineeringWeatherTypeOptions} onChange={(value) => setFilter("weather", value as EngineeringWeatherType | "")} />
          <TextFilter label="施工单位 ID" value={filters.contractorOrgId} onChange={(value) => setFilter("contractorOrgId", value)} />
          <TextFilter label="监理单位 ID" value={filters.supervisorOrgId} onChange={(value) => setFilter("supervisorOrgId", value)} />
          <TextFilter label="日报日期自" value={filters.reportDateFrom} type="date" onChange={(value) => setFilter("reportDateFrom", value)} />
          <TextFilter label="日报日期至" value={filters.reportDateTo} type="date" onChange={(value) => setFilter("reportDateTo", value)} />
          <button className="primary-button" type="submit" disabled={loading}>
            <Search size={16} />
            查询
          </button>
        </form>
      </Card>

      <Card className="table-scroll ds-table-shell">
        <DataTable>
          <thead>
            <tr>
              <th>日报编号</th>
              <th>日报日期</th>
              <th>项目 ID</th>
              <th>计划 ID</th>
              <th>状态</th>
              <th>天气</th>
              <th>人员</th>
              <th>进度</th>
              <th>施工单位</th>
              <th>监理单位</th>
              <th>提交</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {pageData.items.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.reportCode}</strong></td>
                <td>{formatDate(row.reportDate)}</td>
                <td>{row.projectId}</td>
                <td>{row.planId ?? "-"}</td>
                <td><DailyReportStatusPill status={row.reportStatus} /></td>
                <td><WeatherPill weather={row.weather} /></td>
                <td>{row.workerCount} 工人 / {row.managerCount} 管理</td>
                <td><DailyReportProgressBar value={row.progressPercent} /></td>
                <td>{row.contractorOrgId ?? "-"}</td>
                <td>{row.supervisorOrgId ?? "-"}</td>
                <td>{row.submittedBy ?? "-"}<br /><small>{formatDateTime(row.submittedAt)}</small></td>
                <td>
                  <DataTableActions>
                    <Link aria-label="查看" href={`/engineering/daily-reports/${row.id}`}><Eye size={16} /></Link>
                    {canUpdate && isDailyReportEditable(row.reportStatus) ? <Link aria-label="编辑" href={`/engineering/daily-reports/${row.id}/edit`}><Edit3 size={16} /></Link> : null}
                    {canSubmit && isDailyReportSubmittable(row.reportStatus) ? <button aria-label="提交" type="button" onClick={() => void submit(row)}><Send size={16} /></button> : null}
                    {canReview && isDailyReportReviewable(row.reportStatus) ? <button aria-label="审核" type="button" onClick={() => setReviewReport(row)}><CheckCircle2 size={16} /></button> : null}
                    {canDelete && isDailyReportEditable(row.reportStatus) ? <button aria-label="删除" type="button" onClick={() => void remove(row)}><Trash2 size={16} /></button> : null}
                  </DataTableActions>
                </td>
              </tr>
            ))}
            {pageData.items.length === 0 ? (
              <tr>
                <td colSpan={12}>{loading ? "加载中..." : "暂无施工日报"}</td>
              </tr>
            ) : null}
          </tbody>
        </DataTable>
        <div className={styles.paginationBar}>
          <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
          <div>
            <button className="pagination-button" type="button" disabled={loading || pageData.page <= 1} onClick={() => void load(pageData.page - 1)}>上一页</button>
            <button className="pagination-button" type="button" disabled={loading || pageData.page >= totalPages} onClick={() => void load(pageData.page + 1)}>下一页</button>
          </div>
        </div>
      </Card>

      {reviewReport ? <DailyReportReviewDrawer report={reviewReport} saving={operationSaving} onClose={() => setReviewReport(null)} onSubmit={review} /> : null}
      <MessageLine message={message} />
    </main>
  );

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
}

function toQuery(filters: FilterState, page: number): EngineeringDailyReportQuery {
  return {
    keyword: filters.keyword.trim(),
    project_id: filters.projectId.trim(),
    plan_id: filters.planId.trim(),
    report_status: filters.reportStatus,
    weather: filters.weather,
    contractor_org_id: filters.contractorOrgId.trim(),
    supervisor_org_id: filters.supervisorOrgId.trim(),
    report_date_from: filters.reportDateFrom,
    report_date_to: filters.reportDateTo,
    page,
    page_size: 20
  };
}

function TextFilter({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "date";
}) {
  return (
    <label className={styles.formField}>
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectFilter<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T | "";
  options: Array<{ value: T; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">全部</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
