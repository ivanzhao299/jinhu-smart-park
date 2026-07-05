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
import { Activity, Edit3, Eye, ImageIcon, MapPinned, PlayCircle, Plus, RefreshCw, Search, ShieldAlert, Trash2, Video, VideoOff } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { VideoEvidencePanel } from "../../../../components/video/VideoEvidencePanel";
import { VideoPlayer, type VideoStreamResult } from "../../../../components/video/VideoPlayer";
import { apiRequest, createIdempotencyKey } from "../../../../lib/api-client";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../../lib/field-policy";
import { fetchReferenceFormOptions } from "../../../../lib/reference-data";

const VIDEO_MODULE = "video";
const CAMERA_ENTITY = "camera_device";

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

interface CameraRow {
  id: string;
  tenantId: string;
  parkId: string;
  code: string | null;
  buildingId: string | null;
  floorId: string | null;
  roomId: string | null;
  areaId: string | null;
  cameraCode: string;
  cameraName: string;
  cameraType: string | null;
  cameraUsage: string;
  brand: string | null;
  model: string | null;
  manufacturer: string | null;
  platformType: string;
  platformDeviceId: string | null;
  ipAddress: string | null;
  port: number | null;
  username: string | null;
  passwordEncrypted: string | null;
  rtspUrl: string | null;
  hlsUrl: string | null;
  webrtcUrl: string | null;
  snapshotUrl: string | null;
  installLocation: string | null;
  longitude: string | null;
  latitude: string | null;
  direction: string | null;
  status: string;
  isRecording: boolean;
  isEnabled: boolean;
  remark: string | null;
  updateTime: string;
}

interface CameraForm {
  cameraCode: string;
  cameraName: string;
  cameraType: string;
  cameraUsage: string;
  brand: string;
  model: string;
  manufacturer: string;
  platformType: string;
  platformDeviceId: string;
  ipAddress: string;
  port: string;
  username: string;
  password: string;
  rtspUrl: string;
  hlsUrl: string;
  webrtcUrl: string;
  snapshotUrl: string;
  buildingId: string;
  floorId: string;
  roomId: string;
  areaId: string;
  installLocation: string;
  longitude: string;
  latitude: string;
  direction: string;
  status: string;
  isRecording: boolean;
  isEnabled: boolean;
  remark: string;
}

interface VideoStatusCheck {
  status: string;
  checkedAt: string;
  source: string;
  message: string;
}

interface Filters {
  keyword: string;
  brand: string;
  platformType: string;
  usage: string;
  status: string;
  buildingId: string;
  floorId: string;
  areaId: string;
  isEnabled: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<CameraRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = {
  keyword: "",
  brand: "",
  platformType: "",
  usage: "",
  status: "",
  buildingId: "",
  floorId: "",
  areaId: "",
  isEnabled: ""
};
const emptyForm: CameraForm = {
  cameraCode: "",
  cameraName: "",
  cameraType: "",
  cameraUsage: "",
  brand: "",
  model: "",
  manufacturer: "",
  platformType: "LOCAL_RTSP",
  platformDeviceId: "",
  ipAddress: "",
  port: "",
  username: "",
  password: "",
  rtspUrl: "",
  hlsUrl: "",
  webrtcUrl: "",
  snapshotUrl: "",
  buildingId: "",
  floorId: "",
  roomId: "",
  areaId: "",
  installLocation: "",
  longitude: "",
  latitude: "",
  direction: "",
  status: "UNKNOWN",
  isRecording: false,
  isEnabled: true,
  remark: ""
};

export default function VideoCameraPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<CameraRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [form, setForm] = useState<CameraForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CameraRow | null>(null);
  const [viewing, setViewing] = useState<CameraRow | null>(null);
  const [previewing, setPreviewing] = useState<CameraRow | null>(null);
  const [previewStream, setPreviewStream] = useState<VideoStreamResult | null>(null);
  const [snapshotStream, setSnapshotStream] = useState<VideoStreamResult | null>(null);
  const [statusCheck, setStatusCheck] = useState<VideoStatusCheck | null>(null);
  const [message, setMessage] = useState("");

