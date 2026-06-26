"use client";

import {
  Card,
  ContentCard,
  DataTable,
  DataTableActions,
  EmptyState,
  FeedbackNotice,
  LoadingState,
  PageShell,
  StatusPill
} from "@jinhu/ui";
import { Activity, AlertTriangle, ClipboardCheck, Download, FilePlus2, LocateFixed, Plus, RefreshCw, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../auth/PermissionButton";
import { PermissionGuard } from "../auth/PermissionGuard";
import { useMobileTerminalMode } from "../mobile/useMobileTerminalMode";
import { WorkflowInboxDigest } from "../workflow/WorkflowInboxDigest";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { useAuthUser } from "../../lib/auth-context";
import { getAccessToken } from "../../lib/authz";
import { loadDictMapByCodes } from "../../lib/dict-client";
import { hasPermission } from "../../lib/permissions";
import type { WorkflowInboxResponse } from "../../lib/workflow-inbox-types";
import { buildWorkOrderPrefill, resolveWorkOrderAudience } from "../../lib/workorder-prefill";
import { InspectionExecutionDrawer } from "./InspectionExecutionDrawer";
import { QuickWorkOrderDrawer } from "./QuickWorkOrderDrawer";
import { OPERATION_SCENES, TERMINAL_DICT_CODES, TERMINAL_QUICK_ACTIONS, matchScene, type OperationSceneConfig } from "./terminal-config";
import type {
  CheckInForm,
  DictItemRow,
  DictMap,
  InspectPlanRow,
  InspectTaskRow,
  ParkTenantRow,
  ResultInput,
  UnitRow,
  UserRow,
  WorkOrderForm,
  WorkOrderRow
} from "./terminal-types";
import styles from "./OperationsTerminal.module.css";

const SAFETY_MODULE = "safety";

interface OperationsTerminalClientProps {
  previewMode?: boolean;
  previewData?: {
    tasks?: InspectTaskRow[];
    recentWorkOrders?: WorkOrderRow[];
    plans?: InspectPlanRow[];
    dicts?: DictMap;
    units?: UnitRow[];
    parkTenants?: ParkTenantRow[];
    users?: UserRow[];
    workflowInbox?: WorkflowInboxResponse;
  };
}

const defaultCheckInForm: CheckInForm = { qrCode: "", gpsLng: "", gpsLat: "", photoFileIds: [] };
const OVERDUE_STATUS = "40";
const defaultWorkOrderForm: WorkOrderForm = {
  woType: "",
  priority: "",
  urgency: "",
  sourceType: "manual",
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

const DEFAULT_WORK_ORDER_TYPE = "repair";
const DEFAULT_WORK_ORDER_PRIORITY = "medium";
const DEFAULT_WORK_ORDER_URGENCY = "normal";

export function OperationsTerminalClient({ previewMode = false, previewData }: OperationsTerminalClientProps = {}) {
  const authUser = useAuthUser();
  const [tasks, setTasks] = useState<InspectTaskRow[]>(previewData?.tasks ?? []);
  const [recentWorkOrders, setRecentWorkOrders] = useState<WorkOrderRow[]>(previewData?.recentWorkOrders ?? []);
  const [plans, setPlans] = useState<InspectPlanRow[]>(previewData?.plans ?? []);
  const [dicts, setDicts] = useState<DictMap>(previewData?.dicts ?? {});
  const [units, setUnits] = useState<UnitRow[]>(previewData?.units ?? []);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>(previewData?.parkTenants ?? []);
  const [users, setUsers] = useState<UserRow[]>(previewData?.users ?? []);
  const [loading, setLoading] = useState(!previewMode);
  const [message, setMessage] = useState("");
  const [executing, setExecuting] = useState<InspectTaskRow | null>(null);
  const [checkInForm, setCheckInForm] = useState<CheckInForm>(defaultCheckInForm);
  const [resultInputs, setResultInputs] = useState<Record<string, ResultInput>>({});
  const [workOrderOpen, setWorkOrderOpen] = useState(false);
  const [workOrderForm, setWorkOrderForm] = useState<WorkOrderForm>(defaultWorkOrderForm);

  const todayTasks = useMemo(() => tasks.filter((task) => isToday(task.planTime)), [tasks]);
  const pendingTasks = todayTasks.filter((task) => task.status === "10");
  const runningTasks = todayTasks.filter((task) => task.status === "20");
  const completedTasks = todayTasks.filter((task) => task.status === "30");
  const overdueTasks = todayTasks.filter((task) => task.status === OVERDUE_STATUS || isOverdueTask(task));
  const abnormalTasks = todayTasks.filter((task) => task.result === "abnormal");
  const completionRate = todayTasks.length === 0 ? 0 : Math.round((completedTasks.length / todayTasks.length) * 100);
  const canGenerate = previewMode || hasPermission(authUser, "safety_inspect_task:generate");
  const canReadWorkflow = previewMode || hasPermission(authUser, SYSTEM_PERMISSIONS.WORKORDER_READ);
  const itemResultItems = dicts.safety_inspect_item_result?.length ? dicts.safety_inspect_item_result : [
    { id: "normal", itemLabel: "正常", itemValue: "normal", status: "enabled" },
    { id: "abnormal", itemLabel: "异常", itemValue: "abnormal", status: "enabled" }
  ];
  const workOrderAudience = resolveWorkOrderAudience(authUser);

  useMobileTerminalMode(["mobile-terminal-mode", "operations-terminal-safe-area", "operations-terminal-mode"]);

  const loadAll = useCallback(async () => {
    if (previewMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");
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
    setLoading(false);
  }, [previewMode]);

  useEffect(() => {
    if (previewMode) {
      setLoading(false);
      return;
    }
    void loadAll().catch((error: Error) => {
      setMessage(error.message);
      setLoading(false);
    });
  }, [loadAll, previewMode]);

  function openWorkOrder(scene?: OperationSceneConfig) {
    const defaults = workOrderDefaultsForScene(scene, dicts, workOrderAudience);
    const prefill = buildWorkOrderPrefill(authUser, parkTenants, units);
    setWorkOrderForm({
      ...defaultWorkOrderForm,
      woType: defaults.woType,
      priority: defaults.priority,
      urgency: defaults.urgency,
      sourceType: defaults.sourceType,
      title: scene?.defaultWorkOrderTitle ?? workOrderAudience.defaultTitle,
      description: scene?.defaultWorkOrderDescription ?? workOrderAudience.defaultDescription,
      parkTenantId: prefill.parkTenantId,
      unitId: prefill.unitId,
      location: prefill.location,
      reporterName: prefill.reporterName,
      reporterMobile: prefill.reporterMobile
    });
    setWorkOrderOpen(true);
    setMessage("");
  }

  async function openExecute(task: InspectTaskRow) {
    if (previewMode) {
      setExecuting(task);
      setCheckInForm({
        qrCode: task.point?.qrCode ?? task.point?.pointCode ?? "",
        gpsLng: task.gpsLng ?? "",
        gpsLat: task.gpsLat ?? "",
        photoFileIds: task.photoFileIds ?? []
      });
      const inputs: Record<string, ResultInput> = {};
      for (const item of task.items ?? []) {
        inputs[item.id] = { result: "normal", valueText: "", valueNumber: "", photoFileIds: [], createHazard: true };
      }
      const localDraft = readLocalDraft(task.id);
      if (localDraft) {
        setCheckInForm((current) => ({ ...current, ...localDraft.checkInForm }));
        setResultInputs({ ...inputs, ...localDraft.resultInputs });
      } else {
        setResultInputs(inputs);
      }
      return;
    }
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
        valueNumber: result?.valueNumber ?? "",
        photoFileIds: result?.photoFileIds ?? [],
        createHazard: !result?.hazardCreated
      };
    }
    const localDraft = readLocalDraft(detail.id);
    if (localDraft) {
      setCheckInForm((current) => ({ ...current, ...localDraft.checkInForm }));
      setResultInputs({ ...inputs, ...localDraft.resultInputs });
    } else {
      setResultInputs(inputs);
    }
  }

  async function startTask() {
    if (!executing) return;
    if (previewMode) {
      setExecuting({ ...executing, status: "20", actualStartTime: new Date().toISOString() });
      setMessage("预览：已开始巡检");
      return;
    }
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
    if (previewMode) {
      setExecuting({ ...executing, scanOk: true, gpsLng: checkInForm.gpsLng, gpsLat: checkInForm.gpsLat });
      setMessage("预览：打卡完成");
      return;
    }
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
    if (previewMode) {
      setExecuting(null);
      setMessage("预览：巡检已提交");
      return;
    }
    const results = (executing.items ?? []).map((item) => {
      const input = resultInputs[item.id] ?? { result: "normal", valueText: "", valueNumber: "", photoFileIds: [], createHazard: true };
      return {
        item_id: item.id,
        result: input.result,
        value_text: input.valueText.trim() || undefined,
        value_number: input.valueNumber ? Number(input.valueNumber) : undefined,
        photo_file_ids: input.photoFileIds,
        create_hazard: input.result === "abnormal" ? input.createHazard : false
      };
    });
    await apiRequest<InspectTaskRow>(`/safety/inspect-tasks/${executing.id}/submit-results`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("terminal-inspect-results"),
      body: { results, finish_task: true }
    });
    clearLocalDraft(executing.id);
    setExecuting(null);
    setMessage("巡检已提交");
    await loadAll();
  }

  async function saveDraft() {
    if (!executing) return;
    const results = (executing.items ?? []).map((item) => {
      const input = resultInputs[item.id] ?? { result: "normal", valueText: "", valueNumber: "", photoFileIds: [], createHazard: true };
      return {
        item_id: item.id,
        result: input.result,
        value_text: input.valueText.trim() || undefined,
        value_number: input.valueNumber ? Number(input.valueNumber) : undefined,
        photo_file_ids: input.photoFileIds,
        create_hazard: false
      };
    });
    writeLocalDraft(executing.id, { checkInForm, resultInputs });
    if (previewMode) {
      setMessage("预览：草稿已保存");
      return;
    }
    const response = await apiRequest<InspectTaskRow>(`/safety/inspect-tasks/${executing.id}/draft`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("terminal-inspect-draft"),
      body: { results, finish_task: false }
    });
    setExecuting(response.data);
    clearLocalDraft(executing.id);
    setMessage("草稿已保存，可稍后继续巡检");
    await loadAll();
  }

  async function scanQr() {
    if (!executing) return;
    try {
      const qrCode = await scanQrCode();
      if (qrCode) {
        setCheckInForm((current) => ({ ...current, qrCode }));
        setMessage("已识别二维码 / 点位码");
      } else {
        setMessage("未识别到二维码，可手工填写点位码。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "扫码失败，可手工填写点位码。");
    }
  }

  async function generateTodayTasks() {
    if (previewMode) {
      setMessage("预览：今日任务已由计划生成，正式环境会跳过重复任务。");
      return;
    }
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
    const normalizedForm = normalizeWorkOrderForm(workOrderForm, dicts);
    const validationMessage = validateWorkOrderForm(normalizedForm);
    if (validationMessage) {
      setWorkOrderForm(normalizedForm);
      setMessage(validationMessage);
      return;
    }
    if (previewMode) {
      const now = new Date().toISOString();
      setRecentWorkOrders((current) => [{
        id: `preview-order-${Date.now()}`,
        woCode: "WO-PREVIEW",
        title: normalizedForm.title.trim() || "现场诉求工单",
        status: "10",
        priority: normalizedForm.priority,
        urgency: normalizedForm.urgency || null,
        createTime: now
      }, ...current]);
      setWorkOrderOpen(false);
      setMessage("预览：工单已提交");
      return;
    }
    const unit = units.find((item) => item.id === normalizedForm.unitId);
    const assignee = users.find((item) => item.id === normalizedForm.assigneeId);
    await apiRequest<WorkOrderRow>("/work-orders", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("terminal-workorder-create"),
      body: {
        title: normalizedForm.title.trim(),
        wo_type: normalizedForm.woType,
        priority: normalizedForm.priority,
        urgency: normalizedForm.urgency || undefined,
        source_type: normalizedForm.sourceType || workOrderAudience.sourceType,
        park_tenant_id: normalizedForm.parkTenantId || undefined,
        unit_id: normalizedForm.unitId || undefined,
        building_id: unit?.buildingId,
        floor_id: unit?.floorId,
        room_label: unit?.unitName,
        location: normalizedForm.location.trim() || unitLocation(unit),
        reporter_name: normalizedForm.reporterName.trim() || undefined,
        reporter_mobile: normalizedForm.reporterMobile.trim() || undefined,
        assignee_id: normalizedForm.assigneeId || undefined,
        assignee_name: displayUser(assignee),
        description: normalizedForm.description.trim(),
        image_file_ids: normalizedForm.imageFileIds
      }
    });
    setWorkOrderOpen(false);
    setMessage("工单已提交");
    await loadAll();
  }

  const content = (
      <PageShell className={`${styles.page} ds-page ds-terminal-page`}>
        <section className={`${styles.terminalHero} ds-hero ds-hero-production ds-terminal-hero`}>
          <div className={`${styles.heroCopy} ds-hero-copy`}>
            <span className="ds-eyebrow">作业终端</span>
            <h1>园区现场作业台</h1>
            <div className={`${styles.heroMeta} ds-hero-meta ds-terminal-status`}>
              <span><Activity size={16} /> 今日 {todayTasks.length}</span>
              <span><ClipboardCheck size={16} /> 完成 {completionRate}%</span>
              <span><AlertTriangle size={16} /> 异常 {abnormalTasks.length}</span>
            </div>
          </div>
          <div className={`${styles.heroControl} ds-terminal-control`}>
            <div className="ds-terminal-control-metrics">
              <span>
                <strong>{pendingTasks.length}</strong>
                待执行
              </span>
              <span>
                <strong>{runningTasks.length}</strong>
                执行中
              </span>
            </div>
            <div className={`${styles.heroActions} ds-action-bar`}>
              <button className={`${styles.secondaryCommand} ds-button ds-button-secondary`} type="button" onClick={() => void loadAll()}>
                <RefreshCw size={18} />
                刷新
              </button>
              <button className={`${styles.secondaryCommand} ds-button ds-button-secondary`} type="button" onClick={() => exportTodayTasks(todayTasks)}>
                <Download size={18} />
                导出巡检
              </button>
              {previewMode ? (
                <button className={`${styles.primaryCommand} ds-button ds-button-primary`} type="button" onClick={() => openWorkOrder()}>
                  <FilePlus2 size={18} />
                  {workOrderAudience.primaryActionLabel}
                </button>
              ) : (
                <PermissionButton className={`${styles.primaryCommand} ds-button ds-button-primary`} permission="workorder:create" type="button" onClick={() => openWorkOrder()}>
                  <FilePlus2 size={18} />
                  {workOrderAudience.primaryActionLabel}
                </PermissionButton>
              )}
            </div>
          </div>
        </section>

        <section className={`${styles.commandPanel} ds-command-grid`} aria-label="快捷操作">
          <button className={`${styles.commandButton} ds-command-card ds-command-card-primary`} type="button" onClick={() => scrollToSection("today-inspections")}>
            <span className={`${styles.commandIcon} ds-command-icon`}><ClipboardCheck size={22} /></span>
            <span className="ds-command-copy">
              <strong>{TERMINAL_QUICK_ACTIONS[0].label}</strong>
              <small>{todayTasks.length} 项 / {completionRate}%</small>
            </span>
          </button>
          <button className={`${styles.commandButton} ds-command-card`} type="button" onClick={() => void locate(setCheckInForm, setMessage)}>
            <span className={`${styles.commandIcon} ds-command-icon`}><LocateFixed size={22} /></span>
            <span className="ds-command-copy">
              <strong>定位打卡</strong>
              <small>GPS 打卡</small>
            </span>
          </button>
          {previewMode ? (
            <button className={`${styles.commandButton} ds-command-card`} type="button" onClick={() => openWorkOrder()}>
              <span className={`${styles.commandIcon} ds-command-icon`}><Wrench size={22} /></span>
              <span className="ds-command-copy">
                <strong>{TERMINAL_QUICK_ACTIONS[1].label}</strong>
                <small>{workOrderAudience.label}</small>
              </span>
            </button>
          ) : (
            <PermissionButton className={`${styles.commandButton} ds-command-card`} permission="workorder:create" type="button" onClick={() => openWorkOrder()}>
              <span className={`${styles.commandIcon} ds-command-icon`}><Wrench size={22} /></span>
              <span className="ds-command-copy">
                <strong>{TERMINAL_QUICK_ACTIONS[1].label}</strong>
                <small>{workOrderAudience.label}</small>
              </span>
            </PermissionButton>
          )}
          {canGenerate ? (
            <button className={`${styles.commandButton} ds-command-card`} type="button" onClick={() => void generateTodayTasks().catch((error: Error) => setMessage(error.message))}>
              <span className={`${styles.commandIcon} ds-command-icon`}><Sparkles size={22} /></span>
              <span className="ds-command-copy">
                <strong>生成今日任务</strong>
                <small>计划生成</small>
              </span>
            </button>
          ) : null}
        </section>

        <ContentCard
          className="ds-panel ds-section-panel"
          title="巡检与上报场景"
          actions={(
            <>
              <Link className={styles.configLink} href="/safety/inspect-points">点位维护</Link>
              <Link className={styles.configLink} href="/safety/inspect-templates">模板维护</Link>
            </>
          )}
        >
          <section className={`${styles.sceneGrid} ds-scene-grid`} aria-label="巡检场景">
            {OPERATION_SCENES.map((scene) => {
              const count = sceneTasks(todayTasks, scene).length;
              const Icon = scene.icon;
              return (
                <button className={`${styles.sceneButton} ds-scene-card`} type="button" key={scene.key} onClick={() => openWorkOrder(scene)}>
                  <span className={`${styles.sceneIcon} ds-scene-icon`}><Icon size={22} /></span>
                  <span className={`${styles.sceneText} ds-scene-copy`}>
                    <strong className={styles.sceneTitle}>
                      {scene.label}
                      <span className={styles.sceneCycle}>{scene.recommendedCycle}</span>
                    </strong>
                    <small>{scene.description}</small>
                  </span>
                  <span className={`${styles.sceneCount} ds-count-badge`}>{count}</span>
                </button>
              );
            })}
          </section>
        </ContentCard>

        <section className={`${styles.kpiGrid} ds-kpi-grid ds-terminal-kpi-grid`}>
          <TerminalKpi label="今日任务" value={todayTasks.length} helper="已分配给当前账号" />
          <TerminalKpi label="待执行" value={pendingTasks.length} helper="需要开始并打卡" />
              <TerminalKpi label="执行中" value={runningTasks.length} helper="已开始未完成" />
              <TerminalKpi label="逾期" value={overdueTasks.length} helper="仍可继续执行" />
              <TerminalKpi label="异常" value={abnormalTasks.length} helper="异常项可自动生成隐患" />
        </section>

        {message ? <FeedbackNotice className={styles.message}>{message}</FeedbackNotice> : null}

        {canReadWorkflow ? (
          <WorkflowInboxDigest
            audience="operations"
            className="ds-panel ds-section-panel"
            previewMode={previewMode}
            previewData={previewData?.workflowInbox}
          />
        ) : null}

        {loading ? (
          <ContentCard className="ds-panel ds-section-panel">
            <LoadingState title="正在加载现场任务" />
          </ContentCard>
        ) : (
          <>
            <ContentCard className="ds-panel ds-section-panel" id="today-inspections" title="今日巡检任务" actions={<StatusPill value={`${completionRate}%`} />}>
              <div className={`${styles.mobileTaskList} ds-mobile-record-list`}>
                {todayTasks.map((task) => (
                  <article className={`${styles.mobileTaskCard} ds-mobile-record`} key={task.id}>
                    <div className={`${styles.mobileTaskHeader} ds-mobile-record-header`}>
                      <strong>{task.point?.pointName ?? task.taskCode}</strong>
                      <StatusPill dictCode="safety_inspect_task_status" value={task.status} dicts={dicts} />
                    </div>
                    <span>{task.template?.templateName ?? "巡检任务"}</span>
                    <dl>
                      <div><dt>任务编号</dt><dd>{task.taskCode}</dd></div>
                      <div><dt>计划时间</dt><dd>{formatDateTime(task.planTime)}</dd></div>
                      <div><dt>责任人</dt><dd>{task.handlerName ?? "-"}</dd></div>
                    </dl>
                    <button className={`${styles.mobilePrimaryAction} ds-button ds-button-primary ds-mobile-record-action`} type="button" onClick={() => void openExecute(task).catch((error: Error) => setMessage(error.message))}>
                      <ClipboardCheck size={16} />
                      进入执行
                    </button>
                  </article>
                ))}
              </div>
              <div className={`${styles.desktopTable} ds-table-shell`}>
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
                        <td>
                          <span className={styles.tableTaskCell}>
                            <strong>{task.taskCode}</strong>
                            <span className={styles.mutedText}>{task.handlerName}</span>
                          </span>
                        </td>
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
                          <EmptyState
                            compact
                            title="今天暂无巡检任务"
                          />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </DataTable>
              </div>
              {todayTasks.length === 0 ? (
                <div className={styles.mobileOnly}>
                  <EmptyState
                    compact
                    title="今天暂无巡检任务"
                  />
                </div>
              ) : null}
            </ContentCard>

            <ContentCard
              className="ds-panel ds-section-panel"
              title="最近工单"
              actions={(
                previewMode ? (
                  <button className="secondary-button ds-button ds-button-secondary" type="button" onClick={() => openWorkOrder()}>
                    <Plus size={16} />
                    新增
                  </button>
                ) : (
                  <PermissionButton className="secondary-button ds-button ds-button-secondary" permission="workorder:create" type="button" onClick={() => openWorkOrder()}>
                    <Plus size={16} />
                    新增
                  </PermissionButton>
                )
              )}
            >
              <div className={`${styles.mobileTaskList} ds-mobile-record-list`}>
                {recentWorkOrders.map((order) => (
                  <article className={`${styles.mobileTaskCard} ds-mobile-record`} key={order.id}>
                    <div className={`${styles.mobileTaskHeader} ds-mobile-record-header`}>
                      <strong>{order.title}</strong>
                      <StatusPill dictCode="workorder_status" value={order.status} dicts={dicts} />
                    </div>
                    <span>{order.woCode}</span>
                    <dl>
                      <div><dt>优先级</dt><dd><StatusPill dictCode="workorder_priority" value={order.priority} dicts={dicts} /></dd></div>
                      <div><dt>提交时间</dt><dd>{formatDateTime(order.createTime)}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
              <div className={`${styles.desktopTable} ds-table-shell`}>
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
                      <tr><td colSpan={5}><EmptyState compact title="暂无最近工单" /></td></tr>
                    ) : null}
                  </tbody>
                </DataTable>
              </div>
              {recentWorkOrders.length === 0 ? <div className={styles.mobileOnly}><EmptyState compact title="暂无最近工单" /></div> : null}
            </ContentCard>
          </>
        )}

        {executing ? (
          <InspectionExecutionDrawer
            task={executing}
            dicts={dicts}
            checkInForm={checkInForm}
            resultInputs={resultInputs}
            itemResultItems={itemResultItems}
            onClose={() => setExecuting(null)}
            onLocate={() => void locate(setCheckInForm, setMessage)}
            onStart={() => void startTask().catch((error: Error) => setMessage(error.message))}
            onSubmitCheckIn={(event) => void submitCheckIn(event).catch((error: Error) => setMessage(error.message))}
            onSubmitResults={(event) => void submitResults(event).catch((error: Error) => setMessage(error.message))}
            onSaveDraft={() => void saveDraft().catch((error: Error) => setMessage(error.message))}
            onScanQr={() => void scanQr()}
            onCheckInChange={(patch) => setCheckInForm((current) => ({ ...current, ...patch }))}
            onResultInputChange={setResultInput}
            previewMode={previewMode}
          />
        ) : null}

        {workOrderOpen ? (
          <QuickWorkOrderDrawer
            form={workOrderForm}
            dicts={dicts}
            units={units}
            parkTenants={parkTenants}
            users={users}
            audienceProfile={workOrderAudience}
            onClose={() => setWorkOrderOpen(false)}
            onSubmit={(event) => void createWorkOrder(event).catch((error: Error) => setMessage(error.message))}
            onChange={(patch) => setWorkOrderForm((current) => ({ ...current, ...patch }))}
          />
        ) : null}
      </PageShell>
  );

  if (previewMode) {
    return content;
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MY} module={SAFETY_MODULE} fallback={<PageShell><Card><EmptyState title="无权访问现场工作台" /></Card></PageShell>}>
      {content}
    </PermissionGuard>
  );

  function setResultInput(itemId: string, patch: Partial<ResultInput>) {
    setResultInputs((current) => ({
      ...current,
      [itemId]: {
        result: "normal",
        valueText: "",
        valueNumber: "",
        photoFileIds: [],
        createHazard: true,
        ...(current[itemId] ?? {}),
        ...patch
      }
    }));
  }
}

