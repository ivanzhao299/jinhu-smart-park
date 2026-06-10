"use client";

import {
  Card,
  Drawer,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader
} from "@jinhu/ui";
import { X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type FileRecord, type PaginatedResult } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { FileUploader } from "../../../components/files/FileUploader";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";
import { WorkOrderDetailDrawer } from "./components/WorkOrderDetailDrawer";
import { WorkOrderFormDialog } from "./components/WorkOrderFormDialog";
import { WorkOrdersPageActions, WorkOrdersToolbar } from "./components/WorkOrdersToolbar";
import { WorkOrdersTable } from "./components/WorkOrdersTable";

const WORKORDER_MODULE = "workorder";
const WORK_ORDER_ENTITY = "work_order";
const WORKORDER_FINISH_FILE_BIZ_TYPE = "workorder_finish";
const WORKORDER_LOG_FILE_BIZ_TYPE = "workorder_log";
const FIELD_REPORTER_MOBILE = "reporterMobile";
const FIELD_DESCRIPTION = "description";
const FIELD_EVALUATION = "evaluation";

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

interface ParkTenantRow {
  id: string;
  parkTenantCode: string;
  companyName: string;
}

interface UnitRow {
  id: string;
  code: string | null;
  unitCode: string;
  unitName: string;
  buildingId: string;
  floorId: string;
  building?: {
    buildingCode: string;
    buildingName: string;
  } | null;
  floor?: {
    floorCode: string;
    floorName: string;
  } | null;
}

interface UserRow {
  id: string;
  username: string;
  displayName?: string;
  realName?: string;
  mobile?: string | null;
  status: string;
}

interface WorkOrderRow {
  id: string;
  code: string | null;
  woCode: string;
  title: string;
  woType: string;
  woSubType: string | null;
  priority: string;
  urgency: string | null;
  status: string;
  sourceType: string;
  sourceId: string | null;
  parkTenantId: string | null;
  unitId: string | null;
  buildingId: string | null;
  floorId: string | null;
  roomLabel: string | null;
  location: string | null;
  reporterId: string | null;
  reporterName: string | null;
  reporterMobile?: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  description?: string | null;
  imageFileIds?: string[];
  videoFileIds?: string[];
  slaDispatchMin: number | null;
  slaFinishMin: number | null;
  overdueFlag: boolean;
  overdueReason: string | null;
  acceptTime?: string | null;
  startTime?: string | null;
  waitMaterialTime?: string | null;
  finishTime?: string | null;
  confirmTime?: string | null;
  closeTime?: string | null;
  satisfaction?: number | null;
  evaluation?: string | null;
  resolveNote?: string | null;
  createTime: string;
  updateTime: string;
  remark: string | null;
  parkTenant?: ParkTenantRow | null;
  unit?: UnitRow | null;
  building?: {
    buildingCode: string;
    buildingName: string;
  } | null;
  floor?: {
    floorCode: string;
    floorName: string;
  } | null;
}

interface WorkOrderLogRow {
  id: string;
  code: string | null;
  logCode: string | null;
  workOrderId: string;
  action: string;
  beforeStatus: string | null;
  afterStatus: string | null;
  operatorId: string | null;
  operatorName: string | null;
  reason: string | null;
  content: string | null;
  attachmentFileIds: string[];
  opTime: string;
  remark: string | null;
}

interface WorkOrderFormState {
  woCode: string;
  title: string;
  woType: string;
  woSubType: string;
  priority: string;
  urgency: string;
  sourceType: string;
  parkTenantId: string;
  unitId: string;
  buildingId: string;
  floorId: string;
  roomLabel: string;
  location: string;
  reporterName: string;
  reporterMobile: string;
  assigneeId: string;
  assigneeName: string;
  description: string;
  slaDispatchMin: string;
  slaFinishMin: string;
  remark: string;
}

interface AssignmentFormState {
  assigneeId: string;
  reason: string;
}

interface AssignmentState {
  mode: "assign" | "reassign";
  row: WorkOrderRow;
}

type ProcessActionMode = "wait-material" | "finish";

interface ProcessActionState {
  mode: ProcessActionMode;
  row: WorkOrderRow;
}

interface ProcessFormState {
  reason: string;
  resolveNote: string;
  imageFileIds: string[];
}

type ClosureActionMode = "confirm" | "evaluate" | "close";

interface ClosureActionState {
  mode: ClosureActionMode;
  row: WorkOrderRow;
}

interface ClosureFormState {
  confirmNote: string;
  satisfaction: string;
  evaluation: string;
  reason: string;
}

