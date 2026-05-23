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
import { SYSTEM_PERMISSIONS, type FileRecord, type PaginatedResult } from "@jinhu/shared";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Eye,
  Flag,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  SquareCheck,
  Trash2,
  Wrench,
  XCircle
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { FileUploader } from "../../../components/files/FileUploader";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";

const SAFETY_MODULE = "safety";
const WORK_PERMIT_ENTITY = "work_permit";
const WORK_PERMIT_CHECK_ENTITY = "work_permit_check";

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
}

interface WorkPermitRow {
  id: string;
  code: string | null;
  permitCode: string;
  permitType: string;
  applyType: string | null;
  applyUserId: string | null;
  applyUserName: string | null;
  applyMobile: string | null;
  applyParkTenantId: string | null;
  contractorName: string | null;
  contractorContact: string | null;
  contractorMobile: string | null;
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  location: string;
  timeStart: string;
  timeEnd: string;
  riskLevel: string;
  protectiveMeasures: string | null;
  monitorUserId: string | null;
  monitorUserName: string | null;
  processCheckCount: number;
  violationCount: number;
  startCheckPhotoFileIds?: string[];
  endCheckPhotoFileIds?: string[];
  status: string;
  submitTime?: string | null;
  approveTime?: string | null;
  startTime?: string | null;
  finishTime?: string | null;
  closeTime?: string | null;
  rejectReason?: string | null;
  approveRecords?: WorkPermitApproveRecord[];
  updateTime: string;
  remark: string | null;
  applyParkTenant?: ParkTenantRow | null;
  building?: BuildingRow | null;
  floor?: FloorRow | null;
  unit?: UnitRow | null;
}

interface WorkPermitApproveRecord {
  action?: string;
  before_status?: string | null;
  after_status?: string | null;
  opinion?: string | null;
  reject_reason?: string | null;
  operator_name?: string | null;
  op_time?: string | null;
}

interface WorkPermitLogRow {
  id: string;
  action: string;
  beforeStatus: string | null;
  afterStatus: string | null;
  operatorName: string | null;
  content: string | null;
  reason: string | null;
  attachmentFileIds?: string[];
  opTime: string;
}

interface WorkPermitCheckRow {
  id: string;
  checkType: string;
  checkUserName: string | null;
  checkTime: string;
  result: string;
  violationDesc: string | null;
  photoFileIds?: string[];
  createHazard?: boolean;
  hazardId?: string | null;
  createWorkOrder?: boolean;
  workOrderId?: string | null;
}

interface CheckHazardResponse {
  permit: WorkPermitRow;
  check: WorkPermitCheckRow;
  hazard: {
    id: string;
    hazardCode?: string | null;
  };
}

interface CheckWorkOrderResponse {
  permit: WorkPermitRow;
  check: WorkPermitCheckRow;
  work_order: {
    id: string;
    woCode?: string | null;
  };
}

interface Filters {
  keyword: string;
  permitType: string;
  status: string;
  riskLevel: string;
  applyParkTenantId: string;
  buildingId: string;
  unitId: string;
  startDate: string;
  endDate: string;
}

interface WorkPermitForm {
  permitCode: string;
  permitType: string;
  applyType: string;
  applyUserId: string;
  applyUserName: string;
  applyMobile: string;
  applyParkTenantId: string;
  contractorName: string;
  contractorContact: string;
  contractorMobile: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  location: string;
  timeStart: string;
  timeEnd: string;
  riskLevel: string;
  protectiveMeasures: string;
  monitorUserId: string;
  monitorUserName: string;
  remark: string;
}

type DictMap = Record<string, DictItemRow[]>;
type PermitAction = "submit" | "approve" | "reject" | "void" | "start" | "process-check" | "stop" | "finish" | "close";

const emptyPage: PaginatedResult<WorkPermitRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = {
  keyword: "",
  permitType: "",
  status: "",
  riskLevel: "",
  applyParkTenantId: "",
  buildingId: "",
  unitId: "",
  startDate: "",
  endDate: ""
};
const emptyForm: WorkPermitForm = {
  permitCode: "",
  permitType: "",
  applyType: "internal",
  applyUserId: "",
  applyUserName: "",
  applyMobile: "",
  applyParkTenantId: "",
  contractorName: "",
  contractorContact: "",
  contractorMobile: "",
  buildingId: "",
  floorId: "",
  unitId: "",
  location: "",
  timeStart: "",
  timeEnd: "",
  riskLevel: "10",
  protectiveMeasures: "",
  monitorUserId: "",
  monitorUserName: "",
  remark: ""
};

