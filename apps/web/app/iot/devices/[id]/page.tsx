"use client";

import { Card, DataTable, StatusPill } from "@jinhu/ui";
import { Activity, AlertTriangle, ArrowLeft, BellRing, Cpu, Database, FileClock, RefreshCw, Router, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { apiRequest } from "../../../../lib/api-client";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { canViewField, maskField } from "../../../../lib/field-policy";
import { useIotRealtime } from "../../../../hooks/useIotRealtime";

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
  buildingName: string;
}

interface FloorRow {
  id: string;
  floorName: string;
}

interface UnitRow {
  id: string;
  unitCode: string;
  unitName: string;
}

interface ParkTenantRow {
  id: string;
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
  remark: string | null;
  createBy: string | null;
  createTime: string;
  updateBy: string | null;
  updateTime: string;
  version: number;
}

interface IotPointRow {
  id: string;
  pointCode: string;
  pointName: string;
  metricId: string | null;
  metricCode: string | null;
  pointType: string;
  valueType: string;
  unit: string | null;
  reportTopic: string | null;
  reportKey: string | null;
  lastValue: string | null;
  lastValueText: string | null;
  lastReportTime: string | null;
  status: string;
}

interface IotLatestRow {
  id: string;
  pointId: string | null;
  metricCode: string;
  valueType: string;
  valueNumber: string | null;
  valueText: string | null;
  valueBool: boolean | null;
  valueJson: unknown | null;
  quality: string;
  reportedAt: string;
  receivedAt: string;
}

interface IotHistoryRow extends IotLatestRow {
  rawPayload: Record<string, unknown>;
  createTime: string;
}

interface AlertRow {
  id: string;
  alertCode: string;
  deviceId: string;
  deviceCode: string;
  deviceName: string;
  metricCode: string;
  alertLevel: string;
  alertTitle: string;
  alertContent: string | null;
  triggerValue: string | null;
  status: string;
  firstTriggerTime: string;
  lastTriggerTime: string;
  workOrderId: string | null;
}

interface WorkOrderRow {
  id: string;
  woCode: string;
  title: string;
  priority: string;
  status: string;
  assigneeName: string | null;
  overdueFlag: boolean;
  createTime: string;
}

type DictMap = Record<string, DictItemRow[]>;
type DetailTab = "profile" | "points" | "latest" | "history" | "alerts" | "workorders" | "audit";

const dictCodes = [
  "iot_device_type",
  "iot_protocol_type",
  "iot_device_status",
  "iot_point_type",
  "iot_metric_value_type",
  "iot_data_quality",
  "iot_alert_level",
  "iot_alert_status",
  "workorder_status",
  "workorder_priority"
];