type ExceptionActionMode = "cancel" | "return" | "reject";

interface ExceptionActionState {
  mode: ExceptionActionMode;
  row: WorkOrderRow;
}

interface ExceptionFormState {
  reason: string;
}

interface WorkOrderLogFormState {
  reason: string;
  content: string;
  attachmentFileIds: string[];
}

interface FilterState {
  keyword: string;
  status: string;
  woType: string;
  priority: string;
  urgency: string;
  assigneeId: string;
  parkTenantId: string;
  unitId: string;
  sourceType: string;
  overdueOnly: string;
  startDate: string;
  endDate: string;
}

type DictMap = Record<string, DictItemRow[]>;
type DetailTab = "profile" | "logs";

const emptyPage: PaginatedResult<WorkOrderRow> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyFilters: FilterState = {
  keyword: "",
  status: "",
  woType: "",
  priority: "",
  urgency: "",
  assigneeId: "",
  parkTenantId: "",
  unitId: "",
  sourceType: "",
  overdueOnly: "",
  startDate: "",
  endDate: ""
};
const emptyForm: WorkOrderFormState = {
  woCode: "",
  title: "",
  woType: "",
  woSubType: "",
  priority: "",
  urgency: "",
  sourceType: "manual",
  parkTenantId: "",
  unitId: "",
  buildingId: "",
  floorId: "",
  roomLabel: "",
  location: "",
  reporterName: "",
  reporterMobile: "",
  assigneeId: "",
  assigneeName: "",
  description: "",
  slaDispatchMin: "",
  slaFinishMin: "",
  remark: ""
};
const emptyAssignmentForm: AssignmentFormState = {
  assigneeId: "",
  reason: ""
};
const emptyProcessForm: ProcessFormState = {
  reason: "",
  resolveNote: "",
  imageFileIds: []
};
const emptyClosureForm: ClosureFormState = {
  confirmNote: "",
  satisfaction: "5",
  evaluation: "",
  reason: ""
};
const emptyExceptionForm: ExceptionFormState = {
  reason: ""
};
const emptyLogForm: WorkOrderLogFormState = {
  reason: "",
  content: "",
  attachmentFileIds: []
};

