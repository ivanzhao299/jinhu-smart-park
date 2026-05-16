"use client";

import { Eye, RefreshCw, Search, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { UserContext } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";

const ASSET_MODULE = "asset";
const ASSET_STATUS_BOARD_PERMISSION = "asset:status_board";
const UNIT_READ_PERMISSION = "unit:read";
const UNIT_FIELD_REF_PRICE = "ref_price";

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

interface BoardUnit {
  unit_id: string;
  code: string;
  unit_code: string;
  unit_name: string;
  unit_area: number;
  rental_status: number;
  rental_status_name: string;
  usage_type: number;
  usage_type_name: string;
  ref_price?: number | string | null;
}

interface BoardFloor {
  floor_id: string;
  floor_code: string;
  floor_name: string;
  units: BoardUnit[];
}

interface BoardBuilding {
  building_id: string;
  building_code: string;
  building_name: string;
  floors: BoardFloor[];
}

interface UnitStatusBoardResponse {
  buildings: BoardBuilding[];
}

interface SelectedUnit {
  building: BoardBuilding;
  floor: BoardFloor;
  unit: BoardUnit;
}

export default function UnitStatusBoardPage() {
  const authUser = useAuthUser();
  const [board, setBoard] = useState<UnitStatusBoardResponse>({ buildings: [] });
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [rentalStatusItems, setRentalStatusItems] = useState<DictItemRow[]>([]);
  const [filters, setFilters] = useState({ buildingId: "", rentalStatus: "" });
  const [selected, setSelected] = useState<SelectedUnit | null>(null);
  const [message, setMessage] = useState("");
  const canViewRefPrice = canViewField(authUser, "asset", "unit", UNIT_FIELD_REF_PRICE);

  const totalUnits = useMemo(
    () => board.buildings.reduce((buildingTotal, building) => buildingTotal + building.floors.reduce((floorTotal, floor) => floorTotal + floor.units.length, 0), 0),
    [board]
  );

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.buildingId) params.set("building_id", filters.buildingId);
    if (filters.rentalStatus) params.set("rental_status", filters.rentalStatus);
    const response = await apiRequest<UnitStatusBoardResponse>(`/assets/unit-status-board?${params.toString()}`, {
      token: getAccessToken()
    });
    setBoard(response.data);
  }, [filters]);

  const loadLookups = useCallback(async () => {
    const [buildingResponse, dictTypeResponse] = await Promise.all([
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100&sort=sortNo", { token: getAccessToken() }),
      apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() })
    ]);
    setBuildings(buildingResponse.data.items);
    const dictTypeId = dictTypeResponse.data.items.find((item) => item.dictCode === "unit_rental_status")?.id;
    if (!dictTypeId) {
      setRentalStatusItems([]);
      return;
    }
    const itemsResponse = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
      token: getAccessToken()
    });
    setRentalStatusItems(itemsResponse.data.items.filter((item) => item.status === "enabled"));
  }, []);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    void loadLookups().catch((error: Error) => setMessage(error.message));
  }, [loadLookups]);

  return (
    <PermissionGuard module={ASSET_MODULE} fallback={<ModuleUnauthorizedInline />}>
      <PermissionGuard permission={ASSET_STATUS_BOARD_PERMISSION} module={ASSET_MODULE} fallback={<ForbiddenInline />}>
        <PermissionGuard permission={UNIT_READ_PERMISSION} module={ASSET_MODULE} fallback={<ForbiddenInline />}>
      <main className="page-container">
        <header className="page-header">
          <div className="header-title">
            <strong>房源状态看板</strong>
            <span>按楼栋和楼层查看房源出租状态</span>
          </div>
          <button className="primary-button" type="button" onClick={() => void load().catch((error: Error) => setMessage(error.message))}>
            <RefreshCw size={16} />
            刷新
          </button>
        </header>

        <section className="filter-bar">
          <form className="form-stack" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void load().catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <SelectField label="楼栋" value={filters.buildingId} onChange={(value) => setFilters((current) => ({ ...current, buildingId: value }))}>
                <option value="">全部楼栋</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
                ))}
              </SelectField>
              <SelectField label="出租状态" value={filters.rentalStatus} onChange={(value) => setFilters((current) => ({ ...current, rentalStatus: value }))}>
                <option value="">全部状态</option>
                {rentalStatusItems.map((item) => (
                  <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
                ))}
              </SelectField>
            </div>
            <button className="primary-button" type="submit">
              <Search size={16} />
              查询
            </button>
          </form>
        </section>

        <section className="page-content task-item">
          <span>当前结果</span>
          <strong>{board.buildings.length} 栋 / {totalUnits} 间房源</strong>
        </section>

        {board.buildings.map((building) => (
          <section className="page-content asset-board-building" key={building.building_id}>
            <div className="task-item">
              <h2 className="panel-title">{building.building_code} {building.building_name}</h2>
              <span>{building.floors.reduce((total, floor) => total + floor.units.length, 0)} 间</span>
            </div>
            <div className="form-stack">
              {building.floors.map((floor) => (
                <section className="asset-board-floor" key={floor.floor_id}>
                  <div className="task-item">
                    <strong>{floor.floor_code} {floor.floor_name}</strong>
                    <span>{floor.units.length} 间</span>
                  </div>
                  <div className="dashboard-grid">
                    {floor.units.map((unit) => (
                      <button
                        className={`asset-unit-card asset-unit-status-${unit.rental_status}`}
                        key={unit.unit_id}
                        type="button"
                        onClick={() => setSelected({ building, floor, unit })}
                      >
                        <div className="task-item">
                          <strong>{unit.unit_name}</strong>
                          <StatusBadge status={unit.rental_status} label={unit.rental_status_name} />
                        </div>
                        <div className="form-stack">
                          <span>{unit.code || unit.unit_code}</span>
                          <span>{unit.unit_code}</span>
                          <span>{formatArea(unit.unit_area)} · {unit.usage_type_name}</span>
                          {canViewRefPrice ? <strong>{formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, unit.ref_price))}</strong> : null}
                        </div>
                      </button>
                    ))}
                    {floor.units.length === 0 ? <span>本楼层暂无匹配房源</span> : null}
                  </div>
                </section>
              ))}
            </div>
          </section>
        ))}

        {board.buildings.length === 0 ? (
          <section className="page-content">
            <p>暂无匹配房源。</p>
          </section>
        ) : null}

        {selected ? <UnitDetailDrawer selected={selected} onClose={() => setSelected(null)} /> : null}
        {message ? <p className="status-pill">{message}</p> : null}
      </main>
        </PermissionGuard>
      </PermissionGuard>
    </PermissionGuard>
  );
}

