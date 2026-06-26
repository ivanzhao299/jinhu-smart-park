export type WorkflowSourceType = "work_order" | "inspection_task";

export type WorkflowTodoKind =
  | "work_order_triage"
  | "work_order_assigned"
  | "work_order_customer_confirm"
  | "work_order_overdue"
  | "inspection_task";

export interface WorkflowTodo {
  id: string;
  kind: WorkflowTodoKind;
  sourceType: WorkflowSourceType;
  sourceId: string;
  title: string;
  subtitle: string;
  status: string;
  priority: "normal" | "important" | "urgent";
  ownerRole: string;
  actionLabel: string;
  href: string;
  createdAt: string;
  dueAt?: string | null;
}

export interface WorkflowMessage {
  id: string;
  messageId?: string;
  sourceType: WorkflowSourceType;
  sourceId: string;
  title: string;
  content: string;
  actorName: string;
  action: string;
  category?: string;
  priority?: string;
  readAt?: string | null;
  href: string;
  occurredAt: string;
}

export interface WorkflowInboxSummary {
  triageCount: number;
  assignedCount: number;
  customerConfirmCount: number;
  inspectionCount: number;
  overdueCount: number;
  messageCount: number;
  unreadMessageCount: number;
}

export interface WorkflowInboxResponse {
  generatedAt: string;
  summary: WorkflowInboxSummary;
  todos: WorkflowTodo[];
  messages: WorkflowMessage[];
  runtime: {
    mode: "read_model";
    writeModel: string;
    informationFlow: string[];
  };
}

export type WorkflowInboxAudience = "operations" | "tenant";
