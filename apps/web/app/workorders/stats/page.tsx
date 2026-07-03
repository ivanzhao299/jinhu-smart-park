"use client";

import { Card, DataTable } from "@jinhu/ui";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3, RefreshCw, Search, Star, TimerReset } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import type { DictItemRow, DictMap, DictTypeRow, ParkTenantRow, UserRow } from "../../../components/workorders/types";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const WORKORDER_MODULE = "workorder";

interface BuildingRow {
  id: string;
  buildingCode: string;
  buildingName: string;
}

interface StatsFilters {
  startDate: string;
  endDate: string;
  woType: string;
  buildingId: string;
  assigneeId: string;
  parkTenantId: string;
}

interface WorkOrderStatsSummary {
  total_count: number;
  pending_count: number;
  assigned_count: number;
  in_progress_count: number;
  done_count: number;
  overdue_count: number;
  closed_count: number;
  avg_dispatch_minutes: number;
  avg_finish_minutes: number;
  avg_satisfaction: number;
}

interface WorkOrderStatsBucket {
  key: string;
  count: number;
}

interface WorkOrderAssigneeStatsBucket {
  assignee_id: string | null;
  assignee_name: string;
  count: number;
  done_count: number;
  overdue_count: number;
  avg_finish_minutes: number;
}

interface WorkOrderOverdueTopRow {
  assignee_id: string | null;
  assignee_name: string;
  overdue_count: number;
  max_overdue_minutes: number;
}

interface WorkOrderStatsResponse {
  summary: WorkOrderStatsSummary;
  by_status: WorkOrderStatsBucket[];
  by_type: WorkOrderStatsBucket[];
  by_priority: WorkOrderStatsBucket[];
  by_assignee: WorkOrderAssigneeStatsBucket[];
  overdue_top: WorkOrderOverdueTopRow[];
}

const emptyFilters: StatsFilters = {
  startDate: "",
  endDate: "",
  woType: "",
  buildingId: "",
  assigneeId: "",
  parkTenantId: ""
};

const emptySummary: WorkOrderStatsSummary = {
  total_count: 0,
  pending_count: 0,
  assigned_count: 0,
  in_progress_count: 0,
  done_count: 0,
  overdue_count: 0,
  closed_count: 0,
  avg_dispatch_minutes: 0,
  avg_finish_minutes: 0,
  avg_satisfaction: 0
};

const emptyStats: WorkOrderStatsResponse = {
  summary: emptySummary,
  by_status: [],
  by_type: [],
  by_priority: [],
  by_assignee: [],
  overdue_top: []
};

