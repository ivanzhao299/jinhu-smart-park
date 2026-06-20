"use client";
import { Card, DataTable, Drawer, DrawerDetailGrid, DrawerDetailItem, DrawerFooter, DrawerHeader } from "@jinhu/ui";

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
  tagType?: string | null;
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
  current_tenant_id: string | null;
  current_tenant_name: string | null;
  current_contract_id: string | null;
  current_contract_code: string | null;
  current_contract_status: string | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
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

interface UnitWorkOrderRow {
  id: string;
  wo_code: string;
  title: string;
  wo_type: string;
  priority: string;
  urgency: string | null;
  status: string;
  location: string | null;
  reporter_name: string | null;
  reporter_mobile?: string | null;
  assignee_name: string | null;
  overdue_flag: boolean;
  create_time: string;
  update_time: string;
}

interface UnitWorkOrdersResponse {
  summary: {
    total_count: number;
    open_count: number;
    overdue_count: number;
  };
  recent_items: UnitWorkOrderRow[];
}

interface UnitHazardRow {
  id: string;
  hazard_code: string;
  title: string;
  hazard_type: string | null;
  risk_level: string | null;
  source_type: string;
  status: string;
  location: string;
  rectify_user_name: string | null;
  rectify_deadline: string | null;
  overdue_flag: boolean;
  update_time: string;
}

interface UnitHazardsResponse {
  summary: {
    total_count: number;
    open_count: number;
    overdue_count: number;
    major_count: number;
  };
  recent_items: UnitHazardRow[];
}

interface UnitEmergencyRow {
  id: string;
  emergency_code: string;
  title: string;
  incident_type: string;
  severity_level: string;
  response_level: string | null;
  status: string;
  location: string;
  reporter_name: string | null;
  report_time: string;
  update_time: string;
}

interface UnitEmergenciesResponse {
  summary: {
    total_count: number;
    open_count: number;
    closed_count: number;
    major_count: number;
  };
  recent_items: UnitEmergencyRow[];
}

interface UnitWorkPermitRow {
  id: string;
  permit_code: string;
  permit_type: string;
  risk_level: string;
  status: string;
  location: string;
  apply_user_name: string | null;
  contractor_name: string | null;
  monitor_user_name: string | null;
  time_start: string;
  time_end: string;
  violation_count: number;
  update_time: string;
}

interface UnitWorkPermitsResponse {
  summary: {
    total_count: number;
    in_progress_count: number;
    violation_count: number;
    closed_count: number;
  };
  recent_items: UnitWorkPermitRow[];
}

interface UnitIotDeviceRow {
  id: string;
  device_code: string;
  device_name: string;
  device_type: string;
  online_status: string;
  status: string;
  location: string | null;
  last_data_time: string | null;
}

interface UnitIotAlertRow {
  id: string;
  alert_code: string;
  alert_title: string;
  alert_level: string;
  status: string;
  device_id: string;
  device_code: string;
  device_name: string;
  metric_code: string;
  trigger_value: string | null;
  last_trigger_time: string;
}

interface UnitDevicesResponse {
  summary: {
    device_count: number;
    online_count: number;
    offline_count: number;
    active_alert_count: number;
  };
  recent_devices: UnitIotDeviceRow[];
  recent_alerts: UnitIotAlertRow[];
}

