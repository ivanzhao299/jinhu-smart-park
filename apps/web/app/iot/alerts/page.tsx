"use client";

import {
  Card,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerHeader,
  StatusPill
} from "@jinhu/ui";
import {
  BellRing,
  CheckCircle2,
  CircleDot,
  Eye,
  ListChecks,
  RefreshCw,
  Search,
  ShieldOff,
  Wrench,
  XCircle
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { useIotRealtime } from "../../../hooks/useIotRealtime";

const IOT_MODULE = "iot";

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

interface DeviceRow {
  id: string;
  deviceCode: string;
  deviceName: string;
  deviceType: string;
  onlineStatus: string;
}

interface UserRow {
  id: string;
  username: string;
  displayName?: string | null;
  realName?: string | null;
}

interface AlertRow {
  id: string;
  alertCode: string;
  ruleId: string | null;
  deviceId: string;
  deviceCode: string;
  deviceName: string;
  pointId: string | null;
  metricCode: string;
  metricName: string | null;
  alertLevel: string;
  alertTitle: string;
  alertContent: string | null;
  triggerValue: string | null;
  thresholdValue: string | null;
  triggerPayload: Record<string, unknown>;
  status: string;
  firstTriggerTime: string;
  lastTriggerTime: string;
  acknowledgeTime: string | null;
  acknowledgeByName: string | null;
  handleTime: string | null;
  handleByName: string | null;
  handleNote: string | null;
  closeTime: string | null;
  closeByName: string | null;
  closeReason: string | null;
  workOrderId: string | null;
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  parkTenantId: string | null;
  createTime: string;
  updateTime: string;
}

interface AlertLogRow {
  id: string;
  alertId: string;
  action: string;
  beforeStatus: string | null;
  afterStatus: string | null;
  operatorId: string | null;
  operatorName: string | null;
  content: string | null;
  reason: string | null;
  opTime: string;
}

interface Filters {
  keyword: string;
  deviceId: string;
  alertLevel: string;
  status: string;
  startDate: string;
  endDate: string;
}

interface WorkOrderForm {
  title: string;
  priority: string;
  urgency: string;
  assigneeId: string;
  description: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<AlertRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = {
  keyword: "",
  deviceId: "",
  alertLevel: "",
  status: "",
  startDate: "",
  endDate: ""
};
const emptyWorkOrderForm: WorkOrderForm = {
  title: "",
  priority: "",
  urgency: "",
  assigneeId: "",
  description: ""
};

export default function IotAlertsPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<AlertRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [viewing, setViewing] = useState<AlertRow | null>(null);
  const [logs, setLogs] = useState<AlertLogRow[]>([]);
  const [workOrderForm, setWorkOrderForm] = useState<WorkOrderForm>(emptyWorkOrderForm);
  const [message, setMessage] = useState("");

  const alertLevels = dicts.iot_alert_level ?? [];
  const alertStatuses = dicts.iot_alert_status ?? [];
  const priorityItems = dicts.workorder_priority ?? [];
  const urgencyItems = dicts.workorder_urgency ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const realtimeTopics = useMemo(() => (authUser?.park_id ? [`iot:alerts:${authUser.park_id}`] : []), [authUser?.park_id]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-last_trigger_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.deviceId) params.set("device_id", filters.deviceId);
    if (filters.alertLevel) params.set("alert_level", filters.alertLevel);
    if (filters.status) params.set("status", filters.status);
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    const response = await apiRequest<PaginatedResult<AlertRow>>(`/iot/alerts?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["iot_alert_level", "iot_alert_status", "workorder_priority", "workorder_urgency"];
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

  const loadDevices = useCallback(async () => {
    const response = await apiRequest<PaginatedResult<DeviceRow>>("/iot/devices?page=1&page_size=100&sort=device_code", {
      token: getAccessToken()
    });
    setDevices(response.data.items);
  }, []);

  const loadUsers = useCallback(async () => {
    const response = await apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=100&status=enabled", {
      token: getAccessToken()
    });
    setUsers(response.data.items);
  }, []);

  const loadLogs = useCallback(async (alertId: string) => {
    const response = await apiRequest<AlertLogRow[]>(`/iot/alerts/${alertId}/logs`, {
      token: getAccessToken()
    });
    setLogs(response.data);
  }, []);

  useEffect(() => {
    void Promise.all([loadDicts(), loadDevices(), loadUsers()]).catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadDevices, loadUsers]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  const realtime = useIotRealtime({
    enabled: realtimeTopics.length > 0,
    topics: realtimeTopics,
    onEvent: (event) => {
      if (!["alert.created", "alert.updated", "iot.alert.created", "iot.alert.updated"].includes(event.event)) return;
      const isCreated = event.event === "alert.created" || event.event === "iot.alert.created";
      const messageText = isCreated ? "收到新设备告警，列表已刷新" : "告警状态已实时更新";
      setMessage(messageText);
      if (viewing?.id && event.alert_id === viewing.id) {
        void reloadAfterAction(viewing.id).catch((error: Error) => setMessage(error.message));
        return;
      }
      const nextPage = isCreated ? 1 : pageData.page;
      void load(nextPage).catch((error: Error) => setMessage(error.message));
    }
  });

  async function openDetail(row: AlertRow) {
    const response = await apiRequest<AlertRow>(`/iot/alerts/${row.id}`, { token: getAccessToken() });
    setViewing(response.data);
    setWorkOrderForm(buildDefaultWorkOrderForm(response.data, priorityItems, urgencyItems));
    await loadLogs(row.id);
  }

  function closeDrawer() {
    setViewing(null);
    setLogs([]);
    setWorkOrderForm(emptyWorkOrderForm);
  }

  async function acknowledge(row: AlertRow) {
    await apiRequest<AlertRow>(`/iot/alerts/${row.id}/acknowledge`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-alert-acknowledge"),
      body: { content: "告警已确认" }
    });
    setMessage("告警已确认");
    await reloadAfterAction(row.id);
  }

  async function processAlert(row: AlertRow) {
    await apiRequest<AlertRow>(`/iot/alerts/${row.id}/process`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-alert-process"),
      body: { content: "告警进入处理" }
    });
    setMessage("告警已进入处理");
    await reloadAfterAction(row.id);
  }

  async function closeAlert(row: AlertRow) {
    const closeReason = window.prompt("请输入关闭原因");
    if (!closeReason?.trim()) return;
    await apiRequest<AlertRow>(`/iot/alerts/${row.id}/close`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-alert-close"),
      body: { close_reason: closeReason.trim() }
    });
    setMessage("告警已关闭");
    await reloadAfterAction(row.id);
  }

  async function ignoreAlert(row: AlertRow) {
    const reason = window.prompt("请输入忽略原因");
    if (!reason?.trim()) {
      setMessage("忽略原因不能为空");
      return;
    }
    await apiRequest<AlertRow>(`/iot/alerts/${row.id}/ignore`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-alert-ignore"),
      body: { ignore_reason: reason.trim() }
    });
    setMessage("告警已忽略");
    await reloadAfterAction(row.id);
  }

  async function createWorkOrder(row: AlertRow) {
    const title = workOrderForm.title.trim();
    const priority = workOrderForm.priority.trim();
    const urgency = workOrderForm.urgency.trim();
    const description = workOrderForm.description.trim();
    if (!title || !priority || !urgency || !description) {
      setMessage("工单标题、优先级、紧急程度和描述不能为空");
      return;
    }
    const response = await apiRequest<{ alert: AlertRow; work_order: { id: string; woCode?: string; wo_code?: string } }>(
      `/iot/alerts/${row.id}/create-work-order`,
      {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("iot-alert-create-work-order"),
        body: {
          title,
          priority,
          urgency,
          assignee_id: workOrderForm.assigneeId || undefined,
          description
        }
      }
    );
    setViewing(response.data.alert);
    setWorkOrderForm(buildDefaultWorkOrderForm(response.data.alert, priorityItems, urgencyItems));
    setMessage(`已生成工单 ${response.data.work_order.woCode ?? response.data.work_order.wo_code ?? response.data.work_order.id}`);
    await load(pageData.page);
    await loadLogs(row.id);
  }

  async function reloadAfterAction(alertId: string) {
    await load(pageData.page);
    if (viewing?.id === alertId) {
      const response = await apiRequest<AlertRow>(`/iot/alerts/${alertId}`, { token: getAccessToken() });
      setViewing(response.data);
      await loadLogs(alertId);
    }
  }

  return (
    <PermissionGuard module={IOT_MODULE} permission={SYSTEM_PERMISSIONS.IOT_ALERT_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>IoT 设备告警</h1>
            <p>集中处理设备上报触发的活跃告警，支持确认、处理、关闭和忽略。</p>
          </div>
          <div className="page-actions">
            <span className={`realtime-status ${realtime.connectionState === "connected" ? "is-connected" : ""}`}>
              <span className="realtime-status-dot" />
              实时：{formatRealtimeState(realtime.connectionState)}
            </span>
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="告警编号 / 标题 / 设备 / 指标" />
          </Field>
          <DeviceSelect label="设备" value={filters.deviceId} devices={devices} allLabel="全部设备" onChange={(value) => setFilters((current) => ({ ...current, deviceId: value }))} />
          <SelectField label="告警级别" value={filters.alertLevel} items={alertLevels} allLabel="全部级别" onChange={(value) => setFilters((current) => ({ ...current, alertLevel: value }))} />
          <SelectField label="告警状态" value={filters.status} items={alertStatuses} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <Field label="开始时间">
            <input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} />
          </Field>
          <Field label="结束时间">
            <input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} />
          </Field>
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">告警列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>告警编号</th>
                <th>告警标题</th>
                <th>设备</th>
                <th>指标</th>
                <th>触发值</th>
                <th>级别</th>
                <th>状态</th>
                <th>首次触发</th>
                <th>最近触发</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.alertCode}</td>
                  <td>
                    <strong>{row.alertTitle}</strong>
                    <p className="muted-text">{row.alertContent ?? "-"}</p>
                  </td>
                  <td>{row.deviceCode} {row.deviceName}</td>
                  <td>{row.metricCode}</td>
                  <td>{row.triggerValue ?? "-"}</td>
                  <td><StatusPill dictCode="iot_alert_level" value={row.alertLevel} dicts={dicts} /></td>
                  <td><StatusPill dictCode="iot_alert_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDateTime(row.firstTriggerTime)}</td>
                  <td>{formatDateTime(row.lastTriggerTime)}</td>
                  <td>
                    <DataTableActions>
                      <button className="table-action-button" type="button" onClick={() => void openDetail(row).catch((error: Error) => setMessage(error.message))}>
                        <Eye size={16} />
                        查看
                      </button>
                      {isActive(row.status) ? (
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_ALERT_ACKNOWLEDGE} type="button" onClick={() => void acknowledge(row).catch((error: Error) => setMessage(error.message))}>
                          <CheckCircle2 size={16} />
                          确认
                        </PermissionButton>
                      ) : null}
                      {isAcknowledged(row.status) ? (
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_ALERT_PROCESS} type="button" onClick={() => void processAlert(row).catch((error: Error) => setMessage(error.message))}>
                          <CircleDot size={16} />
                          处理
                        </PermissionButton>
                      ) : null}
                      {isProcessing(row.status) ? (
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_ALERT_CLOSE} type="button" onClick={() => void closeAlert(row).catch((error: Error) => setMessage(error.message))}>
                          <XCircle size={16} />
                          关闭
                        </PermissionButton>
                      ) : null}
                      {canIgnore(row.status) ? (
                        <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.IOT_ALERT_IGNORE} type="button" onClick={() => void ignoreAlert(row).catch((error: Error) => setMessage(error.message))}>
                          <ShieldOff size={16} />
                          忽略
                        </PermissionButton>
                      ) : null}
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={10}><EmptyState /></td></tr> : null}
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

        {viewing ? (
          <Drawer size="lg" onClose={closeDrawer}>
            <DrawerHeader
              eyebrow="IoT 告警详情"
              title={viewing.alertTitle}
              description={`${viewing.alertCode} · ${viewing.deviceCode} ${viewing.deviceName} · ${viewing.metricCode}`}
              onClose={closeDrawer}
            />
            <div className="drawer-body">
              <div className="detail-grid compact">
                <DrawerDetailItem label="告警级别" value={<StatusPill dictCode="iot_alert_level" value={viewing.alertLevel} dicts={dicts} />} />
                <DrawerDetailItem label="当前状态" value={<StatusPill dictCode="iot_alert_status" value={viewing.status} dicts={dicts} />} />
                <DrawerDetailItem label="触发值" value={viewing.triggerValue ?? "-"} />
                <DrawerDetailItem label="阈值" value={viewing.thresholdValue ?? "-"} />
                <DrawerDetailItem label="首次触发" value={formatDateTime(viewing.firstTriggerTime)} />
                <DrawerDetailItem label="最近触发" value={formatDateTime(viewing.lastTriggerTime)} />
                <DrawerDetailItem label="确认人" value={viewing.acknowledgeByName ?? "-"} />
                <DrawerDetailItem label="确认时间" value={formatDateTime(viewing.acknowledgeTime)} />
                <DrawerDetailItem label="处理人" value={viewing.handleByName ?? "-"} />
                <DrawerDetailItem label="处理时间" value={formatDateTime(viewing.handleTime)} />
                <DrawerDetailItem label="关闭人" value={viewing.closeByName ?? "-"} />
                <DrawerDetailItem label="关闭时间" value={formatDateTime(viewing.closeTime)} />
              </div>

              <Card className="sub-panel">
                <h3 className="panel-title">告警内容</h3>
                <p>{viewing.alertContent ?? "-"}</p>
                {viewing.handleNote ? <p className="muted-text">处理说明：{viewing.handleNote}</p> : null}
                {viewing.closeReason ? <p className="muted-text">关闭原因：{viewing.closeReason}</p> : null}
              </Card>

              <Card className="sub-panel">
                <h3 className="panel-title">触发载荷</h3>
                <pre className="code-preview">{formatPayload(viewing.triggerPayload)}</pre>
              </Card>

              <Card className="sub-panel">
                <div className="task-item">
                  <h3 className="panel-title">转工单</h3>
                  {viewing.workOrderId ? <span className="muted-text">已关联工单：{viewing.workOrderId}</span> : null}
                </div>
                {!viewing.workOrderId && canCreateWorkOrder(viewing.status) ? (
                  <PermissionGuard module="workorder" permission={SYSTEM_PERMISSIONS.WORKORDER_CREATE}>
                    <div className="drawer-form-grid compact">
                      <Field label="工单标题">
                        <input
                          value={workOrderForm.title}
                          onChange={(event) => setWorkOrderForm((current) => ({ ...current, title: event.target.value }))}
                        />
                      </Field>
                      <SelectField
                        label="优先级"
                        value={workOrderForm.priority}
                        items={priorityItems}
                        allLabel="请选择优先级"
                        onChange={(value) => setWorkOrderForm((current) => ({ ...current, priority: value }))}
                      />
                      <SelectField
                        label="紧急程度"
                        value={workOrderForm.urgency}
                        items={urgencyItems}
                        allLabel="请选择紧急程度"
                        onChange={(value) => setWorkOrderForm((current) => ({ ...current, urgency: value }))}
                      />
                      <Field label="处理人">
                        <select
                          value={workOrderForm.assigneeId}
                          onChange={(event) => setWorkOrderForm((current) => ({ ...current, assigneeId: event.target.value }))}
                        >
                          <option value="">暂不指定</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>{userLabel(user)}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <Field label="工单描述">
                      <textarea
                        rows={4}
                        value={workOrderForm.description}
                        onChange={(event) => setWorkOrderForm((current) => ({ ...current, description: event.target.value }))}
                      />
                    </Field>
                    <PermissionButton
                      className="primary-button"
                      permission={SYSTEM_PERMISSIONS.IOT_ALERT_CREATE_WORKORDER}
                      type="button"
                      onClick={() => void createWorkOrder(viewing).catch((error: Error) => setMessage(error.message))}
                    >
                      <Wrench size={16} />
                      生成工单
                    </PermissionButton>
                  </PermissionGuard>
                ) : null}
                {!viewing.workOrderId && !canCreateWorkOrder(viewing.status) ? (
                  <p className="muted-text">已关闭或已忽略告警不能转为工单。</p>
                ) : null}
              </Card>

              <Card className="sub-panel">
                <div className="task-item">
                  <h3 className="panel-title">告警日志</h3>
                  <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.IOT_ALERT_LOG_READ} type="button" onClick={() => void loadLogs(viewing.id).catch((error: Error) => setMessage(error.message))}>
                    <ListChecks size={16} />
                    刷新日志
                  </PermissionButton>
                </div>
                <div className="timeline-list">
                  {logs.map((log) => (
                    <div className="timeline-item" key={log.id}>
                      <div>
                        <strong>{formatAction(log.action)}</strong>
                        <span>{formatDateTime(log.opTime)}</span>
                      </div>
                      <p>{log.operatorName ?? "系统"} · {log.content ?? log.reason ?? "-"}</p>
                      <p className="muted-text">{log.beforeStatus ?? "-"} → {log.afterStatus ?? "-"}</p>
                    </div>
                  ))}
                  {logs.length === 0 ? <div className="empty-state">暂无告警日志</div> : null}
                </div>
              </Card>
            </div>
          </Drawer>
        ) : null}
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
        {items.map((item) => (
          <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
        ))}
      </select>
    </Field>
  );
}

function DeviceSelect({
  label,
  value,
  devices,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  devices: DeviceRow[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {devices.map((item) => (
          <option key={item.id} value={item.id}>{item.deviceCode} {item.deviceName}</option>
        ))}
      </select>
    </Field>
  );
}

function DrawerDetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatPayload(value: Record<string, unknown>) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
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

function formatAction(action: string) {
  const map: Record<string, string> = {
    create: "创建告警",
    trigger: "再次触发",
    acknowledge: "确认告警",
    process: "进入处理",
    close: "关闭告警",
    ignore: "忽略告警",
    create_workorder: "转工单"
  };
  return map[action] ?? action;
}

function isActive(status: string) {
  return status === "active" || status === "10";
}

function isAcknowledged(status: string) {
  return status === "acknowledged" || status === "20";
}

function isProcessing(status: string) {
  return status === "processing" || status === "30";
}

function canIgnore(status: string) {
  return isActive(status) || isAcknowledged(status);
}

function isClosed(status: string) {
  return status === "closed" || status === "40";
}

function isIgnored(status: string) {
  return status === "ignored" || status === "90";
}

function canCreateWorkOrder(status: string) {
  return !isClosed(status) && !isIgnored(status);
}

function buildDefaultWorkOrderForm(row: AlertRow, priorities: DictItemRow[], urgencies: DictItemRow[]): WorkOrderForm {
  const priority = priorities.find((item) => item.itemValue === "high")?.itemValue ?? priorities[0]?.itemValue ?? "high";
  const urgency = urgencies.find((item) => item.itemValue === "urgent")?.itemValue ?? urgencies[0]?.itemValue ?? "urgent";
  return {
    title: `${row.deviceName || row.deviceCode} 告警处理工单`,
    priority,
    urgency,
    assigneeId: "",
    description: [
      row.alertContent ?? row.alertTitle,
      `告警编号：${row.alertCode}`,
      `设备：${row.deviceCode} ${row.deviceName}`,
      `指标：${row.metricCode}`,
      `触发值：${row.triggerValue ?? "-"}`
    ].join("\n")
  };
}

function userLabel(user: UserRow) {
  return user.displayName ?? user.realName ?? user.username;
}

function EmptyState() {
  return <div className="empty-state">暂无设备告警</div>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <div className="empty-state">
          <BellRing size={18} />
          无权限访问 IoT 设备告警
        </div>
      </Card>
    </main>
  );
}
