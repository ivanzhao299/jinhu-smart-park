"use client";

import { Card, DataTable, StatusPill } from "@jinhu/ui";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, RefreshCw, Search, ShieldAlert, Siren, UsersRound } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import type { DictItemRow, DictMap, DictTypeRow, UserRow } from "../../../components/workorders/types";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const SAFETY_MODULE = "safety";

interface BuildingRow {
  id: string;
  buildingCode: string;
  buildingName: string;
}

interface DashboardFilters {
  startDate: string;
  endDate: string;
  buildingId: string;
  riskLevel: string;
  hazardType: string;
  handlerId: string;
}

interface SafetyStatsSummary {
  inspect_task_total: number;
  inspect_task_done: number;
  inspect_completion_rate: number;
  hazard_total: number;
  hazard_open_count: number;
  hazard_closed_count: number;
  hazard_close_rate: number;
  overdue_hazard_count: number;
  major_hazard_count: number;
  high_risk_tenant_count: number;
}

interface SafetyStatsBucket {
  key: string;
  count: number;
  open_count: number;
  closed_count: number;
}

interface SafetyBuildingStats {
  building_id: string | null;
  building_code: string;
  building_name: string;
  count: number;
  open_count: number;
  overdue_count: number;
  major_count: number;
}

interface SafetyHazardStatsItem {
  id: string;
  hazard_code: string;
  title: string;
  hazard_type: string | null;
  risk_level: string | null;
  status: string;
  overdue_flag: boolean;
  building_id: string | null;
  building_name: string;
  location: string;
  rectify_deadline: string | null;
  overdue_days: number;
  create_time: string;
}

interface SafetyStatsResponse {
  summary: SafetyStatsSummary;
  by_hazard_type: SafetyStatsBucket[];
  by_risk_level: SafetyStatsBucket[];
  by_building: SafetyBuildingStats[];
  overdue_top: SafetyHazardStatsItem[];
  recent_major_hazards: SafetyHazardStatsItem[];
}

const emptyFilters: DashboardFilters = {
  startDate: "",
  endDate: "",
  buildingId: "",
  riskLevel: "",
  hazardType: "",
  handlerId: ""
};

const emptySummary: SafetyStatsSummary = {
  inspect_task_total: 0,
  inspect_task_done: 0,
  inspect_completion_rate: 0,
  hazard_total: 0,
  hazard_open_count: 0,
  hazard_closed_count: 0,
  hazard_close_rate: 0,
  overdue_hazard_count: 0,
  major_hazard_count: 0,
  high_risk_tenant_count: 0
};

const emptyStats: SafetyStatsResponse = {
  summary: emptySummary,
  by_hazard_type: [],
  by_risk_level: [],
  by_building: [],
  overdue_top: [],
  recent_major_hazards: []
};

