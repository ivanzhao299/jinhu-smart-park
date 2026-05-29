"use client";

import { Card, DataTable, StatusPill } from "@jinhu/ui";
import { AlertTriangle, ClipboardCheck, Clock3, FileWarning, RefreshCw, Search, ShieldCheck, Siren } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import type { DictItemRow, DictMap, DictTypeRow, ParkTenantRow, UnitRow } from "../../../components/workorders/types";
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
  incidentType: string;
  permitType: string;
  buildingId: string;
  unitId: string;
  parkTenantId: string;
}

interface EmergencySummary {
  total_count: number;
  open_count: number;
  closed_count: number;
  major_count: number;
  avg_response_minutes: number;
  avg_close_hours: number;
}

interface WorkPermitSummary {
  total_count: number;
  pending_count: number;
  approved_count: number;
  in_progress_count: number;
  closed_count: number;
  violation_count: number;
}

interface IncidentTypeBucket {
  incident_type: string;
  count: number;
  open_count: number;
  closed_count: number;
  major_count: number;
}

interface PermitTypeBucket {
  permit_type: string;
  count: number;
  pending_count: number;
  approved_count: number;
  violation_count: number;
}

interface RecentEmergencyRow {
  id: string;
  emergency_code: string;
  title: string;
  incident_type: string;
  severity_level: string;
  response_level: string | null;
  status: string;
  location: string;
  report_time: string;
}

interface RecentWorkPermitRow {
  id: string;
  permit_code: string;
  permit_type: string;
  risk_level: string;
  status: string;
  location: string;
  time_start: string;
  time_end: string;
  violation_count: number;
}

interface ViolationTopRow {
  permit_id: string;
  permit_code: string;
  permit_type: string;
  location: string;
  violation_count: number;
  latest_check_time: string | null;
}

interface EmergencyWorkPermitStatistics {
  emergency: EmergencySummary;
  work_permit: WorkPermitSummary;
  by_incident_type: IncidentTypeBucket[];
  by_permit_type: PermitTypeBucket[];
  recent_emergencies: RecentEmergencyRow[];
  recent_work_permits: RecentWorkPermitRow[];
  violation_top: ViolationTopRow[];
}

const emptyFilters: DashboardFilters = {
  startDate: "",
  endDate: "",
  incidentType: "",
  permitType: "",
  buildingId: "",
  unitId: "",
  parkTenantId: ""
};

const emptyStats: EmergencyWorkPermitStatistics = {
  emergency: {
    total_count: 0,
    open_count: 0,
    closed_count: 0,
    major_count: 0,
    avg_response_minutes: 0,
    avg_close_hours: 0
  },
  work_permit: {
    total_count: 0,
    pending_count: 0,
    approved_count: 0,
    in_progress_count: 0,
    closed_count: 0,
    violation_count: 0
  },
  by_incident_type: [],
  by_permit_type: [],
  recent_emergencies: [],
  recent_work_permits: [],
  violation_top: []
};