  const cameraTypes = dicts.video_camera_type ?? [];
  const usageTypes = dicts.video_camera_usage ?? [];
  const platformTypes = dicts.video_platform_type ?? [];
  const cameraStatuses = dicts.video_camera_status ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const filteredFloors = useMemo(
    () => floors.filter((floor) => !form.buildingId || floor.buildingId === form.buildingId),
    [floors, form.buildingId]
  );
  const filteredUnits = useMemo(
    () => units.filter((unit) => (!form.buildingId || unit.buildingId === form.buildingId) && (!form.floorId || unit.floorId === form.floorId)),
    [form.buildingId, form.floorId, units]
  );

  const canViewStream = canViewField(authUser, VIDEO_MODULE, CAMERA_ENTITY, "rtspUrl");
  const canViewIp = canViewField(authUser, VIDEO_MODULE, CAMERA_ENTITY, "ipAddress");
  const canViewUsername = canViewField(authUser, VIDEO_MODULE, CAMERA_ENTITY, "username");
  const canEditStream = canEditField(authUser, VIDEO_MODULE, CAMERA_ENTITY, "rtspUrl");
  const canEditIp = canEditField(authUser, VIDEO_MODULE, CAMERA_ENTITY, "ipAddress");
  const canEditUsername = canEditField(authUser, VIDEO_MODULE, CAMERA_ENTITY, "username");
  const canEditSecret = canEditField(authUser, VIDEO_MODULE, CAMERA_ENTITY, "passwordEncrypted");

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.brand.trim()) params.set("brand", filters.brand.trim());
    if (filters.platformType) params.set("platform_type", filters.platformType);
    if (filters.usage) params.set("usage", filters.usage);
    if (filters.status) params.set("status", filters.status);
    if (filters.buildingId) params.set("building_id", filters.buildingId);
    if (filters.floorId) params.set("floor_id", filters.floorId);
    if (filters.areaId.trim()) params.set("area_id", filters.areaId.trim());
    if (filters.isEnabled) params.set("is_enabled", filters.isEnabled);
    const response = await apiRequest<PaginatedResult<CameraRow>>(`/video-security/cameras?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item: DictTypeRow) => [item.dictCode, item.id]));
    const codes = ["video_camera_type", "video_camera_usage", "video_platform_type", "video_camera_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
        token: getAccessToken()
      });
      return [code, response.data.items.filter((item: DictItemRow) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  const loadRefs = useCallback(async () => {
    const references = await fetchReferenceFormOptions();
    setBuildings(references.buildings);
    setFloors(references.floors);
    setUnits(references.units);
  }, []);

  useEffect(() => {
    void Promise.all([loadDicts(), loadRefs()]).catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadRefs]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      cameraType: cameraTypes[0]?.itemValue ?? "",
      cameraUsage: usageTypes[0]?.itemValue ?? "",
      platformType: platformTypes[0]?.itemValue ?? "LOCAL_RTSP",
      status: "UNKNOWN",
      isEnabled: true
    });
    setFormOpen(true);
  }

  function openEdit(row: CameraRow) {
    setEditing(row);
    setForm({
      cameraCode: row.cameraCode,
      cameraName: row.cameraName,
      cameraType: row.cameraType ?? "",
      cameraUsage: row.cameraUsage,
      brand: row.brand ?? "",
      model: row.model ?? "",
      manufacturer: row.manufacturer ?? "",
      platformType: row.platformType,
      platformDeviceId: row.platformDeviceId ?? "",
      ipAddress: row.ipAddress ?? "",
      port: row.port === null ? "" : String(row.port),
      username: row.username ?? "",
      password: "",
      rtspUrl: row.rtspUrl ?? "",
      hlsUrl: row.hlsUrl ?? "",
      webrtcUrl: row.webrtcUrl ?? "",
      snapshotUrl: row.snapshotUrl ?? "",
      buildingId: row.buildingId ?? "",
      floorId: row.floorId ?? "",
      roomId: row.roomId ?? "",
      areaId: row.areaId ?? "",
      installLocation: row.installLocation ?? "",
      longitude: row.longitude ?? "",
      latitude: row.latitude ?? "",
      direction: row.direction ?? "",
      status: row.status,
      isRecording: row.isRecording,
      isEnabled: row.isEnabled,
      remark: row.remark ?? ""
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  function setFormValue<K extends keyof CameraForm>(key: K, value: CameraForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editing ? `/video-security/cameras/${editing.id}` : "/video-security/cameras";
    await apiRequest<CameraRow>(path, {
      method: editing ? "PATCH" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "video-camera-update" : "video-camera-create"),
      body: buildPayload(form, editing)
    });
    setMessage(editing ? "视频点位已更新" : "视频点位已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function updateStatus(row: CameraRow, nextStatus: string, nextEnabled: boolean) {
    await apiRequest<CameraRow>(`/video-security/cameras/${row.id}/status`, {
      method: "PATCH",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("video-camera-status"),
      body: { status: nextStatus, is_enabled: nextEnabled }
    });
    setMessage(nextEnabled ? "视频点位已启用" : "视频点位已停用");
    await load(pageData.page);
  }

  async function remove(row: CameraRow) {
    if (!window.confirm(`确认删除视频点位 ${row.cameraName}？`)) return;
    await apiRequest<{ id: string }>(`/video-security/cameras/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("video-camera-delete")
    });
    setMessage("视频点位已删除");
    await load(pageData.page);
  }

  async function openPreview(row: CameraRow) {
    setPreviewing(row);
    setPreviewStream(null);
    setSnapshotStream(null);
    setStatusCheck(null);
    const response = await apiRequest<VideoStreamResult>(`/video-security/cameras/${row.id}/preview-url`, {
      token: getAccessToken()
    });
    setPreviewStream(response.data);
  }

  async function loadSnapshot(row: CameraRow) {
    setPreviewing(row);
    setSnapshotStream(null);
    const response = await apiRequest<VideoStreamResult>(`/video-security/cameras/${row.id}/snapshot-url`, {
      token: getAccessToken()
    });
    setSnapshotStream(response.data);
  }

  async function checkCameraStatus(row: CameraRow) {
    const response = await apiRequest<VideoStatusCheck>(`/video-security/cameras/${row.id}/status-check`, {
      token: getAccessToken()
    });
    setStatusCheck(response.data);
    setMessage(`状态检测：${response.data.status}，${response.data.message}`);
  }

  function openRelatedAlerts(row: CameraRow) {
    const params = new URLSearchParams({ cameraId: row.id });
    window.location.href = `/admin/video-security/alerts?${params.toString()}`;
  }

  function scrollToEvidence(cameraId: string) {
    const target = document.getElementById(`camera-evidence-${cameraId}`);
    if (!target) {
      setMessage("当前摄像头暂无可定位的视频证据区域");
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setMessage("已定位到视频证据区域");
  }

  function secured(field: keyof CameraRow, value: string | number | boolean | null | undefined) {
    return maskField(authUser, VIDEO_MODULE, CAMERA_ENTITY, String(field), value ?? "-") as ReactNode;
  }

  return (
    <PermissionGuard module={VIDEO_MODULE} permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>视频点位管理</h1>
            <p>维护摄像头台账、安装位置、视频流地址和平台接入信息。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增摄像头
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="编号 / 名称 / 位置" />
          </Field>
          <Field label="品牌">
            <input value={filters.brand} onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value }))} placeholder="品牌" />
          </Field>
          <SelectField label="平台类型" value={filters.platformType} items={platformTypes} allLabel="全部平台" onChange={(value) => setFilters((current) => ({ ...current, platformType: value }))} />
          <SelectField label="用途" value={filters.usage} items={usageTypes} allLabel="全部用途" onChange={(value) => setFilters((current) => ({ ...current, usage: value }))} />
          <SelectField label="状态" value={filters.status} items={cameraStatuses} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <SelectOptions label="楼栋" value={filters.buildingId} items={buildings.map((item) => ({ value: item.id, label: item.buildingName }))} allLabel="全部楼栋" onChange={(value) => setFilters((current) => ({ ...current, buildingId: value, floorId: "" }))} />
          <SelectOptions label="楼层" value={filters.floorId} items={floors.filter((item) => !filters.buildingId || item.buildingId === filters.buildingId).map((item) => ({ value: item.id, label: item.floorName }))} allLabel="全部楼层" onChange={(value) => setFilters((current) => ({ ...current, floorId: value }))} />
          <Field label="区域 ID">
            <input value={filters.areaId} onChange={(event) => setFilters((current) => ({ ...current, areaId: event.target.value }))} placeholder="可选" />
          </Field>
          <label className="field">
            <span>是否启用</span>
            <select value={filters.isEnabled} onChange={(event) => setFilters((current) => ({ ...current, isEnabled: event.target.value }))}>
              <option value="">全部</option>
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
          </label>
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">摄像头列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable className="video-cameras-table allow-horizontal-table">
            <thead>
              <tr>
                <th>摄像头编号</th>
                <th>摄像头名称</th>
                <th>所属楼栋 / 区域</th>
                <th>安装位置</th>
                <th>用途</th>
                <th>品牌</th>
                <th>平台类型</th>
                <th>视频流配置</th>
                <th>状态</th>
                <th>启用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.cameraCode}</td>
                  <td>{row.cameraName}</td>
                  <td>{locationLabel(row, buildings, floors, units)}</td>
                  <td>{row.installLocation ?? "-"}</td>
                  <td><StatusPill dictCode="video_camera_usage" value={row.cameraUsage} dicts={dicts} /></td>
                  <td>{row.brand ?? "-"}</td>
                  <td><StatusPill dictCode="video_platform_type" value={row.platformType} dicts={dicts} /></td>
                  <td>{streamConfigLabel(row)}</td>
                  <td><StatusPill dictCode="video_camera_status" value={row.status} dicts={dicts} /></td>
                  <td>{row.isEnabled ? "启用" : "禁用"}</td>
                  <td>
                    <DataTableActions className="data-table-actions">
                      <button className="row-action-button" type="button" onClick={() => setViewing(row)}><Eye size={16} />查看</button>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_PREVIEW} type="button" onClick={() => void openPreview(row).catch((error: Error) => setMessage(error.message))}><PlayCircle size={16} />预览</PermissionButton>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_STATUS_CHECK} type="button" onClick={() => void checkCameraStatus(row).catch((error: Error) => setMessage(error.message))}><Activity size={16} />检测</PermissionButton>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_UPDATE} type="button" onClick={() => openEdit(row)}><Edit3 size={16} />编辑</PermissionButton>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_STATUS} type="button" onClick={() => void updateStatus(row, row.isEnabled ? "DISABLED" : "UNKNOWN", !row.isEnabled).catch((error: Error) => setMessage(error.message))}>
                        {row.isEnabled ? <VideoOff size={16} /> : <Video size={16} />}
                        {row.isEnabled ? "禁用" : "启用"}
                      </PermissionButton>
                      <PermissionButton className="row-action-button row-action-danger" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} />删除</PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={11}><EmptyState /></td></tr> : null}
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
          <Drawer onClose={closeForm} size="lg">
          <DrawerHeader
            eyebrow="视频点位"
            title={editing ? "编辑摄像头" : "新增摄像头"}
            description="维护设备台账、安装位置和视频流配置。"
            onClose={closeForm}
          />
          <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
            <DrawerFormGrid>
              <Field label="摄像头编号">
                <input value={form.cameraCode} onChange={(event) => setFormValue("cameraCode", event.target.value)} placeholder="留空自动生成" />
              </Field>
              <Field label="摄像头名称" required>
                <input required value={form.cameraName} onChange={(event) => setFormValue("cameraName", event.target.value)} />
              </Field>
              <SelectField label="摄像头类型" value={form.cameraType} items={cameraTypes} allLabel="请选择类型" onChange={(value) => setFormValue("cameraType", value)} />
              <SelectField label="用途" required value={form.cameraUsage} items={usageTypes} allLabel="请选择用途" onChange={(value) => setFormValue("cameraUsage", value)} />
              <Field label="品牌">
                <input value={form.brand} onChange={(event) => setFormValue("brand", event.target.value)} />
              </Field>
              <Field label="型号">
                <input value={form.model} onChange={(event) => setFormValue("model", event.target.value)} />
              </Field>
              <Field label="厂家">
                <input value={form.manufacturer} onChange={(event) => setFormValue("manufacturer", event.target.value)} />
              </Field>
              <SelectField label="平台类型" required value={form.platformType} items={platformTypes} allLabel="请选择平台" onChange={(value) => setFormValue("platformType", value)} />
              <Field label="平台设备 ID">
                <input value={form.platformDeviceId} onChange={(event) => setFormValue("platformDeviceId", event.target.value)} />
              </Field>
              <Field label="IP 地址">
                <input disabled={!canEditIp} value={form.ipAddress} onChange={(event) => setFormValue("ipAddress", event.target.value)} />
              </Field>
              <Field label="端口">
                <input type="number" min="0" value={form.port} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setFormValue("port", event.target.value)} />
              </Field>
              <Field label="访问用户名">
                <input disabled={!canEditUsername} value={form.username} onChange={(event) => setFormValue("username", event.target.value)} />
              </Field>
              <Field label="访问密码">
                <input disabled={!canEditSecret} type="password" value={form.password} onChange={(event) => setFormValue("password", event.target.value)} placeholder={editing ? "留空不修改" : ""} />
              </Field>
              <SelectOptions label="楼栋" value={form.buildingId} items={buildings.map((item) => ({ value: item.id, label: item.buildingName }))} allLabel="请选择楼栋" onChange={(value) => setForm((current) => ({ ...current, buildingId: value, floorId: "", roomId: "" }))} />
              <SelectOptions label="楼层" value={form.floorId} items={filteredFloors.map((item) => ({ value: item.id, label: item.floorName }))} allLabel="请选择楼层" onChange={(value) => setForm((current) => ({ ...current, floorId: value, roomId: "" }))} />
              <SelectOptions label="房间 / 房源" value={form.roomId} items={filteredUnits.map((item) => ({ value: item.id, label: `${item.unitCode} ${item.unitName}` }))} allLabel="请选择房源" onChange={(value) => setFormValue("roomId", value)} />
              <Field label="区域 ID">
                <input value={form.areaId} onChange={(event) => setFormValue("areaId", event.target.value)} />
              </Field>
              <Field label="安装位置">
                <input value={form.installLocation} onChange={(event) => setFormValue("installLocation", event.target.value)} />
              </Field>
              <Field label="经度">
                <input type="number" value={form.longitude} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setFormValue("longitude", event.target.value)} />
              </Field>
              <Field label="纬度">
                <input type="number" value={form.latitude} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setFormValue("latitude", event.target.value)} />
              </Field>
              <Field label="朝向">
                <input value={form.direction} onChange={(event) => setFormValue("direction", event.target.value)} placeholder="如 北 / 东南 / 出入口方向" />
              </Field>
              <SelectField label="状态" value={form.status} items={cameraStatuses} allLabel="请选择状态" onChange={(value) => setFormValue("status", value)} />
              <label className="field checkbox-field">
                <input type="checkbox" checked={form.isRecording} onChange={(event) => setFormValue("isRecording", event.target.checked)} />
                <span>正在录像</span>
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={form.isEnabled} onChange={(event) => setFormValue("isEnabled", event.target.checked)} />
                <span>启用摄像头</span>
              </label>
            </DrawerFormGrid>
            <DrawerFormGrid single>
              <Field label="RTSP 地址">
                <input disabled={!canEditStream} value={form.rtspUrl} onChange={(event) => setFormValue("rtspUrl", event.target.value)} />
              </Field>
              <Field label="HLS 地址">
                <input disabled={!canEditStream} value={form.hlsUrl} onChange={(event) => setFormValue("hlsUrl", event.target.value)} />
              </Field>
              <Field label="WebRTC 地址">
                <input disabled={!canEditStream} value={form.webrtcUrl} onChange={(event) => setFormValue("webrtcUrl", event.target.value)} />
              </Field>
              <Field label="快照地址">
                <input disabled={!canEditStream} value={form.snapshotUrl} onChange={(event) => setFormValue("snapshotUrl", event.target.value)} />
              </Field>
              <Field label="备注">
                <textarea rows={3} value={form.remark} onChange={(event) => setFormValue("remark", event.target.value)} />
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
        <Drawer onClose={() => setViewing(null)} size="lg">
          {viewing ? (
            <>
              <DrawerHeader
                eyebrow="摄像头详情"
                title={viewing.cameraName}
                description={`${viewing.cameraCode} · ${labelFor(usageTypes, viewing.cameraUsage)} · ${labelFor(platformTypes, viewing.platformType)}`}
                onClose={() => setViewing(null)}
              />
              <div className="drawer-action-bar">
                <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_PREVIEW} type="button" onClick={() => void openPreview(viewing).catch((error: Error) => setMessage(error.message))}><PlayCircle size={16} />实时预览</PermissionButton>
                <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_PREVIEW} type="button" onClick={() => void loadSnapshot(viewing).catch((error: Error) => setMessage(error.message))}><ImageIcon size={16} />截图地址</PermissionButton>
                <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_STATUS_CHECK} type="button" onClick={() => void checkCameraStatus(viewing).catch((error: Error) => setMessage(error.message))}><Activity size={16} />状态检测</PermissionButton>
                <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_ALERT_READ} type="button" onClick={() => openRelatedAlerts(viewing)}><ShieldAlert size={16} />关联告警</PermissionButton>
                <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_READ} type="button" onClick={() => scrollToEvidence(viewing.id)}><MapPinned size={16} />视频证据</PermissionButton>
              </div>
              <DrawerDetailGrid>
                <DrawerDetailItem label="摄像头编号" value={viewing.cameraCode} />
                <DrawerDetailItem label="摄像头名称" value={viewing.cameraName} />
                <DrawerDetailItem label="所属楼栋 / 楼层" value={locationLabel(viewing, buildings, floors, units)} />
                <DrawerDetailItem label="安装位置" value={viewing.installLocation ?? "-"} />
                <DrawerDetailItem label="用途" value={<StatusPill dictCode="video_camera_usage" value={viewing.cameraUsage} dicts={dicts} />} />
                <DrawerDetailItem label="状态" value={<StatusPill dictCode="video_camera_status" value={viewing.status} dicts={dicts} />} />
                <DrawerDetailItem label="品牌 / 型号" value={`${viewing.brand ?? "-"} / ${viewing.model ?? "-"}`} />
                <DrawerDetailItem label="平台类型" value={<StatusPill dictCode="video_platform_type" value={viewing.platformType} dicts={dicts} />} />
                <DrawerDetailItem label="视频流配置状态" value={streamConfigLabel(viewing)} />
                <DrawerDetailItem label="最近状态检测" value={statusCheck ? `${statusCheck.status} · ${formatDateTime(statusCheck.checkedAt)}` : "-"} />
                <DrawerDetailItem label="平台设备 ID" value={viewing.platformDeviceId ?? "-"} />
                <DrawerDetailItem label="IP / 端口" value={canViewIp ? `${secured("ipAddress", viewing.ipAddress)} / ${viewing.port ?? "-"}` : "-"} />
                <DrawerDetailItem label="访问用户名" value={canViewUsername ? secured("username", viewing.username) : "-"} />
                <DrawerDetailItem label="是否录像" value={viewing.isRecording ? "是" : "否"} />
                <DrawerDetailItem label="是否启用" value={viewing.isEnabled ? "是" : "否"} />
                <DrawerDetailItem label="经纬度" value={viewing.longitude && viewing.latitude ? `${viewing.longitude}, ${viewing.latitude}` : "-"} />
                <DrawerDetailItem label="朝向" value={viewing.direction ?? "-"} />
                <DrawerDetailItem label="最后更新" value={formatDateTime(viewing.updateTime)} />
                <DrawerDetailItem label="RTSP 地址" value={canViewStream ? secured("rtspUrl", viewing.rtspUrl) : "-"} />
                <DrawerDetailItem label="HLS 地址" value={canViewStream ? secured("hlsUrl", viewing.hlsUrl) : "-"} />
                <DrawerDetailItem label="WebRTC 地址" value={canViewStream ? secured("webrtcUrl", viewing.webrtcUrl) : "-"} />
                <DrawerDetailItem label="快照地址" value={canViewStream ? secured("snapshotUrl", viewing.snapshotUrl) : "-"} />
                <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
              </DrawerDetailGrid>
              <div id={`camera-evidence-${viewing.id}`}>
                <VideoEvidencePanel cameraId={viewing.id} sourceType="MANUAL" />
              </div>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setViewing(null)}>关闭</button>
              </DrawerFooter>
            </>
          ) : null}
        </Drawer>
        ) : null}

        {previewing ? (
          <Drawer onClose={() => { setPreviewing(null); setPreviewStream(null); setSnapshotStream(null); }} size="md">
            <DrawerHeader
              eyebrow="视频实时预览"
              title={previewing.cameraName}
              description={`${previewing.cameraCode} · ${labelFor(platformTypes, previewing.platformType)}`}
              onClose={() => { setPreviewing(null); setPreviewStream(null); setSnapshotStream(null); }}
            />
            <div className="drawer-section">
              <VideoPlayer stream={previewStream} />
              {snapshotStream ? (
                <div className="video-snapshot-panel">
                  <h3>截图地址</h3>
                  <VideoPlayer stream={snapshotStream} />
                </div>
              ) : null}
              {statusCheck ? <p className="muted-text">最近检测：{statusCheck.status} · {statusCheck.message}</p> : null}
            </div>
            <DrawerFooter>
              <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_PREVIEW} type="button" onClick={() => void loadSnapshot(previewing).catch((error: Error) => setMessage(error.message))}>查看截图</PermissionButton>
              <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_STATUS_CHECK} type="button" onClick={() => void checkCameraStatus(previewing).catch((error: Error) => setMessage(error.message))}>状态检测</PermissionButton>
              <button className="primary-button" type="button" onClick={() => { setPreviewing(null); setPreviewStream(null); setSnapshotStream(null); }}>关闭</button>
            </DrawerFooter>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function buildPayload(form: CameraForm, editing: CameraRow | null) {
  const payload: Record<string, unknown> = {
    camera_code: form.cameraCode.trim() || undefined,
    camera_name: form.cameraName.trim(),
    camera_type: form.cameraType || undefined,
    camera_usage: form.cameraUsage,
    brand: form.brand.trim() || undefined,
    model: form.model.trim() || undefined,
    manufacturer: form.manufacturer.trim() || undefined,
    platform_type: form.platformType,
    platform_device_id: form.platformDeviceId.trim() || undefined,
    ip_address: form.ipAddress.trim() || undefined,
    port: form.port ? Number(form.port) : undefined,
    username: form.username.trim() || undefined,
    rtsp_url: form.rtspUrl.trim() || undefined,
    hls_url: form.hlsUrl.trim() || undefined,
    webrtc_url: form.webrtcUrl.trim() || undefined,
    snapshot_url: form.snapshotUrl.trim() || undefined,
    building_id: form.buildingId || undefined,
    floor_id: form.floorId || undefined,
    room_id: form.roomId || undefined,
    area_id: form.areaId.trim() || undefined,
    install_location: form.installLocation.trim() || undefined,
    longitude: form.longitude ? Number(form.longitude) : undefined,
    latitude: form.latitude ? Number(form.latitude) : undefined,
    direction: form.direction.trim() || undefined,
    status: form.status,
    is_recording: form.isRecording,
    is_enabled: form.isEnabled,
    remark: form.remark.trim() || undefined
  };
  if (!editing || form.password.trim()) {
    payload.password = form.password.trim() || undefined;
  }
  return payload;
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}{required ? " *" : ""}</span>
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
      <span>{label}{required ? " *" : ""}</span>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </label>
  );
}

