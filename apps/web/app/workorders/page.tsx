"use client";

import { Card } from "@jinhu/ui";
import { LayoutGrid, ListChecks, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionGuard } from "../../components/auth/PermissionGuard";
import { WorkOrderKanban, type WorkOrderKanbanColumn } from "../../components/workorders/WorkOrderKanban";
import type { DictItemRow, DictMap, DictTypeRow, UserRow, WorkOrderRow } from "../../components/workorders/types";
import { apiRequest } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";

const WORKORDER_MODULE = "workorder";

const KANBAN_COLUMNS: WorkOrderKanbanColumn[] = [
  { key: "submitted", title: "已提交", statuses: ["10"] },
  { key: "assigned", title: "已派单", statuses: ["20"] },
  { key: "accepted", title: "已接单", statuses: ["30"] },
  { key: "processing", title: "处理中", statuses: ["40"] },
  { key: "wait-material", title: "待物料", statuses: ["45"] },
  { key: "finished", title: "已处理", statuses: ["50"] },
  { key: "confirmed", title: "已确认", statuses: ["60"] },
  { key: "closed", title: "已评价 / 已关闭", statuses: ["70", "100"] }
];

interface FilterState {
  woType: string;
  priority: string;
  assigneeId: string;
}

const emptyFilters: FilterState = {
  woType: "",
  priority: "",
  assigneeId: ""
};

export default function WorkOrdersKanbanPage() {
  const [items, setItems] = useState<WorkOrderRow[]>([]);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const statusItems = dicts.workorder_status ?? [];
  const typeItems = dicts.workorder_type ?? [];
  const priorityItems = dicts.workorder_priority ?? [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", page_size: "100", sort: "updateTime:DESC" });
      if (filters.woType) params.set("wo_type", filters.woType);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.assigneeId) params.set("assignee_id", filters.assigneeId);
      const response = await apiRequest<PaginatedResult<WorkOrderRow>>(`/work-orders?${params.toString()}`, {
        token: getAccessToken()
      });
      setItems(response.data.items);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["workorder_status", "workorder_type", "workorder_priority"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
        token: getAccessToken()
      });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  const loadUsers = useCallback(async () => {
    const response = await apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=100&status=enabled", {
      token: getAccessToken()
    });
    setUsers(response.data.items);
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadUsers().catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadUsers]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load().catch((error: Error) => setMessage(error.message));
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_READ} module={WORKORDER_MODULE} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>工单看板</strong>
            <span>按状态快速查看工单流转，卡片点击进入完整详情。</span>
          </div>
          <div className="page-actions">
            <button className="primary-button secondary-button" type="button" onClick={() => void load().catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <Link className="primary-button" href="/workorders/list">
              <ListChecks size={16} />
              列表
            </Link>
          </div>
        </header>

        <Card>
          <form className="form-stack" onSubmit={submit}>
            <div className="dashboard-grid">
              <SelectField label="工单类型" value={filters.woType} items={typeItems} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, woType: value }))} />
              <SelectField label="优先级" value={filters.priority} items={priorityItems} allLabel="全部优先级" onChange={(value) => setFilters((current) => ({ ...current, priority: value }))} />
              <Field label="处理人">
                <select value={filters.assigneeId} onChange={(event) => setFilters((current) => ({ ...current, assigneeId: event.target.value }))}>
                  <option value="">全部处理人</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{displayUserName(user)}</option>)}
                </select>
              </Field>
            </div>
            <div className="filter-actions">
              <button className="primary-button" type="submit">
                <Search size={16} />
                查询
              </button>
            </div>
          </form>
        </Card>

        <Card>
          <div className="task-item">
            <span><LayoutGrid size={16} /> 当前看板 {items.length} 单</span>
            <span className="muted-text">当前支持查看与筛选，请进入详情执行状态动作。</span>
          </div>
          <WorkOrderKanban columns={KANBAN_COLUMNS} items={items} priorityItems={priorityItems} statusItems={statusItems} loading={loading} />
          {items.length === 0 && !loading ? <div className="empty-state"><strong>暂无工单</strong><span>调整筛选条件后重新查询。</span></div> : null}
        </Card>

        {message ? <p className="status-pill">{message}</p> : null}
      </main>
    </PermissionGuard>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function SelectField({
  label,
  value,
  items,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  items: DictItemRow[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </Field>
  );
}

function displayUserName(user?: UserRow): string {
  if (!user) return "";
  return user.displayName ?? user.realName ?? user.username;
}

function ForbiddenInline() {
  return (
    <main className="content">
      <Card>
        <h1 className="panel-title">403</h1>
        <p>当前账号没有工单看板访问权限，或当前租户未开通工单能力。</p>
      </Card>
    </main>
  );
}