export default function UnitStatusBoardPage() {
  const authUser = useAuthUser();
  const [board, setBoard] = useState<UnitStatusBoardResponse>({ buildings: [] });
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [rentalStatusItems, setRentalStatusItems] = useState<DictItemRow[]>([]);
  const [workOrderStatusItems, setWorkOrderStatusItems] = useState<DictItemRow[]>([]);
  const [workOrderTypeItems, setWorkOrderTypeItems] = useState<DictItemRow[]>([]);
  const [workOrderPriorityItems, setWorkOrderPriorityItems] = useState<DictItemRow[]>([]);
  const [hazardStatusItems, setHazardStatusItems] = useState<DictItemRow[]>([]);
  const [hazardTypeItems, setHazardTypeItems] = useState<DictItemRow[]>([]);
  const [hazardRiskItems, setHazardRiskItems] = useState<DictItemRow[]>([]);
  const [emergencyStatusItems, setEmergencyStatusItems] = useState<DictItemRow[]>([]);
  const [emergencyTypeItems, setEmergencyTypeItems] = useState<DictItemRow[]>([]);
  const [emergencySeverityItems, setEmergencySeverityItems] = useState<DictItemRow[]>([]);
  const [emergencyResponseItems, setEmergencyResponseItems] = useState<DictItemRow[]>([]);
  const [workPermitStatusItems, setWorkPermitStatusItems] = useState<DictItemRow[]>([]);
  const [workPermitTypeItems, setWorkPermitTypeItems] = useState<DictItemRow[]>([]);
  const [iotDeviceTypeItems, setIotDeviceTypeItems] = useState<DictItemRow[]>([]);
  const [iotDeviceStatusItems, setIotDeviceStatusItems] = useState<DictItemRow[]>([]);
  const [iotAlertLevelItems, setIotAlertLevelItems] = useState<DictItemRow[]>([]);
  const [iotAlertStatusItems, setIotAlertStatusItems] = useState<DictItemRow[]>([]);
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
    const dictTypeMap = new Map(dictTypeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const loadDictItems = async (code: string) => {
      const dictTypeId = dictTypeMap.get(code);
      if (!dictTypeId) return [];
      const itemsResponse = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
        token: getAccessToken()
      });
      return itemsResponse.data.items.filter((item) => item.status === "enabled");
    };
    const [
      rentalItems,
      statusItems,
      typeItems,
      priorityItems,
      hazardStatuses,
      hazardTypes,
      hazardRisks,
      emergencyStatuses,
      emergencyTypes,
      emergencySeverities,
      emergencyResponses,
      permitStatuses,
      permitTypes,
      deviceTypes,
      deviceStatuses,
      alertLevels,
      alertStatuses
    ] = await Promise.all([
      loadDictItems("unit_rental_status"),
      loadDictItems("workorder_status"),
      loadDictItems("workorder_type"),
      loadDictItems("workorder_priority"),
      loadDictItems("safety_hazard_status"),
      loadDictItems("safety_hazard_type"),
      loadDictItems("safety_risk_level"),
      loadDictItems("safety_emergency_status"),
      loadDictItems("safety_emergency_incident_type"),
      loadDictItems("safety_emergency_severity"),
      loadDictItems("safety_emergency_response_level"),
      loadDictItems("safety_work_permit_status"),
      loadDictItems("safety_work_permit_type"),
      loadDictItems("iot_device_type"),
      loadDictItems("iot_device_status"),
      loadDictItems("iot_alert_level"),
      loadDictItems("iot_alert_status")
    ]);
    setRentalStatusItems(rentalItems);
    setWorkOrderStatusItems(statusItems);
    setWorkOrderTypeItems(typeItems);
    setWorkOrderPriorityItems(priorityItems);
    setHazardStatusItems(hazardStatuses);
    setHazardTypeItems(hazardTypes);
    setHazardRiskItems(hazardRisks);
    setEmergencyStatusItems(emergencyStatuses);
    setEmergencyTypeItems(emergencyTypes);
    setEmergencySeverityItems(emergencySeverities);
    setEmergencyResponseItems(emergencyResponses);
    setWorkPermitStatusItems(permitStatuses);
    setWorkPermitTypeItems(permitTypes);
    setIotDeviceTypeItems(deviceTypes);
    setIotDeviceStatusItems(deviceStatuses);
    setIotAlertLevelItems(alertLevels);
    setIotAlertStatusItems(alertStatuses);
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
      <main className="page-container unit-status-board-page">
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
          <form className="unit-board-filter-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void load().catch((error: Error) => setMessage(error.message)); }}>
            <div className="unit-board-filter-grid">
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
            <button className="primary-button unit-board-filter-button" type="submit">
              <Search size={16} />
              查询
            </button>
          </form>
        </section>

        <Card className="unit-board-summary">
          <span>当前结果</span>
          <strong>{board.buildings.length} 栋 / {totalUnits} 间房源</strong>
        </Card>

        {board.buildings.map((building) => (
          <Card className="asset-board-building unit-board-building" key={building.building_id}>
            <div className="unit-board-building-header">
              <h2 className="panel-title">{building.building_code} {building.building_name}</h2>
              <span>{building.floors.reduce((total, floor) => total + floor.units.length, 0)} 间</span>
            </div>
            <div className="unit-board-floor-list">
              {building.floors.map((floor) => (
                <section className="asset-board-floor" key={floor.floor_id}>
                  <div className="unit-board-floor-header">
                    <strong>{floor.floor_code} {floor.floor_name}</strong>
                    <span>{floor.units.length} 间</span>
                  </div>
                  <div className="unit-board-grid">
                    {floor.units.map((unit) => (
                      <button
                        className={`asset-unit-card asset-unit-status-${unit.rental_status}`}
                        key={unit.unit_id}
                        type="button"
                        onClick={() => setSelected({ building, floor, unit })}
                      >
                        <div className="unit-card-main">
                          <strong title={unit.unit_name}>{unit.unit_name}</strong>
                          <StatusBadge status={unit.rental_status} label={unit.rental_status_name} />
                        </div>
                        <div className="unit-card-meta">
                          <span title={unit.code || unit.unit_code}>{unit.code || unit.unit_code}</span>
                          <span>{formatArea(unit.unit_area)}</span>
                          <span>{unit.usage_type_name}</span>
                          {canViewRefPrice ? <strong>{formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, unit.ref_price))}</strong> : null}
                        </div>
                        <div className="unit-card-tenant">
                          <span className="muted-text" title={unit.current_tenant_name ?? "空置"}>{unit.current_tenant_name ?? "空置"}</span>
                        </div>
                      </button>
                    ))}
                    {floor.units.length === 0 ? <span>本楼层暂无匹配房源</span> : null}
                  </div>
                </section>
              ))}
            </div>
          </Card>
        ))}

        {board.buildings.length === 0 ? (
          <Card >
            <p>暂无匹配房源。</p>
          </Card>
        ) : null}

        {selected ? (
          <UnitDetailDrawer
            selected={selected}
            workOrderStatusItems={workOrderStatusItems}
            workOrderTypeItems={workOrderTypeItems}
            workOrderPriorityItems={workOrderPriorityItems}
            hazardStatusItems={hazardStatusItems}
            hazardTypeItems={hazardTypeItems}
            hazardRiskItems={hazardRiskItems}
            emergencyStatusItems={emergencyStatusItems}
            emergencyTypeItems={emergencyTypeItems}
            emergencySeverityItems={emergencySeverityItems}
            emergencyResponseItems={emergencyResponseItems}
            workPermitStatusItems={workPermitStatusItems}
            workPermitTypeItems={workPermitTypeItems}
            workPermitRiskItems={hazardRiskItems}
            iotDeviceTypeItems={iotDeviceTypeItems}
            iotDeviceStatusItems={iotDeviceStatusItems}
            iotAlertLevelItems={iotAlertLevelItems}
            iotAlertStatusItems={iotAlertStatusItems}
            onClose={() => setSelected(null)}
          />
        ) : null}
        {message ? <p className="status-pill">{message}</p> : null}
      </main>
        </PermissionGuard>
      </PermissionGuard>
    </PermissionGuard>
  );
}