function UnitDetailDrawer({ selected, onClose }: { selected: SelectedUnit; onClose: () => void }) {
  const authUser = useAuthUser();
  const { building, floor, unit } = selected;
  const canViewRefPrice = canViewField(authUser, "asset", "unit", UNIT_FIELD_REF_PRICE);
  return (
    <section className="login-panel drawer-panel drawer-panel-md">
      <div className="task-item">
        <h2 className="panel-title">房源详情</h2>
        <button type="button" title="关闭" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="form-stack">
        <DetailItem label="房源名称" value={unit.unit_name} />
        <DetailItem label="统一编码" value={unit.code || unit.unit_code} />
        <DetailItem label="房源编码" value={unit.unit_code} />
        <DetailItem label="楼栋" value={`${building.building_code} ${building.building_name}`} />
        <DetailItem label="楼层" value={`${floor.floor_code} ${floor.floor_name}`} />
        <DetailItem label="建筑面积" value={formatArea(unit.unit_area)} />
        <DetailItem label="出租状态" value={<StatusBadge status={unit.rental_status} label={unit.rental_status_name} />} />
        <DetailItem label="用途" value={unit.usage_type_name} />
        {canViewRefPrice ? <DetailItem label="参考租金" value={formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, unit.ref_price))} /> : null}
      </div>
      <button className="primary-button" type="button" onClick={onClose}>
        <Eye size={16} />
        知道了
      </button>
    </section>
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

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="task-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status, label }: { status: number; label: string }) {
  return <span className={`status-pill ${statusClassName(status)}`}>{label}</span>;
}

function statusClassName(status: number): string {
  const classes: Record<number, string> = {
    10: "status-success",
    20: "status-warning",
    30: "status-primary",
    40: "status-warning",
    50: "status-danger",
    60: "status-info"
  };
  return classes[status] ?? "status-muted";
}

function formatArea(value: number): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

function formatMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元` : String(value);
}

function maskUnitField(user: UserContext | null, fieldKey: string, value: unknown): unknown {
  return maskField(user, "asset", "unit", fieldKey, value);
}

function ForbiddenInline() {
  return (
    <main className="page-container">
      <section className="page-content">
        <h1 className="panel-title">403</h1>
        <p>当前账号没有房源状态看板访问权限。</p>
      </section>
    </main>
  );
}

function ModuleUnauthorizedInline() {
  return (
    <main className="page-container">
      <section className="page-content">
        <h1 className="panel-title">模块未授权</h1>
        <p>当前租户未开通资产模块，无法访问房源状态看板。</p>
      </section>
    </main>
  );
}
