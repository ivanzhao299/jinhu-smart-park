"use client";

import { Card, DataTable, DataTableActions } from "@jinhu/ui";
import { CheckCircle2, Edit3, Eye, Lock, Plus, Search, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringAcceptancesApi } from "../../../../lib/engineering-acceptances-api";
import { engineeringAcceptanceStatusOptions, engineeringAcceptanceTypeOptions } from "../../../../lib/engineering-acceptances-display";
import { ENGINEERING_ACCEPTANCE_PERMISSIONS, hasEngineeringAcceptancePermission } from "../../../../lib/engineering-acceptances-permissions";
import type {
  EngineeringAcceptance,
  EngineeringAcceptancePage,
  EngineeringAcceptanceQuery,
  EngineeringAcceptanceStatus,
  EngineeringAcceptanceType,
  ReviewEngineeringAcceptanceInput
} from "../../../../lib/engineering-acceptances-types";
import {
  isAcceptanceClosable,
  isAcceptanceDeletable,
  isAcceptanceEditable,
  isAcceptanceReviewable,
  isAcceptanceSubmittable
} from "../../../../lib/engineering-acceptances-utils";
import { engineeringRiskLevelOptions } from "../../../../lib/engineering-projects-display";
import type { EngineeringRiskLevel } from "../../../../lib/engineering-projects-types";
import {
  AcceptanceReviewDrawer,
  AcceptanceStatusPill,
  AcceptanceTypePill,
  ForbiddenEngineeringAcceptance,
  MessageLine,
  formatDate,
  formatDateTime
} from "./EngineeringAcceptanceShared";
import styles from "../../projects/engineering-projects.module.css";

interface FilterState {
  keyword: string;
  projectId: string;
  planId: string;
  acceptanceType: EngineeringAcceptanceType | "";
  acceptanceStatus: EngineeringAcceptanceStatus | "";
  riskLevel: EngineeringRiskLevel | "";
  responsibleUserId: string;
  acceptanceOrgId: string;
  contractorOrgId: string;
  plannedDateFrom: string;
  plannedDateTo: string;
}

const emptyPage: EngineeringAcceptancePage = { items: [], total: 0, page: 1, page_size: 20 };

