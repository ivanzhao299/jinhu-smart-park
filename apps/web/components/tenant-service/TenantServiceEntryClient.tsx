"use client";

import {
  Card,
  ContentCard,
  DataTable,
  EmptyState,
  FeedbackNotice,
  LoadingState,
  PageShell,
  StatusPill
} from "@jinhu/ui";
import { Building2, FilePlus2, Headphones, RefreshCw, ShieldAlert, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionGuard } from "../auth/PermissionGuard";
import { useMobileTerminalMode } from "../mobile/useMobileTerminalMode";
import { QuickWorkOrderDrawer } from "../operations/QuickWorkOrderDrawer";
import { WorkflowInboxDigest } from "../workflow/WorkflowInboxDigest";
import type { DictItemRow, DictMap, ParkTenantRow, UnitRow, UserRow, WorkOrderForm, WorkOrderRow } from "../operations/terminal-types";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { useAuthUser } from "../../lib/auth-context";
import { getAccessToken } from "../../lib/authz";
import { loadDictMapByCodes } from "../../lib/dict-client";
import { hasPermission } from "../../lib/permissions";
import { fetchReferenceFormOptions } from "../../lib/reference-data";
import type { WorkflowInboxResponse } from "../../lib/workflow-inbox-types";
import { buildWorkOrderPrefill, formatUnitLocation, type WorkOrderAudienceProfile } from "../../lib/workorder-prefill";
import styles from "./TenantServiceEntry.module.css";

const WORKORDER_MODULE = "workorder";
const SERVICE_DICT_CODES = ["workorder_status", "workorder_type", "workorder_priority", "workorder_urgency", "workorder_source_type"];

export interface TenantServiceWorkOrderRow extends WorkOrderRow {
  sourceType?: string | null;
  parkTenantId?: string | null;
  unitId?: string | null;
  location?: string | null;
  assigneeName?: string | null;
  parkTenant?: ParkTenantRow | null;
}

interface TenantServiceEntryClientProps {
  previewMode?: boolean;
  previewData?: {
    dicts?: DictMap;
    workOrders?: TenantServiceWorkOrderRow[];
    parkTenants?: ParkTenantRow[];
    units?: UnitRow[];
    users?: UserRow[];
    workflowInbox?: WorkflowInboxResponse;
  };
}

const serviceActions = [
  {
    key: "repair",
    title: "维修报修",
    helper: "灯具、空调、门禁、水电等现场故障",
    icon: Wrench,
    priority: "high",
    urgency: "urgent",
    titleTemplate: "现场维修报修",
    description: "请补充故障位置、现象、影响范围和方便上门时间。"
  },
  {
    key: "cleaning",
    title: "保洁服务",
    helper: "公共区域、卫生间、走廊和垃圾清运",
    icon: Sparkles,
    priority: "medium",
    urgency: "normal",
    titleTemplate: "保洁服务请求",
    description: "请说明需要处理的区域、现场照片和期望完成时间。"
  },
  {
    key: "security",
    title: "安防协助",
    helper: "通行、巡逻、门禁、可疑情况协助",
    icon: ShieldAlert,
    priority: "high",
    urgency: "urgent",
    titleTemplate: "安防协助请求",
    description: "请说明事件位置、人员/车辆信息、紧急程度和联系方式。"
  },
  {
    key: "access",
    title: "通行协同",
    helper: "访客、车辆、货物进出园区协同",
    icon: Building2,
    priority: "medium",
    urgency: "normal",
    titleTemplate: "通行协同请求",
    description: "请说明通行对象、时间、车辆/人员信息和审批联系人。"
  },
  {
    key: "consult",
    title: "服务咨询",
    helper: "账单、合同、物业服务和其他咨询",
    icon: Headphones,
    priority: "medium",
    urgency: "normal",
    titleTemplate: "园区服务咨询",
    description: "请说明咨询事项、关联合同/账单或需要客服协助的问题。"
  }
];

