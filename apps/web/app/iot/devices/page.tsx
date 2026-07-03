"use client";

import {
  Card,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  DrawerSection,
  DrawerTabButton,
  DrawerTabs,
  StatusPill
} from "@jinhu/ui";
import { Activity, BarChart3, Database, Edit3, Eye, KeyRound, Plus, Power, PowerOff, RefreshCw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";
import { useIotRealtime } from "../../../hooks/useIotRealtime";

const IOT_MODULE = "iot";
const DEVICE_ENTITY = "iot_device";

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

interface GatewayRow {
  id: string;
  gatewayCode: string;
  gatewayName: string;
  protocolType: string;
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

interface UnitRow {
  id: string;
  unitCode: string;
  unitName: string;
  buildingId: string;
  floorId: string;
}

interface ParkTenantRow {
  id: string;
  parkTenantCode: string;
  companyName: string;
}

interface IotDeviceRow {
  id: string;
  code: string | null;
  deviceCode: string;
  deviceName: string;
  deviceType: string;
  gatewayId: string | null;
  vendorName: string | null;
  vendorDeviceId: string | null;
  protocolType: string | null;
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  parkTenantId: string | null;
  location: string | null;
  gpsLng: string | null;
  gpsLat: string | null;
  installDate: string | null;
  warrantyEndDate: string | null;
  status: string;
  onlineStatus: string;
  lastOnlineTime: string | null;
  lastOfflineTime: string | null;
  lastDataTime: string | null;
  statusPayload: Record<string, unknown>;
  latestMetrics?: IotDeviceLatestRow[];
  remark: string | null;
  updateTime: string;
}

interface IotDeviceLatestRow {
  id: string;
  deviceId: string;
  deviceCode: string;
  pointId: string | null;
  metricId: string | null;
  metricCode: string;
  valueType: string;
  valueNumber: string | null;
  valueText: string | null;
  valueBool: boolean | null;
  valueJson: unknown | null;
  quality: string;
  reportedAt: string;
  receivedAt: string;
  updateTime: string;
}

interface IotDeviceHistoryRow extends IotDeviceLatestRow {
  rawPayload: Record<string, unknown>;
  createTime: string;
}

interface IotTrendResponse {
  interval: "minute" | "hour" | "day";
  metricCode: string;
  items: Array<{
    bucketTime: string;
    count: number;
    avgValue: string | null;
    minValue: string | null;
    maxValue: string | null;
  }>;
}

interface IotMetricRow {
  id: string;
  metricCode: string;
  metricName: string;
  deviceType: string | null;
  valueType: string;
  unit: string | null;
}

interface IotPointRow {
  id: string;
  code: string | null;
  pointCode: string;
  deviceId: string;
  metricId: string | null;
  metricCode: string | null;
  pointName: string;
  pointType: string;
  valueType: string;
  unit: string | null;
  reportTopic: string | null;
  reportKey: string | null;
  minValue: string | null;
  maxValue: string | null;
  lastValue: string | null;
  lastValueText: string | null;
  lastReportTime: string | null;
  status: string;
  remark: string | null;
}

interface DeviceForm {
  deviceCode: string;
  deviceName: string;
  deviceType: string;
  gatewayId: string;
  vendorName: string;
  vendorDeviceId: string;
  protocolType: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  parkTenantId: string;
  location: string;
  gpsLng: string;
  gpsLat: string;
  installDate: string;
  warrantyEndDate: string;
  status: string;
  onlineStatus: string;
  remark: string;
}

interface PointForm {
  pointCode: string;
  metricId: string;
  metricCode: string;
  pointName: string;
  pointType: string;
  valueType: string;
  unit: string;
  reportTopic: string;
  reportKey: string;
  minValue: string;
  maxValue: string;
  status: string;
  remark: string;
}

interface Filters {
  keyword: string;
  deviceType: string;
  status: string;
  onlineStatus: string;
  gatewayId: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  parkTenantId: string;
}

interface SecretResetResult {
  id: string;
  device_secret: string;
}

type DictMap = Record<string, DictItemRow[]>;
type DetailTab = "profile" | "latest" | "history" | "trend" | "points";

const emptyPage: PaginatedResult<IotDeviceRow> = { items: [], total: 0, page: 1, page_size: 10 };
const emptyFilters: Filters = {
  keyword: "",
  deviceType: "",
  status: "",
  onlineStatus: "",
  gatewayId: "",
  buildingId: "",
  floorId: "",
  unitId: "",
  parkTenantId: ""
};
const emptyForm: DeviceForm = {
  deviceCode: "",
  deviceName: "",
  deviceType: "",
  gatewayId: "",
  vendorName: "",
  vendorDeviceId: "",
  protocolType: "",
  buildingId: "",
  floorId: "",
  unitId: "",
  parkTenantId: "",
  location: "",
  gpsLng: "",
  gpsLat: "",
  installDate: "",
  warrantyEndDate: "",
  status: "enabled",
  onlineStatus: "offline",
  remark: ""
};
const emptyPointForm: PointForm = {
  pointCode: "",
  metricId: "",
  metricCode: "",
  pointName: "",
  pointType: "telemetry",
  valueType: "number",
  unit: "",
  reportTopic: "",
  reportKey: "",
  minValue: "",
  maxValue: "",
  status: "enabled",
  remark: ""
};

export default function IotDevicesPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<IotDeviceRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [gateways, setGateways] = useState<GatewayRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [metrics, setMetrics] = useState<IotMetricRow[]>([]);
  const [points, setPoints] = useState<IotPointRow[]>([]);
  const [latestRows, setLatestRows] = useState<IotDeviceLatestRow[]>([]);
  const [historyRows, setHistoryRows] = useState<PaginatedResult<IotDeviceHistoryRow>>({ items: [], total: 0, page: 1, page_size: 50 });
  const [historyMetric, setHistoryMetric] = useState("");
  const [trendMetric, setTrendMetric] = useState("");
  const [trendInterval, setTrendInterval] = useState<"minute" | "hour" | "day">("hour");
  const [trendRows, setTrendRows] = useState<IotTrendResponse | null>(null);
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IotDeviceRow | null>(null);
  const [viewing, setViewing] = useState<IotDeviceRow | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [pointFormOpen, setPointFormOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<IotPointRow | null>(null);
  const [pointForm, setPointForm] = useState<PointForm>(emptyPointForm);
  const [message, setMessage] = useState("");

  const deviceTypes = dicts.iot_device_type ?? [];
  const protocolTypes = dicts.iot_protocol_type ?? [];
  const statusItems = dicts.iot_device_status ?? [];
  const pointTypes = dicts.iot_point_type ?? [];
  const valueTypes = dicts.iot_metric_value_type ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const filteredFloors = useMemo(() => filterFloors(floors, form.buildingId), [floors, form.buildingId]);
  const filteredUnits = useMemo(() => filterUnits(units, form.buildingId, form.floorId), [units, form.buildingId, form.floorId]);
  const detailMetricOptions = useMemo(() => buildMetricOptions(points, latestRows), [latestRows, points]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "10", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.deviceType) params.set("device_type", filters.deviceType);
    if (filters.status) params.set("status", filters.status);
    if (filters.onlineStatus) params.set("online_status", filters.onlineStatus);
    if (filters.gatewayId) params.set("gateway_id", filters.gatewayId);
    if (filters.buildingId) params.set("building_id", filters.buildingId);
    if (filters.floorId) params.set("floor_id", filters.floorId);
    if (filters.unitId) params.set("unit_id", filters.unitId);
    if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
    const response = await apiRequest<PaginatedResult<IotDeviceRow>>(`/iot/devices/latest-status?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["iot_device_type", "iot_protocol_type", "iot_device_status", "iot_point_type", "iot_metric_value_type", "iot_data_quality"];
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

  const loadOptions = useCallback(async () => {
    const [gatewayResponse, buildingResponse, floorResponse, unitResponse, tenantResponse, metricResponse] = await Promise.all([
      apiRequest<PaginatedResult<GatewayRow>>("/iot/gateways?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<FloorRow>>("/floors?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UnitRow>>("/park-units?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<IotMetricRow>>("/iot/metrics?page=1&page_size=100&sort=metric_code", { token: getAccessToken() })
    ]);
    setGateways(gatewayResponse.data.items);
    setBuildings(buildingResponse.data.items);
    setFloors(floorResponse.data.items);
    setUnits(unitResponse.data.items);
    setParkTenants(tenantResponse.data.items);
    setMetrics(metricResponse.data.items);
  }, []);

  const loadPoints = useCallback(async (deviceId: string) => {
    const response = await apiRequest<IotPointRow[]>(`/iot/devices/${deviceId}/points`, {
      token: getAccessToken()
    });
    setPoints(response.data);
  }, []);

  const loadLatest = useCallback(async (deviceId: string) => {
    const response = await apiRequest<IotDeviceLatestRow[]>(`/iot/devices/${deviceId}/latest`, {
      token: getAccessToken()
    });
    setLatestRows(response.data);
  }, []);

  const loadHistory = useCallback(async (deviceId: string, page = 1, metricCode = historyMetric) => {
    const params = new URLSearchParams({ page: String(page), page_size: "50" });
    if (metricCode) params.set("metric_code", metricCode);
    const response = await apiRequest<PaginatedResult<IotDeviceHistoryRow>>(`/iot/devices/${deviceId}/history?${params.toString()}`, {
      token: getAccessToken()
    });
    setHistoryRows(response.data);
  }, [historyMetric]);

  const loadTrend = useCallback(async (deviceId: string, metricCode = trendMetric, interval = trendInterval) => {
    if (!metricCode) {
      setTrendRows(null);
      return;
    }
    const params = new URLSearchParams({ metric_code: metricCode, interval });
    const response = await apiRequest<IotTrendResponse>(`/iot/devices/${deviceId}/trend?${params.toString()}`, {
      token: getAccessToken()
    });
    setTrendRows(response.data);
  }, [trendInterval, trendMetric]);

  const viewingDeviceId = viewing?.id ?? "";
  const realtimeTopics = useMemo(() => (viewingDeviceId ? [`iot:device:${viewingDeviceId}`] : []), [viewingDeviceId]);
  const realtime = useIotRealtime({
    enabled: Boolean(viewingDeviceId),
    topics: realtimeTopics,
    onEvent: (event) => {
      if (!viewingDeviceId || event.device_id !== viewingDeviceId) return;
      if (!["device.latest", "device.status", "iot.device.online", "iot.device.offline", "iot.metric.updated"].includes(event.event)) return;
      const onlineStatus = readRealtimeString(event.data, "online_status");
      const lastDataTime = readRealtimeString(event.data, "last_data_time") ?? readRealtimeString(event.data, "report_time");
      if (onlineStatus || lastDataTime) {
        setViewing((current) => current?.id === viewingDeviceId
          ? {
              ...current,
              onlineStatus: onlineStatus ?? current.onlineStatus,
              lastDataTime: lastDataTime ?? current.lastDataTime
            }
          : current);
      }
      void loadLatest(viewingDeviceId).catch((error: Error) => setMessage(error.message));
      void load(pageData.page).catch((error: Error) => setMessage(error.message));
    }
  });

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadOptions().catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadOptions]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      deviceType: deviceTypes[0]?.itemValue ?? "",
      protocolType: protocolTypes[0]?.itemValue ?? "",
      status: "enabled",
      onlineStatus: "offline"
    });
    setFormOpen(true);
  }

  function openEdit(row: IotDeviceRow) {
    setEditing(row);
    setForm({
      deviceCode: row.deviceCode,
      deviceName: row.deviceName,
      deviceType: row.deviceType,
      gatewayId: row.gatewayId ?? "",
      vendorName: row.vendorName ?? "",
      vendorDeviceId: row.vendorDeviceId ?? "",
      protocolType: row.protocolType ?? "",
      buildingId: row.buildingId ?? "",
      floorId: row.floorId ?? "",
      unitId: row.unitId ?? "",
      parkTenantId: row.parkTenantId ?? "",
      location: row.location ?? "",
      gpsLng: row.gpsLng ?? "",
      gpsLat: row.gpsLat ?? "",
      installDate: row.installDate ?? "",
      warrantyEndDate: row.warrantyEndDate ?? "",
      status: row.status,
      onlineStatus: row.onlineStatus,
      remark: row.remark ?? ""
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  function openView(row: IotDeviceRow) {
    setViewing(row);
    setDetailTab("profile");
    setPoints([]);
    setLatestRows([]);
    setHistoryRows({ items: [], total: 0, page: 1, page_size: 50 });
    setHistoryMetric("");
    setTrendMetric("");
    setTrendRows(null);
    void loadPoints(row.id).catch((error: Error) => setMessage(error.message));
    void loadLatest(row.id).catch((error: Error) => setMessage(error.message));
  }

  function setFormValue<K extends keyof DeviceForm>(key: K, value: DeviceForm[K]) {
    setForm((current) => {
      if (key === "buildingId") {
        return { ...current, buildingId: value, floorId: "", unitId: "" };
      }
      if (key === "floorId") {
        return { ...current, floorId: value, unitId: "" };
      }
      return { ...current, [key]: value };
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editing ? `/iot/devices/${editing.id}` : "/iot/devices";
    await apiRequest<IotDeviceRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "iot-device-update" : "iot-device-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "IoT 设备已更新" : "IoT 设备已新增。请通过重置密钥获取设备上报密钥。");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: IotDeviceRow) {
    if (!window.confirm(`确认软删除 IoT 设备 ${row.deviceName}？历史数据不会被物理删除。`)) return;
    await apiRequest<{ id: string }>(`/iot/devices/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-device-delete")
    });
    setMessage("IoT 设备已软删除");
    await load(pageData.page);
  }

  async function setDeviceEnabled(row: IotDeviceRow, enabled: boolean) {
    await apiRequest<IotDeviceRow>(`/iot/devices/${row.id}/${enabled ? "enable" : "disable"}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(enabled ? "iot-device-enable" : "iot-device-disable")
    });
    setMessage(enabled ? "IoT 设备已启用" : "IoT 设备已停用");
    await load(pageData.page);
  }

  async function resetSecret(row: IotDeviceRow) {
    if (!window.confirm(`确认重置设备 ${row.deviceName} 的上报密钥？新密钥只会显示一次。`)) return;
    const response = await apiRequest<SecretResetResult>(`/iot/devices/${row.id}/reset-secret`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-device-reset-secret")
    });
    setMessage(`新设备密钥：${response.data.device_secret}。请立即保存，系统不会再次明文展示。`);
  }

  function openCreatePoint() {
    setEditingPoint(null);
    setPointForm({
      ...emptyPointForm,
      pointType: pointTypes[0]?.itemValue ?? "telemetry",
      valueType: valueTypes[0]?.itemValue ?? "number",
      status: "enabled"
    });
    setPointFormOpen(true);
  }

  function openEditPoint(row: IotPointRow) {
    setEditingPoint(row);
    setPointForm({
      pointCode: row.pointCode,
      metricId: row.metricId ?? "",
      metricCode: row.metricCode ?? "",
      pointName: row.pointName,
      pointType: row.pointType,
      valueType: row.valueType,
      unit: row.unit ?? "",
      reportTopic: row.reportTopic ?? "",
      reportKey: row.reportKey ?? "",
      minValue: row.minValue ?? "",
      maxValue: row.maxValue ?? "",
      status: row.status,
      remark: row.remark ?? ""
    });
    setPointFormOpen(true);
  }

  function closePointForm() {
    setPointFormOpen(false);
    setEditingPoint(null);
    setPointForm(emptyPointForm);
  }

  function setPointFormValue<K extends keyof PointForm>(key: K, value: PointForm[K]) {
    setPointForm((current) => {
      if (key !== "metricId") return { ...current, [key]: value };
      const metric = metrics.find((item) => item.id === value);
      if (!metric) return { ...current, metricId: value, metricCode: "", unit: current.unit, valueType: current.valueType };
      return {
        ...current,
        metricId: value,
        metricCode: metric.metricCode,
        pointName: current.pointName || metric.metricName,
        valueType: metric.valueType,
        unit: current.unit || metric.unit || "",
        reportKey: current.reportKey || metric.metricCode
      };
    });
  }

  async function savePoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewing) return;
    const path = editingPoint ? `/iot/devices/${viewing.id}/points/${editingPoint.id}` : `/iot/devices/${viewing.id}/points`;
    await apiRequest<IotPointRow>(path, {
      method: editingPoint ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editingPoint ? "iot-point-update" : "iot-point-create"),
      body: buildPointPayload(pointForm)
    });
    setMessage(editingPoint ? "设备点位已更新" : "设备点位已新增");
    closePointForm();
    await loadPoints(viewing.id);
  }

  async function removePoint(row: IotPointRow) {
    if (!viewing) return;
    if (!window.confirm(`确认删除点位 ${row.pointName}？已有历史数据的点位不能删除。`)) return;
    await apiRequest<{ id: string }>(`/iot/devices/${viewing.id}/points/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-point-delete")
    });
    setMessage("设备点位已删除");
    await loadPoints(viewing.id);
  }

  const canViewGpsLng = canViewField(authUser, IOT_MODULE, DEVICE_ENTITY, "gpsLng");
  const canViewGpsLat = canViewField(authUser, IOT_MODULE, DEVICE_ENTITY, "gpsLat");
  const canEditGpsLng = canEditField(authUser, IOT_MODULE, DEVICE_ENTITY, "gpsLng");
  const canEditGpsLat = canEditField(authUser, IOT_MODULE, DEVICE_ENTITY, "gpsLat");

  return (
    <PermissionGuard module={IOT_MODULE} permission={SYSTEM_PERMISSIONS.IOT_DEVICE_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>IoT 设备管理</h1>
            <p>管理设备主数据、厂家编码、网关关系、资产位置和设备上报密钥。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.IOT_DEVICE_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增设备
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="编码 / 名称 / 厂家 ID / 位置" />
          </Field>
          <SelectField label="设备类型" value={filters.deviceType} items={deviceTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, deviceType: value }))} />
          <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <SelectField label="在线状态" value={filters.onlineStatus} items={statusItems} allLabel="全部在线状态" onChange={(value) => setFilters((current) => ({ ...current, onlineStatus: value }))} />
          <OptionSelect label="网关" value={filters.gatewayId} options={gateways.map((item) => ({ value: item.id, label: `${item.gatewayCode} ${item.gatewayName}` }))} allLabel="全部网关" onChange={(value) => setFilters((current) => ({ ...current, gatewayId: value }))} />
          <OptionSelect label="楼栋" value={filters.buildingId} options={buildings.map((item) => ({ value: item.id, label: item.buildingName }))} allLabel="全部楼栋" onChange={(value) => setFilters((current) => ({ ...current, buildingId: value, floorId: "", unitId: "" }))} />
          <OptionSelect label="楼层" value={filters.floorId} options={filterFloors(floors, filters.buildingId).map((item) => ({ value: item.id, label: item.floorName }))} allLabel="全部楼层" onChange={(value) => setFilters((current) => ({ ...current, floorId: value, unitId: "" }))} />
          <OptionSelect label="房源" value={filters.unitId} options={filterUnits(units, filters.buildingId, filters.floorId).map((item) => ({ value: item.id, label: `${item.unitCode} ${item.unitName}` }))} allLabel="全部房源" onChange={(value) => setFilters((current) => ({ ...current, unitId: value }))} />
          <OptionSelect label="租户企业" value={filters.parkTenantId} options={parkTenants.map((item) => ({ value: item.id, label: item.companyName }))} allLabel="全部企业" onChange={(value) => setFilters((current) => ({ ...current, parkTenantId: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">设备列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>设备</th>
                <th>类型 / 厂家</th>
                <th>网关 / 位置</th>
                <th>房源 / 租户</th>
                <th>状态</th>
                <th>最近数据 / 指标</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <StackedCell
                      title={<Link className="text-link" href={`/iot/devices/${row.id}`}>{row.deviceName}</Link>}
                      meta={<Link className="text-link" href={`/iot/devices/${row.id}`}>{row.deviceCode}</Link>}
                    />
                  </td>
                  <td>
                    <StackedCell
                      title={<StatusPill dictCode="iot_device_type" value={row.deviceType} dicts={dicts} />}
                      meta={row.vendorDeviceId ? `${row.vendorName ?? "厂家"} ${row.vendorDeviceId}` : row.vendorName ?? "-"}
                    />
                  </td>
                  <td>
                    <StackedCell title={gatewayLabel(gateways, row.gatewayId)} meta={row.location ?? "-"} />
                  </td>
                  <td>
                    <StackedCell title={unitLabel(units, row.unitId)} meta={parkTenantLabel(parkTenants, row.parkTenantId)} />
                  </td>
                  <td>
                    <StackedCell
                      title={<StatusPill dictCode="iot_device_status" value={row.status} dicts={dicts} />}
                      meta={<StatusPill dictCode="iot_device_status" value={row.onlineStatus} dicts={dicts} />}
                    />
                  </td>
                  <td>
                    <StackedCell title={formatDateTime(row.lastDataTime)} meta={formatLatestPreview(row.latestMetrics)} />
                  </td>
                  <td>
                    <DataTableActions>
                      <button className="table-action-button" type="button" onClick={() => openView(row)}><Eye size={16} />查看</button>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_DEVICE_UPDATE} type="button" onClick={() => openEdit(row)}><Edit3 size={16} />编辑</PermissionButton>
                      {row.status === "disabled" ? (
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_DEVICE_ENABLE} type="button" onClick={() => void setDeviceEnabled(row, true).catch((error: Error) => setMessage(error.message))}><Power size={16} />启用</PermissionButton>
                      ) : (
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_DEVICE_DISABLE} type="button" onClick={() => void setDeviceEnabled(row, false).catch((error: Error) => setMessage(error.message))}><PowerOff size={16} />停用</PermissionButton>
                      )}
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_DEVICE_RESET_SECRET} type="button" onClick={() => void resetSecret(row).catch((error: Error) => setMessage(error.message))}><KeyRound size={16} />密钥</PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.IOT_DEVICE_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} />删除</PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={7}><EmptyState /></td></tr> : null}
            </tbody>
          </DataTable>
          <div className="task-item">
            <span>第 {pageData.page} / {totalPages} 页</span>
            <span>
              <button className="secondary-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(Math.max(1, pageData.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>
              <button className="secondary-button" type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
            </span>
          </div>
        </Card>

        {formOpen ? (
          <Drawer size="md" onClose={closeForm}>
            <DrawerHeader
              eyebrow="物联设备"
              title={editing ? "编辑设备" : "新增设备"}
              description="设备密钥不在表单中回显，创建后可通过重置密钥获取一次性明文。"
              onClose={closeForm}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="设备编码">
                  <input value={form.deviceCode} onChange={(event) => setFormValue("deviceCode", event.target.value)} placeholder="留空自动生成" />
                </Field>
                <Field label="设备名称">
                  <input required value={form.deviceName} onChange={(event) => setFormValue("deviceName", event.target.value)} />
                </Field>
                <SelectField required label="设备类型" value={form.deviceType} items={deviceTypes} allLabel="请选择类型" onChange={(value) => setFormValue("deviceType", value)} />
                <OptionSelect label="网关" value={form.gatewayId} options={gateways.map((item) => ({ value: item.id, label: `${item.gatewayCode} ${item.gatewayName}` }))} allLabel="可不绑定网关" onChange={(value) => setFormValue("gatewayId", value)} />
                <Field label="厂家名称">
                  <input value={form.vendorName} onChange={(event) => setFormValue("vendorName", event.target.value)} />
                </Field>
                <Field label="厂家设备 ID">
                  <input value={form.vendorDeviceId} onChange={(event) => setFormValue("vendorDeviceId", event.target.value)} />
                </Field>
                <SelectField label="协议类型" value={form.protocolType} items={protocolTypes} allLabel="请选择协议" onChange={(value) => setFormValue("protocolType", value)} />
                <OptionSelect label="楼栋" value={form.buildingId} options={buildings.map((item) => ({ value: item.id, label: item.buildingName }))} allLabel="不绑定楼栋" onChange={(value) => setFormValue("buildingId", value)} />
                <OptionSelect label="楼层" value={form.floorId} options={filteredFloors.map((item) => ({ value: item.id, label: item.floorName }))} allLabel="不绑定楼层" onChange={(value) => setFormValue("floorId", value)} />
                <OptionSelect label="房源" value={form.unitId} options={filteredUnits.map((item) => ({ value: item.id, label: `${item.unitCode} ${item.unitName}` }))} allLabel="不绑定房源" onChange={(value) => setFormValue("unitId", value)} />
                <OptionSelect label="租户企业" value={form.parkTenantId} options={parkTenants.map((item) => ({ value: item.id, label: item.companyName }))} allLabel="不绑定企业" onChange={(value) => setFormValue("parkTenantId", value)} />
                <Field label="安装位置">
                  <input value={form.location} onChange={(event) => setFormValue("location", event.target.value)} />
                </Field>
                <Field label="经度">
                  <input type="number" step="0.000001" disabled={!canEditGpsLng} value={form.gpsLng} onFocus={(event) => event.target.select()} onChange={(event) => setFormValue("gpsLng", event.target.value)} />
                </Field>
                <Field label="纬度">
                  <input type="number" step="0.000001" disabled={!canEditGpsLat} value={form.gpsLat} onFocus={(event) => event.target.select()} onChange={(event) => setFormValue("gpsLat", event.target.value)} />
                </Field>
                <Field label="安装日期">
                  <input type="date" value={form.installDate} onChange={(event) => setFormValue("installDate", event.target.value)} />
                </Field>
                <Field label="质保到期">
                  <input type="date" value={form.warrantyEndDate} onChange={(event) => setFormValue("warrantyEndDate", event.target.value)} />
                </Field>
                <SelectField label="状态" value={form.status} items={statusItems} allLabel="请选择状态" onChange={(value) => setFormValue("status", value || "enabled")} />
                <SelectField label="在线状态" value={form.onlineStatus} items={statusItems} allLabel="请选择在线状态" onChange={(value) => setFormValue("onlineStatus", value || "offline")} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="备注">
                  <textarea value={form.remark} onChange={(event) => setFormValue("remark", event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeForm}>取消</button>
                <button className="primary-button" type="submit">保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {viewing ? (
          <Drawer size="md" onClose={() => setViewing(null)}>
            <DrawerHeader
              eyebrow="物联设备"
              title={viewing.deviceName}
              description={`${viewing.deviceCode} · ${labelFor(deviceTypes, viewing.deviceType)} · ${gatewayLabel(gateways, viewing.gatewayId)}`}
              onClose={() => setViewing(null)}
              closeIcon={<X size={18} />}
            />
            <DrawerTabs>
              <DrawerTabButton active={detailTab === "profile"} onClick={() => setDetailTab("profile")}>基础信息</DrawerTabButton>
              <DrawerTabButton active={detailTab === "latest"} onClick={() => {
                setDetailTab("latest");
                void loadLatest(viewing.id).catch((error: Error) => setMessage(error.message));
              }}>
                <Activity size={16} />
                实时数据
              </DrawerTabButton>
              <DrawerTabButton active={detailTab === "history"} onClick={() => {
                setDetailTab("history");
                void loadHistory(viewing.id, 1).catch((error: Error) => setMessage(error.message));
              }}>
                <Database size={16} />
                历史数据
              </DrawerTabButton>
              <DrawerTabButton active={detailTab === "trend"} onClick={() => {
                const metricCode = trendMetric || detailMetricOptions[0]?.value || "";
                setDetailTab("trend");
                setTrendMetric(metricCode);
                void loadTrend(viewing.id, metricCode, trendInterval).catch((error: Error) => setMessage(error.message));
              }}>
                <BarChart3 size={16} />
                趋势
              </DrawerTabButton>
              <DrawerTabButton active={detailTab === "points"} onClick={() => {
                setDetailTab("points");
                void loadPoints(viewing.id).catch((error: Error) => setMessage(error.message));
              }}>
                点位
              </DrawerTabButton>
            </DrawerTabs>
            {detailTab === "profile" ? (
              <DrawerDetailGrid>
                <DrawerDetailItem label="设备编码" value={viewing.deviceCode} />
                <DrawerDetailItem label="统一编码" value={viewing.code ?? "-"} />
                <DrawerDetailItem label="设备类型" value={<StatusPill dictCode="iot_device_type" value={viewing.deviceType} dicts={dicts} />} />
                <DrawerDetailItem label="协议类型" value={<StatusPill dictCode="iot_protocol_type" value={viewing.protocolType} dicts={dicts} />} />
                <DrawerDetailItem label="网关" value={gatewayLabel(gateways, viewing.gatewayId)} />
                <DrawerDetailItem label="厂家名称" value={viewing.vendorName ?? "-"} />
                <DrawerDetailItem label="厂家设备 ID" value={viewing.vendorDeviceId ?? "-"} />
                <DrawerDetailItem label="楼栋" value={buildingLabel(buildings, viewing.buildingId)} />
                <DrawerDetailItem label="楼层" value={floorLabel(floors, viewing.floorId)} />
                <DrawerDetailItem label="房源" value={unitLabel(units, viewing.unitId)} />
                <DrawerDetailItem label="租户企业" value={parkTenantLabel(parkTenants, viewing.parkTenantId)} />
                <DrawerDetailItem label="安装位置" value={viewing.location ?? "-"} />
                <DrawerDetailItem label="经度" value={canViewGpsLng ? displaySecuredField("gpsLng", viewing.gpsLng) : "-"} />
                <DrawerDetailItem label="纬度" value={canViewGpsLat ? displaySecuredField("gpsLat", viewing.gpsLat) : "-"} />
                <DrawerDetailItem label="安装日期" value={viewing.installDate ?? "-"} />
                <DrawerDetailItem label="质保到期" value={viewing.warrantyEndDate ?? "-"} />
                <DrawerDetailItem label="状态" value={<StatusPill dictCode="iot_device_status" value={viewing.status} dicts={dicts} />} />
                <DrawerDetailItem label="在线状态" value={<StatusPill dictCode="iot_device_status" value={viewing.onlineStatus} dicts={dicts} />} />
                <DrawerDetailItem label="最后在线" value={formatDateTime(viewing.lastOnlineTime)} />
                <DrawerDetailItem label="最后离线" value={formatDateTime(viewing.lastOfflineTime)} />
                <DrawerDetailItem label="最近数据" value={formatDateTime(viewing.lastDataTime)} />
                <DrawerDetailItem label="状态载荷" value={formatPayload(viewing.statusPayload)} />
                <DrawerDetailItem label="更新时间" value={formatDateTime(viewing.updateTime)} />
                <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
              </DrawerDetailGrid>
            ) : null}
            {detailTab === "latest" ? (
              <DrawerSection title="实时数据">
                <div className="task-item">
                  <div className="realtime-meta">
                    <span>同一设备每个指标仅保留一条最新数据</span>
                    <span className={`realtime-status ${realtime.connectionState === "connected" ? "is-connected" : ""}`}>
                      <span className="realtime-status-dot" />
                      实时：{formatRealtimeState(realtime.connectionState)}
                    </span>
                    {realtime.lastEvent ? <span className="muted-text">最近推送 {formatDateTime(realtime.lastEvent.server_time)}</span> : null}
                    {realtime.errorMessage ? <span className="form-error">{realtime.errorMessage}</span> : null}
                  </div>
                  <button className="secondary-button" type="button" onClick={() => void loadLatest(viewing.id).catch((error: Error) => setMessage(error.message))}>
                    <RefreshCw size={16} />
                    刷新
                  </button>
                </div>
                <DataTable>
                  <thead>
                    <tr>
                      <th>指标</th>
                      <th>值类型</th>
                      <th>最新值</th>
                      <th>质量</th>
                      <th>上报时间</th>
                      <th>接收时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.metricCode}</td>
                        <td><StatusPill dictCode="iot_metric_value_type" value={row.valueType} dicts={dicts} /></td>
                        <td>{formatLatestValue(row)}</td>
                        <td><StatusPill dictCode="iot_data_quality" value={row.quality} dicts={dicts} /></td>
                        <td>{formatDateTime(row.reportedAt)}</td>
                        <td>{formatDateTime(row.receivedAt)}</td>
                      </tr>
                    ))}
                    {latestRows.length === 0 ? <tr><td colSpan={6}><p className="empty-state">暂无实时数据</p></td></tr> : null}
                  </tbody>
                </DataTable>
              </DrawerSection>
            ) : null}
            {detailTab === "history" ? (
              <DrawerSection title="历史数据">
                <div className="filter-bar compact-filter">
                  <OptionSelect
                    label="指标"
                    value={historyMetric}
                    options={detailMetricOptions}
                    allLabel="全部指标"
                    onChange={(value) => setHistoryMetric(value)}
                  />
                  <button className="primary-button" type="button" onClick={() => void loadHistory(viewing.id, 1).catch((error: Error) => setMessage(error.message))}>
                    <Search size={16} />
                    查询
                  </button>
                </div>
                <DataTable>
                  <thead>
                    <tr>
                      <th>指标</th>
                      <th>值类型</th>
                      <th>数据值</th>
                      <th>质量</th>
                      <th>上报时间</th>
                      <th>接收时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.items.map((row) => (
                      <tr key={row.id}>
                        <td>{row.metricCode}</td>
                        <td><StatusPill dictCode="iot_metric_value_type" value={row.valueType} dicts={dicts} /></td>
                        <td>{formatLatestValue(row)}</td>
                        <td><StatusPill dictCode="iot_data_quality" value={row.quality} dicts={dicts} /></td>
                        <td>{formatDateTime(row.reportedAt)}</td>
                        <td>{formatDateTime(row.receivedAt)}</td>
                      </tr>
                    ))}
                    {historyRows.items.length === 0 ? <tr><td colSpan={6}><p className="empty-state">暂无历史数据</p></td></tr> : null}
                  </tbody>
                </DataTable>
                <div className="task-item">
                  <span>共 {historyRows.total} 条，第 {historyRows.page} 页</span>
                  <span>
                    <button className="secondary-button" type="button" disabled={historyRows.page <= 1} onClick={() => void loadHistory(viewing.id, Math.max(1, historyRows.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>
                    <button className="secondary-button" type="button" disabled={historyRows.items.length < historyRows.page_size} onClick={() => void loadHistory(viewing.id, historyRows.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
                  </span>
                </div>
              </DrawerSection>
            ) : null}
            {detailTab === "trend" ? (
              <DrawerSection title="趋势">
                <div className="filter-bar compact-filter">
                  <OptionSelect
                    label="指标"
                    value={trendMetric}
                    options={detailMetricOptions}
                    allLabel="请选择指标"
                    onChange={(value) => setTrendMetric(value)}
                  />
                  <label className="field">
                    <span>粒度</span>
                    <select value={trendInterval} onChange={(event) => setTrendInterval(event.target.value as "minute" | "hour" | "day")}>
                      <option value="minute">分钟</option>
                      <option value="hour">小时</option>
                      <option value="day">天</option>
                    </select>
                  </label>
                  <button className="primary-button" type="button" onClick={() => void loadTrend(viewing.id).catch((error: Error) => setMessage(error.message))}>
                    <Search size={16} />
                    查询
                  </button>
                </div>
                <DataTable>
                  <thead>
                    <tr>
                      <th>时间桶</th>
                      <th>采样数</th>
                      <th>平均值</th>
                      <th>最小值</th>
                      <th>最大值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendRows?.items.map((row) => (
                      <tr key={row.bucketTime}>
                        <td>{formatDateTime(row.bucketTime)}</td>
                        <td>{row.count}</td>
                        <td>{formatNumberText(row.avgValue)}</td>
                        <td>{formatNumberText(row.minValue)}</td>
                        <td>{formatNumberText(row.maxValue)}</td>
                      </tr>
                    ))}
                    {!trendRows || trendRows.items.length === 0 ? <tr><td colSpan={5}><p className="empty-state">请选择数值型指标查看趋势</p></td></tr> : null}
                  </tbody>
                </DataTable>
              </DrawerSection>
            ) : null}
            {detailTab === "points" ? (
              <DrawerSection title="设备点位">
                <div className="task-item">
                  <span>共 {points.length} 个采集点位</span>
                  <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.IOT_POINT_CREATE} type="button" onClick={openCreatePoint}>
                    <Plus size={16} />
                    新增点位
                  </PermissionButton>
                </div>
                <DataTable>
                  <thead>
                    <tr>
                      <th>点位编码</th>
                      <th>点位名称</th>
                      <th>指标</th>
                      <th>点位类型</th>
                      <th>值类型</th>
                      <th>上报键</th>
                      <th>最近值</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((point) => (
                      <tr key={point.id}>
                        <td>{point.pointCode}</td>
                        <td>{point.pointName}</td>
                        <td>{metricLabel(metrics, point.metricId, point.metricCode)}</td>
                        <td><StatusPill dictCode="iot_point_type" value={point.pointType} dicts={dicts} /></td>
                        <td><StatusPill dictCode="iot_metric_value_type" value={point.valueType} dicts={dicts} /></td>
                        <td>{point.reportKey ?? "-"}</td>
                        <td>{formatPointValue(point)}</td>
                        <td><StatusPill dictCode="iot_device_status" value={point.status} dicts={dicts} /></td>
                        <td>
                          <DataTableActions>
                            <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_POINT_UPDATE} type="button" onClick={() => openEditPoint(point)}>
                              <Edit3 size={16} />
                              编辑
                            </PermissionButton>
                            <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.IOT_POINT_DELETE} type="button" onClick={() => void removePoint(point).catch((error: Error) => setMessage(error.message))}>
                              <Trash2 size={16} />
                              删除
                            </PermissionButton>
                          </DataTableActions>
                        </td>
                      </tr>
                    ))}
                    {points.length === 0 ? <tr><td colSpan={9}><p className="empty-state">暂无设备点位</p></td></tr> : null}
                  </tbody>
                </DataTable>
              </DrawerSection>
            ) : null}
          </Drawer>
        ) : null}

        {viewing && pointFormOpen ? (
          <Drawer size="md" onClose={closePointForm}>
            <DrawerHeader
              eyebrow="物联设备"
              title={editingPoint ? "编辑设备点位" : "新增设备点位"}
              description={`${viewing.deviceCode} · ${viewing.deviceName}`}
              onClose={closePointForm}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void savePoint(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="点位编码">
                  <input value={pointForm.pointCode} onChange={(event) => setPointFormValue("pointCode", event.target.value)} placeholder="留空自动生成" />
                </Field>
                <OptionSelect
                  label="绑定指标"
                  value={pointForm.metricId}
                  options={metrics.map((item) => ({ value: item.id, label: `${item.metricCode} ${item.metricName}` }))}
                  allLabel="不绑定指标"
                  onChange={(value) => setPointFormValue("metricId", value)}
                />
                <Field label="指标编码">
                  <input value={pointForm.metricCode} onChange={(event) => setPointFormValue("metricCode", event.target.value)} placeholder="绑定指标后自动带出，也可手工填写" />
                </Field>
                <Field label="点位名称">
                  <input required value={pointForm.pointName} onChange={(event) => setPointFormValue("pointName", event.target.value)} />
                </Field>
                <SelectField required label="点位类型" value={pointForm.pointType} items={pointTypes} allLabel="请选择点位类型" onChange={(value) => setPointFormValue("pointType", value)} />
                <SelectField required label="值类型" value={pointForm.valueType} items={valueTypes} allLabel="请选择值类型" onChange={(value) => setPointFormValue("valueType", value)} />
                <Field label="单位">
                  <input value={pointForm.unit} onChange={(event) => setPointFormValue("unit", event.target.value)} />
                </Field>
                <Field label="上报 Topic">
                  <input value={pointForm.reportTopic} onChange={(event) => setPointFormValue("reportTopic", event.target.value)} />
                </Field>
                <Field label="上报字段">
                  <input value={pointForm.reportKey} onChange={(event) => setPointFormValue("reportKey", event.target.value)} />
                </Field>
                <Field label="最小值">
                  <input type="number" value={pointForm.minValue} onFocus={(event) => event.target.select()} onChange={(event) => setPointFormValue("minValue", event.target.value)} />
                </Field>
                <Field label="最大值">
                  <input type="number" value={pointForm.maxValue} onFocus={(event) => event.target.select()} onChange={(event) => setPointFormValue("maxValue", event.target.value)} />
                </Field>
                <SelectField label="状态" value={pointForm.status} items={statusItems} allLabel="请选择状态" onChange={(value) => setPointFormValue("status", value || "enabled")} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="备注">
                  <textarea value={pointForm.remark} onChange={(event) => setPointFormValue("remark", event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closePointForm}>取消</button>
                <button className="primary-button" type="submit">保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );

  function displaySecuredField(field: string, value: unknown): string {
    if (!canViewField(authUser, IOT_MODULE, DEVICE_ENTITY, field)) return "-";
    const masked = maskField(authUser, IOT_MODULE, DEVICE_ENTITY, field, value);
    return masked === null || masked === undefined || masked === "" ? "-" : String(masked);
  }
}

function buildPayload(form: DeviceForm) {
  return {
    device_code: form.deviceCode.trim() || undefined,
    device_name: form.deviceName.trim(),
    device_type: form.deviceType,
    gateway_id: form.gatewayId || undefined,
    vendor_name: form.vendorName.trim() || undefined,
    vendor_device_id: form.vendorDeviceId.trim() || undefined,
    protocol_type: form.protocolType || undefined,
    building_id: form.buildingId || undefined,
    floor_id: form.floorId || undefined,
    unit_id: form.unitId || undefined,
    park_tenant_id: form.parkTenantId || undefined,
    location: form.location.trim() || undefined,
    gps_lng: numberOrUndefined(form.gpsLng),
    gps_lat: numberOrUndefined(form.gpsLat),
    install_date: form.installDate || undefined,
    warranty_end_date: form.warrantyEndDate || undefined,
    status: form.status || "enabled",
    online_status: form.onlineStatus || "offline",
    remark: form.remark.trim() || undefined
  };
}

function buildPointPayload(form: PointForm) {
  return {
    point_code: form.pointCode.trim() || undefined,
    metric_id: form.metricId || undefined,
    metric_code: form.metricCode.trim() || undefined,
    point_name: form.pointName.trim(),
    point_type: form.pointType,
    value_type: form.valueType,
    unit: form.unit.trim() || undefined,
    report_topic: form.reportTopic.trim() || undefined,
    report_key: form.reportKey.trim() || undefined,
    min_value: numberOrUndefined(form.minValue),
    max_value: numberOrUndefined(form.maxValue),
    status: form.status || "enabled",
    remark: form.remark.trim() || undefined
  };
}

function numberOrUndefined(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  required = false,
  onChange
}: {
  label: string;
  value: string;
  items: DictItemRow[];
  allLabel: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </label>
  );
}

function OptionSelect({
  label,
  value,
  options,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
  );
}

function filterFloors(floors: FloorRow[], buildingId: string) {
  return buildingId ? floors.filter((item) => item.buildingId === buildingId) : floors;
}

function filterUnits(units: UnitRow[], buildingId: string, floorId: string) {
  return units.filter((item) => (!buildingId || item.buildingId === buildingId) && (!floorId || item.floorId === floorId));
}

function labelFor(items: DictItemRow[], value?: string | null) {
  if (!value) return "-";
  return items.find((item) => String(item.itemValue) === String(value))?.itemLabel ?? value;
}

function gatewayLabel(items: GatewayRow[], id?: string | null) {
  if (!id) return "-";
  const item = items.find((row) => row.id === id);
  return item ? `${item.gatewayCode} ${item.gatewayName}` : id;
}

function buildingLabel(items: BuildingRow[], id?: string | null) {
  if (!id) return "-";
  return items.find((row) => row.id === id)?.buildingName ?? id;
}

function floorLabel(items: FloorRow[], id?: string | null) {
  if (!id) return "-";
  return items.find((row) => row.id === id)?.floorName ?? id;
}

function unitLabel(items: UnitRow[], id?: string | null) {
  if (!id) return "-";
  const item = items.find((row) => row.id === id);
  return item ? `${item.unitCode} ${item.unitName}` : id;
}

function parkTenantLabel(items: ParkTenantRow[], id?: string | null) {
  if (!id) return "-";
  return items.find((row) => row.id === id)?.companyName ?? id;
}

function StackedCell({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <span className="ds-table-stacked-cell">
      <strong>{title}</strong>
      {meta ? <small>{meta}</small> : null}
    </span>
  );
}

function metricLabel(items: IotMetricRow[], id?: string | null, metricCode?: string | null) {
  const item = id ? items.find((row) => row.id === id) : items.find((row) => row.metricCode === metricCode);
  if (item) return `${item.metricCode} ${item.metricName}`;
  return metricCode ?? "-";
}

function formatPointValue(point: IotPointRow) {
  const value = point.lastValueText ?? point.lastValue;
  if (value === null || value === undefined || value === "") return "-";
  const suffix = point.unit ? ` ${point.unit}` : "";
  return `${value}${suffix}`;
}

function formatLatestPreview(rows?: IotDeviceLatestRow[]) {
  if (!rows || rows.length === 0) return "-";
  return rows.slice(0, 3).map((row) => `${row.metricCode}: ${formatLatestValue(row)}`).join(" / ");
}

function formatLatestValue(row: IotDeviceLatestRow) {
  if (row.valueType === "number" && row.valueNumber !== null && row.valueNumber !== undefined) return row.valueNumber;
  if (row.valueType === "boolean" && row.valueBool !== null && row.valueBool !== undefined) return row.valueBool ? "true" : "false";
  if (row.valueType === "json" && row.valueJson !== null && row.valueJson !== undefined) return JSON.stringify(row.valueJson);
  if (row.valueText !== null && row.valueText !== undefined && row.valueText !== "") return row.valueText;
  if (row.valueNumber !== null && row.valueNumber !== undefined) return row.valueNumber;
  return "-";
}

function formatNumberText(value?: string | null) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : value;
}

function buildMetricOptions(points: IotPointRow[], latestRows: IotDeviceLatestRow[]) {
  const options = new Map<string, string>();
  for (const point of points) {
    const metricCode = point.metricCode ?? point.pointCode;
    options.set(metricCode, `${metricCode} ${point.pointName}`);
  }
  for (const row of latestRows) {
    if (!options.has(row.metricCode)) {
      options.set(row.metricCode, row.metricCode);
    }
  }
  return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatPayload(value: Record<string, unknown>) {
  const keys = Object.keys(value ?? {});
  return keys.length ? JSON.stringify(value) : "-";
}

function readRealtimeString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function formatRealtimeState(state: string) {
  const map: Record<string, string> = {
    idle: "未连接",
    connecting: "连接中",
    connected: "已连接",
    reconnecting: "重连中",
    closed: "已断开",
    error: "连接异常"
  };
  return map[state] ?? state;
}

function EmptyState() {
  return <p className="muted-text">暂无 IoT 设备</p>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <h1>403</h1>
        <p>无权访问 IoT 设备，或当前租户未开通 IoT 能力。</p>
      </Card>
    </main>
  );
}
