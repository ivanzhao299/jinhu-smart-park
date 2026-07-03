"use client";

import {
  ActionGroup,
  ContentCard,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  EmptyState,
  FeedbackNotice,
  FilterPanel,
  MetricCard,
  PageHeader,
  PageShell,
  PaginationBar,
  StatusPill
} from "@jinhu/ui";
import { Activity, AlertTriangle, Bot, Eye, Map, Play, Plus, RefreshCw, Route, Save, Search, Settings2, Wrench } from "lucide-react";
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
  access_token: "",
  token_expire_at: "",
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
const defaultRegionPayload = JSON.stringify({
  regions: [
    {
      region_id: "room-1",
      clean_mode: "dustAbsorption"
    }
  ]
}, null, 2);
const defaultTempRegionPayload = JSON.stringify({
  temp_region: {
    left: 0,
    top: 0,
    right: 1000,
    bottom: 1000
  },
  clean_times: 1
}, null, 2);

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
  access_token: string;
  token_expire_at: string;
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

type AdvancedActionKind = "path" | "region" | "temp";

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
  const [lastCommandResult, setLastCommandResult] = useState<{ title: string; data: unknown } | null>(null);
  const [advancedTarget, setAdvancedTarget] = useState<RobotRow | null>(null);
  const [advancedKind, setAdvancedKind] = useState<AdvancedActionKind>("path");
  const [mapId, setMapId] = useState("");
  const [regionPayload, setRegionPayload] = useState(defaultRegionPayload);
  const [tempRegionPayload, setTempRegionPayload] = useState(defaultTempRegionPayload);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const robotSummary = useMemo(() => buildRobotSummary(pageData.items), [pageData.items]);

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
    const detail = await apiRequest<RobotRow>(`/robots/cleaning/${row.id}`, { token: getAccessToken() });
    setViewing(detail.data);
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
        access_token: configForm.access_token.trim() || undefined,
        token_expire_at: configForm.token_expire_at.trim() || undefined,
        status: configForm.status,
        remark: configForm.remark.trim() || undefined
      }
    });
    setMessage("萤石平台配置已保存，密钥不会明文回显");
    setConfigOpen(false);
    setConfigForm(emptyConfigForm);
    await loadConfigs();
  }

  async function refreshEzvizToken(row: EzvizConfigRow) {
    const response = await apiRequest<EzvizConfigRow>(`/robots/cleaning/ezviz-configs/${row.id}/refresh-token`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("robot-ezviz-refresh-token")
    });
    setMessage(`萤石 AccessToken 已刷新，有效期至 ${response.data.tokenExpireAt ? new Date(response.data.tokenExpireAt).toLocaleString("zh-CN", { hour12: false }) : "未知"}`);
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
    setLastCommandResult({ title: "当前任务查询结果", data: response.data });
    setMessage("任务查询成功，已刷新机器人当前任务快照");
    await Promise.all([load(pageData.page), openDetail(row)]);
  }

  async function runControl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commandTarget) return;
    const controlResponse = await apiRequest<unknown>(`/robots/cleaning/${commandTarget.id}/clean-control`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("robot-clean-control"),
      body: { command }
    });
    const results: Record<string, unknown> = { clean_control: controlResponse.data };
    if (cleanMode.trim()) {
      const modeResponse = await apiRequest<unknown>(`/robots/cleaning/${commandTarget.id}/set-clean-mode`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("robot-clean-mode"),
        body: { mode: cleanMode }
      });
      results.set_clean_mode = modeResponse.data;
    }
    setLastCommandResult({ title: "控制指令回执", data: results });
    setMessage("机器人控制指令已下发");
    const target = commandTarget;
    setCommandTarget(null);
    await Promise.all([load(pageData.page), openDetail(target)]);
  }

  async function queryPath(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!advancedTarget) return;
    const response = await apiRequest<unknown>(`/robots/cleaning/${advancedTarget.id}/path?map_id=${encodeURIComponent(mapId.trim())}`, {
      token: getAccessToken()
    });
    setLastCommandResult({ title: "地图路径查询结果", data: response.data });
    setMessage("地图路径查询成功");
    await openDetail(advancedTarget);
  }

  async function startRegionClean(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!advancedTarget) return;
    const body = parseJsonObject(regionPayload);
    const response = await apiRequest<unknown>(`/robots/cleaning/${advancedTarget.id}/start-region-clean`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("robot-region-clean"),
      body
    });
    setLastCommandResult({ title: "区域清扫回执", data: response.data });
    setMessage("区域清扫指令已下发");
    setAdvancedTarget(null);
    await Promise.all([load(pageData.page), openDetail(advancedTarget)]);
  }

  async function startTempRegionClean(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!advancedTarget) return;
    const body = parseJsonObject(tempRegionPayload);
    const response = await apiRequest<unknown>(`/robots/cleaning/${advancedTarget.id}/start-temp-region-clean`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("robot-temp-region-clean"),
      body
    });
    setLastCommandResult({ title: "临时区域清扫回执", data: response.data });
    setMessage("临时区域清扫指令已下发");
    setAdvancedTarget(null);
    await Promise.all([load(pageData.page), openDetail(advancedTarget)]);
  }

  return (
    <PermissionGuard module={ROBOT_MODULE} permission={SYSTEM_PERMISSIONS.ROBOT_READ} fallback={<Forbidden />}>
      <PageShell className="robot-cleaning-page">
        <PageHeader
          title="清洁机器人"
          description="统一管理萤石商用清洁机器人，覆盖设备同步、任务查询、清扫控制、区域清洁和回调数据归集。"
          actions={
            <>
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE} type="button" onClick={() => setConfigOpen(true)}>
              <Settings2 size={16} />
              萤石配置
            </PermissionButton>
            </>
          }
        />

        <FilterPanel className="robot-filter-bar">
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
        </FilterPanel>

        {message ? (
          <FeedbackNotice variant={isTokenMessage(message) ? "warning" : "info"} icon={<AlertTriangle size={16} />}>
            {message}
          </FeedbackNotice>
        ) : null}

        <section className="dashboard-grid robot-summary-grid">
          <MetricCard className="robot-metric-card" icon={<Bot size={18} />} label="机器人总数" value={robotSummary.total} />
          <MetricCard className="robot-metric-card" icon={<Activity size={18} />} label="在线设备" value={robotSummary.online} />
          <MetricCard className="robot-metric-card" icon={<Route size={18} />} label="有任务快照" value={robotSummary.withTask} />
          <MetricCard className="robot-metric-card" icon={<AlertTriangle size={18} />} label="异常/离线" value={robotSummary.exception} />
        </section>

        <ContentCard
          className="robot-list-card"
          title="机器人列表"
          description={`共 ${pageData.total} 台，优先展示可操作机器人；摄像头、NVR 等监控设备请进入视频安防模块。`}
          actions={<StatusPill variant={robotSummary.exception > 0 ? "warning" : "success"}>{robotSummary.exception > 0 ? `${robotSummary.exception} 台需关注` : "运行正常"}</StatusPill>}
        >
          <DataTable className="robot-list-table">
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
                    <DataTableActions className="robot-row-actions">
                      <button className="table-action-button" type="button" onClick={() => void openDetail(row).catch((error: Error) => setMessage(error.message))}>
                        <Eye size={15} />
                        详情
                      </button>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ROBOT_CONTROL} type="button" onClick={() => void runQueryTask(row).catch((error: Error) => setMessage(error.message))}>
                        <Route size={15} />
                        任务
                      </PermissionButton>
                      <PermissionButton className="table-action-button table-action-button--primary" permission={SYSTEM_PERMISSIONS.ROBOT_CONTROL} type="button" onClick={() => setCommandTarget(row)}>
                        <Play size={15} />
                        控制
                      </PermissionButton>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ROBOT_CONTROL} type="button" onClick={() => openAdvancedDrawer(row, "path")}>
                        <Map size={15} />
                        区域
                      </PermissionButton>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE} type="button" onClick={() => void refreshRobotInfo(row).catch((error: Error) => setMessage(error.message))}>
                        <RefreshCw size={15} />
                        同步
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      compact
                      title="暂无清洁机器人"
                      description="请先配置萤石开放平台，然后在“萤石设备同步”中读取并同步现场机器人。"
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
          <PaginationBar
            page={pageData.page}
            totalPages={totalPages}
            total={pageData.total}
            previous={<button className="secondary-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(Math.max(1, pageData.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>}
            next={<button className="secondary-button" type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>}
          />
        </ContentCard>

        <section className="robot-setup-grid">
          <ContentCard
            className="robot-setup-card"
            title="萤石设备同步"
            description="仅读取可识别的清洁机器人候选设备；摄像头、NVR 等监控设备请进入视频安防模块管理。"
            actions={
              <ActionGroup>
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
              </ActionGroup>
            }
          >
            <DataTable className="robot-sync-table">
              <thead>
                <tr>
                  <th>萤石序列号</th>
                  <th>设备名称</th>
                  <th>型号</th>
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
                    <td><StatusPill variant={row.isSynced ? "success" : "warning"}>{row.isSynced ? "已同步" : "未同步"}</StatusPill></td>
                    <td>
                      <DataTableActions className="robot-row-actions">
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE} type="button" onClick={() => openSyncDrawer(row)}>
                          <Save size={15} />
                          同步
                        </PermissionButton>
                      </DataTableActions>
                    </td>
                  </tr>
                ))}
                {platformDevices.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState compact title="暂无清洁机器人候选设备" description="若机器人未显示，请使用设备序列号和验证码添加。" />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
          </ContentCard>

          <ContentCard
            className="robot-setup-card"
            title="萤石平台配置"
            description="密钥只保存加密态；Token 可自动刷新，也可手动刷新。"
            actions={
              <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE} type="button" onClick={() => setConfigOpen(true)}>
                <Plus size={16} />
                新增 / 更新
              </PermissionButton>
            }
          >
            <DataTable className="robot-config-table">
              <thead>
                <tr>
                  <th>配置名称</th>
                  <th>状态</th>
                  <th>凭据</th>
                  <th>Token</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((row) => (
                  <tr key={row.id}>
                    <td>{row.configName}</td>
                    <td><StatusPill variant={row.status === "enabled" ? "success" : "muted"}>{row.status}</StatusPill></td>
                    <td><CredentialFlags row={row} /></td>
                    <td><TokenState row={row} /></td>
                    <td>{formatDateTime(row.updateTime)}</td>
                    <td>
                      <DataTableActions className="robot-row-actions">
                        <PermissionButton
                          className="table-action-button"
                          permission={SYSTEM_PERMISSIONS.ROBOT_PLATFORM_CONFIG_UPDATE}
                          type="button"
                          onClick={() => void refreshEzvizToken(row).catch((error: Error) => setMessage(error.message))}
                        >
                          <RefreshCw size={15} />
                          刷新
                        </PermissionButton>
                      </DataTableActions>
                    </td>
                  </tr>
                ))}
                {configs.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState compact title="暂无萤石平台配置" />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
          </ContentCard>
        </section>

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
              <DrawerDetailItem label="任务状态" value={readTaskText(viewing, "taskStatus") ?? "-"} />
              <DrawerDetailItem label="清洁进度" value={readTaskText(viewing, "cleaningProgress") ?? "-"} />
              <DrawerDetailItem label="电量" value={readBatteryText(viewing)} />
              <DrawerDetailItem label="异常信息" value={readTaskText(viewing, "exceptionInfo") ?? "-"} />
            </DrawerDetailGrid>
            <div className="robot-command-bar">
              <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.ROBOT_CONTROL} type="button" onClick={() => void runQueryTask(viewing).catch((error: Error) => setMessage(error.message))}>
                <Route size={16} />
                查询任务
              </PermissionButton>
              <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.ROBOT_CONTROL} type="button" onClick={() => setCommandTarget(viewing)}>
                <Play size={16} />
                控制
              </PermissionButton>
              <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.ROBOT_CONTROL} type="button" onClick={() => openAdvancedDrawer(viewing, "path")}>
                <Map size={16} />
                轨迹/区域
              </PermissionButton>
            </div>
            {lastCommandResult ? (
              <section className="robot-detail-section">
                <h2 className="panel-title">{lastCommandResult.title}</h2>
                <pre className="robot-json-preview">{stringifyPreview(lastCommandResult.data)}</pre>
              </section>
            ) : null}
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
                <Field label="AccessToken">
                  <input type="password" value={configForm.access_token} onChange={(event) => setConfigFormValue("access_token", event.target.value)} placeholder="可选：从萤石开放平台复制当前 AccessToken" />
                </Field>
                <Field label="Token 过期时间">
                  <input type="datetime-local" value={configForm.token_expire_at} onChange={(event) => setConfigFormValue("token_expire_at", event.target.value)} />
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

        {advancedTarget ? (
          <Drawer size="md" onClose={() => setAdvancedTarget(null)}>
            <DrawerHeader
              eyebrow="轨迹与区域清扫"
              title={advancedTarget.deviceName}
              description="路径查询和区域清扫对应萤石商用清洁机器人文档中的地图、区域、临时区域能力。"
              onClose={() => setAdvancedTarget(null)}
            />
            <div className="robot-command-bar">
              <button className={advancedKind === "path" ? "primary-button" : "secondary-button"} type="button" onClick={() => setAdvancedKind("path")}>
                <Route size={16} />
                路径查询
              </button>
              <button className={advancedKind === "region" ? "primary-button" : "secondary-button"} type="button" onClick={() => setAdvancedKind("region")}>
                <Map size={16} />
                区域清扫
              </button>
              <button className={advancedKind === "temp" ? "primary-button" : "secondary-button"} type="button" onClick={() => setAdvancedKind("temp")}>
                <Wrench size={16} />
                临时区域
              </button>
            </div>
            {advancedKind === "path" ? (
              <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void queryPath(event).catch((error: Error) => setMessage(error.message))}>
                <DrawerFormGrid single>
                  <Field label="地图 ID">
                    <input required value={mapId} onChange={(event) => setMapId(event.target.value)} placeholder="从当前任务或地图配置中获取 mapId" />
                  </Field>
                </DrawerFormGrid>
                <DrawerFooter>
                  <button className="secondary-button" type="button" onClick={() => setAdvancedTarget(null)}>取消</button>
                  <button className="primary-button" type="submit"><Route size={16} />查询路径</button>
                </DrawerFooter>
              </DrawerForm>
            ) : null}
            {advancedKind === "region" ? (
              <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void startRegionClean(event).catch((error: Error) => setMessage(error.message))}>
                <DrawerFormGrid single>
                  <Field label="区域清扫 JSON">
                    <textarea className="robot-json-input" value={regionPayload} onChange={(event) => setRegionPayload(event.target.value)} />
                  </Field>
                </DrawerFormGrid>
                <DrawerFooter>
                  <button className="secondary-button" type="button" onClick={() => setAdvancedTarget(null)}>取消</button>
                  <button className="primary-button" type="submit"><Play size={16} />开始区域清扫</button>
                </DrawerFooter>
              </DrawerForm>
            ) : null}
            {advancedKind === "temp" ? (
              <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void startTempRegionClean(event).catch((error: Error) => setMessage(error.message))}>
                <DrawerFormGrid single>
                  <Field label="临时区域 JSON">
                    <textarea className="robot-json-input" value={tempRegionPayload} onChange={(event) => setTempRegionPayload(event.target.value)} />
                  </Field>
                </DrawerFormGrid>
                <DrawerFooter>
                  <button className="secondary-button" type="button" onClick={() => setAdvancedTarget(null)}>取消</button>
                  <button className="primary-button" type="submit"><Play size={16} />开始临时区域清扫</button>
                </DrawerFooter>
              </DrawerForm>
            ) : null}
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
              description="用于机器人还未加入当前萤石账号的情况；如设备已转移到当前账号，系统会自动改为同步。"
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
      </PageShell>
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

  function openAdvancedDrawer(row: RobotRow, kind: AdvancedActionKind) {
    setAdvancedTarget(row);
    setAdvancedKind(kind);
    setMapId(readTaskText(row, "mapID") ?? "");
  }
}

