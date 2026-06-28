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
import { ClipboardCheck, Eye, MapPin, PlayCircle, Plus, RefreshCw, Search, Send, Sparkles, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { VideoEvidencePanel } from "../../../components/video/VideoEvidencePanel";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";

const SAFETY_MODULE = "safety";
const INSPECT_TASK_ENTITY = "inspect_task";

type DictMap = Record<string, DictItemRow[]>;
type PageMode = "all" | "mine";

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

interface InspectPlanRow {
  id: string;
  planCode: string;
  planName: string;
  templateId: string;
  pointIds: string[];
  handlerUserIds: string[];
  status: string;
  nextGenerateTime: string | null;
}

interface InspectTemplateRow {
  id: string;
  templateCode: string;
  templateName: string;
  status: string;
}

interface InspectItemRow {
  id: string;
  itemCode: string | null;
  itemName: string;
  itemType: string;
  hazardType: string | null;
  defaultRiskLevel: string | null;
  required: boolean;
  sortNo: number;
  standardDesc: string | null;
  status: string;
}

interface InspectPointRow {
  id: string;
  pointCode: string;
  pointName: string;
  requiredScan?: boolean;
  requiredGps?: boolean;
  requiredPhotoCount?: number;
  status: string;
}

interface UserRow {
  id: string;
  username: string;
  displayName?: string;
  realName?: string;
  status: string;
}

interface InspectTaskResultRow {
  id: string;
  taskId: string;
  itemId: string;
  itemName: string;
  result: string;
  valueText: string | null;
  valueNumber: string | null;
  photoFileIds: string[];
  isAbnormal: boolean;
  hazardCreated: boolean;
  hazardId: string | null;
}

interface InspectTaskRow {
  id: string;
  code: string | null;
  taskCode: string;
  planId: string | null;
  templateId: string;
  pointId: string;
  handlerId: string;
  handlerName: string;
  planTime: string;
  dueTime: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  scanOk: boolean;
  gpsLng: string | null;
  gpsLat: string | null;
  gpsOffsetMeter: string | null;
  photoFileIds: string[];
  result: string | null;
  status: string;
  remark: string | null;
  createTime: string;
  updateTime: string;
  plan?: InspectPlanRow | null;
  template?: InspectTemplateRow | null;
  point?: InspectPointRow | null;
  handler?: UserRow | null;
  results?: InspectTaskResultRow[];
  items?: InspectItemRow[];
}

interface TaskForm {
  taskCode: string;
  planId: string;
  templateId: string;
  pointId: string;
  handlerId: string;
  planTime: string;
  dueTime: string;
  remark: string;
}

interface GenerateForm {
  planId: string;
  planTime: string;
  dueTime: string;
}

interface CheckInForm {
  qrCode: string;
  gpsLng: string;
  gpsLat: string;
  photoFileIds: string;
}

interface ResultInput {
  result: string;
  valueText: string;
  valueNumber: string;
  photoFileIds: string;
  createHazard: boolean;
}

interface Filters {
  keyword: string;
  status: string;
  pointId: string;
  handlerId: string;
  planStart: string;
  planEnd: string;
}

interface GenerateResultRow {
  point_id: string;
  point_name: string;
  handler_id: string;
  handler_name: string;
  task_code: string | null;
  id: string | null;
  status: "generated" | "skipped";
  reason?: string;
}

interface GenerateResult {
  plan_id: string;
  plan_time: string;
  due_time: string;
  generated_count: number;
  skipped_count: number;
  rows: GenerateResultRow[];
}

const emptyPage: PaginatedResult<InspectTaskRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", status: "", pointId: "", handlerId: "", planStart: "", planEnd: "" };
const emptyTaskForm: TaskForm = { taskCode: "", planId: "", templateId: "", pointId: "", handlerId: "", planTime: "", dueTime: "", remark: "" };
const emptyGenerateForm: GenerateForm = { planId: "", planTime: "", dueTime: "" };
const emptyCheckInForm: CheckInForm = { qrCode: "", gpsLng: "", gpsLat: "", photoFileIds: "" };
const fallbackItemResultItems: DictItemRow[] = [
  { id: "normal", itemLabel: "正常", itemValue: "normal", status: "enabled" },
  { id: "abnormal", itemLabel: "异常", itemValue: "abnormal", status: "enabled" }
];

export function InspectTasksPageClient({ mode }: { mode: PageMode }) {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<InspectTaskRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [plans, setPlans] = useState<InspectPlanRow[]>([]);
  const [templates, setTemplates] = useState<InspectTemplateRow[]>([]);
  const [points, setPoints] = useState<InspectPointRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState<TaskForm>(emptyTaskForm);
  const [generateForm, setGenerateForm] = useState<GenerateForm>(emptyGenerateForm);
  const [formOpen, setFormOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [viewing, setViewing] = useState<InspectTaskRow | null>(null);
  const [executing, setExecuting] = useState<InspectTaskRow | null>(null);
  const [templateItems, setTemplateItems] = useState<InspectItemRow[]>([]);
  const [checkInForm, setCheckInForm] = useState<CheckInForm>(emptyCheckInForm);
  const [resultInputs, setResultInputs] = useState<Record<string, ResultInput>>({});
  const [finishTask, setFinishTask] = useState(true);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [message, setMessage] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const statusItems = dicts.safety_inspect_task_status ?? [];
  const itemResultItems = dicts.safety_inspect_item_result ?? fallbackItemResultItems;
  const pointMap = useMemo(() => new Map(points.map((item) => [item.id, item])), [points]);
  const templateMap = useMemo(() => new Map(templates.map((item) => [item.id, item])), [templates]);
  const permission = mode === "mine" ? SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MY : SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_READ;
  const canViewGpsLng = canViewField(authUser, SAFETY_MODULE, INSPECT_TASK_ENTITY, "gpsLng");
  const canViewGpsLat = canViewField(authUser, SAFETY_MODULE, INSPECT_TASK_ENTITY, "gpsLat");
  const canViewTaskPhotos = canViewField(authUser, SAFETY_MODULE, INSPECT_TASK_ENTITY, "photoFileIds");

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-plan_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.pointId) params.set("point_id", filters.pointId);
    if (mode === "all" && filters.handlerId) params.set("handler_id", filters.handlerId);
    if (filters.planStart) params.set("plan_start", filters.planStart);
    if (filters.planEnd) params.set("plan_end", filters.planEnd);
    const endpoint = mode === "mine" ? "/safety/my-inspect-tasks" : "/safety/inspect-tasks";
    const response = await apiRequest<PaginatedResult<InspectTaskRow>>(`${endpoint}?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters, mode]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["safety_inspect_task_status", "safety_inspect_result", "safety_inspect_item_result"];
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
    const [planResponse, templateResponse, pointResponse, userResponse] = await Promise.all([
      apiRequest<PaginatedResult<InspectPlanRow>>("/safety/inspect-plans?page=1&page_size=100&status=enabled&sort=plan_code", {
        token: getAccessToken()
      }),
      apiRequest<PaginatedResult<InspectTemplateRow>>("/safety/inspect-templates?page=1&page_size=100&status=enabled&sort=template_code", {
        token: getAccessToken()
      }),
      apiRequest<PaginatedResult<InspectPointRow>>("/safety/inspect-points?page=1&page_size=100&status=enabled&sort=sort_no", {
        token: getAccessToken()
      }),
      apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=100&status=enabled", {
        token: getAccessToken()
      })
    ]);
    setPlans(planResponse.data.items);
    setTemplates(templateResponse.data.items);
    setPoints(pointResponse.data.items);
    setUsers(userResponse.data.items);
  }, []);

  useEffect(() => {
    if (mode === "mine") return;
    void Promise.all([loadDicts(), loadRefs()]).catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadRefs, mode]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate() {
    const firstPlan = plans[0];
    setForm({
      ...emptyTaskForm,
      planId: firstPlan?.id ?? "",
      templateId: firstPlan?.templateId ?? templates[0]?.id ?? "",
      pointId: firstPlan?.pointIds[0] ?? points[0]?.id ?? "",
      handlerId: firstPlan?.handlerUserIds[0] ?? users[0]?.id ?? "",
      planTime: toDateTimeLocal(new Date().toISOString())
    });
    setFormOpen(true);
  }

  function openGenerate() {
    const firstPlan = plans[0];
    setGenerateResult(null);
    setGenerateForm({
      ...emptyGenerateForm,
      planId: firstPlan?.id ?? "",
      planTime: toDateTimeLocal(firstPlan?.nextGenerateTime ?? new Date().toISOString())
    });
    setGenerateOpen(true);
  }

  async function openDetail(row: InspectTaskRow) {
    const response = await apiRequest<InspectTaskRow>(taskDetailEndpoint(mode, row.id), { token: getAccessToken() });
    setViewing(response.data);
  }

  async function openExecute(row: InspectTaskRow) {
    const response = await apiRequest<InspectTaskRow>(taskDetailEndpoint(mode, row.id), { token: getAccessToken() });
    const task = response.data;
    setExecuting(task);
    setCheckInForm({
      qrCode: task.point?.pointCode ?? "",
      gpsLng: task.gpsLng ?? "",
      gpsLat: task.gpsLat ?? "",
      photoFileIds: task.photoFileIds?.join(",") ?? ""
    });
    if (mode === "mine") {
      applyTemplateItems(task.items ?? [], task.results ?? []);
      return;
    }
    await loadTemplateItems(task.templateId, task.results ?? []);
  }

  async function loadTemplateItems(templateId: string, existingResults: InspectTaskResultRow[]) {
    const response = await apiRequest<PaginatedResult<InspectItemRow>>(`/safety/inspect-templates/${templateId}/items?page=1&page_size=100`, {
      token: getAccessToken()
    });
    applyTemplateItems(response.data.items, existingResults);
  }

  function applyTemplateItems(items: InspectItemRow[], existingResults: InspectTaskResultRow[]) {
    setTemplateItems(items);
    const existingMap = new Map(existingResults.map((item) => [item.itemId, item]));
    setResultInputs(Object.fromEntries(items.map((item) => {
      const existing = existingMap.get(item.id);
      return [item.id, {
        result: existing?.result ?? itemResultItems.find((dict) => dict.itemValue === "normal")?.itemValue ?? "normal",
        valueText: existing?.valueText ?? "",
        valueNumber: existing?.valueNumber ?? "",
        photoFileIds: existing?.photoFileIds?.join(",") ?? "",
        createHazard: existing?.hazardCreated ?? false
      }] as const;
    })));
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      task_code: form.taskCode.trim() || undefined,
      plan_id: form.planId || undefined,
      template_id: form.templateId,
      point_id: form.pointId,
      handler_id: form.handlerId,
      plan_time: form.planTime ? new Date(form.planTime).toISOString() : undefined,
      due_time: form.dueTime ? new Date(form.dueTime).toISOString() : undefined,
      remark: form.remark.trim() || undefined
    };
    await apiRequest<InspectTaskRow>("/safety/inspect-tasks", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-inspect-task-create"),
      body: payload
    });
    setFormOpen(false);
    setForm(emptyTaskForm);
    setMessage("巡检任务已创建");
    await load();
  }

  async function generateTasks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!generateForm.planId) {
      setMessage("请选择巡检计划");
      return;
    }
    const payload = {
      plan_time: generateForm.planTime ? new Date(generateForm.planTime).toISOString() : undefined,
      due_time: generateForm.dueTime ? new Date(generateForm.dueTime).toISOString() : undefined
    };
    const response = await apiRequest<GenerateResult>(`/safety/inspect-plans/${generateForm.planId}/generate-tasks`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-inspect-plan-generate"),
      body: payload
    });
    setGenerateResult(response.data);
    setMessage(`生成 ${response.data.generated_count} 条，跳过 ${response.data.skipped_count} 条`);
    await load();
  }

  async function startTask() {
    if (!executing) return;
    const response = await apiRequest<InspectTaskRow>(`/safety/inspect-tasks/${executing.id}/start`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-inspect-task-start")
    });
    setExecuting(response.data);
    setMessage("巡检任务已开始");
    await load();
  }

  async function checkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!executing) return;
    const response = await apiRequest<InspectTaskRow>(`/safety/inspect-tasks/${executing.id}/check-in`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-inspect-task-check-in"),
      body: {
        qr_code: checkInForm.qrCode.trim() || undefined,
        gps_lng: checkInForm.gpsLng.trim() ? Number(checkInForm.gpsLng) : undefined,
        gps_lat: checkInForm.gpsLat.trim() ? Number(checkInForm.gpsLat) : undefined,
        photo_file_ids: parseFileIds(checkInForm.photoFileIds)
      }
    });
    setExecuting(response.data);
    setMessage("打卡成功");
    await load();
  }

  async function submitResults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!executing) return;
    const response = await apiRequest<InspectTaskRow>(`/safety/inspect-tasks/${executing.id}/submit-results`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-inspect-task-submit-results"),
      body: {
        finish_task: finishTask,
        results: templateItems.map((item) => {
          const input = resultInputs[item.id] ?? defaultResultInput(itemResultItems);
          return {
            item_id: item.id,
            result: input.result,
            value_text: input.valueText.trim() || undefined,
            value_number: input.valueNumber.trim() ? Number(input.valueNumber) : undefined,
            photo_file_ids: parseFileIds(input.photoFileIds),
            create_hazard: input.createHazard
          };
        })
      }
    });
    setExecuting(response.data);
    setViewing(response.data);
    setMessage("巡检结果已提交");
    await load();
    if (mode === "mine") {
      const detail = await apiRequest<InspectTaskRow>(taskDetailEndpoint(mode, response.data.id), { token: getAccessToken() });
      setExecuting(detail.data);
      setViewing(detail.data);
      applyTemplateItems(detail.data.items ?? [], detail.data.results ?? []);
      return;
    }
    await loadTemplateItems(response.data.templateId, response.data.results ?? []);
  }

  function setResultInput(itemId: string, patch: Partial<ResultInput>) {
    setResultInputs((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? defaultResultInput(itemResultItems)), ...patch } }));
  }

  return (
    <PermissionGuard permission={permission} module={SAFETY_MODULE}>
      <main className="page-container">
        <section className="page-header">
          <div>
            <h1>{mode === "mine" ? "我的巡检任务" : "巡检任务"}</h1>
            <p>{mode === "mine" ? "查看并执行分配给我的安全巡检任务" : "按计划或手工生成巡检任务，并跟踪执行状态"}</p>
          </div>
          <div className="page-header-actions">
            {mode === "all" ? (
              <>
                <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_GENERATE} type="button" onClick={openGenerate}>
                  <Sparkles size={16} />
                  按计划生成
                </PermissionButton>
                <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_CREATE} type="button" onClick={openCreate}>
                  <Plus size={16} />
                  新增任务
                </PermissionButton>
              </>
            ) : null}
            <button className="secondary-button" type="button" onClick={() => void load().catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </section>

        <Card>
          <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="filter-grid">
              <Field label="关键词">
                <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="任务编码 / 点位 / 模板" />
              </Field>
              <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
              {mode === "all" ? (
                <SimpleSelect label="巡检点" value={filters.pointId} allLabel="全部点位" options={points.map((item) => ({ value: item.id, label: `${item.pointCode} ${item.pointName}` }))} onChange={(value) => setFilters((current) => ({ ...current, pointId: value }))} />
              ) : null}
              {mode === "all" ? (
                <SimpleSelect label="责任人" value={filters.handlerId} allLabel="全部责任人" options={users.map((item) => ({ value: item.id, label: displayUser(item) }))} onChange={(value) => setFilters((current) => ({ ...current, handlerId: value }))} />
              ) : null}
              <Field label="计划开始">
                <input type="date" value={filters.planStart} onChange={(event) => setFilters((current) => ({ ...current, planStart: event.target.value }))} />
              </Field>
              <Field label="计划结束">
                <input type="date" value={filters.planEnd} onChange={(event) => setFilters((current) => ({ ...current, planEnd: event.target.value }))} />
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
                <th>任务编号</th>
                <th>巡检点</th>
                <th>巡检模板</th>
                <th>责任人</th>
                <th>计划时间</th>
                <th>截止时间</th>
                <th>结果</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.taskCode}</td>
                  <td>{row.point?.pointName ?? pointMap.get(row.pointId)?.pointName ?? "-"}</td>
                  <td>{row.template?.templateName ?? templateMap.get(row.templateId)?.templateName ?? "-"}</td>
                  <td>{row.handlerName}</td>
                  <td>{formatDateTime(row.planTime)}</td>
                  <td>{formatDateTime(row.dueTime)}</td>
                  <td>{row.result ? <StatusPill dictCode="safety_inspect_result" value={row.result} dicts={dicts} /> : "-"}</td>
                  <td><StatusPill dictCode="safety_inspect_task_status" value={row.status} dicts={dicts} /></td>
                  <td>
                    <DataTableActions>
                      <button className="row-action-button" type="button" onClick={() => void openDetail(row).catch((error: Error) => setMessage(error.message))} title="查看">
                        <Eye size={16} />
                        查看
                      </button>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_SUBMIT_RESULTS} type="button" onClick={() => void openExecute(row).catch((error: Error) => setMessage(error.message))} title="执行">
                        <ClipboardCheck size={16} />
                        执行
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={9}><EmptyState /></td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
          <div className="pagination">
            <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
            <button className="pagination-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(pageData.page - 1).catch((error: Error) => setMessage(error.message))}>上一页</button>
            <button className="pagination-button" type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
          </div>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        {formOpen ? (
          <Drawer size="md" onClose={() => setFormOpen(false)}>
            <DrawerHeader eyebrow="现场安全" title="新增巡检任务" description="可手工指定模板、点位和责任人，计划任务建议从巡检计划生成。" onClose={() => setFormOpen(false)} closeIcon={<X size={18} />} />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void saveTask(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="任务编号">
                  <input value={form.taskCode} onChange={(event) => setFormValue("taskCode", event.target.value)} placeholder="留空自动生成" />
                </Field>
                <SimpleSelect label="关联计划" value={form.planId} allLabel="手工任务" options={plans.map((item) => ({ value: item.id, label: `${item.planCode} ${item.planName}` }))} onChange={(value) => setFormValue("planId", value)} />
                <SimpleSelect label="巡检模板" required value={form.templateId} allLabel="请选择模板" options={templates.map((item) => ({ value: item.id, label: `${item.templateCode} ${item.templateName}` }))} onChange={(value) => setFormValue("templateId", value)} />
                <SimpleSelect label="巡检点" required value={form.pointId} allLabel="请选择点位" options={points.map((item) => ({ value: item.id, label: `${item.pointCode} ${item.pointName}` }))} onChange={(value) => setFormValue("pointId", value)} />
                <SimpleSelect label="责任人" required value={form.handlerId} allLabel="请选择责任人" options={users.map((item) => ({ value: item.id, label: displayUser(item) }))} onChange={(value) => setFormValue("handlerId", value)} />
                <Field label="计划时间">
                  <input type="datetime-local" value={form.planTime} onChange={(event) => setFormValue("planTime", event.target.value)} />
                </Field>
                <Field label="截止时间">
                  <input type="datetime-local" value={form.dueTime} onChange={(event) => setFormValue("dueTime", event.target.value)} />
                </Field>
                <Field label="备注">
                  <textarea value={form.remark} onChange={(event) => setFormValue("remark", event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>取消</button>
                <button className="primary-button" type="submit">保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {generateOpen ? (
          <Drawer size="md" onClose={() => setGenerateOpen(false)}>
            <DrawerHeader eyebrow="现场安全" title="按计划生成巡检任务" description="同一计划、点位和计划时间不会重复生成。" onClose={() => setGenerateOpen(false)} closeIcon={<X size={18} />} />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void generateTasks(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <SimpleSelect label="巡检计划" required value={generateForm.planId} allLabel="请选择计划" options={plans.map((item) => ({ value: item.id, label: `${item.planCode} ${item.planName}` }))} onChange={(value) => setGenerateForm((current) => ({ ...current, planId: value }))} />
                <Field label="计划时间">
                  <input type="datetime-local" value={generateForm.planTime} onChange={(event) => setGenerateForm((current) => ({ ...current, planTime: event.target.value }))} />
                </Field>
                <Field label="截止时间">
                  <input type="datetime-local" value={generateForm.dueTime} onChange={(event) => setGenerateForm((current) => ({ ...current, dueTime: event.target.value }))} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setGenerateOpen(false)}>关闭</button>
                <button className="primary-button" type="submit">生成任务</button>
              </DrawerFooter>
            </DrawerForm>
            {generateResult ? (
              <Card>
                <h3>生成结果</h3>
                <p>生成 {generateResult.generated_count} 条，跳过 {generateResult.skipped_count} 条</p>
                <DataTable>
                  <thead>
                    <tr>
                      <th>巡检点</th>
                      <th>责任人</th>
                      <th>任务编号</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generateResult.rows.map((row) => (
                      <tr key={`${row.point_id}-${row.handler_id}`}>
                        <td>{row.point_name}</td>
                        <td>{row.handler_name}</td>
                        <td>{row.task_code ?? "-"}</td>
                        <td>{row.status === "generated" ? "已生成" : row.reason ?? "已跳过"}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </Card>
            ) : null}
          </Drawer>
        ) : null}

        {viewing ? (
          <Drawer size="md" onClose={() => setViewing(null)}>
            <DrawerHeader eyebrow="巡检任务详情" title={viewing.taskCode} description={`${viewing.point?.pointName ?? "-"} · ${viewing.handlerName}`} onClose={() => setViewing(null)} />
            <DrawerDetailGrid>
              <DrawerDetailItem label="巡检模板" value={viewing.template?.templateName ?? templateMap.get(viewing.templateId)?.templateName ?? "-"} />
              <DrawerDetailItem label="巡检点" value={viewing.point?.pointName ?? pointMap.get(viewing.pointId)?.pointName ?? "-"} />
              <DrawerDetailItem label="责任人" value={viewing.handlerName} />
              <DrawerDetailItem label="计划时间" value={formatDateTime(viewing.planTime)} />
              <DrawerDetailItem label="截止时间" value={formatDateTime(viewing.dueTime)} />
              <DrawerDetailItem label="开始时间" value={formatDateTime(viewing.actualStartTime)} />
              <DrawerDetailItem label="完成时间" value={formatDateTime(viewing.actualEndTime)} />
              <DrawerDetailItem label="扫码" value={viewing.scanOk ? "已打卡" : "未打卡"} />
              <DrawerDetailItem label="定位" value={taskLocationText(authUser, viewing, canViewGpsLng, canViewGpsLat)} />
              <DrawerDetailItem label="定位偏差" value={viewing.gpsOffsetMeter ? `${viewing.gpsOffsetMeter} m` : "-"} />
              <DrawerDetailItem label="打卡照片" value={canViewTaskPhotos ? `${viewing.photoFileIds?.length ?? 0} 个附件` : "-"} />
              <DrawerDetailItem label="结果" value={viewing.result ? <StatusPill dictCode="safety_inspect_result" value={viewing.result} dicts={dicts} /> : "-"} />
              <DrawerDetailItem label="状态" value={<StatusPill dictCode="safety_inspect_task_status" value={viewing.status} dicts={dicts} />} />
              <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
            </DrawerDetailGrid>
            {mode === "all" ? <VideoEvidencePanel sourceType="INSPECTION" sourceId={viewing.id} /> : null}
            <Card>
              <h3>检查结果</h3>
              <DataTable>
                <thead>
                  <tr>
                    <th>检查项</th>
                    <th>结果</th>
                    <th>异常</th>
                    <th>隐患</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewing.results ?? []).map((row) => (
                    <tr key={row.id}>
                      <td>{row.itemName}</td>
                      <td><StatusPill dictCode="safety_inspect_item_result" value={row.result} dicts={dicts} /></td>
                      <td>{row.isAbnormal ? "是" : "否"}</td>
                      <td>{row.hazardCreated ? "已创建" : "-"}</td>
                      <td>{row.valueText ?? "-"}</td>
                    </tr>
                  ))}
                  {(viewing.results ?? []).length === 0 ? (
                    <tr><td colSpan={5}><EmptyState /></td></tr>
                  ) : null}
                </tbody>
              </DataTable>
            </Card>
          </Drawer>
        ) : null}

        {executing ? (
          <Drawer size="lg" onClose={() => setExecuting(null)}>
            <DrawerHeader eyebrow="巡检执行" title={executing.taskCode} description={`${executing.point?.pointName ?? "-"} · ${executing.handlerName}`} onClose={() => setExecuting(null)} />
            <DrawerDetailGrid>
              <DrawerDetailItem label="状态" value={<StatusPill dictCode="safety_inspect_task_status" value={executing.status} dicts={dicts} />} />
              <DrawerDetailItem label="结果" value={executing.result ? <StatusPill dictCode="safety_inspect_result" value={executing.result} dicts={dicts} /> : "-"} />
              <DrawerDetailItem label="计划时间" value={formatDateTime(executing.planTime)} />
              <DrawerDetailItem label="截止时间" value={formatDateTime(executing.dueTime)} />
            </DrawerDetailGrid>
            <DrawerFooter>
              <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_START} type="button" onClick={() => void startTask().catch((error: Error) => setMessage(error.message))}>
                <PlayCircle size={16} />
                开始任务
              </PermissionButton>
            </DrawerFooter>
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void checkIn(event).catch((error: Error) => setMessage(error.message))}>
              <h3>扫码 / 定位 / 拍照</h3>
              <DrawerFormGrid>
                <Field label="二维码">
                  <input value={checkInForm.qrCode} onChange={(event) => setCheckInForm((current) => ({ ...current, qrCode: event.target.value }))} placeholder="桌面环境可手工输入二维码" />
                </Field>
                <Field label="经度">
                  <input type="number" value={checkInForm.gpsLng} onFocus={(event) => event.target.select()} onChange={(event) => setCheckInForm((current) => ({ ...current, gpsLng: event.target.value }))} />
                </Field>
                <Field label="纬度">
                  <input type="number" value={checkInForm.gpsLat} onFocus={(event) => event.target.select()} onChange={(event) => setCheckInForm((current) => ({ ...current, gpsLat: event.target.value }))} />
                </Field>
                <Field label="照片 file_id">
                  <input value={checkInForm.photoFileIds} onChange={(event) => setCheckInForm((current) => ({ ...current, photoFileIds: event.target.value }))} placeholder="多个 file_id 用英文逗号分隔" />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => fillBrowserLocation(setCheckInForm)}>
                  <MapPin size={16} />
                  浏览器定位
                </button>
                <button className="primary-button" type="submit">提交打卡</button>
              </DrawerFooter>
            </DrawerForm>
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitResults(event).catch((error: Error) => setMessage(error.message))}>
              <h3>检查项结果</h3>
              <DataTable>
                <thead>
                  <tr>
                    <th>检查项</th>
                    <th>结果</th>
                    <th>说明</th>
                    <th>数值</th>
                    <th>照片 file_id</th>
                    <th>创建隐患</th>
                  </tr>
                </thead>
                <tbody>
                  {templateItems.map((item) => {
                    const input = resultInputs[item.id] ?? defaultResultInput(itemResultItems);
                    return (
                      <tr key={item.id}>
                        <td>{item.itemName}{item.required ? " *" : ""}</td>
                        <td>
                          <select value={input.result} onChange={(event) => setResultInput(item.id, { result: event.target.value })}>
                            {itemResultItems.map((dict) => <option key={dict.id} value={dict.itemValue}>{dict.itemLabel}</option>)}
                          </select>
                        </td>
                        <td>
                          <input value={input.valueText} onChange={(event) => setResultInput(item.id, { valueText: event.target.value })} />
                        </td>
                        <td>
                          <input type="number" value={input.valueNumber} onFocus={(event) => event.target.select()} onChange={(event) => setResultInput(item.id, { valueNumber: event.target.value })} />
                        </td>
                        <td>
                          <input value={input.photoFileIds} onChange={(event) => setResultInput(item.id, { photoFileIds: event.target.value })} placeholder="多个 file_id 逗号分隔" />
                        </td>
                        <td>
                          <input checked={input.createHazard} type="checkbox" onChange={(event) => setResultInput(item.id, { createHazard: event.target.checked })} />
                        </td>
                      </tr>
                    );
                  })}
                  {templateItems.length === 0 ? (
                    <tr><td colSpan={6}><EmptyState /></td></tr>
                  ) : null}
                </tbody>
              </DataTable>
              <label className="checkbox-row">
                <input checked={finishTask} type="checkbox" onChange={(event) => setFinishTask(event.target.checked)} />
                提交后完成任务
              </label>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setExecuting(null)}>关闭</button>
                <button className="primary-button" type="submit">
                  <Send size={16} />
                  提交结果
                </button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );

  function setFormValue<K extends keyof TaskForm>(key: K, value: TaskForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
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
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </Field>
  );
}

function SimpleSelect({
  label,
  value,
  options,
  allLabel,
  required,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </Field>
  );
}

function EmptyState() {
  return <span className="empty-state-inline">暂无数据</span>;
}

function displayUser(user: UserRow): string {
  return user.displayName ?? user.realName ?? user.username;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function taskLocationText(
  user: ReturnType<typeof useAuthUser>,
  task: InspectTaskRow,
  canViewGpsLng: boolean,
  canViewGpsLat: boolean
): string {
  if (!canViewGpsLng || !canViewGpsLat || !task.gpsLng || !task.gpsLat) {
    return "-";
  }
  const lng = maskField(user, SAFETY_MODULE, INSPECT_TASK_ENTITY, "gpsLng", task.gpsLng);
  const lat = maskField(user, SAFETY_MODULE, INSPECT_TASK_ENTITY, "gpsLat", task.gpsLat);
  return `${String(lng)}, ${String(lat)}`;
}

function toDateTimeLocal(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function parseFileIds(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function defaultResultInput(items: DictItemRow[]): ResultInput {
  return {
    result: items.find((item) => item.itemValue === "normal")?.itemValue ?? "normal",
    valueText: "",
    valueNumber: "",
    photoFileIds: "",
    createHazard: false
  };
}

function taskDetailEndpoint(mode: PageMode, id: string): string {
  return mode === "mine" ? `/safety/my-inspect-tasks/${id}` : `/safety/inspect-tasks/${id}`;
}

function fillBrowserLocation(setCheckInForm: (updater: (current: CheckInForm) => CheckInForm) => void) {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return;
  }
  navigator.geolocation.getCurrentPosition((position) => {
    setCheckInForm((current) => ({
      ...current,
      gpsLng: position.coords.longitude.toFixed(6),
      gpsLat: position.coords.latitude.toFixed(6)
    }));
  });
}
