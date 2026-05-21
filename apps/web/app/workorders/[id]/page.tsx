"use client";

import { Card } from "@jinhu/ui";
import {
  Archive,
  ArrowLeft,
  Ban,
  CheckCircle2,
  CornerDownLeft,
  Hammer,
  PackageSearch,
  PlayCircle,
  RefreshCw,
  Send,
  ShieldAlert,
  Shuffle,
  Star
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type UserContext } from "@jinhu/shared";
import { AttachmentList } from "../../../components/files/AttachmentList";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { PriorityBadge, WorkOrderStatusBadge, labelFor } from "../../../components/workorders/WorkOrderBadges";
import { WorkOrderTimeline } from "../../../components/workorders/WorkOrderTimeline";
import type { DictItemRow, DictMap, DictTypeRow, WorkOrderLogRow, WorkOrderRow } from "../../../components/workorders/types";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";

const WORKORDER_MODULE = "workorder";
const WORK_ORDER_ENTITY = "work_order";
const FIELD_REPORTER_MOBILE = "reporterMobile";
const FIELD_DESCRIPTION = "description";
const FIELD_IMAGE_FILE_IDS = "imageFileIds";
const FIELD_VIDEO_FILE_IDS = "videoFileIds";
const FIELD_EVALUATION = "evaluation";