export default function SafetyWorkPermitsPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<WorkPermitRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState<WorkPermitForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkPermitRow | null>(null);
  const [viewing, setViewing] = useState<WorkPermitRow | null>(null);
  const [actionTarget, setActionTarget] = useState<WorkPermitRow | null>(null);
  const [actionType, setActionType] = useState<PermitAction | null>(null);
  const [actionOpinion, setActionOpinion] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [actionContent, setActionContent] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionResult, setActionResult] = useState<"pass" | "fail" | "violation">("pass");
  const [actionPhotoFileIds, setActionPhotoFileIds] = useState<string[]>([]);
  const [permitLogs, setPermitLogs] = useState<WorkPermitLogRow[]>([]);
  const [permitChecks, setPermitChecks] = useState<WorkPermitCheckRow[]>([]);
  const [message, setMessage] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const permitTypes = dicts.safety_work_permit_type ?? [];
  const applyTypes = dicts.safety_work_permit_apply_type ?? [];
  const statusItems = dicts.safety_work_permit_status ?? [];
  const riskLevels = dicts.safety_risk_level ?? [];
  const buildingOptions = useMemo(() => buildings.map((item) => ({ id: item.id, label: `${item.buildingCode} ${item.buildingName}` })), [buildings]);
  const floorOptions = useMemo(() => floors
    .filter((item) => !form.buildingId || item.buildingId === form.buildingId)
    .map((item) => ({ id: item.id, label: `${item.floorCode} ${item.floorName}` })), [floors, form.buildingId]);
  const unitOptions = useMemo(() => units
    .filter((item) => !form.buildingId || item.buildingId === form.buildingId)
    .filter((item) => !form.floorId || item.floorId === form.floorId)
    .map((item) => ({ id: item.id, label: `${item.unitCode} ${item.unitName}` })), [form.buildingId, form.floorId, units]);
  const tenantOptions = useMemo(() => parkTenants.map((item) => ({ id: item.id, label: `${item.parkTenantCode ? `${item.parkTenantCode} ` : ""}${item.companyName}` })), [parkTenants]);
  const userOptions = useMemo(() => users.map((item) => ({ id: item.id, label: displayUserName(item) })), [users]);
  const canViewApplyMobile = canViewField(authUser, SAFETY_MODULE, WORK_PERMIT_ENTITY, "apply_mobile");
  const canViewContractorMobile = canViewField(authUser, SAFETY_MODULE, WORK_PERMIT_ENTITY, "contractor_mobile");
  const canViewStartPhotos = canViewField(authUser, SAFETY_MODULE, WORK_PERMIT_ENTITY, "start_check_photo_file_ids");
  const canViewEndPhotos = canViewField(authUser, SAFETY_MODULE, WORK_PERMIT_ENTITY, "end_check_photo_file_ids");

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "create_time:desc" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.permitType) params.set("permit_type", filters.permitType);
    if (filters.status) params.set("status", filters.status);
    if (filters.riskLevel) params.set("risk_level", filters.riskLevel);
    if (filters.applyParkTenantId) params.set("apply_park_tenant_id", filters.applyParkTenantId);
    if (filters.buildingId) params.set("building_id", filters.buildingId);
    if (filters.unitId) params.set("unit_id", filters.unitId);
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    const response = await apiRequest<PaginatedResult<WorkPermitRow>>(`/safety/work-permits?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=300", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["safety_work_permit_type", "safety_work_permit_apply_type", "safety_work_permit_status", "safety_risk_level"];
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

  const loadReferences = useCallback(async () => {
    const [buildingResponse, floorResponse, unitResponse, tenantResponse, userResponse] = await Promise.all([
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=300", { token: getAccessToken() }),
      apiRequest<PaginatedResult<FloorRow>>("/floors?page=1&page_size=300", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UnitRow>>("/park-units?page=1&page_size=300", { token: getAccessToken() }),
      apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=300", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=300&status=enabled", { token: getAccessToken() })
    ]);
    setBuildings(buildingResponse.data.items);
    setFloors(floorResponse.data.items);
    setUnits(unitResponse.data.items);
    setParkTenants(tenantResponse.data.items);
    setUsers(userResponse.data.items);
  }, []);

  const loadPermitActivity = useCallback(async (id: string) => {
    const [logsResponse, checksResponse] = await Promise.all([
      apiRequest<WorkPermitLogRow[]>(`/safety/work-permits/${id}/logs`, { token: getAccessToken() }),
      apiRequest<WorkPermitCheckRow[]>(`/safety/work-permits/${id}/checks`, { token: getAccessToken() })
    ]);
    setPermitLogs(logsResponse.data);
    setPermitChecks(checksResponse.data);
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadReferences().catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadReferences]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      permitType: permitTypes[0]?.itemValue ?? "",
      applyType: applyTypes[0]?.itemValue ?? "internal",
      riskLevel: riskLevels[0]?.itemValue ?? "10"
    });
    setFormOpen(true);
  }

  function openEdit(row: WorkPermitRow) {
    setEditing(row);
    setForm({
      permitCode: row.permitCode,
      permitType: row.permitType,
      applyType: row.applyType ?? "internal",
      applyUserId: row.applyUserId ?? "",
      applyUserName: row.applyUserName ?? "",
      applyMobile: row.applyMobile ?? "",
      applyParkTenantId: row.applyParkTenantId ?? "",
      contractorName: row.contractorName ?? "",
      contractorContact: row.contractorContact ?? "",
      contractorMobile: row.contractorMobile ?? "",
      buildingId: row.buildingId ?? "",
      floorId: row.floorId ?? "",
      unitId: row.unitId ?? "",
      location: row.location,
      timeStart: toDateTimeLocal(row.timeStart),
      timeEnd: toDateTimeLocal(row.timeEnd),
      riskLevel: row.riskLevel,
      protectiveMeasures: row.protectiveMeasures ?? "",
      monitorUserId: row.monitorUserId ?? "",
      monitorUserName: row.monitorUserName ?? "",
      remark: row.remark ?? ""
    });
    setFormOpen(true);
  }

  async function openView(row: WorkPermitRow) {
    setViewing(row);
    await loadPermitActivity(row.id);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editing ? `/safety/work-permits/${editing.id}` : "/safety/work-permits";
    await apiRequest<WorkPermitRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "safety-work-permit-update" : "safety-work-permit-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "作业许可已更新" : "作业许可已创建");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: WorkPermitRow) {
    if (!window.confirm(`确认删除作业许可 ${row.permitCode}？`)) return;
    await apiRequest<{ id: string }>(`/safety/work-permits/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-work-permit-delete")
    });
    setMessage("作业许可已删除");
    await load(pageData.page);
  }

  function openAction(row: WorkPermitRow, action: PermitAction) {
    setActionTarget(row);
    setActionType(action);
    setActionOpinion(defaultActionOpinion(action));
    setRejectReason("");
    setActionContent(defaultActionContent(action));
    setActionReason("");
    setActionResult("pass");
    setActionPhotoFileIds([]);
  }

  function closeAction() {
    setActionTarget(null);
    setActionType(null);
    setActionOpinion("");
    setRejectReason("");
    setActionContent("");
    setActionReason("");
    setActionResult("pass");
    setActionPhotoFileIds([]);
  }

  async function submitPermitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget || !actionType) return;
    if (actionType === "reject" && !rejectReason.trim()) {
      setMessage("驳回原因必填");
      return;
    }
    if ((actionType === "start" || actionType === "finish") && actionPhotoFileIds.length === 0) {
      setMessage(actionType === "start" ? "开工必须上传至少一张现场照片" : "完工必须上传至少一张完工照片");
      return;
    }
    if (actionType === "stop" && !actionReason.trim()) {
      setMessage("违规停工原因必填");
      return;
    }
    const body = buildActionPayload(actionType, {
      opinion: actionOpinion,
      rejectReason,
      content: actionContent,
      reason: actionReason,
      result: actionResult,
      photoFileIds: actionPhotoFileIds
    });
    const response = await apiRequest<WorkPermitRow>(`/safety/work-permits/${actionTarget.id}/${actionType}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`safety-work-permit-${actionType}`),
      body
    });
    setMessage(actionSuccessMessage(actionType));
    setViewing(response.data);
    await loadPermitActivity(response.data.id);
    closeAction();
    await load(pageData.page);
  }

  async function createHazardFromCheck(check: WorkPermitCheckRow) {
    if (!viewing) return;
    const response = await apiRequest<CheckHazardResponse>(`/safety/work-permits/${viewing.id}/checks/${check.id}/create-hazard`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-work-permit-check-hazard"),
      body: {
        title: `${viewing.permitCode} 违规巡查隐患`,
        risk_level: viewing.riskLevel,
        description: check.violationDesc ?? "作业许可过程巡查发现违规或不通过项"
      }
    });
    setMessage(`已创建隐患 ${response.data.hazard.hazardCode ?? response.data.hazard.id}`);
    setViewing(response.data.permit);
    await loadPermitActivity(viewing.id);
    await load(pageData.page);
  }

  async function createWorkOrderFromCheck(check: WorkPermitCheckRow) {
    if (!viewing) return;
    const response = await apiRequest<CheckWorkOrderResponse>(`/safety/work-permits/${viewing.id}/checks/${check.id}/create-work-order`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-work-permit-check-workorder"),
      body: {
        title: `${viewing.permitCode} 违规巡查处理工单`,
        description: check.violationDesc ?? "作业许可巡查后续处理"
      }
    });
    setMessage(`已创建工单 ${response.data.work_order.woCode ?? response.data.work_order.id}`);
    setViewing(response.data.permit);
    await loadPermitActivity(viewing.id);
    await load(pageData.page);
  }

  function handleActionFileUploaded(file: FileRecord) {
    setActionPhotoFileIds((current) => Array.from(new Set([...current, file.id])));
  }

  function setFormValue<K extends keyof WorkPermitForm>(key: K, value: WorkPermitForm[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "unitId") {
        const unit = units.find((item) => item.id === value);
        if (unit) {
          next.buildingId = unit.buildingId ?? "";
          next.floorId = unit.floorId ?? "";
        }
      }
      if (key === "buildingId") {
        next.floorId = "";
        next.unitId = "";
      }
      if (key === "floorId") {
        next.unitId = "";
      }
      if (key === "monitorUserId") {
        const user = users.find((item) => item.id === value);
        next.monitorUserName = user ? displayUserName(user) : "";
      }
      return next;
    });
  }

  return (
    <PermissionGuard module={SAFETY_MODULE} permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>作业许可</h1>
            <p>管理动火、临时用电、有限空间、高处和吊装等高风险作业申请。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增许可
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="许可编号 / 位置 / 施工方" />
          </Field>
          <SelectField label="作业类型" value={filters.permitType} items={permitTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, permitType: value }))} />
          <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <SelectField label="风险等级" value={filters.riskLevel} items={riskLevels} allLabel="全部等级" onChange={(value) => setFilters((current) => ({ ...current, riskLevel: value }))} />
          <RefSelect label="租户企业" value={filters.applyParkTenantId} allLabel="全部企业" items={tenantOptions} onChange={(value) => setFilters((current) => ({ ...current, applyParkTenantId: value }))} />
          <RefSelect label="楼栋" value={filters.buildingId} allLabel="全部楼栋" items={buildingOptions} onChange={(value) => setFilters((current) => ({ ...current, buildingId: value }))} />
          <RefSelect label="房源" value={filters.unitId} allLabel="全部房源" items={units.map((item) => ({ id: item.id, label: `${item.unitCode} ${item.unitName}` }))} onChange={(value) => setFilters((current) => ({ ...current, unitId: value }))} />
          <Field label="开始日期">
            <input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} />
          </Field>
          <Field label="结束日期">
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
            <h2 className="panel-title">许可列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>许可编号</th>
                <th>作业类型</th>
                <th>申请人</th>
                <th>施工单位</th>
                <th>位置</th>
                <th>作业时间</th>
                <th>风险等级</th>
                <th>监护人</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.permitCode}</td>
                  <td><StatusPill dictCode="safety_work_permit_type" value={row.permitType} dicts={dicts} /></td>
                  <td>
                    <div>{row.applyUserName ?? "-"}</div>
                    <span className="muted-text">{canViewApplyMobile ? displaySecuredField(authUser, "apply_mobile", row.applyMobile) : "-"}</span>
                  </td>
                  <td>
                    <div>{row.contractorName ?? "-"}</div>
                    <span className="muted-text">{canViewContractorMobile ? displaySecuredField(authUser, "contractor_mobile", row.contractorMobile) : "-"}</span>
                  </td>
                  <td>{row.location}</td>
                  <td>{formatDateTime(row.timeStart)} - {formatDateTime(row.timeEnd)}</td>
                  <td><StatusPill dictCode="safety_risk_level" value={row.riskLevel} dicts={dicts} /></td>
                  <td>{row.monitorUserName ?? "-"}</td>
                  <td><StatusPill dictCode="safety_work_permit_status" value={row.status} dicts={dicts} /></td>
                  <td>
                    <DataTableActions>
                      <button className="table-action-button" type="button" onClick={() => void openView(row).catch((error: Error) => setMessage(error.message))}><Eye size={16} />查看</button>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_UPDATE} type="button" onClick={() => openEdit(row)}><Edit3 size={16} />编辑</PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} />删除</PermissionButton>
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

        {formOpen ? (
          <Drawer size="md" onClose={closeForm}>
            <DrawerHeader
              eyebrow="作业许可"
              title={editing ? "编辑作业许可" : "新增作业许可"}
              description="高风险作业必须指定监护人，同区域同时间窗会进行冲突校验。"
              onClose={closeForm}
            />
            <DrawerForm onSubmit={(event) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="许可编号">
                  <input value={form.permitCode} onChange={(event) => setFormValue("permitCode", event.target.value)} placeholder="留空自动生成" />
                </Field>
                <SelectField required label="作业类型" value={form.permitType} items={permitTypes} allLabel="请选择类型" onChange={(value) => setFormValue("permitType", value)} />
                <SelectField label="申请类型" value={form.applyType} items={applyTypes} allLabel="请选择类型" onChange={(value) => setFormValue("applyType", value)} />
                <SelectField required label="风险等级" value={form.riskLevel} items={riskLevels} allLabel="请选择等级" onChange={(value) => setFormValue("riskLevel", value)} />
                <RefSelect label="申请用户" value={form.applyUserId} allLabel="默认为当前用户" items={userOptions} onChange={(value) => setFormValue("applyUserId", value)} />
                <Field label="申请人姓名">
                  <input value={form.applyUserName} onChange={(event) => setFormValue("applyUserName", event.target.value)} placeholder="可留空使用用户姓名" />
                </Field>
                <Field label="申请人手机">
                  <input value={form.applyMobile} onChange={(event) => setFormValue("applyMobile", event.target.value)} />
                </Field>
                <RefSelect label="租户企业" value={form.applyParkTenantId} allLabel="不关联企业" items={tenantOptions} onChange={(value) => setFormValue("applyParkTenantId", value)} />
                <Field label="施工单位">
                  <input value={form.contractorName} onChange={(event) => setFormValue("contractorName", event.target.value)} />
                </Field>
                <Field label="施工联系人">
                  <input value={form.contractorContact} onChange={(event) => setFormValue("contractorContact", event.target.value)} />
                </Field>
                <Field label="施工联系电话">
                  <input value={form.contractorMobile} onChange={(event) => setFormValue("contractorMobile", event.target.value)} />
                </Field>
                <RefSelect label="楼栋" value={form.buildingId} allLabel="不指定楼栋" items={buildingOptions} onChange={(value) => setFormValue("buildingId", value)} />
                <RefSelect label="楼层" value={form.floorId} allLabel="不指定楼层" items={floorOptions} onChange={(value) => setFormValue("floorId", value)} />
                <RefSelect label="房源" value={form.unitId} allLabel="不指定房源" items={unitOptions} onChange={(value) => setFormValue("unitId", value)} />
                <Field label="作业位置">
                  <input required value={form.location} onChange={(event) => setFormValue("location", event.target.value)} />
                </Field>
                <Field label="开始时间">
                  <input required type="datetime-local" value={form.timeStart} onChange={(event) => setFormValue("timeStart", event.target.value)} />
                </Field>
                <Field label="结束时间">
                  <input required type="datetime-local" value={form.timeEnd} onChange={(event) => setFormValue("timeEnd", event.target.value)} />
                </Field>
                <RefSelect label="监护人" value={form.monitorUserId} allLabel="请选择监护人" items={userOptions} onChange={(value) => setFormValue("monitorUserId", value)} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="防护措施">
                  <textarea value={form.protectiveMeasures} onChange={(event) => setFormValue("protectiveMeasures", event.target.value)} placeholder="填写隔离、灭火、断电、监护等安全措施" />
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
          <Drawer size="md" onClose={() => setViewing(null)}>
            <DrawerHeader
              eyebrow="作业许可详情"
              title={viewing.permitCode}
              description={`${labelFor(permitTypes, viewing.permitType)} · ${formatDateTime(viewing.timeStart)} - ${formatDateTime(viewing.timeEnd)}`}
              onClose={() => setViewing(null)}
            />
            <div className="drawer-action-bar">
              {viewing.status === "10" ? (
                <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_SUBMIT} type="button" onClick={() => openAction(viewing, "submit")}>
                  <Send size={16} />提交
                </PermissionButton>
              ) : null}
              {approvePermissionFor(viewing.status) ? (
                <PermissionButton className="drawer-action-button" permission={approvePermissionFor(viewing.status)!} type="button" onClick={() => openAction(viewing, "approve")}>
                  <CheckCircle2 size={16} />审批通过
                </PermissionButton>
              ) : null}
              {["30", "40", "50"].includes(viewing.status) ? (
                <PermissionButton className="drawer-action-button danger-button" permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_REJECT} type="button" onClick={() => openAction(viewing, "reject")}>
                  <XCircle size={16} />驳回
                </PermissionButton>
              ) : null}
              {["10", "30", "40", "50", "60", "91"].includes(viewing.status) ? (
                <PermissionButton className="drawer-action-button danger-button" permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_VOID} type="button" onClick={() => openAction(viewing, "void")}>
                  <Ban size={16} />作废
                </PermissionButton>
              ) : null}
              {viewing.status === "60" ? (
                <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_START} type="button" onClick={() => openAction(viewing, "start")}>
                  <PlayCircle size={16} />开工
                </PermissionButton>
              ) : null}
              {viewing.status === "70" ? (
                <>
                  <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_PROCESS_CHECK} type="button" onClick={() => openAction(viewing, "process-check")}>
                    <ClipboardCheck size={16} />过程巡查
                  </PermissionButton>
                  <PermissionButton className="drawer-action-button danger-button" permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_STOP} type="button" onClick={() => openAction(viewing, "stop")}>
                    <Flag size={16} />违规停工
                  </PermissionButton>
                  <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_FINISH} type="button" onClick={() => openAction(viewing, "finish")}>
                    <SquareCheck size={16} />完工
                  </PermissionButton>
                </>
              ) : null}
              {viewing.status === "80" ? (
                <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_CLOSE} type="button" onClick={() => openAction(viewing, "close")}>
                  <CheckCircle2 size={16} />完工收单
                </PermissionButton>
              ) : null}
            </div>
            <DrawerDetailGrid>
              <DrawerDetailItem label="许可编号" value={viewing.permitCode} />
              <DrawerDetailItem label="作业类型" value={<StatusPill dictCode="safety_work_permit_type" value={viewing.permitType} dicts={dicts} />} />
              <DrawerDetailItem label="申请类型" value={<StatusPill dictCode="safety_work_permit_apply_type" value={viewing.applyType} dicts={dicts} />} />
              <DrawerDetailItem label="风险等级" value={<StatusPill dictCode="safety_risk_level" value={viewing.riskLevel} dicts={dicts} />} />
              <DrawerDetailItem label="申请人" value={viewing.applyUserName ?? "-"} />
              <DrawerDetailItem label="申请人手机" value={canViewApplyMobile ? displaySecuredField(authUser, "apply_mobile", viewing.applyMobile) : "-"} />
              <DrawerDetailItem label="租户企业" value={viewing.applyParkTenant?.companyName ?? tenantOptions.find((item) => item.id === viewing.applyParkTenantId)?.label ?? "-"} />
              <DrawerDetailItem label="施工单位" value={viewing.contractorName ?? "-"} />
              <DrawerDetailItem label="施工联系人" value={viewing.contractorContact ?? "-"} />
              <DrawerDetailItem label="施工联系电话" value={canViewContractorMobile ? displaySecuredField(authUser, "contractor_mobile", viewing.contractorMobile) : "-"} />
              <DrawerDetailItem label="楼栋" value={viewing.building?.buildingName ?? buildingOptions.find((item) => item.id === viewing.buildingId)?.label ?? "-"} />
              <DrawerDetailItem label="楼层" value={viewing.floor?.floorName ?? floors.find((item) => item.id === viewing.floorId)?.floorName ?? "-"} />
              <DrawerDetailItem label="房源" value={viewing.unit?.unitName ?? units.find((item) => item.id === viewing.unitId)?.unitName ?? "-"} />
              <DrawerDetailItem label="位置" value={viewing.location} />
              <DrawerDetailItem label="开始时间" value={formatDateTime(viewing.timeStart)} />
              <DrawerDetailItem label="结束时间" value={formatDateTime(viewing.timeEnd)} />
              <DrawerDetailItem label="监护人" value={viewing.monitorUserName ?? "-"} />
              <DrawerDetailItem label="状态" value={<StatusPill dictCode="safety_work_permit_status" value={viewing.status} dicts={dicts} />} />
              <DrawerDetailItem label="提交时间" value={formatDateTime(viewing.submitTime)} />
              <DrawerDetailItem label="签发时间" value={formatDateTime(viewing.approveTime)} />
              <DrawerDetailItem label="开工时间" value={formatDateTime(viewing.startTime)} />
              <DrawerDetailItem label="完工时间" value={formatDateTime(viewing.finishTime)} />
              <DrawerDetailItem label="闭环时间" value={formatDateTime(viewing.closeTime)} />
              <DrawerDetailItem label="驳回原因" value={viewing.rejectReason ?? "-"} />
              <DrawerDetailItem label="过程巡查次数" value={viewing.processCheckCount} />
              <DrawerDetailItem label="违规次数" value={viewing.violationCount} />
              <DrawerDetailItem label="开工照片数" value={canViewStartPhotos ? viewing.startCheckPhotoFileIds?.length ?? 0 : "-"} />
              <DrawerDetailItem label="完工照片数" value={canViewEndPhotos ? viewing.endCheckPhotoFileIds?.length ?? 0 : "-"} />
              <DrawerDetailItem label="防护措施" value={displaySecuredField(authUser, "protective_measures", viewing.protectiveMeasures)} />
              <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
            </DrawerDetailGrid>
            <section className="detail-stack">
              <h3 className="panel-title">审批轨迹</h3>
              <ApprovalTrail records={viewing.approveRecords ?? []} statusItems={statusItems} />
            </section>
            <section className="detail-stack">
              <h3 className="panel-title">过程巡查记录</h3>
              <PermitChecks
                authUser={authUser}
                checks={permitChecks}
                onCreateHazard={(check) => void createHazardFromCheck(check).catch((error: Error) => setMessage(error.message))}
                onCreateWorkOrder={(check) => void createWorkOrderFromCheck(check).catch((error: Error) => setMessage(error.message))}
              />
            </section>
            <section className="detail-stack">
              <h3 className="panel-title">作业许可日志</h3>
              <PermitTimeline logs={permitLogs} statusItems={statusItems} />
            </section>
          </Drawer>
        ) : null}

        {actionTarget && actionType ? (
          <Drawer size="md" onClose={closeAction}>
            <DrawerHeader
              eyebrow="作业许可操作"
              title={actionTitle(actionType)}
              description={`${actionTarget.permitCode} · 当前状态 ${labelFor(statusItems, actionTarget.status)}`}
              onClose={closeAction}
            />
            <DrawerForm onSubmit={(event) => void submitPermitAction(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                {actionType === "reject" ? (
                  <Field label="驳回原因">
                    <textarea required value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
                  </Field>
                ) : null}
                {actionType === "stop" ? (
                  <Field label="停工原因">
                    <textarea required value={actionReason} onChange={(event) => setActionReason(event.target.value)} />
                  </Field>
                ) : null}
                {actionType === "process-check" ? (
                  <label className="field">
                    <span>巡查结果</span>
                    <select value={actionResult} onChange={(event) => setActionResult(event.target.value as "pass" | "fail" | "violation")}>
                      <option value="pass">通过</option>
                      <option value="fail">不通过</option>
                      <option value="violation">违规</option>
                    </select>
                  </label>
                ) : null}
                {isLifecycleAction(actionType) ? (
                  <>
                    <Field label={actionType === "stop" ? "补充说明" : "操作说明"}>
                      <textarea value={actionContent} onChange={(event) => setActionContent(event.target.value)} />
                    </Field>
                    {actionType !== "close" ? (
                      <div className="field">
                        <span>{actionType === "finish" ? "完工照片" : "现场照片"}</span>
                        <FileUploader bizType="safety_work_permit_check" bizId={actionTarget.id} onUploaded={handleActionFileUploaded} />
                        <span className="muted-text">已上传 {actionPhotoFileIds.length} 个附件</span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Field label="审批意见">
                    <textarea value={actionOpinion} onChange={(event) => setActionOpinion(event.target.value)} />
                  </Field>
                )}
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeAction}>取消</button>
                <button className={actionType === "reject" || actionType === "void" || actionType === "stop" ? "danger-button" : "primary-button"} type="submit">{actionTitle(actionType)}</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );

  function displaySecuredField(user: ReturnType<typeof useAuthUser>, field: string, value: unknown): string {
    if (!canViewField(user, SAFETY_MODULE, WORK_PERMIT_ENTITY, field)) return "-";
    const masked = maskField(user, SAFETY_MODULE, WORK_PERMIT_ENTITY, field, value);
    return masked === null || masked === undefined || masked === "" ? "-" : String(masked);
  }
}

function approvePermissionFor(status: string) {
  if (status === "30") return SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_APPROVE_PROPERTY;
  if (status === "40") return SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_APPROVE_SAFETY;
  if (status === "50") return SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_APPROVE_OPERATION;
  return null;
}

function securedWorkPermitCheckField(authUser: ReturnType<typeof useAuthUser>, field: string, value: unknown): string {
  if (!canViewField(authUser, SAFETY_MODULE, WORK_PERMIT_CHECK_ENTITY, field)) return "-";
  const masked = maskField(authUser, SAFETY_MODULE, WORK_PERMIT_CHECK_ENTITY, field, value);
  return masked === null || masked === undefined || masked === "" ? "-" : String(masked);
}

function actionTitle(action: PermitAction) {
  if (action === "submit") return "提交审批";
  if (action === "approve") return "审批通过";
  if (action === "reject") return "审批驳回";
  if (action === "void") return "作废许可";
  if (action === "start") return "开工";
  if (action === "process-check") return "过程巡查";
  if (action === "stop") return "违规停工";
  if (action === "finish") return "完工";
  return "完工收单";
}

function defaultActionOpinion(action: PermitAction) {
  if (action === "submit") return "提交作业许可审批";
  if (action === "approve") return "同意";
  if (action === "void") return "作废作业许可";
  return "";
}

function defaultActionContent(action: PermitAction) {
  if (action === "start") return "现场防护措施已确认";
  if (action === "process-check") return "现场正常";
  if (action === "finish") return "已完工，现场清理完成";
  if (action === "close") return "现场核查无遗留风险";
  return "";
}

function actionSuccessMessage(action: PermitAction) {
  if (action === "submit") return "作业许可已提交审批";
  if (action === "approve") return "作业许可审批通过";
  if (action === "reject") return "作业许可已驳回";
  if (action === "void") return "作业许可已作废";
  if (action === "start") return "作业许可已开工";
  if (action === "process-check") return "过程巡查已记录";
  if (action === "stop") return "作业许可已停工";
  if (action === "finish") return "作业许可已完工";
  return "作业许可已闭环";
}

function isLifecycleAction(action: PermitAction) {
  return ["start", "process-check", "stop", "finish", "close"].includes(action);
}

function buildActionPayload(
  action: PermitAction,
  values: {
    opinion: string;
    rejectReason: string;
    content: string;
    reason: string;
    result: "pass" | "fail" | "violation";
    photoFileIds: string[];
  }
) {
  if (action === "reject") {
    return { opinion: values.opinion.trim() || undefined, reject_reason: values.rejectReason.trim() };
  }
  if (action === "start" || action === "finish") {
    return { content: values.content.trim() || undefined, photo_file_ids: values.photoFileIds };
  }
  if (action === "process-check") {
    return { result: values.result, content: values.content.trim() || undefined, photo_file_ids: values.photoFileIds };
  }
  if (action === "stop") {
    return { reason: values.reason.trim(), content: values.content.trim() || undefined, photo_file_ids: values.photoFileIds };
  }
  if (action === "close") {
    return { content: values.content.trim() || undefined };
  }
  return { opinion: values.opinion.trim() || undefined };
}

function ApprovalTrail({ records, statusItems }: { records: WorkPermitApproveRecord[]; statusItems: DictItemRow[] }) {
  if (records.length === 0) {
    return <p className="muted-text">暂无审批轨迹</p>;
  }
  return (
    <div className="timeline-list">
      {records.map((record, index) => (
        <div className="timeline-item" key={`${record.action ?? "approval"}-${record.op_time ?? index}`}>
          <span className="timeline-dot" />
          <div className="timeline-content">
            <div className="timeline-head">
              <strong>{actionLabel(record.action)}</strong>
              <span>{formatDateTime(record.op_time)}</span>
            </div>
            <p>{record.operator_name ?? "-"}</p>
            <p>{labelFor(statusItems, record.before_status)} → {labelFor(statusItems, record.after_status)}</p>
            <p>{record.reject_reason ?? record.opinion ?? "-"}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PermitChecks({
  authUser,
  checks,
  onCreateHazard,
  onCreateWorkOrder
}: {
  authUser: ReturnType<typeof useAuthUser>;
  checks: WorkPermitCheckRow[];
  onCreateHazard: (check: WorkPermitCheckRow) => void;
  onCreateWorkOrder: (check: WorkPermitCheckRow) => void;
}) {
  if (checks.length === 0) {
    return <p className="muted-text">暂无过程巡查记录</p>;
  }
  return (
    <DataTable>
      <thead>
        <tr>
          <th>类型</th>
          <th>结果</th>
          <th>检查人</th>
          <th>检查时间</th>
          <th>说明</th>
          <th>附件</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {checks.map((item) => {
          const convertible = item.result === "fail" || item.result === "violation";
          return (
            <tr key={item.id}>
              <td>{checkTypeLabel(item.checkType)}</td>
              <td>{checkResultLabel(item.result)}</td>
              <td>{item.checkUserName ?? "-"}</td>
              <td>{formatDateTime(item.checkTime)}</td>
              <td>{securedWorkPermitCheckField(authUser, "violation_desc", item.violationDesc)}</td>
              <td>{canViewField(authUser, SAFETY_MODULE, WORK_PERMIT_CHECK_ENTITY, "photo_file_ids") ? `${item.photoFileIds?.length ?? 0} 个` : "-"}</td>
              <td>
                {convertible ? (
                  <DataTableActions>
                    {item.hazardId ? (
                      <a className="table-action-button" href={`/safety/hazards?keyword=${encodeURIComponent(item.hazardId)}`}>
                        <AlertTriangle size={16} />隐患
                      </a>
                    ) : (
                      <PermissionButton
                        className="table-action-button"
                        permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_CREATE_HAZARD}
                        type="button"
                        onClick={() => onCreateHazard(item)}
                      >
                        <AlertTriangle size={16} />转隐患
                      </PermissionButton>
                    )}
                    {item.workOrderId ? (
                      <a className="table-action-button" href={`/workorders/${item.workOrderId}`}>
                        <Wrench size={16} />工单
                      </a>
                    ) : (
                      <PermissionButton
                        className="table-action-button"
                        permission={SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_CREATE_WORKORDER}
                        type="button"
                        onClick={() => onCreateWorkOrder(item)}
                      >
                        <Wrench size={16} />转工单
                      </PermissionButton>
                    )}
                  </DataTableActions>
                ) : (
                  <span className="muted-text">-</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

function PermitTimeline({ logs, statusItems }: { logs: WorkPermitLogRow[]; statusItems: DictItemRow[] }) {
  if (logs.length === 0) {
    return <p className="muted-text">暂无作业许可日志</p>;
  }
  return (
    <div className="timeline-list">
      {logs.map((log) => (
        <div className="timeline-item" key={log.id}>
          <span className="timeline-dot" />
          <div className="timeline-content">
            <div className="timeline-head">
              <strong>{actionLabel(log.action)}</strong>
              <span>{formatDateTime(log.opTime)}</span>
            </div>
            <p>{log.operatorName ?? "-"}</p>
            <p>{labelFor(statusItems, log.beforeStatus)} → {labelFor(statusItems, log.afterStatus)}</p>
            <p>{log.reason ?? log.content ?? "-"}</p>
            {log.attachmentFileIds?.length ? <p>附件 {log.attachmentFileIds.length} 个</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function checkTypeLabel(value: string) {
  const labels: Record<string, string> = {
    start_check: "开工检查",
    process_check: "过程巡查",
    end_check: "完工检查",
    violation_check: "违规检查"
  };
  return labels[value] ?? value;
}

function checkResultLabel(value: string) {
  const labels: Record<string, string> = {
    pass: "通过",
    fail: "不通过",
    violation: "违规"
  };
  return labels[value] ?? value;
}

function actionLabel(action?: string) {
  const labels: Record<string, string> = {
    create: "创建",
    update: "更新",
    submit: "提交",
    approve_property: "物业审批",
    approve_safety: "安全审批",
    approve_operation: "运营审批",
    reject: "驳回",
    void: "作废",
    start: "开工",
    process_check: "过程巡查",
    stop: "违规停工",
    finish: "完工",
    close: "完工收单",
    create_hazard: "转隐患",
    create_workorder: "转工单"
  };
  return action ? labels[action] ?? action : "-";
}

function buildPayload(form: WorkPermitForm) {
  return {
    permit_code: form.permitCode.trim() || undefined,
    permit_type: form.permitType,
    apply_type: form.applyType || undefined,
    apply_user_id: form.applyUserId || undefined,
    apply_user_name: form.applyUserName.trim() || undefined,
    apply_mobile: form.applyMobile.trim() || undefined,
    apply_park_tenant_id: form.applyParkTenantId || undefined,
    contractor_name: form.contractorName.trim() || undefined,
    contractor_contact: form.contractorContact.trim() || undefined,
    contractor_mobile: form.contractorMobile.trim() || undefined,
    building_id: form.buildingId || undefined,
    floor_id: form.floorId || undefined,
    unit_id: form.unitId || undefined,
    location: form.location.trim(),
    time_start: form.timeStart,
    time_end: form.timeEnd,
    risk_level: form.riskLevel,
    protective_measures: form.protectiveMeasures.trim() || undefined,
    monitor_user_id: form.monitorUserId || undefined,
    monitor_user_name: form.monitorUserName.trim() || undefined,
    remark: form.remark.trim() || undefined
  };
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

function RefSelect({
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

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function displayUserName(user: UserRow) {
  return user.displayName ?? user.realName ?? user.username;
}

function EmptyState() {
  return <p className="muted-text">暂无作业许可</p>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <h1>403</h1>
        <p>无权访问作业许可，或当前租户未启用 safety 模块。</p>
      </Card>
    </main>
  );
}