export default function SafetyDashboardPage() {
  const [stats, setStats] = useState<SafetyStatsResponse>(emptyStats);
  const [filters, setFilters] = useState<DashboardFilters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const hazardTypeItems = dicts.safety_hazard_type ?? [];
  const riskLevelItems = dicts.safety_risk_level ?? [];

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set("start_date", filters.startDate);
      if (filters.endDate) params.set("end_date", filters.endDate);
      if (filters.buildingId) params.set("building_id", filters.buildingId);
      if (filters.riskLevel) params.set("risk_level", filters.riskLevel);
      if (filters.hazardType) params.set("hazard_type", filters.hazardType);
      if (filters.handlerId) params.set("handler_id", filters.handlerId);
      const queryString = params.toString();
      const path = queryString ? `/safety/statistics?${queryString}` : "/safety/statistics";
      const response = await apiRequest<SafetyStatsResponse>(path, {
        token: getAccessToken()
      });
      setStats(response.data);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载安全看板失败");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=200", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["safety_hazard_type", "safety_risk_level", "safety_hazard_status"];
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
    const [buildingResponse, userResponse] = await Promise.allSettled([
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=100&status=enabled", { token: getAccessToken() })
    ]);
    if (buildingResponse.status === "fulfilled") setBuildings(buildingResponse.value.data.items);
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
    { label: "巡检任务数", value: formatNumber(stats.summary.inspect_task_total), icon: <ClipboardCheck size={18} /> },
    { label: "巡检完成率", value: formatRate(stats.summary.inspect_completion_rate), icon: <CheckCircle2 size={18} /> },
    { label: "隐患总数", value: formatNumber(stats.summary.hazard_total), icon: <ShieldAlert size={18} /> },
    { label: "隐患闭环率", value: formatRate(stats.summary.hazard_close_rate), icon: <BarChart3 size={18} /> },
    { label: "超期隐患", value: formatNumber(stats.summary.overdue_hazard_count), icon: <AlertTriangle size={18} /> },
    { label: "重大隐患", value: formatNumber(stats.summary.major_hazard_count), icon: <Siren size={18} /> },
    { label: "高风险租户", value: formatNumber(stats.summary.high_risk_tenant_count), icon: <UsersRound size={18} /> }
  ], [stats]);

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.SAFETY_STATISTICS_READ} module={SAFETY_MODULE} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>安全看板</strong>
            <span>查看巡检完成、隐患闭环、超期重大隐患和高风险租户情况</span>
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
              <Field label="楼栋">
                <select value={filters.buildingId} onChange={(event) => setFilters((current) => ({ ...current, buildingId: event.target.value }))}>
                  <option value="">全部楼栋</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
                  ))}
                </select>
              </Field>
              <SelectField label="风险等级" value={filters.riskLevel} items={riskLevelItems} allLabel="全部风险等级" onChange={(value) => setFilters((current) => ({ ...current, riskLevel: value }))} />
              <SelectField label="隐患类型" value={filters.hazardType} items={hazardTypeItems} allLabel="全部隐患类型" onChange={(value) => setFilters((current) => ({ ...current, hazardType: value }))} />
              <Field label="责任人">
                <select value={filters.handlerId} onChange={(event) => setFilters((current) => ({ ...current, handlerId: event.target.value }))}>
                  <option value="">全部责任人</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{displayUserName(user)}</option>
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
          <BucketTable title="隐患类型分布" rows={stats.by_hazard_type} labelForKey={(key) => labelFor(hazardTypeItems, key)} />
          <BucketTable title="风险等级分布" rows={stats.by_risk_level} labelForKey={(key) => labelFor(riskLevelItems, key)} />
        </section>

        <Card>
          <h2 className="panel-title">楼栋隐患排行</h2>
          <DataTable>
            <thead>
              <tr>
                <th>楼栋</th>
                <th>隐患数</th>
                <th>未闭环</th>
                <th>超期</th>
                <th>重大</th>
              </tr>
            </thead>
            <tbody>
              {stats.by_building.length === 0 ? (
                <tr><td colSpan={5}>暂无楼栋隐患数据</td></tr>
              ) : stats.by_building.map((row) => (
                <tr key={row.building_id ?? "unassigned"}>
                  <td>{row.building_code} {row.building_name}</td>
                  <td>{row.count}</td>
                  <td>{row.open_count}</td>
                  <td>{row.overdue_count}</td>
                  <td>{row.major_count}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <section className="dashboard-grid">
          <HazardTable title="超期隐患列表" rows={stats.overdue_top} dicts={dicts} showOverdueDays />
          <HazardTable title="重大隐患列表" rows={stats.recent_major_hazards} dicts={dicts} />
        </section>
      </main>
    </PermissionGuard>
  );
}

function BucketTable({ title, rows, labelForKey }: { title: string; rows: SafetyStatsBucket[]; labelForKey: (key: string) => string }) {
  return (
    <Card className="workorder-stat-section">
      <h2 className="panel-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="empty-state">暂无统计数据</p>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>分类</th>
              <th>总数</th>
              <th>未闭环</th>
              <th>已闭环</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{labelForKey(row.key)}</td>
                <td>{row.count}</td>
                <td>{row.open_count}</td>
                <td>{row.closed_count}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Card>
  );
}

function HazardTable({ title, rows, dicts, showOverdueDays = false }: {
  title: string;
  rows: SafetyHazardStatsItem[];
  dicts: DictMap;
  showOverdueDays?: boolean;
}) {
  return (
    <Card className="workorder-stat-section">
      <h2 className="panel-title">{title}</h2>
      <DataTable>
        <thead>
          <tr>
            <th>隐患</th>
            <th>类型</th>
            <th>风险</th>
            <th>状态</th>
            <th>楼栋</th>
            {showOverdueDays ? <th>超期天数</th> : <th>登记时间</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6}>暂无隐患数据</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.hazard_code}</strong>
                <small className="muted-text">{row.title}</small>
              </td>
              <td>{row.hazard_type ? <StatusPill dictCode="safety_hazard_type" value={row.hazard_type} dicts={dicts} /> : "-"}</td>
              <td>{row.risk_level ? <StatusPill dictCode="safety_risk_level" value={row.risk_level} dicts={dicts} /> : "-"}</td>
              <td><StatusPill dictCode="safety_hazard_status" value={row.status} dicts={dicts} /></td>
              <td>{row.building_name}</td>
              {showOverdueDays ? <td>{row.overdue_days}</td> : <td>{formatDateTime(row.create_time)}</td>}
            </tr>
          ))}
        </tbody>
      </DataTable>
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

function formatRate(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function ForbiddenInline() {
  return (
    <main className="content">
      <Card>403：无权访问安全看板，或当前租户未启用 safety 模块。</Card>
    </main>
  );
}
