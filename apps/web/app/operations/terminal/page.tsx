"use client";

import {
  Card,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  StatusPill
} from "@jinhu/ui";
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  LocateFixed,
  MapPin,
  PlayCircle,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  UploadCloud,
  Wrench
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { type FileRecord, type PaginatedResult } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { apiFormRequest, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";

const SAFETY_MODULE = "safety";

function TerminalEmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="terminal-empty-state">
      <p>{title}</p>
      {description ? <span>{description}</span> : null}
    </div>
  );
}

function TerminalLoadingState({ title }: { title: string }) {
  return (
    <div className="terminal-loading-state">
      <span className="terminal-loading-dot" aria-hidden="true" />
      <p>{title}</p>
    </div>
  );
}

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
  status: string;
}

interface InspectPointRow {
  id: string;
  pointCode: string;
  pointName: string;
  requiredScan?: boolean;
  requiredGps?: boolean;
  requiredPhotoCount?: number;
  qrCode?: string | null;
}

interface InspectTemplateRow {
  id: string;
  templateName: string;
}

interface InspectItemRow {
  id: string;
  itemName: string;
  required: boolean;
}

interface InspectTaskResultRow {
  id: string;
  itemId: string;
  itemName: string;
  result: string;
  valueText: string | null;
  isAbnormal: boolean;
  hazardCreated: boolean;
}

interface InspectTaskRow {
  id: string;
  taskCode: string;
  planId: string | null;
  templateId: string;
  pointId: string;
  handlerName: string;
  planTime: string;
  dueTime: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  scanOk: boolean;
  gpsLng: string | null;
  gpsLat: string | null;
  photoFileIds: string[];
  result: string | null;
  status: string;
  remark: string | null;
  point?: InspectPointRow | null;
  template?: InspectTemplateRow | null;
  items?: InspectItemRow[];
  results?: InspectTaskResultRow[];
}

interface UnitRow {
  id: string;
  unitCode: string;
  unitName: string;
  buildingId: string;
  floorId: string;
  building?: { buildingName: string; buildingCode: string } | null;
  floor?: { floorName: string; floorCode: string } | null;
}

interface ParkTenantRow {
  id: string;
  companyName: string;
  parkTenantCode: string;
}

interface UserRow {
  id: string;
  username: string;
  displayName?: string;
  realName?: string;
  mobile?: string | null;
}

interface WorkOrderRow {
  id: string;
  woCode: string;
  title: string;
  status: string;
  priority: string;
  urgency: string | null;
  createTime: string;
}

interface ResultInput {
  result: string;
  valueText: string;
  photoFileIds: string[];
  createHazard: boolean;
}

interface CheckInForm {
  qrCode: string;
  gpsLng: string;
  gpsLat: string;
  photoFileIds: string[];
}

interface WorkOrderForm {
  woType: string;
  priority: string;
  urgency: string;
  title: string;
  description: string;
  location: string;
  parkTenantId: string;
  unitId: string;
  reporterName: string;
  reporterMobile: string;
  assigneeId: string;
  imageFileIds: string[];
}

type DictMap = Record<string, DictItemRow[]>;

const todayStart = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const tomorrowStart = () => {
  const date = todayStart();
  date.setDate(date.getDate() + 1);
  return date;
};

const defaultCheckInForm: CheckInForm = { qrCode: "", gpsLng: "", gpsLat: "", photoFileIds: [] };
const defaultWorkOrderForm: WorkOrderForm = {
  woType: "repair",
  priority: "medium",
  urgency: "normal",
  title: "",
  description: "",
  location: "",
  parkTenantId: "",
  unitId: "",
  reporterName: "",
  reporterMobile: "",
  assigneeId: "",
  imageFileIds: []
};

