"use client";
import { DataTable, Card } from "@jinhu/ui";

import { BarChart3, RefreshCw, Search, Target, UserCheck, Users } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { PaginatedResult } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const LEASING_MODULE = "leasing";
const LEAD_READ_PERMISSION = "leasing_lead:read";
const FUNNEL_PERMISSION = "leasing_statistics:funnel";

interface DictTypeRow {
  id: string;
  dictCode: string;
}

interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
}

interface UserOptionRow {
  id: string;
  username: string;
  displayName?: string | null;
}

interface LeasingFunnelStatistics {
  summary: {
    total_leads: number;
    valid_leads: number;
    visited_count: number;
    quoted_count: number;
    negotiating_count: number;
    signed_count: number;
    signed_area: number;
    lost_count: number;
    visit_rate: number;
    quote_rate: number;
    sign_rate: number;
  };
  by_status: Array<{ status: string; status_name: string; count: number }>;
  by_source: Array<{ source: string | null; source_name: string; count: number }>;
  lost_reasons: Array<{ lost_reason: string; lost_reason_name: string; count: number }>;
  by_follow_user: Array<{ follow_user_id: string | null; follow_user_name: string; count: number; signed_count: number }>;
}

const emptyStats: LeasingFunnelStatistics = {
  summary: {
    total_leads: 0,
    valid_leads: 0,
    visited_count: 0,
    quoted_count: 0,
    negotiating_count: 0,
    signed_count: 0,
    signed_area: 0,
    lost_count: 0,
    visit_rate: 0,
    quote_rate: 0,
    sign_rate: 0
  },
  by_status: [],
  by_source: [],
  lost_reasons: [],
  by_follow_user: []
};