function RobotStatus({ status }: { status: string }) {
  if (status === "online") return <StatusPill variant="success">在线</StatusPill>;
  if (status === "offline") return <StatusPill variant="danger">离线</StatusPill>;
  return <StatusPill variant="muted">{status || "未知"}</StatusPill>;
}

function CredentialFlags({ row }: { row: EzvizConfigRow }) {
  return (
    <span className="robot-config-flags">
      <StatusPill variant={row.hasAppKey ? "success" : "warning"}>AppKey</StatusPill>
      <StatusPill variant={row.hasAppSecret ? "success" : "warning"}>Secret</StatusPill>
    </span>
  );
}

function TokenState({ row }: { row: EzvizConfigRow }) {
  const expireText = row.tokenExpireAt ? new Date(row.tokenExpireAt).toLocaleString("zh-CN", { hour12: false }) : "-";
  return (
    <span className="robot-token-state">
      <StatusPill variant={row.hasAccessToken ? "success" : "warning"}>{row.hasAccessToken ? "已缓存" : "未缓存"}</StatusPill>
      <small>{expireText}</small>
    </span>
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

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function buildRobotSummary(items: RobotRow[]) {
  return items.reduce((summary, item) => ({
    total: summary.total + 1,
    online: summary.online + (item.onlineStatus === "online" ? 1 : 0),
    withTask: summary.withTask + (hasTaskSnapshot(item) ? 1 : 0),
    exception: summary.exception + (item.onlineStatus === "offline" || hasRobotException(item) ? 1 : 0)
  }), { total: 0, online: 0, withTask: 0, exception: 0 });
}

function hasTaskSnapshot(row: RobotRow) {
  return Boolean(getStatusRecord(row, "ezviz_current_task") ?? getStatusRecord(row, "ezviz_last_command"));
}

function hasRobotException(row: RobotRow) {
  const value = readTaskValue(row, "exceptionInfo") ?? readTaskValue(row, "exceptionCode") ?? readTaskValue(row, "errorCode");
  if (value === null || value === undefined || value === "" || value === 0) return false;
  if (typeof value === "object" && Object.keys(value).length === 0) return false;
  return true;
}

function readBatteryText(row: RobotRow) {
  const value = readTaskValue(row, "battery") ?? readTaskValue(row, "batteryLevel") ?? readTaskValue(row, "electricity");
  if (value === null || value === undefined || value === "") return "-";
  return typeof value === "number" ? `${value}%` : String(value);
}

function readTaskText(row: RobotRow, key: string) {
  const value = readTaskValue(row, key);
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return stringifyPreview(value);
  return String(value);
}

function readTaskValue(row: RobotRow, key: string): unknown {
  const task = getStatusRecord(row, "ezviz_current_task");
  const command = getStatusRecord(row, "ezviz_last_command");
  return deepFindValue(task, key) ?? deepFindValue(command, key) ?? deepFindValue(row.statusPayload, key);
}

function getStatusRecord(row: RobotRow, key: string) {
  const value = row.statusPayload?.[key];
  return isRecord(value) ? value : null;
}

function deepFindValue(value: unknown, targetKey: string): unknown {
  if (!isRecord(value)) return undefined;
  if (Object.prototype.hasOwnProperty.call(value, targetKey)) return value[targetKey];
  for (const nested of Object.values(value)) {
    const found = deepFindValue(nested, targetKey);
    if (found !== undefined) return found;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(value: string) {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new Error("请输入 JSON 对象");
  return parsed;
}

function stringifyPreview(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isTokenMessage(value: string) {
  return /token|accessToken|10002|过期|异常/i.test(value);
}

function Forbidden() {
  return (
    <PageShell>
      <ContentCard>
        <h1>403</h1>
        <p>无权访问机器人运营，或当前租户未开通机器人能力。</p>
      </ContentCard>
    </PageShell>
  );
}