export default function OperationsTerminalPage() {
  const authUser = useAuthUser();
  const [tasks, setTasks] = useState<InspectTaskRow[]>([]);
  const [recentWorkOrders, setRecentWorkOrders] = useState<WorkOrderRow[]>([]);
  const [plans, setPlans] = useState<InspectPlanRow[]>([]);
  const [dicts, setDicts] = useState<DictMap>({});
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [executing, setExecuting] = useState<InspectTaskRow | null>(null);
  const [checkInForm, setCheckInForm] = useState<CheckInForm>(defaultCheckInForm);
  const [resultInputs, setResultInputs] = useState<Record<string, ResultInput>>({});
  const [workOrderOpen, setWorkOrderOpen] = useState(false);
  const [workOrderForm, setWorkOrderForm] = useState<WorkOrderForm>(defaultWorkOrderForm);

  const todayTasks = useMemo(() => tasks.filter((task) => isToday(task.planTime)), [tasks]);
  const pendingTasks = todayTasks.filter((task) => task.status === "10");
  const runningTasks = todayTasks.filter((task) => task.status === "20");
  const completedTasks = todayTasks.filter((task) => ["30", "40"].includes(task.status));
  const abnormalTasks = todayTasks.filter((task) => task.result === "abnormal" || task.status === "40");
  const completionRate = todayTasks.length === 0 ? 0 : Math.round((completedTasks.length / todayTasks.length) * 100);
  const canGenerate = hasPermission(authUser, "safety_inspect_task:generate");
  const itemResultItems = dicts.safety_inspect_item_result?.length ? dicts.safety_inspect_item_result : [
    { id: "normal", itemLabel: "正常", itemValue: "normal", status: "enabled" },
    { id: "abnormal", itemLabel: "异常", itemValue: "abnormal", status: "enabled" }
  ];

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const start = todayStart().toISOString();
      const end = tomorrowStart().toISOString();
      const [taskResponse, orderResponse, planResponse, dictResponse, unitResponse, tenantResponse, userResponse] = await Promise.allSettled([
        apiRequest<PaginatedResult<InspectTaskRow>>(`/safety/my-inspect-tasks?page=1&page_size=100&plan_start=${encodeURIComponent(start)}&plan_end=${encodeURIComponent(end)}&sort=plan_time`, { token: getAccessToken() }),
        apiRequest<PaginatedResult<WorkOrderRow>>("/work-orders?page=1&page_size=8&sort=createTime:DESC", { token: getAccessToken() }),
        apiRequest<PaginatedResult<InspectPlanRow>>("/safety/inspect-plans?page=1&page_size=100&status=enabled&sort=plan_code", { token: getAccessToken() }),
        loadDictMap(),
        apiRequest<PaginatedResult<UnitRow>>("/park-units?page=1&page_size=100", { token: getAccessToken() }),
        apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=100", { token: getAccessToken() }),
        apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=100&status=enabled", { token: getAccessToken() })
      ]);
      if (taskResponse.status === "fulfilled") setTasks(taskResponse.value.data.items);
      if (orderResponse.status === "fulfilled") setRecentWorkOrders(orderResponse.value.data.items);
      if (planResponse.status === "fulfilled") setPlans(planResponse.value.data.items);
      if (dictResponse.status === "fulfilled") setDicts(dictResponse.value);
      if (unitResponse.status === "fulfilled") setUnits(unitResponse.value.data.items);
      if (tenantResponse.status === "fulfilled") setParkTenants(tenantResponse.value.data.items);
      if (userResponse.status === "fulfilled") setUsers(userResponse.value.data.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function openWorkOrder() {
    setWorkOrderForm({
      ...defaultWorkOrderForm,
      reporterName: authUser?.real_name ?? authUser?.username ?? "",
      reporterMobile: authUser?.mobile ?? ""
    });
    setWorkOrderOpen(true);
    setMessage("");
  }

  async function openExecute(task: InspectTaskRow) {
    const response = await apiRequest<InspectTaskRow>(`/safety/my-inspect-tasks/${task.id}`, { token: getAccessToken() });
    const detail = response.data;
    setExecuting(detail);
    setCheckInForm({
      qrCode: detail.point?.qrCode ?? detail.point?.pointCode ?? "",
      gpsLng: detail.gpsLng ?? "",
      gpsLat: detail.gpsLat ?? "",
      photoFileIds: detail.photoFileIds ?? []
    });
    const existing = new Map((detail.results ?? []).map((result) => [result.itemId, result]));
    const inputs: Record<string, ResultInput> = {};
    for (const item of detail.items ?? []) {
      const result = existing.get(item.id);
      inputs[item.id] = {
        result: result?.result ?? "normal",
        valueText: result?.valueText ?? "",
        photoFileIds: [],
        createHazard: false
      };
    }
    setResultInputs(inputs);
  }

  async function startTask() {
    if (!executing) return;
    const response = await apiRequest<InspectTaskRow>(`/safety/inspect-tasks/${executing.id}/start`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("terminal-inspect-start")
    });
    setExecuting(response.data);
    setMessage("已开始巡检");
    await loadAll();
  }

  async function submitCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!executing) return;
    const response = await apiRequest<InspectTaskRow>(`/safety/inspect-tasks/${executing.id}/check-in`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("terminal-inspect-checkin"),
      body: {
        qr_code: checkInForm.qrCode || undefined,
        gps_lng: checkInForm.gpsLng ? Number(checkInForm.gpsLng) : undefined,
        gps_lat: checkInForm.gpsLat ? Number(checkInForm.gpsLat) : undefined,
        photo_file_ids: checkInForm.photoFileIds
      }
    });
    setExecuting(response.data);
    setMessage("打卡完成");
    await loadAll();
  }

  async function submitResults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!executing) return;
    const results = (executing.items ?? []).map((item) => {
      const input = resultInputs[item.id] ?? { result: "normal", valueText: "", photoFileIds: [], createHazard: false };
      return {
        item_id: item.id,
        result: input.result,
        value_text: input.valueText.trim() || undefined,
        photo_file_ids: input.photoFileIds,
        create_hazard: input.createHazard
      };
    });
    await apiRequest<InspectTaskRow>(`/safety/inspect-tasks/${executing.id}/submit-results`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("terminal-inspect-results"),
      body: { results, finish_task: true }
    });
    setExecuting(null);
    setMessage("巡检已提交");
    await loadAll();
  }

  async function generateTodayTasks() {
    if (!plans.length) {
      setMessage("暂无启用中的巡检计划，请先在巡检计划中启用每日计划。");
      return;
    }
    const planTime = new Date();
    const dueTime = new Date(planTime.getTime() + 24 * 60 * 60 * 1000);
    let generated = 0;
    let skipped = 0;
    for (const plan of plans) {
      const response = await apiRequest<{ generated_count: number; skipped_count: number }>(`/safety/inspect-plans/${plan.id}/generate-tasks`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(`terminal-generate-${plan.id}`),
        body: { plan_time: planTime.toISOString(), due_time: dueTime.toISOString() }
      });
      generated += response.data.generated_count;
      skipped += response.data.skipped_count;
    }
    setMessage(`今日任务生成完成：新增 ${generated} 条，跳过 ${skipped} 条`);
    await loadAll();
  }

  async function createWorkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const unit = units.find((item) => item.id === workOrderForm.unitId);
    const assignee = users.find((item) => item.id === workOrderForm.assigneeId);
    await apiRequest<WorkOrderRow>("/work-orders", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("terminal-workorder-create"),
      body: {
        title: workOrderForm.title.trim(),
        wo_type: workOrderForm.woType,
        priority: workOrderForm.priority,
        urgency: workOrderForm.urgency,
        source_type: "tenant_request",
        park_tenant_id: workOrderForm.parkTenantId || undefined,
        unit_id: workOrderForm.unitId || undefined,
        building_id: unit?.buildingId,
        floor_id: unit?.floorId,
        room_label: unit?.unitName,
        location: workOrderForm.location.trim() || unitLocation(unit),
        reporter_name: workOrderForm.reporterName.trim() || undefined,
        reporter_mobile: workOrderForm.reporterMobile.trim() || undefined,
        assignee_id: workOrderForm.assigneeId || undefined,
        assignee_name: displayUser(assignee),
        description: workOrderForm.description.trim(),
        image_file_ids: workOrderForm.imageFileIds
      }
    });
    setWorkOrderOpen(false);
    setMessage("工单已提交");
    await loadAll();
  }

  return (
    <PermissionGuard permission="safety_inspect_task:my" module={SAFETY_MODULE} fallback={<main className="page-container"><Card><TerminalEmptyState title="无权访问现场工作台" description="请联系管理员开通巡检或工单权限。" /></Card></main>}>
      <main className="page-container operations-terminal-page">
        <section className="page-header operations-terminal-hero">
          <div>
            <span className="section-eyebrow">现场高频入口</span>
            <h1>园区现场工作台</h1>
            <p>面向物业、安全、招商与园区负责人，集中处理每日巡检、拍照打卡、异常上报和业主需求工单。</p>
          </div>
          <div className="page-header-actions">
            <button className="secondary-button" type="button" onClick={() => void loadAll()}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission="workorder:create" type="button" onClick={openWorkOrder}>
              <FilePlus2 size={16} />
              新建工单
            </PermissionButton>
          </div>
        </section>

        <section className="terminal-action-grid" aria-label="快捷操作">
          <button className="terminal-action-card" type="button" onClick={() => scrollToSection("today-inspections")}>
            <ClipboardCheck size={22} />
            <strong>今日巡检</strong>
            <span>{todayTasks.length} 项任务 · 完成率 {completionRate}%</span>
          </button>
          <button className="terminal-action-card" type="button" onClick={() => void locate(setCheckInForm, setMessage)}>
            <LocateFixed size={22} />
            <strong>定位打卡</strong>
            <span>获取当前位置后进入任务提交</span>
          </button>
          <PermissionButton className="terminal-action-card" permission="workorder:create" type="button" onClick={openWorkOrder}>
            <Wrench size={22} />
            <strong>拍照上报</strong>
            <span>业主需求、维修、保洁、安防问题</span>
          </PermissionButton>
          {canGenerate ? (
            <button className="terminal-action-card" type="button" onClick={() => void generateTodayTasks().catch((error: Error) => setMessage(error.message))}>
              <Sparkles size={22} />
              <strong>生成今日任务</strong>
              <span>从启用计划生成，自动跳过重复任务</span>
            </button>
          ) : null}
        </section>

        <section className="terminal-kpi-grid">
          <TerminalKpi label="今日任务" value={todayTasks.length} helper="已分配给当前账号" />
          <TerminalKpi label="待执行" value={pendingTasks.length} helper="需要开始并打卡" />
          <TerminalKpi label="执行中" value={runningTasks.length} helper="已开始未完成" />
          <TerminalKpi label="异常" value={abnormalTasks.length} helper="异常项可自动生成隐患" />
        </section>

        {message ? <p className="form-error terminal-message">{message}</p> : null}

        {loading ? (
          <Card><TerminalLoadingState title="正在加载现场任务" /></Card>
        ) : (
          <>
            <Card id="today-inspections" className="terminal-section">
              <div className="terminal-section-header">
                <div>
                  <h2>今日巡检任务</h2>
                  <p>点击“执行”后完成开始、定位、照片上传、检查项提交。</p>
                </div>
                <StatusPill value={`${completionRate}%`} />
              </div>
              <DataTable>
                <thead>
                  <tr>
                    <th>任务</th>
                    <th>场景</th>
                    <th>点位</th>
                    <th>计划时间</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {todayTasks.map((task) => (
                    <tr key={task.id}>
                      <td>{task.taskCode}</td>
                      <td>{task.template?.templateName ?? "-"}</td>
                      <td>{task.point?.pointName ?? "-"}</td>
                      <td>{formatDateTime(task.planTime)}</td>
                      <td><StatusPill dictCode="safety_inspect_task_status" value={task.status} dicts={dicts} /></td>
                      <td>
                        <DataTableActions>
                          <button className="row-action-button" type="button" onClick={() => void openExecute(task).catch((error: Error) => setMessage(error.message))}>
                            <ClipboardCheck size={16} />
                            执行
                          </button>
                        </DataTableActions>
                      </td>
                    </tr>
                  ))}
                  {todayTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <TerminalEmptyState
                          title="今天暂无巡检任务"
                          description={canGenerate ? "可点击生成今日任务，或到巡检计划中调整责任人。" : "请联系物业或安全负责人生成今日任务。"}
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </DataTable>
            </Card>

            <Card className="terminal-section">
              <div className="terminal-section-header">
                <div>
                  <h2>最近工单</h2>
                  <p>用于现场快速确认业主需求、报修、投诉和保洁安防问题是否已进入闭环。</p>
                </div>
                <PermissionButton className="secondary-button" permission="workorder:create" type="button" onClick={openWorkOrder}>
                  <Plus size={16} />
                  新增
                </PermissionButton>
              </div>
              <DataTable>
                <thead>
                  <tr>
                    <th>编号</th>
                    <th>标题</th>
                    <th>优先级</th>
                    <th>状态</th>
                    <th>提交时间</th>
                  </tr>
                </thead>
                <tbody>
                  {recentWorkOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.woCode}</td>
                      <td>{order.title}</td>
                      <td><StatusPill dictCode="workorder_priority" value={order.priority} dicts={dicts} /></td>
                      <td><StatusPill dictCode="workorder_status" value={order.status} dicts={dicts} /></td>
                      <td>{formatDateTime(order.createTime)}</td>
                    </tr>
                  ))}
                  {recentWorkOrders.length === 0 ? (
                    <tr><td colSpan={5}><TerminalEmptyState title="暂无最近工单" /></td></tr>
                  ) : null}
                </tbody>
              </DataTable>
            </Card>
          </>
        )}

        {executing ? (
          <Drawer size="xl" onClose={() => setExecuting(null)}>
            <DrawerHeader
              eyebrow="现场巡检执行"
              title={executing.template?.templateName ?? executing.taskCode}
              description={`${executing.point?.pointName ?? "巡检点"} · ${formatDateTime(executing.planTime)}`}
              onClose={() => setExecuting(null)}
            />
            <div className="terminal-drawer-summary">
              <span><MapPin size={16} /> {executing.point?.pointName ?? "-"}</span>
              <span><Camera size={16} /> 最少照片 {executing.point?.requiredPhotoCount ?? 0} 张</span>
              <span><StatusPill dictCode="safety_inspect_task_status" value={executing.status} dicts={dicts} /></span>
            </div>

            <div className="terminal-drawer-actions">
              <PermissionButton className="primary-button" permission="safety_inspect_task:start" type="button" onClick={() => void startTask().catch((error: Error) => setMessage(error.message))}>
                <PlayCircle size={16} />
                开始巡检
              </PermissionButton>
              <button className="secondary-button" type="button" onClick={() => void locate(setCheckInForm, setMessage)}>
                <LocateFixed size={16} />
                获取定位
              </button>
            </div>

            <DrawerForm onSubmit={(event) => void submitCheckIn(event).catch((error: Error) => setMessage(error.message))}>
              <h3>打卡信息</h3>
              <DrawerFormGrid>
                <Field label="二维码 / 点位码">
                  <input value={checkInForm.qrCode} onChange={(event) => setCheckInForm((current) => ({ ...current, qrCode: event.target.value }))} />
                </Field>
                <Field label="经度">
                  <input type="number" value={checkInForm.gpsLng} onFocus={(event) => event.target.select()} onChange={(event) => setCheckInForm((current) => ({ ...current, gpsLng: event.target.value }))} />
                </Field>
                <Field label="纬度">
                  <input type="number" value={checkInForm.gpsLat} onFocus={(event) => event.target.select()} onChange={(event) => setCheckInForm((current) => ({ ...current, gpsLat: event.target.value }))} />
                </Field>
                <Field label="现场照片">
                  <InlineFileUploader bizType="safety_inspect_task_checkin" bizId={executing.id} onUploaded={(file) => setCheckInForm((current) => ({ ...current, photoFileIds: appendUnique(current.photoFileIds, file.id) }))} />
                  <AttachmentCounter count={checkInForm.photoFileIds.length} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setExecuting(null)}>稍后处理</button>
                <button className="primary-button" type="submit">
                  <CheckCircle2 size={16} />
                  提交打卡
                </button>
              </DrawerFooter>
            </DrawerForm>

            <DrawerForm onSubmit={(event) => void submitResults(event).catch((error: Error) => setMessage(error.message))}>
              <h3>检查项</h3>
              <div className="terminal-checklist">
                {(executing.items ?? []).map((item) => {
                  const input = resultInputs[item.id] ?? { result: "normal", valueText: "", photoFileIds: [], createHazard: false };
                  const abnormal = input.result === "abnormal";
                  return (
                    <section className="terminal-check-item" key={item.id}>
                      <div className="terminal-check-item-title">
                        <strong>{item.itemName}{item.required ? " *" : ""}</strong>
                        <select value={input.result} onChange={(event) => setResultInput(item.id, { result: event.target.value })}>
                          {itemResultItems.map((dict) => <option key={dict.id} value={dict.itemValue}>{dict.itemLabel}</option>)}
                        </select>
                      </div>
                      <textarea value={input.valueText} onChange={(event) => setResultInput(item.id, { valueText: event.target.value })} placeholder={abnormal ? "请描述异常情况" : "可填写现场说明"} />
                      <div className="terminal-check-item-actions">
                        <InlineFileUploader bizType="safety_inspect_task_result" bizId={executing.id} onUploaded={(file) => setResultInput(item.id, { photoFileIds: appendUnique(input.photoFileIds, file.id) })} />
                        <AttachmentCounter count={input.photoFileIds.length} />
                        <label className="checkbox-row">
                          <input checked={input.createHazard} type="checkbox" onChange={(event) => setResultInput(item.id, { createHazard: event.target.checked })} />
                          异常时生成隐患
                        </label>
                      </div>
                    </section>
                  );
                })}
                {(executing.items ?? []).length === 0 ? <TerminalEmptyState title="暂无检查项" /> : null}
              </div>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setExecuting(null)}>关闭</button>
                <button className="primary-button" type="submit">
                  <Send size={16} />
                  提交并完成
                </button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {workOrderOpen ? (
          <Drawer size="lg" onClose={() => setWorkOrderOpen(false)}>
            <DrawerHeader eyebrow="业主 / 租户需求" title="快速新建工单" description="用于报修、投诉、咨询、保洁、安防和其他现场需求。" onClose={() => setWorkOrderOpen(false)} />
            <DrawerForm onSubmit={(event) => void createWorkOrder(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <DictSelect label="需求类型" required value={workOrderForm.woType} dictCode="workorder_type" dicts={dicts} onChange={(value) => setWorkOrderForm((current) => ({ ...current, woType: value }))} />
                <DictSelect label="优先级" required value={workOrderForm.priority} dictCode="workorder_priority" dicts={dicts} onChange={(value) => setWorkOrderForm((current) => ({ ...current, priority: value }))} />
                <DictSelect label="紧急程度" value={workOrderForm.urgency} dictCode="workorder_urgency" dicts={dicts} onChange={(value) => setWorkOrderForm((current) => ({ ...current, urgency: value }))} />
                <Field label="需求标题">
                  <input required value={workOrderForm.title} onChange={(event) => setWorkOrderForm((current) => ({ ...current, title: event.target.value }))} placeholder="例如：门口照明不亮" />
                </Field>
                <SelectField label="租户企业" value={workOrderForm.parkTenantId} options={parkTenants.map((item) => ({ value: item.id, label: item.companyName }))} onChange={(value) => setWorkOrderForm((current) => ({ ...current, parkTenantId: value }))} />
                <SelectField label="房源 / 位置" value={workOrderForm.unitId} options={units.map((item) => ({ value: item.id, label: `${item.unitCode} ${item.unitName}` }))} onChange={(value) => {
                  const unit = units.find((item) => item.id === value);
                  setWorkOrderForm((current) => ({ ...current, unitId: value, location: unitLocation(unit) || current.location }));
                }} />
                <Field label="详细位置">
                  <input value={workOrderForm.location} onChange={(event) => setWorkOrderForm((current) => ({ ...current, location: event.target.value }))} placeholder="可填写楼栋、楼层、房间或现场描述" />
                </Field>
                <Field label="联系人">
                  <input value={workOrderForm.reporterName} onChange={(event) => setWorkOrderForm((current) => ({ ...current, reporterName: event.target.value }))} />
                </Field>
                <Field label="联系电话">
                  <input value={workOrderForm.reporterMobile} onChange={(event) => setWorkOrderForm((current) => ({ ...current, reporterMobile: event.target.value }))} />
                </Field>
                <SelectField label="处理人" value={workOrderForm.assigneeId} options={users.map((item) => ({ value: item.id, label: displayUser(item) }))} onChange={(value) => setWorkOrderForm((current) => ({ ...current, assigneeId: value }))} />
                <Field label="问题描述">
                  <textarea required value={workOrderForm.description} onChange={(event) => setWorkOrderForm((current) => ({ ...current, description: event.target.value }))} placeholder="请说明现场问题、诉求或处理建议" />
                </Field>
                <Field label="照片附件">
                  <InlineFileUploader bizType="workorder_create" onUploaded={(file) => setWorkOrderForm((current) => ({ ...current, imageFileIds: appendUnique(current.imageFileIds, file.id) }))} />
                  <AttachmentCounter count={workOrderForm.imageFileIds.length} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setWorkOrderOpen(false)}>取消</button>
                <button className="primary-button" type="submit">
                  <UploadCloud size={16} />
                  提交工单
                </button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );

  function setResultInput(itemId: string, patch: Partial<ResultInput>) {
    setResultInputs((current) => ({
      ...current,
      [itemId]: {
        result: "normal",
        valueText: "",
        photoFileIds: [],
        createHazard: false,
        ...(current[itemId] ?? {}),
        ...patch
      }
    }));
  }
}

async function loadDictMap(): Promise<DictMap> {
  const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
  const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
  const codes = [
    "safety_inspect_task_status",
    "safety_inspect_item_result",
    "safety_inspect_result",
    "workorder_status",
    "workorder_type",
    "workorder_priority",
    "workorder_urgency"
  ];
  const entries = await Promise.all(codes.map(async (code) => {
    const dictTypeId = typeMap.get(code);
    if (!dictTypeId) return [code, []] as const;
    const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, { token: getAccessToken() });
    return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
  }));
  return Object.fromEntries(entries);
}