function UnitDetailDrawer({
  selected,
  workOrderStatusItems,
  workOrderTypeItems,
  workOrderPriorityItems,
  hazardStatusItems,
  hazardTypeItems,
  hazardRiskItems,
  emergencyStatusItems,
  emergencyTypeItems,
  emergencySeverityItems,
  emergencyResponseItems,
  workPermitStatusItems,
  workPermitTypeItems,
  workPermitRiskItems,
  iotDeviceTypeItems,
  iotDeviceStatusItems,
  iotAlertLevelItems,
  iotAlertStatusItems,
  onClose
}: {
  selected: SelectedUnit;
  workOrderStatusItems: DictItemRow[];
  workOrderTypeItems: DictItemRow[];
  workOrderPriorityItems: DictItemRow[];
  hazardStatusItems: DictItemRow[];
  hazardTypeItems: DictItemRow[];
  hazardRiskItems: DictItemRow[];
  emergencyStatusItems: DictItemRow[];
  emergencyTypeItems: DictItemRow[];
  emergencySeverityItems: DictItemRow[];
  emergencyResponseItems: DictItemRow[];
  workPermitStatusItems: DictItemRow[];
  workPermitTypeItems: DictItemRow[];
  workPermitRiskItems: DictItemRow[];
  iotDeviceTypeItems: DictItemRow[];
  iotDeviceStatusItems: DictItemRow[];
  iotAlertLevelItems: DictItemRow[];
  iotAlertStatusItems: DictItemRow[];
  onClose: () => void;
}) {
  const authUser = useAuthUser();
  const { building, floor, unit } = selected;
  const [activeTab, setActiveTab] = useState<"info" | "workorders" | "hazards" | "emergencies" | "workPermits" | "devices" | "deviceAlerts">("info");
  const [workorders, setWorkorders] = useState<UnitWorkOrdersResponse | null>(null);
  const [workordersLoading, setWorkordersLoading] = useState(false);
  const [workordersError, setWorkordersError] = useState("");
  const [hazards, setHazards] = useState<UnitHazardsResponse | null>(null);
  const [hazardsLoading, setHazardsLoading] = useState(false);
  const [hazardsError, setHazardsError] = useState("");
  const [emergencies, setEmergencies] = useState<UnitEmergenciesResponse | null>(null);
  const [emergenciesLoading, setEmergenciesLoading] = useState(false);
  const [emergenciesError, setEmergenciesError] = useState("");
  const [workPermits, setWorkPermits] = useState<UnitWorkPermitsResponse | null>(null);
  const [workPermitsLoading, setWorkPermitsLoading] = useState(false);
  const [workPermitsError, setWorkPermitsError] = useState("");
  const [devices, setDevices] = useState<UnitDevicesResponse | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState("");
  const canViewRefPrice = canViewField(authUser, "asset", "unit", UNIT_FIELD_REF_PRICE);
  const canViewWorkOrderReporterMobile = canViewField(authUser, "workorder", "work_order", "reporterMobile");

  useEffect(() => {
    setActiveTab("info");
    setWorkorders(null);
    setWorkordersError("");
    setHazards(null);
    setHazardsError("");
    setEmergencies(null);
    setEmergenciesError("");
    setWorkPermits(null);
    setWorkPermitsError("");
    setDevices(null);
    setDevicesError("");
  }, [unit.unit_id]);

  useEffect(() => {
    if (activeTab !== "workorders" || workorders) {
      return;
    }
    setWorkordersLoading(true);
    setWorkordersError("");
    void apiRequest<UnitWorkOrdersResponse>(`/park-units/${unit.unit_id}/workorders`, { token: getAccessToken() })
      .then((response) => setWorkorders(response.data))
      .catch((error: Error) => setWorkordersError(error.message))
      .finally(() => setWorkordersLoading(false));
  }, [activeTab, unit.unit_id, workorders]);

  useEffect(() => {
    if (activeTab !== "hazards" || hazards) {
      return;
    }
    setHazardsLoading(true);
    setHazardsError("");
    void apiRequest<UnitHazardsResponse>(`/park-units/${unit.unit_id}/hazards`, { token: getAccessToken() })
      .then((response) => setHazards(response.data))
      .catch((error: Error) => setHazardsError(error.message))
      .finally(() => setHazardsLoading(false));
  }, [activeTab, unit.unit_id, hazards]);

  useEffect(() => {
    if (activeTab !== "emergencies" || emergencies) {
      return;
    }
    setEmergenciesLoading(true);
    setEmergenciesError("");
    void apiRequest<UnitEmergenciesResponse>(`/park-units/${unit.unit_id}/emergencies`, { token: getAccessToken() })
      .then((response) => setEmergencies(response.data))
      .catch((error: Error) => setEmergenciesError(error.message))
      .finally(() => setEmergenciesLoading(false));
  }, [activeTab, unit.unit_id, emergencies]);

  useEffect(() => {
    if (activeTab !== "workPermits" || workPermits) {
      return;
    }
    setWorkPermitsLoading(true);
    setWorkPermitsError("");
    void apiRequest<UnitWorkPermitsResponse>(`/park-units/${unit.unit_id}/work-permits`, { token: getAccessToken() })
      .then((response) => setWorkPermits(response.data))
      .catch((error: Error) => setWorkPermitsError(error.message))
      .finally(() => setWorkPermitsLoading(false));
  }, [activeTab, unit.unit_id, workPermits]);

  useEffect(() => {
    if ((activeTab !== "devices" && activeTab !== "deviceAlerts") || devices) {
      return;
    }
    setDevicesLoading(true);
    setDevicesError("");
    void apiRequest<UnitDevicesResponse>(`/park-units/${unit.unit_id}/devices`, { token: getAccessToken() })
      .then((response) => setDevices(response.data))
      .catch((error: Error) => setDevicesError(error.message))
      .finally(() => setDevicesLoading(false));
  }, [activeTab, unit.unit_id, devices]);

  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow={`${building.building_code} / ${floor.floor_name}`}
        title={unit.unit_name}
        description={`${unit.unit_code} · ${formatArea(unit.unit_area)} · ${unit.usage_type_name}`}
        closeIcon={<X size={16} />}
        onClose={onClose}
      />
      <div className="system-tabs">
        <button className={activeTab === "info" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("info")}>基础信息</button>
        <button className={activeTab === "workorders" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("workorders")}>关联工单</button>
        <button className={activeTab === "hazards" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("hazards")}>安全隐患</button>
        <button className={activeTab === "emergencies" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("emergencies")}>应急事件</button>
        <button className={activeTab === "workPermits" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("workPermits")}>作业许可</button>
        <button className={activeTab === "devices" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("devices")}>设备</button>
        <button className={activeTab === "deviceAlerts" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("deviceAlerts")}>设备告警</button>
      </div>
      {activeTab === "info" ? (
        <DrawerDetailGrid>
          <DrawerDetailItem label="房源名称" value={unit.unit_name} />
          <DrawerDetailItem label="统一编码" value={unit.code || unit.unit_code} />
          <DrawerDetailItem label="房源编码" value={unit.unit_code} />
          <DrawerDetailItem label="楼栋" value={`${building.building_code} ${building.building_name}`} />
          <DrawerDetailItem label="楼层" value={`${floor.floor_code} ${floor.floor_name}`} />
          <DrawerDetailItem label="建筑面积" value={formatArea(unit.unit_area)} />
          <DrawerDetailItem label="出租状态" value={<StatusBadge status={unit.rental_status} label={unit.rental_status_name} />} />
          <DrawerDetailItem label="用途" value={unit.usage_type_name} />
          {canViewRefPrice ? (
            <DrawerDetailItem label="参考租金" value={formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, unit.ref_price))} />
          ) : null}
          <DrawerDetailItem label="当前租户" value={unit.current_tenant_name ?? "空置"} />
          {unit.current_contract_code ? <DrawerDetailItem label="合同编号" value={unit.current_contract_code} /> : null}
          {unit.lease_start_date || unit.lease_end_date ? (
            <DrawerDetailItem label="租期" value={`${unit.lease_start_date ?? "-"} 至 ${unit.lease_end_date ?? "-"}`} />
          ) : null}
        </DrawerDetailGrid>
      ) : null}
      {activeTab === "workorders" ? (
        <UnitWorkordersPanel
          data={workorders}
          loading={workordersLoading}
          error={workordersError}
          statusItems={workOrderStatusItems}
          typeItems={workOrderTypeItems}
          priorityItems={workOrderPriorityItems}
          authUser={authUser}
          canViewReporterMobile={canViewWorkOrderReporterMobile}
        />
      ) : null}
      {activeTab === "hazards" ? (
        <UnitHazardsPanel
          data={hazards}
          loading={hazardsLoading}
          error={hazardsError}
          statusItems={hazardStatusItems}
          typeItems={hazardTypeItems}
          riskItems={hazardRiskItems}
        />
      ) : null}
      {activeTab === "emergencies" ? (
        <UnitEmergenciesPanel
          data={emergencies}
          loading={emergenciesLoading}
          error={emergenciesError}
          statusItems={emergencyStatusItems}
          typeItems={emergencyTypeItems}
          severityItems={emergencySeverityItems}
          responseItems={emergencyResponseItems}
        />
      ) : null}
      {activeTab === "workPermits" ? (
        <UnitWorkPermitsPanel
          data={workPermits}
          loading={workPermitsLoading}
          error={workPermitsError}
          statusItems={workPermitStatusItems}
          typeItems={workPermitTypeItems}
          riskItems={workPermitRiskItems}
        />
      ) : null}
      {activeTab === "devices" ? (
        <UnitDevicesPanel
          data={devices}
          loading={devicesLoading}
          error={devicesError}
          deviceTypeItems={iotDeviceTypeItems}
          deviceStatusItems={iotDeviceStatusItems}
        />
      ) : null}
      {activeTab === "deviceAlerts" ? (
        <UnitDeviceAlertsPanel
          data={devices}
          loading={devicesLoading}
          error={devicesError}
          alertLevelItems={iotAlertLevelItems}
          alertStatusItems={iotAlertStatusItems}
        />
      ) : null}
      <DrawerFooter>
        <button className="primary-button" type="button" onClick={onClose}>
          <Eye size={16} />
          知道了
        </button>
      </DrawerFooter>
    </Drawer>
  );
}

