"use client";

import {
  Card,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerActions,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  DrawerTabs,
  DrawerTabButton,
  StatusPill
} from "@jinhu/ui";
import type { FileRecord, PaginatedResult } from "@jinhu/shared";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  ExternalLink,
  Eye,
  Paperclip,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Siren,
  Trash2,
  Wrench,
  X,
  XCircle
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { FileUploader } from "../../../components/files/FileUploader";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";

const SAFETY_MODULE = "safety";
const EVENT_ENTITY = "emergency_event";

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

interface UnitRow {
  id: string;
  unitCode: string;
  unitName: string;
  buildingId?: string | null;
  floorId?: string | null;
}

interface ParkTenantRow {
  id: string;
  companyName: string;
  parkTenantCode?: string | null;
}

interface EmergencyPlanRow {
  id: string;
  planCode: string;
  planName: string;
  incidentType: string;
  severityLevel: string;
  responseLevel: string | null;
  status: string;
}

interface UserRow {
  id: string;
  username: string;
  displayName?: string | null;
  realName?: string | null;
  status: string;
}

interface EmergencyEventRow {
  id: string;
  code: string | null;
  emergencyCode: string;
  sourceType: string;
  sourceId: string | null;
  incidentType: string;
  severityLevel: string;
  responseLevel: string | null;
  title: string;
  description: string | null;
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  parkTenantId: string | null;
  location: string;
  gpsLng: string | null;
  gpsLat: string | null;
  reporterId: string | null;
  reporterName: string | null;
  reporterMobile: string | null;
  commanderId: string | null;
  commanderName: string | null;
  responseTeamUserIds: string[];
  emergencyPlanId: string | null;
  photosFileIds: string[];
  videosFileIds: string[];
  status: string;
  reportTime: string;
  responseTime: string | null;
  controlTime: string | null;
  closeTime: string | null;
  cancelTime: string | null;
  reviewFileId: string | null;
  conclusion: string | null;
  remark: string | null;
  building?: BuildingRow | null;
  unit?: UnitRow | null;
  parkTenant?: ParkTenantRow | null;
  emergencyPlan?: EmergencyPlanRow | null;
}

interface EmergencyTimelineRow {
  id: string;
  action: string;
  beforeStatus: string | null;
  afterStatus: string | null;
  operatorName: string | null;
  reason: string | null;
  content: string | null;
  attachmentFileIds: string[];
  gpsLng: string | null;
  gpsLat: string | null;
  opTime: string;
}

interface WorkOrderRow {
  id: string;
  woCode: string;
  title: string;
}

interface CreateWorkOrderResponse {
  emergency: EmergencyEventRow;
  work_order: WorkOrderRow;
}

interface EventForm {
  emergencyCode: string;
  sourceType: string;
  incidentType: string;
  severityLevel: string;
  responseLevel: string;
  title: string;
  description: string;
  buildingId: string;
  unitId: string;
  parkTenantId: string;
  location: string;
  gpsLng: string;
  gpsLat: string;
  reporterName: string;
  reporterMobile: string;
  commanderId: string;
  commanderName: string;
  responseTeamUserIds: string;
  emergencyPlanId: string;
  photosFileIds: string[];
  videosFileIds: string[];
  remark: string;
}

type DetailTab = "profile" | "timeline";
type ActionMode = "respond" | "start-disposal" | "control" | "review" | "close" | "upgrade" | "cancel";

interface ActionState {
  row: EmergencyEventRow;
  mode: ActionMode;
}

interface ActionForm {
  reason: string;
  conclusion: string;
  reviewFileId: string;
}

interface TimelineLogForm {
  content: string;
  reason: string;
  attachmentFileIds: string[];
  gpsLng: string;
  gpsLat: string;
}

interface CreateWorkOrderForm {
  title: string;
  woType: string;
  priority: string;
  urgency: string;
  assigneeId: string;
  description: string;
}