export default function SafetyEmergencyDashboardPage() {
  const [stats, setStats] = useState<EmergencyWorkPermitStatistics>(emptyStats);
  const [filters, setFilters] = useState<DashboardFilters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const incidentTypeItems = dicts.safety_emergency_incident_type ?? [];
  const permitTypeItems = dicts.safety_work_permit_type ?? [];

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set("start_date", filters.startDate);
      if (filters.endDate) params.set("end_date", filters.endDate);
      if (filters.incidentType) params.set("incident_type", filters.incidentType);
      if (filters.permitType) params.set("permit_type", filters.permitType);
      if (filters.buildingId) params.set("building_id", filters.buildingId);
      if (filters.unitId) params.set("unit_id", filters.unitId);
      if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
      const query = params.toString();
      const response = await apiRequest<EmergencyWorkPermitStatistics>(query ? `/safety/emergency-work-permit-statistics?${query}` : "/safety/emergency-work-permit-statistics", {
        token: getAccessToken()
      });
      setStats(response.data);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载应急作业看板失败");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = [
      "safety_emergency_incident_type",
      "safety_emergency_severity",
      "safety_emergency_response_level",
      "safety_emergency_status",
      "safety_work_permit_type",
      "safety_work_permit_status",
      "safety_risk_level"
    ];
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
    const [buildingResponse, unitResponse, parkTenantResponse] = await Promise.allSettled([
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UnitRow>>("/park-units?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=100", { token: getAccessToken() })
    ]);
    if (buildingResponse.status === "fulfilled") setBuildings(buildingResponse.value.data.items);
    if (unitResponse.status === "fulfilled") setUnits(unitResponse.value.data.items);
    if (parkTenantResponse.status === "fulfilled") setParkTenants(parkTenantResponse.value.data.items);
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadReferences().catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadReferences]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const kpis = useMemo(() => [
    { label: "应急事件", value: formatNumber(stats.emergency.total_count), helper: `未闭环 ${formatNumber(stats.emergency.open_count)}`, icon: <Siren size={18} /> },
    { label: "重大事件", value: formatNumber(stats.emergency.major_count), helper: `已闭环 ${formatNumber(stats.emergency.closed_count)}`, icon: <AlertTriangle size={18} /> },
    { label: "平均响应", value: `${stats.emergency.avg_response_minutes.toFixed(2)} 分钟`, helper: "按响应时间计算", icon: <Clock3 size={18} /> },
    { label: "平均闭环", value: `${stats.emergency.avg_close_hours.toFixed(2)} 小时`, helper: "按关闭时间计算", icon: <ShieldCheck size={18} /> },
    { label: "作业许可", value: formatNumber(stats.work_permit.total_count), helper: `待审 ${formatNumber(stats.work_permit.pending_count)}`, icon: <ClipboardCheck size={18} /> },
    { label: "已签发/执行", value: formatNumber(stats.work_permit.approved_count), helper: `开工中 ${formatNumber(stats.work_permit.in_progress_count)}`, icon: <ShieldCheck size={18} /> },
    { label: "作业闭环", value: formatNumber(stats.work_permit.closed_count), helper: "许可完成收单", icon: <ClipboardCheck size={18} /> },
    { label: "违规巡查", value: formatNumber(stats.work_permit.violation_count), helper: "fail / violation", icon: <FileWarning size={18} /> }
  ], [stats]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadStats();
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_STATISTICS_READ} module={SAFETY_MODULE} fallback={<ForbiddenInline />}>
      <PermissionGuard permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_STATISTICS_READ} module={SAFETY_MODULE} fallback={<ForbiddenInline />}>
        <main className="content">
          <header className="header">
            <div className="header-title">
              <strong>应急作业看板</strong>
              <span>查看应急事件响应闭环、作业许可审批执行和违规巡查情况</span>
            </div>
            <div className="page-actions">
              <button className="primary-button secondary-button" type="button" onClick={() => void loadStats()}>
                <RefreshCw size={16} />
                刷新
              </button>
            </div>
          </header>

          <Card>
            <form className="form-stack" onSubmit={submit}>
              <div className="dashboard-grid">
                <Field label="开始日期">
                  <input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} />
                </Field>
                <Field label="结束日期">
                  <input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} />
                </Field>
                <SelectField label="事件类型" value={filters.incidentType} items={incidentTypeItems} allLabel="全部事件类型" onChange={(value) => setFilters((current) => ({ ...current, incidentType: value }))} />
                <SelectField label="作业类型" value={filters.permitType} items={permitTypeItems} allLabel="全部作业类型" onChange={(value) => setFilters((current) => ({ ...current, permitType: value }))} />
                <Field label="楼栋">
                  <select value={filters.buildingId} onChange={(event) => setFilters((current) => ({ ...current, buildingId: event.target.value }))}>
                    <option value="">全部楼栋</option>
                    {buildings.map((building) => (
                      <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
                    ))}
                  </select>
                </Field>
                <Field label="房源">
                  <select value={filters.unitId} onChange={(event) => setFilters((current) => ({ ...current, unitId: event.target.value }))}>
                    <option value="">全部房源</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>{unit.unitCode} {unit.unitName}</option>
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
                <small className="muted-text">{item.helper}</small>
              </article>
            ))}
          </section>

          <section className="dashboard-grid">
            <IncidentTypeTable rows={stats.by_incident_type} dicts={dicts} />
            <PermitTypeTable rows={stats.by_permit_type} dicts={dicts} />
          </section>

          <section className="dashboard-grid">
            <RecentEmergencies rows={stats.recent_emergencies} dicts={dicts} />
            <RecentWorkPermits rows={stats.recent_work_permits} dicts={dicts} />
          </section>

          <Card className="workorder-stat-section">
            <h2 className="panel-title">违规排行</h2>
            <DataTable>
              <thead>
                <tr>
                  <th>作业许可</th>
                  <th>作业类型</th>
                  <th>位置</th>
                  <th>违规次数</th>
                  <th>最近巡查</th>
                </tr>
              </thead>
              <tbody>
                {stats.violation_top.length === 0 ? (
                  <tr><td colSpan={5}>暂无违规巡查数据</td></tr>
                ) : stats.violation_top.map((row) => (
                  <tr key={row.permit_id}>
                    <td>{row.permit_code}</td>
                    <td><StatusPill dictCode="safety_work_permit_type" value={row.permit_type} dicts={dicts} /></td>
                    <td>{row.location}</td>
                    <td>{row.violation_count}</td>
                    <td>{formatDateTime(row.latest_check_time)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        </main>
      </PermissionGuard>
    </PermissionGuard>
  );
}

function IncidentTypeTable({ rows, dicts }: { rows: IncidentTypeBucket[]; dicts: DictMap }) {
  return (
    <Card className="workorder-stat-section">
      <h2 className="panel-title">事件类型分布</h2>
      <DataTable>
        <thead>
          <tr>
            <th>类型</th>
            <th>总数</th>
            <th>未闭环</th>
            <th>已闭环</th>
            <th>重大</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5}>暂无事件统计数据</td></tr>
          ) : rows.map((row) => (
            <tr key={row.incident_type}>
              <td><StatusPill dictCode="safety_emergency_incident_type" value={row.incident_type} dicts={dicts} /></td>
              <td>{row.count}</td>
              <td>{row.open_count}</td>
              <td>{row.closed_count}</td>
              <td>{row.major_count}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Card>
  );
}

function PermitTypeTable({ rows, dicts }: { rows: PermitTypeBucket[]; dicts: DictMap }) {
  return (
    <Card className="workorder-stat-section">
      <h2 className="panel-title">作业类型分布</h2>
      <DataTable>
        <thead>
          <tr>
            <th>类型</th>
            <th>总数</th>
            <th>待审批</th>
            <th>已签发/执行</th>
            <th>违规</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5}>暂无作业许可统计数据</td></tr>
          ) : rows.map((row) => (
            <tr key={row.permit_type}>
              <td><StatusPill dictCode="safety_work_permit_type" value={row.permit_type} dicts={dicts} /></td>
              <td>{row.count}</td>
              <td>{row.pending_count}</td>
              <td>{row.approved_count}</td>
              <td>{row.violation_count}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Card>
  );
}

function RecentEmergencies({ rows, dicts }: { rows: RecentEmergencyRow[]; dicts: DictMap }) {
  return (
    <Card className="workorder-stat-section">
      <h2 className="panel-title">最近应急事件</h2>
      <DataTable>
        <thead>
          <tr>
            <th>事件</th>
            <th>类型</th>
            <th>等级</th>
            <th>状态</th>
            <th>上报时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5}>暂无应急事件</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.emergency_code}</strong>
                <small className="muted-text">{row.title}</small>
              </td>
              <td><StatusPill dictCode="safety_emergency_incident_type" value={row.incident_type} dicts={dicts} /></td>
              <td><StatusPill dictCode="safety_emergency_severity" value={row.severity_level} dicts={dicts} /></td>
              <td><StatusPill dictCode="safety_emergency_status" value={row.status} dicts={dicts} /></td>
              <td>{formatDateTime(row.report_time)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Card>
  );
}

function RecentWorkPermits({ rows, dicts }: { rows: RecentWorkPermitRow[]; dicts: DictMap }) {
  return (
    <Card className="workorder-stat-section">
      <h2 className="panel-title">最近作业许可</h2>
      <DataTable>
        <thead>
          <tr>
            <th>许可</th>
            <th>作业类型</th>
            <th>风险</th>
            <th>状态</th>
            <th>违规</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5}>暂无作业许可</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.permit_code}</strong>
                <small className="muted-text">{formatDateTime(row.time_start)} - {formatDateTime(row.time_end)}</small>
              </td>
              <td><StatusPill dictCode="safety_work_permit_type" value={row.permit_type} dicts={dicts} /></td>
              <td><StatusPill dictCode="safety_risk_level" value={row.risk_level} dicts={dicts} /></td>
              <td><StatusPill dictCode="safety_work_permit_status" value={row.status} dicts={dicts} /></td>
              <td>{row.violation_count}</td>
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
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
      <Card>403：无权访问应急作业看板，或当前租户未启用 safety 模块。</Card>
    </main>
  );
}
