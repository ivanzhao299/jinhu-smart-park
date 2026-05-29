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
import { AlertTriangle, CheckCircle2, ClipboardCheck, Eye, Plus, RefreshCw, Search, ShieldAlert, UserRoundPlus, XCircle } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../../lib/api-client";
import { getAccessToken } from "../../../../lib/authz";

const VIDEO_MODULE = "video";

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

type DictMap = Record<string, DictItemRow[]>;
type StatusVariant = "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted";

interface CameraOption {
  id: string;
  cameraCode: string;
  cameraName: string;
  status: string;
}

interface VideoAlertRow {
  id: string;
  cameraId: string;
  cameraCode: string | null;
  cameraName: string | null;
  alertCode: string;
  alertType: string;
  alertLevel: string;
  alertSource: string;
  title: string;
  description: string | null;
  snapshotUrl: string | null;
  videoClipUrl: string | null;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  assignedTo: string | null;
  linkedInspectionId: string | null;
  linkedHazardId: string | null;
  processStatus: string;
  remark: string | null;
  createTime: string;
  updateTime: string;
  logs?: VideoAlertLogRow[];
}

interface VideoAlertLogRow {
  id: string;
  action: string;
  operatorName: string | null;
  oldStatus: string | null;
  newStatus: string | null;
  remark: string | null;
  createTime: string;
}

interface Filters {
  keyword: string;
  alertType: string;
  alertLevel: string;
  processStatus: string;
  cameraId: string;
}

interface AlertForm {
  cameraId: string;
  alertType: string;
  alertLevel: string;
  alertSource: string;
  title: string;
  description: string;
  snapshotUrl: string;
}

const emptyPage: PaginatedResult<VideoAlertRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", alertType: "", alertLevel: "", processStatus: "", cameraId: "" };
const emptyForm: AlertForm = {
  cameraId: "",
  alertType: "CAMERA_OFFLINE",
  alertLevel: "MEDIUM",
  alertSource: "MANUAL",
  title: "",
  description: "",
  snapshotUrl: ""
};