async function loadDictMap(): Promise<DictMap> {
  return loadDictMapByCodes<DictItemRow>(TERMINAL_DICT_CODES);
}

function workOrderDefaultsForScene(
  scene: OperationSceneConfig | undefined,
  dicts: DictMap,
  audienceProfile: ReturnType<typeof resolveWorkOrderAudience>
): Pick<WorkOrderForm, "woType" | "priority" | "urgency" | "sourceType"> {
  const sceneProfile = workOrderProfileForScene(scene, audienceProfile.defaultType);
  return {
    woType: defaultDictValue(dicts.workorder_type, [sceneProfile.woType, audienceProfile.defaultType, DEFAULT_WORK_ORDER_TYPE]),
    priority: defaultDictValue(dicts.workorder_priority, [sceneProfile.priority, DEFAULT_WORK_ORDER_PRIORITY]),
    urgency: defaultDictValue(dicts.workorder_urgency, [sceneProfile.urgency, DEFAULT_WORK_ORDER_URGENCY]),
    sourceType: defaultDictValue(dicts.workorder_source_type, [scene ? "inspection" : audienceProfile.sourceType, audienceProfile.sourceType, "manual"])
  };
}

function workOrderProfileForScene(scene: OperationSceneConfig | undefined, fallbackType: string): Pick<WorkOrderForm, "woType" | "priority" | "urgency"> {
  if (!scene) {
    return { woType: fallbackType || DEFAULT_WORK_ORDER_TYPE, priority: DEFAULT_WORK_ORDER_PRIORITY, urgency: DEFAULT_WORK_ORDER_URGENCY };
  }
  switch (scene.key) {
    case "sanitation":
      return { woType: "cleaning", priority: DEFAULT_WORK_ORDER_PRIORITY, urgency: DEFAULT_WORK_ORDER_URGENCY };
    case "fire":
      return { woType: "fire_safety", priority: "high", urgency: "urgent" };
    case "electric":
      return { woType: "energy", priority: "high", urgency: "urgent" };
    case "equipment":
    case "concealedFacility":
      return { woType: "maintenance", priority: DEFAULT_WORK_ORDER_PRIORITY, urgency: DEFAULT_WORK_ORDER_URGENCY };
    case "parking":
      return { woType: "parking", priority: DEFAULT_WORK_ORDER_PRIORITY, urgency: DEFAULT_WORK_ORDER_URGENCY };
    case "landscape":
      return { woType: "landscaping", priority: DEFAULT_WORK_ORDER_PRIORITY, urgency: DEFAULT_WORK_ORDER_URGENCY };
    case "general":
    default:
      return { woType: DEFAULT_WORK_ORDER_TYPE, priority: DEFAULT_WORK_ORDER_PRIORITY, urgency: DEFAULT_WORK_ORDER_URGENCY };
  }
}

