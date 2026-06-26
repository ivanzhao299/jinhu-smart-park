"use client";

import { Card, DataTable, DataTableActions } from "@jinhu/ui";
import { Edit3, Eye, Plus, Search, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringInspectionsApi } from "../../../../lib/engineering-inspections-api";
import { engineeringInspectionStatusOptions, engineeringInspectionTypeOptions } from "../../../../lib/engineering-inspections-display";
import { ENGINEERING_INSPECTION_PERMISSIONS, hasEngineeringInspectionPermission } from "../../../../lib/engineering-inspections-permissions";
import type {
  EngineeringInspection,
  EngineeringInspectionPage,
  EngineeringInspectionQuery,
  EngineeringInspectionStatus,
  EngineeringInspectionType
} from "../../../../lib/engineering-inspections-types";
import { isInspectionEditable, isInspectionSubmittable } from "../../../../lib/engineering-inspections-utils";
import { ForbiddenEngineeringInspection, InspectionStatusPill, InspectionTypePill, MessageLine, formatDate, formatDateTime } from "./EngineeringInspectionShared";
import styles from "../../projects/engineering-projects.module.css";

interface FilterState {
  keyword: string;
  projectId: string;
  planId: string;
  inspectionType: EngineeringInspectionType | "";
  inspectionStatus: EngineeringInspectionStatus | "";
  contractorOrgId: string;
  inspectorUserId: string;
  inspectionDateFrom: string;
  inspectionDateTo: string;
}

const emptyPage: EngineeringInspectionPage = { items: [], total: 0, page: 1, page_size: 20 };