export default function VideoAlertsPage() {
  const [pageData, setPageData] = useState<PaginatedResult<VideoAlertRow>>(emptyPage);
  const [dicts, setDicts] = useState<DictMap>({});
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [form, setForm] = useState<AlertForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<VideoAlertRow | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const alertTypes = dicts.video_alert_type ?? [];
  const alertLevels = dicts.video_alert_level ?? [];
  const alertStatuses = dicts.video_alert_process_status ?? [];
  const alertSources = dicts.video_alert_source ?? [];

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData.total, pageData.page_size]);

  const labelOf = useCallback((code: string, items: DictItemRow[]) => items.find((item) => item.itemValue === code)?.itemLabel ?? code, []);
  const tagOf = useCallback((code: string, items: DictItemRow[]): StatusVariant => normalizeVariant(items.find((item) => item.itemValue === code)?.tagType), []);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageData.page_size), sort: "-triggered_at" });
      if (filters.keyword) params.set("keyword", filters.keyword);
      if (filters.alertType) params.set("alert_type", filters.alertType);
      if (filters.alertLevel) params.set("alert_level", filters.alertLevel);
      if (filters.processStatus) params.set("process_status", filters.processStatus);
      if (filters.cameraId) params.set("camera_id", filters.cameraId);
      const response = await apiRequest<PaginatedResult<VideoAlertRow>>(`/video-security/alerts?${params.toString()}`, { token: getAccessToken() });
      setPageData(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载视频告警失败");
    } finally {
      setLoading(false);
    }
  }, [filters, pageData.page_size]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["video_alert_type", "video_alert_level", "video_alert_source", "video_alert_process_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, { token: getAccessToken() });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  const loadCameras = useCallback(async () => {
    const response = await apiRequest<PaginatedResult<CameraOption>>("/video-security/cameras?page=1&page_size=100&is_enabled=true", { token: getAccessToken() });
    setCameras(response.data.items);
  }, []);

  useEffect(() => {
    void Promise.all([load(1), loadDicts(), loadCameras()]).catch((error: Error) => setMessage(error.message));
  }, [load, loadDicts, loadCameras]);

  function openCreate() {
    setForm({ ...emptyForm, cameraId: cameras[0]?.id ?? "" });
    setFormOpen(true);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      await apiRequest<VideoAlertRow>("/video-security/alerts", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("video-alert"),
        body: {
          camera_id: form.cameraId,
          alert_type: form.alertType,
          alert_level: form.alertLevel,
          alert_source: form.alertSource,
          title: form.title,
          description: form.description || undefined,
          snapshot_url: form.snapshotUrl || undefined
        }
      });
      setFormOpen(false);
      await load(1);
      setMessage("视频告警已创建");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建视频告警失败");
    }
  }

  async function loadDetail(row: VideoAlertRow) {
    setMessage("");
    try {
      const response = await apiRequest<VideoAlertRow>(`/video-security/alerts/${row.id}`, { token: getAccessToken() });
      setViewing(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载视频告警详情失败");
    }
  }

  async function action(row: VideoAlertRow, type: "acknowledge" | "assign" | "resolve" | "close" | "create-inspection" | "create-hazard") {
    const assigneeId = type === "assign" ? window.prompt("请输入指派处理人 ID") : "";
    if (type === "assign" && !assigneeId?.trim()) return;
    const reason = type === "close" ? window.prompt("请输入关闭原因") : window.prompt("请输入操作说明（可选）");
    if (type === "close" && !reason?.trim()) return;
    setMessage("");
    try {
      await apiRequest(`/video-security/alerts/${row.id}/${type}`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(`video-alert-${type}`),
        body: type === "create-inspection" || type === "create-hazard"
          ? { remark: reason || undefined }
          : { assigned_to: assigneeId || undefined, reason: reason || undefined, remark: reason || undefined }
      });
      await load(pageData.page);
      if (viewing?.id === row.id) {
        await loadDetail(row);
      }
      setMessage("操作已完成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "视频告警操作失败");
    }
  }

  async function detectOffline() {
    setMessage("");
    try {
      await apiRequest("/video-security/alerts/detect-offline", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("video-alert-offline")
      });
      await load(1);
      setMessage("离线检测已完成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "离线检测失败");
    }
  }

  return (
    <PermissionGuard module={VIDEO_MODULE} permission={SYSTEM_PERMISSIONS.VIDEO_ALERT_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>视频安防告警中心</h1>
            <p>集中处理摄像头异常、视频事件、AI 预留告警，并联动巡检和隐患整改。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void detectOffline()}>
              <ShieldAlert size={16} /> 离线检测
            </button>
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page)}>
              <RefreshCw size={16} /> 刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.VIDEO_ALERT_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} /> 新增告警
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <div className="system-grid-three">
            <label>关键词<input value={filters.keyword} placeholder="编号 / 标题 / 摄像头" onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} /></label>
            <label>告警类型<select value={filters.alertType} onChange={(event) => setFilters({ ...filters, alertType: event.target.value })}><option value="">全部</option>{alertTypes.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}</select></label>
            <label>告警等级<select value={filters.alertLevel} onChange={(event) => setFilters({ ...filters, alertLevel: event.target.value })}><option value="">全部</option>{alertLevels.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}</select></label>
            <label>处理状态<select value={filters.processStatus} onChange={(event) => setFilters({ ...filters, processStatus: event.target.value })}><option value="">全部</option>{alertStatuses.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}</select></label>
          </div>
          <div className="filter-actions">
            <button className="primary-button" type="button" onClick={() => void load(1)}><Search size={16} /> 查询</button>
          </div>
        </Card>

        {message ? <div className="system-message">{message}</div> : null}

        <Card className="page-content">
          <div className="system-toolbar">
            <div>
              <h2>告警列表</h2>
              <p>{loading ? "加载中..." : `共 ${pageData.total} 条，第 ${pageData.page} 页`}</p>
            </div>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>告警编号</th>
                <th>标题</th>
                <th>摄像头</th>
                <th>类型</th>
                <th>等级</th>
                <th>状态</th>
                <th>触发时间</th>
                <th>联动</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.alertCode}</td>
                  <td>{row.title}</td>
                  <td>{row.cameraName ?? row.cameraCode ?? "-"}</td>
                  <td>{labelOf(row.alertType, alertTypes)}</td>
                  <td><StatusPill variant={tagOf(row.alertLevel, alertLevels)}>{labelOf(row.alertLevel, alertLevels)}</StatusPill></td>
                  <td><StatusPill variant={tagOf(row.processStatus, alertStatuses)}>{labelOf(row.processStatus, alertStatuses)}</StatusPill></td>
                  <td>{formatDate(row.triggeredAt)}</td>
                  <td>{row.linkedInspectionId ? "巡检" : ""}{row.linkedHazardId ? " 隐患" : ""}{!row.linkedInspectionId && !row.linkedHazardId ? "-" : ""}</td>
                  <td>
                    <DataTableActions>
                      <button className="secondary-button" type="button" onClick={() => void loadDetail(row)}><Eye size={16} /> 查看</button>
                      <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.VIDEO_ALERT_PROCESS} type="button" onClick={() => void action(row, "acknowledge")}><CheckCircle2 size={16} /> 确认</PermissionButton>
                      <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.VIDEO_ALERT_PROCESS} type="button" onClick={() => void action(row, "assign")}><UserRoundPlus size={16} /> 指派</PermissionButton>
                      <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.VIDEO_ALERT_PROCESS} type="button" onClick={() => void action(row, "resolve")}><ClipboardCheck size={16} /> 处理</PermissionButton>
                      <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.VIDEO_ALERT_CREATE_INSPECTION} type="button" onClick={() => void action(row, "create-inspection")}>巡检</PermissionButton>
                      <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.VIDEO_ALERT_CREATE_HAZARD} type="button" onClick={() => void action(row, "create-hazard")}>隐患</PermissionButton>
                      <PermissionButton className="danger-button" permission={SYSTEM_PERMISSIONS.VIDEO_ALERT_CLOSE} type="button" onClick={() => void action(row, "close")}><XCircle size={16} /> 关闭</PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={9}><EmptyState /></td></tr> : null}
            </tbody>
          </DataTable>
          <div className="pagination-bar">
            <span>共 {pageData.total} 条</span>
            <button className="secondary-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(Math.max(1, pageData.page - 1))}>上一页</button>
            <button className="secondary-button" type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1)}>下一页</button>
          </div>
        </Card>

        {formOpen ? (
          <Drawer size="md" onClose={() => setFormOpen(false)}>
            <DrawerHeader title="新增视频告警" description="人工补登记视频异常或安防事件。" onClose={() => setFormOpen(false)} />
            <DrawerForm onSubmit={(event) => void submitForm(event)}>
              <DrawerFormGrid>
                <label>摄像头<select required value={form.cameraId} onChange={(event) => setForm({ ...form, cameraId: event.target.value })}><option value="">请选择</option>{cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.cameraName}</option>)}</select></label>
                <label>告警类型<select value={form.alertType} onChange={(event) => setForm({ ...form, alertType: event.target.value })}>{alertTypes.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}</select></label>
                <label>告警等级<select value={form.alertLevel} onChange={(event) => setForm({ ...form, alertLevel: event.target.value })}>{alertLevels.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}</select></label>
                <label>告警来源<select value={form.alertSource} onChange={(event) => setForm({ ...form, alertSource: event.target.value })}>{alertSources.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}</select></label>
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <label>标题<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
                <label>描述<textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
                <label>截图地址<input value={form.snapshotUrl} onChange={(event) => setForm({ ...form, snapshotUrl: event.target.value })} /></label>
              </DrawerFormGrid>
              <DrawerFooter><button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>取消</button><button className="primary-button" type="submit">保存</button></DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {viewing ? (
          <Drawer size="lg" onClose={() => setViewing(null)}>
            <DrawerHeader eyebrow="视频告警详情" title={viewing.title} description={`${viewing.alertCode} · ${viewing.cameraName ?? viewing.cameraCode ?? "-"}`} onClose={() => setViewing(null)} />
            <DrawerDetailGrid>
              <DrawerDetailItem label="告警类型" value={labelOf(viewing.alertType, alertTypes)} />
              <DrawerDetailItem label="告警等级" value={<StatusPill variant={tagOf(viewing.alertLevel, alertLevels)}>{labelOf(viewing.alertLevel, alertLevels)}</StatusPill>} />
              <DrawerDetailItem label="处理状态" value={<StatusPill variant={tagOf(viewing.processStatus, alertStatuses)}>{labelOf(viewing.processStatus, alertStatuses)}</StatusPill>} />
              <DrawerDetailItem label="触发时间" value={formatDate(viewing.triggeredAt)} />
              <DrawerDetailItem label="描述" value={viewing.description ?? "-"} />
              <DrawerDetailItem label="截图证据" value={viewing.snapshotUrl ? <a href={viewing.snapshotUrl} target="_blank">查看截图</a> : "-"} />
              <DrawerDetailItem label="巡检联动" value={viewing.linkedInspectionId ?? "-"} />
              <DrawerDetailItem label="隐患联动" value={viewing.linkedHazardId ?? "-"} />
            </DrawerDetailGrid>
            <Card className="page-content">
              <h3>处理日志</h3>
              <DataTable>
                <thead><tr><th>时间</th><th>动作</th><th>状态</th><th>操作人</th><th>说明</th></tr></thead>
                <tbody>
                  {(viewing.logs ?? []).map((log) => (
                    <tr key={log.id}><td>{formatDate(log.createTime)}</td><td>{log.action}</td><td>{log.oldStatus ?? "-"} → {log.newStatus ?? "-"}</td><td>{log.operatorName ?? "-"}</td><td>{log.remark ?? "-"}</td></tr>
                  ))}
                  {(viewing.logs ?? []).length === 0 ? <tr><td colSpan={5}><EmptyState /></td></tr> : null}
                </tbody>
              </DataTable>
            </Card>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function EmptyState() {
  return <div className="empty-state"><AlertTriangle size={18} /> 暂无数据</div>;
}

function Forbidden() {
  return <main className="page-container"><Card className="page-content"><EmptyState /></Card></main>;
}

function normalizeVariant(value?: string | null): StatusVariant {
  if (value === "success" || value === "warning" || value === "danger" || value === "info" || value === "primary" || value === "muted") {
    return value;
  }
  return "default";
}
