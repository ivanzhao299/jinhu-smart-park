"use client";

import { Card, DataTable, DataTableActions } from "@jinhu/ui";
import { Eye, RefreshCw, Search, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringRectificationsApi } from "../../../../lib/engineering-rectifications-api";
import { engineeringIssueSeverityLabels, engineeringRectificationStatusOptions } from "../../../../lib/engineering-rectifications-display";
import { ENGINEERING_RECTIFICATION_PERMISSIONS, hasEngineeringRectificationPermission } from "../../../../lib/engineering-rectifications-permissions";
import type {
  EngineeringRectification,
  EngineeringRectificationAction,
  EngineeringRectificationPage,
  EngineeringRectificationQuery,
  EngineeringRectificationStatus
} from "../../../../lib/engineering-rectifications-types";
import { availableRectificationActions, isRectificationDeletable } from "../../../../lib/engineering-rectifications-utils";
import {
  ForbiddenEngineeringRectification,
  MessageLine,
  RectificationActionDrawer,
  RectificationSeverityPill,
  RectificationStatusPill,
  formatDate,
  formatDateTime
} from "./EngineeringRectificationShared";
import styles from "../../projects/engineering-projects.module.css";

interface FilterState {
  keyword: string;
  projectId: string;
  issueId: string;
  inspectionId: string;
  status: EngineeringRectificationStatus | "";
  severity: "" | keyof typeof engineeringIssueSeverityLabels;
  responsibleUserId: string;
  contractorOrgId: string;
  deadlineFrom: string;
  deadlineTo: string;
}

const emptyPage: EngineeringRectificationPage = { items: [], total: 0, page: 1, page_size: 20 };

