"use client";

import { Card, DataTable } from "@jinhu/ui";
import { RefreshCw, Search } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const WORKORDER_MODULE = "workorder";

interface DictTypeRow {
  id: string;
  dictCode: string;
}

interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
  tagType?: string | null;
}

interface ParkTenantRow {
  id: string;
  companyName: string;
}

interface UnitRow {
  id: string;
  unitCode: string;
  unitName: string;
}

interface UserRow {
  id: string;
  username: string;
  displayName?: string;
  realName?: string;
}

interface WorkOrderRow {
  id: string;
  woCode: string;
  title: string;
  woType: string;
  priority: string;
  urgency: string | null;
  status: string;
  parkTenantId: string | null;
  unitId: string | null;
  location: string | null;
  reporterName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  slaDispatchMin: number | null;
  slaFinishMin: number | null;
  overdueFlag: boolean;
  overdueReason: string | null;
  createTime: string;
  dispatchTime?: string | null;
  acceptTime?: string | null;
  updateTime: string;
  parkTenant?: ParkTenantRow | null;
  unit?: UnitRow | null;
}

interface Filters {
  keyword: string;
  status: string;
  woType: string;
  priority: string;
  urgency: string;
  assigneeId: string;
  parkTenantId: string;
  unitId: string;
  startDate: string;
  endDate: string;
}