export default function LeasingFunnelPage() {
  const [stats, setStats] = useState<LeasingFunnelStatistics>(emptyStats);
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [users, setUsers] = useState<UserOptionRow[]>([]);
  const [filters, setFilters] = useState({ startDate: "", endDate: "", followUserId: "", source: "", industryCode: "" });
  const [message, setMessage] = useState("");

  const sourceItems = dicts.leasing_lead_source ?? [];
  const industryItems = dicts.industry_code ?? [];
  const maxStatusCount = useMemo(() => Math.max(1, ...stats.by_status.map((item) => item.count)), [stats.by_status]);
  const maxSourceCount = useMemo(() => Math.max(1, ...stats.by_source.map((item) => item.count)), [stats.by_source]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    if (filters.followUserId) params.set("follow_user_id", filters.followUserId);
    if (filters.source) params.set("source", filters.source);
    if (filters.industryCode) params.set("industry_code", filters.industryCode);
    const response = await apiRequest<LeasingFunnelStatistics>(`/leasing/statistics/funnel?${params.toString()}`, {
      token: getAccessToken()
    });
    setStats(response.data);
    setMessage("");
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const dictTypeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const dictTypeMap = new Map(dictTypeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const entries = await Promise.all(
      ["leasing_lead_source", "industry_code"].map(async (code) => {
        const dictTypeId = dictTypeMap.get(code);
        if (!dictTypeId) return [code, []] as const;
        const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
          token: getAccessToken()
        });
        return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
      })
    );
    setDicts(Object.fromEntries(entries));
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const response = await apiRequest<PaginatedResult<UserOptionRow>>("/users?page=1&page_size=100", {
        token: getAccessToken()
      });
      setUsers(response.data.items);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    void Promise.all([loadDicts(), loadUsers()]).catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadUsers]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load().catch((error: Error) => setMessage(error.message));
  }

  return (
    <PermissionGuard module={LEASING_MODULE} fallback={<ModuleUnauthorizedInline />}>
      <PermissionGuard permission={LEAD_READ_PERMISSION} module={LEASING_MODULE} fallback={<ForbiddenInline />}>
        <PermissionGuard permission={FUNNEL_PERMISSION} module={LEASING_MODULE} fallback={<ForbiddenInline />}>
          <main className="page-container funnel-page">
            <section className="page-header">
              <div className="header-title">
                <strong>招商漏斗</strong>
                <span>按线索阶段、来源、流失原因和跟进人查看招商转化情况</span>
              </div>
              <button className="primary-button" type="button" onClick={() => void load().catch((error: Error) => setMessage(error.message))}>
                <RefreshCw size={16} />
                刷新
              </button>
            </section>

            <section className="filter-bar funnel-filter">
              <form className="funnel-filter-form" onSubmit={submit}>
                <div className="funnel-filter-grid">
                  <DateField label="开始日期" value={filters.startDate} onChange={(value) => updateFilter("startDate", value)} />
                  <DateField label="结束日期" value={filters.endDate} onChange={(value) => updateFilter("endDate", value)} />
                  <UserField users={users} value={filters.followUserId} onChange={(value) => updateFilter("followUserId", value)} />
                  <SelectField label="来源" value={filters.source} options={sourceItems} onChange={(value) => updateFilter("source", value)} />
                  <SelectField label="行业" value={filters.industryCode} options={industryItems} onChange={(value) => updateFilter("industryCode", value)} />
                  <div className="filter-actions">
                    <button className="primary-button" type="submit">
                      <Search size={16} />
                      查询
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {message ? <p className="status-pill">{message}</p> : null}

            <section className="funnel-kpi-grid">
              <FunnelKpiCard icon={<Users size={18} />} label="总线索" value={formatCount(stats.summary.total_leads)} helper="全部招商线索" />
              <FunnelKpiCard icon={<Target size={18} />} label="有效线索" value={formatCount(stats.summary.valid_leads)} helper={`占比 ${formatPercent(ratio(stats.summary.valid_leads, stats.summary.total_leads))}`} />
              <FunnelKpiCard icon={<UserCheck size={18} />} label="已看房" value={formatCount(stats.summary.visited_count)} helper={`看房率 ${formatPercent(stats.summary.visit_rate)}`} />
              <FunnelKpiCard icon={<BarChart3 size={18} />} label="已签约" value={formatCount(stats.summary.signed_count)} helper={`签约面积 ${formatArea(stats.summary.signed_area)}`} emphasis />
            </section>

            <section className="funnel-rate-strip">
              <RateCard label="报价率" value={formatPercent(stats.summary.quote_rate)} count={`${formatCount(stats.summary.quoted_count)} 条报价`} />
              <RateCard label="谈判中" value={formatCount(stats.summary.negotiating_count)} count="商务谈判阶段" />
              <RateCard label="签约率" value={formatPercent(stats.summary.sign_rate)} count={`${formatCount(stats.summary.signed_count)} 条签约`} />
              <RateCard label="流失" value={formatCount(stats.summary.lost_count)} count="需复盘原因" muted />
            </section>

            <section className="funnel-main-grid">
              <FunnelStagePanel summary={stats.summary} />
              <DistributionPanel
                title="来源分布"
                rows={stats.by_source.map((item) => ({
                  key: item.source ?? "empty",
                  label: item.source_name || labelFor(sourceItems, item.source),
                  count: item.count,
                  percent: item.count / maxSourceCount
                }))}
              />
            </section>

            <DistributionPanel
              title="阶段明细"
              rows={stats.by_status.map((item) => ({
                key: item.status,
                label: <span className="status-pill">{item.status_name}</span>,
                count: item.count,
                percent: item.count / maxStatusCount
              }))}
            />

            <section className="funnel-table-grid">
              <Card className="funnel-table-card table-scroll">
                <h2 className="panel-title">流失原因排行</h2>
                <DataTable >
                  <thead>
                    <tr>
                      <th>流失原因</th>
                      <th>线索数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.lost_reasons.length === 0 ? (
                      <tr>
                        <td colSpan={2}>暂无流失原因数据</td>
                      </tr>
                    ) : stats.lost_reasons.map((item) => (
                      <tr key={item.lost_reason}>
                        <td>{item.lost_reason_name}</td>
                        <td>{formatCount(item.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </Card>

              <Card className="funnel-table-card table-scroll">
                <h2 className="panel-title">跟进人统计</h2>
                <DataTable >
                  <thead>
                    <tr>
                      <th>跟进人</th>
                      <th>线索数</th>
                      <th>已签约</th>
                      <th>签约率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.by_follow_user.length === 0 ? (
                      <tr>
                        <td colSpan={4}>暂无跟进人统计数据</td>
                      </tr>
                    ) : stats.by_follow_user.map((item) => (
                      <tr key={item.follow_user_id ?? "empty"}>
                        <td>{item.follow_user_name}</td>
                        <td>{formatCount(item.count)}</td>
                        <td>{formatCount(item.signed_count)}</td>
                        <td>{formatPercent(item.count > 0 ? item.signed_count / item.count : 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </Card>
            </section>
          </main>
        </PermissionGuard>
      </PermissionGuard>
    </PermissionGuard>
  );
}

function FunnelKpiCard({
  icon,
  label,
  value,
  helper,
  emphasis = false
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
  emphasis?: boolean;
}) {
  return (
    <section className={`funnel-kpi-card${emphasis ? " funnel-kpi-card-emphasis" : ""}`}>
      <div className="funnel-kpi-header">
        <span className="funnel-kpi-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <span>{helper}</span>
    </section>
  );
}

function RateCard({ label, value, count, muted = false }: { label: string; value: string; count: string; muted?: boolean }) {
  return (
    <section className={`funnel-rate-card${muted ? " funnel-rate-muted" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{count}</em>
    </section>
  );
}

function FunnelStagePanel({ summary }: { summary: LeasingFunnelStatistics["summary"] }) {
  const stages = [
    { key: "total", label: "总线索", value: summary.total_leads, helper: "线索入口" },
    { key: "valid", label: "有效线索", value: summary.valid_leads, helper: "可继续推进" },
    { key: "visited", label: "已看房", value: summary.visited_count, helper: `看房率 ${formatPercent(summary.visit_rate)}` },
    { key: "quoted", label: "已报价", value: summary.quoted_count, helper: `报价率 ${formatPercent(summary.quote_rate)}` },
    { key: "negotiating", label: "商务谈判", value: summary.negotiating_count, helper: "价格与条款沟通" },
    { key: "signed", label: "已签约", value: summary.signed_count, helper: `签约率 ${formatPercent(summary.sign_rate)}` }
  ];
  const maxValue = Math.max(1, summary.total_leads, ...stages.map((stage) => stage.value));

  return (
    <Card className="funnel-stage-panel">
      <div className="funnel-panel-header">
        <h2 className="panel-title">招商阶段漏斗</h2>
        <span>从线索进入到签约转化</span>
      </div>
      <div className="funnel-stage-list">
        {stages.map((stage) => (
          <div className="funnel-stage-row" key={stage.key}>
            <span>{stage.label}</span>
            <strong>{formatCount(stage.value)}</strong>
            <progress className="funnel-stage-progress" value={(stage.value / maxValue) * 100} max={100} />
            <em>{stage.helper}</em>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DistributionPanel({
  title,
  rows
}: {
  title: string;
  rows: Array<{ key: string; label: ReactNode; count: number; percent: number }>;
}) {
  return (
    <Card className="funnel-distribution-panel">
      <div className="funnel-panel-header">
        <h2 className="panel-title">{title}</h2>
        <span>{rows.length > 0 ? `${rows.length} 项` : "暂无数据"}</span>
      </div>
      <div className="funnel-bar-list">
        {rows.map((row) => (
          <div className="funnel-bar-row" key={row.key}>
            <span>{row.label}</span>
            <strong>{formatCount(row.count)} 条</strong>
            <progress className="funnel-mini-progress" value={row.percent * 100} max={100} />
          </div>
        ))}
        {rows.length === 0 ? <span className="muted-text">暂无统计数据</span> : null}
      </div>
    </Card>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = `field-${label}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: DictItemRow[];
  onChange: (value: string) => void;
}) {
  const id = `field-${label}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">全部</option>
        {options.map((item) => (
          <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
        ))}
      </select>
    </div>
  );
}

function UserField({ users, value, onChange }: { users: UserOptionRow[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label htmlFor="funnel-follow-user">跟进人</label>
      <input
        id="funnel-follow-user"
        list="funnel-follow-user-options"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="全部或输入用户 ID"
      />
      <datalist id="funnel-follow-user-options">
        {users.map((user) => (
          <option key={user.id} value={user.id}>{user.displayName || user.username}</option>
        ))}
      </datalist>
    </div>
  );
}

function labelFor(items: DictItemRow[], value?: string | null): string {
  if (!value) return "-";
  return items.find((item) => item.itemValue === String(value))?.itemLabel ?? String(value);
}

function formatCount(value: number): string {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatArea(value: number): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

function formatPercent(value: number): string {
  return `${(Number(value || 0) * 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function ratio(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

function ForbiddenInline() {
  return (
    <main className="page-container">
      <Card >
        <h2>403</h2>
        <p className="muted-text">当前账号没有访问招商漏斗统计的权限。</p>
      </Card>
    </main>
  );
}

function ModuleUnauthorizedInline() {
  return (
    <main className="page-container">
      <Card >
        <h2>模块未授权</h2>
        <p className="muted-text">当前租户未启用 leasing 模块。</p>
      </Card>
    </main>
  );
}
