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
  StatusPill
} from "@jinhu/ui";
import { Bot, Eye, Play, Plus, RefreshCw, Route, Save, Search, Settings2 } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const ROBOT_MODULE = "robot";
const emptyPage: PaginatedResult<RobotRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyConfigForm: EzvizConfigForm = {
  config_name: "萤石清洁机器人",
  app_key: "",
  app_secret: "",
  api_base_url: "https://open.ys7.com",
  callback_token: "",
  status: "enabled",
  remark: ""
};
const emptySyncForm: EzvizSyncForm = {
  device_serial: "",
  validate_code: "",
  device_name: "",
  location: "",
  remark: ""
};

interface RobotRow {
  id: string;
  deviceCode: string;
  deviceName: string;
  onlineStatus: string;
  status: string;
  vendorDeviceId: string | null;
  platformType: string | null;
  model: string | null;
  location: string | null;
  buildingId: string | null;
  unitId: string | null;
  lastDataTime: string | null;
  statusPayload: Record<string, unknown>;
}

interface RobotLogRow {
  id: string;
  command: string;
  status: string;
  errorMessage: string | null;
  operatorName: string | null;
  opTime: string;
}

interface EzvizConfigRow {
  id: string;
  configName: string;
  status: string;
  hasAppKey: boolean;
  hasAppSecret: boolean;
  hasAccessToken: boolean;
  tokenExpireAt: number | null;
  remark: string | null;
  updateTime: string;
}

interface EzvizConfigForm {
  config_name: string;
  app_key: string;
  app_secret: string;
  api_base_url: string;
  callback_token: string;
  status: string;
  remark: string;
}

interface EzvizPlatformDeviceRow {
  deviceSerial: string;
  deviceName: string | null;
  deviceType: string | null;
  model: string | null;
  status: string | null;
  isSynced: boolean;
  robotId: string | null;
}

interface EzvizSyncForm {
  device_serial: string;
  validate_code: string;
  device_name: string;
  location: string;
  remark: string;
}

interface Filters {
  keyword: string;
  onlineStatus: string;
}

