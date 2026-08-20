"use client";

import {
  SYSTEM_PERMISSIONS,
  type ApprovalSummary,
  type ApprovalDecisionCommand,
  type PropertyPaginatedResult,
  type PropertyTaskAction,
  type PropertyTaskDetailResponse,
  type PropertyTaskListItem,
  type PropertyTaskListResponse
} from "@jinhu/shared";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { useAuthUser } from "../../lib/auth-context";
import { getAccessToken } from "../../lib/authz";
import { hasAccess } from "../../lib/permissions";
import styles from "./PropertyRuntimeSlots.module.css";
import {
  buildPropertyTaskMutationRequest,
  parsePropertyRuntimeTarget,
  prependUniquePropertyRuntimeItem,
  propertyApprovalTargetAllowed,
  propertyRuntimeDetailHref,
  propertyTaskTargetAllowed
} from "./property-runtime-slots.logic";
import { safePropertyDeepLink } from "./property-control-plane.logic";

export function PropertyRuntimeSlots({ approvalSourceTypes, module, taskSourceTypes }: {
  approvalSourceTypes: readonly string[];
  module: "homestay" | "housing_rental";
  taskSourceTypes: readonly string[];
}) {
  const user = useAuthUser();
  const searchParams = useSearchParams();
  const target = parsePropertyRuntimeTarget({
    taskId: searchParams.get("taskId"),
    requestId: searchParams.get("requestId")
  });
  const canReadTasks = hasAccess(user, SYSTEM_PERMISSIONS.PROPERTY_TASK_READ, "asset")
    && hasAccess(user, undefined, module);
  const canReadApprovals = hasAccess(user, SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ, "asset")
    && hasAccess(user, undefined, module);
  const [tasks, setTasks] = useState<PropertyTaskListItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalSummary[]>([]);
  const [taskError, setTaskError] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [focusedTaskDeepLink, setFocusedTaskDeepLink] = useState<Route | null>(null);
  const [approvalReasons, setApprovalReasons] = useState<Record<string, string>>({});
  const [mutatingApprovalIds, setMutatingApprovalIds] = useState<ReadonlySet<string>>(new Set());
  const [feedback, setFeedback] = useState("");
  const [taskReasons, setTaskReasons] = useState<Record<string, string>>({});
  const [mutatingTaskIds, setMutatingTaskIds] = useState<ReadonlySet<string>>(new Set());
  const mutationKeys = useRef(new Map<string, string>());
  const mutationLocks = useRef(new Set<string>());
  const requestSequence = useRef(0);
  const focusedTarget = useRef<HTMLDivElement | null>(null);
  const approvalSourceKey = approvalSourceTypes.join("\u0000");
  const taskSourceKey = taskSourceTypes.join("\u0000");
  const runtimeSearch = searchParams.toString();

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const isCurrent = () => sequence === requestSequence.current;
    if (canReadTasks) {
      try {
        const sourceTypes = taskSourceKey.split("\u0000").filter(Boolean);
        const pages = await Promise.all(sourceTypes
          .map((sourceType) => apiRequest<PropertyTaskListResponse>(
          `/property/tasks?page=1&pageSize=20&sourceType=${encodeURIComponent(sourceType)}`,
          { token: getAccessToken() ?? undefined }
          )));
        if (!isCurrent()) return;
        const listed = pages.flatMap((page) => [...page.data.items])
          .sort((left, right) => right.priority - left.priority || left.taskId.localeCompare(right.taskId));
        if (!target.taskId) {
          setTasks(listed);
          setFocusedTaskDeepLink(null);
          setTaskError("");
        } else {
          try {
            const targetResponse = await apiRequest<PropertyTaskDetailResponse>(
              `/property/tasks/${encodeURIComponent(target.taskId)}`,
              { token: getAccessToken() ?? undefined }
            );
            if (!isCurrent()) return;
            if (!propertyTaskTargetAllowed(targetResponse.data, sourceTypes)) {
              throw new Error("runtime-target-outside-surface");
            }
            setTasks(prependUniquePropertyRuntimeItem(
              targetResponse.data,
              listed,
              (item) => item.taskId
            ));
            const safeDeepLink = targetResponse.data.sourceDeepLink
              ? safePropertyDeepLink(targetResponse.data.sourceDeepLink)
              : null;
            setFocusedTaskDeepLink(safeDeepLink
              ? propertyRuntimeDetailHref(safeDeepLink, module, runtimeSearch) as Route
              : null);
            setTaskError("");
          } catch {
            if (!isCurrent()) return;
            setTasks(listed);
            setFocusedTaskDeepLink(null);
            setTaskError("目标任务不可用或无权访问。");
          }
        }
      } catch (cause) {
        if (!isCurrent()) return;
        setTaskError(cause instanceof Error ? cause.message : "共享任务加载失败");
      }
    }
    if (!isCurrent()) return;
    if (canReadApprovals) {
      try {
        const sourceTypes = approvalSourceKey.split("\u0000").filter(Boolean);
        const pages = await Promise.all(sourceTypes.map((sourceType) =>
            apiRequest<PropertyPaginatedResult<ApprovalSummary>>(
              `/property/approvals?page=1&pageSize=20&sourceType=${encodeURIComponent(sourceType)}`,
              { token: getAccessToken() ?? undefined }
            )));
        if (!isCurrent()) return;
        const listed = pages.flatMap((page) => page.data.items)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        if (!target.requestId) {
          setApprovals(listed);
          setApprovalError("");
        } else {
          try {
            const targetResponse = await apiRequest<ApprovalDetail>(
              `/property/approvals/${encodeURIComponent(target.requestId)}`,
              { token: getAccessToken() ?? undefined }
            );
            if (!isCurrent()) return;
            if (!propertyApprovalTargetAllowed(targetResponse.data.request, sourceTypes)) {
              throw new Error("runtime-target-outside-surface");
            }
            setApprovals(prependUniquePropertyRuntimeItem(
              targetResponse.data.request,
              listed,
              (item) => item.requestId
            ));
            setApprovalError("");
          } catch {
            if (!isCurrent()) return;
            setApprovals(listed);
            setApprovalError("目标审批不可用或无权访问。");
          }
        }
      } catch (cause) {
        if (!isCurrent()) return;
        setApprovalError(cause instanceof Error ? cause.message : "共享审批加载失败");
      }
    }
  }, [approvalSourceKey, canReadApprovals, canReadTasks, target.requestId,
    target.taskId, taskSourceKey, module, runtimeSearch]);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);
  useEffect(() => {
    if (!focusedTarget.current) return;
    focusedTarget.current.focus({ preventScroll: true });
    focusedTarget.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [approvals, tasks, target.requestId, target.taskId]);

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

  async function runApprovalAction(
    item: ApprovalSummary,
    action: "approve" | "reject" | "withdraw"
  ) {
    if (mutationLocks.current.has(item.requestId)) return;
    const reason = approvalReasons[item.requestId]?.trim() ?? "";
    if ((action === "reject" || action === "withdraw") && !reason) {
      setFeedback("驳回或撤回审批前必须填写原因。");
      return;
    }
    mutationLocks.current.add(item.requestId);
    setMutatingApprovalIds((current) => new Set(current).add(item.requestId));
    try {
      const detail = await apiRequest<ApprovalDetail>(
        `/property/approvals/${item.requestId}`,
        { token: getAccessToken() ?? undefined }
      );
      const clientKey = createIdempotencyKey(`property.approval.${action}`);
      if (action === "withdraw") {
        await apiRequest(`/property/approvals/${item.requestId}/withdraw`, {
          method: "POST", token: getAccessToken() ?? undefined, idempotencyKey: clientKey,
          body: { clientKey, reason, expectedDecisionVersion: detail.data.request.decisionVersion }
        });
      } else {
        const stage = detail.data.stages.find((candidate) => candidate.stageStatus === "pending");
        if (!stage) throw new Error("审批当前阶段已变化，请刷新后重试");
        const body: ApprovalDecisionCommand = {
          clientKey,
          decision: action,
          reason: reason || undefined,
          stageId: stage.stageId,
          expectedStageVersion: stage.version,
          expectedRequestVersion: detail.data.request.decisionVersion
        };
        await apiRequest(`/property/approvals/${item.requestId}/decisions`, {
          method: "POST", token: getAccessToken() ?? undefined, idempotencyKey: clientKey, body
        });
      }
      setApprovalReasons((current) => ({ ...current, [item.requestId]: "" }));
      setFeedback("审批操作已提交。");
      await load();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "审批操作失败");
    } finally {
      mutationLocks.current.delete(item.requestId);
      setMutatingApprovalIds((current) => {
        const next = new Set(current); next.delete(item.requestId); return next;
      });
    }
  }

  if (!canReadTasks && !canReadApprovals) return null;
  return <section className={styles.runtimeSection} aria-labelledby={`${module}-runtime-title`}>
    <div className={styles.sectionHeading}>
      <p className="ds-kicker">共享房产运行时</p>
      <h2 id={`${module}-runtime-title`}>任务与审批</h2>
      <p>领域工作台中的分派、审批决策和效果执行状态。</p>
      {target.invalid ? <p aria-live="polite">目标链接无效或已失效。</p> : null}
    </div>
    <div className="ds-command-grid">
    {canReadTasks ? <article className={`ds-command-card ${styles.card}`}><div className={styles.cardContent}>
      <h2>共享任务状态</h2>
      <p>任务分派由共享运行时管理，完成仍回到领域权威详情。</p>
      {taskError ? <p aria-live="polite">{taskError}</p> : null}
      {!taskError && !tasks.length ? <p>暂无已投影任务。</p> : null}
      {tasks.slice(0, 20).map((item) => <div aria-current={item.taskId === target.taskId ? "true" : undefined}
        className={`${styles.taskRecord} ${item.taskId === target.taskId ? styles.focusedRecord : ""}`}
        key={item.taskId} ref={item.taskId === target.taskId ? focusedTarget : undefined}
        tabIndex={item.taskId === target.taskId ? -1 : undefined}>
        <p><strong>{item.title}</strong> · {item.assignmentStatus} · v{item.assignmentVersion}</p>
        <p>{item.assigneeDisplay ?? "未分派"} · 优先级 {item.priority}</p>
        {item.taskId === target.taskId && focusedTaskDeepLink
          ? <Link href={focusedTaskDeepLink}>查看领域详情</Link>
          : null}
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
      {approvals.slice(0, 20).map((item) => <div aria-current={item.requestId === target.requestId ? "true" : undefined}
        className={`${styles.taskRecord} ${item.requestId === target.requestId ? styles.focusedRecord : ""}`}
        key={item.requestId} ref={item.requestId === target.requestId ? focusedTarget : undefined}
        tabIndex={item.requestId === target.requestId ? -1 : undefined}>
        <p><strong>{item.actionId}</strong> · {item.decisionStatus} / {item.executionStatus}</p>
        {item.requestId === target.requestId
          ? <Link href={propertyRuntimeDetailHref(
              `/property/approvals/${encodeURIComponent(item.requestId)}`,
              module,
              runtimeSearch
            ) as Route}>查看审批详情</Link>
          : null}
        {item.allowedActions.length ? <label>审批原因
          <input aria-label={`${item.actionId}审批原因`} maxLength={1000}
            onChange={(event) => setApprovalReasons((current) => ({
              ...current, [item.requestId]: event.target.value
            }))} value={approvalReasons[item.requestId] ?? ""} />
        </label> : null}
        <div className={styles.actions}>
          {item.allowedActions.includes("property.approval.decide") ? <>
            <button className="ds-button ds-button-primary" disabled={mutatingApprovalIds.has(item.requestId)}
              onClick={() => void runApprovalAction(item, "approve")} type="button">批准</button>
            <button className="ds-button" disabled={mutatingApprovalIds.has(item.requestId)}
              onClick={() => void runApprovalAction(item, "reject")} type="button">驳回</button>
          </> : null}
          {item.allowedActions.includes("property.approval.withdraw") ? <button className="ds-button"
            disabled={mutatingApprovalIds.has(item.requestId)}
            onClick={() => void runApprovalAction(item, "withdraw")} type="button">撤回</button> : null}
        </div>
      </div>)}
    </div></article> : null}
    </div>
  </section>;
}

interface ApprovalDetail {
  request: ApprovalSummary & { decisionVersion: number; sourceType: string };
  stages: Array<{ stageId: string; stageStatus: string; version: number }>;
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
