"use client";
import { DataTable, Card } from "@jinhu/ui";

import { Building2, Layers3, PieChart, RefreshCw, Search } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const ASSET_READ_PERMISSION = "asset:read";
const ASSET_STATISTICS_PERMISSION = "asset:statistics";

interface PaginatedResult<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

interface BuildingRow {
  id: string;
  buildingCode: string;
  buildingName: string;
}

interface FloorRow {
  id: string;
  buildingId: string;
  floorCode: string;
  floorName: string;
}

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

interface AssetStatistics {
  summary: {
    total_units: number;
    total_area: number;
    rentable_units: number;
    rentable_area: number;
    locked_units: number;
    locked_area: number;
    rented_units: number;
    rented_area: number;
    expiring_units: number;
    expiring_area: number;
    maintenance_units: number;
    maintenance_area: number;
    self_use_units: number;
    self_use_area: number;
    sold_units: number;
    sold_area: number;
    occupancy_rate: number;
    vacancy_rate: number;
    avg_ref_price: number;
  };
  by_building: Array<{
    building_id: string;
    building_code: string;
    building_name: string;
    total_area: number;
    rented_area: number;
    rentable_area: number;
    occupancy_rate: number;
    vacancy_rate: number;
  }>;
  by_status: Array<{ rental_status: number; status_name: string; unit_count: number; area: number }>;
  by_usage_type: Array<{ usage_type: number; usage_name: string; unit_count: number; area: number }>;
}

const emptyStats: AssetStatistics = {
  summary: {
    total_units: 0,
    total_area: 0,
    rentable_units: 0,
    rentable_area: 0,
    locked_units: 0,
    locked_area: 0,
    rented_units: 0,
    rented_area: 0,
    expiring_units: 0,
    expiring_area: 0,
    maintenance_units: 0,
    maintenance_area: 0,
    self_use_units: 0,
    self_use_area: 0,
    sold_units: 0,
    sold_area: 0,
    occupancy_rate: 0,
    vacancy_rate: 0,
    avg_ref_price: 0
  },
  by_building: [],
  by_status: [],
  by_usage_type: []
};

