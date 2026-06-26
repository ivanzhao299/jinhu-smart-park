"use client";

import { Card, DataTable, DataTableActions, StatusPill } from "@jinhu/ui";
import { Edit3, Eye, Gauge, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringPlansApi } from "../../../../lib/engineering-plans-api";
import { engineeringPlanLevelOptions, engineeringPlanStatusOptions, engineeringPlanTypeOptions } from "../../../../lib/engineering-plans-display";
import { ENGINEERING_PLAN_PERMISSIONS, hasEngineeringPlanPermission } from "../../../../lib/engineering-plans-permissions";
import type {
  EngineeringPlan,
  EngineeringPlanLevel,
  EngineeringPlanPage,
  EngineeringPlanQuery,
  EngineeringPlanStatus,
  EngineeringPlanType,
  UpdateEngineeringPlanProgressInput,
  UpdateEngineeringPlanStatusInput
} from "../../../../lib/engineering-plans-types";
import {
  ForbiddenEngineeringPlan,
  MessageLine,
  PlanLevelPill,
  PlanProgressBar,
  PlanProgressDrawer,
  PlanRiskPill,
  PlanStatusDrawer,
  PlanStatusPill,
  PlanTypePill,
  formatDate
} from "./EngineeringPlanShared";
import styles from "../../projects/engineering-projects.module.css";

interface FilterState {
  keyword: string;
  projectId: string;
  planType: EngineeringPlanType | "";
  status: EngineeringPlanStatus | "";
  planLevel: EngineeringPlanLevel | "";
  ownerUserId: string;
  ownerOrgId: string;
  contractorOrgId: string;
  plannedStartFrom: string;
  plannedStartTo: string;
}

const emptyPage: EngineeringPlanPage = { items: [], total: 0, page: 1, page_size: 20 };