interface Filters {
  keyword: string;
  status: string;
  incidentType: string;
  severityLevel: string;
  sourceType: string;
  buildingId: string;
  unitId: string;
  parkTenantId: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<EmergencyEventRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = {
  keyword: "",
  status: "",
  incidentType: "",
  severityLevel: "",
  sourceType: "",
  buildingId: "",
  unitId: "",
  parkTenantId: ""
};
const emptyForm: EventForm = {
  emergencyCode: "",
  sourceType: "manual",
  incidentType: "",
  severityLevel: "",
  responseLevel: "",
  title: "",
  description: "",
  buildingId: "",
  unitId: "",
  parkTenantId: "",
  location: "",
  gpsLng: "",
  gpsLat: "",
  reporterName: "",
  reporterMobile: "",
  commanderId: "",
  commanderName: "",
  responseTeamUserIds: "",
  emergencyPlanId: "",
  photosFileIds: [],
  videosFileIds: [],
  remark: ""
};
const emptyActionForm: ActionForm = {
  reason: "",
  conclusion: "",
  reviewFileId: ""
};
const emptyTimelineLogForm: TimelineLogForm = {
  content: "",
  reason: "",
  attachmentFileIds: [],
  gpsLng: "",
  gpsLat: ""
};
const emptyCreateWorkOrderForm: CreateWorkOrderForm = {
  title: "",
  woType: "repair",
  priority: "high",
  urgency: "urgent",
  assigneeId: "",
  description: ""
};

export default function SafetyEmergenciesPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<EmergencyEventRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [plans, setPlans] = useState<EmergencyPlanRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [sosMode, setSosMode] = useState(false);
  const [editing, setEditing] = useState<EmergencyEventRow | null>(null);
  const [viewing, setViewing] = useState<EmergencyEventRow | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [timeline, setTimeline] = useState<EmergencyTimelineRow[]>([]);
  const [acting, setActing] = useState<ActionState | null>(null);
  const [actionForm, setActionForm] = useState<ActionForm>(emptyActionForm);
  const [timelineLogOpen, setTimelineLogOpen] = useState(false);
  const [timelineLogForm, setTimelineLogForm] = useState<TimelineLogForm>(emptyTimelineLogForm);
  const [creatingWorkOrder, setCreatingWorkOrder] = useState<EmergencyEventRow | null>(null);
  const [createWorkOrderForm, setCreateWorkOrderForm] = useState<CreateWorkOrderForm>(emptyCreateWorkOrderForm);
  const [message, setMessage] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const sourceTypes = dicts.safety_emergency_source_type ?? [];
  const incidentTypes = dicts.safety_emergency_incident_type ?? [];
  const severityLevels = dicts.safety_emergency_severity ?? [];
  const responseLevels = dicts.safety_emergency_response_level ?? [];
  const statusItems = dicts.safety_emergency_status ?? [];
  const workOrderTypes = dicts.workorder_type ?? [];
  const workOrderPriorities = dicts.workorder_priority ?? [];
  const workOrderUrgencies = dicts.workorder_urgency ?? [];

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-report_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.incidentType) params.set("incident_type", filters.incidentType);
    if (filters.severityLevel) params.set("severity_level", filters.severityLevel);
    if (filters.sourceType) params.set("source_type", filters.sourceType);
    if (filters.buildingId) params.set("building_id", filters.buildingId);
    if (filters.unitId) params.set("unit_id", filters.unitId);
    if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
    const response = await apiRequest<PaginatedResult<EmergencyEventRow>>(`/safety/emergencies?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = [
      "safety_emergency_source_type",
      "safety_emergency_incident_type",
      "safety_emergency_severity",
      "safety_emergency_response_level",
      "safety_emergency_status",
      "workorder_type",
      "workorder_priority",
      "workorder_urgency"
    ];
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

  const loadRefs = useCallback(async () => {
    const [buildingItems, unitItems, tenantItems, planItems, userItems] = await Promise.all([
      safeFetchPage<BuildingRow>("/buildings?page=1&page_size=100"),
      safeFetchPage<UnitRow>("/park-units?page=1&page_size=100"),
      safeFetchPage<ParkTenantRow>("/park-tenants?page=1&page_size=100"),
      safeFetchPage<EmergencyPlanRow>("/safety/emergency-plans?page=1&page_size=100&status=enabled"),
      safeFetchPage<UserRow>("/users?page=1&page_size=100")
    ]);
    setBuildings(buildingItems);
    setUnits(unitItems);
    setParkTenants(tenantItems);
    setPlans(planItems);
    setUsers(userItems.filter((item) => item.status === "enabled"));
  }, []);

  const loadTimeline = useCallback(async (eventId: string) => {
    const response = await apiRequest<EmergencyTimelineRow[]>(`/safety/emergencies/${eventId}/timeline`, {
      token: getAccessToken()
    });
    setTimeline(response.data);
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadRefs().catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadRefs]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate(isSos = false) {
    setEditing(null);
    setSosMode(isSos);
    setForm({
      ...emptyForm,
      sourceType: "manual",
      incidentType: incidentTypes[0]?.itemValue ?? "",
      severityLevel: isSos ? severityLevels.find((item) => item.itemValue === "30")?.itemValue ?? severityLevels[0]?.itemValue ?? "" : severityLevels[0]?.itemValue ?? "",
      responseLevel: responseLevels[0]?.itemValue ?? "",
      title: isSos ? "一键应急上报" : ""
    });
    setFormOpen(true);
  }

  function openEdit(row: EmergencyEventRow) {
    setEditing(row);
    setSosMode(false);
    setForm({
      emergencyCode: row.emergencyCode,
      sourceType: row.sourceType,
      incidentType: row.incidentType,
      severityLevel: row.severityLevel,
      responseLevel: row.responseLevel ?? "",
      title: row.title,
      description: row.description ?? "",
      buildingId: row.buildingId ?? "",
      unitId: row.unitId ?? "",
      parkTenantId: row.parkTenantId ?? "",
      location: row.location,
      gpsLng: row.gpsLng ?? "",
      gpsLat: row.gpsLat ?? "",
      reporterName: row.reporterName ?? "",
      reporterMobile: row.reporterMobile ?? "",
      commanderId: row.commanderId ?? "",
      commanderName: row.commanderName ?? "",
      responseTeamUserIds: row.responseTeamUserIds?.join(",") ?? "",
      emergencyPlanId: row.emergencyPlanId ?? "",
      photosFileIds: row.photosFileIds ?? [],
      videosFileIds: row.videosFileIds ?? [],
      remark: row.remark ?? ""
    });
    setFormOpen(true);
  }

  function openView(row: EmergencyEventRow) {
    setViewing(row);
    setDetailTab("profile");
    void loadTimeline(row.id).catch((error: Error) => setMessage(error.message));
  }

  function closeView() {
    setViewing(null);
    setTimeline([]);
    setDetailTab("profile");
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setSosMode(false);
    setForm(emptyForm);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editing ? `/safety/emergencies/${editing.id}` : sosMode ? "/safety/emergencies/sos" : "/safety/emergencies";
    await apiRequest<EmergencyEventRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "safety-emergency-update" : sosMode ? "safety-emergency-sos" : "safety-emergency-create"),
      body: buildPayload(form, sosMode)
    });
    setMessage(editing ? "应急事件已更新" : sosMode ? "SOS 应急事件已上报" : "应急事件已上报");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: EmergencyEventRow) {
    if (!window.confirm(`确认删除应急事件 ${row.emergencyCode}？仅误报或已取消事件允许删除。`)) return;
    await apiRequest<{ id: string }>(`/safety/emergencies/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-emergency-delete")
    });
    setMessage("应急事件已删除");
    await load(pageData.page);
  }

  function openAction(row: EmergencyEventRow, mode: ActionMode) {
    setActing({ row, mode });
    setActionForm(emptyActionForm);
  }

  function closeAction() {
    setActing(null);
    setActionForm(emptyActionForm);
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acting) return;
    if (acting.mode === "cancel" && !actionForm.reason.trim()) {
      setMessage("取消 / 误报必须填写原因");
      return;
    }
    if (acting.mode === "review" && !actionForm.conclusion.trim()) {
      setMessage("复盘必须填写结论");
      return;
    }
    const body = acting.mode === "review"
      ? {
        conclusion: actionForm.conclusion.trim(),
        review_file_id: actionForm.reviewFileId || undefined
      }
      : {
        reason: actionForm.reason.trim() || undefined
      };
    const response = await apiRequest<EmergencyEventRow>(`/safety/emergencies/${acting.row.id}/${acting.mode}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`safety-emergency-${acting.mode}`),
      body
    });
    setMessage(`${actionModeLabel(acting.mode)}已完成`);
    setViewing(response.data);
    closeAction();
    await loadTimeline(response.data.id);
    await load(pageData.page);
  }

  function openTimelineLog() {
    setTimelineLogForm(emptyTimelineLogForm);
    setTimelineLogOpen(true);
  }

  function closeTimelineLog() {
    setTimelineLogOpen(false);
    setTimelineLogForm(emptyTimelineLogForm);
  }

  async function submitTimelineLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewing) return;
    if (!timelineLogForm.content.trim()) {
      setMessage("处置记录内容必填");
      return;
    }
    const response = await apiRequest<EmergencyTimelineRow>(`/safety/emergencies/${viewing.id}/timeline`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-emergency-add-timeline"),
      body: {
        content: timelineLogForm.content.trim(),
        reason: timelineLogForm.reason.trim() || undefined,
        attachment_file_ids: timelineLogForm.attachmentFileIds,
        gps_lng: timelineLogForm.gpsLng === "" ? undefined : Number(timelineLogForm.gpsLng),
        gps_lat: timelineLogForm.gpsLat === "" ? undefined : Number(timelineLogForm.gpsLat)
      }
    });
    setTimeline((current) => [response.data, ...current]);
    setMessage("处置记录已追加");
    closeTimelineLog();
    await loadTimeline(viewing.id);
  }

  function openCreateWorkOrder(row: EmergencyEventRow) {
    setCreatingWorkOrder(row);
    setCreateWorkOrderForm({
      title: `${row.title}后续处置工单`,
      woType: workOrderTypes.find((item) => item.itemValue === "repair")?.itemValue ?? workOrderTypes[0]?.itemValue ?? "repair",
      priority: workOrderPriorities.find((item) => item.itemValue === "high")?.itemValue ?? workOrderPriorities[0]?.itemValue ?? "high",
      urgency: workOrderUrgencies.find((item) => item.itemValue === "urgent")?.itemValue ?? workOrderUrgencies[0]?.itemValue ?? "urgent",
      assigneeId: "",
      description: `应急事件处置后的维修清理任务：${row.title}`
    });
  }

  function closeCreateWorkOrder() {
    setCreatingWorkOrder(null);
    setCreateWorkOrderForm(emptyCreateWorkOrderForm);
  }

  async function submitCreateWorkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creatingWorkOrder) return;
    if (!createWorkOrderForm.title.trim() || !createWorkOrderForm.description.trim()) {
      setMessage("工单标题和描述必填");
      return;
    }
    const response = await apiRequest<CreateWorkOrderResponse>(`/safety/emergencies/${creatingWorkOrder.id}/create-work-order`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-emergency-create-workorder"),
      body: {
        title: createWorkOrderForm.title.trim(),
        wo_type: createWorkOrderForm.woType || undefined,
        priority: createWorkOrderForm.priority,
        urgency: createWorkOrderForm.urgency,
        assignee_id: createWorkOrderForm.assigneeId || undefined,
        description: createWorkOrderForm.description.trim()
      }
    });
    setMessage(`已生成工单 ${response.data.work_order.woCode}`);
    setViewing(response.data.emergency);
    closeCreateWorkOrder();
    await loadTimeline(response.data.emergency.id);
    await load(pageData.page);
  }

  function setFormValue<K extends keyof EventForm>(key: K, value: EventForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleUploaded(kind: "photosFileIds" | "videosFileIds", file: FileRecord) {
    setForm((current) => ({
      ...current,
      [kind]: [...new Set([...current[kind], file.id])]
    }));
  }

  return (
    <PermissionGuard module={SAFETY_MODULE} permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>应急事件</h1>
            <p>人工上报和 SOS 一键上报，关联预案、位置、租户企业和现场附件。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="secondary-button danger" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_SOS} type="button" onClick={() => openCreate(true)}>
              <Siren size={16} />
              一键上报
            </PermissionButton>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CREATE} type="button" onClick={() => openCreate(false)}>
              <Plus size={16} />
              新增事件
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="编号 / 标题 / 位置" />
          </Field>
          <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <SelectField label="事件类型" value={filters.incidentType} items={incidentTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, incidentType: value }))} />
          <SelectField label="严重等级" value={filters.severityLevel} items={severityLevels} allLabel="全部等级" onChange={(value) => setFilters((current) => ({ ...current, severityLevel: value }))} />
          <SelectField label="来源" value={filters.sourceType} items={sourceTypes} allLabel="全部来源" onChange={(value) => setFilters((current) => ({ ...current, sourceType: value }))} />
          <ReferenceSelect label="楼栋" value={filters.buildingId} allLabel="全部楼栋" items={buildings.map((item) => ({ id: item.id, label: `${item.buildingCode} ${item.buildingName}` }))} onChange={(value) => setFilters((current) => ({ ...current, buildingId: value }))} />
          <ReferenceSelect label="房源" value={filters.unitId} allLabel="全部房源" items={units.map((item) => ({ id: item.id, label: `${item.unitCode} ${item.unitName}` }))} onChange={(value) => setFilters((current) => ({ ...current, unitId: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">事件列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable className="safety-emergencies-table allow-horizontal-table">
            <thead>
              <tr>
                <th>事件编号</th>
                <th>标题</th>
                <th>类型</th>
                <th>严重等级</th>
                <th>响应级别</th>
                <th>状态</th>
                <th>位置</th>
                <th>上报人</th>
                <th>预案</th>
                <th>附件</th>
                <th>上报时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.emergencyCode}</td>
                  <td>{row.title}</td>
                  <td><StatusPill dictCode="safety_emergency_incident_type" value={row.incidentType} dicts={dicts} /></td>
                  <td><StatusPill dictCode="safety_emergency_severity" value={row.severityLevel} dicts={dicts} /></td>
                  <td><StatusPill dictCode="safety_emergency_response_level" value={row.responseLevel} dicts={dicts} /></td>
                  <td><StatusPill dictCode="safety_emergency_status" value={row.status} dicts={dicts} /></td>
                  <td>{row.location}</td>
                  <td>{row.reporterName ?? "-"} {securedEventField(authUser, "reporter_mobile", row.reporterMobile)}</td>
                  <td>{row.emergencyPlan?.planName ?? "-"}</td>
                  <td><Paperclip size={14} /> {eventAttachmentSummary(authUser, row)}</td>
                  <td>{formatDateTime(row.reportTime)}</td>
                  <td>
                    <DataTableActions>
                      <button className="table-action-button" type="button" onClick={() => openView(row)}><Eye size={16} />查看</button>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_UPDATE} type="button" onClick={() => openEdit(row)}><Edit3 size={16} />编辑</PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} />删除</PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={12}><EmptyState /></td></tr> : null}
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
          <Drawer size="lg" onClose={closeForm}>
            <DrawerHeader
              eyebrow="现场安全"
              title={editing ? "编辑应急事件" : sosMode ? "一键上报应急事件" : "新增应急事件"}
              description="本轮仅做站内业务留痕，不发送真实短信、企微或邮件。"
              onClose={closeForm}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                {!sosMode ? (
                  <Field label="事件编号">
                    <input value={form.emergencyCode} onChange={(event) => setFormValue("emergencyCode", event.target.value)} placeholder="留空自动生成" />
                  </Field>
                ) : null}
                <Field label="事件标题">
                  <input required value={form.title} onChange={(event) => setFormValue("title", event.target.value)} />
                </Field>
                <SelectField label="事件类型" value={form.incidentType} items={incidentTypes} allLabel="请选择类型" required onChange={(value) => setFormValue("incidentType", value)} />
                <SelectField label="严重等级" value={form.severityLevel} items={severityLevels} allLabel="请选择等级" required onChange={(value) => setFormValue("severityLevel", value)} />
                {!sosMode ? (
                  <SelectField label="响应级别" value={form.responseLevel} items={responseLevels} allLabel="请选择级别" onChange={(value) => setFormValue("responseLevel", value)} />
                ) : null}
                {!sosMode ? (
                  <SelectField label="事件来源" value={form.sourceType} items={sourceTypes} allLabel="请选择来源" onChange={(value) => setFormValue("sourceType", value || "manual")} />
                ) : null}
                <Field label="位置">
                  <input required value={form.location} onChange={(event) => setFormValue("location", event.target.value)} />
                </Field>
                <ReferenceSelect label="楼栋" value={form.buildingId} allLabel="不关联楼栋" items={buildings.map((item) => ({ id: item.id, label: `${item.buildingCode} ${item.buildingName}` }))} onChange={(value) => setFormValue("buildingId", value)} />
                <ReferenceSelect label="房源" value={form.unitId} allLabel="不关联房源" items={units.map((item) => ({ id: item.id, label: `${item.unitCode} ${item.unitName}` }))} onChange={(value) => setFormValue("unitId", value)} />
                <ReferenceSelect label="租户企业" value={form.parkTenantId} allLabel="不关联租户企业" items={parkTenants.map((item) => ({ id: item.id, label: `${item.parkTenantCode ?? ""} ${item.companyName}` }))} onChange={(value) => setFormValue("parkTenantId", value)} />
                <Field label="GPS 经度">
                  <input type="number" value={form.gpsLng} disabled={!canEditEventField(authUser, "gps_lng")} onFocus={(event) => event.target.select()} onChange={(event) => setFormValue("gpsLng", event.target.value)} />
                </Field>
                <Field label="GPS 纬度">
                  <input type="number" value={form.gpsLat} disabled={!canEditEventField(authUser, "gps_lat")} onFocus={(event) => event.target.select()} onChange={(event) => setFormValue("gpsLat", event.target.value)} />
                </Field>
                {!sosMode ? (
                  <ReferenceSelect label="应急预案" value={form.emergencyPlanId} allLabel="自动匹配预案" items={plans.map((item) => ({ id: item.id, label: `${item.planCode} ${item.planName}` }))} onChange={(value) => setFormValue("emergencyPlanId", value)} />
                ) : null}
                {!sosMode ? (
                  <ReferenceSelect label="指挥人" value={form.commanderId} allLabel="不指定" items={users.map((item) => ({ id: item.id, label: userLabel(item) }))} onChange={(value) => setFormValue("commanderId", value)} />
                ) : null}
                <Field label="上报人">
                  <input value={form.reporterName} onChange={(event) => setFormValue("reporterName", event.target.value)} placeholder="默认当前用户" />
                </Field>
                <Field label="上报电话">
                  <input value={form.reporterMobile} disabled={!canEditEventField(authUser, "reporter_mobile")} onChange={(event) => setFormValue("reporterMobile", event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="事件描述">
                  <textarea required value={form.description} disabled={!canEditEventField(authUser, "description")} onChange={(event) => setFormValue("description", event.target.value)} />
                </Field>
                {!sosMode ? (
                  <Field label="响应团队用户">
                    <input value={form.responseTeamUserIds} onChange={(event) => setFormValue("responseTeamUserIds", event.target.value)} placeholder="用户 ID，逗号分隔" />
                  </Field>
                ) : null}
                <Field label="现场照片">
                  {canEditEventField(authUser, "photos_file_ids") ? <FileUploader bizType="safety_emergency_event" onUploaded={(file) => handleUploaded("photosFileIds", file)} /> : null}
                  <span className="status-pill">已选择 {form.photosFileIds.length} 张照片</span>
                </Field>
                <Field label="现场视频">
                  {canEditEventField(authUser, "videos_file_ids") ? <FileUploader bizType="safety_emergency_event" onUploaded={(file) => handleUploaded("videosFileIds", file)} /> : null}
                  <span className="status-pill">已选择 {form.videosFileIds.length} 个视频</span>
                </Field>
                {!sosMode ? (
                  <Field label="备注">
                    <textarea value={form.remark} onChange={(event) => setFormValue("remark", event.target.value)} />
                  </Field>
                ) : null}
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeForm}>取消</button>
                <button className={sosMode ? "secondary-button danger" : "primary-button"} type="submit">
                  {sosMode ? <Siren size={16} /> : <AlertTriangle size={16} />}
                  {sosMode ? "确认上报" : "保存"}
                </button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {viewing ? (
          <Drawer size="lg" onClose={closeView}>
            <DrawerHeader
              eyebrow="应急事件详情"
              title={viewing.title}
              description={`${viewing.emergencyCode} · ${labelFor(incidentTypes, viewing.incidentType)} · ${formatDateTime(viewing.reportTime)}`}
              onClose={closeView}
            />
            <p className="muted-text">
              当前状态：{labelFor(statusItems, viewing.status)}。{emergencyActionHint(viewing.status)}
            </p>
            <DrawerActions>
              {canOpenEmergencyAction(viewing.status, "respond") ? (
                <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_RESPOND} type="button" onClick={() => openAction(viewing, "respond")}>
                  <ShieldCheck size={16} />
                  响应
                </PermissionButton>
              ) : null}
              {canOpenEmergencyAction(viewing.status, "start-disposal") ? (
                <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_DISPOSE} type="button" onClick={() => openAction(viewing, "start-disposal")}>
                  <PlayCircle size={16} />
                  开始处置
                </PermissionButton>
              ) : null}
              {canOpenEmergencyAction(viewing.status, "control") ? (
                <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CONTROL} type="button" onClick={() => openAction(viewing, "control")}>
                  <CheckCircle2 size={16} />
                  已控制
                </PermissionButton>
              ) : null}
              {canOpenEmergencyAction(viewing.status, "review") ? (
                <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_REVIEW} type="button" onClick={() => openAction(viewing, "review")}>
                  <ClipboardCheck size={16} />
                  复盘
                </PermissionButton>
              ) : null}
              {canOpenEmergencyAction(viewing.status, "close") ? (
                <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CLOSE} type="button" onClick={() => openAction(viewing, "close")}>
                  <CheckCircle2 size={16} />
                  关闭
                </PermissionButton>
              ) : null}
              {canOpenEmergencyAction(viewing.status, "upgrade") ? (
                <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_UPGRADE} type="button" onClick={() => openAction(viewing, "upgrade")}>
                  <ArrowUpCircle size={16} />
                  升级
                </PermissionButton>
              ) : null}
              {canOpenEmergencyAction(viewing.status, "cancel") ? (
                <PermissionButton className="secondary-button danger" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CANCEL} type="button" onClick={() => openAction(viewing, "cancel")}>
                  <XCircle size={16} />
                  取消 / 误报
                </PermissionButton>
              ) : null}
              <PermissionGuard module="workorder" permission={SYSTEM_PERMISSIONS.WORKORDER_CREATE}>
                {canCreateEmergencyWorkOrder(viewing.status) ? (
                  <PermissionButton
                    className="secondary-button"
                    permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CREATE_WORKORDER}
                    type="button"
                    onClick={() => openCreateWorkOrder(viewing)}
                  >
                    <Wrench size={16} />
                    转工单
                  </PermissionButton>
                ) : null}
              </PermissionGuard>
              {!hasEmergencyVisibleActions(viewing.status) ? <span className="muted-text">当前状态暂无可执行动作</span> : null}
            </DrawerActions>
            <DrawerTabs>
              <DrawerTabButton active={detailTab === "profile"} onClick={() => setDetailTab("profile")}>基础信息</DrawerTabButton>
              <DrawerTabButton active={detailTab === "timeline"} onClick={() => {
                setDetailTab("timeline");
                void loadTimeline(viewing.id).catch((error: Error) => setMessage(error.message));
              }}>事件时间线</DrawerTabButton>
            </DrawerTabs>
            {detailTab === "profile" ? (
              <DrawerDetailGrid>
                <DrawerDetailItem label="事件编号" value={viewing.emergencyCode} />
                <DrawerDetailItem label="事件类型" value={<StatusPill dictCode="safety_emergency_incident_type" value={viewing.incidentType} dicts={dicts} />} />
                <DrawerDetailItem label="严重等级" value={<StatusPill dictCode="safety_emergency_severity" value={viewing.severityLevel} dicts={dicts} />} />
                <DrawerDetailItem label="响应级别" value={<StatusPill dictCode="safety_emergency_response_level" value={viewing.responseLevel} dicts={dicts} />} />
                <DrawerDetailItem label="状态" value={<StatusPill dictCode="safety_emergency_status" value={viewing.status} dicts={dicts} />} />
                <DrawerDetailItem label="来源" value={<StatusPill dictCode="safety_emergency_source_type" value={viewing.sourceType} dicts={dicts} />} />
                <DrawerDetailItem label="位置" value={viewing.location} />
                <DrawerDetailItem label="定位" value={eventGpsSummary(authUser, viewing)} />
                <DrawerDetailItem label="租户企业" value={viewing.parkTenant?.companyName ?? "-"} />
                <DrawerDetailItem label="房源" value={viewing.unit ? `${viewing.unit.unitCode} ${viewing.unit.unitName}` : "-"} />
                <DrawerDetailItem label="上报人" value={viewing.reporterName ?? "-"} />
                <DrawerDetailItem label="上报电话" value={securedEventField(authUser, "reporter_mobile", viewing.reporterMobile)} />
                <DrawerDetailItem label="指挥人" value={viewing.commanderName ?? "-"} />
                <DrawerDetailItem label="应急预案" value={viewing.emergencyPlan?.planName ?? "-"} />
                <DrawerDetailItem label="响应时间" value={formatDateTime(viewing.responseTime)} />
                <DrawerDetailItem label="控制时间" value={formatDateTime(viewing.controlTime)} />
                <DrawerDetailItem label="关闭时间" value={formatDateTime(viewing.closeTime)} />
                <DrawerDetailItem label="取消时间" value={formatDateTime(viewing.cancelTime)} />
                <DrawerDetailItem label="附件" value={eventAttachmentSummary(authUser, viewing)} />
                <DrawerDetailItem label="复盘报告" value={canViewEventField(authUser, "review_file_id") ? viewing.reviewFileId ? "已上传" : "-" : "-"} />
                <DrawerDetailItem label="复盘结论" value={securedEventField(authUser, "conclusion", viewing.conclusion)} />
                <DrawerDetailItem label="描述" value={securedEventField(authUser, "description", viewing.description)} />
                <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
              </DrawerDetailGrid>
            ) : (
              <section className="work-panel">
                <div className="task-item">
                  <h3 className="panel-title">事件时间线</h3>
                  <div className="button-group">
                    <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_TIMELINE_CREATE} type="button" onClick={openTimelineLog}>
                      <Plus size={16} />
                      追加记录
                    </PermissionButton>
                    <button className="secondary-button" type="button" onClick={() => void loadTimeline(viewing.id).catch((error: Error) => setMessage(error.message))}>
                      <RefreshCw size={16} />
                      刷新
                    </button>
                  </div>
                </div>
                <div className="timeline-list">
                  {timeline.map((log) => (
                    <article className="timeline-item" key={log.id}>
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <div className="timeline-head">
                          <strong>{emergencyActionLabel(log.action)}</strong>
                          <span>{formatDateTime(log.opTime)}</span>
                        </div>
                        <p>{log.operatorName ?? "-"}</p>
                        <p className="muted-text">
                          状态：{labelFor(statusItems, log.beforeStatus)} → {labelFor(statusItems, log.afterStatus)}
                        </p>
                        {log.reason ? <p>{log.reason}</p> : null}
                        {log.content ? <p>{log.content}</p> : null}
                        {log.attachmentFileIds?.length ? <p className="muted-text">附件 {log.attachmentFileIds.length} 个</p> : null}
                        {log.gpsLng && log.gpsLat ? <p className="muted-text">定位：{log.gpsLng}, {log.gpsLat}</p> : null}
                      </div>
                    </article>
                  ))}
                  {timeline.length === 0 ? <p className="muted-text">暂无事件时间线</p> : null}
                </div>
              </section>
            )}
          </Drawer>
        ) : null}

        {acting ? (
          <Drawer size="md" onClose={closeAction}>
            <DrawerHeader
              eyebrow="现场安全"
              title={actionModeLabel(acting.mode)}
              description={actionModeDescription(acting.mode)}
              onClose={closeAction}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitAction(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                {acting.mode === "review" ? (
                  <>
                    <Field label="复盘结论">
                      <textarea required value={actionForm.conclusion} onChange={(event) => setActionForm((current) => ({ ...current, conclusion: event.target.value }))} placeholder="请填写事件原因、处置结果和整改结论" />
                    </Field>
                    <Field label="复盘报告">
                      <FileUploader bizType="safety_emergency_review" onUploaded={(file) => setActionForm((current) => ({ ...current, reviewFileId: file.id }))} />
                      <span className="status-pill">{actionForm.reviewFileId ? "已选择 1 个复盘报告" : "未选择复盘报告"}</span>
                    </Field>
                  </>
                ) : (
                  <Field label={acting.mode === "cancel" ? "取消 / 误报原因" : "操作意见"}>
                    <textarea required={acting.mode === "cancel"} value={actionForm.reason} onChange={(event) => setActionForm((current) => ({ ...current, reason: event.target.value }))} placeholder={acting.mode === "cancel" ? "请填写取消或误报原因" : "可填写处置意见"} />
                  </Field>
                )}
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeAction}>取消</button>
                <button className={acting.mode === "cancel" ? "secondary-button danger" : "primary-button"} type="submit">
                  {actionModeIcon(acting.mode)}
                  确认
                </button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {timelineLogOpen && viewing ? (
          <Drawer size="md" onClose={closeTimelineLog}>
            <DrawerHeader
              eyebrow="现场安全"
              title="追加处置记录"
              description={viewing.emergencyCode}
              onClose={closeTimelineLog}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitTimelineLog(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="处置内容">
                  <textarea
                    required
                    value={timelineLogForm.content}
                    onChange={(event) => setTimelineLogForm((current) => ({ ...current, content: event.target.value }))}
                    placeholder="记录现场处置过程、沟通结果、当前进展"
                  />
                </Field>
                <Field label="原因 / 说明">
                  <textarea
                    value={timelineLogForm.reason}
                    onChange={(event) => setTimelineLogForm((current) => ({ ...current, reason: event.target.value }))}
                    placeholder="可填写补充说明"
                  />
                </Field>
                <Field label="现场附件">
                  <FileUploader
                    bizType="safety_emergency_timeline"
                    onUploaded={(file) => setTimelineLogForm((current) => ({
                      ...current,
                      attachmentFileIds: [...current.attachmentFileIds, file.id]
                    }))}
                  />
                  <span className="status-pill">已选择 {timelineLogForm.attachmentFileIds.length} 个附件</span>
                </Field>
                <div className="form-grid two">
                  <Field label="经度">
                    <input
                      type="number"
                      value={timelineLogForm.gpsLng}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => setTimelineLogForm((current) => ({ ...current, gpsLng: event.target.value }))}
                      placeholder="可选"
                    />
                  </Field>
                  <Field label="纬度">
                    <input
                      type="number"
                      value={timelineLogForm.gpsLat}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => setTimelineLogForm((current) => ({ ...current, gpsLat: event.target.value }))}
                      placeholder="可选"
                    />
                  </Field>
                </div>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeTimelineLog}>取消</button>
                <button className="primary-button" type="submit">
                  <Plus size={16} />
                  追加记录
                </button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {creatingWorkOrder ? (
          <Drawer size="md" onClose={closeCreateWorkOrder}>
            <DrawerHeader
              eyebrow="现场安全"
              title="应急事件转工单"
              description={`${creatingWorkOrder.emergencyCode} · 创建后会写入工单日志和事件时间线`}
              onClose={closeCreateWorkOrder}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitCreateWorkOrder(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="工单标题">
                  <input
                    required
                    value={createWorkOrderForm.title}
                    onChange={(event) => setCreateWorkOrderForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </Field>
                <SelectField
                  label="工单类型"
                  value={createWorkOrderForm.woType}
                  items={workOrderTypes}
                  allLabel="请选择类型"
                  required
                  onChange={(value) => setCreateWorkOrderForm((current) => ({ ...current, woType: value }))}
                />
                <SelectField
                  label="优先级"
                  value={createWorkOrderForm.priority}
                  items={workOrderPriorities}
                  allLabel="请选择优先级"
                  required
                  onChange={(value) => setCreateWorkOrderForm((current) => ({ ...current, priority: value }))}
                />
                <SelectField
                  label="紧急程度"
                  value={createWorkOrderForm.urgency}
                  items={workOrderUrgencies}
                  allLabel="请选择紧急程度"
                  required
                  onChange={(value) => setCreateWorkOrderForm((current) => ({ ...current, urgency: value }))}
                />
                <ReferenceSelect
                  label="处理人"
                  value={createWorkOrderForm.assigneeId}
                  allLabel="暂不指定处理人"
                  items={users.map((item) => ({ id: item.id, label: userLabel(item) }))}
                  onChange={(value) => setCreateWorkOrderForm((current) => ({ ...current, assigneeId: value }))}
                />
                <Field label="工单描述">
                  <textarea
                    required
                    value={createWorkOrderForm.description}
                    onChange={(event) => setCreateWorkOrderForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeCreateWorkOrder}>取消</button>
                <button className="primary-button" type="submit">
                  <ExternalLink size={16} />
                  生成工单
                </button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function buildPayload(form: EventForm, sosMode: boolean) {
  const payload = {
    emergency_code: sosMode ? undefined : form.emergencyCode.trim() || undefined,
    source_type: sosMode ? undefined : form.sourceType || "manual",
    incident_type: form.incidentType,
    severity_level: form.severityLevel,
    response_level: form.responseLevel || undefined,
    title: form.title.trim(),
    description: form.description.trim(),
    building_id: form.buildingId || undefined,
    unit_id: form.unitId || undefined,
    park_tenant_id: form.parkTenantId || undefined,
    location: form.location.trim(),
    gps_lng: form.gpsLng === "" ? undefined : Number(form.gpsLng),
    gps_lat: form.gpsLat === "" ? undefined : Number(form.gpsLat),
    reporter_name: form.reporterName.trim() || undefined,
    reporter_mobile: form.reporterMobile.trim() || undefined,
    commander_id: sosMode ? undefined : form.commanderId || undefined,
    commander_name: sosMode ? undefined : form.commanderName.trim() || undefined,
    response_team_user_ids: sosMode ? undefined : form.responseTeamUserIds.split(",").map((item) => item.trim()).filter(Boolean),
    emergency_plan_id: sosMode ? undefined : form.emergencyPlanId || undefined,
    photos_file_ids: form.photosFileIds,
    videos_file_ids: form.videosFileIds,
    remark: sosMode ? undefined : form.remark.trim() || undefined
  };
  return payload;
}

function actionModeLabel(mode: ActionMode) {
  const labels: Record<ActionMode, string> = {
    respond: "响应事件",
    "start-disposal": "开始处置",
    control: "标记已控制",
    review: "提交复盘",
    close: "关闭事件",
    upgrade: "升级事件",
    cancel: "取消 / 误报"
  };
  return labels[mode];
}

function actionModeDescription(mode: ActionMode) {
  const descriptions: Record<ActionMode, string> = {
    respond: "已上报事件响应后进入响应中，并记录响应时间。",
    "start-disposal": "响应中事件进入处置中，升级事件也可继续处置。",
    control: "处置中事件标记已控制，并记录控制时间。",
    review: "已控制事件提交复盘结论，可上传复盘报告。",
    close: "复盘完成后关闭事件，形成应急闭环。",
    upgrade: "将事件升级，升级后仍可继续处置。",
    cancel: "取消或误报必须填写原因。"
  };
  return descriptions[mode];
}

function actionModeIcon(mode: ActionMode) {
  const icons: Record<ActionMode, ReactNode> = {
    respond: <ShieldCheck size={16} />,
    "start-disposal": <PlayCircle size={16} />,
    control: <CheckCircle2 size={16} />,
    review: <ClipboardCheck size={16} />,
    close: <CheckCircle2 size={16} />,
    upgrade: <ArrowUpCircle size={16} />,
    cancel: <XCircle size={16} />
  };
  return icons[mode];
}

function canOpenEmergencyAction(status: string, action: ActionMode) {
  const rules: Record<ActionMode, boolean> = {
    respond: status === "10",
    "start-disposal": ["20", "80"].includes(status),
    control: ["30", "80"].includes(status),
    review: status === "40",
    close: status === "50",
    upgrade: !["60", "80", "90", "91"].includes(status),
    cancel: !["60", "90", "91"].includes(status)
  };
  return rules[action];
}

function canCreateEmergencyWorkOrder(status: string) {
  return !["90", "91"].includes(status);
}

function hasEmergencyVisibleActions(status: string) {
  return ([
    "respond",
    "start-disposal",
    "control",
    "review",
    "close",
    "upgrade",
    "cancel"
  ] as ActionMode[]).some((action) => canOpenEmergencyAction(status, action)) || canCreateEmergencyWorkOrder(status);
}

function emergencyActionHint(status: string) {
  const hints: Record<string, string> = {
    "10": "下一步可先响应事件。",
    "20": "事件已响应，可继续开始处置。",
    "30": "处置推进中，可在风险受控后标记已控制。",
    "40": "现场已控制，下一步进入复盘。",
    "50": "复盘完成后可关闭事件。",
    "60": "事件已关闭，仅保留查看记录。",
    "80": "事件已升级，可继续处置或标记已控制。",
    "90": "事件已作废，不能再转工单或继续流转。",
    "91": "事件已取消，不能再转工单或继续流转。"
  };
  return hints[status] ?? "请按当前状态推进下一步动作。";
}

function emergencyActionLabel(action: string) {
  const labels: Record<string, string> = {
    create: "事件上报",
    update: "更新",
    delete: "删除",
    respond: "响应",
    start_disposal: "开始处置",
    control: "已控制",
    review: "复盘",
    close: "关闭",
    upgrade: "升级",
    cancel: "取消 / 误报",
    create_workorder: "转工单"
  };
  return labels[action] ?? action;
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

function ReferenceSelect({
  label,
  value,
  items,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  items: Array<{ id: string; label: string }>;
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
  );
}

function labelFor(items: DictItemRow[], value?: string | null) {
  if (!value) return "-";
  return items.find((item) => String(item.itemValue) === String(value))?.itemLabel ?? value;
}

function userLabel(row: UserRow) {
  return row.displayName ?? row.realName ?? row.username;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

async function safeFetchPage<T>(path: string): Promise<T[]> {
  try {
    const response = await apiRequest<PaginatedResult<T>>(path, { token: getAccessToken() });
    return response.data.items;
  } catch {
    return [];
  }
}

function canViewEventField(authUser: ReturnType<typeof useAuthUser>, field: string): boolean {
  return canViewField(authUser, SAFETY_MODULE, EVENT_ENTITY, field);
}

function canEditEventField(authUser: ReturnType<typeof useAuthUser>, field: string): boolean {
  return canEditField(authUser, SAFETY_MODULE, EVENT_ENTITY, field);
}

function securedEventField(authUser: ReturnType<typeof useAuthUser>, field: string, value: unknown): string {
  if (!canViewEventField(authUser, field)) return "-";
  const masked = maskField(authUser, SAFETY_MODULE, EVENT_ENTITY, field, value);
  return masked === null || masked === undefined || masked === "" ? "-" : String(masked);
}

function eventAttachmentSummary(authUser: ReturnType<typeof useAuthUser>, event: Pick<EmergencyEventRow, "photosFileIds" | "videosFileIds">): string {
  const canViewPhotos = canViewEventField(authUser, "photos_file_ids");
  const canViewVideos = canViewEventField(authUser, "videos_file_ids");
  if (!canViewPhotos && !canViewVideos) return "-";
  const photoText = canViewPhotos ? `${event.photosFileIds?.length ?? 0} 张照片` : "照片已隐藏";
  const videoText = canViewVideos ? `${event.videosFileIds?.length ?? 0} 个视频` : "视频已隐藏";
  return `${photoText} / ${videoText}`;
}

function eventGpsSummary(authUser: ReturnType<typeof useAuthUser>, event: Pick<EmergencyEventRow, "gpsLng" | "gpsLat">): string {
  const lng = securedEventField(authUser, "gps_lng", event.gpsLng);
  const lat = securedEventField(authUser, "gps_lat", event.gpsLat);
  if (lng === "-" && lat === "-") return "-";
  return `${lng}, ${lat}`;
}

function EmptyState() {
  return <p className="muted-text">暂无应急事件</p>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <h1>403</h1>
        <p>无权访问应急事件，或当前租户未开通安全应急能力。</p>
      </Card>
    </main>
  );
}