export default function IotDeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const deviceId = String(params.id ?? "");
  const authUser = useAuthUser();
  const [device, setDevice] = useState<IotDeviceRow | null>(null);
  const [points, setPoints] = useState<IotPointRow[]>([]);
  const [latestRows, setLatestRows] = useState<IotLatestRow[]>([]);
  const [historyRows, setHistoryRows] = useState<PaginatedResult<IotHistoryRow>>({ items: [], total: 0, page: 1, page_size: 50 });
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [dicts, setDicts] = useState<DictMap>({});
  const [gateways, setGateways] = useState<GatewayRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("profile");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const realtimeTopics = useMemo(() => (deviceId ? [`iot:device:${deviceId}`] : []), [deviceId]);
  const refreshRealtimeParts = useCallback(async () => {
    if (!deviceId) return;
    const [deviceResponse, latestResponse, historyResponse, alertResponse] = await Promise.all([
      apiRequest<IotDeviceRow>(`/iot/devices/${deviceId}`, { token: getAccessToken() }),
      apiRequest<IotLatestRow[]>(`/iot/devices/${deviceId}/latest`, { token: getAccessToken() }),
      apiRequest<PaginatedResult<IotHistoryRow>>(`/iot/devices/${deviceId}/history?page=1&page_size=50`, { token: getAccessToken() }),
      apiRequest<PaginatedResult<AlertRow>>(`/iot/alerts?device_id=${deviceId}&page=1&page_size=20&sort=-last_trigger_time`, { token: getAccessToken() })
    ]);
    setDevice(deviceResponse.data);
    setLatestRows(latestResponse.data);
    setHistoryRows(historyResponse.data);
    setAlerts(alertResponse.data.items);
  }, [deviceId]);

  const realtime = useIotRealtime({
    enabled: Boolean(deviceId),
    topics: realtimeTopics,
    onEvent: (event) => {
      if (event.device_id !== deviceId) return;
      if (
        ["device.latest", "device.status", "iot.device.online", "iot.device.offline", "iot.metric.updated", "alert.created", "alert.updated", "iot.alert.created", "iot.alert.updated"].includes(
          event.event
        )
      ) {
        void refreshRealtimeParts().catch((error: Error) => setMessage(error.message));
      }
    }
  });

  const loadAll = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setMessage("");
    try {
      const [
        deviceResponse,
        pointsResponse,
        latestResponse,
        historyResponse,
        alertsResponse,
        workOrdersResponse,
        dictMap,
        gatewayItems,
        buildingItems,
        floorItems,
        unitItems,
        tenantItems
      ] = await Promise.all([
        apiRequest<IotDeviceRow>(`/iot/devices/${deviceId}`, { token: getAccessToken() }),
        apiRequest<IotPointRow[]>(`/iot/devices/${deviceId}/points`, { token: getAccessToken() }),
        apiRequest<IotLatestRow[]>(`/iot/devices/${deviceId}/latest`, { token: getAccessToken() }),
        apiRequest<PaginatedResult<IotHistoryRow>>(`/iot/devices/${deviceId}/history?page=1&page_size=50`, { token: getAccessToken() }),
        apiRequest<PaginatedResult<AlertRow>>(`/iot/alerts?device_id=${deviceId}&page=1&page_size=20&sort=-last_trigger_time`, { token: getAccessToken() }),
        safeFetchPage<WorkOrderRow>(`/work-orders?device_id=${deviceId}&page=1&page_size=20&sort=-update_time`),
        loadDicts(),
        safeFetchPage<GatewayRow>("/iot/gateways?page=1&page_size=100"),
        safeFetchPage<BuildingRow>("/buildings?page=1&page_size=100"),
        safeFetchPage<FloorRow>("/floors?page=1&page_size=100"),
        safeFetchPage<UnitRow>("/park-units?page=1&page_size=100"),
        safeFetchPage<ParkTenantRow>("/park-tenants?page=1&page_size=100")
      ]);
      setDevice(deviceResponse.data);
      setPoints(pointsResponse.data);
      setLatestRows(latestResponse.data);
      setHistoryRows(historyResponse.data);
      setAlerts(alertsResponse.data.items);
      setWorkOrders(workOrdersResponse);
      setDicts(dictMap);
      setGateways(gatewayItems);
      setBuildings(buildingItems);
      setFloors(floorItems);
      setUnits(unitItems);
      setParkTenants(tenantItems);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载设备详情失败");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const canViewGpsLng = canViewField(authUser, IOT_MODULE, DEVICE_ENTITY, "gpsLng");
  const canViewGpsLat = canViewField(authUser, IOT_MODULE, DEVICE_ENTITY, "gpsLat");

  return (
    <PermissionGuard module={IOT_MODULE} permission={SYSTEM_PERMISSIONS.IOT_DEVICE_READ} fallback={<Forbidden />}>
      <main className="page-container iot-detail-page">
        <Card className="page-header">
          <div>
            <Link className="text-link back-link" href="/iot/devices">
              <ArrowLeft size={16} />
              返回设备列表
            </Link>
            <h1>{device?.deviceName ?? "IoT 设备详情"}</h1>
            <p>{device ? `${device.deviceCode} · ${labelFor(dicts.iot_device_type, device.deviceType)} · ${formatDateTime(device.lastDataTime)}` : "查看设备基础信息、实时数据、历史数据、告警和关联工单。"}</p>
          </div>
          <div className="page-actions">
            <span className={`realtime-status ${realtime.connectionState === "connected" ? "is-connected" : ""}`}>
              <span className="realtime-status-dot" />
              实时：{formatRealtimeState(realtime.connectionState)}
            </span>
            <button className="secondary-button" type="button" onClick={() => void loadAll()}>
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}
        {loading ? <DetailSkeleton /> : null}
        {!loading && !device ? <Card className="page-content"><EmptyState text="未找到设备或无权访问" /></Card> : null}

        {!loading && device ? (
          <>
            <Card className="asset-stat-summary">
              <StatCard icon={<Cpu size={16} />} label="设备状态" value={<StatusPill dictCode="iot_device_status" value={device.status} dicts={dicts} />} />
              <StatCard icon={<Activity size={16} />} label="在线状态" value={<StatusPill dictCode="iot_device_status" value={device.onlineStatus} dicts={dicts} />} />
              <StatCard icon={<Database size={16} />} label="实时指标" value={String(latestRows.length)} />
              <StatCard icon={<BellRing size={16} />} label="告警数量" value={String(alerts.length)} />
              <StatCard icon={<Router size={16} />} label="采集点位" value={String(points.length)} />
              <StatCard icon={<Wrench size={16} />} label="关联工单" value={String(workOrders.length)} />
            </Card>

            <Card className="iot-detail-tabs">
              {([
                ["profile", "基础信息", <Cpu key="profile" size={16} />],
                ["points", "点位列表", <Router key="points" size={16} />],
                ["latest", "实时数据", <Activity key="latest" size={16} />],
                ["history", "历史数据", <Database key="history" size={16} />],
                ["alerts", "告警列表", <AlertTriangle key="alerts" size={16} />],
                ["workorders", "关联工单", <Wrench key="workorders" size={16} />],
                ["audit", "审计摘要", <FileClock key="audit" size={16} />]
              ] as Array<[DetailTab, string, ReactNode]>).map(([key, label, icon]) => (
                <button key={key} className={activeTab === key ? "primary-button" : "secondary-button"} type="button" onClick={() => setActiveTab(key)}>
                  {icon}
                  {label}
                </button>
              ))}
            </Card>

            {activeTab === "profile" ? (
              <Card className="page-content">
                <div className="task-item">
                  <h2 className="panel-title">基础信息</h2>
                  <StatusPill dictCode="iot_protocol_type" value={device.protocolType} dicts={dicts} />
                </div>
                <section className="iot-detail-grid">
                  <DetailItem label="设备编码" value={device.deviceCode} />
                  <DetailItem label="统一编码" value={device.code ?? "-"} />
                  <DetailItem label="设备类型" value={<StatusPill dictCode="iot_device_type" value={device.deviceType} dicts={dicts} />} />
                  <DetailItem label="网关" value={gatewayLabel(gateways, device.gatewayId)} />
                  <DetailItem label="厂家名称" value={device.vendorName ?? "-"} />
                  <DetailItem label="厂家设备 ID" value={device.vendorDeviceId ?? "-"} />
                  <DetailItem label="楼栋" value={labelById(buildings, device.buildingId, "buildingName")} />
                  <DetailItem label="楼层" value={labelById(floors, device.floorId, "floorName")} />
                  <DetailItem label="房源" value={unitLabel(units, device.unitId)} />
                  <DetailItem label="租户企业" value={labelById(parkTenants, device.parkTenantId, "companyName")} />
                  <DetailItem label="安装位置" value={device.location ?? "-"} />
                  <DetailItem label="经纬度" value={`${canViewGpsLng ? secureDeviceField(authUser, "gpsLng", device.gpsLng) : "-"} / ${canViewGpsLat ? secureDeviceField(authUser, "gpsLat", device.gpsLat) : "-"}`} />
                  <DetailItem label="安装日期" value={device.installDate ?? "-"} />
                  <DetailItem label="质保到期" value={device.warrantyEndDate ?? "-"} />
                  <DetailItem label="最后在线" value={formatDateTime(device.lastOnlineTime)} />
                  <DetailItem label="最后离线" value={formatDateTime(device.lastOfflineTime)} />
                  <DetailItem label="最近数据" value={formatDateTime(device.lastDataTime)} />
                  <DetailItem label="备注" value={device.remark ?? "-"} />
                </section>
              </Card>
            ) : null}

            {activeTab === "points" ? (
              <Card className="page-content">
                <h2 className="panel-title">点位列表</h2>
                {points.length ? (
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
                        <th>最近上报</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {points.map((point) => (
                        <tr key={point.id}>
                          <td>{point.pointCode}</td>
                          <td>{point.pointName}</td>
                          <td>{point.metricCode ?? "-"}</td>
                          <td><StatusPill dictCode="iot_point_type" value={point.pointType} dicts={dicts} /></td>
                          <td><StatusPill dictCode="iot_metric_value_type" value={point.valueType} dicts={dicts} /></td>
                          <td>{point.reportKey ?? "-"}</td>
                          <td>{formatPointValue(point)}</td>
                          <td>{formatDateTime(point.lastReportTime)}</td>
                          <td><StatusPill dictCode="iot_device_status" value={point.status} dicts={dicts} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                ) : <EmptyState text="暂无设备点位" />}
              </Card>
            ) : null}

            {activeTab === "latest" ? (
              <Card className="page-content">
                <div className="task-item">
                  <h2 className="panel-title">实时数据</h2>
                  {realtime.lastEvent ? <span className="muted-text">最近推送 {formatDateTime(realtime.lastEvent.server_time)}</span> : null}
                </div>
                <LatestTable rows={latestRows} dicts={dicts} />
              </Card>
            ) : null}

            {activeTab === "history" ? (
              <Card className="page-content">
                <div className="task-item">
                  <h2 className="panel-title">历史数据</h2>
                  <span>共 {historyRows.total} 条</span>
                </div>
                <HistoryTable rows={historyRows.items} dicts={dicts} />
              </Card>
            ) : null}

            {activeTab === "alerts" ? (
              <Card className="page-content">
                <h2 className="panel-title">告警列表</h2>
                {alerts.length ? (
                  <DataTable>
                    <thead>
                      <tr>
                        <th>告警编号</th>
                        <th>标题</th>
                        <th>指标</th>
                        <th>级别</th>
                        <th>状态</th>
                        <th>触发值</th>
                        <th>最近触发</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((alert) => (
                        <tr key={alert.id}>
                          <td><Link className="text-link" href="/iot/alerts">{alert.alertCode}</Link></td>
                          <td>{alert.alertTitle}</td>
                          <td>{alert.metricCode}</td>
                          <td><StatusPill dictCode="iot_alert_level" value={alert.alertLevel} dicts={dicts} /></td>
                          <td><StatusPill dictCode="iot_alert_status" value={alert.status} dicts={dicts} /></td>
                          <td>{alert.triggerValue ?? "-"}</td>
                          <td>{formatDateTime(alert.lastTriggerTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                ) : <EmptyState text="暂无设备告警" />}
              </Card>
            ) : null}

            {activeTab === "workorders" ? (
              <Card className="page-content">
                <h2 className="panel-title">关联工单</h2>
                {workOrders.length ? (
                  <DataTable>
                    <thead>
                      <tr>
                        <th>工单编号</th>
                        <th>标题</th>
                        <th>优先级</th>
                        <th>状态</th>
                        <th>处理人</th>
                        <th>超时</th>
                        <th>创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workOrders.map((row) => (
                        <tr key={row.id}>
                          <td><Link className="text-link" href={`/workorders/${row.id}`}>{row.woCode}</Link></td>
                          <td>{row.title}</td>
                          <td><StatusPill dictCode="workorder_priority" value={row.priority} dicts={dicts} /></td>
                          <td><StatusPill dictCode="workorder_status" value={row.status} dicts={dicts} /></td>
                          <td>{row.assigneeName ?? "-"}</td>
                          <td>{row.overdueFlag ? "是" : "否"}</td>
                          <td>{formatDateTime(row.createTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                ) : <EmptyState text="暂无关联工单" />}
              </Card>
            ) : null}

            {activeTab === "audit" ? (
              <Card className="page-content">
                <div className="task-item">
                  <h2 className="panel-title">审计摘要</h2>
                  <span>版本 {device.version}</span>
                </div>
                <section className="iot-detail-grid">
                  <DetailItem label="创建人" value={device.createBy ?? "-"} />
                  <DetailItem label="创建时间" value={formatDateTime(device.createTime)} />
                  <DetailItem label="更新人" value={device.updateBy ?? "-"} />
                  <DetailItem label="更新时间" value={formatDateTime(device.updateTime)} />
                </section>
                <div className="iot-json-block">
                  <span>状态载荷</span>
                  <pre>{formatPayload(device.statusPayload)}</pre>
                </div>
              </Card>
            ) : null}
          </>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="asset-stat-card">
      <div className="asset-stat-card-header">
        <span className="asset-stat-card-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <strong className="asset-stat-card-value">{value}</strong>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="iot-detail-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LatestTable({ rows, dicts }: { rows: IotLatestRow[]; dicts: DictMap }) {
  if (!rows.length) return <EmptyState text="暂无实时数据" />;
  return (
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
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.metricCode}</td>
            <td><StatusPill dictCode="iot_metric_value_type" value={row.valueType} dicts={dicts} /></td>
            <td>{formatLatestValue(row)}</td>
            <td><StatusPill dictCode="iot_data_quality" value={row.quality} dicts={dicts} /></td>
            <td>{formatDateTime(row.reportedAt)}</td>
            <td>{formatDateTime(row.receivedAt)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function HistoryTable({ rows, dicts }: { rows: IotHistoryRow[]; dicts: DictMap }) {
  if (!rows.length) return <EmptyState text="暂无历史数据" />;
  return (
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
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.metricCode}</td>
            <td><StatusPill dictCode="iot_metric_value_type" value={row.valueType} dicts={dicts} /></td>
            <td>{formatLatestValue(row)}</td>
            <td><StatusPill dictCode="iot_data_quality" value={row.quality} dicts={dicts} /></td>
            <td>{formatDateTime(row.reportedAt)}</td>
            <td>{formatDateTime(row.receivedAt)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function DetailSkeleton() {
  return (
    <Card className="page-content">
      <div className="skeleton-stack">
        <span className="skeleton-line skeleton-line-lg" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line-sm" />
      </div>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <div className="empty-state">403：无权访问 IoT 设备，或当前租户未启用 iot 模块。</div>
      </Card>
    </main>
  );
}

async function safeFetchPage<T>(path: string): Promise<T[]> {
  try {
    const response = await apiRequest<PaginatedResult<T>>(path, { token: getAccessToken() });
    return response.data.items;
  } catch {
    return [];
  }
}

async function loadDicts(): Promise<DictMap> {
  const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
    token: getAccessToken()
  });
  const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
  const entries = await Promise.all(dictCodes.map(async (code) => {
    const dictTypeId = typeMap.get(code);
    if (!dictTypeId) return [code, []] as const;
    const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
      token: getAccessToken()
    });
    return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
  }));
  return Object.fromEntries(entries);
}

function labelFor(items?: DictItemRow[], value?: string | null): string {
  if (!value) return "-";
  return items?.find((item) => String(item.itemValue) === String(value))?.itemLabel ?? value;
}

function labelById<T extends { id: string }>(items: T[], id: string | null, key: keyof T): string {
  if (!id) return "-";
  const item = items.find((row) => row.id === id);
  const value = item?.[key];
  return typeof value === "string" && value ? value : id;
}

function gatewayLabel(items: GatewayRow[], id?: string | null): string {
  if (!id) return "-";
  const item = items.find((row) => row.id === id);
  return item ? `${item.gatewayCode} ${item.gatewayName}` : id;
}

function unitLabel(items: UnitRow[], id?: string | null): string {
  if (!id) return "-";
  const item = items.find((row) => row.id === id);
  return item ? `${item.unitCode} ${item.unitName}` : id;
}

function formatPointValue(point: IotPointRow): string {
  const value = point.lastValueText ?? point.lastValue;
  if (value === null || value === undefined || value === "") return "-";
  return `${value}${point.unit ? ` ${point.unit}` : ""}`;
}

function formatLatestValue(row: IotLatestRow): string {
  if (row.valueType === "number" && row.valueNumber !== null && row.valueNumber !== undefined) return row.valueNumber;
  if (row.valueType === "boolean" && row.valueBool !== null && row.valueBool !== undefined) return row.valueBool ? "true" : "false";
  if (row.valueType === "json" && row.valueJson !== null && row.valueJson !== undefined) return JSON.stringify(row.valueJson);
  if (row.valueText !== null && row.valueText !== undefined && row.valueText !== "") return row.valueText;
  if (row.valueNumber !== null && row.valueNumber !== undefined) return row.valueNumber;
  return "-";
}

function secureDeviceField(authUser: ReturnType<typeof useAuthUser>, field: string, value: unknown): string {
  const masked = maskField(authUser, IOT_MODULE, DEVICE_ENTITY, field, value);
  return masked === null || masked === undefined || masked === "" ? "-" : String(masked);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatPayload(value?: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) return "暂无状态载荷";
  return JSON.stringify(value, null, 2);
}

function formatRealtimeState(state: string): string {
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