function UnitWorkordersPanel({
  data,
  loading,
  error,
  statusItems,
  typeItems,
  priorityItems,
  authUser,
  canViewReporterMobile
}: {
  data: UnitWorkOrdersResponse | null;
  loading: boolean;
  error: string;
  statusItems: DictItemRow[];
  typeItems: DictItemRow[];
  priorityItems: DictItemRow[];
  authUser: UserContext | null;
  canViewReporterMobile: boolean;
}) {
  if (loading) {
    return <p className="muted-text">正在加载工单数据...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.total_count ?? 0}</strong><span>工单总数</span></Card>
        <Card><strong>{data?.summary.open_count ?? 0}</strong><span>未闭环</span></Card>
        <Card><strong>{data?.summary.overdue_count ?? 0}</strong><span>超时</span></Card>
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>工单编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>优先级</th>
            <th>状态</th>
            <th>报告人</th>
            <th>处理人</th>
            <th>超时</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.wo_code}</td>
              <td>{row.title}</td>
              <td>{labelFor(typeItems, row.wo_type)}</td>
              <td><DictBadge items={priorityItems} value={row.priority} /></td>
              <td><DictBadge items={statusItems} value={row.status} /></td>
              <td>
                {fieldText(row.reporter_name)}
                {canViewReporterMobile ? ` / ${fieldText(maskField(authUser, "workorder", "work_order", "reporterMobile", row.reporter_mobile))}` : ""}
              </td>
              <td>{fieldText(row.assignee_name)}</td>
              <td><span className={`status-pill ${row.overdue_flag ? "status-danger" : "status-success"}`}>{row.overdue_flag ? "超时" : "正常"}</span></td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => { window.location.href = `/workorders/${row.id}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={9}>暂无关联工单</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function UnitHazardsPanel({
  data,
  loading,
  error,
  statusItems,
  typeItems,
  riskItems
}: {
  data: UnitHazardsResponse | null;
  loading: boolean;
  error: string;
  statusItems: DictItemRow[];
  typeItems: DictItemRow[];
  riskItems: DictItemRow[];
}) {
  if (loading) {
    return <p className="muted-text">正在加载隐患数据...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.total_count ?? 0}</strong><span>隐患总数</span></Card>
        <Card><strong>{data?.summary.open_count ?? 0}</strong><span>未闭环</span></Card>
        <Card><strong>{data?.summary.overdue_count ?? 0}</strong><span>超期</span></Card>
        <Card><strong>{data?.summary.major_count ?? 0}</strong><span>重大隐患</span></Card>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>隐患编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>风险</th>
            <th>状态</th>
            <th>位置</th>
            <th>整改人</th>
            <th>超期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.hazard_code}</td>
              <td>{row.title}</td>
              <td>{labelFor(typeItems, row.hazard_type)}</td>
              <td><DictBadge items={riskItems} value={row.risk_level} /></td>
              <td><DictBadge items={statusItems} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{fieldText(row.rectify_user_name)}</td>
              <td><span className={`status-pill ${row.overdue_flag ? "status-danger" : "status-success"}`}>{row.overdue_flag ? "超期" : "正常"}</span></td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => { window.location.href = `/safety/hazards?hazard_id=${encodeURIComponent(row.id)}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={9}>暂无关联隐患</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function UnitEmergenciesPanel({
  data,
  loading,
  error,
  statusItems,
  typeItems,
  severityItems,
  responseItems
}: {
  data: UnitEmergenciesResponse | null;
  loading: boolean;
  error: string;
  statusItems: DictItemRow[];
  typeItems: DictItemRow[];
  severityItems: DictItemRow[];
  responseItems: DictItemRow[];
}) {
  if (loading) {
    return <p className="muted-text">正在加载应急事件...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.total_count ?? 0}</strong><span>事件总数</span></Card>
        <Card><strong>{data?.summary.open_count ?? 0}</strong><span>未闭环</span></Card>
        <Card><strong>{data?.summary.closed_count ?? 0}</strong><span>已闭环</span></Card>
        <Card><strong>{data?.summary.major_count ?? 0}</strong><span>重大事件</span></Card>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>事件编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>严重等级</th>
            <th>响应等级</th>
            <th>状态</th>
            <th>位置</th>
            <th>上报人</th>
            <th>上报时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.emergency_code}</td>
              <td>{row.title}</td>
              <td>{labelFor(typeItems, row.incident_type)}</td>
              <td><DictBadge items={severityItems} value={row.severity_level} /></td>
              <td><DictBadge items={responseItems} value={row.response_level} /></td>
              <td><DictBadge items={statusItems} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{fieldText(row.reporter_name)}</td>
              <td>{formatDateTime(row.report_time)}</td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => { window.location.href = `/safety/emergencies?emergency_id=${encodeURIComponent(row.id)}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={10}>暂无关联应急事件</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function UnitWorkPermitsPanel({
  data,
  loading,
  error,
  statusItems,
  typeItems,
  riskItems
}: {
  data: UnitWorkPermitsResponse | null;
  loading: boolean;
  error: string;
  statusItems: DictItemRow[];
  typeItems: DictItemRow[];
  riskItems: DictItemRow[];
}) {
  if (loading) {
    return <p className="muted-text">正在加载作业许可...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.total_count ?? 0}</strong><span>许可总数</span></Card>
        <Card><strong>{data?.summary.in_progress_count ?? 0}</strong><span>开工中</span></Card>
        <Card><strong>{data?.summary.violation_count ?? 0}</strong><span>违规次数</span></Card>
        <Card><strong>{data?.summary.closed_count ?? 0}</strong><span>已闭环</span></Card>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>许可编号</th>
            <th>类型</th>
            <th>风险</th>
            <th>状态</th>
            <th>位置</th>
            <th>申请人</th>
            <th>施工方</th>
            <th>监护人</th>
            <th>作业时间</th>
            <th>违规</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.permit_code}</td>
              <td>{labelFor(typeItems, row.permit_type)}</td>
              <td><DictBadge items={riskItems} value={row.risk_level} /></td>
              <td><DictBadge items={statusItems} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{fieldText(row.apply_user_name)}</td>
              <td>{fieldText(row.contractor_name)}</td>
              <td>{fieldText(row.monitor_user_name)}</td>
              <td>{`${formatDateTime(row.time_start)} - ${formatDateTime(row.time_end)}`}</td>
              <td>{row.violation_count}</td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => { window.location.href = `/safety/work-permits?permit_id=${encodeURIComponent(row.id)}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={11}>暂无关联作业许可</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function UnitDevicesPanel({
  data,
  loading,
  error,
  deviceTypeItems,
  deviceStatusItems
}: {
  data: UnitDevicesResponse | null;
  loading: boolean;
  error: string;
  deviceTypeItems: DictItemRow[];
  deviceStatusItems: DictItemRow[];
}) {
  if (loading) {
    return <p className="muted-text">正在加载设备数据...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_devices ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.device_count ?? 0}</strong><span>设备总数</span></Card>
        <Card><strong>{data?.summary.online_count ?? 0}</strong><span>在线设备</span></Card>
        <Card><strong>{data?.summary.offline_count ?? 0}</strong><span>离线设备</span></Card>
        <Card><strong>{data?.summary.active_alert_count ?? 0}</strong><span>活跃告警</span></Card>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>设备编号</th>
            <th>设备名称</th>
            <th>设备类型</th>
            <th>在线状态</th>
            <th>启停状态</th>
            <th>位置</th>
            <th>最近上报</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.device_code}</td>
              <td>{row.device_name}</td>
              <td>{labelFor(deviceTypeItems, row.device_type)}</td>
              <td><DictBadge items={deviceStatusItems} value={row.online_status} /></td>
              <td>{fieldText(row.status)}</td>
              <td>{fieldText(row.location)}</td>
              <td>{row.last_data_time ? formatDateTime(row.last_data_time) : "-"}</td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => { window.location.href = `/iot/devices/${row.id}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={8}>暂无关联设备</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function UnitDeviceAlertsPanel({
  data,
  loading,
  error,
  alertLevelItems,
  alertStatusItems
}: {
  data: UnitDevicesResponse | null;
  loading: boolean;
  error: string;
  alertLevelItems: DictItemRow[];
  alertStatusItems: DictItemRow[];
}) {
  if (loading) {
    return <p className="muted-text">正在加载设备告警...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_alerts ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.active_alert_count ?? 0}</strong><span>活跃告警</span></Card>
        <Card><strong>{data?.summary.device_count ?? 0}</strong><span>关联设备</span></Card>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>告警编号</th>
            <th>告警标题</th>
            <th>设备</th>
            <th>指标</th>
            <th>级别</th>
            <th>状态</th>
            <th>触发值</th>
            <th>最近触发</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.alert_code}</td>
              <td>{row.alert_title}</td>
              <td>{row.device_name}</td>
              <td>{row.metric_code}</td>
              <td><DictBadge items={alertLevelItems} value={row.alert_level} /></td>
              <td><DictBadge items={alertStatusItems} value={row.status} /></td>
              <td>{fieldText(row.trigger_value)}</td>
              <td>{formatDateTime(row.last_trigger_time)}</td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => { window.location.href = `/iot/alerts?device_id=${encodeURIComponent(row.device_id)}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={9}>暂无设备告警</td></tr> : null}
        </tbody>
      </DataTable>
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

function StatusBadge({ status, label }: { status: number; label: string }) {
  return <span className={`status-pill ${statusClassName(status)}`}>{label}</span>;
}

function DictBadge({ items = [], value }: { items?: DictItemRow[]; value: string | null }) {
  const item = items.find((option) => option.itemValue === value);
  return <span className={`status-pill ${dictStatusClass(item?.tagType)}`}>{item?.itemLabel ?? value ?? "-"}</span>;
}

function statusClassName(status: number): string {
  const classes: Record<number, string> = {
    10: "status-success",
    20: "status-warning",
    30: "status-primary",
    40: "status-warning",
    50: "status-danger",
    60: "status-info",
    70: "status-muted"
  };
  return classes[status] ?? "status-muted";
}

function dictStatusClass(tagType?: string | null): string {
  if (tagType === "success" || tagType === "warning" || tagType === "danger" || tagType === "primary" || tagType === "info") {
    return `status-${tagType}`;
  }
  return "status-muted";
}

function labelFor(items: DictItemRow[], value: string | null): string {
  return items.find((item) => item.itemValue === value)?.itemLabel ?? value ?? "-";
}

function fieldText(value: unknown): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
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

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function maskUnitField(user: UserContext | null, fieldKey: string, value: unknown): unknown {
  return maskField(user, "asset", "unit", fieldKey, value);
}

function ForbiddenInline() {
  return (
    <main className="page-container">
      <Card >
        <h1 className="panel-title">403</h1>
        <p>当前账号没有房源状态看板访问权限。</p>
      </Card>
    </main>
  );
}

function ModuleUnauthorizedInline() {
  return (
    <main className="page-container">
      <Card >
        <h1 className="panel-title">模块未授权</h1>
        <p>当前租户未开通资产模块，无法访问房源状态看板。</p>
      </Card>
    </main>
  );
}