function SelectOptions({
  label,
  value,
  items,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  items: Array<{ value: string; label: string }>;
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
  );
}

function labelFor(items: DictItemRow[], value?: string | null) {
  if (!value) return "-";
  return items.find((item) => String(item.itemValue) === String(value))?.itemLabel ?? value;
}

function locationLabel(row: CameraRow, buildings: BuildingRow[], floors: FloorRow[], units: UnitRow[]) {
  const building = buildings.find((item) => item.id === row.buildingId);
  const floor = floors.find((item) => item.id === row.floorId);
  const unit = units.find((item) => item.id === row.roomId);
  const parts = [building?.buildingName, floor?.floorName, unit?.unitName, row.areaId ? `区域 ${row.areaId.slice(0, 8)}` : null].filter(Boolean);
  return parts.length ? parts.join(" / ") : "-";
}

function streamConfigLabel(row: CameraRow) {
  const count = [row.webrtcUrl, row.hlsUrl, row.rtspUrl].filter(Boolean).length;
  if (count > 0) return "已配置";
  return "缺失";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function EmptyState() {
  return <p className="muted-text">暂无视频点位</p>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <h1>403</h1>
        <p>无权访问视频点位管理，或当前租户未开通视频安防能力。</p>
      </Card>
    </main>
  );
}
