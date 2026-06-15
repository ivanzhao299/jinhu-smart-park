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
import type { FileRecord, PaginatedResult } from "@jinhu/shared";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { CheckCircle2, Edit3, ExternalLink, Eye, Plus, RefreshCw, RotateCcw, Search, Send, ShieldCheck, Siren, Trash2, Wrench, XCircle } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { PermissionButton } from "../auth/PermissionButton";
import { PermissionGuard } from "../auth/PermissionGuard";
import { FileUploader } from "../files/FileUploader";
import { VideoEvidencePanel } from "../video/VideoEvidencePanel";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { useAuthUser } from "../../lib/auth-context";
import { getAccessToken } from "../../lib/authz";
import { canViewField, maskField } from "../../lib/field-policy";

const SAFETY_MODULE = "safety";
const HAZARD_ENTITY = "safety_hazard";

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
  floorCode: string;
  floorName: string;
  buildingId: string;
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

interface UserRow {
  id: string;
  username: string;
  displayName?: string;
  realName?: string;
  status: string;
}

interface HazardRow {
  id: string;
  code: string | null;
  hazardCode: string;
  title: string;
  hazardType: string;
  riskLevel: string;
  sourceType: string;
  sourceId: string | null;
  description: string | null;
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  parkTenantId: string | null;
  location: string;
  beforePhotoFileIds: string[];
  afterPhotoFileIds: string[];
  rectifyUserId: string | null;
  rectifyUserName: string | null;
  rectifyDeadline: string | null;
  rectifyTime: string | null;
  recheckUserId: string | null;
  recheckUserName: string | null;
  recheckTime: string | null;
  recheckResult: string | null;
  overdueFlag: boolean;
  upgradeFlag: boolean;
  workOrderId: string | null;
  status: string;
  updateTime: string;
  remark: string | null;
  building?: BuildingRow | null;
  floor?: FloorRow | null;
  unit?: UnitRow | null;
  parkTenant?: ParkTenantRow | null;
}

interface HazardStatusLogRow {
  id: string;
  beforeStatus: string | null;
  afterStatus: string;
  action: string;
  reason: string | null;
  operatorName: string | null;
  opTime: string;
}

interface HazardForm {
  hazardCode: string;
  title: string;
  hazardType: string;
  riskLevel: string;
  sourceType: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  parkTenantId: string;
  location: string;
  description: string;
  beforePhotoFileIds: string[];
  afterPhotoFileIds: string[];
  rectifyUserId: string;
  rectifyDeadline: string;
  overdueFlag: boolean;
  upgradeFlag: boolean;
  status: string;
  remark: string;
}

interface AssignRectifyForm {
  rectifyUserId: string;
  rectifyDeadline: string;
  reason: string;
}

interface RectifyForm {
  rectifyNote: string;
  afterPhotoFileIds: string[];
}

interface RecheckForm {
  reason: string;
}

interface CreateWorkOrderForm {
  title: string;
  priority: string;
  urgency: string;
  assigneeId: string;
  description: string;
}

interface CreateEmergencyForm {
  incidentType: string;
  severityLevel: string;
  title: string;
  description: string;
  reason: string;
}

interface WorkOrderRow {
  id: string;
  woCode: string;
  title: string;
}

interface CreateWorkOrderResponse {
  hazard: HazardRow;
  work_order: WorkOrderRow;
}

interface EmergencyRow {
  id: string;
  emergencyCode: string;
  title: string;
}

interface CreateEmergencyResponse {
  hazard: HazardRow;
  emergency_id: string;
  emergency: EmergencyRow;
}

