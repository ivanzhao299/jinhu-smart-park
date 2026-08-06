"use client";

import {
  SYSTEM_PERMISSIONS,
  type ApprovalSummary,
  type PropertyPaginatedResult,
  type PropertyTaskAction,
  type PropertyTaskDetailResponse,
  type PropertyTaskListItem,
  type PropertyTaskListResponse
} from "@jinhu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { useAuthUser } from "../../lib/auth-context";
import { getAccessToken } from "../../lib/authz";
import { hasAccess } from "../../lib/permissions";
import styles from "./PropertyRuntimeSlots.module.css";
import { buildPropertyTaskMutationRequest } from "./property-runtime-slots.logic";

export function PropertyRuntimeSlots({ approvalSourceTypes, module, taskSourceTypes }: {
  approvalSourceTypes: readonly string[];
  module: "homestay" | "housing_rental";
  taskSourceTypes: readonly string[];
}) {
  const user = useAuthUser();
  const canReadTasks = hasAccess(user, SYSTEM_PERMISSIONS.PROPERTY_TASK_READ, "asset")
    && hasAccess(user, undefined, module);
  const canReadApprovals = hasAccess(user, SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ, "asset")
    && hasAccess(user, undefined, module);
  const [tasks, setTasks] = useState<PropertyTaskListItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalSummary[]>([]);
  const [taskError, setTaskError] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [taskReasons, setTaskReasons] = useState<Record<string, string>>({});
  const [mutatingTaskIds, setMutatingTaskIds] = useState<ReadonlySet<string>>(new Set());
  const mutationKeys = useRef(new Map<string, string>());
  const mutationLocks = useRef(new Set<string>());
  const approvalSourceKey = approvalSourceTypes.join("\u0000");
  const taskSourceKey = taskSourceTypes.join("\u0000");

  const load = useCallback(async () => {
    if (canReadTasks) {
      try {
        const pages = await Promise.all(taskSourceKey.split("\u0000").filter(Boolean)
          .map((sourceType) => apiRequest<PropertyTaskListResponse>(
          `/property/tasks?page=1&pageSize=20&sourceType=${encodeURIComponent(sourceType)}`,
          { token: getAccessToken() ?? undefined }
        )));
        setTasks(pages.flatMap((page) => [...page.data.items])
          .sort((left, right) => right.priority - left.priority || left.taskId.localeCompare(right.taskId)));
        setTaskError("");
      } catch (cause) {
        setTaskError(cause instanceof Error ? cause.message : "共享任务加载失败");
      }
    }
    if (canReadApprovals) {
      try {
        const pages = await Promise.all(approvalSourceKey.split("\u0000").filter(Boolean).map((sourceType) =>
          apiRequest<PropertyPaginatedResult<ApprovalSummary>>(
            `/property/approvals?page=1&pageSize=20&sourceType=${encodeURIComponent(sourceType)}`,
            { token: getAccessToken() ?? undefined }
          )));
        setApprovals(pages.flatMap((page) => page.data.items)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
        setApprovalError("");
      } catch (cause) {
        setApprovalError(cause instanceof Error ? cause.message : "共享审批加载失败");
      }
    }
  }, [approvalSourceKey, canReadApprovals, canReadTasks, taskSourceKey]);

  useEffect(() => void load(), [load]);

  async function runTaskAction(item: PropertyTaskListItem, action: PropertyTaskAction) {
    if (mutationLocks.current.has(item.taskId)) return;
    const reason = action === "property.task.block" || action === "property.task.release"
      ? taskReasons[item.taskId]?.trim() ?? ""
      : "";
    if ((action === "property.task.block" || action === "property.task.release") && !reason) {
      setFeedback("阻塞或释放任务前必须填写原因。");
      return;
    }
    const mutationId = `${item.taskId}:${action}`;
    const clientKey = mutationKeys.current.get(mutationId) ?? createIdempotencyKey(action);
    mutationKeys.current.set(mutationId, clientKey);
    mutationLocks.current.add(item.taskId);
    setMutatingTaskIds((current) => new Set(current).add(item.taskId));
    setFeedback("");
    try {
      const detail = await apiRequest<PropertyTaskDetailResponse>(
        `/property/tasks/${item.taskId}`,
        { token: getAccessToken() ?? undefined }
      );
      const mutation = buildPropertyTaskMutationRequest({
        taskId: item.taskId,
        action,
        detail: detail.data,
        reason,
        clientKey
      });
      await apiRequest(mutation.path, {
        ...mutation.options,
        token: getAccessToken() ?? undefined
      });
      mutationKeys.current.delete(mutationId);
      setTaskReasons((current) => ({ ...current, [item.taskId]: "" }));
      setFeedback("任务状态已更新。");
      await load();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "任务操作失败");
    } finally {
      mutationLocks.current.delete(item.taskId);
      setMutatingTaskIds((current) => {
        const next = new Set(current);
        next.delete(item.taskId);
        return next;
      });
    }
  }

  if (!canReadTasks && !canReadApprovals) return null;
  return <section className={styles.runtimeSection} aria-labelledby={`${module}-runtime-title`}>
    <div className={styles.sectionHeading}>
      <p className="ds-kicker">共享房产运行时</p>
      <h2 id={`${module}-runtime-title`}>任务与审批</h2>
      <p>领域工作台中的分派、审批决策和效果执行状态。</p>
    </div>
    <div className="ds-command-grid">
    {canReadTasks ? <article className={`ds-command-card ${styles.card}`}><div className={styles.cardContent}>
      <h2>共享任务状态</h2>
      <p>任务分派由共享运行时管理，完成仍回到领域权威详情。</p>
      {taskError ? <p aria-live="polite">{taskError}</p> : null}
      {!taskError && !tasks.length ? <p>暂无已投影任务。</p> : null}
      {tasks.slice(0, 20).map((item) => <div className={styles.taskRecord} key={item.taskId}>
        <p><strong>{item.title}</strong> · {item.assignmentStatus} · v{item.assignmentVersion}</p>
        <p>{item.assigneeDisplay ?? "未分派"} · 优先级 {item.priority}</p>
        {item.allowedActions.some((action) => action === "property.task.block" || action === "property.task.release")
          ? <label>操作原因
            <input aria-label={`${item.title}操作原因`} maxLength={500}
              onChange={(event) => setTaskReasons((current) => ({
                ...current, [item.taskId]: event.target.value
              }))} value={taskReasons[item.taskId] ?? ""} />
          </label>
          : null}
        <div className={styles.actions}>{item.allowedActions.map((action) => <button aria-busy={mutatingTaskIds.has(item.taskId)}
          className="ds-button" disabled={mutatingTaskIds.has(item.taskId)} key={action}
          onClick={() => void runTaskAction(item, action)} type="button">
          {mutatingTaskIds.has(item.taskId) ? "处理中…" : taskActionLabel(action)}</button>)}</div>
      </div>)}
      {feedback ? <p aria-live="polite">{feedback}</p> : null}
    </div></article> : null}
    {canReadApprovals ? <article className={`ds-command-card ${styles.card}`}><div className={styles.cardContent}>
      <h2>共享审批状态</h2>
      <p>审批通过与领域效果执行分别展示，避免把“已决策”误认为“已完成”。</p>
      {approvalError ? <p aria-live="polite">{approvalError}</p> : null}
      {!approvalError && !approvals.length ? <p>暂无可见审批。</p> : null}
      {approvals.slice(0, 20).map((item) => <p key={item.requestId}>
        {item.actionId} · {item.decisionStatus} / {item.executionStatus}
      </p>)}
    </div></article> : null}
    </div>
  </section>;
}

function taskActionLabel(action: PropertyTaskAction): string {
  return ({
    "property.task.claim": "领取",
    "property.task.start": "开始",
    "property.task.block": "阻塞",
    "property.task.unblock": "解除阻塞",
    "property.task.release": "释放"
  } as const)[action];
}