type ActionKey =
  | "assign"
  | "reassign"
  | "accept"
  | "start"
  | "wait-material"
  | "finish"
  | "confirm"
  | "evaluate"
  | "close"
  | "cancel"
  | "return"
  | "reject";

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const authUser = useAuthUser();
  const id = params.id;
  const [detail, setDetail] = useState<WorkOrderRow | null>(null);
  const [logs, setLogs] = useState<WorkOrderLogRow[]>([]);
  const [dicts, setDicts] = useState<DictMap>({});
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const statusItems = dicts.workorder_status ?? [];
  const typeItems = dicts.workorder_type ?? [];
  const priorityItems = dicts.workorder_priority ?? [];
  const urgencyItems = dicts.workorder_urgency ?? [];
  const sourceItems = dicts.workorder_source_type ?? [];
  const canViewReporterMobile = canViewField(authUser, WORKORDER_MODULE, WORK_ORDER_ENTITY, FIELD_REPORTER_MOBILE);
  const canViewDescription = canViewField(authUser, WORKORDER_MODULE, WORK_ORDER_ENTITY, FIELD_DESCRIPTION);
  const canViewImageFileIds = canViewField(authUser, WORKORDER_MODULE, WORK_ORDER_ENTITY, FIELD_IMAGE_FILE_IDS);
  const canViewVideoFileIds = canViewField(authUser, WORKORDER_MODULE, WORK_ORDER_ENTITY, FIELD_VIDEO_FILE_IDS);
  const canViewEvaluation = canViewField(authUser, WORKORDER_MODULE, WORK_ORDER_ENTITY, FIELD_EVALUATION);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest<WorkOrderRow>(`/work-orders/${id}`, {
        token: getAccessToken()
      });
      setDetail(response.data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadLogs = useCallback(async () => {
    if (!hasPermission(authUser, SYSTEM_PERMISSIONS.WORKORDER_LOG_READ)) {
      setLogs([]);
      return;
    }
    setLogsLoading(true);
    try {
      const response = await apiRequest<PaginatedResult<WorkOrderLogRow>>(`/work-orders/${id}/logs?page=1&page_size=100&order=desc`, {
        token: getAccessToken()
      });
      setLogs(response.data.items);
    } finally {
      setLogsLoading(false);
    }
  }, [authUser, id]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=200", {
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

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
  }, [loadDicts]);

  useEffect(() => {
    void loadDetail().catch((error: Error) => setMessage(error.message));
    void loadLogs().catch((error: Error) => setMessage(error.message));
  }, [loadDetail, loadLogs]);

  async function refresh() {
    await Promise.all([loadDetail(), loadLogs()]);
  }

  async function runAction(action: ActionKey) {
    if (!detail) return;
    const request = buildActionRequest(action);
    if (!request) return;
    const response = await apiRequest<WorkOrderRow>(`/work-orders/${detail.id}/${request.path}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`work-order-${request.path}`),
      body: request.body
    });
    setDetail(response.data);
    setMessage("操作成功");
    await loadLogs();
  }

  function buildActionRequest(action: ActionKey): { path: string; body?: Record<string, unknown> } | null {
    switch (action) {
      case "assign":
      case "reassign": {
        const assigneeId = window.prompt("请输入处理人用户 ID");
        if (!assigneeId?.trim()) return null;
        const reason = action === "reassign" ? window.prompt("请输入改派原因") : window.prompt("派单说明，可选");
        if (action === "reassign" && !reason?.trim()) {
          setMessage("改派原因必填");
          return null;
        }
        return { path: action, body: { assignee_id: assigneeId.trim(), reason: reason?.trim() || undefined } };
      }
      case "wait-material": {
        const reason = window.prompt("请输入待物料原因");
        if (!reason?.trim()) {
          setMessage("待物料原因必填");
          return null;
        }
        return { path: "wait-material", body: { reason: reason.trim() } };
      }
      case "finish": {
        const resolveNote = window.prompt("请输入完成处理说明");
        if (!resolveNote?.trim()) {
          setMessage("完成处理说明必填");
          return null;
        }
        return { path: "finish", body: { resolve_note: resolveNote.trim(), image_file_ids: [] } };
      }
      case "confirm": {
        const confirmNote = window.prompt("确认说明，可选");
        return { path: "confirm", body: { confirm_note: confirmNote?.trim() || undefined } };
      }
      case "evaluate": {
        const satisfactionRaw = window.prompt("请输入满意度 1-5", "5");
        const satisfaction = Number(satisfactionRaw);
        if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) {
          setMessage("满意度必须为 1-5");
          return null;
        }
        const evaluation = window.prompt("评价内容，可选");
        return { path: "evaluate", body: { satisfaction, evaluation: evaluation?.trim() || undefined } };
      }
      case "close":
      case "cancel":
      case "return":
      case "reject": {
        const reason = window.prompt("请输入原因");
        if (!reason?.trim()) {
          setMessage("原因必填");
          return null;
        }
        return { path: action, body: { reason: reason.trim() } };
      }
      default:
        return { path: action };
    }
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_READ} module={WORKORDER_MODULE} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>工单详情</strong>
            <span>{detail ? `${detail.woCode} · ${labelFor(statusItems, detail.status)}` : "查看工单基础信息、SLA、附件、操作和时间线"}</span>
          </div>
          <div className="page-actions">
            <Link className="secondary-button" href="/workorders/list"><ArrowLeft size={16} /> 返回列表</Link>
            <button className="primary-button secondary-button" type="button" onClick={() => void refresh().catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </header>

        {loading ? <DetailSkeleton /> : null}
        {!loading && !detail ? <div className="empty-state"><strong>未找到工单</strong><span>该工单不存在，或当前账号无权查看。</span></div> : null}

        {detail ? (
          <>
            <Card>
              <div className="workorder-detail-hero">
                <div>
                  <span className="muted-text">当前状态</span>
                  <h1>{detail.title}</h1>
                  <p>{detail.woCode} · {labelFor(typeItems, detail.woType)} · {detail.location ?? detail.roomLabel ?? "-"}</p>
                </div>
                <div className="workorder-detail-badges">
                  <WorkOrderStatusBadge items={statusItems} value={detail.status} />
                  <PriorityBadge items={priorityItems} value={detail.priority} />
                  {detail.overdueFlag ? <span className="status-pill status-danger">超时</span> : <span className="status-pill status-success">未超时</span>}
                </div>
              </div>
              <WorkOrderActionPanel user={authUser} row={detail} onAction={(action) => void runAction(action).catch((error: Error) => setMessage(error.message))} />
            </Card>

            <div className="workorder-detail-layout">
              <Card>
                <h2 className="panel-title">基础信息</h2>
                <div className="detail-grid">
                  <DetailItem label="工单编号" value={detail.woCode} />
                  <DetailItem label="类型" value={labelFor(typeItems, detail.woType)} />
                  <DetailItem label="子类型" value={detail.woSubType ?? "-"} />
                  <DetailItem label="来源" value={labelFor(sourceItems, detail.sourceType)} />
                  <DetailItem label="优先级" value={<PriorityBadge items={priorityItems} value={detail.priority} />} />
                  <DetailItem label="紧急程度" value={labelFor(urgencyItems, detail.urgency)} />
                  <DetailItem label="报告人" value={detail.reporterName ?? "-"} />
                  <DetailItem label="报告电话" value={fieldText(authUser, canViewReporterMobile, FIELD_REPORTER_MOBILE, detail.reporterMobile)} />
                  <DetailItem label="创建时间" value={formatDateTime(detail.createTime)} />
                  <DetailItem label="更新时间" value={formatDateTime(detail.updateTime)} />
                  <DetailItem label="问题描述" value={fieldText(authUser, canViewDescription, FIELD_DESCRIPTION, detail.description)} />
                  <DetailItem label="备注" value={detail.remark ?? "-"} />
                </div>
              </Card>

              <Card>
                <h2 className="panel-title">租户企业与位置</h2>
                <div className="detail-grid">
                  <DetailItem label="租户企业" value={detail.parkTenant?.companyName ?? "-"} />
                  <DetailItem label="房源" value={detail.unit ? `${detail.unit.unitCode} ${detail.unit.unitName}` : "-"} />
                  <DetailItem label="楼栋" value={detail.building ? `${detail.building.buildingCode} ${detail.building.buildingName}` : "-"} />
                  <DetailItem label="楼层" value={detail.floor ? `${detail.floor.floorCode} ${detail.floor.floorName}` : "-"} />
                  <DetailItem label="房间标识" value={detail.roomLabel ?? "-"} />
                  <DetailItem label="位置描述" value={detail.location ?? "-"} />
                </div>
              </Card>

              <Card>
                <h2 className="panel-title">处理人与 SLA</h2>
                <div className="detail-grid">
                  <DetailItem label="处理人" value={detail.assigneeName ?? "-"} />
                  <DetailItem label="派单时间" value={formatDateTime(detail.dispatchTime)} />
                  <DetailItem label="接单时间" value={formatDateTime(detail.acceptTime)} />
                  <DetailItem label="开始处理" value={formatDateTime(detail.startTime)} />
                  <DetailItem label="待物料时间" value={formatDateTime(detail.waitMaterialTime)} />
                  <DetailItem label="完成时间" value={formatDateTime(detail.finishTime)} />
                  <DetailItem label="确认时间" value={formatDateTime(detail.confirmTime)} />
                  <DetailItem label="关闭时间" value={formatDateTime(detail.closeTime)} />
                  <DetailItem label="派单 SLA" value={detail.slaDispatchMin === null ? "-" : `${detail.slaDispatchMin} 分钟`} />
                  <DetailItem label="完成 SLA" value={detail.slaFinishMin === null ? "-" : `${detail.slaFinishMin} 分钟`} />
                  <DetailItem label="超时原因" value={detail.overdueReason ?? "-"} />
                  <DetailItem label="处理说明" value={detail.resolveNote ?? "-"} />
                </div>
              </Card>

              <Card>
                <h2 className="panel-title">评价信息</h2>
                <div className="detail-grid">
                  <DetailItem label="满意度" value={detail.satisfaction ? `${detail.satisfaction} / 5` : "-"} />
                  <DetailItem label="评价" value={fieldText(authUser, canViewEvaluation, FIELD_EVALUATION, detail.evaluation)} />
                </div>
              </Card>

              <Card>
                <h2 className="panel-title">图片 / 视频附件</h2>
                <div className="detail-grid">
                  <DetailItem label="报修图片" value={canViewImageFileIds ? `${detail.imageFileIds?.length ?? 0} 个` : "-"} />
                  <DetailItem label="报修视频" value={canViewVideoFileIds ? `${detail.videoFileIds?.length ?? 0} 个` : "-"} />
                </div>
                {canViewImageFileIds || canViewVideoFileIds ? <AttachmentList bizType="workorder_finish" bizId={detail.id} /> : null}
              </Card>

              <Card>
                <h2 className="panel-title">时间线</h2>
                <WorkOrderTimeline logs={logs} statusItems={statusItems} loading={logsLoading} />
              </Card>
            </div>
          </>
        ) : null}

        {message ? <p className="status-pill">{message}</p> : null}
      </main>
    </PermissionGuard>
  );
}

function WorkOrderActionPanel({ user, row, onAction }: { user: UserContext | null; row: WorkOrderRow; onAction: (action: ActionKey) => void }) {
  const actions: Array<{ key: ActionKey; label: string; icon: ReactNode; permission: string; danger?: boolean; visible: boolean }> = [
    { key: "assign", label: "派单", icon: <Send size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_ASSIGN, visible: canAssignWorkOrder(row) },
    { key: "reassign", label: "改派", icon: <Shuffle size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_REASSIGN, visible: canReassignWorkOrder(row) },
    { key: "accept", label: "接单", icon: <CheckCircle2 size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_ACCEPT, visible: canAcceptWorkOrder(user, row) },
    { key: "start", label: row.status === "45" ? "恢复处理" : "开始处理", icon: <PlayCircle size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_START, visible: canStartWorkOrder(user, row) },
    { key: "wait-material", label: "待物料", icon: <PackageSearch size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_WAIT_MATERIAL, visible: canWaitMaterialWorkOrder(user, row) },
    { key: "finish", label: "完成处理", icon: <Hammer size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_FINISH, visible: canFinishWorkOrder(user, row) },
    { key: "confirm", label: "确认完成", icon: <CheckCircle2 size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_CONFIRM, visible: canConfirmWorkOrder(user, row) },
    { key: "evaluate", label: "评价", icon: <Star size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_EVALUATE, visible: canEvaluateWorkOrder(user, row) },
    { key: "close", label: "关闭", icon: <Archive size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_CLOSE, visible: canCloseWorkOrder(user, row) },
    { key: "cancel", label: "取消", icon: <Ban size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_CANCEL, danger: true, visible: canCancelWorkOrder(row) },
    { key: "return", label: "退回", icon: <CornerDownLeft size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_RETURN, visible: canReturnWorkOrder(user, row) },
    { key: "reject", label: "驳回", icon: <ShieldAlert size={16} />, permission: SYSTEM_PERMISSIONS.WORKORDER_REJECT, danger: true, visible: canRejectWorkOrder(user, row) }
  ];
  const visibleActions = actions.filter((action) => action.visible && hasPermission(user, action.permission));
  if (visibleActions.length === 0) {
    return <p className="muted-text">当前状态暂无可执行操作。</p>;
  }
  return (
    <div className="workorder-action-panel">
      {visibleActions.map((action) => (
        <button className={action.danger ? "drawer-action-button danger-button" : "drawer-action-button"} key={action.key} type="button" onClick={() => onAction(action.key)}>
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="skeleton-stack">
      <span className="skeleton-line skeleton-line-lg" />
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-line-sm" />
    </div>
  );
}

function hasPermission(user: UserContext | null, permission: string): boolean {
  if (!user) return false;
  return user.is_super === true || user.permissions.includes("*") || user.permissions.includes(permission);
}

function canAssignWorkOrder(row: WorkOrderRow): boolean {
  return isDispatchableStatus(row.status) && !row.assigneeId;
}

function canReassignWorkOrder(row: WorkOrderRow): boolean {
  return isDispatchableStatus(row.status) && Boolean(row.assigneeId);
}

function isDispatchableStatus(status: string): boolean {
  return status === "10" || status === "20" || status === "91";
}

function canHandleWorkOrder(user: UserContext | null, row: WorkOrderRow): boolean {
  if (!user) return false;
  if (hasPermission(user, SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)) return true;
  return Boolean(row.assigneeId && row.assigneeId === user.id);
}

function canConfirmActor(user: UserContext | null, row: WorkOrderRow): boolean {
  if (!user) return false;
  if (hasPermission(user, SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)) return true;
  return Boolean(row.reporterId && row.reporterId === user.id);
}

function canAcceptWorkOrder(user: UserContext | null, row: WorkOrderRow): boolean {
  return row.status === "20" && canHandleWorkOrder(user, row);
}

function canStartWorkOrder(user: UserContext | null, row: WorkOrderRow): boolean {
  return (row.status === "30" || row.status === "45") && canHandleWorkOrder(user, row);
}

function canWaitMaterialWorkOrder(user: UserContext | null, row: WorkOrderRow): boolean {
  return row.status === "40" && canHandleWorkOrder(user, row);
}

function canFinishWorkOrder(user: UserContext | null, row: WorkOrderRow): boolean {
  return (row.status === "40" || row.status === "45") && canHandleWorkOrder(user, row);
}

function canConfirmWorkOrder(user: UserContext | null, row: WorkOrderRow): boolean {
  return row.status === "50" && canConfirmActor(user, row);
}

function canEvaluateWorkOrder(user: UserContext | null, row: WorkOrderRow): boolean {
  return row.status === "60" && canConfirmActor(user, row);
}

function canCloseWorkOrder(user: UserContext | null, row: WorkOrderRow): boolean {
  return (row.status === "60" || row.status === "70") && hasPermission(user, SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL);
}

function canCancelWorkOrder(row: WorkOrderRow): boolean {
  return row.status === "10" || row.status === "20";
}

function canReturnWorkOrder(user: UserContext | null, row: WorkOrderRow): boolean {
  return (row.status === "30" || row.status === "40" || row.status === "45") && canHandleWorkOrder(user, row);
}

function canRejectWorkOrder(user: UserContext | null, row: WorkOrderRow): boolean {
  return (row.status === "10" || row.status === "20" || row.status === "30" || row.status === "40" || row.status === "45")
    && hasPermission(user, SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function fieldText(user: UserContext | null, canView: boolean, fieldKey: string, value: unknown): string {
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
        <p>当前账号没有工单详情访问权限，或当前租户未启用 workorder 模块。</p>
      </Card>
    </main>
  );
}
