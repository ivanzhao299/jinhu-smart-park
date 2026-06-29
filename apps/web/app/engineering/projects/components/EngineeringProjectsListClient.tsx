"use client";

import { Card, DataTable, DataTableActions } from "@jinhu/ui";
import { Edit3, Eye, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import {
  engineeringProjectLevelOptions,
  engineeringProjectStatusOptions,
  engineeringProjectTypeOptions,
  engineeringRiskLevelOptions
} from "../../../../lib/engineering-projects-display";
import { engineeringProjectsApi } from "../../../../lib/engineering-projects-api";
import { ENGINEERING_PROJECT_PERMISSIONS, hasEngineeringProjectPermission } from "../../../../lib/engineering-projects-permissions";
import type { EngineeringProject, EngineeringProjectLevel, EngineeringProjectPage, EngineeringProjectQuery, EngineeringProjectStatus, EngineeringProjectType, EngineeringRiskLevel } from "../../../../lib/engineering-projects-types";
import { ForbiddenEngineeringProject, LevelPill, MessageLine, ProjectStatusPill, ProjectTypePill, RiskPill, formatDate, formatMoney, formatPercent } from "./EngineeringProjectShared";
import styles from "../engineering-projects.module.css";

interface FilterState {
  keyword: string;
  projectType: EngineeringProjectType | "";
  status: EngineeringProjectStatus | "";
  projectLevel: EngineeringProjectLevel | "";
  riskLevel: EngineeringRiskLevel | "";
  parkId: string;
  projectManagerId: string;
  plannedStartFrom: string;
  plannedStartTo: string;
}

const emptyPage: EngineeringProjectPage = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: FilterState = {
  keyword: "",
  projectType: "",
  status: "",
  projectLevel: "",
  riskLevel: "",
  parkId: "",
  projectManagerId: "",
  plannedStartFrom: "",
  plannedStartTo: ""
};

export function EngineeringProjectsListClient() {
  const authUser = useAuthUser();
  const canView = hasEngineeringProjectPermission(authUser, ENGINEERING_PROJECT_PERMISSIONS.VIEW);
  const canCreate = hasEngineeringProjectPermission(authUser, ENGINEERING_PROJECT_PERMISSIONS.CREATE);
  const canUpdate = hasEngineeringProjectPermission(authUser, ENGINEERING_PROJECT_PERMISSIONS.UPDATE);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [pageData, setPageData] = useState<EngineeringProjectPage>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const summaryCards = useMemo(() => {
    const activeCount = pageData.items.filter((item) => ["EXECUTING", "INSPECTING", "RECTIFYING", "ACCEPTING"].includes(item.status)).length;
    const approvalCount = pageData.items.filter((item) => item.status === "SUBMITTED").length;
    const highRiskCount = pageData.items.filter((item) => item.riskLevel === "HIGH" || item.riskLevel === "CRITICAL").length;

    return [
      { label: "当前项目池", value: pageData.total, hint: "当前筛选范围内的工程主数据总量。", tone: "primary" },
      { label: "执行中链路", value: activeCount, hint: "已进入施工、巡检、整改或验收阶段。", tone: "success" },
      { label: "待审批项目", value: approvalCount, hint: "已经提交，等待管理动作进入下一阶段。", tone: "warning" },
      { label: "高风险项目", value: highRiskCount, hint: "高 / 严重风险项目要优先盯预算、工期和现场安全。", tone: "danger" }
    ] as const;
  }, [pageData]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setMessage("");
    try {
      const data = await engineeringProjectsApi.listProjects(toQuery(filters, page), getAccessToken());
      setPageData(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程项目失败");
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

  async function remove(row: EngineeringProject) {
    if (!window.confirm(`确认删除工程项目「${row.projectName}」？此操作会执行软删除。`)) {
      return;
    }
    setMessage("");
    try {
      await engineeringProjectsApi.deleteProject(row.id, getAccessToken());
      setMessage("删除成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除工程项目失败");
    }
  }

  if (!canView) {
    return <ForbiddenEngineeringProject />;
  }

  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <header className="header">
        <div className="header-title">
          <strong>工程项目</strong>
          <span>工程立项、计划、施工、巡检、整改、验收的项目主数据入口</span>
        </div>
        {canCreate ? (
          <Link className="primary-button" href="/engineering/projects/new">
            <Plus size={16} />
            新建项目
          </Link>
        ) : null}
      </header>

      <section className={styles.summaryGrid} aria-label="工程项目摘要">
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
          <TextFilter label="关键词" value={filters.keyword} placeholder="项目编号 / 名称 / 位置" onChange={(value) => setFilter("keyword", value)} />
          <SelectFilter label="工程类型" value={filters.projectType} options={engineeringProjectTypeOptions} onChange={(value) => setFilter("projectType", value as EngineeringProjectType | "")} />
          <SelectFilter label="项目状态" value={filters.status} options={engineeringProjectStatusOptions} onChange={(value) => setFilter("status", value as EngineeringProjectStatus | "")} />
          <SelectFilter label="项目级别" value={filters.projectLevel} options={engineeringProjectLevelOptions} onChange={(value) => setFilter("projectLevel", value as EngineeringProjectLevel | "")} />
          <SelectFilter label="风险等级" value={filters.riskLevel} options={engineeringRiskLevelOptions} onChange={(value) => setFilter("riskLevel", value as EngineeringRiskLevel | "")} />
          <TextFilter label="园区 ID" value={filters.parkId} placeholder="默认当前园区" onChange={(value) => setFilter("parkId", value)} />
          <TextFilter label="项目负责人 ID" value={filters.projectManagerId} onChange={(value) => setFilter("projectManagerId", value)} />
          <TextFilter label="计划开始自" value={filters.plannedStartFrom} type="date" onChange={(value) => setFilter("plannedStartFrom", value)} />
          <TextFilter label="计划开始至" value={filters.plannedStartTo} type="date" onChange={(value) => setFilter("plannedStartTo", value)} />
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
              <th>项目编号</th>
              <th>项目名称</th>
              <th>工程类型</th>
              <th>状态</th>
              <th>项目级别</th>
              <th>风险等级</th>
              <th>项目负责人</th>
              <th>计划开始</th>
              <th>计划结束</th>
              <th>进度</th>
              <th>预算金额</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {pageData.items.map((row) => (
              <tr key={row.id}>
                <td>{row.projectCode}</td>
                <td><strong>{row.projectName}</strong></td>
                <td><ProjectTypePill type={row.projectType} /></td>
                <td><ProjectStatusPill status={row.status} /></td>
                <td><LevelPill level={row.projectLevel} /></td>
                <td><RiskPill risk={row.riskLevel} /></td>
                <td>{row.projectManagerId ?? "-"}</td>
                <td>{formatDate(row.plannedStartDate)}</td>
                <td>{formatDate(row.plannedEndDate)}</td>
                <td>{formatPercent(row.progressPercent)}</td>
                <td>{formatMoney(row.budgetAmount)}</td>
                <td>
                  <DataTableActions>
                    <Link aria-label="查看" href={`/engineering/projects/${row.id}`}><Eye size={16} /></Link>
                    {canUpdate ? <Link aria-label="编辑" href={`/engineering/projects/${row.id}/edit`}><Edit3 size={16} /></Link> : null}
                    {canUpdate ? (
                      <button aria-label="删除" type="button" onClick={() => void remove(row)}>
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </DataTableActions>
                </td>
              </tr>
            ))}
            {pageData.items.length === 0 ? (
              <tr>
                <td colSpan={12}>{loading ? "加载中..." : "暂无工程项目"}</td>
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
      <MessageLine message={message} />
    </main>
  );

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
}

function toQuery(filters: FilterState, page: number): EngineeringProjectQuery {
  return {
    keyword: filters.keyword.trim(),
    project_type: filters.projectType,
    status: filters.status,
    project_level: filters.projectLevel,
    risk_level: filters.riskLevel,
    park_id: filters.parkId.trim(),
    project_manager_id: filters.projectManagerId.trim(),
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