function normalizeWorkOrderForm(form: WorkOrderForm, dicts: DictMap): WorkOrderForm {
  return {
    ...form,
    woType: form.woType || defaultDictValue(dicts.workorder_type, [DEFAULT_WORK_ORDER_TYPE]),
    priority: form.priority || defaultDictValue(dicts.workorder_priority, [DEFAULT_WORK_ORDER_PRIORITY]),
    urgency: form.urgency || defaultDictValue(dicts.workorder_urgency, [DEFAULT_WORK_ORDER_URGENCY]),
    sourceType: form.sourceType || defaultDictValue(dicts.workorder_source_type, ["manual"])
  };
}

function validateWorkOrderForm(form: WorkOrderForm): string {
  if (!form.woType) return "请选择需求类型";
  if (!form.priority) return "请选择优先级";
  if (!form.title.trim()) return "请填写需求标题";
  if (!form.description.trim()) return "请填写问题描述";
  return "";
}

function TerminalKpi({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <Card className={`${styles.kpiCard} ds-kpi-card`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </Card>
  );
}

function sceneTasks(tasks: InspectTaskRow[], scene: OperationSceneConfig): InspectTaskRow[] {
  if (scene.key === "general") {
    return tasks.filter((task) => !OPERATION_SCENES.some((candidate) => candidate.key !== "general" && matchScene(taskSearchText(task), candidate)));
  }
  return tasks.filter((task) => matchScene(taskSearchText(task), scene));
}

function taskSearchText(task: InspectTaskRow): string {
  return [task.template?.templateName, task.point?.pointName, task.remark].filter(Boolean).join(" ");
}

function defaultDictValue(items?: DictItemRow[], preferredValues: string[] = []): string {
  const enabled = items?.filter((item) => item.status === "enabled") ?? [];
  for (const value of preferredValues) {
    if (enabled.some((item) => item.itemValue === value)) return value;
  }
  return enabled[0]?.itemValue ?? "";
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

function isOverdueTask(task: InspectTaskRow): boolean {
  if (task.status === "30" || task.status === "90") {
    return false;
  }
  return new Date(task.dueTime).getTime() < Date.now();
}

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function tomorrowStart() {
  const date = todayStart();
  date.setDate(date.getDate() + 1);
  return date;
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

function exportTodayTasks(tasks: InspectTaskRow[]): void {
  if (typeof window === "undefined") return;
  const headers = ["任务编号", "点位", "模板", "责任人", "计划时间", "截止时间", "状态", "结果"];
  const rows = tasks.map((task) => [
    task.taskCode,
    task.point?.pointName ?? "",
    task.template?.templateName ?? "",
    task.handlerName ?? "",
    formatDateTime(task.planTime),
    formatDateTime(task.dueTime),
    task.status,
    task.result ?? ""
  ]);
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `今日巡检任务-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

interface LocalInspectionDraft {
  checkInForm: CheckInForm;
  resultInputs: Record<string, ResultInput>;
}

function draftKey(taskId: string): string {
  return `safety-inspect-draft:${taskId}`;
}

function readLocalDraft(taskId: string): LocalInspectionDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(draftKey(taskId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalInspectionDraft;
  } catch {
    return null;
  }
}

function writeLocalDraft(taskId: string, draft: LocalInspectionDraft): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(draftKey(taskId), JSON.stringify(draft));
}

function clearLocalDraft(taskId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(taskId));
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorConstructor {
  new(options?: { formats?: string[] }): BarcodeDetectorLike;
}

async function scanQrCode(): Promise<string | null> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器不支持摄像头扫码，可手工填写点位码。");
  }
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector) {
    throw new Error("当前浏览器不支持二维码识别，可手工填写点位码。");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    const detector = new Detector({ formats: ["qr_code"] });
    const codes = await detector.detect(video);
    return codes[0]?.rawValue ?? null;
  } finally {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    video.srcObject = null;
  }
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