interface Filters {
  keyword: string;
  hazardType: string;
  riskLevel: string;
  status: string;
  sourceType: string;
  buildingId: string;
  unitId: string;
  parkTenantId: string;
  overdueOnly: boolean;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<HazardRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = {
  keyword: "",
  hazardType: "",
  riskLevel: "",
  status: "",
  sourceType: "",
  buildingId: "",
  unitId: "",
  parkTenantId: "",
  overdueOnly: false
};
const emptyForm: HazardForm = {
  hazardCode: "",
  title: "",
  hazardType: "",
  riskLevel: "",
  sourceType: "manual",
  buildingId: "",
  floorId: "",
  unitId: "",
  parkTenantId: "",
  location: "",
  description: "",
  beforePhotoFileIds: [],
  afterPhotoFileIds: [],
  rectifyUserId: "",
  rectifyDeadline: "",
  overdueFlag: false,
  upgradeFlag: false,
  status: "10",
  remark: ""
};
const emptyAssignForm: AssignRectifyForm = {
  rectifyUserId: "",
  rectifyDeadline: "",
  reason: ""
};
const emptyRectifyForm: RectifyForm = {
  rectifyNote: "",
  afterPhotoFileIds: []
};
const emptyRecheckForm: RecheckForm = {
  reason: ""
};
const emptyCreateWorkOrderForm: CreateWorkOrderForm = {
  title: "",
  priority: "",
  urgency: "",
  assigneeId: "",
  description: ""
};
const emptyCreateEmergencyForm: CreateEmergencyForm = {
  incidentType: "",
  severityLevel: "",
  title: "",
  description: "",
  reason: ""
};

interface HazardsPageClientProps {
  initialOverdueOnly?: boolean;
}

export function HazardsPageClient({ initialOverdueOnly: forcedOverdueOnly }: HazardsPageClientProps = {}) {
  const authUser = useAuthUser();
  const queryOverdueOnly = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("overdue_only") === "true";
  }, []);
  const initialOverdueOnly = forcedOverdueOnly ?? queryOverdueOnly;
  const [pageData, setPageData] = useState<PaginatedResult<HazardRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(() => ({ ...emptyFilters, overdueOnly: initialOverdueOnly }));
  const [dicts, setDicts] = useState<DictMap>({});
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState<HazardForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HazardRow | null>(null);
  const [viewing, setViewing] = useState<HazardRow | null>(null);
  const [statusLogs, setStatusLogs] = useState<HazardStatusLogRow[]>([]);
  const [assigning, setAssigning] = useState<HazardRow | null>(null);
  const [assignForm, setAssignForm] = useState<AssignRectifyForm>(emptyAssignForm);
  const [rectifying, setRectifying] = useState<HazardRow | null>(null);
  const [rectifyForm, setRectifyForm] = useState<RectifyForm>(emptyRectifyForm);
  const [rechecking, setRechecking] = useState<{ row: HazardRow; result: "pass" | "fail" } | null>(null);
  const [recheckForm, setRecheckForm] = useState<RecheckForm>(emptyRecheckForm);
  const [rejecting, setRejecting] = useState<HazardRow | null>(null);
  const [rejectForm, setRejectForm] = useState<RecheckForm>(emptyRecheckForm);
  const [closing, setClosing] = useState<HazardRow | null>(null);
  const [closeFormState, setCloseFormState] = useState<RecheckForm>(emptyRecheckForm);
  const [creatingWorkOrder, setCreatingWorkOrder] = useState<HazardRow | null>(null);
  const [createWorkOrderForm, setCreateWorkOrderForm] = useState<CreateWorkOrderForm>(emptyCreateWorkOrderForm);
  const [creatingEmergency, setCreatingEmergency] = useState<HazardRow | null>(null);
  const [createEmergencyForm, setCreateEmergencyForm] = useState<CreateEmergencyForm>(emptyCreateEmergencyForm);
  const [emergencyLinks, setEmergencyLinks] = useState<Record<string, EmergencyRow>>({});
  const [message, setMessage] = useState("");
  const initialHazardId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("hazard_id") ?? "";
  }, []);
  const [initialHazardOpened, setInitialHazardOpened] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const hazardTypeItems = dicts.safety_hazard_type ?? [];
  const riskItems = dicts.safety_risk_level ?? [];
  const statusItems = dicts.safety_hazard_status ?? [];
  const sourceItems = dicts.safety_hazard_source_type ?? [];
  const emergencyIncidentItems = dicts.safety_emergency_incident_type ?? [];
  const emergencySeverityItems = dicts.safety_emergency_severity ?? [];
  const workOrderPriorityItems = dicts.workorder_priority ?? [];
  const workOrderUrgencyItems = dicts.workorder_urgency ?? [];
  const canViewLocation = canViewField(authUser, SAFETY_MODULE, HAZARD_ENTITY, "location");
  const canViewDescription = canViewField(authUser, SAFETY_MODULE, HAZARD_ENTITY, "description");
  const canViewBeforePhotos = canViewField(authUser, SAFETY_MODULE, HAZARD_ENTITY, "beforePhotoFileIds");
  const canViewAfterPhotos = canViewField(authUser, SAFETY_MODULE, HAZARD_ENTITY, "afterPhotoFileIds");
  const effectiveOverdueOnly = forcedOverdueOnly === true || filters.overdueOnly;
  const pagePermission = effectiveOverdueOnly ? SYSTEM_PERMISSIONS.SAFETY_HAZARD_OVERDUE : SYSTEM_PERMISSIONS.SAFETY_HAZARD_READ;

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.hazardType) params.set("hazard_type", filters.hazardType);
    if (filters.riskLevel) params.set("risk_level", filters.riskLevel);
    if (filters.status) params.set("status", filters.status);
    if (filters.sourceType) params.set("source_type", filters.sourceType);
    if (filters.buildingId) params.set("building_id", filters.buildingId);
    if (filters.unitId) params.set("unit_id", filters.unitId);
    if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
    const endpoint = effectiveOverdueOnly ? "/safety/hazards/overdue" : "/safety/hazards";
    const response = await apiRequest<PaginatedResult<HazardRow>>(`${endpoint}?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [effectiveOverdueOnly, filters]);

  const loadStatusLogs = useCallback(async (hazardId: string) => {
    const response = await apiRequest<HazardStatusLogRow[]>(`/safety/hazards/${hazardId}/status-logs`, {
      token: getAccessToken()
    });
    setStatusLogs(response.data);
  }, []);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = [
      "safety_hazard_type",
      "safety_risk_level",
      "safety_hazard_status",
      "safety_hazard_source_type",
      "safety_emergency_incident_type",
      "safety_emergency_severity",
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

  const loadReferenceData = useCallback(async () => {
    const [buildingResponse, floorResponse, unitResponse, tenantResponse, userResponse] = await Promise.allSettled([
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<FloorRow>>("/floors?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UnitRow>>("/park-units?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=100", { token: getAccessToken() })
    ]);
    if (buildingResponse.status === "fulfilled") setBuildings(buildingResponse.value.data.items);
    if (floorResponse.status === "fulfilled") setFloors(floorResponse.value.data.items);
    if (unitResponse.status === "fulfilled") setUnits(unitResponse.value.data.items);
    if (tenantResponse.status === "fulfilled") setParkTenants(tenantResponse.value.data.items);
    if (userResponse.status === "fulfilled") setUsers(userResponse.value.data.items.filter((item) => item.status === "enabled"));
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadReferenceData().catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadReferenceData]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    if (!initialHazardId || initialHazardOpened) return;
    setInitialHazardOpened(true);
    void (async () => {
      try {
        const response = await apiRequest<HazardRow>(`/safety/hazards/${initialHazardId}`, {
          token: getAccessToken()
        });
        setViewing(response.data);
        await loadStatusLogs(response.data.id);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "隐患详情加载失败");
      }
    })();
  }, [initialHazardId, initialHazardOpened, loadStatusLogs]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      hazardType: hazardTypeItems[0]?.itemValue ?? "",
      riskLevel: riskItems[0]?.itemValue ?? "",
      sourceType: "manual",
      status: "10"
    });
    setFormOpen(true);
  }

  function openEdit(row: HazardRow) {
    setEditing(row);
    setForm({
      hazardCode: row.hazardCode,
      title: row.title,
      hazardType: row.hazardType,
      riskLevel: row.riskLevel,
      sourceType: row.sourceType,
      buildingId: row.buildingId ?? "",
      floorId: row.floorId ?? "",
      unitId: row.unitId ?? "",
      parkTenantId: row.parkTenantId ?? "",
      location: row.location,
      description: row.description ?? "",
      beforePhotoFileIds: row.beforePhotoFileIds ?? [],
      afterPhotoFileIds: row.afterPhotoFileIds ?? [],
      rectifyUserId: row.rectifyUserId ?? "",
      rectifyDeadline: row.rectifyDeadline ? row.rectifyDeadline.slice(0, 10) : "",
      overdueFlag: row.overdueFlag,
      upgradeFlag: row.upgradeFlag,
      status: row.status,
      remark: row.remark ?? ""
    });
    setFormOpen(true);
  }

  function openAssign(row: HazardRow) {
    setAssigning(row);
    setAssignForm({
      rectifyUserId: row.rectifyUserId ?? "",
      rectifyDeadline: toDateTimeInputValue(row.rectifyDeadline),
      reason: ""
    });
  }

  function openRectify(row: HazardRow) {
    setRectifying(row);
    setRectifyForm({
      rectifyNote: "",
      afterPhotoFileIds: row.afterPhotoFileIds ?? []
    });
  }

  function openRecheck(row: HazardRow, result: "pass" | "fail") {
    setRechecking({ row, result });
    setRecheckForm(emptyRecheckForm);
  }

  function openRejectRectify(row: HazardRow) {
    setRejecting(row);
    setRejectForm(emptyRecheckForm);
  }

  function openClose(row: HazardRow) {
    setClosing(row);
    setCloseFormState(emptyRecheckForm);
  }

  function openCreateWorkOrder(row: HazardRow) {
    setCreatingWorkOrder(row);
    setCreateWorkOrderForm({
      title: row.title,
      priority: workOrderPriorityItems[0]?.itemValue ?? "high",
      urgency: workOrderUrgencyItems[0]?.itemValue ?? "urgent",
      assigneeId: row.rectifyUserId ?? "",
      description: "由隐患整改转工单"
    });
  }

  function openCreateEmergency(row: HazardRow) {
    setCreatingEmergency(row);
    setCreateEmergencyForm({
      incidentType: row.hazardType || emergencyIncidentItems[0]?.itemValue || "",
      severityLevel: row.riskLevel || emergencySeverityItems[0]?.itemValue || "",
      title: row.title,
      description: row.description ?? row.title,
      reason: "重大隐患需启动应急处置"
    });
  }

  function openView(row: HazardRow) {
    setViewing(row);
    void loadStatusLogs(row.id).catch((error: Error) => setMessage(error.message));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editing ? `/safety/hazards/${editing.id}` : "/safety/hazards";
    await apiRequest<HazardRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "safety-hazard-update" : "safety-hazard-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "隐患已更新" : "隐患已登记");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: HazardRow) {
    if (!window.confirm(`确认删除隐患 ${row.title}？`)) return;
    await apiRequest<{ id: string }>(`/safety/hazards/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-hazard-delete")
    });
    setMessage("隐患已删除");
    await load(pageData.page);
  }

  async function submitAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assigning) return;
    const response = await apiRequest<HazardRow>(`/safety/hazards/${assigning.id}/assign-rectify`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-hazard-assign-rectify"),
      body: {
        rectify_user_id: assignForm.rectifyUserId,
        rectify_deadline: assignForm.rectifyDeadline,
        reason: assignForm.reason.trim()
      }
    });
    setMessage("整改已下达");
    setAssigning(null);
    setAssignForm(emptyAssignForm);
    setViewing(response.data);
    await loadStatusLogs(response.data.id);
    await load(pageData.page);
  }

  async function submitRectify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rectifying) return;
    if (rectifyForm.afterPhotoFileIds.length === 0) {
      setMessage("整改完成必须上传至少一张整改后照片");
      return;
    }
    const response = await apiRequest<HazardRow>(`/safety/hazards/${rectifying.id}/rectify`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-hazard-rectify"),
      body: {
        rectify_note: rectifyForm.rectifyNote.trim(),
        after_photo_file_ids: rectifyForm.afterPhotoFileIds
      }
    });
    setMessage("整改已提交");
    setRectifying(null);
    setRectifyForm(emptyRectifyForm);
    setViewing(response.data);
    await loadStatusLogs(response.data.id);
    await load(pageData.page);
  }

  async function submitRecheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rechecking) return;
    const response = await apiRequest<HazardRow>(`/safety/hazards/${rechecking.row.id}/recheck`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-hazard-recheck"),
      body: {
        recheck_result: rechecking.result,
        reason: recheckForm.reason.trim()
      }
    });
    setMessage(rechecking.result === "pass" ? "复查通过，隐患已闭环" : "复查不通过，已退回整改中");
    setRechecking(null);
    setRecheckForm(emptyRecheckForm);
    setViewing(response.data);
    await loadStatusLogs(response.data.id);
    await load(pageData.page);
  }

  async function submitRejectRectify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rejecting) return;
    const response = await apiRequest<HazardRow>(`/safety/hazards/${rejecting.id}/reject-rectify`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-hazard-reject-rectify"),
      body: {
        reason: rejectForm.reason.trim()
      }
    });
    setMessage("隐患已退回整改");
    setRejecting(null);
    setRejectForm(emptyRecheckForm);
    setViewing(response.data);
    await loadStatusLogs(response.data.id);
    await load(pageData.page);
  }

  async function submitClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!closing) return;
    const response = await apiRequest<HazardRow>(`/safety/hazards/${closing.id}/close`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-hazard-close"),
      body: {
        reason: closeFormState.reason.trim()
      }
    });
    setMessage("隐患已关闭");
    setClosing(null);
    setCloseFormState(emptyRecheckForm);
    setViewing(response.data);
    await loadStatusLogs(response.data.id);
    await load(pageData.page);
  }

  async function submitCreateWorkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creatingWorkOrder) return;
    const response = await apiRequest<CreateWorkOrderResponse>(`/safety/hazards/${creatingWorkOrder.id}/create-work-order`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-hazard-create-workorder"),
      body: {
        title: createWorkOrderForm.title.trim(),
        priority: createWorkOrderForm.priority,
        urgency: createWorkOrderForm.urgency,
        assignee_id: createWorkOrderForm.assigneeId || undefined,
        description: createWorkOrderForm.description.trim()
      }
    });
    setMessage(`已创建工单 ${response.data.work_order.woCode}`);
    setCreatingWorkOrder(null);
    setCreateWorkOrderForm(emptyCreateWorkOrderForm);
    setViewing(response.data.hazard);
    await loadStatusLogs(response.data.hazard.id);
    await load(pageData.page);
  }

  async function submitCreateEmergency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creatingEmergency) return;
    const response = await apiRequest<CreateEmergencyResponse>(`/safety/hazards/${creatingEmergency.id}/to-emergency`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-hazard-to-emergency"),
      body: {
        incident_type: createEmergencyForm.incidentType,
        severity_level: createEmergencyForm.severityLevel,
        title: createEmergencyForm.title.trim(),
        description: createEmergencyForm.description.trim(),
        reason: createEmergencyForm.reason.trim()
      }
    });
    setMessage(`已创建应急事件 ${response.data.emergency.emergencyCode}`);
    setCreatingEmergency(null);
    setCreateEmergencyForm(emptyCreateEmergencyForm);
    setEmergencyLinks((current) => ({ ...current, [response.data.hazard.id]: response.data.emergency }));
    setViewing(response.data.hazard);
    await loadStatusLogs(response.data.hazard.id);
    await load(pageData.page);
  }

  function closeForm() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(false);
  }

  function setFormValue<K extends keyof HazardForm>(key: K, value: HazardForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleUploaded(field: "beforePhotoFileIds" | "afterPhotoFileIds", file: FileRecord) {
    setForm((current) => ({ ...current, [field]: [...current[field], file.id] }));
  }

  function handleRectifyUploaded(file: FileRecord) {
    setRectifyForm((current) => ({ ...current, afterPhotoFileIds: [...current.afterPhotoFileIds, file.id] }));
  }

  function renderEmergencyLink(row: HazardRow): ReactNode {
    const linkedEmergency = emergencyLinks[row.id];
    if (linkedEmergency) {
      return <a className="drawer-link" href={`/safety/emergencies?emergency_id=${linkedEmergency.id}`}>{linkedEmergency.emergencyCode}</a>;
    }
    return row.status === "92" ? "已转应急事件" : "未转应急";
  }

  return (
    <PermissionGuard permission={pagePermission} module={SAFETY_MODULE} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>隐患登记</strong>
            <span>登记巡检发现与人工发现的安全隐患，维护风险等级、位置、责任人和整改期限</span>
          </div>
          <div className="page-actions">
            <button className="primary-button secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增隐患
            </PermissionButton>
          </div>
        </header>

        <Card>
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <Field label="关键词">
                <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="编号 / 标题 / 位置" />
              </Field>
              <SelectField label="隐患类型" value={filters.hazardType} items={hazardTypeItems} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, hazardType: value }))} />
              <SelectField label="风险等级" value={filters.riskLevel} items={riskItems} allLabel="全部风险" onChange={(value) => setFilters((current) => ({ ...current, riskLevel: value }))} />
              <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
              <SelectField label="来源" value={filters.sourceType} items={sourceItems} allLabel="全部来源" onChange={(value) => setFilters((current) => ({ ...current, sourceType: value }))} />
              <SelectRefField label="楼栋" value={filters.buildingId} allLabel="全部楼栋" items={buildings.map((item) => ({ id: item.id, label: `${item.buildingCode} ${item.buildingName}` }))} onChange={(value) => setFilters((current) => ({ ...current, buildingId: value }))} />
              <SelectRefField label="房源" value={filters.unitId} allLabel="全部房源" items={units.map((item) => ({ id: item.id, label: `${item.unitCode} ${item.unitName}` }))} onChange={(value) => setFilters((current) => ({ ...current, unitId: value }))} />
              <SelectRefField label="租户企业" value={filters.parkTenantId} allLabel="全部企业" items={parkTenants.map((item) => ({ id: item.id, label: item.companyName }))} onChange={(value) => setFilters((current) => ({ ...current, parkTenantId: value }))} />
              <Field label="超期">
                <label className="form-check-row">
                  <input
                    type="checkbox"
                    checked={effectiveOverdueOnly}
                    disabled={forcedOverdueOnly === true}
                    onChange={(event) => setFilters((current) => ({ ...current, overdueOnly: event.target.checked }))}
                  />
                  仅看超期
                </label>
              </Field>
            </div>
            <div className="filter-actions">
              <button className="primary-button" type="submit">
                <Search size={16} />
                查询
              </button>
            </div>
          </form>
        </Card>

        <Card className="table-scroll">
          <DataTable>
            <thead>
              <tr>
                <th>隐患编号</th>
                <th>标题</th>
                <th>类型</th>
                <th>风险</th>
                <th>来源</th>
                <th>位置</th>
                <th>关联租户</th>
                <th>整改责任人</th>
                <th>整改期限</th>
                <th>超期</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.hazardCode}</td>
                  <td>{row.title}</td>
                  <td><StatusPill dictCode="safety_hazard_type" value={row.hazardType} dicts={dicts} /></td>
                  <td><StatusPill dictCode="safety_risk_level" value={row.riskLevel} dicts={dicts} /></td>
                  <td><StatusPill dictCode="safety_hazard_source_type" value={row.sourceType} dicts={dicts} /></td>
                  <td>{displaySecuredField(authUser, "location", row.location)}</td>
                  <td>{row.parkTenant?.companyName ?? "-"}</td>
                  <td>{row.rectifyUserName ?? "-"}</td>
                  <td>{formatDate(row.rectifyDeadline)}</td>
                  <td>{row.overdueFlag ? <span className="status-pill status-pill-danger">已超期</span> : <span className="status-pill">正常</span>}</td>
                  <td><StatusPill dictCode="safety_hazard_status" value={row.status} dicts={dicts} /></td>
                  <td>
                    <DataTableActions>
                      <button className="row-action-button" type="button" onClick={() => openView(row)} title="查看">
                        <Eye size={16} />
                        查看
                      </button>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_UPDATE} type="button" onClick={() => openEdit(row)} title="编辑">
                        <Edit3 size={16} />
                        编辑
                      </PermissionButton>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_ASSIGN_RECTIFY} type="button" onClick={() => openAssign(row)} title="下达整改">
                        <Send size={16} />
                        下达
                      </PermissionButton>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_RECTIFY} type="button" onClick={() => openRectify(row)} title="整改完成">
                        <CheckCircle2 size={16} />
                        整改
                      </PermissionButton>
                      <PermissionButton className="row-action-button row-action-button-danger" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))} title="删除">
                        <Trash2 size={16} />
                        删除
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={12}><EmptyState /></td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
          <div className="pagination">
            <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
            <button type="button" disabled={pageData.page <= 1} onClick={() => void load(pageData.page - 1).catch((error: Error) => setMessage(error.message))}>上一页</button>
            <button type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
          </div>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        {formOpen ? (
          <Drawer size="md" onClose={closeForm}>
            <DrawerHeader
              eyebrow="安全隐患"
              title={editing ? "编辑隐患" : "新增隐患"}
              description="重大风险需要维护整改期限，照片可先上传后随表单保存。"
              onClose={closeForm}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="隐患编号">
                  <input value={form.hazardCode} onChange={(event) => setFormValue("hazardCode", event.target.value)} placeholder="留空自动生成" />
                </Field>
                <Field label="标题">
                  <input required value={form.title} onChange={(event) => setFormValue("title", event.target.value)} />
                </Field>
                <SelectField label="隐患类型" value={form.hazardType} items={hazardTypeItems} allLabel="请选择类型" required onChange={(value) => setFormValue("hazardType", value)} />
                <SelectField label="风险等级" value={form.riskLevel} items={riskItems} allLabel="请选择风险" required onChange={(value) => setFormValue("riskLevel", value)} />
                <SelectField label="来源" value={form.sourceType} items={sourceItems} allLabel="请选择来源" required onChange={(value) => setFormValue("sourceType", value || "manual")} />
                <SelectField label="状态" value={form.status} items={statusItems} allLabel="请选择状态" required onChange={(value) => setFormValue("status", value || "10")} />
                <SelectRefField label="楼栋" value={form.buildingId} allLabel="不关联楼栋" items={buildings.map((item) => ({ id: item.id, label: `${item.buildingCode} ${item.buildingName}` }))} onChange={(value) => setFormValue("buildingId", value)} />
                <SelectRefField label="楼层" value={form.floorId} allLabel="不关联楼层" items={floors.map((item) => ({ id: item.id, label: `${item.floorCode} ${item.floorName}` }))} onChange={(value) => setFormValue("floorId", value)} />
                <SelectRefField label="房源" value={form.unitId} allLabel="不关联房源" items={units.map((item) => ({ id: item.id, label: `${item.unitCode} ${item.unitName}` }))} onChange={(value) => setFormValue("unitId", value)} />
                <SelectRefField label="租户企业" value={form.parkTenantId} allLabel="不关联企业" items={parkTenants.map((item) => ({ id: item.id, label: item.companyName }))} onChange={(value) => setFormValue("parkTenantId", value)} />
                <Field label="位置">
                  <input required value={form.location} onChange={(event) => setFormValue("location", event.target.value)} />
                </Field>
                <SelectRefField label="整改责任人" value={form.rectifyUserId} allLabel="暂不指定" items={users.map((item) => ({ id: item.id, label: displayUserName(item) }))} onChange={(value) => setFormValue("rectifyUserId", value)} />
                <Field label="整改期限">
                  <input type="date" value={form.rectifyDeadline} onChange={(event) => setFormValue("rectifyDeadline", event.target.value)} />
                </Field>
                <Field label="标记">
                  <label className="form-check-row">
                    <input type="checkbox" checked={form.overdueFlag} onChange={(event) => setFormValue("overdueFlag", event.target.checked)} />
                    已超期
                  </label>
                  <label className="form-check-row">
                    <input type="checkbox" checked={form.upgradeFlag} onChange={(event) => setFormValue("upgradeFlag", event.target.checked)} />
                    已升级
                  </label>
                </Field>
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="隐患描述">
                  <textarea required value={form.description} onChange={(event) => setFormValue("description", event.target.value)} />
                </Field>
                <Field label="整改前照片">
                  <FileUploader bizType="safety_hazard_before" onUploaded={(file) => handleUploaded("beforePhotoFileIds", file)} />
                  <span className="status-pill">已选择 {form.beforePhotoFileIds.length} 个附件</span>
                </Field>
                <Field label="整改后照片">
                  <FileUploader bizType="safety_hazard_after" onUploaded={(file) => handleUploaded("afterPhotoFileIds", file)} />
                  <span className="status-pill">已选择 {form.afterPhotoFileIds.length} 个附件</span>
                </Field>
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
          <Drawer size="md" onClose={() => { setViewing(null); setStatusLogs([]); }}>
            <DrawerHeader
              eyebrow="隐患详情"
              title={viewing.title}
              description={`${viewing.hazardCode} · ${displaySecuredField(authUser, "location", viewing.location)}`}
              onClose={() => { setViewing(null); setStatusLogs([]); }}
            />
            <div className="drawer-action-bar">
              <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_ASSIGN_RECTIFY} type="button" onClick={() => openAssign(viewing)}>
                <Send size={16} />
                下达整改
              </PermissionButton>
              <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_RECTIFY} type="button" onClick={() => openRectify(viewing)}>
                <CheckCircle2 size={16} />
                整改完成
              </PermissionButton>
              {viewing.status === "40" ? (
                <>
                  <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_RECHECK} type="button" onClick={() => openRecheck(viewing, "pass")}>
                    <ShieldCheck size={16} />
                    复查通过
                  </PermissionButton>
                  <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_RECHECK} type="button" onClick={() => openRecheck(viewing, "fail")}>
                    <XCircle size={16} />
                    复查不通过
                  </PermissionButton>
                  <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_REJECT_RECTIFY} type="button" onClick={() => openRejectRectify(viewing)}>
                    <RotateCcw size={16} />
                    退回整改
                  </PermissionButton>
                </>
              ) : null}
              {viewing.status !== "60" ? (
                <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_CLOSE} type="button" onClick={() => openClose(viewing)}>
                  <CheckCircle2 size={16} />
                  关闭
                </PermissionButton>
              ) : null}
              {viewing.status !== "60" && viewing.status !== "92" && ["major", "30", "critical", "40"].includes(viewing.riskLevel ?? "") ? (
                <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_TO_EMERGENCY} type="button" onClick={() => openCreateEmergency(viewing)}>
                  <Siren size={16} />
                  转应急
                </PermissionButton>
              ) : null}
              {viewing.workOrderId ? (
                <a className="drawer-action-button" href={`/workorders/${viewing.workOrderId}`}>
                  <ExternalLink size={16} />
                  查看工单
                </a>
              ) : (
                <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_CREATE} module="workorder">
                  <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_HAZARD_CREATE_WORKORDER} type="button" onClick={() => openCreateWorkOrder(viewing)}>
                    <Wrench size={16} />
                    转工单
                  </PermissionButton>
                </PermissionGuard>
              )}
            </div>
            <DrawerDetailGrid>
              <DrawerDetailItem label="隐患编号" value={viewing.hazardCode} />
              <DrawerDetailItem label="隐患类型" value={<StatusPill dictCode="safety_hazard_type" value={viewing.hazardType} dicts={dicts} />} />
              <DrawerDetailItem label="风险等级" value={<StatusPill dictCode="safety_risk_level" value={viewing.riskLevel} dicts={dicts} />} />
              <DrawerDetailItem label="来源" value={<StatusPill dictCode="safety_hazard_source_type" value={viewing.sourceType} dicts={dicts} />} />
              <DrawerDetailItem label="状态" value={<StatusPill dictCode="safety_hazard_status" value={viewing.status} dicts={dicts} />} />
              <DrawerDetailItem label="位置" value={canViewLocation ? viewing.location : "-"} />
              <DrawerDetailItem label="楼栋" value={viewing.building ? `${viewing.building.buildingCode} ${viewing.building.buildingName}` : "-"} />
              <DrawerDetailItem label="楼层" value={viewing.floor ? `${viewing.floor.floorCode} ${viewing.floor.floorName}` : "-"} />
              <DrawerDetailItem label="房源" value={viewing.unit ? `${viewing.unit.unitCode} ${viewing.unit.unitName}` : "-"} />
              <DrawerDetailItem label="租户企业" value={viewing.parkTenant?.companyName ?? "-"} />
              <DrawerDetailItem label="整改责任人" value={viewing.rectifyUserName ?? "-"} />
              <DrawerDetailItem label="整改期限" value={formatDate(viewing.rectifyDeadline)} />
              <DrawerDetailItem label="整改完成时间" value={formatDateTime(viewing.rectifyTime)} />
              <DrawerDetailItem label="复查人" value={viewing.recheckUserName ?? "-"} />
              <DrawerDetailItem label="复查时间" value={formatDateTime(viewing.recheckTime)} />
              <DrawerDetailItem label="复查结果" value={recheckResultLabel(viewing.recheckResult)} />
              <DrawerDetailItem label="是否超期" value={viewing.overdueFlag ? "是" : "否"} />
              <DrawerDetailItem label="是否升级" value={viewing.upgradeFlag ? "是" : "否"} />
              <DrawerDetailItem label="整改前照片" value={canViewBeforePhotos ? `${viewing.beforePhotoFileIds?.length ?? 0} 个附件` : "-"} />
              <DrawerDetailItem label="整改后照片" value={canViewAfterPhotos ? `${viewing.afterPhotoFileIds?.length ?? 0} 个附件` : "-"} />
              <DrawerDetailItem label="关联工单" value={viewing.workOrderId ? <a className="drawer-link" href={`/workorders/${viewing.workOrderId}`}>查看关联工单</a> : "未转工单"} />
              <DrawerDetailItem label="关联应急" value={renderEmergencyLink(viewing)} />
              <DrawerDetailItem label="隐患描述" value={canViewDescription ? displaySecuredField(authUser, "description", viewing.description) : "-"} />
              <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
            </DrawerDetailGrid>
            <VideoEvidencePanel sourceType="HAZARD" sourceId={viewing.id} canCreate={viewing.status !== "60"} />
            <section className="work-panel">
              <div className="task-item">
                <h3 className="panel-title">整改时间线</h3>
                <button type="button" onClick={() => void loadStatusLogs(viewing.id).catch((error: Error) => setMessage(error.message))}>
                  <RefreshCw size={16} />
                  刷新
                </button>
              </div>
              <div className="timeline-list">
                {statusLogs.map((log) => (
                  <article className="timeline-item" key={log.id}>
                    <div className="timeline-dot" />
                    <div className="timeline-content">
                      <div className="timeline-head">
                        <strong>{hazardActionLabel(log.action)}</strong>
                        <span>{formatDateTime(log.opTime)}</span>
                      </div>
                      <p>{log.operatorName ?? "-"}</p>
                      <p className="muted-text">
                        状态：{labelFor(statusItems, log.beforeStatus)} → {labelFor(statusItems, log.afterStatus)}
                      </p>
                      {log.reason ? <p>{log.reason}</p> : null}
                    </div>
                  </article>
                ))}
                {statusLogs.length === 0 ? <p className="muted-text">暂无整改状态日志</p> : null}
              </div>
            </section>
          </Drawer>
        ) : null}

        {assigning ? (
          <Drawer size="md" onClose={() => { setAssigning(null); setAssignForm(emptyAssignForm); }}>
            <DrawerHeader
              eyebrow="下达整改"
              title={assigning.title}
              description="指定整改责任人和整改期限，下达后隐患进入已下发整改状态。"
              onClose={() => { setAssigning(null); setAssignForm(emptyAssignForm); }}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitAssign(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <SelectRefField label="整改责任人" value={assignForm.rectifyUserId} allLabel="请选择责任人" items={users.map((item) => ({ id: item.id, label: displayUserName(item) }))} onChange={(value) => setAssignForm((current) => ({ ...current, rectifyUserId: value }))} />
                <Field label="整改期限">
                  <input required type="datetime-local" value={assignForm.rectifyDeadline} onChange={(event) => setAssignForm((current) => ({ ...current, rectifyDeadline: event.target.value }))} />
                </Field>
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="整改要求">
                  <textarea required value={assignForm.reason} onChange={(event) => setAssignForm((current) => ({ ...current, reason: event.target.value }))} placeholder="请填写整改要求或下达原因" />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => { setAssigning(null); setAssignForm(emptyAssignForm); }}>取消</button>
                <button className="primary-button" type="submit">下达整改</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {rectifying ? (
          <Drawer size="md" onClose={() => { setRectifying(null); setRectifyForm(emptyRectifyForm); }}>
            <DrawerHeader
              eyebrow="整改完成"
              title={rectifying.title}
              description="提交整改说明并上传至少一张整改后照片，提交后隐患进入已整改状态。"
              onClose={() => { setRectifying(null); setRectifyForm(emptyRectifyForm); }}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitRectify(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="整改说明">
                  <textarea required value={rectifyForm.rectifyNote} onChange={(event) => setRectifyForm((current) => ({ ...current, rectifyNote: event.target.value }))} placeholder="请填写实际整改情况" />
                </Field>
                <Field label="整改后照片">
                  <FileUploader bizType="safety_hazard_rectify" onUploaded={handleRectifyUploaded} />
                  <span className="status-pill">已选择 {rectifyForm.afterPhotoFileIds.length} 个附件</span>
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => { setRectifying(null); setRectifyForm(emptyRectifyForm); }}>取消</button>
                <button className="primary-button" type="submit">提交整改</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {rechecking ? (
          <Drawer size="md" onClose={() => { setRechecking(null); setRecheckForm(emptyRecheckForm); }}>
            <DrawerHeader
              eyebrow="隐患复查"
              title={rechecking.result === "pass" ? "复查通过" : "复查不通过"}
              description={rechecking.result === "pass" ? "通过后隐患将直接闭环。" : "不通过后隐患将退回整改中。"}
              onClose={() => { setRechecking(null); setRecheckForm(emptyRecheckForm); }}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitRecheck(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="复查说明">
                  <textarea required value={recheckForm.reason} onChange={(event) => setRecheckForm({ reason: event.target.value })} placeholder="请填写现场复查结论" />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => { setRechecking(null); setRecheckForm(emptyRecheckForm); }}>取消</button>
                <button className="primary-button" type="submit">{rechecking.result === "pass" ? "确认通过" : "确认不通过"}</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {rejecting ? (
          <Drawer size="md" onClose={() => { setRejecting(null); setRejectForm(emptyRecheckForm); }}>
            <DrawerHeader
              eyebrow="退回整改"
              title={rejecting.title}
              description="退回后隐患状态回到整改中，整改责任人可重新提交整改。"
              onClose={() => { setRejecting(null); setRejectForm(emptyRecheckForm); }}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitRejectRectify(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="退回原因">
                  <textarea required value={rejectForm.reason} onChange={(event) => setRejectForm({ reason: event.target.value })} placeholder="请说明整改不通过原因" />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => { setRejecting(null); setRejectForm(emptyRecheckForm); }}>取消</button>
                <button className="primary-button" type="submit">退回整改</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {closing ? (
          <Drawer size="md" onClose={() => { setClosing(null); setCloseFormState(emptyRecheckForm); }}>
            <DrawerHeader
              eyebrow="关闭隐患"
              title={closing.title}
              description="关闭后隐患进入闭环状态，不能重复关闭。"
              onClose={() => { setClosing(null); setCloseFormState(emptyRecheckForm); }}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitClose(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="关闭原因">
                  <textarea required value={closeFormState.reason} onChange={(event) => setCloseFormState({ reason: event.target.value })} placeholder="请填写关闭原因" />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => { setClosing(null); setCloseFormState(emptyRecheckForm); }}>取消</button>
                <button className="primary-button" type="submit">关闭隐患</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {creatingWorkOrder ? (
          <Drawer size="md" onClose={() => { setCreatingWorkOrder(null); setCreateWorkOrderForm(emptyCreateWorkOrderForm); }}>
            <DrawerHeader
              eyebrow="隐患转工单"
              title={creatingWorkOrder.title}
              description="创建后工单来源为巡检，隐患会标记为已转工单并保留关联入口。"
              onClose={() => { setCreatingWorkOrder(null); setCreateWorkOrderForm(emptyCreateWorkOrderForm); }}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitCreateWorkOrder(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="工单标题">
                  <input required value={createWorkOrderForm.title} onChange={(event) => setCreateWorkOrderForm((current) => ({ ...current, title: event.target.value }))} />
                </Field>
                <SelectField label="优先级" value={createWorkOrderForm.priority} items={workOrderPriorityItems} allLabel="请选择优先级" required onChange={(value) => setCreateWorkOrderForm((current) => ({ ...current, priority: value }))} />
                <SelectField label="紧急程度" value={createWorkOrderForm.urgency} items={workOrderUrgencyItems} allLabel="请选择紧急程度" required onChange={(value) => setCreateWorkOrderForm((current) => ({ ...current, urgency: value }))} />
                <SelectRefField label="处理人" value={createWorkOrderForm.assigneeId} allLabel="暂不指定" items={users.map((item) => ({ id: item.id, label: displayUserName(item) }))} onChange={(value) => setCreateWorkOrderForm((current) => ({ ...current, assigneeId: value }))} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="工单描述">
                  <textarea required value={createWorkOrderForm.description} onChange={(event) => setCreateWorkOrderForm((current) => ({ ...current, description: event.target.value }))} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => { setCreatingWorkOrder(null); setCreateWorkOrderForm(emptyCreateWorkOrderForm); }}>取消</button>
                <button className="primary-button" type="submit">创建工单</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {creatingEmergency ? (
          <Drawer size="md" onClose={() => { setCreatingEmergency(null); setCreateEmergencyForm(emptyCreateEmergencyForm); }}>
            <DrawerHeader
              eyebrow="重大隐患转应急事件"
              title={creatingEmergency.title}
              description="创建后应急事件保留隐患来源，隐患状态更新为已转应急。"
              onClose={() => { setCreatingEmergency(null); setCreateEmergencyForm(emptyCreateEmergencyForm); }}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitCreateEmergency(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <SelectField label="事件类型" value={createEmergencyForm.incidentType} items={emergencyIncidentItems} allLabel="请选择事件类型" required onChange={(value) => setCreateEmergencyForm((current) => ({ ...current, incidentType: value }))} />
                <SelectField label="严重等级" value={createEmergencyForm.severityLevel} items={emergencySeverityItems} allLabel="请选择严重等级" required onChange={(value) => setCreateEmergencyForm((current) => ({ ...current, severityLevel: value }))} />
                <Field label="事件标题">
                  <input required value={createEmergencyForm.title} onChange={(event) => setCreateEmergencyForm((current) => ({ ...current, title: event.target.value }))} />
                </Field>
                <Field label="转化原因">
                  <input required value={createEmergencyForm.reason} onChange={(event) => setCreateEmergencyForm((current) => ({ ...current, reason: event.target.value }))} />
                </Field>
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="事件描述">
                  <textarea required value={createEmergencyForm.description} onChange={(event) => setCreateEmergencyForm((current) => ({ ...current, description: event.target.value }))} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => { setCreatingEmergency(null); setCreateEmergencyForm(emptyCreateEmergencyForm); }}>取消</button>
                <button className="primary-button" type="submit">创建应急事件</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

export default HazardsPageClient;

function buildPayload(form: HazardForm) {
  return {
    hazard_code: form.hazardCode.trim() || undefined,
    title: form.title.trim(),
    hazard_type: form.hazardType,
    risk_level: form.riskLevel,
    source_type: form.sourceType || "manual",
    building_id: form.buildingId || undefined,
    floor_id: form.floorId || undefined,
    unit_id: form.unitId || undefined,
    park_tenant_id: form.parkTenantId || undefined,
    location: form.location.trim(),
    description: form.description.trim(),
    before_photo_file_ids: form.beforePhotoFileIds,
    after_photo_file_ids: form.afterPhotoFileIds,
    rectify_user_id: form.rectifyUserId || undefined,
    rectify_deadline: form.rectifyDeadline || undefined,
    overdue_flag: form.overdueFlag,
    upgrade_flag: form.upgradeFlag,
    status: form.status || "10",
    remark: form.remark.trim() || undefined
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
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
  required,
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
    <Field label={label}>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </Field>
  );
}

function SelectRefField({
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
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </Field>
  );
}

function EmptyState() {
  return <div className="empty-state">暂无隐患登记</div>;
}

function ForbiddenInline() {
  return <main className="content"><Card><div className="empty-state">403，无隐患登记访问权限或 safety 模块未授权</div></Card></main>;
}

function displayUserName(user: UserRow): string {
  return user.displayName ?? user.realName ?? user.username;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function labelFor(items: DictItemRow[], value?: string | null): string {
  if (!value) return "-";
  return items.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

function hazardActionLabel(action: string): string {
  const labels: Record<string, string> = {
    create: "登记隐患",
    update: "更新隐患",
    delete: "删除隐患",
    assign_rectify: "下达整改",
    rectify: "整改完成",
    recheck_pass: "复查通过",
    recheck_fail: "复查不通过",
    reject_rectify: "退回整改",
    create_workorder: "转为工单",
    to_emergency: "转为应急事件",
    close: "关闭隐患"
  };
  return labels[action] ?? action;
}

function recheckResultLabel(value?: string | null): string {
  if (value === "pass") return "通过";
  if (value === "fail") return "不通过";
  return "-";
}

function toDateTimeInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function displaySecuredField(user: ReturnType<typeof useAuthUser>, fieldKey: string, value: unknown): ReactNode {
  if (!canViewField(user, SAFETY_MODULE, HAZARD_ENTITY, fieldKey)) {
    return "-";
  }
  return maskField(user, SAFETY_MODULE, HAZARD_ENTITY, fieldKey, value) as ReactNode ?? "-";
}