export default function CleaningRobotsPage() {
  const [pageData, setPageData] = useState<PaginatedResult<RobotRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>({ keyword: "", onlineStatus: "" });
  const [message, setMessage] = useState("");
  const [viewing, setViewing] = useState<RobotRow | null>(null);
  const [logs, setLogs] = useState<RobotLogRow[]>([]);
  const [configs, setConfigs] = useState<EzvizConfigRow[]>([]);
  const [platformDevices, setPlatformDevices] = useState<EzvizPlatformDeviceRow[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState<EzvizConfigForm>(emptyConfigForm);
  const [syncOpen, setSyncOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [syncForm, setSyncForm] = useState<EzvizSyncForm>(emptySyncForm);
  const [commandTarget, setCommandTarget] = useState<RobotRow | null>(null);
  const [command, setCommand] = useState("start");
  const [cleanMode, setCleanMode] = useState("dustAbsorption");
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.onlineStatus) params.set("online_status", filters.onlineStatus);
    const response = await apiRequest<PaginatedResult<RobotRow>>(`/robots/cleaning?${params.toString()}`, { token: getAccessToken() });
    setPageData(response.data);
  }, [filters]);

  const loadConfigs = useCallback(async () => {
    const response = await apiRequest<EzvizConfigRow[]>("/robots/cleaning/ezviz-configs", { token: getAccessToken() });
    setConfigs(response.data);
  }, []);

  const loadPlatformDevices = useCallback(async () => {
    const response = await apiRequest<EzvizPlatformDeviceRow[]>("/robots/cleaning/ezviz-devices", { token: getAccessToken() });
    setPlatformDevices(response.data);
  }, []);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    void loadConfigs().catch((error: Error) => setMessage(error.message));
  }, [loadConfigs]);

  async function openDetail(row: RobotRow) {
    setViewing(row);
    const response = await apiRequest<PaginatedResult<RobotLogRow>>(`/robots/cleaning/${row.id}/command-logs?page=1&page_size=20`, {
      token: getAccessToken()
    });
    setLogs(response.data.items);
  }

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiRequest<EzvizConfigRow>("/robots/cleaning/ezviz-configs", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("robot-ezviz-config"),
      body: {
        config_name: configForm.config_name.trim(),
        app_key: configForm.app_key.trim(),
        app_secret: configForm.app_secret.trim(),
        api_base_url: configForm.api_base_url.trim() || undefined,
        callback_token: configForm.callback_token.trim() || undefined,
        status: configForm.status,
        remark: configForm.remark.trim() || undefined
      }
    });
    setMessage("萤石平台配置已保存，密钥不会明文回显");
    setConfigOpen(false);
    setConfigForm(emptyConfigForm);
    await loadConfigs();
  }

  async function syncEzvizDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiRequest<RobotRow>("/robots/cleaning/ezviz-devices/sync", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("robot-ezviz-sync"),
      body: {
        device_serial: syncForm.device_serial.trim(),
        device_name: syncForm.device_name.trim() || undefined,
        location: syncForm.location.trim() || undefined,
        remark: syncForm.remark.trim() || undefined
      }
    });
    setMessage("萤石设备已同步为本系统清洁机器人");
    closeSyncDrawer();
    await Promise.all([load(pageData.page), loadPlatformDevices()]);
  }

  async function addEzvizDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiRequest<RobotRow>("/robots/cleaning/ezviz-devices/add", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("robot-ezviz-add"),
      body: {
        device_serial: syncForm.device_serial.trim(),
        validate_code: syncForm.validate_code.trim(),
        device_name: syncForm.device_name.trim() || undefined,
        location: syncForm.location.trim() || undefined,
        remark: syncForm.remark.trim() || undefined
      }
    });
    setMessage("萤石设备已添加并同步到本系统");
    closeSyncDrawer();
    await Promise.all([load(pageData.page), loadPlatformDevices()]);
  }

  async function refreshRobotInfo(row: RobotRow) {
    await apiRequest<RobotRow>(`/robots/cleaning/${row.id}/sync-info`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("robot-ezviz-refresh")
    });
    setMessage("机器人萤石详情已刷新");
    await load(pageData.page);
  }

  async function runQueryTask(row: RobotRow) {
    const response = await apiRequest<unknown>(`/robots/cleaning/${row.id}/query-task`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("robot-query-task")
    });
    setMessage(`任务查询成功：${JSON.stringify(response.data).slice(0, 160)}`);
    await openDetail(row);
  }

  async function runControl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commandTarget) return;
    await apiRequest<unknown>(`/robots/cleaning/${commandTarget.id}/clean-control`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("robot-clean-control"),
      body: { command }
    });
    if (cleanMode.trim()) {
      await apiRequest<unknown>(`/robots/cleaning/${commandTarget.id}/set-clean-mode`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("robot-clean-mode"),
        body: { mode: cleanMode }
      });
    }
    setMessage("机器人控制指令已下发");
    setCommandTarget(null);
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={ROBOT_MODULE} permission={SYSTEM_PERMISSIONS.ROBOT_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>清洁机器人</h1>
            <p>接入萤石商用清洁机器人，支持任务查询、清扫控制、清洁模式设置和回调数据归集。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE} type="button" onClick={() => setConfigOpen(true)}>
              <Settings2 size={16} />
              萤石配置
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="机器人编码 / 名称 / 厂家设备号" />
          </Field>
          <Field label="在线状态">
            <select value={filters.onlineStatus} onChange={(event) => setFilters((current) => ({ ...current, onlineStatus: event.target.value }))}>
              <option value="">全部</option>
              <option value="online">在线</option>
              <option value="offline">离线</option>
              <option value="unknown">未知</option>
            </select>
          </Field>
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <div>
              <h2 className="panel-title">萤石设备同步</h2>
              <p className="muted-text">仅读取可识别的清洁机器人候选设备；摄像头、NVR 等监控设备请进入视频安防模块管理。</p>
            </div>
            <span>
              <button className="secondary-button" type="button" onClick={() => void loadPlatformDevices().catch((error: Error) => setMessage(error.message))}>
                <RefreshCw size={16} />
                读取设备
              </button>
              <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE} type="button" onClick={() => {
                setSyncForm(emptySyncForm);
                setAddOpen(true);
              }}>
                <Plus size={16} />
                添加设备
              </PermissionButton>
            </span>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>萤石序列号</th>
                <th>设备名称</th>
                <th>型号</th>
                <th>平台状态</th>
                <th>同步状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {platformDevices.map((row) => (
                <tr key={row.deviceSerial}>
                  <td>{row.deviceSerial}</td>
                  <td>{row.deviceName ?? "-"}</td>
                  <td>{row.model ?? row.deviceType ?? "-"}</td>
                  <td>{row.status ?? "-"}</td>
                  <td><StatusPill variant={row.isSynced ? "success" : "warning"}>{row.isSynced ? "已同步" : "未同步"}</StatusPill></td>
                  <td>
                    <DataTableActions>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE} type="button" onClick={() => openSyncDrawer(row)}>
                        <Save size={16} />
                        同步
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {platformDevices.length === 0 ? <tr><td colSpan={6}><p className="muted-text">暂无清洁机器人候选设备。若机器人未显示，请使用设备序列号和验证码添加。</p></td></tr> : null}
            </tbody>
          </DataTable>
        </Card>

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">机器人列表</h2>
            <span>共 {pageData.total} 台</span>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>设备编码</th>
                <th>机器人名称</th>
                <th>厂家设备号</th>
                <th>型号</th>
                <th>位置</th>
                <th>在线状态</th>
                <th>最近数据</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.deviceCode}</td>
                  <td>{row.deviceName}</td>
                  <td>{row.vendorDeviceId ?? "-"}</td>
                  <td>{row.model ?? "-"}</td>
                  <td>{row.location ?? "-"}</td>
                  <td><RobotStatus status={row.onlineStatus} /></td>
                  <td>{formatDateTime(row.lastDataTime)}</td>
                  <td>
                    <DataTableActions>
                      <button className="table-action-button" type="button" onClick={() => void openDetail(row).catch((error: Error) => setMessage(error.message))}>
                        <Eye size={16} />
                        详情
                      </button>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ROBOT_CONTROL} type="button" onClick={() => void runQueryTask(row).catch((error: Error) => setMessage(error.message))}>
                        <Route size={16} />
                        任务
                      </PermissionButton>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ROBOT_CONTROL} type="button" onClick={() => setCommandTarget(row)}>
                        <Play size={16} />
                        控制
                      </PermissionButton>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE} type="button" onClick={() => void refreshRobotInfo(row).catch((error: Error) => setMessage(error.message))}>
                        <RefreshCw size={16} />
                        同步详情
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={8}><EmptyState /></td></tr> : null}
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

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">萤石平台配置</h2>
            <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE} type="button" onClick={() => setConfigOpen(true)}>
              <Plus size={16} />
              新增 / 更新
            </PermissionButton>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>配置名称</th>
                <th>状态</th>
                <th>AppKey</th>
                <th>AppSecret</th>
                <th>Token</th>
                <th>过期时间</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((row) => (
                <tr key={row.id}>
                  <td>{row.configName}</td>
                  <td><StatusPill variant={row.status === "enabled" ? "success" : "muted"}>{row.status}</StatusPill></td>
                  <td>{row.hasAppKey ? "已配置" : "未配置"}</td>
                  <td>{row.hasAppSecret ? "已配置" : "未配置"}</td>
                  <td>{row.hasAccessToken ? "已缓存" : "未缓存"}</td>
                  <td>{row.tokenExpireAt ? new Date(row.tokenExpireAt).toLocaleString("zh-CN", { hour12: false }) : "-"}</td>
                  <td>{formatDateTime(row.updateTime)}</td>
                </tr>
              ))}
              {configs.length === 0 ? <tr><td colSpan={7}><p className="muted-text">暂无萤石平台配置</p></td></tr> : null}
            </tbody>
          </DataTable>
        </Card>

        {viewing ? (
          <Drawer size="md" onClose={() => setViewing(null)}>
            <DrawerHeader
              eyebrow="机器人详情"
              title={viewing.deviceName}
              description={`${viewing.deviceCode} · ${viewing.vendorDeviceId ?? "未绑定厂家设备号"}`}
              onClose={() => setViewing(null)}
            />
            <DrawerDetailGrid>
              <DrawerDetailItem label="设备编码" value={viewing.deviceCode} />
              <DrawerDetailItem label="在线状态" value={<RobotStatus status={viewing.onlineStatus} />} />
              <DrawerDetailItem label="厂家设备号" value={viewing.vendorDeviceId ?? "-"} />
              <DrawerDetailItem label="型号" value={viewing.model ?? "-"} />
              <DrawerDetailItem label="位置" value={viewing.location ?? "-"} />
              <DrawerDetailItem label="最近数据" value={formatDateTime(viewing.lastDataTime)} />
            </DrawerDetailGrid>
            <div className="page-content">
              <h2 className="panel-title">最近命令</h2>
              <DataTable>
                <thead>
                  <tr>
                    <th>命令</th>
                    <th>状态</th>
                    <th>操作人</th>
                    <th>时间</th>
                    <th>错误</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.command}</td>
                      <td><StatusPill variant={log.status === "success" ? "success" : "danger"}>{log.status}</StatusPill></td>
                      <td>{log.operatorName ?? "-"}</td>
                      <td>{formatDateTime(log.opTime)}</td>
                      <td>{log.errorMessage ?? "-"}</td>
                    </tr>
                  ))}
                  {logs.length === 0 ? <tr><td colSpan={5}><p className="muted-text">暂无命令日志</p></td></tr> : null}
                </tbody>
              </DataTable>
            </div>
          </Drawer>
        ) : null}

        {configOpen ? (
          <Drawer size="md" onClose={() => setConfigOpen(false)}>
            <DrawerHeader
              eyebrow="萤石开放平台"
              title="清洁机器人平台配置"
              description="AppKey、AppSecret 和回调 Token 会加密保存，前端不会回显明文。"
              onClose={() => setConfigOpen(false)}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void saveConfig(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="配置名称">
                  <input required value={configForm.config_name} onChange={(event) => setConfigFormValue("config_name", event.target.value)} />
                </Field>
                <Field label="API Base URL">
                  <input value={configForm.api_base_url} onChange={(event) => setConfigFormValue("api_base_url", event.target.value)} />
                </Field>
                <Field label="AppKey">
                  <input required value={configForm.app_key} onChange={(event) => setConfigFormValue("app_key", event.target.value)} />
                </Field>
                <Field label="AppSecret">
                  <input required type="password" value={configForm.app_secret} onChange={(event) => setConfigFormValue("app_secret", event.target.value)} />
                </Field>
                <Field label="回调 Token">
                  <input type="password" value={configForm.callback_token} onChange={(event) => setConfigFormValue("callback_token", event.target.value)} placeholder="用于验证萤石回调" />
                </Field>
                <Field label="状态">
                  <select value={configForm.status} onChange={(event) => setConfigFormValue("status", event.target.value)}>
                    <option value="enabled">启用</option>
                    <option value="disabled">停用</option>
                  </select>
                </Field>
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="备注">
                  <textarea value={configForm.remark} onChange={(event) => setConfigFormValue("remark", event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setConfigOpen(false)}>取消</button>
                <button className="primary-button" type="submit"><Save size={16} />保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {syncOpen ? (
          <Drawer size="md" onClose={closeSyncDrawer}>
            <DrawerHeader
              eyebrow="萤石设备同步"
              title="同步为清洁机器人"
              description="同步后会创建或更新本系统 IoT 设备台账中的清洁机器人。"
              onClose={closeSyncDrawer}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void syncEzvizDevice(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="萤石设备序列号">
                  <input required value={syncForm.device_serial} onChange={(event) => setSyncFormValue("device_serial", event.target.value)} />
                </Field>
                <Field label="机器人名称">
                  <input value={syncForm.device_name} onChange={(event) => setSyncFormValue("device_name", event.target.value)} placeholder="留空则使用萤石设备名称" />
                </Field>
                <Field label="安装位置">
                  <input value={syncForm.location} onChange={(event) => setSyncFormValue("location", event.target.value)} placeholder="例如：1号楼大厅" />
                </Field>
                <Field label="备注">
                  <textarea value={syncForm.remark} onChange={(event) => setSyncFormValue("remark", event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeSyncDrawer}>取消</button>
                <button className="primary-button" type="submit"><Save size={16} />同步</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {addOpen ? (
          <Drawer size="md" onClose={closeSyncDrawer}>
            <DrawerHeader
              eyebrow="萤石开放平台"
              title="添加并同步设备"
              description="用于现场机器人还没有加入当前萤石账号的情况。"
              onClose={closeSyncDrawer}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void addEzvizDevice(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="萤石设备序列号">
                  <input required value={syncForm.device_serial} onChange={(event) => setSyncFormValue("device_serial", event.target.value)} />
                </Field>
                <Field label="设备验证码">
                  <input required type="password" value={syncForm.validate_code} onChange={(event) => setSyncFormValue("validate_code", event.target.value)} />
                </Field>
                <Field label="机器人名称">
                  <input value={syncForm.device_name} onChange={(event) => setSyncFormValue("device_name", event.target.value)} />
                </Field>
                <Field label="安装位置">
                  <input value={syncForm.location} onChange={(event) => setSyncFormValue("location", event.target.value)} />
                </Field>
                <Field label="备注">
                  <textarea value={syncForm.remark} onChange={(event) => setSyncFormValue("remark", event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeSyncDrawer}>取消</button>
                <button className="primary-button" type="submit"><Plus size={16} />添加并同步</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {commandTarget ? (
          <Drawer size="md" onClose={() => setCommandTarget(null)}>
            <DrawerHeader
              eyebrow="机器人控制"
              title={commandTarget.deviceName}
              description="控制指令会直接调用萤石开放平台，请谨慎操作。"
              onClose={() => setCommandTarget(null)}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void runControl(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="控制命令">
                  <select value={command} onChange={(event) => setCommand(event.target.value)}>
                    <option value="start">开始清扫</option>
                    <option value="pause">暂停清扫</option>
                    <option value="stop">停止清扫</option>
                    <option value="return_charge">回充</option>
                  </select>
                </Field>
                <Field label="清洁模式">
                  <select value={cleanMode} onChange={(event) => setCleanMode(event.target.value)}>
                    <option value="dustAbsorption">吸尘</option>
                    <option value="mop">拖地</option>
                    <option value="sweepMop">扫拖</option>
                  </select>
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setCommandTarget(null)}>取消</button>
                <button className="primary-button" type="submit"><Bot size={16} />下发</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );

  function setConfigFormValue<K extends keyof EzvizConfigForm>(key: K, value: EzvizConfigForm[K]) {
    setConfigForm((current) => ({ ...current, [key]: value }));
  }

  function setSyncFormValue<K extends keyof EzvizSyncForm>(key: K, value: EzvizSyncForm[K]) {
    setSyncForm((current) => ({ ...current, [key]: value }));
  }

  function openSyncDrawer(row: EzvizPlatformDeviceRow) {
    setSyncForm({
      ...emptySyncForm,
      device_serial: row.deviceSerial,
      device_name: row.deviceName ?? ""
    });
    setSyncOpen(true);
  }

  function closeSyncDrawer() {
    setSyncOpen(false);
    setAddOpen(false);
    setSyncForm(emptySyncForm);
  }
}

function RobotStatus({ status }: { status: string }) {
  if (status === "online") return <StatusPill variant="success">在线</StatusPill>;
  if (status === "offline") return <StatusPill variant="danger">离线</StatusPill>;
  return <StatusPill variant="muted">{status || "未知"}</StatusPill>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function EmptyState() {
  return <p className="muted-text">暂无清洁机器人。请先配置萤石开放平台，然后在“萤石设备同步”中读取并同步现场机器人。</p>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <h1>403</h1>
        <p>无权访问机器人运营，或当前租户未启用 robot 模块。</p>
      </Card>
    </main>
  );
}