export function EngineeringPlansListClient() {
  const searchParams = useSearchParams();
  const authUser = useAuthUser();
  const canView = hasEngineeringPlanPermission(authUser, ENGINEERING_PLAN_PERMISSIONS.VIEW);
  const canCreate = hasEngineeringPlanPermission(authUser, ENGINEERING_PLAN_PERMISSIONS.CREATE);
  const canUpdate = hasEngineeringPlanPermission(authUser, ENGINEERING_PLAN_PERMISSIONS.UPDATE);
  const initialProjectId = searchParams.get("projectId") ?? searchParams.get("project_id") ?? "";
  const [filters, setFilters] = useState<FilterState>({
    keyword: "",
    projectId: initialProjectId,
    planType: "",
    status: "",
    planLevel: "",
    ownerUserId: "",
    ownerOrgId: "",
    contractorOrgId: "",
    plannedStartFrom: "",
    plannedStartTo: ""
  });
  const [pageData, setPageData] = useState<EngineeringPlanPage>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [progressPlan, setProgressPlan] = useState<EngineeringPlan | null>(null);
  const [statusPlan, setStatusPlan] = useState<EngineeringPlan | null>(null);
  const [operationSaving, setOperationSaving] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setMessage("");
    try {
      const data = await engineeringPlansApi.listPlans(toQuery(filters, page), getAccessToken());
      setPageData(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程计划失败");
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

  async function remove(row: EngineeringPlan) {
    if (!window.confirm(`确认删除工程计划「${row.planName}」？此操作会执行软删除。`)) {
      return;
    }
    setMessage("");
    try {
      await engineeringPlansApi.deletePlan(row.id, getAccessToken());
      setMessage("删除成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除工程计划失败");
    }
  }

  async function updateProgress(input: UpdateEngineeringPlanProgressInput) {
    if (!progressPlan) return;
    setOperationSaving(true);
    setMessage("");
    try {
      await engineeringPlansApi.updatePlanProgress(progressPlan.id, input, getAccessToken());
      setProgressPlan(null);
      setMessage("进度更新成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新进度失败");
    } finally {
      setOperationSaving(false);
    }
  }

  async function updateStatus(input: UpdateEngineeringPlanStatusInput) {
    if (!statusPlan) return;
    setOperationSaving(true);
    setMessage("");
    try {
      await engineeringPlansApi.updatePlanStatus(statusPlan.id, input, getAccessToken());
      setStatusPlan(null);
      setMessage("状态更新成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新状态失败");
    } finally {
      setOperationSaving(false);
    }
  }

  if (!canView) {
    return <ForbiddenEngineeringPlan />;
  }

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>工程计划</strong>
          <span>总计划、阶段计划、周计划、日计划、专项计划和里程碑跟踪</span>
        </div>
        {canCreate ? (
          <Link className="primary-button" href={filters.projectId ? `/engineering/plans/new?projectId=${filters.projectId}` : "/engineering/plans/new"}>
            <Plus size={16} />
            新建计划
          </Link>
        ) : null}
      </header>

      <Card>
        <form className={styles.filters} onSubmit={(event) => void search(event)}>
          <TextFilter label="关键词" value={filters.keyword} placeholder="计划编号 / 名称 / 描述" onChange={(value) => setFilter("keyword", value)} />
          <TextFilter label="项目 ID" value={filters.projectId} onChange={(value) => setFilter("projectId", value)} />
          <SelectFilter label="计划类型" value={filters.planType} options={engineeringPlanTypeOptions} onChange={(value) => setFilter("planType", value as EngineeringPlanType | "")} />
          <SelectFilter label="计划状态" value={filters.status} options={engineeringPlanStatusOptions} onChange={(value) => setFilter("status", value as EngineeringPlanStatus | "")} />
          <SelectFilter label="计划层级" value={filters.planLevel} options={engineeringPlanLevelOptions} onChange={(value) => setFilter("planLevel", value as EngineeringPlanLevel | "")} />
          <TextFilter label="责任人 ID" value={filters.ownerUserId} onChange={(value) => setFilter("ownerUserId", value)} />
          <TextFilter label="责任单位 ID" value={filters.ownerOrgId} onChange={(value) => setFilter("ownerOrgId", value)} />
          <TextFilter label="施工单位 ID" value={filters.contractorOrgId} onChange={(value) => setFilter("contractorOrgId", value)} />
          <TextFilter label="计划开始自" value={filters.plannedStartFrom} type="date" onChange={(value) => setFilter("plannedStartFrom", value)} />
          <TextFilter label="计划开始至" value={filters.plannedStartTo} type="date" onChange={(value) => setFilter("plannedStartTo", value)} />
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
              <th>计划编号</th>
              <th>计划名称</th>
              <th>项目 ID</th>
              <th>类型</th>
              <th>层级</th>
              <th>状态</th>
              <th>计划周期</th>
              <th>实际进度</th>
              <th>延期</th>
              <th>责任人</th>
              <th>施工单位</th>
              <th>风险</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {pageData.items.map((row) => (
              <tr key={row.id}>
                <td>{row.planCode}</td>
                <td><strong>{row.planName}</strong></td>
                <td>{row.projectId}</td>
                <td><PlanTypePill type={row.planType} /></td>
                <td><PlanLevelPill level={row.planLevel} /></td>
                <td><PlanStatusPill status={row.status} /></td>
                <td>{formatDate(row.plannedStartDate)} - {formatDate(row.plannedEndDate)}</td>
                <td><PlanProgressBar value={row.actualProgressPercent} /></td>
                <td>{row.delayDays > 0 ? <StatusPill variant="warning">{row.delayDays} 天</StatusPill> : "-"}</td>
                <td>{row.ownerUserId ?? "-"}</td>
                <td>{row.contractorOrgId ?? "-"}</td>
                <td><PlanRiskPill risk={row.riskLevel} /></td>
                <td>
                  <DataTableActions>
                    <Link aria-label="查看" href={`/engineering/plans/${row.id}`}><Eye size={16} /></Link>
                    {canUpdate ? <Link aria-label="编辑" href={`/engineering/plans/${row.id}/edit`}><Edit3 size={16} /></Link> : null}
                    {canUpdate ? <button aria-label="更新进度" type="button" onClick={() => setProgressPlan(row)}><Gauge size={16} /></button> : null}
                    {canUpdate ? <button aria-label="更新状态" type="button" onClick={() => setStatusPlan(row)}><RefreshCw size={16} /></button> : null}
                    {canUpdate ? <button aria-label="删除" type="button" onClick={() => void remove(row)}><Trash2 size={16} /></button> : null}
                  </DataTableActions>
                </td>
              </tr>
            ))}
            {pageData.items.length === 0 ? (
              <tr>
                <td colSpan={13}>{loading ? "加载中..." : "暂无工程计划"}</td>
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

      {progressPlan ? <PlanProgressDrawer plan={progressPlan} saving={operationSaving} onClose={() => setProgressPlan(null)} onSubmit={updateProgress} /> : null}
      {statusPlan ? <PlanStatusDrawer plan={statusPlan} saving={operationSaving} onClose={() => setStatusPlan(null)} onSubmit={updateStatus} /> : null}
      <MessageLine message={message} />
    </main>
  );

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
}

function toQuery(filters: FilterState, page: number): EngineeringPlanQuery {
  return {
    keyword: filters.keyword.trim(),
    project_id: filters.projectId.trim(),
    plan_type: filters.planType,
    status: filters.status,
    plan_level: filters.planLevel,
    owner_user_id: filters.ownerUserId.trim(),
    owner_org_id: filters.ownerOrgId.trim(),
    contractor_org_id: filters.contractorOrgId.trim(),
    planned_start_from: filters.plannedStartFrom,
    planned_start_to: filters.plannedStartTo,
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