export function EngineeringRectificationsListClient() {
  const searchParams = useSearchParams();
  const authUser = useAuthUser();
  const canView = hasEngineeringRectificationPermission(authUser, ENGINEERING_RECTIFICATION_PERMISSIONS.VIEW);
  const canSubmit = hasEngineeringRectificationPermission(authUser, ENGINEERING_RECTIFICATION_PERMISSIONS.SUBMIT);
  const canRecheck = hasEngineeringRectificationPermission(authUser, ENGINEERING_RECTIFICATION_PERMISSIONS.RECHECK);
  const canUpdate = hasEngineeringRectificationPermission(authUser, ENGINEERING_RECTIFICATION_PERMISSIONS.UPDATE);
  const canDelete = hasEngineeringRectificationPermission(authUser, ENGINEERING_RECTIFICATION_PERMISSIONS.DELETE);
  const [filters, setFilters] = useState<FilterState>({
    keyword: "",
    projectId: searchParams.get("projectId") ?? searchParams.get("project_id") ?? "",
    issueId: "",
    inspectionId: "",
    status: "",
    severity: "",
    responsibleUserId: "",
    contractorOrgId: "",
    deadlineFrom: "",
    deadlineTo: ""
  });
  const [pageData, setPageData] = useState<EngineeringRectificationPage>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [actionTarget, setActionTarget] = useState<{ row: EngineeringRectification; action: EngineeringRectificationAction } | null>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setMessage("");
    try {
      const data = await engineeringRectificationsApi.listRectifications(toQuery(filters, page), getAccessToken());
      setPageData(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程整改失败");
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

  async function executeAction(input: { action: EngineeringRectificationAction; reason?: string; comment?: string; feedback?: string; recheck_comment?: string }) {
    if (!actionTarget) return;
    setActionSaving(true);
    setMessage("");
    try {
      await engineeringRectificationsApi.executeRectificationAction(actionTarget.row.id, input, getAccessToken());
      setActionTarget(null);
      setMessage("整改动作执行成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "整改动作执行失败");
    } finally {
      setActionSaving(false);
    }
  }

  async function remove(row: EngineeringRectification) {
    if (!window.confirm(`确认删除整改任务「${row.rectificationCode}」？此操作会执行软删除。`)) return;
    setMessage("");
    try {
      await engineeringRectificationsApi.deleteRectification(row.id, getAccessToken());
      setMessage("删除成功");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除工程整改失败");
    }
  }

  if (!canView) return <ForbiddenEngineeringRectification />;

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>整改任务</strong>
          <span>承接巡检问题、施工反馈、工程复查和闭环关闭</span>
        </div>
        <button className="secondary-button" type="button" disabled={loading} onClick={() => void load(pageData.page)}>
          <RefreshCw size={16} />
          刷新
        </button>
      </header>

      <Card>
        <form className={styles.filters} onSubmit={(event) => void search(event)}>
          <TextFilter label="关键词" value={filters.keyword} placeholder="编号 / 标题 / 描述" onChange={(value) => setFilter("keyword", value)} />
          <TextFilter label="项目 ID" value={filters.projectId} onChange={(value) => setFilter("projectId", value)} />
          <TextFilter label="问题 ID" value={filters.issueId} onChange={(value) => setFilter("issueId", value)} />
          <TextFilter label="巡检 ID" value={filters.inspectionId} onChange={(value) => setFilter("inspectionId", value)} />
          <SelectFilter label="整改状态" value={filters.status} options={engineeringRectificationStatusOptions} onChange={(value) => setFilter("status", value as EngineeringRectificationStatus | "")} />
          <SelectFilter
            label="严重等级"
            value={filters.severity}
            options={(Object.entries(engineeringIssueSeverityLabels) as Array<[keyof typeof engineeringIssueSeverityLabels, string]>).map(([value, label]) => ({ value, label }))}
            onChange={(value) => setFilter("severity", value as FilterState["severity"])}
          />
          <TextFilter label="责任人 ID" value={filters.responsibleUserId} onChange={(value) => setFilter("responsibleUserId", value)} />
          <TextFilter label="施工单位 ID" value={filters.contractorOrgId} onChange={(value) => setFilter("contractorOrgId", value)} />
          <TextFilter label="期限自" type="date" value={filters.deadlineFrom} onChange={(value) => setFilter("deadlineFrom", value)} />
          <TextFilter label="期限至" type="date" value={filters.deadlineTo} onChange={(value) => setFilter("deadlineTo", value)} />
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
              <th>整改编号</th>
              <th>标题</th>
              <th>状态</th>
              <th>严重等级</th>
              <th>期限</th>
              <th>责任人</th>
              <th>反馈 / 复查</th>
              <th>项目 ID</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {pageData.items.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.rectificationCode}</strong></td>
                <td>{row.rectificationTitle}</td>
                <td><RectificationStatusPill status={row.status} /></td>
                <td><RectificationSeverityPill severity={row.severity} /></td>
                <td>{formatDate(row.deadline)}</td>
                <td>{row.responsibleUserId ?? row.responsibleOrgId ?? "-"}</td>
                <td>{row.submittedBy ?? "-"}<br /><small>{formatDateTime(row.submittedAt ?? row.recheckedAt)}</small></td>
                <td>{row.projectId}</td>
                <td>
                  <DataTableActions>
                    <Link aria-label="查看" href={`/engineering/rectifications/${row.id}`}><Eye size={16} /></Link>
                    {actionButtons(row).map((action) => (
                      <button key={action} aria-label={action} type="button" onClick={() => setActionTarget({ row, action })}><Send size={16} /></button>
                    ))}
                    {canDelete && isRectificationDeletable(row.status) ? <button aria-label="删除" type="button" onClick={() => void remove(row)}><Trash2 size={16} /></button> : null}
                  </DataTableActions>
                </td>
              </tr>
            ))}
            {pageData.items.length === 0 ? (
              <tr>
                <td colSpan={9}>{loading ? "加载中..." : "暂无整改任务"}</td>
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
      {actionTarget ? (
        <RectificationActionDrawer
          action={actionTarget.action}
          saving={actionSaving}
          onClose={() => setActionTarget(null)}
          onSubmit={executeAction}
        />
      ) : null}
    </main>
  );

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function actionButtons(row: EngineeringRectification): EngineeringRectificationAction[] {
    return availableRectificationActions(row.status).filter((action) => {
      if (action === "SUBMIT") return canSubmit;
      if (action === "PASS" || action === "REJECT" || action === "START_RECHECK") return canRecheck;
      if (action === "CLOSE") return canUpdate;
      return canUpdate;
    });
  }
}

function toQuery(filters: FilterState, page: number): EngineeringRectificationQuery {
  return {
    keyword: filters.keyword.trim(),
    project_id: filters.projectId.trim(),
    issue_id: filters.issueId.trim(),
    inspection_id: filters.inspectionId.trim(),
    status: filters.status,
    severity: filters.severity,
    responsible_user_id: filters.responsibleUserId.trim(),
    contractor_org_id: filters.contractorOrgId.trim(),
    deadline_from: filters.deadlineFrom,
    deadline_to: filters.deadlineTo,
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