function TerminalKpi({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <Card className="terminal-kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function DictSelect({ label, value, dictCode, dicts, required = false, onChange }: {
  label: string;
  value: string;
  dictCode: string;
  dicts: DictMap;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const items = dicts[dictCode] ?? [];
  return (
    <Field label={label}>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        {items.length === 0 ? <option value={value}>{value || "请选择"}</option> : null}
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </Field>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  );
}

function AttachmentCounter({ count }: { count: number }) {
  return <span className="status-pill">{count > 0 ? `已上传 ${count} 个附件` : "未上传附件"}</span>;
}

function InlineFileUploader({ bizType, bizId, onUploaded }: { bizType: string; bizId?: string; onUploaded: (file: FileRecord) => void }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setMessage("");
    const form = new FormData();
    form.set("file", file);
    form.set("biz_type", bizType);
    if (bizId) {
      form.set("biz_id", bizId);
    }
    try {
      const response = await apiFormRequest<FileRecord>("/files", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("terminal-file-upload"),
        body: form
      });
      onUploaded(response.data);
      setMessage("上传成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="terminal-inline-uploader">
      <label className="secondary-button">
        <Camera size={16} />
        {uploading ? "上传中" : "上传照片"}
        <input accept="image/*" type="file" onChange={(event) => void upload(event.target.files?.[0] ?? null)} />
      </label>
      {message ? <span className="status-pill">{message}</span> : null}
    </div>
  );
}

function appendUnique(values: string[], next: string): string[] {
  return Array.from(new Set([...values, next].filter(Boolean)));
}

function displayUser(user?: UserRow): string {
  if (!user) return "";
  return user.displayName ?? user.realName ?? user.username;
}

function unitLocation(unit?: UnitRow): string | undefined {
  if (!unit) return undefined;
  return [unit.building?.buildingName, unit.floor?.floorName, unit.unitName].filter(Boolean).join(" / ");
}

function isToday(value: string): boolean {
  const time = new Date(value).getTime();
  return time >= todayStart().getTime() && time < tomorrowStart().getTime();
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function locate(setter: (updater: (current: CheckInForm) => CheckInForm) => void, setMessage: (message: string) => void): Promise<void> {
  if (!navigator.geolocation) {
    setMessage("当前浏览器不支持定位，可手工填写经纬度。");
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setter((current) => ({
          ...current,
          gpsLng: position.coords.longitude.toFixed(6),
          gpsLat: position.coords.latitude.toFixed(6)
        }));
        setMessage("定位已获取");
        resolve();
      },
      () => {
        setMessage("定位失败，可手工填写经纬度。");
        resolve();
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}
