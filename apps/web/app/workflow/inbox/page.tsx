"use client";

import { ContentCard, EmptyState, FeedbackNotice, LoadingState, PageHeader, PageShell, StatusPill } from "@jinhu/ui";
import { Bell, CheckCircle2, Clock3, ListChecks, RefreshCw, Route, ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { Route as NextRoute } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import styles from "./workflow-inbox.module.css";

const WORKORDER_MODULE = "workorder";

type WorkflowSourceType = "work_order" | "inspection_task";
type WorkflowTodoKind =
  | "work_order_triage"
  | "work_order_assigned"
  | "work_order_customer_confirm"
  | "work_order_overdue"
  | "inspection_task";

interface WorkflowTodo {
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

interface WorkflowMessage {
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

interface WorkflowInboxResponse {
  generatedAt: string;
  summary: {
    triageCount: number;
    assignedCount: number;
    customerConfirmCount: number;
    inspectionCount: number;
    overdueCount: number;
    messageCount: number;
    unreadMessageCount: number;
  };
  todos: WorkflowTodo[];
  messages: WorkflowMessage[];
  runtime: {
    mode: "read_model";
    writeModel: string;
    informationFlow: string[];
  };
}

export default function WorkflowInboxPage() {
  const [data, setData] = useState<WorkflowInboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await apiRequest<WorkflowInboxResponse>("/workflow/inbox", {
        token: getAccessToken()
      });
      setData(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "流程收件箱加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (messageId: string) => {
    await apiRequest(`/workflow/messages/${messageId}/read`, {
      method: "POST",
      token: getAccessToken()
    });
    await load();
  }, [load]);

  const markAllRead = useCallback(async () => {
    await apiRequest("/workflow/messages/read-all", {
      method: "POST",
      token: getAccessToken()
    });
    await load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryCards = useMemo(() => {
    const summary = data?.summary;
    return [
      { label: "待派单", value: summary?.triageCount ?? 0, tone: "warning" },
      { label: "我的处理", value: summary?.assignedCount ?? 0, tone: "primary" },
      { label: "待客户确认", value: summary?.customerConfirmCount ?? 0, tone: "success" },
      { label: "巡检待办", value: summary?.inspectionCount ?? 0, tone: "info" },
      { label: "超时提醒", value: summary?.overdueCount ?? 0, tone: "danger" },
      { label: "未读消息", value: summary?.unreadMessageCount ?? 0, tone: "primary" }
    ] as const;
  }, [data]);

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_READ} module={WORKORDER_MODULE} fallback={<ForbiddenInline />}>
      <PageShell className={styles.page}>
        <PageHeader
          eyebrow="Workflow Inbox"
          title="流程收件箱"
          description="把客户服务请求、内部处理、巡检任务和工单日志聚合成角色待办与信息流。"
          actions={(
            <button className="primary-button secondary-button" type="button" disabled={loading} onClick={() => void load()}>
              <RefreshCw size={16} />
              刷新
            </button>
          )}
        />

        {message ? <FeedbackNotice variant="danger">{message}</FeedbackNotice> : null}

        <section className={styles.summaryGrid} aria-label="流程收件箱统计">
          {summaryCards.map((card) => (
            <div className={styles.summaryCard} data-tone={card.tone} key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </section>

        {loading ? (
          <ContentCard>
            <LoadingState title="正在加载流程收件箱" />
          </ContentCard>
        ) : (
          <div className={styles.layout}>
            <ContentCard
              title="我的待办"
              description="按角色自动聚合下一步动作，处理仍进入原业务详情页。"
              actions={<StatusPill value={`${data?.todos.length ?? 0} 项`} />}
            >
              <div className={styles.todoList}>
                {data?.todos.map((todo) => (
                  <Link className={styles.todoItem} data-priority={todo.priority} href={todo.href as NextRoute} key={todo.id}>
                    <span className={styles.todoIcon}>{iconForTodo(todo.kind)}</span>
                    <span className={styles.todoMain}>
                      <strong>{todo.title}</strong>
                      <small>{todo.subtitle}</small>
                    </span>
                    <span className={styles.todoMeta}>
                      <em>{todo.ownerRole}</em>
                      <b>{todo.actionLabel}</b>
                    </span>
                  </Link>
                ))}
                {data?.todos.length === 0 ? <EmptyState compact title="暂无待办" description="当前没有需要你处理或确认的事项。" /> : null}
              </div>
            </ContentCard>

            <ContentCard
              title="最近信息流"
              description="展示与当前可见待办相关的工单处理记录。"
              actions={(
                <button className="secondary-button" type="button" disabled={(data?.summary.unreadMessageCount ?? 0) === 0} onClick={() => void markAllRead().catch((error: Error) => setMessage(error.message))}>
                  全部已读
                </button>
              )}
            >
              <div className={styles.messageList}>
                {data?.messages.map((item) => (
                  <div className={styles.messageItem} data-unread={item.messageId && !item.readAt ? "true" : "false"} key={item.id}>
                    <span className={styles.messageDot} />
                    <span>
                      <Link href={item.href as NextRoute}>
                        <strong>{item.title}</strong>
                      </Link>
                      <small>{item.actorName} · {item.action} · {formatDateTime(item.occurredAt)}</small>
                      <p>{item.content}</p>
                    </span>
                    <span className={styles.messageActions}>
                      {item.messageId && !item.readAt ? (
                        <button className="secondary-button" type="button" onClick={() => void markRead(item.messageId!).catch((error: Error) => setMessage(error.message))}>
                          标记已读
                        </button>
                      ) : null}
                    </span>
                  </div>
                ))}
                {data?.messages.length === 0 ? <EmptyState compact title="暂无信息流" description="待办产生状态动作后，这里会显示最新处理记录。" /> : null}
              </div>
            </ContentCard>

            <ContentCard title="业务闭环" description={data?.runtime.writeModel}>
              <ol className={styles.flowList}>
                {data?.runtime.informationFlow.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </ContentCard>
          </div>
        )}
      </PageShell>
    </PermissionGuard>
  );
}

function iconForTodo(kind: WorkflowTodoKind) {
  switch (kind) {
    case "work_order_triage":
      return <Bell size={18} />;
    case "work_order_assigned":
      return <ListChecks size={18} />;
    case "work_order_customer_confirm":
      return <CheckCircle2 size={18} />;
    case "work_order_overdue":
      return <ShieldAlert size={18} />;
    case "inspection_task":
      return <Route size={18} />;
    default:
      return <Clock3 size={18} />;
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function ForbiddenInline() {
  return (
    <PageShell>
      <ContentCard>
        <EmptyState title="无权访问流程收件箱" description="需要工单读取权限和工单模块访问权限。" />
      </ContentCard>
    </PageShell>
  );
}