const defaultWorkOrderForm: WorkOrderForm = {
  woType: "",
  priority: "",
  urgency: "",
  sourceType: "tenant_request",
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

const serviceFlowSteps = [
  { key: "submit", label: "提交", owner: "业主 / 租户", helper: "补充位置、联系人、照片和诉求说明" },
  { key: "dispatch", label: "受理", owner: "客服 / 调度岗", helper: "确认信息并分派责任部门" },
  { key: "handle", label: "处理", owner: "物业 / 工程 / 安防 / 信息化", helper: "上门处理、登记过程、上传附件" },
  { key: "confirm", label: "确认", owner: "提交人 / 客服", helper: "确认结果、评价或退回继续处理" }
];

const tenantServiceProfile: WorkOrderAudienceProfile = {
  audience: "tenant",
  label: "业主 / 租户",
  eyebrow: "服务请求",
  title: "提交园区服务请求",
  description: "面向企业租户和业主联系人，用于报修、保洁、安防、通行、咨询等诉求提交。",
  primaryActionLabel: "提交服务请求",
  sourceType: "tenant_request",
  defaultType: "repair",
  defaultTitle: "园区服务请求",
  defaultDescription: "请说明诉求事项、现场位置、影响范围和期望处理时间。"
};

export function TenantServiceEntryClient({ previewMode = false, previewData }: TenantServiceEntryClientProps = {}) {
  const authUser = useAuthUser();
  const [dicts, setDicts] = useState<DictMap>(previewData?.dicts ?? {});
  const [workOrders, setWorkOrders] = useState<TenantServiceWorkOrderRow[]>(previewData?.workOrders ?? []);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>(previewData?.parkTenants ?? []);
  const [units, setUnits] = useState<UnitRow[]>(previewData?.units ?? []);
  const [users, setUsers] = useState<UserRow[]>(previewData?.users ?? []);
  const [loading, setLoading] = useState(!previewMode);
  const [message, setMessage] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<WorkOrderForm>(defaultWorkOrderForm);
  const canCreate = previewMode || hasPermission(authUser, SYSTEM_PERMISSIONS.WORKORDER_CREATE);

  const openCount = workOrders.filter((item) => !["70", "100"].includes(item.status)).length;
  const processingCount = workOrders.filter((item) => ["20", "30", "40", "50"].includes(item.status)).length;
  const waitingConfirmCount = workOrders.filter((item) => item.status === "60").length;
  const closedCount = workOrders.filter((item) => ["70", "100"].includes(item.status)).length;
  const latestOrder = workOrders[0];
  const latestFlow = latestOrder ? serviceFlowState(latestOrder.status) : serviceFlowState("");

  useMobileTerminalMode(["mobile-terminal-mode", "tenant-service-mode"]);

  const loadAll = useCallback(async () => {
    if (previewMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");
    const [orderResponse, dictResponse, referenceResponse] = await Promise.allSettled([
      apiRequest<PaginatedResult<TenantServiceWorkOrderRow>>("/work-orders?page=1&page_size=12&source_type=tenant_request&sort=createTime:DESC", { token: getAccessToken() }),
      loadDictMap(),
      fetchReferenceFormOptions()
    ]);
    if (orderResponse.status === "fulfilled") setWorkOrders(orderResponse.value.data.items);
    if (dictResponse.status === "fulfilled") setDicts(dictResponse.value);
    if (referenceResponse.status === "fulfilled") {
      setParkTenants(referenceResponse.value.parkTenants);
      setUnits(referenceResponse.value.units);
      setUsers(referenceResponse.value.users.filter((item) => item.status === "enabled"));
    }
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

  const tenantOptions = useMemo(() => parkTenants.map((item) => ({ id: item.id, label: item.companyName })), [parkTenants]);

  function openServiceRequest(actionKey?: string) {
    const action = serviceActions.find((item) => item.key === actionKey) ?? serviceActions[0];
    if (!action) return;
    const prefill = buildWorkOrderPrefill(authUser, parkTenants, units);
    setForm({
      ...defaultWorkOrderForm,
      woType: defaultDictValue(dicts.workorder_type),
      priority: preferredDictValue(dicts.workorder_priority, action.priority),
      urgency: preferredDictValue(dicts.workorder_urgency, action.urgency),
      sourceType: "tenant_request",
      title: action.titleTemplate,
      description: action.description,
      location: prefill.location,
      parkTenantId: prefill.parkTenantId,
      unitId: prefill.unitId,
      reporterName: prefill.reporterName,
      reporterMobile: prefill.reporterMobile
    });
    setDrawerOpen(true);
    setMessage("");
  }

  async function submitServiceRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (previewMode) {
      setWorkOrders((current) => [{
        id: `preview-tenant-request-${Date.now()}`,
        woCode: "WO-TENANT-PREVIEW",
        title: form.title.trim() || "租户服务请求",
        status: "10",
        priority: form.priority || "normal",
        urgency: form.urgency || null,
        createTime: new Date().toISOString(),
        sourceType: "tenant_request",
        parkTenantId: form.parkTenantId || null,
        unitId: form.unitId || null,
        location: form.location || null,
        assigneeName: "",
        parkTenant: parkTenants.find((item) => item.id === form.parkTenantId) ?? null
      }, ...current]);
      setDrawerOpen(false);
      setMessage("预览：服务请求已提交");
      return;
    }
    const unit = units.find((item) => item.id === form.unitId);
    const assignee = users.find((item) => item.id === form.assigneeId);
    await apiRequest<TenantServiceWorkOrderRow>("/work-orders", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("tenant-service-workorder-create"),
      body: {
        title: form.title.trim(),
        wo_type: form.woType,
        priority: form.priority,
        urgency: form.urgency || undefined,
        source_type: "tenant_request",
        park_tenant_id: form.parkTenantId || undefined,
        unit_id: form.unitId || undefined,
        building_id: unit?.buildingId,
        floor_id: unit?.floorId,
        room_label: unit?.unitName,
        location: form.location.trim() || formatUnitLocation(unit),
        reporter_name: form.reporterName.trim() || undefined,
        reporter_mobile: form.reporterMobile.trim() || undefined,
        assignee_id: form.assigneeId || undefined,
        assignee_name: displayUser(assignee),
        description: form.description.trim(),
        image_file_ids: form.imageFileIds
      }
    });
    setDrawerOpen(false);
    setMessage("服务请求已提交，已进入工单受理队列");
    await loadAll();
  }

  const content = (
    <PageShell className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>服务终端</span>
          <h1>租户服务工作台</h1>
          <p>面向企业租户与业主联系人的高频服务入口，适合手机端快速提报、跟进和确认。</p>
        </div>
        <div className={styles.heroActions}>
          <button className="secondary-button" type="button" onClick={() => void loadAll().catch((error: Error) => setMessage(error.message))}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="primary-button" type="button" disabled={!canCreate} onClick={() => openServiceRequest()}>
            <FilePlus2 size={16} />
            新建服务请求
          </button>
        </div>
      </section>

      <section className={styles.actionGrid} aria-label="租户快捷服务">
        {serviceActions.map((action) => {
          const Icon = action.icon;
          return (
            <button className={styles.actionCard} disabled={!canCreate} key={action.key} type="button" onClick={() => openServiceRequest(action.key)}>
              <span className={styles.actionIcon}><Icon size={22} /></span>
              <strong>{action.title}</strong>
              <small>{action.helper}</small>
            </button>
          );
        })}
      </section>

      <section className={styles.kpiGrid} aria-label="租户服务状态">
        <TenantServiceKpi label="未闭环" value={openCount} helper="待受理 / 处理中 / 待确认" />
        <TenantServiceKpi label="处理中" value={processingCount} helper="已进入物业处理队列" />
        <TenantServiceKpi label="待确认" value={waitingConfirmCount} helper="等待租户确认或评价" />
        <TenantServiceKpi label="已闭环" value={closedCount} helper="已评价或已关闭" />
      </section>

      <section className={styles.flowPanel} aria-label="服务请求流转">
        <div className={styles.flowSummary}>
          <span>服务流转</span>
          <strong>{latestFlow.title}</strong>
          <small>{latestFlow.helper}</small>
        </div>
        <div className={styles.flowSteps}>
          {serviceFlowSteps.map((step, index) => (
            <div className={index <= latestFlow.index ? styles.flowStepActive : styles.flowStep} key={step.key}>
              <span>{step.label}</span>
              <strong>{step.owner}</strong>
              <small>{step.helper}</small>
            </div>
          ))}
        </div>
        <Link className={styles.flowLink} href="/workflow/inbox">查看流程收件箱</Link>
      </section>

      <WorkflowInboxDigest
        audience="tenant"
        previewMode={previewMode}
        previewData={previewData?.workflowInbox}
      />

      {message ? <FeedbackNotice>{message}</FeedbackNotice> : null}
      {!canCreate ? <FeedbackNotice>当前账号可查看租户服务请求，但没有新增工单权限。</FeedbackNotice> : null}

      {loading ? (
        <ContentCard>
          <LoadingState title="正在加载租户服务数据" />
        </ContentCard>
      ) : (
        <section className={styles.workbench}>
          <ContentCard className={styles.timelinePanel} title="服务进度">
            {latestOrder ? (
              <>
                <div className={styles.latestHeader}>
                  <span>{latestOrder.woCode}</span>
                  <strong>{latestOrder.title}</strong>
                  <StatusPill dictCode="workorder_status" value={latestOrder.status} dicts={dicts} />
                </div>
                <div className={styles.timelineLine} aria-label="服务处理进度">
                  {["已提交", "已受理", "处理中", "待确认", "已评价"].map((step, index) => (
                    <span className={index <= progressIndex(latestOrder.status) ? styles.timelineStepDone : styles.timelineStep} key={step}>{step}</span>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState compact title="暂无租户服务请求" />
            )}
          </ContentCard>

          <ContentCard className={styles.listPanel} title="最近服务请求">
            <div className={styles.mobileList}>
              {workOrders.map((order) => (
                <article className={styles.requestCard} key={order.id}>
                  <div className={styles.requestHeader}>
                    <strong>{order.title}</strong>
                    <StatusPill dictCode="workorder_status" value={order.status} dicts={dicts} />
                  </div>
                  <dl>
                    <div><dt>编号</dt><dd>{order.woCode}</dd></div>
                    <div><dt>企业</dt><dd>{order.parkTenant?.companyName ?? tenantName(parkTenants, order.parkTenantId)}</dd></div>
                    <div><dt>位置</dt><dd>{order.location ?? "-"}</dd></div>
                    <div><dt>提交</dt><dd>{formatDateTime(order.createTime)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
            <div className={styles.tableShell}>
              <DataTable>
                <thead>
                  <tr>
                    <th>编号</th>
                    <th>服务事项</th>
                    <th>企业</th>
                    <th>优先级</th>
                    <th>状态</th>
                    <th>提交时间</th>
                  </tr>
                </thead>
                <tbody>
                  {workOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.woCode}</td>
                      <td>{order.title}</td>
                      <td>{order.parkTenant?.companyName ?? tenantName(parkTenants, order.parkTenantId)}</td>
                      <td><StatusPill dictCode="workorder_priority" value={order.priority} dicts={dicts} /></td>
                      <td><StatusPill dictCode="workorder_status" value={order.status} dicts={dicts} /></td>
                      <td>{formatDateTime(order.createTime)}</td>
                    </tr>
                  ))}
                  {workOrders.length === 0 ? <tr><td colSpan={6}><EmptyState compact title="暂无租户服务请求" /></td></tr> : null}
                </tbody>
              </DataTable>
            </div>
          </ContentCard>
        </section>
      )}

      <ContentCard title="服务对象">
        <div className={styles.tenantStrip}>
          {tenantOptions.slice(0, 4).map((tenant) => <span key={tenant.id}>{tenant.label}</span>)}
          {tenantOptions.length === 0 ? <span>暂无租户企业</span> : null}
        </div>
      </ContentCard>

      {drawerOpen ? (
        <QuickWorkOrderDrawer
          form={form}
          dicts={dicts}
          units={units}
          parkTenants={parkTenants}
          users={users}
          audienceProfile={tenantServiceProfile}
          onClose={() => setDrawerOpen(false)}
          onSubmit={(event) => void submitServiceRequest(event).catch((error: Error) => setMessage(error.message))}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        />
      ) : null}
    </PageShell>
  );

  if (previewMode) {
    return content;
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_READ} module={WORKORDER_MODULE} fallback={<PageShell><Card><EmptyState title="无权访问租户服务台" /></Card></PageShell>}>
      {content}
    </PermissionGuard>
  );
}

function TenantServiceKpi({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <Card className={styles.kpiCard}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </Card>
  );
}

async function loadDictMap(): Promise<DictMap> {
  return loadDictMapByCodes<DictItemRow>(SERVICE_DICT_CODES);
}

function defaultDictValue(items?: DictItemRow[]): string {
  return items?.[0]?.itemValue ?? "";
}

function preferredDictValue(items: DictItemRow[] | undefined, preferred: string): string {
  return items?.some((item) => item.itemValue === preferred) ? preferred : defaultDictValue(items);
}

function tenantName(tenants: ParkTenantRow[], tenantId?: string | null): string {
  if (!tenantId) return "-";
  return tenants.find((item) => item.id === tenantId)?.companyName ?? tenantId;
}

function displayUser(user?: UserRow): string {
  if (!user) return "";
  return user.displayName ?? user.realName ?? user.username;
}

function progressIndex(status: string): number {
  if (["70", "100"].includes(status)) return 4;
  if (status === "60") return 3;
  if (["20", "30", "40", "50"].includes(status)) return 2;
  if (status === "10") return 1;
  return 0;
}

function serviceFlowState(status: string): { index: number; title: string; helper: string } {
  if (["70", "100"].includes(status)) {
    return { index: 3, title: "服务已闭环", helper: "服务请求已完成确认，可在最近服务请求中追溯记录。" };
  }
  if (status === "60") {
    return { index: 3, title: "等待提交人确认", helper: "处理人已完成服务，等待租户确认、评价或反馈。" };
  }
  if (["20", "30", "40", "50"].includes(status)) {
    return { index: 2, title: "责任部门处理中", helper: "物业、工程、安防或信息化人员正在处理，可通过流程收件箱查看消息。" };
  }
  if (status === "10") {
    return { index: 1, title: "服务台正在受理", helper: "客服或调度岗将确认信息并分派给对应责任部门。" };
  }
  return { index: 0, title: "提交后自动进入受理队列", helper: "系统会把服务请求推送给客服/调度岗，再分派给责任部门处理。" };
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