export default function WorkOrdersListPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<WorkOrderRow>>(emptyPage);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState<WorkOrderFormState>(emptyForm);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(emptyAssignmentForm);
  const [processForm, setProcessForm] = useState<ProcessFormState>(emptyProcessForm);
  const [closureForm, setClosureForm] = useState<ClosureFormState>(emptyClosureForm);
  const [exceptionForm, setExceptionForm] = useState<ExceptionFormState>(emptyExceptionForm);
  const [logForm, setLogForm] = useState<WorkOrderLogFormState>(emptyLogForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<AssignmentState | null>(null);
  const [processAction, setProcessAction] = useState<ProcessActionState | null>(null);
  const [closureAction, setClosureAction] = useState<ClosureActionState | null>(null);
  const [exceptionAction, setExceptionAction] = useState<ExceptionActionState | null>(null);
  const [detail, setDetail] = useState<WorkOrderRow | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [workOrderLogs, setWorkOrderLogs] = useState<WorkOrderLogRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const canViewReporterMobile = canViewField(authUser, WORKORDER_MODULE, WORK_ORDER_ENTITY, FIELD_REPORTER_MOBILE);
  const canViewDescription = canViewField(authUser, WORKORDER_MODULE, WORK_ORDER_ENTITY, FIELD_DESCRIPTION);
  const canViewEvaluation = canViewField(authUser, WORKORDER_MODULE, WORK_ORDER_ENTITY, FIELD_EVALUATION);

  const statusItems = dicts.workorder_status ?? [];
  const typeItems = dicts.workorder_type ?? [];
  const priorityItems = dicts.workorder_priority ?? [];
  const urgencyItems = dicts.workorder_urgency ?? [];
  const sourceItems = dicts.workorder_source_type ?? [];

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "createTime:DESC" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.woType) params.set("wo_type", filters.woType);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.urgency) params.set("urgency", filters.urgency);
    if (filters.assigneeId.trim()) params.set("assignee_id", filters.assigneeId.trim());
    if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
    if (filters.unitId) params.set("unit_id", filters.unitId);
    if (filters.sourceType) params.set("source_type", filters.sourceType);
    if (filters.overdueOnly) params.set("overdue_only", filters.overdueOnly);
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    const response = await apiRequest<PaginatedResult<WorkOrderRow>>(`/work-orders?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadWorkOrderLogs = useCallback(async (workOrderId: string) => {
    if (!hasPermission(authUser, SYSTEM_PERMISSIONS.WORKORDER_LOG_READ)) {
      setWorkOrderLogs([]);
      return;
    }
    const response = await apiRequest<PaginatedResult<WorkOrderLogRow>>(`/work-orders/${workOrderId}/logs?page=1&page_size=100&order=desc`, {
      token: getAccessToken()
    });
    setWorkOrderLogs(response.data.items);
  }, [authUser]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["workorder_status", "workorder_type", "workorder_priority", "workorder_urgency", "workorder_source_type"];
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
    const [tenantResponse, unitResponse, userResponse] = await Promise.allSettled([
      apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UnitRow>>("/park-units?page=1&page_size=100", { token: getAccessToken() }),
      apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=100&status=enabled", { token: getAccessToken() })
    ]);
    if (tenantResponse.status === "fulfilled") setParkTenants(tenantResponse.value.data.items);
    if (unitResponse.status === "fulfilled") setUnits(unitResponse.value.data.items);
    if (userResponse.status === "fulfilled") setUsers(userResponse.value.data.items);
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadReferenceData().catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadReferenceData]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      woType: typeItems[0]?.itemValue ?? "",
      priority: priorityItems.find((item) => item.itemValue === "medium")?.itemValue ?? priorityItems[0]?.itemValue ?? "",
      urgency: urgencyItems.find((item) => item.itemValue === "normal")?.itemValue ?? urgencyItems[0]?.itemValue ?? "",
      sourceType: sourceItems.find((item) => item.itemValue === "manual")?.itemValue ?? sourceItems[0]?.itemValue ?? "manual",
      reporterName: authUser?.real_name ?? authUser?.username ?? ""
    });
    setShowForm(true);
    setMessage("");
  }

  function openEdit(row: WorkOrderRow) {
    setEditingId(row.id);
    setForm({
      woCode: row.woCode,
      title: row.title,
      woType: row.woType,
      woSubType: row.woSubType ?? "",
      priority: row.priority,
      urgency: row.urgency ?? "",
      sourceType: row.sourceType,
      parkTenantId: row.parkTenantId ?? "",
      unitId: row.unitId ?? "",
      buildingId: row.buildingId ?? "",
      floorId: row.floorId ?? "",
      roomLabel: row.roomLabel ?? "",
      location: row.location ?? "",
      reporterName: row.reporterName ?? "",
      reporterMobile: row.reporterMobile ?? "",
      assigneeId: row.assigneeId ?? "",
      assigneeName: row.assigneeName ?? "",
      description: row.description ?? "",
      slaDispatchMin: row.slaDispatchMin === null ? "" : String(row.slaDispatchMin),
      slaFinishMin: row.slaFinishMin === null ? "" : String(row.slaFinishMin),
      remark: row.remark ?? ""
    });
    setShowForm(true);
    setMessage("");
  }

  function openDetail(row: WorkOrderRow) {
    setDetail(row);
    setDetailTab("profile");
    setLogForm(emptyLogForm);
    void loadWorkOrderLogs(row.id).catch((error: Error) => setMessage(error.message));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      wo_code: form.woCode.trim() || undefined,
      title: form.title.trim(),
      wo_type: form.woType,
      wo_sub_type: form.woSubType.trim() || undefined,
      priority: form.priority,
      urgency: form.urgency || undefined,
      source_type: form.sourceType || "manual",
      park_tenant_id: form.parkTenantId || undefined,
      unit_id: form.unitId || undefined,
      building_id: form.buildingId || undefined,
      floor_id: form.floorId || undefined,
      room_label: form.roomLabel.trim() || undefined,
      location: form.location.trim() || undefined,
      reporter_name: form.reporterName.trim() || undefined,
      reporter_mobile: form.reporterMobile.trim() || undefined,
      assignee_id: form.assigneeId || undefined,
      assignee_name: form.assigneeName.trim() || undefined,
      description: form.description.trim(),
      sla_dispatch_min: form.slaDispatchMin ? Number(form.slaDispatchMin) : undefined,
      sla_finish_min: form.slaFinishMin ? Number(form.slaFinishMin) : undefined,
      remark: form.remark.trim() || undefined
    };
    await apiRequest<WorkOrderRow>(editingId ? `/work-orders/${editingId}` : "/work-orders", {
      method: editingId ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editingId ? "work-order-update" : "work-order-create"),
      body
    });
    setShowForm(false);
    setEditingId(null);
    setMessage("保存成功");
    await load(pageData.page);
  }

  async function remove(row: WorkOrderRow) {
    if (!window.confirm(`确认删除工单「${row.woCode}」？仅已取消工单允许删除。`)) {
      return;
    }
    await apiRequest<{ id: string }>(`/work-orders/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("work-order-delete")
    });
    setMessage("删除成功");
    await load(pageData.page);
  }

  function setUnit(unitId: string) {
    const unit = units.find((item) => item.id === unitId);
    setForm((current) => ({
      ...current,
      unitId,
      buildingId: unit?.buildingId ?? current.buildingId,
      floorId: unit?.floorId ?? current.floorId,
      roomLabel: unit?.unitName ?? current.roomLabel,
      location: unit ? unitLocation(unit) : current.location
    }));
  }

  function setAssignee(userId: string) {
    const user = users.find((item) => item.id === userId);
    setForm((current) => ({ ...current, assigneeId: userId, assigneeName: displayUserName(user) }));
  }

  function openAssignment(row: WorkOrderRow, mode: "assign" | "reassign") {
    setAssignment({ row, mode });
    setAssignmentForm({
      assigneeId: row.assigneeId ?? "",
      reason: ""
    });
    setMessage("");
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignment) return;
    if (!assignmentForm.assigneeId) {
      setMessage("请选择处理人");
      return;
    }
    if (assignment.mode === "reassign" && !assignmentForm.reason.trim()) {
      setMessage("改派原因必填");
      return;
    }
    const response = await apiRequest<WorkOrderRow>(`/work-orders/${assignment.row.id}/${assignment.mode}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`work-order-${assignment.mode}`),
      body: {
        assignee_id: assignmentForm.assigneeId,
        reason: assignmentForm.reason.trim() || undefined
      }
    });
    if (detail?.id === response.data.id) {
      setDetail(response.data);
      void loadWorkOrderLogs(response.data.id).catch((error: Error) => setMessage(error.message));
    }
    setAssignment(null);
    setAssignmentForm(emptyAssignmentForm);
    setMessage(assignment.mode === "assign" ? "派单成功" : "改派成功");
    await load(pageData.page);
  }

  async function submitDirectProcessAction(row: WorkOrderRow, action: "accept" | "start") {
    const response = await apiRequest<WorkOrderRow>(`/work-orders/${row.id}/${action}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`work-order-${action}`)
    });
    if (detail?.id === response.data.id) {
      setDetail(response.data);
      void loadWorkOrderLogs(response.data.id).catch((error: Error) => setMessage(error.message));
    }
    setMessage(action === "accept" ? "接单成功" : row.status === "45" ? "已恢复处理" : "已开始处理");
    await load(pageData.page);
  }

  function openProcessAction(row: WorkOrderRow, mode: ProcessActionMode) {
    setProcessAction({ row, mode });
    setProcessForm(emptyProcessForm);
    setMessage("");
  }

  async function submitProcessAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!processAction) return;
    if (processAction.mode === "wait-material" && !processForm.reason.trim()) {
      setMessage("待物料原因必填");
      return;
    }
    if (processAction.mode === "finish" && !processForm.resolveNote.trim()) {
      setMessage("完成处理说明必填");
      return;
    }
    const path = processAction.mode === "wait-material" ? "wait-material" : "finish";
    const body = processAction.mode === "wait-material"
      ? { reason: processForm.reason.trim() }
      : { resolve_note: processForm.resolveNote.trim(), image_file_ids: processForm.imageFileIds };
    const response = await apiRequest<WorkOrderRow>(`/work-orders/${processAction.row.id}/${path}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`work-order-${path}`),
      body
    });
    if (detail?.id === response.data.id) {
      setDetail(response.data);
      void loadWorkOrderLogs(response.data.id).catch((error: Error) => setMessage(error.message));
    }
    setProcessAction(null);
    setProcessForm(emptyProcessForm);
    setMessage(processAction.mode === "wait-material" ? "已标记待物料" : "已完成处理");
    await load(pageData.page);
  }

  function handleFinishFileUploaded(file: FileRecord) {
    setProcessForm((current) => ({
      ...current,
      imageFileIds: [...new Set([...current.imageFileIds, file.id])]
    }));
  }

  function openClosureAction(row: WorkOrderRow, mode: ClosureActionMode) {
    setClosureAction({ row, mode });
    setClosureForm({
      ...emptyClosureForm,
      satisfaction: row.satisfaction ? String(row.satisfaction) : "5"
    });
    setMessage("");
  }

  async function submitClosureAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!closureAction) return;
    if (closureAction.mode === "evaluate") {
      const satisfaction = Number(closureForm.satisfaction);
      if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) {
        setMessage("满意度必须为 1-5");
        return;
      }
    }
    if (closureAction.mode === "close" && !closureForm.reason.trim()) {
      setMessage("关闭原因必填");
      return;
    }
    const body = closureAction.mode === "confirm"
      ? { confirm_note: closureForm.confirmNote.trim() || undefined }
      : closureAction.mode === "evaluate"
        ? { satisfaction: Number(closureForm.satisfaction), evaluation: closureForm.evaluation.trim() || undefined }
        : { reason: closureForm.reason.trim() };
    const response = await apiRequest<WorkOrderRow>(`/work-orders/${closureAction.row.id}/${closureAction.mode}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`work-order-${closureAction.mode}`),
      body
    });
    if (detail?.id === response.data.id) {
      setDetail(response.data);
      void loadWorkOrderLogs(response.data.id).catch((error: Error) => setMessage(error.message));
    }
    setClosureAction(null);
    setClosureForm(emptyClosureForm);
    setMessage(closureAction.mode === "confirm" ? "确认完成成功" : closureAction.mode === "evaluate" ? "评价成功" : "关闭成功");
    await load(pageData.page);
  }

  function openExceptionAction(row: WorkOrderRow, mode: ExceptionActionMode) {
    setExceptionAction({ row, mode });
    setExceptionForm(emptyExceptionForm);
    setMessage("");
  }

  async function submitExceptionAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exceptionAction) return;
    if (!exceptionForm.reason.trim()) {
      setMessage("操作原因必填");
      return;
    }
    const response = await apiRequest<WorkOrderRow>(`/work-orders/${exceptionAction.row.id}/${exceptionAction.mode}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`work-order-${exceptionAction.mode}`),
      body: {
        reason: exceptionForm.reason.trim()
      }
    });
    if (detail?.id === response.data.id) {
      setDetail(response.data);
      void loadWorkOrderLogs(response.data.id).catch((error: Error) => setMessage(error.message));
    }
    setExceptionAction(null);
    setExceptionForm(emptyExceptionForm);
    setMessage(exceptionAction.mode === "cancel" ? "取消成功" : exceptionAction.mode === "return" ? "退回成功" : "驳回成功");
    await load(pageData.page);
  }

  async function submitWorkOrderLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    if (!logForm.content.trim()) {
      setMessage("日志内容必填");
      return;
    }
    await apiRequest<WorkOrderLogRow>(`/work-orders/${detail.id}/logs`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("work-order-log-create"),
      body: {
        action: "system",
        reason: logForm.reason.trim() || undefined,
        content: logForm.content.trim(),
        attachment_file_ids: logForm.attachmentFileIds
      }
    });
    setLogForm(emptyLogForm);
    setMessage("日志已补充");
    await loadWorkOrderLogs(detail.id);
  }

  function handleLogFileUploaded(file: FileRecord) {
    setLogForm((current) => ({
      ...current,
      attachmentFileIds: [...new Set([...current.attachmentFileIds, file.id])]
    }));
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_READ} module={WORKORDER_MODULE} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>工单中心</strong>
            <span>手工创建报修、投诉、申请与咨询工单，后续接入派单和处理闭环</span>
          </div>
          <WorkOrdersPageActions
            onRefresh={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}
            onCreate={openCreate}
          />
        </header>

        <WorkOrdersToolbar
          filters={filters}
          statusItems={statusItems}
          typeItems={typeItems}
          priorityItems={priorityItems}
          urgencyItems={urgencyItems}
          users={users}
          parkTenants={parkTenants}
          units={units}
          onFilterChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          onSubmit={() => void load(1).catch((error: Error) => setMessage(error.message))}
        />

        <WorkOrdersTable
          pageData={pageData}
          typeItems={typeItems}
          priorityItems={priorityItems}
          statusItems={statusItems}
          canAssignWorkOrder={canAssignWorkOrder}
          canReassignWorkOrder={canReassignWorkOrder}
          onOpenDetail={openDetail}
          onOpenEdit={openEdit}
          onOpenAssignment={openAssignment}
          onRemove={(row) => void remove(row).catch((error: Error) => setMessage(error.message))}
          onPageChange={(page) => void load(page).catch((error: Error) => setMessage(error.message))}
        />

        {showForm ? (
          <WorkOrderFormDialog
            isEditing={Boolean(editingId)}
            form={form}
            typeItems={typeItems}
            priorityItems={priorityItems}
            urgencyItems={urgencyItems}
            sourceItems={sourceItems}
            parkTenants={parkTenants}
            units={units}
            users={users}
            onClose={() => setShowForm(false)}
            onSubmit={(event: FormEvent<HTMLFormElement>) => void submit(event).catch((error: Error) => setMessage(error.message))}
            onFormChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            onUnitChange={setUnit}
            onAssigneeChange={setAssignee}
          />
        ) : null}

        {detail ? (
          <WorkOrderDetailDrawer
            detail={detail}
            detailTab={detailTab}
            logs={workOrderLogs}
            logForm={logForm}
            module={WORKORDER_MODULE}
            logFileBizType={WORKORDER_LOG_FILE_BIZ_TYPE}
            statusItems={statusItems}
            typeItems={typeItems}
            priorityItems={priorityItems}
            reporterMobileText={fieldText(authUser, canViewReporterMobile, FIELD_REPORTER_MOBILE, detail.reporterMobile)}
            evaluationText={fieldText(authUser, canViewEvaluation, FIELD_EVALUATION, detail.evaluation)}
            descriptionText={fieldText(authUser, canViewDescription, FIELD_DESCRIPTION, detail.description)}
            canAssign={canAssignWorkOrder(detail)}
            canReassign={canReassignWorkOrder(detail)}
            canAccept={canAcceptWorkOrder(authUser, detail)}
            canStart={canStartWorkOrder(authUser, detail)}
            canWaitMaterial={canWaitMaterialWorkOrder(authUser, detail)}
            canFinish={canFinishWorkOrder(authUser, detail)}
            canConfirm={canConfirmWorkOrder(authUser, detail)}
            canEvaluate={canEvaluateWorkOrder(authUser, detail)}
            canClose={canCloseWorkOrder(authUser, detail)}
            canCancel={canCancelWorkOrder(detail)}
            canReturn={canReturnWorkOrder(authUser, detail)}
            canReject={canRejectWorkOrder(authUser, detail)}
            onClose={() => setDetail(null)}
            onTabChange={setDetailTab}
            onRefreshLogs={() => void loadWorkOrderLogs(detail.id).catch((error: Error) => setMessage(error.message))}
            onOpenAssignment={openAssignment}
            onDirectProcessAction={(row, action) => void submitDirectProcessAction(row, action).catch((error: Error) => setMessage(error.message))}
            onOpenProcessAction={openProcessAction}
            onOpenClosureAction={openClosureAction}
            onOpenExceptionAction={openExceptionAction}
            onSubmitLog={(event: FormEvent<HTMLFormElement>) => void submitWorkOrderLog(event).catch((error: Error) => setMessage(error.message))}
            onLogFormChange={(patch) => setLogForm((current) => ({ ...current, ...patch }))}
            onClearLogForm={() => setLogForm(emptyLogForm)}
            onLogFileUploaded={handleLogFileUploaded}
          />
        ) : null}

        {assignment ? (
          <Drawer size="md" onClose={() => setAssignment(null)}>
            <DrawerHeader
              eyebrow={assignment.mode === "assign" ? "工单派单" : "工单改派"}
              title={assignment.row.woCode}
              description={assignment.mode === "assign" ? "选择处理人并记录派单说明。" : "改派必须填写原因，系统会写入工单日志。"}
              onClose={() => setAssignment(null)}
              closeIcon={<X size={16} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitAssignment(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="处理人">
                  <select required value={assignmentForm.assigneeId} onChange={(event) => setAssignmentForm((current) => ({ ...current, assigneeId: event.target.value }))}>
                    <option value="">请选择处理人</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{displayUserName(user)}</option>)}
                  </select>
                </Field>
                <TextAreaField
                  label={assignment.mode === "assign" ? "派单说明" : "改派原因"}
                  value={assignmentForm.reason}
                  required={assignment.mode === "reassign"}
                  onChange={(value) => setAssignmentForm((current) => ({ ...current, reason: value }))}
                />
              </DrawerFormGrid>
              <DrawerFooter>
                <button type="button" onClick={() => setAssignment(null)}>取消</button>
                <button className="primary-button" type="submit">{assignment.mode === "assign" ? "确认派单" : "确认改派"}</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {processAction ? (
          <Drawer size="md" onClose={() => setProcessAction(null)}>
            <DrawerHeader
              eyebrow={processAction.mode === "wait-material" ? "标记待物料" : "完成处理"}
              title={processAction.row.woCode}
              description={processAction.mode === "wait-material" ? "记录缺料原因，工单进入待物料状态。" : "填写处理说明，可上传处理后的现场图片。"}
              onClose={() => setProcessAction(null)}
              closeIcon={<X size={16} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitProcessAction(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                {processAction.mode === "wait-material" ? (
                  <TextAreaField
                    label="待物料原因"
                    value={processForm.reason}
                    required
                    onChange={(value) => setProcessForm((current) => ({ ...current, reason: value }))}
                  />
                ) : (
                  <>
                    <TextAreaField
                      label="处理说明"
                      value={processForm.resolveNote}
                      required
                      onChange={(value) => setProcessForm((current) => ({ ...current, resolveNote: value }))}
                    />
                    <div className="work-panel">
                      <h2 className="panel-title">处理图片</h2>
                      <FileUploader bizType={WORKORDER_FINISH_FILE_BIZ_TYPE} bizId={processAction.row.id} onUploaded={handleFinishFileUploaded} />
                      <p className="muted-text">已选择 {processForm.imageFileIds.length} 个处理附件</p>
                    </div>
                  </>
                )}
              </DrawerFormGrid>
              <DrawerFooter>
                <button type="button" onClick={() => setProcessAction(null)}>取消</button>
                <button className="primary-button" type="submit">{processAction.mode === "wait-material" ? "确认待物料" : "确认完成"}</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {closureAction ? (
          <Drawer size="md" onClose={() => setClosureAction(null)}>
            <DrawerHeader
              eyebrow={closureAction.mode === "confirm" ? "确认完成" : closureAction.mode === "evaluate" ? "工单评价" : "关闭工单"}
              title={closureAction.row.woCode}
              description={
                closureAction.mode === "confirm"
                  ? "确认处理结果后，工单进入已确认状态。"
                  : closureAction.mode === "evaluate"
                    ? "填写满意度和评价内容，完成服务反馈。"
                    : "关闭后工单进入闭环，不能继续处理或评价。"
              }
              onClose={() => setClosureAction(null)}
              closeIcon={<X size={16} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitClosureAction(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                {closureAction.mode === "confirm" ? (
                  <TextAreaField
                    label="确认说明"
                    value={closureForm.confirmNote}
                    onChange={(value) => setClosureForm((current) => ({ ...current, confirmNote: value }))}
                  />
                ) : null}
                {closureAction.mode === "evaluate" ? (
                  <>
                    <NumberField
                      label="满意度"
                      value={closureForm.satisfaction}
                      min={1}
                      max={5}
                      onChange={(value) => setClosureForm((current) => ({ ...current, satisfaction: value }))}
                    />
                    <TextAreaField
                      label="评价内容"
                      value={closureForm.evaluation}
                      onChange={(value) => setClosureForm((current) => ({ ...current, evaluation: value }))}
                    />
                  </>
                ) : null}
                {closureAction.mode === "close" ? (
                  <TextAreaField
                    label="关闭原因"
                    value={closureForm.reason}
                    required
                    onChange={(value) => setClosureForm((current) => ({ ...current, reason: value }))}
                  />
                ) : null}
              </DrawerFormGrid>
              <DrawerFooter>
                <button type="button" onClick={() => setClosureAction(null)}>取消</button>
                <button className="primary-button" type="submit">
                  {closureAction.mode === "confirm" ? "确认完成" : closureAction.mode === "evaluate" ? "提交评价" : "确认关闭"}
                </button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {exceptionAction ? (
          <Drawer size="md" onClose={() => setExceptionAction(null)}>
            <DrawerHeader
              eyebrow={exceptionAction.mode === "cancel" ? "取消工单" : exceptionAction.mode === "return" ? "退回工单" : "驳回工单"}
              title={exceptionAction.row.woCode}
              description={
                exceptionAction.mode === "cancel"
                  ? "取消后工单进入已取消状态，只保留历史记录。"
                  : exceptionAction.mode === "return"
                    ? "退回后工单进入已退回状态，可重新派单。"
                    : "驳回后工单进入已退回状态，等待补充或重新处理。"
              }
              onClose={() => setExceptionAction(null)}
              closeIcon={<X size={16} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitExceptionAction(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <TextAreaField
                  label={exceptionAction.mode === "cancel" ? "取消原因" : exceptionAction.mode === "return" ? "退回原因" : "驳回原因"}
                  value={exceptionForm.reason}
                  required
                  onChange={(value) => setExceptionForm((current) => ({ ...current, reason: value }))}
                />
              </DrawerFormGrid>
              <DrawerFooter>
                <button type="button" onClick={() => setExceptionAction(null)}>取消</button>
                <button className="primary-button" type="submit">
                  {exceptionAction.mode === "cancel" ? "确认取消" : exceptionAction.mode === "return" ? "确认退回" : "确认驳回"}
                </button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {message ? <p className="status-pill">{message}</p> : null}
      </main>
    </PermissionGuard>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  min = 0,
  max,
  onChange
}: {
  label: string;
  value: string;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        step="1"
        value={value}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function TextAreaField({ label, value, required, onChange }: { label: string; value: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <textarea value={value} required={required} rows={4} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function displayUserName(user?: UserRow): string {
  if (!user) return "";
  return user.displayName ?? user.realName ?? user.username;
}

function unitLocation(unit: UnitRow): string {
  return [unit.building?.buildingName, unit.floor?.floorName, unit.unitName].filter(Boolean).join(" / ");
}

function isDispatchableStatus(status: string): boolean {
  return status === "10" || status === "20" || status === "91";
}

function canAssignWorkOrder(row: WorkOrderRow): boolean {
  return isDispatchableStatus(row.status) && !row.assigneeId;
}

function canReassignWorkOrder(row: WorkOrderRow): boolean {
  return isDispatchableStatus(row.status) && Boolean(row.assigneeId);
}

function canHandleWorkOrder(user: ReturnType<typeof useAuthUser>, row: WorkOrderRow): boolean {
  if (!user) return false;
  if (hasPermission(user, SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)) return true;
  return Boolean(row.assigneeId && row.assigneeId === user.id);
}

function canConfirmActor(user: ReturnType<typeof useAuthUser>, row: WorkOrderRow): boolean {
  if (!user) return false;
  if (hasPermission(user, SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)) return true;
  return Boolean(row.reporterId && row.reporterId === user.id);
}

function canAcceptWorkOrder(user: ReturnType<typeof useAuthUser>, row: WorkOrderRow): boolean {
  return row.status === "20" && canHandleWorkOrder(user, row);
}

function canStartWorkOrder(user: ReturnType<typeof useAuthUser>, row: WorkOrderRow): boolean {
  return (row.status === "30" || row.status === "45") && canHandleWorkOrder(user, row);
}

function canWaitMaterialWorkOrder(user: ReturnType<typeof useAuthUser>, row: WorkOrderRow): boolean {
  return row.status === "40" && canHandleWorkOrder(user, row);
}

function canFinishWorkOrder(user: ReturnType<typeof useAuthUser>, row: WorkOrderRow): boolean {
  return (row.status === "40" || row.status === "45") && canHandleWorkOrder(user, row);
}

function canConfirmWorkOrder(user: ReturnType<typeof useAuthUser>, row: WorkOrderRow): boolean {
  return row.status === "50" && canConfirmActor(user, row);
}

function canEvaluateWorkOrder(user: ReturnType<typeof useAuthUser>, row: WorkOrderRow): boolean {
  return row.status === "60" && canConfirmActor(user, row);
}

function canCloseWorkOrder(user: ReturnType<typeof useAuthUser>, row: WorkOrderRow): boolean {
  return (row.status === "60" || row.status === "70") && hasPermission(user, SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL);
}

function canCancelWorkOrder(row: WorkOrderRow): boolean {
  return row.status === "10" || row.status === "20";
}

function canReturnWorkOrder(user: ReturnType<typeof useAuthUser>, row: WorkOrderRow): boolean {
  return (row.status === "30" || row.status === "40" || row.status === "45") && canHandleWorkOrder(user, row);
}

function canRejectWorkOrder(user: ReturnType<typeof useAuthUser>, row: WorkOrderRow): boolean {
  return (row.status === "10" || row.status === "20" || row.status === "30" || row.status === "40" || row.status === "45")
    && hasPermission(user, SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL);
}

function hasPermission(user: ReturnType<typeof useAuthUser>, permission: string): boolean {
  if (!user) return false;
  return user.is_super === true || user.permissions.includes("*") || user.permissions.includes(permission);
}

function fieldText(user: ReturnType<typeof useAuthUser>, canView: boolean, fieldKey: string, value: unknown): string {
  if (!canView) return "-";
  const masked = maskField(user, WORKORDER_MODULE, WORK_ORDER_ENTITY, fieldKey, value);
  if (masked === null || masked === undefined || masked === "") return "-";
  return String(masked);
}

function ForbiddenInline() {
  return (
    <main className="content">
      <Card>
        <h1 className="panel-title">403</h1>
        <p>当前账号没有工单中心访问权限，或当前租户未启用 workorder 模块。</p>
      </Card>
    </main>
  );
}