export default function WorkOrderStatsPage() {
  const [stats, setStats] = useState<WorkOrderStatsResponse>(emptyStats);
  const [filters, setFilters] = useState<StatsFilters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const statusItems = dicts.workorder_status ?? [];
  const typeItems = dicts.workorder_type ?? [];
  const priorityItems = dicts.workorder_priority ?? [];

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set("start_date", filters.startDate);
      if (filters.endDate) params.set("end_date", filters.endDate);
      if (filters.woType) params.set("wo_type", filters.woType);
      if (filters.buildingId) params.set("building_id", filters.buildingId);
      if (filters.assigneeId) params.set("assignee_id", filters.assigneeId);
      if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
      const queryString = params.toString();
      const path = queryString ? `/work-orders/stats?${queryString}` : "/work-orders/stats";
      const response = await apiRequest<WorkOrderStatsResponse>(path, {
        token: getAccessToken()
      });
      setStats(response.data);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工单统计失败");
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

  const loadReferences = useCallback(async () => {
    const [buildingResponse, tenantResponse, userResponse] = await Promise.allSettled([
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=100&status=enabled", { token: getAccessToken() })
    ]);
    if (buildingResponse.status === "fulfilled") setBuildings(buildingResponse.value.data.items);
    if (tenantResponse.status === "fulfilled") setParkTenants(tenantResponse.value.data.items);
    if (userResponse.status === "fulfilled") setUsers(userResponse.value.data.items);
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadReferences().catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadReferences]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const kpis = useMemo(() => [
    { label: "工单总数", value: formatNumber(stats.summary.total_count), icon: <ClipboardList size={18} /> },
    { label: "待处理", value: formatNumber(stats.summary.pending_count), icon: <Clock3 size={18} /> },
    { label: "处理中", value: formatNumber(stats.summary.in_progress_count), icon: <TimerReset size={18} /> },
    { label: "已完成", value: formatNumber(stats.summary.done_count), icon: <CheckCircle2 size={18} /> },
    { label: "超时工单", value: formatNumber(stats.summary.overdue_count), icon: <AlertTriangle size={18} /> },
    { label: "已关闭", value: formatNumber(stats.summary.closed_count), icon: <CheckCircle2 size={18} /> },
    { label: "平均响应", value: formatMinutes(stats.summary.avg_dispatch_minutes), icon: <Clock3 size={18} /> },
    { label: "平均处理", value: formatMinutes(stats.summary.avg_finish_minutes), icon: <TimerReset size={18} /> },
    { label: "平均满意度", value: formatSatisfaction(stats.summary.avg_satisfaction), icon: <Star size={18} /> }
  ], [stats]);

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_STATS} module={WORKORDER_MODULE} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>工单统计</strong>
            <span>按时间、类型、楼栋、处理人和租户企业查看工单闭环效率</span>
          </div>
          <div className="page-actions">
            <button className="primary-button secondary-button" type="button" onClick={() => void loadStats()}>
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </header>

        <Card>
          <form className="form-stack" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void loadStats(); }}>
            <div className="dashboard-grid">
              <Field label="开始日期">
                <input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} />
              </Field>
              <Field label="结束日期">
                <input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} />
              </Field>
              <SelectField label="工单类型" value={filters.woType} items={typeItems} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, woType: value }))} />
              <Field label="楼栋">
                <select value={filters.buildingId} onChange={(event) => setFilters((current) => ({ ...current, buildingId: event.target.value }))}>
                  <option value="">全部楼栋</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
                  ))}
                </select>
              </Field>
              <Field label="处理人">
                <select value={filters.assigneeId} onChange={(event) => setFilters((current) => ({ ...current, assigneeId: event.target.value }))}>
                  <option value="">全部处理人</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{displayUserName(user)}</option>
                  ))}
                </select>
              </Field>
              <Field label="租户企业">
                <select value={filters.parkTenantId} onChange={(event) => setFilters((current) => ({ ...current, parkTenantId: event.target.value }))}>
                  <option value="">全部租户企业</option>
                  {parkTenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>
                  ))}
                </select>
              </Field>
            </div>
            <button className="primary-button" type="submit">
              <Search size={16} />
              查询
            </button>
          </form>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <section className="dashboard-grid">
          {kpis.map((item) => (
            <article className="metric-card workorder-stat-card" key={item.label}>
              <span className="funnel-kpi-header">
                <span className="funnel-kpi-icon">{item.icon}</span>
                {item.label}
              </span>
              <strong className="metric-value">{loading ? "..." : item.value}</strong>
            </article>
          ))}
        </section>

        <section className="dashboard-grid">
          <StatsTable title="状态分布" rows={stats.by_status} labelForKey={(key) => labelFor(statusItems, key)} />
          <StatsTable title="类型分布" rows={stats.by_type} labelForKey={(key) => labelFor(typeItems, key)} />
          <StatsTable title="优先级分布" rows={stats.by_priority} labelForKey={(key) => labelFor(priorityItems, key)} />
        </section>

        <Card>
          <h2 className="panel-title">处理人排行</h2>
          <DataTable>
            <thead>
              <tr>
                <th>处理人</th>
                <th>工单数</th>
                <th>完成数</th>
                <th>超时数</th>
                <th>平均处理</th>
              </tr>
            </thead>
            <tbody>
              {stats.by_assignee.length === 0 ? (
                <tr><td colSpan={5}>暂无统计数据</td></tr>
              ) : stats.by_assignee.map((row) => (
                <tr key={row.assignee_id ?? "unassigned"}>
                  <td>{row.assignee_name}</td>
                  <td>{row.count}</td>
                  <td>{row.done_count}</td>
                  <td>{row.overdue_count}</td>
                  <td>{formatMinutes(row.avg_finish_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card>
          <h2 className="panel-title">超时排行</h2>
          <DataTable>
            <thead>
              <tr>
                <th>处理人</th>
                <th>超时工单数</th>
                <th>最大超时时长</th>
              </tr>
            </thead>
            <tbody>
              {stats.overdue_top.length === 0 ? (
                <tr><td colSpan={3}>暂无超时数据</td></tr>
              ) : stats.overdue_top.map((row) => (
                <tr key={row.assignee_id ?? "unassigned"}>
                  <td>{row.assignee_name}</td>
                  <td>{row.overdue_count}</td>
                  <td>{formatMinutes(row.max_overdue_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </main>
    </PermissionGuard>
  );
}

function StatsTable({ title, rows, labelForKey }: { title: string; rows: WorkOrderStatsBucket[]; labelForKey: (key: string) => string }) {
  return (
    <Card className="workorder-stat-section">
      <h2 className="panel-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="empty-state">暂无统计数据</p>
      ) : (
        <ul className="workorder-stat-list">
          {rows.map((row) => (
            <li key={row.key}>
              <span>{labelForKey(row.key)}</span>
              <strong>{row.count}</strong>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SelectField({ label, value, items, allLabel, onChange }: {
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

function labelFor(items: DictItemRow[], key: string): string {
  if (key === "-") return "未设置";
  return items.find((item) => item.itemValue === key)?.itemLabel ?? key;
}

function displayUserName(user?: UserRow): string {
  if (!user) return "";
  return user.displayName ?? user.realName ?? user.username;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatMinutes(value: number): string {
  if (!value) return "0 分钟";
  if (value < 60) return `${value.toFixed(1)} 分钟`;
  return `${(value / 60).toFixed(1)} 小时`;
}

function formatSatisfaction(value: number): string {
  if (!value) return "0.0";
  return value.toFixed(1);
}

function ForbiddenInline() {
  return (
    <main className="content">
      <Card>403：无权访问工单统计，或当前租户未开通工单能力。</Card>
    </main>
  );
}