export default function AssetStatisticsPage() {
  const [stats, setStats] = useState<AssetStatistics>(emptyStats);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [filters, setFilters] = useState({ buildingId: "", floorId: "", usageType: "" });
  const [message, setMessage] = useState("");

  const visibleFloors = useMemo(
    () => floors.filter((floor) => !filters.buildingId || floor.buildingId === filters.buildingId),
    [floors, filters.buildingId]
  );

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.buildingId) params.set("building_id", filters.buildingId);
    if (filters.floorId) params.set("floor_id", filters.floorId);
    if (filters.usageType) params.set("usage_type", filters.usageType);
    const response = await apiRequest<AssetStatistics>(`/assets/statistics?${params.toString()}`, {
      token: getAccessToken()
    });
    setStats(response.data);
  }, [filters]);

  const loadLookups = useCallback(async () => {
    const [buildingResponse, floorResponse, dictTypeResponse] = await Promise.all([
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100&sort=sortNo", { token: getAccessToken() }),
      apiRequest<PaginatedResult<FloorRow>>("/floors?page=1&page_size=100&sort=floorNo", { token: getAccessToken() }),
      apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() })
    ]);
    setBuildings(buildingResponse.data.items);
    setFloors(floorResponse.data.items);

    const dictTypeMap = new Map(dictTypeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const entries = await Promise.all(
      ["unit_usage_type", "unit_rental_status"].map(async (code) => {
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

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    void loadLookups().catch((error: Error) => setMessage(error.message));
  }, [loadLookups]);

  const maxStatusArea = useMemo(() => Math.max(1, ...stats.by_status.map((item) => item.area)), [stats.by_status]);
  const maxUsageArea = useMemo(() => Math.max(1, ...stats.by_usage_type.map((item) => item.area)), [stats.by_usage_type]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "buildingId" ? { floorId: "" } : {})
    }));
  }

  return (
    <PermissionGuard permission={ASSET_READ_PERMISSION} module="asset" fallback={<ForbiddenInline />}>
      <PermissionGuard permission={ASSET_STATISTICS_PERMISSION} module="asset" fallback={<ForbiddenInline />}>
      <main className="page-container asset-statistics-page">
        <header className="page-header">
          <div className="header-title">
            <strong>资产统计</strong>
            <span>按房源状态统计面积、出租率、空置率与楼栋分布</span>
          </div>
          <button className="primary-button" type="button" onClick={() => void load().catch((error: Error) => setMessage(error.message))}>
            <RefreshCw size={16} />
            刷新
          </button>
        </header>

        <section className="filter-bar">
          <form className="asset-stat-filter-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void load().catch((error: Error) => setMessage(error.message)); }}>
            <div className="asset-stat-filter-grid">
              <SelectField label="楼栋" value={filters.buildingId} onChange={(value) => updateFilter("buildingId", value)}>
                <option value="">全部楼栋</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
                ))}
              </SelectField>
              <SelectField label="楼层" value={filters.floorId} onChange={(value) => updateFilter("floorId", value)}>
                <option value="">全部楼层</option>
                {visibleFloors.map((floor) => (
                  <option key={floor.id} value={floor.id}>{floor.floorCode} {floor.floorName}</option>
                ))}
              </SelectField>
              <DictSelect label="用途" value={filters.usageType} items={dicts.unit_usage_type} onChange={(value) => updateFilter("usageType", value)} />
            </div>
            <button className="primary-button asset-stat-filter-button" type="submit">
              <Search size={16} />
              查询
            </button>
          </form>
        </section>

        <Card className="asset-stat-summary">
          <MetricCard icon={<Building2 size={18} />} label="房源总数" value={formatCount(stats.summary.total_units)} />
          <MetricCard icon={<Layers3 size={18} />} label="总建筑面积" value={formatArea(stats.summary.total_area)} />
          <MetricCard icon={<Layers3 size={18} />} label="已租面积" value={formatArea(stats.summary.rented_area)} />
          <MetricCard icon={<Layers3 size={18} />} label="可招商面积" value={formatArea(stats.summary.rentable_area)} />
          <MetricCard icon={<PieChart size={18} />} label="出租率" value={formatPercent(stats.summary.occupancy_rate)} />
          <MetricCard icon={<PieChart size={18} />} label="空置率" value={formatPercent(stats.summary.vacancy_rate)} />
          <MetricCard icon={<Layers3 size={18} />} label="锁定面积" value={formatArea(stats.summary.locked_area)} />
          <MetricCard icon={<Layers3 size={18} />} label="维修中面积" value={formatArea(stats.summary.maintenance_area)} />
          <MetricCard icon={<Layers3 size={18} />} label="自用面积" value={formatArea(stats.summary.self_use_area)} />
          <MetricCard icon={<Layers3 size={18} />} label="已售面积" value={formatArea(stats.summary.sold_area)} />
        </Card>

        <Card className="asset-stat-panel table-scroll">
          <h2 className="panel-title">楼栋统计</h2>
          <DataTable >
            <thead><tr><th>楼栋编码</th><th>楼栋名称</th><th>总面积</th><th>已租面积</th><th>可招商面积</th><th>出租率</th><th>空置率</th></tr></thead>
            <tbody>
              {stats.by_building.map((item) => (
                <tr key={item.building_id}>
                  <td>{item.building_code}</td>
                  <td>{item.building_name}</td>
                  <td>{formatArea(item.total_area)}</td>
                  <td>{formatArea(item.rented_area)}</td>
                  <td>{formatArea(item.rentable_area)}</td>
                  <td>{formatPercent(item.occupancy_rate)}</td>
                  <td>{formatPercent(item.vacancy_rate)}</td>
                </tr>
              ))}
              {stats.by_building.length === 0 ? <tr><td colSpan={7}>暂无楼栋统计数据</td></tr> : null}
            </tbody>
          </DataTable>
        </Card>

        <DistributionPanel
          title="状态分布"
          rows={stats.by_status.map((item) => ({
            key: String(item.rental_status),
            label: <StatusBadge label={item.status_name || dictLabel(dicts.unit_rental_status, item.rental_status)} />,
            count: item.unit_count,
            area: item.area,
            percent: item.area / maxStatusArea
          }))}
        />

        <DistributionPanel
          title="用途分布"
          rows={stats.by_usage_type.map((item) => ({
            key: String(item.usage_type),
            label: item.usage_name || dictLabel(dicts.unit_usage_type, item.usage_type),
            count: item.unit_count,
            area: item.area,
            percent: item.area / maxUsageArea
          }))}
        />

        {message ? <p className="status-pill">{message}</p> : null}
      </main>
      </PermissionGuard>
    </PermissionGuard>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <section className="asset-stat-card">
      <div className="asset-stat-card-header">
        <span className="asset-stat-card-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <strong className="asset-stat-card-value">{value}</strong>
    </section>
  );
}

function DistributionPanel({
  title,
  rows
}: {
  title: string;
  rows: Array<{ key: string; label: ReactNode; count: number; area: number; percent: number }>;
}) {
  return (
    <Card className="asset-stat-panel asset-distribution-panel">
      <h2 className="panel-title">{title}</h2>
      <div className="asset-distribution-list">
        {rows.map((row) => (
          <div className="asset-distribution-row" key={row.key}>
            <span className="asset-distribution-label">{row.label}</span>
            <strong>{formatCount(row.count)} 间 / {formatArea(row.area)}</strong>
            <progress className="asset-progress" value={row.percent * 100} max={100} />
          </div>
        ))}
        {rows.length === 0 ? <span>暂无统计数据</span> : null}
      </div>
    </Card>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </div>
  );
}

function DictSelect({
  label,
  value,
  items = [],
  onChange
}: {
  label: string;
  value: string;
  items?: DictItemRow[];
  onChange: (value: string) => void;
}) {
  return (
    <SelectField label={label} value={value} onChange={onChange}>
      <option value="">全部</option>
      {items.map((item) => (
        <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
      ))}
    </SelectField>
  );
}

function StatusBadge({ label }: { label: string }) {
  return <span className="status-pill">{label}</span>;
}

function dictLabel(items: DictItemRow[] | undefined, value: number): string {
  return items?.find((item) => Number(item.itemValue) === value)?.itemLabel ?? String(value);
}

function formatArea(value: number): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

function formatCount(value: number): string {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatPercent(value: number): string {
  return `${(Number(value || 0) * 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function ForbiddenInline() {
  return (
    <main className="page-container">
      <Card >
        <h1 className="panel-title">403</h1>
        <p>当前账号没有资产统计访问权限。</p>
      </Card>
    </main>
  );
}