export function EngineeringInspectionsListClient() {
  const searchParams = useSearchParams();
  const authUser = useAuthUser();
  const canView = hasEngineeringInspectionPermission(authUser, ENGINEERING_INSPECTION_PERMISSIONS.VIEW);
  const canCreate = hasEngineeringInspectionPermission(authUser, ENGINEERING_INSPECTION_PERMISSIONS.CREATE);
  const canUpdate = hasEngineeringInspectionPermission(authUser, ENGINEERING_INSPECTION_PERMISSIONS.UPDATE);
  const canDelete = hasEngineeringInspectionPermission(authUser, ENGINEERING_INSPECTION_PERMISSIONS.DELETE);
  const canSubmit = hasEngineeringInspectionPermission(authUser, ENGINEERING_INSPECTION_PERMISSIONS.SUBMIT);
  const initialProjectId = searchParams.get("projectId") ?? searchParams.get("project_id") ?? "";
  const [filters, setFilters] = useState<FilterState>({
    keyword: "",
    projectId: initialProjectId,
    planId: "",
    inspectionType: "",
    inspectionStatus: "",
    contractorOrgId: "",
    inspectorUserId: "",
    inspectionDateFrom: "",
    inspectionDateTo: ""
  });
  const [pageData, setPageData] = useState<EngineeringInspectionPage>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setMessage("");
    try {
      const data = await engineeringInspectionsApi.listInspections(toQuery(filters, page), getAccessToken());
      setPageData(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程巡检失败");
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

  async function submitInspection(row: EngineeringInspection) {
    if (!window.confirm(`确认提交巡检「${row.inspectionCode}」？提交后将锁定普通编辑。`)) return;
    setMessage("");
    try {
      await engineeringInspectionsApi.submitInspection(row.id, getAccessToken());
      setMessage("提交成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交工程巡检失败");
    }
  }

  async function remove(row: EngineeringInspection) {
    if (!window.confirm(`确认删除巡检「${row.inspectionCode}」？此操作会执行软删除。`)) return;
    setMessage("");
    try {
      await engineeringInspectionsApi.deleteInspection(row.id, getAccessToken());
      setMessage("删除成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除工程巡检失败");
    }
  }

  if (!canView) return <ForbiddenEngineeringInspection />;

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>工程巡检</strong>
          <span>记录现场质量、安全、进度、材料和隐蔽工程巡检，并沉淀问题证据</span>
        </div>
        {canCreate ? (
          <Link className="primary-button" href={filters.projectId ? `/engineering/inspections/new?projectId=${filters.projectId}` : "/engineering/inspections/new"}>
            <Plus size={16} />
            新建巡检
          </Link>
        ) : null}
      </header>

      <Card>
        <form className={styles.filters} onSubmit={(event) => void search(event)}>
          <TextFilter label="关键词" value={filters.keyword} placeholder="编号 / 标题 / 摘要" onChange={(value) => setFilter("keyword", value)} />
          <TextFilter label="项目 ID" value={filters.projectId} onChange={(value) => setFilter("projectId", value)} />
          <TextFilter label="计划 ID" value={filters.planId} onChange={(value) => setFilter("planId", value)} />
          <SelectFilter label="巡检类型" value={filters.inspectionType} options={engineeringInspectionTypeOptions} onChange={(value) => setFilter("inspectionType", value as EngineeringInspectionType | "")} />
          <SelectFilter label="巡检状态" value={filters.inspectionStatus} options={engineeringInspectionStatusOptions} onChange={(value) => setFilter("inspectionStatus", value as EngineeringInspectionStatus | "")} />
          <TextFilter label="施工单位 ID" value={filters.contractorOrgId} onChange={(value) => setFilter("contractorOrgId", value)} />
          <TextFilter label="巡检人 ID" value={filters.inspectorUserId} onChange={(value) => setFilter("inspectorUserId", value)} />
          <TextFilter label="巡检日期自" type="date" value={filters.inspectionDateFrom} onChange={(value) => setFilter("inspectionDateFrom", value)} />
          <TextFilter label="巡检日期至" type="date" value={filters.inspectionDateTo} onChange={(value) => setFilter("inspectionDateTo", value)} />
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
              <th>巡检编号</th>
              <th>标题</th>
              <th>日期</th>
              <th>类型</th>
              <th>状态</th>
              <th>问题</th>
              <th>项目 ID</th>
              <th>提交</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {pageData.items.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.inspectionCode}</strong></td>
                <td>{row.inspectionTitle}</td>
                <td>{formatDate(row.inspectionDate)}</td>
                <td><InspectionTypePill type={row.inspectionType} /></td>
                <td><InspectionStatusPill status={row.inspectionStatus} /></td>
                <td>{row.issueCount} 项 / 重大 {row.criticalIssueCount}</td>
                <td>{row.projectId}</td>
                <td>{row.submittedBy ?? "-"}<br /><small>{formatDateTime(row.submittedAt)}</small></td>
                <td>
                  <DataTableActions>
                    <Link aria-label="查看" href={`/engineering/inspections/${row.id}`}><Eye size={16} /></Link>
                    {canUpdate && isInspectionEditable(row.inspectionStatus) ? <Link aria-label="编辑" href={`/engineering/inspections/${row.id}/edit`}><Edit3 size={16} /></Link> : null}
                    {canSubmit && isInspectionSubmittable(row.inspectionStatus) ? <button aria-label="提交" type="button" onClick={() => void submitInspection(row)}><Send size={16} /></button> : null}
                    {canDelete && isInspectionEditable(row.inspectionStatus) ? <button aria-label="删除" type="button" onClick={() => void remove(row)}><Trash2 size={16} /></button> : null}
                  </DataTableActions>
                </td>
              </tr>
            ))}
            {pageData.items.length === 0 ? (
              <tr>
                <td colSpan={9}>{loading ? "加载中..." : "暂无工程巡检"}</td>
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

function toQuery(filters: FilterState, page: number): EngineeringInspectionQuery {
  return {
    keyword: filters.keyword.trim(),
    project_id: filters.projectId.trim(),
    plan_id: filters.planId.trim(),
    inspection_type: filters.inspectionType,
    inspection_status: filters.inspectionStatus,
    contractor_org_id: filters.contractorOrgId.trim(),
    inspector_user_id: filters.inspectorUserId.trim(),
    inspection_date_from: filters.inspectionDateFrom,
    inspection_date_to: filters.inspectionDateTo,
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
