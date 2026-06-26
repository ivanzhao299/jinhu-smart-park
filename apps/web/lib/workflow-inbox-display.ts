import type { WorkflowInboxAudience, WorkflowInboxSummary, WorkflowTodo, WorkflowTodoKind } from "./workflow-inbox-types";

export const workflowTodoKindLabels: Record<WorkflowTodoKind, string> = {
  work_order_triage: "待派单",
  work_order_assigned: "处理中",
  work_order_customer_confirm: "待确认",
  work_order_overdue: "超时提醒",
  inspection_task: "巡检待办"
};

export const workflowPriorityLabels = {
  normal: "普通",
  important: "重要",
  urgent: "紧急"
} as const;

export function workflowAudienceCopy(audience: WorkflowInboxAudience): { title: string; description: string; emptyTitle: string; emptyDescription: string } {
  if (audience === "tenant") {
    return {
      title: "服务收件箱",
      description: "把待确认事项、最近消息和服务处理进度压缩到一个入口里。",
      emptyTitle: "暂时没有待确认事项",
      emptyDescription: "新的服务进度、处理反馈和确认动作会在这里聚合。"
    };
  }
  return {
    title: "统一收件箱",
    description: "把派单、巡检、超时提醒和最近消息收成一个作业入口。",
    emptyTitle: "当前没有待处理事项",
    emptyDescription: "派单、整改、巡检或确认动作到来后，会优先出现在这里。"
  };
}

export function workflowSummaryItems(summary: WorkflowInboxSummary) {
  return [
    { key: "triage", label: "待派单", value: summary.triageCount, tone: "warning" },
    { key: "assigned", label: "我的处理", value: summary.assignedCount, tone: "primary" },
    { key: "confirm", label: "待确认", value: summary.customerConfirmCount, tone: "success" },
    { key: "inspection", label: "巡检", value: summary.inspectionCount, tone: "info" },
    { key: "overdue", label: "超时", value: summary.overdueCount, tone: "danger" },
    { key: "unread", label: "未读", value: summary.unreadMessageCount, tone: "primary" }
  ] as const;
}

export function workflowNextTodo(todos: WorkflowTodo[]): WorkflowTodo | null {
  if (todos.length === 0) {
    return null;
  }

  const priorityScore = { urgent: 3, important: 2, normal: 1 } as const;
  return [...todos].sort((left, right) => {
    const priorityDelta = priorityScore[right.priority] - priorityScore[left.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  })[0] ?? null;
}