interface RecalculateOverdueResult {
  checked_count: number;
  overdue_count: number;
  marked_count: number;
  cleared_count: number;
  rows: Array<{
    id: string;
    wo_code: string;
    overdue: boolean;
    overdue_reason: string | null;
  }>;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<WorkOrderRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = {
  keyword: "",
  status: "",
  woType: "",
  priority: "",
  urgency: "",
  assigneeId: "",
  parkTenantId: "",
  unitId: "",
  startDate: "",
  endDate: ""
};

export default function WorkOrderOverduePage() {
  const [pageData, setPageData] = useState<PaginatedResult<WorkOrderRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [message, setMessage] = useState("");

  const statusItems = dicts.workorder_status ?? [];
  const typeItems = dicts.workorder_type ?? [];
  const priorityItems = dicts.workorder_priority ?? [];
  const urgencyItems = dicts.workorder_urgency ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "updateTime:DESC" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.woType) params.set("wo_type", filters.woType);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.urgency) params.set("urgency", filters.urgency);
    if (filters.assigneeId) params.set("assignee_id", filters.assigneeId);
    if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
    if (filters.unitId) params.set("unit_id", filters.unitId);
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    const response = await apiRequest<PaginatedResult<WorkOrderRow>>(`/work-orders/overdue?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["workorder_status", "workorder_type", "workorder_priority", "workorder_urgency"];
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

  const loadReferenceData = useCallback(async () => {
    const [tenantResponse, unitResponse, userResponse] = await Promise.allSettled([
      apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UnitRow>>("/park-units?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=100&status=enabled", { token: getAccessToken() })
    ]);
    if (tenantResponse.status === "fulfilled") setParkTenants(tenantResponse.value.data.items);
    if (unitResponse.status === "fulfilled") setUnits(unitResponse.value.data.items);
    if (userResponse.status === "fulfilled") setUsers(userResponse.value.data.items);
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadReferenceData().catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadReferenceData]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  async function recalculateOverdue() {
    const response = await apiRequest<RecalculateOverdueResult>("/work-orders/recalculate-overdue", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("work-order-recalculate-overdue")
    });
    setMessage(`重算完成：检查 ${response.data.checked_count} 条，超时 ${response.data.overdue_count} 条，新标记 ${response.data.marked_count} 条，清除 ${response.data.cleared_count} 条`);
    await load(pageData.page);
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_OVERDUE} module={WORKORDER_MODULE} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>超时工单</strong>
            <span>识别派单超时与处理超时工单，保留原处理状态并使用超时标记追踪</span>
          </div>
          <div className="page-actions">
            <button className="primary-button secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.WORKORDER_RECALCULATE_OVERDUE} type="button" onClick={() => void recalculateOverdue().catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              重算超时
            </PermissionButton>
          </div>
        </header>

        <Card>
          <form className="form-stack" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <Field label="关键词">
                <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="编号 / 标题 / 位置 / 人员" />
              </Field>
              <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
              <SelectField label="工单类型" value={filters.woType} items={typeItems} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, woType: value }))} />
              <SelectField label="优先级" value={filters.priority} items={priorityItems} allLabel="全部优先级" onChange={(value) => setFilters((current) => ({ ...current, priority: value }))} />
              <SelectField label="紧急程度" value={filters.urgency} items={urgencyItems} allLabel="全部紧急程度" onChange={(value) => setFilters((current) => ({ ...current, urgency: value }))} />
              <Field label="处理人">
                <select value={filters.assigneeId} onChange={(event) => setFilters((current) => ({ ...current, assigneeId: event.target.value }))}>
                  <option value="">全部处理人</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{displayUserName(user)}</option>)}
                </select>
              </Field>
              <Field label="租户企业">
                <select value={filters.parkTenantId} onChange={(event) => setFilters((current) => ({ ...current, parkTenantId: event.target.value }))}>
                  <option value="">全部企业</option>
                  {parkTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>)}
                </select>
              </Field>
              <Field label="房源">
                <select value={filters.unitId} onChange={(event) => setFilters((current) => ({ ...current, unitId: event.target.value }))}>
                  <option value="">全部房源</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unitCode} {unit.unitName}</option>)}
                </select>
              </Field>
              <Field label="开始日期">
                <input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} />
              </Field>
              <Field label="结束日期">
                <input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} />
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

        <Card className="table-scroll">
          <DataTable>
            <thead>
              <tr>
                <th>工单编号</th>
                <th>标题</th>
                <th>类型</th>
                <th>优先级</th>
                <th>状态</th>
                <th>处理人</th>
                <th>租户企业</th>
                <th>位置</th>
                <th>SLA</th>
                <th>超时原因</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.woCode}</td>
                  <td>{row.title}</td>
                  <td>{labelFor(typeItems, row.woType)}</td>
                  <td><DictBadge items={priorityItems} value={row.priority} /></td>
                  <td><DictBadge items={statusItems} value={row.status} /></td>
                  <td>{row.assigneeName ?? "-"}</td>
                  <td>{row.parkTenant?.companyName ?? "-"}</td>
                  <td>{row.location ?? row.unit?.unitName ?? "-"}</td>
                  <td>
                    <span className="status-pill status-danger">超时</span>
                    <span>派单 {row.slaDispatchMin ?? 30} / 处理 {row.slaFinishMin ?? 240} 分钟</span>
                  </td>
                  <td>{row.overdueReason ?? "-"}</td>
                  <td>{formatDateTime(row.createTime)}</td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={11}>暂无超时工单</td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
          <div className="task-item">
            <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
            <span>
              <button type="button" disabled={pageData.page <= 1} onClick={() => void load(Math.max(1, pageData.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>
              <button type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
            </span>
          </div>
        </Card>

        {message ? <p className="status-pill">{message}</p> : null}
      </main>
    </PermissionGuard>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
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

function DictBadge({ items, value }: { items: DictItemRow[]; value?: string | null }) {
  const item = items.find((candidate) => candidate.itemValue === value);
  return <span className={`status-pill ${statusClass(item?.tagType)}`}>{item?.itemLabel ?? value ?? "-"}</span>;
}

function labelFor(items: DictItemRow[], value?: string | null): string {
  if (!value) return "-";
  return items.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

function statusClass(tagType?: string | null): string {
  switch (tagType) {
    case "success":
      return "status-success";
    case "warning":
      return "status-warning";
    case "danger":
      return "status-danger";
    case "primary":
      return "status-primary";
    case "info":
      return "status-info";
    default:
      return "status-muted";
  }
}

function displayUserName(user?: UserRow): string {
  if (!user) return "";
  return user.displayName ?? user.realName ?? user.username;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function ForbiddenInline() {
  return (
    <main className="content">
      <Card>403：无权访问超时工单。</Card>
    </main>
  );
}