export function EngineeringAcceptancesListClient() {
  const searchParams = useSearchParams();
  const authUser = useAuthUser();
  const canView = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.VIEW);
  const canCreate = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.CREATE);
  const canUpdate = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.UPDATE);
  const canDelete = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.DELETE);
  const canSubmit = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.SUBMIT);
  const canReview = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.REVIEW);
  const canClose = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.CLOSE);
  const [filters, setFilters] = useState<FilterState>({
    keyword: "",
    projectId: searchParams.get("projectId") ?? searchParams.get("project_id") ?? "",
    planId: "",
    acceptanceType: "",
    acceptanceStatus: "",
    riskLevel: "",
    responsibleUserId: "",
    acceptanceOrgId: "",
    contractorOrgId: "",
    plannedDateFrom: "",
    plannedDateTo: ""
  });
  const [pageData, setPageData] = useState<EngineeringAcceptancePage>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewTarget, setReviewTarget] = useState<EngineeringAcceptance | null>(null);
  const [operationSaving, setOperationSaving] = useState(false);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setMessage("");
    try {
      const data = await engineeringAcceptancesApi.listAcceptances(toQuery(filters, page), getAccessToken());
      setPageData(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程验收失败");
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

  async function submit(row: EngineeringAcceptance) {
    if (!window.confirm(`确认提交工程验收「${row.acceptanceCode}」？提交后进入评审。`)) return;
    setMessage("");
    try {
      await engineeringAcceptancesApi.submitAcceptance(row.id, getAccessToken());
      setMessage("提交成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交工程验收失败");
    }
  }

  async function review(input: ReviewEngineeringAcceptanceInput) {
    if (!reviewTarget) return;
    setOperationSaving(true);
    setMessage("");
    try {
      await engineeringAcceptancesApi.reviewAcceptance(reviewTarget.id, input, getAccessToken());
      setReviewTarget(null);
      setMessage("评审完成");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评审工程验收失败");
    } finally {
      setOperationSaving(false);
    }
  }

  async function close(row: EngineeringAcceptance) {
    if (!window.confirm(`确认关闭工程验收「${row.acceptanceCode}」？`)) return;
    setMessage("");
    try {
      await engineeringAcceptancesApi.closeAcceptance(row.id, getAccessToken());
      setMessage("关闭成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "关闭工程验收失败");
    }
  }

  async function remove(row: EngineeringAcceptance) {
    if (!window.confirm(`确认删除工程验收「${row.acceptanceCode}」？此操作会执行软删除。`)) return;
    setMessage("");
    try {
      await engineeringAcceptancesApi.deleteAcceptance(row.id, getAccessToken());
      setMessage("删除成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除工程验收失败");
    }
  }

  if (!canView) return <ForbiddenEngineeringAcceptance />;

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>工程验收</strong>
          <span>管理隐蔽工程、阶段、专项、竣工和移交预验收。</span>
        </div>
        {canCreate ? (
          <Link className="primary-button" href={filters.projectId ? `/engineering/acceptances/new?projectId=${filters.projectId}` : "/engineering/acceptances/new"}>
            <Plus size={16} />
            新建验收
          </Link>
        ) : null}
      </header>

      <Card>
        <form className={styles.filters} onSubmit={(event) => void search(event)}>
          <TextFilter label="关键词" value={filters.keyword} placeholder="编号 / 名称 / 描述" onChange={(value) => setFilter("keyword", value)} />
          <TextFilter label="项目 ID" value={filters.projectId} onChange={(value) => setFilter("projectId", value)} />
          <TextFilter label="计划 ID" value={filters.planId} onChange={(value) => setFilter("planId", value)} />
          <SelectFilter label="验收类型" value={filters.acceptanceType} options={engineeringAcceptanceTypeOptions} onChange={(value) => setFilter("acceptanceType", value as EngineeringAcceptanceType | "")} />
          <SelectFilter label="验收状态" value={filters.acceptanceStatus} options={engineeringAcceptanceStatusOptions} onChange={(value) => setFilter("acceptanceStatus", value as EngineeringAcceptanceStatus | "")} />
          <SelectFilter label="风险等级" value={filters.riskLevel} options={engineeringRiskLevelOptions} onChange={(value) => setFilter("riskLevel", value as EngineeringRiskLevel | "")} />
          <TextFilter label="责任人 ID" value={filters.responsibleUserId} onChange={(value) => setFilter("responsibleUserId", value)} />
          <TextFilter label="验收组织 ID" value={filters.acceptanceOrgId} onChange={(value) => setFilter("acceptanceOrgId", value)} />
          <TextFilter label="计划日期自" value={filters.plannedDateFrom} type="date" onChange={(value) => setFilter("plannedDateFrom", value)} />
          <TextFilter label="计划日期至" value={filters.plannedDateTo} type="date" onChange={(value) => setFilter("plannedDateTo", value)} />
          <button className="primary-button" type="submit" disabled={loading}>
            <Search size={16} />
            查询
          </button>
        </form>
      </Card>

      <Card className="table-scroll">
        <DataTable>
          <thead>
            <tr>
              <th>验收编号</th>
              <th>名称</th>
              <th>类型</th>
              <th>状态</th>
              <th>计划日期</th>
              <th>实际日期</th>
              <th>责任人</th>
              <th>提交/评审</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {pageData.items.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.acceptanceCode}</strong></td>
                <td>{row.acceptanceName}</td>
                <td><AcceptanceTypePill type={row.acceptanceType} /></td>
                <td><AcceptanceStatusPill status={row.acceptanceStatus} /></td>
                <td>{formatDate(row.plannedAcceptanceDate)}</td>
                <td>{formatDate(row.actualAcceptanceDate)}</td>
                <td>{row.responsibleUserId ?? row.acceptanceOrgId ?? "-"}</td>
                <td>{formatDateTime(row.submittedAt)}<br /><small>{formatDateTime(row.reviewedAt)}</small></td>
                <td>
                  <DataTableActions>
                    <Link aria-label="查看" href={`/engineering/acceptances/${row.id}`}><Eye size={16} /></Link>
                    {canUpdate && isAcceptanceEditable(row.acceptanceStatus) ? <Link aria-label="编辑" href={`/engineering/acceptances/${row.id}/edit`}><Edit3 size={16} /></Link> : null}
                    {canSubmit && isAcceptanceSubmittable(row.acceptanceStatus) ? <button aria-label="提交" type="button" onClick={() => void submit(row)}><Send size={16} /></button> : null}
                    {canReview && isAcceptanceReviewable(row.acceptanceStatus) ? <button aria-label="评审" type="button" onClick={() => setReviewTarget(row)}><CheckCircle2 size={16} /></button> : null}
                    {canClose && isAcceptanceClosable(row.acceptanceStatus) ? <button aria-label="关闭" type="button" onClick={() => void close(row)}><Lock size={16} /></button> : null}
                    {canDelete && isAcceptanceDeletable(row.acceptanceStatus) ? <button aria-label="删除" type="button" onClick={() => void remove(row)}><Trash2 size={16} /></button> : null}
                  </DataTableActions>
                </td>
              </tr>
            ))}
            {pageData.items.length === 0 ? (
              <tr>
                <td colSpan={9}>{loading ? "加载中..." : "暂无工程验收"}</td>
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

      {reviewTarget ? <AcceptanceReviewDrawer acceptance={reviewTarget} saving={operationSaving} onClose={() => setReviewTarget(null)} onSubmit={review} /> : null}
      <MessageLine message={message} />
    </main>
  );

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
}

function toQuery(filters: FilterState, page: number): EngineeringAcceptanceQuery {
  return {
    keyword: filters.keyword.trim(),
    project_id: filters.projectId.trim(),
    plan_id: filters.planId.trim(),
    acceptance_type: filters.acceptanceType,
    acceptance_status: filters.acceptanceStatus,
    risk_level: filters.riskLevel,
    responsible_user_id: filters.responsibleUserId.trim(),
    acceptance_org_id: filters.acceptanceOrgId.trim(),
    contractor_org_id: filters.contractorOrgId.trim(),
    planned_date_from: filters.plannedDateFrom,
    planned_date_to: filters.plannedDateTo,
    page,
    page_size: 20
  };
}

function TextFilter({ label, value, onChange, placeholder, type = "text" }: {
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

function SelectFilter<T extends string>({ label, value, options, onChange }: {
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
