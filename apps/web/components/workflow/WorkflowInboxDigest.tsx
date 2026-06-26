"use client";

import { ContentCard, EmptyState } from "@jinhu/ui";
import Link from "next/link";
import type { Route as NextRoute } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAccessToken } from "../../lib/authz";
import { workflowInboxApi } from "../../lib/workflow-inbox-api";
import { workflowAudienceCopy, workflowNextTodo, workflowPriorityLabels, workflowSummaryItems, workflowTodoKindLabels } from "../../lib/workflow-inbox-display";
import type { WorkflowInboxAudience, WorkflowInboxResponse } from "../../lib/workflow-inbox-types";
import styles from "./WorkflowInboxDigest.module.css";

interface WorkflowInboxDigestProps {
  audience: WorkflowInboxAudience;
  previewMode?: boolean;
  previewData?: WorkflowInboxResponse;
  className?: string;
}

export function WorkflowInboxDigest({ audience, previewMode = false, previewData, className }: WorkflowInboxDigestProps) {
  const [data, setData] = useState<WorkflowInboxResponse | null>(previewData ?? null);
  const [loading, setLoading] = useState(!previewMode && !previewData);
  const [error, setError] = useState("");
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const copy = workflowAudienceCopy(audience);

  const load = useCallback(async () => {
    if (previewMode) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const inbox = await workflowInboxApi.getInbox(getAccessToken());
      setData(inbox);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "流程收件箱加载失败");
    } finally {
      setLoading(false);
    }
  }, [previewMode]);

  useEffect(() => {
    if (previewMode) {
      setData(previewData ?? null);
      setLoading(false);
      return;
    }
    void load();
  }, [load, previewData, previewMode]);

  const summaryItems = useMemo(() => workflowSummaryItems(data?.summary ?? emptySummary), [data]);
  const nextTodo = useMemo(() => workflowNextTodo(data?.todos ?? []), [data]);
  const todos = (data?.todos ?? []).slice(0, 4);
  const messages = (data?.messages ?? []).slice(0, 4);

  async function handleMarkAllRead() {
    if (previewMode || !data || data.summary.unreadMessageCount === 0) {
      return;
    }

    setMarkingAllRead(true);
    try {
      await workflowInboxApi.markAllRead(getAccessToken());
      await load();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "消息已读处理失败");
    } finally {
      setMarkingAllRead(false);
    }
  }

  return (
    <ContentCard
      className={className}
      title={copy.title}
      description={error || copy.description}
      actions={(
        <Link className="secondary-button" href={"/workflow/inbox" as NextRoute}>
          全部查看
        </Link>
      )}
    >
      <div className={styles.panel}>
        <section className={styles.summaryGrid} aria-label="流程摘要">
          {summaryItems.map((item) => (
            <div className={styles.summaryCard} data-tone={item.tone} key={item.key}>
              <span>{item.label}</span>
              <strong>{loading ? "-" : item.value}</strong>
            </div>
          ))}
        </section>

        {nextTodo ? (
          <Link className={styles.nextCard} href={nextTodo.href as NextRoute}>
            <span className={styles.nextLabel}>下一步</span>
            <span className={styles.nextTitle}>{nextTodo.title}</span>
            <span className={styles.itemSubtitle}>{nextTodo.subtitle}</span>
            <span className={styles.nextMeta}>
              <span>{nextTodo.ownerRole}</span>
              <span>{nextTodo.actionLabel}</span>
              <span>{workflowTodoKindLabels[nextTodo.kind]}</span>
            </span>
          </Link>
        ) : (
          <EmptyState compact title={copy.emptyTitle} description={copy.emptyDescription} />
        )}

        <section className={styles.layout} aria-label="流程收件箱列表">
          <div className={styles.block}>
            <div className={styles.blockHeader}>
              <span>待处理</span>
            </div>
            <div className={styles.list}>
              {todos.length === 0 ? (
                <EmptyState compact title="暂无待办" description="新的派单、巡检和确认动作会出现在这里。" />
              ) : (
                todos.map((todo) => (
                  <Link className={styles.item} href={todo.href as NextRoute} key={todo.id}>
                    <div className={styles.itemHeader}>
                      <span className={styles.itemTitle}>{todo.title}</span>
                      <span className={styles.priority} data-priority={todo.priority}>
                        {workflowPriorityLabels[todo.priority]}
                      </span>
                    </div>
                    <span className={styles.itemSubtitle}>{todo.subtitle}</span>
                    <span className={styles.itemMeta}>
                      <span>{todo.ownerRole}</span>
                      <span>{todo.actionLabel}</span>
                      <span>{workflowTodoKindLabels[todo.kind]}</span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.blockHeader}>
              <span>最近消息</span>
              <button
                className="secondary-button"
                disabled={previewMode || markingAllRead || (data?.summary.unreadMessageCount ?? 0) === 0}
                type="button"
                onClick={() => void handleMarkAllRead()}
              >
                全部已读
              </button>
            </div>
            <div className={styles.list}>
              {messages.length === 0 ? (
                <EmptyState compact title="暂无消息" description="处理记录和反馈会在这里汇总。" />
              ) : (
                messages.map((item) => (
                  <Link className={styles.messageItem} href={item.href as NextRoute} key={item.id}>
                    <div className={styles.messageHeader}>
                      <span className={styles.messageTitle}>{item.title}</span>
                      {item.messageId && !item.readAt ? <span className={styles.unread}>未读</span> : null}
                    </div>
                    <span className={styles.messageMeta}>{item.actorName} · {item.action} · {formatDateTime(item.occurredAt)}</span>
                    <span className={styles.messageContent}>{item.content}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        <div className={styles.footer}>
          <span>待确认、审批和处理动作仍会跳回原业务详情页继续闭环。</span>
          <Link className={styles.footerLink} href={"/workflow/inbox" as NextRoute}>
            进入完整流程收件箱
          </Link>
        </div>
      </div>
    </ContentCard>
  );
}

const emptySummary = {
  triageCount: 0,
  assignedCount: 0,
  customerConfirmCount: 0,
  inspectionCount: 0,
  overdueCount: 0,
  messageCount: 0,
  unreadMessageCount: 0
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
